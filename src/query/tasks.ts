/**
 * **Tasks as rows** — the second thing Bases structurally cannot do.
 *
 * Bases rows are always whole FILES. Dataview (and the Tasks plugin) treat the
 * individual `- [ ] …` checkbox line as the unit of work, with its own due
 * date, priority, assignee, and completion state. Most people who run their
 * life in Obsidian think in tasks, not in note-per-task.
 *
 * This module turns a note body into task rows and — critically — can write a
 * change BACK into the exact source line, so dragging a task card across a
 * kanban column or rescheduling it on the calendar edits the checkbox line
 * rather than the note's frontmatter.
 *
 * Pure: no Obsidian, no DOM. The caller supplies the note text.
 *
 * Metadata recognized on a task line:
 *   - inline fields, `[due:: 2026-01-01]` and `(due:: 2026-01-01)`
 *   - Tasks-plugin emoji shorthand (📅 due, 🛫 start, ⏳ scheduled, ✅ done, …)
 *   - `#tags`
 */

import {
	addLowercaseAliases,
	makeFenceScanner,
	parseLineFields,
	scanLineFieldSpans,
	stripBlockComment,
} from "./inlineFields";

export interface TaskItem {
	/** Stable row id — `<path>::L<line>::<hash>`; see {@link makeTaskId}. */
	id: string;
	path: string;
	/** Basename of the containing note. */
	note: string;
	/** 0-based line index within the file. */
	line: number;
	/** Nesting depth from indentation (0 = top level). */
	level: number;
	/** The raw checkbox character: `" "`, `"x"`, `"/"`, `"-"`, … */
	status: string;
	/** Any non-space status — "someone has touched this". */
	checked: boolean;
	/** Completed in the Dataview/Tasks sense (`x`). */
	done: boolean;
	/** Display text, with field + emoji metadata stripped. */
	text: string;
	/** The source line exactly as it appears in the file. */
	raw: string;
	/** Nearest markdown heading above the task, or `""`. */
	section: string;
	/** Line index of the enclosing parent task, or null at top level. */
	parent: number | null;
	tags: string[];
	/** Inline fields + emoji metadata parsed off this line. */
	fields: Record<string, unknown>;
}

/** `- [ ] text`, `* [x] text`, `1. [/] text` — indent, marker, status, text.
 * The space after `]` is required (or the line ends there), exactly as Obsidian
 * requires it: without that the markdown link `- [x](https://…)` would be read
 * as a completed task, and a drag would rewrite someone's link. */
const TASK_RE = /^([ \t]*)(?:[-*+]|\d+[.)])[ \t]+\[(.)\](?=[ \t]|$)[ \t]*(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const BLOCK_ID_RE = /\s\^[\w-]+\s*$/;

/**
 * Tasks-plugin emoji shorthand → property name. Writing one of these keys back
 * updates the emoji in place rather than appending a competing `[key:: …]`, so
 * a Tasks-plugin vault never ends up with two sources of truth for a date.
 *
 * `kind` is load-bearing, not decoration. An emoji is only metadata when it is
 * followed by a value of the RIGHT SHAPE: without that check,
 * `- [ ] Discuss 📅 design with Ana` would be read as `due = "design"`, and the
 * next reschedule would overwrite the word "design" — silently editing prose.
 * Recurrence (🔁) is deliberately absent: its value is free-form English
 * ("every other week"), so there is no safe span to claim.
 */
export const TASK_EMOJI: ReadonlyArray<{ emoji: string; key: string; kind: "date" | "token" }> = [
	{ emoji: "📅", key: "due", kind: "date" },
	{ emoji: "🛫", key: "start", kind: "date" },
	{ emoji: "⏳", key: "scheduled", kind: "date" },
	{ emoji: "⌛", key: "scheduled", kind: "date" },
	{ emoji: "✅", key: "completion", kind: "date" },
	{ emoji: "➕", key: "created", kind: "date" },
	{ emoji: "❌", key: "cancelled", kind: "date" },
	{ emoji: "🆔", key: "id", kind: "token" },
	{ emoji: "⛔", key: "blockedBy", kind: "token" },
];

/** What may FOLLOW the emoji in the source for it to count as metadata. The
 * trailing boundary is required: without it `📅 2026-10-20abc` would claim only
 * the date-shaped PREFIX, and a later write would replace that prefix and leave
 * `abc` stranded mid-line. */
const EMOJI_VALUE_RE: Record<"date" | "token", RegExp> = {
	date: /^[ \t]*(\d{4}-\d{2}-\d{2})(?=[ \t]|$)/,
	token: /^[ \t]*([A-Za-z0-9_,]{1,64})(?=[ \t]|$)/,
};

/** What a WRITTEN value must look like to be storable in the emoji slot. */
const EMOJI_VALUE_EXACT: Record<"date" | "token", RegExp> = {
	date: /^\d{4}-\d{2}-\d{2}$/,
	token: /^[A-Za-z0-9_,]{1,64}$/,
};

/** One validated emoji-metadata occurrence, with the exact source span it
 * owns. Writeback only ever edits a span produced here, so it can never eat
 * a neighbouring word. */
export interface EmojiSpan {
	key: string;
	value: string;
	/** Index of the emoji character in the source text. */
	start: number;
	/** Index just past the value. */
	end: number;
}

/**
 * Every validated emoji-metadata span in a task's text, in source order. An
 * emoji without a well-formed value is skipped entirely — it is prose.
 */
export function emojiSpans(text: string): EmojiSpan[] {
	const spans: EmojiSpan[] = [];
	for (const { emoji, key, kind } of TASK_EMOJI) {
		let from = 0;
		for (;;) {
			const idx = text.indexOf(emoji, from);
			if (idx < 0) break;
			from = idx + emoji.length;
			const m = EMOJI_VALUE_RE[kind].exec(text.slice(from));
			if (!m) continue;
			spans.push({ key, value: m[1], start: idx, end: from + m[0].length });
			break; // first valid occurrence of each emoji wins
		}
	}
	return spans.sort((a, b) => a.start - b.start);
}

/** Priority emoji → value. */
export const TASK_PRIORITY: ReadonlyArray<{ emoji: string; value: string }> = [
	{ emoji: "🔺", value: "highest" },
	{ emoji: "⏫", value: "high" },
	{ emoji: "🔼", value: "medium" },
	{ emoji: "🔽", value: "low" },
	{ emoji: "⏬", value: "lowest" },
];

/** The reserved `task.*` identifiers whose write edits the checkbox itself
 * rather than an inline field. */
export const TASK_STATUS_KEYS: ReadonlySet<string> = new Set(["task.status", "task.checked", "task.done"]);

/** FNV-1a over the task's normalized text — six base-36 chars, enough to
 * re-find a task whose line number shifted without carrying the whole text in
 * the row id. */
export function hashTaskText(text: string): string {
	const norm = text.trim().toLowerCase().replace(/\s+/g, " ");
	let h = 0x811c9dc5;
	for (let i = 0; i < norm.length; i++) {
		h ^= norm.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(36).padStart(6, "0").slice(-6);
}

/**
 * A task row id. `::` is the separator because Obsidian forbids `:` in vault
 * paths, so the note path is always recoverable unambiguously.
 */
export function makeTaskId(path: string, line: number, text: string): string {
	return `${path}::L${line}::${hashTaskText(text)}`;
}

export interface TaskRef {
	path: string;
	line: number;
	hash: string;
}

/** Decode a task row id, or null when `id` is an ordinary note path. */
export function parseTaskId(id: string): TaskRef | null {
	const m = /^(.*)::L(\d+)::([0-9a-z]{6})$/.exec(id);
	if (!m) return null;
	return { path: m[1], line: Number(m[2]), hash: m[3] };
}

/** True when this row id addresses a task line rather than a whole note. */
export function isTaskId(id: string): boolean {
	return parseTaskId(id) !== null;
}

/**
 * Find the task a ref points at in the CURRENT file lines. Prefers the recorded
 * line, then falls back to a hash scan, so an edit higher up the note can't make
 * a write land on the wrong task. Returns -1 when the task is gone — the caller
 * must then refuse the write rather than corrupt an unrelated line.
 */
export function relocateTask(lines: readonly string[], ref: TaskRef): number {
	const atLine = lines[ref.line];
	if (atLine !== undefined) {
		const m = TASK_RE.exec(atLine);
		if (m && hashTaskText(stripTaskMetadata(m[3])) === ref.hash) return ref.line;
	}
	// The task moved. Two tasks can carry identical text ("- [ ] Review"), so a
	// first-match — or even a nearest-match — scan can confidently edit the wrong
	// twin. Only act when the answer is UNAMBIGUOUS: exactly one candidate. A
	// refused write is a visible no-op; a wrong write silently corrupts a note.
	let found = -1;
	for (let i = 0; i < lines.length; i++) {
		const m = TASK_RE.exec(lines[i]);
		if (!m || hashTaskText(stripTaskMetadata(m[3])) !== ref.hash) continue;
		if (found >= 0) return -1; // ambiguous
		found = i;
	}
	return found;
}

/** Remove inline fields, emoji metadata, and a trailing block id from a task's
 * text, leaving the human-readable description. Tags are kept — they read as
 * part of the sentence. */
export function stripTaskMetadata(text: string): string {
	// Remove only spans the PARSERS actually recognised, back to front so the
	// indices stay good. Two earlier versions of this got it wrong in the same
	// way: a blanket "delete every emoji, every ISO date, every `x:: y` shape"
	// pass turns `Compare 2025-01-01 with 2026-01-01` into `Compare with` —
	// mangling the display text and, because the text is the row's identity,
	// collapsing two unrelated tasks onto one hash. Using the parsers' own spans
	// means the stripper can never remove something the reader didn't claim.
	// The whole-line form is excluded: on a task line it IS the task text.
	const spans = mergeSpans([
		...emojiSpans(text).map((s) => ({ start: s.start, end: s.end })),
		...scanLineFieldSpans(text)
			.filter((s) => s.wrapper !== "line")
			.map((s) => ({ start: s.start, end: s.end })),
	]);
	let out = text;
	for (let i = spans.length - 1; i >= 0; i--) {
		out = `${out.slice(0, spans[i].start)} ${out.slice(spans[i].end)}`;
	}
	// A priority emoji carries no value, so the symbol alone is the metadata.
	for (const { emoji } of TASK_PRIORITY) out = out.split(emoji).join(" ");
	out = out.replace(BLOCK_ID_RE, "");
	return out.replace(/\s+/g, " ").trim();
}

/** Sort and union overlapping ranges, so removing them back-to-front can't use
 * an index invalidated by an earlier removal. (An emoji date can legitimately
 * sit inside a bracketed field: `[note:: 📅 2026-01-01]`.) */
function mergeSpans(spans: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
	const sorted = [...spans].sort((a, b) => a.start - b.start);
	const out: Array<{ start: number; end: number }> = [];
	for (const span of sorted) {
		const last = out[out.length - 1];
		if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
		else out.push({ ...span });
	}
	return out;
}

/** Parse the metadata off one task's text: inline fields, emoji dates, priority. */
export function readTaskFields(text: string): Record<string, unknown> {
	const fields: Record<string, unknown> = {};
	// Inline fields first — an explicit `[due:: …]` beats the emoji shorthand.
	for (const f of parseLineFields(text)) {
		if (!(f.key in fields)) fields[f.key] = f.value;
	}
	for (const span of emojiSpans(text)) {
		if (!(span.key in fields)) fields[span.key] = span.value;
	}
	if (!("priority" in fields)) {
		for (const { emoji, value } of TASK_PRIORITY) {
			if (text.includes(emoji)) {
				fields.priority = value;
				break;
			}
		}
	}
	return addLowercaseAliases(fields);
}

function collectTags(text: string): string[] {
	const out: string[] = [];
	const re = /(^|\s)#([\p{L}\p{N}_/-]+)/gu;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		if (!out.includes(m[2])) out.push(m[2]);
	}
	return out;
}

/** Indent width in columns, counting a tab as four. */
function indentWidth(indent: string): number {
	let w = 0;
	for (const ch of indent) w += ch === "\t" ? 4 : 1;
	return w;
}

/**
 * Extract every checkbox line in a note body as a TaskItem. Frontmatter and
 * fenced code blocks are skipped. Nesting comes from indentation, so a sub-task
 * knows its parent line.
 */
export function parseTasks(body: string, path: string, noteName: string): TaskItem[] {
	const lines = body.split(/\r?\n/);
	const out: TaskItem[] = [];
	let i = 0;

	if (lines[0] !== undefined && /^---\s*$/.test(lines[0])) {
		let j = 1;
		while (j < lines.length && !/^---\s*$/.test(lines[j])) j++;
		if (j < lines.length) i = j + 1;
	}

	const inFence = makeFenceScanner();
	let inComment = false;
	let section = "";
	/** Open ancestors as {indent width, line} so a child can find its parent. */
	const stack: Array<{ width: number; line: number }> = [];

	for (; i < lines.length; i++) {
		const raw = lines[i];
		if (inFence(raw)) continue;
		// A checkbox inside a `%%comment%%` is content the user deliberately
		// hid; turning it into a writable row would resurrect it.
		const visible = stripBlockComment(raw, inComment);
		inComment = visible.inComment;
		if (!TASK_RE.test(visible.text) && !HEADING_RE.test(visible.text)) continue;

		const h = HEADING_RE.exec(raw);
		if (h) {
			section = h[2].trim();
			stack.length = 0;
			continue;
		}

		const m = TASK_RE.exec(raw);
		if (!m) continue;

		const width = indentWidth(m[1]);
		while (stack.length > 0 && stack[stack.length - 1].width >= width) stack.pop();
		const parent = stack.length > 0 ? stack[stack.length - 1].line : null;
		stack.push({ width, line: i });

		const status = m[2];
		// Fields are read from the RAW text, not the comment-stripped one, so the
		// reader and the writer agree about what is on this line. (The writer edits
		// the raw line; if the reader hid a `%%[due:: x]%%` the writer would still
		// find and overwrite it — and the recorded inverse would be wrong.)
		const rawText = m[3];
		const text = stripTaskMetadata(rawText);
		out.push({
			id: makeTaskId(path, i, text),
			path,
			note: noteName,
			line: i,
			level: stack.length - 1,
			status,
			checked: status.trim().length > 0,
			done: status === "x" || status === "X",
			text,
			raw,
			section,
			parent,
			tags: collectTags(rawText),
			fields: readTaskFields(rawText),
		});
	}
	return out;
}

// ---- Writeback --------------------------------------------------------------

/** One field mutation on a task line — the same shape the frontmatter writer
 * takes, so the view layer stays unaware of which kind of row it is editing. */
export interface TaskWrite {
	key: string;
	value?: unknown;
	remove?: boolean;
}

function valueToText(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (Array.isArray(value)) return value.map((v) => valueToText(v)).join(", ");
	if (value instanceof Date) return value.toISOString().slice(0, 10);
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	// A nested object has no sensible one-line form; JSON beats "[object Object]"
	// landing in the middle of someone's task line.
	return JSON.stringify(value) ?? "";
}

/** Neutralise a value so it cannot terminate its wrapper or spill onto another
 * line. The substitutes are braces rather than the other bracket type, so a
 * value written into a `(…)` field can't close it either. */
function safeFieldValue(value: unknown, wrapper: "square" | "round"): string {
	const pair = wrapper === "square" ? /[[\]]/g : /[()]/g;
	return valueToText(value)
		.replace(/\r?\n/g, " ")
		.replace(pair, (c) => (c === "[" || c === "(" ? "{" : "}"));
}

/** Replace the checkbox character of a task line. */
export function setTaskStatusChar(raw: string, char: string): string {
	const m = TASK_RE.exec(raw);
	if (!m) return raw;
	const c = char.length === 1 ? char : " ";
	const open = raw.indexOf("[", m[1].length);
	if (open < 0) return raw;
	return `${raw.slice(0, open)}[${c}]${raw.slice(open + 3)}`;
}

/** The checkbox character a write to a reserved `task.*` key should produce. */
export function statusCharFor(key: string, value: unknown, remove?: boolean): string {
	if (remove) return " ";
	if (key === "task.status") {
		const s = valueToText(value);
		return s.length >= 1 ? s[0] : " ";
	}
	const s = valueToText(value).trim().toLowerCase();
	const truthy = s === "true" || s === "yes" || s === "1" || s === "done" || s === "x";
	return truthy ? "x" : " ";
}

/**
 * Apply field writes to a single task line and report the inverse writes that
 * would undo them. Update order is deliberate: an existing `[key:: …]` is
 * rewritten in place, else a matching emoji's value is replaced, else the field
 * is appended — always before a trailing `^block-id`.
 */
export function applyTaskWrites(raw: string, writes: readonly TaskWrite[]): { raw: string; inverse: TaskWrite[] } {
	if (!TASK_RE.test(raw)) return { raw, inverse: [] };

	let line = raw;
	const inverse: TaskWrite[] = [];
	const seen = new Set<string>();

	for (const write of writes) {
		// Dedupe case-INSENSITIVELY, matching the lookup and the writer. Writing
		// `Due` and `due` in one batch targets the same field; letting both
		// through would record two inverses and undo to the intermediate value.
		const dedupe = TASK_STATUS_KEYS.has(write.key) ? write.key : write.key.toLowerCase();
		if (seen.has(dedupe)) continue;
		seen.add(dedupe);

		if (TASK_STATUS_KEYS.has(write.key)) {
			const before = TASK_RE.exec(line)?.[2] ?? " ";
			inverse.push({ key: "task.status", value: before });
			line = setTaskStatusChar(line, statusCharFor(write.key, write.value, write.remove));
			continue;
		}

		const text = TASK_RE.exec(line)?.[3] ?? "";
		// The lookup has to be case-INSENSITIVE because the writer below is: a line
		// carrying `[Due:: x]` is what a write to `due` overwrites, so a
		// case-sensitive miss here would record "remove" and undo would DELETE the
		// user's original value instead of restoring it.
		const existing = lookupField(readTaskFields(text), write.key);
		if (existing.found) inverse.push({ key: write.key, value: existing.value });
		else inverse.push({ key: write.key, remove: true });
		line = writeOneField(line, write);
	}
	return { raw: line, inverse };
}

export type SpliceStatus = "written" | "unchanged" | "notfound";

/**
 * Apply writes to one task inside a whole file's text, returning the new text.
 *
 * This is the single riskiest operation in the plugin — it rewrites a line in
 * the middle of someone's note — so it lives here, pure and tested, rather than
 * inline in the Obsidian write path.
 *
 * The file is split on a separator-PRESERVING pattern and only the one target
 * element is replaced, so every other byte (mixed CRLF/LF, a trailing newline
 * or its absence) comes back identical. `notfound` means the task could not be
 * located unambiguously; the caller must refuse the write, not guess.
 */
export function spliceTaskLine(
	data: string,
	ref: TaskRef,
	writes: readonly TaskWrite[]
): { text: string; inverse: TaskWrite[]; status: SpliceStatus } {
	// Odd indices are the line separators.
	const parts = data.split(/(\r?\n)/);
	const lines: string[] = [];
	for (let i = 0; i < parts.length; i += 2) lines.push(parts[i]);

	const idx = relocateTask(lines, ref);
	if (idx < 0) return { text: data, inverse: [], status: "notfound" };

	const result = applyTaskWrites(lines[idx], writes);
	if (result.raw === lines[idx]) return { text: data, inverse: [], status: "unchanged" };

	parts[idx * 2] = result.raw;
	return { text: parts.join(""), inverse: result.inverse, status: "written" };
}

/** Case-insensitive field lookup, matching how {@link writeOneField} matches. */
function lookupField(fields: Record<string, unknown>, key: string): { found: boolean; value?: unknown } {
	const target = key.toLowerCase();
	for (const [k, v] of Object.entries(fields)) {
		if (k.toLowerCase() === target) return { found: true, value: v };
	}
	return { found: false };
}

function writeOneField(line: string, write: TaskWrite): string {
	const key = write.key;
	// Find the existing field through the SAME parser the reader uses, so the
	// recorded inverse and the edit can never disagree. Matching is
	// case-insensitive (people write `Due::` and `due::`), but the replacement
	// reuses the user's own key spelling rather than rewriting it.
	const span = scanLineFieldSpans(line).find(
		(s) => s.wrapper !== "line" && s.key.toLowerCase() === key.toLowerCase()
	);

	if (write.remove) {
		if (span) return tidy(`${line.slice(0, span.start)} ${line.slice(span.end)}`);
		const stripped = rewriteEmoji(line, key, null);
		return stripped === null ? line : tidy(stripped);
	}

	if (span) {
		// `wrapper` is narrowed by the filter above — the whole-line form is never
		// rewritten in place (on a task line it is the task text, not a field).
		const round = span.wrapper === "round";
		const text = safeFieldValue(write.value, round ? "round" : "square");
		const open = round ? "(" : "[";
		const close = round ? ")" : "]";
		return `${line.slice(0, span.start)}${open}${span.rawKey}:: ${text}${close}${line.slice(span.end)}`;
	}

	const text = safeFieldValue(write.value, "square");
	const replaced = rewriteEmoji(line, key, text);
	if (replaced !== null) return tidy(replaced);

	const blockId = BLOCK_ID_RE.exec(line);
	if (blockId) {
		const head = line.slice(0, blockId.index).replace(/\s+$/, "");
		return `${head} [${key}:: ${text}]${blockId[0].replace(/\s+$/, "")}`;
	}
	return `${line.replace(/\s+$/, "")} [${key}:: ${text}]`;
}

/**
 * Rewrite (or, with `value === null`, delete) the emoji shorthand for `key`.
 * Returns null when the line carries no such emoji, so the caller falls through
 * to the bracketed form.
 */
function rewriteEmoji(line: string, key: string, value: string | null): string | null {
	if (key.toLowerCase() === "priority") {
		for (const { emoji } of TASK_PRIORITY) {
			if (!line.includes(emoji)) continue;
			if (value === null) return line.split(emoji).join(" ");
			const next = priorityEmojiFor(value);
			// A value outside the five Tasks priorities has no emoji to carry it.
			// Fall through so it lands as `[priority:: …]` — which also WINS over
			// the stale emoji, because readTaskFields reads inline fields first.
			if (!next) return null;
			return line.split(emoji).join(next);
		}
		return null;
	}
	// Only ever touch a span that was RECOGNISED as metadata. An emoji followed
	// by prose isn't one, so the write falls through to the bracketed form
	// instead of overwriting the user's words.
	const span = emojiSpans(line).find((s) => s.key.toLowerCase() === key.toLowerCase());
	if (!span) return null;
	const head = line.slice(0, span.start);
	const tail = line.slice(span.end);
	if (value === null) return `${head}${tail}`;
	const entry = TASK_EMOJI.find((e) => e.key === span.key);
	// A replacement value of the wrong shape can't live in the emoji slot — fall
	// through so it is stored as `[key:: …]` (which then WINS, since fields are
	// read before emoji) rather than written back malformed.
	if (!entry || !EMOJI_VALUE_EXACT[entry.kind].test(value)) return null;
	return `${head}${entry.emoji} ${value}${tail}`;
}

function priorityEmojiFor(value: string): string {
	const hit = TASK_PRIORITY.find((p) => p.value === value.trim().toLowerCase());
	return hit ? hit.emoji : "";
}

/** Collapse the double spaces a removal leaves behind, without touching the
 * line's leading indentation. */
function tidy(line: string): string {
	const m = /^([ \t]*)([\s\S]*)$/.exec(line);
	if (!m) return line;
	return `${m[1]}${m[2].replace(/[ \t]{2,}/g, " ").replace(/\s+$/, "")}`;
}

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
	isValidKey,
	fencedLines,
	scanLineFieldSpans,
	stripBlockComment,
	type LineFieldSpan,
} from "./inlineFields";
import { TASK_ROW_PROPS } from "../model/taskRow";
import { listElementWrite } from "./flatten";

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
	/** The emoji as written — `⌛` and `⏳` both mean `scheduled`, and a rewrite
	 * keeps whichever one the user typed. */
	emoji: string;
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
			spans.push({ key, emoji, value: m[1], start: idx, end: from + m[0].length });
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
	return fnv6(text.trim().toLowerCase().replace(/\s+/g, " "));
}

function fnv6(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(36).padStart(6, "0").slice(-6);
}

/**
 * The id hash of the `ordinal`-th task (0-based, in file order) whose text
 * hashes to `base`. The first occurrence keeps the plain text hash; each later
 * twin gets its own. Without this, two `- [ ] Review` lines share one id hash,
 * and once a line is inserted above them the recorded line number points at
 * the OTHER twin, whose hash matches. The write then lands on the wrong task.
 */
export function occurrenceHash(base: string, ordinal: number): string {
	return ordinal === 0 ? base : fnv6(`${base}#${ordinal}`);
}

/**
 * A task row id. `::` is the separator because Obsidian forbids `:` in vault
 * paths, so the note path is always recoverable unambiguously.
 */
export function makeTaskId(path: string, line: number, text: string, ordinal = 0): string {
	return `${path}::L${line}::${occurrenceHash(hashTaskText(text), ordinal)}`;
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
 * Walk the lines that are live markdown: past the frontmatter, outside fenced
 * code and `%%comments%%`. This is the one definition of where a task can be.
 * The parser and the writer's relocation both use it, so a write can never land
 * on a fenced or commented-out copy that the reader doesn't show.
 */
function forEachLiveLine(lines: readonly string[], visit: (i: number, raw: string, visible: string) => void): void {
	let i = 0;
	if (lines[0] !== undefined && /^---\s*$/.test(lines[0])) {
		let j = 1;
		while (j < lines.length && !/^---\s*$/.test(lines[j])) j++;
		if (j < lines.length) i = j + 1;
	}
	const fenced = fencedLines(lines, i);
	let inComment = false;
	for (; i < lines.length; i++) {
		const raw = lines[i];
		if (fenced[i]) continue;
		// A checkbox inside a `%%comment%%` is content the user deliberately
		// hid; turning it into a writable row would resurrect it.
		const visible = stripBlockComment(raw, inComment);
		inComment = visible.inComment;
		visit(i, raw, visible.text);
	}
}

/** Every live task line with its text hash and its occurrence-aware id hash. */
function liveTaskHashes(lines: readonly string[]): Array<{ line: number; base: string; hash: string }> {
	const out: Array<{ line: number; base: string; hash: string }> = [];
	const seen = new Map<string, number>();
	forEachLiveLine(lines, (i, raw, visible) => {
		if (!TASK_RE.test(visible)) return;
		const m = TASK_RE.exec(raw);
		if (!m) return;
		const base = hashTaskText(stripTaskMetadata(m[3]));
		const ordinal = seen.get(base) ?? 0;
		seen.set(base, ordinal + 1);
		out.push({ line: i, base, hash: occurrenceHash(base, ordinal) });
	});
	return out;
}

/**
 * Find the task a ref points at in the CURRENT file lines. Prefers the recorded
 * line, then falls back to a hash scan, so an edit higher up the note can't make
 * a write land on the wrong task. Returns -1 when the task is gone — the caller
 * must then refuse the write rather than corrupt an unrelated line.
 */
export function relocateTask(lines: readonly string[], ref: TaskRef): number {
	const live = liveTaskHashes(lines);
	const atLine = live.find((t) => t.line === ref.line);
	if (atLine && atLine.hash === ref.hash) return ref.line;
	// The task moved. Only act when the answer is UNAMBIGUOUS. A task with an
	// identical twin is refused outright once it has moved: adding or deleting
	// a twin above it shifts which occurrence is which, so its ordinal can no
	// longer be trusted. A refused write is a visible no-op; a wrong write
	// silently corrupts a note.
	const hits = live.filter((t) => t.hash === ref.hash);
	if (hits.length !== 1) return -1;
	if (live.filter((t) => t.base === hits[0].base).length > 1) return -1;
	return hits[0].line;
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
	// The whole-line `key:: value` form is skipped: on a task line it IS the
	// task's text (stripTaskMetadata keeps it and the writer never edits it), so
	// reading it as a field would show a value no write could ever change.
	for (const f of scanLineFieldSpans(text)) {
		if (f.wrapper !== "line" && !(f.key in fields)) fields[f.key] = f.value;
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
	let section = "";
	/** Open ancestors as {indent width, line} so a child can find its parent. */
	const stack: Array<{ width: number; line: number }> = [];
	/** How many tasks with each text hash came earlier — see {@link occurrenceHash}. */
	const seen = new Map<string, number>();

	forEachLiveLine(lines, (i, raw, visible) => {
		if (!TASK_RE.test(visible) && !HEADING_RE.test(visible)) return;

		const h = HEADING_RE.exec(raw);
		if (h) {
			section = h[2].trim();
			stack.length = 0;
			return;
		}

		const m = TASK_RE.exec(raw);
		if (!m) return;

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
		const base = hashTaskText(text);
		const ordinal = seen.get(base) ?? 0;
		seen.set(base, ordinal + 1);
		out.push({
			id: `${path}::L${i}::${occurrenceHash(base, ordinal)}`,
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
	});
	return out;
}

// ---- Writeback --------------------------------------------------------------

/** One field mutation on a task line — the same shape the frontmatter writer
 * takes, so the view layer stays unaware of which kind of row it is editing. */
export interface TaskWrite {
	key: string;
	value?: unknown;
	remove?: boolean;
	/** Edit ONE element of the list at `key` (a FLATTEN row's element), resolved
	 * against the line as it is when the write lands. */
	listElement?: { value: unknown };
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

/**
 * Make a value safe to write inside a field. A value must not be able to close
 * its wrapper, spill onto another line, open an inline-code span, or open a
 * `%%comment%%`. The last two would not just break this field: a stray
 * backtick turns the rest of the line into code, and a `%%` hides every task
 * after it in the note.
 *
 * Inside `[…]`, a balanced `[[wikilink]]` is kept as it is. The reader's
 * pattern accepts exactly that shape, and link-valued fields
 * (`project:: [[Alpha]]`) are the most common kind. Any other bracket becomes
 * a brace, which can't close either wrapper.
 */
function safeFieldValue(value: unknown, wrapper: "square" | "round"): string {
	const text = valueToText(value)
		.replace(/\r\n|[\r\n\u2028\u2029]/g, " ")
		.replace(/`/g, "'")
		.replace(/%(?=%)/g, "% ");
	if (wrapper === "round") return text.replace(/[()]/g, (c) => (c === "(" ? "{" : "}"));
	return text.replace(/\[\[[^\]\n]*\]\]|[[\]]/g, (m) => (m.length > 1 ? m : m === "[" ? "{" : "}"));
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

/**
 * The checkbox character a write to a reserved `task.*` key should produce,
 * or null when the value can't be one. A checkbox holds a single UTF-16 unit
 * (that is what the task pattern reads), so an emoji status has no safe form.
 * Taking its first unit would write half a surrogate pair.
 */
export function statusCharFor(key: string, value: unknown, remove?: boolean): string | null {
	if (remove) return " ";
	if (key === "task.status") {
		const s = valueToText(value);
		if (s.length === 0) return " ";
		const first = String.fromCodePoint(s.codePointAt(0) ?? 32);
		return first.length === 1 && first !== "\n" && first !== "\r" ? first : null;
	}
	const s = valueToText(value).trim().toLowerCase();
	const truthy = s === "true" || s === "yes" || s === "1" || s === "done" || s === "x";
	return truthy ? "x" : " ";
}

/**
 * The reserved write that undoes a task edit. Undo puts back the exact line
 * that was there, not a re-written field. Re-writing would go through the
 * parser, which normalises: `007` becomes `7`, `TRUE` becomes `true`, a
 * code-span value reads as empty. Undoing a single edit would then still change
 * the note. The swap is compare-and-swap: it applies only while the line is
 * exactly what the plugin wrote, so it never overwrites a later edit.
 */
export const TASK_LINE_SWAP = "task.$swap";

export interface TaskLineSwap {
	expect: string;
	restore: string;
}

/** What {@link applyTaskWrites} produced. `refused` explains a write that was
 * not made because it could not be made safely. */
export interface TaskWriteResult {
	raw: string;
	inverse: TaskWrite[];
	refused?: string;
}

/**
 * Apply field writes to a single task line and report the inverse that would
 * undo them. Update order is deliberate: an existing `[key:: …]` is rewritten
 * in place, else a matching emoji's value is replaced, else the field is
 * appended — always before a trailing `^block-id`.
 *
 * The writes are all-or-nothing. Each result is checked against the reader
 * before it is accepted (see {@link checkTaskWrite}). A write that would change
 * the task's identity, disturb another field, or not read back is refused, and
 * the line is left exactly as it was.
 */
export function applyTaskWrites(raw: string, writes: readonly TaskWrite[]): TaskWriteResult {
	if (!TASK_RE.test(raw)) return { raw, inverse: [] };

	const swap = writes.find((w) => w.key === TASK_LINE_SWAP);
	if (swap) return applyLineSwap(raw, swap, writes.length);

	let line = raw;
	const batch = lastWritePerField(writes).map(({ listElement, ...plain }) => {
		if (!listElement) return plain;
		// A field that isn't on the line is inherited from the note; writing it
		// here is a plain task-level value, and the note's list is untouched.
		const current = lookupField(readTaskFields(TASK_RE.exec(raw)?.[3] ?? ""), plain.key);
		return current.found ? listElementWrite(current.value, listElement.value, plain) : plain;
	});
	if (batch.some((w) => w === null)) return { raw, inverse: [], refused: "that value is no longer in its list" };
	for (const write of batch as TaskWrite[]) {
		const refused = refuseKey(write.key);
		if (refused) return { raw, inverse: [], refused };

		if (TASK_STATUS_KEYS.has(write.key)) {
			const char = statusCharFor(write.key, write.value, write.remove);
			if (char === null) return { raw, inverse: [], refused: "a checkbox holds a single character" };
			line = setTaskStatusChar(line, char);
			continue;
		}
		line = writeOneField(line, write);
	}
	if (line === raw) return { raw, inverse: [] };

	const problem = checkTaskWrite(raw, line, batch as TaskWrite[]);
	if (problem) return { raw, inverse: [], refused: problem };
	const undo: TaskLineSwap = { expect: line, restore: raw };
	return { raw: line, inverse: [{ key: TASK_LINE_SWAP, value: undo }] };
}

function applyLineSwap(raw: string, swap: TaskWrite, count: number): TaskWriteResult {
	const v = swap.value as Partial<TaskLineSwap> | undefined;
	if (count !== 1 || typeof v?.expect !== "string" || typeof v.restore !== "string") {
		return { raw, inverse: [], refused: "the undo record is malformed" };
	}
	if (raw !== v.expect) {
		return {
			raw,
			inverse: [],
			refused: "the task was edited after that change, and undoing it would overwrite the newer edit",
		};
	}
	if (v.restore === raw) return { raw, inverse: [] };
	const redo: TaskLineSwap = { expect: v.restore, restore: raw };
	return { raw: v.restore, inverse: [{ key: TASK_LINE_SWAP, value: redo }] };
}

/**
 * Collapse a batch to one write per field, keeping the LAST write, as the
 * frontmatter writer does (a later key assignment wins there). Without this, a
 * Move Rule that sets the group-by key would win on note rows and lose on task
 * rows. Field keys compare case-insensitively, like the lookup and the writer.
 * The three checkbox keys all write one character, so they count as one field.
 */
function lastWritePerField(writes: readonly TaskWrite[]): TaskWrite[] {
	const out: TaskWrite[] = [];
	const seen = new Set<string>();
	for (let i = writes.length - 1; i >= 0; i--) {
		const w = writes[i];
		const id = TASK_STATUS_KEYS.has(w.key) ? "task.status" : w.key.toLowerCase();
		if (seen.has(id)) continue;
		seen.add(id);
		out.unshift(w);
	}
	return out;
}

/** Why `key` can't be written to a task line, or null when it can. */
function refuseKey(key: string): string | null {
	if (TASK_STATUS_KEYS.has(key)) return null;
	// task.text, task.section, task.line, … are read off the line's position
	// and shape. A "write" would append a [task.section:: …] field that the
	// built-in value hides, so the card snaps back and the junk stays.
	if (TASK_ROW_PROPS.has(key) || key === TASK_LINE_SWAP) return `"${key}" is computed from the task line and can't be set`;
	// The key goes into the source verbatim, so it has to survive the reader's
	// own key pattern and not be able to open a wrapper, code span or comment.
	if (
		key.trim() !== key ||
		!isValidKey(key) ||
		/[[\]()`\n\r]/.test(key) ||
		key.includes("::") ||
		key.includes("%%") ||
		/^[*_~]|[*_~]$/.test(key)
	) {
		return `"${key}" can't be written as an inline field name`;
	}
	return null;
}

/**
 * Re-read a rewritten line and confirm the edit did exactly what was asked:
 * the line is still a task, the task's own text (its identity hash) is
 * unchanged, every field not written reads back as before, every written field
 * reads back present, and every removed one reads back absent. This is the
 * backstop behind every rule above. Anything the writer gets wrong turns into a
 * refused write instead of a changed note.
 */
function checkTaskWrite(before: string, after: string, writes: readonly TaskWrite[]): string | null {
	const a = TASK_RE.exec(after);
	const b = TASK_RE.exec(before);
	if (!a || !b) return "the result would no longer be a task line";
	if (hashTaskText(stripTaskMetadata(a[3])) !== hashTaskText(stripTaskMetadata(b[3]))) {
		return "the value would change the task's own text";
	}
	// Overwriting a field may remove a balanced `code` pair; it must never add a
	// delimiter or leave one unpaired, which would re-scope the rest of the line
	// (a backtick) or the rest of the note (a `%%`).
	for (const delim of ["%%", "`"]) {
		const was = count(before, delim);
		const now = count(after, delim);
		if (now > was || now % 2 !== was % 2) return "the value would open a comment or code span";
	}
	const written = new Set(writes.map((w) => w.key.toLowerCase()));
	const fieldsBefore = readTaskFields(b[3]);
	const fieldsAfter = readTaskFields(a[3]);
	// Both directions: a value can also SMUGGLE IN a field (`[due:: …]` inside a
	// round field, or a priority emoji), not only disturb an existing one.
	for (const key of new Set([...Object.keys(fieldsBefore), ...Object.keys(fieldsAfter)])) {
		if (written.has(key.toLowerCase())) continue;
		if (JSON.stringify(fieldsAfter[key]) !== JSON.stringify(fieldsBefore[key])) {
			return `the value would disturb another field ("${key}")`;
		}
	}
	for (const w of writes) {
		if (TASK_STATUS_KEYS.has(w.key)) continue;
		const found = lookupField(fieldsAfter, w.key).found;
		if (w.remove && found) return `"${w.key}" is set in a way that can't be removed from here`;
		if (!w.remove && !found) return `the new "${w.key}" value wouldn't read back`;
	}
	return null;
}

function count(s: string, needle: string): number {
	return s.split(needle).length - 1;
}

export type SpliceStatus = "written" | "unchanged" | "notfound" | "refused";

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
 * located unambiguously and `refused` that the write could not be made safely;
 * either way the text comes back untouched.
 */
export function spliceTaskLine(
	data: string,
	ref: TaskRef,
	writes: readonly TaskWrite[]
): { text: string; inverse: TaskWrite[]; status: SpliceStatus; reason?: string } {
	// Odd indices are the line separators.
	const parts = data.split(/(\r?\n)/);
	const lines: string[] = [];
	for (let i = 0; i < parts.length; i += 2) lines.push(parts[i]);

	const idx = relocateTask(lines, ref);
	if (idx < 0) return { text: data, inverse: [], status: "notfound" };

	const result = applyTaskWrites(lines[idx], writes);
	if (result.refused) return { text: data, inverse: [], status: "refused", reason: result.refused };
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

/** The bracketed field `key`, found through the SAME parser the reader uses.
 * Matching is case-insensitive (people write `Due::` and `due::`). The
 * whole-line form is never a field on a task line — it is the task text. */
function fieldSpan(line: string, key: string): LineFieldSpan | undefined {
	const target = key.toLowerCase();
	return scanLineFieldSpans(line).find((s) => s.wrapper !== "line" && s.key.toLowerCase() === target);
}

function writeOneField(line: string, write: TaskWrite): string {
	const key = write.key;

	if (write.remove) {
		// A field can be set two ways at once (`[due:: …]` and `📅 …`). The reader
		// prefers the bracket, so removing only that would expose the emoji's
		// date as the "removed" field's value. Remove every source.
		let next = line;
		for (let guard = 0; guard < 16; guard++) {
			const span = fieldSpan(next, key);
			if (span) {
				next = cutSpan(next, span.start, span.end);
				continue;
			}
			const stripped = removeEmoji(next, key);
			if (stripped === null) break;
			next = stripped;
		}
		return next;
	}

	const span = fieldSpan(line, key);
	if (span) {
		// The replacement reuses the user's own key spelling and wrapper.
		const round = span.wrapper === "round";
		const text = safeFieldValue(write.value, round ? "round" : "square");
		const open = round ? "(" : "[";
		const close = round ? ")" : "]";
		return `${line.slice(0, span.start)}${open}${span.rawKey}:: ${text}${close}${line.slice(span.end)}`;
	}

	const text = safeFieldValue(write.value, "square");
	const replaced = rewriteEmoji(line, key, text);
	if (replaced !== null) return replaced;

	const blockId = BLOCK_ID_RE.exec(line);
	if (blockId) {
		const head = line.slice(0, blockId.index).replace(/\s+$/, "");
		return `${head} [${key}:: ${text}]${blockId[0].replace(/\s+$/, "")}`;
	}
	return `${line.replace(/\s+$/, "")} [${key}:: ${text}]`;
}

/**
 * Rewrite the emoji shorthand for `key` with a new value. Returns null when
 * the line carries no such emoji, so the caller falls through to the
 * bracketed form.
 */
function rewriteEmoji(line: string, key: string, value: string): string | null {
	if (key.toLowerCase() === "priority") {
		for (const { emoji } of TASK_PRIORITY) {
			if (!line.includes(emoji)) continue;
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
	const entry = TASK_EMOJI.find((e) => e.emoji === span.emoji);
	// A replacement value of the wrong shape can't live in the emoji slot — fall
	// through so it is stored as `[key:: …]` (which then WINS, since fields are
	// read before emoji) rather than written back malformed.
	if (!entry || !EMOJI_VALUE_EXACT[entry.kind].test(value)) return null;
	return `${line.slice(0, span.start)}${span.emoji} ${value}${line.slice(span.end)}`;
}

/** Delete one emoji occurrence for `key`, or null when there is none. */
function removeEmoji(line: string, key: string): string | null {
	if (key.toLowerCase() === "priority") {
		for (const { emoji } of TASK_PRIORITY) {
			const at = line.indexOf(emoji);
			if (at >= 0) return cutSpan(line, at, at + emoji.length);
		}
		return null;
	}
	const span = emojiSpans(line).find((s) => s.key.toLowerCase() === key.toLowerCase());
	return span ? cutSpan(line, span.start, span.end) : null;
}

function priorityEmojiFor(value: string): string {
	const hit = TASK_PRIORITY.find((p) => p.value === value.trim().toLowerCase());
	return hit ? hit.emoji : "";
}

/** Delete `[start, end)` and close the gap with a single space. Only the
 * whitespace touching the cut is collapsed. Spacing elsewhere on the line,
 * including inside inline code, is left as the user wrote it. */
function cutSpan(line: string, start: number, end: number): string {
	const head = line.slice(0, start).replace(/[ \t]+$/, "");
	const tail = line.slice(end).replace(/^[ \t]+/, "");
	return tail.length > 0 ? `${head} ${tail}` : head;
}

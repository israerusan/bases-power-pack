/**
 * Dataview-compatible **inline fields** — `key:: value` written in the note
 * BODY rather than in frontmatter.
 *
 * This is the one thing Bases structurally cannot see: Obsidian's metadata
 * cache exposes frontmatter, tags, and links, but never body-level properties.
 * It is also the single biggest reason a Dataview vault cannot migrate — years
 * of `due:: 2026-01-01` live in note bodies. Parsing them here and merging them
 * into the row scope lets every existing view (kanban, calendar, Gantt, pivot,
 * dashboard) query them exactly like frontmatter.
 *
 * Pure and DOM/Obsidian-free so it is unit-testable; the caller supplies the
 * note text (see `bodyIndex.ts` for the cached vault-wide reader).
 *
 * Grammar (the Dataview subset that accounts for virtually all real usage):
 *   - full line:  `key:: value`  — after any blockquote `>`, list marker,
 *                 checkbox, or heading prefix; value runs to end of line
 *   - bracketed:  `[key:: value]` or `(key:: value)` anywhere in a line
 *
 * Deliberately skipped (they are not fields and produce false positives):
 *   - YAML frontmatter (Bases already owns it; it is not an inline field)
 *   - fenced code blocks, inline code spans, `%%comments%%`
 *   - markdown table rows
 */

/** One parsed `key:: value` occurrence. */
export interface InlineField {
	key: string;
	value: unknown;
	/** 0-based line of the source body the field was found on. */
	line: number;
}

/** A fence delimiter: a run of ``` or ~~~ with up to three leading spaces,
 * plus whatever follows it on the line (the info string, for an opener). */
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * A stateful "is this line inside a code fence?" test, shared by the field and
 * task scanners.
 *
 * It follows CommonMark's three rules that a naive boolean toggle gets wrong,
 * each of which ends a fence early and turns a documentation example into live
 * data — inventing properties, or worse, a writable task row:
 *   - a `~~~` line does not close a ``` fence (the character must match)
 *   - a ````-fenced block may contain ``` lines (the run must be long enough)
 *   - a CLOSER carries no info string, so ```` ```ts ```` inside a fence is
 *     content, not the end of the block
 *
 * Returns true for any line that should be ignored, fence delimiters included.
 */
export function makeFenceScanner(): (line: string) => boolean {
	let open: { char: string; len: number } | null = null;
	return (line: string): boolean => {
		const m = FENCE_RE.exec(line);
		if (!m) return open !== null;
		const char = m[1][0];
		const len = m[1].length;
		const info = m[2];
		if (!open) {
			// A backtick opener's info string may not itself contain a backtick.
			if (char === "`" && info.includes("`")) return false;
			open = { char, len };
			return true;
		}
		if (char === open.char && len >= open.len && info.trim().length === 0) open = null;
		return true;
	};
}

/**
 * Peel `%%comments%%` out of a line, carrying the open/closed state across
 * lines. Obsidian comments span lines, and a checkbox or `key:: value` sitting
 * inside one is explicitly hidden content — reading it would invent data the
 * user deliberately commented out.
 */
export function stripBlockComment(line: string, inComment: boolean): { text: string; inComment: boolean } {
	let out = "";
	let open = inComment;
	let i = 0;
	for (;;) {
		const idx = line.indexOf("%%", i);
		if (idx < 0) {
			if (!open) out += line.slice(i);
			break;
		}
		if (!open) out += line.slice(i, idx);
		open = !open;
		i = idx + 2;
	}
	return { text: out, inComment: open };
}

/** Leading markup that can precede a full-line field: blockquotes, list
 * markers, task checkboxes, and headings, in any sensible combination. */
const PREFIX_RE = /^(?:\s*>\s?)*\s*(?:(?:[-*+]|\d+[.)])\s+(?:\[.\]\s*)?|#{1,6}\s+)?/;

/** `[key:: value]`. The value alternation matches a whole `[[wikilink]]` before
 * falling back to a plain character, so `[project:: [[Alpha]]]` yields the whole
 * link rather than stopping at the link's own first `]`. */
const BRACKET_SQUARE_RE = /\[([^[\]\n]+?)::((?:\[\[[^\]\n]*\]\]|[^[\]\n])*)\]/g;
const BRACKET_ROUND_RE = /\(([^()\n]+?)::([^()\n]*)\)/g;

/** Emphasis / code markers stripped from a key before it becomes a property. */
const KEY_DECORATION_RE = /^[*_`~\s]+|[*_`~\s]+$/g;

/**
 * Is this a usable property name? Rejects the two big false-positive families:
 * a markdown table cell (`|`) and anything with no letter or digit at all
 * (e.g. the `::` in an ASCII art separator).
 */
function isValidKey(key: string): boolean {
	if (key.length === 0 || key.length > 100) return false;
	if (key.includes("|") || key.includes("\n")) return false;
	// A URL carrying `::` inside a markdown link's `(…)` would otherwise invent a
	// property named after half the URL.
	if (key.includes("://")) return false;
	return /[\p{L}\p{N}]/u.test(key);
}

function cleanKey(raw: string): string {
	return raw.replace(KEY_DECORATION_RE, "").trim();
}

/** Split on commas that are NOT inside a `[[wikilink]]` — so
 * `[[Project A|Alpha, beta]], [[Project B]]` splits into two links, not three. */
function splitTopLevelCommas(raw: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let current = "";
	for (let i = 0; i < raw.length; i++) {
		if (raw.startsWith("[[", i)) {
			depth++;
			current += "[[";
			i++;
			continue;
		}
		if (raw.startsWith("]]", i) && depth > 0) {
			depth--;
			current += "]]";
			i++;
			continue;
		}
		if (raw[i] === "," && depth === 0) {
			parts.push(current);
			current = "";
			continue;
		}
		current += raw[i];
	}
	parts.push(current);
	return parts;
}

/** A string that is wholly a number (no ISO date, no semver, no units). */
const WHOLLY_NUMERIC_RE = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;

function coerceScalar(raw: string): unknown {
	const t = raw.trim();
	if (t.length === 0) return "";
	const lower = t.toLowerCase();
	if (lower === "true") return true;
	if (lower === "false") return false;
	if (WHOLLY_NUMERIC_RE.test(t)) return Number(t);
	return t;
}

/**
 * Coerce an inline field's raw text into a value. Matches Dataview: a value
 * containing top-level commas becomes a LIST, so `tags:: a, b` behaves like a
 * YAML sequence and `contains()` works on it. Dates stay strings (the
 * expression engine compares ISO strings chronologically on purpose).
 */
export function coerceInlineValue(raw: string): unknown {
	const parts = splitTopLevelCommas(raw);
	if (parts.length > 1) {
		const items = parts.map((p) => p.trim()).filter((p) => p.length > 0);
		// `a,` or `, ,` is a sloppy scalar, not a one-element list — fall through.
		if (items.length > 1) return items.map(coerceScalar);
	}
	return coerceScalar(raw);
}

/** Blank out inline code spans so their contents never parse as fields.
 * (Block comments are handled by {@link stripBlockComment}, which needs
 * cross-line state this per-line pass doesn't have.) */
function stripNoise(line: string): string {
	return line.replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length));
}

/** One inline field together with the exact source range it occupies.
 *
 * The span is what lets the task writer edit a field in place without a second,
 * differently-behaved regex: reader, display-text stripper, and writer all work
 * from this one parse, so they can never disagree about what is metadata and
 * what is prose. `rawKey` preserves the user's own spelling and casing. */
export interface LineFieldSpan {
	key: string;
	rawKey: string;
	value: unknown;
	start: number;
	/** Index just past the field. */
	end: number;
	/** `[k:: v]`, `(k:: v)`, or the whole-line `k:: v` form. */
	wrapper: "square" | "round" | "line";
}

/**
 * Parse every inline field on ONE line of text, with source spans. Bracketed
 * fields are extracted first and blanked out (with equal-length spaces, so the
 * offsets stay true), which also stops a leading `[due:: x]` from being misread
 * as the key `[due` by the full-line pattern.
 */
export function scanLineFieldSpans(line: string): LineFieldSpan[] {
	const out: LineFieldSpan[] = [];
	// A table row is never a field line (`| name :: role |` is prose in a cell).
	if (/^\s*\|/.test(line)) return out;

	let rest = stripNoise(line);

	const wrappers: ReadonlyArray<[LineFieldSpan["wrapper"], RegExp]> = [
		["square", BRACKET_SQUARE_RE],
		["round", BRACKET_ROUND_RE],
	];
	for (const [wrapper, re] of wrappers) {
		re.lastIndex = 0;
		rest = rest.replace(re, (match: string, rawKey: string, rawValue: string, offset: number) => {
			const key = cleanKey(rawKey);
			if (!isValidKey(key)) return match;
			out.push({
				key,
				rawKey: rawKey.trim(),
				value: coerceInlineValue(rawValue),
				start: offset,
				end: offset + match.length,
				wrapper,
			});
			return " ".repeat(match.length);
		});
	}

	// Full-line form: skip markdown prefixes, then `key:: rest-of-line`.
	const prefix = PREFIX_RE.exec(rest)?.[0] ?? "";
	const m = /^([^:\n]+?)::(.*)$/.exec(rest.slice(prefix.length));
	if (m) {
		const key = cleanKey(m[1]);
		if (isValidKey(key)) {
			out.push({
				key,
				rawKey: m[1].trim(),
				value: coerceInlineValue(m[2]),
				start: prefix.length,
				end: line.length,
				wrapper: "line",
			});
		}
	}
	return out.sort((a, b) => a.start - b.start);
}

/** Every inline field on one line, in document order. */
export function parseLineFields(line: string): Array<{ key: string; value: unknown }> {
	return scanLineFieldSpans(line).map((s) => ({ key: s.key, value: s.value }));
}

/**
 * Scan a whole note body for inline fields, skipping YAML frontmatter and
 * fenced code blocks. Returns every occurrence in document order.
 */
export function scanInlineFields(body: string): InlineField[] {
	const lines = body.split(/\r?\n/);
	const out: InlineField[] = [];
	let i = 0;

	// Skip a leading YAML frontmatter block — Bases already reads it, and its
	// `key: value` lines are not inline fields.
	if (lines[0] !== undefined && /^---\s*$/.test(lines[0])) {
		let j = 1;
		while (j < lines.length && !/^---\s*$/.test(lines[j])) j++;
		if (j < lines.length) i = j + 1; // unterminated block → parse normally
	}

	const inFence = makeFenceScanner();
	let inComment = false;
	for (; i < lines.length; i++) {
		if (inFence(lines[i])) continue;
		const stripped = stripBlockComment(lines[i], inComment);
		inComment = stripped.inComment;
		if (stripped.text.trim().length === 0) continue;
		for (const f of parseLineFields(stripped.text)) out.push({ key: f.key, value: f.value, line: i });
	}
	return out;
}

/**
 * Collapse scanned fields into a property map. A key that appears once is a
 * scalar; a key that repeats becomes an array in document order (Dataview's
 * behavior), so `contains(person, "Ana")` works across repeated entries.
 */
export function collectInlineFields(fields: readonly InlineField[]): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	const repeated = new Set<string>();
	for (const f of fields) {
		if (!(f.key in out)) {
			out[f.key] = f.value;
			continue;
		}
		if (!repeated.has(f.key)) {
			out[f.key] = [out[f.key]];
			repeated.add(f.key);
		}
		(out[f.key] as unknown[]).push(f.value);
	}
	return addLowercaseAliases(out);
}

/**
 * Also expose each key lower-cased, as Dataview does. People write `Due::` and
 * `due::` interchangeably across a vault; without the alias, a board grouped by
 * `due` would silently miss every note that happened to capitalise it. An
 * explicit key always wins over an alias.
 */
export function addLowercaseAliases(fields: Record<string, unknown>): Record<string, unknown> {
	for (const [key, value] of Object.entries(fields)) {
		const lower = key.toLowerCase();
		if (lower !== key && !(lower in fields)) fields[lower] = value;
	}
	return fields;
}

/** Convenience: body text → property map. */
export function parseInlineFields(body: string): Record<string, unknown> {
	return collectInlineFields(scanInlineFields(body));
}

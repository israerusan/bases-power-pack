/**
 * **Dataview DQL → Bases converter.**
 *
 * The fourth and most mercenary piece: people don't leave Dataview because
 * they dislike it, they stay because migrating years of `TABLE … FROM … WHERE`
 * by hand is unthinkable. This takes a DQL query and emits a `.base` file plus
 * a suggested Power Pack view, so the migration is a paste and a click.
 *
 * It converts the clauses that account for virtually all real queries — TABLE /
 * LIST / TASK / CALENDAR, FROM, WHERE, SORT, GROUP BY, FLATTEN, LIMIT — and is
 * deliberately loud about what it cannot do. An unconvertible WHERE clause is
 * DROPPED with a warning rather than translated into something that silently
 * evaluates false and blanks the whole view; a half-right filter that hides
 * your notes is far worse than a filter that's visibly missing.
 *
 * Pure: no Obsidian, no DOM, no YAML library.
 */

import type { FilterNode } from "./filter";

export type DqlKind = "table" | "list" | "task" | "calendar";

export interface DqlColumn {
	expr: string;
	alias: string;
}

export interface DqlSort {
	expr: string;
	dir: "asc" | "desc";
}

export interface DqlQuery {
	kind: DqlKind;
	withoutId: boolean;
	columns: DqlColumn[];
	from: string;
	where: string[];
	sort: DqlSort[];
	groupBy: string | null;
	flatten: { expr: string; as: string } | null;
	limit: number | null;
}

export interface DqlConversion {
	query: DqlQuery;
	/** Filter tree for the generated `.base`. */
	filters: FilterNode;
	/** Named formulas for the computed columns the query selected. */
	formulas: Record<string, string>;
	/** Which Power Pack view best matches the query. */
	suggestedView: "kanban" | "calendar" | "gallery" | "feed";
	/** Settings the user should apply alongside the base (group-by, date prop). */
	suggestedSettings: Record<string, string>;
	/** Column order for the generated view. */
	order: string[];
	/** Non-fatal: converted, but check it. */
	warnings: string[];
	/** Something was dropped or could not be read at all. */
	errors: string[];
}

// ---- Clause splitting -------------------------------------------------------

const CLAUSE_WORDS = ["TABLE", "LIST", "TASK", "CALENDAR", "FROM", "WHERE", "SORT", "GROUP BY", "FLATTEN", "LIMIT"];

interface Clause {
	keyword: string;
	body: string;
}

/** True when only whitespace separates `i` from the start of its line. */
function atLineStart(src: string, i: number): boolean {
	for (let j = i - 1; j >= 0; j--) {
		const ch = src[j];
		if (ch === "\n") return true;
		if (ch !== " " && ch !== "\t" && ch !== "\r") return false;
	}
	return true;
}

/**
 * Is `src[i…]` a clause keyword at a word boundary and at nesting depth 0?
 *
 * A match requires EITHER the DQL convention of an upper-case keyword, OR that
 * the word begins its own line. Without that, `WHERE list = 1` would split at
 * the lower-case `list` and silently lose the condition — a wrong filter is the
 * one outcome this converter must never produce.
 */
function clauseAt(src: string, i: number): string | null {
	const before = i === 0 ? " " : src[i - 1];
	if (/[\w.$]/.test(before)) return null;
	const upper = src.toUpperCase();
	for (const kw of CLAUSE_WORDS) {
		if (!upper.startsWith(kw, i)) continue;
		const after = src[i + kw.length];
		if (after !== undefined && /[\w.$]/.test(after)) continue;
		// A keyword used as an OPERAND is an identifier, not a clause:
		// `WHERE SORT = "manual"` must stay one WHERE clause. Capitalisation
		// alone can't tell them apart — what follows can.
		if (/^\s*(?:[=!<>]|\)|,|\|\||&&)/.test(src.slice(i + kw.length))) continue;
		if (src.startsWith(kw, i) || atLineStart(src, i)) return kw;
	}
	return null;
}

/**
 * Split a DQL source into its clauses. Scans character by character so a
 * keyword inside a string literal, a function call, or a bracketed link is
 * never mistaken for a clause boundary.
 */
export function splitClauses(src: string): Clause[] {
	const out: Clause[] = [];
	let depth = 0;
	let quote: string | null = null;
	let start = 0;
	let keyword = "";

	for (let i = 0; i < src.length; i++) {
		const ch = src[i];
		if (quote) {
			if (ch === "\\") i++;
			else if (ch === quote) quote = null;
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			continue;
		}
		if (ch === "(" || ch === "[") {
			depth++;
			continue;
		}
		if (ch === ")" || ch === "]") {
			depth = Math.max(0, depth - 1);
			continue;
		}
		if (depth !== 0) continue;

		const kw = clauseAt(src, i);
		if (!kw) continue;
		if (keyword) out.push({ keyword, body: src.slice(start, i).trim() });
		else if (src.slice(0, i).trim().length > 0) out.push({ keyword: "", body: src.slice(0, i).trim() });
		keyword = kw;
		i += kw.length - 1;
		start = i + 1;
	}
	if (keyword) out.push({ keyword, body: src.slice(start).trim() });
	else if (src.trim().length > 0) out.push({ keyword: "", body: src.trim() });
	return out;
}

/** Split on a delimiter at nesting depth 0, outside string literals. */
export function splitTopLevel(src: string, delimiter: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let quote: string | null = null;
	let current = "";
	for (let i = 0; i < src.length; i++) {
		const ch = src[i];
		if (quote) {
			current += ch;
			if (ch === "\\" && i + 1 < src.length) {
				current += src[++i];
			} else if (ch === quote) quote = null;
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			current += ch;
			continue;
		}
		if (ch === "(" || ch === "[") depth++;
		if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
		if (ch === delimiter && depth === 0) {
			out.push(current);
			current = "";
			continue;
		}
		current += ch;
	}
	out.push(current);
	return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

// ---- Expression translation -------------------------------------------------

/** Functions our engine actually implements (see `engine/expression.ts`). */
const KNOWN_FUNCTIONS = new Set([
	"sum", "avg", "min", "max", "count", "round", "floor", "ceil", "abs", "sqrt",
	"length", "lower", "upper", "trim", "contains", "startswith", "endswith",
	"empty", "notempty", "number", "string", "concat", "join", "default", "list",
	"date", "datediff", "today", "if", "prop", "hastag",
]);

/** Dataview functions with a direct equivalent in our engine. */
const FUNCTION_ALIASES: Record<string, string> = {
	econtains: "contains",
	icontains: "contains",
	containsword: "contains",
	choice: "if",
	striptime: "string",
	ldefault: "default",
	nonnull: "default",
	lower: "lower",
	upper: "upper",
};

export interface TranslatedExpression {
	expr: string;
	warnings: string[];
	/** Dataview constructs with no equivalent — the caller must drop the clause. */
	unsupported: string[];
}

/** Apply `fn` to every stretch of `src` that is NOT inside a string literal. */
function mapOutsideStrings(src: string, fn: (chunk: string) => string): string {
	let out = "";
	let quote: string | null = null;
	let chunk = "";
	for (let i = 0; i < src.length; i++) {
		const ch = src[i];
		if (quote) {
			out += ch;
			if (ch === "\\" && i + 1 < src.length) out += src[++i];
			else if (ch === quote) quote = null;
			continue;
		}
		if (ch === '"' || ch === "'") {
			out += fn(chunk);
			chunk = "";
			quote = ch;
			out += ch;
			continue;
		}
		chunk += ch;
	}
	return out + fn(chunk);
}

/**
 * Rewrite a Dataview expression into our expression dialect. The differences
 * are small but fatal if ignored: DQL uses `=` for equality and the words
 * `and` / `or` / `not`, and `this.` to reach the current file.
 */
export function translateExpression(src: string): TranslatedExpression {
	const warnings: string[] = [];
	const unsupported: string[] = [];

	let out = mapOutsideStrings(src, (chunk) => {
		let c = chunk;
		// `this.file.name` → `file.name`.
		c = c.replace(/\bthis\./g, "");
		// Keyword operators.
		c = c.replace(/\band\b/gi, "&&").replace(/\bor\b/gi, "||").replace(/\bnot\b/gi, "!");
		// Lone `=` becomes `==` (leave ==, !=, <=, >= alone).
		c = c.replace(/(^|[^=!<>])=(?!=)/g, "$1==");
		return c;
	});

	// `date(today)` / `date(now)` are Dataview's clock, ours is `today()`.
	out = out.replace(/\bdate\s*\(\s*today\s*\)/gi, "today()");
	if (/\bdate\s*\(\s*now\s*\)/i.test(out)) {
		warnings.push("`date(now)` has no time-of-day equivalent — converted to `today()` (whole days).");
		out = out.replace(/\bdate\s*\(\s*now\s*\)/gi, "today()");
	}

	// Function aliases.
	out = out.replace(/\b([A-Za-z_]\w*)\s*\(/g, (match, name: string) => {
		const alias = FUNCTION_ALIASES[name.toLowerCase()];
		return alias ? `${alias}(` : match;
	});

	// Anything still calling an unknown function can't be evaluated — our engine
	// throws, `evaluateSafe` swallows it to null, and the row silently vanishes.
	// Report it so the caller drops the clause instead.
	const callRe = /\b([A-Za-z_]\w*)\s*\(/g;
	let m: RegExpExecArray | null;
	while ((m = callRe.exec(out)) !== null) {
		const name = m[1].toLowerCase();
		if (!KNOWN_FUNCTIONS.has(name)) unsupported.push(`${m[1]}()`);
	}
	for (const token of ["file.tasks", "file.lists", "file.day", "file.starred", "rows."]) {
		if (out.includes(token)) unsupported.push(token);
	}

	return { expr: out.trim(), warnings, unsupported: [...new Set(unsupported)] };
}

// ---- FROM translation -------------------------------------------------------

interface FromResult {
	expr: string;
	warnings: string[];
	errors: string[];
}

/**
 * Translate a DQL `FROM` source into a filter expression. Tags, folders and
 * link sources all have a Bases equivalent once `file.outlinks` exists — which
 * is exactly why this converter and the link index ship together.
 */
export function translateFrom(src: string): FromResult {
	const warnings: string[] = [];
	const errors: string[] = [];
	const trimmed = src.trim();
	if (trimmed.length === 0) return { expr: "", warnings, errors };

	const parts = tokenizeFrom(trimmed);
	const expr = buildFrom(parts, warnings, errors);
	return { expr, warnings, errors };
}

type FromToken = { t: "op"; v: "&&" | "||" | "!" } | { t: "paren"; v: "(" | ")" } | { t: "src"; v: string };

function tokenizeFrom(src: string): FromToken[] {
	const tokens: FromToken[] = [];
	let i = 0;
	while (i < src.length) {
		const ch = src[i];
		if (/\s/.test(ch)) {
			i++;
			continue;
		}
		if (ch === "(") {
			tokens.push({ t: "paren", v: "(" });
			i++;
			continue;
		}
		if (ch === ")") {
			tokens.push({ t: "paren", v: ")" });
			i++;
			continue;
		}
		if (ch === "-" || ch === "!") {
			tokens.push({ t: "op", v: "!" });
			i++;
			continue;
		}
		const rest = src.slice(i);
		const word = /^(and|or)\b/i.exec(rest);
		if (word) {
			tokens.push({ t: "op", v: word[1].toLowerCase() === "and" ? "&&" : "||" });
			i += word[0].length;
			continue;
		}
		// A source atom: #tag, "folder", [[link]], or outgoing([[link]]) / csv(…).
		if (ch === "#") {
			const m = /^#[^\s()]+/.exec(rest)!;
			tokens.push({ t: "src", v: m[0] });
			i += m[0].length;
			continue;
		}
		if (ch === '"') {
			const m = /^"((?:[^"\\]|\\.)*)"/.exec(rest);
			if (!m) break;
			tokens.push({ t: "src", v: m[0] });
			i += m[0].length;
			continue;
		}
		if (rest.startsWith("[[")) {
			const end = rest.indexOf("]]");
			if (end < 0) break;
			tokens.push({ t: "src", v: rest.slice(0, end + 2) });
			i += end + 2;
			continue;
		}
		const call = /^[A-Za-z_]\w*\s*\(/.exec(rest);
		if (call) {
			let depth = 0;
			let j = i;
			for (; j < src.length; j++) {
				if (src[j] === "(") depth++;
				else if (src[j] === ")") {
					depth--;
					if (depth === 0) {
						j++;
						break;
					}
				}
			}
			tokens.push({ t: "src", v: src.slice(i, j) });
			i = j;
			continue;
		}
		// Unrecognized run — consume to the next separator so we don't spin.
		const chunk = /^[^\s()]+/.exec(rest)!;
		tokens.push({ t: "src", v: chunk[0] });
		i += chunk[0].length;
	}
	return tokens;
}

function atomToExpr(atom: string, warnings: string[], errors: string[]): string | null {
	if (atom.startsWith("#")) {
		return `hastag(file.tags, ${quote(atom.slice(1))})`;
	}
	if (atom.startsWith('"')) {
		const folder = atom.slice(1, -1).replace(/\\(.)/g, "$1").replace(/\/+$/, "");
		if (folder.length === 0) return null;
		// A source can name a single note as well as a folder.
		return `(startswith(file.path, ${quote(`${folder}/`)}) || file.path == ${quote(`${folder}.md`)})`;
	}
	if (atom.startsWith("[[")) {
		const name = atom.slice(2, -2).split("|")[0].trim();
		return `contains(file.outlinks, ${quote(name)})`;
	}
	const call = /^([A-Za-z_]\w*)\s*\((.*)\)$/s.exec(atom);
	if (call) {
		const fn = call[1].toLowerCase();
		const inner = call[2].trim();
		// Direction matters and is easy to get backwards. `outgoing([[A]])`
		// selects the pages A links TO — so a candidate qualifies when A is among
		// ITS inlinks. `incoming([[A]])` (and the bare `[[A]]` above) selects the
		// pages that link to A, i.e. A is among the candidate's outlinks.
		if (fn === "outgoing") {
			const name = inner.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].trim();
			return `contains(file.inlinks, ${quote(name)})`;
		}
		if (fn === "incoming") {
			const name = inner.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0].trim();
			return `contains(file.outlinks, ${quote(name)})`;
		}
		errors.push(`FROM source \`${fn}(…)\` has no Bases equivalent and was dropped.`);
		return null;
	}
	warnings.push(`FROM source \`${atom}\` wasn't recognized and was ignored.`);
	return null;
}

function buildFrom(tokens: readonly FromToken[], warnings: string[], errors: string[]): string {
	let out = "";
	let pendingNot = false;
	for (const tok of tokens) {
		if (tok.t === "op") {
			if (tok.v === "!") {
				pendingNot = true;
				continue;
			}
			out += ` ${tok.v} `;
			continue;
		}
		if (tok.t === "paren") {
			out += tok.v;
			continue;
		}
		const expr = atomToExpr(tok.v, warnings, errors);
		if (expr === null) {
			pendingNot = false;
			continue;
		}
		out += pendingNot ? `!(${expr})` : expr;
		pendingNot = false;
	}
	// A dropped atom can leave a dangling `&&` / `||` or an empty group.
	return out
		.replace(/\(\s*\)/g, "")
		.replace(/(^|\()\s*(?:&&|\|\|)\s*/g, "$1")
		.replace(/\s*(?:&&|\|\|)\s*($|\))/g, "$1")
		.trim();
}

function quote(s: string): string {
	return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// ---- Query parsing ----------------------------------------------------------

function parseColumns(body: string): { withoutId: boolean; columns: DqlColumn[] } {
	let rest = body.trim();
	let withoutId = false;
	const woid = /^WITHOUT\s+ID\b/i.exec(rest);
	if (woid) {
		withoutId = true;
		rest = rest.slice(woid[0].length).trim();
	}
	const columns: DqlColumn[] = [];
	for (const part of splitTopLevel(rest, ",")) {
		const m = /^(.*?)\s+AS\s+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[\w$.]+)\s*$/is.exec(part);
		if (m) {
			const alias = m[2].replace(/^["']|["']$/g, "");
			columns.push({ expr: m[1].trim(), alias });
		} else {
			columns.push({ expr: part, alias: part });
		}
	}
	return { withoutId, columns };
}

function parseSort(body: string): DqlSort[] {
	const out: DqlSort[] = [];
	for (const part of splitTopLevel(body, ",")) {
		const m = /^(.*?)\s+(ASC|DESC|ASCENDING|DESCENDING)\s*$/is.exec(part);
		if (m) out.push({ expr: m[1].trim(), dir: /^DESC/i.test(m[2]) ? "desc" : "asc" });
		else out.push({ expr: part, dir: "asc" });
	}
	return out;
}

/** Parse a DQL source into its structural clauses, before any translation. */
export function parseDql(source: string): { query: DqlQuery; errors: string[] } {
	const errors: string[] = [];
	const clauses = splitClauses(stripCodeFence(source));
	const query: DqlQuery = {
		kind: "table",
		withoutId: false,
		columns: [],
		from: "",
		where: [],
		sort: [],
		groupBy: null,
		flatten: null,
		limit: null,
	};

	let sawKind = false;
	for (const clause of clauses) {
		switch (clause.keyword) {
			case "TABLE": {
				query.kind = "table";
				sawKind = true;
				const parsed = parseColumns(clause.body);
				query.withoutId = parsed.withoutId;
				query.columns = parsed.columns;
				break;
			}
			case "LIST":
				query.kind = "list";
				sawKind = true;
				if (clause.body.trim().length > 0) query.columns = [{ expr: clause.body.trim(), alias: clause.body.trim() }];
				break;
			case "TASK":
				query.kind = "task";
				sawKind = true;
				break;
			case "CALENDAR":
				query.kind = "calendar";
				sawKind = true;
				if (clause.body.trim().length > 0) query.columns = [{ expr: clause.body.trim(), alias: "date" }];
				break;
			case "FROM":
				query.from = clause.body;
				break;
			case "WHERE":
				if (clause.body.trim().length > 0) query.where.push(clause.body.trim());
				break;
			case "SORT":
				query.sort.push(...parseSort(clause.body));
				break;
			case "GROUP BY":
				query.groupBy = clause.body.trim() || null;
				break;
			case "FLATTEN": {
				const m = /^(.*?)\s+AS\s+([\w$.]+)\s*$/is.exec(clause.body.trim());
				query.flatten = m
					? { expr: m[1].trim(), as: m[2] }
					: { expr: clause.body.trim(), as: "" };
				break;
			}
			case "LIMIT": {
				const n = Number.parseInt(clause.body.trim(), 10);
				if (Number.isFinite(n)) query.limit = n;
				break;
			}
			default:
				if (clause.body.trim().length > 0) {
					errors.push(`Couldn't read \`${truncate(clause.body)}\` — expected the query to start with TABLE, LIST, TASK, or CALENDAR.`);
				}
		}
	}
	if (!sawKind) errors.push("No TABLE / LIST / TASK / CALENDAR clause found.");
	return { query, errors };
}

/** Accept a pasted ```dataview fenced block as well as a bare query. */
function stripCodeFence(src: string): string {
	const m = /^\s*(?:```|~~~)\s*\w*\s*\n([\s\S]*?)\n?\s*(?:```|~~~)\s*$/.exec(src);
	return m ? m[1] : src;
}

function truncate(s: string, n = 48): string {
	return s.length > n ? `${s.slice(0, n)}…` : s;
}

// ---- Conversion -------------------------------------------------------------

/** A formula name Bases will accept: letters, digits, underscore. */
export function formulaName(alias: string, taken: ReadonlySet<string>): string {
	const base = alias.replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "") || "col";
	const stem = /^\d/.test(base) ? `c_${base}` : base;
	let name = stem;
	for (let i = 2; taken.has(name); i++) name = `${stem}_${i}`;
	return name;
}

/** A bare property reference needs no formula — it already resolves. */
function isBareProperty(expr: string): boolean {
	return /^[A-Za-z_$][\w$]*(?:\.[\w$]+)*$/.test(expr.trim());
}

/** Convert a parsed DQL query into a Bases definition plus view suggestions. */
export function convertDql(source: string): DqlConversion {
	const { query, errors: parseErrors } = parseDql(source);
	const warnings: string[] = [];
	const errors: string[] = [...parseErrors];
	const conditions: string[] = [];

	// FROM
	if (query.from.trim().length > 0) {
		const from = translateFrom(query.from);
		warnings.push(...from.warnings);
		errors.push(...from.errors);
		if (from.expr.length > 0) conditions.push(from.expr);
	}

	// WHERE
	for (const clause of query.where) {
		const t = translateExpression(clause);
		warnings.push(...t.warnings);
		if (t.unsupported.length > 0) {
			errors.push(
				`WHERE clause \`${truncate(clause)}\` was DROPPED — no equivalent for ${t.unsupported.join(", ")}. ` +
					`It is left out rather than converted into a filter that would hide every note.`
			);
			continue;
		}
		conditions.push(t.expr);
	}

	// TASK queries only make sense against task rows.
	if (query.kind === "task") {
		warnings.push("TASK query: switch the row source to **Tasks** in settings so each checkbox becomes a row.");
	}

	// Columns → formulas (bare properties need none).
	const formulas: Record<string, string> = {};
	const order: string[] = [];
	const taken = new Set<string>();
	for (const col of query.columns) {
		const t = translateExpression(col.expr);
		warnings.push(...t.warnings);
		if (t.unsupported.length > 0) {
			warnings.push(`Column \`${truncate(col.expr)}\` uses ${t.unsupported.join(", ")} and was skipped.`);
			continue;
		}
		if (isBareProperty(t.expr)) {
			order.push(t.expr);
			continue;
		}
		const name = formulaName(col.alias, taken);
		taken.add(name);
		formulas[name] = t.expr;
		order.push(`formula.${name}`);
	}

	// SORT / LIMIT have no `.base` representation in our reader.
	if (query.sort.length > 0) {
		warnings.push(
			`SORT isn't stored in the base — set it from the view's Sort control (${query.sort
				.map((s) => `${s.expr} ${s.dir}`)
				.join(", ")}).`
		);
	}
	if (query.limit !== null) warnings.push(`LIMIT ${query.limit} isn't supported — the view shows every matching row.`);

	// FLATTEN
	if (query.flatten) {
		const t = translateExpression(query.flatten.expr);
		if (t.unsupported.length > 0) {
			errors.push(`FLATTEN \`${truncate(query.flatten.expr)}\` was dropped — no equivalent for ${t.unsupported.join(", ")}.`);
			query.flatten = null;
		} else {
			query.flatten = { expr: t.expr, as: query.flatten.as };
		}
	}

	// GROUP BY drives the board's columns.
	const suggestedSettings: Record<string, string> = {};
	let groupExpr: string | null = null;
	if (query.groupBy) {
		const t = translateExpression(query.groupBy);
		if (t.unsupported.length > 0) {
			warnings.push(`GROUP BY \`${truncate(query.groupBy)}\` uses ${t.unsupported.join(", ")} and was skipped.`);
		} else {
			groupExpr = t.expr;
			suggestedSettings.kanbanGroupBy = t.expr;
		}
	}

	const suggestedView: DqlConversion["suggestedView"] =
		query.kind === "calendar" ? "calendar" : groupExpr || query.kind === "task" ? "kanban" : "gallery";
	if (query.kind === "calendar" && query.columns[0]) {
		suggestedSettings.calendarDateProp = query.columns[0].expr;
	}
	if (query.flatten) {
		suggestedSettings.flattenExpression = query.flatten.expr;
		if (query.flatten.as) suggestedSettings.flattenAs = query.flatten.as;
	}

	const filters: FilterNode =
		conditions.length === 0 ? null : conditions.length === 1 ? conditions[0] : { and: conditions };

	return { query, filters, formulas, suggestedView, suggestedSettings, order, warnings, errors };
}

// ---- YAML emission ----------------------------------------------------------

/** Quote a scalar for YAML, always single-quoted so `{`, `[`, `#` and `:` in an
 * expression can never be read as structure. */
function yamlScalar(s: string): string {
	return `'${s.replace(/'/g, "''")}'`;
}

function emitFilter(node: FilterNode, indent: string, out: string[]): void {
	if (node === null || node === undefined) return;
	if (typeof node === "string") {
		out.push(`${indent}- ${yamlScalar(node)}`);
		return;
	}
	if (Array.isArray(node)) {
		for (const child of node) emitFilter(child, indent, out);
		return;
	}
	if ("and" in node && Array.isArray(node.and)) {
		out.push(`${indent}- and:`);
		for (const child of node.and) emitFilter(child, `${indent}    `, out);
		return;
	}
	if ("or" in node && Array.isArray(node.or)) {
		out.push(`${indent}- or:`);
		for (const child of node.or) emitFilter(child, `${indent}    `, out);
		return;
	}
	if ("not" in node) {
		out.push(`${indent}- not:`);
		emitFilter(node.not, `${indent}    `, out);
	}
}

/**
 * Render a conversion as `.base` YAML. Warnings and dropped clauses are emitted
 * as leading `#` comments so the file itself records what the converter could
 * not carry over.
 */
export function conversionToBaseYaml(conversion: DqlConversion, viewName = "Converted query"): string {
	const out: string[] = [];
	out.push("# Generated by Bases Power Pack from a Dataview query.");
	for (const e of conversion.errors) out.push(`# DROPPED: ${e.replace(/\n/g, " ")}`);
	for (const w of conversion.warnings) out.push(`# NOTE: ${w.replace(/\n/g, " ")}`);
	out.push("");

	if (conversion.filters) {
		const node = conversion.filters;
		if (typeof node === "object" && node !== null && "and" in node && Array.isArray(node.and)) {
			out.push("filters:");
			out.push("  and:");
			for (const child of node.and) emitFilter(child, "    ", out);
		} else if (typeof node === "string") {
			out.push("filters:");
			out.push(`  and:`);
			out.push(`    - ${yamlScalar(node)}`);
		}
	}

	const formulaEntries = Object.entries(conversion.formulas);
	if (formulaEntries.length > 0) {
		out.push("formulas:");
		for (const [name, expr] of formulaEntries) out.push(`  ${name}: ${yamlScalar(expr)}`);
	}

	out.push("views:");
	out.push(`  - type: ${conversion.suggestedView}`);
	out.push(`    name: ${yamlScalar(viewName)}`);
	if (conversion.suggestedSettings.kanbanGroupBy) {
		out.push(`    group: ${yamlScalar(conversion.suggestedSettings.kanbanGroupBy)}`);
	}
	if (conversion.order.length > 0) {
		out.push("    order:");
		for (const col of conversion.order) out.push(`      - ${yamlScalar(col)}`);
	}
	return `${out.join("\n")}\n`;
}

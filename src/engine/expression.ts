/**
 * A small, safe expression engine — no `eval`, no `Function` constructor.
 *
 * It powers three of the plugin's premium capabilities from one place:
 *   - formulas      (computed columns, e.g. `done / total`)
 *   - roll-ups      (aggregations feed on evaluated expressions)
 *   - saved filters (a filter is just an expression that returns a boolean)
 *
 * Grammar (lowest→highest precedence):
 *   ternary   a ? b : c
 *   or        a || b
 *   and       a && b
 *   equality  a == b   a != b
 *   compare   a < b  a <= b  a > b  a >= b
 *   additive  a + b   a - b
 *   multiply  a * b   a / b   a % b
 *   unary     !a      -a
 *   primary   number | string | true | false | null | ident(.ident)* | fn(args) | ( expr )
 *
 * Arbitrary frontmatter keys (spaces, dashes) are reachable via `prop("key name")`.
 */

export type Value = number | string | boolean | null | Value[] | Date;

export interface EvalScope {
	/** Resolve a (possibly dotted) identifier such as `status` or `file.name`. */
	get(name: string): unknown;
}

// ---- AST -------------------------------------------------------------------

type Node =
	| { t: "num"; v: number }
	| { t: "str"; v: string }
	| { t: "bool"; v: boolean }
	| { t: "null" }
	| { t: "ident"; name: string }
	| { t: "unary"; op: string; x: Node }
	| { t: "bin"; op: string; a: Node; b: Node }
	| { t: "ternary"; c: Node; a: Node; b: Node }
	| { t: "call"; name: string; args: Node[] };

export interface CompiledExpression {
	source: string;
	eval(scope: EvalScope): Value;
}

// ---- Tokenizer -------------------------------------------------------------

interface Token {
	type: "num" | "str" | "ident" | "op";
	value: string;
	pos: number;
}

const OPERATORS = [
	"===",
	"!==",
	"==",
	"!=",
	"<=",
	">=",
	"&&",
	"||",
	"<",
	">",
	"+",
	"-",
	"*",
	"/",
	"%",
	"!",
	"(",
	")",
	",",
	"?",
	":",
];

function tokenize(src: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	while (i < src.length) {
		const ch = src[i];
		if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
			i++;
			continue;
		}
		// String literal
		if (ch === '"' || ch === "'") {
			const quote = ch;
			let j = i + 1;
			let str = "";
			while (j < src.length && src[j] !== quote) {
				if (src[j] === "\\" && j + 1 < src.length) {
					const next = src[j + 1];
					str += next === "n" ? "\n" : next === "t" ? "\t" : next;
					j += 2;
					continue;
				}
				str += src[j];
				j++;
			}
			if (j >= src.length) throw new ExprError(`Unterminated string at ${i}`);
			tokens.push({ type: "str", value: str, pos: i });
			i = j + 1;
			continue;
		}
		// Number
		if (isDigit(ch) || (ch === "." && isDigit(src[i + 1] ?? ""))) {
			let j = i;
			while (j < src.length && (isDigit(src[j]) || src[j] === ".")) j++;
			const raw = src.slice(i, j);
			// A run like `1.2.3` used to become Number("1.2.3") = NaN — a silent NaN
			// token poisoning the whole expression. Reject a multi-dot run, but still
			// accept a lone trailing dot (`2.` → 2, valid in 1.10 and in JS).
			if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) {
				throw new ExprError(`Malformed number '${raw}' at ${i}`);
			}
			tokens.push({ type: "num", value: raw, pos: i });
			i = j;
			continue;
		}
		// Identifier (allows dots for `file.name`)
		if (isIdentStart(ch)) {
			let j = i;
			while (j < src.length && isIdentPart(src[j])) j++;
			tokens.push({ type: "ident", value: src.slice(i, j), pos: i });
			i = j;
			continue;
		}
		// Operator (longest match first)
		const op = OPERATORS.find((o) => src.startsWith(o, i));
		if (op) {
			tokens.push({ type: "op", value: op, pos: i });
			i += op.length;
			continue;
		}
		throw new ExprError(`Unexpected character '${ch}' at ${i}`);
	}
	return tokens;
}

function isDigit(c: string): boolean {
	return c >= "0" && c <= "9";
}
function isIdentStart(c: string): boolean {
	return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_" || c === "$";
}
function isIdentPart(c: string): boolean {
	return isIdentStart(c) || isDigit(c) || c === ".";
}

export class ExprError extends Error {}

// ---- Parser (recursive descent) --------------------------------------------

class Parser {
	private pos = 0;
	constructor(private tokens: Token[]) {}

	parse(): Node {
		if (this.tokens.length === 0) throw new ExprError("Empty expression");
		const node = this.ternary();
		if (this.pos < this.tokens.length) {
			throw new ExprError(`Unexpected token '${this.tokens[this.pos].value}'`);
		}
		return node;
	}

	private peek(): Token | undefined {
		return this.tokens[this.pos];
	}
	private eat(value?: string): Token {
		const tok = this.tokens[this.pos];
		if (!tok) throw new ExprError("Unexpected end of expression");
		if (value !== undefined && tok.value !== value) {
			throw new ExprError(`Expected '${value}' but got '${tok.value}'`);
		}
		this.pos++;
		return tok;
	}
	private isOp(value: string): boolean {
		const tok = this.peek();
		return !!tok && tok.type === "op" && tok.value === value;
	}

	private ternary(): Node {
		const cond = this.or();
		if (this.isOp("?")) {
			this.eat("?");
			const a = this.ternary();
			this.eat(":");
			const b = this.ternary();
			return { t: "ternary", c: cond, a, b };
		}
		return cond;
	}

	private binary(next: () => Node, ops: string[]): Node {
		let left = next();
		while (this.peek() && this.peek()!.type === "op" && ops.includes(this.peek()!.value)) {
			const op = this.eat().value;
			const right = next();
			left = { t: "bin", op, a: left, b: right };
		}
		return left;
	}

	private or(): Node {
		return this.binary(() => this.and(), ["||"]);
	}
	private and(): Node {
		return this.binary(() => this.equality(), ["&&"]);
	}
	private equality(): Node {
		return this.binary(() => this.compare(), ["==", "!=", "===", "!=="]);
	}
	private compare(): Node {
		return this.binary(() => this.additive(), ["<", "<=", ">", ">="]);
	}
	private additive(): Node {
		return this.binary(() => this.multiplicative(), ["+", "-"]);
	}
	private multiplicative(): Node {
		return this.binary(() => this.unary(), ["*", "/", "%"]);
	}

	private unary(): Node {
		if (this.isOp("!") || this.isOp("-")) {
			const op = this.eat().value;
			return { t: "unary", op, x: this.unary() };
		}
		return this.primary();
	}

	private primary(): Node {
		const tok = this.peek();
		if (!tok) throw new ExprError("Unexpected end of expression");

		if (tok.type === "num") {
			this.eat();
			return { t: "num", v: Number(tok.value) };
		}
		if (tok.type === "str") {
			this.eat();
			return { t: "str", v: tok.value };
		}
		if (this.isOp("(")) {
			this.eat("(");
			const node = this.ternary();
			this.eat(")");
			return node;
		}
		if (tok.type === "ident") {
			this.eat();
			if (tok.value === "true") return { t: "bool", v: true };
			if (tok.value === "false") return { t: "bool", v: false };
			if (tok.value === "null") return { t: "null" };
			// Function call?
			if (this.isOp("(")) {
				this.eat("(");
				const args: Node[] = [];
				if (!this.isOp(")")) {
					args.push(this.ternary());
					while (this.isOp(",")) {
						this.eat(",");
						args.push(this.ternary());
					}
				}
				this.eat(")");
				return { t: "call", name: tok.value, args };
			}
			return { t: "ident", name: tok.value };
		}
		throw new ExprError(`Unexpected token '${tok.value}'`);
	}
}

// ---- Evaluator -------------------------------------------------------------

export function toNumber(v: unknown): number {
	if (typeof v === "number") return v;
	if (typeof v === "boolean") return v ? 1 : 0;
	if (v instanceof Date) return v.getTime();
	if (typeof v === "string") {
		const n = parseFloat(v);
		return Number.isNaN(n) ? NaN : n;
	}
	return NaN;
}

/** Matches a string that is ENTIRELY a number (optionally signed/decimal). */
const STRICT_NUMERIC_RE = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;

/**
 * Coerce to a number ONLY when the value is genuinely numeric — a real number,
 * a boolean, a Date, or a string that is wholly a number. Unlike `toNumber`
 * (which uses parseFloat and happily reads `2026` out of `"2026-06-01"`), a
 * numeric-leading string like an ISO date or a semver returns NaN here, so
 * comparisons fall through to lexical order. This is what keeps `due >= "2026-06-01"`
 * and `due == today` correct: two different dates must not collapse to the same
 * leading number.
 */
export function strictNumber(v: unknown): number {
	if (typeof v === "number") return v;
	if (typeof v === "boolean") return v ? 1 : 0;
	if (v instanceof Date) return v.getTime();
	if (typeof v === "string") {
		const t = v.trim();
		return STRICT_NUMERIC_RE.test(t) ? Number(t) : NaN;
	}
	return NaN;
}

export function toBool(v: unknown): boolean {
	if (v === null || v === undefined) return false;
	if (typeof v === "boolean") return v;
	if (typeof v === "number") return v !== 0 && !Number.isNaN(v);
	if (typeof v === "string") {
		const t = v.trim().toLowerCase();
		return t.length > 0 && t !== "false" && t !== "no" && t !== "off" && t !== "0";
	}
	if (Array.isArray(v)) return v.length > 0;
	return true;
}

export function toStr(v: unknown): string {
	if (v === null || v === undefined) return "";
	if (typeof v === "string") return v;
	if (typeof v === "number" || typeof v === "boolean") return String(v);
	if (v instanceof Date) return v.toISOString();
	if (Array.isArray(v)) return v.map(toStr).join(", ");
	// A bare object never occurs for a real Value (Date/array are handled above),
	// but v is typed `unknown`; serialize instead of stringifying to "[object Object]".
	return JSON.stringify(v);
}

function isEmpty(v: unknown): boolean {
	if (v === null || v === undefined) return true;
	if (typeof v === "string") return v.trim().length === 0;
	if (Array.isArray(v)) return v.length === 0;
	return false;
}

function flatten(args: Value[]): Value[] {
	const out: Value[] = [];
	for (const a of args) {
		if (Array.isArray(a)) out.push(...flatten(a));
		else out.push(a);
	}
	return out;
}

function numeric(args: Value[]): number[] {
	return flatten(args)
		.map(arithNumber)
		.filter((n) => !Number.isNaN(n));
}

/** A string that starts with an ISO date — compared lexically, never by number. */
function looksDateLike(v: Value): boolean {
	return typeof v === "string" && /^\s*\d{4}-\d{2}-\d{2}/.test(v);
}

/** Day number (days since epoch, UTC) of a date value — a `date()` Date instance
 * or a date-like string's leading ISO date — or null when it isn't a date. Time
 * suffixes are ignored: arithmetic works in whole days. */
function isoDayNumber(v: Value): number | null {
	if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : Math.floor(v.getTime() / 86400000);
	if (typeof v !== "string") return null;
	const m = /^\s*(\d{4})-(\d{2})-(\d{2})/.exec(v);
	if (!m) return null;
	return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000);
}

/** ISO `YYYY-MM-DD` for a day number, or null when the day is out of Date's range
 * (guards against a `date ± huge` producing the literal string "NaN-NaN-NaN"). */
function isoFromDayNumber(day: number): string | null {
	if (!Number.isFinite(day)) return null;
	const d = new Date(day * 86400000);
	if (Number.isNaN(d.getTime())) return null;
	const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(d.getUTCDate()).padStart(2, "0");
	return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

/**
 * Number for the arithmetic operators `-`, `*`, `/`, `%`. Strict first (rejects
 * ISO dates and semvers so they never do garbage math), but — unlike equality —
 * a numeric value with a purely non-numeric unit suffix (`"60%"`, `"5 pts"`,
 * `"2.5h"`) still coerces, matching how `compare()` and roll-up aggregation
 * treat those values. A suffix containing a digit or dash (a date/semver) stays
 * rejected.
 */
export function arithNumber(v: Value): number {
	// A Date instance is NOT numeric for arithmetic/aggregation — strictNumber
	// would return its getTime() (epoch ms). Reject it here so `-date(x)`,
	// `date(x) * 2`, and a roll-up over a date() column all treat it as
	// non-numeric (the +/- shift and date compare handle Date operands via
	// isoDayNumber BEFORE reaching here).
	if (v instanceof Date) return NaN;
	const n = strictNumber(v);
	if (!Number.isNaN(n)) return n;
	if (typeof v === "string") {
		// Unit suffix: letters, %, °, or a currency symbol (\p{Sc}) — so "50%",
		// "5 pts", "2.5h", "5€", "10£" coerce, but a digit/dash suffix (date/semver) stays rejected.
		const m = /^\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*[\p{L}%°\p{Sc}]+\.?\s*$/u.exec(v);
		if (m) return Number(m[1]);
	}
	return NaN;
}

/**
 * Ordinal comparison for `<`, `>`, `<=`, `>=`. Date-like strings compare
 * lexically (which is chronological for `YYYY-MM-DD`); any other pair that both
 * coerce to numbers — including numeric-with-unit strings like `"50%"` or
 * `"5 pts"` via lenient `toNumber` — compare numerically; otherwise lexically.
 */
function compare(a: Value, b: Value): number {
	// A date() instance compares by ISO day, never by its toString() form
	// ("...T00:00:00.000Z"), so date(due) < "2026-06-01" orders correctly.
	if (a instanceof Date && b instanceof Date) {
		// Two date() instances keep full ms precision so same-day, different-time
		// values still order (day-granularity would wrongly call them equal).
		const ta = a.getTime();
		const tb = b.getTime();
		if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta === tb ? 0 : ta < tb ? -1 : 1;
	}
	if (a instanceof Date || b instanceof Date) {
		const da = isoDayNumber(a);
		const db = isoDayNumber(b);
		if (da !== null && db !== null) return da === db ? 0 : da < db ? -1 : 1;
	}
	if (!looksDateLike(a) && !looksDateLike(b)) {
		const na = toNumber(a);
		const nb = toNumber(b);
		if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb ? 0 : na < nb ? -1 : 1;
	}
	const sa = toStr(a);
	const sb = toStr(b);
	return sa === sb ? 0 : sa < sb ? -1 : 1;
}

/**
 * Equality for `==` / `!=`. Uses STRICT numeric coercion, so a numeric-leading
 * string that isn't wholly a number (an ISO date, a semver, `"50%"`) only matches
 * by exact string — two different dates or versions are never equal, and
 * `date == today` is date-accurate rather than "same year".
 */
function looseEquals(a: Value, b: Value): boolean {
	if (a === null || b === null) return a === b || (isEmpty(a) && isEmpty(b));
	// A date() instance never string-equals a plain ISO date; compare by day.
	if (a instanceof Date && b instanceof Date) {
		const ta = a.getTime();
		const tb = b.getTime();
		if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta === tb;
	}
	if (a instanceof Date || b instanceof Date) {
		const da = isoDayNumber(a);
		const db = isoDayNumber(b);
		if (da !== null && db !== null) return da === db;
	}
	const na = strictNumber(a);
	const nb = strictNumber(b);
	if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
	return toStr(a) === toStr(b);
}

type BuiltIn = (args: Value[]) => Value;

const BUILTINS: Record<string, BuiltIn> = {
	sum: (a) => numeric(a).reduce((s, n) => s + n, 0),
	avg: (a) => {
		const nums = numeric(a);
		return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
	},
	min: (a) => {
		const nums = numeric(a);
		return nums.length ? nums.reduce((m, n) => (n < m ? n : m)) : null;
	},
	max: (a) => {
		const nums = numeric(a);
		return nums.length ? nums.reduce((m, n) => (n > m ? n : m)) : null;
	},
	count: (a) => flatten(a).filter((v) => !isEmpty(v)).length,
	round: (a) => {
		const n = toNumber(a[0]);
		const rawDigits = a[1] !== undefined ? Math.floor(toNumber(a[1])) : 0;
		const digits = Number.isNaN(rawDigits) ? 0 : Math.min(100, Math.max(0, rawDigits));
		const f = Math.pow(10, digits);
		if (Number.isNaN(n)) return null;
		const r = Math.round(n * f) / f;
		return Number.isFinite(r) ? r : null;
	},
	floor: (a) => (Number.isNaN(toNumber(a[0])) ? null : Math.floor(toNumber(a[0]))),
	ceil: (a) => (Number.isNaN(toNumber(a[0])) ? null : Math.ceil(toNumber(a[0]))),
	abs: (a) => (Number.isNaN(toNumber(a[0])) ? null : Math.abs(toNumber(a[0]))),
	sqrt: (a) => {
		const n = toNumber(a[0]);
		return Number.isNaN(n) || n < 0 ? null : Math.sqrt(n);
	},
	length: (a) => {
		const v = a[0];
		if (Array.isArray(v)) return v.length;
		return toStr(v).length;
	},
	lower: (a) => toStr(a[0]).toLowerCase(),
	upper: (a) => toStr(a[0]).toUpperCase(),
	trim: (a) => toStr(a[0]).trim(),
	contains: (a) => {
		const hay = a[0];
		if (Array.isArray(hay)) return hay.some((x) => looseEquals(x, a[1]));
		return toStr(hay).toLowerCase().includes(toStr(a[1]).toLowerCase());
	},
	startswith: (a) => toStr(a[0]).toLowerCase().startsWith(toStr(a[1]).toLowerCase()),
	endswith: (a) => toStr(a[0]).toLowerCase().endsWith(toStr(a[1]).toLowerCase()),
	empty: (a) => isEmpty(a[0]),
	notempty: (a) => !isEmpty(a[0]),
	number: (a) => {
		const n = toNumber(a[0]);
		return Number.isNaN(n) ? null : n;
	},
	string: (a) => toStr(a[0]),
	concat: (a) => a.map(toStr).join(""),
	join: (a) => flatten([a[0]]).map(toStr).join(a[1] !== undefined ? toStr(a[1]) : ", "),
	default: (a) => (isEmpty(a[0]) ? a[1] ?? null : a[0]),
	list: (a) => a,
	date: (a) => {
		const d = new Date(toStr(a[0]));
		return Number.isNaN(d.getTime()) ? null : d;
	},
	datediff: (a) => {
		const d1 = new Date(toStr(a[0]));
		const d2 = new Date(toStr(a[1]));
		if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return null;
		return Math.round((d1.getTime() - d2.getTime()) / 86400000);
	},
	// today() → the LOCAL calendar date as an ISO `YYYY-MM-DD` string, so relative
	// filters/formulas/color-rules like `due < today()` work. Evaluated at eval time
	// (the compiled-expression cache holds the AST, not the value), so it stays current.
	today: () => {
		const d = new Date();
		const mm = String(d.getMonth() + 1).padStart(2, "0");
		const dd = String(d.getDate()).padStart(2, "0");
		return `${d.getFullYear()}-${mm}-${dd}`;
	},
};

function evalNode(node: Node, scope: EvalScope): Value {
	switch (node.t) {
		case "num":
			return node.v;
		case "str":
			return node.v;
		case "bool":
			return node.v;
		case "null":
			return null;
		case "ident": {
			const v = scope.get(node.name);
			return normalizeValue(v);
		}
		case "unary": {
			if (node.op === "!") return !toBool(evalNode(node.x, scope));
			// Strict (unit-tolerant) coercion. The old lenient parseFloat read
			// `-"2026-06-01"` as -2026 and `-"1.9.0"` as -1.9 — the same garbage the
			// 1.11 binary-operator rewrite fixed but never applied to unary minus.
			// arithNumber rejects dates/semvers yet keeps `-"5 pts"` = -5.
			const n = arithNumber(evalNode(node.x, scope));
			return Number.isNaN(n) ? null : -n;
		}
		case "ternary":
			return toBool(evalNode(node.c, scope)) ? evalNode(node.a, scope) : evalNode(node.b, scope);
		case "bin":
			return evalBinary(node, scope);
		case "call":
			return evalCall(node, scope);
	}
}

function evalBinary(node: Extract<Node, { t: "bin" }>, scope: EvalScope): Value {
	// Short-circuit logical operators.
	if (node.op === "&&") {
		return toBool(evalNode(node.a, scope)) ? toBool(evalNode(node.b, scope)) : false;
	}
	if (node.op === "||") {
		const a = evalNode(node.a, scope);
		return toBool(a) ? true : toBool(evalNode(node.b, scope));
	}

	const a = evalNode(node.a, scope);
	const b = evalNode(node.b, scope);
	switch (node.op) {
		case "==":
		case "===":
			return looseEquals(a, b);
		case "!=":
		case "!==":
			return !looseEquals(a, b);
		case "<":
			return compare(a, b) < 0;
		case "<=":
			return compare(a, b) <= 0;
		case ">":
			return compare(a, b) > 0;
		case ">=":
			return compare(a, b) >= 0;
		case "+": {
			// Date arithmetic FIRST: a Date operand's getTime() must never reach
			// strictNumber below, or `date(x) + 7` would add 7 milliseconds instead
			// of shifting 7 days. Only a REAL number operand shifts; a numeric STRING
			// still concatenates so composite keys like `due + sprintId` keep meaning.
			const da = isoDayNumber(a);
			const db = isoDayNumber(b);
			if (da !== null || db !== null) {
				if (da !== null && typeof b === "number") return Number.isInteger(b) ? isoFromDayNumber(da + b) : null;
				if (db !== null && typeof a === "number") return Number.isInteger(a) ? isoFromDayNumber(db + a) : null;
				// date + date, or date + non-number: no numeric meaning -> concat.
				return toStr(a) + toStr(b);
			}
			// Numeric add only when both sides are genuinely numeric, else concat.
			const na = strictNumber(a);
			const nb = strictNumber(b);
			if (!Number.isNaN(na) && !Number.isNaN(nb)) return na + nb;
			return toStr(a) + toStr(b);
		}
		case "-": {
			// Date math first: date − date = whole-day difference, date − N days = the
			// earlier date (N must be a real integer number). Everything else needs
			// both sides numeric via arithNumber — the old lenient parseFloat read
			// `"2026-06-01" - 7` as 2026−7 = 2019 and `"1.4.0" / 2` as 0.7, feeding
			// silent garbage into formulas and filters.
			const da = isoDayNumber(a);
			if (da !== null) {
				const db = isoDayNumber(b);
				if (db !== null) return da - db;
				if (typeof b === "number") return Number.isInteger(b) ? isoFromDayNumber(da - b) : null;
				return null;
			}
			return strictArith(a, b, (x, y) => x - y);
		}
		case "*":
			return strictArith(a, b, (x, y) => x * y);
		case "/":
			return strictArith(a, b, (x, y) => x / y);
		case "%":
			return strictArith(a, b, (x, y) => x % y);
	}
	return null;
}

function evalCall(node: Extract<Node, { t: "call" }>, scope: EvalScope): Value {
	const name = node.name.toLowerCase();
	// `if` and `prop` are special forms.
	if (name === "if") {
		return toBool(evalNode(node.args[0], scope))
			? evalNode(node.args[1], scope)
			: node.args[2] !== undefined
				? evalNode(node.args[2], scope)
				: null;
	}
	if (name === "prop") {
		const key = toStr(evalNode(node.args[0], scope));
		return normalizeValue(scope.get(key));
	}
	const fn = BUILTINS[name];
	if (!fn) throw new ExprError(`Unknown function '${node.name}'`);
	const args = node.args.map((a) => evalNode(a, scope));
	return fn(args);
}

function safeArith(n: number): Value {
	return Number.isFinite(n) ? n : null;
}

/** Arithmetic coercion: null unless both sides are numeric via arithNumber
 * (strict, but tolerant of a pure unit suffix like `"60%"`). Division by zero /
 * NaN / Infinity all collapse to null via safeArith. */
function strictArith(a: Value, b: Value, op: (x: number, y: number) => number): Value {
	const na = arithNumber(a);
	const nb = arithNumber(b);
	if (Number.isNaN(na) || Number.isNaN(nb)) return null;
	return safeArith(op(na, nb));
}

function normalizeValue(v: unknown): Value {
	if (v === undefined) return null;
	if (v === null || typeof v === "number" || typeof v === "string" || typeof v === "boolean") {
		return v;
	}
	if (v instanceof Date) return v;
	if (Array.isArray(v)) return v.map(normalizeValue);
	// Objects (e.g. nested frontmatter) collapse to their string form.
	return toStr(v);
}

// ---- Public API + cache ----------------------------------------------------

const CACHE = new Map<string, CompiledExpression>();

export function compileExpression(source: string): CompiledExpression {
	const cached = CACHE.get(source);
	if (cached) return cached;
	const ast = new Parser(tokenize(source)).parse();
	const compiled: CompiledExpression = {
		source,
		eval(scope: EvalScope): Value {
			return evalNode(ast, scope);
		},
	};
	if (CACHE.size > 500) CACHE.clear();
	CACHE.set(source, compiled);
	return compiled;
}

/** Evaluate `source` against `scope`, returning `null` on any parse/eval error. */
export function evaluateSafe(source: string, scope: EvalScope): Value {
	try {
		return compileExpression(source).eval(scope);
	} catch {
		return null;
	}
}

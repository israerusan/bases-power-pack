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
			tokens.push({ type: "num", value: src.slice(i, j), pos: i });
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
	if (typeof v === "string") return v.length > 0 && v.toLowerCase() !== "false";
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
		.map(toNumber)
		.filter((n) => !Number.isNaN(n));
}

/** A string that starts with an ISO date — compared lexically, never by number. */
function looksDateLike(v: Value): boolean {
	return typeof v === "string" && /^\s*\d{4}-\d{2}-\d{2}/.test(v);
}

/**
 * Ordinal comparison for `<`, `>`, `<=`, `>=`. Date-like strings compare
 * lexically (which is chronological for `YYYY-MM-DD`); any other pair that both
 * coerce to numbers — including numeric-with-unit strings like `"50%"` or
 * `"5 pts"` via lenient `toNumber` — compare numerically; otherwise lexically.
 */
function compare(a: Value, b: Value): number {
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
		return nums.length ? Math.min(...nums) : null;
	},
	max: (a) => {
		const nums = numeric(a);
		return nums.length ? Math.max(...nums) : null;
	},
	count: (a) => flatten(a).filter((v) => !isEmpty(v)).length,
	round: (a) => {
		const n = toNumber(a[0]);
		const digits = a[1] !== undefined ? Math.max(0, Math.floor(toNumber(a[1]))) : 0;
		const f = Math.pow(10, digits);
		return Number.isNaN(n) ? null : Math.round(n * f) / f;
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
			const n = toNumber(evalNode(node.x, scope));
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
			// Numeric add only when both sides are genuinely numeric, else string
			// concat — so `"2026-01-01" + x` concatenates instead of adding 2026.
			const na = strictNumber(a);
			const nb = strictNumber(b);
			if (!Number.isNaN(na) && !Number.isNaN(nb)) return na + nb;
			return toStr(a) + toStr(b);
		}
		case "-":
			return safeArith(toNumber(a) - toNumber(b));
		case "*":
			return safeArith(toNumber(a) * toNumber(b));
		case "/": {
			const d = toNumber(b);
			return d === 0 ? null : safeArith(toNumber(a) / d);
		}
		case "%": {
			const d = toNumber(b);
			return d === 0 ? null : safeArith(toNumber(a) % d);
		}
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

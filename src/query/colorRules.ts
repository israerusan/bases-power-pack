import { evaluateSafe, toBool, type Value } from "../engine/expression";
import type { Row } from "../model/row";

/**
 * Rule-based color coding (premium). Each rule pairs a boolean expression — the
 * same engine that powers formulas, roll-ups, and saved filters — with a color.
 * The first rule whose expression is truthy for a row wins, so ordering encodes
 * priority (put the most specific / most urgent rule first). Pure and DOM-free so
 * the whole row→color decision is unit-tested; the views only apply the result.
 */
export interface ColorRule {
	id: string;
	/** Human label shown in the settings editor and the card's title tooltip. */
	label: string;
	/** A boolean expression evaluated per row (e.g. `due < today()`, `priority == "high"`). */
	expression: string;
	/** A validated CSS color (hex / rgb() / hsl() / var() / named keyword), or "". */
	color: string;
}

export interface ResolvedColor {
	color: string;
	/** The user's label (may be empty — the view shows a tooltip only when set). */
	label: string;
	ruleId: string;
}

/** The CSS named colors (Color Module 4) plus the two color keywords — the exact
 * allow-list for the keyword branch of sanitizeColor, so a typo like "reed" is
 * rejected instead of silently producing an invalid custom-property value. */
const NAMED_COLORS = new Set<string>([
	"transparent", "currentcolor", "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige",
	"bisque", "black", "blanchedalmond", "blue", "blueviolet", "brown", "burlywood", "cadetblue",
	"chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk", "crimson", "cyan", "darkblue",
	"darkcyan", "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki", "darkmagenta",
	"darkolivegreen", "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen",
	"darkslateblue", "darkslategray", "darkslategrey", "darkturquoise", "darkviolet", "deeppink",
	"deepskyblue", "dimgray", "dimgrey", "dodgerblue", "firebrick", "floralwhite", "forestgreen",
	"fuchsia", "gainsboro", "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow", "grey",
	"honeydew", "hotpink", "indianred", "indigo", "ivory", "khaki", "lavender", "lavenderblush",
	"lawngreen", "lemonchiffon", "lightblue", "lightcoral", "lightcyan", "lightgoldenrodyellow",
	"lightgray", "lightgreen", "lightgrey", "lightpink", "lightsalmon", "lightseagreen",
	"lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue", "lightyellow", "lime",
	"limegreen", "linen", "magenta", "maroon", "mediumaquamarine", "mediumblue", "mediumorchid",
	"mediumpurple", "mediumseagreen", "mediumslateblue", "mediumspringgreen", "mediumturquoise",
	"mediumvioletred", "midnightblue", "mintcream", "mistyrose", "moccasin", "navajowhite", "navy",
	"oldlace", "olive", "olivedrab", "orange", "orangered", "orchid", "palegoldenrod", "palegreen",
	"paleturquoise", "palevioletred", "papayawhip", "peachpuff", "peru", "pink", "plum", "powderblue",
	"purple", "rebeccapurple", "red", "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown",
	"seagreen", "seashell", "sienna", "silver", "skyblue", "slateblue", "slategray", "slategrey",
	"snow", "springgreen", "steelblue", "tan", "teal", "thistle", "tomato", "turquoise", "violet",
	"wheat", "white", "whitesmoke", "yellow", "yellowgreen",
]);

const HEX_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
// rgb()/hsl() — allow letters too (angle units deg/turn/rad/grad, the `none`
// keyword, `e` exponents) so valid Color-4 values like hsl(120deg 50% 50%) pass;
// injection vectors (`;`, `{`, `url(`) contain characters outside this class.
const FUNC_RE = /^(?:rgb|rgba|hsl|hsla)\([a-zA-Z0-9\s.,%/]+\)$/;
const VAR_RE = /^var\(--[\w-]+\)$/;

/**
 * A color string safe to hand to `style.setProperty("--bpp-rule-color", …)`: a
 * hex, an rgb()/hsl() function, a `var(--…)`, or a real CSS named color. Anything
 * else (a keyword typo like "reed", or a string containing `;`/`{`/`url(`) → "".
 */
export function sanitizeColor(color: unknown): string {
	const c = typeof color === "string" ? color.trim() : "";
	if (!c) return "";
	if (HEX_RE.test(c) || FUNC_RE.test(c) || VAR_RE.test(c)) return c;
	if (/^[a-zA-Z]+$/.test(c) && NAMED_COLORS.has(c.toLowerCase())) return c;
	return "";
}

/**
 * The first rule whose expression is truthy for `row`, or null when none match.
 * A rule with an empty expression or empty color is inert (skipped). An invalid
 * or throwing expression is skipped, never surfaced — evaluateSafe returns null,
 * which toBool reads as false.
 */
export function resolveRowColor(row: Row, rules: ColorRule[]): ResolvedColor | null {
	for (const rule of rules) {
		const expr = rule.expression.trim();
		const color = sanitizeColor(rule.color);
		if (!expr || !color) continue;
		const value: Value = evaluateSafe(expr, row.scope);
		if (toBool(value)) {
			return { color, label: rule.label.trim(), ruleId: rule.id };
		}
	}
	return null;
}

/**
 * Coerce a persisted `colorRules` value into a clean ColorRule[]: drop non-object
 * entries, string-coerce every field, sanitize the color, and give every rule a
 * UNIQUE id (a back-filled or duplicate id would let the settings editor's
 * delete-by-id remove several rules at once). A rule is KEPT even with an empty
 * expression/color — a partially-configured rule must survive a reload while it's
 * being authored, mirroring saved filters and roll-ups (it's simply inert until
 * completed, per resolveRowColor above).
 */
export function normalizeColorRules(raw: unknown): ColorRule[] {
	if (!Array.isArray(raw)) return [];
	const out: ColorRule[] = [];
	const seen = new Set<string>();
	let n = 0;
	for (const item of raw) {
		if (!item || typeof item !== "object") continue;
		const r = item as Record<string, unknown>;
		let id = typeof r.id === "string" && r.id ? r.id : "";
		if (!id || seen.has(id)) {
			do {
				id = `rule-${++n}`;
			} while (seen.has(id));
		}
		seen.add(id);
		out.push({
			id,
			label: typeof r.label === "string" ? r.label : "",
			expression: typeof r.expression === "string" ? r.expression : "",
			color: sanitizeColor(r.color),
		});
	}
	return out;
}

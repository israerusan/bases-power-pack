import assert from "assert";
import fs from "fs";
import os from "os";
import path from "path";
import { build } from "esbuild";

const root = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1"));
const outfile = path.join(os.tmpdir(), `bpp-engine-${Date.now()}.mjs`);

await build({
	stdin: {
		contents: `
			export * as expr from "./src/engine/expression.ts";
			export * as filter from "./src/query/filter.ts";
			export * as rollup from "./src/query/rollup.ts";
			export * as gantt from "./src/query/gantt.ts";
			export * as dates from "./src/query/dates.ts";
			export * as inlineEdit from "./src/query/inlineEdit.ts";
			export * as automation from "./src/query/automation.ts";
			export * as undo from "./src/query/undo.ts";
			export * as search from "./src/query/search.ts";
			export * as wip from "./src/query/wip.ts";
			export * as hierarchy from "./src/query/hierarchy.ts";
			export * as kanban from "./src/query/kanban.ts";
			export * as colorRules from "./src/query/colorRules.ts";
			export * as pivot from "./src/query/pivot.ts";
			export * as dashboard from "./src/query/dashboard.ts";
			export * as gallery from "./src/query/gallery.ts";
			export * as ranking from "./src/query/ranking.ts";
			export * as exporter from "./src/query/export.ts";
			export * as feed from "./src/query/feed.ts";
			export * as kanbanActions from "./src/query/kanbanActions.ts";
			export * as base from "./src/bases/baseDefinition.ts";
			export * as resolve from "./src/bases/resolveRows.ts";
			export * as rowmod from "./src/model/row.ts";
		`,
		resolveDir: root,
		loader: "ts",
	},
	bundle: true,
	platform: "node",
	format: "esm",
	target: "es2018",
	outfile,
});

const m = await import(`file://${outfile.replace(/\\/g, "/")}`);
const { expr, filter, rollup, gantt, dates, inlineEdit, automation, undo, search, wip, hierarchy, kanban, colorRules, pivot, dashboard, gallery, ranking, exporter, feed, kanbanActions, base, resolve, rowmod } = m;

/** Build a Row-like object with the given frontmatter/name for the pure engines. */
function makeTestRow(name, fm) {
	const data = { "file.name": name, "file.path": `${name}.md`, ...fm };
	return { id: `${name}.md`, name, note: { frontmatter: fm }, scope: { get: (k) => (k in data ? data[k] : undefined) } };
}

// ---- expression engine -----------------------------------------------------
const scope = {
	get(name) {
		const data = {
			done: 3,
			total: 4,
			status: "active",
			hours: 2.5,
			tags: ["a", "b"],
			"file.name": "Note A",
				jan: "2026-01-01",
				jun: "2026-06-01",
				ver: "1.9.0",
				pct: "50%",
				eur: "5€",
				big: 1e308,
		};
		return name in data ? data[name] : undefined;
	},
};
const ev = (s) => expr.compileExpression(s).eval(scope);

assert.equal(ev("1 + 2 * 3"), 7, "precedence");
assert.equal(ev("(1 + 2) * 3"), 9, "parens");
assert.equal(ev("done / total"), 0.75, "property division");
assert.equal(ev("done / 0"), null, "divide by zero is null");
assert.equal(ev("round(done / total * 100, 1)"), 75, "round()");
assert.equal(ev('status == "active"'), true, "string equality");
assert.equal(ev('status == "done"'), false, "string inequality");
assert.equal(ev("done > 2 && total >= 4"), true, "logical and");
assert.equal(ev("done > 5 || total == 4"), true, "logical or short-circuit");
assert.equal(ev('if(done >= total, "full", "partial")'), "partial", "if()");
assert.equal(ev('"x" + status'), "xactive", "string concat via +");
assert.equal(ev("sum(done, total, hours)"), 9.5, "sum()");
assert.equal(ev("contains(tags, \"a\")"), true, "contains() on array");
assert.equal(ev('contains(status, "TIV")'), true, "contains() substring case-insensitive");
assert.equal(ev("empty(missing)"), true, "empty() on missing");
assert.equal(ev('default(missing, "fallback")'), "fallback", "default()");
assert.equal(ev('prop("file.name")'), "Note A", "prop() escape hatch");
assert.equal(ev("!false"), true, "unary not");
assert.equal(ev("-hours"), -2.5, "unary minus");
// Unknown function throws, but evaluateSafe swallows it.
assert.equal(expr.evaluateSafe("bogusfn(1)", scope), null, "evaluateSafe swallows errors");

// ISO dates / versions are numeric-LEADING strings: they must NOT collapse to the
// leading number (parseFloat("2026-06-01")===parseFloat("2026-01-01")). Compare lexically.
assert.equal(ev("jan == jun"), false, "two different ISO dates are not equal");
assert.equal(ev("jan < jun"), true, "ISO date ordering is chronological (Jan < Jun)");
assert.equal(ev("jun > jan"), true, "ISO date ordering is chronological (Jun > Jan)");
assert.equal(ev('jun >= "2026-06-01"'), true, "date >= its own value");
assert.equal(ev('jan >= "2026-06-01"'), false, "an earlier date is NOT >= a later one");
assert.equal(ev('ver == "1.9.0"'), true, "version string compares as a whole, not as 1.9");
assert.equal(ev('ver == "1.90"'), false, "version 1.9.0 is not equal to 1.90");
assert.equal(ev("done == 3"), true, "genuine numbers still compare numerically");
assert.equal(ev('total > "3"'), true, "a wholly-numeric string still coerces for compare");
// Numeric-with-unit strings (the plugin's own `…+"%"` card formula) must still
// ORDER numerically, even though they aren't wholly numeric.
assert.equal(ev("pct > 9"), true, '"50%" orders numerically: 50 > 9');
assert.equal(ev("pct < 60"), true, '"50%" orders numerically: 50 < 60');
assert.equal(ev('pct == "50%"'), true, '"50%" still equals itself by exact string');
assert.equal(ev('pct == 50'), false, '"50%" is not equal to the number 50 (strict equality)');
assert.ok(Number.isNaN(expr.strictNumber("2026-01-01")), "strictNumber rejects a numeric-leading date string");
assert.equal(expr.strictNumber("42"), 42, "strictNumber accepts a wholly-numeric string");
assert.equal(expr.strictNumber("  7.5 "), 7.5, "strictNumber trims and parses");
assert.ok(Number.isNaN(expr.strictNumber("3px")), "strictNumber rejects a trailing-unit string");

// 1.11: -, *, /, % reject dates/semvers (the unfinished half of the 1.10 date
// fix): the old lenient parseFloat computed `jun - 7` as 2026-7=2019 and
// `ver / 2` as 0.7. Date arithmetic is explicit; unit strings still coerce.
assert.equal(ev("jun - 7"), "2026-05-25", "date - N days = the earlier date, not 2019");
assert.equal(ev("jun + 7"), "2026-06-08", "date + N days = the later date, not concat garbage");
assert.equal(ev("7 + jun"), "2026-06-08", "N + date also shifts");
assert.equal(ev("jun - jan"), 151, "date - date = whole-day difference");
assert.equal(ev("ver / 2"), null, "a semver never divides by its leading number");
assert.equal(ev("ver - 1"), null, "a semver never subtracts by its leading number");
assert.equal(ev("jun * 2"), null, "a date is never multiplied");
assert.equal(ev("jun - 1.5"), null, "date minus a fractional day is rejected, not rounded");
assert.equal(ev("done - 1"), 2, "genuine numbers still subtract");
assert.equal(ev("hours * 2"), 5, "genuine numbers still multiply");
assert.equal(ev('total % 3'), 1, "genuine numbers still take a modulo");
assert.equal(ev("done % 0"), null, "modulo by zero is null");
assert.equal(ev('"5" - "2"'), 3, "wholly-numeric strings still subtract");
// A Date instance from date() is a first-class date operand (regression guard:
// a Date's getTime() must NOT be misread as a day count → "NaN-NaN-NaN").
assert.equal(ev("date(jun) - 7"), "2026-05-25", "a date() instance shifts like a date string");
assert.equal(ev("date(jun) - jan"), 151, "date() instance minus a date string = day diff");
assert.equal(ev("date(jun) - date(jan)"), 151, "two date() instances = day diff");
// Numeric-with-unit strings still coerce for arithmetic (parity with compare()
// and roll-ups) — the plugin's own `…+"%"` outputs must keep working downstream.
assert.equal(ev("pct * 2"), 100, '"50%" multiplies as 50 (unit tolerated for arithmetic)');
assert.equal(ev("pct - 10"), 40, '"50%" subtracts as 50');
// But + still concatenates a numeric STRING onto a date (1.10 composite keys).
assert.equal(ev('jun + "3"'), "2026-06-013", "date + numeric STRING concatenates, does not shift");
assert.throws(() => expr.compileExpression("1.2.3"), expr.ExprError, "a multi-dot number literal throws at parse");
assert.equal(expr.evaluateSafe("1.2.3 + 1", scope), null, "evaluateSafe swallows the malformed-number error");
// A lone trailing dot was valid in 1.10 (Number("2.")===2) — must not throw.
assert.equal(ev("hours / 2."), 1.25, "a trailing-dot literal still parses");
assert.equal(ev("2."), 2, "a bare trailing-dot literal is 2");

// 1.12 correctness fixes -----------------------------------------------------
// A Date instance is a first-class date on BOTH + and - (the + case used to run
// strictNumber first, so date(x)+7 added 7 milliseconds → a ~1.78e12 epoch number).
assert.equal(ev("date(jun) + 7"), "2026-06-08", "date() instance + N shifts days, not milliseconds");
assert.equal(ev("7 + date(jun)"), "2026-06-08", "N + date() instance also shifts days");
// A date() instance equals / orders against its ISO day, not its toISOString() form
// ("...T00:00:00.000Z") — so date(due) == today is date-accurate, not always false.
assert.equal(ev("date(jun) == jun"), true, "a date() instance equals its own ISO date string");
assert.equal(ev("date(jun) == date(jun)"), true, "two equal date() instances are equal");
assert.equal(ev("date(jan) == jun"), false, "different date() instance and date are not equal");
assert.equal(ev("date(jan) < date(jun)"), true, "two date() instances order chronologically");
assert.equal(ev("date(jan) < jun"), true, "a date() instance orders against a date string");
// Unary minus now uses strict (unit-tolerant) coercion — the old parseFloat read
// -"2026-06-01" as -2026 and -"1.9.0" as -1.9.
assert.equal(ev("-jun"), null, "unary minus on an ISO date is null, not -2026");
assert.equal(ev("-ver"), null, "unary minus on a semver is null, not -1.9");
assert.equal(ev("-pct"), -50, "unary minus tolerates a unit suffix: -'50%' = -50");
// round() no longer overflows to a raw NaN for a huge digit count.
assert.equal(ev("round(hours, 500)"), 2.5, "round() with an absurd digit count is finite, not NaN");
assert.equal(ev("round(done / total, 500)"), 0.75, "round() caps digits instead of returning NaN");
// min/max builtins: reduce (no unbounded spread) + strict coercion excludes dates.
assert.equal(ev("min(done, total, hours)"), 2.5, "min() builtin");
assert.equal(ev("max(done, total, hours)"), 4, "max() builtin");
assert.equal(ev("min(jan, jun)"), null, "min() over ISO-date args excludes them (no year-as-number)");
assert.equal(ev("avg(done, total)"), 3.5, "avg() builtin");
assert.equal(ev("floor(hours)"), 2, "floor() builtin");
assert.equal(ev("ceil(hours)"), 3, "ceil() builtin");
assert.equal(ev("abs(-hours)"), 2.5, "abs() builtin");
assert.equal(ev("length(tags)"), 2, "length() over an array");
assert.equal(ev('upper(status)'), "ACTIVE", "upper() builtin");
assert.equal(ev('datediff(jun, jan)'), 151, "datediff() builtin = whole-day difference");
assert.equal(ev('datediff("2026-06-01", "2026-01-01")'), 151, "datediff() over literal ISO strings");
// toBool: canonical falsy strings so a frontmatter `done: "0"`/"no"/"off" reads false.
assert.equal(expr.toBool("0"), false, 'toBool("0") is false');
assert.equal(expr.toBool("no"), false, 'toBool("no") is false');
assert.equal(expr.toBool(" OFF "), false, 'toBool trims + lowercases before matching "off"');
assert.equal(expr.toBool("false"), false, 'toBool("false") is false');
assert.equal(expr.toBool("todo"), true, 'toBool("todo") is true');
assert.equal(expr.toBool("1"), true, 'toBool("1") is true');
assert.equal(expr.toBool("   "), false, "a whitespace-only string is falsy after trim");
assert.equal(expr.toBool(""), false, "an empty string is falsy");

// Round-1 adversarial follow-ups: a Date INSTANCE (not just a date string) must be
// non-numeric for arithmetic/aggregation — arithNumber/strictNumber used to leak its
// getTime() (epoch ms) into unary minus, *, and roll-ups.
assert.equal(ev("-date(jun)"), null, "unary minus on a date() instance is null, not -epoch-ms");
assert.equal(ev("date(jun) * 2"), null, "a date() instance is never multiplied");
assert.equal(ev("min(date(jan), date(jun))"), null, "min() excludes date() instances (not epoch ms)");
assert.equal(ev("sum(date(jan), done)"), 3, "sum() over a mixed date()+number set counts only the number");
// Two date() instances keep full ms precision so intra-day order survives (a
// day-granularity collapse wrongly called same-day different-time values equal).
assert.equal(ev('date("2026-06-01T09:00") < date("2026-06-01T17:00")'), true, "same-day earlier time sorts first");
assert.equal(ev('date("2026-06-01T17:00") > date("2026-06-01T09:00")'), true, "same-day later time sorts after");
assert.equal(ev('date("2026-06-01T09:00") == date("2026-06-01T17:00")'), false, "different times on a day are not equal");
assert.equal(ev('date("2026-06-01T09:00") == date("2026-06-01T09:00")'), true, "identical datetimes are equal");
// Currency-suffix values still coerce for arithmetic/aggregation (were dropped when
// numeric() switched from lenient parseFloat to arithNumber).
assert.equal(ev("eur * 2"), 10, '"5€" coerces to 5 for arithmetic');
assert.equal(ev("sum(eur, done)"), 8, "sum() includes a currency-suffix value (5 + 3)");
// round(): a non-numeric digits arg falls back to 0 places; a genuine overflow → null.
assert.equal(ev('round(hours, "x")'), 3, "round() with a non-numeric digits arg rounds to 0 places, not null");
assert.equal(ev("round(big, 10)"), null, "round() returns null (not Infinity) on a real overflow");
// today() builtin (enables relative color-rules/filters like `due < today()`).
assert.match(ev("today()"), /^\d{4}-\d{2}-\d{2}$/, "today() returns an ISO date string");
assert.equal(ev('today() > "2000-01-01"'), true, "today() orders as a real date");
assert.equal(ev("today() == today()"), true, "today() is stable within one evaluation");

// ---- row + formulas --------------------------------------------------------
const note = {
	path: "Projects/Alpha.md",
	name: "Alpha",
	folder: "Projects",
	ext: "md",
	tags: ["project"],
	ctime: 0,
	mtime: 0,
	size: 100,
	frontmatter: { done: 3, total: 4, status: "active" },
};
const formulas = { progress: "round(done / total * 100, 0)", cycle: "cycle + 1" };
const r = rowmod.makeRow(note, formulas);
assert.equal(r.scope.get("progress"), 75, "formula computed via scope");
assert.equal(r.scope.get("file.folder"), "Projects", "file.* prop");
assert.doesNotThrow(() => r.scope.get("cycle"), "self-referential formula must not overflow the stack");

// ---- filter ----------------------------------------------------------------
assert.equal(filter.evaluateFilter('status == "active"', r.scope), true, "string filter");
assert.equal(filter.evaluateFilter(null, r.scope), true, "empty filter passes");
assert.equal(
	filter.evaluateFilter({ and: ['status == "active"', "progress >= 50"] }, r.scope),
	true,
	"and filter"
);
assert.equal(filter.evaluateFilter({ or: ['status == "done"', "progress > 90"] }, r.scope), false, "or filter");
assert.equal(filter.evaluateFilter({ not: 'status == "done"' }, r.scope), true, "not filter");
assert.equal(filter.evaluateFilter(['status == "active"', "done < total"], r.scope), true, "implicit-and array");
// An empty combinator is "no constraint" (true), not a board-blanking false.
assert.equal(filter.evaluateFilter({ or: [] }, r.scope), true, "empty {or:[]} shows every row, not none");
assert.equal(filter.evaluateFilter({ and: [] }, r.scope), true, "empty {and:[]} shows every row");

// ---- base definition + resolveRows ----------------------------------------
const def = base.normalizeBaseDefinition({
	filters: 'status != "archived"',
	formulas: { progress: "round(done / total * 100, 0)" },
	views: [{ type: "table", name: "All", groupBy: "status" }],
});
assert.equal(def.formulas.progress, "round(done / total * 100, 0)", "formula normalized");
assert.equal(def.views[0].group, "status", "groupBy normalized to group");

const notes = [
	note,
	{ ...note, path: "B.md", name: "B", frontmatter: { done: 1, total: 2, status: "archived" } },
	{ ...note, path: "C.md", name: "C", frontmatter: { done: 4, total: 4, status: "done" } },
];
const resolved = resolve.resolveRows(notes, def);
assert.equal(resolved.length, 2, "archived filtered out by base filter");
const withExtra = resolve.resolveRows(notes, def, "progress == 100");
assert.equal(withExtra.length, 1, "extra saved-filter narrows to C");
assert.equal(withExtra[0].name, "C", "correct row survives");

// ---- rollups ---------------------------------------------------------------
const rollupRows = resolve.resolveRows(notes, def);
assert.equal(rollup.computeRollup({ id: "1", label: "Count", expression: "1", aggregation: "count" }, rollupRows), "2");
assert.equal(
	rollup.computeRollup({ id: "2", label: "Total done", expression: "done", aggregation: "sum" }, rollupRows),
	"7",
	"sum of done (3 + 4)"
);
assert.equal(
	rollup.computeRollup({ id: "3", label: "Avg progress", expression: "progress", aggregation: "avg" }, rollupRows),
	"87.5",
	"avg progress (75 + 100)/2"
);
assert.equal(
	rollup.computeRollup({ id: "4", label: "Statuses", expression: "status", aggregation: "unique" }, rollupRows),
	"2",
	"unique statuses"
);
// A roll-up over an ISO-date column must not aggregate by the leading year: summing
// ["2026-01-01","2026-06-01"] used to yield 4052 (year+year) via lenient toNumber.
const dateRows = [
	rowmod.makeRow({ ...note, path: "D1.md", frontmatter: { start: "2026-01-01" } }, {}),
	rowmod.makeRow({ ...note, path: "D2.md", frontmatter: { start: "2026-06-01" } }, {}),
];
assert.equal(
	rollup.computeRollup({ id: "d1", label: "Sum start", expression: "start", aggregation: "sum" }, dateRows),
	"0",
	"sum over a date column excludes the dates (not 4052)"
);
assert.equal(
	rollup.computeRollup({ id: "d2", label: "Min start", expression: "start", aggregation: "min" }, dateRows),
	"—",
	"min over a date column has no numeric members"
);
assert.equal(
	rollup.computeRollup({ id: "d3", label: "Range start", expression: "start", aggregation: "range" }, dateRows),
	"—",
	"range over a date column has no numeric members"
);
// A rollup whose expression yields a Date INSTANCE (via date()) is excluded too,
// not aggregated as epoch milliseconds.
assert.equal(
	rollup.computeRollup({ id: "d4", label: "Sum date()", expression: "date(start)", aggregation: "sum" }, dateRows),
	"0",
	"sum over date() instances excludes them (not epoch-ms garbage)"
);
assert.equal(
	rollup.computeRollup({ id: "d5", label: "Max date()", expression: "date(start)", aggregation: "max" }, dateRows),
	"—",
	"max over date() instances has no numeric members"
);

// ---- color rules ------------------------------------------------------------
const crRows = [
	rowmod.makeRow({ ...note, path: "CR1.md", frontmatter: { priority: "high", due: "2020-01-01" } }, {}),
	rowmod.makeRow({ ...note, path: "CR2.md", frontmatter: { priority: "low", due: "2099-01-01" } }, {}),
];
const colorRuleSet = [
	{ id: "a", label: "Overdue", expression: 'due < "2026-07-17"', color: "#ff0000" },
	{ id: "b", label: "High priority", expression: 'priority == "high"', color: "#ffaa00" },
];
// First matching rule wins even when a later rule also matches (ordering = priority).
assert.deepEqual(
	colorRules.resolveRowColor(crRows[0], colorRuleSet),
	{ color: "#ff0000", label: "Overdue", ruleId: "a" },
	"first matching rule wins (overdue before high-priority)"
);
assert.equal(colorRules.resolveRowColor(crRows[1], colorRuleSet), null, "no rule matches → null");
// An invalid / throwing expression is skipped, never surfaced.
assert.equal(
	colorRules.resolveRowColor(crRows[0], [{ id: "x", label: "", expression: "bogusfn(", color: "#fff" }]),
	null,
	"an unparseable expression is skipped, not thrown"
);
// A rule with an unsafe/empty color is ignored even if its expression matches.
assert.equal(
	colorRules.resolveRowColor(crRows[0], [{ id: "x", label: "", expression: "priority == \"high\"", color: "url(evil)" }]),
	null,
	"a rule with an unsafe color is skipped"
);
// sanitizeColor allow-list.
assert.equal(colorRules.sanitizeColor("#ff0000"), "#ff0000", "hex passes");
assert.equal(colorRules.sanitizeColor("#abc"), "#abc", "short hex passes");
assert.equal(colorRules.sanitizeColor("rgb(1, 2, 3)"), "rgb(1, 2, 3)", "rgb() passes");
assert.equal(colorRules.sanitizeColor("hsl(200 50% 50%)"), "hsl(200 50% 50%)", "hsl() passes");
assert.equal(colorRules.sanitizeColor("hsl(120deg, 50%, 50%)"), "hsl(120deg, 50%, 50%)", "hsl() with an angle unit passes");
assert.equal(colorRules.sanitizeColor("var(--my-accent)"), "var(--my-accent)", "var() passes");
assert.equal(colorRules.sanitizeColor("tomato"), "tomato", "a real named color passes");
assert.equal(colorRules.sanitizeColor("reed"), "", "a keyword TYPO (not a real named color) is rejected");
assert.equal(colorRules.sanitizeColor("url(x)"), "", "url() is rejected");
assert.equal(colorRules.sanitizeColor("red; background:url()"), "", "a CSS-injection string is rejected");
assert.equal(colorRules.sanitizeColor(""), "", "empty is rejected");
assert.equal(colorRules.sanitizeColor(123), "", "a non-string is rejected");
// normalizeColorRules KEEPS partially-configured rules (mirrors saved filters /
// roll-ups) so a rule being authored survives a reload; it only drops non-objects
// and sanitizes each color to "" when unsafe. Every id is made UNIQUE.
assert.deepEqual(
	colorRules.normalizeColorRules([
		{ expression: "a == 1", color: "#fff", label: "L" },
		{ expression: "", color: "#fff" },
		{ expression: "b == 2", color: "url(x)" },
		"garbage",
		{ expression: "c == 3", color: "#123456" },
	]),
	[
		{ id: "rule-1", label: "L", expression: "a == 1", color: "#fff" },
		{ id: "rule-2", label: "", expression: "", color: "#fff" },
		{ id: "rule-3", label: "", expression: "b == 2", color: "" },
		{ id: "rule-4", label: "", expression: "c == 3", color: "#123456" },
	],
	"normalizeColorRules keeps every object entry (inert until completed), sanitizes colors"
);
// Ids are de-duplicated so the settings delete-by-id can't remove several at once.
assert.deepEqual(
	colorRules.normalizeColorRules([
		{ id: "rule-1", expression: "a", color: "#fff" },
		{ expression: "b", color: "#000" },
	]).map((r) => r.id),
	["rule-1", "rule-2"],
	"a back-filled id never collides with an explicit one"
);
assert.deepEqual(
	colorRules.normalizeColorRules([
		{ id: "dup", expression: "a", color: "#fff" },
		{ id: "dup", expression: "b", color: "#000" },
	]).map((r) => r.id),
	["dup", "rule-1"],
	"duplicate explicit ids are made unique"
);
assert.deepEqual(colorRules.normalizeColorRules("nope"), [], "non-array normalizes to []");

// ---- gantt -----------------------------------------------------------------
assert.equal(gantt.toDayNumber("2026-01-01"), Math.floor(Date.UTC(2026, 0, 1) / 86400000), "toDayNumber utc");
assert.equal(gantt.toDayNumber("not a date"), null, "toDayNumber invalid");
const model = gantt.buildGantt([
	{ id: "a", name: "A", start: "2026-01-01", end: "2026-01-03" },
	{ id: "b", name: "B", start: "2026-01-02", end: null },
	{ id: "c", name: "C", start: null, end: "2026-01-05" },
]);
assert.equal(model.skipped, 1, "row without start skipped");
assert.equal(model.days.length, 3, "axis spans Jan 1..3");
const barA = model.bars.find((b) => b.id === "a");
const barB = model.bars.find((b) => b.id === "b");
assert.equal(barA.startIndex, 0, "A starts at column 0");
assert.equal(barA.span, 3, "A spans 3 days");
assert.equal(barB.startIndex, 1, "B starts at column 1");
assert.equal(barB.span, 1, "B has default 1-day span");

// A bar starting past the clamped axis must be SKIPPED, not placed thousands of px
// off the track. With maxDays=3, only Jan 1..3 fit; the far-future bar is dropped.
const clamped = gantt.buildGantt(
	[
		{ id: "near", name: "Near", start: "2026-01-01", end: "2026-01-02" },
		{ id: "far", name: "Far", start: "2030-01-01", end: "2030-01-02" },
	],
	1,
	3
);
assert.equal(clamped.bars.length, 1, "only the in-axis bar is placed");
assert.equal(clamped.bars[0].id, "near", "the far-future bar is not rendered");
assert.equal(clamped.offAxis, 1, "the far-future bar is counted as off-axis (valid date, out of range)");
assert.equal(clamped.skipped, 0, "off-axis bars are NOT counted as no-date skips");
assert.ok(
	clamped.bars.every((b) => b.startIndex >= 0 && b.startIndex < clamped.days.length),
	"every placed bar starts within the axis"
);

// ---- gantt interaction (move / resize / px) --------------------------------
assert.deepEqual(
	gantt.moveBarDates("2026-01-10", "2026-01-12", 3),
	{ start: "2026-01-13", end: "2026-01-15" },
	"moveBarDates shifts both endpoints, preserving the span"
);
assert.deepEqual(
	gantt.moveBarDates("2026-01-10", null, -2),
	{ start: "2026-01-08", end: null },
	"moveBarDates keeps a missing end missing"
);
assert.equal(gantt.resizeBarEnd("2026-01-10", "2026-01-12", 2), "2026-01-14", "resizeBarEnd extends the end");
assert.equal(gantt.resizeBarEnd("2026-01-10", "2026-01-12", -5), "2026-01-10", "resizeBarEnd clamps end to the start");
assert.equal(gantt.resizeBarEnd("2026-01-10", null, 3), "2026-01-13", "resizeBarEnd grows from start when no end");
assert.equal(gantt.shiftIso("2026-02-27", 2), "2026-03-01", "shiftIso rolls over a month boundary");
assert.equal(gantt.shiftIso("not a date", 5), "not a date", "shiftIso leaves an unparseable value unchanged");
assert.equal(gantt.pxToDays(100, 20), 5, "pxToDays converts a pixel delta to whole days");
assert.equal(gantt.pxToDays(9, 20), 0, "pxToDays rounds a sub-day delta to zero");
assert.equal(gantt.pxToDays(100, 0), 0, "pxToDays guards a zero day-width");

// ---- calendar date helpers -------------------------------------------------
assert.equal(dates.toIsoDateKey("2026-01-15"), "2026-01-15", "toIsoDateKey passes an ISO date through");
assert.equal(dates.toIsoDateKey("2026-01-15T09:30"), "2026-01-15", "toIsoDateKey drops a time suffix");
assert.equal(dates.toIsoDateKey(""), null, "toIsoDateKey rejects empty");
assert.equal(dates.toIsoDateKey("nope"), null, "toIsoDateKey rejects a non-date");
assert.equal(dates.toIsoDateKey("2026-13-45"), null, "toIsoDateKey rejects an impossible month/day");
assert.equal(dates.toIsoDateKey("2026-02-30"), null, "toIsoDateKey rejects Feb 30 (range round-trip)");
assert.equal(dates.toIsoDateKey("2026-02-28"), "2026-02-28", "toIsoDateKey accepts a real edge date");
assert.equal(dates.rescheduleDateValue("2026-01-01", "2026-01-05"), "2026-01-05", "reschedule writes a bare date");
assert.equal(
	dates.rescheduleDateValue("2026-01-01T09:00", "2026-01-05"),
	"2026-01-05T09:00",
	"reschedule preserves the original time suffix"
);
assert.equal(dates.rescheduleDateValue("", "2026-01-05"), "2026-01-05", "reschedule handles an empty original");
assert.equal(dates.startOfWeekIso("2026-01-15"), "2026-01-11", "startOfWeekIso snaps Thu 2026-01-15 back to Sun 01-11");
assert.equal(dates.startOfWeekIso("2026-01-11"), "2026-01-11", "startOfWeekIso is a no-op on a Sunday");
assert.deepEqual(
	dates.weekKeys("2026-01-15"),
	["2026-01-11", "2026-01-12", "2026-01-13", "2026-01-14", "2026-01-15", "2026-01-16", "2026-01-17"],
	"weekKeys yields the seven days of the containing week"
);
assert.equal(dates.dayLabel("2026-01-15"), "Thu 15", "dayLabel names the weekday and day-of-month");

// ---- inline edit coercion --------------------------------------------------
assert.deepEqual(inlineEdit.coerceFieldInput("owner", "Ada", "Max"), { value: "Ada", remove: false }, "string field stays a string");
assert.deepEqual(inlineEdit.coerceFieldInput("owner", "   ", "Max"), { value: null, remove: true }, "cleared field is removed");
assert.deepEqual(inlineEdit.coerceFieldInput("priority", "3", 1), { value: 3, remove: false }, "numeric field coerces to number");
assert.deepEqual(inlineEdit.coerceFieldInput("count", "5", 2), { value: 5, remove: false }, "prev-number field coerces to number");
assert.deepEqual(inlineEdit.coerceFieldInput("due", "2026-01-05", "2026-01-01"), { value: "2026-01-05", remove: false }, "date field stays a string");
assert.deepEqual(
	inlineEdit.coerceFieldInput("tags", "a, b, a, ", ["x"]),
	{ value: ["a", "b"], remove: false },
	"list field splits, trims, and de-dupes"
);
assert.deepEqual(inlineEdit.coerceFieldInput("done", "true", false), { value: true, remove: false }, "boolean field coerces when prev was boolean");
assert.equal(inlineEdit.formatFieldForEdit(["a", "b"]), "a, b", "formatFieldForEdit joins arrays");
assert.equal(inlineEdit.formatFieldForEdit(null), "", "formatFieldForEdit renders null as empty");

// ---- automation (move rules) -----------------------------------------------
const rules = [
	{
		id: "r1",
		name: "Finish",
		enabled: true,
		triggerProp: "status",
		enterValue: "Done",
		actions: [
			{ prop: "completed", type: "today", value: "" },
			{ prop: "done", type: "set", value: "true" },
			{ prop: "assignee", type: "clear", value: "" },
		],
	},
	{ id: "r2", name: "Disabled", enabled: false, triggerProp: "status", enterValue: "Done", actions: [{ prop: "x", type: "set", value: "1" }] },
	{ id: "r3", name: "Start", enabled: true, triggerProp: "status", enterValue: "Doing", actions: [{ prop: "flag", type: "toggle", value: "" }] },
];
assert.equal(automation.rulesForTransition(rules, "status", "done").length, 1, "matches case-insensitively, skips disabled + non-matching");
assert.equal(automation.rulesForTransition(rules, "status", "Backlog").length, 0, "no rule for an unconfigured value");
const clock = new Date(2026, 0, 15, 9, 30); // 2026-01-15 09:30 local
const writes = automation.computeRuleWrites(automation.rulesForTransition(rules, "status", "Done"), { assignee: "Ada", done: false }, clock);
assert.deepEqual(
	writes,
	[
		{ key: "completed", value: "2026-01-15" },
		{ key: "done", value: true },
		{ key: "assignee", remove: true },
	],
	"computeRuleWrites resolves today/set/clear in order"
);
assert.deepEqual(
	automation.computeRuleWrites(automation.rulesForTransition(rules, "status", "Doing"), { flag: true }, clock),
	[{ key: "flag", value: false }],
	"toggle flips the current truthiness"
);
assert.deepEqual(
	automation.computeRuleWrites([{ id: "c", name: "c", enabled: true, triggerProp: "status", enterValue: "Done", actions: [{ prop: "closed", type: "copy", value: "due" }] }], { due: "2026-02-01" }, clock),
	[{ key: "closed", value: "2026-02-01" }],
	"copy reads the source property's current value"
);
// `copy` of an array/object value must deep-clone, not alias the note's own reference.
const copySrcTags = ["a", "b"];
const copyWrites = automation.computeRuleWrites(
	[{ id: "cp", name: "cp", enabled: true, triggerProp: "status", enterValue: "Done", actions: [{ prop: "tagsCopy", type: "copy", value: "tags" }] }],
	{ tags: copySrcTags },
	clock
);
assert.deepEqual(copyWrites[0].value, ["a", "b"], "copy reproduces the array value");
assert.notStrictEqual(copyWrites[0].value, copySrcTags, "copy does NOT alias the source array reference");
copySrcTags.push("c");
assert.deepEqual(copyWrites[0].value, ["a", "b"], "mutating the source afterwards does not change the copied write");

assert.equal(automation.coerceLiteral("42"), 42, "coerceLiteral parses numbers");
assert.equal(automation.coerceLiteral("false"), false, "coerceLiteral parses booleans");
assert.equal(automation.coerceLiteral("open"), "open", "coerceLiteral keeps strings");

// ---- kanban helpers ---------------------------------------------------------
const kanbanRows = [
	r,
	rowmod.makeRow({
		...note,
		path: "Projects/Beta.md",
		name: "Beta",
		mtime: 50,
		frontmatter: { status: "done", due: "2026-02-01", priority: 1, owner: "Max" },
	}),
	rowmod.makeRow({
		...note,
		path: "Projects/Gamma.md",
		name: "Gamma",
		mtime: 100,
		frontmatter: { status: "active", due: "2026-01-15", priority: 3, owner: "Ada" },
	}),
];
// Shared isRowDone predicate (1.12): one definition every view uses so the Kanban
// chip, Calendar overdue, and Outline progress never disagree.
assert.equal(kanban.isRowDone(kanbanRows[1], "status", "done"), true, "isRowDone: status == done value");
assert.equal(kanban.isRowDone(kanbanRows[2], "status", "done"), false, "isRowDone: active is not done");
assert.equal(
	kanban.isRowDone(rowmod.makeRow({ ...note, frontmatter: { status: "Done" } }, {}), "status", "done"),
	true,
	"isRowDone: case-insensitive status match"
);
assert.equal(
	kanban.isRowDone(rowmod.makeRow({ ...note, frontmatter: { status: "doing", done: true } }, {}), "status", "done"),
	true,
	"isRowDone: a truthy `done` flag marks done even off the Done column"
);
assert.equal(
	kanban.isRowDone(rowmod.makeRow({ ...note, frontmatter: { status: "doing", done: "0" } }, {}), "status", "done"),
	false,
	'isRowDone: `done: "0"` is not truthy (uses the fixed toBool)'
);

const board = kanban.buildKanbanColumns(kanbanRows, {
	groupBy: "status",
	search: "a",
	hideColumn: "done",
	sortBy: "due-asc",
});
assert.deepEqual(
	board.map((col) => ({ name: col.name, cards: col.rows.map((row) => row.name) })),
	[{ name: "active", cards: ["Gamma", "Alpha"] }],
	"buildKanbanColumns filters hidden columns, applies search, and sorts rows"
);
const boardWithExtra = kanban.buildKanbanColumns(kanbanRows, {
	groupBy: "status",
	extraColumns: ["blocked", "active"],
});
assert.deepEqual(
	boardWithExtra.map((col) => [col.name, col.rows.length]),
	[["active", 2], ["done", 1], ["blocked", 0]],
	"buildKanbanColumns appends empty user-added columns and skips ones that already exist"
);
assert.deepEqual(
	kanban.buildKanbanColumns(kanbanRows, { groupBy: "status", search: "gamma", extraColumns: ["blocked"] })
		.map((col) => col.name),
	["active"],
	"extra columns are suppressed while a search is active"
);
// 1.11 regression guard: the board must NOT pre-lowercase the query, or a
// capitalized property KEY in a key:value token would fold to lowercase and miss
// (it worked in Calendar/Gantt, which pass the raw query to rowMatchesText).
const capRow = rowmod.makeRow({
	path: "P/Cap.md", name: "Cap", folder: "P", ext: "md", tags: [], ctime: 0, mtime: 0, size: 0,
	frontmatter: { status: "active", Owner: "Sam" },
});
assert.equal(
	kanban.buildKanbanColumns([capRow], { groupBy: "status", search: "Owner:Sam" }).length,
	1,
	"a capitalized property key in a search token still matches on the board"
);
assert.equal(
	kanban.buildKanbanColumns([capRow], { groupBy: "status", search: "Owner:Nope" }).length,
	0,
	"the capitalized-key token still rejects a non-matching value"
);
assert.equal(kanban.columnHue("active"), kanban.columnHue("active"), "columnHue is stable for a value");
assert.ok(kanban.columnHue("done") >= 0 && kanban.columnHue("done") < 360, "columnHue stays within the hue circle");

assert.deepEqual(
	kanban.buildKanbanColumns(kanbanRows, { groupBy: "status", columnOrder: ["done", "active"] }).map((col) => col.name),
	["done", "active"],
	"columnOrder controls the left-to-right column order"
);
assert.deepEqual(kanban.reorderColumns(["a", "b", "c"], "c", "a"), ["c", "a", "b"], "reorderColumns moves a column before its target");
assert.deepEqual(kanban.reorderColumns(["a", "b", "c"], "a", "a"), ["a", "b", "c"], "reorderColumns is a no-op onto itself");
assert.deepEqual(kanban.reorderColumns(["a", "b", "c"], "a", "z"), ["a", "b", "c"], "reorderColumns leaves order unchanged for an unknown target");

// 1.11: due-chip status — pure so the card state is tested, not eyeballed.
assert.equal(kanban.dueStatus("2026-01-10", "2026-01-15"), "overdue", "a past date is overdue");
assert.equal(kanban.dueStatus("2026-01-15", "2026-01-15"), "soon", "today counts as due soon");
assert.equal(kanban.dueStatus("2026-01-17", "2026-01-15"), "soon", "within the soon window (2 days)");
assert.equal(kanban.dueStatus("2026-01-18", "2026-01-15"), null, "beyond the soon window is unflagged");
assert.equal(kanban.dueStatus("2026-02-01", "2026-01-31"), "soon", "soon works across a month boundary (not lexical)");
assert.equal(kanban.dueStatus(null, "2026-01-15"), null, "no date, no status");
assert.equal(kanban.dueStatus("not-a-date", "2026-01-15"), null, "unparsable date, no status");

// 1.11: priority badge classes — conventional names map, numbers stay null (ambiguous).
assert.equal(kanban.priorityClass("High"), "is-p-high", "high maps to the high badge, case-insensitive");
assert.equal(kanban.priorityClass("urgent"), "is-p-high", "urgent is high");
assert.equal(kanban.priorityClass("P1"), "is-p-high", "P1 is high");
assert.equal(kanban.priorityClass("medium"), "is-p-med", "medium maps to the med badge");
assert.equal(kanban.priorityClass("low"), "is-p-low", "low maps to the low badge");
assert.equal(kanban.priorityClass(1), null, "a bare number is ambiguous — no badge, hue fallback");
assert.equal(kanban.priorityClass("Critical Path"), null, "an unrecognized phrase gets no badge");
assert.equal(kanban.priorityClass(""), null, "empty value gets no badge");

assert.deepEqual(
	kanban.getCardMeta(rowmod.makeRow({
		...note,
		frontmatter: { status: "active", due: "2026-01-20", priority: 2, owner: "Ada", tags: ["ship", "urgent"] },
	}), ["due", "priority", "owner", "tags"]),
	["due: 2026-01-20", "priority: 2", "owner: Ada", "tags: ship, urgent"],
	"getCardMeta renders raw metadata lines for lite cards"
);

// ---- kanban actions ---------------------------------------------------------
assert.deepEqual(
	kanbanActions.setKanbanGroupValue({ status: "todo", owner: "Ada" }, "status", "done"),
	{ status: "done", owner: "Ada" },
	"setKanbanGroupValue updates the grouped property for drag/drop moves"
);
assert.equal(
	kanbanActions.buildQuickAddTitle("done", new Date(2026, 0, 15, 9, 30)),
	"New done 2026-01-15 09-30",
	"buildQuickAddTitle builds a timestamped title"
);

// ---- gantt progress normalization -------------------------------------------
assert.equal(gantt.normalizeProgress(50), 50, "percent passthrough");
assert.equal(gantt.normalizeProgress(0.5), 50, "fraction scaled to percent");
assert.equal(gantt.normalizeProgress(1), 100, "1 treated as full fraction");
assert.equal(gantt.normalizeProgress(0), 0, "zero stays zero");
assert.equal(gantt.normalizeProgress(140), 100, "over-100 percent clamped");
assert.equal(gantt.normalizeProgress(-5), 0, "negative clamped to zero");
assert.equal(gantt.normalizeProgress("75"), 75, "numeric string parsed");
assert.equal(gantt.normalizeProgress("nope"), null, "non-numeric is null");
assert.equal(gantt.normalizeProgress(""), null, "empty is null");
assert.equal(gantt.normalizeProgress("   "), null, "whitespace-only string is null, not 0");
assert.equal(gantt.normalizeProgress(null), null, "null is null");
assert.equal(gantt.normalizeProgress({}), null, "object is null");

// ---- undo: inverse writes ---------------------------------------------------
assert.deepEqual(
	undo.invertWrites({ status: "todo" }, [{ key: "status", value: "done" }]),
	[{ key: "status", value: "todo" }],
	"invert restores a changed key's original value"
);
assert.deepEqual(
	undo.invertWrites({}, [{ key: "completed", value: "2026-07-16" }]),
	[{ key: "completed", remove: true }],
	"invert removes a key that didn't exist before"
);
assert.deepEqual(
	undo.invertWrites({ done: true }, [{ key: "done", remove: true }]),
	[{ key: "done", value: true }],
	"invert of a removal restores the value"
);
assert.deepEqual(
	undo.invertWrites({ n: 1 }, [{ key: "n", value: 2 }, { key: "n", value: 3 }]),
	[{ key: "n", value: 1 }],
	"duplicate-key writes invert to the single original value"
);
// Captured arrays are cloned, so a later mutation of the source can't corrupt the inverse.
const src = { tags: ["a", "b"] };
const inv = undo.invertWrites(src, [{ key: "tags", value: ["x"] }]);
src.tags.push("c");
assert.deepEqual(inv, [{ key: "tags", value: ["a", "b"] }], "inverse clones captured array values");
// A non-plain object (Date-like) is captured as-is, never flattened to {}.
const when = new Date("2026-07-16T00:00:00Z");
const dateInv = undo.invertWrites({ at: when }, [{ key: "at", remove: true }]);
assert.equal(dateInv[0].value, when, "non-plain object value is preserved by reference, not flattened");

// ---- undo: manager stack + batching -----------------------------------------
const mgr = new undo.UndoManager(3);
assert.equal(mgr.canUndo(), false, "empty manager can't undo");
mgr.record("Edit A", "a.md", [{ key: "x", value: 1 }]);
assert.equal(mgr.canUndo(), true, "recorded edit is undoable");
assert.equal(mgr.peekLabel(), "Edit A", "peek shows last label");
const b1 = mgr.beginBatch("Rename");
mgr.record("ignored", "b.md", [{ key: "s", value: "q" }], b1);
mgr.record("ignored", "c.md", [{ key: "s", value: "q" }], b1);
mgr.commitBatch(b1);
assert.equal(mgr.peekLabel(), "Rename", "batch pushes one labelled entry");
const popped = mgr.pop();
assert.equal(popped.notes.length, 2, "batch entry groups both notes");
mgr.record("empty", "d.md", []);
assert.equal(mgr.peekLabel(), "Edit A", "empty inverse is not recorded");

// Reentrancy: two batches open at once (interleaved async ops) never mix notes.
const bx = mgr.beginBatch("Op X");
const by = mgr.beginBatch("Op Y");
mgr.record("i", "x1.md", [{ key: "k", value: 1 }], bx);
mgr.record("i", "y1.md", [{ key: "k", value: 1 }], by);
mgr.record("i", "x2.md", [{ key: "k", value: 2 }], bx);
mgr.commitBatch(by);
assert.deepEqual(mgr.pop().notes.map((n) => n.path), ["y1.md"], "Op Y committed only its own note");
mgr.commitBatch(bx);
assert.deepEqual(mgr.pop().notes.map((n) => n.path), ["x1.md", "x2.md"], "Op X kept both its notes despite interleaving");

// Bound respected: fill past the limit of 3.
for (let i = 0; i < 5; i++) mgr.record(`E${i}`, `f${i}.md`, [{ key: "k", value: i }]);
assert.equal(mgr.peekLabel(), "E4", "newest entry on top");
let depth = 0;
while (mgr.pop()) depth++;
assert.equal(depth, 3, "stack is bounded to its limit");
// An empty batch leaves the stack untouched.
mgr.record("Keep", "g.md", [{ key: "k", value: 9 }]);
mgr.commitBatch(mgr.beginBatch("Nothing"));
assert.equal(mgr.peekLabel(), "Keep", "an empty batch pushes no entry");

// ---- shared quick-search ----------------------------------------------------
const searchRow = rowmod.makeRow({
	path: "Projects/Alpha.md",
	name: "Alpha Launch",
	folder: "Projects",
	ext: "md",
	tags: ["urgent", "q3"],
	ctime: 0,
	mtime: 0,
	size: 0,
	frontmatter: { status: "active", owner: "Ada" },
});
assert.equal(search.rowMatchesText(searchRow, ""), true, "blank query matches everything");
assert.equal(search.rowMatchesText(searchRow, "   "), true, "whitespace query matches everything");
assert.equal(search.rowMatchesText(searchRow, "alpha"), true, "matches note name, case-insensitive");
assert.equal(search.rowMatchesText(searchRow, "projects"), true, "matches folder/path");
assert.equal(search.rowMatchesText(searchRow, "q3"), true, "matches a tag");
assert.equal(search.rowMatchesText(searchRow, "ada"), false, "does NOT match arbitrary frontmatter by default");
assert.equal(search.rowMatchesText(searchRow, "active", ["active"]), true, "extra haystack (kanban column) matches");
assert.equal(search.rowMatchesText(searchRow, "zzz"), false, "no false positive");
assert.equal(search.filterRowsByText([searchRow], "").length, 1, "blank query returns all rows (identity)");
assert.equal(search.filterRowsByText([searchRow], "alpha").length, 1, "filter keeps matching rows");
assert.equal(search.filterRowsByText([searchRow], "zzz").length, 0, "filter drops non-matching rows");

// 1.11: property-aware tokens — `key:value` filters on frontmatter/formulas.
assert.equal(search.rowMatchesText(searchRow, "owner:ada"), true, "key:value matches a frontmatter property");
assert.equal(search.rowMatchesText(searchRow, "owner:max"), false, "key:value rejects a non-matching value");
assert.equal(search.rowMatchesText(searchRow, "status:act"), true, "key:value matches by substring");
assert.equal(search.rowMatchesText(searchRow, "tag:urgent"), true, "tag: matches the note's tags");
assert.equal(search.rowMatchesText(searchRow, "tag:#urgent"), true, "tag: tolerates a leading # (tags are #-stripped)");
assert.equal(search.rowMatchesText(searchRow, "tag:#"), false, "a bare tag:# does not match every tagged note");
assert.equal(search.rowMatchesText(searchRow, "tags:q3"), true, "tags: is an alias for tag:");
assert.equal(search.rowMatchesText(searchRow, "owner:ada launch"), true, "tokens AND: property + text both match");
assert.equal(search.rowMatchesText(searchRow, "owner:ada zzz"), false, "tokens AND: one failing token fails the query");
assert.equal(search.rowMatchesText(searchRow, "launch alpha"), true, "plain words AND across the same haystacks");
assert.equal(search.rowMatchesText(searchRow, "missing:x"), false, "unknown property with no text fallback fails");
// A literal key:value string in the note name still matches as plain text.
const literalRow = rowmod.makeRow({
	...searchRow.note,
	path: "Refs/http notes.md",
	name: "See http://example.com",
	frontmatter: {},
});
assert.equal(search.rowMatchesText(literalRow, "http://example.com"), true, "a key:value-shaped literal falls back to text matching");

// ---- WIP limits -------------------------------------------------------------
assert.equal(wip.sanitizeWipLimit("5"), 5, "parses a positive integer string");
assert.equal(wip.sanitizeWipLimit(3), 3, "accepts a number");
assert.equal(wip.sanitizeWipLimit("2.9"), 2, "floors a fractional limit");
assert.equal(wip.sanitizeWipLimit("0"), null, "zero means no limit");
assert.equal(wip.sanitizeWipLimit("-4"), null, "negative means no limit");
assert.equal(wip.sanitizeWipLimit(""), null, "blank means no limit");
assert.equal(wip.sanitizeWipLimit("abc"), null, "non-numeric means no limit");
assert.equal(wip.limitFor({ Doing: 3 }, "Doing"), 3, "limitFor reads a configured column");
assert.equal(wip.limitFor({ Doing: 3 }, "Done"), null, "limitFor is null for an unset column");
assert.equal(wip.limitFor({ Doing: 0 }, "Doing"), null, "limitFor sanitizes a stored 0 to null");
assert.equal(wip.isOverWip(4, 3), true, "over the limit");
assert.equal(wip.isOverWip(3, 3), false, "exactly at the limit is not over");
assert.equal(wip.isOverWip(10, null), false, "no limit is never over");
assert.equal(wip.dropWouldExceed(3, 3), true, "a 4th card exceeds a limit of 3");
assert.equal(wip.dropWouldExceed(2, 3), false, "a 3rd card fills but doesn't exceed a limit of 3");
assert.equal(wip.dropWouldExceed(99, null), false, "no limit never blocks a drop");
assert.equal(wip.formatWipCount(3, 5), "3 / 5", "count renders with a limit");
assert.equal(wip.formatWipCount(3, null), "3", "count renders bare without a limit");

// ---- hierarchy / outline ----------------------------------------------------
const H = hierarchy;
const node = (id, parentRef, done = false, order = null, name = id) => ({ id, name, parentRef, order, done });

// resolveParentRef: path passthrough, wikilink/alias strip, .md completion, empty.
const known = new Set(["Projects/Alpha.md", "Tasks/One.md"]);
assert.equal(H.resolveParentRef("Projects/Alpha.md", known), "Projects/Alpha.md", "known path passes through");
assert.equal(H.resolveParentRef("[[Projects/Alpha.md|Alpha]]", known), "Projects/Alpha.md", "wikilink+alias stripped");
assert.equal(H.resolveParentRef("Projects/Alpha", known), "Projects/Alpha.md", "bare path gets .md when that resolves");
assert.equal(H.resolveParentRef("", known), null, "empty ref is null");
assert.equal(H.resolveParentRef("Ghost/Nope.md", known), "Ghost/Nope.md", "unknown ref returned as-is for missing detection");

// Forest: two roots, nesting, a leaf.
const f1 = H.buildForest([
	node("Tasks/One.md", "Projects/Alpha.md"),
	node("Projects/Alpha.md", null),
	node("Projects/Beta.md", null),
], new Set(["Tasks/One.md", "Projects/Alpha.md", "Projects/Beta.md"]));
assert.equal(f1.roots.length, 2, "two top-level roots");
const alpha = f1.byId.get("Projects/Alpha.md");
assert.equal(alpha.children.length, 1, "Alpha has one child");
assert.equal(alpha.children[0].id, "Tasks/One.md", "One nests under Alpha");

// Missing parent → quarantined root, flagged.
const f2 = H.buildForest([node("a.md", "gone.md")], new Set(["a.md"]));
assert.equal(f2.roots[0].missingParent, true, "dangling parent flagged as missing");
assert.equal(f2.roots.length, 1, "missing-parent node is a root");

// Ghost parent: parent exists in vault but is filtered out of the rows.
const f3 = H.buildForest([node("child.md", "parent.md")], new Set(["child.md", "parent.md"]));
assert.equal(f3.roots.length, 1, "one root (the ghost)");
assert.equal(f3.roots[0].ghost, true, "filtered-out parent becomes a ghost");
assert.equal(f3.roots[0].children[0].id, "child.md", "child nests under the ghost");

// Cycle: A<->B both quarantined, no infinite recursion.
const f4 = H.buildForest([node("A.md", "B.md"), node("B.md", "A.md")], new Set(["A.md", "B.md"]));
assert.equal(f4.roots.length, 2, "both cyclic nodes are roots");
assert.ok(f4.byId.get("A.md").cycle && f4.byId.get("B.md").cycle, "both flagged as cycle");
assert.doesNotThrow(() => H.flattenForest(f4, new Set()), "flatten a cycle without overflow");
// Self-cycle.
const f5 = H.buildForest([node("s.md", "s.md")], new Set(["s.md"]));
assert.equal(f5.byId.get("s.md").cycle, true, "self-parent flagged as cycle");

// Metrics: progress rolls up over leaves only.
const f6 = H.buildForest([
	node("proj.md", null),
	node("t1.md", "proj.md", true),
	node("t2.md", "proj.md", false),
], new Set(["proj.md", "t1.md", "t2.md"]));
const proj = f6.byId.get("proj.md");
assert.equal(proj.metrics.descendantCount, 2, "descendant count counts both tasks");
assert.equal(proj.metrics.leafTotal, 2, "two leaf tasks");
assert.equal(proj.metrics.leafDone, 1, "one done");
assert.equal(proj.metrics.progress, 50, "progress = 50% over leaves");

// Flatten respects collapse + order.
const f7 = H.buildForest([
	node("p.md", null),
	node("b.md", "p.md", false, 2, "b"),
	node("a.md", "p.md", false, 1, "a"),
], new Set(["p.md", "a.md", "b.md"]));
const orderOf = (id) => ({ "a.md": 1, "b.md": 2 })[id] ?? null;
const openFlat = H.flattenForest(f7, new Set(), orderOf);
assert.deepEqual(openFlat.map((r) => r.id), ["p.md", "a.md", "b.md"], "children sorted by order field");
const collapsedFlat = H.flattenForest(f7, new Set(["p.md"]), orderOf);
assert.deepEqual(collapsedFlat.map((r) => r.id), ["p.md"], "collapsed parent hides its children");
assert.equal(collapsedFlat[0].hasChildren, true, "collapsed parent still reports children");

// canReparent: cycle prevention + no-ops.
const rp = H.buildForest([
	node("root.md", null),
	node("mid.md", "root.md"),
	node("leaf.md", "mid.md"),
], new Set(["root.md", "mid.md", "leaf.md"]));
assert.equal(H.canReparent("root.md", "leaf.md", rp.byId).ok, false, "can't move a note under its own descendant");
assert.equal(H.canReparent("leaf.md", "leaf.md", rp.byId).ok, false, "can't parent to self");
assert.equal(H.canReparent("mid.md", "mid.md", rp.byId).ok, false, "already-there self is rejected");
assert.equal(H.canReparent("leaf.md", "root.md", rp.byId).ok, true, "a valid reparent is allowed");
assert.equal(H.canReparent("mid.md", null, rp.byId).ok, true, "detaching to root is allowed");
assert.equal(H.canReparent("root.md", null, rp.byId).ok, false, "already-a-root detach is a no-op");

// Rename retarget: only children pointing at the old path.
assert.deepEqual(
	H.childrenToRetarget("Projects/Alpha.md", "Projects/Alpha2.md", [
		node("x.md", "Projects/Alpha.md"),
		node("y.md", "Projects/Other.md"),
		node("z.md", "Projects/Alpha.md"),
	]),
	["x.md", "z.md"],
	"retarget selects exactly the children of the renamed note"
);
assert.deepEqual(H.childrenToRetarget("p.md", "p.md", [node("x.md", "p.md")]), [], "no-op rename retargets nothing");

// ---- rollup numeric aggregation (dashboard/pivot share this) ---------------
assert.equal(rollup.aggregateNumber("count", [1, 2, 3]), 3, "aggregateNumber count");
assert.equal(rollup.aggregateNumber("sum", [1, 2, 3]), 6, "aggregateNumber sum");
assert.equal(rollup.aggregateNumber("avg", [2, 4]), 3, "aggregateNumber avg");
assert.equal(rollup.aggregateNumber("avg", []), null, "aggregateNumber avg of nothing is null");
assert.equal(rollup.aggregateNumber("max", ["2026-01-01"]), null, "ISO date is not a number to max");
assert.equal(rollup.aggregateNumber("range", [1, 5, 3]), 4, "aggregateNumber range is the span");
assert.equal(rollup.aggregateNumber("unique", ["a", "a", "b", ""]), 2, "aggregateNumber unique ignores empty");

// ---- pivot / matrix engine -------------------------------------------------
const pdRow = (path, fm) =>
	rowmod.makeRow({ path, name: path.replace(/\.md$/, ""), folder: "", ext: "md", tags: [], ctime: 0, mtime: 0, size: 0, frontmatter: fm }, {});
const pdRows = [
	pdRow("A.md", { status: "active", priority: "high", hours: 2 }),
	pdRow("B.md", { status: "active", priority: "low", hours: 3 }),
	pdRow("C.md", { status: "done", priority: "high", hours: 5 }),
	pdRow("D.md", { status: "done", priority: "high" }),
	pdRow("E.md", { priority: "low" }),
];

const pv = pivot.buildPivot(pdRows, { rowProp: "status", colProp: "priority", aggregation: "count", valueExpr: "" });
assert.deepEqual(pv.rowKeys, ["active", "done", pivot.PIVOT_EMPTY_KEY], "pivot row keys sorted, empty last");
assert.deepEqual(pv.colKeys, ["high", "low"], "pivot column keys sorted");
assert.equal(pv.counts[1][0], 2, "done×high has 2 notes");
assert.equal(pv.cells[1][0], "2", "done×high count cell");
assert.equal(pv.counts[2][0], 0, "empty×high has no notes");
assert.equal(pv.rowTotals[1], "2", "done row total");
assert.equal(pv.colTotals[0], "3", "high column total");
assert.equal(pv.grandTotal, "5", "pivot grand total");

const pvSum = pivot.buildPivot(pdRows, { rowProp: "status", colProp: "priority", aggregation: "sum", valueExpr: "hours" });
assert.equal(pvSum.grandTotal, "10", "sum of hours across all rows");
assert.equal(pvSum.cells[1][0], "5", "done×high sums hours (missing hours ignored)");

const many = [];
for (let i = 0; i < 60; i++) many.push(pdRow(`m${i}.md`, { status: `s${i}`, priority: "high" }));
const pvBig = pivot.buildPivot(many, { rowProp: "status", colProp: "priority", aggregation: "count", valueExpr: "" });
assert.equal(pvBig.truncatedRows, true, "60 distinct row values trips truncation");
assert.equal(pvBig.rowKeys.length, 50, "pivot caps at 50 row keys");

// ---- dashboard engine ------------------------------------------------------
const distCount = dashboard.buildDistribution(pdRows, { groupBy: "status", aggregation: "count", valueExpr: "" });
assert.equal(distCount.slices.length, 3, "distribution has a slice per status incl. empty");
assert.equal(distCount.total, 5, "distribution count total");
assert.equal(distCount.max, 2, "largest slice is 2");
assert.equal(distCount.slices[0].value, 2, "slices sorted value-desc");

const distSum = dashboard.buildDistribution(pdRows, { groupBy: "status", aggregation: "sum", valueExpr: "hours" });
assert.equal(distSum.total, 10, "distribution sum total");
const negRows = [pdRow("N.md", { g: "x", n: -5 }), pdRow("P.md", { g: "y", n: 4 })];
const distNeg = dashboard.buildDistribution(negRows, { groupBy: "g", aggregation: "sum", valueExpr: "n" });
assert.equal(distNeg.slices.find((s) => s.key === "x").value, 0, "negative aggregate clamps to 0 for charting");

const distTrunc = dashboard.buildDistribution(many, { groupBy: "status", aggregation: "count", valueExpr: "", maxSlices: 5 });
assert.equal(distTrunc.truncated, true, "distribution folds the long tail");
assert.equal(distTrunc.slices.length, 5, "distribution respects maxSlices");
assert.ok(distTrunc.slices[distTrunc.slices.length - 1].key.startsWith("Other"), "tail becomes an Other slice");

// "Other" must RE-AGGREGATE the merged tail rows, not sum per-category values —
// otherwise a non-additive aggregation (avg/min/max) gets a nonsense "Other".
const avgRows = [
	pdRow("av.md", { g: "a", n: 30 }),
	pdRow("bv.md", { g: "b", n: 10 }),
	pdRow("cv.md", { g: "c", n: 20 }),
];
const distAvg = dashboard.buildDistribution(avgRows, { groupBy: "g", aggregation: "avg", valueExpr: "n", maxSlices: 2 });
const otherSlice = distAvg.slices.find((s) => s.key.startsWith("Other"));
assert.equal(otherSlice.value, 15, "Other avg is the mean of the merged tail (10,20 → 15), not the sum of averages (30)");
assert.equal(otherSlice.count, 2, "Other count sums the tail memberships");

// ---- gallery markdown edge cases (roundtable findings) ---------------------
assert.deepEqual(
	gallery.parseImageRef('![alt](cover.png "My title")'),
	{ kind: "vault", ref: "cover.png" },
	"markdown image title is stripped"
);
assert.deepEqual(
	gallery.parseImageRef("![](covers/img(1).png)"),
	{ kind: "vault", ref: "covers/img(1).png" },
	"parentheses in a markdown image path survive"
);
assert.deepEqual(
	gallery.parseImageRef('![](https://x.com/a(1).png "t")'),
	{ kind: "url", ref: "https://x.com/a(1).png" },
	"markdown image url with parens + title"
);

const kpis = dashboard.buildDefaultKpis(pdRows, "status", "done");
assert.deepEqual(kpis.map((k) => k.value), ["5", "2", "3"], "default KPIs: total, done, remaining");
assert.equal(kpis[1].sub, "40%", "done KPI shows percent");
const rollKpis = dashboard.buildRollupKpis(pdRows, [{ id: "x", label: "Count", expression: "1", aggregation: "count" }]);
assert.equal(rollKpis[0].value, "5", "rollup KPI value");

const segs = dashboard.buildDonutSegments(distCount.slices);
assert.equal(segs.length, 3, "donut segment per positive slice");
assert.ok(Math.abs(segs[segs.length - 1].endAngle - (-Math.PI / 2 + Math.PI * 2)) < 1e-9, "donut segments span a full turn");
assert.equal(dashboard.buildDonutSegments([{ key: "x", value: 0, count: 0 }]).length, 0, "no positive value → no segments");
const oneSeg = dashboard.buildDonutSegments([{ key: "x", value: 5, count: 1 }]);
assert.equal(oneSeg.length, 1, "single slice → one full-circle segment");
assert.ok(dashboard.annularSectorPath(100, 100, 90, 50, 0, 1).startsWith("M "), "annular sector path is an SVG path");

// ---- gallery image-ref parsing ---------------------------------------------
assert.deepEqual(gallery.parseImageRef("cover.png"), { kind: "vault", ref: "cover.png" }, "bare path");
assert.deepEqual(gallery.parseImageRef("[[img/pic.png]]"), { kind: "vault", ref: "img/pic.png" }, "wikilink");
assert.deepEqual(gallery.parseImageRef("![[pic.png|200]]"), { kind: "vault", ref: "pic.png" }, "embed with size");
assert.deepEqual(gallery.parseImageRef("![alt](images/a.jpg)"), { kind: "vault", ref: "images/a.jpg" }, "markdown image");
assert.deepEqual(gallery.parseImageRef("https://x.com/a.png"), { kind: "url", ref: "https://x.com/a.png" }, "url");
assert.deepEqual(gallery.parseImageRef("![](https://x.com/b.png)"), { kind: "url", ref: "https://x.com/b.png" }, "markdown image url");
assert.deepEqual(gallery.parseImageRef("<https://x.com/c.png>"), { kind: "url", ref: "https://x.com/c.png" }, "angle-bracketed url");
assert.equal(gallery.parseImageRef(""), null, "empty string → null");
assert.equal(gallery.parseImageRef("   "), null, "whitespace → null");
assert.equal(gallery.parseImageRef(42), null, "non-string → null");
assert.equal(gallery.parseImageRef("data:image/png;base64,AAAA"), null, "data: uri rejected");
assert.deepEqual(gallery.parseImageRef(["", "cover.png"]), { kind: "vault", ref: "cover.png" }, "first usable list entry");

// ---- manual ordering / rank ------------------------------------------------
assert.equal(ranking.parseRank(5), 5, "numeric rank");
assert.equal(ranking.parseRank("12"), 12, "numeric-string rank");
assert.equal(ranking.parseRank(""), null, "empty rank → null");
assert.equal(ranking.parseRank("abc"), null, "non-numeric rank → null");
assert.equal(ranking.parseRank(null), null, "null rank → null");
assert.equal(ranking.rankBetween(null, null), 0, "first-ever rank is 0");
assert.equal(ranking.rankBetween(null, 1000), 0, "insert at head is one step below");
assert.equal(ranking.rankBetween(1000, null), 2000, "append is one step above");
assert.equal(ranking.rankBetween(0, 1000), 500, "midpoint between two ranks");
assert.equal(ranking.rankBetween(1000, 1000), null, "no gap to split → renumber signal");
assert.deepEqual(ranking.renormalizedRanks(3), [0, 1000, 2000], "even integer renumber");

// planReorder: same-column single-write move (b sits between a and c → still fine, move to head)
const items = [
	{ id: "a", rank: 0 },
	{ id: "b", rank: 1000 },
	{ id: "c", rank: 2000 },
];
assert.deepEqual(ranking.planReorder(items, "c", 0), [{ id: "c", rank: -1000 }], "move c to head → one write below all");
assert.deepEqual(ranking.planReorder(items, "a", 3), [{ id: "a", rank: 3000 }], "move a to tail → one write above all");
assert.deepEqual(ranking.planReorder(items, "a", 1), [{ id: "a", rank: 1500 }], "move a between b and c → midpoint");
assert.deepEqual(ranking.planReorder(items, "a", 0), [], "move a to where it already is → no writes");
// A fresh column (no ranks) renumbers everyone in the requested order.
const fresh = [
	{ id: "x", rank: null },
	{ id: "y", rank: null },
	{ id: "z", rank: null },
];
assert.deepEqual(
	ranking.planReorder(fresh, "z", 0),
	[{ id: "z", rank: 0 }, { id: "x", rank: 1000 }, { id: "y", rank: 2000 }],
	"unranked column renumbers in the new order"
);
assert.deepEqual(ranking.planReorder(fresh, "x", 0), [], "dropping a card onto its own slot writes nothing (no phantom renumber)");
assert.deepEqual(ranking.planReorder(items, "b", 1), [], "no-op move in a ranked column writes nothing");
// A cross-column drop (moved not present) inserts and single-writes it.
assert.deepEqual(ranking.planReorder(items, "new", 1), [{ id: "new", rank: 500 }], "insert a new id between a and b");
// No gap to split (equal neighbouring ranks) → the whole column renumbers.
const tight = [
	{ id: "a", rank: 5 },
	{ id: "b", rank: 5 },
];
const tightPlan = ranking.planReorder(tight, "new", 1);
assert.ok(tightPlan.length >= 2 && tightPlan.some((w) => w.id === "new"), "unsplittable gap forces a renumber including the new card");

// ---- export ----------------------------------------------------------------
const exRows = [
	makeTestRow("Alpha", { status: "todo", due: "2026-07-01", tags: ["x", "y"] }),
	makeTestRow("Beta, Inc", { status: "done", due: "2026-07-02" }),
];
assert.equal(exporter.exportCell(exRows[0], "name"), "Alpha", "exportCell name → title");
assert.equal(exporter.exportCell(exRows[0], "path"), "Alpha.md", "exportCell path → id");
assert.equal(exporter.exportCell(exRows[0], "tags"), "x; y", "exportCell array joined");
assert.equal(exporter.exportCell(exRows[0], "missing"), "", "exportCell missing → empty");
const md = exporter.buildMarkdownTable(exRows, ["name", "status"]);
assert.ok(md.startsWith("| name | status |\n| --- | --- |"), "markdown table header + divider");
assert.ok(md.includes("| Alpha | todo |"), "markdown table row");
const csv = exporter.buildCsv(exRows, ["name", "status"]);
assert.equal(csv.split("\r\n")[0], '"name","status"', "csv quoted header");
assert.ok(csv.includes('"Beta, Inc","done"'), "csv quotes a value containing a comma");
// CSV / formula injection: a leading =/+/-/@ is neutralized with a leading quote.
const inj = [makeTestRow("=HYPERLINK(\"http://evil\")", { status: "@SUM(A1)" })];
const injCsv = exporter.buildCsv(inj, ["name", "status"]);
assert.ok(injCsv.includes(`"'=HYPERLINK`), "csv breaks a leading = formula trigger");
assert.ok(injCsv.includes(`"'@SUM(A1)"`), "csv breaks a leading @ formula trigger");
assert.equal(exporter.exportCell(makeTestRow("A", {}), "name"), "A", "plain name is not prefixed");
// Epoch accessors export as a date, not raw milliseconds.
assert.equal(exporter.exportCell(makeTestRow("A", { "file.mtime": Date.UTC(2026, 6, 20, 12) }), "file.mtime"), feed.epochToIso(Date.UTC(2026, 6, 20, 12)), "file.mtime exports as a date");
// Markdown board collapses a newline in a value so it can't break the task item.
const nlBoard = exporter.buildMarkdownBoard([{ name: "C", rows: [makeTestRow("T", { note: "l1\nl2" })] }], ["note"]);
assert.ok(nlBoard.includes("- [ ] T — note: l1 l2"), "board collapses a newline in a detail value");
const pipeRow = [makeTestRow("A|B", { status: "x" })];
assert.ok(exporter.buildMarkdownTable(pipeRow, ["name"]).includes("A\\|B"), "markdown escapes a pipe in a cell");
const exportBoard = exporter.buildMarkdownBoard(
	[{ name: "To Do", rows: [exRows[0]] }, { name: "Empty", rows: [] }],
	["due"]
);
assert.ok(exportBoard.includes("## To Do"), "exportBoard has a section per column");
assert.ok(exportBoard.includes("- [ ] Alpha — due: 2026-07-01"), "exportBoard card is a task item with details");
assert.ok(exportBoard.includes("_(empty)_"), "exportBoard marks an empty column");
const pmodel = pivot.buildPivot(exRows, { rowProp: "status", colProp: "due", aggregation: "count", valueExpr: "" });
const pcsv = exporter.pivotToCsv(pmodel, "status", "due");
assert.ok(pcsv.split("\r\n")[0].startsWith('"status \\ due"'), "pivot csv corner label");
assert.ok(exporter.pivotToMarkdownTable(pmodel, "status", "due").includes("Total"), "pivot markdown has a Total column");

// ---- feed / timeline -------------------------------------------------------
assert.equal(feed.feedDateOf(makeTestRow("A", { when: "2026-07-20" }), "when"), "2026-07-20", "feed date from a frontmatter prop");
assert.equal(feed.feedDateOf(makeTestRow("A", {}), "when"), null, "no date → null");
assert.equal(feed.feedDateOf(makeTestRow("A", { "file.mtime": Date.UTC(2026, 6, 20, 12) }), "file.mtime"), feed.epochToIso(Date.UTC(2026, 6, 20, 12)), "epoch accessor resolves");
// A small integer (a year, a count) is NOT mis-read as epoch-ms 1970.
assert.notEqual(feed.feedDateOf(makeTestRow("A", { yr: 2020 }), "yr"), "1970-01-01", "a bare small integer is not treated as an epoch timestamp");
assert.equal(feed.feedTimeOf(makeTestRow("A", { "file.mtime": 1.7e12 }), "file.mtime"), 1.7e12, "feedTimeOf returns the raw epoch for a numeric accessor");
assert.equal(feed.feedTimeOf(makeTestRow("A", {}), "when"), 0, "feedTimeOf with no value is 0");
assert.deepEqual(feed.sectionKeyFor("2026-07-20", "month"), { key: "2026-07", label: "July 2026" }, "month bucket");
assert.equal(feed.sectionKeyFor("2026-07-20", "week").key, dates.startOfWeekIso("2026-07-20"), "week bucket keys on the week start");
assert.ok(feed.sectionKeyFor("2026-07-20", "day").label.includes("Jul 20 2026"), "day label");
const feedRows = [
	makeTestRow("Old", { when: "2026-01-05" }),
	makeTestRow("New", { when: "2026-07-20" }),
	makeTestRow("AlsoNew", { when: "2026-07-20" }),
	makeTestRow("NoDate", {}),
];
const fmodel = feed.buildFeed(feedRows, { dateProp: "when", granularity: "day" });
assert.equal(fmodel.sections.length, 2, "two dated days → two sections");
assert.equal(fmodel.sections[0].key, "2026-07-20", "newest section first (desc)");
assert.deepEqual(fmodel.sections[0].rows.map((r) => r.name), ["AlsoNew", "New"], "within-day ties break by name");
assert.equal(fmodel.undated.length, 1, "the undated note is kept separately");
assert.equal(feed.buildFeed(feedRows, { dateProp: "when", granularity: "day", order: "asc" }).sections[0].key, "2026-01-05", "asc order flips section order");
// Within a day, order by exact time (newest first), not alphabetically.
const timed = [
	makeTestRow("Apple", { when: "2026-07-20T09:00" }),
	makeTestRow("Zebra", { when: "2026-07-20T17:00" }),
];
assert.deepEqual(
	feed.buildFeed(timed, { dateProp: "when", granularity: "day" }).sections[0].rows.map((r) => r.name),
	["Zebra", "Apple"],
	"within a day the later time comes first, not alphabetical"
);

fs.unlinkSync(outfile);
console.log("engine tests passed");

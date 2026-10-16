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
			export * as swimlane from "./src/query/swimlane.ts";
			export * as cardLayout from "./src/query/cardLayout.ts";
			export * as relations from "./src/query/relations.ts";
			export * as analytics from "./src/query/analytics.ts";
			export * as autoscroll from "./src/views/autoscroll.ts";
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
			export * as inlineFields from "./src/query/inlineFields.ts";
			export * as tasks from "./src/query/tasks.ts";
			export * as flatten from "./src/query/flatten.ts";
			export * as linkIndex from "./src/query/linkIndex.ts";
			export * as dql from "./src/query/dql.ts";
			export * as taskRow from "./src/model/taskRow.ts";
			export * as rowId from "./src/model/rowId.ts";
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
const { expr, filter, rollup, gantt, dates, inlineEdit, automation, undo, search, wip, hierarchy, kanban, swimlane, cardLayout, relations, analytics, autoscroll, colorRules, pivot, dashboard, gallery, ranking, exporter, feed, kanbanActions, base, resolve, rowmod, inlineFields, tasks, flatten, linkIndex, dql, taskRow, rowId } = m;

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
assert.equal(
	dates.rescheduleDateValue(new Date("2026-01-01T00:00:00.000Z"), "2026-01-05"),
	"2026-01-05",
	"reschedule writes a bare date for a Date-typed value (no synthetic midnight suffix)"
);
assert.equal(
	dates.rescheduleDateValue("2026-01-01T00:00:00.000Z", "2026-01-05"),
	"2026-01-05",
	"reschedule strips a pure midnight-UTC suffix rather than bloating the date"
);
assert.equal(
	dates.rescheduleDateValue("2026-01-01T09:00:00.000Z", "2026-01-05"),
	"2026-01-05T09:00:00.000Z",
	"reschedule keeps a genuine wall-clock time suffix"
);
assert.equal(
	dates.rescheduleDateValue("2026-01-01T00:00:00", "2026-01-05"),
	"2026-01-05T00:00:00",
	"reschedule preserves an explicit local-midnight time (only the synthetic ...Z suffix is stripped)"
);
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
assert.equal(automation.coerceLiteral("-3.5"), -3.5, "coerceLiteral parses negative decimals");
assert.equal(automation.coerceLiteral("false"), false, "coerceLiteral parses booleans");
assert.equal(automation.coerceLiteral("open"), "open", "coerceLiteral keeps strings");
// Round-trip guard: values that would change under Number() stay strings, so a bulk
// edit / Move Rule can't silently corrupt zip codes, zero-padded ids, or long ids.
assert.strictEqual(automation.coerceLiteral("02134"), "02134", "coerceLiteral keeps a zero-padded zip code as a string");
assert.strictEqual(automation.coerceLiteral("007"), "007", "coerceLiteral keeps a zero-padded id as a string");
assert.strictEqual(
	automation.coerceLiteral("123456789012345678"),
	"123456789012345678",
	"coerceLiteral keeps a precision-losing long id as a string"
);

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

// Default "manual" sort is drag-aware (the fix that makes reorder work out of the
// box): unranked cards keep their natural/insertion order, and once ranks exist
// the cards sort by rank ascending with any still-unranked card falling to the end.
const mkCard = (name, extra = {}) =>
	rowmod.makeRow({ path: `M/${name}.md`, name, folder: "M", ext: "md", tags: [], ctime: 0, mtime: 0, size: 0, frontmatter: { status: "active", ...extra } }, {});
const unranked = [mkCard("One"), mkCard("Two"), mkCard("Three")];
assert.deepEqual(
	kanban.buildKanbanColumns(unranked, { groupBy: "status", sortBy: "manual" })[0].rows.map((r) => r.name),
	["One", "Two", "Three"],
	'manual sort with no ranks preserves natural (insertion) order — an untouched board is unchanged'
);
const ranked = [mkCard("One", { rank: 3000 }), mkCard("Two", { rank: 1000 }), mkCard("Three", { rank: 2000 })];
assert.deepEqual(
	kanban.buildKanbanColumns(ranked, { groupBy: "status", sortBy: "manual" })[0].rows.map((r) => r.name),
	["Two", "Three", "One"],
	"manual sort orders hand-ranked cards ascending by rank"
);
const mixed = [mkCard("NoRankA"), mkCard("Ranked", { rank: 500 }), mkCard("NoRankB")];
assert.deepEqual(
	kanban.buildKanbanColumns(mixed, { groupBy: "status", sortBy: "manual" })[0].rows.map((r) => r.name),
	["Ranked", "NoRankA", "NoRankB"],
	"manual sort puts ranked cards first, unranked keep their natural order at the end"
);
// The legacy "rank" value (from boards saved before the merge) resolves to the same order.
assert.deepEqual(
	kanban.buildKanbanColumns(ranked, { groupBy: "status", sortBy: "rank" })[0].rows.map((r) => r.name),
	["Two", "Three", "One"],
	'the legacy "rank" sort value behaves identically to the merged "manual" sort'
);

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
// Compiled-token path parity: key:value, tag:, and multi-token AND behave the same
// through both the single-row and the filter entry points after the compile refactor.
assert.equal(search.rowMatchesText(searchRow, "owner:ada"), true, "key:value matches a frontmatter property");
assert.equal(search.rowMatchesText(searchRow, "owner:sam"), false, "key:value rejects a non-matching property value");
assert.equal(search.rowMatchesText(searchRow, "tag:#urgent"), true, "tag:#x strips the leading # like tag:x");
assert.equal(search.rowMatchesText(searchRow, "alpha q3"), true, "multi-token query ANDs (both match)");
assert.equal(search.rowMatchesText(searchRow, "alpha zzz"), false, "multi-token query ANDs (one fails → no match)");
assert.equal(search.filterRowsByText([searchRow], "owner:ada").length, 1, "filter honours a key:value token");

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

// ---- drill-down: pivot exposes the notes behind every number ---------------
// pv = buildPivot(pdRows, status × priority, count) from above.
assert.equal(pv.cellRows[1][0].length, 2, "done×high cell exposes its 2 notes for drill-down");
assert.deepEqual(pv.cellRows[1][0].map((r) => r.id).sort(), ["C.md", "D.md"], "cell rows are the right notes");
assert.equal(pv.cellRows[2][0].length, 0, "an empty intersection has no drill rows");
assert.equal(pv.rowKeyRows[1].length, 2, "the 'done' row key exposes all its notes");
assert.equal(pv.colKeyRows[0].length, 3, "the 'high' column key exposes all its notes");
assert.equal(pv.allRows.length, 5, "grand-total drill is every matrix note");

// Busiest-first key ordering keeps the biggest buckets (matters under truncation).
const sortRows = [
	pdRow("s1.md", { g: "a", p: "x" }),
	pdRow("s2.md", { g: "b", p: "x" }),
	pdRow("s3.md", { g: "b", p: "x" }),
	pdRow("s4.md", { g: "b", p: "x" }),
];
const pvLabel = pivot.buildPivot(sortRows, { rowProp: "g", colProp: "p", aggregation: "count", valueExpr: "", sort: "label" });
assert.deepEqual(pvLabel.rowKeys, ["a", "b"], "label sort orders row keys alphabetically");
const pvTotal = pivot.buildPivot(sortRows, { rowProp: "g", colProp: "p", aggregation: "count", valueExpr: "", sort: "total" });
assert.deepEqual(pvTotal.rowKeys, ["b", "a"], "total sort puts the busiest row key first");

// (empty) is forced last even under a total sort that would otherwise rank it high.
const emptyHeavy = [
	pdRow("e1.md", { p: "x" }),
	pdRow("e2.md", { p: "x" }),
	pdRow("e3.md", { g: "a", p: "x" }),
];
const pvEmpty = pivot.buildPivot(emptyHeavy, { rowProp: "g", colProp: "p", aggregation: "count", valueExpr: "", sort: "total" });
assert.equal(pvEmpty.rowKeys[pvEmpty.rowKeys.length - 1], pivot.PIVOT_EMPTY_KEY, "(empty) stays last even when it's the biggest bucket");

// ---- drill-down: distribution slices carry their rows ----------------------
const drillDist = dashboard.buildDistribution(pdRows, { groupBy: "status", aggregation: "count", valueExpr: "" });
const doneSlice = drillDist.slices.find((s) => s.key === "done");
assert.equal(doneSlice.rows.length, 2, "the 'done' slice carries its 2 notes");
assert.equal(drillDist.slices.reduce((n, s) => n + s.rows.length, 0), 5, "slice rows partition all notes");
const drillOther = dashboard.buildDistribution(many, { groupBy: "status", aggregation: "count", valueExpr: "", maxSlices: 5 });
const drillOtherSlice = drillOther.slices.find((s) => s.key.startsWith("Other"));
assert.equal(drillOtherSlice.rows.length, 56, "the Other slice carries every folded-in note (60 − 4 head)");

// Display sort orders slices without changing the fold (Other stays the smallest).
const cntRows = [
	pdRow("c1.md", { g: "a" }), pdRow("c2.md", { g: "a" }), pdRow("c3.md", { g: "a" }),
	pdRow("c4.md", { g: "b" }),
	pdRow("c5.md", { g: "c" }), pdRow("c6.md", { g: "c" }),
];
const asc = dashboard.buildDistribution(cntRows, { groupBy: "g", aggregation: "count", valueExpr: "", sort: "value-asc" });
assert.deepEqual(asc.slices.map((s) => s.key), ["b", "c", "a"], "value-asc sorts smallest slice first");
const desc = dashboard.buildDistribution(cntRows, { groupBy: "g", aggregation: "count", valueExpr: "", sort: "value" });
assert.deepEqual(desc.slices.map((s) => s.key), ["a", "c", "b"], "default value sort is largest-first");

// ---- drill-down: KPI cards carry the exact subset they count ---------------
const drillKpis = dashboard.buildDefaultKpis(pdRows, "status", "done");
assert.equal(drillKpis[0].rows.length, 5, "Notes KPI drills to all rows");
assert.equal(drillKpis[1].rows.length, 2, "Done KPI drills to the done rows");
assert.equal(drillKpis[2].rows.length, 3, "Remaining KPI drills to the not-done rows");
assert.ok(drillKpis[1].rows.every((r) => ["C.md", "D.md"].includes(r.id)), "Done KPI rows are the done notes");

// A real category literally named "Other (…)" must NOT be confused with the
// synthesized fold: only the fold carries isOther, so a drill can target it precisely.
const otherCollide = [
	pdRow("oc1.md", { g: "Other (legacy)" }),
	pdRow("oc2.md", { g: "Other (legacy)" }),
	pdRow("oc3.md", { g: "a" }),
	pdRow("oc4.md", { g: "b" }),
	pdRow("oc5.md", { g: "c" }),
];
const collideDist = dashboard.buildDistribution(otherCollide, { groupBy: "g", aggregation: "count", valueExpr: "", maxSlices: 3 });
const flagged = collideDist.slices.filter((s) => s.isOther === true);
assert.equal(flagged.length, 1, "exactly one slice is the synthesized fold");
assert.ok(flagged[0].key.startsWith("Other ("), "the fold is the '(N)' bucket");
const realOther = collideDist.slices.find((s) => s.key === "Other (legacy)");
assert.ok(realOther && realOther.isOther !== true, "a real 'Other (legacy)' category is not flagged as the fold");
assert.equal(realOther.rows.length, 2, "the real 'Other (legacy)' slice keeps its own 2 notes");

// ---- stacked chart type + labels -------------------------------------------
assert.deepEqual(dashboard.DASHBOARD_CHART_TYPES, ["bar", "donut", "stacked"], "stacked joins the chart types");
assert.equal(dashboard.DASHBOARD_CHART_LABELS.stacked, "Stacked", "stacked has a human label");
assert.deepEqual(dashboard.DISTRIBUTION_SORTS, ["value", "value-asc", "count", "label"], "distribution sort options");

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

// ---- swimlanes -------------------------------------------------------------
// A fuller row than makeTestRow: the search path reads note.path/folder/tags, so a
// swimlane search test needs them present (an array for tags, not undefined).
const srow = (name, fm) => ({
	id: `${name}.md`,
	name,
	note: { path: `${name}.md`, name, folder: "", ext: "md", tags: [], ctime: 0, mtime: 0, size: 0, frontmatter: fm },
	scope: {
		get: (k) => {
			const data = { "file.name": name, "file.path": `${name}.md`, "file.folder": "", "file.tags": [], ...fm };
			return k in data ? data[k] : undefined;
		},
	},
});
const swimRows = [
	srow("A", { status: "Todo", owner: "Sam", rank: 0 }),
	srow("B", { status: "Doing", owner: "Sam", rank: 1 }),
	srow("C", { status: "Todo", owner: "Kai" }),
	srow("D", { status: "Done", owner: "Kai" }),
	srow("E", { status: "Doing", owner: "" }), // blank lane → (empty) band
];
const sm = swimlane.buildSwimlanes(swimRows, { groupBy: "status", laneProp: "owner", rankProp: "rank" });
// Columns are the flat board's columns (in first-seen order), shared by every lane.
assert.deepEqual(sm.columnNames, ["Todo", "Doing", "Done"], "swimlane columns = the flat board's columns");
assert.deepEqual(sm.lanes.map((l) => l.key), ["Kai", "Sam", "(empty)"], "lanes sorted, (empty) last");
// Every lane exposes every column (aligned grid), even empty cells.
for (const lane of sm.lanes) {
	assert.deepEqual(lane.columns.map((c) => c.name), sm.columnNames, `lane ${lane.key} has all columns aligned`);
}
const sam = sm.lanes.find((l) => l.key === "Sam");
assert.deepEqual(sam.columns.find((c) => c.name === "Todo").rows.map((r) => r.name), ["A"], "Sam∩Todo = A");
assert.deepEqual(sam.columns.find((c) => c.name === "Doing").rows.map((r) => r.name), ["B"], "Sam∩Doing = B");
assert.equal(sam.columns.find((c) => c.name === "Done").rows.length, 0, "Sam∩Done is an empty cell");
assert.equal(sam.total, 2, "lane total counts across its columns");
const empty = sm.lanes.find((l) => l.key === "(empty)");
assert.deepEqual(empty.columns.find((c) => c.name === "Doing").rows.map((r) => r.name), ["E"], "blank owner lands in (empty) band");
// Search narrows to matching cards: like the flat board, columns and lanes with no
// match drop out, and the surviving columns stay aligned across the surviving lanes.
const searched = swimlane.buildSwimlanes(swimRows, { groupBy: "status", laneProp: "owner", search: "A" });
assert.deepEqual(searched.columnNames, ["Todo"], "search drops columns with no matching card (matches the flat board)");
assert.deepEqual(searched.lanes.map((l) => l.key), ["Sam"], "only the lane with a match remains");
assert.deepEqual(searched.lanes[0].columns.map((c) => c.name), ["Todo"], "surviving lane shows the surviving column");
// Hide-done drops the Done column across all lanes.
const hidden = swimlane.buildSwimlanes(swimRows, { groupBy: "status", laneProp: "owner", hideColumn: "Done" });
assert.deepEqual(hidden.columnNames, ["Todo", "Doing"], "hideColumn removes it from every lane");
// Lane truncation flag.
const manyLanes = Array.from({ length: 5 }, (_, i) => srow(`n${i}`, { status: "Todo", owner: `L${i}` }));
const capped = swimlane.buildSwimlanes(manyLanes, { groupBy: "status", laneProp: "owner", maxLanes: 3 });
assert.equal(capped.truncatedLanes, true, "over the lane cap sets truncatedLanes");
assert.equal(capped.lanes.length, 3, "lane list is capped to maxLanes");

// ---- board model: true vs display membership -------------------------------
// The single subtlest board invariant: a quick-search hides cards from the DISPLAY
// but must NOT shrink the TRUE membership that drives WIP counts + reorder planning.
const bmRows = [
	srow("A", { status: "Todo", rank: 0 }),
	srow("B", { status: "Doing", rank: 1 }),
	srow("C", { status: "Todo" }),
	srow("D", { status: "Doing" }),
];
const bm = kanban.buildBoardModel(bmRows, { groupBy: "status" });
assert.deepEqual(bm.orderedNames, ["Todo", "Doing"], "columns in first-seen order");
assert.deepEqual(bm.columns.map((c) => c.name), kanban.buildKanbanColumns(bmRows, { groupBy: "status" }).map((c) => c.name), "columns == buildKanbanColumns");
assert.deepEqual(bm.trueMembership.get("Todo").map((r) => r.name).sort(), ["A", "C"], "true membership groups all rows");
assert.equal(bm.visibleRows.length, 4, "visibleRows = every shown card");
assert.deepEqual(bm.displayColumns.get("Doing").map((r) => r.name).sort(), ["B", "D"], "displayColumns = shown per column");
// With a search that matches only "A": the display collapses, true membership does not.
const bmS = kanban.buildBoardModel(bmRows, { groupBy: "status", search: "A" });
assert.deepEqual(bmS.orderedNames, ["Todo"], "search drops columns with no visible match");
assert.deepEqual(bmS.displayColumns.get("Todo").map((r) => r.name), ["A"], "search filters the display");
assert.deepEqual(bmS.trueMembership.get("Todo").map((r) => r.name).sort(), ["A", "C"], "true membership IGNORES search (WIP/reorder count all)");
assert.equal(bmS.trueMembership.get("Doing").length, 2, "a fully-hidden column is still counted in true membership");

// ---- shared drag helpers: rank compare + lane key/write --------------------
// compareRowsByRank orders by numeric rank (unranked last), ties broken by name —
// the standalone board and (later) the Bases host plan reorder against this.
const rk = (name, rank) => srow(name, rank === undefined ? { status: "Todo" } : { status: "Todo", rank });
assert.ok(kanban.compareRowsByRank(rk("A", 0), rk("B", 1), "rank") < 0, "lower rank sorts first");
assert.ok(kanban.compareRowsByRank(rk("A", 2), rk("B", 1), "rank") > 0, "higher rank sorts later");
assert.ok(kanban.compareRowsByRank(rk("A"), rk("B", 5), "rank") > 0, "unranked sorts after ranked");
assert.ok(kanban.compareRowsByRank(rk("B"), rk("A"), "rank") > 0, "two unranked fall back to name (B after A)");
assert.equal(kanban.compareRowsByRank(rk("x", 3), rk("x", 3), "rank"), 0, "equal rank + name → 0");

// laneKeyOf: blank/missing lane value → the "(empty)" sentinel band.
assert.equal(swimlane.laneKeyOf(srow("n", { owner: "Sam" }), "owner"), "Sam", "present lane value is the key");
assert.equal(swimlane.laneKeyOf(srow("n", { owner: "  " }), "owner"), swimlane.SWIMLANE_EMPTY, "blank lane value → (empty)");
assert.equal(swimlane.laneKeyOf(srow("n", {}), "owner"), swimlane.SWIMLANE_EMPTY, "missing lane value → (empty)");

// laneWrite: a real lane writes the value; the "(empty)" band (or null) CLEARS the
// prop, so a note never carries the literal "(empty)" that base filters would see.
assert.deepEqual(swimlane.laneWrite("owner", "Sam"), { key: "owner", value: "Sam" }, "real lane writes the value");
assert.deepEqual(swimlane.laneWrite("owner", swimlane.SWIMLANE_EMPTY), { key: "owner", remove: true }, "(empty) band clears the prop");
assert.deepEqual(swimlane.laneWrite("owner", null), { key: "owner", remove: true }, "null lane clears the prop");

// ---- card layout widgets: progress + avatar --------------------------------
// progressPercent: numeric value measured against max, clamped to [0,100].
assert.equal(cardLayout.progressPercent(50, 100), 50, "half of 100 → 50%");
assert.equal(cardLayout.progressPercent(0.5, 1), 50, "0.5 of max 1 → 50% (fraction store)");
assert.equal(cardLayout.progressPercent(200, 100), 100, "over max clamps to 100");
assert.equal(cardLayout.progressPercent(-5, 100), 0, "below 0 clamps to 0");
assert.equal(cardLayout.progressPercent("30", 100), 30, "numeric string parses");
assert.equal(cardLayout.progressPercent("", 100), null, "blank → null (no bar)");
assert.equal(cardLayout.progressPercent("abc", 100), null, "non-numeric → null");
assert.equal(cardLayout.progressPercent(50, 0), null, "non-positive max → null");
assert.equal(cardLayout.progressPercent(null, 100), null, "null value → null");

// avatarFor: initials + a stable hue; strips wikilink/alias/@, takes first of an array.
assert.deepEqual(
	{ initials: cardLayout.avatarFor("John Doe").initials },
	{ initials: "JD" },
	"two words → first-letter initials"
);
assert.equal(cardLayout.avatarFor("[[Jane Smith]]").initials, "JS", "wikilink brackets stripped");
assert.equal(cardLayout.avatarFor("@bob").initials, "BO", "leading @ stripped, single word → first two letters");
assert.equal(cardLayout.avatarFor("folder/Alice").initials, "AL", "path leaf used");
assert.equal(cardLayout.avatarFor("[[people/Kai Chen|Kai]]").initials, "KA", "alias half of a wikilink used");
assert.equal(cardLayout.avatarFor("   "), null, "blank → null (no avatar)");
assert.equal(cardLayout.avatarFor(["Sam Ray", "Other"]).initials, "SR", "first of a multi-value property");
assert.equal(
	cardLayout.avatarFor("John Doe").hue,
	cardLayout.avatarFor("John Doe").hue,
	"hue is stable for the same name"
);

// ---- relations: dependencies + nested cards --------------------------------
assert.deepEqual(relations.parseLinks("[[Task A]]"), ["Task A"], "wikilink → basename");
assert.deepEqual(relations.parseLinks("[[folder/Task B|Alias]]"), ["Task B"], "link target basename, not alias; path stripped");
assert.deepEqual(relations.parseLinks("Task C, Task D"), ["Task C", "Task D"], "comma list → names");
assert.deepEqual(relations.parseLinks(["[[A]]", "B"]), ["A", "B"], "array of links");
assert.deepEqual(relations.parseLinks("[[X.md]]"), ["X"], "trailing .md stripped");
assert.deepEqual(relations.parseLinks(""), [], "blank → none");

const relRows = [
	srow("T1", { status: "todo", dep: "[[T2]], [[T3]]" }),
	srow("T2", { status: "doing" }),
	srow("T3", { status: "done" }),
	srow("C1", { status: "todo", parent: "[[T1]]" }),
	srow("C2", { status: "done", parent: "[[T1]]" }),
	srow("C3", { status: "todo", parent: "[[Other]]" }),
];
const relDone = (r) => r.note.frontmatter.status === "done";
const relByName = relations.indexByName(relRows);
assert.deepEqual(
	relations.computeBlockers(relRows[0], "dep", relByName, relDone).map((r) => r.name),
	["T2"],
	"unmet blocker T2 (doing); T3 is done and ignored"
);
assert.deepEqual(
	relations.computeBlockers(srow("S", { dep: "[[S]]" }), "dep", relations.indexByName([srow("S", {})]), relDone).map((r) => r.name),
	[],
	"self-dependency ignored"
);
assert.deepEqual(
	relations.childrenOf(relRows[0], "parent", relRows).map((r) => r.name).sort(),
	["C1", "C2"],
	"children link back to the parent by basename"
);
assert.deepEqual(
	relations.childStats(relations.childrenOf(relRows[0], "parent", relRows), relDone),
	{ done: 1, total: 2 },
	"1 of 2 subtasks done"
);
// indexChildren: same result as childrenOf, but O(rows) built once and O(1) per lookup.
const childIdx = relations.indexChildren(relRows, "parent");
assert.deepEqual(
	(childIdx.get("t1") ?? []).map((r) => r.name).sort(),
	["C1", "C2"],
	"indexChildren buckets children under the parent basename"
);
assert.equal(childIdx.get("other")?.length, 1, "a child under a different parent is indexed there");
assert.equal(childIdx.get("t2"), undefined, "a parent with no children isn't in the index");

// ---- analytics -------------------------------------------------------------
assert.equal(analytics.median([1, 2, 3]), 2, "odd-length median");
assert.equal(analytics.median([1, 2, 3, 4]), 2.5, "even-length median averages the middle two");
assert.equal(analytics.median([]), null, "empty median → null");
assert.equal(new Date(analytics.weekStartMs(Date.parse("2026-07-25T12:00:00Z"))).getUTCDay(), 1, "weekStartMs lands on a Monday");
assert.ok(analytics.weekStartMs(Date.parse("2026-07-25T12:00:00Z")) <= Date.parse("2026-07-25T12:00:00Z"), "week start is not in the future");

const A_DAY = 86400000;
const A_NOW = Date.parse("2026-07-25T00:00:00Z");
const arow = (name, fm, ctime, mtime) => ({
	id: `${name}.md`,
	name,
	note: { path: `${name}.md`, name, folder: "", ext: "md", tags: [], ctime, mtime, size: 0, frontmatter: fm },
	scope: { get: (k) => ({ "file.name": name, ...fm })[k] },
});
const aRows = [
	arow("A", { status: "done", owner: "Sam", done: "2026-07-20" }, A_NOW - 10 * A_DAY, A_NOW - 2 * A_DAY),
	arow("B", { status: "doing", owner: "Sam" }, A_NOW - 5 * A_DAY, A_NOW),
	arow("C", { status: "todo", owner: "Kai" }, A_NOW - 20 * A_DAY, A_NOW),
	arow("D", { status: "done", owner: "Kai", done: "2026-07-13" }, A_NOW - 30 * A_DAY, A_NOW),
];
const aDone = (r) => r.note.frontmatter.status === "done";
const rep = analytics.computeAnalytics(aRows, {
	groupBy: "status",
	isDone: aDone,
	assigneeProp: "owner",
	completedProp: "done",
	now: A_NOW,
	weeks: 3,
	top: 5,
});
assert.equal(rep.total, 4, "total cards");
assert.equal(rep.doneCount, 2, "done count");
assert.deepEqual(rep.wipByColumn, [{ label: "done", count: 2 }, { label: "doing", count: 1 }, { label: "todo", count: 1 }], "cards by column, most first");
assert.deepEqual(
	rep.workloadByAssignee.slice().sort((a, b) => a.label.localeCompare(b.label)),
	[{ label: "Kai", count: 1 }, { label: "Sam", count: 1 }],
	"workload counts OPEN cards only — Sam's done A and Kai's done D are excluded"
);
assert.equal(rep.cycle.count, 2, "two done cards have a start→finish span");
assert.equal(rep.cycle.avgDays, 11.5, "avg cycle = (5 + 18) / 2");
assert.equal(rep.cycle.maxDays, 18, "max cycle 18 days");
assert.deepEqual(rep.aging.map((x) => x.name), ["C", "B"], "aging: longest-open not-done first");
assert.equal(rep.aging[0].days, 20, "C has been open 20 days");
assert.equal(rep.throughputByWeek.length, 3, "throughput reports the requested 3 weeks");
assert.equal(rep.throughputByWeek.reduce((s, b) => s + b.count, 0), 2, "both done cards fall inside the 3-week window");
// completedProp fallback: with no completed property, a done card's mtime is the finish.
const rep2 = analytics.computeAnalytics([arow("E", { status: "done" }, A_NOW - 4 * A_DAY, A_NOW - 1 * A_DAY)], {
	groupBy: "status",
	isDone: aDone,
	assigneeProp: "",
	completedProp: "",
	now: A_NOW,
});
assert.equal(rep2.cycle.count, 1, "mtime fallback gives a cycle span");
assert.equal(rep2.cycle.avgDays, 3, "E: mtime(now-1d) - ctime(now-4d) = 3 days");
assert.equal(rep2.workloadByAssignee.length, 0, "no assignee property → no workload breakdown");

// ---- auto-scroll velocity --------------------------------------------------
// Calm middle → no scroll.
assert.equal(autoscroll.edgeVelocity(500, 0, 1000, 56, 18), 0, "middle of the container does not scroll");
// Near the top edge → negative (scroll up), ramping to full speed at the edge.
assert.equal(autoscroll.edgeVelocity(0, 0, 1000, 56, 18), -18, "at the top edge → full up-speed");
assert.ok(autoscroll.edgeVelocity(28, 0, 1000, 56, 18) < 0, "inside the top zone scrolls up");
assert.ok(Math.abs(autoscroll.edgeVelocity(28, 0, 1000, 56, 18)) < 18, "mid-zone is slower than the edge");
// Near the bottom edge → positive (scroll down).
assert.equal(autoscroll.edgeVelocity(1000, 0, 1000, 56, 18), 18, "at the bottom edge → full down-speed");
assert.ok(autoscroll.edgeVelocity(980, 0, 1000, 56, 18) > 0, "inside the bottom zone scrolls down");
// Overshoot past the edge stays clamped, never exceeds max.
assert.equal(autoscroll.edgeVelocity(-40, 0, 1000, 56, 18), -18, "overshoot above the top clamps to max");
assert.equal(autoscroll.edgeVelocity(1200, 0, 1000, 56, 18), 18, "overshoot below the bottom clamps to max");
// A container smaller than two zones has no calm middle → never fights the user.
assert.equal(autoscroll.edgeVelocity(50, 0, 80, 56, 18), 0, "a tiny container does not auto-scroll");

// ---- gallery / card cover image-ref parsing --------------------------------
// Obsidian percent-encodes spaces in a Markdown embed when "Use [[Wikilinks]]" is
// off, e.g. ![](Attachments/my%20photo.png); the vault ref must be decoded so
// getFirstLinkpathDest can match the literal file name (shared by Kanban + Gallery).
assert.equal(
	gallery.parseImageRef("![](Attachments/my%20photo.png)").ref,
	"Attachments/my photo.png",
	"markdown embed %20 decodes to a literal space"
);
assert.equal(gallery.parseImageRef("[[my photo.png]]").ref, "my photo.png", "wikilink keeps its literal space");
assert.equal(gallery.parseImageRef("Attachments/plain.png").ref, "Attachments/plain.png", "a bare path is unchanged");
assert.equal(gallery.parseImageRef("cover(1).png").ref, "cover(1).png", "parens in a bare filename survive");
const urlRef = gallery.parseImageRef("https://ex.com/a%20b.png");
assert.equal(urlRef.kind, "url", "an http(s) value is a URL ref");
assert.equal(urlRef.ref, "https://ex.com/a%20b.png", "a URL is NOT percent-decoded");
assert.equal(gallery.parseImageRef("![](bad%ZZ.png)").ref, "bad%ZZ.png", "a malformed % sequence falls back to the literal");
assert.equal(gallery.parseImageRef(""), null, "an empty value is not an image ref");
assert.equal(gallery.parseImageRef("data:image/png;base64,AAAA"), null, "a data: URI is rejected");

// ---------------------------------------------------------------------------
// Beyond Bases: inline fields, task rows, FLATTEN, link traversal, DQL import.
// ---------------------------------------------------------------------------

// ---- inline fields --------------------------------------------------------

assert.deepEqual(
	inlineFields.parseInlineFields("due:: 2026-01-01"),
	{ due: "2026-01-01" },
	"a full-line inline field is read"
);
assert.deepEqual(
	inlineFields.parseInlineFields("- [ ] ship it [due:: 2026-02-03] [priority:: high]"),
	{ due: "2026-02-03", priority: "high" },
	"bracketed fields on a task line are read"
);
assert.deepEqual(
	inlineFields.parseInlineFields("(effort:: 3)"),
	{ effort: 3 },
	"a round-bracket field is read and a whole number coerces"
);
assert.deepEqual(
	inlineFields.parseInlineFields("> blocked:: true"),
	{ blocked: true },
	"a blockquote prefix doesn't hide the field"
);
assert.deepEqual(
	inlineFields.parseInlineFields("- **owner**:: Ana"),
	{ owner: "Ana" },
	"a bolded key is cleaned and the list marker stripped"
);
assert.deepEqual(
	inlineFields.parseInlineFields("people:: Ana, Ben, Cy"),
	{ people: ["Ana", "Ben", "Cy"] },
	"comma-separated values become a list, as in Dataview"
);
assert.deepEqual(
	inlineFields.parseInlineFields("project:: [[Alpha|The Alpha, revised]], [[Beta]]"),
	{ project: ["[[Alpha|The Alpha, revised]]", "[[Beta]]"] },
	"a comma inside a wikilink alias does NOT split the list"
);
assert.deepEqual(
	inlineFields.parseInlineFields("[project:: [[Alpha]]]"),
	{ project: "[[Alpha]]" },
	"a bracketed value keeps the whole wikilink, not just its first ]"
);
assert.deepEqual(
	inlineFields.parseInlineFields("---\ndue: 2020-01-01\n---\nstatus:: doing"),
	{ status: "doing" },
	"YAML frontmatter is skipped — Bases already owns it"
);
assert.deepEqual(
	inlineFields.parseInlineFields("```\nfake:: value\n```\nreal:: value"),
	{ real: "value" },
	"fields inside a fenced code block are ignored"
);
assert.deepEqual(
	inlineFields.parseInlineFields("`code:: nope` and %%hidden:: nope%%"),
	{},
	"inline code spans and comments produce no fields"
);
assert.deepEqual(
	inlineFields.parseInlineFields("| name :: role | x |"),
	{},
	"a markdown table row is never read as a field"
);
assert.deepEqual(
	inlineFields.parseInlineFields("tag:: a\ntag:: b"),
	{ tag: ["a", "b"] },
	"a repeated key collects into a list in document order"
);
assert.deepEqual(
	inlineFields.parseInlineFields("note:: see http://example.com/x"),
	{ note: "see http://example.com/x" },
	"a URL in the value survives intact"
);
assert.deepEqual(inlineFields.parseInlineFields("just some prose about x:y"), {}, "prose with a colon is not a field");
assert.deepEqual(
	inlineFields.parseInlineFields("---\nunterminated: true\nstatus:: doing"),
	{ status: "doing" },
	"an unterminated frontmatter fence still parses the body"
);

// ---- task parsing ---------------------------------------------------------

const taskBody = [
	"# Sprint",
	"- [ ] Write the spec [due:: 2026-03-01] [owner:: Ana] #work",
	"    - [x] Draft outline",
	"- [/] Ship it 📅 2026-03-05 ⏫",
	"```",
	"- [ ] not a task (in a fence)",
	"```",
].join("\n");
const parsedTasks = tasks.parseTasks(taskBody, "Notes/Sprint.md", "Sprint");

assert.equal(parsedTasks.length, 3, "three real tasks, the fenced one excluded");
assert.equal(parsedTasks[0].text, "Write the spec #work", "metadata is stripped from the display text, tags kept");
assert.deepEqual(parsedTasks[0].tags, ["work"], "the task's own tag is collected");
assert.equal(parsedTasks[0].fields.due, "2026-03-01", "a bracketed due date is read");
assert.equal(parsedTasks[0].fields.owner, "Ana", "a second bracketed field is read");
assert.equal(parsedTasks[0].section, "Sprint", "the nearest heading becomes the section");
assert.equal(parsedTasks[0].parent, null, "a top-level task has no parent");
assert.equal(parsedTasks[1].parent, 1, "an indented task points at its parent's line");
assert.equal(parsedTasks[1].done, true, "[x] is done");
assert.equal(parsedTasks[2].status, "/", "a custom status character is preserved");
assert.equal(parsedTasks[2].done, false, "[/] is NOT done");
assert.equal(parsedTasks[2].checked, true, "[/] IS checked (someone has touched it)");
assert.equal(parsedTasks[2].fields.due, "2026-03-05", "the 📅 emoji shorthand becomes `due`");
assert.equal(parsedTasks[2].fields.priority, "high", "the ⏫ emoji becomes priority high");
assert.equal(parsedTasks[2].text, "Ship it", "emoji metadata and its date are stripped from the text");

assert.equal(
	tasks.parseTasks("---\nfoo: 1\n- [ ] in frontmatter\n---\n- [ ] real", "a.md", "a").length,
	1,
	"a checkbox line inside frontmatter is not a task"
);

// An explicit inline field beats the emoji shorthand for the same key.
assert.equal(
	tasks.readTaskFields("x 📅 2026-01-01 [due:: 2026-09-09]").due,
	"2026-09-09",
	"an explicit [due:: …] wins over the 📅 shorthand"
);

// ---- task ids -------------------------------------------------------------

const tid = parsedTasks[0].id;
assert.ok(tasks.isTaskId(tid), "a task id is recognized");
assert.equal(tasks.parseTaskId(tid).path, "Notes/Sprint.md", "the note path round-trips out of a task id");
assert.equal(tasks.parseTaskId("Notes/Sprint.md"), null, "a plain note path is not a task id");
assert.equal(rowId.notePathOf(tid), "Notes/Sprint.md", "notePathOf unwraps a task id");
assert.equal(rowId.notePathOf(`${tid}#3`), "Notes/Sprint.md", "notePathOf unwraps a flattened task id");
assert.equal(rowId.notePathOf("Notes/Sprint.md#2"), "Notes/Sprint.md", "notePathOf strips a flatten suffix");
assert.equal(rowId.notePathOf("Notes/C# notes.md"), "Notes/C# notes.md", "a # in a filename is NOT a flatten suffix");
assert.equal(rowId.isTaskRow("Notes/Sprint.md"), false, "a note row is not a task row");

// Relocation: the line moved, but the hash still finds it.
const movedLines = ["", "", "", "- [ ] Write the spec [due:: 2026-03-01] [owner:: Ana] #work"];
assert.equal(
	tasks.relocateTask(movedLines, tasks.parseTaskId(tid)),
	3,
	"a task shifted down the file is re-found by its text hash"
);
assert.equal(
	tasks.relocateTask(["- [ ] something else"], tasks.parseTaskId(tid)),
	-1,
	"a deleted task reports -1 so the caller can refuse the write"
);
const twinLine = "- [ ] Write the spec [due:: 2026-03-01] [owner:: Ana] #work";
assert.equal(
	tasks.relocateTask(["", twinLine, "", twinLine], tasks.parseTaskId(tid)),
	1,
	"when the recorded line still holds the task, a twin elsewhere is irrelevant"
);
assert.equal(
	tasks.relocateTask(["", "", twinLine, twinLine], tasks.parseTaskId(tid)),
	-1,
	"a MOVED task with an identical twin is ambiguous and the write is refused, not guessed"
);

// ---- task writeback -------------------------------------------------------

const line0 = "- [ ] Write the spec [due:: 2026-03-01] [owner:: Ana] #work";
const w1 = tasks.applyTaskWrites(line0, [{ key: "due", value: "2026-04-02" }]);
assert.equal(
	w1.raw,
	"- [ ] Write the spec [due:: 2026-04-02] [owner:: Ana] #work",
	"an existing bracketed field is rewritten in place"
);
assert.deepEqual(w1.inverse, [{ key: "due", value: "2026-03-01" }], "the inverse restores the previous value");
assert.equal(
	tasks.applyTaskWrites(w1.raw, w1.inverse).raw,
	line0,
	"applying the inverse round-trips the line exactly"
);

const w2 = tasks.applyTaskWrites(line0, [{ key: "status", value: "doing" }]);
assert.equal(
	w2.raw,
	"- [ ] Write the spec [due:: 2026-03-01] [owner:: Ana] #work [status:: doing]",
	"a new field is appended as a bracketed inline field"
);
assert.deepEqual(w2.inverse, [{ key: "status", remove: true }], "the inverse of a new field is its removal");
assert.equal(tasks.applyTaskWrites(w2.raw, w2.inverse).raw, line0, "removing the appended field restores the line");

const emojiLine = "- [ ] Ship it 📅 2026-03-05 ⏫";
assert.equal(
	tasks.applyTaskWrites(emojiLine, [{ key: "due", value: "2026-03-09" }]).raw,
	"- [ ] Ship it 📅 2026-03-09 ⏫",
	"a Tasks-plugin emoji date is updated IN PLACE, not duplicated as [due:: …]"
);
assert.equal(
	tasks.applyTaskWrites(emojiLine, [{ key: "priority", value: "low" }]).raw,
	"- [ ] Ship it 📅 2026-03-05 🔽",
	"a priority write swaps the priority emoji"
);

assert.equal(
	tasks.applyTaskWrites("- [ ] Do it", [{ key: "task.done", value: true }]).raw,
	"- [x] Do it",
	"writing task.done ticks the checkbox"
);
assert.equal(
	tasks.applyTaskWrites("- [x] Do it", [{ key: "task.status", value: "/" }]).raw,
	"- [/] Do it",
	"writing task.status sets an arbitrary status character"
);
assert.deepEqual(
	tasks.applyTaskWrites("- [x] Do it", [{ key: "task.done", value: false }]).inverse,
	[{ key: "task.status", value: "x" }],
	"the inverse of a checkbox change restores the exact previous character"
);
assert.equal(
	tasks.applyTaskWrites("  1. [ ] Nested", [{ key: "task.done", value: true }]).raw,
	"  1. [x] Nested",
	"an ordered-list task keeps its indent and marker"
);
assert.equal(
	tasks.applyTaskWrites("- [ ] Do it ^block-7", [{ key: "due", value: "2026-01-01" }]).raw,
	"- [ ] Do it [due:: 2026-01-01] ^block-7",
	"a new field is inserted BEFORE a trailing block id"
);
assert.equal(
	tasks.applyTaskWrites("- [ ] Do it", [{ key: "note", value: "a [bracket] here\nand a newline" }]).raw,
	"- [ ] Do it [note:: a {bracket} here and a newline]",
	"a value that could break the wrapper is neutralised"
);
assert.equal(
	tasks.applyTaskWrites("- [ ] Do it (note:: old)", [{ key: "note", value: "a (paren) here" }]).raw,
	"- [ ] Do it (note:: a {paren} here)",
	"a round-wrapped field neutralises PARENS, which are what could close it"
);
assert.equal(
	tasks.applyTaskWrites("- [ ] Do it [Due:: 2026-01-01]", [{ key: "due", value: "2026-02-02" }]).raw,
	"- [ ] Do it [Due:: 2026-02-02]",
	"the user's own key spelling is preserved when the value is replaced"
);
assert.equal(
	tasks.applyTaskWrites("not a task at all", [{ key: "due", value: "x" }]).raw,
	"not a task at all",
	"a non-task line is returned untouched"
);

// The row id must survive our own writes, or the second edit lands nowhere.
const beforeHash = tasks.hashTaskText(tasks.stripTaskMetadata("Write the spec [due:: 2026-03-01] #work"));
const afterWrite = tasks.applyTaskWrites("- [ ] Write the spec [due:: 2026-03-01] #work", [
	{ key: "due", value: "2026-12-31" },
	{ key: "owner", value: "Ana" },
]).raw;
assert.equal(
	tasks.hashTaskText(tasks.stripTaskMetadata(/\[.\]\s?(.*)$/.exec(afterWrite)[1])),
	beforeHash,
	"writing fields does not change the task's identity hash"
);

// ---- task rows ------------------------------------------------------------

const taskNote = {
	path: "Notes/Sprint.md",
	name: "Sprint",
	folder: "Notes",
	ext: "md",
	tags: ["project"],
	ctime: 0,
	mtime: 0,
	size: 0,
	frontmatter: { project: "Alpha", status: "active" },
	tasks: parsedTasks,
};
const taskRows = taskRow.buildTaskRows([taskNote]);
assert.equal(taskRows.length, 2, "completed tasks are excluded by default");
assert.equal(taskRows[0].scope.get("project"), "Alpha", "a task inherits its note's frontmatter");
assert.equal(taskRows[0].scope.get("owner"), "Ana", "the task's own field wins where it has one");
assert.equal(taskRows[0].scope.get("file.name"), "Sprint", "file.* still describes the host note");
assert.deepEqual(
	taskRows[0].scope.get("file.tags"),
	["project", "work"],
	"file.tags is the union of the note's tags and the task line's"
);
assert.equal(taskRows[0].scope.get("task.done"), false, "task.done is exposed");
assert.equal(taskRows[0].id, parsedTasks[0].id, "the row id is the task id");
assert.equal(
	taskRow.buildTaskRows([taskNote], {}, undefined, { includeDone: true }).length,
	3,
	"includeDone brings completed tasks back"
);
assert.equal(
	taskRow.buildTaskRows([taskNote], {}, undefined, { includeSubtasks: false }).length,
	2,
	"excluding subtasks drops the nested one"
);
assert.equal(
	taskRow.makeTaskRow(taskNote, { ...parsedTasks[0], text: "" }).name,
	"Sprint",
	"a task with no text left falls back to the note name"
);

// ---- link graph + traversal ----------------------------------------------

const graph = linkIndex.buildLinkGraph({
	"Tasks/A.md": { "Projects/Alpha.md": 1 },
	"Tasks/B.md": { "Projects/Alpha.md": 2 },
});
assert.deepEqual(graph.outlinks.get("Tasks/A.md"), ["Projects/Alpha.md"], "outlinks come straight from the adjacency");
assert.deepEqual(
	graph.inlinks.get("Projects/Alpha.md"),
	["Tasks/A.md", "Tasks/B.md"],
	"inlinks are the inverted adjacency"
);
const props = linkIndex.linkProps("Projects/Alpha.md", graph);
assert.equal(props["file.inlinkCount"], 2, "inlinkCount counts the real backlinks");
assert.ok(props["file.inlinks"].includes("A"), "basenames are queryable alongside paths");
assert.deepEqual(linkIndex.linkProps("Nowhere.md", graph)["file.inlinks"], [], "an unlinked note has empty link props");

const alphaScope = { get: (k) => ({ status: "shipping", owner: "[[Ana]]" })[k] };
const anaScope = { get: (k) => ({ email: "ana@example.com" })[k] };
const lookup = (name) => ({ alpha: alphaScope, ana: anaScope })[name.toLowerCase()];
const hostScope = { get: (k) => ({ project: "[[Alpha]]" })[k] };
assert.equal(
	linkIndex.traverseLink(hostScope, "project.status", lookup),
	"shipping",
	"project.status reads the LINKED note's property"
);
assert.equal(
	linkIndex.traverseLink(hostScope, "project.owner.email", lookup),
	"ana@example.com",
	"traversal hops more than once"
);
assert.equal(linkIndex.traverseLink(hostScope, "project.nope", lookup), undefined, "a missing target property is undefined");
assert.equal(linkIndex.traverseLink(hostScope, "missing.status", lookup), undefined, "a non-link head is undefined");
const cyclicA = { get: (k) => (k === "next" ? "[[B]]" : undefined) };
const cyclicB = { get: (k) => (k === "next" ? "[[A]]" : undefined) };
const cyclicLookup = (n) => ({ a: cyclicA, b: cyclicB })[n.toLowerCase()];
assert.equal(
	linkIndex.traverseLink(cyclicA, "next.next.next.next.next.next", cyclicLookup),
	undefined,
	"a link cycle terminates on the hop budget instead of recursing forever"
);

// A real row resolves link traversal end to end.
const noteAlpha = {
	path: "Projects/Alpha.md",
	name: "Alpha",
	folder: "Projects",
	ext: "md",
	tags: [],
	ctime: 0,
	mtime: 0,
	size: 0,
	frontmatter: { phase: "build" },
};
const noteTask = {
	path: "Tasks/T1.md",
	name: "T1",
	folder: "Tasks",
	ext: "md",
	tags: [],
	ctime: 0,
	mtime: 0,
	size: 0,
	frontmatter: { project: "[[Alpha]]" },
};
const traversed = resolve.resolveRows([noteAlpha, noteTask], { filters: null, formulas: {} }, null, {
	linkTraversal: true,
});
const t1 = traversed.find((r) => r.name === "T1");
assert.equal(t1.scope.get("project.phase"), "build", "resolveRows wires link traversal across the row set");
const untraversed = resolve.resolveRows([noteAlpha, noteTask], { filters: null, formulas: {} });
assert.equal(
	untraversed.find((r) => r.name === "T1").scope.get("project.phase"),
	undefined,
	"traversal stays off unless asked for — no behaviour change for existing users"
);

// A flat frontmatter key containing a dot must not be hijacked by traversal.
const dotted = resolve.resolveRows(
	[{ ...noteTask, frontmatter: { project: "[[Alpha]]", "project.phase": "override" } }],
	{ filters: null, formulas: {} },
	null,
	{ linkTraversal: true }
);
assert.equal(dotted[0].scope.get("project.phase"), "override", "a real flat key beats a link traversal of the same name");

// ---- inline fields in a row scope ----------------------------------------

const inlineNote = {
	path: "n.md",
	name: "n",
	folder: "",
	ext: "md",
	tags: [],
	ctime: 0,
	mtime: 0,
	size: 0,
	frontmatter: { status: "fm" },
	inline: { status: "inline", effort: 5 },
};
const inlineRow = rowmod.makeRow(inlineNote);
assert.equal(inlineRow.scope.get("effort"), 5, "an inline field resolves like a frontmatter key");
assert.equal(inlineRow.scope.get("status"), "fm", "frontmatter wins when both define the same key");

// ---- FLATTEN --------------------------------------------------------------

function flatNote(name, assignees) {
	return {
		path: `${name}.md`,
		name,
		folder: "",
		ext: "md",
		tags: [],
		ctime: 0,
		mtime: 0,
		size: 0,
		frontmatter: { assignees },
	};
}
const flatRows = resolve.resolveRows(
	[flatNote("A", ["Ana", "Ben"]), flatNote("B", "Cy"), flatNote("C", [])],
	{ filters: null, formulas: {} },
	null,
	{ flatten: { expression: "assignees" } }
);
assert.equal(flatRows.length, 3, "two assignees expand to two rows; an empty list drops out");
assert.deepEqual(
	flatRows.map((r) => r.scope.get("assignees")),
	["Ana", "Ben", "Cy"],
	"each expanded row sees a single scalar"
);
assert.equal(flatRows[0].id, "A.md#0", "a split row gets a unique id");
assert.equal(flatRows[2].id, "B.md", "an unsplit row keeps its plain note id");
assert.equal(rowId.notePathOf(flatRows[0].id), "A.md", "the write path is recoverable from a split id");

const keptEmpty = resolve.resolveRows([flatNote("C", [])], { filters: null, formulas: {} }, null, {
	flatten: { expression: "assignees", keepEmpty: true },
});
assert.equal(keptEmpty.length, 1, "keepEmpty keeps the unassigned row");
assert.equal(keptEmpty[0].scope.get("assignees"), null, "the unassigned row binds null");

const bound = resolve.resolveRows([flatNote("A", ["Ana", "Ben"])], { filters: null, formulas: {} }, null, {
	flatten: { expression: "assignees", as: "person" },
});
assert.equal(bound[0].scope.get("person"), "Ana", "an explicit binding name is honoured");
assert.deepEqual(bound[0].scope.get("assignees"), ["Ana", "Ben"], "the original list is untouched under its own name");

// The saved filter runs AFTER the flatten, so it can see the binding.
const postFiltered = resolve.resolveRows(
	[flatNote("A", ["Ana", "Ben"])],
	{ filters: null, formulas: {} },
	'assignees == "Ben"',
	{ flatten: { expression: "assignees" } }
);
assert.equal(postFiltered.length, 1, "the extra filter narrows the FLATTENED rows");
assert.equal(postFiltered[0].scope.get("assignees"), "Ben", "and keeps the right one");

assert.equal(flatten.defaultBinding("assignees"), "assignees", "a bare identifier binds to itself");
assert.equal(flatten.defaultBinding("split(x, 1)"), "value", "a computed expression binds to `value`");
assert.equal(flatten.sourceRowId("a.md#12"), "a.md", "sourceRowId strips a numeric suffix");
assert.equal(flatten.sourceRowId("a#b.md"), "a#b.md", "sourceRowId leaves a non-numeric # alone");

// ---- hastag ---------------------------------------------------------------

const tagScope = { get: (k) => (k === "file.tags" ? ["project/alpha", "work"] : undefined) };
assert.equal(expr.evaluateSafe('hastag(file.tags, "project")', tagScope), true, "hastag matches a parent tag");
assert.equal(expr.evaluateSafe('hastag(file.tags, "#work")', tagScope), true, "hastag tolerates a leading #");
assert.equal(expr.evaluateSafe('hastag(file.tags, "proj")', tagScope), false, "hastag does not match a tag prefix");
assert.equal(expr.evaluateSafe('hastag(file.tags, "")', tagScope), false, "an empty needle matches nothing");

// ---- DQL converter --------------------------------------------------------

const c1 = dql.convertDql('TABLE status, due AS "Deadline"\nFROM #project AND -"Archive"\nWHERE status != "done"');
assert.equal(c1.query.kind, "table", "TABLE is recognised");
assert.deepEqual(
	c1.filters,
	{
		and: [
			'hastag(file.tags, "project") && !((startswith(file.path, "Archive/") || file.path == "Archive.md"))',
			'status != "done"',
		],
	},
	"FROM and WHERE become one AND filter"
);
assert.deepEqual(c1.order, ["status", "due"], "bare properties become column order, not formulas");
assert.deepEqual(c1.formulas, {}, "no formulas are invented for plain properties");

const c2 = dql.convertDql('TABLE round(done / total * 100) AS "Pct" FROM "Projects" WHERE done > 0 AND total > 0');
assert.deepEqual(
	c2.formulas,
	{ Pct: "round(done / total * 100)" },
	"a computed column becomes a named formula"
);
assert.deepEqual(c2.order, ["formula.Pct"], "the formula is referenced in the column order");
assert.ok(
	String(c2.filters.and[1]).includes("&&"),
	"the DQL keyword `AND` becomes `&&`"
);

const c3 = dql.convertDql('LIST FROM [[Alpha]] WHERE contains(tags, "x")');
assert.equal(
	c3.filters.and[0],
	'contains(file.outlinks, "Alpha")',
	"FROM [[A]] means pages that link TO A, i.e. A is in their outlinks"
);
assert.equal(
	dql.convertDql("LIST FROM outgoing([[Alpha]])").filters,
	'contains(file.inlinks, "Alpha")',
	"outgoing([[A]]) means the pages A links to - A is in THEIR inlinks, not their outlinks"
);
assert.equal(
	dql.convertDql("LIST FROM incoming([[Alpha]])").filters,
	'contains(file.outlinks, "Alpha")',
	"incoming([[A]]) is the same direction as the bare link form"
);

const c4 = dql.convertDql('TABLE file.name WHERE file.name = "Alpha"');
assert.equal(c4.filters, 'file.name == "Alpha"', "a lone `=` becomes `==`");

const c5 = dql.convertDql('TABLE x WHERE regexmatch("^a", file.name)');
assert.equal(c5.filters, null, "an unconvertible WHERE clause is dropped, not mistranslated");
assert.equal(c5.errors.length, 1, "and the drop is reported");
assert.ok(c5.errors[0].includes("regexmatch()"), "the report names the construct that failed");

const c6 = dql.convertDql('TABLE x WHERE due < date(today) AND status != "done"');
assert.equal(c6.filters, 'due < today() && status != "done"', "date(today) becomes today()");

const c7 = dql.convertDql("TASK WHERE !completed");
assert.equal(c7.query.kind, "task", "TASK is recognised");
assert.equal(c7.suggestedView, "kanban", "a task query suggests the board");
assert.ok(
	c7.warnings.some((w) => w.includes("Tasks")),
	"and tells the user to switch the row source"
);

const c8 = dql.convertDql('TABLE x FROM #a GROUP BY status SORT due DESC LIMIT 10');
assert.equal(c8.suggestedSettings.kanbanGroupBy, "status", "GROUP BY drives the board columns");
assert.ok(c8.warnings.some((w) => w.startsWith("SORT")), "SORT is reported as a view control");
assert.ok(c8.warnings.some((w) => w.includes("LIMIT 10")), "LIMIT is reported as unsupported");

const c9 = dql.convertDql('TABLE x FLATTEN assignees AS person FROM "Work"');
assert.deepEqual(c9.query.flatten, { expr: "assignees", as: "person" }, "FLATTEN … AS … is parsed");
assert.equal(c9.suggestedSettings.flattenAs, "person", "and is surfaced as a setting");

const c10 = dql.convertDql('TABLE x WHERE text = "FROM the start AND onwards"');
assert.equal(
	c10.filters,
	'text == "FROM the start AND onwards"',
	"clause keywords inside a string literal are not clause boundaries"
);

const c11 = dql.convertDql("```dataview\nLIST FROM #inbox\n```");
assert.equal(c11.filters, 'hastag(file.tags, "inbox")', "a pasted fenced block is unwrapped");

assert.ok(dql.convertDql("SELECT * FROM notes").errors.length > 0, "a non-DQL paste reports an error");

const yaml = dql.conversionToBaseYaml(c1);
assert.ok(yaml.includes("filters:"), "the emitted base has a filters block");
assert.ok(yaml.includes("views:"), "and a views block");
assert.ok(yaml.includes("# Generated by Bases Power Pack"), "and says where it came from");
assert.ok(
	dql.conversionToBaseYaml(c5).includes("# DROPPED:"),
	"a dropped clause is recorded as a comment in the file itself"
);
assert.ok(
	dql.conversionToBaseYaml(dql.convertDql(`TABLE x WHERE a == "it's"`)).includes("it''s"),
	"a single quote in an expression is escaped for YAML"
);
assert.equal(dql.formulaName("Due date", new Set()), "Due_date", "an alias becomes a safe formula name");
assert.equal(dql.formulaName("x", new Set(["x"])), "x_2", "a colliding formula name is suffixed");
assert.equal(dql.formulaName("2026", new Set()), "c_2026", "a leading digit is prefixed");

// ---- Round-2 hardening: the defects adversarial review surfaced -----------

// Emoji prose must never be mistaken for metadata, and must never be rewritten.
const proseLine = "- [ ] Discuss \u{1F4C5} design with Ana";
assert.equal(
	tasks.readTaskFields("Discuss \u{1F4C5} design with Ana").due,
	undefined,
	"an emoji followed by a WORD is prose, not a due date"
);
assert.equal(
	tasks.stripTaskMetadata("Discuss \u{1F4C5} design with Ana"),
	"Discuss \u{1F4C5} design with Ana",
	"unvalidated emoji prose survives the display-text strip intact"
);
assert.equal(
	tasks.applyTaskWrites(proseLine, [{ key: "due", value: "2026-05-05" }]).raw,
	"- [ ] Discuss \u{1F4C5} design with Ana [due:: 2026-05-05]",
	"writing a due date must NOT overwrite the word after a prose emoji"
);
assert.deepEqual(
	tasks.emojiSpans("x \u{1F4C5} 2026-01-02 y"),
	[{ key: "due", value: "2026-01-02", start: 2, end: 15 }],
	"a validated emoji span reports the exact source range it owns"
);

// The blanket date strip used to eat real prose, and collapse task identities.
assert.equal(
	tasks.stripTaskMetadata("Compare 2025-01-01 with 2026-01-01"),
	"Compare 2025-01-01 with 2026-01-01",
	"bare ISO dates in prose are part of the task text, not metadata"
);
assert.notEqual(
	tasks.hashTaskText(tasks.stripTaskMetadata("Review 2025-01-01")),
	tasks.hashTaskText(tasks.stripTaskMetadata("Review 2026-01-01")),
	"two tasks differing only by a prose date keep DIFFERENT identities"
);

// A value that cannot live in the emoji slot falls back to a field that wins.
const custom = tasks.applyTaskWrites("- [ ] Ship \u{1F4C5} 2026-03-05", [{ key: "due", value: "next tuesday" }]);
assert.equal(
	custom.raw,
	"- [ ] Ship \u{1F4C5} 2026-03-05 [due:: next tuesday]",
	"a non-date value is stored as a field rather than written into the emoji slot"
);
assert.equal(
	tasks.readTaskFields("Ship \u{1F4C5} 2026-03-05 [due:: next tuesday]").due,
	"next tuesday",
	"and the field wins over the stale emoji when read back"
);
assert.equal(
	tasks.applyTaskWrites("- [ ] Ship \u{23EB}", [{ key: "priority", value: "urgent" }]).raw,
	"- [ ] Ship \u{23EB} [priority:: urgent]",
	"a priority outside the five Tasks levels is stored as a field, not silently dropped"
);

// Case-insensitive writeback must record a RESTORING inverse, not a delete.
const mixedCase = "- [ ] Do it [Due:: 2026-01-01]";
const mc = tasks.applyTaskWrites(mixedCase, [{ key: "due", value: "2026-02-02" }]);
assert.equal(
	mc.raw,
	"- [ ] Do it [Due:: 2026-02-02]",
	"a differently-cased field is the one overwritten, keeping the user's own key spelling"
);
assert.deepEqual(
	mc.inverse,
	[{ key: "due", value: "2026-01-01" }],
	"the inverse RESTORES the old value instead of deleting the field"
);
assert.equal(
	tasks.readTaskFields(tasks.applyTaskWrites(mc.raw, mc.inverse).raw).due,
	"2026-01-01",
	"so undo really puts the value back"
);

// A markdown link is not a task.
assert.equal(
	tasks.parseTasks("- [x](https://example.com) see this", "a.md", "a").length,
	0,
	"`- [x](url)` is a markdown link, not a completed task"
);
assert.equal(
	tasks.parseTasks("- [ ]", "a.md", "a").length,
	1,
	"an empty checkbox at end of line is still a task"
);

// Fences must match on delimiter character AND run length.
assert.deepEqual(
	inlineFields.parseInlineFields("```\n~~~\nfake:: value\n```\nreal:: value"),
	{ real: "value" },
	"a ~~~ line does not close a ``` fence"
);
assert.deepEqual(
	inlineFields.parseInlineFields("````\n```\nfake:: value\n```\n````\nreal:: value"),
	{ real: "value" },
	"a ```-fenced example inside a ````-fence stays inert"
);
assert.equal(
	tasks.parseTasks("```\n- [ ] example\n```\n- [ ] real", "a.md", "a").length,
	1,
	"a checkbox inside a fence is not a task row"
);

// Multi-line %% comments hide their contents from both parsers.
assert.deepEqual(
	inlineFields.parseInlineFields("%%\nhidden:: value\n%%\nreal:: value"),
	{ real: "value" },
	"a field inside a multi-line comment is not read"
);
assert.equal(
	tasks.parseTasks("%%\n- [ ] hidden\n%%\n- [ ] real", "a.md", "a").length,
	1,
	"a checkbox inside a multi-line comment is not a writable row"
);
assert.deepEqual(
	inlineFields.parseInlineFields("[a:: 1] %% [b:: 2] %% [c:: 3]"),
	{ a: 1, c: 3 },
	"a bracketed field inside an inline comment is dropped; the ones outside survive"
);

// A URL inside a markdown link's parens must not invent a property.
assert.deepEqual(
	inlineFields.parseInlineFields("see [docs](https://ex.com/a::b)"),
	{},
	"a `::` inside a URL is not an inline field"
);

// FLATTEN must rebuild the row so FORMULAS see the bound scalar.
const flatFormula = resolve.resolveRows(
	[
		{
			path: "F.md",
			name: "F",
			folder: "",
			ext: "md",
			tags: [],
			ctime: 0,
			mtime: 0,
			size: 0,
			frontmatter: { assignees: ["Ana", "Ben"] },
		},
	],
	{ filters: null, formulas: { label: 'upper(assignees)' } },
	null,
	{ flatten: { expression: "assignees" } }
);
assert.deepEqual(
	flatFormula.map((r) => r.scope.get("label")),
	["ANA", "BEN"],
	"a base formula computes against the FLATTENED value, not the original list"
);

// Link traversal terminates even when every hop re-enters a live scope.
const cycleA = {
	path: "A.md",
	name: "A",
	folder: "",
	ext: "md",
	tags: [],
	ctime: 0,
	mtime: 0,
	size: 0,
	frontmatter: { next: "[[B]]" },
};
const cycleB = { ...cycleA, path: "B.md", name: "B", frontmatter: { next: "[[A]]" } };
const cycled = resolve.resolveRows([cycleA, cycleB], { filters: null, formulas: {} }, null, { linkTraversal: true });
assert.equal(cycled[0].scope.get("next.next.next"), "[[B]]", "a 3-hop cycle resolves instead of recursing forever");
assert.equal(
	cycled[0].scope.get("next.next.next.next.next.next.next.next"),
	undefined,
	"a path past the hop budget gives up quietly"
);

// A lower-case word that happens to be a DQL keyword is not a clause boundary.
assert.equal(
	dql.convertDql('TABLE x WHERE list = 1').filters,
	"list == 1",
	"`list` in a WHERE clause is a property, not a LIST clause"
);
assert.equal(
	dql.convertDql('TABLE x\nwhere sort = 2').filters,
	"sort == 2",
	"a lower-case clause keyword IS honoured when it starts its own line"
);

// ---- spliceTaskLine: the one operation that rewrites a user's note ---------

function refFor(body, path = "n.md") {
	const t = tasks.parseTasks(body, path, "n");
	return tasks.parseTaskId(t[0].id);
}

const lfDoc = "# Notes\n\n- [ ] Ship it\n- [ ] Other\n";
const lfRef = refFor(lfDoc);
const lfOut = tasks.spliceTaskLine(lfDoc, lfRef, [{ key: "due", value: "2026-01-02" }]);
assert.equal(lfOut.status, "written", "a locatable task is written");
assert.equal(
	lfOut.text,
	"# Notes\n\n- [ ] Ship it [due:: 2026-01-02]\n- [ ] Other\n",
	"only the target line changes; the trailing newline survives"
);
assert.equal(
	tasks.spliceTaskLine(lfOut.text, lfRef, lfOut.inverse).text,
	lfDoc,
	"applying the inverse restores the document byte for byte"
);

const crlfDoc = "# Notes\r\n\r\n- [ ] Ship it\r\n- [ ] Other\r\n";
const crlfOut = tasks.spliceTaskLine(crlfDoc, refFor(crlfDoc), [{ key: "due", value: "2026-01-02" }]);
assert.equal(
	crlfOut.text,
	"# Notes\r\n\r\n- [ ] Ship it [due:: 2026-01-02]\r\n- [ ] Other\r\n",
	"CRLF line endings are preserved exactly"
);
assert.ok(!crlfOut.text.includes("\r\n\n"), "and no LF-only separator is introduced");

const mixedDoc = "a\r\n- [ ] Ship it\nb";
const mixedOut = tasks.spliceTaskLine(mixedDoc, refFor(mixedDoc), [{ key: "x", value: "1" }]);
assert.equal(mixedOut.text, "a\r\n- [ ] Ship it [x:: 1]\nb", "a mixed-ending file keeps each separator as it was");

const noTrailing = "- [ ] Ship it";
assert.equal(
	tasks.spliceTaskLine(noTrailing, refFor(noTrailing), [{ key: "x", value: "1" }]).text,
	"- [ ] Ship it [x:: 1]",
	"a file with no trailing newline does not gain one"
);

assert.equal(
	tasks.spliceTaskLine("- [ ] Ship it", refFor("- [ ] Ship it"), [{ key: "due", remove: true }]).status,
	"unchanged",
	"removing a field that was never there is a no-op, not a phantom undo entry"
);
assert.equal(
	tasks.spliceTaskLine("- [ ] Something else entirely", lfRef, [{ key: "x", value: "1" }]).status,
	"notfound",
	"a vanished task reports notfound so the caller can refuse"
);
assert.equal(
	tasks.spliceTaskLine("- [ ] Ship it\n- [ ] Ship it", lfRef, [{ key: "x", value: "1" }]).status,
	"notfound",
	"an ambiguous twin after the line moved is refused rather than guessed"
);
assert.equal(
	tasks.spliceTaskLine("- [ ] Something else entirely", lfRef, [{ key: "x", value: "1" }]).text,
	"- [ ] Something else entirely",
	"a refused write leaves the document untouched"
);

// A second write must still land after the first — the id survives our own edits.
const once = tasks.spliceTaskLine(lfDoc, lfRef, [{ key: "due", value: "2026-01-02" }]);
const twice = tasks.spliceTaskLine(once.text, lfRef, [{ key: "owner", value: "Ana" }]);
assert.equal(twice.status, "written", "the row id still resolves after the plugin's own write");
assert.equal(
	twice.text,
	"# Notes\n\n- [ ] Ship it [due:: 2026-01-02] [owner:: Ana]\n- [ ] Other\n",
	"and the second field is appended alongside the first"
);

// ---- Round-3 hardening ----------------------------------------------------

// Emoji values need a trailing boundary, or a prefix gets claimed and mangled.
assert.deepEqual(tasks.emojiSpans("x \u{1F4C5} 2026-10-20abc"), [], "a date-shaped PREFIX of a longer token is not metadata");
assert.equal(
	tasks.applyTaskWrites("- [ ] Do \u{1F4C5} 2026-10-20abc", [{ key: "due", value: "2026-01-01" }]).raw,
	"- [ ] Do \u{1F4C5} 2026-10-20abc [due:: 2026-01-01]",
	"so a write appends a field instead of leaving `abc` stranded"
);

// Display text is stripped only where a PARSER claimed a span.
assert.equal(
	tasks.stripTaskMetadata("Fix [http://a::b] link"),
	"Fix [http://a::b] link",
	"a bracketed URL the field parser rejects is NOT removed from the display text"
);
assert.equal(
	tasks.stripTaskMetadata("note [due:: \u{1F4C5} 2026-01-01] end"),
	"note end",
	"an emoji span nested inside a field span is removed once, not twice"
);

// Batch dedup uses the same casing rule as the lookup and the writer.
const dedup = tasks.applyTaskWrites("- [ ] Do it [due:: 2026-01-01]", [
	{ key: "due", value: "2026-02-02" },
	{ key: "Due", value: "2026-03-03" },
]);
assert.equal(dedup.raw, "- [ ] Do it [due:: 2026-02-02]", "the second, differently-cased write to the same field is dropped");
assert.deepEqual(dedup.inverse, [{ key: "due", value: "2026-01-01" }], "and only one inverse is recorded");

// Field keys are queryable in either case.
assert.equal(tasks.readTaskFields("x [Due:: 2026-01-01]").due, "2026-01-01", "a capitalised field is reachable in lower case");
assert.equal(tasks.readTaskFields("x [Due:: 2026-01-01]").Due, "2026-01-01", "and under its own spelling");
assert.equal(
	inlineFields.parseInlineFields("Status:: doing").status,
	"doing",
	"an inline field key is aliased to lower case, as Dataview does"
);
assert.equal(
	inlineFields.parseInlineFields("Due:: a\ndue:: b").due,
	"b",
	"an explicitly lower-case key wins over the alias"
);

// Fence closers carry no info string.
assert.deepEqual(
	inlineFields.parseInlineFields("```\n```ts\nfake:: value\n```\nreal:: value"),
	{ real: "value" },
	"a ```ts line inside a fence is content, not a closing delimiter"
);

// A keyword used as an operand is an identifier, not a clause.
assert.equal(
	dql.convertDql('TABLE x WHERE SORT = "manual"').filters,
	'SORT == "manual"',
	"`WHERE SORT = ...` stays one WHERE clause"
);
assert.deepEqual(
	dql.convertDql("TABLE x SORT due DESC").query.sort,
	[{ expr: "due", dir: "desc" }],
	"a genuine SORT clause is still recognised"
);

fs.unlinkSync(outfile);
console.log("engine tests passed");

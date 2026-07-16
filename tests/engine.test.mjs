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
			export * as kanban from "./src/query/kanban.ts";
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
const { expr, filter, rollup, gantt, dates, inlineEdit, kanban, kanbanActions, base, resolve, rowmod } = m;

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
	kanbanActions.buildQuickAddPath("Inbox/Boards", "New done 2026-01-15 09-30"),
	"Inbox/Boards/New done 2026-01-15 09-30.md",
	"buildQuickAddPath places quick-add notes in the configured folder"
);
assert.equal(
	kanbanActions.buildQuickAddContent("status", "done", "New done 2026-01-15 09-30"),
	'---\nstatus: "done"\n---\n\n# New done 2026-01-15 09-30\n',
	"buildQuickAddContent creates note content with frontmatter and heading"
);
assert.equal(
	kanbanActions.buildQuickAddContent("status", "Blocked: waiting", "New card"),
	'---\nstatus: "Blocked: waiting"\n---\n\n# New card\n',
	"buildQuickAddContent quotes YAML-significant column names so frontmatter stays valid"
);

fs.unlinkSync(outfile);
console.log("engine tests passed");

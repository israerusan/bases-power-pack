import { makeRow, type RawNote, type Row, type ScopeContext } from "../model/row";
import { buildTaskRows, makeTaskRow, type TaskRowOptions } from "../model/taskRow";
import { evaluateFilter, type FilterNode } from "../query/filter";
import { flattenRows, overlayScope, type FlattenOptions, type RebindRow } from "../query/flatten";
import type { TaskItem } from "../query/tasks";
import type { EvalScope } from "../engine/expression";

/** What a view's rows are built FROM: whole notes, or individual checkbox lines. */
export type RowSource = "notes" | "tasks";

export interface ResolveOptions {
	/** Build one row per note (default) or one per `- [ ]` task line. */
	source?: RowSource;
	/** Inclusion rules when `source` is "tasks". */
	taskOptions?: TaskRowOptions;
	/** Enable `project.status` traversal through wikilinks. */
	linkTraversal?: boolean;
	/** Expand a multi-valued property into one row per value. */
	flatten?: FlattenOptions | null;
}

/**
 * Resolve the rows of a base: the vault's notes (or their tasks), with the
 * base's formulas available, kept only if they pass the base filter AND an
 * optional extra filter (e.g. an active saved filter). This is the pure heart
 * of "views for Bases" — given a base definition and the vault's notes, it
 * produces the filtered row set the kanban / calendar / gantt views render.
 *
 * Clause order mirrors Dataview, and the ordering is load-bearing:
 *
 *   rows → base filter → FLATTEN → saved filter
 *
 * The base filter runs BEFORE the flatten so it is evaluated once per note
 * rather than once per expanded copy; the saved filter runs AFTER, so it can
 * reference the flattened binding (`FLATTEN assignees` then "only Ana's").
 */
export function resolveRows(
	notes: RawNote[],
	def: { filters: FilterNode; formulas: Record<string, string> },
	extraFilter?: FilterNode,
	options?: ResolveOptions
): Row[] {
	const opts = options ?? {};
	const formulas = def.formulas;

	// Link traversal needs every note's scope addressable by name/path. The map
	// is filled after the scopes exist; scopes resolve lazily, so a row created
	// before the map is populated still traverses correctly.
	const noteScopes = new Map<string, EvalScope>();
	const ctx: ScopeContext | undefined = opts.linkTraversal
		? { lookup: (nameOrPath: string) => noteScopes.get(linkKey(nameOrPath)) }
		: undefined;

	const flattening = !!opts.flatten && opts.flatten.expression.trim().length > 0;
	// Where each row came from, so FLATTEN can REBUILD it with the bound value in
	// place rather than layering a scope over it — rebuilding is what makes the
	// base's formulas see the flattened scalar instead of the original list.
	// Only populated when flattening: on a 10k-note vault this map would
	// otherwise be built on every resolve and never read.
	const origin = new Map<string, { note: RawNote; task?: TaskItem }>();

	let rows: Row[];
	if (opts.source === "tasks") {
		if (ctx) indexNoteScopes(notes, formulas, ctx, noteScopes);
		rows = buildTaskRows(notes, formulas, ctx, opts.taskOptions);
		if (flattening) {
			for (const note of notes) {
				for (const task of note.tasks ?? []) origin.set(task.id, { note, task });
			}
		}
	} else {
		rows = notes.map((note) => makeRow(note, formulas, ctx));
		for (const row of rows) {
			if (flattening) origin.set(row.id, { note: row.note });
			if (ctx) registerScope(row.note, row.scope, noteScopes);
		}
	}

	rows = rows.filter((row) => evaluateFilter(def.filters, row.scope));

	if (flattening && opts.flatten) {
		const rebind: RebindRow = (row, id, binding, value) => {
			const src = origin.get(row.id);
			const overlay = { [binding]: value };
			if (!src) return { id, name: row.name, note: row.note, scope: overlayScope(row.scope, overlay) };
			const rebuilt = src.task
				? makeTaskRow(src.note, src.task, formulas, ctx, overlay)
				: makeRow(src.note, formulas, ctx, overlay);
			return { ...rebuilt, id };
		};
		rows = flattenRows(rows, opts.flatten, rebind);
	}

	if (extraFilter !== null && extraFilter !== undefined && extraFilter !== "") {
		rows = rows.filter((row) => evaluateFilter(extraFilter, row.scope));
	}
	return rows;
}

/** Lower-cased lookup key for a link target: basename, path, or path without
 * its `.md` extension all resolve to the same note. */
function linkKey(nameOrPath: string): string {
	return nameOrPath.trim().replace(/\.md$/i, "").toLowerCase();
}

function registerScope(note: RawNote, scope: EvalScope, into: Map<string, EvalScope>): void {
	// Path first, then basename — a basename collision between folders resolves
	// to whichever note comes last, which is the same rule `indexByName` uses.
	into.set(linkKey(note.path), scope);
	into.set(linkKey(note.name), scope);
}

function indexNoteScopes(
	notes: readonly RawNote[],
	formulas: Record<string, string>,
	ctx: ScopeContext,
	into: Map<string, EvalScope>
): void {
	for (const note of notes) registerScope(note, makeRow(note, formulas, ctx).scope, into);
}

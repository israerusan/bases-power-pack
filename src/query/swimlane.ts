import { toStr } from "../engine/expression";
import type { Row } from "../model/row";
import type { PropertyWrite } from "../views/viewData";
import {
	buildKanbanColumns,
	rowMatchesKanbanSearch,
	sortKanbanColumn,
	type BuildKanbanColumnsOptions,
	type KanbanColumn,
} from "./kanban";

/**
 * Swimlane engine. A swimlane board is the flat Kanban grouped a SECOND time —
 * columns by one property (the group-by), horizontal bands ("lanes") by another.
 * The market-leading Kanban plugin has never shipped this despite it being its
 * oldest open request; here it falls out almost for free because the board is
 * already a group-by over data.
 *
 * The crux is column ALIGNMENT: every lane must show the same columns, in the
 * same order, including empty cells, so the board reads as a grid. So the column
 * set/order is computed once from ALL rows (via {@link buildKanbanColumns}), then
 * each lane buckets only its own rows into that fixed set. Pure and DOM-free, so
 * the 2-D partition (and its lane ordering / truncation) is unit-tested.
 */

/** The lane shown for a row whose lane value is missing or empty. */
export const SWIMLANE_EMPTY = "(empty)";

/** The frontmatter write that moves a card into a swimlane. Dropping into the
 * "(empty)" band CLEARS the lane property rather than writing the literal sentinel
 * "(empty)", so the note never carries a bogus real value that base filters/exports
 * would see. (quickAddInCell skips the write entirely for that case.) */
export function laneWrite(laneProp: string, laneKey: string | null): PropertyWrite {
	return laneKey === SWIMLANE_EMPTY || laneKey === null
		? { key: laneProp, remove: true }
		: { key: laneProp, value: laneKey };
}

/** Guardrail so a swimlane on a high-cardinality property can't build a runaway
 * number of bands. Distinct lanes past this are dropped and flagged. */
const DEFAULT_MAX_LANES = 30;

export interface BuildSwimlanesOptions extends BuildKanbanColumnsOptions {
	/** Frontmatter property (or formula) whose value splits rows into lanes. */
	laneProp: string;
	/** Explicit top-to-bottom lane order (by value); lanes not listed keep their
	 * natural order after the listed ones. Mirrors `columnOrder` for columns. */
	laneOrder?: string[];
	maxLanes?: number;
}

export interface Swimlane {
	/** The lane's value ("(empty)" for a missing/blank lane property). */
	key: string;
	/** Columns aligned to the shared {@link SwimlaneModel.columnNames} order —
	 * every global column appears, empty cells included, so the grid lines up. */
	columns: KanbanColumn[];
	/** Cards shown in this lane across all columns (respects search/hide-done). */
	total: number;
}

export interface SwimlaneModel {
	/** The shared, ordered column set — the board's single header row. */
	columnNames: string[];
	lanes: Swimlane[];
	/** True when distinct lanes exceeded the cap and the tail was dropped. */
	truncatedLanes: boolean;
}

/** A row's swimlane key (missing/blank → the "(empty)" band). Shared by the view's
 * drag/quick-add so the rendered lane and the model's lane membership always agree. */
export function laneKeyOf(row: Row, laneProp: string): string {
	return toStr(row.scope.get(laneProp)).trim() || SWIMLANE_EMPTY;
}

/**
 * Order lane keys for display: explicit `laneOrder` first (by its index), then
 * the rest in natural order, with the "(empty)" lane always forced to the end so
 * a band of un-tagged notes never splits the real lanes. Mirrors the column
 * ordering rule so lanes and columns behave the same way.
 */
function orderLaneKeys(keys: string[], laneOrder: string[]): string[] {
	const rank = new Map(laneOrder.map((name, index) => [name, index] as const));
	return [...keys].sort((a, b) => {
		if (a === SWIMLANE_EMPTY) return 1;
		if (b === SWIMLANE_EMPTY) return -1;
		const ra = rank.get(a) ?? Infinity;
		const rb = rank.get(b) ?? Infinity;
		if (ra !== rb) return ra - rb;
		return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
	});
}

export function buildSwimlanes(rows: Row[], options: BuildSwimlanesOptions): SwimlaneModel {
	const groupBy = options.groupBy || "status";
	const laneProp = options.laneProp;
	const search = toStr(options.search ?? "").trim();
	const sortBy = options.sortBy ?? "manual";
	const rankProp = options.rankProp || "rank";
	const maxLanes = options.maxLanes ?? DEFAULT_MAX_LANES;

	// The shared column set/order, derived from ALL rows exactly as the flat board
	// builds it — so hide-done, extra columns, and column order carry over and
	// every lane renders the same columns.
	const columnNames = buildKanbanColumns(rows, options).map((c) => c.name);

	// Distinct lanes, in insertion order, then display-ordered. A lane is only
	// created for a value that actually appears (like the flat board's columns);
	// there is no "empty lane" tile because a lane value with no card has no
	// natural identity to render.
	const laneKeysSeen: string[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		const key = laneKeyOf(row, laneProp);
		if (!seen.has(key)) {
			seen.add(key);
			laneKeysSeen.push(key);
		}
	}
	const ordered = orderLaneKeys(laneKeysSeen, options.laneOrder ?? []);

	const build = (key: string): Swimlane => {
		const laneRows = rows.filter((r) => laneKeyOf(r, laneProp) === key);
		let total = 0;
		const columns: KanbanColumn[] = columnNames.map((name) => {
			let cell = laneRows.filter((r) => toStr(r.scope.get(groupBy)) === name);
			if (search) cell = cell.filter((r) => rowMatchesKanbanSearch(r, search, name));
			total += cell.length;
			return { name, rows: sortKanbanColumn(cell, sortBy, rankProp) };
		});
		return { key, columns, total };
	};

	// A lane with no visible cards (all filtered out by search or hide-done) is
	// dropped, exactly as an empty column is — you never see a blank band. The cap is
	// applied to what actually shows, so `truncatedLanes` reflects visible lanes.
	const visible = ordered.map(build).filter((lane) => lane.total > 0);
	const truncatedLanes = visible.length > maxLanes;
	const lanes = truncatedLanes ? visible.slice(0, maxLanes) : visible;

	return { columnNames, lanes, truncatedLanes };
}

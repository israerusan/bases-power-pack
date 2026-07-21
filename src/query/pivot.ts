import { toStr } from "../engine/expression";
import type { Row } from "../model/row";
import { computeRollup, type Aggregation } from "./rollup";

/**
 * Pivot / matrix engine. Groups rows on two properties at once — one for the
 * table's rows, one for its columns — and aggregates an expression at every
 * intersection, plus per-row / per-column / grand totals. Pure and side-effect
 * free so the whole matrix (including truncation on high-cardinality props) is
 * unit-testable without a DOM.
 */

/** The label shown for a row/column whose group value is missing or empty. */
export const PIVOT_EMPTY_KEY = "(empty)";

/** Guardrail so a pivot on a high-cardinality property (e.g. mtime) can't build a
 * runaway matrix. Distinct keys past this are dropped and flagged. */
const DEFAULT_MAX_KEYS = 50;

/** How the row/column keys are ordered: alphabetically, or by descending
 * membership (most-populated first) so the busy intersections rise to the corner. */
export const PIVOT_SORTS = ["label", "total"] as const;
export type PivotSort = (typeof PIVOT_SORTS)[number];

export interface PivotOptions {
	/** Frontmatter property (or formula) grouping the table's rows. */
	rowProp: string;
	/** Frontmatter property (or formula) grouping the table's columns. */
	colProp: string;
	aggregation: Aggregation;
	/** Expression aggregated in each cell. Ignored for `count`; defaults to `1`. */
	valueExpr: string;
	/** Key ordering for both axes. Defaults to `"label"`. */
	sort?: PivotSort;
	maxRowKeys?: number;
	maxColKeys?: number;
}

export interface PivotModel {
	rowKeys: string[];
	colKeys: string[];
	/** Display strings, indexed `[rowIndex][colIndex]`. */
	cells: string[][];
	/** Row membership counts, `[rowIndex][colIndex]` — 0 marks an empty cell. */
	counts: number[][];
	/** The actual notes in each cell, `[rowIndex][colIndex]` — the drill-down target
	 * behind every number. Kept so clicking a cell can list its notes. */
	cellRows: Row[][][];
	/** The notes in each row key (across all columns), indexed by rowIndex. */
	rowKeyRows: Row[][];
	/** The notes in each column key (across all rows), indexed by colIndex. */
	colKeyRows: Row[][];
	/** Every note that landed in the matrix — the grand-total drill-down. */
	allRows: Row[];
	rowTotals: string[];
	colTotals: string[];
	grandTotal: string;
	/** True when distinct keys exceeded the cap and the tail was dropped. */
	truncatedRows: boolean;
	truncatedCols: boolean;
	/** Rows that landed in the matrix (after any key truncation). */
	total: number;
}

function keyOf(row: Row, prop: string): string {
	const raw = toStr(row.scope.get(prop)).trim();
	return raw || PIVOT_EMPTY_KEY;
}

/**
 * Distinct keys ordered for display, with the "(empty)" bucket always forced to
 * the end. `label` sorts naturally; `total` sorts by descending membership (from
 * `tally`) so the most-populated keys lead, tie-broken naturally. Ordering by
 * membership matters because truncation keeps the head — a `total` sort therefore
 * keeps the biggest buckets rather than the alphabetically-first ones.
 */
function sortedKeys(tally: Map<string, number>, sort: PivotSort): string[] {
	return Array.from(tally.keys()).sort((a, b) => {
		if (a === PIVOT_EMPTY_KEY) return 1;
		if (b === PIVOT_EMPTY_KEY) return -1;
		if (sort === "total") {
			const diff = (tally.get(b) ?? 0) - (tally.get(a) ?? 0);
			if (diff !== 0) return diff;
		}
		return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
	});
}

export function buildPivot(rows: Row[], options: PivotOptions): PivotModel {
	const { rowProp, colProp } = options;
	const maxRowKeys = options.maxRowKeys ?? DEFAULT_MAX_KEYS;
	const maxColKeys = options.maxColKeys ?? DEFAULT_MAX_KEYS;
	const aggregation = options.aggregation;
	const expression = options.valueExpr.trim() || "1";
	const sort = options.sort ?? "label";

	// Tally the distinct keys FIRST (with their membership counts, so a "total" sort
	// can order by popularity), so truncation keeps the deterministic sorted head
	// rather than whichever keys happened to be scanned first.
	const rowTally = new Map<string, number>();
	const colTally = new Map<string, number>();
	for (const row of rows) {
		const rk = keyOf(row, rowProp);
		const ck = keyOf(row, colProp);
		rowTally.set(rk, (rowTally.get(rk) ?? 0) + 1);
		colTally.set(ck, (colTally.get(ck) ?? 0) + 1);
	}
	const sortedRowKeys = sortedKeys(rowTally, sort);
	const sortedColKeys = sortedKeys(colTally, sort);
	const truncatedRows = sortedRowKeys.length > maxRowKeys;
	const truncatedCols = sortedColKeys.length > maxColKeys;
	const rowKeys = truncatedRows ? sortedRowKeys.slice(0, maxRowKeys) : sortedRowKeys;
	const colKeys = truncatedCols ? sortedColKeys.slice(0, maxColKeys) : sortedColKeys;
	const rowKeySet = new Set(rowKeys);
	const colKeySet = new Set(colKeys);
	const rowIndex = new Map(rowKeys.map((k, i) => [k, i] as const));
	const colIndex = new Map(colKeys.map((k, i) => [k, i] as const));

	const buckets: Row[][][] = rowKeys.map(() => colKeys.map(() => []));
	const rowBuckets: Row[][] = rowKeys.map(() => []);
	const colBuckets: Row[][] = colKeys.map(() => []);
	const all: Row[] = [];
	for (const row of rows) {
		const rk = keyOf(row, rowProp);
		const ck = keyOf(row, colProp);
		// A row whose key fell off either truncated axis is not shown, so it must not
		// count toward any total either — keep the matrix and its totals consistent.
		if (!rowKeySet.has(rk) || !colKeySet.has(ck)) continue;
		const ri = rowIndex.get(rk) as number;
		const ci = colIndex.get(ck) as number;
		buckets[ri][ci].push(row);
		rowBuckets[ri].push(row);
		colBuckets[ci].push(row);
		all.push(row);
	}

	const rollup = { id: "pivot", label: "", expression, aggregation };
	const cells = buckets.map((r) => r.map((cell) => computeRollup(rollup, cell)));
	const counts = buckets.map((r) => r.map((cell) => cell.length));
	const rowTotals = rowBuckets.map((r) => computeRollup(rollup, r));
	const colTotals = colBuckets.map((c) => computeRollup(rollup, c));
	const grandTotal = computeRollup(rollup, all);

	return {
		rowKeys,
		colKeys,
		cells,
		counts,
		cellRows: buckets,
		rowKeyRows: rowBuckets,
		colKeyRows: colBuckets,
		allRows: all,
		rowTotals,
		colTotals,
		grandTotal,
		truncatedRows,
		truncatedCols,
		total: all.length,
	};
}

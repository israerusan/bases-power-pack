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

export interface PivotOptions {
	/** Frontmatter property (or formula) grouping the table's rows. */
	rowProp: string;
	/** Frontmatter property (or formula) grouping the table's columns. */
	colProp: string;
	aggregation: Aggregation;
	/** Expression aggregated in each cell. Ignored for `count`; defaults to `1`. */
	valueExpr: string;
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

/** Distinct keys sorted naturally, with the "(empty)" bucket forced to the end. */
function sortedKeys(keys: Set<string>): string[] {
	return Array.from(keys).sort((a, b) => {
		if (a === PIVOT_EMPTY_KEY) return 1;
		if (b === PIVOT_EMPTY_KEY) return -1;
		return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
	});
}

export function buildPivot(rows: Row[], options: PivotOptions): PivotModel {
	const { rowProp, colProp } = options;
	const maxRowKeys = options.maxRowKeys ?? DEFAULT_MAX_KEYS;
	const maxColKeys = options.maxColKeys ?? DEFAULT_MAX_KEYS;
	const aggregation = options.aggregation;
	const expression = options.valueExpr.trim() || "1";

	// Gather the distinct keys FIRST, so truncation keeps the deterministic sorted
	// head rather than whichever keys happened to be scanned first.
	const allRowKeys = new Set<string>();
	const allColKeys = new Set<string>();
	for (const row of rows) {
		allRowKeys.add(keyOf(row, rowProp));
		allColKeys.add(keyOf(row, colProp));
	}
	const sortedRowKeys = sortedKeys(allRowKeys);
	const sortedColKeys = sortedKeys(allColKeys);
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
		rowTotals,
		colTotals,
		grandTotal,
		truncatedRows,
		truncatedCols,
		total: all.length,
	};
}

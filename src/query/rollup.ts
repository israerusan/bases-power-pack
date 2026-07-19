import { arithNumber, evaluateSafe, toStr, type Value } from "../engine/expression";
import type { Row } from "../model/row";

export type Aggregation =
	| "count"
	| "sum"
	| "avg"
	| "min"
	| "max"
	| "unique"
	| "filled"
	| "empty"
	| "range";

export const AGGREGATIONS: Aggregation[] = [
	"count",
	"sum",
	"avg",
	"min",
	"max",
	"unique",
	"filled",
	"empty",
	"range",
];

export interface Rollup {
	id: string;
	label: string;
	/** An expression evaluated per row (e.g. `hours`, `done / total`). */
	expression: string;
	aggregation: Aggregation;
}

function isEmpty(v: Value): boolean {
	if (v === null || v === undefined) return true;
	if (typeof v === "string") return v.trim().length === 0;
	if (Array.isArray(v)) return v.length === 0;
	return false;
}

/** Aggregate one rollup expression across a set of rows into a display string. */
export function computeRollup(rollup: Rollup, rows: Row[]): string {
	const values: Value[] = rows.map((r) => evaluateSafe(rollup.expression, r.scope));

	// `range` is the one aggregation whose display isn't a single number (it's a
	// "min–max" span), so it's formatted here; every other case shares the numeric
	// path so a KPI card and a chart built on the same aggregation never disagree.
	if (rollup.aggregation === "range") {
		const nums = numeric(values);
		return nums.length ? `${formatNumber(arrMin(nums))}–${formatNumber(arrMax(nums))}` : "—";
	}
	const n = aggregateNumber(rollup.aggregation, values);
	return n === null ? "—" : formatNumber(n);
}

/**
 * The single numeric result of an aggregation over pre-evaluated values, or null
 * when there's no meaningful number (an average / min / max of no numeric values).
 * `range` collapses to its span (max − min) so a chart has a single height; the
 * roll-up display keeps the richer "min–max" form. Shared by the roll-up bar, the
 * pivot cells, and the dashboard charts.
 */
export function aggregateNumber(aggregation: Aggregation, values: Value[]): number | null {
	switch (aggregation) {
		case "count":
			return values.length;
		case "filled":
			return values.filter((v) => !isEmpty(v)).length;
		case "empty":
			return values.filter(isEmpty).length;
		case "unique":
			return new Set(values.filter((v) => !isEmpty(v)).map(toStr)).size;
		case "sum":
			return numeric(values).reduce((s, n) => s + n, 0);
		case "avg": {
			const nums = numeric(values);
			return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : null;
		}
		case "min": {
			const nums = numeric(values);
			return nums.length ? arrMin(nums) : null;
		}
		case "max": {
			const nums = numeric(values);
			return nums.length ? arrMax(nums) : null;
		}
		case "range": {
			const nums = numeric(values);
			return nums.length ? arrMax(nums) - arrMin(nums) : null;
		}
	}
}

/**
 * Aggregate `expression` across `rows` to a single number (evaluating the
 * expression per row first). The numeric counterpart to computeRollup, used by
 * the dashboard charts where a bar height / slice size needs a real number.
 */
export function aggregateRows(aggregation: Aggregation, rows: Row[], expression: string): number | null {
	return aggregateNumber(aggregation, rows.map((r) => evaluateSafe(expression, r.scope)));
}

function numeric(values: Value[]): number[] {
	// arithNumber (not lenient toNumber): an ISO-date or semver column must not
	// aggregate by its leading number — summing ["2026-01-01","2026-06-01"] used
	// to yield 4052 (year+year). Numeric-with-unit strings ("50%") still coerce.
	return values.map(arithNumber).filter((n) => !Number.isNaN(n));
}

/** min/max over an array WITHOUT the spread operator — Math.min(...nums) throws a
 * RangeError on a very large set (the same limit the Gantt code deliberately avoids). */
function arrMin(nums: number[]): number {
	return nums.reduce((m, n) => (n < m ? n : m));
}
function arrMax(nums: number[]): number {
	return nums.reduce((m, n) => (n > m ? n : m));
}

function formatNumber(n: number): string {
	if (!Number.isFinite(n)) return "—";
	// Trim to at most 2 decimals, dropping trailing zeros.
	return String(Math.round(n * 100) / 100);
}

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

	switch (rollup.aggregation) {
		case "count":
			return String(rows.length);
		case "filled":
			return String(values.filter((v) => !isEmpty(v)).length);
		case "empty":
			return String(values.filter(isEmpty).length);
		case "unique":
			return String(new Set(values.filter((v) => !isEmpty(v)).map(toStr)).size);
		case "sum":
			return formatNumber(numeric(values).reduce((s, n) => s + n, 0));
		case "avg": {
			const nums = numeric(values);
			return nums.length ? formatNumber(nums.reduce((s, n) => s + n, 0) / nums.length) : "—";
		}
		case "min": {
			const nums = numeric(values);
			return nums.length ? formatNumber(arrMin(nums)) : "—";
		}
		case "max": {
			const nums = numeric(values);
			return nums.length ? formatNumber(arrMax(nums)) : "—";
		}
		case "range": {
			const nums = numeric(values);
			return nums.length ? `${formatNumber(arrMin(nums))}–${formatNumber(arrMax(nums))}` : "—";
		}
	}
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

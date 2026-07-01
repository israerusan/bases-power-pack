import { evaluateSafe, toNumber, toStr, type Value } from "../engine/expression";
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
			return nums.length ? formatNumber(Math.min(...nums)) : "—";
		}
		case "max": {
			const nums = numeric(values);
			return nums.length ? formatNumber(Math.max(...nums)) : "—";
		}
		case "range": {
			const nums = numeric(values);
			return nums.length ? `${formatNumber(Math.min(...nums))}–${formatNumber(Math.max(...nums))}` : "—";
		}
	}
}

function numeric(values: Value[]): number[] {
	return values.map(toNumber).filter((n) => !Number.isNaN(n));
}

function formatNumber(n: number): string {
	if (!Number.isFinite(n)) return "—";
	// Trim to at most 2 decimals, dropping trailing zeros.
	return String(Math.round(n * 100) / 100);
}

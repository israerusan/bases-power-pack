import { toStr } from "../engine/expression";
import type { Row } from "../model/row";
import { aggregateRows, computeRollup, type Aggregation, type Rollup } from "./rollup";
import { isRowDone } from "./kanban";

/**
 * Dashboard / analytics engine. Turns a set of rows into KPI figures and a
 * category distribution (for a bar or donut chart), reusing the same roll-up
 * aggregation the rest of the plugin uses so a headline number and its chart can
 * never disagree. Pure and side-effect free — the arithmetic is unit-tested; the
 * view only paints the result.
 */

export const DASHBOARD_CHART_TYPES = ["bar", "donut"] as const;
export type DashboardChartType = (typeof DASHBOARD_CHART_TYPES)[number];

/** The label shown for a slice whose group value is missing or empty. */
export const DASHBOARD_EMPTY_KEY = "(empty)";

const DEFAULT_MAX_SLICES = 12;

export interface CategorySlice {
	key: string;
	/** Aggregated value that drives the bar height / arc size (never negative). */
	value: number;
	/** Rows in this slice — for the "N notes" caption. */
	count: number;
}

export interface Distribution {
	slices: CategorySlice[];
	/** Sum of all slice values (the denominator for donut percentages). */
	total: number;
	/** Largest slice value (the scale for bar widths). */
	max: number;
	/** True when low-value slices were folded into a single "Other" slice. */
	truncated: boolean;
}

export interface DistributionOptions {
	groupBy: string;
	aggregation: Aggregation;
	valueExpr: string;
	maxSlices?: number;
}

/**
 * Group rows by a property and aggregate a value per group, returning slices
 * sorted largest-first. Beyond `maxSlices`, the long tail is folded into one
 * "Other" slice so a chart stays readable on a high-cardinality property.
 */
export function buildDistribution(rows: Row[], options: DistributionOptions): Distribution {
	const maxSlices = Math.max(1, options.maxSlices ?? DEFAULT_MAX_SLICES);
	const expression = options.valueExpr.trim() || "1";
	const buckets = new Map<string, Row[]>();
	for (const row of rows) {
		const key = toStr(row.scope.get(options.groupBy)).trim() || DASHBOARD_EMPTY_KEY;
		let bucket = buckets.get(key);
		if (!bucket) {
			bucket = [];
			buckets.set(key, bucket);
		}
		bucket.push(row);
	}

	// A negative aggregate (e.g. a sum of negative numbers) can't be a bar height or
	// an arc, so clamp at 0 — the honest value still shows in the KPI cards.
	const valueOf = (bucketRows: Row[]): number => Math.max(0, aggregateRows(options.aggregation, bucketRows, expression) ?? 0);

	// Keep each bucket's rows through the fold so the "Other" slice can RE-AGGREGATE
	// the combined tail. Summing per-category values would only be right for count /
	// sum; for avg / min / max / unique it produces a nonsense "Other" (e.g. a sum of
	// averages), so we aggregate the actual rows instead.
	const scored = Array.from(buckets.entries()).map(([key, rows]) => ({ key, rows, count: rows.length, value: valueOf(rows) }));
	scored.sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));

	const truncated = scored.length > maxSlices;
	let folded = scored;
	if (truncated) {
		const head = scored.slice(0, maxSlices - 1);
		const tail = scored.slice(maxSlices - 1);
		const tailRows = tail.flatMap((b) => b.rows);
		// "Other" is appended last regardless of its aggregated value (a re-aggregated
		// avg could outrank a head slice) — the reader expects the merged bucket at the end.
		folded = [...head, { key: `Other (${tail.length})`, rows: tailRows, count: tailRows.length, value: valueOf(tailRows) }];
	}

	const slices: CategorySlice[] = folded.map((b) => ({ key: b.key, value: b.value, count: b.count }));
	const total = slices.reduce((s, x) => s + x.value, 0);
	const max = slices.reduce((m, x) => (x.value > m ? x.value : m), 0);
	return { slices, total, max, truncated };
}

export interface Kpi {
	label: string;
	value: string;
	/** Optional secondary line, e.g. a percentage under a count. */
	sub?: string;
}

/**
 * The built-in KPI cards shown when no roll-ups are configured: total notes,
 * done, and remaining (with a % done), using the shared done predicate so the
 * figure matches the Kanban / Outline everywhere.
 */
export function buildDefaultKpis(rows: Row[], statusProp: string, doneValue: string): Kpi[] {
	const total = rows.length;
	const done = rows.reduce((n, r) => n + (isRowDone(r, statusProp, doneValue) ? 1 : 0), 0);
	const pct = total > 0 ? Math.round((done / total) * 100) : 0;
	return [
		{ label: "Notes", value: String(total) },
		{ label: "Done", value: String(done), sub: `${pct}%` },
		{ label: "Remaining", value: String(total - done) },
	];
}

/** A configured roll-up rendered as a KPI card (its aggregated display value). */
export function buildRollupKpis(rows: Row[], rollups: Rollup[]): Kpi[] {
	return rollups.map((rollup) => ({
		label: rollup.label || rollup.aggregation,
		value: computeRollup(rollup, rows),
	}));
}

export interface DonutSegment {
	key: string;
	value: number;
	/** Radians, measured clockwise from 12 o'clock. */
	startAngle: number;
	endAngle: number;
}

/**
 * Convert slices into donut arc angles (clockwise from the top). Zero/negative
 * slices are skipped. Returns [] when nothing has positive value, so the view can
 * fall back to an empty state. A single positive slice yields one full-circle
 * segment (start == end + 2π), which the view renders as a plain ring.
 */
export function buildDonutSegments(slices: CategorySlice[]): DonutSegment[] {
	const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
	if (total <= 0) return [];
	const segments: DonutSegment[] = [];
	let angle = -Math.PI / 2;
	for (const slice of slices) {
		const value = Math.max(0, slice.value);
		if (value <= 0) continue;
		const start = angle;
		const end = angle + (value / total) * Math.PI * 2;
		segments.push({ key: slice.key, value, startAngle: start, endAngle: end });
		angle = end;
	}
	return segments;
}

/**
 * SVG path for an annular sector (donut slice) between two radii and two angles.
 * Pure geometry, so the arc math is testable and the view just drops the `d` in.
 */
export function annularSectorPath(
	cx: number,
	cy: number,
	rOuter: number,
	rInner: number,
	startAngle: number,
	endAngle: number
): string {
	const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
	const p = (radius: number, angle: number): [number, number] => [
		cx + radius * Math.cos(angle),
		cy + radius * Math.sin(angle),
	];
	const [ox0, oy0] = p(rOuter, startAngle);
	const [ox1, oy1] = p(rOuter, endAngle);
	const [ix1, iy1] = p(rInner, endAngle);
	const [ix0, iy0] = p(rInner, startAngle);
	return [
		`M ${round(ox0)} ${round(oy0)}`,
		`A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${round(ox1)} ${round(oy1)}`,
		`L ${round(ix1)} ${round(iy1)}`,
		`A ${rInner} ${rInner} 0 ${largeArc} 0 ${round(ix0)} ${round(iy0)}`,
		"Z",
	].join(" ");
}

function round(n: number): number {
	return Math.round(n * 100) / 100;
}

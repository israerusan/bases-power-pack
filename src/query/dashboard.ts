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

export const DASHBOARD_CHART_TYPES = ["bar", "donut", "stacked"] as const;
export type DashboardChartType = (typeof DASHBOARD_CHART_TYPES)[number];

/** Human labels for the chart-type toggle / settings dropdown. */
export const DASHBOARD_CHART_LABELS: Record<DashboardChartType, string> = {
	bar: "Bars",
	donut: "Donut",
	stacked: "Stacked",
};

/** How the distribution slices are ordered for display. */
export const DISTRIBUTION_SORTS = ["value", "value-asc", "count", "label"] as const;
export type DistributionSort = (typeof DISTRIBUTION_SORTS)[number];

export const DISTRIBUTION_SORT_LABELS: Record<DistributionSort, string> = {
	value: "Value (high→low)",
	"value-asc": "Value (low→high)",
	count: "Note count",
	label: "Name (A→Z)",
};

/** The label shown for a slice whose group value is missing or empty. */
export const DASHBOARD_EMPTY_KEY = "(empty)";

const DEFAULT_MAX_SLICES = 12;

export interface CategorySlice {
	key: string;
	/** Aggregated value that drives the bar height / arc size (never negative). */
	value: number;
	/** Number of notes in this slice — for the "N notes" caption. */
	count: number;
	/** The actual notes in this slice — the drill-down target behind the bar/arc. */
	rows: Row[];
	/** True only for the synthesized "Other" fold. Lets a drill target the merged
	 * bucket precisely, without matching its label text (a real category value could
	 * itself start with "Other (…)"). */
	isOther?: boolean;
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
	/** Slice ordering for display. Defaults to `"value"` (largest first). */
	sort?: DistributionSort;
	maxSlices?: number;
}

interface ScoredBucket {
	key: string;
	rows: Row[];
	count: number;
	value: number;
}

/** Comparator for the requested display order. */
function sortComparator(sort: DistributionSort): (a: ScoredBucket, b: ScoredBucket) => number {
	const byLabel = (a: ScoredBucket, b: ScoredBucket): number =>
		a.key.localeCompare(b.key, undefined, { numeric: true, sensitivity: "base" });
	switch (sort) {
		case "value-asc":
			return (a, b) => a.value - b.value || byLabel(a, b);
		case "count":
			return (a, b) => b.count - a.count || byLabel(a, b);
		case "label":
			return byLabel;
		default:
			return (a, b) => b.value - a.value || byLabel(a, b);
	}
}

/**
 * Group rows by a property and aggregate a value per group. Beyond `maxSlices`,
 * the long tail (always the *lowest-value* categories) is folded into one "Other"
 * slice so a chart stays readable on a high-cardinality property; the surviving
 * slices are then ordered by `sort` for display. Every slice carries its rows so
 * the chart can drill into the notes behind each bar.
 */
export function buildDistribution(rows: Row[], options: DistributionOptions): Distribution {
	const maxSlices = Math.max(1, options.maxSlices ?? DEFAULT_MAX_SLICES);
	const expression = options.valueExpr.trim() || "1";
	const sort = options.sort ?? "value";
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
	const scored: ScoredBucket[] = Array.from(buckets.entries()).map(([key, rows]) => ({ key, rows, count: rows.length, value: valueOf(rows) }));

	// Fold by VALUE regardless of the display sort — "Other" must always be the
	// smallest categories, or a "low→high" / "name" ordering would fold the biggest
	// buckets away. Then order the survivors for display and append Other last.
	const byValue = [...scored].sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
	const truncated = byValue.length > maxSlices;
	let head = byValue;
	let other: ScoredBucket | null = null;
	if (truncated) {
		head = byValue.slice(0, maxSlices - 1);
		const tail = byValue.slice(maxSlices - 1);
		const tailRows = tail.flatMap((b) => b.rows);
		other = { key: `Other (${tail.length})`, rows: tailRows, count: tailRows.length, value: valueOf(tailRows) };
	}

	const ordered = [...head].sort(sortComparator(sort));
	// "Other" is appended last regardless of the sort — the reader expects the merged
	// bucket at the end, not interleaved by its re-aggregated value.
	const slices: CategorySlice[] = ordered.map((b) => ({ key: b.key, value: b.value, count: b.count, rows: b.rows }));
	if (other) slices.push({ key: other.key, value: other.value, count: other.count, rows: other.rows, isOther: true });
	const total = slices.reduce((s, x) => s + x.value, 0);
	const max = slices.reduce((m, x) => (x.value > m ? x.value : m), 0);
	return { slices, total, max, truncated };
}

export interface Kpi {
	label: string;
	value: string;
	/** Optional secondary line, e.g. a percentage under a count. */
	sub?: string;
	/** The notes this KPI counts — the drill-down target when the card is clicked. */
	rows: Row[];
}

/**
 * The built-in KPI cards shown when no roll-ups are configured: total notes,
 * done, and remaining (with a % done), using the shared done predicate so the
 * figure matches the Kanban / Outline everywhere. Each card carries the exact
 * subset it counts so clicking it can list those notes.
 */
export function buildDefaultKpis(rows: Row[], statusProp: string, doneValue: string): Kpi[] {
	const doneRows = rows.filter((r) => isRowDone(r, statusProp, doneValue));
	const remainingRows = rows.filter((r) => !isRowDone(r, statusProp, doneValue));
	const total = rows.length;
	const pct = total > 0 ? Math.round((doneRows.length / total) * 100) : 0;
	return [
		{ label: "Notes", value: String(total), rows },
		{ label: "Done", value: String(doneRows.length), sub: `${pct}%`, rows: doneRows },
		{ label: "Remaining", value: String(remainingRows.length), rows: remainingRows },
	];
}

/** A configured roll-up rendered as a KPI card (its aggregated display value). A
 * roll-up aggregates the whole set, so its drill-down is all the rows. */
export function buildRollupKpis(rows: Row[], rollups: Rollup[]): Kpi[] {
	return rollups.map((rollup) => ({
		label: rollup.label || rollup.aggregation,
		value: computeRollup(rollup, rows),
		rows,
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

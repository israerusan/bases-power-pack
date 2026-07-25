import { toStr } from "../engine/expression";
import type { Row } from "../model/row";

/**
 * Pure board-analytics engine (DOM-free, unit-tested). Computes cards-in-progress by
 * column, workload by assignee, weekly throughput, cycle-time stats, and an aging list —
 * all from data already on the notes (no status-change changelog, so no extra writes):
 * the group value, an optional assignee property, file ctime as the start, and an optional
 * "completed" date property (falling back to file mtime) as the finish.
 *
 * `now` is passed in (not read from the clock) so the whole computation is deterministic
 * and testable.
 */

export interface AnalyticsBucket {
	label: string;
	count: number;
}

export interface CycleStats {
	/** Done cards with a usable start→finish span. */
	count: number;
	avgDays: number | null;
	medianDays: number | null;
	maxDays: number | null;
}

export interface AgingItem {
	name: string;
	column: string;
	days: number;
}

export interface BoardAnalytics {
	total: number;
	doneCount: number;
	/** Cards per group value, most first. */
	wipByColumn: AnalyticsBucket[];
	/** Cards per assignee (top slice), most first. Empty when no assignee property. */
	workloadByAssignee: AnalyticsBucket[];
	/** Completed cards per ISO week (oldest→newest), the practical velocity/throughput. */
	throughputByWeek: AnalyticsBucket[];
	cycle: CycleStats;
	/** Longest-running not-done cards (top slice), newest work excluded by sorting desc. */
	aging: AgingItem[];
}

export interface AnalyticsOptions {
	groupBy: string;
	/** Whether a row counts as done (usually `(r) => isRowDone(r, groupBy, doneValue)`). */
	isDone: (row: Row) => boolean;
	/** Person/assignee property, or "" to skip the workload breakdown. */
	assigneeProp: string;
	/** Completion-date property; when empty or unparseable, file mtime is the finish. */
	completedProp: string;
	/** "Now" in epoch ms — deterministic input, not a clock read. */
	now: number;
	/** How many weeks of throughput to report (default 8). */
	weeks?: number;
	/** How many rows in the top workload/aging slices (default 12). */
	top?: number;
}

const DAY_MS = 86_400_000;

/** Epoch ms of the Monday 00:00 (UTC) of the week containing `ms`. */
export function weekStartMs(ms: number): number {
	const d = new Date(ms);
	const day = d.getUTCDay(); // 0=Sun..6=Sat
	const mondayOffset = (day + 6) % 7; // days since Monday
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - mondayOffset * DAY_MS;
}

/** ISO YYYY-MM-DD of an epoch ms (UTC), for a week label. */
export function isoDay(ms: number): string {
	return new Date(ms).toISOString().slice(0, 10);
}

/** Median of a numeric list (null when empty). */
export function median(values: number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Parse a date-ish value to epoch ms, or null when it isn't a usable date. */
function dateMs(value: unknown): number | null {
	if (value instanceof Date) {
		const t = value.getTime();
		return Number.isFinite(t) ? t : null;
	}
	const s = toStr(value).trim();
	if (!s) return null;
	const t = Date.parse(s);
	return Number.isFinite(t) ? t : null;
}

function toBuckets(counts: Map<string, number>): AnalyticsBucket[] {
	return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

export function computeAnalytics(rows: readonly Row[], opts: AnalyticsOptions): BoardAnalytics {
	const weeks = opts.weeks ?? 8;
	const top = opts.top ?? 12;
	const byColumn = new Map<string, number>();
	const byAssignee = new Map<string, number>();
	const cycleDays: number[] = [];
	const doneByWeek = new Map<number, number>();
	const aging: AgingItem[] = [];
	let doneCount = 0;

	for (const row of rows) {
		const column = toStr(row.scope.get(opts.groupBy)).trim() || "(none)";
		byColumn.set(column, (byColumn.get(column) ?? 0) + 1);

		const startMs = row.note.ctime;
		const done = opts.isDone(row);

		// Workload = CURRENT load, so a person's completed cards don't inflate it: count
		// only their still-open cards. Strip a wikilink's brackets and its `|alias`.
		if (opts.assigneeProp && !done) {
			const raw = row.scope.get(opts.assigneeProp);
			const first = Array.isArray(raw) ? (raw as unknown[])[0] : raw;
			const target = toStr(first).trim().replace(/^\[\[/, "").replace(/\]\]$/, "").trim();
			const who = (target.includes("|") ? (target.split("|")[0] ?? target) : target).trim() || "(unassigned)";
			byAssignee.set(who, (byAssignee.get(who) ?? 0) + 1);
		}

		if (done) {
			doneCount++;
			const finishMs = (opts.completedProp ? dateMs(row.scope.get(opts.completedProp)) : null) ?? row.note.mtime;
			const wk = weekStartMs(finishMs);
			doneByWeek.set(wk, (doneByWeek.get(wk) ?? 0) + 1);
			if (Number.isFinite(startMs) && finishMs >= startMs) cycleDays.push((finishMs - startMs) / DAY_MS);
		} else if (Number.isFinite(startMs)) {
			aging.push({ name: row.name, column, days: Math.max(0, Math.floor((opts.now - startMs) / DAY_MS)) });
		}
	}

	// Throughput: the last `weeks` ISO weeks up to now, zero-filled so gaps read as zero.
	const throughputByWeek: AnalyticsBucket[] = [];
	const thisWeek = weekStartMs(opts.now);
	for (let i = weeks - 1; i >= 0; i--) {
		const wk = thisWeek - i * 7 * DAY_MS;
		throughputByWeek.push({ label: isoDay(wk), count: doneByWeek.get(wk) ?? 0 });
	}

	return {
		total: rows.length,
		doneCount,
		wipByColumn: toBuckets(byColumn),
		workloadByAssignee: toBuckets(byAssignee).slice(0, top),
		throughputByWeek,
		cycle: {
			count: cycleDays.length,
			avgDays: cycleDays.length ? cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length : null,
			medianDays: median(cycleDays),
			maxDays: cycleDays.length ? Math.max(...cycleDays) : null,
		},
		aging: aging.sort((a, b) => b.days - a.days).slice(0, top),
	};
}

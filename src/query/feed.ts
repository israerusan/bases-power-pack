import { toStr } from "../engine/expression";
import type { Row } from "../model/row";
import { toIsoDateKey, startOfWeekIso, weekdayOf } from "./dates";
import { toDayNumber } from "./gantt";

/** Below this a bare integer (~1973 in ms) is almost certainly a plain number
 * (a year, a count) rather than an epoch-millisecond timestamp, so it isn't
 * treated as one — that would mis-bucket `year: 2020` into 1970. */
const EPOCH_MS_FLOOR = 1e11;

/**
 * Feed / timeline engine (PREMIUM). Groups rows by a date into reverse-chron
 * sections — the "time as a stream" axis the Calendar (time as a grid) and Gantt
 * (time as a span) don't cover. Bucketing is by day, week, or month; rows with no
 * resolvable date fall into an "Undated" tail. Pure and side-effect free so the
 * bucketing and its date coercion are unit-tested without a DOM.
 */

export type FeedGranularity = "day" | "week" | "month";
export const FEED_GRANULARITIES: FeedGranularity[] = ["day", "week", "month"];

const MONTHS = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface FeedSection {
	/** Stable bucket key (an ISO day, a week-start ISO, or `YYYY-MM`). */
	key: string;
	/** Human heading, e.g. `Mon, Jul 20 2026`, `Week of Jul 20`, `July 2026`. */
	label: string;
	rows: Row[];
}

export interface FeedModel {
	sections: FeedSection[];
	/** Rows whose date property didn't resolve, kept so nothing silently vanishes. */
	undated: Row[];
}

/**
 * The `YYYY-MM-DD` for a row's feed date. Handles both frontmatter date strings
 * and the epoch-millisecond `file.ctime`/`file.mtime` accessors (which
 * toIsoDateKey alone can't parse), or null when there's no usable date.
 */
export function feedDateOf(row: Row, dateProp: string): string | null {
	const value = row.scope.get(dateProp);
	if (typeof value === "number" && Number.isFinite(value) && Math.abs(value) >= EPOCH_MS_FLOOR) {
		return epochToIso(value);
	}
	return toIsoDateKey(value);
}

/**
 * A sortable exact timestamp (ms) for a row's feed date — the epoch value itself
 * for `file.mtime`/`file.ctime`, or the parsed date/time of a string property, so
 * two notes on the same day still order by time-of-day within their bucket. 0
 * when no usable time is present (ties then fall back to name order).
 */
export function feedTimeOf(row: Row, dateProp: string): number {
	const value = row.scope.get(dateProp);
	if (typeof value === "number" && Number.isFinite(value) && Math.abs(value) >= EPOCH_MS_FLOOR) return value;
	const t = Date.parse(toStr(value));
	return Number.isFinite(t) ? t : 0;
}

/** A local `YYYY-MM-DD` for an epoch-millisecond timestamp. */
export function epochToIso(ms: number): string {
	const d = new Date(ms);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

/** The bucket key + heading label for an ISO day at the given granularity. */
export function sectionKeyFor(iso: string, granularity: FeedGranularity): { key: string; label: string } {
	if (granularity === "month") {
		const key = iso.slice(0, 7);
		const [y, m] = key.split("-");
		const monthName = MONTHS[Number(m) - 1] ?? m;
		return { key, label: `${monthName} ${y}` };
	}
	if (granularity === "week") {
		const key = startOfWeekIso(iso);
		return { key, label: `Week of ${shortDate(key)}` };
	}
	return { key: iso, label: longDate(iso) };
}

/** `Jul 20` — month abbreviation + day, no leading zero. */
function shortDate(iso: string): string {
	const m = Number(iso.slice(5, 7));
	const day = Number(iso.slice(8, 10));
	const monthName = MONTHS[m - 1]?.slice(0, 3) ?? String(m);
	return `${monthName} ${day}`;
}

/** `Mon, Jul 20 2026` — weekday, short date, year. */
function longDate(iso: string): string {
	const dn = toDayNumber(iso);
	const wd = dn === null ? "" : `${WEEKDAYS[weekdayOf(dn)]}, `;
	return `${wd}${shortDate(iso)} ${iso.slice(0, 4)}`;
}

/**
 * Bucket rows into reverse-chronological sections by their feed date. Sections
 * are ordered newest-first (ascending optional); within a section rows are
 * ordered by their exact date (newest first) then by name. Undated rows are
 * returned separately, sorted by name.
 */
export function buildFeed(
	rows: Row[],
	opts: { dateProp: string; granularity: FeedGranularity; order?: "desc" | "asc" }
): FeedModel {
	const order = opts.order ?? "desc";
	const undated: Row[] = [];
	const buckets = new Map<string, { label: string; entries: Array<{ row: Row; t: number }> }>();

	for (const row of rows) {
		const iso = feedDateOf(row, opts.dateProp);
		if (iso === null) {
			undated.push(row);
			continue;
		}
		const { key, label } = sectionKeyFor(iso, opts.granularity);
		let bucket = buckets.get(key);
		if (!bucket) {
			bucket = { label, entries: [] };
			buckets.set(key, bucket);
		}
		bucket.entries.push({ row, t: feedTimeOf(row, opts.dateProp) });
	}

	const dir = order === "asc" ? 1 : -1;
	const sections: FeedSection[] = Array.from(buckets.entries())
		.sort((a, b) => dir * a[0].localeCompare(b[0]))
		.map(([key, bucket]) => ({
			key,
			label: bucket.label,
			// Within a bucket, order by exact time (newest first by default) so an
			// activity feed reads chronologically, not alphabetically; ties by name.
			rows: bucket.entries
				.sort((a, b) => dir * (a.t - b.t) || a.row.name.localeCompare(b.row.name))
				.map((e) => e.row),
		}));

	undated.sort((a, b) => a.name.localeCompare(b.name));
	return { sections, undated };
}

/**
 * Calendar-facing date helpers built on the day-number math in `gantt.ts`.
 * Pure and side-effect free so the drag-to-reschedule and week/agenda logic is
 * unit-testable without a DOM.
 */
import { toStr } from "../engine/expression";
import { dayNumberToIso, shiftIso, toDayNumber } from "./gantt";

/** Normalize any frontmatter value to a `YYYY-MM-DD` key, or null if it isn't a
 * real calendar date. The fast path range-checks the components (via a round-trip
 * through Date) so a syntactically-valid but impossible value like `2026-13-45`
 * is rejected rather than written back and silently dropped from the grid. */
export function toIsoDateKey(value: unknown): string | null {
	if (value === undefined || value === null || value === "") return null;
	const raw = toStr(value);
	const head = raw.slice(0, 10);
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(head);
	if (m) {
		const y = Number(m[1]);
		const mo = Number(m[2]);
		const day = Number(m[3]);
		const dt = new Date(y, mo - 1, day);
		return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === day ? head : null;
	}
	const d = new Date(raw);
	if (Number.isNaN(d.getTime())) return null;
	const yy = d.getFullYear();
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const dd = String(d.getDate()).padStart(2, "0");
	return `${yy}-${mm}-${dd}`;
}

/**
 * The value to write back when a note is rescheduled to `newIso`. A time/zone
 * suffix on the original value is preserved (so `2026-01-01T09:00` dragged one
 * day forward becomes `2026-01-02T09:00`), otherwise a bare `YYYY-MM-DD` is
 * written.
 */
export function rescheduleDateValue(original: unknown, newIso: string): string {
	const raw = original === undefined || original === null ? "" : toStr(original);
	const m = raw.match(/^\d{4}-\d{2}-\d{2}(.*)$/);
	return newIso + (m ? m[1] : "");
}

/** Day-of-week for a day number, 0 = Sunday. Epoch day 0 (1970-01-01) is Thursday. */
export function weekdayOf(dayNumber: number): number {
	return (((dayNumber % 7) + 7 + 4) % 7);
}

/** The `YYYY-MM-DD` of the week's start (default Sunday) containing `iso`. */
export function startOfWeekIso(iso: string, weekStartsOn = 0): string {
	const dn = toDayNumber(iso);
	if (dn === null) return iso;
	const offset = (weekdayOf(dn) - weekStartsOn + 7) % 7;
	return dayNumberToIso(dn - offset);
}

/** The seven `YYYY-MM-DD` keys of the week containing `iso`. */
export function weekKeys(iso: string, weekStartsOn = 0): string[] {
	const start = startOfWeekIso(iso, weekStartsOn);
	const keys: string[] = [];
	for (let i = 0; i < 7; i++) keys.push(shiftIso(start, i));
	return keys;
}

/** Today as a local `YYYY-MM-DD` (not unit-tested — depends on the clock). */
export function todayIso(now: Date = new Date()): string {
	const y = now.getFullYear();
	const m = String(now.getMonth() + 1).padStart(2, "0");
	const d = String(now.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

/** Human day label, e.g. `Mon 12`. Pure given the ISO input. */
export function dayLabel(iso: string): string {
	const dn = toDayNumber(iso);
	if (dn === null) return iso;
	const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	const day = Number(iso.slice(8, 10));
	return `${names[weekdayOf(dn)]} ${day}`;
}

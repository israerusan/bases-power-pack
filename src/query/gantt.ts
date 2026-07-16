/**
 * Pure date math for the Gantt timeline. Given rows with a start and (optional)
 * end date, it computes a contiguous day axis and each bar's offset+span in
 * day units, so the view is a thin renderer over this data.
 */

export interface GanttInput {
	id: string;
	name: string;
	start: string | null;
	end: string | null;
}

export interface GanttBar {
	id: string;
	name: string;
	startIndex: number;
	span: number;
	startDate: string;
	endDate: string;
}

export interface GanttModel {
	days: string[]; // ISO YYYY-MM-DD, one per column
	bars: GanttBar[];
	skipped: number; // rows without a valid start date
	offAxis: number; // rows with a valid start date that falls beyond the clamped window
}

/** Parse a value to a UTC day number (days since epoch), or null. */
export function toDayNumber(value: string | null | undefined): number | null {
	if (!value) return null;
	const iso = String(value).slice(0, 10);
	const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	let ms: number;
	if (m) {
		ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
	} else {
		const d = new Date(String(value));
		if (Number.isNaN(d.getTime())) return null;
		ms = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
	}
	return Math.floor(ms / 86400000);
}

export function dayNumberToIso(day: number): string {
	const d = new Date(day * 86400000);
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(d.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${dd}`;
}

/** Add (or subtract) whole days to an ISO/date value, returning a YYYY-MM-DD
 * string. A value that doesn't parse is returned unchanged. */
export function shiftIso(value: string | null | undefined, deltaDays: number): string {
	const dn = toDayNumber(value);
	if (dn === null) return value ?? "";
	return dayNumberToIso(dn + deltaDays);
}

/**
 * New start/end for a Gantt bar dragged by `deltaDays`. Both endpoints move
 * together (the span is preserved); a missing end stays missing.
 */
export function moveBarDates(
	start: string,
	end: string | null,
	deltaDays: number
): { start: string; end: string | null } {
	return {
		start: shiftIso(start, deltaDays),
		end: end && toDayNumber(end) !== null ? shiftIso(end, deltaDays) : null,
	};
}

/**
 * New end date for a Gantt bar whose right edge was dragged by `deltaDays`.
 * The end is clamped so it can never fall before the start (a zero-length bar
 * is the minimum). When the bar had no end, resizing grows from the start.
 */
export function resizeBarEnd(start: string, end: string | null, deltaDays: number): string {
	const startDay = toDayNumber(start);
	const base = end && toDayNumber(end) !== null ? end : start;
	const baseDay = toDayNumber(base);
	if (startDay === null || baseDay === null) return end ?? start;
	const next = Math.max(startDay, baseDay + deltaDays);
	return dayNumberToIso(next);
}

/** Convert a horizontal pixel delta into whole days at the given day width. */
export function pxToDays(px: number, dayWidthPx: number): number {
	if (!Number.isFinite(dayWidthPx) || dayWidthPx <= 0) return 0;
	return Math.round(px / dayWidthPx);
}

/**
 * Normalize a raw progress value to a 0–100 percentage for the bar fill, or null
 * when it isn't a number. Accepts both conventions: a percentage (`0`–`100`) and
 * a fraction (`0`–`1`, e.g. `0.5` or `1`). Because `1` is ambiguous, any value in
 * `(0, 1]` is treated as a fraction and scaled ×100 (so `0.5` → 50, `1` → 100),
 * while `>1` is treated as an already-scaled percentage and clamped to 100.
 */
export function normalizeProgress(raw: unknown): number | null {
	if (raw === undefined || raw === null) return null;
	if (typeof raw === "string" && raw.trim() === "") return null;
	const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim()) : NaN;
	if (!Number.isFinite(n)) return null;
	const pct = n > 0 && n <= 1 ? n * 100 : n;
	return Math.max(0, Math.min(100, pct));
}

/**
 * Build the Gantt model. Bars without an end use `defaultSpanDays`. The axis is
 * clamped to `maxDays` columns starting at the earliest bar so a stray
 * far-future date can't produce a runaway grid.
 */
export function buildGantt(input: GanttInput[], defaultSpanDays = 1, maxDays = 120): GanttModel {
	const bars: Array<GanttBar & { startDay: number; endDay: number }> = [];
	let skipped = 0;

	for (const row of input) {
		const startDay = toDayNumber(row.start);
		if (startDay === null) {
			skipped++;
			continue;
		}
		let endDay = toDayNumber(row.end);
		if (endDay === null || endDay < startDay) endDay = startDay + Math.max(0, defaultSpanDays - 1);
		bars.push({
			id: row.id,
			name: row.name,
			startIndex: 0,
			span: endDay - startDay + 1,
			startDate: dayNumberToIso(startDay),
			endDate: dayNumberToIso(endDay),
			startDay,
			endDay,
		});
	}

	if (bars.length === 0) return { days: [], bars: [], skipped, offAxis: 0 };

	const minDay = Math.min(...bars.map((b) => b.startDay));
	const maxDay = Math.min(Math.max(...bars.map((b) => b.endDay)), minDay + maxDays - 1);

	const days: string[] = [];
	for (let d = minDay; d <= maxDay; d++) days.push(dayNumberToIso(d));

	let offAxis = 0;
	const finalBars: GanttBar[] = [];
	for (const b of bars) {
		// A valid bar whose start falls past the clamped axis can't be placed — it
		// would sit thousands of px beyond the track. Count it separately from
		// no-date rows so the view can explain the real reason ("outside the range").
		if (b.startDay > maxDay) {
			offAxis++;
			continue;
		}
		const startIndex = b.startDay - minDay;
		const clampedSpan = Math.min(b.span, maxDay - b.startDay + 1);
		finalBars.push({
			id: b.id,
			name: b.name,
			startIndex,
			span: Math.max(1, clampedSpan),
			startDate: b.startDate,
			endDate: b.endDate,
		});
	}

	// Stable order: earliest start first, then name.
	finalBars.sort((a, b) => a.startIndex - b.startIndex || a.name.localeCompare(b.name));

	return { days, bars: finalBars, skipped, offAxis };
}

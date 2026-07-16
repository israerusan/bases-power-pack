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

	if (bars.length === 0) return { days: [], bars: [], skipped };

	const minDay = Math.min(...bars.map((b) => b.startDay));
	const maxDay = Math.min(Math.max(...bars.map((b) => b.endDay)), minDay + maxDays - 1);

	const days: string[] = [];
	for (let d = minDay; d <= maxDay; d++) days.push(dayNumberToIso(d));

	const finalBars: GanttBar[] = bars.map((b) => {
		const startIndex = b.startDay - minDay;
		const clampedSpan = Math.min(b.span, maxDay - b.startDay + 1);
		return {
			id: b.id,
			name: b.name,
			startIndex,
			span: Math.max(1, clampedSpan),
			startDate: b.startDate,
			endDate: b.endDate,
		};
	});

	// Stable order: earliest start first, then name.
	finalBars.sort((a, b) => a.startIndex - b.startIndex || a.name.localeCompare(b.name));

	return { days, bars: finalBars, skipped };
}

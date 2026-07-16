/**
 * WIP (work-in-progress) limits — the pure rules behind the Kanban's per-column
 * capacity caps. A limit is the maximum number of cards a column should hold; a
 * column over its limit is flagged, and (optionally) a move that would push a
 * column past its limit is blocked. DOM-free and unit-tested; the view is a thin
 * renderer/enforcer over these functions.
 */

/** Parse a user-entered limit into a positive whole number, or null for "no limit". */
export function sanitizeWipLimit(raw: unknown): number | null {
	const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim()) : NaN;
	if (!Number.isFinite(n)) return null;
	const int = Math.floor(n);
	return int > 0 ? int : null;
}

/** The limit configured for a column value, or null when none is set. */
export function limitFor(limits: Record<string, number>, columnName: string): number | null {
	return sanitizeWipLimit(limits[columnName]);
}

/** True when a column already holds more cards than its limit allows. */
export function isOverWip(count: number, limit: number | null): boolean {
	return limit !== null && count > limit;
}

/**
 * True when moving one more card INTO a column of `targetCount` cards would push
 * it past `limit`. Used to (optionally) block a drop; the moved card is assumed
 * to come from another column, so it isn't already counted in `targetCount`.
 */
export function dropWouldExceed(targetCount: number, limit: number | null): boolean {
	return limit !== null && targetCount + 1 > limit;
}

/** The header count label for a column: `"3 / 5"` with a limit, else `"3"`. */
export function formatWipCount(count: number, limit: number | null): string {
	return limit !== null ? `${count} / ${limit}` : String(count);
}

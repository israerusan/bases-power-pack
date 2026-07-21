import { toNumber } from "../engine/expression";

/**
 * Manual card ordering. When the Kanban "Manual (drag)" sort is active, each card
 * carries a numeric `rank` frontmatter property and cards render in ascending
 * rank order. Dragging a card between two others computes a new rank that sorts
 * strictly between its neighbours — normally a single write, falling back to a
 * whole-column renumber only when the gap between neighbours can no longer be
 * split. Pure and side-effect free so the arithmetic is unit-tested rather than
 * eyeballed against a live board.
 */

/** The default spacing between freshly-assigned ranks, leaving room to insert
 * ~1000 cards between two neighbours before a renumber is forced. */
export const RANK_STEP = 1000;

/** Below this gap two neighbouring ranks can't be reliably split at float
 * precision, so the caller renumbers the whole column instead. */
const MIN_GAP = 1e-6;

export interface RankItem {
	id: string;
	/** The card's current rank, or null when it has never been hand-ordered. */
	rank: number | null;
}

export interface RankWrite {
	id: string;
	rank: number;
}

/** Coerce a frontmatter value to a finite rank number, or null when it isn't one. */
export function parseRank(value: unknown): number | null {
	if (value === undefined || value === null || value === "") return null;
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	const n = toNumber(value);
	return Number.isFinite(n) ? n : null;
}

/**
 * A rank that sorts strictly between `before` and `after`. A null bound means the
 * open end of the column (null before = head, null after = tail). Returns null
 * when the two bounds are numeric but too close to split — the signal to
 * renumber the column.
 */
export function rankBetween(before: number | null, after: number | null): number | null {
	if (before === null && after === null) return 0;
	if (before === null) return (after as number) - RANK_STEP;
	if (after === null) return before + RANK_STEP;
	if (after - before < MIN_GAP) return null;
	return before + (after - before) / 2;
}

/** Evenly-spaced integer ranks `[0, STEP, 2·STEP, …]` for `count` items. */
export function renormalizedRanks(count: number, step = RANK_STEP): number[] {
	const out: number[] = [];
	for (let i = 0; i < count; i++) out.push(i * step);
	return out;
}

/**
 * Plan the frontmatter rank writes to move `movedId` to sit at `targetIndex`
 * within `ordered` (the destination column's items in current display / rank
 * order; it may or may not already contain the moved item). Returns the minimal
 * set of writes:
 *   - `[]` when nothing needs to change (already in place with a valid rank),
 *   - a single `{id, rank}` for the moved card in the common case,
 *   - a full renumber of every card whose rank changes, when the neighbouring
 *     gap can't be split or a neighbour has no rank yet.
 */
export function planReorder(ordered: RankItem[], movedId: string, targetIndex: number): RankWrite[] {
	const moved = ordered.find((i) => i.id === movedId) ?? { id: movedId, rank: null };
	const rest = ordered.filter((i) => i.id !== movedId);
	const index = Math.max(0, Math.min(targetIndex, rest.length));
	const newOrder = [...rest.slice(0, index), moved, ...rest.slice(index)];

	// Landed exactly where it already sat (same members, same order) — nothing to
	// write, even in an all-unranked column where the renumber path would otherwise
	// rewrite every card. (A cross-column drop can't hit this: `moved` isn't in
	// `ordered`, so newOrder is longer and the sequences never match.)
	if (newOrder.length === ordered.length && newOrder.every((it, i) => it.id === ordered[i].id)) return [];

	const before = index > 0 ? newOrder[index - 1] : null;
	const after = index < newOrder.length - 1 ? newOrder[index + 1] : null;

	// A clean single write is only safe when both bounds either don't exist (open
	// end) or carry a real rank — a null-ranked neighbour gives us nothing to sit
	// between, so we fall through to a renumber.
	const beforeOk = before === null || before.rank !== null;
	const afterOk = after === null || after.rank !== null;
	if (beforeOk && afterOk) {
		const candidate = rankBetween(before ? before.rank : null, after ? after.rank : null);
		if (
			candidate !== null &&
			(before === null || (before.rank as number) < candidate) &&
			(after === null || candidate < (after.rank as number))
		) {
			if (moved.rank === candidate) return [];
			return [{ id: movedId, rank: candidate }];
		}
	}

	// Renumber the whole column in the new order, emitting a write only for cards
	// whose rank actually changes so undo/redo and cache churn stay minimal.
	const ranks = renormalizedRanks(newOrder.length);
	const writes: RankWrite[] = [];
	newOrder.forEach((item, i) => {
		if (item.rank !== ranks[i]) writes.push({ id: item.id, rank: ranks[i] });
	});
	return writes;
}

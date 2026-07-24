/**
 * Edge auto-scroll during a drag — the affordance that lets a card reach a column
 * or a drop gap that's off-screen (a tall column, or a board wider than the pane).
 * The flat/swimlane board and the touch-drag layer all drive the same controller.
 *
 * The velocity curve is a pure function so the ramp is unit-tested; the controller
 * is a thin popout-safe rAF loop over it (it reads the scroll container's own
 * window, never a bare global, so it works in a detached Obsidian popout).
 */

/** How close (px) to an edge the pointer must be before auto-scroll kicks in. */
export const SCROLL_ZONE = 56;
/** Peak scroll speed in px per animation frame (~60fps → ~1080 px/s). */
export const MAX_SCROLL_SPEED = 18;

/**
 * Scroll speed (px/frame) for a pointer at `pos` within the `[min, max]` edge of
 * a scroll container. Negative scrolls toward `min` (up/left), positive toward
 * `max` (down/right), zero in the calm middle. Speed ramps linearly from 0 at the
 * inner edge of the hot zone to `±maxSpeed` at the container edge, and is clamped
 * to `±maxSpeed` once the pointer passes the edge entirely (drag overshoot).
 * Pure — no DOM.
 */
export function edgeVelocity(
	pos: number,
	min: number,
	max: number,
	zone = SCROLL_ZONE,
	maxSpeed = MAX_SCROLL_SPEED
): number {
	// A container smaller than two zones has no calm middle (the top and bottom hot
	// zones would overlap); don't fight the user with constant scroll.
	if (max - min < 2 * zone) return 0;
	if (pos <= min + zone) {
		const depth = Math.min(zone, min + zone - pos); // 0..zone (past the edge → clamped)
		return -maxSpeed * (depth / zone);
	}
	if (pos >= max - zone) {
		const depth = Math.min(zone, pos - (max - zone));
		return maxSpeed * (depth / zone);
	}
	return 0;
}

/**
 * Drives edge auto-scroll on a scroll container while a drag is live. Feed it the
 * pointer's viewport coordinates via {@link update} on every dragover/pointermove;
 * call {@link stop} on drop/end. It scrolls both axes so a wide swimlane board and
 * a tall column both reach their off-screen targets.
 */
export class DragScroller {
	private frame: number | null = null;
	private x = 0;
	private y = 0;
	private readonly win: Window | null;

	constructor(private readonly el: HTMLElement) {
		this.win = el.ownerDocument.defaultView;
	}

	/** Record the latest pointer position (viewport coords) and ensure the loop runs. */
	update(clientX: number, clientY: number): void {
		this.x = clientX;
		this.y = clientY;
		if (this.frame === null && this.win) this.frame = this.win.requestAnimationFrame(() => this.tick());
	}

	/** Stop scrolling and cancel the loop. Safe to call when not running. */
	stop(): void {
		if (this.frame !== null && this.win) this.win.cancelAnimationFrame(this.frame);
		this.frame = null;
	}

	private tick(): void {
		this.frame = null;
		if (!this.win) return;
		const rect = this.el.getBoundingClientRect();
		const dy = edgeVelocity(this.y, rect.top, rect.bottom);
		const dx = edgeVelocity(this.x, rect.left, rect.right);
		if (dy !== 0) this.el.scrollTop += dy;
		if (dx !== 0) this.el.scrollLeft += dx;
		// Keep looping while the pointer stays in a hot zone; go idle otherwise so we
		// don't hold a rAF forever. The next update() re-arms it.
		if (dx !== 0 || dy !== 0) this.frame = this.win.requestAnimationFrame(() => this.tick());
	}
}

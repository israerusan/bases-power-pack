import { DragScroller } from "./autoscroll";

/**
 * Touch drag for the Kanban board. Native HTML5 drag-and-drop — which the flat
 * board uses for mouse — is dead on touch, so touch users previously could only
 * move a card through the "Move to…" menu. This adds a real pick-up-and-drag on
 * touch WITHOUT touching the mouse path: it's a separate pointer-events layer that
 * only engages for `pointerType === "touch"`, and it resolves a drop back to the
 * view through a callback, so all the move/rank/WIP/automation logic stays in one
 * place (the view), never duplicated here.
 *
 * Interaction model (mirrors the mainstream Kanban's, tuned to be less finicky):
 * a long-press arms the drag so a normal finger-scroll still scrolls the board; a
 * pre-arm move past a small threshold cancels back to a scroll; a tap that never
 * arms falls through to the card's click (open note).
 */

/** Where a touch drop landed, in the board's own terms. */
export interface TouchDropTarget {
	columnName: string;
	/** The swimlane the drop cell belongs to, or null on a flat (lane-less) board. */
	laneKey: string | null;
	/** The card to insert before, or null to append at the column's end. */
	beforeRowId: string | null;
}

export interface TouchDragOptions {
	/** The scrollable board element, resolved lazily (it's rebuilt each render). */
	scrollContainer: () => HTMLElement | null;
	/** Commit a resolved drop — the view does the actual writes. */
	onDrop: (rowId: string, target: TouchDropTarget) => void;
	/** Called when a drag actually arms (e.g. to suppress background re-renders). */
	onBegin?: () => void;
	/** Called when the drag ends (armed or not), for symmetric cleanup. */
	onEnd?: () => void;
	longPressMs?: number;
	moveCancelPx?: number;
}

const DEFAULT_LONG_PRESS_MS = 380;
const DEFAULT_MOVE_CANCEL_PX = 10;

export class TouchDragController {
	private ghost: HTMLElement | null = null;
	private scroller: DragScroller | null = null;
	private timer: number | null = null;
	private armed = false;
	private activeCard: HTMLElement | null = null;
	private activeRowId = "";
	private pointerId = -1;
	/** Removes the current gesture's per-card listeners; set in onPointerDown, invoked
	 * by every reset so no path leaks them (notably the pre-arm scroll-cancel). */
	private cleanupListeners: (() => void) | null = null;
	private startX = 0;
	private startY = 0;
	private ghostOffsetX = 0;
	private ghostOffsetY = 0;
	private lastTarget: { cell: HTMLElement | null; card: HTMLElement | null } = { cell: null, card: null };

	constructor(private readonly opts: TouchDragOptions) {}

	/** Wire one card for touch dragging. Mouse/pen pointers are ignored so the
	 * existing HTML5 drag stays authoritative for them. */
	attach(cardEl: HTMLElement, rowId: string): void {
		cardEl.addEventListener("pointerdown", (evt) => this.onPointerDown(evt, cardEl, rowId));
	}

	/** Tear down a drag in flight (called before a re-render, defensively) — a full
	 * reset so no ghost, listener, timer, or suppressed-render state outlives it. */
	destroy(): void {
		this.reset();
	}

	private onPointerDown(evt: PointerEvent, cardEl: HTMLElement, rowId: string): void {
		if (evt.pointerType !== "touch") return;
		if (this.activeCard) return; // one finger at a time
		this.activeCard = cardEl;
		this.activeRowId = rowId;
		this.pointerId = evt.pointerId;
		this.startX = evt.clientX;
		this.startY = evt.clientY;
		this.armed = false;

		const win = cardEl.ownerDocument.defaultView;
		this.timer = win ? win.setTimeout(() => this.arm(evt.clientX, evt.clientY), this.opts.longPressMs ?? DEFAULT_LONG_PRESS_MS) : null;

		const move = (e: PointerEvent): void => this.onPointerMove(e);
		const cleanup = (): void => {
			cardEl.removeEventListener("pointermove", move);
			cardEl.removeEventListener("pointerup", up);
			cardEl.removeEventListener("pointercancel", cancel);
		};
		// Held on the instance so EVERY teardown path removes these listeners — including
		// the pre-arm move-cancel (onPointerMove → reset), which has no local closure ref.
		this.cleanupListeners = cleanup;
		const up = (e: PointerEvent): void => {
			cleanup();
			this.onPointerUp(e);
		};
		// A pointercancel (incoming call, app switch, palm rejection, OS edge-swipe)
		// ABORTS the drag — it must NOT resolve a drop target and commit a move the
		// user never released onto. Just tear the drag down.
		const cancel = (): void => {
			cleanup();
			this.reset();
		};
		cardEl.addEventListener("pointermove", move);
		cardEl.addEventListener("pointerup", up);
		cardEl.addEventListener("pointercancel", cancel);
	}

	private onPointerMove(evt: PointerEvent): void {
		if (!this.activeCard) return;
		if (!this.armed) {
			// Before arming, a real move means the user is scrolling — bail so the
			// board scrolls normally instead of hijacking the gesture.
			const moved = Math.hypot(evt.clientX - this.startX, evt.clientY - this.startY);
			if (moved > (this.opts.moveCancelPx ?? DEFAULT_MOVE_CANCEL_PX)) this.reset();
			return;
		}
		evt.preventDefault();
		this.positionGhost(evt.clientX, evt.clientY);
		this.scroller?.update(evt.clientX, evt.clientY);
		this.updateIndicator(evt.clientX, evt.clientY);
	}

	private onPointerUp(evt: PointerEvent): void {
		this.cancelTimer();
		if (!this.armed) {
			this.reset();
			return;
		}
		const target = this.resolveTarget(evt.clientX, evt.clientY);
		this.finish(true);
		if (target) this.opts.onDrop(this.activeRowId, target);
		this.reset();
	}

	/** Arm the drag after the long-press: build the ghost, lock the pointer, and
	 * start auto-scroll. */
	private arm(x: number, y: number): void {
		const card = this.activeCard;
		if (!card) return;
		this.armed = true;
		this.opts.onBegin?.();
		try {
			card.setPointerCapture(this.pointerId);
		} catch {
			// Capture can throw if the pointer already ended; the drag simply won't track.
		}
		card.addClass("is-touch-dragging");
		const rect = card.getBoundingClientRect();
		const ghost = card.cloneNode(true) as HTMLElement;
		ghost.addClass("bpp-drag-ghost");
		ghost.removeClass("is-touch-dragging");
		ghost.setCssStyles({ width: `${rect.width}px`, left: `${rect.left}px`, top: `${rect.top}px` });
		card.ownerDocument.body.appendChild(ghost);
		this.ghost = ghost;
		this.ghostOffsetX = x - rect.left;
		this.ghostOffsetY = y - rect.top;
		const scrollEl = this.opts.scrollContainer();
		this.scroller = scrollEl ? new DragScroller(scrollEl) : null;
		this.positionGhost(x, y);
	}

	private positionGhost(x: number, y: number): void {
		this.ghost?.setCssStyles({ left: `${x - this.ghostOffsetX}px`, top: `${y - this.ghostOffsetY}px` });
	}

	private updateIndicator(x: number, y: number): void {
		const { cell, card } = this.hitTest(x, y);
		if (cell !== this.lastTarget.cell) {
			this.lastTarget.cell?.removeClass("is-drop-target");
			cell?.addClass("is-drop-target");
		}
		if (card !== this.lastTarget.card) {
			this.clearCardMarks(this.lastTarget.card);
		}
		if (card) {
			const before = this.inTopHalf(card, y);
			card.toggleClass("is-reorder-before", before);
			card.toggleClass("is-reorder-after", !before);
		}
		this.lastTarget = { cell, card };
	}

	private resolveTarget(x: number, y: number): TouchDropTarget | null {
		const { cell, card } = this.hitTest(x, y);
		if (!cell) return null;
		const columnName = cell.getAttribute("data-bpp-col");
		if (columnName === null) return null;
		const laneKey = cell.getAttribute("data-bpp-lane");
		let beforeRowId: string | null = null;
		if (card) {
			const before = this.inTopHalf(card, y);
			if (before) beforeRowId = card.getAttribute("data-bpp-row");
			else {
				const next = card.nextElementSibling;
				beforeRowId = next instanceof HTMLElement ? next.getAttribute("data-bpp-row") : null;
			}
		}
		return { columnName, laneKey, beforeRowId };
	}

	/** Find the column cell and (optionally) the card under a viewport point. The
	 * ghost is `pointer-events: none`, so it never occludes the hit-test. */
	private hitTest(x: number, y: number): { cell: HTMLElement | null; card: HTMLElement | null } {
		const doc = this.activeCard?.ownerDocument;
		const el = doc?.elementFromPoint(x, y);
		if (!(el instanceof HTMLElement)) return { cell: null, card: null };
		const cell = el.closest<HTMLElement>("[data-bpp-col]");
		let card = el.closest<HTMLElement>("[data-bpp-row]");
		// Ignore the card being dragged as its own drop target.
		if (card && card.getAttribute("data-bpp-row") === this.activeRowId) card = null;
		return { cell, card };
	}

	private inTopHalf(el: HTMLElement, y: number): boolean {
		const rect = el.getBoundingClientRect();
		return y < rect.top + rect.height / 2;
	}

	private clearCardMarks(card: HTMLElement | null): void {
		card?.removeClass("is-reorder-before");
		card?.removeClass("is-reorder-after");
	}

	/** Remove all visual drag state (ghost, indicators, capture) but leave the
	 * active-pointer bookkeeping for `reset()` to clear. */
	private finish(_committed: boolean): void {
		this.ghost?.remove();
		this.ghost = null;
		this.scroller?.stop();
		this.scroller = null;
		this.lastTarget.cell?.removeClass("is-drop-target");
		this.clearCardMarks(this.lastTarget.card);
		this.lastTarget = { cell: null, card: null };
		const card = this.activeCard;
		if (card) {
			card.removeClass("is-touch-dragging");
			if (this.pointerId !== -1 && card.hasPointerCapture?.(this.pointerId)) {
				card.releasePointerCapture(this.pointerId);
			}
		}
		if (this.armed) this.opts.onEnd?.();
		this.armed = false;
	}

	private cancelTimer(): void {
		const win = this.activeCard?.ownerDocument.defaultView;
		if (this.timer !== null && win) win.clearTimeout(this.timer);
		this.timer = null;
	}

	/** Full teardown after a completed or cancelled gesture. */
	private reset(): void {
		this.cancelTimer();
		this.finish(false);
		this.cleanupListeners?.();
		this.cleanupListeners = null;
		this.activeCard = null;
		this.activeRowId = "";
		this.pointerId = -1;
	}
}

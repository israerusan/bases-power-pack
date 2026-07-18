import { Menu, Notice } from "obsidian";
import type { Row } from "../model/row";
import { PowerPackView } from "./abstractView";
import { toBool, toStr } from "../engine/expression";
import { filterRowsByText } from "../query/search";
import { PromptModal } from "./modals";
import {
	buildGantt,
	moveBarDates,
	normalizeProgress,
	pxToDays,
	resizeBarEnd,
	toDayNumber,
	type GanttBar,
} from "../query/gantt";
import { rescheduleDateValue, toIsoDateKey, todayIso } from "../query/dates";
import { writeRowProperties, writeRowProperty } from "./viewData";
import { renderContextControls, renderRollupBar } from "./viewChrome";

export const VIEW_TYPE_GANTT = "bpp-gantt-view";

/** Visual zoom presets: pixels per day. */
const ZOOM_PRESETS: Array<{ label: string; px: number }> = [
	{ label: "Quarter", px: 4 },
	{ label: "Month", px: 9 },
	{ label: "Week", px: 22 },
	{ label: "Day", px: 44 },
];
const DEFAULT_ZOOM = 9;
/** A generous axis cap so a stray far-future date can't build a runaway grid. */
const MAX_AXIS_DAYS = 730;
/** Pointer travel (px) below which a bar interaction counts as a click, not a drag. */
const CLICK_SLOP = 4;

/**
 * Gantt timeline (PREMIUM). Interactive: drag a bar to move its dates, drag the
 * right edge to change its duration (both write frontmatter), zoom the time
 * scale, and scroll to today. Bars can show a progress fill and milestones
 * render as diamonds.
 */
export class GanttView extends PowerPackView {
	private zoomPx = DEFAULT_ZOOM;
	private scrollEl: HTMLElement | null = null;
	/** The px-per-day the current scroll container was built at, so a scroll captured
	 * before empty() can be re-anchored correctly even when a zoom change alters the scale. */
	private lastRenderPx = 0;
	/** The viewport's CENTER day captured before a re-render's empty(), so a background
	 * metadata render doesn't snap the timeline back to day 0 AND a zoom change keeps the
	 * same date centered instead of restoring a now-meaningless pixel offset. */
	private pendingCenterDay: number | null = null;
	/** Bar to re-focus after the next render — set by the keyboard move/resize
	 * path so arrow-key scheduling isn't single-shot (render() empties the
	 * container, which would drop focus to the body). Same pattern as the
	 * Outline's focusRowId. */
	private focusBarId: string | null = null;

	getViewType(): string {
		return VIEW_TYPE_GANTT;
	}
	getDisplayText(): string {
		return "Power Pack: Gantt";
	}
	getIcon(): string {
		return "gantt-chart";
	}

	async onClose(): Promise<void> {
		this.scrollEl = null;
		this.pendingCenterDay = null;
		this.lastRenderPx = 0;
		await super.onClose();
	}

	async render(): Promise<void> {
		const token = ++this.renderToken;
		const container = this.contentEl;

		if (!this.plugin.settings.isPro) {
			container.empty();
			container.addClass("bpp-view");
			this.renderUpgradeNotice(
				container,
				"📊",
				"Gantt is a Premium view",
				"Plan work on a timeline and reshape it by dragging.",
				[
					"Drag a bar to reschedule, drag its edge to change duration",
					"Zoom from days to months",
					"Progress fills and milestone markers",
					"Keyboard-nudge bars and jump to today",
				]
			);
			return;
		}

		const resolved = await this.plugin.getResolvedView();
		if (this.isStale(token)) return;

		// Capture the currently-focused bar BEFORE empty() destroys it, so ANY
		// render re-restores focus — including the plugin's own debounced "changed"
		// render triggered by the arrow-key write (which would otherwise land after
		// the explicit render had already consumed focusBarId, dropping focus to
		// the body). Same pattern as captureSearchState().
		const active = container.ownerDocument.activeElement;
		if (active instanceof HTMLElement && container.contains(active)) {
			const id = active.getAttribute("data-bpp-id");
			if (id) this.focusBarId = id;
		}
		// Capture the viewport's center DAY (not raw px) before empty() destroys the
		// scroll container, so the restore below re-anchors the same date even if the
		// zoom (px-per-day) changed between renders.
		this.pendingCenterDay =
			this.scrollEl && this.lastRenderPx > 0
				? (this.scrollEl.scrollLeft + this.scrollEl.clientWidth / 2) / this.lastRenderPx
				: null;

		this.captureSearchState();
		container.empty();
		container.addClass("bpp-view");

		const startProp = this.plugin.settings.ganttStartProp || "start";
		const endProp = this.plugin.settings.ganttEndProp || "end";

		const toolbar = container.createDiv({ cls: "bpp-toolbar" });
		toolbar.createEl("h3", { text: "Gantt" });
		// (No "Premium" badge: this view only renders for licensed users.)
		toolbar.createSpan({ cls: "bpp-muted", text: `${startProp} → ${endProp}` });

		const zoom = toolbar.createDiv({ cls: "bpp-segmented" });
		for (const preset of ZOOM_PRESETS) {
			const btn = zoom.createEl("button", { text: preset.label, cls: "bpp-seg-btn" });
			if (preset.px === this.zoomPx) btn.addClass("is-active");
			btn.addEventListener("click", () => {
				this.zoomPx = preset.px;
				void this.render();
			});
		}
		const todayBtn = toolbar.createEl("button", { text: "Today", cls: "bpp-seg-btn" });
		todayBtn.addEventListener("click", () => this.scrollToToday());

		this.renderUndoButton(toolbar);
		this.renderManagedSearch(toolbar);

		renderContextControls(container, this.plugin, resolved, () => void this.render());
		renderRollupBar(container, this.plugin, resolved.rows);

		const rows = filterRowsByText(resolved.rows, this.searchQuery);
		const rowByPath = new Map<string, Row>();
		const input = rows.map((row) => {
			rowByPath.set(row.id, row);
			return {
				id: row.id,
				name: row.name,
				start: valueToDateString(row.scope.get(startProp)),
				end: valueToDateString(row.scope.get(endProp)),
			};
		});

		const model = buildGantt(input, 1, MAX_AXIS_DAYS);
		if (model.bars.length === 0) {
			container.createDiv({
				cls: "bpp-empty",
				text: this.searchQuery
					? "No notes match the current search."
					: `No notes with a "${startProp}" date found. Add "${startProp}: 2026-01-01" to a note's frontmatter to place it on the timeline.`,
			});
			return;
		}

		this.renderChart(container, model, rowByPath, startProp, endProp);

		// Re-anchor the same center day onto the freshly-built scroll container (at the
		// current px scale). For a same-scale background render this reproduces the old
		// scrollLeft exactly; across a zoom change it keeps the viewed date centered.
		if (this.pendingCenterDay !== null && this.scrollEl) {
			this.scrollEl.scrollLeft = Math.max(0, this.pendingCenterDay * this.zoomPx - this.scrollEl.clientWidth / 2);
		}
		this.pendingCenterDay = null;

		// Restore keyboard focus to the bar being arrow-moved/resized (see focusBarId).
		if (this.focusBarId) {
			// CSS.escape — a file path can contain selector metacharacters the old
			// two-replacement hand-escaper missed (matching hierarchyView), so focus
			// restore never throws or silently fails on such paths.
			const sel = `[data-bpp-id="${CSS.escape(this.focusBarId)}"]`;
			container.querySelector<HTMLElement>(sel)?.focus();
			this.focusBarId = null;
		}

		if (model.skipped > 0) {
			container.createDiv({
				cls: "bpp-muted bpp-gantt-skipped",
				text: `${model.skipped} note${model.skipped === 1 ? "" : "s"} without a valid "${startProp}" date not shown.`,
			});
		}
		if (model.offAxis > 0) {
			container.createDiv({
				cls: "bpp-muted bpp-gantt-skipped",
				text: `${model.offAxis} note${model.offAxis === 1 ? "" : "s"} fall outside the visible date range.`,
			});
		}
	}

	private renderChart(
		container: HTMLElement,
		model: ReturnType<typeof buildGantt>,
		rowByPath: Map<string, Row>,
		startProp: string,
		endProp: string
	): void {
		const total = model.days.length;
		const px = this.zoomPx;

		const scroll = container.createDiv({ cls: "bpp-gantt-scroll" });
		this.scrollEl = scroll;
		this.lastRenderPx = px;
		const chart = scroll.createDiv({ cls: "bpp-gantt" });
		chart.setCssProps({ "--bpp-track-width": `${total * px}px` });

		// Axis header.
		const axis = chart.createDiv({ cls: "bpp-gantt-axis" });
		axis.createDiv({ cls: "bpp-gantt-name bpp-gantt-axis-label", text: "Task" });
		const axisTrack = axis.createDiv({ cls: "bpp-gantt-track bpp-gantt-axis-track" });
		this.renderMonthTicks(axisTrack, model.days, px);
		const todayOffset = this.todayOffset(model.days);
		if (todayOffset !== null) {
			const marker = axisTrack.createDiv({ cls: "bpp-gantt-today" });
			marker.setCssProps({ left: `${todayOffset * px}px` });
		}

		for (const bar of model.bars) {
			this.renderBar(chart, bar, px, todayOffset, rowByPath.get(bar.id), startProp, endProp);
		}
	}

	/** Faint month boundary ticks + labels along the axis. */
	private renderMonthTicks(axisTrack: HTMLElement, days: string[], px: number): void {
		for (let i = 0; i < days.length; i++) {
			if (i > 0 && !days[i].endsWith("-01")) continue;
			const tick = axisTrack.createDiv({ cls: "bpp-gantt-tick" });
			tick.setCssProps({ left: `${i * px}px` });
			tick.createSpan({ cls: "bpp-muted", text: days[i].slice(0, 7) });
		}
	}

	private renderBar(
		chart: HTMLElement,
		bar: GanttBar,
		px: number,
		todayOffset: number | null,
		row: Row | undefined,
		startProp: string,
		endProp: string
	): void {
		const rowEl = chart.createDiv({ cls: "bpp-gantt-row" });
		const openMenu = row
			? (a: MouseEvent | HTMLElement): void => this.openBarMenu(a, row, startProp, endProp)
			: null;
		const name = rowEl.createDiv({ cls: "bpp-gantt-name" });
		const nameLabel = name.createSpan({ cls: "bpp-gantt-name-label", text: bar.name });
		if (row && openMenu) {
			nameLabel.addEventListener("click", () => this.openRow(row));
			rowEl.addEventListener("contextmenu", (evt) => openMenu(evt));
			this.addOverflowButton(name, bar.name, openMenu);
		}

		const track = rowEl.createDiv({ cls: "bpp-gantt-track" });
		if (todayOffset !== null) {
			const line = track.createDiv({ cls: "bpp-gantt-todayline" });
			line.setCssProps({ left: `${todayOffset * px}px` });
		}

		const isMilestone = row ? this.isMilestone(row) : false;
		if (isMilestone) {
			const diamond = track.createDiv({ cls: "bpp-gantt-milestone" });
			diamond.setCssProps({ left: `${bar.startIndex * px}px` });
			diamond.setAttr("title", `${bar.name}: ${bar.startDate}`);
			diamond.setAttr("data-bpp-id", bar.id);
			if (row) this.applyColorRule(diamond, row);
			if (row && openMenu) {
				diamond.addEventListener("click", () => this.openRow(row));
				// Keyboard parity with bars: this branch used to return before any of
				// the tabIndex/role/keydown wiring, leaving milestones mouse-only.
				diamond.tabIndex = 0;
				diamond.setAttr("role", "button");
				diamond.setAttr("aria-label", `${bar.name}: milestone on ${bar.startDate}`);
				diamond.addEventListener("keydown", (evt) => {
					if (evt.key === "Enter" || evt.key === " ") {
						// role=button must activate on Space too (and Space would
						// otherwise scroll the chart).
						evt.preventDefault();
						this.openRow(row);
					} else if (evt.key === "ContextMenu" || (evt.key === "F10" && evt.shiftKey)) {
						evt.preventDefault();
						openMenu(diamond);
					}
				});
				diamond.addEventListener("contextmenu", (evt) => openMenu(evt));
			}
			return;
		}

		const barEl = track.createDiv({ cls: "bpp-gantt-bar" });
		barEl.setCssProps({ left: `${bar.startIndex * px}px`, width: `${Math.max(1, bar.span) * px}px` });
		barEl.setAttr("title", `${bar.name}: ${bar.startDate} → ${bar.endDate}`);
		barEl.setAttr("data-bpp-id", bar.id);
		if (row) this.applyColorRule(barEl, row);

		if (row && openMenu) {
			const progress = this.progressPct(row);
			if (progress !== null) {
				const fill = barEl.createDiv({ cls: "bpp-gantt-progress" });
				fill.setCssProps({ width: `${progress}%` });
			}
			const handle = barEl.createDiv({ cls: "bpp-gantt-handle" });
			this.enableDrag(barEl, handle, row, startProp, endProp);

			// Keyboard operability: the bar's dates live only in the title tooltip,
			// which is mouse-only. Expose them via aria-label and drive move/resize
			// with the arrow keys (Shift = resize the end).
			barEl.tabIndex = 0;
			barEl.setAttr("role", "button");
			barEl.setAttr("aria-label", `${bar.name}: ${bar.startDate} to ${bar.endDate}`);
			barEl.addEventListener("keydown", (evt) => {
				if (evt.key === "Enter" || evt.key === " ") {
					evt.preventDefault();
					this.openRow(row);
				} else if (evt.key === "ArrowRight" || evt.key === "ArrowLeft") {
					evt.preventDefault();
					const delta = evt.key === "ArrowRight" ? 1 : -1;
					// Re-focus this bar after the write's re-render so a second arrow
					// press keeps working (the render otherwise drops focus to body).
					this.focusBarId = row.id;
					if (evt.shiftKey) void this.applyResize(row, startProp, endProp, delta);
					else void this.applyMove(row, startProp, endProp, delta);
				} else if (evt.key === "ContextMenu" || (evt.key === "F10" && evt.shiftKey)) {
					evt.preventDefault();
					openMenu(barEl);
				}
			});
		}
	}

	// ---- interaction ----------------------------------------------------------

	/**
	 * Pointer-drag a bar (move both dates) or its right handle (resize the end).
	 * Uses pointer capture so move/up stay on the element — no document listeners,
	 * popout-safe. A tiny drag counts as a click that opens the note.
	 */
	private enableDrag(barEl: HTMLElement, handle: HTMLElement, row: Row, startProp: string, endProp: string): void {
		let startX = 0;
		let kind: "move" | "resize" | null = null;
		let baseWidth = 0;

		const begin = (evt: PointerEvent, k: "move" | "resize"): void => {
			if (evt.button !== 0) return;
			evt.preventDefault();
			evt.stopPropagation();
			kind = k;
			startX = evt.clientX;
			baseWidth = barEl.offsetWidth;
			barEl.addClass("is-dragging");
			barEl.setPointerCapture(evt.pointerId);
			// Hold background re-renders so a metadata change mid-drag can't remove the
			// bar and pointer capture (which would drop the reschedule write).
			this.beginInteraction();
		};

		barEl.addEventListener("pointerdown", (evt) => begin(evt, "move"));
		handle.addEventListener("pointerdown", (evt) => begin(evt, "resize"));

		barEl.addEventListener("pointermove", (evt) => {
			if (!kind) return;
			const dx = evt.clientX - startX;
			if (kind === "move") barEl.setCssProps({ transform: `translateX(${dx}px)` });
			else barEl.setCssProps({ width: `${Math.max(this.zoomPx, baseWidth + dx)}px` });
		});

		const finish = (evt: PointerEvent): void => {
			if (!kind) return;
			const dx = evt.clientX - startX;
			const currentKind = kind;
			kind = null;
			barEl.removeClass("is-dragging");
			if (barEl.hasPointerCapture(evt.pointerId)) barEl.releasePointerCapture(evt.pointerId);
			this.endInteraction();

			if (Math.abs(dx) < CLICK_SLOP) {
				barEl.setCssProps({ transform: "" });
				if (currentKind === "move") this.openRow(row);
				else void this.render();
				return;
			}
			const deltaDays = pxToDays(dx, this.zoomPx);
			if (deltaDays === 0) {
				void this.render();
				return;
			}
			if (currentKind === "move") void this.applyMove(row, startProp, endProp, deltaDays);
			else void this.applyResize(row, startProp, endProp, deltaDays);
		};
		barEl.addEventListener("pointerup", finish);
		barEl.addEventListener("pointercancel", finish);
	}

	/** Right-click menu on a Gantt bar — a non-drag path to set the dates, plus the
	 * shared note actions (open / edit field / rename / delete). */
	private openBarMenu(anchor: MouseEvent | HTMLElement, row: Row, startProp: string, endProp: string): void {
		if (anchor instanceof MouseEvent) anchor.preventDefault();
		const after = (): void => void this.render();
		const menu = new Menu();
		menu.addItem((i) =>
			i.setTitle("Set start date…").setIcon("calendar").onClick(() => this.setDateViaPrompt(row, startProp, "start"))
		);
		menu.addItem((i) =>
			i.setTitle("Set end date…").setIcon("calendar").onClick(() => this.setDateViaPrompt(row, endProp, "end"))
		);
		menu.addSeparator();
		this.addCommonRowMenuItems(menu, row, this.plugin.settings.kanbanCardFields, after);
		this.showMenuAtAnchor(menu, anchor);
	}

	private setDateViaPrompt(row: Row, prop: string, which: string): void {
		const raw = row.scope.get(prop);
		const current = toIsoDateKey(raw) ?? todayIso();
		new PromptModal(this.app, {
			title: `Set ${which} date for "${row.name}"`,
			value: current,
			placeholder: "YYYY-MM-DD",
			cta: "Save",
			onSubmit: (v) => {
				const key = toIsoDateKey(v);
				if (!key) {
					new Notice("Enter a date as YYYY-MM-DD.");
					return;
				}
				void writeRowProperty(this.plugin, row.id, prop, rescheduleDateValue(raw, key), false, {
					label: `Set ${which} date`,
				}).then(() => this.render());
			},
		}).open();
	}

	private async applyMove(row: Row, startProp: string, endProp: string, deltaDays: number): Promise<void> {
		const startRaw = row.scope.get(startProp);
		const endRaw = row.scope.get(endProp);
		const startIso = valueToDateString(startRaw);
		if (!startIso) return void this.render();
		const endIso = valueToDateString(endRaw);
		const moved = moveBarDates(startIso, endIso, deltaDays);
		// One write for both endpoints: a single undo entry, and a faithful inverse
		// (start and end are distinct keys, so no same-key-twice ambiguity).
		const writes = [{ key: startProp, value: rescheduleDateValue(startRaw, moved.start) }];
		if (moved.end !== null) writes.push({ key: endProp, value: rescheduleDateValue(endRaw, moved.end) });
		await writeRowProperties(this.plugin, row.id, writes, { label: `Move "${row.name}"` });
		await this.render();
	}

	private async applyResize(row: Row, startProp: string, endProp: string, deltaDays: number): Promise<void> {
		const startRaw = row.scope.get(startProp);
		const endRaw = row.scope.get(endProp);
		const startIso = valueToDateString(startRaw);
		if (!startIso) return void this.render();
		const endIso = valueToDateString(endRaw);
		const nextEnd = resizeBarEnd(startIso, endIso, deltaDays);
		await writeRowProperty(this.plugin, row.id, endProp, rescheduleDateValue(endRaw, nextEnd), false, {
			label: `Resize "${row.name}"`,
		});
		await this.render();
	}

	private scrollToToday(): void {
		if (!this.scrollEl) return;
		const marker = this.scrollEl.querySelector<HTMLElement>(".bpp-gantt-axis-track .bpp-gantt-today");
		if (!marker) return;
		const left = marker.offsetLeft;
		// Honor reduced-motion: an explicit behavior option overrides the CSS
		// scroll-behavior, so gate it on the media query.
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		this.scrollEl.scrollTo({
			left: Math.max(0, left - this.scrollEl.clientWidth / 2),
			behavior: reduce ? "auto" : "smooth",
		});
	}

	// ---- helpers --------------------------------------------------------------

	private todayOffset(days: string[]): number | null {
		if (days.length === 0) return null;
		const todayDay = toDayNumber(todayIso());
		const firstDay = toDayNumber(days[0]);
		if (todayDay === null || firstDay === null) return null;
		const offset = todayDay - firstDay;
		return offset >= 0 && offset < days.length ? offset : null;
	}

	private isMilestone(row: Row): boolean {
		const prop = this.plugin.settings.ganttMilestoneProp.trim();
		if (!prop) return false;
		return toBool(row.scope.get(prop));
	}

	private progressPct(row: Row): number | null {
		const prop = this.plugin.settings.ganttProgressProp.trim();
		if (!prop) return null;
		return normalizeProgress(row.scope.get(prop));
	}

}

function valueToDateString(value: unknown): string | null {
	if (value === undefined || value === null || value === "") return null;
	return toStr(value);
}

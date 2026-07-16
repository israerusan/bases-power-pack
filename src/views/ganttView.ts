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
import { resolveViewRows, writeRowProperties, writeRowProperty } from "./viewData";
import { renderContextControls, renderRollupBar, renderSearchControl } from "./viewChrome";

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
	private search = "";
	private searchInputEl: HTMLInputElement | null = null;
	private restoreSearchFocus = false;

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
		this.searchInputEl = null;
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
				"Drag bars to reschedule, resize to change duration, zoom the timeline, and track progress — unlock it with a Bases Power Pack license."
			);
			return;
		}

		const resolved = await resolveViewRows(this.app, this.plugin);
		if (this.isStale(token)) return;

		this.restoreSearchFocus =
			this.searchInputEl !== null &&
			this.searchInputEl.ownerDocument.activeElement === this.searchInputEl;
		container.empty();
		container.addClass("bpp-view");

		const startProp = this.plugin.settings.ganttStartProp || "start";
		const endProp = this.plugin.settings.ganttEndProp || "end";

		const toolbar = container.createDiv({ cls: "bpp-toolbar" });
		toolbar.createEl("h3", { text: "Gantt" });
		toolbar.createEl("span", { cls: "bpp-badge bpp-badge-premium", text: "Premium" });
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

		this.searchInputEl = renderSearchControl(toolbar, this.search, (value) => {
			this.search = value;
			void this.render();
		});
		if (this.restoreSearchFocus) {
			this.restoreSearchFocus = false;
			this.searchInputEl.focus();
			const end = this.searchInputEl.value.length;
			this.searchInputEl.setSelectionRange(end, end);
		}

		renderContextControls(container, this.plugin, resolved, () => void this.render());
		renderRollupBar(container, this.plugin, resolved.rows);

		const rows = filterRowsByText(resolved.rows, this.search);
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
				text: this.search
					? "No notes match the current search."
					: `No notes with a "${startProp}" date found. Add "${startProp}: 2026-01-01" to a note's frontmatter to place it on the timeline.`,
			});
			return;
		}

		this.renderChart(container, model, rowByPath, startProp, endProp);

		if (model.skipped > 0) {
			container.createDiv({
				cls: "bpp-muted bpp-gantt-skipped",
				text: `${model.skipped} note${model.skipped === 1 ? "" : "s"} without a valid "${startProp}" date not shown.`,
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
		const name = rowEl.createDiv({ cls: "bpp-gantt-name", text: bar.name });
		if (row) {
			name.addEventListener("click", () => this.openRow(row));
			rowEl.addEventListener("contextmenu", (evt) => this.openBarMenu(evt, row, startProp, endProp));
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
			if (row) diamond.addEventListener("click", () => this.openRow(row));
			return;
		}

		const barEl = track.createDiv({ cls: "bpp-gantt-bar" });
		barEl.setCssProps({ left: `${bar.startIndex * px}px`, width: `${Math.max(1, bar.span) * px}px` });
		barEl.setAttr("title", `${bar.name}: ${bar.startDate} → ${bar.endDate}`);

		if (row) {
			const progress = this.progressPct(row);
			if (progress !== null) {
				const fill = barEl.createDiv({ cls: "bpp-gantt-progress" });
				fill.setCssProps({ width: `${progress}%` });
			}
			const handle = barEl.createDiv({ cls: "bpp-gantt-handle" });
			this.enableDrag(barEl, handle, row, startProp, endProp);
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
	private openBarMenu(evt: MouseEvent, row: Row, startProp: string, endProp: string): void {
		evt.preventDefault();
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
		menu.showAtMouseEvent(evt);
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
		this.scrollEl.scrollTo({ left: Math.max(0, left - this.scrollEl.clientWidth / 2), behavior: "smooth" });
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

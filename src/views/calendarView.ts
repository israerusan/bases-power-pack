import { Notice, TFile } from "obsidian";
import type { Row } from "../model/row";
import type { CalendarViewMode } from "../settings";
import { PowerPackView } from "./abstractView";
import { toStr } from "../engine/expression";
import { columnHue } from "../query/kanban";
import {
	dayLabel,
	rescheduleDateValue,
	startOfWeekIso,
	todayIso,
	toIsoDateKey,
	weekKeys,
} from "../query/dates";
import { shiftIso } from "../query/gantt";
import { createSeededNote, resolveViewRows, writeRowProperty } from "./viewData";
import { renderContextControls, renderRollupBar } from "./viewChrome";

export const VIEW_TYPE_CALENDAR = "bpp-calendar-view";

const DND_ROW = "application/x-bpp-row";

/**
 * Calendar view (PREMIUM). Interactive: drag an event to another day to
 * reschedule it (writes the date property), click a day to create a note there,
 * and switch between Month / Week / Agenda. Honors the active base, saved
 * filter, roll-up bar, and an optional color-by property.
 */
export class CalendarView extends PowerPackView {
	/** Anchor day the visible period is derived from (month/week/agenda all use it). */
	private anchor: string = todayIso();

	getViewType(): string {
		return VIEW_TYPE_CALENDAR;
	}
	getDisplayText(): string {
		return "Power Pack: Calendar";
	}
	getIcon(): string {
		return "calendar";
	}

	private get mode(): CalendarViewMode {
		return this.plugin.settings.calendarViewMode;
	}

	async render(): Promise<void> {
		const token = ++this.renderToken;
		const container = this.contentEl;

		if (!this.plugin.settings.isPro) {
			container.empty();
			container.addClass("bpp-view");
			this.renderUpgradeNotice(
				container,
				"📅",
				"Calendar is a Premium view",
				"Drag notes to reschedule, click a day to create one, and switch between month, week, and agenda — unlock it with a Bases Power Pack license."
			);
			return;
		}

		const resolved = await resolveViewRows(this.app, this.plugin);
		if (this.isStale(token)) return;

		container.empty();
		container.addClass("bpp-view");

		const dateProp = this.plugin.settings.calendarDateProp || "due";

		this.renderToolbar(container, dateProp);
		renderContextControls(container, this.plugin, resolved, () => void this.render());
		renderRollupBar(container, this.plugin, resolved.rows);

		const byDay = this.collectByDay(resolved.rows, dateProp);
		if (this.mode === "agenda") this.renderAgenda(container, byDay, dateProp);
		else if (this.mode === "week") this.renderWeek(container, byDay, dateProp);
		else this.renderMonth(container, byDay, dateProp);
	}

	// ---- toolbar --------------------------------------------------------------

	private renderToolbar(container: HTMLElement, dateProp: string): void {
		const toolbar = container.createDiv({ cls: "bpp-toolbar" });
		toolbar.createEl("h3", { text: "Calendar" });
		toolbar.createEl("span", { cls: "bpp-badge bpp-badge-premium", text: "Premium" });

		const modes = toolbar.createDiv({ cls: "bpp-segmented" });
		const addMode = (mode: CalendarViewMode, label: string): void => {
			const btn = modes.createEl("button", { text: label, cls: "bpp-seg-btn" });
			if (this.mode === mode) btn.addClass("is-active");
			btn.addEventListener("click", () => void this.setMode(mode));
		};
		addMode("month", "Month");
		addMode("week", "Week");
		addMode("agenda", "Agenda");

		const nav = toolbar.createDiv({ cls: "bpp-cal-nav" });
		const prev = nav.createEl("button", { text: "‹", attr: { "aria-label": "Previous" } });
		const today = nav.createEl("button", { text: "Today", cls: "bpp-seg-btn" });
		const next = nav.createEl("button", { text: "›", attr: { "aria-label": "Next" } });
		prev.addEventListener("click", () => this.shift(-1));
		next.addEventListener("click", () => this.shift(1));
		today.addEventListener("click", () => {
			this.anchor = todayIso();
			void this.render();
		});
		nav.createSpan({ cls: "bpp-cal-label", text: this.periodLabel() });

		toolbar.createSpan({ cls: "bpp-muted", text: `dates from "${dateProp}"` });
	}

	private async setMode(mode: CalendarViewMode): Promise<void> {
		if (this.plugin.settings.calendarViewMode === mode) return;
		this.plugin.settings.calendarViewMode = mode;
		await this.plugin.saveSettings();
		await this.render();
	}

	private periodLabel(): string {
		if (this.mode === "week") {
			const keys = weekKeys(this.anchor);
			return `${keys[0]} – ${keys[6]}`;
		}
		if (this.mode === "agenda") return "Upcoming";
		const d = new Date(`${this.anchor}T00:00:00`);
		return d.toLocaleString(undefined, { month: "long", year: "numeric" });
	}

	/** Move the visible period by one unit (month/week); agenda ignores it. */
	private shift(delta: number): void {
		if (this.mode === "week") {
			this.anchor = shiftIso(startOfWeekIso(this.anchor), delta * 7);
		} else if (this.mode === "month") {
			const d = new Date(`${this.anchor}T00:00:00`);
			d.setMonth(d.getMonth() + delta, 1);
			this.anchor = todayIso(d);
		}
		void this.render();
	}

	// ---- data -----------------------------------------------------------------

	/** Map "YYYY-MM-DD" -> rows whose date property falls on that day. */
	private collectByDay(rows: Row[], dateProp: string): Map<string, Row[]> {
		const map = new Map<string, Row[]>();
		for (const row of rows) {
			const key = toIsoDateKey(row.scope.get(dateProp));
			if (!key) continue;
			if (!map.has(key)) map.set(key, []);
			map.get(key)!.push(row);
		}
		return map;
	}

	// ---- month ----------------------------------------------------------------

	private renderMonth(container: HTMLElement, byDay: Map<string, Row[]>, dateProp: string): void {
		const grid = container.createDiv({ cls: "bpp-cal-grid" });
		for (const w of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
			grid.createDiv({ cls: "bpp-cal-weekday", text: w });
		}

		const anchor = new Date(`${this.anchor}T00:00:00`);
		const year = anchor.getFullYear();
		const month = anchor.getMonth();
		const first = new Date(year, month, 1);
		const startOffset = first.getDay();
		const daysInMonth = new Date(year, month + 1, 0).getDate();

		for (let i = 0; i < startOffset; i++) grid.createDiv({ cls: "bpp-cal-cell bpp-cal-empty" });

		const today = todayIso();
		for (let day = 1; day <= daysInMonth; day++) {
			const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
			const cell = this.renderDayCell(grid, key, dateProp, byDay.get(key) || [], today);
			cell.createDiv({ cls: "bpp-cal-daynum", text: String(day) });
			this.renderCellEvents(cell, byDay.get(key) || []);
		}
	}

	// ---- week -----------------------------------------------------------------

	private renderWeek(container: HTMLElement, byDay: Map<string, Row[]>, dateProp: string): void {
		const grid = container.createDiv({ cls: "bpp-cal-grid bpp-cal-week" });
		const today = todayIso();
		for (const key of weekKeys(this.anchor)) {
			grid.createDiv({ cls: "bpp-cal-weekday", text: dayLabel(key) });
		}
		for (const key of weekKeys(this.anchor)) {
			const cell = this.renderDayCell(grid, key, dateProp, byDay.get(key) || [], today);
			this.renderCellEvents(cell, byDay.get(key) || []);
		}
	}

	/** A day cell that is a drop target for reschedule and offers a create button. */
	private renderDayCell(
		grid: HTMLElement,
		key: string,
		dateProp: string,
		_rows: Row[],
		today: string
	): HTMLElement {
		const cell = grid.createDiv({ cls: "bpp-cal-cell" });
		if (key === today) cell.addClass("is-today");

		const add = cell.createEl("button", {
			cls: "bpp-cal-add",
			text: "+",
			attr: { "aria-label": `Create a note on ${key}` },
		});
		add.addEventListener("click", (evt) => {
			evt.stopPropagation();
			void this.createOnDay(key, dateProp);
		});

		cell.addEventListener("dragover", (evt) => {
			if (!(evt.dataTransfer?.types ?? []).includes(DND_ROW)) return;
			evt.preventDefault();
			cell.addClass("is-drop-target");
			if (evt.dataTransfer) evt.dataTransfer.dropEffect = "move";
		});
		cell.addEventListener("dragleave", () => cell.removeClass("is-drop-target"));
		cell.addEventListener("drop", (evt) => {
			cell.removeClass("is-drop-target");
			const rowId = evt.dataTransfer?.getData(DND_ROW) || evt.dataTransfer?.getData("text/plain");
			if (!rowId) return;
			evt.preventDefault();
			void this.reschedule(rowId, dateProp, key);
		});
		return cell;
	}

	private renderCellEvents(cell: HTMLElement, rows: Row[]): void {
		const colorProp = this.plugin.settings.calendarColorProp.trim();
		for (const row of rows) {
			const ev = cell.createDiv({ cls: "bpp-cal-event", text: row.name });
			if (colorProp) {
				const value = toStr(row.scope.get(colorProp));
				if (value) {
					ev.addClass("is-colored");
					ev.setCssProps({ "--bpp-col-hue": String(columnHue(value)) });
				}
			}
			ev.draggable = true;
			ev.addEventListener("dragstart", (evt) => {
				ev.addClass("is-dragging");
				evt.dataTransfer?.setData(DND_ROW, row.id);
				evt.dataTransfer?.setData("text/plain", row.id);
				if (evt.dataTransfer) evt.dataTransfer.effectAllowed = "move";
			});
			ev.addEventListener("dragend", () => ev.removeClass("is-dragging"));
			ev.addEventListener("click", () => this.openRow(row));
		}
	}

	// ---- agenda ---------------------------------------------------------------

	private renderAgenda(container: HTMLElement, byDay: Map<string, Row[]>, _dateProp: string): void {
		const days = [...byDay.keys()].sort();
		const list = container.createDiv({ cls: "bpp-agenda" });
		if (days.length === 0) {
			list.createDiv({ cls: "bpp-empty", text: "No dated notes to show." });
			return;
		}
		const today = todayIso();
		for (const key of days) {
			const group = list.createDiv({ cls: "bpp-agenda-day" });
			const head = group.createDiv({ cls: "bpp-agenda-date" });
			head.createSpan({ text: dayLabel(key) });
			head.createSpan({ cls: "bpp-muted", text: key });
			if (key === today) head.createSpan({ cls: "bpp-badge bpp-badge-lite", text: "Today" });
			for (const row of byDay.get(key) || []) {
				const item = group.createDiv({ cls: "bpp-agenda-item", text: row.name });
				item.addEventListener("click", () => this.openRow(row));
			}
		}
	}

	// ---- mutations ------------------------------------------------------------

	private async reschedule(rowId: string, dateProp: string, targetKey: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(rowId);
		if (!(file instanceof TFile)) return;
		const cache = this.app.metadataCache.getFileCache(file);
		const original: unknown = cache?.frontmatter?.[dateProp];
		await writeRowProperty(this.plugin, rowId, dateProp, rescheduleDateValue(original, targetKey));
		await this.render();
	}

	private async createOnDay(key: string, dateProp: string): Promise<void> {
		try {
			const file = await createSeededNote(
				this.plugin,
				this.plugin.settings.calendarQuickAddFolder,
				dateProp,
				key,
				`Note ${key}`
			);
			new Notice(`Created ${file.basename}`);
		} catch (error) {
			new Notice(`Bases Power Pack: could not create note (${String(error)}).`);
		}
		await this.render();
	}

}

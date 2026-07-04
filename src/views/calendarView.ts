import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type BasesPowerPackPlugin from "../main";
import type { Row } from "../model/row";
import { toStr } from "../engine/expression";
import { resolveViewRows } from "./viewData";
import { renderContextControls, renderRollupBar } from "./viewChrome";

export const VIEW_TYPE_CALENDAR = "bpp-calendar-view";

/**
 * Calendar view (PREMIUM). Places the resolved rows onto a month grid by a
 * configurable date property (default `due`), honoring the active base + saved
 * filter and showing the roll-up summary bar. Lite users see an upgrade notice.
 */
export class CalendarView extends ItemView {
	private plugin: BasesPowerPackPlugin;
	private cursor: { year: number; month: number };
	private renderToken = 0;

	constructor(leaf: WorkspaceLeaf, plugin: BasesPowerPackPlugin) {
		super(leaf);
		this.plugin = plugin;
		const now = new Date();
		this.cursor = { year: now.getFullYear(), month: now.getMonth() };
	}

	getViewType(): string {
		return VIEW_TYPE_CALENDAR;
	}
	getDisplayText(): string {
		return "Power Pack: Calendar";
	}
	getIcon(): string {
		return "calendar";
	}

	async onOpen(): Promise<void> {
		await this.render();
		this.registerEvent(this.app.metadataCache.on("changed", () => void this.render()));
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	async render(): Promise<void> {
		const token = ++this.renderToken;
		const container = this.contentEl;

		if (!this.plugin.settings.isPro) {
			container.empty();
			container.addClass("bpp-view");
			this.renderUpgradeNotice(container);
			return;
		}

		const resolved = await resolveViewRows(this.app, this.plugin);
		if (token !== this.renderToken) return;

		container.empty();
		container.addClass("bpp-view");

		const dateProp = this.plugin.settings.calendarDateProp || "due";

		const toolbar = container.createDiv({ cls: "bpp-toolbar" });
		toolbar.createEl("h3", { text: "Calendar" });
		toolbar.createSpan({ cls: "bpp-badge bpp-badge-premium", text: "Premium" });

		const nav = toolbar.createDiv({ cls: "bpp-cal-nav" });
		const prev = nav.createEl("button", { text: "‹" });
		const label = nav.createSpan({ cls: "bpp-cal-label" });
		const next = nav.createEl("button", { text: "›" });
		prev.onclick = () => this.shiftMonth(-1);
		next.onclick = () => this.shiftMonth(1);

		const monthName = new Date(this.cursor.year, this.cursor.month, 1).toLocaleString(undefined, {
			month: "long",
			year: "numeric",
		});
		label.setText(monthName);
		toolbar.createSpan({ cls: "bpp-muted", text: `dates from "${dateProp}"` });

		renderContextControls(container, this.plugin, resolved, () => void this.render());
		renderRollupBar(container, this.plugin, resolved.rows);

		const byDay = this.collectByDay(resolved.rows, dateProp);
		this.renderGrid(container, byDay);
	}

	private renderUpgradeNotice(container: HTMLElement): void {
		const box = container.createDiv({ cls: "bpp-upgrade" });
		box.createEl("h3", { text: "📅 Calendar is a Premium view" });
		box.createEl("p", {
			text: "Unlock the Calendar, Gantt timeline, roll-ups & formulas, and saved filters with a Bases Power Pack license.",
		});
		const btn = box.createEl("button", { text: "Enter license key in settings", cls: "mod-cta" });
		btn.onclick = () => {
			const setting = (this.app as unknown as { setting?: { open?: () => void; openTabById?: (id: string) => void } }).setting;
			setting?.open?.();
			setting?.openTabById?.(this.plugin.manifest.id);
		};
	}

	private shiftMonth(delta: number): void {
		let m = this.cursor.month + delta;
		let y = this.cursor.year;
		if (m < 0) {
			m = 11;
			y -= 1;
		} else if (m > 11) {
			m = 0;
			y += 1;
		}
		this.cursor = { year: y, month: m };
		void this.render();
	}

	/** Map "YYYY-MM-DD" -> rows whose date property falls on that day. */
	private collectByDay(rows: Row[], dateProp: string): Map<string, Row[]> {
		const map = new Map<string, Row[]>();
		for (const row of rows) {
			const value = row.scope.get(dateProp);
			if (value === undefined || value === null || value === "") continue;
			const key = this.normalizeDateKey(toStr(value));
			if (!key) continue;
			if (!map.has(key)) map.set(key, []);
			map.get(key)!.push(row);
		}
		return map;
	}

	private normalizeDateKey(raw: string): string | null {
		const iso = raw.slice(0, 10);
		const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
		if (m) return iso;
		const d = new Date(raw);
		if (isNaN(d.getTime())) return null;
		const y = d.getFullYear();
		const mm = String(d.getMonth() + 1).padStart(2, "0");
		const day = String(d.getDate()).padStart(2, "0");
		return `${y}-${mm}-${day}`;
	}

	private renderGrid(container: HTMLElement, byDay: Map<string, Row[]>): void {
		const grid = container.createDiv({ cls: "bpp-cal-grid" });
		const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
		for (const w of weekdays) {
			grid.createDiv({ cls: "bpp-cal-weekday", text: w });
		}

		const first = new Date(this.cursor.year, this.cursor.month, 1);
		const startOffset = first.getDay();
		const daysInMonth = new Date(this.cursor.year, this.cursor.month + 1, 0).getDate();

		for (let i = 0; i < startOffset; i++) {
			grid.createDiv({ cls: "bpp-cal-cell bpp-cal-empty" });
		}

		for (let day = 1; day <= daysInMonth; day++) {
			const cell = grid.createDiv({ cls: "bpp-cal-cell" });
			cell.createDiv({ cls: "bpp-cal-daynum", text: String(day) });
			const m = String(this.cursor.month + 1).padStart(2, "0");
			const d = String(day).padStart(2, "0");
			const key = `${this.cursor.year}-${m}-${d}`;
			const rows = byDay.get(key) || [];
			for (const row of rows) {
				const ev = cell.createDiv({ cls: "bpp-cal-event", text: row.name });
				ev.addEventListener("click", () => this.openRow(row));
			}
		}
	}

	private openRow(row: Row): void {
		const file = this.app.vault.getAbstractFileByPath(row.id);
		if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
	}
}

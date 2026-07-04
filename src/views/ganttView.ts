import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type BasesPowerPackPlugin from "../main";
import type { Row } from "../model/row";
import { toStr } from "../engine/expression";
import { buildGantt, toDayNumber, type GanttBar } from "../query/gantt";
import { resolveViewRows } from "./viewData";
import { renderContextControls, renderRollupBar } from "./viewChrome";

export const VIEW_TYPE_GANTT = "bpp-gantt-view";

/**
 * Gantt timeline (PREMIUM). Lays the resolved rows out as horizontal bars on a
 * shared day axis using a start and (optional) end date property. Pure date
 * math lives in query/gantt.ts; this view is a thin renderer over it.
 */
export class GanttView extends ItemView {
	private plugin: BasesPowerPackPlugin;
	private renderToken = 0;

	constructor(leaf: WorkspaceLeaf, plugin: BasesPowerPackPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_GANTT;
	}
	getDisplayText(): string {
		return "Power Pack: Gantt";
	}
	getIcon(): string {
		return "gantt-chart";
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

		const startProp = this.plugin.settings.ganttStartProp || "start";
		const endProp = this.plugin.settings.ganttEndProp || "end";

		const toolbar = container.createDiv({ cls: "bpp-toolbar" });
		toolbar.createEl("h3", { text: "Gantt" });
		toolbar.createSpan({ cls: "bpp-badge bpp-badge-premium", text: "Premium" });
		toolbar.createSpan({ cls: "bpp-muted", text: `${startProp} → ${endProp}` });

		renderContextControls(container, this.plugin, resolved, () => void this.render());
		renderRollupBar(container, this.plugin, resolved.rows);

		const rowByPath = new Map<string, Row>();
		const input = resolved.rows.map((row) => {
			rowByPath.set(row.id, row);
			return {
				id: row.id,
				name: row.name,
				start: valueToDateString(row.scope.get(startProp)),
				end: valueToDateString(row.scope.get(endProp)),
			};
		});

		const model = buildGantt(input, 1, 180);

		if (model.bars.length === 0) {
			container.createDiv({
				cls: "bpp-empty",
				text: `No notes with a "${startProp}" date found. Add "${startProp}: 2026-01-01" to a note's frontmatter to place it on the timeline.`,
			});
			return;
		}

		const chart = container.createDiv({ cls: "bpp-gantt" });

		// Axis header: date range + today marker position.
		const axis = chart.createDiv({ cls: "bpp-gantt-axis" });
		axis.createDiv({ cls: "bpp-gantt-name bpp-gantt-axis-label", text: "Task" });
		const axisTrack = axis.createDiv({ cls: "bpp-gantt-track" });
		axisTrack.createSpan({ cls: "bpp-muted", text: model.days[0] });
		axisTrack.createSpan({
			cls: "bpp-muted bpp-gantt-axis-end",
			text: model.days[model.days.length - 1],
		});

		const total = model.days.length;
		const todayDay = toDayNumber(new Date().toISOString().slice(0, 10));
		const firstDay = toDayNumber(model.days[0]);
		if (todayDay !== null && firstDay !== null) {
			const offset = todayDay - firstDay;
			if (offset >= 0 && offset < total) {
				const marker = axisTrack.createDiv({ cls: "bpp-gantt-today" });
				marker.setCssProps({ left: `${(offset / total) * 100}%` });
			}
		}

		for (const bar of model.bars) {
			this.renderBar(chart, bar, total, rowByPath.get(bar.id));
		}

		if (model.skipped > 0) {
			container.createDiv({
				cls: "bpp-muted bpp-gantt-skipped",
				text: `${model.skipped} note${model.skipped === 1 ? "" : "s"} without a valid "${startProp}" date not shown.`,
			});
		}
	}

	private renderBar(chart: HTMLElement, bar: GanttBar, total: number, row: Row | undefined): void {
		const rowEl = chart.createDiv({ cls: "bpp-gantt-row" });
		const name = rowEl.createDiv({ cls: "bpp-gantt-name", text: bar.name });
		if (row) name.addEventListener("click", () => this.openRow(row));

		const track = rowEl.createDiv({ cls: "bpp-gantt-track" });
		const barEl = track.createDiv({ cls: "bpp-gantt-bar" });
		barEl.setCssProps({
			left: `${(bar.startIndex / total) * 100}%`,
			width: `${Math.max(1 / total, bar.span / total) * 100}%`,
		});
		barEl.setAttr("title", `${bar.name}: ${bar.startDate} → ${bar.endDate}`);
		if (row) barEl.addEventListener("click", () => this.openRow(row));
	}

	private renderUpgradeNotice(container: HTMLElement): void {
		const box = container.createDiv({ cls: "bpp-upgrade" });
		box.createEl("h3", { text: "📊 Gantt is a Premium view" });
		box.createEl("p", {
			text: "Unlock the Gantt timeline, Calendar, roll-ups & formulas, and saved filters with a Bases Power Pack license.",
		});
		const btn = box.createEl("button", { text: "Enter license key in settings", cls: "mod-cta" });
		btn.onclick = () => {
			const setting = (this.app as unknown as { setting?: { open?: () => void; openTabById?: (id: string) => void } }).setting;
			setting?.open?.();
			setting?.openTabById?.(this.plugin.manifest.id);
		};
	}

	private openRow(row: Row): void {
		const file = this.app.vault.getAbstractFileByPath(row.id);
		if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
	}
}

function valueToDateString(value: unknown): string | null {
	if (value === undefined || value === null || value === "") return null;
	return toStr(value);
}

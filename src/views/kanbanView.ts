import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type BasesPowerPackPlugin from "../main";
import type { Row } from "../model/row";
import { evaluateSafe, toStr } from "../engine/expression";
import { resolveViewRows } from "./viewData";
import { renderContextControls, renderRollupBar } from "./viewChrome";

export const VIEW_TYPE_KANBAN = "bpp-kanban-view";

/**
 * Kanban board (LITE / free tier). Groups the resolved rows by a frontmatter
 * property (or, for premium users, any formula) into columns. Premium adds the
 * active base + saved filter, a roll-up summary bar, and an optional per-card
 * formula line — all driven by the shared query engine.
 */
export class KanbanView extends ItemView {
	private plugin: BasesPowerPackPlugin;
	private renderToken = 0;

	constructor(leaf: WorkspaceLeaf, plugin: BasesPowerPackPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_KANBAN;
	}
	getDisplayText(): string {
		return "Power Pack: Kanban";
	}
	getIcon(): string {
		return "layout-dashboard";
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
		const resolved = await resolveViewRows(this.app, this.plugin);
		if (token !== this.renderToken) return; // a newer render superseded this one

		const groupBy = this.plugin.settings.kanbanGroupBy || "status";
		const container = this.contentEl;
		container.empty();
		container.addClass("bpp-view");

		const header = container.createDiv({ cls: "bpp-toolbar" });
		header.createEl("h3", { text: "Kanban" });
		header.createEl("span", { cls: "bpp-badge bpp-badge-lite", text: "Lite" });
		header.createEl("span", { cls: "bpp-muted", text: `grouped by "${groupBy}"` });

		renderContextControls(container, this.plugin, resolved, () => void this.render());
		renderRollupBar(container, this.plugin, resolved.rows);

		const columns = this.collectColumns(resolved.rows, groupBy);
		const board = container.createDiv({ cls: "bpp-kanban-board" });

		if (columns.size === 0) {
			board.createDiv({
				cls: "bpp-empty",
				text: `No notes with a "${groupBy}" property found. Add "${groupBy}: To Do" to a note's frontmatter to populate the board.`,
			});
			return;
		}

		const cardFormula = this.plugin.settings.isPro ? this.plugin.settings.cardFormula.trim() : "";

		for (const [colName, rows] of columns) {
			const col = board.createDiv({ cls: "bpp-kanban-column" });
			const colHead = col.createDiv({ cls: "bpp-kanban-column-head" });
			colHead.createSpan({ text: colName });
			colHead.createSpan({ cls: "bpp-count", text: String(rows.length) });

			for (const row of rows) {
				const card = col.createDiv({ cls: "bpp-card" });
				card.createDiv({ cls: "bpp-card-title", text: row.name });
				if (cardFormula) {
					const val = evaluateSafe(cardFormula, row.scope);
					if (val !== null && toStr(val) !== "") {
						card.createDiv({ cls: "bpp-card-meta", text: toStr(val) });
					}
				}
				card.addEventListener("click", () => this.openRow(row));
			}
		}
	}

	/** Group rows by a property/formula into ordered columns. */
	private collectColumns(rows: Row[], groupBy: string): Map<string, Row[]> {
		const columns = new Map<string, Row[]>();
		for (const row of rows) {
			const value = row.scope.get(groupBy);
			if (value === undefined || value === null || value === "") continue;
			// toStr is the engine's canonical value->string (handles Date/array); a bare
			// String() here trips no-base-to-string on the unknown scope value.
			const colName = toStr(value);
			if (!columns.has(colName)) columns.set(colName, []);
			columns.get(colName)!.push(row);
		}
		return columns;
	}

	private openRow(row: Row): void {
		const file = this.app.vault.getAbstractFileByPath(row.id);
		if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
	}
}

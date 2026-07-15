import { ItemView, Notice, TFile, WorkspaceLeaf, normalizePath } from "obsidian";
import type BasesPowerPackPlugin from "../main";
import type { Row } from "../model/row";
import {
	buildKanbanColumns,
	getCardMeta,
	type KanbanSort,
} from "../query/kanban";
import {
	buildQuickAddContent,
	buildQuickAddPath,
	buildQuickAddTitle,
	setKanbanGroupValue,
} from "../query/kanbanActions";
import { evaluateSafe, toStr } from "../engine/expression";
import { resolveViewRows } from "./viewData";
import { renderContextControls, renderRollupBar } from "./viewChrome";

export const VIEW_TYPE_KANBAN = "bpp-kanban-view";

const SORT_OPTIONS: Array<{ value: KanbanSort; label: string }> = [
	{ value: "manual", label: "Default order" },
	{ value: "name-asc", label: "Name ↑" },
	{ value: "name-desc", label: "Name ↓" },
	{ value: "due-asc", label: "Due date" },
	{ value: "priority-desc", label: "Priority" },
	{ value: "mtime-desc", label: "Recently changed" },
];

/**
 * Kanban board (LITE / free tier). Groups the resolved rows by a frontmatter
 * property (or, for premium users, any formula) into columns. Premium adds the
 * active base + saved filter, a roll-up summary bar, and an optional per-card
 * formula line — all driven by the shared query engine.
 */
export class KanbanView extends ItemView {
	private plugin: BasesPowerPackPlugin;
	private renderToken = 0;
	private search = "";
	private hideDoneColumn = false;
	private sortBy: KanbanSort = "manual";
	/** The live search input, so a re-render can tell whether it had focus before
	 * container.empty() destroys it, and hand focus back to its replacement. */
	private searchInputEl: HTMLInputElement | null = null;
	private restoreSearchFocus = false;

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
		this.searchInputEl = null;
		this.contentEl.empty();
	}

	async render(): Promise<void> {
		const token = ++this.renderToken;
		const resolved = await resolveViewRows(this.app, this.plugin);
		if (token !== this.renderToken) return;

		const groupBy = this.plugin.settings.kanbanGroupBy || "status";
		const container = this.contentEl;
		// Capture focus intent before empty() blows the input away, so any re-render
		// that fires while the user is typing (a keystroke, or a vault change) restores it.
		this.restoreSearchFocus = this.searchInputEl !== null && document.activeElement === this.searchInputEl;
		container.empty();
		container.addClass("bpp-view");

		const header = container.createDiv({ cls: "bpp-toolbar" });
		header.createEl("h3", { text: "Kanban" });
		header.createEl("span", { cls: "bpp-badge bpp-badge-lite", text: "Lite" });
		header.createEl("span", { cls: "bpp-muted", text: `grouped by "${groupBy}"` });

		renderContextControls(container, this.plugin, resolved, () => void this.render());
		this.renderLiteControls(container);
		renderRollupBar(container, this.plugin, resolved.rows);

		const columns = buildKanbanColumns(resolved.rows, {
			groupBy,
			search: this.search,
			hideColumn: this.hideDoneColumn ? "done" : "",
			sortBy: this.sortBy,
		});
		const board = container.createDiv({ cls: "bpp-kanban-board" });
		const rowById = new Map(resolved.rows.map((row) => [row.id, row]));

		if (columns.length === 0) {
			board.createDiv({
				cls: "bpp-empty",
				text: this.search || this.hideDoneColumn
					? "No cards match the current lite filters."
					: `No notes with a "${groupBy}" property found. Add "${groupBy}: To Do" to a note's frontmatter to populate the board.`,
			});
			return;
		}

		const cardFormula = this.plugin.settings.isPro ? this.plugin.settings.cardFormula.trim() : "";
		const metaFields = this.plugin.settings.kanbanCardFields;

		for (const column of columns) {
			const col = board.createDiv({ cls: "bpp-kanban-column" });
			this.wireColumnDrop(col, column.name, groupBy, rowById);

			const colHead = col.createDiv({ cls: "bpp-kanban-column-head" });
			const colLabel = colHead.createDiv({ cls: "bpp-kanban-column-label" });
			colLabel.createSpan({ text: column.name });
			colLabel.createSpan({ cls: "bpp-count", text: String(column.rows.length) });

			const addButton = colHead.createEl("button", {
				cls: "bpp-column-add",
				text: "+",
				attr: { "aria-label": `Add note to ${column.name}` },
			});
			addButton.addEventListener("click", () => void this.quickAddNote(column.name, groupBy));

			for (const row of column.rows) {
				const card = col.createDiv({ cls: "bpp-card" });
				card.draggable = true;
				card.createDiv({ cls: "bpp-card-title", text: row.name });
				for (const line of getCardMeta(row, metaFields)) {
					card.createDiv({ cls: "bpp-card-meta", text: line });
				}
				if (cardFormula) {
					const val = evaluateSafe(cardFormula, row.scope);
					if (val !== null && toStr(val) !== "") {
						card.createDiv({ cls: "bpp-card-meta bpp-card-meta-premium", text: toStr(val) });
					}
				}
				card.addEventListener("dragstart", (event) => {
					card.addClass("is-dragging");
					event.dataTransfer?.setData("text/plain", row.id);
					event.dataTransfer?.setData("application/x-bpp-row", row.id);
					if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
				});
				card.addEventListener("dragend", () => card.removeClass("is-dragging"));
				card.addEventListener("click", () => this.openRow(row));
			}
		}
	}

	private renderLiteControls(container: HTMLElement): void {
		const controls = container.createDiv({ cls: "bpp-lite-controls" });

		const searchWrap = controls.createDiv({ cls: "bpp-lite-control" });
		searchWrap.createSpan({ cls: "bpp-muted", text: "Search" });
		const searchInput = searchWrap.createEl("input", {
			type: "search",
			cls: "bpp-lite-input",
			placeholder: "Filter cards…",
		});
		searchInput.value = this.search;
		this.searchInputEl = searchInput;
		searchInput.addEventListener("input", () => {
			this.search = searchInput.value;
			void this.render();
		});
		if (this.restoreSearchFocus) {
			this.restoreSearchFocus = false;
			searchInput.focus();
			const end = searchInput.value.length;
			searchInput.setSelectionRange(end, end);
		}

		const sortWrap = controls.createDiv({ cls: "bpp-lite-control" });
		sortWrap.createSpan({ cls: "bpp-muted", text: "Sort" });
		const sortSelect = sortWrap.createEl("select", { cls: "bpp-lite-select" });
		for (const option of SORT_OPTIONS) {
			const el = sortSelect.createEl("option", { text: option.label, value: option.value });
			if (option.value === this.sortBy) el.selected = true;
		}
		sortSelect.addEventListener("change", () => {
			this.sortBy = sortSelect.value as KanbanSort;
			void this.render();
		});

		const toggleWrap = controls.createDiv({ cls: "bpp-lite-control bpp-lite-control-toggle" });
		const toggle = toggleWrap.createEl("input", { type: "checkbox" });
		toggle.checked = this.hideDoneColumn;
		toggle.addEventListener("change", () => {
			this.hideDoneColumn = toggle.checked;
			void this.render();
		});
		toggleWrap.createSpan({ cls: "bpp-muted", text: "Hide done" });
	}

	private wireColumnDrop(
		columnEl: HTMLElement,
		columnName: string,
		groupBy: string,
		rowById: Map<string, Row>
	): void {
		columnEl.addEventListener("dragover", (event) => {
			event.preventDefault();
			columnEl.addClass("is-drop-target");
			if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
		});
		columnEl.addEventListener("dragleave", () => columnEl.removeClass("is-drop-target"));
		columnEl.addEventListener("drop", (event) => {
			event.preventDefault();
			columnEl.removeClass("is-drop-target");
			const rowId = event.dataTransfer?.getData("application/x-bpp-row") || event.dataTransfer?.getData("text/plain");
			if (!rowId) return;
			const row = rowById.get(rowId);
			if (!row) return;
			void this.moveRowToColumn(row, groupBy, columnName);
		});
	}

	private async moveRowToColumn(row: Row, groupBy: string, columnName: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(row.id);
		if (!(file instanceof TFile)) return;
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
			const target = frontmatter as Record<string, unknown>;
			const next = setKanbanGroupValue(target, groupBy, columnName);
			for (const [key, value] of Object.entries(next)) target[key] = value;
		});

		await this.render();
	}

	private async quickAddNote(columnName: string, groupBy: string): Promise<void> {
		const title = buildQuickAddTitle(columnName);
		const basePath = normalizePath(buildQuickAddPath(this.plugin.settings.kanbanQuickAddFolder, title));
		const path = await this.makeUniquePath(basePath);
		await this.ensureFolder(path);
		const file = await this.app.vault.create(path, buildQuickAddContent(groupBy, columnName, title));
		new Notice(`Created ${file.basename}`);
		// Open in a new tab, not getLeaf(false): the board lives in the active leaf, and
		// reusing it would replace this view and strand the render() below on a dead contentEl.
		await this.app.workspace.getLeaf("tab").openFile(file);
		await this.render();
	}

	private async ensureFolder(path: string): Promise<void> {
		const parts = path.split("/");
		parts.pop();
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			const normalized = normalizePath(current);
			if (!normalized) continue;
			if (this.app.vault.getAbstractFileByPath(normalized)) continue;
			await this.app.vault.createFolder(normalized);
		}
	}

	private async makeUniquePath(basePath: string): Promise<string> {
		if (!this.app.vault.getAbstractFileByPath(basePath)) return basePath;
		const suffix = ".md";
		const stem = basePath.endsWith(suffix) ? basePath.slice(0, -suffix.length) : basePath;
		for (let i = 2; i < 1000; i++) {
			const candidate = `${stem} ${i}${suffix}`;
			if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;
		}
		throw new Error(`Could not find free path for ${basePath}`);
	}

	private openRow(row: Row): void {
		const file = this.app.vault.getAbstractFileByPath(row.id);
		if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
	}
}

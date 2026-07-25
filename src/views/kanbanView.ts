import { PowerPackView } from "./abstractView";
import { type KanbanSort } from "../query/kanban";
import { buildCsv, buildMarkdownBoard, buildMarkdownTable } from "../query/export";
import { renderContextControls, renderRollupBar } from "./viewChrome";
import { KanbanBoard, SORT_OPTIONS, type BoardHost, type BoardInput } from "./kanbanBoard";

export const VIEW_TYPE_KANBAN = "bpp-kanban-view";

/**
 * Kanban board (LITE / free tier). The standalone host for the shared {@link KanbanBoard}
 * renderer: this ItemView owns the toolbar (group-by / search / sort / swimlanes / column
 * sets / hide-done / bulk-edit, plus the undo + export buttons and the roll-up/hint bars)
 * and the managed quick-search; it delegates the board grid itself — cards, drag/touch,
 * inline edit, menus, multi-select — to `KanbanBoard` via a {@link BoardHost} seam. The
 * native Bases view is the other host of the same renderer.
 */
export class KanbanView extends PowerPackView {
	/** The shared board renderer. Built lazily so its host closes over a fully-constructed
	 * view; owns all board DOM + interaction state. */
	private _board: KanbanBoard | null = null;
	private get board(): KanbanBoard {
		if (!this._board) this._board = new KanbanBoard(this.plugin, this.makeBoardHost());
		return this._board;
	}

	/** The last snapshot handed to the board — retained so `host.captureInput()` can return
	 * the same immutable view the DOM was rendered from. */
	private lastBoardInput: BoardInput = {
		revision: 0,
		rows: [],
		formulas: {},
		searchQuery: "",
		showControls: true,
		groupBy: "status",
		swimlaneProp: "",
		hoverSource: VIEW_TYPE_KANBAN,
	};

	/** Build the host seam the shared board calls back through (re-render, interaction
	 * suppression, row-action env, quick-search, capabilities). The standalone can write
	 * the group-by, multi-select, swimlane, and drive the full column chrome. */
	private makeBoardHost(): BoardHost {
		return {
			containerEl: this.contentEl,
			rowEnv: this.rowEnv,
			captureInput: () => this.lastBoardInput,
			requestRender: () => void this.render(),
			beginInteraction: () => this.beginInteraction(),
			endInteraction: () => this.endInteraction(),
			setSearch: (query: string) => {
				this.searchQuery = query;
				void this.render();
			},
			registerRefresh: () => () => {},
			capabilities: {
				canWriteGroupBy: true,
				canMultiSelect: true,
				canSwimlanes: true,
				canColumnChrome: true,
			},
		};
	}

	/** The swimlane (second group-by) property, or "" when off. Free — horizontal bands
	 * split the board by a second property (the flat board is "None"). */
	private get swimlaneProp(): string {
		const p = (this.plugin.settings.kanbanSwimlaneBy || "").trim();
		// A lane property equal to the column group-by is degenerate (one card per cell) —
		// treat it as "off" rather than render a broken board.
		return p && p !== (this.plugin.settings.kanbanGroupBy || "status") ? p : "";
	}

	private get groupByProp(): string {
		return this.plugin.settings.kanbanGroupBy || "status";
	}

	/** Sort + hide-done are persisted per group-by property, so the board reopens exactly
	 * as you left it (they were session-only fields before 1.11). */
	private get sortBy(): KanbanSort {
		const v = this.plugin.settings.kanbanSortBy[this.groupByProp];
		return SORT_OPTIONS.some((o) => o.value === v) ? (v as KanbanSort) : "manual";
	}

	private get hideDoneColumn(): boolean {
		return this.plugin.settings.kanbanHideDone[this.groupByProp] === true;
	}

	private async setSortBy(value: KanbanSort): Promise<void> {
		if (value === "manual") delete this.plugin.settings.kanbanSortBy[this.groupByProp];
		else this.plugin.settings.kanbanSortBy[this.groupByProp] = value;
		// Sort is applied AFTER resolution, so it can't change the resolved rows — skip the
		// cache drop to keep the toggle O(1).
		await this.plugin.saveSettings({ invalidateResolved: false });
		await this.render();
	}

	private async setHideDone(value: boolean): Promise<void> {
		if (value) this.plugin.settings.kanbanHideDone[this.groupByProp] = true;
		else delete this.plugin.settings.kanbanHideDone[this.groupByProp];
		await this.plugin.saveSettings({ invalidateResolved: false });
		await this.render();
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

	async onClose(): Promise<void> {
		// The board owns the drag machinery (auto-scroll rAF, touch ghost, hover popover);
		// dispose it before the base tears down the DOM so nothing outlives the view.
		this._board?.dispose();
		this._board = null;
		await super.onClose();
	}

	async render(): Promise<void> {
		const token = ++this.renderToken;
		const resolved = await this.plugin.getResolvedView();
		if (this.isStale(token)) return;

		const groupBy = this.plugin.settings.kanbanGroupBy || "status";
		const container = this.contentEl;
		this.captureSearchState();
		container.empty();
		container.addClass("bpp-view");

		const header = container.createDiv({ cls: "bpp-toolbar" });
		header.createEl("h3", { text: "Kanban" });
		// The "Lite" tag informs FREE users which board is the free one; to a licensed user
		// it reads as a permanent downgrade nag, so hide it once Pro.
		if (!this.plugin.settings.isPro) header.createEl("span", { cls: "bpp-badge bpp-badge-lite", text: "Lite" });
		header.createEl("span", { cls: "bpp-muted", text: `grouped by "${groupBy}"` });
		this.renderUndoButton(header);
		// Export builders run lazily at click time, after board.render() below has populated
		// the board's display columns / visible rows.
		this.addExportButton(header, [
			{
				label: "Copy board as Markdown",
				build: () =>
					buildMarkdownBoard(
						[...this.board.displayColumns].map(([name, rows]) => ({ name, rows })),
						this.plugin.settings.kanbanCardFields
					),
			},
			{ label: "Copy as Markdown table", build: () => buildMarkdownTable(this.board.visibleRows, this.exportFields(groupBy)) },
			{ label: "Export as CSV", premium: true, build: () => buildCsv(this.board.visibleRows, this.exportFields(groupBy)) },
		]);

		renderContextControls(container, this.plugin, resolved, () => void this.render());
		this.renderLiteControls(container);
		renderRollupBar(container, this.plugin, resolved.rows);
		this.renderHintBar(container, "kanban", "Drag a card between two others to reorder it • Drag to another column to change status • ⋯ for more actions • Undo reverses the last change");

		// Hand the board one immutable snapshot to render + plan against.
		const input: BoardInput = {
			revision: token,
			rows: resolved.rows,
			formulas: resolved.def.formulas ?? {},
			searchQuery: this.searchQuery,
			showControls: true,
			groupBy,
			swimlaneProp: this.swimlaneProp,
			hoverSource: VIEW_TYPE_KANBAN,
		};
		this.lastBoardInput = input;
		this.board.render(input);
	}

	/** Group-by options come from the cached whole-vault frontmatter key set (not a
	 * per-render scan of the resolved rows). O(1) per render, and — because it isn't
	 * limited to currently-shown rows — the picker still offers every real property on an
	 * empty or heavily-filtered board, so a user is never stranded without a way to switch. */
	private collectGroupByOptions(current: string): string[] {
		const keys = this.plugin.getFrontmatterKeys();
		if (!current || keys.includes(current)) return keys;
		return [...keys, current].sort((a, b) => a.localeCompare(b));
	}

	private renderLiteControls(container: HTMLElement): void {
		const controls = container.createDiv({ cls: "bpp-lite-controls" });

		const groupBy = this.plugin.settings.kanbanGroupBy || "status";
		const groupWrap = controls.createDiv({ cls: "bpp-lite-control" });
		groupWrap.createSpan({ cls: "bpp-muted", text: "Group by" });
		const groupSelect = groupWrap.createEl("select", { cls: "bpp-lite-select dropdown" });
		for (const option of this.collectGroupByOptions(groupBy)) {
			const el = groupSelect.createEl("option", { text: option, value: option });
			if (option === groupBy) el.selected = true;
		}
		groupSelect.addEventListener("change", () => {
			this.plugin.settings.kanbanGroupBy = groupSelect.value || "status";
			// Re-grouping re-buckets already-resolved rows; it doesn't change which notes
			// resolve, so keep the resolve cache (big-vault win on every group-by switch).
			void this.plugin.saveSettings({ invalidateResolved: false }).then(() => this.render());
		});

		this.renderManagedSearch(controls);

		const sortWrap = controls.createDiv({ cls: "bpp-lite-control" });
		sortWrap.createSpan({ cls: "bpp-muted", text: "Sort" });
		const sortSelect = sortWrap.createEl("select", { cls: "bpp-lite-select dropdown" });
		for (const option of SORT_OPTIONS) {
			const el = sortSelect.createEl("option", { text: option.label, value: option.value });
			if (option.value === this.sortBy) el.selected = true;
		}
		sortSelect.addEventListener("change", () => void this.setSortBy(sortSelect.value as KanbanSort));

		// Swimlanes (free): a second group-by that splits the board into horizontal bands.
		// "None" is the flat board. A lane can't be the column group-by itself.
		const swimWrap = controls.createDiv({ cls: "bpp-lite-control" });
		swimWrap.createSpan({ cls: "bpp-muted", text: "Swimlanes" });
		const swimSelect = swimWrap.createEl("select", { cls: "bpp-lite-select dropdown" });
		const currentSwim = this.swimlaneProp;
		const noneSwim = swimSelect.createEl("option", { text: "None", value: "" });
		if (!currentSwim) noneSwim.selected = true;
		for (const option of this.collectGroupByOptions(currentSwim)) {
			if (option === groupBy) continue;
			const el = swimSelect.createEl("option", { text: option, value: option });
			if (option === currentSwim) el.selected = true;
		}
		swimSelect.addEventListener("change", () => {
			this.plugin.settings.kanbanSwimlaneBy = swimSelect.value.trim();
			// Re-banding re-buckets already-resolved rows; keep the resolve cache.
			void this.plugin.saveSettings({ invalidateResolved: false }).then(() => this.render());
		});

		// Column set: apply a saved layout (group-by + order + colors + done value).
		const columnSets = this.plugin.settings.kanbanColumnSets;
		if (columnSets.length > 0) {
			const setWrap = controls.createDiv({ cls: "bpp-lite-control" });
			setWrap.createSpan({ cls: "bpp-muted", text: "Column set" });
			const setSelect = setWrap.createEl("select", { cls: "bpp-lite-select dropdown" });
			setSelect.createEl("option", { text: "Apply…", value: "" });
			for (const cs of columnSets) setSelect.createEl("option", { text: cs.name, value: cs.id });
			setSelect.addEventListener("change", () => {
				const chosen = columnSets.find((c) => c.id === setSelect.value);
				setSelect.value = ""; // reset to the "Apply…" prompt
				if (chosen) void this.board.applyColumnSet(chosen);
			});
		}

		const toggleWrap = controls.createDiv({ cls: "bpp-lite-control bpp-lite-control-toggle" });
		const toggle = toggleWrap.createEl("input", { type: "checkbox" });
		toggle.checked = this.hideDoneColumn;
		toggle.addEventListener("change", () => void this.setHideDone(toggle.checked));
		toggleWrap.createSpan({ cls: "bpp-muted", text: "Hide done" });

		const bulkWrap = controls.createDiv({ cls: "bpp-lite-control" });
		const bulkBtn = bulkWrap.createEl("button", { cls: "bpp-lite-btn", text: "Bulk edit" });
		bulkBtn.setAttr("aria-label", "Bulk edit the visible cards");
		bulkBtn.addEventListener("click", () => this.board.openBulkEdit());
	}

	/** Fields for a row-oriented export (Markdown table / CSV): the note title, the
	 * group-by value, then each configured card field, de-duplicated. */
	private exportFields(groupBy: string): string[] {
		return [...new Set(["name", groupBy, ...this.plugin.settings.kanbanCardFields])];
	}
}

import { Menu, Notice } from "obsidian";
import { COMPUTED_FILE_PROPS, type RawNote, type Row } from "../model/row";
import { PowerPackView } from "./abstractView";
import {
	buildKanbanColumns,
	columnHue,
	dueStatus,
	formatCardField,
	isRowDone,
	priorityClass,
	reorderColumns,
	type KanbanSort,
} from "../query/kanban";
import { toIsoDateKey, todayIso } from "../query/dates";
import { computeRollup } from "../query/rollup";
import {
	buildQuickAddTitle,
} from "../query/kanbanActions";
import { coerceFieldInput, formatFieldForEdit } from "../query/inlineEdit";
import { coerceLiteral, computeRuleWrites, rulesForTransition } from "../query/automation";
import { dropWouldExceed, formatWipCount, isOverWip, limitFor, sanitizeWipLimit } from "../query/wip";
import { parseRank, planReorder, type RankItem } from "../query/ranking";
import { buildCsv, buildMarkdownBoard, buildMarkdownTable } from "../query/export";
import { evaluateSafe, toBool, toStr } from "../engine/expression";
import { createSeededNote, writeRowProperties, writeRowProperty, type PropertyWrite } from "./viewData";
import { renderContextControls, renderRollupBar } from "./viewChrome";
import { BulkEditModal, ConfirmModal, PromptModal, type BulkOp } from "./modals";
import { DND_COLUMN, DND_ROW } from "./dnd";

export const VIEW_TYPE_KANBAN = "bpp-kanban-view";

const SORT_OPTIONS: Array<{ value: KanbanSort; label: string }> = [
	// The default. Drag a card between two others to hand-order it — the position is
	// saved to a `rank` property. (The old board split this into "Default order" +
	// "Manual (drag)"; a saved "rank" now resolves to this single mode, which behaves
	// identically, so the two are merged into one discoverable option.)
	{ value: "manual", label: "Manual — drag to reorder" },
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
export class KanbanView extends PowerPackView {
	/** The currently visible (filtered) rows, captured for the bulk-edit action. */
	private lastVisibleRows: Row[] = [];
	/** TRUE column membership — resolved (base/filter-scoped) rows grouped by
	 * value, ignoring the transient quick-search. Drives WIP badges/enforcement,
	 * per-column roll-ups, and the column-rename target set. */
	private lastColumnRows = new Map<string, Row[]>();
	/** The rows AS DISPLAYED per column (search-filtered, in the active sort order)
	 * — the basis for a manual drag-to-reorder, which reads the shown rank order. */
	private lastDisplayColumns = new Map<string, Row[]>();

	private get groupByProp(): string {
		return this.plugin.settings.kanbanGroupBy || "status";
	}

	private get rankProp(): string {
		return this.plugin.settings.kanbanRankProp || "rank";
	}

	/** Manual drag-to-reorder is live in the hand-order sort — "manual" (the
	 * default) or the legacy "rank" alias — but not while a name/due/priority sort
	 * governs the order, where a hand-set rank would be invisible. */
	private get reorderEnabled(): boolean {
		return this.sortBy === "manual" || this.sortBy === "rank";
	}

	/** Sort + hide-done are persisted per group-by property, so the board reopens
	 * exactly as you left it (they were session-only fields before 1.11). */
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
		// Sort is applied AFTER resolution (buildKanbanColumns), so it can't change
		// the resolved rows — skip the cache drop to keep the toggle O(1).
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
		// The "Lite" tag informs FREE users which board is the free one; to a licensed
		// user it reads as a permanent downgrade nag, so hide it once Pro.
		if (!this.plugin.settings.isPro) header.createEl("span", { cls: "bpp-badge bpp-badge-lite", text: "Lite" });
		header.createEl("span", { cls: "bpp-muted", text: `grouped by "${groupBy}"` });
		this.renderUndoButton(header);
		this.addExportButton(header, [
			{
				label: "Copy board as Markdown",
				build: () =>
					buildMarkdownBoard(
						[...this.lastDisplayColumns].map(([name, rows]) => ({ name, rows })),
						this.plugin.settings.kanbanCardFields
					),
			},
			{ label: "Copy as Markdown table", build: () => buildMarkdownTable(this.lastVisibleRows, this.exportFields(groupBy)) },
			{ label: "Export as CSV", premium: true, build: () => buildCsv(this.lastVisibleRows, this.exportFields(groupBy)) },
		]);

		renderContextControls(container, this.plugin, resolved, () => void this.render());
		this.renderLiteControls(container);
		renderRollupBar(container, this.plugin, resolved.rows);
		this.renderHintBar(container, "kanban", "Drag a card between two others to reorder it • Drag to another column to change status • ⋯ for more actions • Undo reverses the last change");

		const extraColumns = this.plugin.settings.kanbanExtraColumns[groupBy] ?? [];
		const columns = buildKanbanColumns(resolved.rows, {
			groupBy,
			search: this.searchQuery,
			hideColumn: this.hideDoneColumn ? this.plugin.settings.kanbanDoneValue : "",
			sortBy: this.sortBy,
			rankProp: this.rankProp,
			extraColumns,
			columnOrder: this.plugin.settings.kanbanColumnOrder[groupBy] ?? [],
		});
		this.lastVisibleRows = columns.flatMap((column) => column.rows);
		this.lastDisplayColumns = new Map(columns.map((column) => [column.name, column.rows]));
		// TRUE column membership (see lastColumnRows): without it, hiding cards
		// with a search let a drop sneak past a WIP cap because the badge and the
		// enforcement both under-counted the target column.
		const columnRows = new Map<string, Row[]>();
		for (const row of resolved.rows) {
			const name = toStr(row.scope.get(groupBy));
			if (!name) continue;
			if (!columnRows.has(name)) columnRows.set(name, []);
			columnRows.get(name)!.push(row);
		}
		this.lastColumnRows = columnRows;
		// The displayed order — the basis for a header-drag reorder.
		const orderedNames = columns.map((column) => column.name);
		const colored = this.plugin.settings.kanbanColorColumns;
		const board = container.createDiv({ cls: "bpp-kanban-board" });
		if (colored) board.addClass("is-colored");
		const rowById = new Map(resolved.rows.map((row) => [row.id, row]));

		if (columns.length === 0) {
			if (this.searchQuery || this.hideDoneColumn) {
				const actions: Array<{ label: string; onClick: () => void }> = [];
				if (this.searchQuery) {
					actions.push({
						label: "Clear search",
						onClick: () => {
							this.searchQuery = "";
							void this.render();
						},
					});
				}
				if (this.hideDoneColumn) {
					actions.push({ label: "Show done", onClick: () => void this.setHideDone(false) });
				}
				this.renderEmptyState(board, {
					title: "No cards match",
					body: "No cards match the current filters.",
					actions,
				});
				// A "hide done"-only empty board (no search) can still be built on — keep
				// the add-column tile so adding a column doesn't require un-hiding Done first.
				if (!this.searchQuery) this.renderAddColumnTile(board, groupBy);
			} else {
				this.renderEmptyState(board, {
					title: "Start here",
					body: `Power Pack groups your notes by the "${groupBy}" property. Add "${groupBy}: To Do" to a note's frontmatter, or add a column below to begin.`,
					actions: [{ label: "Choose another property", onClick: () => this.openSettings() }],
				});
				this.renderAddColumnTile(board, groupBy);
			}
			return;
		}

		const cardFormula = this.plugin.settings.isPro ? this.plugin.settings.cardFormula.trim() : "";
		const metaFields = this.plugin.settings.kanbanCardFields;
		// Chip context: overdue/soon state applies only to due-style props, and is
		// muted on done cards (a completed task isn't "overdue").
		const today = todayIso();
		const dueProps = new Set(["due", this.plugin.settings.calendarDateProp || "due"]);

		for (const column of columns) {
			const col = board.createDiv({ cls: "bpp-kanban-column" });
			// Badge, over-WIP flag, AND the accessible name all count the column's
			// TRUE membership, not the search-filtered subset — so the announced
			// count agrees with the visible badge and with move enforcement. When a
			// search hides cards, the name says so ("N shown").
			const trueCount = (columnRows.get(column.name) ?? []).length;
			const wipLimit = limitFor(this.plugin.settings.kanbanWipLimits, column.name);
			const overWip = isOverWip(trueCount, wipLimit);
			col.setAttr("role", "group");
			col.setAttr(
				"aria-label",
				`Column ${column.name}, ${trueCount} card${trueCount === 1 ? "" : "s"}` +
					(column.rows.length !== trueCount ? `, ${column.rows.length} shown` : "") +
					(overWip ? ", over WIP limit" : "")
			);
			if (colored) col.setCssProps({ "--bpp-col-hue": this.columnHueFor(column.name) });
			this.wireColumnDrop(col, column.name, groupBy, rowById, orderedNames);

			const colHead = col.createDiv({ cls: "bpp-kanban-column-head" });
			this.makeColumnDraggable(col, colHead, column.name);
			const removable = column.rows.length === 0 && extraColumns.includes(column.name);
			colHead.addEventListener("contextmenu", (evt) =>
				this.openColumnMenu(evt, column.name, groupBy, removable, orderedNames)
			);
			if (overWip) col.addClass("is-over-wip");
			const colLabel = colHead.createDiv({ cls: "bpp-kanban-column-label" });
			colLabel.createSpan({ text: column.name });
			const count = colLabel.createSpan({
				cls: "bpp-count",
				text: formatWipCount(trueCount, wipLimit),
			});
			if (wipLimit !== null) {
				count.addClass("has-wip");
				count.setAttr(
					"title",
					`${trueCount} of ${wipLimit} (WIP limit)` +
						(column.rows.length !== trueCount ? ` · ${column.rows.length} shown` : "")
				);
			} else if (column.rows.length !== trueCount) {
				count.setAttr("title", `${column.rows.length} shown · ${trueCount} total`);
			}

			const actions = colHead.createDiv({ cls: "bpp-column-actions" });
			const addButton = actions.createEl("button", {
				cls: "bpp-column-add",
				text: "+",
				attr: { "aria-label": `Add note to ${column.name}` },
			});
			addButton.addEventListener("click", () => void this.quickAddNote(column.name, groupBy));
			this.addOverflowButton(actions, `column ${column.name}`, (a) =>
				this.openColumnMenu(a, column.name, groupBy, removable, orderedNames)
			);

			// An empty user-added column can be removed — no notes are affected.
			if (column.rows.length === 0 && extraColumns.includes(column.name)) {
				const removeButton = actions.createEl("button", {
					cls: "bpp-column-remove clickable-icon",
					text: "×",
					attr: { "aria-label": `Remove column ${column.name}` },
				});
				removeButton.addEventListener("click", () => void this.removeExtraColumn(groupBy, column.name));
			}

			// Per-column roll-ups (premium): the same configured aggregations as the
			// board-wide bar, computed over just this column's true membership — so a
			// WIP cap can be read by weight ("Doing 6/8 · 21 pts"), not card count.
			if (this.plugin.settings.isPro && this.plugin.settings.rollups.length > 0) {
				const chips = col.createDiv({ cls: "bpp-col-rollups" });
				for (const rollup of this.plugin.settings.rollups) {
					chips.createSpan({
						cls: "bpp-col-rollup",
						text: `${rollup.label || rollup.aggregation}: ${computeRollup(rollup, columnRows.get(column.name) ?? [])}`,
					});
				}
			}

			for (const row of column.rows) {
				const card = col.createDiv({ cls: "bpp-card" });
				this.applyColorRule(card, row);
				card.draggable = true;
				const openMenu = (a: MouseEvent | HTMLElement): void => this.openCardMenu(a, row, groupBy, orderedNames);
				const head = card.createDiv({ cls: "bpp-card-head" });
				head.createDiv({ cls: "bpp-card-title", text: row.name });
				this.addOverflowButton(head, row.name, openMenu);
				// Row-level (not column-level) so a `done: true` card in a non-Done
				// column mutes its overdue chip too — matching the Calendar's overdue rule.
				const isDone = isRowDone(row, groupBy, this.plugin.settings.kanbanDoneValue);
				for (const field of metaFields) {
					const display = formatCardField(row, field);
					if (display === null) continue;
					this.renderEditableField(card, row, field, display, {
						today,
						dueState: dueProps.has(field) && !isDone,
					});
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
					event.dataTransfer?.setData(DND_ROW, row.id);
					if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
				});
				card.addEventListener("dragend", () => card.removeClass("is-dragging"));
				// Hand-order sort: each card is a precise drop target so a drag lands
				// BETWEEN two cards, writing a rank that sorts it there.
				if (this.reorderEnabled) this.wireCardReorder(card, row, column.name, groupBy);
				card.addEventListener("click", () => this.openRow(row));
				// Focusable + Enter-to-open + Shift+F10/ContextMenu-to-menu (keyboard path).
				this.makeItemAccessible(card, row.name, () => this.openRow(row), openMenu);
				card.addEventListener("contextmenu", (evt) => openMenu(evt));
			}
		}

		if (!this.searchQuery) this.renderAddColumnTile(board, groupBy);
	}

	private renderAddColumnTile(board: HTMLElement, groupBy: string): void {
		const tile = board.createDiv({ cls: "bpp-kanban-column bpp-kanban-add-column" });
		const form = tile.createDiv({ cls: "bpp-add-column-form" });
		const input = form.createEl("input", {
			type: "text",
			cls: "bpp-lite-input",
			placeholder: "New column…",
			attr: { "aria-label": `Add a new "${groupBy}" column` },
		});
		const button = form.createEl("button", { cls: "bpp-add-column-btn", text: "+ Add column" });
		const commit = (): void => {
			const name = input.value.trim();
			if (!name) return;
			void this.addExtraColumn(groupBy, name);
		};
		button.addEventListener("click", commit);
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				commit();
			}
		});
	}

	private async addExtraColumn(groupBy: string, name: string): Promise<void> {
		const map = this.plugin.settings.kanbanExtraColumns;
		const existing = map[groupBy] ?? [];
		if (!existing.some((n) => n.toLocaleLowerCase() === name.toLocaleLowerCase())) {
			map[groupBy] = [...existing, name];
			// Presentational: an empty column changes no note, so keep the resolve cache
			// (matches setSortBy / setHideDone) instead of re-resolving the whole vault.
			await this.plugin.saveSettings({ invalidateResolved: false });
		}
		await this.render();
	}

	private async removeExtraColumn(groupBy: string, name: string): Promise<void> {
		const map = this.plugin.settings.kanbanExtraColumns;
		const next = (map[groupBy] ?? []).filter((n) => n !== name);
		if (next.length > 0) map[groupBy] = next;
		else delete map[groupBy];
		await this.plugin.saveSettings({ invalidateResolved: false });
		await this.render();
	}

	/**
	 * A card metadata line the user can click to edit the underlying frontmatter.
	 * Known field shapes render as semantic chips — a due pill flagged
	 * overdue/soon, a priority badge, tag pills — so card state is scannable
	 * instead of identical grey "key: value" lines; anything else keeps the plain
	 * line. Every variant shares the same click-to-edit wiring (beginInlineEdit
	 * empties the line and swaps in the input regardless of content).
	 */
	private renderEditableField(
		card: HTMLElement,
		row: Row,
		field: string,
		display: string,
		ctx: { today: string; dueState: boolean }
	): void {
		const line = card.createDiv({ cls: "bpp-card-meta bpp-card-meta-editable" });
		this.renderFieldContent(line, row, field, display, ctx);
		line.setAttr("title", "Click to edit");
		line.addEventListener("click", (event) => {
			event.stopPropagation();
			this.beginInlineEdit(card, line, row, field);
		});
	}

	private renderFieldContent(
		line: HTMLElement,
		row: Row,
		field: string,
		display: string,
		ctx: { today: string; dueState: boolean }
	): void {
		const value = row.scope.get(field);

		// Date-valued field → date chip. Gate on the value actually LOOKING date-
		// shaped (a real Date, or a leading YYYY-MM-DD) before calling toIsoDateKey:
		// its lenient `new Date()` fallback parses bare small integers as month
		// numbers, so `priority: 1` / `sprint: 2025` would otherwise render as a
		// date chip instead of reaching the priority/plain branches below. Overdue/
		// soon coloring only applies to due-style props (a past "start" isn't
		// overdue) and never on a done card.
		const isoKey =
			value instanceof Date || /^\d{4}-\d{2}-\d{2}/.test(toStr(value)) ? toIsoDateKey(value) : null;
		if (isoKey) {
			const status = ctx.dueState ? dueStatus(isoKey, ctx.today) : null;
			const chip = line.createSpan({ cls: "bpp-chip bpp-chip-date" });
			if (status === "overdue") chip.addClass("is-overdue");
			else if (status === "soon") chip.addClass("is-soon");
			chip.createSpan({ cls: "bpp-chip-key", text: field });
			chip.createSpan({ text: display });
			// Real, visually-hidden text (not just an aria-label on a non-interactive
			// span, which browse-mode / virtual cursors don't reliably announce).
			if (status) {
				chip.createSpan({ cls: "bpp-sr-only", text: status === "overdue" ? " (overdue)" : " (due soon)" });
			}
			return;
		}

		if (field === "priority") {
			const cls = priorityClass(value);
			const chip = line.createSpan({ cls: "bpp-chip bpp-chip-priority" });
			if (cls) chip.addClass(cls);
			else {
				// Unrecognized value: fall back to the board's stable hue-per-value.
				chip.addClass("is-hue");
				chip.setCssProps({ "--bpp-col-hue": String(columnHue(display)) });
			}
			chip.createSpan({ cls: "bpp-chip-key", text: field });
			chip.createSpan({ text: display });
			return;
		}

		if (field === "tags" || field === "tag" || field === "file.tags") {
			const parts = Array.isArray(value)
				? value.map((v) => toStr(v)).filter(Boolean)
				: display.split(",").map((s) => s.trim()).filter(Boolean);
			for (const part of parts) line.createSpan({ cls: "bpp-chip bpp-chip-tag", text: part });
			if (parts.length > 0) return;
		}

		line.createSpan({ cls: "bpp-card-meta-key", text: `${field}:` });
		line.createSpan({ cls: "bpp-card-meta-val", text: display });
	}

	/** Swap a metadata line for an input, committing the parsed value on Enter/blur. */
	private beginInlineEdit(card: HTMLElement, line: HTMLElement, row: Row, field: string): void {
		const previous = row.note.frontmatter[field];
		card.draggable = false;
		line.empty();
		line.removeClass("bpp-card-meta-editable");
		const input = line.createEl("input", { cls: "bpp-inline-edit", type: "text" });
		input.value = formatFieldForEdit(previous);
		input.focus();
		input.select();
		// Hold background re-renders so a vault change elsewhere can't destroy this
		// input mid-edit (its blur handler would then commit a half-typed value).
		this.beginInteraction();

		let settled = false;
		const commit = async (): Promise<void> => {
			if (settled) return;
			settled = true;
			this.endInteraction();
			const { value, remove } = coerceFieldInput(field, input.value, previous);
			await writeRowProperty(this.plugin, row.id, field, value, remove, { label: `Edit "${field}"` });
			await this.render();
		};
		input.addEventListener("click", (event) => event.stopPropagation());
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				void commit();
			} else if (event.key === "Escape") {
				event.preventDefault();
				settled = true;
				this.endInteraction();
				void this.render();
			}
		});
		input.addEventListener("blur", () => void commit());
	}

	private columnHueFor(name: string): string {
		return this.plugin.settings.kanbanColorOverrides[name] ?? String(columnHue(name));
	}

	// ---- context menus --------------------------------------------------------

	private openCardMenu(anchor: MouseEvent | HTMLElement, row: Row, groupBy: string, columns: string[]): void {
		if (anchor instanceof MouseEvent) anchor.preventDefault();
		const menu = new Menu();
		const after = (): void => void this.render();

		// Kanban-only: move the card to any other column (fires Move Rules). This is
		// also the keyboard/touch move path, since HTML5 drag is dead on touch.
		const current = toStr(row.scope.get(groupBy));
		const others = columns.filter((c) => c !== current);
		if (others.length > 0) {
			for (const col of others) {
				menu.addItem((i) =>
					i.setTitle(`Move to "${col}"`).setIcon("arrow-right").onClick(() => void this.moveRowToColumn(row, groupBy, col))
				);
			}
			menu.addSeparator();
		}

		this.addCommonRowMenuItems(menu, row, this.plugin.settings.kanbanCardFields, after);
		this.showMenuAtAnchor(menu, anchor);
	}

	private openColumnMenu(
		anchor: MouseEvent | HTMLElement,
		columnName: string,
		groupBy: string,
		removable: boolean,
		orderedNames: string[]
	): void {
		if (anchor instanceof MouseEvent) anchor.preventDefault();
		const menu = new Menu();
		menu.addItem((i) => i.setTitle("Add note").setIcon("plus").onClick(() => void this.quickAddNote(columnName, groupBy)));
		menu.addItem((i) => i.setTitle("Rename column…").setIcon("pencil").onClick(() => this.renameColumnValue(groupBy, columnName)));
		menu.addItem((i) =>
			i.setTitle("Set WIP limit…").setIcon("gauge").onClick(() => this.setWipLimit(columnName))
		);

		// Keyboard/touch column reorder (drag is otherwise the only path).
		const idx = orderedNames.indexOf(columnName);
		if (idx > 0) {
			menu.addItem((i) =>
				i.setTitle("Move column left").setIcon("arrow-left").onClick(() => void this.moveColumnBy(groupBy, orderedNames, columnName, -1))
			);
		}
		if (idx !== -1 && idx < orderedNames.length - 1) {
			menu.addItem((i) =>
				i.setTitle("Move column right").setIcon("arrow-right").onClick(() => void this.moveColumnBy(groupBy, orderedNames, columnName, 1))
			);
		}

		menu.addSeparator();
		const swatches: Array<[string, number]> = [
			["Red", 0],
			["Orange", 30],
			["Yellow", 50],
			["Green", 130],
			["Teal", 175],
			["Blue", 215],
			["Purple", 270],
			["Pink", 320],
		];
		for (const [label, hue] of swatches) {
			menu.addItem((i) => i.setTitle(label).setIcon("circle").onClick(() => void this.setColumnColor(columnName, hue)));
		}
		menu.addItem((i) => i.setTitle("Reset color").onClick(() => void this.setColumnColor(columnName, null)));

		if (removable) {
			menu.addSeparator();
			menu.addItem((i) =>
				i.setTitle("Remove empty column").setIcon("trash").onClick(() => void this.removeExtraColumn(groupBy, columnName))
			);
		}
		this.showMenuAtAnchor(menu, anchor);
	}

	/** Swap a column with its neighbor `delta` slots away and persist the full order. */
	private async moveColumnBy(groupBy: string, orderedNames: string[], columnName: string, delta: number): Promise<void> {
		const idx = orderedNames.indexOf(columnName);
		const to = idx + delta;
		if (idx === -1 || to < 0 || to >= orderedNames.length) return;
		const next = [...orderedNames];
		[next[idx], next[to]] = [next[to], next[idx]];
		this.plugin.settings.kanbanColumnOrder[groupBy] = next;
		await this.plugin.saveSettings({ invalidateResolved: false });
		await this.render();
	}

	// ---- menu actions ---------------------------------------------------------

	/** Prompt for a column's WIP limit; a blank or non-positive entry clears it. */
	private setWipLimit(columnName: string): void {
		const current = this.plugin.settings.kanbanWipLimits[columnName];
		new PromptModal(this.app, {
			title: `WIP limit for "${columnName}"`,
			value: current ? String(current) : "",
			placeholder: "e.g. 5 (blank = no limit)",
			cta: "Save",
			onSubmit: (v) => void this.applyWipLimit(columnName, sanitizeWipLimit(v)),
		}).open();
	}

	private async applyWipLimit(columnName: string, limit: number | null): Promise<void> {
		const map = this.plugin.settings.kanbanWipLimits;
		if (limit === null) delete map[columnName];
		else map[columnName] = limit;
		await this.plugin.saveSettings({ invalidateResolved: false });
		await this.render();
	}

	private async setColumnColor(columnName: string, hue: number | null): Promise<void> {
		const map = this.plugin.settings.kanbanColorOverrides;
		if (hue === null) delete map[columnName];
		else map[columnName] = String(hue);
		await this.plugin.saveSettings({ invalidateResolved: false });
		await this.render();
	}

	private renameColumnValue(groupBy: string, columnName: string): void {
		new PromptModal(this.app, {
			title: `Rename column "${columnName}"`,
			value: columnName,
			placeholder: "New value",
			cta: "Rename",
			onSubmit: (next) => void this.applyColumnRename(groupBy, columnName, next.trim()),
		}).open();
	}

	/** Rewrite the group property from `from` to `to` on every note in that column,
	 * confirming first when the rename would touch more than a few notes. */
	private applyColumnRename(groupBy: string, from: string, to: string): void {
		if (!to || to === from) return;
		const key = groupBy || "status";
		// Scope the rewrite to THIS board's rows — the resolved base/filter set, the
		// same membership the column shows. Renaming a column inside a filtered
		// .base must not silently rewrite matching notes the base excluded.
		// (Free tier resolves the whole vault, so behavior there is unchanged.)
		//
		// Only rows whose RAW frontmatter[key] actually equals `from` are writable:
		// when the board is grouped by a premium formula or a computed `file.*`
		// field, the column exists (scope resolves it) but writing frontmatter[key]
		// would create a shadowing literal key, corrupting the data. Such rows are
		// filtered out here, so a formula-grouped rename writes nothing — matching
		// 1.10 — and we tell the user why below.
		const boardRows = this.lastColumnRows.get(from) ?? [];
		const targets = boardRows.map((r) => r.note).filter((n) => toStr(n.frontmatter[key]) === from);
		if (boardRows.length > 0 && targets.length === 0) {
			new Notice(`"${key}" is a formula or computed field — rename the value at its source, not from the board.`);
			return;
		}
		const vaultWide = this.plugin.getNotesSnapshot().filter((n) => toStr(n.frontmatter[key]) === from).length;
		const excluded = Math.max(0, vaultWide - targets.length);
		const run = (): void => void this.doColumnRename(groupBy, key, from, to, targets);
		// A bulk frontmatter rewrite deserves a heads-up above a small threshold
		// (consistent with the delete-note confirmation) — and always when notes
		// outside the current board match the old value, so the scope is explicit.
		if (targets.length > 5 || excluded > 0) {
			new ConfirmModal(this.app, {
				title: "Rename column?",
				body:
					`This rewrites "${key}: ${from}" → "${to}" on ${targets.length} note${targets.length === 1 ? "" : "s"} in this board.` +
					(excluded > 0
						? ` ${excluded} matching note${excluded === 1 ? "" : "s"} outside the current base/filter ${excluded === 1 ? "is" : "are"} left unchanged.`
						: ""),
				cta: "Rename",
				onConfirm: run,
			}).open();
		} else {
			run();
		}
	}

	private async doColumnRename(
		groupBy: string,
		key: string,
		from: string,
		to: string,
		targets: RawNote[]
	): Promise<void> {
		let ok = 0;
		const batch = this.plugin.undo.beginBatch(`Rename column "${from}" → "${to}"`);
		for (const note of targets) {
			if (await writeRowProperties(this.plugin, note.path, [{ key, value: to }], { batch })) ok++;
		}
		this.plugin.undo.commitBatch(batch);
		// Carry the column's color + order identity across the rename.
		const overrides = this.plugin.settings.kanbanColorOverrides;
		if (overrides[from] !== undefined) {
			overrides[to] = overrides[from];
			delete overrides[from];
		}
		const order = this.plugin.settings.kanbanColumnOrder[groupBy];
		if (order) this.plugin.settings.kanbanColumnOrder[groupBy] = order.map((n) => (n === from ? to : n));
		const wip = this.plugin.settings.kanbanWipLimits;
		if (wip[from] !== undefined) {
			wip[to] = wip[from];
			delete wip[from];
		}
		await this.plugin.saveSettings();
		new Notice(`Renamed "${from}" → "${to}" on ${ok} note${ok === 1 ? "" : "s"}.`);
		await this.render();
	}

	// ---- bulk edit ------------------------------------------------------------

	private openBulkEdit(): void {
		const rows = this.lastVisibleRows;
		if (rows.length === 0) {
			new Notice("No cards to edit.");
			return;
		}
		new BulkEditModal(this.app, rows.length, (prop, op, value) => void this.applyBulk(rows, prop, op, value)).open();
	}

	private async applyBulk(rows: Row[], prop: string, op: BulkOp, value: string): Promise<void> {
		// Refuse to write a computed field — a `file.*` accessor or a base formula.
		// applyColumnRename already guards this; bulk edit did not, so a bulk toggle/set
		// on a formula-named prop wrote a shadowing literal that overrode the formula.
		const resolved = await this.plugin.getResolvedView();
		// Exact-match the computed accessors, not a `file.` PREFIX: a note can carry a
		// legitimate flat frontmatter key like `file.type`, which is a real writable field.
		if (COMPUTED_FILE_PROPS.has(prop) || Object.prototype.hasOwnProperty.call(resolved.def.formulas ?? {}, prop)) {
			new Notice(`"${prop}" is a computed/formula field — edit it at its source, not in bulk.`);
			return;
		}
		let ok = 0;
		const batch = this.plugin.undo.beginBatch(
			`Bulk ${op} "${prop}" on ${rows.length} note${rows.length === 1 ? "" : "s"}`
		);
		for (const row of rows) {
			const write: PropertyWrite =
				op === "clear"
					? { key: prop, remove: true }
					: op === "toggle"
						? { key: prop, value: !toBool(row.note.frontmatter[prop]) }
						: { key: prop, value: coerceLiteral(value) };
			if (await writeRowProperties(this.plugin, row.id, [write], { batch })) ok++;
		}
		this.plugin.undo.commitBatch(batch);
		new Notice(`Updated "${prop}" on ${ok} note${ok === 1 ? "" : "s"}.`);
		await this.render();
	}

	/** Group-by options come from the cached whole-vault frontmatter key set (not a
	 * per-render scan of the resolved rows). This is O(1) per render instead of
	 * O(rows × keys) on every keystroke, and — because it isn't limited to
	 * currently-shown rows — the picker still offers every real property on an empty
	 * or heavily-filtered board, so a user is never stranded without a way to switch. */
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

		const toggleWrap = controls.createDiv({ cls: "bpp-lite-control bpp-lite-control-toggle" });
		const toggle = toggleWrap.createEl("input", { type: "checkbox" });
		toggle.checked = this.hideDoneColumn;
		toggle.addEventListener("change", () => void this.setHideDone(toggle.checked));
		toggleWrap.createSpan({ cls: "bpp-muted", text: "Hide done" });

		const bulkWrap = controls.createDiv({ cls: "bpp-lite-control" });
		const bulkBtn = bulkWrap.createEl("button", { cls: "bpp-lite-btn", text: "Bulk edit" });
		bulkBtn.setAttr("aria-label", "Bulk edit the visible cards");
		bulkBtn.addEventListener("click", () => this.openBulkEdit());
	}

	/** The whole column is a drop target for two kinds of drag: a card (move the
	 * note to this column) and a column header (reorder columns). They are told
	 * apart by the dataTransfer type. */
	private wireColumnDrop(
		columnEl: HTMLElement,
		columnName: string,
		groupBy: string,
		rowById: Map<string, Row>,
		orderedNames: string[]
	): void {
		columnEl.addEventListener("dragover", (event) => {
			const types = event.dataTransfer?.types ?? [];
			const isColumn = types.includes(DND_COLUMN);
			const isRow = types.includes(DND_ROW);
			// Ignore foreign drags (external files, selected text): don't preventDefault
			// and don't paint a drop highlight the drop handler would only no-op on.
			if (!isColumn && !isRow) return;
			event.preventDefault();
			columnEl.addClass(isColumn ? "is-col-drop-target" : "is-drop-target");
			if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
		});
		columnEl.addEventListener("dragleave", (event) => {
			if (!this.dragTrulyLeft(columnEl, event)) return;
			columnEl.removeClass("is-drop-target");
			columnEl.removeClass("is-col-drop-target");
		});
		columnEl.addEventListener("drop", (event) => {
			event.preventDefault();
			columnEl.removeClass("is-drop-target");
			columnEl.removeClass("is-col-drop-target");

			const draggedColumn = event.dataTransfer?.getData(DND_COLUMN);
			if (draggedColumn) {
				void this.reorderColumn(groupBy, orderedNames, draggedColumn, columnName);
				return;
			}

			const rowId = event.dataTransfer?.getData(DND_ROW) || event.dataTransfer?.getData("text/plain");
			if (!rowId) return;
			const row = rowById.get(rowId);
			if (!row) return;
			void this.moveRowToColumn(row, groupBy, columnName);
		});
	}

	private makeColumnDraggable(columnEl: HTMLElement, colHead: HTMLElement, columnName: string): void {
		colHead.draggable = true;
		colHead.addEventListener("dragstart", (event) => {
			columnEl.addClass("is-col-dragging");
			event.dataTransfer?.setData(DND_COLUMN, columnName);
			if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
		});
		colHead.addEventListener("dragend", () => columnEl.removeClass("is-col-dragging"));
	}

	private async reorderColumn(
		groupBy: string,
		orderedNames: string[],
		moved: string,
		target: string
	): Promise<void> {
		const next = reorderColumns(orderedNames, moved, target);
		this.plugin.settings.kanbanColumnOrder[groupBy] = next;
		await this.plugin.saveSettings({ invalidateResolved: false });
		await this.render();
	}

	/**
	 * Move a card to a column: write the group property, then apply any premium
	 * Move Rules that fire on entering this value — all in one transaction. The
	 * rules read the note's pre-move frontmatter, so an automation write never
	 * re-triggers another rule.
	 */
	private async moveRowToColumn(row: Row, groupBy: string, columnName: string): Promise<void> {
		const key = groupBy || "status";
		// Dropped back onto its own column: no transition, so no write and — crucially
		// — no Move Rules fire (else a "set completed = today" rule would re-stamp on
		// an ordinary in-place drop). Compare the note's actual current value.
		if (toStr(row.scope.get(key)) === columnName) return;

		// Refuse to move a card when the group-by is a computed field — a `file.*`
		// accessor or a base formula. Writing a literal `frontmatter[key]` would shadow
		// the formula for that one note (silently converting a computed value to a hard
		// value), exactly what applyBulk / applyCardReorder already prevent.
		const resolved = await this.plugin.getResolvedView();
		if (COMPUTED_FILE_PROPS.has(key) || Object.prototype.hasOwnProperty.call(resolved.def.formulas ?? {}, key)) {
			new Notice(`"${key}" is a computed/formula field — cards grouped by it can't be moved here.`);
			return;
		}

		// WIP enforcement: block a move that would push the target past its limit.
		// Count the target column's TRUE membership (base/filter-scoped, ignoring
		// the transient quick-search) — the SAME number the header badge shows — so
		// the badge and the block never contradict each other, and a search that
		// hides cards can't sneak a move past the cap. The moving card sits in
		// another column (guaranteed by the early return above), so it isn't in
		// this count.
		if (this.plugin.settings.kanbanBlockOverWip) {
			const limit = limitFor(this.plugin.settings.kanbanWipLimits, columnName);
			const targetCount = (this.lastColumnRows.get(columnName) ?? []).length;
			if (dropWouldExceed(targetCount, limit)) {
				new Notice(`"${columnName}" is at its WIP limit (${limit}). Move blocked.`);
				await this.render();
				return;
			}
		}

		const writes: PropertyWrite[] = [{ key, value: columnName }];
		if (this.plugin.settings.isPro) {
			const matched = rulesForTransition(this.plugin.settings.automations, key, columnName);
			writes.push(...computeRuleWrites(matched, row.note.frontmatter, new Date()));
		}
		const ok = await writeRowProperties(this.plugin, row.id, writes, { label: `Move to "${columnName}"` });
		if (ok && writes.length > 1) {
			const n = writes.length - 1;
			new Notice(`Moved to "${columnName}" · ${n} automation write${n === 1 ? "" : "s"}.`);
		}
		await this.render();
	}

	/** Fields for a row-oriented export (Markdown table / CSV): the note title, the
	 * group-by value, then each configured card field, de-duplicated. */
	private exportFields(groupBy: string): string[] {
		return [...new Set(["name", groupBy, ...this.plugin.settings.kanbanCardFields])];
	}

	/**
	 * Make one card a drop target for a manual reorder: the pointer's half of the
	 * card decides whether an incoming card lands before or after it, shown with an
	 * insertion line. Stops propagation so the column-level "move to column" drop
	 * doesn't also fire.
	 */
	private wireCardReorder(cardEl: HTMLElement, targetRow: Row, columnName: string, groupBy: string): void {
		cardEl.addEventListener("dragover", (event) => {
			if (!(event.dataTransfer?.types ?? []).includes(DND_ROW)) return;
			event.preventDefault();
			event.stopPropagation();
			if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
			const before = this.isBeforeHalf(cardEl, event);
			cardEl.toggleClass("is-reorder-before", before);
			cardEl.toggleClass("is-reorder-after", !before);
		});
		cardEl.addEventListener("dragleave", (event) => {
			if (!this.dragTrulyLeft(cardEl, event)) return;
			cardEl.removeClass("is-reorder-before");
			cardEl.removeClass("is-reorder-after");
		});
		cardEl.addEventListener("drop", (event) => {
			const rowId = event.dataTransfer?.getData(DND_ROW) || event.dataTransfer?.getData("text/plain");
			cardEl.removeClass("is-reorder-before");
			cardEl.removeClass("is-reorder-after");
			if (!rowId) return;
			event.preventDefault();
			event.stopPropagation();
			if (rowId === targetRow.id) return; // dropped onto itself
			const before = this.isBeforeHalf(cardEl, event);
			void this.applyCardReorder(rowId, columnName, targetRow, before, groupBy);
		});
	}

	/** True when the pointer is in the top half of `el` (so a drop inserts before it). */
	private isBeforeHalf(el: HTMLElement, event: DragEvent): boolean {
		const rect = el.getBoundingClientRect();
		return event.clientY < rect.top + rect.height / 2;
	}

	/** Order two rows the way the "rank" sort displays them — by numeric rank
	 * (unranked last), ties broken by name — so a reorder plans against the same
	 * order the user sees. Mirrors compareRankValue + compareText in kanban.ts. */
	private compareByRank(a: Row, b: Row, rankProp: string): number {
		const ar = parseRank(a.scope.get(rankProp));
		const br = parseRank(b.scope.get(rankProp));
		if (ar !== null && br !== null && ar !== br) return ar - br;
		if (ar === null && br !== null) return 1;
		if (ar !== null && br === null) return -1;
		return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
	}

	/**
	 * Apply a manual reorder: write the card's new rank (and, when it came from
	 * another column, its new group value plus any Move Rules), renumbering the
	 * destination column only when the neighbouring gap can't be split. The whole
	 * reorder is one undo entry.
	 */
	private async applyCardReorder(
		rowId: string,
		columnName: string,
		targetRow: Row,
		before: boolean,
		groupBy: string
	): Promise<void> {
		const rankProp = this.rankProp;
		const group = groupBy || "status";
		// Writing a rank number to the group property would blow the card out of every
		// named column (a cross-column drop writes both keys in one pass, rank last).
		if (rankProp === group) {
			new Notice(`Manual order property ("${rankProp}") must differ from the group-by property — pick a separate numeric property in settings.`);
			return;
		}
		const resolved = await this.plugin.getResolvedView();
		const movedRow = resolved.rows.find((r) => r.id === rowId);
		if (!movedRow) return;
		// The rank property must be a real writable frontmatter key — refuse to
		// shadow a computed `file.*` accessor or a base formula.
		if (COMPUTED_FILE_PROPS.has(rankProp) || Object.prototype.hasOwnProperty.call(resolved.def.formulas ?? {}, rankProp)) {
			new Notice(`"${rankProp}" is a computed/formula field — pick a plain property for the manual order.`);
			return;
		}

		const crossColumn = toStr(movedRow.scope.get(group)) !== columnName;
		if (crossColumn && this.plugin.settings.kanbanBlockOverWip) {
			const limit = limitFor(this.plugin.settings.kanbanWipLimits, columnName);
			const targetCount = (this.lastColumnRows.get(columnName) ?? []).length;
			if (dropWouldExceed(targetCount, limit)) {
				new Notice(`"${columnName}" is at its WIP limit (${limit}). Move blocked.`);
				await this.render();
				return;
			}
		}

		// Plan against the column's TRUE membership (in rank order), NOT the
		// search-filtered display — otherwise a reorder run while a quick-search hides
		// cards would renumber only the visible ones and scramble the hidden ones'
		// persisted order. The drop's insertion index is derived from the target
		// card's place in that full order.
		const sorted = [...(this.lastColumnRows.get(columnName) ?? [])].sort((a, b) => this.compareByRank(a, b, rankProp));
		const items: RankItem[] = sorted.map((r) => ({ id: r.id, rank: parseRank(r.scope.get(rankProp)) }));
		const targetPos = items.filter((i) => i.id !== rowId).findIndex((i) => i.id === targetRow.id);
		if (targetPos === -1) {
			await this.render();
			return;
		}
		const insertIndex = before ? targetPos : targetPos + 1;
		const rankWrites = planReorder(items, rowId, insertIndex);
		if (rankWrites.length === 0 && !crossColumn) return; // already in place

		const rankById = new Map(rankWrites.map((w) => [w.id, w.rank]));
		const label = crossColumn ? `Move to "${columnName}"` : "Reorder card";
		const batch = this.plugin.undo.beginBatch(label);

		// The moved card: its rank (if it changed) plus, for a cross-column drop, the
		// group write and any Move Rules that fire on entering this column.
		const movedWrites: PropertyWrite[] = [];
		if (crossColumn) {
			movedWrites.push({ key: group, value: columnName });
			if (this.plugin.settings.isPro) {
				const matched = rulesForTransition(this.plugin.settings.automations, group, columnName);
				movedWrites.push(...computeRuleWrites(matched, movedRow.note.frontmatter, new Date()));
			}
		}
		if (rankById.has(rowId)) movedWrites.push({ key: rankProp, value: rankById.get(rowId) });
		if (movedWrites.length > 0) await writeRowProperties(this.plugin, rowId, movedWrites, { batch });

		// Every other card touched by a renumber gets its rank only.
		for (const write of rankWrites) {
			if (write.id === rowId) continue;
			await writeRowProperties(this.plugin, write.id, [{ key: rankProp, value: write.rank }], { batch });
		}
		this.plugin.undo.commitBatch(batch);
		await this.render();
	}

	private async quickAddNote(columnName: string, groupBy: string): Promise<void> {
		const title = buildQuickAddTitle(columnName);
		try {
			// Unified onto the shared createSeededNote (seeds via processFrontMatter),
			// so the Kanban path can't drift from Calendar/Outline and a group-by
			// property name with YAML-significant characters can't corrupt the note.
			const file = await createSeededNote(
				this.plugin,
				this.plugin.settings.kanbanQuickAddFolder,
				groupBy || "status",
				columnName,
				title
			);
			new Notice(`Created ${file.basename}`);
		} catch (error) {
			// A failed create (illegal title, collision past uniqueNotePath's cap)
			// surfaces as a Notice, not an unhandled rejection.
			new Notice(`Bases Power Pack: could not create note (${String(error)}).`);
		}
		await this.render();
	}
}

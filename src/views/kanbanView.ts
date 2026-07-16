import { Menu, Notice, normalizePath } from "obsidian";
import type { RawNote, Row } from "../model/row";
import { PowerPackView } from "./abstractView";
import {
	buildKanbanColumns,
	columnHue,
	formatCardField,
	reorderColumns,
	type KanbanSort,
} from "../query/kanban";
import {
	buildQuickAddContent,
	buildQuickAddPath,
	buildQuickAddTitle,
} from "../query/kanbanActions";
import { coerceFieldInput, formatFieldForEdit } from "../query/inlineEdit";
import { coerceLiteral, computeRuleWrites, rulesForTransition } from "../query/automation";
import { dropWouldExceed, formatWipCount, isOverWip, limitFor, sanitizeWipLimit } from "../query/wip";
import { evaluateSafe, toBool, toStr } from "../engine/expression";
import { ensureParentFolders, uniqueNotePath, writeRowProperties, writeRowProperty, type PropertyWrite } from "./viewData";
import { renderContextControls, renderRollupBar } from "./viewChrome";
import { BulkEditModal, ConfirmModal, PromptModal, type BulkOp } from "./modals";
import { DND_COLUMN, DND_ROW } from "./dnd";

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
export class KanbanView extends PowerPackView {
	private hideDoneColumn = false;
	private sortBy: KanbanSort = "manual";
	/** The currently visible (filtered) rows, captured for the bulk-edit action. */
	private lastVisibleRows: Row[] = [];

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
		header.createEl("span", { cls: "bpp-badge bpp-badge-lite", text: "Lite" });
		header.createEl("span", { cls: "bpp-muted", text: `grouped by "${groupBy}"` });
		this.renderUndoButton(header);

		renderContextControls(container, this.plugin, resolved, () => void this.render());
		this.renderLiteControls(container, resolved.rows);
		renderRollupBar(container, this.plugin, resolved.rows);

		const extraColumns = this.plugin.settings.kanbanExtraColumns[groupBy] ?? [];
		const columns = buildKanbanColumns(resolved.rows, {
			groupBy,
			search: this.searchQuery,
			hideColumn: this.hideDoneColumn ? this.plugin.settings.kanbanDoneValue : "",
			sortBy: this.sortBy,
			extraColumns,
			columnOrder: this.plugin.settings.kanbanColumnOrder[groupBy] ?? [],
		});
		this.lastVisibleRows = columns.flatMap((column) => column.rows);
		// The displayed order — the basis for a header-drag reorder.
		const orderedNames = columns.map((column) => column.name);
		const colored = this.plugin.settings.kanbanColorColumns;
		const board = container.createDiv({ cls: "bpp-kanban-board" });
		if (colored) board.addClass("is-colored");
		const rowById = new Map(resolved.rows.map((row) => [row.id, row]));

		if (columns.length === 0) {
			board.createDiv({
				cls: "bpp-empty",
				text: this.searchQuery || this.hideDoneColumn
					? "No cards match the current lite filters."
					: `No notes with a "${groupBy}" property found. Add "${groupBy}: To Do" to a note's frontmatter, or add a column below.`,
			});
			if (!this.searchQuery) this.renderAddColumnTile(board, groupBy);
			return;
		}

		const cardFormula = this.plugin.settings.isPro ? this.plugin.settings.cardFormula.trim() : "";
		const metaFields = this.plugin.settings.kanbanCardFields;

		for (const column of columns) {
			const col = board.createDiv({ cls: "bpp-kanban-column" });
			col.setAttr("role", "group");
			col.setAttr("aria-label", `Column ${column.name}, ${column.rows.length} card${column.rows.length === 1 ? "" : "s"}`);
			if (colored) col.setCssProps({ "--bpp-col-hue": this.columnHueFor(column.name) });
			this.wireColumnDrop(col, column.name, groupBy, rowById, orderedNames);

			const colHead = col.createDiv({ cls: "bpp-kanban-column-head" });
			this.makeColumnDraggable(col, colHead, column.name);
			const removable = column.rows.length === 0 && extraColumns.includes(column.name);
			colHead.addEventListener("contextmenu", (evt) =>
				this.openColumnMenu(evt, column.name, groupBy, removable, orderedNames)
			);
			const wipLimit = limitFor(this.plugin.settings.kanbanWipLimits, column.name);
			if (isOverWip(column.rows.length, wipLimit)) col.addClass("is-over-wip");
			const colLabel = colHead.createDiv({ cls: "bpp-kanban-column-label" });
			colLabel.createSpan({ text: column.name });
			const count = colLabel.createSpan({
				cls: "bpp-count",
				text: formatWipCount(column.rows.length, wipLimit),
			});
			if (wipLimit !== null) {
				count.addClass("has-wip");
				count.setAttr("title", `${column.rows.length} of ${wipLimit} (WIP limit)`);
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
					cls: "bpp-column-remove",
					text: "×",
					attr: { "aria-label": `Remove column ${column.name}` },
				});
				removeButton.addEventListener("click", () => void this.removeExtraColumn(groupBy, column.name));
			}

			for (const row of column.rows) {
				const card = col.createDiv({ cls: "bpp-card" });
				card.draggable = true;
				const openMenu = (a: MouseEvent | HTMLElement): void => this.openCardMenu(a, row, groupBy, orderedNames);
				const head = card.createDiv({ cls: "bpp-card-head" });
				head.createDiv({ cls: "bpp-card-title", text: row.name });
				this.addOverflowButton(head, row.name, openMenu);
				for (const field of metaFields) {
					const display = formatCardField(row, field);
					if (display === null) continue;
					this.renderEditableField(card, row, field, display);
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
			await this.plugin.saveSettings();
		}
		await this.render();
	}

	private async removeExtraColumn(groupBy: string, name: string): Promise<void> {
		const map = this.plugin.settings.kanbanExtraColumns;
		const next = (map[groupBy] ?? []).filter((n) => n !== name);
		if (next.length > 0) map[groupBy] = next;
		else delete map[groupBy];
		await this.plugin.saveSettings();
		await this.render();
	}

	/** A card metadata line the user can click to edit the underlying frontmatter. */
	private renderEditableField(card: HTMLElement, row: Row, field: string, display: string): void {
		const line = card.createDiv({ cls: "bpp-card-meta bpp-card-meta-editable" });
		line.createSpan({ cls: "bpp-card-meta-key", text: `${field}:` });
		line.createSpan({ cls: "bpp-card-meta-val", text: display });
		line.setAttr("title", "Click to edit");
		line.addEventListener("click", (event) => {
			event.stopPropagation();
			this.beginInlineEdit(card, line, row, field);
		});
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
		await this.plugin.saveSettings();
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
		await this.plugin.saveSettings();
		await this.render();
	}

	private async setColumnColor(columnName: string, hue: number | null): Promise<void> {
		const map = this.plugin.settings.kanbanColorOverrides;
		if (hue === null) delete map[columnName];
		else map[columnName] = String(hue);
		await this.plugin.saveSettings();
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
		const targets = this.plugin.getNotesSnapshot().filter((n) => toStr(n.frontmatter[key]) === from);
		const run = (): void => void this.doColumnRename(groupBy, key, from, to, targets);
		// A bulk frontmatter rewrite deserves a heads-up above a small threshold,
		// consistent with the delete-note confirmation.
		if (targets.length > 5) {
			new ConfirmModal(this.app, {
				title: "Rename column?",
				body: `This rewrites "${key}: ${from}" → "${to}" on ${targets.length} notes.`,
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

	private collectGroupByOptions(rows: Row[], current: string): string[] {
		const set = new Set<string>();
		for (const row of rows) {
			for (const key of Object.keys(row.note.frontmatter)) set.add(key);
		}
		if (current) set.add(current);
		return [...set].sort((a, b) => a.localeCompare(b));
	}

	private renderLiteControls(container: HTMLElement, rows: Row[]): void {
		const controls = container.createDiv({ cls: "bpp-lite-controls" });

		const groupBy = this.plugin.settings.kanbanGroupBy || "status";
		const groupWrap = controls.createDiv({ cls: "bpp-lite-control" });
		groupWrap.createSpan({ cls: "bpp-muted", text: "Group by" });
		const groupSelect = groupWrap.createEl("select", { cls: "bpp-lite-select" });
		for (const option of this.collectGroupByOptions(rows, groupBy)) {
			const el = groupSelect.createEl("option", { text: option, value: option });
			if (option === groupBy) el.selected = true;
		}
		groupSelect.addEventListener("change", () => {
			this.plugin.settings.kanbanGroupBy = groupSelect.value || "status";
			void this.plugin.saveSettings().then(() => this.render());
		});

		this.renderManagedSearch(controls);

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
			const isColumn = (event.dataTransfer?.types ?? []).includes(DND_COLUMN);
			event.preventDefault();
			columnEl.addClass(isColumn ? "is-col-drop-target" : "is-drop-target");
			if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
		});
		columnEl.addEventListener("dragleave", () => {
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
		await this.plugin.saveSettings();
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

		// WIP enforcement: block a move that would push the target past its limit.
		// Count the SAME rows the header badge shows — the currently visible board
		// membership (post search + post base/saved-filter), evaluated through the
		// row scope like buildKanbanColumns — so the badge and the block never
		// contradict each other. The moving card sits in another column (guaranteed
		// by the early return above), so it isn't in this count.
		if (this.plugin.settings.kanbanBlockOverWip) {
			const limit = limitFor(this.plugin.settings.kanbanWipLimits, columnName);
			const targetCount = this.lastVisibleRows.filter((r) => toStr(r.scope.get(key)) === columnName).length;
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

	private async quickAddNote(columnName: string, groupBy: string): Promise<void> {
		const title = buildQuickAddTitle(columnName);
		const stem = normalizePath(buildQuickAddPath(this.plugin.settings.kanbanQuickAddFolder, title)).replace(/\.md$/, "");
		const path = uniqueNotePath(this.app, stem);
		await ensureParentFolders(this.app, path);
		const file = await this.app.vault.create(path, buildQuickAddContent(groupBy, columnName, title));
		this.plugin.invalidateSnapshot();
		new Notice(`Created ${file.basename}`);
		// Open in a new tab, not getLeaf(false): the board lives in the active leaf, and
		// reusing it would replace this view and strand the render() below on a dead contentEl.
		await this.app.workspace.getLeaf("tab").openFile(file);
		await this.render();
	}
}

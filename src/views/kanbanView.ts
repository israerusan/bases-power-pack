import { Menu, Notice, TFile, normalizePath } from "obsidian";
import type { Row } from "../model/row";
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
import { evaluateSafe, toBool, toStr } from "../engine/expression";
import { resolveViewRows, writeRowProperties, writeRowProperty, type PropertyWrite } from "./viewData";
import { renderContextControls, renderRollupBar } from "./viewChrome";
import { BulkEditModal, ConfirmModal, PromptModal, type BulkOp } from "./modals";

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
	private search = "";
	private hideDoneColumn = false;
	private sortBy: KanbanSort = "manual";
	/** The live search input, so a re-render can tell whether it had focus before
	 * container.empty() destroys it, and hand focus back to its replacement. */
	private searchInputEl: HTMLInputElement | null = null;
	private restoreSearchFocus = false;
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

	async onClose(): Promise<void> {
		this.searchInputEl = null;
		await super.onClose();
	}

	async render(): Promise<void> {
		const token = ++this.renderToken;
		const resolved = await resolveViewRows(this.app, this.plugin);
		if (this.isStale(token)) return;

		const groupBy = this.plugin.settings.kanbanGroupBy || "status";
		const container = this.contentEl;
		// Capture focus intent before empty() blows the input away, so any re-render
		// that fires while the user is typing (a keystroke, or a vault change) restores it.
		this.restoreSearchFocus =
			this.searchInputEl !== null &&
			this.searchInputEl.ownerDocument.activeElement === this.searchInputEl;
		container.empty();
		container.addClass("bpp-view");

		const header = container.createDiv({ cls: "bpp-toolbar" });
		header.createEl("h3", { text: "Kanban" });
		header.createEl("span", { cls: "bpp-badge bpp-badge-lite", text: "Lite" });
		header.createEl("span", { cls: "bpp-muted", text: `grouped by "${groupBy}"` });

		renderContextControls(container, this.plugin, resolved, () => void this.render());
		this.renderLiteControls(container, resolved.rows);
		renderRollupBar(container, this.plugin, resolved.rows);

		const extraColumns = this.plugin.settings.kanbanExtraColumns[groupBy] ?? [];
		const columns = buildKanbanColumns(resolved.rows, {
			groupBy,
			search: this.search,
			hideColumn: this.hideDoneColumn ? "done" : "",
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
				text: this.search || this.hideDoneColumn
					? "No cards match the current lite filters."
					: `No notes with a "${groupBy}" property found. Add "${groupBy}: To Do" to a note's frontmatter, or add a column below.`,
			});
			if (!this.search) this.renderAddColumnTile(board, groupBy);
			return;
		}

		const cardFormula = this.plugin.settings.isPro ? this.plugin.settings.cardFormula.trim() : "";
		const metaFields = this.plugin.settings.kanbanCardFields;

		for (const column of columns) {
			const col = board.createDiv({ cls: "bpp-kanban-column" });
			if (colored) col.setCssProps({ "--bpp-col-hue": this.columnHueFor(column.name) });
			this.wireColumnDrop(col, column.name, groupBy, rowById, orderedNames);

			const colHead = col.createDiv({ cls: "bpp-kanban-column-head" });
			this.makeColumnDraggable(col, colHead, column.name);
			const removable = column.rows.length === 0 && extraColumns.includes(column.name);
			colHead.addEventListener("contextmenu", (evt) =>
				this.openColumnMenu(evt, column.name, groupBy, removable)
			);
			const colLabel = colHead.createDiv({ cls: "bpp-kanban-column-label" });
			colLabel.createSpan({ text: column.name });
			colLabel.createSpan({ cls: "bpp-count", text: String(column.rows.length) });

			const actions = colHead.createDiv({ cls: "bpp-column-actions" });
			const addButton = actions.createEl("button", {
				cls: "bpp-column-add",
				text: "+",
				attr: { "aria-label": `Add note to ${column.name}` },
			});
			addButton.addEventListener("click", () => void this.quickAddNote(column.name, groupBy));

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
				card.createDiv({ cls: "bpp-card-title", text: row.name });
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
					event.dataTransfer?.setData("application/x-bpp-row", row.id);
					if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
				});
				card.addEventListener("dragend", () => card.removeClass("is-dragging"));
				card.addEventListener("click", () => this.openRow(row));
				card.addEventListener("contextmenu", (evt) => this.openCardMenu(evt, row, groupBy, orderedNames));
			}
		}

		if (!this.search) this.renderAddColumnTile(board, groupBy);
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

		let settled = false;
		const commit = async (): Promise<void> => {
			if (settled) return;
			settled = true;
			const { value, remove } = coerceFieldInput(field, input.value, previous);
			await writeRowProperty(this.plugin, row.id, field, value, remove);
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
				void this.render();
			}
		});
		input.addEventListener("blur", () => void commit());
	}

	private columnHueFor(name: string): string {
		return this.plugin.settings.kanbanColorOverrides[name] ?? String(columnHue(name));
	}

	// ---- context menus --------------------------------------------------------

	private openCardMenu(evt: MouseEvent, row: Row, groupBy: string, columns: string[]): void {
		evt.preventDefault();
		const menu = new Menu();
		menu.addItem((i) => i.setTitle("Open").setIcon("file").onClick(() => this.openRow(row)));
		menu.addItem((i) =>
			i
				.setTitle("Open to the right")
				.setIcon("separator-vertical")
				.onClick(() => {
					const file = this.app.vault.getAbstractFileByPath(row.id);
					if (file instanceof TFile) void this.app.workspace.getLeaf("split").openFile(file);
				})
		);

		const current = toStr(row.scope.get(groupBy));
		const others = columns.filter((c) => c !== current);
		if (others.length > 0) {
			menu.addSeparator();
			for (const col of others) {
				menu.addItem((i) =>
					i.setTitle(`Move to "${col}"`).setIcon("arrow-right").onClick(() => void this.moveRowToColumn(row, groupBy, col))
				);
			}
		}

		const fields = this.plugin.settings.kanbanCardFields;
		if (fields.length > 0) {
			menu.addSeparator();
			for (const field of fields) {
				menu.addItem((i) =>
					i.setTitle(`Edit ${field}…`).setIcon("pencil").onClick(() => this.editFieldViaModal(row, field))
				);
			}
		}

		menu.addSeparator();
		menu.addItem((i) => i.setTitle("Rename note…").setIcon("text-cursor-input").onClick(() => this.renameNote(row)));
		menu.addItem((i) => i.setTitle("Delete note").setIcon("trash").onClick(() => this.confirmDeleteNote(row)));
		menu.showAtMouseEvent(evt);
	}

	private openColumnMenu(evt: MouseEvent, columnName: string, groupBy: string, removable: boolean): void {
		evt.preventDefault();
		const menu = new Menu();
		menu.addItem((i) => i.setTitle("Add note").setIcon("plus").onClick(() => void this.quickAddNote(columnName, groupBy)));
		menu.addItem((i) => i.setTitle("Rename column…").setIcon("pencil").onClick(() => this.renameColumnValue(groupBy, columnName)));

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
		menu.showAtMouseEvent(evt);
	}

	// ---- menu actions ---------------------------------------------------------

	private editFieldViaModal(row: Row, field: string): void {
		const previous = row.note.frontmatter[field];
		new PromptModal(this.app, {
			title: `Edit "${field}"`,
			value: formatFieldForEdit(previous),
			placeholder: field,
			onSubmit: (v) => {
				const { value, remove } = coerceFieldInput(field, v, previous);
				void writeRowProperty(this.plugin, row.id, field, value, remove).then(() => this.render());
			},
		}).open();
	}

	private renameNote(row: Row): void {
		const file = this.app.vault.getAbstractFileByPath(row.id);
		if (!(file instanceof TFile)) return;
		new PromptModal(this.app, {
			title: "Rename note",
			value: file.basename,
			cta: "Rename",
			onSubmit: (name) => {
				const clean = name.trim();
				if (!clean || clean === file.basename) return;
				const parent = file.parent?.path ? `${file.parent.path}/` : "";
				const target = normalizePath(`${parent}${clean}.${file.extension}`);
				this.app.fileManager
					.renameFile(file, target)
					.then(() => {
						this.plugin.invalidateSnapshot();
						return this.render();
					})
					.catch((e: unknown) => new Notice(`Rename failed: ${String(e)}`));
			},
		}).open();
	}

	private confirmDeleteNote(row: Row): void {
		const file = this.app.vault.getAbstractFileByPath(row.id);
		if (!(file instanceof TFile)) return;
		new ConfirmModal(this.app, {
			title: "Delete note?",
			body: `"${file.basename}" will be moved to trash.`,
			cta: "Delete",
			onConfirm: () => {
				this.app.fileManager
					.trashFile(file)
					.then(() => {
						this.plugin.invalidateSnapshot();
						return this.render();
					})
					.catch((e: unknown) => new Notice(`Delete failed: ${String(e)}`));
			},
		}).open();
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

	/** Rewrite the group property from `from` to `to` on every note in that column. */
	private async applyColumnRename(groupBy: string, from: string, to: string): Promise<void> {
		if (!to || to === from) return;
		const key = groupBy || "status";
		const targets = this.plugin.getNotesSnapshot().filter((n) => toStr(n.frontmatter[key]) === from);
		let ok = 0;
		for (const note of targets) {
			if (await writeRowProperties(this.plugin, note.path, [{ key, value: to }])) ok++;
		}
		// Carry the column's color + order identity across the rename.
		const overrides = this.plugin.settings.kanbanColorOverrides;
		if (overrides[from] !== undefined) {
			overrides[to] = overrides[from];
			delete overrides[from];
		}
		const order = this.plugin.settings.kanbanColumnOrder[groupBy];
		if (order) this.plugin.settings.kanbanColumnOrder[groupBy] = order.map((n) => (n === from ? to : n));
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
		for (const row of rows) {
			const write: PropertyWrite =
				op === "clear"
					? { key: prop, remove: true }
					: op === "toggle"
						? { key: prop, value: !toBool(row.note.frontmatter[prop]) }
						: { key: prop, value: coerceLiteral(value) };
			if (await writeRowProperties(this.plugin, row.id, [write])) ok++;
		}
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
			const isColumn = (event.dataTransfer?.types ?? []).includes("application/x-bpp-column");
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

			const draggedColumn = event.dataTransfer?.getData("application/x-bpp-column");
			if (draggedColumn) {
				void this.reorderColumn(groupBy, orderedNames, draggedColumn, columnName);
				return;
			}

			const rowId = event.dataTransfer?.getData("application/x-bpp-row") || event.dataTransfer?.getData("text/plain");
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
			event.dataTransfer?.setData("application/x-bpp-column", columnName);
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

		const writes: PropertyWrite[] = [{ key, value: columnName }];
		if (this.plugin.settings.isPro) {
			const matched = rulesForTransition(this.plugin.settings.automations, key, columnName);
			writes.push(...computeRuleWrites(matched, row.note.frontmatter, new Date()));
		}
		const ok = await writeRowProperties(this.plugin, row.id, writes);
		if (ok && writes.length > 1) {
			const n = writes.length - 1;
			new Notice(`Moved to "${columnName}" · ${n} automation write${n === 1 ? "" : "s"}.`);
		}
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
}

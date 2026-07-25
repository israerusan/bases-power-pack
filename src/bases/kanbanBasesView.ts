import {
	BasesView,
	Menu,
	Notice,
	normalizePath,
	type BasesEntry,
	type BasesEntryGroup,
	type HoverPopover,
	type QueryController,
} from "obsidian";
import type BasesPowerPackPlugin from "../main";
import { columnHue, reorderColumns } from "../query/kanban";
import { parseRank, planReorder, type RankItem } from "../query/ranking";
import { ConfirmModal, PromptModal } from "../views/modals";
import { createSeededNote } from "../views/viewData";

/** The Bases view type id — also the `.base` `type:` value + hover-link source. */
export const KANBAN_BASES_VIEW_ID = "kanban";

/** Frontmatter property holding a card's manual order (matches the standalone board). */
const RANK_PROP = "rank";
const RANK_PROP_ID = `note.${RANK_PROP}`;

const COLOR_SWATCHES: Array<[string, number]> = [
	["Red", 0],
	["Orange", 30],
	["Yellow", 50],
	["Green", 130],
	["Teal", 175],
	["Blue", 215],
	["Purple", 270],
	["Pink", 320],
];

interface Column {
	/** The group value written back on a cross-column drop ("" = the no-value band). */
	value: string;
	name: string;
	/** Whether this is a user-added empty column (removable, holds no entries). */
	extra: boolean;
	/** Entries sorted by manual rank (unranked last) — the display + reorder order. */
	entries: BasesEntry[];
}

interface DropCtx {
	groupKey: string | null;
	columnOf: Map<string, Column>;
	entryOf: Map<string, BasesEntry>;
}

/**
 * Kanban as a NATIVE Bases view — a "Kanban" option inside the Bases view dropdown
 * (Obsidian ≥1.10), registered via `Plugin.registerBasesView`. Columns come from the
 * Bases **Group by**; cards are the grouped entries. It reuses the plugin's existing
 * board settings (column order, colors, extra columns) and pure helpers so it feels
 * like the standalone board, and writes back to notes via `processFrontMatter`.
 *
 * Write-back needs the group-by to be a writable `note.*` property — a `file.*`/
 * `formula.*` group renders read-only. Every access to the young Bases API is guarded
 * so an API-shape change degrades to a flat list rather than throwing.
 */
export class KanbanBasesView extends BasesView {
	type = KANBAN_BASES_VIEW_ID;
	/** Satisfies HoverParent for the Ctrl+hover preview. */
	hoverPopover: HoverPopover | null = null;
	private readonly root: HTMLElement;
	private cardDragActive = false;

	constructor(
		controller: QueryController,
		containerEl: HTMLElement,
		private readonly plugin: BasesPowerPackPlugin
	) {
		super(controller);
		this.root = containerEl;
	}

	onunload(): void {
		this.root.empty();
	}

	onDataUpdated(): void {
		const el = this.root;
		el.empty();
		el.addClass("bpp-view");
		const colored = this.plugin.settings.kanbanColorColumns;
		const board = el.createDiv({ cls: "bpp-kanban-board bpp-bases-kanban" });
		if (colored) board.addClass("is-colored");

		const groups = this.safeGroups();
		if (groups.length === 0) {
			this.empty(board, "No results", "Add notes, or adjust this base's filters.");
			return;
		}
		if (groups.length === 1 && !this.hasKey(groups[0])) {
			this.empty(
				board,
				"Choose a Group by property",
				'Set a "Group by" property in the Bases toolbar (e.g. status) to build kanban columns.'
			);
			return;
		}

		const groupKey = this.resolveGroupKey();
		const columns = this.buildColumns(groups, groupKey);
		const columnOf = new Map<string, Column>();
		const entryOf = new Map<string, BasesEntry>();
		for (const col of columns) {
			for (const entry of col.entries) {
				columnOf.set(entry.file.path, col);
				entryOf.set(entry.file.path, entry);
			}
		}
		const ctx: DropCtx = { groupKey, columnOf, entryOf };
		const names = columns.map((c) => c.name);

		for (const col of columns) this.renderColumn(board, col, names, ctx, colored);
		if (groupKey) this.renderAddColumnTile(board, groupKey);
	}

	// ---- columns --------------------------------------------------------------

	private buildColumns(groups: BasesEntryGroup[], groupKey: string | null): Column[] {
		const map = new Map<string, Column>();
		for (const group of groups) {
			const value = this.hasKey(group) && group.key ? group.key.toString() : "";
			const name = value || "(no value)";
			map.set(name, {
				value,
				name,
				extra: false,
				entries: [...group.entries].sort((a, b) => this.compareRank(a, b)),
			});
		}
		// User-added empty columns (shared with the standalone board), keyed by group prop.
		if (groupKey) {
			for (const name of this.plugin.settings.kanbanExtraColumns[groupKey] ?? []) {
				const clean = name.trim();
				if (clean && !map.has(clean)) map.set(clean, { value: clean, name: clean, extra: true, entries: [] });
			}
		}
		const columns = [...map.values()];
		// Explicit left-to-right order (shared setting), listed first then natural order.
		const order = groupKey ? this.plugin.settings.kanbanColumnOrder[groupKey] ?? [] : [];
		if (order.length > 0) {
			const rank = new Map(order.map((n, i) => [n, i] as const));
			columns.sort((a, b) => (rank.get(a.name) ?? Infinity) - (rank.get(b.name) ?? Infinity));
		}
		return columns;
	}

	private renderColumn(board: HTMLElement, col: Column, names: string[], ctx: DropCtx, colored: boolean): void {
		const colEl = board.createDiv({ cls: "bpp-kanban-column" });
		colEl.setAttr("data-bpp-col", col.name);
		if (colored) colEl.setCssProps({ "--bpp-col-hue": this.hueFor(col.name) });
		if (ctx.groupKey) this.wireColumnDrop(colEl, col, ctx);

		const head = colEl.createDiv({ cls: "bpp-kanban-column-head" });
		if (ctx.groupKey) this.makeColumnDraggable(colEl, head, col.name, ctx.groupKey);
		head.addEventListener("contextmenu", (e) => this.openColumnMenu(e, col, names, ctx));
		const label = head.createDiv({ cls: "bpp-kanban-column-label" });
		label.createSpan({ text: col.name });
		label.createSpan({ cls: "bpp-count", text: String(col.entries.length) });

		if (ctx.groupKey) {
			const actions = head.createDiv({ cls: "bpp-column-actions" });
			const add = actions.createEl("button", { cls: "bpp-column-add", text: "+", attr: { "aria-label": `Add note to ${col.name}` } });
			add.addEventListener("click", () => void this.addNote(col, ctx.groupKey!));
			if (col.extra && col.entries.length === 0) {
				const rm = actions.createEl("button", { cls: "bpp-column-remove clickable-icon", text: "×", attr: { "aria-label": `Remove column ${col.name}` } });
				rm.addEventListener("click", () => void this.removeExtraColumn(col.name, ctx.groupKey!));
			}
		}

		for (const entry of col.entries) this.renderCard(colEl, entry, col, ctx);
	}

	private renderAddColumnTile(board: HTMLElement, groupKey: string): void {
		const tile = board.createDiv({ cls: "bpp-kanban-column bpp-kanban-add-column" });
		const form = tile.createDiv({ cls: "bpp-add-column-form" });
		const input = form.createEl("input", { type: "text", cls: "bpp-lite-input", placeholder: "New column…" });
		const commit = (): void => {
			const name = input.value.trim();
			if (name) void this.addExtraColumn(name, groupKey);
		};
		form.createEl("button", { cls: "bpp-add-column-btn", text: "+ Add column" }).addEventListener("click", commit);
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				commit();
			}
		});
	}

	// ---- cards ----------------------------------------------------------------

	private renderCard(colEl: HTMLElement, entry: BasesEntry, col: Column, ctx: DropCtx): void {
		const card = colEl.createDiv({ cls: "bpp-card" });
		card.setAttr("data-bpp-row", entry.file.path);
		card.createDiv({ cls: "bpp-card-head" }).createDiv({ cls: "bpp-card-title", text: entry.file.basename });

		// Card property chips (the same fields the standalone board shows).
		const meta = card.createDiv({ cls: "bpp-card-meta" });
		for (const field of this.plugin.settings.kanbanCardFields) {
			const value = this.fieldValue(entry, field);
			if (value) meta.createSpan({ cls: "bpp-chip bpp-chip-tag", text: value, attr: { title: `${field}: ${value}` } });
		}
		if (!meta.hasChildNodes()) meta.remove();

		if (ctx.groupKey) {
			card.draggable = true;
			card.addEventListener("dragstart", (e) => {
				card.addClass("is-dragging");
				this.cardDragActive = true;
				this.dismissHover();
				e.dataTransfer?.setData("text/plain", entry.file.path);
				if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
			});
			card.addEventListener("dragend", () => {
				card.removeClass("is-dragging");
				this.cardDragActive = false;
			});
			this.wireCardReorder(card, entry, col, ctx);
		}
		card.addEventListener("click", () => void this.app.workspace.getLeaf(false).openFile(entry.file));
		card.addEventListener("contextmenu", (e) => this.openCardMenu(e, entry, col, ctx));
		card.addEventListener("mousedown", () => this.dismissHover());
		// Ctrl+hover preview (defaultMod on the registered source) — plain hover never
		// pops, so it can't block a drag.
		card.addEventListener("mouseover", (event) => {
			if (this.cardDragActive) return;
			this.app.workspace.trigger("hover-link", {
				event,
				source: KANBAN_BASES_VIEW_ID,
				hoverParent: this,
				targetEl: card,
				linktext: entry.file.path,
				sourcePath: entry.file.path,
			});
		});
	}

	// ---- drag & drop ----------------------------------------------------------

	private makeColumnDraggable(colEl: HTMLElement, head: HTMLElement, name: string, groupKey: string): void {
		head.draggable = true;
		head.addEventListener("dragstart", (e) => {
			colEl.addClass("is-col-dragging");
			e.dataTransfer?.setData("application/x-bpp-bcol", name);
			if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
		});
		head.addEventListener("dragend", () => colEl.removeClass("is-col-dragging"));
		void groupKey;
	}

	private wireColumnDrop(colEl: HTMLElement, col: Column, ctx: DropCtx): void {
		colEl.addEventListener("dragover", (e) => {
			const types = e.dataTransfer?.types ?? [];
			const isCol = types.includes("application/x-bpp-bcol");
			if (!isCol && !types.includes("text/plain")) return;
			e.preventDefault();
			colEl.addClass(isCol ? "is-col-drop-target" : "is-drop-target");
			if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
		});
		colEl.addEventListener("dragleave", () => {
			colEl.removeClass("is-drop-target");
			colEl.removeClass("is-col-drop-target");
		});
		colEl.addEventListener("drop", (e) => {
			e.preventDefault();
			colEl.removeClass("is-drop-target");
			colEl.removeClass("is-col-drop-target");
			const movedCol = e.dataTransfer?.getData("application/x-bpp-bcol");
			if (movedCol && ctx.groupKey) {
				void this.reorderColumn(movedCol, col.name, ctx.groupKey);
				return;
			}
			const path = e.dataTransfer?.getData("text/plain");
			if (path) void this.drop(path, col, null, true, ctx);
		});
	}

	private wireCardReorder(card: HTMLElement, target: BasesEntry, col: Column, ctx: DropCtx): void {
		card.addEventListener("dragover", (e) => {
			if (!(e.dataTransfer?.types ?? []).includes("text/plain")) return;
			e.preventDefault();
			e.stopPropagation();
			if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
			const before = this.inTopHalf(card, e);
			card.toggleClass("is-reorder-before", before);
			card.toggleClass("is-reorder-after", !before);
		});
		card.addEventListener("dragleave", () => {
			card.removeClass("is-reorder-before");
			card.removeClass("is-reorder-after");
		});
		card.addEventListener("drop", (e) => {
			card.removeClass("is-reorder-before");
			card.removeClass("is-reorder-after");
			const path = e.dataTransfer?.getData("text/plain");
			if (!path) return;
			e.preventDefault();
			e.stopPropagation();
			if (path === target.file.path) return;
			void this.drop(path, col, target, this.inTopHalf(card, e), ctx);
		});
	}

	/** Move the dragged note to `col` (writing the group property when the column
	 * changed) and set its `rank` so it lands before/after `target` (end when null). */
	private async drop(path: string, col: Column, target: BasesEntry | null, before: boolean, ctx: DropCtx): Promise<void> {
		const moved = ctx.entryOf.get(path);
		if (!moved || !ctx.groupKey) return;
		const from = ctx.columnOf.get(path);
		const crossColumn = !from || from.value !== col.value;

		const rest = col.entries.filter((e) => e.file.path !== path);
		const items: RankItem[] = rest.map((e) => ({ id: e.file.path, rank: this.rankOf(e) }));
		items.push({ id: path, rank: this.rankOf(moved) });
		let index: number;
		if (target === null) index = rest.length;
		else {
			const pos = rest.findIndex((e) => e.file.path === target.file.path);
			if (pos === -1) return;
			index = before ? pos : pos + 1;
		}
		const rankWrites = planReorder(items, path, index);
		const rankById = new Map(rankWrites.map((w) => [w.id, w.rank]));

		try {
			await this.app.fileManager.processFrontMatter(moved.file, (fm: Record<string, unknown>) => {
				if (crossColumn) {
					if (col.value === "") delete fm[ctx.groupKey!];
					else fm[ctx.groupKey!] = col.value;
				}
				if (rankById.has(path)) fm[RANK_PROP] = rankById.get(path);
			});
			for (const write of rankWrites) {
				if (write.id === path) continue;
				const neighbour = ctx.entryOf.get(write.id);
				if (neighbour) {
					await this.app.fileManager.processFrontMatter(neighbour.file, (fm: Record<string, unknown>) => {
						fm[RANK_PROP] = write.rank;
					});
				}
			}
		} catch (error) {
			new Notice(`Bases Power Pack: could not move the card (${String(error)}).`);
		}
	}

	// ---- menus ----------------------------------------------------------------

	private openCardMenu(anchor: MouseEvent, entry: BasesEntry, col: Column, ctx: DropCtx): void {
		anchor.preventDefault();
		const menu = new Menu();
		menu.addItem((i) => i.setTitle("Open").setIcon("file").onClick(() => void this.app.workspace.getLeaf(false).openFile(entry.file)));
		menu.addItem((i) => i.setTitle("Open to the right").setIcon("separator-vertical").onClick(() => void this.app.workspace.getLeaf("split").openFile(entry.file)));
		if (ctx.groupKey) {
			menu.addSeparator();
			for (const other of this.otherColumnNames(col, ctx)) {
				menu.addItem((i) => i.setTitle(`Move to "${other.name}"`).setIcon("arrow-right").onClick(() => void this.moveTo(entry, other, ctx)));
			}
		}
		menu.addSeparator();
		menu.addItem((i) => i.setTitle("Rename note…").setIcon("text-cursor-input").onClick(() => this.renameNote(entry)));
		menu.addItem((i) => i.setTitle("Delete note").setIcon("trash").onClick(() => this.deleteNote(entry)));
		menu.showAtMouseEvent(anchor);
	}

	private openColumnMenu(anchor: MouseEvent, col: Column, names: string[], ctx: DropCtx): void {
		anchor.preventDefault();
		const menu = new Menu();
		if (ctx.groupKey) {
			menu.addItem((i) => i.setTitle("Add note").setIcon("plus").onClick(() => void this.addNote(col, ctx.groupKey!)));
			menu.addItem((i) => i.setTitle("Rename column…").setIcon("pencil").onClick(() => this.renameColumn(col, ctx.groupKey!)));
			menu.addSeparator();
			const idx = names.indexOf(col.name);
			if (idx > 0) menu.addItem((i) => i.setTitle("Move column left").setIcon("arrow-left").onClick(() => void this.moveColumnBy(names, col.name, -1, ctx.groupKey!)));
			if (idx !== -1 && idx < names.length - 1) menu.addItem((i) => i.setTitle("Move column right").setIcon("arrow-right").onClick(() => void this.moveColumnBy(names, col.name, 1, ctx.groupKey!)));
			menu.addSeparator();
		}
		for (const [label, hue] of COLOR_SWATCHES) {
			menu.addItem((i) => i.setTitle(label).setIcon("circle").onClick(() => void this.setColumnColor(col.name, hue)));
		}
		menu.addItem((i) => i.setTitle("Reset color").onClick(() => void this.setColumnColor(col.name, null)));
		if (col.extra && col.entries.length === 0 && ctx.groupKey) {
			menu.addSeparator();
			menu.addItem((i) => i.setTitle("Remove empty column").setIcon("trash").onClick(() => void this.removeExtraColumn(col.name, ctx.groupKey!)));
		}
		menu.showAtMouseEvent(anchor);
	}

	// ---- mutations (settings shared with the standalone board) ----------------

	private async reorderColumn(moved: string, target: string, groupKey: string): Promise<void> {
		const current = this.plugin.settings.kanbanColumnOrder[groupKey] ?? this.currentColumnNames();
		this.plugin.settings.kanbanColumnOrder[groupKey] = reorderColumns(current, moved, target);
		await this.plugin.saveSettings({ invalidateResolved: false });
		this.onDataUpdated();
	}

	private async moveColumnBy(names: string[], name: string, delta: number, groupKey: string): Promise<void> {
		const idx = names.indexOf(name);
		const to = idx + delta;
		if (idx === -1 || to < 0 || to >= names.length) return;
		const next = [...names];
		[next[idx], next[to]] = [next[to], next[idx]];
		this.plugin.settings.kanbanColumnOrder[groupKey] = next;
		await this.plugin.saveSettings({ invalidateResolved: false });
		this.onDataUpdated();
	}

	private async setColumnColor(name: string, hue: number | null): Promise<void> {
		const map = this.plugin.settings.kanbanColorOverrides;
		if (hue === null) delete map[name];
		else map[name] = String(hue);
		await this.plugin.saveSettings({ invalidateResolved: false });
		this.onDataUpdated();
	}

	private async addExtraColumn(name: string, groupKey: string): Promise<void> {
		const map = this.plugin.settings.kanbanExtraColumns;
		const existing = map[groupKey] ?? [];
		if (!existing.some((n) => n.toLocaleLowerCase() === name.toLocaleLowerCase())) {
			map[groupKey] = [...existing, name];
			await this.plugin.saveSettings({ invalidateResolved: false });
		}
		this.onDataUpdated();
	}

	private async removeExtraColumn(name: string, groupKey: string): Promise<void> {
		const map = this.plugin.settings.kanbanExtraColumns;
		const next = (map[groupKey] ?? []).filter((n) => n !== name);
		if (next.length > 0) map[groupKey] = next;
		else delete map[groupKey];
		await this.plugin.saveSettings({ invalidateResolved: false });
		this.onDataUpdated();
	}

	private async moveTo(entry: BasesEntry, col: Column, ctx: DropCtx): Promise<void> {
		await this.drop(entry.file.path, col, null, true, ctx);
	}

	private async addNote(col: Column, groupKey: string): Promise<void> {
		try {
			const value = col.value || col.name;
			const file = await createSeededNote(this.plugin, this.plugin.settings.kanbanQuickAddFolder, groupKey, value, `New ${value}`);
			new Notice(`Created ${file.basename}`);
		} catch (error) {
			new Notice(`Bases Power Pack: could not create note (${String(error)}).`);
		}
	}

	private renameNote(entry: BasesEntry): void {
		new PromptModal(this.app, {
			title: "Rename note",
			value: entry.file.basename,
			cta: "Rename",
			onSubmit: (name) => {
				const clean = name.trim();
				if (!clean || clean === entry.file.basename) return;
				const parent = entry.file.parent?.path ? `${entry.file.parent.path}/` : "";
				const target = normalizePath(`${parent}${clean}.${entry.file.extension}`);
				this.app.fileManager.renameFile(entry.file, target).catch((e: unknown) => new Notice(`Rename failed: ${String(e)}`));
			},
		}).open();
	}

	private deleteNote(entry: BasesEntry): void {
		new ConfirmModal(this.app, {
			title: "Delete note?",
			body: `"${entry.file.basename}" will be moved to trash.`,
			cta: "Delete",
			onConfirm: () => void this.app.fileManager.trashFile(entry.file).catch((e: unknown) => new Notice(`Delete failed: ${String(e)}`)),
		}).open();
	}

	private renameColumn(col: Column, groupKey: string): void {
		if (col.value === "") {
			new Notice("The (no value) column can't be renamed.");
			return;
		}
		new PromptModal(this.app, {
			title: `Rename column "${col.name}"`,
			value: col.name,
			cta: "Rename",
			onSubmit: (next) => {
				const to = next.trim();
				if (!to || to === col.value) return;
				const run = (): void => void this.doColumnRename(col, to, groupKey);
				if (col.entries.length > 5) {
					new ConfirmModal(this.app, {
						title: "Rename column?",
						body: `This rewrites "${groupKey}: ${col.value}" → "${to}" on ${col.entries.length} notes.`,
						cta: "Rename",
						onConfirm: run,
					}).open();
				} else run();
			},
		}).open();
	}

	private async doColumnRename(col: Column, to: string, groupKey: string): Promise<void> {
		let ok = 0;
		for (const entry of col.entries) {
			try {
				await this.app.fileManager.processFrontMatter(entry.file, (fm: Record<string, unknown>) => {
					fm[groupKey] = to;
				});
				ok++;
			} catch {
				/* keep going */
			}
		}
		// Carry color/order identity to the new name (shared settings).
		const colors = this.plugin.settings.kanbanColorOverrides;
		if (colors[col.value] !== undefined) {
			colors[to] = colors[col.value];
			delete colors[col.value];
		}
		const order = this.plugin.settings.kanbanColumnOrder[groupKey];
		if (order) this.plugin.settings.kanbanColumnOrder[groupKey] = order.map((n) => (n === col.value ? to : n));
		await this.plugin.saveSettings({ invalidateResolved: false });
		new Notice(`Renamed "${col.value}" → "${to}" on ${ok} note${ok === 1 ? "" : "s"}.`);
	}

	// ---- helpers --------------------------------------------------------------

	private otherColumnNames(col: Column, ctx: DropCtx): Column[] {
		const seen = new Map<string, Column>();
		for (const c of ctx.columnOf.values()) if (c.name !== col.name) seen.set(c.name, c);
		return [...seen.values()];
	}

	private currentColumnNames(): string[] {
		const names = new Set<string>();
		for (const g of this.safeGroups()) {
			if (this.hasKey(g) && g.key) names.add(g.key.toString());
		}
		return [...names];
	}

	private hueFor(name: string): string {
		return this.plugin.settings.kanbanColorOverrides[name] ?? String(columnHue(name));
	}

	private fieldValue(entry: BasesEntry, field: string): string | null {
		try {
			const v = entry.getValue(`note.${field}`);
			const s = v == null ? "" : v.toString();
			return s.trim() ? s : null;
		} catch {
			return null;
		}
	}

	private dismissHover(): void {
		const hp = this.hoverPopover;
		if (hp) {
			hp.hoverEl?.remove();
			this.hoverPopover = null;
		}
	}

	private inTopHalf(el: HTMLElement, e: DragEvent): boolean {
		const rect = el.getBoundingClientRect();
		return e.clientY < rect.top + rect.height / 2;
	}

	private rankOf(entry: BasesEntry): number | null {
		try {
			const v = entry.getValue(RANK_PROP_ID);
			return v == null ? null : parseRank(v.toString());
		} catch {
			return null;
		}
	}

	private compareRank(a: BasesEntry, b: BasesEntry): number {
		const ar = this.rankOf(a);
		const br = this.rankOf(b);
		if (ar !== null && br !== null && ar !== br) return ar - br;
		if (ar === null && br !== null) return 1;
		if (ar !== null && br === null) return -1;
		return a.file.basename.localeCompare(b.file.basename, undefined, { sensitivity: "base" });
	}

	private empty(board: HTMLElement, title: string, body: string): void {
		const box = board.createDiv({ cls: "bpp-emptystate" });
		box.createDiv({ cls: "bpp-emptystate-title", text: title });
		box.createDiv({ cls: "bpp-emptystate-body", text: body });
	}

	private safeGroups(): BasesEntryGroup[] {
		try {
			const grouped = this.data?.groupedData;
			if (Array.isArray(grouped) && grouped.length > 0) return grouped;
		} catch {
			/* fall through */
		}
		try {
			const flat = this.data?.data ?? [];
			return flat.length > 0 ? [{ entries: flat, hasKey: () => false }] : [];
		} catch {
			return [];
		}
	}

	private hasKey(group: BasesEntryGroup): boolean {
		try {
			return typeof group.hasKey === "function" ? group.hasKey() : group.key != null;
		} catch {
			return group.key != null;
		}
	}

	private resolveGroupKey(): string | null {
		const cfg = this.config as unknown as {
			getAsPropertyId?: (k: string) => string | null;
			groupBy?: { property?: string } | string;
		};
		let pid: string | null = null;
		const gb = cfg.groupBy;
		if (gb && typeof gb === "object" && typeof gb.property === "string") pid = gb.property;
		else if (typeof gb === "string") pid = gb;
		if (!pid && typeof cfg.getAsPropertyId === "function") {
			try {
				pid = cfg.getAsPropertyId("groupBy");
			} catch {
				pid = null;
			}
		}
		if (!pid) return null;
		const match = /^note\.(.+)$/.exec(pid);
		return match ? match[1] : null;
	}
}

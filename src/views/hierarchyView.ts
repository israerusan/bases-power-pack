import { Menu, Notice } from "obsidian";
import type { Row } from "../model/row";
import { PowerPackView } from "./abstractView";
import { toBool, toNumber, toStr } from "../engine/expression";
import { filterRowsByText } from "../query/search";
import {
	buildForest,
	canReparent,
	flattenForest,
	resolveParentRef,
	type Forest,
	type HierInput,
} from "../query/hierarchy";
import { createSeededNote, writeRowProperty } from "./viewData";
import { PromptModal } from "./modals";
import { renderContextControls, renderRollupBar } from "./viewChrome";

export const VIEW_TYPE_HIERARCHY = "bpp-hierarchy-view";

import { DND_TREE } from "./dnd";

/**
 * Hierarchy / Outline view (PREMIUM). Renders the notes as an indented tree
 * linked by a parent-path frontmatter property, with per-branch roll-up metrics
 * (descendant count + done/total + progress). Drag a row onto another to
 * reparent it (writes the parent property, undoable), drop it on the root strip
 * to detach it, or use the right-click menu to add a child, set/clear the
 * parent, and the shared open/rename/delete actions. Cycles and dangling parents
 * are quarantined; a parent filtered out of the current rows shows as a ghost.
 */
export class HierarchyView extends PowerPackView {
	/** Collapsed node ids — session-only UI state, never written to frontmatter. */
	private collapsed = new Set<string>();
	/** Node id to hand keyboard focus back to after a re-render, or null. */
	private focusRowId: string | null = null;

	getViewType(): string {
		return VIEW_TYPE_HIERARCHY;
	}
	getDisplayText(): string {
		return "Power Pack: Outline";
	}
	getIcon(): string {
		return "list-tree";
	}

	async render(): Promise<void> {
		const token = ++this.renderToken;
		const container = this.contentEl;

		if (!this.plugin.settings.isPro) {
			container.empty();
			container.addClass("bpp-view");
			this.renderUpgradeNotice(
				container,
				"🌳",
				"Outline is a Premium view",
				"See your notes as a project tree — nest tasks under projects, roll up progress across a branch, and drag to reparent — unlock it with a Bases Power Pack license."
			);
			return;
		}

		const resolved = await this.plugin.getResolvedView();
		if (this.isStale(token)) return;

		this.captureSearchState();
		container.empty();
		container.addClass("bpp-view");

		const parentProp = this.plugin.settings.hierarchyParentProp || "parent";
		const orderProp = this.plugin.settings.hierarchyOrderProp.trim();
		const doneProp = this.plugin.settings.kanbanGroupBy || "status";

		this.renderToolbar(container, parentProp);
		renderContextControls(container, this.plugin, resolved, () => void this.render());
		renderRollupBar(container, this.plugin, resolved.rows);

		const rows = filterRowsByText(resolved.rows, this.searchQuery);
		const rowById = new Map(rows.map((row) => [row.id, row]));
		const knownPaths = new Set(this.plugin.getNotesSnapshot().map((n) => n.path));
		const orders = new Map<string, number | null>();

		const inputs: HierInput[] = rows.map((row) => {
			const order = this.numberOrNull(orderProp ? row.scope.get(orderProp) : null);
			orders.set(row.id, order);
			return {
				id: row.id,
				name: row.name,
				parentRef: resolveParentRef(row.scope.get(parentProp), knownPaths),
				order,
				done: this.isDone(row, doneProp),
			};
		});

		const forest = buildForest(inputs, knownPaths);
		const flat = flattenForest(forest, this.collapsed, (id) => orders.get(id) ?? null);

		if (flat.length === 0) {
			container.createDiv({
				cls: "bpp-empty",
				text: this.searchQuery
					? "No notes match the current search."
					: `No notes to outline yet. Add "${parentProp}: Projects/My Project.md" to a note's frontmatter to nest it under another.`,
			});
			return;
		}

		this.renderRootDropZone(container, parentProp);

		const list = container.createDiv({ cls: "bpp-tree" });
		list.setAttr("role", "tree");
		list.setAttr("aria-label", "Note outline");
		for (const flatRow of flat) {
			this.renderTreeRow(list, flatRow, rowById.get(flatRow.id) ?? null, forest, parentProp);
		}
		// A re-render (expand/collapse) rebuilds the rows and drops keyboard focus;
		// restore it to the same note so arrow-key navigation is continuous.
		if (this.focusRowId) {
			const target = list.querySelector<HTMLElement>(`[data-bpp-id="${CSS.escape(this.focusRowId)}"]`);
			this.focusRowId = null;
			target?.focus();
		}
	}

	private renderToolbar(container: HTMLElement, parentProp: string): void {
		const toolbar = container.createDiv({ cls: "bpp-toolbar" });
		toolbar.createEl("h3", { text: "Outline" });
		toolbar.createEl("span", { cls: "bpp-badge bpp-badge-premium", text: "Premium" });
		toolbar.createSpan({ cls: "bpp-muted", text: `nested by "${parentProp}"` });

		const group = toolbar.createDiv({ cls: "bpp-segmented" });
		const expand = group.createEl("button", { text: "Expand all", cls: "bpp-seg-btn" });
		expand.addEventListener("click", () => {
			this.collapsed.clear();
			void this.render();
		});
		const collapse = group.createEl("button", { text: "Collapse all", cls: "bpp-seg-btn" });
		collapse.addEventListener("click", () => void this.collapseAll());

		this.renderUndoButton(toolbar);
		this.renderManagedSearch(toolbar);
	}

	/** Collapse every node that has children, using the exact ids the tree flattens
	 * to (rebuild the same forest so collapsed-set membership always matches). */
	private async collapseAll(): Promise<void> {
		const parentProp = this.plugin.settings.hierarchyParentProp || "parent";
		const resolved = await this.plugin.getResolvedView();
		const rows = filterRowsByText(resolved.rows, this.searchQuery);
		const knownPaths = new Set(this.plugin.getNotesSnapshot().map((n) => n.path));
		const inputs: HierInput[] = rows.map((row) => ({
			id: row.id,
			name: row.name,
			parentRef: resolveParentRef(row.scope.get(parentProp), knownPaths),
			order: null,
			done: false,
		}));
		const forest = buildForest(inputs, knownPaths);
		const collapsed = new Set<string>();
		const walk = (nodes: typeof forest.roots): void => {
			for (const node of nodes) {
				if (node.children.length > 0) {
					collapsed.add(node.id);
					walk(node.children);
				}
			}
		};
		walk(forest.roots);
		this.collapsed = collapsed;
		await this.render();
	}

	private renderRootDropZone(container: HTMLElement, parentProp: string): void {
		const zone = container.createDiv({ cls: "bpp-tree-rootzone", text: "Drop here to make a top-level note" });
		zone.addEventListener("dragover", (evt) => {
			if (!(evt.dataTransfer?.types ?? []).includes(DND_TREE)) return;
			evt.preventDefault();
			zone.addClass("is-drop-target");
			if (evt.dataTransfer) evt.dataTransfer.dropEffect = "move";
		});
		zone.addEventListener("dragleave", () => zone.removeClass("is-drop-target"));
		zone.addEventListener("drop", (evt) => {
			zone.removeClass("is-drop-target");
			const id = evt.dataTransfer?.getData(DND_TREE);
			if (!id) return;
			evt.preventDefault();
			void this.reparent(id, null, parentProp);
		});
	}

	private renderTreeRow(
		list: HTMLElement,
		flatRow: ReturnType<typeof flattenForest>[number],
		row: Row | null,
		forest: Forest,
		parentProp: string
	): void {
		const rowEl = list.createDiv({ cls: "bpp-tree-row" });
		rowEl.setCssProps({ "--bpp-depth": String(flatRow.depth) });
		rowEl.setAttr("data-bpp-id", flatRow.id);
		// ARIA tree semantics so a screen reader announces level, position, and
		// expand state instead of an undifferentiated list.
		rowEl.setAttr("role", "treeitem");
		rowEl.setAttr("aria-level", String(flatRow.depth + 1));
		rowEl.setAttr("aria-label", flatRow.name);
		rowEl.tabIndex = 0;
		if (flatRow.hasChildren) rowEl.setAttr("aria-expanded", String(!flatRow.collapsed));
		if (flatRow.ghost) rowEl.addClass("is-ghost");

		const twist = rowEl.createSpan({ cls: "bpp-tree-twist" });
		twist.setAttr("aria-hidden", "true");
		if (flatRow.hasChildren) {
			twist.setText(flatRow.collapsed ? "▸" : "▾");
			twist.addClass("is-clickable");
			twist.addEventListener("click", (evt) => {
				evt.stopPropagation();
				this.setCollapsed(flatRow.id, !flatRow.collapsed);
			});
		}

		const label = rowEl.createSpan({ cls: "bpp-tree-name", text: flatRow.name });
		if (!flatRow.ghost && row) label.addEventListener("click", () => this.openRow(row));

		if (flatRow.missingParent) {
			rowEl.createSpan({ cls: "bpp-badge bpp-badge-warn", text: "missing parent" }).setAttr(
				"title",
				"This note's parent path doesn't resolve to a note."
			);
		}
		if (flatRow.cycle) {
			rowEl.createSpan({ cls: "bpp-badge bpp-badge-warn", text: "cycle" }).setAttr(
				"title",
				"This note is part of a parent cycle and was detached."
			);
		}

		this.renderMetrics(rowEl, flatRow.metrics);

		const openMenu =
			!flatRow.ghost && row
				? (a: MouseEvent | HTMLElement): void => this.openTreeMenu(a, row, flatRow.id, forest, parentProp)
				: null;

		if (!flatRow.ghost && row && openMenu) {
			rowEl.draggable = true;
			rowEl.addEventListener("dragstart", (evt) => {
				rowEl.addClass("is-dragging");
				evt.dataTransfer?.setData(DND_TREE, flatRow.id);
				if (evt.dataTransfer) evt.dataTransfer.effectAllowed = "move";
			});
			rowEl.addEventListener("dragend", () => rowEl.removeClass("is-dragging"));
			rowEl.addEventListener("contextmenu", (evt) => openMenu(evt));
			this.addOverflowButton(rowEl, flatRow.name, openMenu);
		}

		// Keyboard: Enter opens; ArrowRight/Left expand-collapse or step in/out;
		// ArrowUp/Down move focus between rows; ContextMenu/Shift+F10 opens actions.
		rowEl.addEventListener("keydown", (evt) => this.onRowKeydown(evt, rowEl, flatRow, row, openMenu));

		// Every row (including a ghost) is a drop target: dropping a note here makes
		// it a child of this row.
		rowEl.addEventListener("dragover", (evt) => {
			const id = (evt.dataTransfer?.types ?? []).includes(DND_TREE);
			if (!id) return;
			evt.preventDefault();
			rowEl.addClass("is-drop-target");
			if (evt.dataTransfer) evt.dataTransfer.dropEffect = "move";
		});
		rowEl.addEventListener("dragleave", () => rowEl.removeClass("is-drop-target"));
		rowEl.addEventListener("drop", (evt) => {
			rowEl.removeClass("is-drop-target");
			const dragged = evt.dataTransfer?.getData(DND_TREE);
			if (!dragged) return;
			evt.preventDefault();
			void this.reparent(dragged, flatRow.id, parentProp);
		});
	}

	private renderMetrics(rowEl: HTMLElement, metrics: ReturnType<typeof flattenForest>[number]["metrics"]): void {
		if (metrics.descendantCount === 0 && metrics.leafTotal <= 1) return;
		const chip = rowEl.createSpan({ cls: "bpp-tree-metrics" });
		if (metrics.descendantCount > 0) {
			chip.createSpan({ cls: "bpp-tree-count", text: `${metrics.descendantCount}` }).setAttr(
				"title",
				`${metrics.descendantCount} descendant${metrics.descendantCount === 1 ? "" : "s"}`
			);
		}
		if (metrics.leafTotal > 0 && metrics.progress !== null) {
			chip.createSpan({ cls: "bpp-muted", text: `${metrics.leafDone}/${metrics.leafTotal}` });
			const bar = chip.createSpan({ cls: "bpp-tree-progress" });
			bar.createSpan({ cls: "bpp-tree-progress-fill" }).setCssProps({ width: `${metrics.progress}%` });
			bar.setAttr("title", `${metrics.progress}% of leaf tasks done`);
		}
	}

	/** Set a node's collapsed state and re-render, keeping keyboard focus on it. */
	private setCollapsed(id: string, collapsed: boolean): void {
		if (collapsed) this.collapsed.add(id);
		else this.collapsed.delete(id);
		this.focusRowId = id;
		void this.render();
	}

	/** Keyboard navigation for a tree row (roving focus over the flat row list). */
	private onRowKeydown(
		evt: KeyboardEvent,
		rowEl: HTMLElement,
		flatRow: ReturnType<typeof flattenForest>[number],
		row: Row | null,
		openMenu: ((anchor: MouseEvent | HTMLElement) => void) | null
	): void {
		// Only navigate when the row itself is focused — Enter/arrows pressed on the
		// nested ⋯ button must activate the button, not also open the note or move focus.
		if (evt.target !== rowEl) return;
		switch (evt.key) {
			case "Enter":
				if (!flatRow.ghost && row) {
					evt.preventDefault();
					this.openRow(row);
				}
				break;
			case "ArrowRight":
				if (flatRow.hasChildren && flatRow.collapsed) {
					evt.preventDefault();
					this.setCollapsed(flatRow.id, false);
				} else if (flatRow.hasChildren) {
					evt.preventDefault();
					(rowEl.nextElementSibling as HTMLElement | null)?.focus();
				}
				break;
			case "ArrowLeft":
				if (flatRow.hasChildren && !flatRow.collapsed) {
					evt.preventDefault();
					this.setCollapsed(flatRow.id, true);
				} else {
					evt.preventDefault();
					(rowEl.previousElementSibling as HTMLElement | null)?.focus();
				}
				break;
			case "ArrowDown":
				evt.preventDefault();
				(rowEl.nextElementSibling as HTMLElement | null)?.focus();
				break;
			case "ArrowUp":
				evt.preventDefault();
				(rowEl.previousElementSibling as HTMLElement | null)?.focus();
				break;
			case "ContextMenu":
				if (openMenu) {
					evt.preventDefault();
					openMenu(rowEl);
				}
				break;
			case "F10":
				if (evt.shiftKey && openMenu) {
					evt.preventDefault();
					openMenu(rowEl);
				}
				break;
		}
	}

	// ---- menu + mutations -----------------------------------------------------

	private openTreeMenu(anchor: MouseEvent | HTMLElement, row: Row, id: string, forest: Forest, parentProp: string): void {
		if (anchor instanceof MouseEvent) anchor.preventDefault();
		const after = (): void => void this.render();
		const menu = new Menu();
		menu.addItem((i) => i.setTitle("Add child note").setIcon("plus").onClick(() => void this.addChildNote(id, parentProp)));
		menu.addItem((i) =>
			i.setTitle("Set parent…").setIcon("indent").onClick(() => this.setParentViaPrompt(row, id, forest, parentProp))
		);
		if (forest.byId.get(id)?.parentRef) {
			menu.addItem((i) =>
				i.setTitle("Make top-level").setIcon("outdent").onClick(() => void this.reparent(id, null, parentProp))
			);
		}
		menu.addSeparator();
		this.addCommonRowMenuItems(menu, row, this.plugin.settings.kanbanCardFields, after);
		this.showMenuAtAnchor(menu, anchor);
	}

	/** Apply a validated reparent: write (or clear) the child's parent property. */
	private async reparent(childId: string, newParentId: string | null, parentProp: string): Promise<void> {
		// Validate against the FULL vault tree (not the filtered view) so cycle
		// detection is complete and a filtered-out (ghost) parent is still a valid
		// target — a reparent must never create a cycle the current filter hides.
		const snapshot = this.plugin.getNotesSnapshot();
		const knownPaths = new Set(snapshot.map((n) => n.path));
		const inputs: HierInput[] = snapshot.map((n) => ({
			id: n.path,
			name: n.name,
			parentRef: resolveParentRef(n.frontmatter[parentProp], knownPaths),
			order: null,
			done: false,
		}));
		const { byId } = buildForest(inputs, knownPaths);
		const check = canReparent(childId, newParentId, byId);
		if (!check.ok) {
			if (check.reason && check.reason !== "already there" && check.reason !== "already a root") {
				new Notice(`Can't move: ${check.reason}.`);
			}
			return;
		}
		await writeRowProperty(this.plugin, childId, parentProp, newParentId ?? "", newParentId === null, {
			label: newParentId === null ? "Make top-level" : "Reparent note",
		});
		await this.render();
	}

	private setParentViaPrompt(row: Row, id: string, forest: Forest, parentProp: string): void {
		const current = forest.byId.get(id)?.parentRef ?? "";
		new PromptModal(this.app, {
			title: `Set parent of "${row.name}"`,
			value: current,
			placeholder: "Projects/My Project.md (blank = top-level)",
			cta: "Save",
			onSubmit: (v) => {
				const clean = v.trim();
				if (!clean) {
					void this.reparent(id, null, parentProp);
					return;
				}
				// Canonicalize a typed value (wikilink / extension-less) to a real path
				// so it isn't rejected as "unknown parent" when it names an actual note.
				const knownPaths = new Set(this.plugin.getNotesSnapshot().map((n) => n.path));
				void this.reparent(id, resolveParentRef(clean, knownPaths), parentProp);
			},
		}).open();
	}

	private async addChildNote(parentId: string, parentProp: string): Promise<void> {
		try {
			const file = await createSeededNote(
				this.plugin,
				this.plugin.settings.hierarchyQuickAddFolder,
				parentProp,
				parentId,
				"New child"
			);
			new Notice(`Created ${file.basename}`);
		} catch (error) {
			new Notice(`Bases Power Pack: could not create note (${String(error)}).`);
		}
		await this.render();
	}

	// ---- helpers --------------------------------------------------------------

	private numberOrNull(value: unknown): number | null {
		if (value === undefined || value === null || value === "") return null;
		const n = toNumber(value);
		return Number.isFinite(n) ? n : null;
	}

	/** A row is "done" when its group value equals the configured done value (e.g.
	 * "done"/"Complete") or it has a truthy `done` property. */
	private isDone(row: Row, doneProp: string): boolean {
		const doneValue = this.plugin.settings.kanbanDoneValue.trim().toLowerCase();
		if (doneValue && toStr(row.scope.get(doneProp)).trim().toLowerCase() === doneValue) return true;
		return toBool(row.scope.get("done"));
	}
}

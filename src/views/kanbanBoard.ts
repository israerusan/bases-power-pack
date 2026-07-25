import { Menu, Notice, normalizePath, type HoverParent, type HoverPopover } from "obsidian";
import type BasesPowerPackPlugin from "../main";
import { COMPUTED_FILE_PROPS, type RawNote, type Row } from "../model/row";
import {
	buildBoardModel,
	columnHue,
	compareRowsByRank,
	dueStatus,
	formatCardField,
	isRowDone,
	priorityClass,
	reorderColumns,
	type KanbanColumn,
	type KanbanSort,
} from "../query/kanban";
import { toIsoDateKey, todayIso } from "../query/dates";
import { avatarFor, progressPercent } from "../query/cardLayout";
import { computeRollup } from "../query/rollup";
import { buildQuickAddTitle } from "../query/kanbanActions";
import { coerceFieldInput, formatFieldForEdit } from "../query/inlineEdit";
import { coerceLiteral, computeRuleWrites, rulesForTransition } from "../query/automation";
import { dropWouldExceed, formatWipCount, isOverWip, limitFor, sanitizeWipLimit } from "../query/wip";
import { parseRank, planReorder, type RankItem } from "../query/ranking";
import { evaluateSafe, toBool, toStr } from "../engine/expression";
import { createSeededNote, writeRowProperties, writeRowProperty, type PropertyWrite } from "./viewData";
import { BulkEditModal, ConfirmModal, FloatingEditModal, PromptModal, type BulkOp } from "./modals";
import { DND_COLUMN, DND_ROW } from "./dnd";
import { buildSwimlanes, laneKeyOf, laneWrite, SWIMLANE_EMPTY } from "../query/swimlane";
import { TouchDragController, type TouchDropTarget } from "./touchDrag";
import { DragScroller } from "./autoscroll";
import * as rowActions from "./rowActions";
import type { RowActionEnv } from "./rowActions";
import type { CardTemplate, ColumnSet } from "../settings";

/**
 * The seam between the shared board renderer ({@link KanbanBoard}) and its two hosts:
 * the standalone `KanbanView` (an ItemView) and the native `KanbanBasesView` (a
 * BasesView). The board never learns which host it has — every difference flows through
 * an immutable {@link BoardInput} snapshot, a {@link BoardCapabilities} bitset, or an
 * optional host service. See the shared-renderer roadmap.
 */

/** What the board can do in the current host — NOT an `instanceof` check. */
export interface BoardCapabilities {
	/** The group-by is a writable `note.*` property (false → read-only board, e.g. a
	 * Bases group-by on a `file.*`/`formula.*` property). */
	canWriteGroupBy: boolean;
	/** Multi-select cards for batch operations (standalone: yes). */
	canMultiSelect: boolean;
	/** Swimlanes (a second group-by band) are available. */
	canSwimlanes: boolean;
	/** Column sets, WIP editing, collapse — the full column-chrome surface. */
	canColumnChrome: boolean;
}

/**
 * One coherent, immutable snapshot the board renders + plans against. Captured once per
 * render/interaction so a mid-drag vault/settings change can't be read piecemeal; the
 * `revision` lets a drop detect it planned against a now-stale snapshot and cancel.
 */
export interface BoardInput {
	/** Bumped whenever the underlying data/settings change; drop-time stale check. */
	revision: number;
	/** The row universe, already host-normalized (standalone: getResolvedView().rows;
	 * Bases: this.data.data mapped to Rows). The board doesn't know the source. */
	rows: readonly Row[];
	/** Formulas backing `scope.get` for computed-field write guards (Bases: {} — writes
	 * always target `note.*`). */
	formulas: Record<string, string>;
	/** The quick-search (standalone: managed search box; Bases: "" — the base filters). */
	searchQuery: string;
	/** Whether the board renders its own controls row (standalone: true; Bases: false —
	 * the Bases toolbar owns group-by/sort/filter). */
	showControls: boolean;
	/** The group-by property (standalone: settings.kanbanGroupBy; Bases: the base's key). */
	groupBy: string;
	/** The swimlane property, or "" (Bases v1: ""). */
	swimlaneProp: string;
	/** The `hover-link` source id registered for this host, so a card's Page Preview
	 * popover resolves (standalone: VIEW_TYPE_KANBAN; Bases: its own id). */
	hoverSource: string;
}

/**
 * The host-provided surface the board calls. Deliberately small: a data snapshot, a
 * re-render trigger, interaction suppression (so a background repaint can't yank a
 * focused inline edit / in-flight drag), a refresh subscription (so undo-replay repaints
 * a host that isn't a workspace leaf), capabilities, and optional services.
 */
export interface BoardHost {
	readonly containerEl: HTMLElement;
	rowEnv: RowActionEnv;
	captureInput(): BoardInput;
	requestRender(reason?: string): void;
	beginInteraction(): void;
	endInteraction(): void;
	/** Apply a quick-search from inside the board (a tag chip filters the board; the
	 * empty state's "Clear search"). Standalone: writes its managed search + re-renders.
	 * Bases: a no-op — the base owns filtering and searchQuery is always "". */
	setSearch(query: string): void;
	/** Subscribe to plugin-wide refreshes (undo-replay / license change). Returns an
	 * unsubscribe. The standalone is refreshed via `refreshViews()`; a BasesView is not,
	 * so it subscribes here. */
	registerRefresh(cb: () => void): () => void;
	readonly capabilities: BoardCapabilities;
	/** Premium Move Rules that fire when a card enters `columnValue` (standalone only). */
	runMoveAutomations?(groupBy: string, columnValue: string, frontmatter: Record<string, unknown>): PropertyWrite[];
}

/** The sort modes offered in the board controls; the getter validates a stored value
 * against this set. Shared with the standalone toolbar (which renders the dropdown). */
export const SORT_OPTIONS: Array<{ value: KanbanSort; label: string }> = [
	{ value: "manual", label: "Manual — drag to reorder" },
	{ value: "name-asc", label: "Name ↑" },
	{ value: "name-desc", label: "Name ↓" },
	{ value: "due-asc", label: "Due date" },
	{ value: "priority-desc", label: "Priority" },
	{ value: "mtime-desc", label: "Recently changed" },
];

/** Everything a card needs to render, threaded once into {@link KanbanBoard.renderCard}
 * so the flat board and each swimlane cell paint cards through one code path. */
interface CardRenderCtx {
	groupBy: string;
	orderedNames: string[];
	metaFields: string[];
	cardFormula: string;
	today: string;
	dueProps: Set<string>;
	reorderEnabled: boolean;
	/** null on the flat board; the cell's swimlane value in a banded board. */
	laneKey: string | null;
}

/**
 * Shared Kanban board renderer. Owns the board DOM + interaction state (selection, drag,
 * touch, auto-scroll, hover) and renders from a {@link BoardInput}. Both hosts create one
 * and call `render(host.captureInput())` on every host re-render.
 *
 * It implements Obsidian's {@link HoverParent} so a card's `hover-link` trigger can drive
 * the core Page Preview popover regardless of which host owns the pane.
 */
export class KanbanBoard implements HoverParent {
	constructor(
		private readonly plugin: BasesPowerPackPlugin,
		private readonly host: BoardHost
	) {}

	/** The snapshot the current DOM was rendered from — read by interaction handlers
	 * (search text, hover source) so they act against what the user is looking at. */
	private input: BoardInput = {
		revision: 0,
		rows: [],
		formulas: {},
		searchQuery: "",
		showControls: true,
		groupBy: "status",
		swimlaneProp: "",
		hoverSource: "",
	};

	/** The currently visible (filtered) rows, captured for the bulk-edit action. */
	private lastVisibleRows: Row[] = [];
	/** TRUE column membership — resolved (base/filter-scoped) rows grouped by value,
	 * ignoring the transient quick-search. Drives WIP badges/enforcement, per-column
	 * roll-ups, and the column-rename target set. */
	private lastColumnRows = new Map<string, Row[]>();
	/** The rows AS DISPLAYED per column (search-filtered, in the active sort order) —
	 * the basis for a manual drag-to-reorder, which reads the shown rank order. */
	private lastDisplayColumns = new Map<string, Row[]>();
	/** Cards selected via modifier-click, by row id. Dragging any selected card moves
	 * the whole set; the selection bar acts on it in bulk. */
	private selected = new Set<string>();
	/** Touch drag layer (pointer-based), rebuilt each render. Mouse keeps HTML5 DnD. */
	private touch: TouchDragController | null = null;
	/** The swimlane keys shown in the last render, in display order — the target set
	 * for the card menu's "Move to lane" items. Empty on a flat board. */
	private lastLaneKeys: string[] = [];
	/** Satisfies Obsidian's HoverParent so card hover can drive the core Page Preview
	 * popover (the "hover-link" trigger in renderCard). */
	hoverPopover: HoverPopover | null = null;
	/** True while a card is being dragged — suppresses the hover preview so its popover
	 * can't sit on top of the card and swallow the drag. */
	private cardDragActive = false;
	/** Edge auto-scroll driver for mouse (HTML5) drags over the board. */
	private boardScroller: DragScroller | null = null;

	/** The visible (search-filtered) rows of the last render — the standalone toolbar's
	 * export builders read this at click time. */
	get visibleRows(): Row[] {
		return this.lastVisibleRows;
	}
	/** The rows-as-displayed per column of the last render, for the "copy board" export. */
	get displayColumns(): ReadonlyMap<string, Row[]> {
		return this.lastDisplayColumns;
	}

	// ---- settings-derived getters (board reads settings directly) --------------

	/** The active swimlane property (or ""), sourced from the rendered snapshot so an
	 * interaction handler agrees with what was painted — the host's input, not a live
	 * settings read (the standalone's input already carries the degenerate-lane guard; the
	 * Bases host sends ""). */
	private get swimlaneProp(): string {
		return this.input.swimlaneProp;
	}

	/** The active group-by, from the rendered snapshot (standalone: settings.kanbanGroupBy;
	 * Bases: the base's resolved key). Keys the per-group sort / hide-done settings. */
	private get groupByProp(): string {
		return this.input.groupBy || "status";
	}

	private get rankProp(): string {
		return this.plugin.settings.kanbanRankProp || "rank";
	}

	/** Manual drag-to-reorder is live in the hand-order sort — "manual" (the default) or
	 * the legacy "rank" alias — but not while a name/due/priority sort governs the order. */
	private get reorderEnabled(): boolean {
		return this.sortBy === "manual" || this.sortBy === "rank";
	}

	private get sortBy(): KanbanSort {
		const v = this.plugin.settings.kanbanSortBy[this.groupByProp];
		return SORT_OPTIONS.some((o) => o.value === v) ? (v as KanbanSort) : "manual";
	}

	private get hideDoneColumn(): boolean {
		return this.plugin.settings.kanbanHideDone[this.groupByProp] === true;
	}

	// ---- host capabilities (all true for the standalone; a Bases host may restrict) ----

	/** The group-by is a writable `note.*` property. False → read-only board: no card drag,
	 * no cross-column move, no column add/remove/rename (a `file.*`/`formula.*` group-by). */
	private get canWrite(): boolean {
		return this.host.capabilities.canWriteGroupBy;
	}
	/** Modifier-click multi-select + the bulk selection bar are available. */
	private get canMultiSelect(): boolean {
		return this.host.capabilities.canMultiSelect;
	}
	/** The column-chrome surface (add/remove/rename/WIP/collapse/column-sets) is offered. */
	private get canColumnChrome(): boolean {
		return this.host.capabilities.canColumnChrome;
	}

	/** Open the plugin's settings tab — the empty-state "Choose another property" CTA. */
	private openSettings(): void {
		this.plugin.app.setting?.open();
		this.plugin.app.setting?.openTabById(this.plugin.manifest.id);
	}

	/** Un-hide the Done column (the empty-state "Show done" action). Presentational. */
	private async showDone(): Promise<void> {
		delete this.plugin.settings.kanbanHideDone[this.groupByProp];
		await this.plugin.saveSettings({ invalidateResolved: false });
		this.host.requestRender();
	}

	/** Tear down any open Page Preview popover this board owns (on mousedown / dragstart),
	 * so it can't block a drag. */
	private dismissCardHover(): void {
		const hp = this.hoverPopover;
		if (hp) {
			hp.hoverEl?.remove();
			this.hoverPopover = null;
		}
	}

	// ---- render ---------------------------------------------------------------

	/**
	 * Render the board into the host container from the given snapshot. The host has
	 * already painted its toolbar into the same container; this appends the board grid
	 * (and, when cards are selected, the selection bar) after it.
	 */
	render(input: BoardInput): void {
		this.input = input;
		const groupBy = input.groupBy || "status";
		const container = this.host.containerEl;

		const extraColumns = this.plugin.settings.kanbanExtraColumns[groupBy] ?? [];
		// The full board model (display columns + TRUE membership + display order) is
		// derived once in a pure, unit-tested function so the search-filtered "shown"
		// cards and the true WIP/reorder membership can never be conflated.
		const model = buildBoardModel(input.rows as Row[], {
			groupBy,
			search: input.searchQuery,
			hideColumn: this.hideDoneColumn ? this.plugin.settings.kanbanDoneValue : "",
			sortBy: this.sortBy,
			rankProp: this.rankProp,
			extraColumns,
			columnOrder: this.plugin.settings.kanbanColumnOrder[groupBy] ?? [],
		});
		const columns = model.columns;
		this.lastVisibleRows = model.visibleRows;
		this.lastDisplayColumns = model.displayColumns;
		this.lastColumnRows = model.trueMembership;
		const columnRows = model.trueMembership; // local alias used by the column loop below
		const orderedNames = model.orderedNames;
		const colored = this.plugin.settings.kanbanColorColumns;
		const swimProp = input.swimlaneProp;
		const board = container.createDiv({ cls: "bpp-kanban-board" });
		if (colored) board.addClass("is-colored");
		if (swimProp) board.addClass("is-swimlaned");
		this.wireBoardAutoScroll(board);
		// Rebuild the touch-drag layer for this render (cards are recreated each time).
		this.touch?.destroy();
		this.touch = this.makeTouchController(board, groupBy, swimProp);
		const rowById = new Map(input.rows.map((row) => [row.id, row]));

		if (columns.length === 0) {
			if (input.searchQuery || this.hideDoneColumn) {
				const actions: Array<{ label: string; onClick: () => void }> = [];
				if (input.searchQuery) {
					actions.push({ label: "Clear search", onClick: () => this.host.setSearch("") });
				}
				if (this.hideDoneColumn) {
					actions.push({ label: "Show done", onClick: () => void this.showDone() });
				}
				rowActions.renderEmptyState(board, {
					title: "No cards match",
					body: "No cards match the current filters.",
					actions,
				});
				// A "hide done"-only empty board (no search) can still be built on — keep
				// the add-column tile so adding a column doesn't require un-hiding Done first.
				if (!input.searchQuery) this.renderAddColumnTile(board, groupBy);
			} else {
				rowActions.renderEmptyState(board, {
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
		// Chip context: overdue/soon state applies only to due-style props, and is muted
		// on done cards (a completed task isn't "overdue").
		const today = todayIso();
		const dueProps = new Set(["due", this.plugin.settings.calendarDateProp || "due"]);
		const cardCtx: CardRenderCtx = {
			groupBy,
			orderedNames,
			metaFields,
			cardFormula,
			today,
			dueProps,
			reorderEnabled: this.reorderEnabled,
			laneKey: null,
		};

		// Swimlanes: a second group-by splits the board into horizontal bands. Delegated
		// to a dedicated builder so the flat board below is untouched.
		if (swimProp) {
			this.renderSwimlaneBoard(board, input.rows as Row[], columns, columnRows, {
				groupBy,
				swimProp,
				extraColumns,
				colored,
				cardCtx,
			});
			this.renderSelectionBar(container, groupBy, orderedNames);
			return;
		}

		for (const column of columns) {
			const col = board.createDiv({ cls: "bpp-kanban-column" });
			// Stable drop-target identity for the pointer/touch hit-test (mouse uses the
			// wired dragover/drop handlers; touch reads this attribute).
			col.setAttr("data-bpp-col", column.name);
			// Badge, over-WIP flag, AND the accessible name all count the column's TRUE
			// membership, not the search-filtered subset — so the announced count agrees
			// with the visible badge and with move enforcement. When a search hides cards,
			// the name says so ("N shown").
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

			// Collapse: a collapsed column shrinks to a narrow strip (its body hidden). The
			// chevron toggles it; state is persisted per column value. The drop target
			// stays, so a card can still be dropped onto a collapsed column.
			const collapsed = this.plugin.settings.kanbanCollapsedColumns[column.name] === true;
			if (collapsed) col.addClass("is-collapsed");
			const collapseBtn = colHead.createEl("button", {
				cls: "bpp-col-collapse clickable-icon",
				attr: {
					"aria-label": `${collapsed ? "Expand" : "Collapse"} column ${column.name}`,
					"aria-expanded": String(!collapsed),
					title: collapsed ? "Expand column" : "Collapse column",
				},
			});
			collapseBtn.createSpan({ text: collapsed ? "▸" : "▾", attr: { "aria-hidden": "true" } });
			collapseBtn.addEventListener("click", (evt) => {
				evt.stopPropagation();
				void this.toggleColumnCollapse(column.name);
			});

			const colLabel = colHead.createDiv({ cls: "bpp-kanban-column-label" });
			const nameSpan = colLabel.createSpan({ cls: "bpp-kanban-column-name", text: column.name });
			// Inline rename: double-click the column name (conflict-free — the header has
			// no single-click action). Routes through applyColumnRename, which confirms a
			// large rewrite and carries color/order/WIP identity across the rename.
			nameSpan.addEventListener("dblclick", (evt) => {
				evt.stopPropagation();
				this.beginColumnRename(nameSpan, column.name, groupBy);
			});
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
			if (this.canWrite) {
				const addButton = actions.createEl("button", {
					cls: "bpp-column-add",
					text: "+",
					attr: { "aria-label": `Add note to ${column.name}` },
				});
				addButton.addEventListener("click", (e) => this.addCardFlow(column.name, groupBy, e));
			}
			rowActions.addOverflowButton(actions, `column ${column.name}`, (a) =>
				this.openColumnMenu(a, column.name, groupBy, removable, orderedNames)
			);

			// An empty user-added column can be removed — no notes are affected.
			if (this.canColumnChrome && column.rows.length === 0 && extraColumns.includes(column.name)) {
				const removeButton = actions.createEl("button", {
					cls: "bpp-column-remove clickable-icon",
					text: "×",
					attr: { "aria-label": `Remove column ${column.name}` },
				});
				removeButton.addEventListener("click", () => void this.removeExtraColumn(groupBy, column.name));
			}

			// A collapsed column hides its body (roll-ups + cards); the header strip and its
			// drop target remain, so you can still drop a card onto it to move it here.
			if (collapsed) continue;

			// Per-column roll-ups (premium): the same configured aggregations as the
			// board-wide bar, computed over just this column's true membership.
			if (this.plugin.settings.isPro && this.plugin.settings.rollups.length > 0) {
				const chips = col.createDiv({ cls: "bpp-col-rollups" });
				for (const rollup of this.plugin.settings.rollups) {
					chips.createSpan({
						cls: "bpp-col-rollup",
						text: `${rollup.label || rollup.aggregation}: ${computeRollup(rollup, columnRows.get(column.name) ?? [])}`,
					});
				}
			}

			for (const row of column.rows) this.renderCard(col, row, column.name, cardCtx);
		}

		if (!input.searchQuery) this.renderAddColumnTile(board, groupBy);
		this.renderSelectionBar(container, groupBy, orderedNames);
	}

	/**
	 * Render one card into a column/cell. Extracted from the flat board loop so the
	 * swimlane board renders cards through the exact same path — no divergent second copy
	 * of the chip/edit/drag/selection wiring. `ctx.laneKey` is null on the flat board and
	 * the lane value in a swimlane cell.
	 */
	private renderCard(container: HTMLElement, row: Row, columnName: string, ctx: CardRenderCtx): void {
		const card = container.createDiv({ cls: "bpp-card" });
		// Stable drop-target identity for the pointer/touch hit-test.
		card.setAttr("data-bpp-row", row.id);
		if (this.selected.has(row.id)) card.addClass("is-selected");
		rowActions.applyColorRule(this.plugin, card, row);
		// Read-only board (a `file.*`/`formula.*` group-by): cards open but don't drag.
		if (this.canWrite) card.draggable = true;

		// Cover image (free): a resolved cover from the configured image property sits at
		// the top of the card. An absent or unresolvable ref simply shows no cover.
		const coverSrc = rowActions.coverImageSrc(this.host.rowEnv, row, this.plugin.settings.kanbanCardImageProp);
		if (coverSrc) {
			card.addClass("has-cover");
			card.createEl("img", {
				cls: "bpp-card-cover",
				attr: { src: coverSrc, alt: "", loading: "lazy", draggable: "false" },
			});
		}

		const openMenu = (a: MouseEvent | HTMLElement): void =>
			this.openCardMenu(a, row, ctx.groupBy, ctx.orderedNames, columnName, ctx.laneKey);
		const head = card.createDiv({ cls: "bpp-card-head" });
		const titleEl = head.createDiv({ cls: "bpp-card-title", text: row.name });
		// Avatar widget (card layout): a colored initials chip from a person/assignee field.
		const avatarProp = this.plugin.settings.kanbanCardAvatarProp.trim();
		if (avatarProp) {
			const av = avatarFor(row.scope.get(avatarProp));
			if (av) {
				const chip = head.createSpan({ cls: "bpp-card-avatar", text: av.initials });
				chip.setCssProps({ "--bpp-avatar-hue": String(av.hue) });
				chip.setAttr("title", `${avatarProp}: ${toStr(row.scope.get(avatarProp))}`);
				chip.setAttr("aria-label", `${avatarProp} ${toStr(row.scope.get(avatarProp))}`);
			}
		}
		// Inline rename: a hover ✎ affordance (plus F2 when focused and the ⋯ menu), so
		// renaming the note never requires a modal. Single-click still opens.
		const renameBtn = head.createEl("button", {
			cls: "bpp-card-rename clickable-icon",
			attr: { "aria-label": `Rename ${row.name}`, title: "Rename note" },
		});
		renameBtn.createSpan({ text: "✎", attr: { "aria-hidden": "true" } });
		renameBtn.addEventListener("click", (evt) => {
			evt.stopPropagation();
			this.beginTitleRename(card, titleEl, row);
		});
		rowActions.addOverflowButton(head, row.name, openMenu);
		// Row-level (not column-level) so a `done: true` card in a non-Done column mutes
		// its overdue chip too — matching the Calendar's overdue rule.
		const isDone = isRowDone(row, ctx.groupBy, this.plugin.settings.kanbanDoneValue);
		for (const field of ctx.metaFields) {
			const display = formatCardField(row, field);
			if (display === null) continue;
			this.renderEditableField(card, row, field, display, {
				today: ctx.today,
				dueState: ctx.dueProps.has(field) && !isDone,
			});
		}
		if (ctx.cardFormula) {
			const val = evaluateSafe(ctx.cardFormula, row.scope);
			if (val !== null && toStr(val) !== "") {
				card.createDiv({ cls: "bpp-card-meta bpp-card-meta-premium", text: toStr(val) });
			}
		}
		// Progress-bar widget (card layout): a numeric field measured against a configured max.
		const progressProp = this.plugin.settings.kanbanCardProgressProp.trim();
		if (progressProp) {
			const pct = progressPercent(row.scope.get(progressProp), this.plugin.settings.kanbanCardProgressMax);
			if (pct !== null) {
				const track = card.createDiv({
					cls: "bpp-card-progress",
					attr: {
						role: "progressbar",
						"aria-valuenow": String(pct),
						"aria-valuemin": "0",
						"aria-valuemax": "100",
						title: `${progressProp}: ${pct}%`,
					},
				});
				track.createDiv({ cls: "bpp-card-progress-bar" }).setCssProps({ "--bpp-progress": `${pct}%` });
			}
		}
		card.addEventListener("dragstart", (event) => {
			card.addClass("is-dragging");
			// Kill any open hover preview and stop new ones, so the popover can't sit on
			// top of the card and swallow the drag.
			this.cardDragActive = true;
			this.dismissCardHover();
			event.dataTransfer?.setData("text/plain", row.id);
			event.dataTransfer?.setData(DND_ROW, row.id);
			if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
		});
		card.addEventListener("dragend", () => {
			card.removeClass("is-dragging");
			this.cardDragActive = false;
			this.boardScroller?.stop();
		});
		// Hand-order sort: each card is a precise drop target so a drag lands BETWEEN two
		// cards, writing a rank that sorts it there.
		if (ctx.reorderEnabled && this.canWrite) this.wireCardReorder(card, row, columnName, ctx.groupBy, ctx.laneKey);
		// Modifier-click multi-selects (when the host allows it); a plain click opens the
		// note (in a tab, or the floating editor when that's the configured click action).
		card.addEventListener("click", (evt) => {
			if (this.canMultiSelect && (evt.ctrlKey || evt.metaKey || evt.shiftKey)) {
				evt.preventDefault();
				this.toggleSelect(row.id);
			} else {
				this.openCardDefault(row);
			}
		});
		// Focusable + Enter-to-open + Shift+F10/ContextMenu-to-menu (keyboard path).
		rowActions.makeItemAccessible(card, row.name, () => rowActions.openRow(this.host.rowEnv, row), openMenu);
		card.addEventListener("contextmenu", (evt) => openMenu(evt));
		// F2 renames the note in place when the card (not a nested input) is focused.
		card.addEventListener("keydown", (evt) => {
			if (evt.target === card && evt.key === "F2") {
				evt.preventDefault();
				this.beginTitleRename(card, titleEl, row);
			}
		});
		// Dismiss any preview the moment you press on a card to grab it.
		card.addEventListener("mousedown", () => this.dismissCardHover());
		// Native hover preview via the core Page Preview plugin. `source` MUST match the id
		// registered with registerHoverLinkSource, or Page Preview falls back to requiring
		// the Mod key. Suppressed while a card drag is active so a mid-drag popover can't
		// block the drop.
		card.addEventListener("mouseover", (event) => {
			if (this.cardDragActive) return;
			this.plugin.app.workspace.trigger("hover-link", {
				event,
				source: this.input.hoverSource,
				hoverParent: this,
				targetEl: card,
				linktext: row.id,
				sourcePath: row.id,
			});
		});
		// Touch: long-press to pick up and drag (mouse keeps the HTML5 path above).
		if (this.canWrite) this.touch?.attach(card, row.id);
	}

	/**
	 * Rename a card's note in place: swap the title for an input, commit on Enter/blur via
	 * `fileFor` + `fileManager.renameFile`, Escape cancels. Background re-renders are held
	 * during the edit (beginInteraction) so a vault change can't yank the input.
	 */
	private beginTitleRename(card: HTMLElement, titleEl: HTMLElement, row: Row): void {
		const file = rowActions.fileFor(this.host.rowEnv, row);
		if (!file) return;
		const original = file.basename;
		card.draggable = false;
		titleEl.empty();
		titleEl.addClass("is-editing");
		const input = titleEl.createEl("input", { cls: "bpp-inline-edit bpp-title-edit", type: "text" });
		input.value = original;
		input.focus();
		input.select();
		this.host.beginInteraction();

		let settled = false;
		const finish = (): void => {
			this.host.endInteraction();
			card.draggable = true;
		};
		const commit = async (): Promise<void> => {
			if (settled) return;
			settled = true;
			const next = input.value.trim();
			finish();
			if (!next || next === original) {
				this.host.requestRender();
				return;
			}
			const parent = file.parent?.path ? `${file.parent.path}/` : "";
			const target = normalizePath(`${parent}${next}.${file.extension}`);
			try {
				await this.plugin.app.fileManager.renameFile(file, target);
				this.plugin.invalidateSnapshot();
			} catch (error) {
				new Notice(`Rename failed: ${String(error)}`);
			}
			this.host.requestRender();
		};
		input.addEventListener("click", (event) => event.stopPropagation());
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				void commit();
			} else if (event.key === "Escape") {
				event.preventDefault();
				settled = true;
				finish();
				this.host.requestRender();
			}
		});
		input.addEventListener("blur", () => void commit());
	}

	private renderAddColumnTile(board: HTMLElement, groupBy: string): void {
		if (!this.canColumnChrome) return; // read-only board — no add-column affordance
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

	/**
	 * Rename a column in place: swap the header label for an input, then route the
	 * committed value through {@link applyColumnRename}. Escape cancels. Used by the header
	 * double-click and the column menu.
	 */
	private beginColumnRename(labelSpan: HTMLElement, columnName: string, groupBy: string): void {
		if (!this.canColumnChrome) return; // read-only board — the column value isn't writable
		// Disable the header's HTML5 drag while editing, else a mouse text-selection inside
		// the input hijacks into a column-reorder drag (a re-render — which every exit path
		// triggers — recreates the header with drag restored).
		const dragEl = labelSpan.closest<HTMLElement>('[draggable="true"]');
		if (dragEl) dragEl.draggable = false;
		labelSpan.empty();
		labelSpan.addClass("is-editing");
		const input = labelSpan.createEl("input", { cls: "bpp-inline-edit bpp-col-title-edit", type: "text" });
		input.value = columnName;
		input.focus();
		input.select();
		this.host.beginInteraction();

		let settled = false;
		const commit = async (): Promise<void> => {
			if (settled) return;
			settled = true;
			const next = input.value.trim();
			this.host.endInteraction();
			// Restore the header first (removes the input and refreshes lastColumnRows,
			// which applyColumnRename reads to scope the rewrite to this board's rows).
			this.host.requestRender();
			if (next && next !== columnName) this.applyColumnRename(groupBy, columnName, next);
		};
		input.addEventListener("click", (event) => event.stopPropagation());
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				void commit();
			} else if (event.key === "Escape") {
				event.preventDefault();
				settled = true;
				this.host.endInteraction();
				this.host.requestRender();
			}
		});
		input.addEventListener("blur", () => void commit());
	}

	/**
	 * A card metadata line the user can click to edit the underlying frontmatter. Known
	 * field shapes render as semantic chips; anything else keeps the plain line. Every
	 * variant shares the same click-to-edit wiring.
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

		// Date-valued field → date chip. Gate on the value actually LOOKING date-shaped (a
		// real Date, or a leading YYYY-MM-DD) before calling toIsoDateKey.
		const isoKey =
			value instanceof Date || /^\d{4}-\d{2}-\d{2}/.test(toStr(value)) ? toIsoDateKey(value) : null;
		if (isoKey) {
			const status = ctx.dueState ? dueStatus(isoKey, ctx.today) : null;
			const chip = line.createSpan({ cls: "bpp-chip bpp-chip-date" });
			if (status === "overdue") chip.addClass("is-overdue");
			else if (status === "soon") chip.addClass("is-soon");
			chip.createSpan({ cls: "bpp-chip-key", text: field });
			chip.createSpan({ text: display });
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
			for (const part of parts) {
				// A tag chip filters the board (like Base Board): click sets the quick
				// search to this tag. stopPropagation so it never triggers the line's
				// click-to-edit or the card's click-to-open.
				const chip = line.createSpan({ cls: "bpp-chip bpp-chip-tag is-clickable", text: part });
				chip.setAttr("title", `Filter board by "${part}"`);
				chip.setAttr("role", "button");
				chip.setAttr("tabindex", "0");
				const filter = (evt: Event): void => {
					evt.stopPropagation();
					this.host.setSearch(part);
				};
				chip.addEventListener("click", filter);
				chip.addEventListener("keydown", (evt) => {
					if (evt.key === "Enter" || evt.key === " ") {
						evt.preventDefault();
						filter(evt);
					}
				});
			}
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
		// A date-shaped field gets a real date picker instead of a bare text box.
		const dateProps = new Set(
			[
				"due",
				this.plugin.settings.calendarDateProp,
				this.plugin.settings.ganttStartProp,
				this.plugin.settings.ganttEndProp,
			].filter(Boolean)
		);
		// Only offer the date picker when it can round-trip WITHOUT loss: a bare YYYY-MM-DD
		// value, or an empty known-date field.
		const prevStr = toStr(previous).trim();
		const isBareDate = /^\d{4}-\d{2}-\d{2}$/.test(prevStr) && toIsoDateKey(prevStr) !== null;
		const useDate = isBareDate || (prevStr === "" && dateProps.has(field));
		const input = line.createEl("input", { cls: "bpp-inline-edit", type: useDate ? "date" : "text" });
		input.value = useDate ? prevStr : formatFieldForEdit(previous);
		input.focus();
		// A date input rejects select(); only a text field has a caret range to select.
		if (input.type === "text") input.select();
		// Hold background re-renders so a vault change elsewhere can't destroy this input
		// mid-edit (its blur handler would then commit a half-typed value).
		this.host.beginInteraction();

		let settled = false;
		const commit = async (): Promise<void> => {
			if (settled) return;
			settled = true;
			this.host.endInteraction();
			const { value, remove } = coerceFieldInput(field, input.value, previous);
			await writeRowProperty(this.plugin, row.id, field, value, remove, { label: `Edit "${field}"` });
			this.host.requestRender();
		};
		input.addEventListener("click", (event) => event.stopPropagation());
		input.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				void commit();
			} else if (event.key === "Escape") {
				event.preventDefault();
				settled = true;
				this.host.endInteraction();
				this.host.requestRender();
			}
		});
		input.addEventListener("blur", () => void commit());
	}

	private columnHueFor(name: string): string {
		return this.plugin.settings.kanbanColorOverrides[name] ?? String(columnHue(name));
	}

	// ---- context menus --------------------------------------------------------

	/** Open a note in the floating editor (a real editor over the board). */
	private openFloating(row: Row): void {
		const file = rowActions.fileFor(this.host.rowEnv, row);
		if (!file) return;
		new FloatingEditModal(this.plugin.app, file).open();
	}

	/** What a plain card click does — a tab (default) or the floating editor. */
	private openCardDefault(row: Row): void {
		if (this.plugin.settings.kanbanCardClickAction === "floating") this.openFloating(row);
		else rowActions.openRow(this.host.rowEnv, row);
	}

	private openCardMenu(
		anchor: MouseEvent | HTMLElement,
		row: Row,
		groupBy: string,
		columns: string[],
		columnName = "",
		laneKey: string | null = null
	): void {
		if (anchor instanceof MouseEvent) anchor.preventDefault();
		const menu = new Menu();
		const after = (): void => this.host.requestRender();

		menu.addItem((i) =>
			i.setTitle("Open in floating editor").setIcon("edit").onClick(() => this.openFloating(row))
		);
		menu.addSeparator();

		// Keyboard/touch hand-ordering: nudge the card one slot within its cell.
		if (this.reorderEnabled && columnName && this.canWrite) {
			menu.addItem((i) =>
				i.setTitle("Move up in column").setIcon("arrow-up").onClick(() => void this.moveCardWithinColumn(row, groupBy, columnName, laneKey, -1))
			);
			menu.addItem((i) =>
				i.setTitle("Move down in column").setIcon("arrow-down").onClick(() => void this.moveCardWithinColumn(row, groupBy, columnName, laneKey, 1))
			);
			menu.addSeparator();
		}

		// Kanban-only: move the card to any other column (fires Move Rules). This is also
		// the keyboard/touch move path, since HTML5 drag is dead on touch.
		const current = toStr(row.scope.get(groupBy));
		const others = columns.filter((c) => c !== current);
		if (others.length > 0 && this.canWrite) {
			for (const col of others) {
				menu.addItem((i) =>
					i.setTitle(`Move to "${col}"`).setIcon("arrow-right").onClick(() => void this.moveRowToColumn(row, groupBy, col))
				);
			}
			menu.addSeparator();
		}

		// Swimlane board: move the card to another band (keeps its column).
		const swimProp = this.swimlaneProp;
		if (swimProp && laneKey !== null && this.canWrite) {
			const otherLanes = this.lastLaneKeys.filter((l) => l !== laneKey);
			if (otherLanes.length > 0) {
				const col = toStr(row.scope.get(groupBy));
				for (const lane of otherLanes) {
					menu.addItem((i) =>
						i
							.setTitle(`Move to lane "${lane === SWIMLANE_EMPTY ? "(empty)" : lane}"`)
							.setIcon("move-vertical")
							.onClick(() => void this.moveRowToColumn(row, groupBy, col, swimProp, lane))
					);
				}
				menu.addSeparator();
			}
		}

		rowActions.addCommonRowMenuItems(this.host.rowEnv, menu, row, this.plugin.settings.kanbanCardFields, after);
		rowActions.showMenuAtAnchor(menu, anchor);
	}

	/** Nudge a card one slot up (-1) or down (+1) within its cell's hand-order — the
	 * keyboard/touch equivalent of dragging it between its neighbours. */
	private async moveCardWithinColumn(
		row: Row,
		groupBy: string,
		columnName: string,
		laneKey: string | null,
		dir: -1 | 1
	): Promise<void> {
		const laneProp = laneKey === null ? null : this.swimlaneProp || null;
		const group = groupBy || "status";
		const rankProp = this.rankProp;
		// Plan against the rendered snapshot (host-agnostic): the standalone's resolved rows
		// or the Bases-filtered entry set — never a fresh getResolvedView, which would ignore
		// a base's filters and re-fetch mid-interaction.
		const cell = this.input.rows.filter(
			(r) => toStr(r.scope.get(group)) === columnName && (laneProp === null || laneKeyOf(r, laneProp) === laneKey)
		);
		const sorted = [...cell].sort((a, b) => compareRowsByRank(a, b, rankProp));
		const idx = sorted.findIndex((r) => r.id === row.id);
		if (idx === -1) return;
		const targetIdx = idx + dir;
		if (targetIdx < 0 || targetIdx >= sorted.length) return; // already at the edge
		// Up → land before the card currently above me; down → after the one below me.
		await this.applyCardReorder(row.id, columnName, sorted[targetIdx], dir < 0, group, laneProp, laneKey);
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
		// The column-chrome actions (add/rename/WIP/collapse/reorder) need a writable group
		// key; a read-only Bases board (file.*/formula.* group-by) still gets colors below.
		if (this.canColumnChrome) {
			menu.addItem((i) => i.setTitle("Add note").setIcon("plus").onClick(() => this.addCardFlow(columnName, groupBy, anchor)));
			menu.addItem((i) => i.setTitle("Rename column…").setIcon("pencil").onClick(() => this.renameColumnValue(groupBy, columnName)));
			menu.addItem((i) =>
				i.setTitle("Set WIP limit…").setIcon("gauge").onClick(() => this.setWipLimit(columnName))
			);
			// Collapse is flat-board only (swimlanes share a header); offer it there.
			if (!this.swimlaneProp) {
				const isCollapsed = this.plugin.settings.kanbanCollapsedColumns[columnName] === true;
				menu.addItem((i) =>
					i
						.setTitle(isCollapsed ? "Expand column" : "Collapse column")
						.setIcon(isCollapsed ? "chevrons-up-down" : "chevrons-down-up")
						.onClick(() => void this.toggleColumnCollapse(columnName))
				);
			}

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
		}
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

		if (removable && this.canColumnChrome) {
			menu.addSeparator();
			menu.addItem((i) =>
				i.setTitle("Remove empty column").setIcon("trash").onClick(() => void this.removeExtraColumn(groupBy, columnName))
			);
		}
		rowActions.showMenuAtAnchor(menu, anchor);
	}

	private renameColumnValue(groupBy: string, columnName: string): void {
		new PromptModal(this.plugin.app, {
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
		// Scope the rewrite to THIS board's rows — the resolved base/filter set, the same
		// membership the column shows. Only rows whose RAW frontmatter[key] equals `from`
		// are writable (a formula/computed group-by can't be written without shadowing it).
		const boardRows = this.lastColumnRows.get(from) ?? [];
		const targets = boardRows.map((r) => r.note).filter((n) => toStr(n.frontmatter[key]) === from);
		if (boardRows.length > 0 && targets.length === 0) {
			new Notice(`"${key}" is a formula or computed field — rename the value at its source, not from the board.`);
			return;
		}
		const vaultWide = this.plugin.getNotesSnapshot().filter((n) => toStr(n.frontmatter[key]) === from).length;
		const excluded = Math.max(0, vaultWide - targets.length);
		const run = (): void => void this.doColumnRename(groupBy, key, from, to, targets);
		// A bulk frontmatter rewrite deserves a heads-up above a small threshold — and
		// always when notes outside the current board match the old value.
		if (targets.length > 5 || excluded > 0) {
			new ConfirmModal(this.plugin.app, {
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
		const collapsed = this.plugin.settings.kanbanCollapsedColumns;
		if (collapsed[from] !== undefined) {
			collapsed[to] = collapsed[from];
			delete collapsed[from];
		}
		await this.plugin.saveSettings();
		new Notice(`Renamed "${from}" → "${to}" on ${ok} note${ok === 1 ? "" : "s"}.`);
		this.host.requestRender();
	}

	// ---- bulk edit ------------------------------------------------------------

	/** Open the bulk-edit modal over the visible cards (invoked from the host toolbar). */
	openBulkEdit(): void {
		const rows = this.lastVisibleRows;
		if (rows.length === 0) {
			new Notice("No cards to edit.");
			return;
		}
		new BulkEditModal(this.plugin.app, rows.length, (prop, op, value) => void this.applyBulk(rows, prop, op, value)).open();
	}

	private async applyBulk(rows: Row[], prop: string, op: BulkOp, value: string): Promise<void> {
		// Refuse to write a computed field — a `file.*` accessor or a base formula.
		if (COMPUTED_FILE_PROPS.has(prop) || Object.prototype.hasOwnProperty.call(this.input.formulas, prop)) {
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
		this.host.requestRender();
	}

	// ---- column chrome (settings mutations) -----------------------------------
	// These change only presentation maps (order/color/collapse/WIP/extra columns), never
	// a note, so they save with `invalidateResolved:false` and re-render via the host.

	async addExtraColumn(groupBy: string, name: string): Promise<void> {
		const map = this.plugin.settings.kanbanExtraColumns;
		const existing = map[groupBy] ?? [];
		if (!existing.some((n) => n.toLocaleLowerCase() === name.toLocaleLowerCase())) {
			map[groupBy] = [...existing, name];
			await this.plugin.saveSettings({ invalidateResolved: false });
		}
		this.host.requestRender();
	}

	async removeExtraColumn(groupBy: string, name: string): Promise<void> {
		const map = this.plugin.settings.kanbanExtraColumns;
		const next = (map[groupBy] ?? []).filter((n) => n !== name);
		if (next.length > 0) map[groupBy] = next;
		else delete map[groupBy];
		await this.plugin.saveSettings({ invalidateResolved: false });
		this.host.requestRender();
	}

	/**
	 * Apply a predefined column set: set the group-by, the column order, per-column
	 * colors, the visible (droppable) columns, and the done value — all in one write.
	 */
	async applyColumnSet(set: ColumnSet): Promise<void> {
		const s = this.plugin.settings;
		const group = set.groupBy.trim() || "status";
		const names = set.columns.map((c) => c.name.trim()).filter(Boolean);
		s.kanbanGroupBy = group;
		s.kanbanColumnOrder[group] = names;
		s.kanbanExtraColumns[group] = names; // every column shows even when empty
		for (const col of set.columns) {
			const name = col.name.trim();
			if (!name) continue;
			// A set column with a hue writes an override; "Auto color" (blank) CLEARS any
			// stale manual override so the column returns to its declared auto appearance.
			if (col.hue.trim()) s.kanbanColorOverrides[name] = col.hue.trim();
			else delete s.kanbanColorOverrides[name];
		}
		const done = set.columns.find((c) => c.done && c.name.trim());
		if (done) s.kanbanDoneValue = done.name.trim();
		await this.plugin.saveSettings({ invalidateResolved: false });
		this.host.requestRender();
		new Notice(`Applied column set "${set.name}".`);
	}

	/** Collapse or expand a column (persisted per column value, like WIP limits). */
	async toggleColumnCollapse(columnName: string): Promise<void> {
		const map = this.plugin.settings.kanbanCollapsedColumns;
		if (map[columnName]) delete map[columnName];
		else map[columnName] = true;
		await this.plugin.saveSettings({ invalidateResolved: false });
		this.host.requestRender();
	}

	async moveColumnBy(groupBy: string, orderedNames: string[], columnName: string, delta: number): Promise<void> {
		const idx = orderedNames.indexOf(columnName);
		const to = idx + delta;
		if (idx === -1 || to < 0 || to >= orderedNames.length) return;
		const next = [...orderedNames];
		[next[idx], next[to]] = [next[to], next[idx]];
		this.plugin.settings.kanbanColumnOrder[groupBy] = next;
		await this.plugin.saveSettings({ invalidateResolved: false });
		this.host.requestRender();
	}

	/** Prompt for a column's WIP limit; a blank or non-positive entry clears it. */
	setWipLimit(columnName: string): void {
		const current = this.plugin.settings.kanbanWipLimits[columnName];
		new PromptModal(this.plugin.app, {
			title: `WIP limit for "${columnName}"`,
			value: current ? String(current) : "",
			placeholder: "e.g. 5 (blank = no limit)",
			cta: "Save",
			onSubmit: (v) => void this.applyWipLimit(columnName, sanitizeWipLimit(v)),
		}).open();
	}

	async applyWipLimit(columnName: string, limit: number | null): Promise<void> {
		const map = this.plugin.settings.kanbanWipLimits;
		if (limit === null) delete map[columnName];
		else map[columnName] = limit;
		await this.plugin.saveSettings({ invalidateResolved: false });
		this.host.requestRender();
	}

	async setColumnColor(columnName: string, hue: number | null): Promise<void> {
		const map = this.plugin.settings.kanbanColorOverrides;
		if (hue === null) delete map[columnName];
		else map[columnName] = String(hue);
		await this.plugin.saveSettings({ invalidateResolved: false });
		this.host.requestRender();
	}

	async reorderColumn(
		groupBy: string,
		orderedNames: string[],
		moved: string,
		target: string
	): Promise<void> {
		const next = reorderColumns(orderedNames, moved, target);
		this.plugin.settings.kanbanColumnOrder[groupBy] = next;
		await this.plugin.saveSettings({ invalidateResolved: false });
		this.host.requestRender();
	}

	// ---- drag / drop wiring ---------------------------------------------------

	/** The whole column is a drop target for two kinds of drag: a card (move the note to
	 * this column) and a column header (reorder columns). Told apart by the transfer type. */
	private wireColumnDrop(
		columnEl: HTMLElement,
		columnName: string,
		groupBy: string,
		rowById: Map<string, Row>,
		orderedNames: string[]
	): void {
		if (!this.canWrite) return; // read-only board — cards/columns don't accept drops
		columnEl.addEventListener("dragover", (event) => {
			const types = event.dataTransfer?.types ?? [];
			const isColumn = types.includes(DND_COLUMN);
			const isRow = types.includes(DND_ROW);
			// Ignore foreign drags (external files, selected text).
			if (!isColumn && !isRow) return;
			event.preventDefault();
			columnEl.addClass(isColumn ? "is-col-drop-target" : "is-drop-target");
			if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
		});
		columnEl.addEventListener("dragleave", (event) => {
			if (!rowActions.dragTrulyLeft(columnEl, event)) return;
			columnEl.removeClass("is-drop-target");
			columnEl.removeClass("is-col-drop-target");
		});
		columnEl.addEventListener("drop", (event) => {
			event.preventDefault();
			columnEl.removeClass("is-drop-target");
			columnEl.removeClass("is-col-drop-target");
			this.boardScroller?.stop();

			const draggedColumn = event.dataTransfer?.getData(DND_COLUMN);
			if (draggedColumn) {
				void this.reorderColumn(groupBy, orderedNames, draggedColumn, columnName);
				return;
			}

			const rowId = event.dataTransfer?.getData(DND_ROW) || event.dataTransfer?.getData("text/plain");
			if (!rowId) return;
			if (this.selected.has(rowId) && this.selected.size > 1) {
				void this.moveSelectionToColumn(groupBy, columnName, null);
				return;
			}
			const row = rowById.get(rowId);
			if (!row) return;
			void this.moveRowToColumn(row, groupBy, columnName);
		});
	}

	private makeColumnDraggable(columnEl: HTMLElement, colHead: HTMLElement, columnName: string): void {
		if (!this.canColumnChrome) return; // read-only board — no column reordering
		colHead.draggable = true;
		colHead.addEventListener("dragstart", (event) => {
			columnEl.addClass("is-col-dragging");
			event.dataTransfer?.setData(DND_COLUMN, columnName);
			if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
		});
		colHead.addEventListener("dragend", () => {
			columnEl.removeClass("is-col-dragging");
			// Mirror the card dragend: stop auto-scroll even when the drag ended without a
			// drop (released in a hot zone), else the rAF loop keeps scrolling.
			this.boardScroller?.stop();
		});
	}

	/**
	 * Move a card to a column: write the group property, then apply any premium Move Rules
	 * that fire on entering this value — all in one transaction.
	 */
	private async moveRowToColumn(
		row: Row,
		groupBy: string,
		columnName: string,
		laneProp: string | null = null,
		laneKey: string | null = null
	): Promise<void> {
		const key = groupBy || "status";
		const crossColumn = toStr(row.scope.get(key)) !== columnName;
		const crossLane = laneProp !== null && laneKeyOf(row, laneProp) !== laneKey;
		// Dropped back onto its own column AND lane: no transition, so no write and — crucially
		// — no Move Rules fire (else a "set completed = today" rule would re-stamp).
		if (!crossColumn && !crossLane) return;

		// Refuse to move onto a computed field — a `file.*` accessor or a base formula.
		if (crossColumn && this.isComputedField(this.input.formulas, key)) {
			new Notice(`"${key}" is a computed/formula field — cards grouped by it can't be moved here.`);
			return;
		}
		if (crossLane && laneProp !== null && this.isComputedField(this.input.formulas, laneProp)) {
			new Notice(`"${laneProp}" is a computed/formula field — cards can't be moved across swimlanes here.`);
			return;
		}

		// WIP enforcement: block a move that would push the target column past its limit.
		if (crossColumn && this.plugin.settings.kanbanBlockOverWip) {
			const limit = limitFor(this.plugin.settings.kanbanWipLimits, columnName);
			const targetCount = (this.lastColumnRows.get(columnName) ?? []).length;
			if (dropWouldExceed(targetCount, limit)) {
				new Notice(`"${columnName}" is at its WIP limit (${limit}). Move blocked.`);
				this.host.requestRender();
				return;
			}
		}

		const writes: PropertyWrite[] = [];
		if (crossColumn) {
			writes.push({ key, value: columnName });
			if (this.plugin.settings.isPro) {
				const matched = rulesForTransition(this.plugin.settings.automations, key, columnName);
				writes.push(...computeRuleWrites(matched, row.note.frontmatter, new Date()));
			}
		}
		if (crossLane && laneProp !== null) writes.push(laneWrite(laneProp, laneKey));
		if (writes.length === 0) return;
		const automationWrites = crossColumn ? writes.length - 1 - (crossLane ? 1 : 0) : 0;
		const ok = await writeRowProperties(this.plugin, row.id, writes, { label: `Move to "${columnName}"` });
		if (ok && automationWrites > 0) {
			new Notice(`Moved to "${columnName}" · ${automationWrites} automation write${automationWrites === 1 ? "" : "s"}.`);
		}
		this.host.requestRender();
	}

	/**
	 * Make one card a drop target for a manual reorder: the pointer's half of the card
	 * decides whether an incoming card lands before or after it, shown with an insertion
	 * line. Stops propagation so the column-level "move to column" drop doesn't also fire.
	 */
	private wireCardReorder(
		cardEl: HTMLElement,
		targetRow: Row,
		columnName: string,
		groupBy: string,
		laneKey: string | null = null
	): void {
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
			if (!rowActions.dragTrulyLeft(cardEl, event)) return;
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
			this.boardScroller?.stop();
			// A multi-selection drag moves the whole set to this column/lane — but not if
			// the drop target is itself one of the selected cards moving nowhere.
			if (this.selected.has(rowId) && this.selected.size > 1) {
				void this.moveSelectionToColumn(groupBy, columnName, laneKey);
				return;
			}
			if (rowId === targetRow.id) return; // dropped onto itself
			const before = this.isBeforeHalf(cardEl, event);
			void this.applyCardReorder(rowId, columnName, targetRow, before, groupBy, this.swimlaneOrNull(laneKey), laneKey);
		});
	}

	/** The active swimlane property when a lane key is in play, else null. */
	private swimlaneOrNull(laneKey: string | null): string | null {
		return laneKey === null ? null : this.swimlaneProp || null;
	}

	/** True when the pointer is in the top half of `el` (so a drop inserts before it). */
	private isBeforeHalf(el: HTMLElement, event: DragEvent): boolean {
		const rect = el.getBoundingClientRect();
		return event.clientY < rect.top + rect.height / 2;
	}

	/**
	 * Apply a manual reorder: write the card's new rank (and, when it moved to a new column
	 * and/or swimlane, the group/lane values plus any Move Rules), renumbering the
	 * destination cell only when the neighbouring gap can't be split. One undo entry.
	 */
	private async applyCardReorder(
		rowId: string,
		columnName: string,
		targetRow: Row | null,
		before: boolean,
		groupBy: string,
		laneProp: string | null = null,
		laneKey: string | null = null
	): Promise<void> {
		const rankProp = this.rankProp;
		const group = groupBy || "status";
		// Writing a rank number to the group (or lane) property would blow the card out of
		// every named column/lane.
		if (rankProp === group || (laneProp !== null && rankProp === laneProp)) {
			new Notice(`Manual order property ("${rankProp}") must differ from the group-by and swimlane properties — pick a separate numeric property in settings.`);
			return;
		}
		const movedRow = this.input.rows.find((r) => r.id === rowId);
		if (!movedRow) return;
		// The rank property must be a real writable frontmatter key.
		if (COMPUTED_FILE_PROPS.has(rankProp) || Object.prototype.hasOwnProperty.call(this.input.formulas, rankProp)) {
			new Notice(`"${rankProp}" is a computed/formula field — pick a plain property for the manual order.`);
			return;
		}

		const crossColumn = toStr(movedRow.scope.get(group)) !== columnName;
		const crossLane = laneProp !== null && laneKeyOf(movedRow, laneProp) !== laneKey;
		if (crossColumn && this.isComputedField(this.input.formulas, group)) {
			new Notice(`"${group}" is a computed/formula field — cards grouped by it can't be moved here.`);
			return;
		}
		if (crossLane && laneProp !== null && this.isComputedField(this.input.formulas, laneProp)) {
			new Notice(`"${laneProp}" is a computed/formula field — cards can't be moved across swimlanes here.`);
			return;
		}
		// WIP is per column (counted across all swimlanes) — only a column change can breach it.
		if (crossColumn && this.plugin.settings.kanbanBlockOverWip) {
			const limit = limitFor(this.plugin.settings.kanbanWipLimits, columnName);
			const targetCount = (this.lastColumnRows.get(columnName) ?? []).length;
			if (dropWouldExceed(targetCount, limit)) {
				new Notice(`"${columnName}" is at its WIP limit (${limit}). Move blocked.`);
				this.host.requestRender();
				return;
			}
		}

		// Plan against the destination CELL's TRUE membership (base/filter-scoped, in rank
		// order), NOT the search-filtered display. On a swimlane board the cell is
		// (column ∩ lane), so ranks stay local to one band's stack.
		const cellRows =
			laneProp !== null
				? this.input.rows.filter(
						(r) => toStr(r.scope.get(group)) === columnName && laneKeyOf(r, laneProp) === laneKey
					)
				: (this.lastColumnRows.get(columnName) ?? []);
		const sorted = [...cellRows].sort((a, b) => compareRowsByRank(a, b, rankProp));
		const items: RankItem[] = sorted.map((r) => ({ id: r.id, rank: parseRank(r.scope.get(rankProp)) }));
		const rest = items.filter((i) => i.id !== rowId);
		let insertIndex: number;
		if (targetRow === null) {
			insertIndex = rest.length; // append at the cell's end
		} else {
			const targetPos = rest.findIndex((i) => i.id === targetRow.id);
			if (targetPos === -1) {
				this.host.requestRender();
				return;
			}
			insertIndex = before ? targetPos : targetPos + 1;
		}
		const rankWrites = planReorder(items, rowId, insertIndex);
		if (rankWrites.length === 0 && !crossColumn && !crossLane) return; // already in place

		const rankById = new Map(rankWrites.map((w) => [w.id, w.rank]));
		const label = crossColumn || crossLane ? `Move to "${columnName}"` : "Reorder card";
		const batch = this.plugin.undo.beginBatch(label);

		// The moved card: its rank (if it changed) plus, for a cross-column/lane drop, the
		// group/lane writes and any Move Rules that fire on entering this column.
		const movedWrites: PropertyWrite[] = [];
		if (crossColumn) {
			movedWrites.push({ key: group, value: columnName });
			if (this.plugin.settings.isPro) {
				const matched = rulesForTransition(this.plugin.settings.automations, group, columnName);
				movedWrites.push(...computeRuleWrites(matched, movedRow.note.frontmatter, new Date()));
			}
		}
		if (crossLane && laneProp !== null) movedWrites.push(laneWrite(laneProp, laneKey));
		if (rankById.has(rowId)) movedWrites.push({ key: rankProp, value: rankById.get(rowId) });
		if (movedWrites.length > 0) await writeRowProperties(this.plugin, rowId, movedWrites, { batch });

		// Every other card touched by a renumber gets its rank only.
		for (const write of rankWrites) {
			if (write.id === rowId) continue;
			await writeRowProperties(this.plugin, write.id, [{ key: rankProp, value: write.rank }], { batch });
		}
		this.plugin.undo.commitBatch(batch);
		this.host.requestRender();
	}

	/** True when `prop` is a computed `file.*` accessor or a base formula — a field a card
	 * move must never overwrite with a literal. */
	private isComputedField(formulas: Record<string, string>, prop: string): boolean {
		return COMPUTED_FILE_PROPS.has(prop) || Object.prototype.hasOwnProperty.call(formulas, prop);
	}

	// ---- auto-scroll, touch, swimlanes, multi-select --------------------------

	/** The nearest scrollable ancestor of `el` (itself included), resolved at drag time. */
	private scrollContainerFor(el: HTMLElement): HTMLElement {
		const view = el.ownerDocument.defaultView;
		let cur: HTMLElement | null = el;
		while (cur) {
			const style = view?.getComputedStyle(cur);
			const oy = style?.overflowY ?? "";
			const ox = style?.overflowX ?? "";
			if (((oy === "auto" || oy === "scroll") && cur.scrollHeight > cur.clientHeight) ||
				((ox === "auto" || ox === "scroll") && cur.scrollWidth > cur.clientWidth)) {
				return cur;
			}
			cur = cur.parentElement;
		}
		return el;
	}

	/** Wire edge auto-scroll for mouse (HTML5) drags: feed the scroller the pointer
	 * position on dragover, stop it when the drag leaves or drops. */
	private wireBoardAutoScroll(board: HTMLElement): void {
		this.boardScroller = null;
		const ensure = (): DragScroller => {
			if (!this.boardScroller) this.boardScroller = new DragScroller(this.scrollContainerFor(board));
			return this.boardScroller;
		};
		board.addEventListener("dragover", (event) => {
			const types = event.dataTransfer?.types ?? [];
			if (!types.includes(DND_ROW) && !types.includes(DND_COLUMN)) return;
			ensure().update(event.clientX, event.clientY);
		});
		board.addEventListener("drop", () => this.boardScroller?.stop());
		board.addEventListener("dragleave", (event) => {
			if (rowActions.dragTrulyLeft(board, event)) this.boardScroller?.stop();
		});
	}

	/** Build the touch-drag layer for this render. Its drop resolves back through the same
	 * move/reorder methods the mouse path uses — no duplicated write logic. */
	private makeTouchController(board: HTMLElement, groupBy: string, swimProp: string): TouchDragController {
		return new TouchDragController({
			scrollContainer: () => this.scrollContainerFor(board),
			onBegin: () => this.host.beginInteraction(),
			onEnd: () => this.host.endInteraction(),
			onDrop: (rowId, target) => void this.handleTouchDrop(rowId, target, groupBy, swimProp),
		});
	}

	private async handleTouchDrop(
		rowId: string,
		target: TouchDropTarget,
		groupBy: string,
		swimProp: string
	): Promise<void> {
		if (this.selected.has(rowId) && this.selected.size > 1) {
			await this.moveSelectionToColumn(groupBy, target.columnName, target.laneKey);
			return;
		}
		const laneProp = target.laneKey === null ? null : swimProp || null;
		let targetRow: Row | null = null;
		if (target.beforeRowId) {
			targetRow = this.input.rows.find((r) => r.id === target.beforeRowId) ?? null;
		}
		// A precise before-card drop inserts before it; otherwise append at the cell end.
		await this.applyCardReorder(rowId, target.columnName, targetRow, true, groupBy, laneProp, target.laneKey);
	}

	/**
	 * Render the swimlane board: a shared column-header row above one horizontal band per
	 * swimlane value, each band a row of (lane × column) drop cells. Cards render through
	 * the same {@link renderCard} as the flat board.
	 */
	private renderSwimlaneBoard(
		board: HTMLElement,
		rows: Row[],
		columns: KanbanColumn[],
		columnRows: Map<string, Row[]>,
		opts: { groupBy: string; swimProp: string; extraColumns: string[]; colored: boolean; cardCtx: CardRenderCtx }
	): void {
		const { groupBy, swimProp, colored, cardCtx } = opts;
		const model = buildSwimlanes(rows, {
			groupBy,
			laneProp: swimProp,
			search: this.input.searchQuery,
			hideColumn: this.hideDoneColumn ? this.plugin.settings.kanbanDoneValue : "",
			sortBy: this.sortBy,
			rankProp: this.rankProp,
			extraColumns: opts.extraColumns,
			columnOrder: this.plugin.settings.kanbanColumnOrder[groupBy] ?? [],
		});
		this.lastLaneKeys = model.lanes.map((l) => l.key);
		const columnNames = model.columnNames;
		const rowById = new Map(rows.map((r) => [r.id, r]));

		const grid = board.createDiv({ cls: "bpp-swimlane-grid" });
		grid.setCssProps({ "--bpp-swim-cols": String(columnNames.length) });
		// Don't silently hide bands past the cap.
		if (model.truncatedLanes) {
			grid.createDiv({
				cls: "bpp-muted bpp-swimlane-truncation",
				text: `Showing the first ${model.lanes.length} swimlanes. Search or filter the board to reach the rest.`,
			});
		}

		// Shared header row: lane-label gutter, then a header per column.
		const headRow = grid.createDiv({ cls: "bpp-swimlane-headrow" });
		headRow.createDiv({ cls: "bpp-swimlane-corner" });
		const headCells = headRow.createDiv({ cls: "bpp-swimlane-cells" });
		for (const name of columnNames) {
			const trueCount = (columnRows.get(name) ?? []).length;
			const wipLimit = limitFor(this.plugin.settings.kanbanWipLimits, name);
			const overWip = isOverWip(trueCount, wipLimit);
			const head = headCells.createDiv({ cls: "bpp-swimlane-colhead" });
			if (colored) head.setCssProps({ "--bpp-col-hue": this.columnHueFor(name) });
			if (overWip) head.addClass("is-over-wip");
			const swimName = head.createSpan({ cls: "bpp-swimlane-colname", text: name });
			// Inline rename: double-click the shared column header (same as the flat board).
			swimName.addEventListener("dblclick", (evt) => {
				evt.stopPropagation();
				this.beginColumnRename(swimName, name, groupBy);
			});
			const count = head.createSpan({ cls: "bpp-count", text: formatWipCount(trueCount, wipLimit) });
			if (wipLimit !== null) count.addClass("has-wip");
			head.addEventListener("contextmenu", (evt) => this.openColumnMenu(evt, name, groupBy, false, columnNames));
		}

		if (model.lanes.length === 0) {
			rowActions.renderEmptyState(grid, { title: "No cards match", body: "No cards match the current filters." });
			return;
		}

		for (const lane of model.lanes) {
			const laneLabel = lane.key === SWIMLANE_EMPTY ? "(empty)" : lane.key;
			const laneRow = grid.createDiv({ cls: "bpp-swimlane-row" });
			const laneHead = laneRow.createDiv({ cls: "bpp-swimlane-lanehead" });
			laneHead.createSpan({ cls: "bpp-swimlane-lanename", text: laneLabel });
			laneHead.createSpan({ cls: "bpp-count", text: String(lane.total) });
			const cells = laneRow.createDiv({ cls: "bpp-swimlane-cells" });
			for (const column of lane.columns) {
				const cell = cells.createDiv({ cls: "bpp-swimlane-cell bpp-kanban-column" });
				cell.setAttr("data-bpp-col", column.name);
				cell.setAttr("data-bpp-lane", lane.key);
				cell.setAttr("role", "group");
				cell.setAttr(
					"aria-label",
					`${laneLabel} · ${column.name}, ${column.rows.length} card${column.rows.length === 1 ? "" : "s"}`
				);
				if (colored) cell.setCssProps({ "--bpp-col-hue": this.columnHueFor(column.name) });
				this.wireCellDrop(cell, column.name, lane.key, groupBy, rowById);
				const addBtn = cell.createEl("button", {
					cls: "bpp-column-add bpp-cell-add",
					text: "+",
					attr: { "aria-label": `Add note to ${column.name}, lane ${laneLabel}` },
				});
				if (!this.canWrite) addBtn.hide(); // read-only board can't add cards
				addBtn.addEventListener("click", (e) => this.addCardFlow(column.name, groupBy, e, { swimProp, laneKey: lane.key }));
				const cellCtx: CardRenderCtx = { ...cardCtx, laneKey: lane.key };
				for (const row of column.rows) this.renderCard(cell, row, column.name, cellCtx);
			}
		}
	}

	/** A swimlane cell is a drop target: a card dropped on empty cell space moves to this
	 * (column, lane), no rank change. A drop onto a card is handled by that card's reorder. */
	private wireCellDrop(
		cellEl: HTMLElement,
		columnName: string,
		laneKey: string,
		groupBy: string,
		rowById: Map<string, Row>
	): void {
		cellEl.addEventListener("dragover", (event) => {
			if (!(event.dataTransfer?.types ?? []).includes(DND_ROW)) return;
			event.preventDefault();
			cellEl.addClass("is-drop-target");
			if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
		});
		cellEl.addEventListener("dragleave", (event) => {
			if (rowActions.dragTrulyLeft(cellEl, event)) cellEl.removeClass("is-drop-target");
		});
		cellEl.addEventListener("drop", (event) => {
			event.preventDefault();
			cellEl.removeClass("is-drop-target");
			this.boardScroller?.stop();
			const rowId = event.dataTransfer?.getData(DND_ROW) || event.dataTransfer?.getData("text/plain");
			if (!rowId) return;
			if (this.selected.has(rowId) && this.selected.size > 1) {
				void this.moveSelectionToColumn(groupBy, columnName, laneKey);
				return;
			}
			const row = rowById.get(rowId);
			if (!row) return;
			void this.moveRowToColumn(row, groupBy, columnName, this.swimlaneProp || null, laneKey);
		});
	}

	/** Toggle a card's membership in the multi-select set (modifier-click). */
	private toggleSelect(rowId: string): void {
		if (this.selected.has(rowId)) this.selected.delete(rowId);
		else this.selected.add(rowId);
		this.host.requestRender();
	}

	private clearSelection(): void {
		if (this.selected.size === 0) return;
		this.selected.clear();
		this.host.requestRender();
	}

	/** The bulk action bar shown while cards are multi-selected. */
	private renderSelectionBar(container: HTMLElement, groupBy: string, columnNames: string[]): void {
		if (!this.canMultiSelect || this.selected.size === 0) return;
		const bar = container.createDiv({ cls: "bpp-selection-bar" });
		bar.createSpan({
			cls: "bpp-selection-count",
			text: `${this.selected.size} card${this.selected.size === 1 ? "" : "s"} selected`,
		});
		const moveBtn = bar.createEl("button", { cls: "bpp-lite-btn", text: "Move to column ▾" });
		moveBtn.addEventListener("click", (evt) => {
			const menu = new Menu();
			for (const name of columnNames) {
				menu.addItem((i) => i.setTitle(name).setIcon("arrow-right").onClick(() => void this.moveSelectionToColumn(groupBy, name, null)));
			}
			menu.showAtMouseEvent(evt);
		});
		const clearBtn = bar.createEl("button", { cls: "bpp-lite-btn", text: "Clear" });
		clearBtn.addEventListener("click", () => this.clearSelection());
	}

	/**
	 * Move every selected card to `columnName` (and, on a swimlane drop, `laneKey`) in one
	 * undo batch. Positions aren't set — only the column/lane (with Move Rules) change.
	 * WIP is enforced against the whole batch.
	 */
	private async moveSelectionToColumn(groupBy: string, columnName: string, laneKey: string | null): Promise<void> {
		const ids = [...this.selected];
		if (ids.length === 0) return;
		const group = groupBy || "status";
		const laneProp = laneKey === null ? null : this.swimlaneProp || null;
		const formulas = this.input.formulas;
		const targetRows = ids
			.map((id) => this.input.rows.find((r) => r.id === id))
			.filter((r): r is Row => r !== undefined);
		if (targetRows.length === 0) {
			this.selected.clear();
			this.host.requestRender();
			return;
		}
		const movingColumn = targetRows.filter((r) => toStr(r.scope.get(group)) !== columnName);
		if (movingColumn.length > 0 && this.isComputedField(formulas, group)) {
			new Notice(`"${group}" is a computed/formula field — cards grouped by it can't be moved here.`);
			return;
		}
		if (laneProp !== null && this.isComputedField(formulas, laneProp)) {
			new Notice(`"${laneProp}" is a computed/formula field — cards can't be moved across swimlanes here.`);
			return;
		}
		if (this.plugin.settings.kanbanBlockOverWip && movingColumn.length > 0) {
			const limit = limitFor(this.plugin.settings.kanbanWipLimits, columnName);
			if (limit !== null) {
				const targetCount = (this.lastColumnRows.get(columnName) ?? []).length;
				if (targetCount + movingColumn.length > limit) {
					new Notice(`"${columnName}" would exceed its WIP limit (${limit}). Move blocked.`);
					return;
				}
			}
		}

		const batch = this.plugin.undo.beginBatch(`Move ${targetRows.length} cards to "${columnName}"`);
		let moved = 0;
		for (const r of targetRows) {
			const crossColumn = toStr(r.scope.get(group)) !== columnName;
			const crossLane = laneProp !== null && laneKeyOf(r, laneProp) !== laneKey;
			if (!crossColumn && !crossLane) continue;
			const writes: PropertyWrite[] = [];
			if (crossColumn) {
				writes.push({ key: group, value: columnName });
				if (this.plugin.settings.isPro) {
					const matched = rulesForTransition(this.plugin.settings.automations, group, columnName);
					writes.push(...computeRuleWrites(matched, r.note.frontmatter, new Date()));
				}
			}
			if (crossLane && laneProp !== null) writes.push(laneWrite(laneProp, laneKey));
			if (writes.length > 0 && (await writeRowProperties(this.plugin, r.id, writes, { batch }))) moved++;
		}
		this.plugin.undo.commitBatch(batch);
		this.selected.clear();
		new Notice(`Moved ${moved} card${moved === 1 ? "" : "s"} to "${columnName}".`);
		this.host.requestRender();
	}

	/**
	 * Add-a-card entry point. With card templates configured it opens a picker (Blank +
	 * one item per template) at the anchor; otherwise it creates a blank card directly.
	 * `lane` seeds the swimlane property on a banded board.
	 */
	private addCardFlow(
		columnName: string,
		groupBy: string,
		anchor: MouseEvent | HTMLElement | undefined,
		lane?: { swimProp: string; laneKey: string }
	): void {
		const templates = this.plugin.settings.kanbanCardTemplates;
		if (templates.length === 0 || !anchor) {
			void this.createCard(columnName, groupBy, undefined, lane);
			return;
		}
		const menu = new Menu();
		menu.addItem((i) => i.setTitle("Blank card").setIcon("file-plus").onClick(() => void this.createCard(columnName, groupBy, undefined, lane)));
		menu.addSeparator();
		for (const t of templates) {
			menu.addItem((i) => i.setTitle(t.name).setIcon("copy-plus").onClick(() => void this.createCard(columnName, groupBy, t, lane)));
		}
		rowActions.showMenuAtAnchor(menu, anchor);
	}

	/** Create a seeded card in `columnName` (+ optional swimlane), applying a template's
	 * frontmatter defaults when one is chosen. The column's group value always wins a
	 * conflict (createSeededNote writes it last). */
	private async createCard(
		columnName: string,
		groupBy: string,
		template: CardTemplate | undefined,
		lane: { swimProp: string; laneKey: string } | undefined
	): Promise<void> {
		const title = buildQuickAddTitle(columnName);
		const extra = template ? this.templateFields(template) : undefined;
		try {
			const file = await createSeededNote(
				this.plugin,
				this.plugin.settings.kanbanQuickAddFolder,
				groupBy || "status",
				columnName,
				title,
				extra
			);
			// Seed the lane too, unless the catch-all "(empty)" band or a computed lane prop
			// (which a literal would shadow).
			if (lane && lane.laneKey !== SWIMLANE_EMPTY && lane.swimProp && !this.isComputedField(this.input.formulas, lane.swimProp)) {
				await writeRowProperty(this.plugin, file.path, lane.swimProp, lane.laneKey, false, { label: "Set swimlane" });
			}
			new Notice(`Created ${file.basename}`);
		} catch (error) {
			new Notice(`Bases Power Pack: could not create note (${String(error)}).`);
		}
		this.host.requestRender();
	}

	/** A template's fields as a frontmatter object, literal-coerced ("true"→bool, "5"→num)
	 * so a seeded default lands with the right YAML type. Blank keys are skipped. */
	private templateFields(template: CardTemplate): Record<string, unknown> {
		const out: Record<string, unknown> = {};
		for (const field of template.fields) {
			const key = field.key.trim();
			if (key) out[key] = coerceLiteral(field.value);
		}
		return out;
	}

	/** Tear down interaction machinery (auto-scroll rAF, touch ghost, hover popover) — the
	 * host calls this on close. */
	dispose(): void {
		this.boardScroller?.stop();
		this.boardScroller = null;
		this.touch?.destroy();
		this.touch = null;
		this.dismissCardHover();
	}
}

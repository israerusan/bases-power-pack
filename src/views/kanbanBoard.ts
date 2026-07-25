import type BasesPowerPackPlugin from "../main";
import type { Row } from "../model/row";
import type { PropertyWrite } from "./viewData";
import type { RowActionEnv } from "./rowActions";

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
	/** Subscribe to plugin-wide refreshes (undo-replay / license change). Returns an
	 * unsubscribe. The standalone is refreshed via `refreshViews()`; a BasesView is not,
	 * so it subscribes here. */
	registerRefresh(cb: () => void): () => void;
	readonly capabilities: BoardCapabilities;
	/** Premium Move Rules that fire when a card enters `columnValue` (standalone only). */
	runMoveAutomations?(groupBy: string, columnValue: string, frontmatter: Record<string, unknown>): PropertyWrite[];
}

/**
 * Shared Kanban board renderer. Owns the board DOM + interaction state (selection, drag,
 * touch, auto-scroll, hover) and renders from a {@link BoardInput}. Both hosts create one
 * and call `render(host.captureInput())` on every host re-render.
 *
 * P1C moves the board render + interaction here from `KanbanView`, cluster by cluster
 * (cards → selection → menus → inline edit → drag/touch last). Until a cluster lands,
 * the standalone `KanbanView` keeps its own copy — the two are swapped over only once
 * behavioral + planner-golden parity is proven (P1D).
 */
export class KanbanBoard {
	constructor(
		private readonly plugin: BasesPowerPackPlugin,
		private readonly host: BoardHost
	) {}

	/** Render the board into the host container from the given snapshot. */
	render(input: BoardInput): void {
		// P1C skeleton — the board container + `is-colored`/`is-swimlaned` chrome. The
		// column loop, cards, drag/touch, menus, inline edit, and swimlanes move here in
		// subsequent clusters and consume `input` + `this.plugin.settings`.
		const el = this.host.containerEl;
		el.empty();
		el.addClass("bpp-view");
		const board = el.createDiv({ cls: "bpp-kanban-board" });
		if (this.plugin.settings.kanbanColorColumns) board.addClass("is-colored");
		if (input.swimlaneProp) board.addClass("is-swimlaned");
	}

	/** Tear down interaction machinery (auto-scroll rAF, touch ghost, listeners) — the
	 * host calls this on close. Fleshed out as drag/touch move here in P1C. */
	dispose(): void {
		// P1C: stop boardScroller, destroy touch controller.
	}
}

import { BasesView, type BasesEntry, type QueryController } from "obsidian";
import type BasesPowerPackPlugin from "../main";
import { makeRow, type Row } from "../model/row";
import { buildRawNote } from "../views/viewData";
import {
	KanbanBoard,
	type BoardCapabilities,
	type BoardHost,
	type BoardInput,
} from "../views/kanbanBoard";
import type { RowActionEnv } from "../views/rowActions";

/** The Bases view type id — also the `.base` `type:` value + hover-link source. */
export const KANBAN_BASES_VIEW_ID = "kanban";

/**
 * A synthetic frontmatter key holding the Bases group value for a READ-ONLY group-by
 * (`file.*`/`formula.*`), so the shared {@link KanbanBoard} can bucket entries by it
 * without ever writing it back. A writable `note.*` group-by uses its real key instead.
 */
const READONLY_GROUP_KEY = "__bpp_bases_group";

/**
 * Kanban as a NATIVE Bases view — a "Kanban" option in the Bases view dropdown (Obsidian
 * ≥1.10), registered via `Plugin.registerBasesView`. It is now a THIN HOST of the shared
 * {@link KanbanBoard}: it maps the base's (filtered) entries to {@link Row}s, resolves the
 * group-by from the Bases config, and hands the board an immutable {@link BoardInput}. The
 * board owns every interaction — cards, drag/touch, inline edit, menus, multi-select — so
 * the Bases board and the standalone board can never drift.
 *
 * Writes flow through the board's `writeRowProperties`, so the Bases view gains UNDO for
 * free. A `file.*`/`formula.*` group-by yields a READ-ONLY board (capabilities gate every
 * write off); only a `note.*` group-by is writable.
 */
export class KanbanBasesView extends BasesView implements BoardHost {
	type = KANBAN_BASES_VIEW_ID;
	readonly containerEl: HTMLElement;

	private readonly board: KanbanBoard;
	private readonly unsubscribeRefresh: () => void;
	private revision = 0;
	/** While a board interaction is live (inline edit / drag), hold Bases re-renders so a
	 * background query update can't yank the focused input or the drag target. */
	private suppressRender = false;
	private renderPending = false;
	/** Coalesce a write's `requestRender()` with the base's own `onDataUpdated()` (the
	 * frontmatter write triggers a re-query) into one paint on the next frame, so a moved
	 * card doesn't flash back to its old column before the query catches up. */
	private renderScheduled = false;
	/** Set on unload so a still-queued animation frame can't paint into a torn-down view. */
	private destroyed = false;

	constructor(
		controller: QueryController,
		containerEl: HTMLElement,
		private readonly plugin: BasesPowerPackPlugin
	) {
		super(controller);
		this.containerEl = containerEl;
		this.board = new KanbanBoard(plugin, this);
		// Repaint on undo replay / license change — neither touches a note, so neither fires
		// a metadataCache event that would re-run the base query (Constraint C).
		this.unsubscribeRefresh = plugin.registerRefresh(() => this.scheduleRender());
	}

	onunload(): void {
		this.destroyed = true;
		this.unsubscribeRefresh();
		this.board.dispose();
		this.containerEl.empty();
	}

	/** The Bases engine calls this whenever the query result changes. */
	onDataUpdated(): void {
		this.scheduleRender();
	}

	// ---- BoardHost -----------------------------------------------------------

	/** The env for the shared row-action helpers. A getter so `this.app` is read at
	 * call time (always available by then), never during construction. */
	get rowEnv(): RowActionEnv {
		return { app: this.app, plugin: this.plugin };
	}

	get capabilities(): BoardCapabilities {
		// Only a writable `note.*` group-by can accept card moves / column chrome; a
		// `file.*`/`formula.*` group-by (or none) renders a read-only board.
		const writable = this.resolveGroupKey() !== null;
		return {
			canWriteGroupBy: writable,
			canMultiSelect: writable,
			canColumnChrome: writable,
			canSwimlanes: false,
		};
	}

	captureInput(): BoardInput {
		return this.buildInput();
	}

	requestRender(): void {
		this.scheduleRender();
	}

	beginInteraction(): void {
		this.suppressRender = true;
	}

	endInteraction(): void {
		this.suppressRender = false;
		if (this.renderPending) {
			this.renderPending = false;
			this.scheduleRender();
		}
	}

	/** The Bases toolbar owns filtering, so the board never search-filters here — the
	 * board's quick-search / tag-chip filter is a no-op in this host. */
	setSearch(): void {
		/* intentionally empty */
	}

	/** The board doesn't drive Bases refreshes (this view subscribes to plugin refreshes
	 * itself, in the constructor), so nothing to register. */
	registerRefresh(): () => void {
		return () => {
			/* no-op */
		};
	}

	// ---- rendering -----------------------------------------------------------

	/** Coalesce bursts (a write's requestRender + the base's onDataUpdated) into one paint
	 * on the next animation frame, and defer entirely while an interaction is live. */
	private scheduleRender(): void {
		if (this.renderScheduled || this.destroyed) return;
		this.renderScheduled = true;
		window.requestAnimationFrame(() => {
			this.renderScheduled = false;
			if (this.destroyed) return; // view was torn down before the frame fired
			if (this.suppressRender) {
				this.renderPending = true;
				return;
			}
			this.renderBoard();
		});
	}

	private renderBoard(): void {
		this.containerEl.empty();
		this.containerEl.addClass("bpp-view");
		this.board.render(this.buildInput());
	}

	/** Map the base's (filtered) entries to Rows and resolve the group-by into a
	 * {@link BoardInput}. A writable `note.*` group-by uses its real key so the board writes
	 * back to it; a read-only group-by buckets by a synthetic, never-written key. */
	private buildInput(): BoardInput {
		const writableKey = this.resolveGroupKey();
		const pid = this.groupByPid();
		const entries = this.entries();
		let groupBy: string;
		let rows: Row[];
		if (writableKey) {
			groupBy = writableKey;
			rows = entries.map((e) => makeRow(buildRawNote(this.app, e.file), {}));
		} else {
			// Read-only: bucket by the Bases-computed group value (note/file/formula), injected
			// into a shallow-copied frontmatter (buildRawNote clones, so the cache is safe).
			groupBy = READONLY_GROUP_KEY;
			rows = entries.map((e) => {
				const note = buildRawNote(this.app, e.file);
				note.frontmatter[READONLY_GROUP_KEY] = pid ? this.valueOf(e, pid) : "";
				return makeRow(note, {});
			});
		}
		return {
			revision: ++this.revision,
			rows,
			formulas: {},
			searchQuery: "",
			showControls: false,
			groupBy,
			swimlaneProp: "",
			hoverSource: KANBAN_BASES_VIEW_ID,
		};
	}

	// ---- Bases API access (guarded — the API is young) -----------------------

	/** The base's current (filtered) entry set, or [] if the API shape is unexpected. */
	private entries(): BasesEntry[] {
		try {
			const flat = this.data?.data;
			if (Array.isArray(flat)) return flat;
		} catch {
			/* fall through */
		}
		return [];
	}

	/** An entry's value for a property id, as a display string ("" when null/absent). */
	private valueOf(entry: BasesEntry, pid: string): string {
		try {
			// pid is a resolved Bases property id ("note.x"/"file.x"/"formula.x"); the cast
			// satisfies getValue's template-literal parameter type.
			const v = entry.getValue(pid as `note.${string}`);
			return v == null ? "" : v.toString();
		} catch {
			return "";
		}
	}

	/** The raw group-by property id ("note.status" / "file.name" / "formula.x"), or null
	 * when no Group by is configured. The typings don't expose it, so read the untyped
	 * config paths the reference plugins use, then getAsPropertyId. */
	private groupByPid(): string | null {
		const cfg = this.config as unknown as {
			getAsPropertyId?: (k: string) => string | null;
			groupBy?: { property?: string } | string;
		};
		const gb = cfg.groupBy;
		if (gb && typeof gb === "object" && typeof gb.property === "string") return gb.property;
		if (typeof gb === "string") return gb;
		if (typeof cfg.getAsPropertyId === "function") {
			try {
				return cfg.getAsPropertyId("groupBy");
			} catch {
				return null;
			}
		}
		return null;
	}

	/** The writable frontmatter key backing the group-by, or null (→ a read-only board).
	 * Only a `note.*` property is writable; a `file.*`/`formula.*` group stays read-only. */
	private resolveGroupKey(): string | null {
		const pid = this.groupByPid();
		if (!pid) return null;
		const match = /^note\.(.+)$/.exec(pid);
		return match ? match[1] : null;
	}
}

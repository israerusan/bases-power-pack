import {
	BasesView,
	Notice,
	type BasesEntry,
	type BasesEntryGroup,
	type QueryController,
} from "obsidian";
import { columnHue } from "../query/kanban";
import { parseRank, planReorder, type RankItem } from "../query/ranking";

/** The Bases view type id — also the `.base` `type:` value. */
export const KANBAN_BASES_VIEW_ID = "kanban";

/** Frontmatter property holding a card's manual order (matches the standalone board). */
const RANK_PROP = "rank";
const RANK_PROP_ID = `note.${RANK_PROP}`;

interface Column {
	/** The group value written back on a cross-column drop ("" = the no-value band). */
	value: string;
	name: string;
	/** Entries sorted by manual rank (unranked last), the order shown + reordered against. */
	entries: BasesEntry[];
}

/**
 * Kanban as a NATIVE Bases view — a "Kanban" option inside the Bases view dropdown
 * (Obsidian ≥1.10), registered via `Plugin.registerBasesView`. Columns come from the
 * Bases **Group by**; cards are the grouped entries. Dragging a card to another column
 * writes the group property; dragging it between two cards writes a `rank` property
 * (the same fractional-rank scheme the standalone board uses), so manual order works
 * without configuring a base Sort. Write-back needs the group-by to be a writable
 * `note.*` property — a `file.*`/`formula.*` group renders read-only.
 *
 * Deliberately minimal and defensive: every access to the young Bases API is guarded so
 * an API-shape change degrades to a flat list rather than throwing.
 */
export class KanbanBasesView extends BasesView {
	type = KANBAN_BASES_VIEW_ID;
	private readonly root: HTMLElement;

	constructor(controller: QueryController, containerEl: HTMLElement) {
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
		const board = el.createDiv({ cls: "bpp-kanban-board is-colored bpp-bases-kanban" });

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

		const writeKey = this.resolveGroupKey();
		const columns: Column[] = groups.map((group) => ({
			value: this.hasKey(group) && group.key ? group.key.toString() : "",
			name: this.hasKey(group) && group.key ? group.key.toString() : "(no value)",
			entries: [...group.entries].sort((a, b) => this.compareRank(a, b)),
		}));
		const columnOf = new Map<string, Column>();
		const entryOf = new Map<string, BasesEntry>();
		for (const col of columns) {
			for (const entry of col.entries) {
				columnOf.set(entry.file.path, col);
				entryOf.set(entry.file.path, entry);
			}
		}
		const ctx = { writeKey, columns, columnOf, entryOf };

		for (const col of columns) {
			const colEl = board.createDiv({ cls: "bpp-kanban-column" });
			colEl.setCssProps({ "--bpp-col-hue": String(columnHue(col.name)) });
			if (writeKey) this.wireColumnDrop(colEl, col, ctx);

			const head = colEl.createDiv({ cls: "bpp-kanban-column-head" });
			const label = head.createDiv({ cls: "bpp-kanban-column-label" });
			label.createSpan({ text: col.name });
			label.createSpan({ cls: "bpp-count", text: String(col.entries.length) });

			for (const entry of col.entries) this.renderCard(colEl, entry, col, ctx);
		}
	}

	private renderCard(colEl: HTMLElement, entry: BasesEntry, col: Column, ctx: DropCtx): void {
		const card = colEl.createDiv({ cls: "bpp-card" });
		card.createDiv({ cls: "bpp-card-head" }).createDiv({ cls: "bpp-card-title", text: entry.file.basename });
		if (ctx.writeKey) {
			card.draggable = true;
			card.addEventListener("dragstart", (e) => {
				card.addClass("is-dragging");
				e.dataTransfer?.setData("text/plain", entry.file.path);
				if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
			});
			card.addEventListener("dragend", () => card.removeClass("is-dragging"));
			// Precise drop target: the pointer's half of the card decides before/after.
			this.wireCardReorder(card, entry, col, ctx);
		}
		card.addEventListener("click", () => void this.app.workspace.getLeaf(false).openFile(entry.file));
	}

	/** Whole-column drop (on empty space): a cross-column move appended at the end. */
	private wireColumnDrop(colEl: HTMLElement, col: Column, ctx: DropCtx): void {
		colEl.addEventListener("dragover", (e) => {
			if (!(e.dataTransfer?.types ?? []).includes("text/plain")) return;
			e.preventDefault();
			colEl.addClass("is-drop-target");
			if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
		});
		colEl.addEventListener("dragleave", () => colEl.removeClass("is-drop-target"));
		colEl.addEventListener("drop", (e) => {
			e.preventDefault();
			colEl.removeClass("is-drop-target");
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

	/**
	 * Commit a drop: move the dragged note to `col` (writing the group property if the
	 * column changed) and set its `rank` so it lands before/after `target` (or at the
	 * end when `target` is null). Renumbers the destination column only when the gap
	 * can't be split — the same plan the standalone board uses.
	 */
	private async drop(path: string, col: Column, target: BasesEntry | null, before: boolean, ctx: DropCtx): Promise<void> {
		const moved = ctx.entryOf.get(path);
		if (!moved) return;
		const from = ctx.columnOf.get(path);
		const crossColumn = ctx.writeKey !== null && (!from || from.value !== col.value);

		// Plan the rank writes against the destination column's current order.
		const items: RankItem[] = col.entries
			.filter((e) => e.file.path !== path)
			.map((e) => ({ id: e.file.path, rank: this.rankOf(e) }));
		if (moved) items.push({ id: path, rank: this.rankOf(moved) });
		let index: number;
		if (target === null) index = col.entries.filter((e) => e.file.path !== path).length;
		else {
			const rest = col.entries.filter((e) => e.file.path !== path);
			const pos = rest.findIndex((e) => e.file.path === target.file.path);
			if (pos === -1) return;
			index = before ? pos : pos + 1;
		}
		const rankWrites = planReorder(items, path, index);
		const rankById = new Map(rankWrites.map((w) => [w.id, w.rank]));

		try {
			// The moved note: group property (if the column changed) + its new rank.
			await this.app.fileManager.processFrontMatter(moved.file, (fm: Record<string, unknown>) => {
				if (crossColumn && ctx.writeKey) {
					if (col.value === "") delete fm[ctx.writeKey];
					else fm[ctx.writeKey] = col.value;
				}
				if (rankById.has(path)) fm[RANK_PROP] = rankById.get(path);
			});
			// Any neighbours that had to be renumbered get their rank only.
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

	// ---- helpers (defensive against the young Bases API) ----------------------

	private inTopHalf(el: HTMLElement, e: DragEvent): boolean {
		const rect = el.getBoundingClientRect();
		return e.clientY < rect.top + rect.height / 2;
	}

	/** A card's manual rank, or null when it has never been hand-ordered. */
	private rankOf(entry: BasesEntry): number | null {
		try {
			const v = entry.getValue(RANK_PROP_ID);
			return v == null ? null : parseRank(v.toString());
		} catch {
			return null;
		}
	}

	/** Order two entries by rank (unranked last), ties broken by file name — the same
	 * order the standalone board shows, so a reorder plans against what's on screen. */
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
			/* fall through to the flat list */
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

	/**
	 * The writable frontmatter key backing the group-by, or null (→ a read-only board).
	 * The typings don't expose the group property, so try the untyped config paths the
	 * reference plugins read, then `getAsPropertyId`; only a `note.*` property is a
	 * writable frontmatter key (a `file.*` / `formula.*` group stays read-only).
	 */
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

interface DropCtx {
	writeKey: string | null;
	columns: Column[];
	columnOf: Map<string, Column>;
	entryOf: Map<string, BasesEntry>;
}

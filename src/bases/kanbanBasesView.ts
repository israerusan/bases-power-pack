import {
	BasesView,
	Notice,
	type BasesEntry,
	type BasesEntryGroup,
	type HoverPopover,
	type QueryController,
} from "obsidian";
import { columnHue } from "../query/kanban";

/** The Bases view type id — also the hover-link source id and the `.base` `type:`. */
export const KANBAN_BASES_VIEW_ID = "kanban";

/**
 * Kanban as a NATIVE Bases view — a "Kanban" option inside the Bases view dropdown,
 * registered via `Plugin.registerBasesView`. Columns come from the Bases **Group by**;
 * cards are the grouped entries; dragging a card to another column writes the group
 * property back to the note (only when it's a writable `note.*` property — a file/formula
 * group renders read-only).
 *
 * Deliberately minimal for a first, user-tested cut: it reuses the board CSS but not the
 * standalone view's internals, and every access to the young Bases API is guarded so an
 * API-shape change degrades gracefully instead of throwing.
 */
export class KanbanBasesView extends BasesView {
	type = KANBAN_BASES_VIEW_ID;
	/** Satisfies HoverParent so card hover can drive the core Page Preview popover. */
	hoverPopover: HoverPopover | null = null;
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
		// Bases returns a single empty-key group when no Group by is configured.
		if (groups.length === 1 && !this.hasKey(groups[0])) {
			this.empty(
				board,
				"Choose a Group by property",
				'Set a "Group by" property in the Bases toolbar (e.g. status) to build kanban columns.'
			);
			return;
		}

		const writeKey = this.resolveGroupKey();
		const byPath = new Map<string, BasesEntry>();

		for (const group of groups) {
			const value = this.hasKey(group) && group.key ? group.key.toString() : "";
			const name = value || "(no value)";
			const col = board.createDiv({ cls: "bpp-kanban-column" });
			col.setCssProps({ "--bpp-col-hue": String(columnHue(name)) });
			if (writeKey) this.wireColumnDrop(col, value, writeKey, byPath);

			const head = col.createDiv({ cls: "bpp-kanban-column-head" });
			const label = head.createDiv({ cls: "bpp-kanban-column-label" });
			label.createSpan({ text: name });
			label.createSpan({ cls: "bpp-count", text: String(group.entries.length) });

			for (const entry of group.entries) {
				byPath.set(entry.file.path, entry);
				this.renderCard(col, entry, writeKey !== null);
			}
		}
	}

	private renderCard(col: HTMLElement, entry: BasesEntry, draggable: boolean): void {
		const card = col.createDiv({ cls: "bpp-card" });
		card.createDiv({ cls: "bpp-card-head" }).createDiv({ cls: "bpp-card-title", text: entry.file.basename });
		if (draggable) {
			card.draggable = true;
			card.addEventListener("dragstart", (e) => {
				card.addClass("is-dragging");
				e.dataTransfer?.setData("text/plain", entry.file.path);
				if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
			});
			card.addEventListener("dragend", () => card.removeClass("is-dragging"));
		}
		card.addEventListener("click", () => void this.app.workspace.getLeaf(false).openFile(entry.file));
		card.addEventListener("mouseover", (event) => {
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

	private wireColumnDrop(col: HTMLElement, value: string, writeKey: string, byPath: Map<string, BasesEntry>): void {
		col.addEventListener("dragover", (e) => {
			if (!(e.dataTransfer?.types ?? []).includes("text/plain")) return;
			e.preventDefault();
			col.addClass("is-drop-target");
			if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
		});
		col.addEventListener("dragleave", () => col.removeClass("is-drop-target"));
		col.addEventListener("drop", (e) => {
			e.preventDefault();
			col.removeClass("is-drop-target");
			const path = e.dataTransfer?.getData("text/plain");
			if (!path) return;
			const entry = byPath.get(path);
			if (entry) void this.moveEntry(entry, writeKey, value);
		});
	}

	/** Write the group property back to the note. An empty target value (the "(no value)"
	 * band) clears the property rather than writing a literal. */
	private async moveEntry(entry: BasesEntry, key: string, value: string): Promise<void> {
		try {
			await this.app.fileManager.processFrontMatter(entry.file, (fm: Record<string, unknown>) => {
				if (value === "") delete fm[key];
				else fm[key] = value;
			});
		} catch (error) {
			new Notice(`Bases Power Pack: could not move the card (${String(error)}).`);
		}
	}

	// ---- helpers (defensive against the young Bases API) ----------------------

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
		// Degrade to one ungrouped "column" if grouping is unavailable.
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

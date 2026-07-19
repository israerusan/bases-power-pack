import { Menu } from "obsidian";
import type { Row } from "../model/row";
import { PowerPackView } from "./abstractView";
import { formatCardField } from "../query/kanban";
import { parseImageRef } from "../query/gallery";
import { filterRowsByText } from "../query/search";
import { renderContextControls } from "./viewChrome";

export const VIEW_TYPE_GALLERY = "bpp-gallery-view";

/**
 * Gallery view (PREMIUM). A visual grid of cards, each with a cover image (from a
 * configurable frontmatter property — a path, wikilink, markdown image, or URL),
 * the note title, and the same card-detail fields as the Kanban rendered as
 * pills. Click a card to open its note; the ⋯ / right-click menu offers the shared
 * open / edit / rename / delete actions. A quick-search narrows the grid.
 */
export class GalleryView extends PowerPackView {
	getViewType(): string {
		return VIEW_TYPE_GALLERY;
	}
	getDisplayText(): string {
		return "Power Pack: Gallery";
	}
	getIcon(): string {
		return "image";
	}

	async render(): Promise<void> {
		const token = ++this.renderToken;
		const container = this.contentEl;

		if (!this.plugin.settings.isPro) {
			container.empty();
			container.addClass("bpp-view");
			this.renderUpgradeNotice(
				container,
				"🖼️",
				"Gallery is a Premium view",
				"See your notes as a visual grid of cover images.",
				[
					"Cover image from any frontmatter property",
					"Wikilinks, markdown images, or URLs all work",
					"Title and detail fields as clean pills",
					"Open, edit, rename, and delete from every card",
				]
			);
			return;
		}

		const resolved = await this.plugin.getResolvedView();
		if (this.isStale(token)) return;

		this.captureSearchState();
		container.empty();
		container.addClass("bpp-view");

		this.renderToolbar(container);
		renderContextControls(container, this.plugin, resolved, () => void this.render());

		const rows = filterRowsByText(resolved.rows, this.searchQuery);
		if (rows.length === 0) {
			container.createDiv({
				cls: "bpp-empty",
				text: this.searchQuery ? "No notes match the current search." : "No notes to show yet.",
			});
			return;
		}

		const grid = container.createDiv({ cls: "bpp-gallery" });
		for (const row of rows) this.renderCard(grid, row);
	}

	private renderToolbar(container: HTMLElement): void {
		const toolbar = container.createDiv({ cls: "bpp-toolbar" });
		toolbar.createEl("h3", { text: "Gallery" });
		toolbar.createSpan({ cls: "bpp-muted", text: `cover: "${this.plugin.settings.galleryImageProp}"` });
		this.renderUndoButton(toolbar);
		this.renderManagedSearch(toolbar);
	}

	private renderCard(grid: HTMLElement, row: Row): void {
		const card = grid.createDiv({ cls: "bpp-gallery-card" });
		this.applyColorRule(card, row);

		const src = this.imageSrc(row);
		const media = card.createDiv({ cls: "bpp-gallery-media" });
		if (src) {
			media.createEl("img", {
				cls: "bpp-gallery-img",
				attr: { src, alt: row.name, loading: "lazy", draggable: "false" },
			});
		} else {
			// No cover: a monogram placeholder so the grid stays even instead of a
			// jagged mix of tall and short cards.
			media.addClass("is-placeholder");
			media.createSpan({ cls: "bpp-gallery-monogram", text: (row.name[0] || "•").toUpperCase() });
		}

		const body = card.createDiv({ cls: "bpp-gallery-body" });
		body.createDiv({ cls: "bpp-gallery-title", text: row.name });

		const fields = this.plugin.settings.kanbanCardFields;
		const pills = fields
			.map((field) => ({ field, value: formatCardField(row, field) }))
			.filter((f): f is { field: string; value: string } => f.value !== null);
		if (pills.length > 0) {
			const pillRow = body.createDiv({ cls: "bpp-gallery-pills" });
			for (const pill of pills) {
				pillRow.createSpan({ cls: "bpp-pill", text: pill.value, attr: { title: `${pill.field}: ${pill.value}` } });
			}
		}

		const openMenu = (anchor: MouseEvent | HTMLElement): void => this.openCardMenu(anchor, row);
		card.addEventListener("click", () => this.openRow(row));
		card.addEventListener("contextmenu", (evt) => {
			evt.preventDefault();
			openMenu(evt);
		});
		this.makeItemAccessible(card, row.name, () => this.openRow(row), (anchor) => openMenu(anchor));
		this.addOverflowButton(card, row.name, openMenu);
	}

	private openCardMenu(anchor: MouseEvent | HTMLElement, row: Row): void {
		if (anchor instanceof MouseEvent) anchor.preventDefault();
		const menu = new Menu();
		this.addCommonRowMenuItems(menu, row, this.plugin.settings.kanbanCardFields, () => void this.render());
		this.showMenuAtAnchor(menu, anchor);
	}

	/** Resolve the card's cover image to a loadable URL, or null when there's none.
	 * A vault link is resolved relative to the note; an http(s) URL is used as-is. */
	private imageSrc(row: Row): string | null {
		const ref = parseImageRef(row.scope.get(this.plugin.settings.galleryImageProp));
		if (!ref) return null;
		if (ref.kind === "url") return ref.ref;
		const file = this.app.metadataCache.getFirstLinkpathDest(ref.ref, row.id);
		return file ? this.app.vault.getResourcePath(file) : null;
	}
}

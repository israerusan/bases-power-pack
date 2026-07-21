import { Menu } from "obsidian";
import type { Row } from "../model/row";
import { PowerPackView } from "./abstractView";
import { formatCardField } from "../query/kanban";
import { buildFeed, FEED_GRANULARITIES } from "../query/feed";
import { buildCsv, buildMarkdownTable } from "../query/export";
import { filterRowsByText } from "../query/search";
import { renderContextControls, renderSelect } from "./viewChrome";

export const VIEW_TYPE_FEED = "bpp-feed-view";

/** The two epoch-timestamp accessors offered alongside frontmatter date props. */
const FILE_DATE_OPTIONS = [
	{ value: "file.mtime", label: "Modified date" },
	{ value: "file.ctime", label: "Created date" },
];

/**
 * Feed / timeline view (PREMIUM). A reverse-chronological stream of notes grouped
 * by a date — modified/created, or any frontmatter date property — bucketed by
 * day, week, or month. It's the "time as a stream" axis the Calendar (a grid) and
 * Gantt (spans) don't give you: a running activity log or reading/writing journal.
 */
export class FeedView extends PowerPackView {
	/** The rows behind the current render, captured for the export builders. */
	private lastRows: Row[] = [];

	getViewType(): string {
		return VIEW_TYPE_FEED;
	}
	getDisplayText(): string {
		return "Power Pack: Feed";
	}
	getIcon(): string {
		return "rss";
	}

	async render(): Promise<void> {
		const token = ++this.renderToken;
		const container = this.contentEl;

		if (!this.plugin.settings.isPro) {
			container.empty();
			container.addClass("bpp-view");
			this.renderUpgradeNotice(
				container,
				"🕒",
				"Feed is a Premium view",
				"See your notes as a reverse-chronological activity stream.",
				[
					"Group by modified, created, or any date property",
					"Bucket by day, week, or month",
					"A running log of what changed and when",
					"Respects your active base and saved filters",
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
		this.lastRows = rows;
		if (rows.length === 0) {
			container.createDiv({
				cls: "bpp-empty",
				text: this.searchQuery ? "No notes match the current search." : "No notes to show yet.",
			});
			return;
		}

		const model = buildFeed(rows, {
			dateProp: this.plugin.settings.feedDateProp,
			granularity: this.plugin.settings.feedGranularity,
		});

		const stream = container.createDiv({ cls: "bpp-feed" });
		for (const section of model.sections) this.renderSection(stream, section.label, section.rows);
		if (model.undated.length > 0) this.renderSection(stream, "Undated", model.undated);
	}

	private renderToolbar(container: HTMLElement): void {
		const toolbar = container.createDiv({ cls: "bpp-toolbar" });
		toolbar.createEl("h3", { text: "Feed" });

		const s = this.plugin.settings;
		const controls = toolbar.createDiv({ cls: "bpp-lite-controls" });

		// Date source: the two epoch accessors plus every frontmatter key, so an
		// activity feed (by modified date) and a due/publish timeline both work.
		const keys = this.plugin.getFrontmatterKeys().filter((k) => !k.startsWith("file."));
		const dateOptions = [
			...FILE_DATE_OPTIONS,
			...keys.map((k) => ({ value: k, label: k })),
		];
		if (!dateOptions.some((o) => o.value === s.feedDateProp)) {
			dateOptions.push({ value: s.feedDateProp, label: s.feedDateProp });
		}
		renderSelect(controls, "Date", dateOptions, s.feedDateProp, (value) => {
			s.feedDateProp = value || "file.mtime";
			this.persist();
		});

		const seg = toolbar.createDiv({ cls: "bpp-segmented" });
		for (const g of FEED_GRANULARITIES) {
			const btn = seg.createEl("button", { text: capitalize(g), cls: "bpp-seg-btn" });
			if (s.feedGranularity === g) btn.addClass("is-active");
			btn.setAttr("aria-pressed", String(s.feedGranularity === g));
			btn.addEventListener("click", () => {
				if (s.feedGranularity === g) return;
				s.feedGranularity = g;
				this.persist();
			});
		}

		this.renderUndoButton(toolbar);
		this.addExportButton(toolbar, [
			{ label: "Copy as Markdown table", build: () => buildMarkdownTable(this.lastRows, this.exportFields()) },
			{ label: "Export as CSV", premium: true, build: () => buildCsv(this.lastRows, this.exportFields()) },
		]);
		this.renderManagedSearch(toolbar);
	}

	private exportFields(): string[] {
		return ["name", this.plugin.settings.feedDateProp, ...this.plugin.settings.kanbanCardFields];
	}

	private persist(): void {
		// Toolbar choices only re-bucket already-resolved rows — keep the resolve cache.
		void this.plugin.saveSettings({ invalidateResolved: false }).then(() => this.render());
	}

	private renderSection(stream: HTMLElement, label: string, rows: Row[]): void {
		const section = stream.createDiv({ cls: "bpp-feed-section" });
		const head = section.createDiv({ cls: "bpp-feed-head" });
		head.createSpan({ cls: "bpp-feed-head-label", text: label });
		head.createSpan({ cls: "bpp-muted bpp-feed-head-count", text: `${rows.length}` });

		const list = section.createDiv({ cls: "bpp-feed-list" });
		for (const row of rows) this.renderItem(list, row);
	}

	private renderItem(list: HTMLElement, row: Row): void {
		const item = list.createDiv({ cls: "bpp-feed-item" });
		this.applyColorRule(item, row);

		const body = item.createDiv({ cls: "bpp-feed-body" });
		body.createDiv({ cls: "bpp-feed-title", text: row.name });

		const pills = this.plugin.settings.kanbanCardFields
			.map((field) => ({ field, value: formatCardField(row, field) }))
			.filter((f): f is { field: string; value: string } => f.value !== null);
		if (pills.length > 0) {
			const pillRow = body.createDiv({ cls: "bpp-feed-pills" });
			for (const pill of pills) {
				pillRow.createSpan({ cls: "bpp-pill", text: pill.value, attr: { title: `${pill.field}: ${pill.value}` } });
			}
		}

		const openMenu = (anchor: MouseEvent | HTMLElement): void => this.openItemMenu(anchor, row);
		item.addEventListener("click", () => this.openRow(row));
		item.addEventListener("contextmenu", (evt) => {
			evt.preventDefault();
			openMenu(evt);
		});
		this.makeItemAccessible(item, row.name, () => this.openRow(row), (anchor) => openMenu(anchor));
		this.addOverflowButton(item, row.name, openMenu);
	}

	private openItemMenu(anchor: MouseEvent | HTMLElement, row: Row): void {
		if (anchor instanceof MouseEvent) anchor.preventDefault();
		const menu = new Menu();
		this.addCommonRowMenuItems(menu, row, this.plugin.settings.kanbanCardFields, () => void this.render());
		this.showMenuAtAnchor(menu, anchor);
	}
}

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

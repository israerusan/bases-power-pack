import { App, PluginSettingTab, Setting, type TextComponent } from "obsidian";
import { FolderSuggest, StringSuggest } from "./views/inputSuggest";
import type BasesPowerPackPlugin from "./main";
import { VIEW_TYPE_KANBAN } from "./views/kanbanView";
import { AGGREGATIONS, type Aggregation, type Rollup } from "./query/rollup";
import { AUTOMATION_ACTION_TYPES, type AutomationActionType, type AutomationRule } from "./query/automation";
import { type ColorRule } from "./query/colorRules";
import {
	type DashboardChartType,
	type DistributionSort,
} from "./query/dashboard";
import { type PivotSort } from "./query/pivot";
import { type FeedGranularity } from "./query/feed";

const ACTION_LABELS: Record<AutomationActionType, string> = {
	set: "Set to value",
	today: "Set to today",
	now: "Set to now (with time)",
	clear: "Clear property",
	toggle: "Toggle true/false",
	copy: "Copy from property",
};
import { listBaseFiles } from "./views/viewData";

export type CalendarViewMode = "month" | "week" | "agenda";
export const CALENDAR_VIEW_MODES: CalendarViewMode[] = ["month", "week", "agenda"];

export interface SavedFilter {
	id: string;
	name: string;
	expression: string;
}

/** One column in a predefined {@link ColumnSet}. */
export interface ColumnSetColumn {
	name: string;
	/** Hue "0"-"359" (matches kanbanColorOverrides), or "" for the auto/stable hue. */
	hue: string;
	/** When applied, this column's value becomes the board's "done" value. */
	done: boolean;
}

/** A saved column layout — an ordered, colored column set applied as a fixed workflow. */
export interface ColumnSet {
	id: string;
	name: string;
	groupBy: string;
	columns: ColumnSetColumn[];
}

/** One frontmatter default seeded by a {@link CardTemplate}. */
export interface CardTemplateField {
	key: string;
	value: string;
}

/** A reusable card template — a named set of frontmatter defaults seeded into a new card
 * created from it (e.g. Bug → type: bug, priority: high). Offered on quick-add. */
export interface CardTemplate {
	id: string;
	name: string;
	fields: CardTemplateField[];
}

export interface BasesPowerPackSettings {
	/** License */
	licenseKey: string;
	isPro: boolean;
	licenseEmail: string;
	purchaseUrl: string;

	/** Kanban (lite) */
	kanbanGroupBy: string;
	/** The group value treated as "done" — drives the Kanban hide-done toggle and
	 * the Outline's per-branch progress roll-up. */
	kanbanDoneValue: string;
	kanbanCardFields: string[];
	kanbanQuickAddFolder: string;
	/** User-added empty columns, keyed by the group-by property they belong to. */
	kanbanExtraColumns: Record<string, string[]>;
	/** Explicit column order per group-by property, set by dragging column headers. */
	kanbanColumnOrder: Record<string, string[]>;
	kanbanColorColumns: boolean;
	/** Persisted board controls, keyed by group-by property — so "sort by due" and
	 * "hide done" survive a view reopen / Obsidian restart instead of resetting
	 * (they were session-only view fields before 1.11). */
	kanbanSortBy: Record<string, string>;
	kanbanHideDone: Record<string, boolean>;
	/** Per-column-value WIP (work-in-progress) limits, keyed by column value
	 * (like kanbanColorOverrides — a limit set for "Doing" applies to a "Doing"
	 * column under any group-by property). */
	kanbanWipLimits: Record<string, number>;
	/** When true, a move that would push a column past its WIP limit is blocked
	 * (rather than merely flagged). */
	kanbanBlockOverWip: boolean;
	/** Frontmatter property holding a card's manual rank, written by drag-to-reorder
	 * in the default "Manual" sort. */
	kanbanRankProp: string;
	/** A second group-by property that splits the board by a second dimension. "" = flat
	 * board. Picked from the board's Swimlanes control. */
	kanbanSwimlaneBy: string;
	/** How that second property is laid out: horizontal "lanes" (bands spanning the
	 * columns) or nested "columns" (sub-columns within each column — multi-level
	 * grouping, e.g. Status columns each split by Priority). */
	kanbanSwimlaneLayout: "lanes" | "columns";
	/** Frontmatter property holding a card's cover image (path / wikilink / markdown
	 * image / URL). "" = no covers. Shares the Gallery's image-ref parsing. */
	kanbanCardImageProp: string;
	/** Columns collapsed to a narrow strip on the flat board, keyed by column value
	 * (like kanbanWipLimits / kanbanColorOverrides). */
	kanbanCollapsedColumns: Record<string, boolean>;
	/** What a plain card click does: open the note in a tab (default), or in a
	 * floating editor over the board. The card menu always offers both. */
	kanbanCardClickAction: "tab" | "floating";
	/** Predefined column layouts (ordered columns, each with a color + a done flag)
	 * applied as a fixed workflow from the board's Column set control. */
	kanbanColumnSets: ColumnSet[];
	/** Reusable card templates: a new card can be seeded from one (frontmatter defaults),
	 * offered as a picker on quick-add when any exist. */
	kanbanCardTemplates: CardTemplate[];
	/** Card layout — a numeric frontmatter property (0..{@link kanbanCardProgressMax})
	 * rendered as a progress bar on each card. "" = no bar. */
	kanbanCardProgressProp: string;
	kanbanCardProgressMax: number;
	/** A person/assignee frontmatter property rendered as a colored initials avatar on the
	 * card head. "" = no avatar. */
	kanbanCardAvatarProp: string;
	/** A frontmatter property listing a card's dependencies (wikilinks/paths). A card with
	 * a dependency that isn't "done" shows a Blocked badge. "" = off. */
	kanbanDependsProp: string;
	/** A frontmatter property linking a card to its parent, for nested cards: a parent card
	 * shows a subtask count and an expandable list of its children. "" = off. */
	kanbanSubtasksProp: string;
	/** A completion-date property used by Analytics for throughput + cycle time. When empty
	 * or unparseable, a done card's file mtime is used as the finish time. */
	kanbanCompletedProp: string;

	/** Feed / timeline (premium) */
	feedDateProp: string;
	feedGranularity: FeedGranularity;

	/** Calendar (premium) */
	calendarDateProp: string;
	calendarViewMode: CalendarViewMode;
	calendarColorProp: string;
	calendarQuickAddFolder: string;

	/** Gantt (premium) */
	ganttStartProp: string;
	ganttEndProp: string;
	ganttProgressProp: string;
	ganttMilestoneProp: string;

	/** Hierarchy / Outline (premium) */
	hierarchyParentProp: string;
	hierarchyOrderProp: string;
	hierarchyQuickAddFolder: string;

	/** Pivot / matrix (premium) */
	pivotRowProp: string;
	pivotColProp: string;
	pivotAggregation: Aggregation;
	pivotValueExpr: string;
	/** Axis key ordering: alphabetical, or by busiest-first. */
	pivotSort: PivotSort;
	/** Shade each cell by magnitude (a heat-map over the matrix). */
	pivotHeat: boolean;

	/** Dashboard / analytics (premium) */
	dashboardGroupBy: string;
	dashboardAggregation: Aggregation;
	dashboardValueExpr: string;
	dashboardChartType: DashboardChartType;
	/** Slice ordering for the distribution chart. */
	dashboardSort: DistributionSort;
	/** Max categories charted before the tail folds into "Other" (0 = show all). */
	dashboardTopN: number;

	/** Gallery (premium) */
	galleryImageProp: string;

	/** Bases integration (premium) */
	activeBasePath: string;

	/** Saved filters (premium) */
	savedFilters: SavedFilter[];
	activeFilterId: string;

	/** Roll-ups & formulas (premium) */
	rollups: Rollup[];
	cardFormula: string;

	/** Move Rules automation (premium) */
	automations: AutomationRule[];

	/** Per-column-value color overrides (free), keyed by column value → hue (0–359). */
	kanbanColorOverrides: Record<string, string>;

	/** Rule-based color coding (premium): ordered expression→color rules applied to
	 * cards / events / bars across every view. First matching rule wins. */
	colorRules: ColorRule[];

	/** Keys of the in-view tip bars (💡) a user has dismissed, persisted so a tip that
	 * was waved away stays gone across restarts instead of re-nagging every launch. */
	dismissedHints: string[];
}

export const DEFAULT_SETTINGS: BasesPowerPackSettings = {
	licenseKey: "",
	isPro: false,
	licenseEmail: "",
	purchaseUrl: "https://buymeacoffee.com/vaultspotlight/e/560211",
	kanbanGroupBy: "status",
	kanbanDoneValue: "done",
	kanbanCardFields: ["due", "priority"],
	kanbanQuickAddFolder: "",
	kanbanExtraColumns: {},
	kanbanColumnOrder: {},
	kanbanColorColumns: true,
	kanbanSortBy: {},
	kanbanHideDone: {},
	kanbanWipLimits: {},
	kanbanBlockOverWip: false,
	kanbanRankProp: "rank",
	kanbanSwimlaneBy: "",
	kanbanSwimlaneLayout: "lanes",
	kanbanCardImageProp: "",
	kanbanCollapsedColumns: {},
	kanbanCardClickAction: "tab",
	kanbanColumnSets: [],
	kanbanCardTemplates: [],
	kanbanCardProgressProp: "",
	kanbanCardProgressMax: 100,
	kanbanCardAvatarProp: "",
	kanbanDependsProp: "",
	kanbanSubtasksProp: "",
	kanbanCompletedProp: "",
	feedDateProp: "file.mtime",
	feedGranularity: "day",
	calendarDateProp: "due",
	calendarViewMode: "month",
	calendarColorProp: "",
	calendarQuickAddFolder: "",
	ganttStartProp: "start",
	ganttEndProp: "end",
	ganttProgressProp: "progress",
	ganttMilestoneProp: "milestone",
	hierarchyParentProp: "parent",
	hierarchyOrderProp: "order",
	hierarchyQuickAddFolder: "",
	pivotRowProp: "status",
	pivotColProp: "priority",
	pivotAggregation: "count",
	pivotValueExpr: "",
	pivotSort: "label",
	pivotHeat: false,
	dashboardGroupBy: "status",
	dashboardAggregation: "count",
	dashboardValueExpr: "",
	dashboardChartType: "bar",
	dashboardSort: "value",
	dashboardTopN: 12,
	galleryImageProp: "cover",
	activeBasePath: "",
	savedFilters: [],
	activeFilterId: "",
	rollups: [],
	cardFormula: "",
	automations: [],
	kanbanColorOverrides: {},
	colorRules: [],
	dismissedHints: [],
};

export function genId(prefix: string): string {
	const c = window.crypto;
	if (c?.randomUUID) return `${prefix}-${c.randomUUID()}`;
	return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export class BasesPowerPackSettingTab extends PluginSettingTab {
	plugin: BasesPowerPackPlugin;

	constructor(app: App, plugin: BasesPowerPackPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ---- Start here ------------------------------------------------------
		// A one-time orientation callout shown to every user, above the License
		// section, so a first run has an obvious next step.
		const startHere = containerEl.createDiv({ cls: "bpp-start-here" });
		// A styled div rather than a heading element — the obsidianmd settings-tab
		// lint rule reserves real headings for Setting().setHeading().
		startHere.createDiv({ cls: "bpp-start-here-title", text: "Getting started" });
		const startSteps = startHere.createDiv({ cls: "bpp-start-here-steps" });
		startSteps.createEl("div", {
			text: "1. Open the Kanban board from the ribbon or the “Open Kanban view (Lite)” command.",
		});
		startSteps.createEl("div", {
			text: "2. Group cards by a frontmatter property (default: status).",
		});
		startSteps.createEl("div", {
			text: "3. Add e.g. “status: To Do” to a note, then drag cards between columns.",
		});
		startSteps.createEl("div", {
			text: "4. Right-click or use the ⋯ button on cards and columns for more actions; Undo reverses the last change.",
		});
		const startBtn = startHere.createEl("button", { text: "Open Kanban board", cls: "mod-cta" });
		startBtn.addEventListener("click", () => {
			void this.plugin.activateView(VIEW_TYPE_KANBAN);
		});

		// ---- License ---------------------------------------------------------
		new Setting(containerEl).setName("License").setHeading();

		new Setting(containerEl)
			.setName("License key")
			.setDesc("Enter your premium license key. Verified offline — no account or server required.")
			.addText((text) =>
				text
					.setPlaceholder("payload.signature")
					.setValue(this.plugin.settings.licenseKey)
					.onChange((value) => {
						this.plugin.settings.licenseKey = value;
						// Re-verify on each keystroke (cheap, offline) but only rebuild
						// the tab when Pro status actually flips — otherwise display()'s
						// containerEl.empty() destroys the input mid-type.
						// persistUnchanged: the key text changed, so it must be saved
						// even when the premium status didn't flip.
						void this.plugin.refreshLicense(true).then((changed) => {
							if (changed) this.display();
						});
					})
			);

		const status = containerEl.createDiv({ cls: "bpp-license-status" });
		if (this.plugin.settings.isPro) {
			status.createEl("p", {
				text: `✅ Premium active${this.plugin.settings.licenseEmail ? ` (${this.plugin.settings.licenseEmail})` : ""}.`,
			});
		} else {
			status
				.createDiv({ cls: "bpp-premium-summary" })
				.setText(
					"Premium (~$29 one-time) unlocks 7 more views — Calendar, Gantt, Outline, Pivot, Dashboard, Gallery, and Feed — plus formulas, roll-ups, saved filters, Move Rules automation, rule-based color coding, CSV export, and .base integration. Verified offline; no account required."
				);
			const cta = status.createDiv({ cls: "bpp-premium-summary-cta" });
			const link = cta.createEl("a", {
				text: "Get Bases Power Pack premium",
				href: this.plugin.settings.purchaseUrl,
			});
			link.setAttr("target", "_blank");
		}

		// Explain WHY a supplied key was rejected, rather than silently staying Lite.
		if (!this.plugin.settings.isPro && this.plugin.settings.licenseKey && this.plugin.licenseError) {
			const reason = this.plugin.licenseError;
			status.createEl("p", {
				cls: "bpp-license-error",
				text: `Key not accepted: ${typeof reason === "string" ? reason : ""}`,
			});
		}

		// (The purchase URL is an author/config concern, not a buyer setting — it's
		// hardcoded via DEFAULT_SETTINGS.purchaseUrl, matching Vault Spotlight, rather
		// than exposed as an editable field cluttering the License section.)

		// ---- Kanban (lite) ---------------------------------------------------
		new Setting(containerEl).setName("Kanban view (Lite)").setHeading();

		new Setting(containerEl)
			.setName("Group by property")
			.setDesc(
				"Frontmatter property (or, with premium, a formula) used to build kanban columns. The Outline view also reads it to decide which notes count as done."
			)
			.addText((text) =>
				this.keySuggest(text).setValue(this.plugin.settings.kanbanGroupBy).onChange((value) => {
					this.plugin.settings.kanbanGroupBy = value.trim() || "status";
					void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
				})
			);

		new Setting(containerEl)
			.setName("Done value")
			.setDesc(
				'The group value treated as "done" — used by the Kanban "Hide done" toggle and the Outline progress bars. e.g. done, Complete, Shipped.'
			)
			.addText((text) =>
				text
					.setPlaceholder("done")
					.setValue(this.plugin.settings.kanbanDoneValue)
					.onChange((value) => {
						this.plugin.settings.kanbanDoneValue = value.trim() || "done";
						void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
					})
			);

		new Setting(containerEl)
			.setName("Card detail fields")
			.setDesc(
				"Comma-separated raw properties shown on cards and editable from every view's menu, e.g. due, priority, owner, tags."
			)
			.addText((text) =>
				text.setValue(this.plugin.settings.kanbanCardFields.join(", ")).onChange((value) => {
					this.plugin.settings.kanbanCardFields = value
						.split(",")
						.map((part) => part.trim())
						.filter(Boolean);
					void this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Card image property")
			.setDesc(
				"Optional frontmatter property holding a cover image shown at the top of each kanban card — a path, [[wikilink]], markdown image, or URL. Leave blank for no covers."
			)
			.addText((text) =>
				this.keySuggest(text)
					.setPlaceholder("(none)")
					.setValue(this.plugin.settings.kanbanCardImageProp)
					.onChange((value) => {
						this.plugin.settings.kanbanCardImageProp = value.trim();
						void this.plugin.saveSettings({ invalidateResolved: false }).then(() => this.plugin.refreshViews());
					})
			);

		new Setting(containerEl)
			.setName("Card progress property")
			.setDesc(
				"Optional numeric property rendered as a progress bar on each card, measured against the max below (e.g. progress). Leave blank for no bar."
			)
			.addText((text) =>
				this.keySuggest(text)
					.setPlaceholder("(none)")
					.setValue(this.plugin.settings.kanbanCardProgressProp)
					.onChange((value) => {
						this.plugin.settings.kanbanCardProgressProp = value.trim();
						void this.plugin.saveSettings({ invalidateResolved: false }).then(() => this.plugin.refreshViews());
					})
			);

		new Setting(containerEl)
			.setName("Progress max")
			.setDesc("The value that reads as 100% — 100 for a 0–100 percent property, or 1 for a 0–1 fraction.")
			.addText((text) =>
				text
					.setPlaceholder("100")
					.setValue(String(this.plugin.settings.kanbanCardProgressMax))
					.onChange((value) => {
						const n = Number(value);
						this.plugin.settings.kanbanCardProgressMax = Number.isFinite(n) && n > 0 ? n : 100;
						void this.plugin.saveSettings({ invalidateResolved: false }).then(() => this.plugin.refreshViews());
					})
			);

		new Setting(containerEl)
			.setName("Card avatar property")
			.setDesc(
				"Optional person/assignee property rendered as a colored initials avatar on each card (e.g. owner, assignee). Leave blank for no avatar."
			)
			.addText((text) =>
				this.keySuggest(text)
					.setPlaceholder("(none)")
					.setValue(this.plugin.settings.kanbanCardAvatarProp)
					.onChange((value) => {
						this.plugin.settings.kanbanCardAvatarProp = value.trim();
						void this.plugin.saveSettings({ invalidateResolved: false }).then(() => this.plugin.refreshViews());
					})
			);

		new Setting(containerEl)
			.setName("Dependency property")
			.setDesc(
				"Optional property listing a card's dependencies as [[links]] (e.g. blockedBy, depends). A card whose dependency isn't at the \"done\" value shows a Blocked badge naming what's still blocking it. Leave blank for off."
			)
			.addText((text) =>
				this.keySuggest(text)
					.setPlaceholder("(none)")
					.setValue(this.plugin.settings.kanbanDependsProp)
					.onChange((value) => {
						this.plugin.settings.kanbanDependsProp = value.trim();
						void this.plugin.saveSettings({ invalidateResolved: false }).then(() => this.plugin.refreshViews());
					})
			);

		new Setting(containerEl)
			.setName("Subtasks (parent) property")
			.setDesc(
				"Optional property linking a card to its parent as a [[link]] (e.g. parent). A parent card then shows a subtask count and an expandable list of its child cards. Leave blank for off."
			)
			.addText((text) =>
				this.keySuggest(text)
					.setPlaceholder("(none)")
					.setValue(this.plugin.settings.kanbanSubtasksProp)
					.onChange((value) => {
						this.plugin.settings.kanbanSubtasksProp = value.trim();
						void this.plugin.saveSettings({ invalidateResolved: false }).then(() => this.plugin.refreshViews());
					})
			);

		new Setting(containerEl)
			.setName("Completed-date property")
			.setDesc(
				"Optional date property marking when a card was finished, used by the board's Analytics (throughput + cycle time). When blank, a done card's file modified-time is used instead."
			)
			.addText((text) =>
				this.keySuggest(text)
					.setPlaceholder("(uses file mtime)")
					.setValue(this.plugin.settings.kanbanCompletedProp)
					.onChange((value) => {
						this.plugin.settings.kanbanCompletedProp = value.trim();
						void this.plugin.saveSettings({ invalidateResolved: false });
					})
			);

		new Setting(containerEl)
			.setName("Quick add folder")
			.setDesc("Optional folder for the kanban + button. Leave blank to create notes at the vault root.")
			.addText((text) =>
				this.folderSuggest(text).setValue(this.plugin.settings.kanbanQuickAddFolder).onChange((value) => {
					this.plugin.settings.kanbanQuickAddFolder = value.trim();
					void this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Color columns")
			.setDesc("Tint each column and its cards with a stable color derived from the column value. Add new columns directly from the board with the “+ Add column” tile.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.kanbanColorColumns).onChange((value) => {
					this.plugin.settings.kanbanColorColumns = value;
					void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
				})
			);

		new Setting(containerEl)
			.setName("Enforce WIP limits")
			.setDesc(
				"Set a per-column work-in-progress limit by right-clicking a column header on the board. When on, a move that would push a column past its limit is blocked; when off, over-limit columns are only flagged in red."
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.kanbanBlockOverWip).onChange((value) => {
					this.plugin.settings.kanbanBlockOverWip = value;
					void this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Manual order property")
			.setDesc(
				'Numeric frontmatter property written when you hand-order cards. With the default "Manual" sort, drag a card between two others to reorder it — its position is saved here.'
			)
			.addText((text) =>
				this.keySuggest(text)
					.setPlaceholder("rank")
					.setValue(this.plugin.settings.kanbanRankProp)
					.onChange((value) => {
						this.plugin.settings.kanbanRankProp = value.trim() || "rank";
						void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
					})
			);

		new Setting(containerEl)
			.setName("Swimlane property")
			.setDesc(
				"A second property that splits the board by a second dimension — e.g. owner or project — with columns still grouped by the group-by property. Leave blank for a flat board; also switchable from the board's Swimlanes control."
			)
			.addText((text) =>
				this.keySuggest(text)
					.setPlaceholder("(none)")
					.setValue(this.plugin.settings.kanbanSwimlaneBy)
					.onChange((value) => {
						this.plugin.settings.kanbanSwimlaneBy = value.trim();
						void this.plugin.saveSettings({ invalidateResolved: false }).then(() => this.plugin.refreshViews());
					})
			);

		new Setting(containerEl)
			.setName("Second-group layout")
			.setDesc(
				"How the swimlane property is laid out: horizontal Lanes (bands across the columns), or Nested columns — sub-columns within each column, for multi-level grouping (e.g. Status columns each split by Priority). Also switchable from the board's Layout control."
			)
			.addDropdown((dd) =>
				dd
					.addOption("lanes", "Lanes (horizontal bands)")
					.addOption("columns", "Nested columns (sub-columns)")
					.setValue(this.plugin.settings.kanbanSwimlaneLayout)
					.onChange((v) => {
						this.plugin.settings.kanbanSwimlaneLayout = v === "columns" ? "columns" : "lanes";
						void this.plugin.saveSettings({ invalidateResolved: false }).then(() => this.plugin.refreshViews());
					})
			);

		new Setting(containerEl)
			.setName("Card click opens")
			.setDesc("What a plain click on a card does. The card menu always offers both, and modifier-click still multi-selects.")
			.addDropdown((dd) =>
				dd
					.addOption("tab", "Open in a tab")
					.addOption("floating", "Open in a floating editor")
					.setValue(this.plugin.settings.kanbanCardClickAction)
					.onChange((v) => {
						this.plugin.settings.kanbanCardClickAction = v === "floating" ? "floating" : "tab";
						void this.plugin.saveSettings({ invalidateResolved: false });
					})
			);

		this.renderColumnSets(containerEl);
		this.renderCardTemplates(containerEl);

		// ---- Premium ---------------------------------------------------------
		new Setting(containerEl).setName("Premium").setHeading();

		const premiumIn = (
			parent: HTMLElement,
			name: string,
			desc: string,
			render: (setting: Setting) => void
		): boolean => {
			const setting = new Setting(parent).setName(name).setDesc(desc);
			if (!this.plugin.settings.isPro) {
				setting.settingEl.addClass("bpp-setting-locked");
				setting.descEl.appendText(" (Premium)");
				return false;
			}
			render(setting);
			return true;
		};

		const premium = (name: string, desc: string, render: (setting: Setting) => void): boolean =>
			premiumIn(containerEl, name, desc, render);

		const subHeading = (name: string): void => {
			new Setting(containerEl).setName(name).setHeading();
		};

		// Each premium view's settings live inside a collapsed disclosure. Lite users
		// see a one-line description instead of a wall of locked controls; Pro users
		// get the real controls built into the <details>.
		const viewSection = (
			title: string,
			liteSummary: string,
			build: (parent: HTMLElement) => void
		): void => {
			const details = containerEl.createEl("details", { cls: "bpp-settings-section" });
			details.createEl("summary", { cls: "bpp-settings-summary", text: title });
			if (!this.plugin.settings.isPro) {
				details.createDiv({ cls: "bpp-premium-summary" }).setText(liteSummary);
			} else {
				build(details);
			}
		};

		// Active base (real Bases integration) — shared by every view.
		premium(
			"Active base",
			"Read a .base file's filters and formulas as the data source for all views. Choose “All notes” to run over the whole vault.",
			(setting) => {
				setting.addDropdown((dd) => {
					dd.addOption("", "All notes");
					for (const file of listBaseFiles(this.app)) {
						dd.addOption(file.path, file.path.replace(/\.base$/, ""));
					}
					dd.setValue(this.plugin.settings.activeBasePath);
					dd.onChange((value) => {
						this.plugin.settings.activeBasePath = value;
						void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
					});
				});
			}
		);

		viewSection(
			"Calendar",
			"Places notes on a month, week, or agenda calendar by a frontmatter date property. Premium.",
			(parent) => {
				premiumIn(
					parent,
					"Calendar date property",
					"Frontmatter date property used to place notes on the calendar.",
					(setting) => {
						setting.addText((text) =>
							this.keySuggest(text).setValue(this.plugin.settings.calendarDateProp).onChange((value) => {
								this.plugin.settings.calendarDateProp = value.trim() || "due";
								void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
							})
						);
					}
				);

				premiumIn(
					parent,
					"Calendar color property",
					"Frontmatter property whose value tints each calendar event with a stable color. Leave blank for no coloring.",
					(setting) => {
						setting.addText((text) =>
							this.keySuggest(text)
								.setPlaceholder("status")
								.setValue(this.plugin.settings.calendarColorProp)
								.onChange((value) => {
									this.plugin.settings.calendarColorProp = value.trim();
									void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
								})
						);
					}
				);

				premiumIn(
					parent,
					"Calendar quick-add folder",
					"Optional folder for notes created by clicking a day (leave blank for the vault root).",
					(setting) => {
						setting.addText((text) =>
							this.folderSuggest(text).setValue(this.plugin.settings.calendarQuickAddFolder).onChange((value) => {
								this.plugin.settings.calendarQuickAddFolder = value.trim();
								void this.plugin.saveSettings();
							})
						);
					}
				);
			}
		);

		viewSection(
			"Gantt",
			"Lays out notes as a timeline of bars with start and end dates, progress fill, and milestones. Premium.",
			(parent) => {
				premiumIn(parent, "Gantt start property", "Frontmatter date property for the start of each Gantt bar.", (setting) => {
					setting.addText((text) =>
						this.keySuggest(text).setValue(this.plugin.settings.ganttStartProp).onChange((value) => {
							this.plugin.settings.ganttStartProp = value.trim() || "start";
							void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
						})
					);
				});

				premiumIn(parent, "Gantt end property", "Frontmatter date property for the end of each Gantt bar (optional).", (setting) => {
					setting.addText((text) =>
						this.keySuggest(text).setValue(this.plugin.settings.ganttEndProp).onChange((value) => {
							this.plugin.settings.ganttEndProp = value.trim() || "end";
							void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
						})
					);
				});

				premiumIn(
					parent,
					"Gantt progress property",
					"Frontmatter number (0–100) that fills each Gantt bar to show completion.",
					(setting) => {
						setting.addText((text) =>
							this.keySuggest(text)
								.setPlaceholder("progress")
								.setValue(this.plugin.settings.ganttProgressProp)
								.onChange((value) => {
									this.plugin.settings.ganttProgressProp = value.trim();
									void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
								})
						);
					}
				);

				premiumIn(
					parent,
					"Gantt milestone property",
					"Notes where this frontmatter value is truthy render as a diamond milestone instead of a bar.",
					(setting) => {
						setting.addText((text) =>
							this.keySuggest(text)
								.setPlaceholder("milestone")
								.setValue(this.plugin.settings.ganttMilestoneProp)
								.onChange((value) => {
									this.plugin.settings.ganttMilestoneProp = value.trim();
									void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
								})
						);
					}
				);
			}
		);

		viewSection(
			"Outline",
			"Shows notes as a nested tree from a parent property, with per-branch progress roll-ups. Premium.",
			(parent) => {
				premiumIn(
					parent,
					"Outline parent property",
					"Frontmatter property holding the vault-relative path of a note's parent (builds the Outline tree).",
					(setting) => {
						setting.addText((text) =>
							this.keySuggest(text)
								.setPlaceholder("parent")
								.setValue(this.plugin.settings.hierarchyParentProp)
								.onChange((value) => {
									this.plugin.settings.hierarchyParentProp = value.trim() || "parent";
									void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
								})
						);
					}
				);

				premiumIn(
					parent,
					"Outline order property",
					"Optional numeric frontmatter property for sibling order in the Outline. Blank falls back to sorting by name.",
					(setting) => {
						setting.addText((text) =>
							this.keySuggest(text)
								.setPlaceholder("order")
								.setValue(this.plugin.settings.hierarchyOrderProp)
								.onChange((value) => {
									this.plugin.settings.hierarchyOrderProp = value.trim();
									void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
								})
						);
					}
				);

				premiumIn(
					parent,
					"Outline quick-add folder",
					"Optional folder for child notes created from the Outline (leave blank for the vault root).",
					(setting) => {
						setting.addText((text) =>
							this.folderSuggest(text).setValue(this.plugin.settings.hierarchyQuickAddFolder).onChange((value) => {
								this.plugin.settings.hierarchyQuickAddFolder = value.trim();
								void this.plugin.saveSettings();
							})
						);
					}
				);
			}
		);

		viewSection(
			"Pivot",
			"Cross-tabulates notes into a matrix of two properties with a chosen aggregation. Premium.",
			(parent) => {
				premiumIn(
					parent,
					"Pivot row property",
					"Frontmatter property (or formula) that groups the pivot table's rows.",
					(setting) => {
						setting.addText((text) =>
							this.keySuggest(text)
								.setPlaceholder("status")
								.setValue(this.plugin.settings.pivotRowProp)
								.onChange((value) => {
									this.plugin.settings.pivotRowProp = value.trim() || "status";
									void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
								})
						);
					}
				);
				premiumIn(
					parent,
					"Pivot column property",
					"Frontmatter property (or formula) that groups the pivot table's columns.",
					(setting) => {
						setting.addText((text) =>
							this.keySuggest(text)
								.setPlaceholder("priority")
								.setValue(this.plugin.settings.pivotColProp)
								.onChange((value) => {
									this.plugin.settings.pivotColProp = value.trim() || "priority";
									void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
								})
						);
					}
				);
				premiumIn(
					parent,
					"Pivot aggregation",
					"How each cell aggregates its notes. count tallies notes; the others aggregate the value expression below.",
					(setting) => {
						setting.addDropdown((dd) => {
							for (const agg of AGGREGATIONS) dd.addOption(agg, agg);
							dd.setValue(this.plugin.settings.pivotAggregation);
							dd.onChange((value) => {
								this.plugin.settings.pivotAggregation = value as Aggregation;
								void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
							});
						});
					}
				);
				premiumIn(
					parent,
					"Pivot value expression",
					'Expression aggregated in each cell for non-count aggregations, e.g. hours or done / total. Ignored for count.',
					(setting) => {
						setting.addText((text) =>
							this.keySuggest(text)
								.setPlaceholder("hours")
								.setValue(this.plugin.settings.pivotValueExpr)
								.onChange((value) => {
									this.plugin.settings.pivotValueExpr = value.trim();
									void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
								})
						);
					}
				);
			}
		);

		viewSection(
			"Dashboard",
			"Charts the distribution of notes across a property as bars, a donut, or a stacked bar. Premium.",
			(parent) => {
				premiumIn(
					parent,
					"Dashboard group-by property",
					"Frontmatter property (or formula) the distribution chart groups notes by.",
					(setting) => {
						setting.addText((text) =>
							this.keySuggest(text)
								.setPlaceholder("status")
								.setValue(this.plugin.settings.dashboardGroupBy)
								.onChange((value) => {
									this.plugin.settings.dashboardGroupBy = value.trim() || "status";
									void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
								})
						);
					}
				);
				premiumIn(
					parent,
					"Dashboard aggregation",
					"How the chart aggregates each category. count tallies notes; the others aggregate the value expression below.",
					(setting) => {
						setting.addDropdown((dd) => {
							for (const agg of AGGREGATIONS) dd.addOption(agg, agg);
							dd.setValue(this.plugin.settings.dashboardAggregation);
							dd.onChange((value) => {
								this.plugin.settings.dashboardAggregation = value as Aggregation;
								void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
							});
						});
					}
				);
				premiumIn(
					parent,
					"Dashboard value expression",
					"Expression aggregated per category for non-count aggregations, e.g. hours. Ignored for count.",
					(setting) => {
						setting.addText((text) =>
							this.keySuggest(text)
								.setPlaceholder("hours")
								.setValue(this.plugin.settings.dashboardValueExpr)
								.onChange((value) => {
									this.plugin.settings.dashboardValueExpr = value.trim();
									void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
								})
						);
					}
				);
			}
		);

		viewSection(
			"Gallery",
			"Shows notes as a grid of cards with cover images. Premium.",
			(parent) => {
				premiumIn(
					parent,
					"Gallery cover property",
					"Frontmatter property holding each card's cover image — a vault path, wikilink, markdown image, or URL.",
					(setting) => {
						setting.addText((text) =>
							this.keySuggest(text)
								.setPlaceholder("cover")
								.setValue(this.plugin.settings.galleryImageProp)
								.onChange((value) => {
									this.plugin.settings.galleryImageProp = value.trim() || "cover";
									void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
								})
						);
					}
				);
			}
		);

		viewSection(
			"Feed",
			"Groups notes into a chronological timeline by day, week, or month. Premium.",
			(parent) => {
				premiumIn(
					parent,
					"Feed date property",
					"What the timeline groups notes by — a frontmatter date property, or file.mtime / file.ctime for a modified / created activity stream.",
					(setting) => {
						setting.addText((text) =>
							this.keySuggest(text)
								.setPlaceholder("file.mtime")
								.setValue(this.plugin.settings.feedDateProp)
								.onChange((value) => {
									this.plugin.settings.feedDateProp = value.trim() || "file.mtime";
									void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
								})
						);
					}
				);
			}
		);

		subHeading("Kanban (premium)");
		premium(
			"Kanban card formula",
			"An expression shown under each kanban card, e.g. round(done / total * 100, 0) + \"%\".",
			(setting) => {
				setting.addText((text) =>
					text
						.setPlaceholder('round(done / total * 100, 0) + "%"')
						.setValue(this.plugin.settings.cardFormula)
						.onChange((value) => {
							this.plugin.settings.cardFormula = value;
							void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
						})
				);
			}
		);

		if (this.plugin.settings.isPro) {
			this.renderAutomations(containerEl);
			this.renderRollups(containerEl);
			this.renderSavedFilters(containerEl);
			this.renderColorRules(containerEl);
		}
	}

	/** Autocomplete a property-name text box from the vault's actual frontmatter keys. */
	private keySuggest(text: TextComponent): TextComponent {
		new StringSuggest(this.app, text.inputEl, () => this.plugin.getFrontmatterKeys());
		return text;
	}

	/** Autocomplete a folder text box from the vault's folders. */
	private folderSuggest(text: TextComponent): TextComponent {
		new FolderSuggest(this.app, text.inputEl);
		return text;
	}

	private renderColumnSets(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Column sets")
			.setDesc(
				"Predefined column layouts — an ordered set of columns, each with a color and an optional \"done\" marker. Apply one from the board's Column set control to set the group-by, order, colors, and done value in one step."
			)
			.setHeading();

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
		const save = (): Promise<void> => this.plugin.saveSettings({ invalidateResolved: false });
		const saveRedraw = (): void => void save().then(() => this.display());
		const sets = this.plugin.settings.kanbanColumnSets;

		sets.forEach((set) => {
			const head = new Setting(containerEl).setClass("bpp-colset-head");
			head.addText((t) =>
				t.setPlaceholder("Set name").setValue(set.name).onChange((v) => {
					set.name = v;
					void save();
				})
			);
			head.addText((t) =>
				this.keySuggest(t)
					.setPlaceholder("group-by (e.g. status)")
					.setValue(set.groupBy)
					.onChange((v) => {
						set.groupBy = v.trim();
						void save();
					})
			);
			head.addExtraButton((b) =>
				b.setIcon("plus").setTooltip("Add column").onClick(() => {
					set.columns.push({ name: "", hue: "", done: false });
					saveRedraw();
				})
			);
			head.addExtraButton((b) =>
				b.setIcon("trash").setTooltip("Delete set").onClick(() => {
					this.plugin.settings.kanbanColumnSets = sets.filter((s) => s.id !== set.id);
					saveRedraw();
				})
			);

			set.columns.forEach((col, ci) => {
				const row = new Setting(containerEl).setClass("bpp-colset-col");
				row.addText((t) =>
					t.setPlaceholder("Column value").setValue(col.name).onChange((v) => {
						col.name = v;
						void save();
					})
				);
				row.addDropdown((dd) => {
					dd.addOption("", "Auto color");
					for (const [label, hue] of swatches) dd.addOption(String(hue), label);
					dd.setValue(col.hue).onChange((v) => {
						col.hue = v;
						void save();
					});
				});
				row.addToggle((tg) =>
					tg
						.setTooltip('Mark this column as the board\'s "done" value')
						.setValue(col.done)
						.onChange((v) => {
							// At most one "done" column per set.
							if (v) set.columns.forEach((c) => (c.done = c === col));
							else col.done = false;
							saveRedraw();
						})
				);
				row.addExtraButton((b) =>
					b
						.setIcon("arrow-up")
						.setTooltip("Move up")
						.setDisabled(ci === 0)
						.onClick(() => {
							if (ci === 0) return;
							[set.columns[ci - 1], set.columns[ci]] = [set.columns[ci], set.columns[ci - 1]];
							saveRedraw();
						})
				);
				row.addExtraButton((b) =>
					b
						.setIcon("arrow-down")
						.setTooltip("Move down")
						.setDisabled(ci === set.columns.length - 1)
						.onClick(() => {
							if (ci === set.columns.length - 1) return;
							[set.columns[ci + 1], set.columns[ci]] = [set.columns[ci], set.columns[ci + 1]];
							saveRedraw();
						})
				);
				row.addExtraButton((b) =>
					b.setIcon("trash").setTooltip("Remove column").onClick(() => {
						set.columns.splice(ci, 1);
						saveRedraw();
					})
				);
			});
		});

		new Setting(containerEl).addButton((b) =>
			b
				.setButtonText("Add column set")
				.setCta()
				.onClick(() => {
					this.plugin.settings.kanbanColumnSets.push({
						id: genId("cols"),
						name: "New set",
						groupBy: "status",
						columns: [
							{ name: "To Do", hue: "", done: false },
							{ name: "Doing", hue: "215", done: false },
							{ name: "Done", hue: "130", done: true },
						],
					});
					saveRedraw();
				})
		);
	}

	private renderCardTemplates(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Card templates")
			.setDesc(
				"Reusable card templates — a named set of frontmatter defaults. When any exist, the board's + button offers a picker (Blank + each template) that seeds a new card with these fields. The card's column value always wins a conflict."
			)
			.setHeading();

		const save = (): Promise<void> => this.plugin.saveSettings({ invalidateResolved: false });
		const saveRedraw = (): void => void save().then(() => this.display());
		const templates = this.plugin.settings.kanbanCardTemplates;

		templates.forEach((tpl) => {
			const head = new Setting(containerEl).setClass("bpp-colset-head");
			head.addText((t) =>
				t.setPlaceholder("Template name").setValue(tpl.name).onChange((v) => {
					tpl.name = v;
					void save();
				})
			);
			head.addExtraButton((b) =>
				b.setIcon("plus").setTooltip("Add field").onClick(() => {
					tpl.fields.push({ key: "", value: "" });
					saveRedraw();
				})
			);
			head.addExtraButton((b) =>
				b.setIcon("trash").setTooltip("Delete template").onClick(() => {
					this.plugin.settings.kanbanCardTemplates = templates.filter((x) => x.id !== tpl.id);
					saveRedraw();
				})
			);

			tpl.fields.forEach((field, fi) => {
				const row = new Setting(containerEl).setClass("bpp-colset-col");
				row.addText((t) =>
					this.keySuggest(t)
						.setPlaceholder("property")
						.setValue(field.key)
						.onChange((v) => {
							field.key = v.trim();
							void save();
						})
				);
				row.addText((t) =>
					t.setPlaceholder("default value").setValue(field.value).onChange((v) => {
						field.value = v;
						void save();
					})
				);
				row.addExtraButton((b) =>
					b.setIcon("trash").setTooltip("Remove field").onClick(() => {
						tpl.fields.splice(fi, 1);
						saveRedraw();
					})
				);
			});
		});

		new Setting(containerEl).addButton((b) =>
			b
				.setButtonText("Add card template")
				.setCta()
				.onClick(() => {
					this.plugin.settings.kanbanCardTemplates.push({
						id: genId("tpl"),
						name: "New template",
						fields: [{ key: "type", value: "" }],
					});
					saveRedraw();
				})
		);
	}

	private renderColorRules(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Color rules")
			.setDesc(
				'Color cards, calendar events, and Gantt bars by rule. The first matching rule wins — order by priority with the arrows. Expressions use the formula engine, e.g. due < today() or priority == "high".'
			)
			.setHeading();

		const rules = this.plugin.settings.colorRules;
		rules.forEach((rule, index) => {
			const row = new Setting(containerEl);
			// A rule with no expression is persisted (so it survives a reload while being
			// authored) but does nothing yet — say so, rather than leaving a silent no-op row.
			if (!rule.expression.trim()) row.setDesc("No expression yet — this rule is inactive.");
			row.addColorPicker((cp) =>
				// The picker is hex-only; feed it a hex (a stored rgb()/hsl()/keyword color
				// is left untouched until the user actually picks a new one).
				cp.setValue(/^#[0-9a-fA-F]{6}$/.test(rule.color) ? rule.color : "#e53935").onChange((v) => {
					rule.color = v;
					void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
				})
			);
			row.addText((t) =>
				t
					.setPlaceholder("Label (optional)")
					.setValue(rule.label)
					.onChange((v) => {
						rule.label = v;
						void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
					})
			);
			row.addText((t) =>
				t
					.setPlaceholder('expression, e.g. priority == "high"')
					.setValue(rule.expression)
					.onChange((v) => {
						rule.expression = v;
						void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
					})
			);
			row.addExtraButton((b) =>
				b
					.setIcon("arrow-up")
					.setTooltip("Higher priority")
					.setDisabled(index === 0)
					.onClick(() => {
						if (index === 0) return;
						[rules[index - 1], rules[index]] = [rules[index], rules[index - 1]];
						void this.plugin.saveSettings().then(() => {
							this.plugin.refreshViews();
							this.display();
						});
					})
			);
			row.addExtraButton((b) =>
				b
					.setIcon("arrow-down")
					.setTooltip("Lower priority")
					.setDisabled(index === rules.length - 1)
					.onClick(() => {
						if (index === rules.length - 1) return;
						[rules[index + 1], rules[index]] = [rules[index], rules[index + 1]];
						void this.plugin.saveSettings().then(() => {
							this.plugin.refreshViews();
							this.display();
						});
					})
			);
			row.addExtraButton((b) =>
				b
					.setIcon("trash")
					.setTooltip("Remove rule")
					.onClick(() => {
						this.plugin.settings.colorRules = rules.filter((r) => r.id !== rule.id);
						void this.plugin.saveSettings().then(() => {
							this.plugin.refreshViews();
							this.display();
						});
					})
			);
		});

		new Setting(containerEl).addButton((b) =>
			b
				.setButtonText("Add color rule")
				.setCta()
				.onClick(() => {
					this.plugin.settings.colorRules.push({ id: genId("color"), label: "", expression: "", color: "#e53935" });
					void this.plugin.saveSettings().then(() => this.display());
				})
		);
	}

	private renderAutomations(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Move Rules")
			.setDesc(
				"When a card's trigger property enters a value (e.g. dragged into a Kanban column), run these frontmatter actions automatically."
			)
			.setHeading();

		for (const rule of this.plugin.settings.automations) {
			const box = containerEl.createDiv({ cls: "bpp-rule" });

			new Setting(box)
				.setName("When")
				.addToggle((t) =>
					t
						.setTooltip("Enable this rule")
						.setValue(rule.enabled)
						.onChange((v) => {
							rule.enabled = v;
							void this.plugin.saveSettings();
						})
				)
				.addText((t) =>
					t
						.setPlaceholder("Rule name")
						.setValue(rule.name)
						.onChange((v) => {
							rule.name = v;
							void this.plugin.saveSettings();
						})
				)
				.addText((t) =>
					t
						.setPlaceholder("trigger (status)")
						.setValue(rule.triggerProp)
						.onChange((v) => {
							rule.triggerProp = v.trim();
							void this.plugin.saveSettings();
						})
				)
				.addText((t) =>
					t
						.setPlaceholder("enters value (Done)")
						.setValue(rule.enterValue)
						.onChange((v) => {
							rule.enterValue = v;
							void this.plugin.saveSettings();
						})
				)
				.addExtraButton((b) =>
					b
						.setIcon("trash")
						.setTooltip("Remove rule")
						.onClick(() => {
							this.plugin.settings.automations = this.plugin.settings.automations.filter((r) => r.id !== rule.id);
							void this.plugin.saveSettings().then(() => this.display());
						})
				);

			for (const action of rule.actions) {
				const row = new Setting(box).setClass("bpp-rule-action");
				row.addText((t) =>
					t
						.setPlaceholder("property")
						.setValue(action.prop)
						.onChange((v) => {
							action.prop = v.trim();
							void this.plugin.saveSettings();
						})
				);
				row.addDropdown((dd) => {
					for (const type of AUTOMATION_ACTION_TYPES) dd.addOption(type, ACTION_LABELS[type]);
					dd.setValue(action.type).onChange((v) => {
						action.type = v as AutomationActionType;
						void this.plugin.saveSettings().then(() => this.display());
					});
				});
				if (action.type === "set" || action.type === "copy") {
					row.addText((t) =>
						t
							.setPlaceholder(action.type === "copy" ? "source property" : "value")
							.setValue(action.value)
							.onChange((v) => {
								action.value = v;
								void this.plugin.saveSettings();
							})
					);
				}
				row.addExtraButton((b) =>
					b
						.setIcon("x")
						.setTooltip("Remove action")
						.onClick(() => {
							rule.actions = rule.actions.filter((a) => a !== action);
							void this.plugin.saveSettings().then(() => this.display());
						})
				);
			}

			new Setting(box).addButton((b) =>
				b.setButtonText("Add action").onClick(() => {
					rule.actions.push({ prop: "", type: "set", value: "" });
					void this.plugin.saveSettings().then(() => this.display());
				})
			);
		}

		new Setting(containerEl).addButton((b) =>
			b
				.setButtonText("Add rule")
				.setCta()
				.onClick(() => {
					this.plugin.settings.automations.push({
						id: genId("rule"),
						name: "New rule",
						enabled: true,
						triggerProp: "status",
						enterValue: "Done",
						actions: [],
					});
					void this.plugin.saveSettings().then(() => this.display());
				})
		);
	}

	private renderRollups(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Roll-ups")
			.setDesc("Aggregate an expression across the rows in each view (shown as a summary bar).")
			.setHeading();

		for (const rollup of this.plugin.settings.rollups) {
			const row = new Setting(containerEl);
			row.addText((t) =>
				t
					.setPlaceholder("Label")
					.setValue(rollup.label)
					.onChange((v) => {
						rollup.label = v;
						void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
					})
			);
			row.addText((t) =>
				t
					.setPlaceholder("expression, e.g. hours")
					.setValue(rollup.expression)
					.onChange((v) => {
						rollup.expression = v;
						void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
					})
			);
			row.addDropdown((dd) => {
				for (const agg of AGGREGATIONS) dd.addOption(agg, agg);
				dd.setValue(rollup.aggregation);
				dd.onChange((v) => {
					rollup.aggregation = v as Aggregation;
					void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
				});
			});
			row.addExtraButton((b) =>
				b
					.setIcon("trash")
					.setTooltip("Remove roll-up")
					.onClick(() => {
						this.plugin.settings.rollups = this.plugin.settings.rollups.filter((r) => r.id !== rollup.id);
						void this.plugin.saveSettings().then(() => {
							this.plugin.refreshViews();
							this.display();
						});
					})
			);
		}

		new Setting(containerEl).addButton((b) =>
			b
				.setButtonText("Add roll-up")
				.setCta()
				.onClick(() => {
					this.plugin.settings.rollups.push({
						id: genId("rollup"),
						label: "Total",
						expression: "1",
						aggregation: "count",
					});
					void this.plugin.saveSettings().then(() => this.display());
				})
		);
	}

	private renderSavedFilters(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Saved filters")
			.setDesc("Named filter expressions selectable from each view's toolbar, e.g. status != \"done\" && priority > 2.")
			.setHeading();

		for (const filter of this.plugin.settings.savedFilters) {
			const row = new Setting(containerEl);
			row.addText((t) =>
				t
					.setPlaceholder("Name")
					.setValue(filter.name)
					.onChange((v) => {
						filter.name = v;
						void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
					})
			);
			row.addText((t) =>
				t
					.setPlaceholder('expression, e.g. status != "done"')
					.setValue(filter.expression)
					.onChange((v) => {
						filter.expression = v;
						void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
					})
			);
			row.addExtraButton((b) =>
				b
					.setIcon("trash")
					.setTooltip("Remove saved filter")
					.onClick(() => {
						this.plugin.settings.savedFilters = this.plugin.settings.savedFilters.filter(
							(f) => f.id !== filter.id
						);
						if (this.plugin.settings.activeFilterId === filter.id) this.plugin.settings.activeFilterId = "";
						void this.plugin.saveSettings().then(() => {
							this.plugin.refreshViews();
							this.display();
						});
					})
			);
		}

		new Setting(containerEl).addButton((b) =>
			b
				.setButtonText("Add saved filter")
				.setCta()
				.onClick(() => {
					this.plugin.settings.savedFilters.push({
						id: genId("filter"),
						name: "New filter",
						expression: "",
					});
					void this.plugin.saveSettings().then(() => this.display());
				})
		);
	}
}

import { App, PluginSettingTab, Setting } from "obsidian";
import type BasesPowerPackPlugin from "./main";
import { AGGREGATIONS, type Aggregation, type Rollup } from "./query/rollup";
import { AUTOMATION_ACTION_TYPES, type AutomationActionType, type AutomationRule } from "./query/automation";

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

export interface BasesPowerPackSettings {
	/** License */
	licenseKey: string;
	isPro: boolean;
	licenseEmail: string;
	purchaseUrl: string;

	/** Kanban (lite) */
	kanbanGroupBy: string;
	kanbanCardFields: string[];
	kanbanQuickAddFolder: string;
	/** User-added empty columns, keyed by the group-by property they belong to. */
	kanbanExtraColumns: Record<string, string[]>;
	/** Explicit column order per group-by property, set by dragging column headers. */
	kanbanColumnOrder: Record<string, string[]>;
	kanbanColorColumns: boolean;
	/** Per-column-value WIP (work-in-progress) limits, keyed by column value
	 * (like kanbanColorOverrides — a limit set for "Doing" applies to a "Doing"
	 * column under any group-by property). */
	kanbanWipLimits: Record<string, number>;
	/** When true, a move that would push a column past its WIP limit is blocked
	 * (rather than merely flagged). */
	kanbanBlockOverWip: boolean;

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
}

export const DEFAULT_SETTINGS: BasesPowerPackSettings = {
	licenseKey: "",
	isPro: false,
	licenseEmail: "",
	purchaseUrl: "https://example.gumroad.com/l/bases-power-pack",
	kanbanGroupBy: "status",
	kanbanCardFields: ["due", "priority"],
	kanbanQuickAddFolder: "",
	kanbanExtraColumns: {},
	kanbanColumnOrder: {},
	kanbanColorColumns: true,
	kanbanWipLimits: {},
	kanbanBlockOverWip: false,
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
	activeBasePath: "",
	savedFilters: [],
	activeFilterId: "",
	rollups: [],
	cardFormula: "",
	automations: [],
	kanbanColorOverrides: {},
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
			status.createEl("p", {
				text: "🔓 Lite tier active. Upgrade to unlock the calendar, Gantt, roll-ups, formulas, and saved filters.",
			});
			const link = status.createEl("a", {
				text: "Get Bases Power Pack premium",
				href: this.plugin.settings.purchaseUrl,
			});
			link.setAttr("target", "_blank");
		}

		new Setting(containerEl)
			.setName("Purchase page URL")
			.setDesc("Link shown for premium upgrades.")
			.addText((text) =>
				text
					.setPlaceholder("https://your-store.com/product")
					.setValue(this.plugin.settings.purchaseUrl)
					.onChange((value) => {
						this.plugin.settings.purchaseUrl = value.trim() || DEFAULT_SETTINGS.purchaseUrl;
						void this.plugin.saveSettings();
					})
			);

		// ---- Kanban (lite) ---------------------------------------------------
		new Setting(containerEl).setName("Kanban view (Lite)").setHeading();

		new Setting(containerEl)
			.setName("Group by property")
			.setDesc("Frontmatter property (or, with premium, a formula) used to build kanban columns.")
			.addText((text) =>
				text.setValue(this.plugin.settings.kanbanGroupBy).onChange((value) => {
					this.plugin.settings.kanbanGroupBy = value.trim() || "status";
					void this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Card detail fields")
			.setDesc("Comma-separated raw properties to show on free kanban cards, e.g. due, priority, owner, tags.")
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
			.setName("Quick add folder")
			.setDesc("Optional folder for the kanban + button. Leave blank to create notes at the vault root.")
			.addText((text) =>
				text.setValue(this.plugin.settings.kanbanQuickAddFolder).onChange((value) => {
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

		// ---- Premium ---------------------------------------------------------
		new Setting(containerEl).setName("Premium").setHeading();

		const premium = (name: string, desc: string, render: (setting: Setting) => void): boolean => {
			const setting = new Setting(containerEl).setName(name).setDesc(desc);
			if (!this.plugin.settings.isPro) {
				setting.settingEl.addClass("bpp-setting-locked");
				setting.descEl.appendText(" (Premium)");
				return false;
			}
			render(setting);
			return true;
		};

		// Active base (real Bases integration).
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

		premium(
			"Calendar date property",
			"Frontmatter date property used to place notes on the calendar.",
			(setting) => {
				setting.addText((text) =>
					text.setValue(this.plugin.settings.calendarDateProp).onChange((value) => {
						this.plugin.settings.calendarDateProp = value.trim() || "due";
						void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
					})
				);
			}
		);

		premium("Gantt start property", "Frontmatter date property for the start of each Gantt bar.", (setting) => {
			setting.addText((text) =>
				text.setValue(this.plugin.settings.ganttStartProp).onChange((value) => {
					this.plugin.settings.ganttStartProp = value.trim() || "start";
					void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
				})
			);
		});

		premium("Gantt end property", "Frontmatter date property for the end of each Gantt bar (optional).", (setting) => {
			setting.addText((text) =>
				text.setValue(this.plugin.settings.ganttEndProp).onChange((value) => {
					this.plugin.settings.ganttEndProp = value.trim() || "end";
					void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
				})
			);
		});

		premium(
			"Gantt progress property",
			"Frontmatter number (0–100) that fills each Gantt bar to show completion.",
			(setting) => {
				setting.addText((text) =>
					text
						.setPlaceholder("progress")
						.setValue(this.plugin.settings.ganttProgressProp)
						.onChange((value) => {
							this.plugin.settings.ganttProgressProp = value.trim();
							void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
						})
				);
			}
		);

		premium(
			"Gantt milestone property",
			"Notes where this frontmatter value is truthy render as a diamond milestone instead of a bar.",
			(setting) => {
				setting.addText((text) =>
					text
						.setPlaceholder("milestone")
						.setValue(this.plugin.settings.ganttMilestoneProp)
						.onChange((value) => {
							this.plugin.settings.ganttMilestoneProp = value.trim();
							void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
						})
				);
			}
		);

		premium(
			"Outline parent property",
			"Frontmatter property holding the vault-relative path of a note's parent (builds the Outline tree).",
			(setting) => {
				setting.addText((text) =>
					text
						.setPlaceholder("parent")
						.setValue(this.plugin.settings.hierarchyParentProp)
						.onChange((value) => {
							this.plugin.settings.hierarchyParentProp = value.trim() || "parent";
							void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
						})
				);
			}
		);

		premium(
			"Outline order property",
			"Optional numeric frontmatter property for sibling order in the Outline. Blank falls back to sorting by name.",
			(setting) => {
				setting.addText((text) =>
					text
						.setPlaceholder("order")
						.setValue(this.plugin.settings.hierarchyOrderProp)
						.onChange((value) => {
							this.plugin.settings.hierarchyOrderProp = value.trim();
							void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
						})
				);
			}
		);

		premium(
			"Outline quick-add folder",
			"Optional folder for child notes created from the Outline (leave blank for the vault root).",
			(setting) => {
				setting.addText((text) =>
					text.setValue(this.plugin.settings.hierarchyQuickAddFolder).onChange((value) => {
						this.plugin.settings.hierarchyQuickAddFolder = value.trim();
						void this.plugin.saveSettings();
					})
				);
			}
		);

		premium(
			"Calendar color property",
			"Frontmatter property whose value tints each calendar event with a stable color. Leave blank for no coloring.",
			(setting) => {
				setting.addText((text) =>
					text
						.setPlaceholder("status")
						.setValue(this.plugin.settings.calendarColorProp)
						.onChange((value) => {
							this.plugin.settings.calendarColorProp = value.trim();
							void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
						})
				);
			}
		);

		premium(
			"Calendar quick-add folder",
			"Optional folder for notes created by clicking a day (leave blank for the vault root).",
			(setting) => {
				setting.addText((text) =>
					text
						.setValue(this.plugin.settings.calendarQuickAddFolder)
						.onChange((value) => {
							this.plugin.settings.calendarQuickAddFolder = value.trim();
							void this.plugin.saveSettings();
						})
				);
			}
		);

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
		}
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

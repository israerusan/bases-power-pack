import { App, PluginSettingTab, Setting } from "obsidian";
import type BasesPowerPackPlugin from "./main";
import { AGGREGATIONS, type Aggregation, type Rollup } from "./query/rollup";
import { listBaseFiles } from "./views/viewData";

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

	/** Calendar (premium) */
	calendarDateProp: string;

	/** Gantt (premium) */
	ganttStartProp: string;
	ganttEndProp: string;

	/** Bases integration (premium) */
	activeBasePath: string;

	/** Saved filters (premium) */
	savedFilters: SavedFilter[];
	activeFilterId: string;

	/** Roll-ups & formulas (premium) */
	rollups: Rollup[];
	cardFormula: string;
}

export const DEFAULT_SETTINGS: BasesPowerPackSettings = {
	licenseKey: "",
	isPro: false,
	licenseEmail: "",
	purchaseUrl: "https://example.gumroad.com/l/bases-power-pack",
	kanbanGroupBy: "status",
	kanbanCardFields: ["due", "priority"],
	kanbanQuickAddFolder: "",
	calendarDateProp: "due",
	ganttStartProp: "start",
	ganttEndProp: "end",
	activeBasePath: "",
	savedFilters: [],
	activeFilterId: "",
	rollups: [],
	cardFormula: "",
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
			this.renderRollups(containerEl);
			this.renderSavedFilters(containerEl);
		}
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

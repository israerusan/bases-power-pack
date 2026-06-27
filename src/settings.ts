import { App, PluginSettingTab, Setting } from "obsidian";
import type BasesPowerPackPlugin from "./main";

export interface BasesPowerPackSettings {
	/** License */
	licenseKey: string;
	isPro: boolean;
	licenseEmail: string;
	purchaseUrl: string;

	/** Kanban (lite) */
	kanbanGroupBy: string;

	/** Calendar (premium) */
	calendarDateProp: string;
}

export const DEFAULT_SETTINGS: BasesPowerPackSettings = {
	licenseKey: "",
	isPro: false,
	licenseEmail: "",
	purchaseUrl: "https://example.gumroad.com/l/bases-power-pack",
	kanbanGroupBy: "status",
	calendarDateProp: "due",
};

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
						void this.plugin.refreshLicense().then(() => this.display());
					})
			);

		const status = containerEl.createDiv({ cls: "bpp-license-status" });
		if (this.plugin.settings.isPro) {
			status.createEl("p", {
				text: `✅ Premium active${this.plugin.settings.licenseEmail ? ` (${this.plugin.settings.licenseEmail})` : ""}.`,
			});
		} else {
			status.createEl("p", {
				text: "🔓 Lite tier active. Upgrade to unlock the calendar, Gantt, roll-ups, and saved filters.",
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
			.setDesc("Frontmatter property used to build kanban columns.")
			.addText((text) =>
				text.setValue(this.plugin.settings.kanbanGroupBy).onChange((value) => {
					this.plugin.settings.kanbanGroupBy = value.trim() || "status";
					void this.plugin.saveSettings();
				})
			);

		// ---- Calendar (premium) ---------------------------------------------
		new Setting(containerEl).setName("Premium views").setHeading();

		// Gate premium settings inline — same pattern as Vault Spotlight's
		// proSearch() helper: locked rows render a "(Premium)" hint instead of
		// a control until the license is active.
		const premium = (name: string, desc: string, render: (setting: Setting) => void) => {
			const setting = new Setting(containerEl).setName(name).setDesc(desc);
			if (!this.plugin.settings.isPro) {
				setting.settingEl.addClass("bpp-setting-locked");
				setting.descEl.appendText(" (Premium)");
				return;
			}
			render(setting);
		};

		premium(
			"Calendar date property",
			"Frontmatter date property used to place notes on the calendar.",
			(setting) =>
				setting.addText((text) =>
					text.setValue(this.plugin.settings.calendarDateProp).onChange((value) => {
						this.plugin.settings.calendarDateProp = value.trim() || "due";
						void this.plugin.saveSettings();
					})
				)
		);

		const roadmap = containerEl.createDiv();
		roadmap.createEl("p", {
			cls: "bpp-muted",
			text: "Also premium (roadmap): Gantt timeline, roll-ups & formula columns, saved filters & view presets.",
		});
	}
}

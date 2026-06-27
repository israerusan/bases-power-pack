import { App, PluginSettingTab, Setting } from "obsidian";
import type BasesPowerPackPlugin from "./main";

export interface BasesPowerPackSettings {
  /** License */
  licenseKey: string;
  licenseEndpoint: string;

  /** Kanban (lite) */
  kanbanGroupBy: string;

  /** Calendar (premium) */
  calendarDateProp: string;
}

export const DEFAULT_SETTINGS: BasesPowerPackSettings = {
  licenseKey: "",
  licenseEndpoint: "https://api.lemonsqueezy.com/v1/licenses/validate",
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

    containerEl.createEl("h2", { text: "Bases Power Pack" });

    // ---- License section -------------------------------------------------
    containerEl.createEl("h3", { text: "License" });

    const status = this.plugin.licenseManager.getStatus();
    const statusEl = containerEl.createDiv({ cls: "bpp-settings-status" });
    statusEl.setText(
      this.plugin.licenseManager.isPremium()
        ? "✅ Premium active"
        : "🔓 Lite tier (free). Enter a license key to unlock premium views."
    );
    if (status.message) {
      containerEl.createEl("p", { cls: "bpp-muted", text: status.message });
    }

    new Setting(containerEl)
      .setName("License key")
      .setDesc("Your Bases Power Pack license key. Leave blank for the free lite tier.")
      .addText((text) =>
        text
          .setPlaceholder("PREMIUM-XXXX-XXXX-XXXX")
          .setValue(this.plugin.settings.licenseKey)
          .onChange(async (value) => {
            this.plugin.settings.licenseKey = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Validation endpoint")
      .setDesc("License validation URL. Advanced — change only if self-hosting validation.")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.licenseEndpoint)
          .onChange(async (value) => {
            this.plugin.settings.licenseEndpoint = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Verify license")
      .setDesc("Re-check the license key against the validation endpoint.")
      .addButton((btn) =>
        btn
          .setButtonText("Verify now")
          .setCta()
          .onClick(async () => {
            btn.setButtonText("Checking…");
            btn.setDisabled(true);
            await this.plugin.refreshLicense();
            this.display(); // re-render to show updated status
          })
      );

    // ---- View settings ---------------------------------------------------
    containerEl.createEl("h3", { text: "Kanban view (Lite)" });
    new Setting(containerEl)
      .setName("Group by property")
      .setDesc("Frontmatter property used to build kanban columns.")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.kanbanGroupBy)
          .onChange(async (value) => {
            this.plugin.settings.kanbanGroupBy = value.trim() || "status";
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "Calendar view (Premium)" });
    new Setting(containerEl)
      .setName("Date property")
      .setDesc("Frontmatter date property used to place notes on the calendar.")
      .addText((text) =>
        text
          .setValue(this.plugin.settings.calendarDateProp)
          .onChange(async (value) => {
            this.plugin.settings.calendarDateProp = value.trim() || "due";
            await this.plugin.saveSettings();
          })
      );

    // ---- Premium roadmap -------------------------------------------------
    containerEl.createEl("h3", { text: "Premium features" });
    const list = containerEl.createEl("ul");
    [
      "Calendar view",
      "Gantt timeline view",
      "Roll-ups & formula columns",
      "Saved filters & view presets",
    ].forEach((f) => list.createEl("li", { text: f }));
  }
}

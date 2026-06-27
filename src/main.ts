import { Notice, Plugin, WorkspaceLeaf } from "obsidian";
import {
  BasesPowerPackSettings,
  BasesPowerPackSettingTab,
  DEFAULT_SETTINGS,
} from "./settings";
import { LicenseManager } from "./licenseManager";
import { KanbanView, VIEW_TYPE_KANBAN } from "./views/kanbanView";
import { CalendarView, VIEW_TYPE_CALENDAR } from "./views/calendarView";

export default class BasesPowerPackPlugin extends Plugin {
  settings!: BasesPowerPackSettings;
  licenseManager!: LicenseManager;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.licenseManager = new LicenseManager({
      endpoint: this.settings.licenseEndpoint,
      licenseKey: this.settings.licenseKey,
    });
    // Validate in the background; views read the cached result.
    this.licenseManager.validate();

    // ---- Views -----------------------------------------------------------
    // Kanban is the free "one extra view ungated" (lite tier).
    this.registerView(VIEW_TYPE_KANBAN, (leaf) => new KanbanView(leaf, this));
    // Calendar is premium; the view itself enforces the gate on render.
    this.registerView(VIEW_TYPE_CALENDAR, (leaf) => new CalendarView(leaf, this));

    this.addRibbonIcon("layout-dashboard", "Bases Power Pack: Kanban", () => {
      this.activateView(VIEW_TYPE_KANBAN);
    });

    // ---- Commands --------------------------------------------------------
    this.addCommand({
      id: "open-kanban-view",
      name: "Open Kanban view (Lite)",
      callback: () => this.activateView(VIEW_TYPE_KANBAN),
    });

    this.addCommand({
      id: "open-calendar-view",
      name: "Open Calendar view (Premium)",
      callback: () => {
        if (!this.requirePremium("Calendar view")) return;
        this.activateView(VIEW_TYPE_CALENDAR);
      },
    });

    this.addCommand({
      id: "verify-license",
      name: "Verify license key",
      callback: async () => {
        const status = await this.refreshLicense();
        new Notice(status.message ?? (status.valid ? "Premium active" : "Lite tier"));
      },
    });

    this.addSettingTab(new BasesPowerPackSettingTab(this.app, this));
  }

  onunload(): void {
    // Obsidian detaches registered views automatically on unload.
  }

  /**
   * Gate helper. Returns true if premium; otherwise shows a Notice and
   * returns false. Centralizes the "this is a paid feature" UX.
   */
  requirePremium(featureName: string): boolean {
    if (this.licenseManager.isPremium()) return true;
    new Notice(`${featureName} is a Bases Power Pack premium feature. Add a license key in settings.`);
    return false;
  }

  /** Re-validate the license using current settings and return the status. */
  async refreshLicense() {
    this.licenseManager.setConfig({
      endpoint: this.settings.licenseEndpoint,
      licenseKey: this.settings.licenseKey,
    });
    const status = await this.licenseManager.validate();
    // Refresh any open premium views so they unlock/lock immediately.
    this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR).forEach((leaf) => {
      const view = leaf.view as CalendarView;
      // Re-trigger render via the public lifecycle hook.
      void view.onOpen();
    });
    return status;
  }

  /** Reveal (or create) a leaf hosting the given view type. */
  async activateView(viewType: string): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const existing = workspace.getLeavesOfType(viewType);

    if (existing.length > 0) {
      leaf = existing[0];
    } else {
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({ type: viewType, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    if (this.licenseManager) {
      this.licenseManager.setConfig({
        endpoint: this.settings.licenseEndpoint,
        licenseKey: this.settings.licenseKey,
      });
    }
  }
}

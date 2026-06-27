import { Notice, Plugin, WorkspaceLeaf } from "obsidian";
import {
	BasesPowerPackSettings,
	BasesPowerPackSettingTab,
	DEFAULT_SETTINGS,
} from "./settings";
import { LicenseManager } from "./license/LicenseManager";
import { KanbanView, VIEW_TYPE_KANBAN } from "./views/kanbanView";
import { CalendarView, VIEW_TYPE_CALENDAR } from "./views/calendarView";

export default class BasesPowerPackPlugin extends Plugin {
	settings: BasesPowerPackSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();
		await this.refreshLicense();

		// ---- Views -----------------------------------------------------------
		// Kanban is the free "one extra view ungated" (lite tier).
		this.registerView(VIEW_TYPE_KANBAN, (leaf) => new KanbanView(leaf, this));
		// Calendar is premium; the view also enforces the gate on render.
		this.registerView(VIEW_TYPE_CALENDAR, (leaf) => new CalendarView(leaf, this));

		this.addRibbonIcon("layout-dashboard", "Bases Power Pack: Kanban", () => {
			void this.activateView(VIEW_TYPE_KANBAN);
		});

		// ---- Commands --------------------------------------------------------
		this.addCommand({
			id: "open-kanban-view",
			name: "Open Kanban view (Lite)",
			callback: () => void this.activateView(VIEW_TYPE_KANBAN),
		});

		// Premium command: hidden from the palette unless the license is active.
		this.addCommand({
			id: "open-calendar-view",
			name: "Open Calendar view (Premium)",
			checkCallback: (checking) => {
				if (!this.settings.isPro) return false;
				if (!checking) void this.activateView(VIEW_TYPE_CALENDAR);
				return true;
			},
		});

		this.addCommand({
			id: "verify-license",
			name: "Verify license key",
			callback: async () => {
				await this.refreshLicense();
				new Notice(this.settings.isPro ? "Premium active." : "Lite tier (no valid license).");
			},
		});

		this.addSettingTab(new BasesPowerPackSettingTab(this.app, this));
	}

	onunload(): void {}

	/** Reveal (or create) a leaf hosting the given view type. */
	async activateView(viewType: string): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(viewType);
		let leaf: WorkspaceLeaf | null = existing.length > 0 ? existing[0] : null;
		if (!leaf) {
			leaf = workspace.getLeaf("tab");
			await leaf.setViewState({ type: viewType, active: true });
		}
		workspace.revealLeaf(leaf);
	}

	/** Re-verify the license key (offline) and cache the result in settings. */
	async refreshLicense(): Promise<void> {
		if (!this.settings.licenseKey) {
			this.settings.isPro = false;
			this.settings.licenseEmail = "";
			await this.saveSettings();
			return;
		}
		const result = LicenseManager.verify(this.settings.licenseKey);
		this.settings.isPro = result.valid;
		this.settings.licenseEmail = result.email ?? "";
		await this.saveSettings();

		// Refresh any open premium views so they lock/unlock immediately.
		this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR).forEach((leaf) => {
			void (leaf.view as CalendarView).onOpen();
		});
	}

	async loadSettings(): Promise<void> {
		const data: unknown = await this.loadData();
		const loaded =
			data !== null && typeof data === "object" ? (data as Partial<BasesPowerPackSettings>) : {};
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}

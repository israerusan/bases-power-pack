import { Notice, Plugin, WorkspaceLeaf } from "obsidian";
import {
	BasesPowerPackSettings,
	BasesPowerPackSettingTab,
	DEFAULT_SETTINGS,
	type SavedFilter,
} from "./settings";
import { LicenseManager } from "./license/LicenseManager";
import { AGGREGATIONS, type Rollup } from "./query/rollup";
import { KanbanView, VIEW_TYPE_KANBAN } from "./views/kanbanView";
import { CalendarView, VIEW_TYPE_CALENDAR } from "./views/calendarView";
import { GanttView, VIEW_TYPE_GANTT } from "./views/ganttView";

const PREMIUM_VIEW_TYPES = [VIEW_TYPE_CALENDAR, VIEW_TYPE_GANTT];
const ALL_VIEW_TYPES = [VIEW_TYPE_KANBAN, VIEW_TYPE_CALENDAR, VIEW_TYPE_GANTT];

export default class BasesPowerPackPlugin extends Plugin {
	settings: BasesPowerPackSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();
		await this.refreshLicense();

		// ---- Views -----------------------------------------------------------
		this.registerView(VIEW_TYPE_KANBAN, (leaf) => new KanbanView(leaf, this));
		this.registerView(VIEW_TYPE_CALENDAR, (leaf) => new CalendarView(leaf, this));
		this.registerView(VIEW_TYPE_GANTT, (leaf) => new GanttView(leaf, this));

		this.addRibbonIcon("layout-dashboard", "Bases Power Pack: Kanban", () => {
			void this.activateView(VIEW_TYPE_KANBAN);
		});

		// ---- Commands --------------------------------------------------------
		this.addCommand({
			id: "open-kanban-view",
			name: "Open Kanban view (Lite)",
			callback: () => void this.activateView(VIEW_TYPE_KANBAN),
		});

		this.addCommand({
			id: "open-calendar-view",
			name: "Open Calendar view (Premium)",
			checkCallback: (checking) => this.premiumCommand(checking, VIEW_TYPE_CALENDAR),
		});

		this.addCommand({
			id: "open-gantt-view",
			name: "Open Gantt view (Premium)",
			checkCallback: (checking) => this.premiumCommand(checking, VIEW_TYPE_GANTT),
		});

		this.addCommand({
			id: "verify-license",
			name: "Verify license key",
			callback: async () => {
				await this.refreshLicense();
				this.refreshViews();
				new Notice(this.settings.isPro ? "Premium active." : "Lite tier (no valid license).");
			},
		});

		this.addSettingTab(new BasesPowerPackSettingTab(this.app, this));
	}

	onunload(): void {}

	private premiumCommand(checking: boolean, viewType: string): boolean {
		if (!this.settings.isPro) return false;
		if (!checking) void this.activateView(viewType);
		return true;
	}

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

	/**
	 * Re-render every open Power Pack view. Called after settings or license
	 * changes. Uses each view's render() — NOT onOpen(), which would re-register
	 * the metadataCache listener and stack duplicates on every keystroke.
	 */
	refreshViews(): void {
		for (const viewType of ALL_VIEW_TYPES) {
			for (const leaf of this.app.workspace.getLeavesOfType(viewType)) {
				const view = leaf.view as { render?: () => void | Promise<void> };
				void view.render?.();
			}
		}
	}

	/**
	 * Re-verify the license key (offline) and cache the result. Returns whether
	 * the Pro status or email actually changed, so callers can avoid needless
	 * UI rebuilds.
	 */
	async refreshLicense(): Promise<boolean> {
		const before = this.settings.isPro;
		const beforeEmail = this.settings.licenseEmail;
		if (!this.settings.licenseKey) {
			this.settings.isPro = false;
			this.settings.licenseEmail = "";
		} else {
			const result = LicenseManager.verify(this.settings.licenseKey);
			this.settings.isPro = result.valid;
			this.settings.licenseEmail = result.email ?? "";
		}
		const changed = before !== this.settings.isPro || beforeEmail !== this.settings.licenseEmail;
		if (changed) {
			await this.saveSettings();
			this.refreshViews();
		}
		return changed;
	}

	async loadSettings(): Promise<void> {
		const data: unknown = await this.loadData();
		const loaded =
			data !== null && typeof data === "object" ? (data as Partial<BasesPowerPackSettings>) : {};
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);

		this.settings.savedFilters = sanitizeSavedFilters(this.settings.savedFilters);
		this.settings.rollups = sanitizeRollups(this.settings.rollups);
		if (typeof this.settings.activeBasePath !== "string") this.settings.activeBasePath = "";
		if (typeof this.settings.activeFilterId !== "string") this.settings.activeFilterId = "";
		if (typeof this.settings.cardFormula !== "string") this.settings.cardFormula = "";
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}

function sanitizeSavedFilters(value: unknown): SavedFilter[] {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(f): f is SavedFilter =>
			!!f &&
			typeof f === "object" &&
			typeof (f as SavedFilter).id === "string" &&
			typeof (f as SavedFilter).name === "string" &&
			typeof (f as SavedFilter).expression === "string"
	);
}

function sanitizeRollups(value: unknown): Rollup[] {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(r): r is Rollup =>
			!!r &&
			typeof r === "object" &&
			typeof (r as Rollup).id === "string" &&
			typeof (r as Rollup).label === "string" &&
			typeof (r as Rollup).expression === "string" &&
			AGGREGATIONS.includes((r as Rollup).aggregation)
	);
}

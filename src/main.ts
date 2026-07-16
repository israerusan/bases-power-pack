import { Notice, Plugin, TFile, WorkspaceLeaf, normalizePath } from "obsidian";
import {
	BasesPowerPackSettings,
	BasesPowerPackSettingTab,
	CALENDAR_VIEW_MODES,
	DEFAULT_SETTINGS,
	type SavedFilter,
} from "./settings";
import { LicenseManager } from "./license/LicenseManager";
import { AGGREGATIONS, type Rollup } from "./query/rollup";
import {
	AUTOMATION_ACTION_TYPES,
	type AutomationAction,
	type AutomationActionType,
	type AutomationRule,
} from "./query/automation";
import { KanbanView, VIEW_TYPE_KANBAN } from "./views/kanbanView";
import { CalendarView, VIEW_TYPE_CALENDAR } from "./views/calendarView";
import { GanttView, VIEW_TYPE_GANTT } from "./views/ganttView";
import { buildRawNotes, writeRowProperties } from "./views/viewData";
import { UndoManager } from "./query/undo";
import { sanitizeWipLimit } from "./query/wip";
import type { RawNote } from "./model/row";

const PREMIUM_VIEW_TYPES = [VIEW_TYPE_CALENDAR, VIEW_TYPE_GANTT];
const ALL_VIEW_TYPES = [VIEW_TYPE_KANBAN, VIEW_TYPE_CALENDAR, VIEW_TYPE_GANTT];

const VIEW_NAME_TO_TYPE: Record<string, string> = {
	kanban: VIEW_TYPE_KANBAN,
	calendar: VIEW_TYPE_CALENDAR,
	gantt: VIEW_TYPE_GANTT,
};

/**
 * Public API exposed as `window.basesPowerPack` so other plugins (e.g. Vault
 * Spotlight's ".base result" actions) can open Power Pack views directly.
 */
export interface BasesPowerPackApi {
	/**
	 * Open a view, optionally switching the active base first. Returns false
	 * (with a user-facing notice) when the view or the base source requires a
	 * premium license, or when the base path doesn't resolve.
	 */
	openView: (view: "kanban" | "calendar" | "gantt", basePath?: string) => Promise<boolean>;
	isPremiumActive: () => boolean;
}

export default class BasesPowerPackPlugin extends Plugin {
	settings: BasesPowerPackSettings = DEFAULT_SETTINGS;
	/** In-memory undo stack for the frontmatter writes every view makes. */
	readonly undo = new UndoManager();
	private api: BasesPowerPackApi | null = null;
	/** Cached vault snapshot shared by every view, rebuilt only when notes change. */
	private notesSnapshot: RawNote[] | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		await this.refreshLicense();

		// A single vault snapshot feeds every view. Without this each render (and
		// each search keystroke) re-scanned every markdown file; here we scan once
		// and invalidate only when the vault actually changes.
		this.registerEvent(this.app.metadataCache.on("changed", () => this.invalidateSnapshot()));
		this.registerEvent(this.app.vault.on("create", () => this.invalidateSnapshot()));
		this.registerEvent(this.app.vault.on("delete", () => this.invalidateSnapshot()));
		this.registerEvent(this.app.vault.on("rename", () => this.invalidateSnapshot()));

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
			id: "undo-last-change",
			name: "Undo last change",
			checkCallback: (checking) => {
				if (!this.undo.canUndo()) return false;
				if (!checking) void this.performUndo();
				return true;
			},
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

		this.api = this.createApi();
		(window as unknown as Record<string, unknown>).basesPowerPack = this.api;
	}

	onunload(): void {
		// Identity check: only remove the global if it's still OUR object — a
		// second instance (e.g. a BRAT beta copy) may have claimed it since.
		const globals = window as unknown as Record<string, unknown>;
		if (this.api && globals.basesPowerPack === this.api) delete globals.basesPowerPack;
		this.api = null;
	}

	/** The shared vault snapshot, rebuilt lazily after any note change. */
	getNotesSnapshot(): RawNote[] {
		if (!this.notesSnapshot) this.notesSnapshot = buildRawNotes(this.app);
		return this.notesSnapshot;
	}

	/** Drop the cached snapshot so the next read (and re-render) sees current notes. */
	invalidateSnapshot(): void {
		this.notesSnapshot = null;
	}

	/**
	 * Reverse the most recent undoable edit by applying its captured inverse
	 * writes. The inverses are applied with `record: false` so undoing an edit
	 * doesn't push another entry onto the stack.
	 */
	async performUndo(): Promise<void> {
		const entry = this.undo.pop();
		if (!entry) return;
		let ok = 0;
		for (const note of entry.notes) {
			if (await writeRowProperties(this, note.path, note.writes, { record: false })) ok++;
		}
		new Notice(`Undid "${entry.label}" — restored ${ok} note${ok === 1 ? "" : "s"}.`);
		this.refreshViews();
	}

	private createApi(): BasesPowerPackApi {
		return {
			openView: async (view, basePath) => {
				const viewType = VIEW_NAME_TO_TYPE[view];
				if (!viewType) {
					new Notice(`Bases Power Pack: unknown view "${String(view)}".`);
					return false;
				}
				if (PREMIUM_VIEW_TYPES.includes(viewType) && !this.settings.isPro) {
					new Notice("Bases Power Pack: this view requires a premium license.");
					return false;
				}
				if (basePath) {
					// Reading a .base as the data source is a premium feature.
					if (!this.settings.isPro) {
						new Notice("Bases Power Pack: opening a base as the data source requires premium.");
						return false;
					}
					const file = this.app.vault.getAbstractFileByPath(normalizePath(basePath));
					if (!(file instanceof TFile) || file.extension !== "base") {
						new Notice("Bases Power Pack: base file not found.");
						return false;
					}
					if (this.settings.activeBasePath !== file.path) {
						this.settings.activeBasePath = file.path;
						await this.saveSettings();
						this.refreshViews();
					}
				}
				await this.activateView(viewType);
				return true;
			},
			isPremiumActive: () => this.settings.isPro,
		};
	}

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
		await workspace.revealLeaf(leaf);
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
	 *
	 * `persistUnchanged` is for the settings tab, where the key TEXT was just
	 * edited: it must be saved even when the premium status didn't flip, or an
	 * invalid/typo'd key silently vanishes on the next restart. Startup calls
	 * leave it false so an unchanged verification never writes data.json.
	 */
	async refreshLicense(persistUnchanged = false): Promise<boolean> {
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
		if (changed || persistUnchanged) await this.saveSettings();
		if (changed) this.refreshViews();
		return changed;
	}

	async loadSettings(): Promise<void> {
		const data: unknown = await this.loadData();
		const loaded =
			data !== null && typeof data === "object" ? (data as Partial<BasesPowerPackSettings>) : {};
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);

		this.settings.savedFilters = sanitizeSavedFilters(this.settings.savedFilters);
		this.settings.rollups = sanitizeRollups(this.settings.rollups);
		this.settings.automations = sanitizeAutomations(this.settings.automations);
		this.settings.kanbanColorOverrides = sanitizeColorOverrides(this.settings.kanbanColorOverrides);
		this.settings.kanbanWipLimits = sanitizeWipLimits(this.settings.kanbanWipLimits);
		if (typeof this.settings.kanbanBlockOverWip !== "boolean") this.settings.kanbanBlockOverWip = DEFAULT_SETTINGS.kanbanBlockOverWip;
		this.settings.kanbanCardFields = sanitizeStringArray(this.settings.kanbanCardFields, DEFAULT_SETTINGS.kanbanCardFields);
		this.settings.kanbanExtraColumns = sanitizeStringMap(this.settings.kanbanExtraColumns);
		this.settings.kanbanColumnOrder = sanitizeStringMap(this.settings.kanbanColumnOrder);
		if (typeof this.settings.kanbanColorColumns !== "boolean") this.settings.kanbanColorColumns = DEFAULT_SETTINGS.kanbanColorColumns;
		if (typeof this.settings.kanbanQuickAddFolder !== "string") this.settings.kanbanQuickAddFolder = "";
		if (typeof this.settings.activeBasePath !== "string") this.settings.activeBasePath = "";
		if (typeof this.settings.activeFilterId !== "string") this.settings.activeFilterId = "";
		if (typeof this.settings.cardFormula !== "string") this.settings.cardFormula = "";
		if (!CALENDAR_VIEW_MODES.includes(this.settings.calendarViewMode)) this.settings.calendarViewMode = "month";
		if (typeof this.settings.calendarColorProp !== "string") this.settings.calendarColorProp = "";
		if (typeof this.settings.calendarQuickAddFolder !== "string") this.settings.calendarQuickAddFolder = "";
		if (typeof this.settings.ganttProgressProp !== "string") this.settings.ganttProgressProp = DEFAULT_SETTINGS.ganttProgressProp;
		if (typeof this.settings.ganttMilestoneProp !== "string") this.settings.ganttMilestoneProp = DEFAULT_SETTINGS.ganttMilestoneProp;
	}

	// Serialize writes: overlapping saveData calls (e.g. per-keystroke license
	// verification) could otherwise finish out of order, letting a stale
	// serialization win on disk.
	private savePromise: Promise<void> = Promise.resolve();

	async saveSettings(): Promise<void> {
		this.savePromise = this.savePromise.then(() => this.saveData(this.settings));
		return this.savePromise;
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

function sanitizeAutomations(value: unknown): AutomationRule[] {
	if (!Array.isArray(value)) return [];
	const out: AutomationRule[] = [];
	for (const raw of value) {
		if (!raw || typeof raw !== "object") continue;
		const r = raw as Record<string, unknown>;
		if (typeof r.id !== "string" || typeof r.triggerProp !== "string" || typeof r.enterValue !== "string") continue;
		const actions: AutomationAction[] = [];
		if (Array.isArray(r.actions)) {
			for (const rawAction of r.actions) {
				if (!rawAction || typeof rawAction !== "object") continue;
				const a = rawAction as Record<string, unknown>;
				if (typeof a.prop !== "string" || !AUTOMATION_ACTION_TYPES.includes(a.type as AutomationActionType)) continue;
				actions.push({ prop: a.prop, type: a.type as AutomationActionType, value: typeof a.value === "string" ? a.value : "" });
			}
		}
		out.push({
			id: r.id,
			name: typeof r.name === "string" ? r.name : "Rule",
			enabled: r.enabled !== false,
			triggerProp: r.triggerProp,
			enterValue: r.enterValue,
			actions,
		});
	}
	return out;
}

function sanitizeWipLimits(value: unknown): Record<string, number> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	const out: Record<string, number> = {};
	for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
		const limit = sanitizeWipLimit(raw);
		if (limit !== null) out[key] = limit;
	}
	return out;
}

function sanitizeColorOverrides(value: unknown): Record<string, string> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	const out: Record<string, string> = {};
	for (const [key, hue] of Object.entries(value as Record<string, unknown>)) {
		if (typeof hue === "string" && /^\d{1,3}$/.test(hue) && Number(hue) <= 359) out[key] = hue;
	}
	return out;
}

function sanitizeStringArray(value: unknown, fallback: string[] = []): string[] {
	if (!Array.isArray(value)) return [...fallback];
	const parts = value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
	const deduped = [...new Set(parts)];
	return deduped.length > 0 ? deduped : [...fallback];
}

function sanitizeStringMap(value: unknown): Record<string, string[]> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	const out: Record<string, string[]> = {};
	for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
		const list = sanitizeStringArray(entry, []);
		if (list.length > 0) out[key] = list;
	}
	return out;
}

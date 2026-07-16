import { ItemView, TFile, WorkspaceLeaf, debounce, type Debouncer } from "obsidian";
import type BasesPowerPackPlugin from "../main";
import type { Row } from "../model/row";

/**
 * Shared base for the three Power Pack views. Hoists the lifecycle plumbing that
 * was duplicated across kanban/calendar/gantt: the render token, a debounced
 * re-render on metadata changes (so a burst of vault writes coalesces into one
 * render instead of one per changed note), opening a row's note, linking to
 * settings, and the premium upgrade notice.
 */
export abstract class PowerPackView extends ItemView {
	protected plugin: BasesPowerPackPlugin;
	protected renderToken = 0;
	private readonly scheduleRender: Debouncer<[], void>;

	constructor(leaf: WorkspaceLeaf, plugin: BasesPowerPackPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.scheduleRender = debounce(() => void this.render(), 120, false);
	}

	/** Render the whole view. Subclasses guard async work with `isStale(token)`. */
	abstract render(): Promise<void>;

	async onOpen(): Promise<void> {
		await this.render();
		this.registerEvent(this.app.metadataCache.on("changed", () => this.scheduleRender()));
	}

	async onClose(): Promise<void> {
		// Drop any queued re-render so a late metadata event can't repaint a closed view.
		this.scheduleRender.cancel();
		this.contentEl.empty();
	}

	/** True when a newer render has started since `token` was taken. */
	protected isStale(token: number): boolean {
		return token !== this.renderToken;
	}

	protected openRow(row: Row): void {
		const file = this.app.vault.getAbstractFileByPath(row.id);
		if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file);
	}

	protected openSettings(): void {
		const setting = (this.app as unknown as { setting?: { open?: () => void; openTabById?: (id: string) => void } }).setting;
		setting?.open?.();
		setting?.openTabById?.(this.plugin.manifest.id);
	}

	protected renderUpgradeNotice(container: HTMLElement, emoji: string, title: string, body: string): void {
		const box = container.createDiv({ cls: "bpp-upgrade" });
		box.createEl("h3", { text: `${emoji} ${title}` });
		box.createEl("p", { text: body });
		const btn = box.createEl("button", { text: "Enter license key in settings", cls: "mod-cta" });
		btn.addEventListener("click", () => this.openSettings());
	}
}

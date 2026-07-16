import {
	ItemView,
	Menu,
	Notice,
	TFile,
	WorkspaceLeaf,
	debounce,
	normalizePath,
	type Debouncer,
} from "obsidian";
import type BasesPowerPackPlugin from "../main";
import type { Row } from "../model/row";
import { PromptModal, ConfirmModal } from "./modals";
import { coerceFieldInput, formatFieldForEdit } from "../query/inlineEdit";
import { writeRowProperty } from "./viewData";

/**
 * Shared base for the three Power Pack views. Hoists the lifecycle plumbing that
 * was duplicated across kanban/calendar/gantt: the render token, a debounced
 * re-render on metadata changes (so a burst of vault writes coalesces into one
 * render instead of one per changed note), opening a row's note, linking to
 * settings, and the premium upgrade notice — plus the common per-note actions
 * (open / rename / delete / edit field) so every view offers the same
 * keyboard-accessible right-click menu, not just the Kanban.
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
		const file = this.fileFor(row);
		if (file) void this.app.workspace.getLeaf(false).openFile(file);
	}

	protected openRowToRight(row: Row): void {
		const file = this.fileFor(row);
		if (file) void this.app.workspace.getLeaf("split").openFile(file);
	}

	protected fileFor(row: Row): TFile | null {
		const file = this.app.vault.getAbstractFileByPath(row.id);
		return file instanceof TFile ? file : null;
	}

	/**
	 * Add the per-note actions common to every view — open, open-to-the-right,
	 * edit each configured card field, rename, delete — to a context menu. Callers
	 * (Kanban card menu, Calendar event menu, Gantt bar menu) can add their own
	 * view-specific items around these. `after` re-renders the calling view once a
	 * mutation lands.
	 */
	protected addCommonRowMenuItems(menu: Menu, row: Row, fields: string[], after: () => void): void {
		menu.addItem((i) => i.setTitle("Open").setIcon("file").onClick(() => this.openRow(row)));
		menu.addItem((i) =>
			i.setTitle("Open to the right").setIcon("separator-vertical").onClick(() => this.openRowToRight(row))
		);
		if (fields.length > 0) {
			menu.addSeparator();
			for (const field of fields) {
				menu.addItem((i) =>
					i.setTitle(`Edit ${field}…`).setIcon("pencil").onClick(() => this.editFieldViaModal(row, field, after))
				);
			}
		}
		menu.addSeparator();
		menu.addItem((i) =>
			i.setTitle("Rename note…").setIcon("text-cursor-input").onClick(() => this.renameNote(row, after))
		);
		menu.addItem((i) => i.setTitle("Delete note").setIcon("trash").onClick(() => this.confirmDeleteNote(row, after)));
	}

	protected editFieldViaModal(row: Row, field: string, after: () => void): void {
		const previous = row.note.frontmatter[field];
		new PromptModal(this.app, {
			title: `Edit "${field}"`,
			value: formatFieldForEdit(previous),
			placeholder: field,
			onSubmit: (v) => {
				const { value, remove } = coerceFieldInput(field, v, previous);
				void writeRowProperty(this.plugin, row.id, field, value, remove, { label: `Edit "${field}"` }).then(after);
			},
		}).open();
	}

	protected renameNote(row: Row, after: () => void): void {
		const file = this.fileFor(row);
		if (!file) return;
		new PromptModal(this.app, {
			title: "Rename note",
			value: file.basename,
			cta: "Rename",
			onSubmit: (name) => {
				const clean = name.trim();
				if (!clean || clean === file.basename) return;
				const parent = file.parent?.path ? `${file.parent.path}/` : "";
				const target = normalizePath(`${parent}${clean}.${file.extension}`);
				this.app.fileManager
					.renameFile(file, target)
					.then(() => {
						this.plugin.invalidateSnapshot();
						after();
					})
					.catch((e: unknown) => new Notice(`Rename failed: ${String(e)}`));
			},
		}).open();
	}

	protected confirmDeleteNote(row: Row, after: () => void): void {
		const file = this.fileFor(row);
		if (!file) return;
		new ConfirmModal(this.app, {
			title: "Delete note?",
			body: `"${file.basename}" will be moved to trash.`,
			cta: "Delete",
			onConfirm: () => {
				this.app.fileManager
					.trashFile(file)
					.then(() => {
						this.plugin.invalidateSnapshot();
						after();
					})
					.catch((e: unknown) => new Notice(`Delete failed: ${String(e)}`));
			},
		}).open();
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

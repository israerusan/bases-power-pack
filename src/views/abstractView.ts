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
import { renderSearchControl } from "./viewChrome";

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
	private readonly searchDebounce: Debouncer<[], void>;

	/** The live quick-search query, managed by renderManagedSearch(). */
	protected searchQuery = "";
	private searchInputEl: HTMLInputElement | null = null;
	private searchState: { focused: boolean; caret: number } | null = null;

	/** While true, a background metadata re-render is deferred — set during an
	 * inline edit or a pointer drag so an auto-render can't destroy the focused
	 * input or the drag target (which would drop or corrupt the write). */
	private suppressAutoRender = false;
	private autoRenderPending = false;

	constructor(leaf: WorkspaceLeaf, plugin: BasesPowerPackPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.scheduleRender = debounce(() => {
			if (this.suppressAutoRender) {
				this.autoRenderPending = true;
				return;
			}
			void this.render();
		}, 120, false);
		this.searchDebounce = debounce(() => void this.render(), 130, false);
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
		this.searchDebounce.cancel();
		this.searchInputEl = null;
		this.suppressAutoRender = false;
		this.autoRenderPending = false;
		this.contentEl.empty();
	}

	/** Enter a direct-manipulation interaction (inline edit / drag): background
	 * auto-renders are held until endInteraction() so they can't yank the target. */
	protected beginInteraction(): void {
		this.suppressAutoRender = true;
	}

	protected endInteraction(): void {
		this.suppressAutoRender = false;
		if (this.autoRenderPending) {
			this.autoRenderPending = false;
			this.scheduleRender();
		}
	}

	/**
	 * Capture the search caret BEFORE a render's container.empty() destroys the
	 * input, so renderManagedSearch() can hand focus back at the same offset (not
	 * slammed to the end). Call at the top of render(), before empty().
	 */
	protected captureSearchState(): void {
		// A real render destroys any inline-edit input / drag target, so it ENDS any
		// in-progress interaction. Clear the suppression here (render() always runs
		// this before container.empty()) so a focus-steal that orphans an edit's
		// terminal blur can never leave auto-render frozen.
		this.suppressAutoRender = false;
		this.autoRenderPending = false;
		const el = this.searchInputEl;
		const focused = el !== null && el.ownerDocument.activeElement === el;
		this.searchState = { focused, caret: el ? el.selectionStart ?? el.value.length : 0 };
		this.searchInputEl = null;
	}

	/**
	 * Render the managed quick-search box: writes to `searchQuery`, re-renders on a
	 * short debounce (so a fast typist / IME isn't interrupted mid-keystroke), and
	 * restores focus + caret from the pre-render capture.
	 */
	protected renderManagedSearch(container: HTMLElement): HTMLInputElement {
		const input = renderSearchControl(container, this.searchQuery, (value) => {
			this.searchQuery = value;
			this.searchDebounce();
		});
		this.searchInputEl = input;
		if (this.searchState?.focused) {
			input.focus();
			const pos = Math.min(this.searchState.caret, input.value.length);
			input.setSelectionRange(pos, pos);
		}
		this.searchState = null;
		return input;
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
		this.app.setting?.open();
		this.app.setting?.openTabById(this.plugin.manifest.id);
	}

	/**
	 * Show a context menu anchored either to the originating mouse event (right-click)
	 * or, for a keyboard / overflow-button trigger, below an anchor element — so every
	 * menu is reachable without a right-click (mobile long-press is unreliable).
	 */
	protected showMenuAtAnchor(menu: Menu, anchor: MouseEvent | HTMLElement): void {
		if (anchor instanceof MouseEvent) {
			menu.showAtMouseEvent(anchor);
		} else {
			const r = anchor.getBoundingClientRect();
			menu.showAtPosition({ x: r.right, y: r.bottom });
		}
	}

	/**
	 * Make an item element (card / event / agenda item) keyboard-operable:
	 * focusable with a label, Enter opens it, and ContextMenu / Shift+F10 opens its
	 * action menu. The element is a `group`, not a `button`, because it owns its own
	 * focusable controls (the ⋯ button, inline-edit inputs) — an atomic `button`
	 * role would hide those from screen readers. The keydown only acts when the
	 * container itself is focused, so Enter/menu keys pressed on a nested control
	 * (committing an inline edit, activating the ⋯ button) don't also fire here.
	 */
	protected makeItemAccessible(
		el: HTMLElement,
		label: string,
		onOpen: () => void,
		onMenu: (anchor: HTMLElement) => void
	): void {
		el.tabIndex = 0;
		el.setAttribute("role", "group");
		el.setAttribute("aria-label", label);
		el.addEventListener("keydown", (evt) => {
			if (evt.target !== el) return;
			if (evt.key === "Enter") {
				evt.preventDefault();
				onOpen();
			} else if (evt.key === "ContextMenu" || (evt.key === "F10" && evt.shiftKey)) {
				evt.preventDefault();
				onMenu(el);
			}
		});
	}

	/**
	 * Add a persistent "⋯" overflow button that opens an item's action menu — the
	 * touch- and keyboard-reachable path to actions that otherwise live only behind
	 * a right-click (dead on touch) or an HTML5 drag (dead on touch).
	 */
	protected addOverflowButton(
		parent: HTMLElement,
		label: string,
		openMenu: (anchor: MouseEvent | HTMLElement) => void
	): HTMLButtonElement {
		const btn = parent.createEl("button", {
			cls: "bpp-overflow",
			text: "⋯",
			attr: { "aria-label": `Actions: ${label}`, "aria-haspopup": "menu" },
		});
		btn.addEventListener("click", (evt) => {
			evt.stopPropagation();
			evt.preventDefault();
			openMenu(evt);
		});
		return btn;
	}

	/**
	 * Render a toolbar Undo button when there's something to undo — the discoverable
	 * affordance for the otherwise command-palette-only undo. Its tooltip names the
	 * exact action that would be reversed.
	 */
	protected renderUndoButton(container: HTMLElement): void {
		if (!this.plugin.undo.canUndo()) return;
		const label = this.plugin.undo.peekLabel();
		const btn = container.createEl("button", {
			cls: "bpp-seg-btn bpp-undo-btn",
			text: "↶ Undo",
			attr: { "aria-label": label ? `Undo: ${label}` : "Undo last change" },
		});
		if (label) btn.setAttr("title", `Undo: ${label}`);
		btn.addEventListener("click", () => void this.plugin.performUndo());
	}

	protected renderUpgradeNotice(container: HTMLElement, emoji: string, title: string, body: string): void {
		const box = container.createDiv({ cls: "bpp-upgrade" });
		box.createEl("h3", { text: `${emoji} ${title}` });
		box.createEl("p", { text: body });
		const btn = box.createEl("button", { text: "Enter license key in settings", cls: "mod-cta" });
		btn.addEventListener("click", () => this.openSettings());
	}
}

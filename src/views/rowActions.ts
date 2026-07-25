import { App, Menu, Notice, TFile, normalizePath } from "obsidian";
import type BasesPowerPackPlugin from "../main";
import type { Row } from "../model/row";
import { parseImageRef } from "../query/gallery";
import { coerceFieldInput, formatFieldForEdit } from "../query/inlineEdit";
import { resolveRowColor } from "../query/colorRules";
import { writeRowProperty } from "./viewData";
import { PromptModal, ConfirmModal } from "./modals";

/**
 * Shared row/menu/DOM helpers, extracted from PowerPackView so BOTH the standalone
 * board (a PowerPackView) AND the Bases Kanban view (a BasesView, which can't extend
 * PowerPackView) can use one implementation instead of divergent copies. PowerPackView
 * keeps the same method names as one-line wrappers, so the other views are unchanged.
 *
 * The env is deliberately narrow — just `app` + `plugin` — not a whole view, so the
 * helpers can't reach back into per-view state.
 */
export interface RowActionEnv {
	app: App;
	plugin: BasesPowerPackPlugin;
}

export function fileFor(env: RowActionEnv, row: Row): TFile | null {
	const file = env.app.vault.getAbstractFileByPath(row.id);
	return file instanceof TFile ? file : null;
}

export function openRow(env: RowActionEnv, row: Row): void {
	const file = fileFor(env, row);
	if (file) void env.app.workspace.getLeaf(false).openFile(file);
}

export function openRowToRight(env: RowActionEnv, row: Row): void {
	const file = fileFor(env, row);
	if (file) void env.app.workspace.getLeaf("split").openFile(file);
}

/**
 * Resolve a row's cover-image property to a loadable URL, or null when there's none.
 * A vault link/path resolves relative to the note; an http(s) URL is used as-is.
 */
export function coverImageSrc(env: RowActionEnv, row: Row, prop: string): string | null {
	if (!prop) return null;
	const ref = parseImageRef(row.scope.get(prop));
	if (!ref) return null;
	if (ref.kind === "url") return ref.ref;
	const file = env.app.metadataCache.getFirstLinkpathDest(ref.ref, row.id);
	return file ? env.app.vault.getResourcePath(file) : null;
}

export function editFieldViaModal(env: RowActionEnv, row: Row, field: string, after: () => void): void {
	const previous = row.note.frontmatter[field];
	new PromptModal(env.app, {
		title: `Edit "${field}"`,
		value: formatFieldForEdit(previous),
		placeholder: field,
		onSubmit: (v) => {
			const { value, remove } = coerceFieldInput(field, v, previous);
			void writeRowProperty(env.plugin, row.id, field, value, remove, { label: `Edit "${field}"` }).then(after);
		},
	}).open();
}

export function renameNote(env: RowActionEnv, row: Row, after: () => void): void {
	const file = fileFor(env, row);
	if (!file) return;
	new PromptModal(env.app, {
		title: "Rename note",
		value: file.basename,
		cta: "Rename",
		onSubmit: (name) => {
			const clean = name.trim();
			if (!clean || clean === file.basename) return;
			const parent = file.parent?.path ? `${file.parent.path}/` : "";
			const target = normalizePath(`${parent}${clean}.${file.extension}`);
			env.app.fileManager
				.renameFile(file, target)
				.then(() => {
					env.plugin.invalidateSnapshot();
					after();
				})
				.catch((e: unknown) => new Notice(`Rename failed: ${String(e)}`));
		},
	}).open();
}

export function confirmDeleteNote(env: RowActionEnv, row: Row, after: () => void): void {
	const file = fileFor(env, row);
	if (!file) return;
	new ConfirmModal(env.app, {
		title: "Delete note?",
		body: `"${file.basename}" will be moved to trash.`,
		cta: "Delete",
		onConfirm: () => {
			env.app.fileManager
				.trashFile(file)
				.then(() => {
					env.plugin.invalidateSnapshot();
					after();
				})
				.catch((e: unknown) => new Notice(`Delete failed: ${String(e)}`));
		},
	}).open();
}

/**
 * Add the per-note actions common to every view — open, open-to-the-right, edit each
 * configured field, rename, delete — to a context menu. `after` re-renders the caller.
 */
export function addCommonRowMenuItems(
	env: RowActionEnv,
	menu: Menu,
	row: Row,
	fields: string[],
	after: () => void
): void {
	menu.addItem((i) => i.setTitle("Open").setIcon("file").onClick(() => openRow(env, row)));
	menu.addItem((i) =>
		i.setTitle("Open to the right").setIcon("separator-vertical").onClick(() => openRowToRight(env, row))
	);
	if (fields.length > 0) {
		menu.addSeparator();
		for (const field of fields) {
			menu.addItem((i) =>
				i.setTitle(`Edit ${field}…`).setIcon("pencil").onClick(() => editFieldViaModal(env, row, field, after))
			);
		}
	}
	menu.addSeparator();
	menu.addItem((i) =>
		i.setTitle("Rename note…").setIcon("text-cursor-input").onClick(() => renameNote(env, row, after))
	);
	menu.addItem((i) => i.setTitle("Delete note").setIcon("trash").onClick(() => confirmDeleteNote(env, row, after)));
}

/**
 * Show a context menu anchored either to the originating mouse event (right-click) or,
 * for a keyboard / overflow-button trigger, below an anchor element.
 */
export function showMenuAtAnchor(menu: Menu, anchor: MouseEvent | HTMLElement): void {
	if (anchor instanceof MouseEvent) {
		menu.showAtMouseEvent(anchor);
	} else {
		const r = anchor.getBoundingClientRect();
		menu.showAtPosition({ x: r.right, y: r.bottom });
	}
}

/**
 * Make an item element (card / event / bar) keyboard-operable: focusable with a label,
 * Enter opens it, ContextMenu / Shift+F10 opens its action menu. It's a `group`, not a
 * `button`, so its own nested controls stay reachable to screen readers.
 */
export function makeItemAccessible(
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

/** A persistent "⋯" overflow button that opens an item's action menu — the touch- and
 * keyboard-reachable path to actions otherwise behind a right-click / HTML5 drag. */
export function addOverflowButton(
	parent: HTMLElement,
	label: string,
	openMenu: (anchor: MouseEvent | HTMLElement) => void
): HTMLButtonElement {
	const btn = parent.createEl("button", {
		cls: "bpp-overflow clickable-icon",
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
 * Apply the first matching premium color rule to an item element: tag it
 * `.bpp-rule-colored` and set `--bpp-rule-color`. A no-op on the free tier or when no
 * rule matches, so it composes with a per-column color choice.
 */
export function applyColorRule(plugin: BasesPowerPackPlugin, el: HTMLElement, row: Row): void {
	if (!plugin.settings.isPro) return;
	const resolved = resolveRowColor(row, plugin.settings.colorRules);
	if (!resolved) return;
	el.addClass("bpp-rule-colored");
	el.style.setProperty("--bpp-rule-color", resolved.color);
	if (resolved.label && !el.hasAttribute("title")) el.setAttr("title", resolved.label);
}

/** True when a `dragleave` genuinely exits `el` rather than crossing onto a child. */
export function dragTrulyLeft(el: HTMLElement, evt: DragEvent): boolean {
	const to = evt.relatedTarget;
	return !(to instanceof Node) || !el.contains(to);
}

/** A friendly empty state: optional title, a body line, and optional action buttons
 * (the first styled as the primary CTA). */
export function renderEmptyState(
	container: HTMLElement,
	opts: { title?: string; body: string; actions?: Array<{ label: string; onClick: () => void }> }
): void {
	const box = container.createDiv({ cls: "bpp-emptystate" });
	if (opts.title) box.createDiv({ cls: "bpp-emptystate-title", text: opts.title });
	box.createDiv({ cls: "bpp-emptystate-body", text: opts.body });
	if (opts.actions?.length) {
		const row = box.createDiv({ cls: "bpp-emptystate-actions" });
		opts.actions.forEach((action, i) => {
			const btn = row.createEl("button", { text: action.label, cls: i === 0 ? "mod-cta" : undefined });
			btn.addEventListener("click", () => action.onClick());
		});
	}
}

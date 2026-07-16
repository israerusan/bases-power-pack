import { App, Notice, TFile, normalizePath, getAllTags, parseYaml } from "obsidian";
import type BasesPowerPackPlugin from "../main";
import type { RawNote, Row } from "../model/row";
import { resolveRows } from "../bases/resolveRows";
import {
	emptyBaseDefinition,
	normalizeBaseDefinition,
	type BaseDefinition,
} from "../bases/baseDefinition";
import type { FilterNode } from "../query/filter";
import { invertWrites, type UndoBatch } from "../query/undo";

/** Snapshot every markdown note as a RawNote for the query engine. */
export function buildRawNotes(app: App): RawNote[] {
	const notes: RawNote[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);
		const fm: Record<string, unknown> = { ...(cache?.frontmatter ?? {}) };
		// Obsidian injects a `position` marker into frontmatter caches — drop it.
		delete fm.position;
		const tags = (cache ? getAllTags(cache) ?? [] : []).map((t) => t.replace(/^#/, ""));
		notes.push({
			path: file.path,
			name: file.basename,
			folder: file.parent?.path ?? "",
			ext: file.extension,
			tags,
			ctime: file.stat.ctime,
			mtime: file.stat.mtime,
			size: file.stat.size,
			frontmatter: fm,
		});
	}
	return notes;
}

/** All `.base` files in the vault (for the settings picker). */
export function listBaseFiles(app: App): TFile[] {
	return app.vault
		.getFiles()
		.filter((f) => f.extension === "base")
		.sort((a, b) => a.path.localeCompare(b.path));
}

/** Read and parse a `.base` file into a BaseDefinition, or null on any failure. */
export async function loadBaseDefinition(app: App, path: string): Promise<BaseDefinition | null> {
	if (!path) return null;
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return null;
	try {
		const raw = await app.vault.read(file);
		return normalizeBaseDefinition(parseYaml(raw));
	} catch {
		return null;
	}
}

export interface WriteOptions {
	/** Label shown if this edit is undone. Ignored when `batch` is given (the
	 * batch carries the label for the whole grouped operation). */
	label?: string;
	/** When false, the edit is applied but NOT pushed to the undo stack — used by
	 * the undo command itself so reversing an edit doesn't record another. */
	record?: boolean;
	/** Join this reentrant batch so a multi-note operation undoes as one entry. */
	batch?: UndoBatch;
}

/**
 * Set (or remove) a single frontmatter key on the note at `path`. Shared by the
 * calendar drag-to-reschedule, Gantt drag/resize, and the free inline card
 * editor — every mutating view writes through this one path so behavior (and
 * the metadataCache-driven re-render) stays identical.
 */
export async function writeRowProperty(
	plugin: BasesPowerPackPlugin,
	path: string,
	key: string,
	value: unknown,
	remove = false,
	opts?: WriteOptions
): Promise<boolean> {
	return writeRowProperties(plugin, path, [{ key, value, remove }], opts);
}

export interface PropertyWrite {
	key: string;
	value?: unknown;
	remove?: boolean;
}

/**
 * Apply several frontmatter edits to one note in a single processFrontMatter
 * pass. A failure surfaces as a Notice rather than an unhandled rejection; a
 * success invalidates the shared vault snapshot so the caller's immediate
 * re-render reads the just-written state instead of the stale cache, and records
 * the inverse writes so the change can be undone.
 */
export async function writeRowProperties(
	plugin: BasesPowerPackPlugin,
	path: string,
	writes: PropertyWrite[],
	opts?: WriteOptions
): Promise<boolean> {
	const app = plugin.app;
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile) || writes.length === 0) return false;
	let inverse: PropertyWrite[] = [];
	try {
		await app.fileManager.processFrontMatter(file, (frontmatter) => {
			const target = frontmatter as Record<string, unknown>;
			// Capture the inverse against the pre-write state, then apply.
			inverse = invertWrites(target, writes);
			for (const write of writes) {
				if (write.remove) delete target[write.key];
				else target[write.key] = write.value;
			}
		});
		if (opts?.record !== false) plugin.undo.record(opts?.label ?? "Edit", path, inverse, opts?.batch);
		plugin.invalidateSnapshot();
		return true;
	} catch (error) {
		new Notice(`Bases Power Pack: couldn't update "${file.basename}" (${String(error)}).`);
		return false;
	}
}

/** Ensure every folder in `path`'s parent chain exists. */
async function ensureParentFolders(app: App, path: string): Promise<void> {
	const parts = path.split("/");
	parts.pop();
	let current = "";
	for (const part of parts) {
		current = current ? `${current}/${part}` : part;
		const normalized = normalizePath(current);
		if (!normalized || app.vault.getAbstractFileByPath(normalized)) continue;
		await app.vault.createFolder(normalized);
	}
}

/**
 * Create a new note seeded with a single frontmatter property (e.g. a calendar
 * day's date), in `folder`, and open it in a new tab. Returns the created file.
 */
export async function createSeededNote(
	plugin: BasesPowerPackPlugin,
	folder: string,
	key: string,
	value: string,
	titleHint: string
): Promise<TFile> {
	const app = plugin.app;
	const cleanFolder = folder.trim().replace(/^[/\\]+|[/\\]+$/g, "");
	const stem = `${cleanFolder ? `${cleanFolder}/` : ""}${titleHint}`;
	let path = normalizePath(`${stem}.md`);
	for (let i = 2; app.vault.getAbstractFileByPath(path) && i < 1000; i++) {
		path = normalizePath(`${stem} ${i}.md`);
	}
	await ensureParentFolders(app, path);
	const content = `---\n${key}: ${JSON.stringify(value)}\n---\n\n# ${titleHint}\n`;
	const file = await app.vault.create(path, content);
	plugin.invalidateSnapshot();
	await app.workspace.getLeaf("tab").openFile(file);
	return file;
}

export interface ResolvedView {
	rows: Row[];
	def: BaseDefinition;
	baseLabel: string | null;
	filterLabel: string | null;
}

/**
 * Resolve the rows a view should render, honoring premium state:
 *   - Free: every markdown note, no base/filter/formulas.
 *   - Premium: the selected `.base` (filters + formulas) narrowed by the active
 *     saved filter.
 */
export async function resolveViewRows(
	app: App,
	plugin: BasesPowerPackPlugin
): Promise<ResolvedView> {
	const s = plugin.settings;
	const notes = plugin.getNotesSnapshot();

	if (!s.isPro) {
		return { rows: resolveRows(notes, emptyBaseDefinition()), def: emptyBaseDefinition(), baseLabel: null, filterLabel: null };
	}

	const def = (await loadBaseDefinition(app, s.activeBasePath)) ?? emptyBaseDefinition();

	let extra: FilterNode = null;
	let filterLabel: string | null = null;
	if (s.activeFilterId) {
		const sf = s.savedFilters.find((f) => f.id === s.activeFilterId);
		if (sf) {
			extra = sf.expression;
			filterLabel = sf.name;
		}
	}

	const rows = resolveRows(notes, def, extra);
	const baseLabel = s.activeBasePath ? s.activeBasePath.split("/").pop()!.replace(/\.base$/, "") : null;
	return { rows, def, baseLabel, filterLabel };
}

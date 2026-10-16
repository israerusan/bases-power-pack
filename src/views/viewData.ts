import { App, Notice, TFile, normalizePath, getAllTags, parseYaml } from "obsidian";
import type BasesPowerPackPlugin from "../main";
import type { RawNote, Row } from "../model/row";
import { notePathOf, taskRefOf } from "../model/rowId";
import { resolveRows } from "../bases/resolveRows";
import {
	emptyBaseDefinition,
	normalizeBaseDefinition,
	type BaseDefinition,
} from "../bases/baseDefinition";
import type { FilterNode } from "../query/filter";
import { linkProps } from "../query/linkIndex";
import { spliceTaskLine, type TaskRef } from "../query/tasks";
import { invertWrites, type UndoBatch } from "../query/undo";

/** Snapshot ONE markdown file as a RawNote — the unit the incremental snapshot
 * patches when a single note changes. */
export function buildRawNote(app: App, file: TFile): RawNote {
	const cache = app.metadataCache.getFileCache(file);
	const fm: Record<string, unknown> = { ...(cache?.frontmatter ?? {}) };
	// Obsidian injects a `position` marker into frontmatter caches — drop it.
	delete fm.position;
	const tags = (cache ? getAllTags(cache) ?? [] : []).map((t) => t.replace(/^#/, ""));
	return {
		path: file.path,
		name: file.basename,
		folder: file.parent?.path ?? "",
		ext: file.extension,
		tags,
		ctime: file.stat.ctime,
		mtime: file.stat.mtime,
		size: file.stat.size,
		frontmatter: fm,
	};
}

/** Snapshot every markdown note as a RawNote for the query engine. */
export function buildRawNotes(app: App): RawNote[] {
	return app.vault.getMarkdownFiles().map((file) => buildRawNote(app, file));
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
	if (writes.length === 0) return false;
	// A task row addresses one checkbox LINE, not the note's frontmatter. Routing
	// here — on the row id — is what gives every view (kanban drag, calendar
	// reschedule, Gantt resize, bulk edit, undo) task writeback for free.
	const taskRef = taskRefOf(path);
	if (taskRef) return writeTaskLine(plugin, path, taskRef, writes, opts);
	const file = app.vault.getAbstractFileByPath(notePathOf(path));
	if (!(file instanceof TFile)) return false;
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
		// Patch just this note (processFrontMatter has already updated its cache)
		// so the caller's immediate re-render reads the fresh state without the
		// old full-vault snapshot rebuild on every single write.
		plugin.patchNote(file);
		return true;
	} catch (error) {
		new Notice(`Bases Power Pack: couldn't update "${file.basename}" (${String(error)}).`);
		return false;
	}
}

/**
 * Apply writes to the single checkbox LINE a task row points at.
 *
 * The file is rewritten through `vault.process` with the line split on a
 * separator-preserving regex, so every other byte of the note — including a
 * mixed CRLF/LF file — comes back untouched. The task is re-located by its text
 * hash first, so an edit higher up the note can't make the write land on a
 * different task; when it can't be found at all the write is REFUSED rather
 * than guessed, because a wrong guess silently corrupts someone's note.
 */
async function writeTaskLine(
	plugin: BasesPowerPackPlugin,
	rowId: string,
	ref: TaskRef,
	writes: PropertyWrite[],
	opts?: WriteOptions
): Promise<boolean> {
	const app = plugin.app;
	const file = app.vault.getAbstractFileByPath(ref.path);
	if (!(file instanceof TFile)) return false;
	let inverse: PropertyWrite[] = [];
	let applied = false;
	let missing = false;
	try {
		await app.vault.process(file, (data) => {
			// The splice itself is pure and unit-tested (see query/tasks.ts); this
			// path only handles the Obsidian side and the user-facing outcome.
			const result = spliceTaskLine(data, ref, writes);
			if (result.status === "notfound") missing = true;
			// "unchanged" (the same value written twice) deliberately records no
			// undo entry — reversing it would restore an identical line.
			if (result.status !== "written") return data;
			inverse = result.inverse;
			applied = true;
			return result.text;
		});
	} catch (error) {
		new Notice(`Bases Power Pack: couldn't update the task in "${file.basename}" (${String(error)}).`);
		return false;
	}
	if (missing) {
		// Refusing is deliberate (see relocateTask), but it must not look like the
		// drag just didn't register.
		new Notice(
			`Bases Power Pack: couldn't find that task in "${file.basename}" any more — it was moved, edited, or has an identical twin. Nothing was changed.`
		);
		return false;
	}
	if (!applied) return false;
	if (opts?.record !== false) plugin.undo.record(opts?.label ?? "Edit", rowId, inverse, opts?.batch);
	plugin.patchNote(file);
	return true;
}

/** Ensure every folder in `path`'s parent chain exists. */
export async function ensureParentFolders(app: App, path: string): Promise<void> {
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

/** A free `<stem>.md` path, suffixing ` 2`, ` 3`, … until one is unused. */
export function uniqueNotePath(app: App, stem: string): string {
	let path = normalizePath(`${stem}.md`);
	for (let i = 2; app.vault.getAbstractFileByPath(path) && i < 1000; i++) {
		path = normalizePath(`${stem} ${i}.md`);
	}
	return path;
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
	titleHint: string,
	extra?: Record<string, unknown>
): Promise<TFile> {
	const app = plugin.app;
	const cleanFolder = folder.trim().replace(/^[/\\]+|[/\\]+$/g, "");
	const stem = `${cleanFolder ? `${cleanFolder}/` : ""}${titleHint}`;
	const path = uniqueNotePath(app, stem);
	await ensureParentFolders(app, path);
	// Create the body first, then write the seed property through processFrontMatter.
	// The old hand-built `---\n${key}: ${JSON.stringify(value)}\n---` quoted the VALUE
	// but not the KEY: a property name the user configured with a colon, "#", quote,
	// or a leading !/&/* produced malformed YAML and the note loaded with NO
	// frontmatter (so it never appeared on its day/column). processFrontMatter escapes
	// both, and is the same write path every other mutation uses.
	const file = await app.vault.create(path, `# ${titleHint}\n`);
	let seeded = true;
	try {
		await app.fileManager.processFrontMatter(file, (frontmatter) => {
			const fm = frontmatter as Record<string, unknown>;
			// Template defaults first, so the column's own group value always wins a conflict.
			if (extra) for (const [k, v] of Object.entries(extra)) fm[k] = v;
			fm[key] = value;
		});
	} catch (error) {
		seeded = false;
		new Notice(`Bases Power Pack: created the note but couldn't set "${key}" (${String(error)}).`);
	}
	// Seed the snapshot with the frontmatter we just wrote — the metadata cache
	// hasn't indexed the new file yet, so a plain patch would see empty frontmatter
	// and the note wouldn't appear on its day/column immediately. But ONLY when the
	// write actually landed: seeding {key:value} for a failed write would flash a
	// phantom card in its column that vanishes the moment the real (empty) metadata
	// event re-snapshots the note.
	if (seeded) plugin.seedCreatedNote(file, { ...extra, [key]: value });
	else plugin.patchNote(file);
	await app.workspace.getLeaf("tab").openFile(file);
	return file;
}

export interface ResolvedView {
	rows: Row[];
	def: BaseDefinition;
	baseLabel: string | null;
	filterLabel: string | null;
	/** True when the rows are checkbox lines rather than whole notes — views use
	 * it to label themselves and to skip note-only affordances. */
	taskRows: boolean;
}

/**
 * Attach the body-derived and graph-derived data a note can carry: inline
 * `key:: value` fields, its task lines, and its links. Each is opt-in, and a
 * disabled feature leaves the field `undefined` so nothing downstream pays for
 * it — the note snapshot itself is untouched, so the shared cache stays valid.
 */
function enrichNotes(app: App, plugin: BasesPowerPackPlugin, notes: RawNote[]): RawNote[] {
	const s = plugin.settings;
	const wantsBody = s.inlineFields || s.rowSource === "tasks";
	const wantsLinks = s.linkTraversal;
	if (!wantsBody && !wantsLinks) return notes;

	const graph = wantsLinks ? plugin.getLinkGraph() : null;
	return notes.map((note) => {
		const entry = wantsBody ? plugin.bodyIndex.get(note.path) : undefined;
		const next: RawNote = { ...note };
		if (entry) {
			if (s.inlineFields) next.inline = entry.inline;
			// Tasks are attached for BOTH row sources on purpose: with task rows
			// they become the rows, and on a note board they power the computed
			// `file.taskCount` / `file.openTaskCount` properties. It costs a
			// reference, not a copy — the arrays already live in the body index.
			next.tasks = entry.tasks;
		}
		if (graph) next.links = linkProps(note.path, graph);
		return next;
	});
}

/**
 * Resolve the rows a view should render, honoring premium state:
 *   - Free: every markdown note, no base/filter/formulas.
 *   - Premium: the selected `.base` (filters + formulas) narrowed by the active
 *     saved filter, optionally over task lines, with inline fields, link
 *     traversal and FLATTEN applied.
 */
export async function resolveViewRows(
	app: App,
	plugin: BasesPowerPackPlugin
): Promise<ResolvedView> {
	const s = plugin.settings;

	if (!s.isPro) {
		const empty = emptyBaseDefinition();
		return {
			rows: resolveRows(plugin.getNotesSnapshot(), empty),
			def: empty,
			baseLabel: null,
			filterLabel: null,
			taskRows: false,
		};
	}

	// The body index is only built when a feature actually needs the note text.
	if (s.inlineFields || s.rowSource === "tasks") await plugin.bodyIndex.ensure();
	const notes = enrichNotes(app, plugin, plugin.getNotesSnapshot());

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

	const rows = resolveRows(notes, def, extra, {
		source: s.rowSource,
		taskOptions: { includeDone: s.taskIncludeDone, includeSubtasks: s.taskIncludeSubtasks },
		linkTraversal: s.linkTraversal,
		flatten: s.flattenExpression.trim()
			? { expression: s.flattenExpression, as: s.flattenAs, keepEmpty: s.flattenKeepEmpty }
			: null,
	});
	const baseLabel = s.activeBasePath ? s.activeBasePath.split("/").pop()!.replace(/\.base$/, "") : null;
	return { rows, def, baseLabel, filterLabel, taskRows: s.rowSource === "tasks" };
}

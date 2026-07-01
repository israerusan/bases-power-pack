import { App, TFile, getAllTags, parseYaml } from "obsidian";
import type BasesPowerPackPlugin from "../main";
import type { RawNote, Row } from "../model/row";
import { resolveRows } from "../bases/resolveRows";
import {
	emptyBaseDefinition,
	normalizeBaseDefinition,
	type BaseDefinition,
} from "../bases/baseDefinition";
import type { FilterNode } from "../query/filter";

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
	const notes = buildRawNotes(app);

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

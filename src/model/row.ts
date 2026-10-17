import { compileExpression, type EvalScope, type Value } from "../engine/expression";
import { traverseLink, type ScopeLookup } from "../query/linkIndex";
import type { TaskItem } from "../query/tasks";

/**
 * A normalized note as seen by the query engine: its frontmatter merged with
 * implicit `file.*` properties. Formula values are computed lazily and memoized
 * per-row through the scope, so filters and roll-ups can reference them.
 *
 * Three fields are optional because they come from the note BODY (or the link
 * graph) rather than Obsidian's synchronous metadata cache: `inline`, `tasks`
 * and `links` are filled in by the body index when the feature is enabled, and
 * absent otherwise. Everything downstream keeps working either way.
 */
export interface RawNote {
	path: string;
	name: string;
	folder: string;
	ext: string;
	tags: string[];
	ctime: number;
	mtime: number;
	size: number;
	frontmatter: Record<string, unknown>;
	/** Dataview-style `key:: value` fields parsed from the note body. */
	inline?: Record<string, unknown>;
	/** Checkbox lines in the body, when the task index is enabled. */
	tasks?: TaskItem[];
	/** Precomputed `file.inlinks` / `file.outlinks` etc. from the link graph. */
	links?: Record<string, unknown>;
}

export interface Row {
	id: string;
	name: string;
	note: RawNote;
	scope: EvalScope;
	/** Set on a row FLATTEN produced: it carries ONE element of a list, bound to
	 * `binding`. A write to the binding must edit that element, not the list. */
	flatten?: { binding: string; expression: string };
}

/** The exact set of implicit computed `file.*` accessors. A guard must test
 * membership here, NOT a `file.` name prefix — a note can legitimately carry a
 * flat frontmatter key like `file.type` (a dot in an unquoted YAML key is not
 * nesting), which is a real writable field, not a computed one. */
export const COMPUTED_FILE_PROPS: ReadonlySet<string> = new Set([
	"file.name",
	"file.path",
	"file.folder",
	"file.ext",
	"file.tags",
	"file.ctime",
	"file.mtime",
	"file.size",
	"file.inlinks",
	"file.outlinks",
	"file.inlinkCount",
	"file.outlinkCount",
	"file.taskCount",
	"file.doneTaskCount",
	"file.openTaskCount",
]);

function fileProps(note: RawNote): Record<string, unknown> {
	const props: Record<string, unknown> = {
		"file.name": note.name,
		"file.path": note.path,
		"file.folder": note.folder,
		"file.ext": note.ext,
		"file.tags": note.tags,
		"file.ctime": note.ctime,
		"file.mtime": note.mtime,
		"file.size": note.size,
	};
	if (note.links) Object.assign(props, note.links);
	if (note.tasks) {
		const done = note.tasks.filter((t) => t.done).length;
		props["file.taskCount"] = note.tasks.length;
		props["file.doneTaskCount"] = done;
		props["file.openTaskCount"] = note.tasks.length - done;
	}
	return props;
}

/** Extra wiring a scope may be given: link traversal across notes. */
export interface ScopeContext {
	/** Resolve a wikilink target (basename or path) to that note's scope, so
	 * `project.status` can read the LINKED note's property. */
	lookup?: ScopeLookup;
}

/**
 * Build an evaluation scope for a note. `formulas` (name→expression) become
 * resolvable identifiers computed on demand, with cycle protection so a
 * self-referential formula yields null instead of blowing the stack.
 *
 * Resolution order, highest first:
 *   1. frontmatter — explicit, structured, and what Bases itself reads
 *   2. inline `key:: value` fields from the body
 *   3. computed `file.*` properties
 *   4. named formulas
 *   5. `link.property` traversal through the link graph (when a context is given)
 */
export function makeScope(
	note: RawNote,
	formulas: Record<string, string> = {},
	ctx?: ScopeContext,
	overlay?: Record<string, unknown>
): EvalScope {
	const base = { ...(note.inline ?? {}), ...note.frontmatter, ...fileProps(note), ...overlay };
	const memo = new Map<string, Value>();
	const inProgress = new Set<string>();

	const scope: EvalScope = {
		get(name: string): unknown {
			if (name in base) return base[name];
			if (name in formulas) {
				if (memo.has(name)) return memo.get(name);
				if (inProgress.has(name)) return null; // cycle guard
				inProgress.add(name);
				let result: Value = null;
				try {
					result = compileExpression(formulas[name]).eval(scope);
				} catch {
					result = null;
				}
				inProgress.delete(name);
				memo.set(name, result);
				return result;
			}
			// `project.status` — follow the link held in `project` and read the
			// target note's property. Only reached when nothing above matched, so a
			// real flat key named `a.b` always wins over a traversal.
			if (ctx?.lookup && name.includes(".")) {
				return traverseLink(scope, name, ctx.lookup);
			}
			return undefined;
		},
	};
	return scope;
}

/** `overlay` shadows every other source (it carries a FLATTEN binding), and
 * because it goes into the same base map, formulas resolve against it too. */
export function makeRow(
	note: RawNote,
	formulas: Record<string, string> = {},
	ctx?: ScopeContext,
	overlay?: Record<string, unknown>
): Row {
	return { id: note.path, name: note.name, note, scope: makeScope(note, formulas, ctx, overlay) };
}

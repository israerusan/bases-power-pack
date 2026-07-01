import { compileExpression, type EvalScope, type Value } from "../engine/expression";

/**
 * A normalized note as seen by the query engine: its frontmatter merged with
 * implicit `file.*` properties. Formula values are computed lazily and memoized
 * per-row through the scope, so filters and roll-ups can reference them.
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
}

export interface Row {
	id: string;
	name: string;
	note: RawNote;
	scope: EvalScope;
}

function fileProps(note: RawNote): Record<string, unknown> {
	return {
		"file.name": note.name,
		"file.path": note.path,
		"file.folder": note.folder,
		"file.ext": note.ext,
		"file.tags": note.tags,
		"file.ctime": note.ctime,
		"file.mtime": note.mtime,
		"file.size": note.size,
	};
}

/**
 * Build an evaluation scope for a note. `formulas` (name→expression) become
 * resolvable identifiers computed on demand, with cycle protection so a
 * self-referential formula yields null instead of blowing the stack.
 */
export function makeScope(note: RawNote, formulas: Record<string, string> = {}): EvalScope {
	const base = { ...note.frontmatter, ...fileProps(note) };
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
			return undefined;
		},
	};
	return scope;
}

export function makeRow(note: RawNote, formulas: Record<string, string> = {}): Row {
	return { id: note.path, name: note.name, note, scope: makeScope(note, formulas) };
}

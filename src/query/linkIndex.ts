/**
 * The vault's link graph, as queryable properties.
 *
 * Dataview exposes `file.inlinks` / `file.outlinks` and lets a query hop
 * through a link to read the TARGET note's metadata (`project.status`). Bases
 * has neither, which is why "show me everything blocking this epic" or "group
 * tasks by their project's phase" can't be expressed there at all.
 *
 * This module is the pure half: invert an adjacency map into backlinks, and
 * resolve a dotted `link.property` path. The Obsidian half (feeding it
 * `metadataCache.resolvedLinks`) lives in `viewData.ts`.
 */

import type { EvalScope } from "../engine/expression";
import { parseLinks } from "./relations";

/** `src path → { dest path → count }`, the shape Obsidian's resolvedLinks uses. */
export type Adjacency = Record<string, Record<string, number>>;

export interface LinkGraph {
	/** Note paths this note links TO. */
	outlinks: Map<string, string[]>;
	/** Note paths that link to this note. */
	inlinks: Map<string, string[]>;
}

/**
 * Build the forward and reverse link maps in one pass. Unresolved links (ones
 * pointing at a note that doesn't exist) are absent from `resolvedLinks` and so
 * are absent here too — matching Dataview, where `file.outlinks` lists real
 * targets.
 */
export function buildLinkGraph(resolved: Adjacency): LinkGraph {
	const outlinks = new Map<string, string[]>();
	const inlinks = new Map<string, string[]>();
	for (const [src, targets] of Object.entries(resolved)) {
		const list = Object.keys(targets);
		outlinks.set(src, list);
		for (const dest of list) {
			const arr = inlinks.get(dest);
			if (arr) arr.push(src);
			else inlinks.set(dest, [src]);
		}
	}
	return { outlinks, inlinks };
}

/**
 * A per-row view of the graph, as the plain string arrays the expression engine
 * understands. Basenames are included alongside full paths so both
 * `contains(file.outlinks, "Project A")` and a path comparison work.
 */
export function linkProps(path: string, graph: LinkGraph): Record<string, unknown> {
	const out = graph.outlinks.get(path) ?? [];
	const inc = graph.inlinks.get(path) ?? [];
	return {
		"file.outlinks": withBasenames(out),
		"file.inlinks": withBasenames(inc),
		"file.inlinkCount": inc.length,
		"file.outlinkCount": out.length,
	};
}

function basename(path: string): string {
	return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

/** Paths plus their basenames, de-duplicated, paths first. Dedup goes through a
 * Set: `Array.includes` in the loop is quadratic, and a hub note with hundreds
 * of backlinks is exactly where this runs. */
function withBasenames(paths: readonly string[]): string[] {
	const seen = new Set<string>(paths);
	const out: string[] = [...paths];
	for (const p of paths) {
		const b = basename(p);
		if (seen.has(b)) continue;
		seen.add(b);
		out.push(b);
	}
	return out;
}

/** Resolves a note reference (basename or path) to that note's scope. */
export type ScopeLookup = (nameOrPath: string) => EvalScope | undefined;

/** How deep `a.b.c.d` traversal may hop before giving up. Also the guard
 * against a link cycle (A links B links A) spinning forever. */
export const MAX_LINK_HOPS = 4;

/**
 * Live nesting depth, counted across re-entry.
 *
 * The `hops` argument alone is not enough: resolving `rest` goes back through
 * the target note's own scope, which starts a FRESH traversal with a full
 * budget. For a long dotted name that branches two ways per segment, so the
 * work is exponential in the number of dots. A shared counter caps the real
 * nesting regardless of how the recursion is entered. Evaluation is
 * synchronous and single-threaded, so a module-level counter is safe; the
 * `finally` guarantees it unwinds even if a scope getter throws.
 */
let activeDepth = 0;

/**
 * Resolve a dotted path like `project.status` by following the FIRST link held
 * in `project` and reading `status` off the target note. Returns `undefined`
 * when the head isn't a link, the target isn't in the vault, or the hop budget
 * is spent — never throws, so a typo degrades to an empty column rather than a
 * broken view.
 */
export function traverseLink(
	scope: EvalScope,
	dotted: string,
	lookup: ScopeLookup,
	hops = MAX_LINK_HOPS
): unknown {
	if (hops <= 0 || activeDepth >= MAX_LINK_HOPS) return undefined;
	const dot = dotted.indexOf(".");
	if (dot <= 0 || dot === dotted.length - 1) return undefined;
	const head = dotted.slice(0, dot);
	const rest = dotted.slice(dot + 1);

	const raw = scope.get(head);
	if (raw === undefined || raw === null) return undefined;
	const names = parseLinks(raw);
	if (names.length === 0) return undefined;

	const target = lookup(names[0]);
	if (!target) return undefined;

	activeDepth++;
	try {
		const direct = target.get(rest);
		if (direct !== undefined) return direct;
		// `project.owner.email` — keep hopping. Only worth attempting when `rest`
		// is itself dotted; otherwise traverseLink would bail immediately, and in
		// production the target's own scope has already tried the dotted path.
		return rest.includes(".") ? traverseLink(target, rest, lookup, hops - 1) : undefined;
	} finally {
		activeDepth--;
	}
}

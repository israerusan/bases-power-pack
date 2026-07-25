import { toStr } from "../engine/expression";
import type { Row } from "../model/row";

/**
 * Pure link-relation helpers (DOM-free, unit-tested) for card dependencies and parent /
 * child (subtask) relationships, so both the standalone board and the native Bases board
 * resolve them the same way.
 *
 * Links are matched by note BASENAME (case-insensitive) against the board's own rows — no
 * app/metadataCache dependency — so the same result is reproducible in a test.
 */

/**
 * Parse a relation property value into referenced note basenames. Accepts a string, a
 * comma-separated string, or an array; strips `[[ ]]` wikilink brackets, a `path|alias`
 * (keeps the link TARGET, not the alias), a `folder/name` path, and a trailing `.md`.
 */
export function parseLinks(value: unknown): string[] {
	const parts = Array.isArray(value) ? (value as unknown[]).map((v) => toStr(v)) : toStr(value).split(",");
	return parts
		.map((p) => p.trim().replace(/^\[\[/, "").replace(/\]\]$/, "").trim())
		.map((p) => (p.includes("|") ? (p.split("|")[0] ?? p) : p)) // link target, not alias
		.map((p) => (p.split(/[/\\]/).pop() ?? p).replace(/\.md$/i, "").trim())
		.filter(Boolean);
}

/** Index rows by lower-cased basename for link resolution (last wins on a name clash). */
export function indexByName(rows: readonly Row[]): Map<string, Row> {
	const map = new Map<string, Row>();
	for (const row of rows) map.set(row.name.toLowerCase(), row);
	return map;
}

/**
 * The UNMET blockers of `row`: the notes its `dependsProp` links to that resolve to a
 * board row which is NOT done. A dependency that resolves to nothing on the board, or to a
 * done row, or to itself, is ignored — so the returned list is exactly "what's still
 * blocking this card". De-duplicated, in link order.
 */
export function computeBlockers(
	row: Row,
	dependsProp: string,
	byName: Map<string, Row>,
	isDone: (r: Row) => boolean
): Row[] {
	const out: Row[] = [];
	const seen = new Set<string>();
	for (const name of parseLinks(row.scope.get(dependsProp))) {
		const dep = byName.get(name.toLowerCase());
		if (dep && dep.id !== row.id && !seen.has(dep.id) && !isDone(dep)) {
			seen.add(dep.id);
			out.push(dep);
		}
	}
	return out;
}

/** The direct children of `parent`: board rows whose `parentProp` links back to it (by
 * basename). Excludes the parent itself. Order follows `rows`. */
export function childrenOf(parent: Row, parentProp: string, rows: readonly Row[]): Row[] {
	const pname = parent.name.toLowerCase();
	return rows.filter(
		(r) => r.id !== parent.id && parseLinks(r.scope.get(parentProp)).some((n) => n.toLowerCase() === pname)
	);
}

/**
 * Index every row under each parent basename it links to via `parentProp` — one O(rows)
 * pass, so a board can look up a card's children in O(1) instead of re-scanning all rows
 * per card (O(rows²)). Keyed by lower-cased parent basename; a row can appear under
 * multiple parents. Look up `map.get(parent.name.toLowerCase())` (then drop the parent's
 * own id for a self-link).
 */
export function indexChildren(rows: readonly Row[], parentProp: string): Map<string, Row[]> {
	const map = new Map<string, Row[]>();
	for (const row of rows) {
		for (const pname of parseLinks(row.scope.get(parentProp))) {
			const key = pname.toLowerCase();
			const arr = map.get(key);
			if (arr) arr.push(row);
			else map.set(key, [row]);
		}
	}
	return map;
}

/** Completed-vs-total count over a child set, for the subtask progress chip. */
export function childStats(children: readonly Row[], isDone: (r: Row) => boolean): { done: number; total: number } {
	let done = 0;
	for (const c of children) if (isDone(c)) done++;
	return { done, total: children.length };
}

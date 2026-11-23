import { toStr } from "../engine/expression";
import { parseLinks } from "./relations";

/**
 * Pure dependency-link logic for the Gantt view (DOM-free, unit-tested): which arrows to
 * draw, which of them break the schedule, whether a new link would close a cycle, and
 * how to add/remove a link in a frontmatter value WITHOUT disturbing the user's schema.
 *
 * Semantics are finish-to-start: a row's dependency property lists its PREDECESSORS, and
 * the predecessor must finish before the successor may start. Links resolve by note
 * basename (case-insensitive), exactly like the Kanban Blocked badge (query/relations),
 * so both views agree on what a dependency points at.
 */

export interface LinkNode {
	id: string;
	name: string;
	/** Raw value of the dependency property on this row (string, list, or empty). */
	deps: unknown;
	/** False for rows a [[link]] can't point at (a task line, a FLATTEN element): they
	 * can HAVE predecessors but are never resolved AS one. Default true. */
	target?: boolean;
}

/** A predecessor → successor edge, by row id. */
export interface DependencyEdge {
	from: string;
	to: string;
}

export function edgeKey(edge: DependencyEdge): string {
	return `${edge.from}\u0000${edge.to}`;
}

/**
 * Every resolvable dependency edge among `nodes`. Links to notes that aren't in the set,
 * self-links, and duplicates are dropped. On a basename clash the LAST node wins — the
 * same rule as relations.indexByName, so the Gantt and the Kanban never disagree.
 */
export function buildDependencyEdges(nodes: readonly LinkNode[]): DependencyEdge[] {
	const byName = new Map<string, string>();
	for (const n of nodes) if (n.target !== false) byName.set(n.name.toLowerCase(), n.id);
	const out: DependencyEdge[] = [];
	const seen = new Set<string>();
	for (const n of nodes) {
		for (const name of parseLinks(n.deps)) {
			const from = byName.get(name.toLowerCase());
			if (!from || from === n.id) continue;
			const edge = { from, to: n.id };
			const key = edgeKey(edge);
			if (seen.has(key)) continue;
			seen.add(key);
			out.push(edge);
		}
	}
	return out;
}

/**
 * Would adding `from → to` close a cycle? True when `to` already reaches `from` along
 * existing edges (or when it's a self-link). Iterative DFS — no recursion-depth limit on
 * a long chain.
 */
export function wouldCreateCycle(edges: readonly DependencyEdge[], from: string, to: string): boolean {
	if (from === to) return true;
	const next = new Map<string, string[]>();
	for (const e of edges) {
		const arr = next.get(e.from);
		if (arr) arr.push(e.to);
		else next.set(e.from, [e.to]);
	}
	const stack = [to];
	const visited = new Set<string>();
	while (stack.length > 0) {
		const cur = stack.pop() as string;
		if (cur === from) return true;
		if (visited.has(cur)) continue;
		visited.add(cur);
		for (const n of next.get(cur) ?? []) stack.push(n);
	}
	return false;
}

/**
 * Edges whose successor starts on or before the day its predecessor finishes. Gantt end
 * dates are inclusive (a task ending the 5th works through the 5th), so a successor
 * starting the 5th already overlaps. Rows without dates on the axis are skipped — a
 * missing date isn't a conflict we can prove.
 */
export function scheduleConflicts(
	edges: readonly DependencyEdge[],
	dates: ReadonlyMap<string, { startDay: number; endDay: number }>
): Set<string> {
	const out = new Set<string>();
	for (const e of edges) {
		const pred = dates.get(e.from);
		const succ = dates.get(e.to);
		if (pred && succ && succ.startDay <= pred.endDay) out.add(edgeKey(e));
	}
	return out;
}

/** The wikilink written for a new dependency on note `name`. */
export function dependencyLink(name: string): string {
	return `[[${name}]]`;
}

/** Split a dependency value into its entries, keeping each entry's original text. */
function entriesOf(raw: unknown): string[] {
	if (raw === undefined || raw === null) return [];
	if (Array.isArray(raw)) return (raw as unknown[]).map((v) => toStr(v)).filter((s) => s.trim() !== "");
	return toStr(raw)
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

function targetOf(entry: string): string {
	return (parseLinks(entry)[0] ?? "").toLowerCase();
}

/**
 * The dependency value with a link to `name` added. Existing entries are kept VERBATIM
 * (their wikilink/path/alias form is the user's schema); the result is always a list so a
 * single-link string becomes a proper multi-value property. Returns null when `name` is
 * already listed (nothing to write).
 */
export function addDependency(raw: unknown, name: string): string[] | null {
	const entries = entriesOf(raw);
	const want = name.toLowerCase();
	if (entries.some((e) => targetOf(e) === want)) return null;
	return [...entries, dependencyLink(name)];
}

/**
 * The dependency value with every link to `name` removed, other entries kept verbatim.
 * Returns null when `name` isn't listed (nothing to write).
 */
export function removeDependency(raw: unknown, name: string): string[] | null {
	const entries = entriesOf(raw);
	const want = name.toLowerCase();
	const kept = entries.filter((e) => targetOf(e) !== want);
	return kept.length === entries.length ? null : kept;
}

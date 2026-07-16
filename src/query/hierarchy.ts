/**
 * Hierarchy / Outline core — the pure forest logic behind the premium Outline
 * view. Notes are linked into a tree by a single frontmatter property holding
 * the vault-relative PATH of the parent note (default `parent`). This module is
 * DOM-free and side-effect free so tree building, cycle/missing quarantine,
 * flattening by expansion, reparent validation, branch metrics, and rename
 * retargeting are all unit-tested without a vault; the view is a thin renderer
 * over it and applies reparents through the shared transactional write + undo
 * path.
 *
 * Frozen v1.9 semantics:
 *  - Parent reference is a vault-relative path ONLY (no basename/wikilink modes).
 *  - A parent that exists in the vault but is filtered out of the current row set
 *    becomes a non-editable GHOST placeholder so its visible children still nest.
 *  - A parent path that resolves to nothing is a MISSING parent: the node is a
 *    root, flagged, and never silently re-rooted under something else.
 *  - A self- or ancestor-cycle is quarantined: the node is flagged and shown as a
 *    root so rendering can never recurse forever.
 *  - Branch metrics are descendant count + done/total leaves + progress only.
 */

export interface HierInput {
	/** The note's vault path (its identity). */
	id: string;
	name: string;
	/** Resolved parent path, or null when the note has no parent set. */
	parentRef: string | null;
	/** Optional sibling ordering key; nodes without one sort after by name. */
	order: number | null;
	/** Whether this note counts as "done" for progress roll-ups. */
	done: boolean;
}

export interface BranchMetrics {
	/** Non-ghost descendants (excludes the node itself). */
	descendantCount: number;
	/** Leaf tasks in the subtree (a node with children is not itself a leaf). */
	leafTotal: number;
	leafDone: number;
	/** leafDone/leafTotal as a 0–100 percentage, or null when there are no leaves. */
	progress: number | null;
}

export interface HierNode {
	id: string;
	name: string;
	parentRef: string | null;
	/** Whether this note counts as "done" for progress roll-ups (ghosts never do). */
	done: boolean;
	children: HierNode[];
	/** A placeholder for a parent that exists but is filtered out of the row set. */
	ghost: boolean;
	/** The parent path didn't resolve to any note (deleted / typo). */
	missingParent: boolean;
	/** This node is part of a parent cycle and was quarantined at the root. */
	cycle: boolean;
	metrics: BranchMetrics;
}

export interface FlatRow {
	id: string;
	name: string;
	depth: number;
	hasChildren: boolean;
	collapsed: boolean;
	ghost: boolean;
	missingParent: boolean;
	cycle: boolean;
	metrics: BranchMetrics;
}

/** Basename of a path, minus a trailing `.md`, for a ghost placeholder label. */
export function baseName(path: string): string {
	const tail = path.split("/").pop() ?? path;
	return tail.replace(/\.md$/i, "");
}

/**
 * Clean a raw frontmatter parent value into a comparable path. Strips a wrapping
 * `[[...]]`, an `|alias`, and surrounding whitespace, and normalizes to forward
 * slashes. If the cleaned value (optionally with `.md`) is a known vault path it
 * is returned; otherwise the cleaned value is returned as-is so an unresolved
 * reference can still be detected as a missing parent. Empty → null.
 */
export function resolveParentRef(raw: unknown, knownPaths: Set<string>): string | null {
	if (typeof raw !== "string") return null;
	let s = raw.trim();
	if (!s) return null;
	const link = /^\[\[(.+?)\]\]$/.exec(s);
	if (link) s = link[1];
	const bar = s.indexOf("|");
	if (bar !== -1) s = s.slice(0, bar);
	s = s.trim().replace(/\\/g, "/").replace(/^\/+/, "");
	if (!s) return null;
	if (knownPaths.has(s)) return s;
	if (!/\.md$/i.test(s) && knownPaths.has(`${s}.md`)) return `${s}.md`;
	return s;
}

function emptyMetrics(): BranchMetrics {
	return { descendantCount: 0, leafTotal: 0, leafDone: 0, progress: 0 };
}

function makeNode(input: HierInput): HierNode {
	return {
		id: input.id,
		name: input.name,
		parentRef: input.parentRef,
		done: input.done,
		children: [],
		ghost: false,
		missingParent: false,
		cycle: false,
		metrics: emptyMetrics(),
	};
}

function makeGhost(path: string): HierNode {
	return {
		id: path,
		name: baseName(path),
		parentRef: null,
		done: false,
		children: [],
		ghost: true,
		missingParent: false,
		cycle: false,
		metrics: emptyMetrics(),
	};
}

export interface Forest {
	roots: HierNode[];
	/** Every real (non-ghost) node by id, for reparent validation and flattening. */
	byId: Map<string, HierNode>;
}

/**
 * Build a forest from the (already filtered) input rows. `knownPaths` is the set
 * of all note paths in the vault so a filtered-out-but-existing parent can be
 * told apart from a truly missing one.
 */
export function buildForest(inputs: HierInput[], knownPaths: Set<string> = new Set()): Forest {
	const byId = new Map<string, HierNode>();
	for (const input of inputs) byId.set(input.id, makeNode(input));

	// Flag cycles first: walk each node's parent chain within the visible set; a
	// repeat means this node sits on a cycle. Such nodes are quarantined as roots.
	const cyclic = new Set<string>();
	for (const input of inputs) {
		const seen = new Set<string>();
		let cur: string | null = input.id;
		while (cur !== null) {
			if (seen.has(cur)) {
				cyclic.add(input.id);
				break;
			}
			seen.add(cur);
			const node = byId.get(cur);
			const p: string | null = node ? node.parentRef : null;
			cur = p !== null && byId.has(p) ? p : null;
		}
	}

	const roots: HierNode[] = [];
	const ghosts = new Map<string, HierNode>();

	for (const input of inputs) {
		const node = byId.get(input.id)!;
		if (cyclic.has(input.id)) {
			node.cycle = true;
			roots.push(node);
			continue;
		}
		const p = node.parentRef;
		if (p === null) {
			roots.push(node);
			continue;
		}
		const parent = byId.get(p);
		if (parent) {
			parent.children.push(node);
			continue;
		}
		if (knownPaths.has(p)) {
			let ghost = ghosts.get(p);
			if (!ghost) {
				ghost = makeGhost(p);
				ghosts.set(p, ghost);
				roots.push(ghost);
			}
			ghost.children.push(node);
		} else {
			node.missingParent = true;
			roots.push(node);
		}
	}

	for (const root of roots) computeMetrics(root);
	return { roots, byId };
}

/** Post-order roll-up of branch metrics; leaves (non-ghost, no children) count. */
function computeMetrics(node: HierNode): BranchMetrics {
	if (node.children.length === 0) {
		const isLeafTask = !node.ghost;
		node.metrics = {
			descendantCount: 0,
			leafTotal: isLeafTask ? 1 : 0,
			leafDone: isLeafTask && node.done ? 1 : 0,
			progress: isLeafTask ? (node.done ? 100 : 0) : null,
		};
		return node.metrics;
	}
	let descendantCount = 0;
	let leafTotal = 0;
	let leafDone = 0;
	for (const child of node.children) {
		const m = computeMetrics(child);
		descendantCount += (child.ghost ? 0 : 1) + m.descendantCount;
		leafTotal += m.leafTotal;
		leafDone += m.leafDone;
	}
	node.metrics = {
		descendantCount,
		leafTotal,
		leafDone,
		progress: leafTotal > 0 ? Math.round((leafDone / leafTotal) * 100) : null,
	};
	return node.metrics;
}

/**
 * Sibling comparison: explicit order first (missing order sorts last), then name
 * (case-insensitive), then path — a total, stable order.
 */
export function compareSiblings(a: HierNode, b: HierNode, orderOf: (id: string) => number | null): number {
	const ao = orderOf(a.id);
	const bo = orderOf(b.id);
	const av = ao === null ? Number.POSITIVE_INFINITY : ao;
	const bv = bo === null ? Number.POSITIVE_INFINITY : bo;
	if (av !== bv) return av - bv;
	const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
	if (byName !== 0) return byName;
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Flatten the forest to the visible rows in display order, hiding the descendants
 * of any collapsed node. A safety `maxDepth` bounds recursion even if a malformed
 * structure slipped past cycle quarantine.
 */
export function flattenForest(
	forest: Forest,
	collapsed: Set<string>,
	orderOf: (id: string) => number | null = () => null,
	maxDepth = 100
): FlatRow[] {
	const out: FlatRow[] = [];
	const walk = (nodes: HierNode[], depth: number): void => {
		if (depth > maxDepth) return;
		const sorted = [...nodes].sort((a, b) => compareSiblings(a, b, orderOf));
		for (const node of sorted) {
			const hasChildren = node.children.length > 0;
			const isCollapsed = collapsed.has(node.id);
			out.push({
				id: node.id,
				name: node.name,
				depth,
				hasChildren,
				collapsed: isCollapsed,
				ghost: node.ghost,
				missingParent: node.missingParent,
				cycle: node.cycle,
				metrics: node.metrics,
			});
			if (hasChildren && !isCollapsed) walk(node.children, depth + 1);
		}
	};
	walk(forest.roots, 0);
	return out;
}

/** True when `ancestorId` is `nodeId` itself or one of its ancestors. */
export function isAncestorOrSelf(ancestorId: string, nodeId: string, byId: Map<string, HierNode>): boolean {
	let cur: string | null = nodeId;
	const seen = new Set<string>();
	while (cur !== null) {
		if (cur === ancestorId) return true;
		if (seen.has(cur)) return false;
		seen.add(cur);
		const node = byId.get(cur);
		cur = node ? node.parentRef : null;
	}
	return false;
}

export interface ReparentCheck {
	ok: boolean;
	reason?: string;
}

/**
 * Validate reparenting `childId` under `newParentId` (null = make it a root). A
 * note can't be its own parent, and can't move under one of its own descendants
 * (that would create a cycle). A no-op (already that parent) is rejected so the
 * caller skips a pointless write.
 */
export function canReparent(
	childId: string,
	newParentId: string | null,
	byId: Map<string, HierNode>
): ReparentCheck {
	const child = byId.get(childId);
	if (!child) return { ok: false, reason: "unknown note" };
	if (newParentId === null) {
		return child.parentRef === null ? { ok: false, reason: "already a root" } : { ok: true };
	}
	if (childId === newParentId) return { ok: false, reason: "a note can't be its own parent" };
	if (child.parentRef === newParentId) return { ok: false, reason: "already there" };
	if (!byId.has(newParentId)) return { ok: false, reason: "unknown parent" };
	if (isAncestorOrSelf(childId, newParentId, byId)) {
		return { ok: false, reason: "can't move a note under its own descendant" };
	}
	return { ok: true };
}

/**
 * The ids of notes whose parent reference points at `oldPath` — the children to
 * retarget to `newPath` when the parent note is renamed/moved, so the tree
 * survives the rename. Pure over the input rows.
 */
export function childrenToRetarget(oldPath: string, newPath: string, inputs: HierInput[]): string[] {
	if (!oldPath || oldPath === newPath) return [];
	return inputs.filter((i) => i.parentRef === oldPath).map((i) => i.id);
}

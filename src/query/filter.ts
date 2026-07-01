import { evaluateSafe, toBool, type EvalScope } from "../engine/expression";

/**
 * A filter node mirrors the shape Obsidian Bases stores in a `.base` file:
 * either a single condition string, or a boolean combinator over child nodes.
 * A bare array is treated as an implicit AND (also what Bases does).
 */
export type FilterNode =
	| string
	| { and: FilterNode[] }
	| { or: FilterNode[] }
	| { not: FilterNode }
	| FilterNode[]
	| null
	| undefined;

/** Evaluate a filter node against a row scope. Missing/empty filter → true. */
export function evaluateFilter(node: FilterNode, scope: EvalScope): boolean {
	if (node === null || node === undefined) return true;

	if (typeof node === "string") {
		if (node.trim().length === 0) return true;
		return toBool(evaluateSafe(node, scope));
	}

	if (Array.isArray(node)) {
		return node.every((child) => evaluateFilter(child, scope));
	}

	if ("and" in node && Array.isArray(node.and)) {
		return node.and.every((child) => evaluateFilter(child, scope));
	}
	if ("or" in node && Array.isArray(node.or)) {
		return node.or.some((child) => evaluateFilter(child, scope));
	}
	if ("not" in node) {
		return !evaluateFilter(node.not, scope);
	}
	return true;
}

/** Combine two filter nodes with AND, dropping empties. */
export function andFilters(a: FilterNode, b: FilterNode): FilterNode {
	const parts: FilterNode[] = [];
	if (a !== null && a !== undefined && a !== "") parts.push(a);
	if (b !== null && b !== undefined && b !== "") parts.push(b);
	if (parts.length === 0) return null;
	if (parts.length === 1) return parts[0];
	return { and: parts };
}

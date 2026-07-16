import { toNumber, toStr } from "../engine/expression";
import type { Row } from "../model/row";
import { rowMatchesText } from "./search";

export type KanbanSort = "manual" | "name-asc" | "name-desc" | "due-asc" | "priority-desc" | "mtime-desc";
export type KanbanMetaField = "due" | "priority" | "owner" | "tags" | "file.folder";

export interface BuildKanbanColumnsOptions {
	groupBy: string;
	search?: string;
	hideColumn?: string;
	sortBy?: KanbanSort;
	/** User-added column values that should appear even with no rows yet, so they
	 * are droppable targets. Skipped while a search is active. */
	extraColumns?: string[];
	/** Explicit left-to-right column order (by value). Columns not listed keep
	 * their natural order after the listed ones. */
	columnOrder?: string[];
}

export interface KanbanColumn {
	name: string;
	rows: Row[];
}

export function buildKanbanColumns(rows: Row[], options: BuildKanbanColumnsOptions): KanbanColumn[] {
	const groupBy = options.groupBy || "status";
	const search = normalize(options.search);
	const hidden = normalize(options.hideColumn);
	const columns = new Map<string, Row[]>();

	for (const row of rows) {
		const columnName = toStr(row.scope.get(groupBy));
		if (!columnName) continue;
		if (hidden && normalize(columnName) === hidden) continue;
		if (search && !matchesSearch(row, search, columnName)) continue;
		if (!columns.has(columnName)) columns.set(columnName, []);
		columns.get(columnName)?.push(row);
	}

	// Empty user-added columns only make sense on the unfiltered board.
	if (!search) {
		for (const name of options.extraColumns ?? []) {
			const clean = name.trim();
			if (!clean || columns.has(clean)) continue;
			if (hidden && normalize(clean) === hidden) continue;
			columns.set(clean, []);
		}
	}

	const entries = Array.from(columns.entries());
	const order = options.columnOrder ?? [];
	if (order.length > 0) {
		const rank = new Map(order.map((name, index) => [name, index]));
		// Stable sort: listed columns by their rank, everything else keeps insertion order after.
		entries.sort((a, b) => (rank.get(a[0]) ?? Infinity) - (rank.get(b[0]) ?? Infinity));
	}

	return entries.map(([name, items]) => ({
		name,
		rows: sortRows(items, options.sortBy ?? "manual"),
	}));
}

/** Move `moved` to sit immediately before `target` in the column order. Returns a
 * new array; a no-op (same value, or unknown target) returns a copy unchanged. */
export function reorderColumns(order: string[], moved: string, target: string): string[] {
	if (moved === target) return [...order];
	const without = order.filter((name) => name !== moved);
	const targetIndex = without.indexOf(target);
	if (targetIndex === -1) return [...order];
	without.splice(targetIndex, 0, moved);
	return without;
}

/** Stable hue (0–359) for a column value, so a given status always gets the same
 * color across renders without any configuration. */
export function columnHue(name: string): number {
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
	}
	return hash % 360;
}

export function getCardMeta(row: Row, fields: string[]): string[] {
	const lines: string[] = [];
	for (const field of fields) {
		const formatted = formatCardField(row, field);
		if (formatted) lines.push(`${field}: ${formatted}`);
	}
	return lines;
}

function matchesSearch(row: Row, search: string, columnName: string): boolean {
	// The shared matcher covers name/path/folder/tags; the column value is a
	// Kanban-only haystack passed as an extra.
	return rowMatchesText(row, search, [columnName]);
}

function sortRows(rows: Row[], sortBy: KanbanSort): Row[] {
	const copy = [...rows];
	if (sortBy === "manual") return copy;
	copy.sort((a, b) => compareRows(a, b, sortBy));
	return copy;
}

function compareRows(a: Row, b: Row, sortBy: KanbanSort): number {
	switch (sortBy) {
		case "name-asc":
			return compareText(a.name, b.name);
		case "name-desc":
			return compareText(b.name, a.name);
		case "due-asc":
			return compareDateValue(a.scope.get("due"), b.scope.get("due")) || compareText(a.name, b.name);
		case "priority-desc":
			return compareNumberValue(b.scope.get("priority"), a.scope.get("priority")) || compareText(a.name, b.name);
		case "mtime-desc":
			return compareNumberValue(b.scope.get("file.mtime"), a.scope.get("file.mtime")) || compareText(a.name, b.name);
		default:
			return 0;
	}
}

function compareText(a: string, b: string): number {
	return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function compareNumberValue(a: unknown, b: unknown): number {
	const av = numberOrNull(a);
	const bv = numberOrNull(b);
	if (av === null && bv === null) return 0;
	if (av === null) return 1;
	if (bv === null) return -1;
	return av - bv;
}

function compareDateValue(a: unknown, b: unknown): number {
	const av = timeOrNull(a);
	const bv = timeOrNull(b);
	if (av === null && bv === null) return 0;
	if (av === null) return 1;
	if (bv === null) return -1;
	return av - bv;
}

function timeOrNull(value: unknown): number | null {
	if (typeof value !== "string" || !value.trim()) return null;
	const time = Date.parse(value);
	return Number.isFinite(time) ? time : null;
}

function numberOrNull(value: unknown): number | null {
	if (value === undefined || value === null || value === "") return null;
	const n = toNumber(value);
	return Number.isFinite(n) ? n : null;
}

/** Display string for one card field, or null when the value is empty. */
export function formatCardField(row: Row, field: string): string | null {
	const value = row.scope.get(field);
	if (value === undefined || value === null || value === "") return null;
	if (Array.isArray(value)) {
		const parts = value.map((item) => toStr(item)).filter(Boolean);
		return parts.length > 0 ? parts.join(", ") : null;
	}
	return toStr(value) || null;
}

function normalize(value: unknown): string {
	return toStr(value).trim().toLocaleLowerCase();
}

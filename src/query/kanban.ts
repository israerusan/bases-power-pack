import { toNumber, toStr } from "../engine/expression";
import type { Row } from "../model/row";

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

	return Array.from(columns.entries()).map(([name, items]) => ({
		name,
		rows: sortRows(items, options.sortBy ?? "manual"),
	}));
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
		const formatted = formatField(row, field);
		if (formatted) lines.push(`${field}: ${formatted}`);
	}
	return lines;
}

function matchesSearch(row: Row, search: string, columnName: string): boolean {
	const haystacks = [
		row.name,
		row.note.path,
		row.note.folder,
		columnName,
		...row.note.tags,
	];
	return haystacks.some((value) => normalize(value).includes(search));
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

function formatField(row: Row, field: string): string | null {
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

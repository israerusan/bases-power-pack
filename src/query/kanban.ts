import { toBool, toNumber, toStr } from "../engine/expression";
import type { Row } from "../model/row";
import { toDayNumber } from "./gantt";
import { rowMatchesText } from "./search";

/**
 * The single "is this row done?" predicate shared by every view, so the Kanban
 * due-chip muting, the Calendar overdue styling/section, and the Outline branch
 * progress can never disagree about the same note (they used three divergent
 * inline copies — only the Outline honored a truthy `done` flag). A row is done
 * when its status property equals the configured Done value, OR it carries a
 * truthy `done` frontmatter flag.
 */
export function isRowDone(row: Row, statusProp: string, doneValue: string): boolean {
	const dv = (doneValue || "").trim().toLowerCase();
	if (dv && toStr(row.scope.get(statusProp)).trim().toLowerCase() === dv) return true;
	return toBool(row.scope.get("done"));
}

export type KanbanSort = "manual" | "name-asc" | "name-desc" | "due-asc" | "priority-desc" | "mtime-desc";

/** Every valid sort value — the settings sanitizer's allow-list. */
export const KANBAN_SORTS: KanbanSort[] = ["manual", "name-asc", "name-desc", "due-asc", "priority-desc", "mtime-desc"];
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
	// Keep the raw (trimmed) query — rowMatchesText normalizes values itself, and
	// pre-lowercasing here would fold a `Owner:Sam` token's KEY to `owner`, so a
	// capitalized frontmatter property matched in Calendar/Gantt but returned zero
	// cards on the board. `search` is otherwise only used as a truthiness flag.
	const search = toStr(options.search ?? "").trim();
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

export type DueStatus = "overdue" | "soon" | null;

/**
 * Traffic-light status for a due-style date: strictly past = "overdue", today
 * through the next `soonDays` days = "soon", else null. Inputs are ISO
 * `YYYY-MM-DD` keys (see toIsoDateKey); anything unparsable is null. Pure, so
 * the card-chip state is unit-tested rather than eyeballed.
 */
export function dueStatus(iso: string | null, today: string, soonDays = 2): DueStatus {
	if (!iso) return null;
	const da = toDayNumber(iso);
	const db = toDayNumber(today);
	if (da === null || db === null) return null;
	const diff = da - db;
	if (diff < 0) return "overdue";
	if (diff <= soonDays) return "soon";
	return null;
}

const PRIORITY_LEVELS: Array<{ cls: string; values: string[] }> = [
	{ cls: "is-p-high", values: ["high", "highest", "urgent", "critical", "p0", "p1"] },
	{ cls: "is-p-med", values: ["medium", "med", "normal", "p2"] },
	{ cls: "is-p-low", values: ["low", "lowest", "minor", "p3", "p4"] },
];

/**
 * CSS modifier for a conventional priority value, or null for one we can't
 * rank (numbers are ambiguous — is 1 highest or lowest? — so they fall back to
 * the stable-hue chip instead of guessing). Purely presentational.
 */
export function priorityClass(value: unknown): string | null {
	const v = toStr(value).trim().toLocaleLowerCase();
	if (!v) return null;
	for (const level of PRIORITY_LEVELS) {
		if (level.values.includes(v)) return level.cls;
	}
	return null;
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

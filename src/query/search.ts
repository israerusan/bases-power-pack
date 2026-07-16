/**
 * Shared quick-search — the free-text row filter used by every view's toolbar.
 * Pure and DOM-free so the match rule is unit-tested once and identical across
 * Kanban, Calendar, and Gantt (previously search lived only in the Kanban).
 */
import { toStr } from "../engine/expression";
import type { Row } from "../model/row";

function normalize(value: unknown): string {
	return toStr(value).trim().toLocaleLowerCase();
}

/**
 * True when a row matches a quick-search query. Matches on the note name, path,
 * folder, and tags. An empty/blank query matches everything. `extra` lets a
 * caller add more haystacks (e.g. the Kanban column value).
 */
export function rowMatchesText(row: Row, query: string, extra: string[] = []): boolean {
	const q = normalize(query);
	if (!q) return true;
	const haystacks = [row.name, row.note.path, row.note.folder, ...row.note.tags, ...extra];
	return haystacks.some((value) => normalize(value).includes(q));
}

/** Narrow rows to those matching the quick-search query (identity for a blank query). */
export function filterRowsByText(rows: Row[], query: string): Row[] {
	if (!query.trim()) return rows;
	return rows.filter((row) => rowMatchesText(row, query));
}

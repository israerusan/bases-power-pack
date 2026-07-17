/**
 * Shared quick-search — the free-text row filter used by every view's toolbar.
 * Pure and DOM-free so the match rule is unit-tested once and identical across
 * Kanban, Calendar, Gantt, and Outline.
 *
 * Query grammar: whitespace-separated tokens, ALL of which must match (AND).
 *   - `key:value` filters on a frontmatter property (or premium formula) by
 *     substring, e.g. `priority:high`, `owner:sam`. `tag:x` matches the note's
 *     tags. A `key:value` token whose property doesn't match still falls back
 *     to plain text, so searching for a literal "foo:bar" string keeps working.
 *   - any other token matches the note name, path, folder, or tags.
 */
import { toStr } from "../engine/expression";
import type { Row } from "../model/row";

function normalize(value: unknown): string {
	return toStr(value).trim().toLocaleLowerCase();
}

/** `key:value` — key must look like a property name, value must be non-empty. */
const PROP_TOKEN_RE = /^([A-Za-z_$][\w.$-]*):(.+)$/;

function tokenMatches(row: Row, token: string, extra: string[]): boolean {
	const m = PROP_TOKEN_RE.exec(token);
	if (m) {
		const key = m[1];
		const value = normalize(m[2]);
		if (key.toLocaleLowerCase() === "tag" || key.toLocaleLowerCase() === "tags") {
			// Stored tags are #-stripped, so strip a leading # off the query too
			// (`tag:#urgent` and `tag:urgent` are the same). A bare `tag:#` has an
			// empty value and shouldn't match every tagged note.
			const tagValue = value.replace(/^#/, "");
			if (tagValue && row.note.tags.some((t) => normalize(t).includes(tagValue))) return true;
		} else {
			const got = row.scope.get(key);
			if (got !== undefined && got !== null && normalize(got).includes(value)) return true;
		}
		// Fall through: a literal "key:value" string in a name/path still matches.
	}
	const q = normalize(token);
	const haystacks = [row.name, row.note.path, row.note.folder, ...row.note.tags, ...extra];
	return haystacks.some((v) => normalize(v).includes(q));
}

/**
 * True when a row matches a quick-search query (see the grammar above). An
 * empty/blank query matches everything. `extra` lets a caller add more plain-
 * text haystacks (e.g. the Kanban column value).
 */
export function rowMatchesText(row: Row, query: string, extra: string[] = []): boolean {
	const tokens = query.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return true;
	return tokens.every((token) => tokenMatches(row, token, extra));
}

/** Narrow rows to those matching the quick-search query (identity for a blank query). */
export function filterRowsByText(rows: Row[], query: string): Row[] {
	if (!query.trim()) return rows;
	return rows.filter((row) => rowMatchesText(row, query));
}

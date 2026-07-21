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

/** A search token, pre-parsed and pre-lowercased once (not per candidate row). */
interface CompiledToken {
	/** Original-case property key for a `key:value` token (scope lookups are case-
	 * sensitive), or null for a plain-text token. */
	prop: string | null;
	/** Lowercased key, for the case-insensitive tag/tags special-case. */
	propLower: string;
	/** Lowercased `value` half of a `key:value` token. */
	value: string;
	/** Lowercased whole token, the plain-text/fallback haystack needle. */
	raw: string;
}

/** Parse + lowercase a query's tokens ONCE, so filtering N rows doesn't re-split
 * the query and re-lowercase each needle N times (a real cost per keystroke on a
 * large board). */
function compileQuery(query: string): CompiledToken[] {
	return query
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((token) => {
			const m = PROP_TOKEN_RE.exec(token);
			return {
				prop: m ? m[1] : null,
				propLower: m ? m[1].toLocaleLowerCase() : "",
				value: m ? normalize(m[2]) : "",
				raw: normalize(token),
			};
		});
}

function tokenMatches(row: Row, token: CompiledToken, extra: string[]): boolean {
	if (token.prop !== null) {
		if (token.propLower === "tag" || token.propLower === "tags") {
			// Stored tags are #-stripped, so strip a leading # off the query too
			// (`tag:#urgent` and `tag:urgent` are the same). A bare `tag:#` has an
			// empty value and shouldn't match every tagged note.
			const tagValue = token.value.replace(/^#/, "");
			if (tagValue && row.note.tags.some((t) => normalize(t).includes(tagValue))) return true;
		} else {
			const got = row.scope.get(token.prop);
			if (got !== undefined && got !== null && normalize(got).includes(token.value)) return true;
		}
		// Fall through: a literal "key:value" string in a name/path still matches.
	}
	const haystacks = [row.name, row.note.path, row.note.folder, ...row.note.tags, ...extra];
	return haystacks.some((v) => normalize(v).includes(token.raw));
}

/** True when a row matches every compiled token (AND). */
function rowMatchesCompiled(row: Row, tokens: CompiledToken[], extra: string[]): boolean {
	return tokens.every((token) => tokenMatches(row, token, extra));
}

/**
 * True when a row matches a quick-search query (see the grammar above). An
 * empty/blank query matches everything. `extra` lets a caller add more plain-
 * text haystacks (e.g. the Kanban column value).
 */
export function rowMatchesText(row: Row, query: string, extra: string[] = []): boolean {
	const tokens = compileQuery(query);
	if (tokens.length === 0) return true;
	return rowMatchesCompiled(row, tokens, extra);
}

/** Narrow rows to those matching the quick-search query (identity for a blank query). */
export function filterRowsByText(rows: Row[], query: string): Row[] {
	const tokens = compileQuery(query);
	if (tokens.length === 0) return rows;
	return rows.filter((row) => rowMatchesCompiled(row, tokens, []));
}

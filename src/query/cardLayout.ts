import { toNumber, toStr } from "../engine/expression";
import { columnHue } from "./kanban";

/**
 * Pure card-layout helpers (DOM-free, unit-tested) for the optional card widgets — a
 * progress bar and an initials avatar — so both the standalone board and the native Bases
 * board render them through one code path.
 */

/**
 * A card's progress as a 0–100 percentage: a numeric property value measured against
 * `max`, clamped to [0, 100]. Returns null when the value isn't numeric or `max` is
 * non-positive (store 0–1 fractions with max 1, 0–100 percents with max 100, etc.).
 */
export function progressPercent(value: unknown, max: number): number | null {
	if (!(max > 0)) return null;
	if (value === undefined || value === null || value === "") return null;
	const n = toNumber(value);
	if (!Number.isFinite(n)) return null;
	const clamped = Math.max(0, Math.min(max, n));
	return Math.round((clamped / max) * 100);
}

/** Initials + a stable hue for a person/assignee value, for the card avatar. Strips a
 * wikilink's brackets / a "path|alias" / a "folder/name" / a leading @, takes the first
 * of a multi-value (array) property, and uses up to two initials. Null when blank. */
export function avatarFor(value: unknown): { initials: string; hue: number } | null {
	const first: unknown = Array.isArray(value) ? (value as unknown[])[0] : value;
	const raw = toStr(first).trim().replace(/^\[\[/, "").replace(/\]\]$/, "").replace(/^@/, "").trim();
	if (!raw) return null;
	// Prefer the display half of "path|alias", then the leaf of a "folder/name".
	const aliased = raw.includes("|") ? (raw.split("|").pop() ?? raw) : raw;
	const name = (aliased.split("/").pop() ?? aliased).trim();
	if (!name) return null;
	const words = name.split(/\s+/).filter(Boolean);
	const initials = (words.length >= 2 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
	return { initials, hue: columnHue(name) };
}

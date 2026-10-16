import { sourceRowId } from "../query/flatten";
import { parseTaskId, type TaskRef } from "../query/tasks";

/**
 * A row id is one of three things, and every consumer that turns an id back
 * into a file has to agree on how to read it:
 *
 *   `Notes/Alpha.md`                     — a whole note
 *   `Notes/Alpha.md::L14::k3f9a1`        — one checkbox line inside that note
 *   `…#2`                                — the third copy of a FLATTEN-expanded row
 *
 * Both suffix forms use characters Obsidian forbids in vault paths (`:` and
 * `#`), so the note path is always recoverable without ambiguity.
 */

/** The vault path of the file a row lives in, whatever kind of row it is. */
export function notePathOf(id: string): string {
	const base = sourceRowId(id);
	return parseTaskId(base)?.path ?? base;
}

/** The task this row addresses, or null for an ordinary note row. */
export function taskRefOf(id: string): TaskRef | null {
	return parseTaskId(sourceRowId(id));
}

/** True when the row is a checkbox line rather than a whole note. */
export function isTaskRow(id: string): boolean {
	return taskRefOf(id) !== null;
}

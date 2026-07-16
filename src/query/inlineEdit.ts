/**
 * Pure logic for the free inline card editor: decide what frontmatter value a
 * raw text input should be written as, given the field name and its previous
 * value. Kept DOM-free so it can be unit-tested.
 */
import { toStr } from "../engine/expression";

/** Fields that should coerce a clean numeric input to a number. */
const NUMERIC_FIELDS = new Set(["priority", "order", "weight", "estimate", "progress"]);

/** Fields that hold a comma/-separated list, written back as an array. */
const LIST_FIELDS = new Set(["tags", "aliases", "owners"]);

export interface FieldWrite {
	/** The value to set. Ignore when `remove` is true. */
	value: unknown;
	/** When true, delete the key instead of setting it (the input was cleared). */
	remove: boolean;
}

/**
 * Coerce raw editor text into the value to persist for `field`.
 *
 * Rules:
 *  - An empty (whitespace-only) input removes the key.
 *  - A list field (or a field whose previous value was an array) splits on
 *    commas into a trimmed, de-duplicated array.
 *  - A number is written when the previous value was a number, or the field is
 *    a known numeric field, AND the input is a clean numeric literal.
 *  - Everything else is written as a trimmed string.
 */
export function coerceFieldInput(field: string, raw: string, previous: unknown): FieldWrite {
	const trimmed = raw.trim();
	if (trimmed.length === 0) return { value: null, remove: true };

	const key = field.trim().toLowerCase();
	if (LIST_FIELDS.has(key) || Array.isArray(previous)) {
		const parts = trimmed
			.split(",")
			.map((p) => p.trim())
			.filter(Boolean);
		const deduped = [...new Set(parts)];
		return { value: deduped, remove: deduped.length === 0 };
	}

	const numericField = NUMERIC_FIELDS.has(key) || typeof previous === "number";
	if (numericField && /^-?\d+(\.\d+)?$/.test(trimmed)) {
		return { value: Number(trimmed), remove: false };
	}

	if (trimmed === "true" || trimmed === "false") {
		if (typeof previous === "boolean") return { value: trimmed === "true", remove: false };
	}

	return { value: trimmed, remove: false };
}

/** Format a stored frontmatter value for display in the inline editor input. */
export function formatFieldForEdit(value: unknown): string {
	return toStr(value);
}

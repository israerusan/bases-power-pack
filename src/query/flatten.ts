/**
 * FLATTEN — one row per value of a multi-valued property.
 *
 * Dataview's `FLATTEN` is how you turn "this note has three assignees" into
 * three rows, which is what makes a per-person board, a tag matrix, or a
 * per-attendee rollup possible at all. Bases has no equivalent: a list-valued
 * property stays one row and lands in a single "a, b, c" bucket.
 *
 * Pure and DOM-free. A flattened row keeps the SOURCE row's identity so writes
 * still land on the right note — when a row does split, each copy gets a
 * `#<n>` id suffix (Obsidian forbids `#` in vault paths, so the real path is
 * always recoverable via {@link sourceRowId}).
 */

import { evaluateSafe, type EvalScope, type Value } from "../engine/expression";
import type { Row } from "../model/row";

/** Strip a flatten suffix from a row id, yielding the id writes should use. */
export function sourceRowId(id: string): string {
	const hash = id.lastIndexOf("#");
	if (hash <= 0) return id;
	return /^\d+$/.test(id.slice(hash + 1)) ? id.slice(0, hash) : id;
}

/** Layer `overlay` over an existing scope without mutating it. */
export function overlayScope(base: EvalScope, overlay: Record<string, unknown>): EvalScope {
	return {
		get(name: string): unknown {
			if (Object.prototype.hasOwnProperty.call(overlay, name)) return overlay[name];
			return base.get(name);
		},
	};
}

/** Values a single row contributes once flattened: the array's elements, or
 * the single value itself. An empty array contributes nothing — the note drops
 * out, which is Dataview's behavior and the thing that makes
 * `FLATTEN assignees` double as "only notes that have an assignee". */
export function flattenValues(value: Value): Value[] {
	if (Array.isArray(value)) return value;
	return [value];
}

export interface FlattenOptions {
	/** The expression producing the value(s) to flatten, e.g. `assignees`. */
	expression: string;
	/** The identifier the per-row value is bound to. Defaults to the expression
	 * when it is already a bare identifier, else `value`. */
	as?: string;
	/** Keep rows whose flattened value is null/empty. Off by default (Dataview
	 * drops an empty list), on when you want the "unassigned" bucket. */
	keepEmpty?: boolean;
}

/**
 * Rebuild one row around a bound value. The default overlays the existing
 * scope, which is enough for filters and group-by; the resolver passes a
 * version that reconstructs the row from scratch so that **formulas** see the
 * flattened scalar too — a memoized formula on the original scope would
 * otherwise still compute against the whole list.
 */
export type RebindRow = (row: Row, id: string, binding: string, value: Value) => Row;

const defaultRebind: RebindRow = (row, id, binding, value) => ({
	id,
	name: row.name,
	note: row.note,
	scope: overlayScope(row.scope, { [binding]: value }),
});

/** The identifier a bare-identifier expression binds to by default. */
export function defaultBinding(expression: string): string {
	const t = expression.trim();
	return /^[A-Za-z_$][\w$]*(?:\.[\w$]+)*$/.test(t) ? t : "value";
}

/**
 * Expand `rows` so each multi-valued `expression` result becomes its own row.
 * The bound name shadows the original property inside the new row's scope, so
 * every downstream consumer (group-by, filters, roll-ups, color rules) sees a
 * single scalar and needs no flatten-awareness of its own.
 */
export function flattenRows(rows: readonly Row[], options: FlattenOptions, rebind: RebindRow = defaultRebind): Row[] {
	const expression = options.expression.trim();
	if (expression.length === 0) return [...rows];
	const binding = (options.as ?? "").trim() || defaultBinding(expression);

	const out: Row[] = [];
	for (const row of rows) {
		const values = flattenValues(evaluateSafe(expression, row.scope));
		const kept = options.keepEmpty ? values : values.filter((v) => !isEmptyValue(v));
		if (kept.length === 0) {
			// With keepEmpty, a note whose list is literally `[]` still deserves a
			// row — bind null so it groups under "no value" rather than vanishing.
			if (options.keepEmpty) out.push(rebind(row, row.id, binding, null));
			continue;
		}
		if (kept.length === 1) {
			out.push(rebind(row, row.id, binding, kept[0]));
			continue;
		}
		kept.forEach((v, i) => out.push(rebind(row, `${row.id}#${i}`, binding, v)));
	}
	return out;
}

function isEmptyValue(v: Value): boolean {
	if (v === null || v === undefined) return true;
	if (typeof v === "string") return v.trim().length === 0;
	if (Array.isArray(v)) return v.length === 0;
	return false;
}

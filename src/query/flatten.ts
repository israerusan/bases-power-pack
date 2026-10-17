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
	const meta = { binding, expression };
	const tag = (r: Row): Row => ({ ...r, flatten: meta });

	const out: Row[] = [];
	for (const row of rows) {
		const values = flattenValues(evaluateSafe(expression, row.scope));
		const kept = options.keepEmpty ? values : values.filter((v) => !isEmptyValue(v));
		if (kept.length === 0) {
			// With keepEmpty, a note whose list is literally `[]` still deserves a
			// row — bind null so it groups under "no value" rather than vanishing.
			if (options.keepEmpty) out.push(tag(rebind(row, row.id, binding, null)));
			continue;
		}
		if (kept.length === 1) {
			out.push(tag(rebind(row, row.id, binding, kept[0])));
			continue;
		}
		kept.forEach((v, i) => out.push(tag(rebind(row, `${row.id}#${i}`, binding, v))));
	}
	return out;
}

function isEmptyValue(v: Value): boolean {
	if (v === null || v === undefined) return true;
	if (typeof v === "string") return v.trim().length === 0;
	if (Array.isArray(v)) return v.length === 0;
	return false;
}

/**
 * The write that changes ONE element of a flattened list.
 *
 * A flattened row carries a single element of its note's list, bound to the
 * list's own name. Writing the dragged scalar straight to that property would
 * replace the whole list (`assignees: [Ana, Bob]` dragged from Bob to Carol
 * would become `assignees: Carol`, and Ana would be gone). This swaps only
 * that element. If the new value is already in the list, the element is
 * dropped instead. A remove drops it.
 *
 * `source` is the property's value before flattening and `element` the value
 * this row carries, and the swap is computed against the source as it is
 * when the write lands (see `viewData.writeRowProperties`), so a batch that
 * edits two copies of one note builds on its own first write. When the source
 * isn't a list, the write is returned unchanged. Returns null when the element
 * is no longer in the list: the note changed and there is nothing safe to swap.
 */
export function listElementWrite<W extends { key: string; value?: unknown; remove?: boolean }>(
	source: unknown,
	element: unknown,
	write: W
): W | null {
	if (!Array.isArray(source)) return write;
	// An element that is itself a list didn't come from a flatten; leave it be.
	if (Array.isArray(element)) return write;
	const same = (a: unknown, b: unknown): boolean => elementKey(a) === elementKey(b);
	const at = source.findIndex((v) => same(v, element));
	if (at < 0) {
		// keepEmpty gives a note with an empty list one row, bound to null. A drag
		// out of that "no value" bucket adds the first element.
		if (source.length === 0 && (element === null || element === undefined)) {
			return write.remove ? write : { ...write, value: [write.value], remove: false };
		}
		return null;
	}
	const next: unknown[] = [...(source as unknown[])];
	if (write.remove || next.some((v, i) => i !== at && same(v, write.value))) next.splice(at, 1);
	else next[at] = write.value;
	return { ...write, value: next, remove: false };
}

function elementKey(v: unknown): string {
	if (v instanceof Date) return v.toISOString();
	return JSON.stringify(v) ?? "";
}

/** A field write that may carry a FLATTEN element marker. */
export interface ElementWrite {
	key: string;
	value?: unknown;
	remove?: boolean;
	/** Edit ONE element of the list at `key`, resolved against the live value
	 * when the write lands. Set by {@link flattenElementWrites}. */
	listElement?: { value: unknown };
}

/**
 * Prepare a view's writes for a row that FLATTEN produced. A write to the
 * flatten binding is marked to edit only this row's element of the list (see
 * {@link listElementWrite}); every other write passes through unchanged, as do
 * all writes for a row that wasn't flattened.
 *
 * Returns null when the binding can't be written from a card: it is an alias
 * (`FLATTEN assignees AS person`) or a computed expression, so there is no
 * property of that name to edit. The caller then refuses the edit.
 */
export function flattenElementWrites<W extends ElementWrite>(row: Row, writes: W[]): W[] | null {
	const flat = row.flatten;
	if (!flat) return writes;
	const out: W[] = [];
	for (const write of writes) {
		if (write.key !== flat.binding) {
			out.push(write);
			continue;
		}
		if (flat.binding !== flat.expression) return null;
		// A dotted binding names a link traversal or nested value, unless the note
		// really has a flat key spelled that way.
		if (flat.binding.includes(".") && !Object.prototype.hasOwnProperty.call(row.note.frontmatter, flat.binding)) return null;
		out.push({ ...write, listElement: { value: row.scope.get(flat.binding) } });
	}
	return out;
}

/** Resolve a marked write against the property's current value; unmarked
 * writes pass through. Null means the element has left the list. */
export function resolveListElement<W extends ElementWrite>(current: unknown, write: W): W | null {
	if (!write.listElement) return write;
	const { listElement, ...plain } = write;
	return listElementWrite(current, listElement.value, plain as W);
}

import { makeRow, type RawNote, type Row } from "../model/row";
import { evaluateFilter, andFilters, type FilterNode } from "../query/filter";
import type { BaseDefinition } from "./baseDefinition";

/**
 * Resolve the rows of a base: every note, with the base's formulas available,
 * kept only if it passes the base filter AND an optional extra filter (e.g. an
 * active saved filter). This is the pure heart of "views for Bases" — given a
 * base definition and the vault's notes, it produces the filtered row set the
 * kanban / calendar / gantt views render.
 */
export function resolveRows(notes: RawNote[], def: BaseDefinition, extraFilter?: FilterNode): Row[] {
	const filter = andFilters(def.filters, extraFilter);
	const rows: Row[] = [];
	for (const note of notes) {
		const row = makeRow(note, def.formulas);
		if (evaluateFilter(filter, row.scope)) rows.push(row);
	}
	return rows;
}

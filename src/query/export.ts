import { toStr } from "../engine/expression";
import type { Row } from "../model/row";
import type { KanbanColumn } from "./kanban";
import type { PivotModel } from "./pivot";
import { epochToIso } from "./feed";

/**
 * View export. Turns the rows (or a Kanban board / Pivot matrix) a view is
 * currently showing into portable text — a Markdown table or task board (free)
 * and CSV (premium) — that the toolbar copies to the clipboard. Pure and
 * side-effect free: the DOM/clipboard wiring lives in the views, the formatting
 * (and its escaping) is unit-tested here.
 */

/** The display value of one export field for a row. `name`/`file.name` and
 * `path`/`file.path` map to the note's title and path; everything else reads the
 * evaluation scope so formulas and `file.*` accessors export too. */
export function exportCell(row: Row, field: string): string {
	if (field === "name" || field === "file.name") return row.name;
	if (field === "path" || field === "file.path") return row.id;
	const value = row.scope.get(field);
	if (value === undefined || value === null) return "";
	// The epoch-millisecond accessors (Feed's default date column) would otherwise
	// export as a raw 13-digit number — render them as a date, like the Feed does.
	if ((field === "file.mtime" || field === "file.ctime") && typeof value === "number" && Number.isFinite(value)) {
		return epochToIso(value);
	}
	if (Array.isArray(value)) return value.map((v) => toStr(v)).filter(Boolean).join("; ");
	return toStr(value);
}

/** Escape a value for a GitHub-flavored Markdown table cell: pipes are the column
 * delimiter and newlines break the row, so both are neutralized. */
function mdCell(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/** Quote a value per RFC 4180 (internal quotes doubled) AND neutralize CSV/formula
 * injection: a spreadsheet evaluates a cell whose text starts with `=`/`+`/`-`/`@`
 * (or a tab/CR) as a live formula, so break the leading trigger with a `'`. */
function csvCell(value: string): string {
	const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
	return `"${guarded.replace(/"/g, '""')}"`;
}

/** A GitHub-flavored Markdown table of the rows over the given fields. */
export function buildMarkdownTable(rows: Row[], fields: string[]): string {
	const cols = fields.length > 0 ? fields : ["name"];
	const header = `| ${cols.map(mdCell).join(" | ")} |`;
	const divider = `| ${cols.map(() => "---").join(" | ")} |`;
	const body = rows.map((row) => `| ${cols.map((f) => mdCell(exportCell(row, f))).join(" | ")} |`);
	return [header, divider, ...body].join("\n");
}

/** A CSV of the rows over the given fields, with a header row. */
export function buildCsv(rows: Row[], fields: string[]): string {
	const cols = fields.length > 0 ? fields : ["name"];
	const header = cols.map(csvCell).join(",");
	const body = rows.map((row) => cols.map((f) => csvCell(exportCell(row, f))).join(","));
	return [header, ...body].join("\r\n");
}

/**
 * A Markdown task board: one `##` section per column, each card a task-list item
 * with its detail fields trailing. `fields` are the per-card detail fields (the
 * group-by property is already the section, so callers exclude it).
 */
export function buildMarkdownBoard(columns: KanbanColumn[], fields: string[]): string {
	const blocks: string[] = [];
	for (const column of columns) {
		const lines = [`## ${column.name}`, ""];
		if (column.rows.length === 0) {
			lines.push("_(empty)_");
		} else {
			for (const row of column.rows) {
				const details = fields
					.map((f) => ({ f, v: exportCell(row, f) }))
					.filter((d) => d.v !== "")
					// Collapse newlines so a multi-line value can't break the task-list item.
					.map((d) => `${d.f}: ${mdCell(d.v)}`);
				const suffix = details.length > 0 ? ` — ${details.join(", ")}` : "";
				lines.push(`- [ ] ${mdCell(row.name)}${suffix}`);
			}
		}
		blocks.push(lines.join("\n"));
	}
	return blocks.join("\n\n");
}

/** Header cells for a pivot export: the corner label, every column key, and Total. */
function pivotHeader(model: PivotModel, rowProp: string, colProp: string): string[] {
	return [`${rowProp} \\ ${colProp}`, ...model.colKeys, "Total"];
}

/** Ordered rows of a pivot export: each body row, then the totals row. */
function pivotRows(model: PivotModel): string[][] {
	const body = model.rowKeys.map((rowKey, ri) => [rowKey, ...model.cells[ri], model.rowTotals[ri]]);
	const totals = ["Total", ...model.colTotals, model.grandTotal];
	return [...body, totals];
}

/** A CSV of a pivot matrix, including the row/column/grand totals. */
export function pivotToCsv(model: PivotModel, rowProp: string, colProp: string): string {
	const header = pivotHeader(model, rowProp, colProp).map(csvCell).join(",");
	const rows = pivotRows(model).map((r) => r.map(csvCell).join(","));
	return [header, ...rows].join("\r\n");
}

/** A Markdown table of a pivot matrix, including the row/column/grand totals. */
export function pivotToMarkdownTable(model: PivotModel, rowProp: string, colProp: string): string {
	const header = pivotHeader(model, rowProp, colProp);
	const headerLine = `| ${header.map(mdCell).join(" | ")} |`;
	const divider = `| ${header.map(() => "---").join(" | ")} |`;
	const body = pivotRows(model).map((r) => `| ${r.map((c) => mdCell(c)).join(" | ")} |`);
	return [headerLine, divider, ...body].join("\n");
}

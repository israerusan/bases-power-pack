import { compileExpression, type EvalScope, type Value } from "../engine/expression";
import { traverseLink } from "../query/linkIndex";
import type { TaskItem } from "../query/tasks";
import type { RawNote, Row, ScopeContext } from "./row";

/**
 * Task rows — a Row whose unit is one `- [ ]` line rather than a whole note.
 *
 * Every view in the plugin consumes `Row`, so building task rows here means
 * the kanban board, calendar, Gantt, pivot, dashboard and feed all gain task
 * support without a line of view code: a task card drags between columns, a
 * task reschedules on the calendar, and the write lands on the checkbox line
 * (see `viewData.writeRowProperties`, which routes on the row id).
 *
 * Scope resolution, highest first:
 *   1. reserved `task.*` accessors (never shadowable by a user field)
 *   2. the task line's own inline fields and emoji metadata
 *   3. the host note's frontmatter, then its inline fields
 *   4. computed `file.*` properties of the host note
 *   5. named formulas, then `link.property` traversal
 *
 * Inheriting the note's properties (3) is the point: it is what lets you group
 * every task in the vault by the PROJECT note it lives in.
 */

/** The reserved identifiers a task row exposes about the checkbox itself. */
export const TASK_ROW_PROPS: ReadonlySet<string> = new Set([
	"task.status",
	"task.checked",
	"task.done",
	"task.text",
	"task.line",
	"task.level",
	"task.section",
	"task.note",
	"task.tags",
	"task.parent",
]);

function taskProps(task: TaskItem): Record<string, unknown> {
	return {
		"task.status": task.status,
		"task.checked": task.checked,
		"task.done": task.done,
		"task.text": task.text,
		"task.line": task.line,
		"task.level": task.level,
		"task.section": task.section,
		"task.note": task.note,
		"task.tags": task.tags,
		"task.parent": task.parent,
	};
}

function noteProps(note: RawNote, task: TaskItem): Record<string, unknown> {
	const props: Record<string, unknown> = {
		"file.name": note.name,
		"file.path": note.path,
		"file.folder": note.folder,
		"file.ext": note.ext,
		// The union of the note's tags and the task line's own — filtering tasks
		// by `#urgent` written on the line is the whole reason people tag tasks.
		"file.tags": [...new Set([...note.tags, ...task.tags])],
		"file.ctime": note.ctime,
		"file.mtime": note.mtime,
		"file.size": note.size,
	};
	if (note.links) Object.assign(props, note.links);
	return props;
}

/** Build the evaluation scope for one task line. */
export function makeTaskScope(
	note: RawNote,
	task: TaskItem,
	formulas: Record<string, string> = {},
	ctx?: ScopeContext,
	overlay?: Record<string, unknown>
): EvalScope {
	const base: Record<string, unknown> = {
		...(note.inline ?? {}),
		...note.frontmatter,
		...noteProps(note, task),
		...task.fields,
		...taskProps(task),
		...overlay,
	};
	const memo = new Map<string, Value>();
	const inProgress = new Set<string>();

	const scope: EvalScope = {
		get(name: string): unknown {
			if (name in base) return base[name];
			if (name in formulas) {
				if (memo.has(name)) return memo.get(name);
				if (inProgress.has(name)) return null;
				inProgress.add(name);
				let result: Value = null;
				try {
					result = compileExpression(formulas[name]).eval(scope);
				} catch {
					result = null;
				}
				inProgress.delete(name);
				memo.set(name, result);
				return result;
			}
			if (ctx?.lookup && name.includes(".")) return traverseLink(scope, name, ctx.lookup);
			return undefined;
		},
	};
	return scope;
}

export function makeTaskRow(
	note: RawNote,
	task: TaskItem,
	formulas: Record<string, string> = {},
	ctx?: ScopeContext,
	overlay?: Record<string, unknown>
): Row {
	return {
		id: task.id,
		// A task with no text left after metadata stripping would render as a blank
		// card; fall back to the note name so the card is still identifiable.
		name: task.text || note.name,
		note,
		scope: makeTaskScope(note, task, formulas, ctx, overlay),
	};
}

export interface TaskRowOptions {
	/** Include completed (`[x]`) tasks. Off by default — an open-work board. */
	includeDone?: boolean;
	/** Include tasks nested under another task. On by default. */
	includeSubtasks?: boolean;
}

/** Every task in `notes`, as Rows, honoring the inclusion options. */
export function buildTaskRows(
	notes: readonly RawNote[],
	formulas: Record<string, string> = {},
	ctx?: ScopeContext,
	options: TaskRowOptions = {}
): Row[] {
	const includeDone = options.includeDone ?? false;
	const includeSubtasks = options.includeSubtasks ?? true;
	const rows: Row[] = [];
	for (const note of notes) {
		if (!note.tasks) continue;
		for (const task of note.tasks) {
			if (!includeDone && task.done) continue;
			if (!includeSubtasks && task.parent !== null) continue;
			rows.push(makeTaskRow(note, task, formulas, ctx));
		}
	}
	return rows;
}

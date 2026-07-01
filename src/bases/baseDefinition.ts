import type { FilterNode } from "../query/filter";

/**
 * A parsed Obsidian `.base` file. Bases stores YAML with (optionally) a root
 * `filters` tree, named `formulas`, `properties` display config, and a list of
 * `views`. We normalize whatever we can read and ignore the rest defensively —
 * a malformed base yields an empty-but-valid definition, never a throw.
 */
export interface BaseView {
	type: string;
	name: string;
	filters?: FilterNode;
	group?: string;
	order?: string[];
}

export interface BaseDefinition {
	filters: FilterNode;
	formulas: Record<string, string>;
	properties: Record<string, { displayName?: string }>;
	views: BaseView[];
}

export function emptyBaseDefinition(): BaseDefinition {
	return { filters: null, formulas: {}, properties: {}, views: [] };
}

function asRecord(v: unknown): Record<string, unknown> {
	return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Normalize a parsed `.base` object (from parseYaml) into a BaseDefinition. */
export function normalizeBaseDefinition(raw: unknown): BaseDefinition {
	const obj = asRecord(raw);
	const def = emptyBaseDefinition();

	// filters — accept the node as-is; the filter evaluator understands the shape.
	if (obj.filters !== undefined) {
		def.filters = obj.filters as FilterNode;
	}

	// formulas — map of name → expression string.
	const formulas = asRecord(obj.formulas);
	for (const [name, expr] of Object.entries(formulas)) {
		if (typeof expr === "string" && expr.trim().length > 0) {
			def.formulas[name] = expr;
		}
	}

	// properties — display metadata (only displayName is used by our views).
	const props = asRecord(obj.properties);
	for (const [key, meta] of Object.entries(props)) {
		const m = asRecord(meta);
		def.properties[key] = {
			displayName: typeof m.displayName === "string" ? m.displayName : undefined,
		};
	}

	// views — array of { type, name, filters?, group/groupBy?, order? }.
	if (Array.isArray(obj.views)) {
		for (const rawView of obj.views) {
			const v = asRecord(rawView);
			if (typeof v.type !== "string") continue;
			def.views.push({
				type: v.type,
				name: typeof v.name === "string" ? v.name : v.type,
				filters: v.filters as FilterNode,
				group: typeof v.group === "string" ? v.group : typeof v.groupBy === "string" ? v.groupBy : undefined,
				order: Array.isArray(v.order) ? v.order.filter((o): o is string => typeof o === "string") : undefined,
			});
		}
	}

	return def;
}

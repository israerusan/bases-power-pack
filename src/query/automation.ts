/**
 * Move Rules — the premium automation engine. When a card's trigger property
 * transitions to a configured value (e.g. a Kanban drop into "Done"), matched
 * rules compute an ordered set of frontmatter writes. Pure and DOM-free so the
 * whole transition→writes mapping is unit-tested; the view applies the writes
 * through the shared transactional write path.
 */
import { toBool } from "../engine/expression";
import { todayIso } from "./dates";

export type AutomationActionType = "set" | "today" | "now" | "clear" | "toggle" | "copy";

export interface AutomationAction {
	/** Frontmatter key to write. */
	prop: string;
	type: AutomationActionType;
	/** Literal for `set`, or the source key for `copy`. Ignored otherwise. */
	value: string;
}

export interface AutomationRule {
	id: string;
	name: string;
	enabled: boolean;
	/** The property whose change fires the rule (defaults to the board's group-by). */
	triggerProp: string;
	/** The value the property must enter for the rule to fire. */
	enterValue: string;
	actions: AutomationAction[];
}

/** A single frontmatter write — structurally compatible with viewData's PropertyWrite. */
export interface RuleWrite {
	key: string;
	value?: unknown;
	remove?: boolean;
}

function eqi(a: string, b: string): boolean {
	return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Rules that should fire when `triggerProp` transitions to `newValue`. */
export function rulesForTransition(
	rules: AutomationRule[],
	triggerProp: string,
	newValue: string
): AutomationRule[] {
	const prop = triggerProp || "status";
	return rules.filter(
		(r) => r.enabled && eqi(r.triggerProp || "status", prop) && eqi(r.enterValue, newValue)
	);
}

/** Coerce a rule's literal string into a boolean/number/string value. */
export function coerceLiteral(raw: string): unknown {
	const trimmed = raw.trim();
	if (trimmed === "") return "";
	if (trimmed === "true") return true;
	if (trimmed === "false") return false;
	if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
	return trimmed;
}

function nowStamp(now: Date): string {
	const hh = String(now.getHours()).padStart(2, "0");
	const mm = String(now.getMinutes()).padStart(2, "0");
	return `${todayIso(now)}T${hh}:${mm}`;
}

/**
 * The ordered frontmatter writes for a set of matched rules, given the note's
 * current (pre-write) frontmatter and the clock. `toggle` flips the current
 * truthiness; `copy` reads another key's current value.
 */
export function computeRuleWrites(
	rules: AutomationRule[],
	frontmatter: Record<string, unknown>,
	now: Date
): RuleWrite[] {
	const writes: RuleWrite[] = [];
	for (const rule of rules) {
		for (const action of rule.actions) {
			const key = action.prop.trim();
			if (!key) continue;
			switch (action.type) {
				case "set":
					writes.push({ key, value: coerceLiteral(action.value) });
					break;
				case "today":
					writes.push({ key, value: todayIso(now) });
					break;
				case "now":
					writes.push({ key, value: nowStamp(now) });
					break;
				case "clear":
					writes.push({ key, remove: true });
					break;
				case "toggle":
					writes.push({ key, value: !toBool(frontmatter[key]) });
					break;
				case "copy": {
					const src = action.value.trim();
					writes.push({ key, value: src ? frontmatter[src] ?? null : null });
					break;
				}
			}
		}
	}
	return writes;
}

export const AUTOMATION_ACTION_TYPES: AutomationActionType[] = [
	"set",
	"today",
	"now",
	"clear",
	"toggle",
	"copy",
];

import type BasesPowerPackPlugin from "../main";
import type { Row } from "../model/row";
import { computeRollup } from "../query/rollup";
import type { ResolvedView } from "./viewData";

/**
 * A quick-search input for a view toolbar. Returns the input so the caller can
 * restore focus after a re-render blows it away (the same pattern the Kanban
 * uses for its inline search). `onInput` fires on every keystroke.
 */
export function renderSearchControl(
	container: HTMLElement,
	current: string,
	onInput: (value: string) => void
): HTMLInputElement {
	const wrap = container.createDiv({ cls: "bpp-lite-control" });
	// No external "Search" caption: a native search field labels itself with its
	// placeholder, and the bare <input> already inherits Obsidian's input chrome.
	const input = wrap.createEl("input", {
		type: "search",
		cls: "bpp-lite-input",
		placeholder: "Filter notes…",
		attr: { "aria-label": "Search" },
	});
	input.value = current;
	input.addEventListener("input", () => onInput(input.value));
	return input;
}

/**
 * A labelled `<select>` for a view toolbar (chart type, aggregation, group-by).
 * Mirrors the search control's chrome so the toolbar reads as one control group.
 */
export function renderSelect(
	container: HTMLElement,
	label: string,
	options: Array<{ value: string; label: string }>,
	current: string,
	onChange: (value: string) => void
): HTMLSelectElement {
	const wrap = container.createDiv({ cls: "bpp-lite-control" });
	wrap.createSpan({ cls: "bpp-muted", text: label });
	// The native "dropdown" class gives the select Obsidian's chevron, fill, border,
	// and input height so it reads as first-party (bpp-lite-select only adds min-width).
	const select = wrap.createEl("select", { cls: "bpp-lite-select dropdown" });
	for (const opt of options) {
		const optionEl = select.createEl("option", { text: opt.label, value: opt.value });
		if (opt.value === current) optionEl.selected = true;
	}
	select.addEventListener("change", () => onChange(select.value));
	return select;
}

/**
 * A property-name `<select>` built from the vault's frontmatter keys, guaranteeing
 * the current value is selectable even when no note carries it yet (e.g. a default
 * `status` on an empty vault) so the toolbar never silently loses the setting.
 */
export function renderPropertySelect(
	container: HTMLElement,
	label: string,
	keys: string[],
	current: string,
	onChange: (value: string) => void
): HTMLSelectElement {
	const values = keys.includes(current) ? keys : [current, ...keys];
	return renderSelect(
		container,
		label,
		values.map((k) => ({ value: k, label: k })),
		current,
		onChange
	);
}

/** Render the base + active-filter indicators and a saved-filter switcher. */
export function renderContextControls(
	container: HTMLElement,
	plugin: BasesPowerPackPlugin,
	resolved: ResolvedView,
	onChange: () => void
): void {
	const bar = container.createDiv({ cls: "bpp-context" });

	bar.createSpan({
		cls: "bpp-muted",
		text: resolved.baseLabel ? `Base: ${resolved.baseLabel}` : "Base: all notes",
	});

	if (!plugin.settings.isPro) return;

	const filters = plugin.settings.savedFilters;
	if (filters.length === 0) return;

	bar.createSpan({ cls: "bpp-muted bpp-context-filter-label", text: "Filter:" });
	const select = bar.createEl("select", { cls: "bpp-filter-select dropdown" });
	select.createEl("option", { text: "None", value: "" });
	for (const f of filters) {
		const opt = select.createEl("option", { text: f.name, value: f.id });
		if (f.id === plugin.settings.activeFilterId) opt.selected = true;
	}
	select.addEventListener("change", () => {
		plugin.settings.activeFilterId = select.value;
		void plugin.saveSettings().then(onChange);
	});
}

/** Render the configured roll-ups as a summary bar over the given rows. */
export function renderRollupBar(container: HTMLElement, plugin: BasesPowerPackPlugin, rows: Row[]): void {
	if (!plugin.settings.isPro || plugin.settings.rollups.length === 0) return;
	const bar = container.createDiv({ cls: "bpp-rollup-bar" });
	for (const rollup of plugin.settings.rollups) {
		const chip = bar.createDiv({ cls: "bpp-rollup" });
		chip.createSpan({ cls: "bpp-rollup-label", text: rollup.label || rollup.aggregation });
		chip.createSpan({ cls: "bpp-rollup-value", text: computeRollup(rollup, rows) });
	}
}

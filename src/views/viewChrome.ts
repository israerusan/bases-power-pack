import type BasesPowerPackPlugin from "../main";
import type { Row } from "../model/row";
import { computeRollup } from "../query/rollup";
import type { ResolvedView } from "./viewData";

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
	const select = bar.createEl("select", { cls: "bpp-filter-select" });
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

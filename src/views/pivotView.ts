import type { Row } from "../model/row";
import { PowerPackView } from "./abstractView";
import { AGGREGATIONS, type Aggregation } from "../query/rollup";
import { buildPivot, type PivotModel } from "../query/pivot";
import { pivotToCsv, pivotToMarkdownTable } from "../query/export";
import { filterRowsByText } from "../query/search";
import { renderContextControls, renderPropertySelect, renderSelect } from "./viewChrome";

export const VIEW_TYPE_PIVOT = "bpp-pivot-view";

/**
 * Pivot / matrix view (PREMIUM). Cross-tabulates the rows on two properties at
 * once — one down the side, one across the top — and aggregates an expression at
 * every intersection, with per-row / per-column / grand totals. The row/column
 * properties, the aggregation, and the value expression are chosen from the
 * toolbar and remembered in settings; a quick-search narrows the rows first.
 */
export class PivotView extends PowerPackView {
	/** The matrix behind the current render, captured for the export builders. */
	private lastModel: PivotModel | null = null;

	getViewType(): string {
		return VIEW_TYPE_PIVOT;
	}
	getDisplayText(): string {
		return "Power Pack: Pivot";
	}
	getIcon(): string {
		return "table";
	}

	async render(): Promise<void> {
		const token = ++this.renderToken;
		const container = this.contentEl;

		if (!this.plugin.settings.isPro) {
			container.empty();
			container.addClass("bpp-view");
			this.renderUpgradeNotice(
				container,
				"📊",
				"Pivot is a Premium view",
				"Cross-tabulate your notes like a spreadsheet pivot table.",
				[
					"Group by two properties at once — rows × columns",
					"Aggregate with count, sum, average, min/max, and more",
					"Per-row, per-column, and grand totals",
					"Feed it a formula for weighted or computed cells",
				]
			);
			return;
		}

		const resolved = await this.plugin.getResolvedView();
		if (this.isStale(token)) return;

		this.captureSearchState();
		container.empty();
		container.addClass("bpp-view");

		this.renderToolbar(container);
		renderContextControls(container, this.plugin, resolved, () => void this.render());

		const rows = filterRowsByText(resolved.rows, this.searchQuery);
		if (rows.length === 0) {
			this.lastModel = null; // so Export can't copy a stale, no-longer-shown matrix
			container.createDiv({
				cls: "bpp-empty",
				text: this.searchQuery ? "No notes match the current search." : "No notes to pivot yet.",
			});
			return;
		}

		this.renderMatrix(container, rows);
	}

	private renderToolbar(container: HTMLElement): void {
		const toolbar = container.createDiv({ cls: "bpp-toolbar" });
		toolbar.createEl("h3", { text: "Pivot" });

		const s = this.plugin.settings;
		const keys = this.plugin.getFrontmatterKeys();
		const controls = toolbar.createDiv({ cls: "bpp-lite-controls" });

		renderPropertySelect(controls, "Rows", keys, s.pivotRowProp, (value) => {
			s.pivotRowProp = value || "status";
			this.persist();
		});
		renderPropertySelect(controls, "Columns", keys, s.pivotColProp, (value) => {
			s.pivotColProp = value || "priority";
			this.persist();
		});
		renderSelect(
			controls,
			"Aggregate",
			AGGREGATIONS.map((a) => ({ value: a, label: a })),
			s.pivotAggregation,
			(value) => {
				s.pivotAggregation = value as Aggregation;
				this.persist();
			}
		);
		// The value expression only matters for a numeric aggregation — count just
		// tallies rows — so it's hidden while counting to keep the toolbar quiet.
		if (s.pivotAggregation !== "count") {
			const wrap = controls.createDiv({ cls: "bpp-lite-control" });
			wrap.createSpan({ cls: "bpp-muted", text: "Value" });
			const input = wrap.createEl("input", {
				type: "text",
				cls: "bpp-lite-input",
				placeholder: "expression, e.g. hours",
			});
			input.value = s.pivotValueExpr;
			input.addEventListener("change", () => {
				s.pivotValueExpr = input.value.trim();
				this.persist();
			});
		}

		this.addExportButton(toolbar, [
			{
				label: "Copy as Markdown table",
				build: () => this.lastModel ? pivotToMarkdownTable(this.lastModel, s.pivotRowProp, s.pivotColProp) : "",
			},
			{
				label: "Export as CSV",
				premium: true,
				build: () => this.lastModel ? pivotToCsv(this.lastModel, s.pivotRowProp, s.pivotColProp) : "",
			},
		]);
		this.renderManagedSearch(toolbar);
	}

	/** Persist a toolbar choice without dropping the resolved-view cache — these are
	 * presentation-only (they re-bucket already-resolved rows), so re-resolving the
	 * base and rebuilding every Row would be wasted work. */
	private persist(): void {
		void this.plugin.saveSettings({ invalidateResolved: false }).then(() => this.render());
	}

	private renderMatrix(container: HTMLElement, rows: Row[]): void {
		const s = this.plugin.settings;
		const model = buildPivot(rows, {
			rowProp: s.pivotRowProp,
			colProp: s.pivotColProp,
			aggregation: s.pivotAggregation,
			valueExpr: s.pivotValueExpr,
		});
		this.lastModel = model;

		if (model.truncatedRows || model.truncatedCols) {
			const axes = [model.truncatedRows ? "rows" : null, model.truncatedCols ? "columns" : null]
				.filter(Boolean)
				.join(" and ");
			container.createDiv({
				cls: "bpp-pivot-note",
				text: `Too many distinct values — showing the first 50 ${axes}. Pick a lower-cardinality property or add a filter.`,
			});
		}

		const scroll = container.createDiv({ cls: "bpp-pivot-scroll" });
		const table = scroll.createEl("table", { cls: "bpp-pivot" });

		const thead = table.createEl("thead");
		const headRow = thead.createEl("tr");
		headRow.createEl("th", { cls: "bpp-pivot-corner", text: `${s.pivotRowProp} \\ ${s.pivotColProp}` });
		for (const colKey of model.colKeys) headRow.createEl("th", { cls: "bpp-pivot-colhead", text: colKey });
		headRow.createEl("th", { cls: "bpp-pivot-total-head", text: "Total" });

		const tbody = table.createEl("tbody");
		model.rowKeys.forEach((rowKey, ri) => {
			const tr = tbody.createEl("tr");
			tr.createEl("th", { cls: "bpp-pivot-rowhead", text: rowKey, attr: { scope: "row" } });
			model.colKeys.forEach((_colKey, ci) => {
				const count = model.counts[ri][ci];
				const cell = tr.createEl("td", { cls: "bpp-pivot-cell" });
				if (count === 0) {
					// An empty intersection reads as clutter if it shows "0" everywhere;
					// a faint dot keeps the grid legible while marking it as present.
					cell.addClass("is-empty");
					cell.setText("·");
				} else {
					cell.setText(model.cells[ri][ci]);
					cell.setAttr("title", `${count} note${count === 1 ? "" : "s"}`);
				}
			});
			tr.createEl("td", { cls: "bpp-pivot-cell bpp-pivot-total", text: model.rowTotals[ri] });
		});

		const tfoot = table.createEl("tfoot");
		const totalRow = tfoot.createEl("tr");
		totalRow.createEl("th", { cls: "bpp-pivot-rowhead bpp-pivot-total", text: "Total", attr: { scope: "row" } });
		model.colKeys.forEach((_colKey, ci) => {
			totalRow.createEl("td", { cls: "bpp-pivot-cell bpp-pivot-total", text: model.colTotals[ci] });
		});
		totalRow.createEl("td", { cls: "bpp-pivot-cell bpp-pivot-total bpp-pivot-grand", text: model.grandTotal });
	}
}

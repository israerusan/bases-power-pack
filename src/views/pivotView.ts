import type { Row } from "../model/row";
import { PowerPackView, type DrillRequest } from "./abstractView";
import { AGGREGATIONS, type Aggregation } from "../query/rollup";
import { buildPivot, type PivotModel } from "../query/pivot";
import { pivotToCsv, pivotToMarkdownTable } from "../query/export";
import { filterRowsByText } from "../query/search";
import { renderContextControls, renderPropertySelect, renderSelect } from "./viewChrome";

export const VIEW_TYPE_PIVOT = "bpp-pivot-view";

/**
 * Pivot / matrix view (PREMIUM). Cross-tabulates the rows on two properties at
 * once — one down the side, one across the top — and aggregates an expression at
 * every intersection, with per-row / per-column / grand totals. Every number is a
 * doorway: click a cell, a header, or a total to drill into the exact notes behind
 * it and act on them without leaving. The row/column properties, aggregation,
 * value expression, key order, and heat-map are chosen from the toolbar and
 * remembered in settings; a quick-search narrows the rows first.
 */
export class PivotView extends PowerPackView {
	/** The matrix behind the current render, captured for the export + drill builders. */
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
					"Click any cell to drill into the notes behind it",
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
		this.renderHintBar(
			container,
			"pivot",
			"Click any cell or total to open the notes behind it • Flip axis order and heat-map from the toolbar"
		);

		const rows = filterRowsByText(resolved.rows, this.searchQuery);
		if (rows.length === 0) {
			this.lastModel = null; // so Export / drill can't reference a stale, no-longer-shown matrix
			if (this.searchQuery) {
				this.renderEmptyState(container, {
					title: "No matches",
					body: "No notes match the current search.",
					actions: [
						{
							label: "Clear search",
							onClick: () => {
								this.searchQuery = "";
								void this.render();
							},
						},
					],
				});
			} else {
				const s = this.plugin.settings;
				this.renderEmptyState(container, {
					title: "Nothing to pivot yet",
					body: `Pick a row and column property (currently row "${s.pivotRowProp}" × column "${s.pivotColProp}") that your notes actually use, or open settings to change them.`,
					actions: [{ label: "Open settings", onClick: () => this.openSettings() }],
				});
			}
			this.restoreDrill();
			return;
		}

		this.renderMatrix(container, rows);
		// Re-materialise an open drill panel against the freshly-built matrix, so an
		// edit made inside it refreshes the list (a note may have left the bucket).
		this.restoreDrill();
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
		renderSelect(
			controls,
			"Order",
			[
				{ value: "label", label: "Name" },
				{ value: "total", label: "Busiest" },
			],
			s.pivotSort,
			(value) => {
				s.pivotSort = value === "total" ? "total" : "label";
				this.persist();
			}
		);

		const heat = toolbar.createEl("button", {
			cls: "bpp-seg-btn",
			text: "🔥 Heat",
			attr: { "aria-pressed": String(s.pivotHeat), "aria-label": "Toggle heat-map shading" },
		});
		if (s.pivotHeat) heat.addClass("is-active");
		heat.addEventListener("click", () => {
			s.pivotHeat = !s.pivotHeat;
			this.persist();
		});

		this.addExportButton(toolbar, [
			{
				label: "Copy as Markdown table",
				build: () => (this.lastModel ? pivotToMarkdownTable(this.lastModel, s.pivotRowProp, s.pivotColProp) : ""),
			},
			{
				label: "Export as CSV",
				premium: true,
				build: () => (this.lastModel ? pivotToCsv(this.lastModel, s.pivotRowProp, s.pivotColProp) : ""),
			},
		]);
		this.renderManagedSearch(toolbar);
	}

	/** Persist a toolbar choice without dropping the resolved-view cache — these are
	 * presentation-only (they re-bucket already-resolved rows), so re-resolving the
	 * base and rebuilding every Row would be wasted work. */
	private persist(): void {
		this.closeDrill(); // the matrix is about to re-bucket; a stale drill would mislabel
		void this.plugin.saveSettings({ invalidateResolved: false }).then(() => this.render());
	}

	private renderMatrix(container: HTMLElement, rows: Row[]): void {
		const s = this.plugin.settings;
		const model = buildPivot(rows, {
			rowProp: s.pivotRowProp,
			colProp: s.pivotColProp,
			aggregation: s.pivotAggregation,
			valueExpr: s.pivotValueExpr,
			sort: s.pivotSort,
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

		// The busiest cell sets the heat scale, so shading is relative to this matrix.
		const maxCount = s.pivotHeat ? Math.max(1, ...model.counts.flat()) : 0;

		const scroll = container.createDiv({ cls: "bpp-pivot-scroll" });
		const table = scroll.createEl("table", { cls: "bpp-pivot" });
		if (s.pivotHeat) table.addClass("is-heat");

		const thead = table.createEl("thead");
		const headRow = thead.createEl("tr");
		headRow.createEl("th", { cls: "bpp-pivot-corner", text: `${s.pivotRowProp} \\ ${s.pivotColProp}` });
		model.colKeys.forEach((colKey) => {
			const th = headRow.createEl("th", { cls: "bpp-pivot-colhead", text: colKey });
			this.makeDrillable(th, `Notes where ${s.pivotColProp} is ${colKey}`, () =>
				this.openDrill(() => this.colDrill(colKey))
			);
		});
		headRow.createEl("th", { cls: "bpp-pivot-total-head", text: "Total" });

		const tbody = table.createEl("tbody");
		model.rowKeys.forEach((rowKey, ri) => {
			const tr = tbody.createEl("tr");
			const rh = tr.createEl("th", { cls: "bpp-pivot-rowhead", text: rowKey, attr: { scope: "row" } });
			this.makeDrillable(rh, `Notes where ${s.pivotRowProp} is ${rowKey}`, () =>
				this.openDrill(() => this.rowDrill(rowKey))
			);
			model.colKeys.forEach((colKey, ci) => {
				const count = model.counts[ri][ci];
				const cell = tr.createEl("td", { cls: "bpp-pivot-cell" });
				if (count === 0) {
					// An empty intersection reads as clutter if it shows "0" everywhere;
					// a faint dot keeps the grid legible while marking it as present. It's
					// not drillable — there's nothing behind it.
					cell.addClass("is-empty");
					cell.setText("·");
				} else {
					cell.setText(model.cells[ri][ci]);
					cell.setAttr("title", `${count} note${count === 1 ? "" : "s"}`);
					if (s.pivotHeat) {
						cell.addClass("is-hot");
						cell.style.setProperty("--bpp-heat", (count / maxCount).toFixed(3));
					}
					this.makeDrillable(cell, `${count} note${count === 1 ? "" : "s"}: ${rowKey} × ${colKey}`, () =>
						this.openDrill(() => this.cellDrill(rowKey, colKey))
					);
				}
			});
			const rt = tr.createEl("td", { cls: "bpp-pivot-cell bpp-pivot-total", text: model.rowTotals[ri] });
			// "N notes in X", not "All N" — under column truncation this row's notes on a
			// dropped column aren't counted here, matching the displayed row total.
			this.makeDrillable(rt, `${model.rowKeyRows[ri].length} notes in ${rowKey}`, () =>
				this.openDrill(() => this.rowDrill(rowKey))
			);
		});

		const tfoot = table.createEl("tfoot");
		const totalRow = tfoot.createEl("tr");
		totalRow.createEl("th", { cls: "bpp-pivot-rowhead bpp-pivot-total", text: "Total", attr: { scope: "row" } });
		model.colKeys.forEach((colKey, ci) => {
			const ct = totalRow.createEl("td", { cls: "bpp-pivot-cell bpp-pivot-total", text: model.colTotals[ci] });
			this.makeDrillable(ct, `${model.colKeyRows[ci].length} notes in ${colKey}`, () =>
				this.openDrill(() => this.colDrill(colKey))
			);
		});
		const grand = totalRow.createEl("td", { cls: "bpp-pivot-cell bpp-pivot-total bpp-pivot-grand", text: model.grandTotal });
		this.makeDrillable(grand, `All ${model.allRows.length} notes`, () => this.openDrill(() => this.grandDrill()));
	}

	// ---- drill resolvers -----------------------------------------------------
	// Each looks its rows up by stable KEY (not a captured index/snapshot) against
	// the latest matrix, so the panel stays correct after a re-render reorders keys
	// or an edit changes the counts. Returns null when the bucket is gone.

	private cellDrill(rowKey: string, colKey: string): DrillRequest | null {
		const model = this.lastModel;
		if (!model) return null;
		const ri = model.rowKeys.indexOf(rowKey);
		const ci = model.colKeys.indexOf(colKey);
		if (ri < 0 || ci < 0) return null;
		const cellRows = model.cellRows[ri][ci];
		if (cellRows.length === 0) return null;
		return {
			title: `${rowKey} × ${colKey}`,
			subtitle: this.cellSubtitle(cellRows.length, model.cells[ri][ci]),
			rows: cellRows,
		};
	}

	private rowDrill(rowKey: string): DrillRequest | null {
		const model = this.lastModel;
		if (!model) return null;
		const ri = model.rowKeys.indexOf(rowKey);
		if (ri < 0) return null;
		return {
			title: `${this.plugin.settings.pivotRowProp}: ${rowKey}`,
			subtitle: this.cellSubtitle(model.rowKeyRows[ri].length, model.rowTotals[ri]),
			rows: model.rowKeyRows[ri],
		};
	}

	private colDrill(colKey: string): DrillRequest | null {
		const model = this.lastModel;
		if (!model) return null;
		const ci = model.colKeys.indexOf(colKey);
		if (ci < 0) return null;
		return {
			title: `${this.plugin.settings.pivotColProp}: ${colKey}`,
			subtitle: this.cellSubtitle(model.colKeyRows[ci].length, model.colTotals[ci]),
			rows: model.colKeyRows[ci],
		};
	}

	private grandDrill(): DrillRequest | null {
		const model = this.lastModel;
		if (!model || model.allRows.length === 0) return null;
		return {
			title: "All notes",
			subtitle: this.cellSubtitle(model.allRows.length, model.grandTotal),
			rows: model.allRows,
		};
	}

	/** Panel subtitle: the note count, plus the aggregated value when it's not just
	 * a count (so a "sum of hours" cell says what the number means). */
	private cellSubtitle(count: number, display: string): string {
		const noun = `${count} note${count === 1 ? "" : "s"}`;
		const agg = this.plugin.settings.pivotAggregation;
		return agg === "count" ? noun : `${noun} · ${agg} = ${display}`;
	}
}

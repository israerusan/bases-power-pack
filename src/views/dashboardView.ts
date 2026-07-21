import type { Row } from "../model/row";
import { PowerPackView, type DrillRequest } from "./abstractView";
import { AGGREGATIONS, type Aggregation } from "../query/rollup";
import {
	buildDefaultKpis,
	buildDistribution,
	buildDonutSegments,
	buildRollupKpis,
	annularSectorPath,
	DASHBOARD_CHART_TYPES,
	DASHBOARD_CHART_LABELS,
	DISTRIBUTION_SORTS,
	DISTRIBUTION_SORT_LABELS,
	type Distribution,
	type DistributionSort,
	type Kpi,
} from "../query/dashboard";
import { columnHue } from "../query/kanban";
import { filterRowsByText } from "../query/search";
import { renderContextControls, renderPropertySelect, renderSelect } from "./viewChrome";

export const VIEW_TYPE_DASHBOARD = "bpp-dashboard-view";

const DONUT_SIZE = 200;
const DONUT_OUTER = 92;
const DONUT_INNER = 56;

/** Top-N presets for the "categories shown" control (0 = all). */
const TOP_N_OPTIONS = [5, 8, 12, 20, 0];

/**
 * Dashboard / analytics view (PREMIUM). Turns any base into a live reporting
 * surface: KPI cards (your configured roll-ups, or built-in totals when you have
 * none) plus a category distribution you can flip between horizontal bars, a
 * donut, and a single stacked bar, ordered and capped from the toolbar. Every
 * figure is clickable — a KPI card, a bar, an arc, a legend row — and drills into
 * the exact notes behind it, which you can open and edit without leaving. All of
 * it reuses the roll-up aggregation engine, so a headline number and its chart
 * always agree.
 */
export class DashboardView extends PowerPackView {
	/** The rows behind the current render, captured so drill resolvers can re-derive
	 * the slice / KPI subsets against current data after an edit. */
	private lastRows: Row[] = [];

	getViewType(): string {
		return VIEW_TYPE_DASHBOARD;
	}
	getDisplayText(): string {
		return "Power Pack: Dashboard";
	}
	getIcon(): string {
		return "bar-chart-3";
	}

	async render(): Promise<void> {
		const token = ++this.renderToken;
		const container = this.contentEl;

		if (!this.plugin.settings.isPro) {
			container.empty();
			container.addClass("bpp-view");
			this.renderUpgradeNotice(
				container,
				"📈",
				"Dashboard is a Premium view",
				"Turn any base into a live reporting surface.",
				[
					"KPI cards from your roll-ups and formulas",
					"Distribution as bars, a donut, or a stacked bar",
					"Sort and cap categories; aggregate by count, sum, or average",
					"Click any figure to drill into the notes behind it",
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
			"dashboard",
			"Click a KPI, bar, or chart segment to open the matching notes • Switch chart type from the toolbar"
		);

		const rows = filterRowsByText(resolved.rows, this.searchQuery);
		this.lastRows = rows;
		if (rows.length === 0) {
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
				this.renderEmptyState(container, {
					title: "Nothing to summarize yet",
					body: `The dashboard groups notes by "${this.plugin.settings.dashboardGroupBy}". Add that property to some notes, or open settings to group by a different one.`,
					actions: [{ label: "Open settings", onClick: () => this.openSettings() }],
				});
			}
			this.restoreDrill();
			return;
		}

		this.renderKpis(container, rows);
		this.renderChart(container, rows);
		// Refresh an open drill panel against the freshly-derived subsets.
		this.restoreDrill();
	}

	private renderToolbar(container: HTMLElement): void {
		const toolbar = container.createDiv({ cls: "bpp-toolbar" });
		toolbar.createEl("h3", { text: "Dashboard" });

		const s = this.plugin.settings;
		const keys = this.plugin.getFrontmatterKeys();
		const controls = toolbar.createDiv({ cls: "bpp-lite-controls" });

		renderPropertySelect(controls, "Group by", keys, s.dashboardGroupBy, (value) => {
			s.dashboardGroupBy = value || "status";
			this.persist();
		});
		renderSelect(
			controls,
			"Aggregate",
			AGGREGATIONS.map((a) => ({ value: a, label: a })),
			s.dashboardAggregation,
			(value) => {
				s.dashboardAggregation = value as Aggregation;
				this.persist();
			}
		);
		if (s.dashboardAggregation !== "count") {
			const wrap = controls.createDiv({ cls: "bpp-lite-control" });
			wrap.createSpan({ cls: "bpp-muted", text: "Value" });
			const input = wrap.createEl("input", {
				type: "text",
				cls: "bpp-lite-input",
				placeholder: "expression, e.g. hours",
			});
			input.value = s.dashboardValueExpr;
			input.addEventListener("change", () => {
				s.dashboardValueExpr = input.value.trim();
				this.persist();
			});
		}
		renderSelect(
			controls,
			"Sort",
			DISTRIBUTION_SORTS.map((v) => ({ value: v, label: DISTRIBUTION_SORT_LABELS[v] })),
			s.dashboardSort,
			(value) => {
				s.dashboardSort = value as DistributionSort;
				this.persist();
			}
		);
		renderSelect(
			controls,
			"Show",
			TOP_N_OPTIONS.map((n) => ({ value: String(n), label: n === 0 ? "All" : `Top ${n}` })),
			String(s.dashboardTopN),
			(value) => {
				s.dashboardTopN = Number(value) || 0;
				this.persist();
			}
		);

		const seg = toolbar.createDiv({ cls: "bpp-segmented" });
		for (const type of DASHBOARD_CHART_TYPES) {
			const btn = seg.createEl("button", { text: DASHBOARD_CHART_LABELS[type], cls: "bpp-seg-btn" });
			if (s.dashboardChartType === type) btn.addClass("is-active");
			btn.setAttr("aria-pressed", String(s.dashboardChartType === type));
			btn.addEventListener("click", () => {
				if (s.dashboardChartType === type) return;
				s.dashboardChartType = type;
				this.persist();
			});
		}

		this.renderManagedSearch(toolbar);
	}

	private persist(): void {
		// A toolbar change re-buckets the same rows; a drill panel keyed to the old
		// buckets would mislabel, so close it. (Presentation-only — keep the resolve cache.)
		this.closeDrill();
		void this.plugin.saveSettings({ invalidateResolved: false }).then(() => this.render());
	}

	/** The distribution for the current settings — shared by render and the slice
	 * drill resolvers so they always agree. Top-N of 0 means "no fold". */
	private distributionOf(rows: Row[]): Distribution {
		const s = this.plugin.settings;
		return buildDistribution(rows, {
			groupBy: s.dashboardGroupBy,
			aggregation: s.dashboardAggregation,
			valueExpr: s.dashboardValueExpr,
			sort: s.dashboardSort,
			maxSlices: s.dashboardTopN > 0 ? s.dashboardTopN : Number.MAX_SAFE_INTEGER,
		});
	}

	/** The KPI cards for the current settings — shared by render and the KPI drill. */
	private kpisOf(rows: Row[]): Kpi[] {
		const s = this.plugin.settings;
		return s.rollups.length > 0
			? buildRollupKpis(rows, s.rollups)
			: buildDefaultKpis(rows, s.kanbanGroupBy || "status", s.kanbanDoneValue);
	}

	private renderKpis(container: HTMLElement, rows: Row[]): void {
		const grid = container.createDiv({ cls: "bpp-kpi-grid" });
		for (const kpi of this.kpisOf(rows)) {
			const card = grid.createDiv({ cls: "bpp-kpi" });
			card.createDiv({ cls: "bpp-kpi-value", text: kpi.value });
			card.createDiv({ cls: "bpp-kpi-label", text: kpi.label });
			if (kpi.sub) card.createDiv({ cls: "bpp-kpi-sub", text: kpi.sub });
			if (kpi.rows.length > 0) {
				this.makeDrillable(card, `${kpi.value} ${kpi.label} — list the notes`, () =>
					this.openDrill(() => this.kpiDrill(kpi.label))
				);
			}
		}
	}

	private renderChart(container: HTMLElement, rows: Row[]): void {
		const s = this.plugin.settings;
		const distribution = this.distributionOf(rows);

		const section = container.createDiv({ cls: "bpp-chart-section" });
		const heading = s.dashboardAggregation === "count" ? "count" : `${s.dashboardAggregation} of ${s.dashboardValueExpr || "1"}`;
		section.createEl("h4", { cls: "bpp-chart-title", text: `${heading} by ${s.dashboardGroupBy}` });

		if (distribution.slices.length === 0 || distribution.total <= 0) {
			section.createDiv({ cls: "bpp-empty", text: "No values to chart for the current aggregation." });
			return;
		}

		if (s.dashboardChartType === "donut") this.renderDonut(section, distribution);
		else if (s.dashboardChartType === "stacked") this.renderStacked(section, distribution);
		else this.renderBars(section, distribution);

		if (distribution.truncated) {
			section.createDiv({ cls: "bpp-muted bpp-chart-note", text: "Smaller categories are folded into “Other”." });
		}
	}

	private renderBars(section: HTMLElement, distribution: Distribution): void {
		const list = section.createDiv({ cls: "bpp-bars" });
		for (const slice of distribution.slices) {
			const row = list.createDiv({ cls: "bpp-bar-row" });
			row.createSpan({ cls: "bpp-bar-label", text: slice.key, attr: { title: slice.key } });
			const track = row.createDiv({ cls: "bpp-bar-track" });
			const fill = track.createDiv({ cls: "bpp-bar-fill" });
			const pct = distribution.max > 0 ? (slice.value / distribution.max) * 100 : 0;
			fill.setCssProps({ width: `${pct}%` });
			fill.setCssProps({ "--bpp-bar-hue": String(columnHue(slice.key)) });
			row.createSpan({ cls: "bpp-bar-value", text: formatValue(slice.value) });
			if (slice.rows.length > 0) {
				this.makeDrillable(row, `${slice.key}: ${slice.count} notes — list them`, () =>
					this.openDrill(() => this.sliceDrill(slice.key, slice.isOther === true))
				);
			}
		}
	}

	/** A single full-width bar split into proportional colored segments — the donut
	 * "unrolled", compact and easy to compare part-to-whole at a glance. */
	private renderStacked(section: HTMLElement, distribution: Distribution): void {
		const wrap = section.createDiv({ cls: "bpp-stacked-wrap" });
		const bar = wrap.createDiv({ cls: "bpp-stacked" });
		for (const slice of distribution.slices) {
			if (slice.value <= 0) continue;
			const seg = bar.createDiv({ cls: "bpp-stacked-seg" });
			const pct = distribution.total > 0 ? (slice.value / distribution.total) * 100 : 0;
			seg.setCssProps({ width: `${pct}%`, "--bpp-bar-hue": String(columnHue(slice.key)) });
			seg.setAttr("title", `${slice.key}: ${formatValue(slice.value)} · ${Math.round(pct)}%`);
			if (slice.rows.length > 0) {
				this.makeDrillable(seg, `${slice.key}: ${slice.count} notes — list them`, () =>
					this.openDrill(() => this.sliceDrill(slice.key, slice.isOther === true))
				);
			}
		}
		this.renderLegend(wrap, distribution);
	}

	private renderDonut(section: HTMLElement, distribution: Distribution): void {
		const wrap = section.createDiv({ cls: "bpp-donut-wrap" });
		const segments = buildDonutSegments(distribution.slices);
		const svg = wrap.createSvg("svg", {
			cls: "bpp-donut",
			attr: {
				viewBox: `0 0 ${DONUT_SIZE} ${DONUT_SIZE}`,
				width: String(DONUT_SIZE),
				height: String(DONUT_SIZE),
				role: "img",
				"aria-label": `Distribution donut, ${segments.length} categor${segments.length === 1 ? "y" : "ies"}`,
			},
		});
		const cx = DONUT_SIZE / 2;
		const cy = DONUT_SIZE / 2;

		if (segments.length === 1) {
			// A single full-circle segment is a degenerate arc (start == end), so draw
			// it as a plain ring: a filled outer disc with the hole punched by an
			// inner disc painted in the surface color.
			const seg = segments[0];
			const disc = svg.createSvg("circle", {
				attr: { cx: String(cx), cy: String(cy), r: String(DONUT_OUTER), fill: sliceColor(seg.key) },
			});
			this.makeArcDrillable(disc, seg.key, distribution.slices.find((sl) => sl.key === seg.key)?.isOther === true);
			svg.createSvg("circle", {
				cls: "bpp-donut-hole",
				attr: { cx: String(cx), cy: String(cy), r: String(DONUT_INNER) },
			});
		} else {
			for (const seg of segments) {
				const path = svg.createSvg("path", {
					attr: {
						d: annularSectorPath(cx, cy, DONUT_OUTER, DONUT_INNER, seg.startAngle, seg.endAngle),
						fill: sliceColor(seg.key),
					},
				});
				this.makeArcDrillable(path, seg.key, distribution.slices.find((sl) => sl.key === seg.key)?.isOther === true);
			}
		}

		this.renderLegend(wrap, distribution);
	}

	/** Make a donut arc a mouse drill target (keyboard users use the legend, which is
	 * fully drillable). SVG elements aren't HTMLElements, so this is a lighter-weight
	 * click+cursor rather than the full `makeDrillable`. */
	private makeArcDrillable(el: SVGElement, key: string, isOther: boolean): void {
		el.classList.add("bpp-arc-drill");
		el.createSvg("title").textContent = `${key} — click to list notes`;
		el.addEventListener("click", () => this.openDrill(() => this.sliceDrill(key, isOther)));
	}

	private renderLegend(wrap: HTMLElement, distribution: Distribution): void {
		const legend = wrap.createDiv({ cls: "bpp-legend" });
		for (const slice of distribution.slices) {
			if (slice.value <= 0) continue;
			const item = legend.createDiv({ cls: "bpp-legend-item" });
			item.createSpan({ cls: "bpp-legend-swatch" }).setCssProps({ "--bpp-bar-hue": String(columnHue(slice.key)) });
			item.createSpan({ cls: "bpp-legend-label", text: slice.key });
			const pct = distribution.total > 0 ? Math.round((slice.value / distribution.total) * 100) : 0;
			item.createSpan({ cls: "bpp-muted bpp-legend-value", text: `${formatValue(slice.value)} · ${pct}%` });
			if (slice.rows.length > 0) {
				this.makeDrillable(item, `${slice.key}: ${slice.count} notes — list them`, () =>
					this.openDrill(() => this.sliceDrill(slice.key, slice.isOther === true))
				);
			}
		}
	}

	// ---- drill resolvers -----------------------------------------------------
	// Re-derive the subset from the CURRENT rows/settings and look it up by key, so
	// the panel stays correct after an edit changes the buckets. Returns null when
	// the slice / KPI no longer exists.

	private sliceDrill(key: string, isOther: boolean): DrillRequest | null {
		const dist = this.distributionOf(this.lastRows);
		// Target the folded bucket by its flag (its "Other (N)" count can drift after an
		// edit), and a real category by exact key — never by label prefix, which a real
		// value literally starting with "Other (…)" would collide with.
		const slice = dist.slices.find((s) => (isOther ? s.isOther === true : s.isOther !== true && s.key === key));
		if (!slice || slice.rows.length === 0) return null;
		const agg = this.plugin.settings.dashboardAggregation;
		const noun = `${slice.count} note${slice.count === 1 ? "" : "s"}`;
		return {
			title: `${this.plugin.settings.dashboardGroupBy}: ${slice.key}`,
			subtitle: agg === "count" ? noun : `${noun} · ${agg} = ${formatValue(slice.value)}`,
			rows: slice.rows,
		};
	}

	private kpiDrill(label: string): DrillRequest | null {
		const kpi = this.kpisOf(this.lastRows).find((k) => k.label === label);
		if (!kpi || kpi.rows.length === 0) return null;
		return {
			title: kpi.label,
			subtitle: `${kpi.rows.length} note${kpi.rows.length === 1 ? "" : "s"}`,
			rows: kpi.rows,
		};
	}
}

function sliceColor(key: string): string {
	return `hsl(${columnHue(key)}, 60%, 55%)`;
}

function formatValue(n: number): string {
	return String(Math.round(n * 100) / 100);
}

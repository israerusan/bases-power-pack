import type { Row } from "../model/row";
import { PowerPackView } from "./abstractView";
import { AGGREGATIONS, type Aggregation } from "../query/rollup";
import {
	buildDefaultKpis,
	buildDistribution,
	buildDonutSegments,
	buildRollupKpis,
	annularSectorPath,
	DASHBOARD_CHART_TYPES,
	type Distribution,
	type Kpi,
} from "../query/dashboard";
import { columnHue } from "../query/kanban";
import { filterRowsByText } from "../query/search";
import { renderContextControls, renderPropertySelect, renderSelect } from "./viewChrome";

export const VIEW_TYPE_DASHBOARD = "bpp-dashboard-view";

const DONUT_SIZE = 200;
const DONUT_OUTER = 92;
const DONUT_INNER = 56;

/**
 * Dashboard / analytics view (PREMIUM). Turns any base into a live reporting
 * surface: KPI cards (your configured roll-ups, or built-in totals when you have
 * none) plus a category distribution chart you can flip between horizontal bars
 * and a donut. Everything reuses the roll-up aggregation engine, so a headline
 * number and its chart always agree.
 */
export class DashboardView extends PowerPackView {
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
					"Distribution charts — horizontal bars or a donut",
					"Aggregate by count, sum, or average",
					"Respects your active base and saved filters",
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
			container.createDiv({
				cls: "bpp-empty",
				text: this.searchQuery ? "No notes match the current search." : "No notes to summarize yet.",
			});
			return;
		}

		this.renderKpis(container, rows);
		this.renderChart(container, rows);
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

		const seg = toolbar.createDiv({ cls: "bpp-segmented" });
		for (const type of DASHBOARD_CHART_TYPES) {
			const btn = seg.createEl("button", { text: type === "bar" ? "Bars" : "Donut", cls: "bpp-seg-btn" });
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
		void this.plugin.saveSettings({ invalidateResolved: false }).then(() => this.render());
	}

	private renderKpis(container: HTMLElement, rows: Row[]): void {
		const s = this.plugin.settings;
		const kpis: Kpi[] =
			s.rollups.length > 0
				? buildRollupKpis(rows, s.rollups)
				: buildDefaultKpis(rows, s.kanbanGroupBy || "status", s.kanbanDoneValue);

		const grid = container.createDiv({ cls: "bpp-kpi-grid" });
		for (const kpi of kpis) {
			const card = grid.createDiv({ cls: "bpp-kpi" });
			card.createDiv({ cls: "bpp-kpi-value", text: kpi.value });
			card.createDiv({ cls: "bpp-kpi-label", text: kpi.label });
			if (kpi.sub) card.createDiv({ cls: "bpp-kpi-sub", text: kpi.sub });
		}
	}

	private renderChart(container: HTMLElement, rows: Row[]): void {
		const s = this.plugin.settings;
		const distribution = buildDistribution(rows, {
			groupBy: s.dashboardGroupBy,
			aggregation: s.dashboardAggregation,
			valueExpr: s.dashboardValueExpr,
		});

		const section = container.createDiv({ cls: "bpp-chart-section" });
		const heading = s.dashboardAggregation === "count" ? "count" : `${s.dashboardAggregation} of ${s.dashboardValueExpr || "1"}`;
		section.createEl("h4", { cls: "bpp-chart-title", text: `${heading} by ${s.dashboardGroupBy}` });

		if (distribution.slices.length === 0 || distribution.total <= 0) {
			section.createDiv({ cls: "bpp-empty", text: "No values to chart for the current aggregation." });
			return;
		}

		if (s.dashboardChartType === "donut") this.renderDonut(section, distribution);
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
		}
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
			svg.createSvg("circle", {
				attr: { cx: String(cx), cy: String(cy), r: String(DONUT_OUTER), fill: sliceColor(seg.key) },
			});
			svg.createSvg("circle", {
				cls: "bpp-donut-hole",
				attr: { cx: String(cx), cy: String(cy), r: String(DONUT_INNER) },
			});
		} else {
			for (const seg of segments) {
				svg.createSvg("path", {
					attr: {
						d: annularSectorPath(cx, cy, DONUT_OUTER, DONUT_INNER, seg.startAngle, seg.endAngle),
						fill: sliceColor(seg.key),
					},
				});
			}
		}

		this.renderLegend(wrap, distribution);
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
		}
	}
}

function sliceColor(key: string): string {
	return `hsl(${columnHue(key)}, 60%, 55%)`;
}

function formatValue(n: number): string {
	return String(Math.round(n * 100) / 100);
}

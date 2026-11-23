import { FuzzySuggestModal, Menu, Notice, type App } from "obsidian";
import type { Row } from "../model/row";
import {
	addDependency,
	buildDependencyEdges,
	edgeKey,
	removeDependency,
	scheduleConflicts,
	wouldCreateCycle,
	type DependencyEdge,
} from "../query/ganttLinks";
import { isRowDone } from "../query/kanban";
import { PowerPackView } from "./abstractView";
import { toBool, toStr } from "../engine/expression";
import { filterRowsByText } from "../query/search";
import { PromptModal } from "./modals";
import {
	buildGantt,
	moveBarDates,
	normalizeProgress,
	pxToDays,
	resizeBarEnd,
	toDayNumber,
	type GanttBar,
} from "../query/gantt";
import { rescheduleDateValue, toIsoDateKey, todayIso } from "../query/dates";
import { writeRowFields } from "./viewData";
import { renderContextControls, renderPropertySelect, renderRollupBar, renderSelect } from "./viewChrome";

export const VIEW_TYPE_GANTT = "bpp-gantt-view";

/** Visual zoom presets: pixels per day. */
const ZOOM_PRESETS: Array<{ label: string; px: number }> = [
	{ label: "Quarter", px: 4 },
	{ label: "Month", px: 9 },
	{ label: "Week", px: 22 },
	{ label: "Day", px: 44 },
];
const DEFAULT_ZOOM = 9;
/** A generous axis cap so a stray far-future date can't build a runaway grid. */
const MAX_AXIS_DAYS = 730;
/** Pointer travel (px) below which a bar interaction counts as a click, not a drag. */
const CLICK_SLOP = 4;

/**
 * Gantt timeline (PREMIUM). Interactive: drag a bar to move its dates, drag the
 * right edge to change its duration (both write frontmatter), zoom the time
 * scale, and scroll to today. Bars can show a progress fill and milestones
 * render as diamonds.
 */
export class GanttView extends PowerPackView {
	private zoomPx = DEFAULT_ZOOM;
	private scrollEl: HTMLElement | null = null;
	/** The px-per-day the current scroll container was built at, so a scroll captured
	 * before empty() can be re-anchored correctly even when a zoom change alters the scale. */
	private lastRenderPx = 0;
	/** The viewport's CENTER day captured before a re-render's empty(), so a background
	 * metadata render doesn't snap the timeline back to day 0 AND a zoom change keeps the
	 * same date centered instead of restoring a now-meaningless pixel offset. */
	private pendingCenterDay: number | null = null;
	/** Bar to re-focus after the next render — set by the keyboard move/resize
	 * path so arrow-key scheduling isn't single-shot (render() empties the
	 * container, which would drop focus to the body). Same pattern as the
	 * Outline's focusRowId. */
	private focusBarId: string | null = null;
	/** Dependency state of the last render (issue #2). `allEdges` spans every resolved row
	 * (not just the search-filtered ones) so a cycle check can't be fooled by a search;
	 * `allRows` feeds the predecessor/successor picker. */
	private allEdges: DependencyEdge[] = [];
	private allRows: Row[] = [];
	/** Redraws the arrows when the chart's size changes (incl. a hidden leaf becoming
	 * visible — arrows can't be measured while the view has no layout). */
	private arrowObserver: ResizeObserver | null = null;
	/** Per-view suffix for the SVG marker ids, so two open Gantt leaves can't collide. */
	private readonly arrowSeq = Math.random().toString(36).slice(2, 8);

	getViewType(): string {
		return VIEW_TYPE_GANTT;
	}
	getDisplayText(): string {
		return "Power Pack: Gantt";
	}
	getIcon(): string {
		return "gantt-chart";
	}

	async onClose(): Promise<void> {
		this.scrollEl = null;
		this.pendingCenterDay = null;
		this.lastRenderPx = 0;
		this.arrowObserver?.disconnect();
		this.arrowObserver = null;
		await super.onClose();
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
				"Gantt is a Premium view",
				"Plan work on a timeline and reshape it by dragging.",
				[
					"Drag a bar to reschedule, drag its edge to change duration",
					"Zoom from days to months",
					"Progress fills and milestone markers",
					"Link tasks with dependency arrows and spot schedule conflicts",
					"Keyboard-nudge bars and jump to today",
				]
			);
			return;
		}

		const resolved = await this.plugin.getResolvedView();
		if (this.isStale(token)) return;

		// Capture the currently-focused bar BEFORE empty() destroys it, so ANY
		// render re-restores focus — including the plugin's own debounced "changed"
		// render triggered by the arrow-key write (which would otherwise land after
		// the explicit render had already consumed focusBarId, dropping focus to
		// the body). Same pattern as captureSearchState().
		const active = container.ownerDocument.activeElement;
		if (active instanceof HTMLElement && container.contains(active)) {
			const id = active.getAttribute("data-bpp-id");
			if (id) this.focusBarId = id;
		}
		// Capture the viewport's center DAY (not raw px) before empty() destroys the
		// scroll container, so the restore below re-anchors the same date even if the
		// zoom (px-per-day) changed between renders.
		this.pendingCenterDay =
			this.scrollEl && this.lastRenderPx > 0
				? (this.scrollEl.scrollLeft + this.scrollEl.clientWidth / 2) / this.lastRenderPx
				: null;

		this.captureSearchState();
		this.arrowObserver?.disconnect();
		this.arrowObserver = null;
		container.empty();
		container.addClass("bpp-view");

		const startProp = this.plugin.settings.ganttStartProp || "start";
		const endProp = this.plugin.settings.ganttEndProp || "end";

		const toolbar = container.createDiv({ cls: "bpp-toolbar" });
		toolbar.createEl("h3", { text: "Gantt" });
		// (No "Premium" badge: this view only renders for licensed users.)

		// Start/end are chosen right here so a wrong-property (empty) timeline is fixed
		// in place, not via settings. Presentational — keep the resolve cache.
		const keys = this.plugin.getFrontmatterKeys();
		renderPropertySelect(toolbar, "Start", keys, startProp, (value) => {
			this.plugin.settings.ganttStartProp = value || "start";
			void this.plugin.saveSettings({ invalidateResolved: false }).then(() => this.render());
		});
		renderPropertySelect(toolbar, "End", keys, endProp, (value) => {
			this.plugin.settings.ganttEndProp = value || "end";
			void this.plugin.saveSettings({ invalidateResolved: false }).then(() => this.render());
		});
		// The dependency property is SHARED with the Kanban Blocked badge (one schema for
		// both views), so changing it here refreshes every open view.
		const dependsProp = this.plugin.settings.kanbanDependsProp.trim();
		renderSelect(
			toolbar,
			"Depends on",
			[{ value: "", label: "(none)" }, ...(keys.includes(dependsProp) || !dependsProp ? keys : [dependsProp, ...keys]).map((k) => ({ value: k, label: k }))],
			dependsProp,
			(value) => {
				this.plugin.settings.kanbanDependsProp = value.trim();
				void this.plugin.saveSettings({ invalidateResolved: false }).then(() => this.plugin.refreshViews());
			}
		);

		const zoom = toolbar.createDiv({ cls: "bpp-segmented" });
		for (const preset of ZOOM_PRESETS) {
			const btn = zoom.createEl("button", { text: preset.label, cls: "bpp-seg-btn" });
			if (preset.px === this.zoomPx) btn.addClass("is-active");
			btn.addEventListener("click", () => {
				this.zoomPx = preset.px;
				void this.render();
			});
		}
		const todayBtn = toolbar.createEl("button", { text: "Today" });
		todayBtn.addEventListener("click", () => this.scrollToToday());

		this.renderUndoButton(toolbar);
		this.renderManagedSearch(toolbar);

		this.renderHintBar(
			container,
			"gantt",
			"Drag a bar to move it • Drag its right edge to resize • Drag the dot after a bar onto another bar to make it a dependency • Click an arrow to remove it"
		);

		renderContextControls(container, this.plugin, resolved, () => void this.render());
		renderRollupBar(container, this.plugin, resolved.rows);

		const rows = filterRowsByText(resolved.rows, this.searchQuery);
		const rowByPath = new Map<string, Row>();
		const input = rows.map((row) => {
			rowByPath.set(row.id, row);
			return {
				id: row.id,
				name: row.name,
				start: valueToDateString(row.scope.get(startProp)),
				end: valueToDateString(row.scope.get(endProp)),
			};
		});

		const model = buildGantt(input, 1, MAX_AXIS_DAYS);
		if (model.bars.length === 0) {
			if (this.searchQuery) {
				this.renderEmptyState(container, {
					title: "No matches",
					body: "No notes match the current search.",
					actions: [{ label: "Clear search", onClick: () => { this.searchQuery = ""; void this.render(); } }],
				});
			} else {
				this.renderEmptyState(container, {
					title: "Nothing on the timeline yet",
					body: `No notes have a "${startProp}" date. Pick the start property in the toolbar, or add "${startProp}: 2026-01-01" to a note's frontmatter to place it here.`,
					actions: [{ label: "Open settings", onClick: () => this.openSettings() }],
				});
			}
			return;
		}

		const deps = this.computeDeps(resolved.rows, model, dependsProp);
		this.renderChart(container, model, rowByPath, startProp, endProp, deps);

		// Re-anchor the same center day onto the freshly-built scroll container (at the
		// current px scale). For a same-scale background render this reproduces the old
		// scrollLeft exactly; across a zoom change it keeps the viewed date centered.
		if (this.pendingCenterDay !== null && this.scrollEl) {
			this.scrollEl.scrollLeft = Math.max(0, this.pendingCenterDay * this.zoomPx - this.scrollEl.clientWidth / 2);
		}
		this.pendingCenterDay = null;

		// Restore keyboard focus to the bar being arrow-moved/resized (see focusBarId).
		if (this.focusBarId) {
			// CSS.escape — a file path can contain selector metacharacters the old
			// two-replacement hand-escaper missed (matching hierarchyView), so focus
			// restore never throws or silently fails on such paths.
			const sel = `[data-bpp-id="${CSS.escape(this.focusBarId)}"]`;
			container.querySelector<HTMLElement>(sel)?.focus();
			this.focusBarId = null;
		}

		if (model.skipped > 0) {
			container.createDiv({
				cls: "bpp-muted bpp-gantt-skipped",
				text: `${model.skipped} note${model.skipped === 1 ? "" : "s"} without a valid "${startProp}" date not shown.`,
			});
		}
		if (model.offAxis > 0) {
			container.createDiv({
				cls: "bpp-muted bpp-gantt-skipped",
				text: `${model.offAxis} note${model.offAxis === 1 ? "" : "s"} fall outside the visible date range.`,
			});
		}
	}

	private renderChart(
		container: HTMLElement,
		model: ReturnType<typeof buildGantt>,
		rowByPath: Map<string, Row>,
		startProp: string,
		endProp: string,
		deps: GanttDeps
	): void {
		const total = model.days.length;
		const px = this.zoomPx;

		const scroll = container.createDiv({ cls: "bpp-gantt-scroll" });
		this.scrollEl = scroll;
		this.lastRenderPx = px;
		const chart = scroll.createDiv({ cls: "bpp-gantt" });
		chart.setCssProps({ "--bpp-track-width": `${total * px}px` });

		// Axis header.
		const axis = chart.createDiv({ cls: "bpp-gantt-axis" });
		axis.createDiv({ cls: "bpp-gantt-name bpp-gantt-axis-label", text: "Task" });
		const axisTrack = axis.createDiv({ cls: "bpp-gantt-track bpp-gantt-axis-track" });
		this.renderMonthTicks(axisTrack, model.days, px);
		const todayOffset = this.todayOffset(model.days);
		if (todayOffset !== null) {
			const marker = axisTrack.createDiv({ cls: "bpp-gantt-today" });
			marker.setCssProps({ left: `${todayOffset * px}px` });
		}

		for (const bar of model.bars) {
			this.renderBar(chart, bar, px, todayOffset, rowByPath.get(bar.id), startProp, endProp, deps);
		}

		// Dependency arrows: an SVG overlay drawn from the laid-out bar rects, plus a
		// ResizeObserver so they're (re)drawn once the chart actually has layout.
		const svg = chart.createSvg("svg", { cls: "bpp-gantt-links" });
		const draw = (): void => this.drawArrows(chart, svg, deps);
		draw();
		const RO = chart.ownerDocument.defaultView?.ResizeObserver;
		if (RO) {
			this.arrowObserver = new RO(() => draw());
			this.arrowObserver.observe(chart);
		}
	}

	// ---- dependencies (issue #2) ----------------------------------------------

	/** Edges among the visible bars, which of them break the schedule, and each bar's
	 * conflict/blocked warnings. Empty when no dependency property is set. */
	private computeDeps(allRows: Row[], model: ReturnType<typeof buildGantt>, prop: string): GanttDeps {
		this.allRows = allRows;
		const byId = new Map(allRows.map((r) => [r.id, r]));
		const empty: GanttDeps = { prop, byId, edges: [], conflicts: new Set(), conflictsOf: new Map(), blockedBy: new Map() };
		if (!prop) {
			this.allEdges = [];
			return empty;
		}
		this.allEdges = buildDependencyEdges(
			allRows.map((r) => ({ id: r.id, name: r.name, deps: r.scope.get(prop), target: isLinkTarget(r) }))
		);
		const dates = new Map<string, { startDay: number; endDay: number }>();
		for (const b of model.bars) {
			const s = toDayNumber(b.startDate);
			const e = toDayNumber(b.endDate);
			if (s !== null && e !== null) dates.set(b.id, { startDay: s, endDay: e });
		}
		const edges = this.allEdges.filter((e) => dates.has(e.from) && dates.has(e.to));
		const conflicts = scheduleConflicts(edges, dates);
		const conflictsOf = new Map<string, Row[]>();
		for (const e of edges) {
			const pred = byId.get(e.from);
			if (!pred || !conflicts.has(edgeKey(e))) continue;
			const arr = conflictsOf.get(e.to);
			if (arr) arr.push(pred);
			else conflictsOf.set(e.to, [pred]);
		}
		// "Blocked" = a predecessor that isn't done yet, by the same done rule as the Kanban.
		const statusProp = this.plugin.settings.kanbanGroupBy;
		const doneValue = this.plugin.settings.kanbanDoneValue;
		const blockedBy = new Map<string, Row[]>();
		for (const e of this.allEdges) {
			const pred = byId.get(e.from);
			if (!pred || !dates.has(e.to) || isRowDone(pred, statusProp, doneValue)) continue;
			const arr = blockedBy.get(e.to);
			if (arr) arr.push(pred);
			else blockedBy.set(e.to, [pred]);
		}
		return { prop, byId, edges, conflicts, conflictsOf, blockedBy };
	}

	/** Draw one elbow arrow per visible edge, predecessor's end → successor's start. */
	private drawArrows(chart: HTMLElement, svg: SVGSVGElement, deps: GanttDeps): void {
		svg.empty();
		const box = chart.getBoundingClientRect();
		if (box.width === 0 || deps.edges.length === 0) return;
		svg.setAttr("width", String(chart.scrollWidth));
		svg.setAttr("height", String(chart.scrollHeight));
		const defs = svg.createSvg("defs");
		const markerId = (conflict: boolean): string => `bpp-arrowhead-${conflict ? "bad" : "ok"}-${this.arrowSeq}`;
		for (const conflict of [false, true]) {
			const marker = defs.createSvg("marker", {
				attr: { id: markerId(conflict), viewBox: "0 0 8 8", refX: "7", refY: "4", markerWidth: "7", markerHeight: "7", orient: "auto" },
			});
			// createSvg's cls goes through classList.add — one token per array entry, never
			// a space-separated string (that throws InvalidCharacterError).
			marker.createSvg("path", {
				cls: conflict ? ["bpp-gantt-arrowhead", "is-conflict"] : "bpp-gantt-arrowhead",
				attr: { d: "M0,0 L8,4 L0,8 z" },
			});
		}

		const rectOf = (id: string): DOMRect | null =>
			chart.querySelector<HTMLElement>(`[data-bpp-id="${CSS.escape(id)}"]`)?.getBoundingClientRect() ?? null;
		for (const edge of deps.edges) {
			const a = rectOf(edge.from);
			const b = rectOf(edge.to);
			const pred = deps.byId.get(edge.from);
			const succ = deps.byId.get(edge.to);
			if (!a || !b || !pred || !succ) continue;
			const x1 = a.right - box.left;
			const y1 = a.top + a.height / 2 - box.top;
			const x2 = b.left - box.left;
			const y2 = b.top + b.height / 2 - box.top;
			const d = elbowPath(x1, y1, x2, y2);
			const conflict = deps.conflicts.has(edgeKey(edge));
			const label = conflict
				? `${pred.name} → ${succ.name} (starts before ${pred.name} finishes)`
				: `${pred.name} → ${succ.name}`;
			const group = svg.createSvg("g", { cls: conflict ? ["bpp-gantt-link", "is-conflict"] : "bpp-gantt-link" });
			group.createSvg("title").textContent = `${label} — click to edit`;
			group.createSvg("path", { cls: "bpp-gantt-link-line", attr: { d, "marker-end": `url(#${markerId(conflict)})` } });
			// A wide invisible twin so a 1.5px line is actually clickable.
			const hit = group.createSvg("path", { cls: "bpp-gantt-link-hit", attr: { d } });
			hit.addEventListener("click", (evt) => this.openLinkMenu(evt, pred, succ));
			hit.addEventListener("contextmenu", (evt) => this.openLinkMenu(evt, pred, succ));
		}
	}

	private openLinkMenu(evt: MouseEvent, pred: Row, succ: Row): void {
		evt.preventDefault();
		evt.stopPropagation();
		const menu = new Menu();
		menu.addItem((i) => i.setTitle(`Open "${pred.name}"`).setIcon("file").onClick(() => this.openRow(pred)));
		menu.addItem((i) => i.setTitle(`Open "${succ.name}"`).setIcon("file").onClick(() => this.openRow(succ)));
		menu.addSeparator();
		menu.addItem((i) =>
			i
				.setTitle(`Remove dependency: ${succ.name} on ${pred.name}`)
				.setIcon("unlink")
				.onClick(() => void this.unlinkRows(pred, succ))
		);
		menu.showAtMouseEvent(evt);
	}

	/** Make `succ` depend on `pred` (finish-to-start), refusing self-links and cycles. */
	private async linkRows(pred: Row, succ: Row): Promise<void> {
		const prop = await this.ensureDependsProp();
		if (!prop) return;
		if (!isLinkTarget(pred)) {
			new Notice(`"${pred.name}" isn't a note, so it can't be linked as a dependency.`);
			return;
		}
		if (wouldCreateCycle(this.allEdges, pred.id, succ.id)) {
			new Notice(
				pred.id === succ.id
					? "A task can't depend on itself."
					: `Not linked: "${pred.name}" already depends on "${succ.name}", so this would create a circular dependency.`
			);
			return;
		}
		const next = addDependency(succ.scope.get(prop), pred.name);
		if (next === null) {
			new Notice(`"${succ.name}" already depends on "${pred.name}".`);
			return;
		}
		await writeRowFields(this.plugin, succ, [{ key: prop, value: next }], {
			label: `Link "${succ.name}" after "${pred.name}"`,
		});
		await this.render();
	}

	private async unlinkRows(pred: Row, succ: Row): Promise<void> {
		const prop = this.plugin.settings.kanbanDependsProp.trim();
		if (!prop) return;
		const next = removeDependency(succ.scope.get(prop), pred.name);
		if (next === null) return void this.render();
		await writeRowFields(this.plugin, succ, [{ key: prop, value: next }], {
			label: `Unlink "${succ.name}" from "${pred.name}"`,
		});
		await this.render();
	}

	/** The dependency property, asking for one (and saving it) the first time. */
	private ensureDependsProp(): Promise<string> {
		const current = this.plugin.settings.kanbanDependsProp.trim();
		if (current) return Promise.resolve(current);
		return new Promise((resolve) => {
			let settled = false;
			const modal = new PromptModal(this.app, {
				title: "Which property lists a task's dependencies?",
				value: "depends",
				placeholder: "e.g. depends, blockedBy",
				cta: "Use property",
				onSubmit: (v) => {
					const prop = v.trim();
					settled = true;
					if (!prop) return resolve("");
					this.plugin.settings.kanbanDependsProp = prop;
					void this.plugin.saveSettings({ invalidateResolved: false }).then(() => resolve(prop));
				},
			});
			const close = modal.onClose.bind(modal);
			modal.onClose = () => {
				close();
				// Cancel/Escape: resolve after the submit path has had its chance.
				window.setTimeout(() => {
					if (!settled) resolve("");
				}, 0);
			};
			modal.open();
		});
	}

	/** Pick a predecessor (or successor) for `row` from every other linkable row,
	 * leaving out ones already linked and ones that would create a cycle. */
	private pickLink(row: Row, direction: "predecessor" | "successor"): void {
		const prop = this.plugin.settings.kanbanDependsProp.trim();
		const linked = new Set(
			this.allEdges
				.filter((e) => (direction === "predecessor" ? e.to === row.id : e.from === row.id))
				.map((e) => (direction === "predecessor" ? e.from : e.to))
		);
		const candidates = this.allRows.filter((r) => {
			if (r.id === row.id || linked.has(r.id)) return false;
			if (direction === "predecessor") return isLinkTarget(r) && !wouldCreateCycle(this.allEdges, r.id, row.id);
			return isLinkTarget(row) && !wouldCreateCycle(this.allEdges, row.id, r.id);
		});
		if (candidates.length === 0) {
			new Notice(`No other tasks can be added as a ${direction}${prop ? "" : " yet"}.`);
			return;
		}
		new RowPickerModal(
			this.app,
			candidates,
			direction === "predecessor" ? `"${row.name}" depends on…` : `…depends on "${row.name}"`,
			(picked) => void (direction === "predecessor" ? this.linkRows(picked, row) : this.linkRows(row, picked))
		).open();
	}

	/**
	 * The connector dot after a bar: drag it onto another bar to make that bar depend
	 * on this one. Pointer capture keeps move/up on the dot (popout-safe, no document
	 * listeners); the drop target is hit-tested with elementFromPoint.
	 */
	private enableLinkDrag(dot: HTMLElement, row: Row): void {
		let active = false;
		let line: SVGLineElement | null = null;
		let origin = { x: 0, y: 0 };
		const chart = (): HTMLElement | null => dot.closest<HTMLElement>(".bpp-gantt");
		const local = (evt: PointerEvent): { x: number; y: number } => {
			const box = chart()?.getBoundingClientRect();
			return box ? { x: evt.clientX - box.left, y: evt.clientY - box.top } : { x: 0, y: 0 };
		};

		dot.addEventListener("pointerdown", (evt) => {
			if (evt.button !== 0) return;
			evt.preventDefault();
			evt.stopPropagation();
			active = true;
			dot.setPointerCapture(evt.pointerId);
			this.beginInteraction();
			origin = local(evt);
			const svg = chart()?.querySelector<SVGSVGElement>(".bpp-gantt-links");
			if (svg) {
				const c = chart();
				if (c) {
					svg.setAttr("width", String(c.scrollWidth));
					svg.setAttr("height", String(c.scrollHeight));
				}
				line = svg.createSvg("line", {
					cls: "bpp-gantt-link-draft",
					attr: { x1: String(origin.x), y1: String(origin.y), x2: String(origin.x), y2: String(origin.y) },
				});
			}
			chart()?.addClass("is-linking");
		});
		dot.addEventListener("pointermove", (evt) => {
			if (!active || !line) return;
			const p = local(evt);
			line.setAttr("x2", String(p.x));
			line.setAttr("y2", String(p.y));
		});
		const finish = (evt: PointerEvent): void => {
			if (!active) return;
			active = false;
			if (dot.hasPointerCapture(evt.pointerId)) dot.releasePointerCapture(evt.pointerId);
			line?.remove();
			line = null;
			chart()?.removeClass("is-linking");
			this.endInteraction();
			if (evt.type === "pointercancel") return;
			const hit = dot.ownerDocument.elementFromPoint(evt.clientX, evt.clientY);
			const targetEl = hit instanceof Element ? hit.closest<HTMLElement>("[data-bpp-id]") : null;
			const targetId = targetEl?.getAttribute("data-bpp-id");
			if (!targetId || targetId === row.id) return;
			const target = this.allRows.find((r) => r.id === targetId);
			if (target) void this.linkRows(row, target);
		};
		dot.addEventListener("pointerup", finish);
		dot.addEventListener("pointercancel", finish);
	}

	/** Faint month boundary ticks + labels along the axis. */
	private renderMonthTicks(axisTrack: HTMLElement, days: string[], px: number): void {
		for (let i = 0; i < days.length; i++) {
			if (i > 0 && !days[i].endsWith("-01")) continue;
			const tick = axisTrack.createDiv({ cls: "bpp-gantt-tick" });
			tick.setCssProps({ left: `${i * px}px` });
			tick.createSpan({ cls: "bpp-muted", text: days[i].slice(0, 7) });
		}
	}

	private renderBar(
		chart: HTMLElement,
		bar: GanttBar,
		px: number,
		todayOffset: number | null,
		row: Row | undefined,
		startProp: string,
		endProp: string,
		deps: GanttDeps
	): void {
		const rowEl = chart.createDiv({ cls: "bpp-gantt-row" });
		const openMenu = row
			? (a: MouseEvent | HTMLElement): void => this.openBarMenu(a, row, startProp, endProp, deps)
			: null;
		// Dependency warnings for this bar: scheduled to start before a predecessor
		// finishes (conflict), and/or waiting on a predecessor that isn't done (blocked).
		const conflictsWith = deps.conflictsOf.get(bar.id) ?? [];
		const blockedBy = deps.blockedBy.get(bar.id) ?? [];
		const names = (rs: Row[]): string => rs.map((r) => r.name).join(", ");
		const warning = [
			conflictsWith.length ? `Starts before ${names(conflictsWith)} finishes` : "",
			blockedBy.length ? `Blocked by ${names(blockedBy)}` : "",
		]
			.filter(Boolean)
			.join(" · ");
		const decorate = (el: HTMLElement, baseLabel: string): void => {
			if (conflictsWith.length) el.addClass("is-conflict");
			if (blockedBy.length) el.addClass("is-blocked");
			if (!warning) return;
			el.setAttr("title", `${el.getAttr("title") ?? baseLabel}\n${warning}`);
			el.setAttr("aria-label", `${el.getAttr("aria-label") ?? baseLabel}. ${warning}`);
		};
		const name = rowEl.createDiv({ cls: "bpp-gantt-name" });
		const nameLabel = name.createSpan({ cls: "bpp-gantt-name-label", text: bar.name });
		if (row && openMenu) {
			nameLabel.addEventListener("click", () => this.openRow(row));
			rowEl.addEventListener("contextmenu", (evt) => openMenu(evt));
			this.addOverflowButton(name, bar.name, openMenu);
		}

		const track = rowEl.createDiv({ cls: "bpp-gantt-track" });
		if (todayOffset !== null) {
			const line = track.createDiv({ cls: "bpp-gantt-todayline" });
			line.setCssProps({ left: `${todayOffset * px}px` });
		}

		const isMilestone = row ? this.isMilestone(row) : false;
		if (isMilestone) {
			const diamond = track.createDiv({ cls: "bpp-gantt-milestone" });
			diamond.setCssProps({ left: `${bar.startIndex * px}px` });
			diamond.setAttr("title", `${bar.name}: ${bar.startDate}`);
			diamond.setAttr("data-bpp-id", bar.id);
			if (row) this.applyColorRule(diamond, row);
			if (row && openMenu) {
				diamond.addEventListener("click", () => this.openRow(row));
				// Keyboard parity with bars: this branch used to return before any of
				// the tabIndex/role/keydown wiring, leaving milestones mouse-only.
				diamond.tabIndex = 0;
				diamond.setAttr("role", "button");
				diamond.setAttr("aria-label", `${bar.name}: milestone on ${bar.startDate}`);
				diamond.addEventListener("keydown", (evt) => {
					if (evt.key === "Enter" || evt.key === " ") {
						// role=button must activate on Space too (and Space would
						// otherwise scroll the chart).
						evt.preventDefault();
						this.openRow(row);
					} else if (evt.key === "ContextMenu" || (evt.key === "F10" && evt.shiftKey)) {
						evt.preventDefault();
						openMenu(diamond);
					}
				});
				diamond.addEventListener("contextmenu", (evt) => openMenu(evt));
				// The diamond is centred on its day's left edge, 14px wide (margin-left -7px).
				this.addLinkDot(track, row, bar.startIndex * px + 10);
			}
			decorate(diamond, bar.name);
			return;
		}

		const barEl = track.createDiv({ cls: "bpp-gantt-bar" });
		barEl.setCssProps({ left: `${bar.startIndex * px}px`, width: `${Math.max(1, bar.span) * px}px` });
		barEl.setAttr("title", `${bar.name}: ${bar.startDate} → ${bar.endDate}`);
		barEl.setAttr("data-bpp-id", bar.id);
		if (row) this.applyColorRule(barEl, row);

		if (row && openMenu) {
			const progress = this.progressPct(row);
			if (progress !== null) {
				const fill = barEl.createDiv({ cls: "bpp-gantt-progress" });
				fill.setCssProps({ width: `${progress}%` });
			}
			const handle = barEl.createDiv({ cls: "bpp-gantt-handle" });
			this.enableDrag(barEl, handle, row, startProp, endProp);

			// Keyboard operability: the bar's dates live only in the title tooltip,
			// which is mouse-only. Expose them via aria-label and drive move/resize
			// with the arrow keys (Shift = resize the end).
			barEl.tabIndex = 0;
			barEl.setAttr("role", "button");
			barEl.setAttr("aria-label", `${bar.name}: ${bar.startDate} to ${bar.endDate}`);
			barEl.addEventListener("keydown", (evt) => {
				if (evt.key === "Enter" || evt.key === " ") {
					evt.preventDefault();
					this.openRow(row);
				} else if (evt.key === "ArrowRight" || evt.key === "ArrowLeft") {
					evt.preventDefault();
					const delta = evt.key === "ArrowRight" ? 1 : -1;
					// Re-focus this bar after the write's re-render so a second arrow
					// press keeps working (the render otherwise drops focus to body).
					this.focusBarId = row.id;
					if (evt.shiftKey) void this.applyResize(row, startProp, endProp, delta);
					else void this.applyMove(row, startProp, endProp, delta);
				} else if (evt.key === "ContextMenu" || (evt.key === "F10" && evt.shiftKey)) {
					evt.preventDefault();
					openMenu(barEl);
				}
			});
			this.addLinkDot(track, row, (bar.startIndex + Math.max(1, bar.span)) * px + 3);
		}
		decorate(barEl, bar.name);
	}

	/** The drag-to-link connector just past a bar's end (shown on row hover). */
	private addLinkDot(track: HTMLElement, row: Row, leftPx: number): void {
		if (!isLinkTarget(row)) return;
		const dot = track.createDiv({
			cls: "bpp-gantt-link-dot",
			attr: { title: `Drag onto another bar to make it depend on "${row.name}"`, "aria-hidden": "true" },
		});
		dot.setCssProps({ left: `${leftPx}px` });
		this.enableLinkDrag(dot, row);
	}

	// ---- interaction ----------------------------------------------------------

	/**
	 * Pointer-drag a bar (move both dates) or its right handle (resize the end).
	 * Uses pointer capture so move/up stay on the element — no document listeners,
	 * popout-safe. A tiny drag counts as a click that opens the note.
	 */
	private enableDrag(barEl: HTMLElement, handle: HTMLElement, row: Row, startProp: string, endProp: string): void {
		let startX = 0;
		let kind: "move" | "resize" | null = null;
		let baseWidth = 0;

		const begin = (evt: PointerEvent, k: "move" | "resize"): void => {
			if (evt.button !== 0) return;
			evt.preventDefault();
			evt.stopPropagation();
			kind = k;
			startX = evt.clientX;
			baseWidth = barEl.offsetWidth;
			barEl.addClass("is-dragging");
			barEl.setPointerCapture(evt.pointerId);
			// Hold background re-renders so a metadata change mid-drag can't remove the
			// bar and pointer capture (which would drop the reschedule write).
			this.beginInteraction();
		};

		barEl.addEventListener("pointerdown", (evt) => begin(evt, "move"));
		handle.addEventListener("pointerdown", (evt) => begin(evt, "resize"));

		barEl.addEventListener("pointermove", (evt) => {
			if (!kind) return;
			const dx = evt.clientX - startX;
			if (kind === "move") barEl.setCssProps({ transform: `translateX(${dx}px)` });
			else barEl.setCssProps({ width: `${Math.max(this.zoomPx, baseWidth + dx)}px` });
		});

		const finish = (evt: PointerEvent): void => {
			if (!kind) return;
			const dx = evt.clientX - startX;
			const currentKind = kind;
			kind = null;
			barEl.removeClass("is-dragging");
			if (barEl.hasPointerCapture(evt.pointerId)) barEl.releasePointerCapture(evt.pointerId);
			this.endInteraction();

			// A cancelled gesture (OS/browser takeover, palm rejection) is not a drop:
			// its coordinates aren't a point the user chose. Snap back, write nothing.
			if (evt.type === "pointercancel") {
				barEl.setCssProps({ transform: "", width: "" });
				void this.render();
				return;
			}
			if (Math.abs(dx) < CLICK_SLOP) {
				barEl.setCssProps({ transform: "" });
				if (currentKind === "move") this.openRow(row);
				else void this.render();
				return;
			}
			const deltaDays = pxToDays(dx, this.zoomPx);
			if (deltaDays === 0) {
				void this.render();
				return;
			}
			if (currentKind === "move") void this.applyMove(row, startProp, endProp, deltaDays);
			else void this.applyResize(row, startProp, endProp, deltaDays);
		};
		barEl.addEventListener("pointerup", finish);
		barEl.addEventListener("pointercancel", finish);
	}

	/** Right-click menu on a Gantt bar — a non-drag path to set the dates, plus the
	 * shared note actions (open / edit field / rename / delete). */
	private openBarMenu(anchor: MouseEvent | HTMLElement, row: Row, startProp: string, endProp: string, deps: GanttDeps): void {
		if (anchor instanceof MouseEvent) anchor.preventDefault();
		const after = (): void => void this.render();
		const menu = new Menu();
		menu.addItem((i) =>
			i.setTitle("Set start date…").setIcon("calendar").onClick(() => this.setDateViaPrompt(row, startProp, "start"))
		);
		menu.addItem((i) =>
			i.setTitle("Set end date…").setIcon("calendar").onClick(() => this.setDateViaPrompt(row, endProp, "end"))
		);
		menu.addSeparator();
		// Dependencies: a keyboard-reachable, non-drag path to everything the arrows do.
		menu.addItem((i) =>
			i.setTitle("Add predecessor…").setIcon("arrow-left-to-line").onClick(() => {
				void this.ensureDependsProp().then((p) => p && this.pickLink(row, "predecessor"));
			})
		);
		if (isLinkTarget(row)) {
			menu.addItem((i) =>
				i.setTitle("Add successor…").setIcon("arrow-right-to-line").onClick(() => {
					void this.ensureDependsProp().then((p) => p && this.pickLink(row, "successor"));
				})
			);
		}
		for (const e of this.allEdges) {
			if (e.to === row.id) {
				const pred = deps.byId.get(e.from);
				if (pred) {
					menu.addItem((i) =>
						i.setTitle(`Remove dependency on "${pred.name}"`).setIcon("unlink").onClick(() => void this.unlinkRows(pred, row))
					);
				}
			} else if (e.from === row.id) {
				const succ = deps.byId.get(e.to);
				if (succ) {
					menu.addItem((i) =>
						i.setTitle(`Remove "${succ.name}" depending on this`).setIcon("unlink").onClick(() => void this.unlinkRows(row, succ))
					);
				}
			}
		}
		menu.addSeparator();
		this.addCommonRowMenuItems(menu, row, this.plugin.settings.kanbanCardFields, after);
		this.showMenuAtAnchor(menu, anchor);
	}

	private setDateViaPrompt(row: Row, prop: string, which: string): void {
		const raw = row.scope.get(prop);
		const current = toIsoDateKey(raw) ?? todayIso();
		new PromptModal(this.app, {
			title: `Set ${which} date for "${row.name}"`,
			value: current,
			placeholder: "YYYY-MM-DD",
			cta: "Save",
			onSubmit: (v) => {
				const key = toIsoDateKey(v);
				if (!key) {
					new Notice("Enter a date as YYYY-MM-DD.");
					return;
				}
				void writeRowFields(this.plugin, row, [{ key: prop, value: rescheduleDateValue(raw, key) }], {
					label: `Set ${which} date`,
				}).then(() => this.render());
			},
		}).open();
	}

	private async applyMove(row: Row, startProp: string, endProp: string, deltaDays: number): Promise<void> {
		const startRaw = row.scope.get(startProp);
		const endRaw = row.scope.get(endProp);
		const startIso = valueToDateString(startRaw);
		if (!startIso) return void this.render();
		const endIso = valueToDateString(endRaw);
		const moved = moveBarDates(startIso, endIso, deltaDays);
		// One write for both endpoints: a single undo entry, and a faithful inverse
		// (start and end are distinct keys, so no same-key-twice ambiguity).
		const writes = [{ key: startProp, value: rescheduleDateValue(startRaw, moved.start) }];
		if (moved.end !== null) writes.push({ key: endProp, value: rescheduleDateValue(endRaw, moved.end) });
		await writeRowFields(this.plugin, row, writes, { label: `Move "${row.name}"` });
		await this.render();
	}

	private async applyResize(row: Row, startProp: string, endProp: string, deltaDays: number): Promise<void> {
		const startRaw = row.scope.get(startProp);
		const endRaw = row.scope.get(endProp);
		const startIso = valueToDateString(startRaw);
		if (!startIso) return void this.render();
		const endIso = valueToDateString(endRaw);
		const nextEnd = resizeBarEnd(startIso, endIso, deltaDays);
		await writeRowFields(this.plugin, row, [{ key: endProp, value: rescheduleDateValue(endRaw, nextEnd) }], {
			label: `Resize "${row.name}"`,
		});
		await this.render();
	}

	private scrollToToday(): void {
		if (!this.scrollEl) return;
		const marker = this.scrollEl.querySelector<HTMLElement>(".bpp-gantt-axis-track .bpp-gantt-today");
		if (!marker) return;
		const left = marker.offsetLeft;
		// Honor reduced-motion: an explicit behavior option overrides the CSS
		// scroll-behavior, so gate it on the media query.
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		this.scrollEl.scrollTo({
			left: Math.max(0, left - this.scrollEl.clientWidth / 2),
			behavior: reduce ? "auto" : "smooth",
		});
	}

	// ---- helpers --------------------------------------------------------------

	private todayOffset(days: string[]): number | null {
		if (days.length === 0) return null;
		const todayDay = toDayNumber(todayIso());
		const firstDay = toDayNumber(days[0]);
		if (todayDay === null || firstDay === null) return null;
		const offset = todayDay - firstDay;
		return offset >= 0 && offset < days.length ? offset : null;
	}

	private isMilestone(row: Row): boolean {
		const prop = this.plugin.settings.ganttMilestoneProp.trim();
		if (!prop) return false;
		return toBool(row.scope.get(prop));
	}

	private progressPct(row: Row): number | null {
		const prop = this.plugin.settings.ganttProgressProp.trim();
		if (!prop) return null;
		return normalizeProgress(row.scope.get(prop));
	}

}

/** Dependency state for one render — see GanttView.computeDeps. */
interface GanttDeps {
	prop: string;
	byId: Map<string, Row>;
	/** Edges whose two ends are both bars on the current timeline. */
	edges: DependencyEdge[];
	/** edgeKey()s of edges whose successor starts before its predecessor finishes. */
	conflicts: Set<string>;
	conflictsOf: Map<string, Row[]>;
	blockedBy: Map<string, Row[]>;
}

/** Only a whole-note row can be the TARGET of a [[link]] — a task line or a FLATTEN
 * element shares its note's path but isn't itself linkable. */
function isLinkTarget(row: Row): boolean {
	return row.id === row.note.path && !row.flatten;
}

/**
 * An orthogonal arrow path from a predecessor's right edge (x1,y1) to a successor's left
 * edge (x2,y2). When there's room it steps right, drops, and runs in; when the successor
 * starts before the predecessor ends (an overlap) it loops back between the two rows so
 * the arrow still enters the successor from the left.
 */
function elbowPath(x1: number, y1: number, x2: number, y2: number): string {
	const gap = 8;
	if (x2 - x1 >= gap * 2) {
		const mx = x1 + gap;
		return `M${x1},${y1} H${mx} V${y2} H${x2}`;
	}
	const midY = (y1 + y2) / 2;
	return `M${x1},${y1} H${x1 + gap} V${midY} H${x2 - gap} V${y2} H${x2}`;
}

/** Fuzzy picker over timeline rows, for "Add predecessor/successor…". */
class RowPickerModal extends FuzzySuggestModal<Row> {
	constructor(
		app: App,
		private readonly rows: Row[],
		placeholder: string,
		private readonly onPick: (row: Row) => void
	) {
		super(app);
		this.setPlaceholder(placeholder);
	}
	getItems(): Row[] {
		return this.rows;
	}
	getItemText(row: Row): string {
		return row.name;
	}
	onChooseItem(row: Row): void {
		this.onPick(row);
	}
}

function valueToDateString(value: unknown): string | null {
	if (value === undefined || value === null || value === "") return null;
	return toStr(value);
}

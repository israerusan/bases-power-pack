import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type BasesPowerPackPlugin from "../main";

export const VIEW_TYPE_CALENDAR = "bpp-calendar-view";

/**
 * Calendar view (PREMIUM — gated behind the license check).
 *
 * Working skeleton: renders a month grid and places notes onto days based on a
 * configurable date frontmatter property (default: `due`). If the user is on
 * the lite tier this view renders an upgrade notice instead of the grid.
 */
export class CalendarView extends ItemView {
  private plugin: BasesPowerPackPlugin;
  private cursor: { year: number; month: number };

  constructor(leaf: WorkspaceLeaf, plugin: BasesPowerPackPlugin) {
    super(leaf);
    this.plugin = plugin;
    const now = new Date();
    this.cursor = { year: now.getFullYear(), month: now.getMonth() };
  }

  getViewType(): string {
    return VIEW_TYPE_CALENDAR;
  }

  getDisplayText(): string {
    return "Power Pack: Calendar";
  }

  getIcon(): string {
    return "calendar";
  }

  async onOpen(): Promise<void> {
    this.render();
    this.registerEvent(this.app.metadataCache.on("changed", () => this.render()));
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  private render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("bpp-view");

    if (!this.plugin.settings.isPro) {
      this.renderUpgradeNotice(container);
      return;
    }

    const dateProp = this.plugin.settings.calendarDateProp || "due";

    const toolbar = container.createDiv({ cls: "bpp-toolbar" });
    toolbar.createEl("h3", { text: "Calendar" });
    toolbar.createEl("span", { cls: "bpp-badge bpp-badge-premium", text: "Premium" });

    const nav = toolbar.createDiv({ cls: "bpp-cal-nav" });
    const prev = nav.createEl("button", { text: "‹" });
    const label = nav.createSpan({ cls: "bpp-cal-label" });
    const next = nav.createEl("button", { text: "›" });
    prev.onclick = () => this.shiftMonth(-1);
    next.onclick = () => this.shiftMonth(1);

    const monthName = new Date(this.cursor.year, this.cursor.month, 1).toLocaleString(
      undefined,
      { month: "long", year: "numeric" }
    );
    label.setText(monthName);
    toolbar.createSpan({ cls: "bpp-muted", text: `dates from "${dateProp}"` });

    const byDay = this.collectByDay(dateProp);
    this.renderGrid(container, byDay);
  }

  private renderUpgradeNotice(container: HTMLElement): void {
    const box = container.createDiv({ cls: "bpp-upgrade" });
    box.createEl("h3", { text: "📅 Calendar is a Premium view" });
    box.createEl("p", {
      text: "Unlock the calendar, Gantt, roll-ups and saved filters with a Bases Power Pack license.",
    });
    const btn = box.createEl("button", { text: "Enter license key in settings", cls: "mod-cta" });
    btn.onclick = () => {
      // Open this plugin's settings tab.
      (this.app as any).setting?.open?.();
      (this.app as any).setting?.openTabById?.(this.plugin.manifest.id);
    };
  }

  private shiftMonth(delta: number): void {
    let m = this.cursor.month + delta;
    let y = this.cursor.year;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    this.cursor = { year: y, month: m };
    this.render();
  }

  /** Map "YYYY-MM-DD" -> files whose date property falls on that day. */
  private collectByDay(dateProp: string): Map<string, TFile[]> {
    const map = new Map<string, TFile[]>();
    for (const file of this.app.vault.getMarkdownFiles()) {
      const value = this.app.metadataCache.getFileCache(file)?.frontmatter?.[dateProp];
      if (!value) continue;
      const key = this.normalizeDateKey(String(value));
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(file);
    }
    return map;
  }

  private normalizeDateKey(raw: string): string | null {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  private renderGrid(container: HTMLElement, byDay: Map<string, TFile[]>): void {
    const grid = container.createDiv({ cls: "bpp-cal-grid" });
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (const w of weekdays) {
      grid.createDiv({ cls: "bpp-cal-weekday", text: w });
    }

    const first = new Date(this.cursor.year, this.cursor.month, 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(this.cursor.year, this.cursor.month + 1, 0).getDate();

    for (let i = 0; i < startOffset; i++) {
      grid.createDiv({ cls: "bpp-cal-cell bpp-cal-empty" });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const cell = grid.createDiv({ cls: "bpp-cal-cell" });
      cell.createDiv({ cls: "bpp-cal-daynum", text: String(day) });
      const m = String(this.cursor.month + 1).padStart(2, "0");
      const d = String(day).padStart(2, "0");
      const key = `${this.cursor.year}-${m}-${d}`;
      const files = byDay.get(key) || [];
      for (const file of files) {
        const ev = cell.createDiv({ cls: "bpp-cal-event", text: file.basename });
        ev.addEventListener("click", () => {
          this.app.workspace.getLeaf(false).openFile(file);
        });
      }
    }
  }
}

import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type BasesPowerPackPlugin from "../main";

export const VIEW_TYPE_KANBAN = "bpp-kanban-view";

/**
 * Kanban board view (LITE / free tier — the "one extra view ungated").
 *
 * Working skeleton: scans the vault for markdown notes that carry the
 * configured "group" frontmatter property (default: `status`) and lays them
 * out in columns. This is intentionally Bases-adjacent: it reads the same
 * frontmatter that Bases tables expose, so it works today without depending
 * on Bases internals.
 */
export class KanbanView extends ItemView {
  private plugin: BasesPowerPackPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: BasesPowerPackPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_KANBAN;
  }

  getDisplayText(): string {
    return "Power Pack: Kanban";
  }

  getIcon(): string {
    return "layout-dashboard";
  }

  async onOpen(): Promise<void> {
    this.render();
    // Re-render when notes change so the board stays live.
    this.registerEvent(this.app.metadataCache.on("changed", () => this.render()));
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  private render(): void {
    const groupBy = this.plugin.settings.kanbanGroupBy || "status";
    const container = this.contentEl;
    container.empty();
    container.addClass("bpp-view");

    const header = container.createDiv({ cls: "bpp-toolbar" });
    header.createEl("h3", { text: "Kanban" });
    header.createEl("span", {
      cls: "bpp-badge bpp-badge-lite",
      text: "Lite",
    });
    header.createEl("span", {
      cls: "bpp-muted",
      text: `grouped by "${groupBy}"`,
    });

    const board = container.createDiv({ cls: "bpp-kanban-board" });
    const columns = this.collectColumns(groupBy);

    if (columns.size === 0) {
      board.createDiv({
        cls: "bpp-empty",
        text: `No notes with a "${groupBy}" property found. Add "${groupBy}: To Do" to a note's frontmatter to populate the board.`,
      });
      return;
    }

    for (const [colName, files] of columns) {
      const col = board.createDiv({ cls: "bpp-kanban-column" });
      const colHead = col.createDiv({ cls: "bpp-kanban-column-head" });
      colHead.createSpan({ text: colName });
      colHead.createSpan({ cls: "bpp-count", text: String(files.length) });

      for (const file of files) {
        const card = col.createDiv({ cls: "bpp-card" });
        card.createDiv({ cls: "bpp-card-title", text: file.basename });
        card.addEventListener("click", () => {
          this.app.workspace.getLeaf(false).openFile(file);
        });
      }
    }
  }

  /** Group markdown files by a frontmatter property into ordered columns. */
  private collectColumns(groupBy: string): Map<string, TFile[]> {
    const columns = new Map<string, TFile[]>();
    const files = this.app.vault.getMarkdownFiles();

    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      const value = cache?.frontmatter?.[groupBy];
      if (value === undefined || value === null) continue;
      const colName = String(value);
      if (!columns.has(colName)) columns.set(colName, []);
      columns.get(colName)!.push(file);
    }

    return columns;
  }
}

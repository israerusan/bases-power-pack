import { App, Modal, Setting, TFile, WorkspaceLeaf } from "obsidian";
import type { AnalyticsBucket, BoardAnalytics } from "../query/analytics";

/**
 * A floating editor: opens a note in a REAL, editable Obsidian view floating over the
 * board — no tab switch. Follows the approach the mainstream Base Board plugin ships:
 * construct an orphaned WorkspaceLeaf (never registered with the workspace) and reparent
 * its `view.containerEl` into the modal. `WorkspaceLeaf` isn't publicly constructable, so
 * that one line is guarded — if it (or the file open) ever fails, we fall back to the
 * fully-public `getLeaf("split")`, so the action can never hard-break.
 */
export class FloatingEditModal extends Modal {
	private leaf: WorkspaceLeaf | null = null;

	constructor(app: App, private readonly file: TFile) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("bpp-float-edit");
		this.titleEl.setText(this.file.basename);
		let leaf: WorkspaceLeaf;
		try {
			const LeafCtor = WorkspaceLeaf as unknown as new (app: App) => WorkspaceLeaf;
			leaf = new LeafCtor(this.app);
		} catch {
			this.fallbackToSplit();
			return;
		}
		this.leaf = leaf;
		leaf.openFile(this.file, { active: false }).then(
			() => {
				if (this.leaf !== leaf) return; // modal already closed
				const el = leaf.view?.containerEl;
				if (!el) {
					this.fallbackToSplit();
					return;
				}
				this.contentEl.empty();
				this.contentEl.appendChild(el);
			},
			() => {
				if (this.leaf !== leaf) return; // modal already closed — don't open a stray pane
				this.fallbackToSplit();
			}
		);
	}

	onClose(): void {
		// Detach the rogue leaf so its editor/view can't leak (it was never in the workspace).
		this.leaf?.detach();
		this.leaf = null;
		this.contentEl.empty();
	}

	/** Public-API degradation: open the note in a split pane instead. Detach any rogue
	 * leaf we created first (it was never in the workspace) so it can't leak. */
	private fallbackToSplit(): void {
		const file = this.file;
		this.leaf?.detach();
		this.leaf = null;
		this.close();
		void this.app.workspace.getLeaf("split").openFile(file);
	}
}

/** A single-field text prompt (rename a note, edit a field, rename a column). */
export class PromptModal extends Modal {
	private value: string;
	private readonly opts: { title: string; value: string; placeholder?: string; cta?: string; onSubmit: (value: string) => void };

	constructor(app: App, opts: { title: string; value: string; placeholder?: string; cta?: string; onSubmit: (value: string) => void }) {
		super(app);
		this.opts = opts;
		this.value = opts.value;
	}

	onOpen(): void {
		this.titleEl.setText(this.opts.title);
		const submit = (): void => {
			this.close();
			this.opts.onSubmit(this.value);
		};
		new Setting(this.contentEl).addText((text) => {
			text.setValue(this.value).onChange((v) => (this.value = v));
			if (this.opts.placeholder) text.setPlaceholder(this.opts.placeholder);
			text.inputEl.addEventListener("keydown", (evt) => {
				if (evt.key === "Enter") {
					evt.preventDefault();
					submit();
				}
			});
			window.setTimeout(() => {
				text.inputEl.focus();
				text.inputEl.select();
			}, 0);
		});
		new Setting(this.contentEl)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((b) => b.setButtonText(this.opts.cta ?? "Save").setCta().onClick(submit));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** A destructive-action confirmation. */
export class ConfirmModal extends Modal {
	private readonly opts: { title: string; body: string; cta: string; onConfirm: () => void };

	constructor(app: App, opts: { title: string; body: string; cta: string; onConfirm: () => void }) {
		super(app);
		this.opts = opts;
	}

	onOpen(): void {
		this.titleEl.setText(this.opts.title);
		this.contentEl.createEl("p", { text: this.opts.body });
		new Setting(this.contentEl)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText(this.opts.cta)
					.setWarning()
					.onClick(() => {
						this.close();
						this.opts.onConfirm();
					})
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export type BulkOp = "set" | "clear" | "toggle";

/** Bulk-edit one frontmatter property across a set of notes (free tier). */
export class BulkEditModal extends Modal {
	private prop = "";
	private op: BulkOp = "set";
	private value = "";
	private readonly count: number;
	private readonly onApply: (prop: string, op: BulkOp, value: string) => void;

	constructor(app: App, count: number, onApply: (prop: string, op: BulkOp, value: string) => void) {
		super(app);
		this.count = count;
		this.onApply = onApply;
	}

	onOpen(): void {
		this.titleEl.setText(`Bulk edit ${this.count} note${this.count === 1 ? "" : "s"}`);
		let valueSetting: Setting | null = null;

		new Setting(this.contentEl)
			.setName("Property")
			.setDesc("Frontmatter key to change on every note in the current view.")
			.addText((t) => t.setPlaceholder("status").setValue(this.prop).onChange((v) => (this.prop = v.trim())));

		new Setting(this.contentEl).setName("Operation").addDropdown((dd) => {
			dd.addOption("set", "Set to value");
			dd.addOption("clear", "Clear (remove)");
			dd.addOption("toggle", "Toggle true/false");
			dd.setValue(this.op).onChange((v) => {
				this.op = v as BulkOp;
				if (valueSetting) valueSetting.settingEl.toggleClass("bpp-hidden", this.op !== "set");
			});
		});

		valueSetting = new Setting(this.contentEl)
			.setName("Value")
			.addText((t) => t.setPlaceholder("done").setValue(this.value).onChange((v) => (this.value = v)));

		new Setting(this.contentEl)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText(`Apply to ${this.count}`)
					.setCta()
					.onClick(() => {
						if (!this.prop) return;
						this.close();
						this.onApply(this.prop, this.op, this.value);
					})
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/**
 * Read-only analytics panel for the current board (premium). Renders a pre-computed
 * {@link BoardAnalytics}: summary stats, cards by column, workload by assignee, weekly
 * throughput, and the longest-open cards — as simple horizontal bars.
 */
export class AnalyticsModal extends Modal {
	constructor(app: App, private readonly data: BoardAnalytics) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("Board analytics");
		const el = this.contentEl;
		el.addClass("bpp-analytics");

		const summary = el.createDiv({ cls: "bpp-analytics-summary" });
		this.stat(summary, "Cards", String(this.data.total));
		this.stat(summary, "Done", String(this.data.doneCount));
		this.stat(summary, "Avg cycle", this.days(this.data.cycle.avgDays));
		this.stat(summary, "Median cycle", this.days(this.data.cycle.medianDays));

		this.barSection(el, "Cards by column", this.data.wipByColumn);
		if (this.data.workloadByAssignee.length > 0) {
			this.barSection(el, "Workload by assignee", this.data.workloadByAssignee);
		}
		this.barSection(el, "Completed per week", this.data.throughputByWeek);

		if (this.data.aging.length > 0) {
			el.createEl("h4", { text: "Longest open" });
			const list = el.createDiv({ cls: "bpp-analytics-aging" });
			for (const a of this.data.aging) {
				const row = list.createDiv({ cls: "bpp-analytics-aging-row" });
				row.createSpan({ cls: "bpp-analytics-aging-name", text: a.name });
				row.createSpan({ cls: "bpp-analytics-aging-col", text: a.column });
				row.createSpan({ cls: "bpp-analytics-aging-days", text: `${a.days}d` });
			}
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private stat(parent: HTMLElement, label: string, value: string): void {
		const s = parent.createDiv({ cls: "bpp-analytics-stat" });
		s.createDiv({ cls: "bpp-analytics-stat-value", text: value });
		s.createDiv({ cls: "bpp-analytics-stat-label", text: label });
	}

	private days(n: number | null): string {
		return n === null ? "—" : `${n.toFixed(1)}d`;
	}

	private barSection(parent: HTMLElement, title: string, buckets: AnalyticsBucket[]): void {
		parent.createEl("h4", { text: title });
		const wrap = parent.createDiv({ cls: "bpp-analytics-bars" });
		if (buckets.length === 0) {
			wrap.createDiv({ cls: "bpp-muted", text: "No data." });
			return;
		}
		const max = Math.max(1, ...buckets.map((b) => b.count));
		for (const b of buckets) {
			const rowEl = wrap.createDiv({ cls: "bpp-analytics-bar-row" });
			rowEl.createSpan({ cls: "bpp-analytics-bar-label", text: b.label });
			const track = rowEl.createDiv({ cls: "bpp-analytics-bar-track" });
			track
				.createDiv({ cls: "bpp-analytics-bar-fill" })
				.setCssProps({ "--bpp-bar": `${Math.round((b.count / max) * 100)}%` });
			rowEl.createSpan({ cls: "bpp-analytics-bar-count", text: String(b.count) });
		}
	}
}

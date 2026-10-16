import { App, Modal, Notice, Setting, TFile, normalizePath } from "obsidian";
import type BasesPowerPackPlugin from "../main";
import { convertDql, conversionToBaseYaml, type DqlConversion } from "../query/dql";
import { ensureParentFolders } from "./viewData";
import { VIEW_TYPE_CALENDAR } from "./calendarView";
import { VIEW_TYPE_GALLERY } from "./galleryView";
import { VIEW_TYPE_KANBAN } from "./kanbanView";

/**
 * "Convert a Dataview query" — paste DQL, get a `.base` file and a view.
 *
 * The whole point of the converter is that a migration should take ten seconds,
 * so this shows the generated base and its caveats side by side BEFORE anything
 * is written. Clauses the converter had to drop are listed in red and also
 * baked into the file as comments, because a filter that silently went missing
 * is the one failure mode that would make someone distrust the whole feature.
 */
export class DqlConvertModal extends Modal {
	private source = "";
	private conversion: DqlConversion | null = null;
	private previewEl: HTMLElement | null = null;
	private reportEl: HTMLElement | null = null;
	private createButton: HTMLButtonElement | null = null;
	private targetPath = "";

	constructor(app: App, private readonly plugin: BasesPowerPackPlugin) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("bpp-dql-modal");
		this.titleEl.setText("Convert a Dataview query");
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("p", {
			cls: "bpp-dql-intro",
			text: "Paste a Dataview query. It becomes a .base file plus the matching Power Pack view. Anything that can't be converted is listed below and left out — never guessed at.",
		});

		const input = contentEl.createEl("textarea", {
			cls: "bpp-dql-input",
			attr: {
				rows: "8",
				spellcheck: "false",
				placeholder: 'TABLE status, due AS "Deadline"\nFROM #project AND -"Archive"\nWHERE status != "done"\nSORT due ASC',
			},
		});
		input.addEventListener("input", () => {
			this.source = input.value;
			this.refresh();
		});

		new Setting(contentEl)
			.setName("Save as")
			.setDesc("Vault path for the generated base file.")
			.addText((text) => {
				this.targetPath = "Converted query.base";
				text.setValue(this.targetPath).onChange((v) => {
					this.targetPath = v;
				});
			});

		this.reportEl = contentEl.createDiv({ cls: "bpp-dql-report" });
		contentEl.createEl("h4", { text: "Generated base" });
		this.previewEl = contentEl.createEl("pre", { cls: "bpp-dql-preview" });

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText("Copy YAML").onClick(() => {
					if (!this.conversion) return;
					void navigator.clipboard
						.writeText(conversionToBaseYaml(this.conversion))
						.then(() => new Notice("Base YAML copied."));
				})
			)
			.addButton((btn) => {
				this.createButton = btn.buttonEl;
				btn.setCta()
					.setButtonText("Create base and open view")
					.onClick(() => void this.create());
			});

		this.refresh();
		input.focus();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private refresh(): void {
		const trimmed = this.source.trim();
		this.conversion = trimmed.length > 0 ? convertDql(trimmed) : null;
		if (this.createButton) this.createButton.disabled = this.conversion === null;

		if (this.previewEl) {
			this.previewEl.setText(this.conversion ? conversionToBaseYaml(this.conversion) : "");
		}
		if (!this.reportEl) return;
		this.reportEl.empty();
		if (!this.conversion) return;

		for (const err of this.conversion.errors) {
			this.reportEl.createDiv({ cls: "bpp-dql-error", text: `Dropped: ${err}` });
		}
		for (const warn of this.conversion.warnings) {
			this.reportEl.createDiv({ cls: "bpp-dql-warning", text: warn });
		}
		if (this.conversion.errors.length === 0 && this.conversion.warnings.length === 0) {
			this.reportEl.createDiv({ cls: "bpp-dql-ok", text: "Converted cleanly — nothing was dropped." });
		}
	}

	private async create(): Promise<void> {
		const conversion = this.conversion;
		if (!conversion) return;
		const raw = this.targetPath.trim() || "Converted query.base";
		const path = normalizePath(raw.endsWith(".base") ? raw : `${raw}.base`);

		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing) {
			new Notice(`"${path}" already exists — pick another path.`);
			return;
		}

		try {
			await ensureParentFolders(this.app, path);
			const file = await this.app.vault.create(path, conversionToBaseYaml(conversion));
			if (!(file instanceof TFile)) return;
			await this.applySettings(conversion, file.path);
			new Notice(`Created "${file.path}".`);
			this.close();
			await this.plugin.activateView(viewTypeFor(conversion.suggestedView));
		} catch (error) {
			new Notice(`Couldn't create the base file (${String(error)}).`);
		}
	}

	/**
	 * Point the plugin at the new base and apply the settings the query implies.
	 * A TASK query also flips the row source, because a task query against note
	 * rows would quietly return the wrong thing.
	 */
	private async applySettings(conversion: DqlConversion, basePath: string): Promise<void> {
		const s = this.plugin.settings;
		s.activeBasePath = basePath;
		const suggested = conversion.suggestedSettings;

		// Every setting this converter can set is also RESET here. Only applying
		// the truthy ones meant converting a TABLE query after a TASK query left
		// the board on task rows, and a query without FLATTEN inherited the
		// previous query's flatten expression — a view that matched neither query.
		s.rowSource = conversion.query.kind === "task" ? "tasks" : "notes";
		if (conversion.query.kind === "task") s.inlineFields = true;
		s.flattenExpression = suggested.flattenExpression ?? "";
		s.flattenAs = suggested.flattenAs ?? "";
		if (suggested.kanbanGroupBy) s.kanbanGroupBy = suggested.kanbanGroupBy;
		if (suggested.calendarDateProp) s.calendarDateProp = suggested.calendarDateProp;

		// A FROM source or WHERE clause reading the link graph needs traversal on.
		const filters = JSON.stringify(conversion.filters ?? "");
		if (filters.includes("file.outlinks") || filters.includes("file.inlinks")) s.linkTraversal = true;
		await this.plugin.saveSettings();
	}
}

function viewTypeFor(view: DqlConversion["suggestedView"]): string {
	if (view === "calendar") return VIEW_TYPE_CALENDAR;
	if (view === "gallery") return VIEW_TYPE_GALLERY;
	return VIEW_TYPE_KANBAN;
}

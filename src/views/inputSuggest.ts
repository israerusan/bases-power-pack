import { AbstractInputSuggest, App, TFolder } from "obsidian";

/**
 * Autocomplete a settings text box from a fixed list of strings (used for
 * frontmatter property names). Removes the #1 first-run failure: typing a property
 * that doesn't exist in the vault and getting a silently empty board.
 */
export class StringSuggest extends AbstractInputSuggest<string> {
	constructor(
		app: App,
		private readonly input: HTMLInputElement,
		private readonly items: () => string[]
	) {
		super(app, input);
	}

	protected getSuggestions(query: string): string[] {
		const q = query.toLowerCase();
		const all = this.items();
		const matches = q ? all.filter((k) => k.toLowerCase().includes(q)) : all;
		return matches.slice(0, 100);
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	selectSuggestion(value: string): void {
		this.input.value = value;
		// Fire the TextComponent's onChange (it listens for "input").
		this.input.trigger("input");
		this.close();
	}
}

/** Autocomplete a settings text box with the vault's folder paths. */
export class FolderSuggest extends AbstractInputSuggest<string> {
	constructor(
		app: App,
		private readonly input: HTMLInputElement
	) {
		super(app, input);
	}

	private folderPaths(): string[] {
		const out: string[] = [];
		for (const f of this.app.vault.getAllLoadedFiles()) {
			if (f instanceof TFolder && f.path !== "/") out.push(f.path);
		}
		return out.sort((a, b) => a.localeCompare(b));
	}

	protected getSuggestions(query: string): string[] {
		const q = query.toLowerCase();
		const all = this.folderPaths();
		const matches = q ? all.filter((p) => p.toLowerCase().includes(q)) : all;
		return matches.slice(0, 100);
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	selectSuggestion(value: string): void {
		this.input.value = value;
		this.input.trigger("input");
		this.close();
	}
}

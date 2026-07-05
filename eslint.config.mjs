import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

/**
 * Runs the SAME ruleset as Obsidian's automated community-plugin review
 * (eslint-plugin-obsidianmd) so review failures are caught locally before a release.
 * `npm run lint` is a hard gate (`--max-warnings 0`); a warning can still block review.
 */
export default tseslint.config(
	{
		ignores: [
			"main.js",
			"dist/**",
			"node_modules/**",
			"tests/**",
			"scripts/**",
			"esbuild.config.mjs",
			"version-bump.mjs",
			"eslint.config.mjs",
			"src/**/*.mjs",
			"src/**/*.d.mts",
		],
	},
	// The Obsidian review bot's ruleset: manifest validation, settings-tab headings,
	// static-style assignment, forbidden elements, command naming, etc.
	...obsidianmd.configs.recommended,
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			// `ui/sentence-case` fires on product names / proper nouns the real review does not flag.
			"obsidianmd/ui/sentence-case": "off",
			// Declarative settings API added in Obsidian 1.13.0; this plugin targets an older minAppVersion.
			"obsidianmd/settings-tab/prefer-setting-definitions": "off",
			// Flags detached, textContent-only element creation as unsafe; the suggested
			// `.win.createDiv()` isn't typed in the current obsidian d.ts.
			"obsidianmd/prefer-create-el": "off",
		},
	}
);

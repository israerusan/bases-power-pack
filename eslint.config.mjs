import tsparser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";

// Runs the official Obsidian community-review lint rules
// (github.com/obsidianmd/eslint-plugin) against the plugin source.
export default [
	{
		ignores: ["main.js", "node_modules/**", "tests/**", "scripts/**", "src/shared/**"],
	},
	...obsidianmd.configs.recommended,
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parser: tsparser,
			parserOptions: { project: "./tsconfig.json" },
		},
		rules: {
			// Preserve the plugin's proper nouns / product name when the
			// sentence-case rule would otherwise lowercase them. "Gantt" is a
			// surname; the rest are the plugin's own product and view names.
			"obsidianmd/ui/sentence-case": [
				"warn",
				{
					brands: ["Bases Power Pack", "Power Pack", "Kanban", "Gantt", "Calendar", "Lite", "Premium"],
					acronyms: ["HTTPS", "URL"],
				},
			],
		},
	},
];

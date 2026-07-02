#!/usr/bin/env node
/**
 * Sync the vendored shared core in a plugin repo against the canonical
 * obsidian-plugin-core checkout.
 *
 * Run from a plugin repo root (each plugin vendors a copy of this script):
 *   node scripts/sync-shared.mjs           # copy canonical -> src/shared/
 *   node scripts/sync-shared.mjs --check   # exit 1 if the vendored copy drifted
 *
 * The canonical checkout is expected at ../obsidian-plugin-core relative to
 * the plugin repo, or wherever PLUGIN_CORE_PATH points. When it is absent
 * (CI, fresh clones), both modes succeed silently — the vendored copies are
 * committed, so builds never depend on the canonical repo being present.
 */
import fs from "fs";
import path from "path";

const repoRoot = process.cwd();
const canonical =
	process.env.PLUGIN_CORE_PATH || path.resolve(repoRoot, "..", "obsidian-plugin-core");
const check = process.argv.includes("--check");

/** [canonical-relative, plugin-relative] pairs kept in sync. */
const FILES = [
	["shared/verifyLicense.mjs", "src/shared/verifyLicense.mjs"],
	["shared/verifyLicense.d.mts", "src/shared/verifyLicense.d.mts"],
	["scripts/sync-shared.mjs", "scripts/sync-shared.mjs"],
];

/** Compare content, not line endings — git autocrlf checkouts differ per OS. */
const normalize = (text) => text.replace(/\r\n/g, "\n");

if (!fs.existsSync(canonical)) {
	console.log(`sync-shared: canonical repo not found at ${canonical} — skipping.`);
	process.exit(0);
}

let drifted = 0;
for (const [from, to] of FILES) {
	const src = path.join(canonical, from);
	const dest = path.join(repoRoot, to);
	if (!fs.existsSync(src)) {
		console.error(`sync-shared: missing canonical file ${src}`);
		process.exit(1);
	}
	const want = fs.readFileSync(src, "utf8");
	const have = fs.existsSync(dest) ? fs.readFileSync(dest, "utf8") : null;
	if (have !== null && normalize(want) === normalize(have)) continue;
	if (check) {
		console.error(`sync-shared: DRIFT in ${to} (canonical: ${from})`);
		drifted++;
	} else {
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		fs.writeFileSync(dest, want);
		console.log(`sync-shared: updated ${to}`);
	}
}

if (check && drifted > 0) {
	console.error(`sync-shared: ${drifted} file(s) drifted — run "npm run sync:shared" to update.`);
	process.exit(1);
}
console.log(check ? "sync-shared: vendored copies match canonical." : "sync-shared: done.");

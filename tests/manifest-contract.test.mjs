// Manifest/versions contract — the checks Obsidian's review runs on manifest.json
// that eslint-plugin-obsidianmd's `validate-manifest` can't (eslint doesn't lint the
// JSON file without a JSON language plugin). Locks the exact class of issues we've
// been dinged on (the word "Obsidian" in the description) plus release consistency.
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const versions = JSON.parse(fs.readFileSync(path.join(root, "versions.json"), "utf8"));

// --- Redundant words the review rejects -------------------------------------
assert.ok(!/\bobsidian\b/i.test(manifest.description), 'manifest.description must not contain the word "Obsidian" (implied by the plugin directory)');
assert.ok(!/\bplugin\b/i.test(manifest.description), 'manifest.description must not contain the word "plugin"');
assert.ok(!/obsidian/i.test(manifest.name), 'manifest.name must not contain "Obsidian"');
assert.ok(!/\bplugin\b/i.test(manifest.name), 'manifest.name must not contain "plugin"');
assert.ok(!/obsidian/i.test(manifest.id), 'manifest.id must not contain "obsidian"');
assert.ok(!/plugin/i.test(manifest.id), 'manifest.id must not contain "plugin"');

// --- Shape -------------------------------------------------------------------
assert.ok(/^[a-z0-9-]+$/.test(manifest.id), "manifest.id must be lowercase letters/digits/hyphens");
assert.ok(manifest.minAppVersion && /^\d+\.\d+\.\d+$/.test(manifest.minAppVersion), "manifest.minAppVersion must be set (x.y.z)");
assert.ok(manifest.author, "manifest.author must be set");
assert.equal(typeof manifest.isDesktopOnly, "boolean", "manifest.isDesktopOnly must be a boolean");

// --- Release consistency (tag == manifest version, listed in versions.json) --
assert.ok(/^\d+\.\d+\.\d+$/.test(manifest.version), "manifest.version must be x.y.z");
assert.equal(manifest.version, pkg.version, "manifest.json and package.json versions must match");
assert.ok(versions[manifest.version], `versions.json must contain an entry for ${manifest.version}`);

console.log("manifest contract tests passed");

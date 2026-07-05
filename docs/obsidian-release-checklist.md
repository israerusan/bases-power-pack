# Obsidian Plugin Release & Review Checklist

A reusable pre-flight for shipping a new version of **any** Obsidian community plugin
so it cleanly passes Obsidian's automated review (and stays listed). Born from real
review failures — see the "Rules we've actually been dinged on" section.

> The automated review runs [`eslint-plugin-obsidianmd`](https://github.com/obsidianmd/eslint-plugin-obsidianmd)
> plus manifest/release validation. **The single highest-leverage fix is to run those
> same checks locally** so nothing reaches the reviewer (see step 0).

---

## 0. Run the review bot's own linter locally (do this once per repo)

Our hand-rolled eslint config does **not** catch every rule the review bot does
(it missed `no-static-styles-assignment`, `no-unnecessary-type-assertion`, the
manifest-description and settings-heading checks). Wire the official plugin so
`npm run lint` == the bot:

```bash
npm i -D eslint-plugin-obsidianmd
```

```js
// eslint.config.mjs
import obsidianmd from "eslint-plugin-obsidianmd";
export default [
  ...obsidianmd.configs.recommended,   // the review bot's ruleset
  // ...your existing config...
];
```

Then always run lint as a hard gate: `eslint . --max-warnings 0` (a warning can still
block review). Until this is wired, walk the checklist below by hand every release.

---

## 1. Ship sequence (every release)

1. **`npm run lint`** — clean, `--max-warnings 0`. (Mirrors the review bot.)
2. **`npm test`** — full gate green.
3. **`npm run build`** — produces `main.js` (production, no inline sourcemap).
4. Bump the version in **both** `manifest.json` and `package.json`.
5. Add a **`versions.json`** entry: `"<version>": "<minAppVersion>"`.
6. Update **`CHANGELOG.md`**.
7. Commit → merge to the default branch.
8. **Tag it: `git tag <version>`** where `<version>` **exactly equals** `manifest.json`'s version (no `v` prefix).
9. **`git push origin <version>`** — push the **specific tag**. **Never `git push --tags`** (a stale local tag can fire a bogus release and steal the "Latest" marker — this bit us: an old `2.5.1` tag published itself as Latest over `2.10.0`).
10. Verify the GitHub release published as **Latest** with assets: `main.js`, `manifest.json`, `styles.css` (+ `versions.json`).

CI: run the full lint+test on **push to master and every PR**, and **also at tag time**
in the release workflow (install any test deps there too, e.g. ripgrep — the release
job doesn't inherit the PR job's setup).

---

## 2. `manifest.json`

- **`description`**: must NOT contain the word **"Obsidian"** (implied) or **"plugin"**. Concise, sentence case, ends with a period.
- **`name`**: no "Obsidian", no "Plugin".
- **`id`**: lowercase, hyphenated, no "obsidian"/"plugin", matches the plugin folder name; never change it after release.
- **`version`**: valid semver, **equals the release tag**, and has a **`versions.json`** entry.
- **`minAppVersion`**: present and real.
- **`author`** / **`authorUrl`**: present, not misleading.
- **`isDesktopOnly`**: accurate (`false` only if it truly works on mobile — see §4).
- No `fundingUrl` abuse; if present, a real URL.

## 3. Source code — the `obsidianmd` rules

- **No `innerHTML` / `outerHTML` / `insertAdjacentHTML`** — build DOM with `createEl`/`createDiv`/`setText`/`appendChild` (security + review rule).
- **No inline styles from JS** (`el.style.foo = …`) — use a **CSS class** (in `styles.css`) or `el.setCssStyles({...})` / `setCssProps`. (`obsidianmd/no-static-styles-assignment`.)
- **No unnecessary type assertions** (`x as SomeType` that doesn't change the type). If a value already has the type, drop the cast; if the type is genuinely wider, narrow via the real API (e.g. type an event listener param, or track state) rather than casting.
- **No `var`**; `const`/`let` only.
- **No `any`** where avoidable; no unsafe casts (`no-unsafe-*`).
- **No floating promises** — `await` or `void` every promise.
- **Clean up everything on unload**: register listeners/intervals via `this.registerEvent`, `this.registerDomEvent`, `this.registerInterval`, `this.addCommand`, etc. so they're auto-released; otherwise remove them in `onunload`.
- **Use `this.app`**, never a global `app`.
- **`instanceof TFile` / `TFolder`** for vault-file type checks.
- **`normalizePath()`** on any user-supplied path.
- Prefer **`Vault.process` / the Editor API** over `Vault.modify` for the active file.
- Use **Obsidian's `moment`** (`import { moment } from "obsidian"`), not a separate copy.
- Minimal `console` output (errors/warnings ok, no debug spam).
- Don't ship a **default hotkey** (register the command, let users bind it).
- Prefer **`Platform.isMacOS` / `Platform.isMobile`** over `navigator.*`.

## 4. Mobile & popout safety (if `isDesktopOnly: false`)

- **Feature-detect Node APIs** — `fs`, `child_process`, `path` may be absent on mobile. No top-level `require()`; guard with `try/catch` and fall back.
- **No bare `document` / `window` / `globalThis`** — use `el.ownerDocument`, `activeWindow`, `activeDocument`, or `el.win` so it works in popout windows. (`window.setTimeout` is fine; bare `document`/`globalThis` are flagged.)

## 5. Settings & command copy

- **No "General" settings heading** — use a specific name (e.g. "Display") or no heading. Don't put the plugin name or the word "settings" in a heading.
- **Setting names & descriptions in sentence case** ("Show modified time", not "Show Modified Time").
- **Command names**: sentence case, do **not** include the plugin name (Obsidian prefixes it).

## 6. Styling (`styles.css`)

- **All CSS lives in `styles.css`** — no inline JS styles (§3).
- **Theme-safe**: use Obsidian CSS variables (`--font-ui-*`, `--background-*`, `--text-*`, `--interactive-accent`) so it adapts to light/dark and to the user's interface-font size. Avoid fixed px font sizes for readable text — base them on `--font-ui-*`.
- **Expose sizing/spacing as CSS custom properties** so themes can retune without fighting selectors. Keep width/height **viewport-safe** (cap with `dvh`/`vw`, `max-width: calc(100vw - …)`) so nothing overflows on mobile.

## 7. Privacy / network

- No telemetry, no phone-home. Any network call must be disclosed in the README and be user-initiated/optional. License checks should be offline where possible.

---

## Rules we've actually been dinged on (Vault Spotlight)

| Flagged | Rule | Fix |
| --- | --- | --- |
| `manifest.description` had "Obsidian" | redundant word | remove "Obsidian"/"plugin" |
| Settings "General" heading | avoid generic heading | rename to a specific section |
| `el.style.cursor = "pointer"` | `no-static-styles-assignment` | CSS class in `styles.css` |
| `(evt as InputEvent).isComposing` | `no-unnecessary-type-assertion` | annotate the param / track state instead |

## If a version fails review (delisting recovery)

1. Fix the exact flagged items.
2. Bump a **patch** version (+ `versions.json`, changelog).
3. Re-release via the ship sequence (§1).
4. If a bad/stray release exists: `gh release delete <bad> --cleanup-tag --yes` then `gh release edit <good> --latest`.
5. Reply on the review PR/issue that the items are resolved and point at the new version.

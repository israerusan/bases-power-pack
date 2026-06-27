# Borrowed from Vault Spotlight

This plugin was scaffolded fresh, but its conventions are adapted from the
existing **Vault Spotlight** plugin (`C:\Users\iavil\obsidian-vault-spotlight`),
which is a shipped paid Obsidian plugin. What we took and why:

## Licensing (the big one)
- **Offline Ed25519 verification** instead of a stubbed network call. Replaced
  the original mock `LicenseManager` (which "called" a validation endpoint) with
  Vault Spotlight's model: a license key is `base64url(payload).base64url(sig)`,
  verified locally with [tweetnacl](https://www.npmjs.com/package/tweetnacl)
  against an embedded public key. No server, no account, no network.
  → `src/license/LicenseManager.ts`, `src/license/publicKey.ts`
- **`base64ToBytes` helper** (url-safe + standard base64, padding-tolerant) —
  copied verbatim; it's the decode shared by signing and verification.
- **Minimal `tweetnacl` type shim** so we don't need an extra @types dep.
  → `src/types/tweetnacl.d.ts`
- **Author tooling**: `scripts/generate-license.mjs` (mint a customer key) and
  `scripts/customer-license-template.txt` (delivery email). Added a
  `scripts/keygen.mjs` (the reference assumed the keypair already existed) so the
  whole flow is reproducible. Private key is gitignored.
- **`isPro` / `licenseEmail` cached in settings**, re-verified by
  `refreshLicense()` on load and whenever the key field changes.

## Settings tab patterns
- `new Setting(containerEl).setName(...).setHeading()` for section headers
  (instead of raw `createEl("h2"/"h3")`).
- **License status block** with a purchase link, plus a configurable
  `purchaseUrl` setting.
- **Locked premium rows**: the `proSearch()` helper — renamed `premium()` here —
  that renders a greyed-out "(Premium)" row instead of a live control when the
  user isn't licensed (`.bpp-setting-locked`).
- `refreshLicense().then(() => this.display())` to re-render on key change.

## main.ts patterns
- `settings: T = DEFAULT_SETTINGS` (no `!`), and the `loadData()` unknown-guard
  in `loadSettings()`.
- **`checkCallback` gating** for premium commands so they don't appear in the
  palette without a license, rather than showing a Notice after the fact.
- `void this.saveSettings()` fire-and-forget pattern.

## Build / project setup
- `esbuild.config.mjs` shape (externals list, prod/watch split, banner).
- `tsconfig.json` (`include` covers `**/*.d.ts`).
- `package.json` conventions: `"type": "module"`, `tweetnacl` dependency,
  `test` + `license:generate` scripts, esbuild-only `build` with a separate
  `typecheck`.
- `.gitignore` that **commits `main.js`** (standard for Obsidian distribution)
  and ignores `scripts/.license-private.key`.
- **`.github/workflows/release.yml`** — tag-driven release that verifies
  manifest/versions and attaches `main.js`/`manifest.json`/`styles.css`.
- A `tests/license.test.mjs` mirroring the reference's sign→verify round-trip
  (plus a tamper check).

## Not borrowed
- Search internals (ripgrep, fuzzy, canvas/PDF) — irrelevant to a Bases plugin.
- The specific feature set; our views (kanban/calendar) are original.

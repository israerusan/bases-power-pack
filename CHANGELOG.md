# Changelog

All notable changes to Bases Power Pack are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [1.2.2] - 2026-07-05

### Internal
- **`npm run lint` now runs `eslint-plugin-obsidianmd` — the exact ruleset
  Obsidian's automated community-plugin review uses** — as a hard gate
  (`eslint . --max-warnings 0`), so review failures are caught locally before a
  release instead of after (a failed review delists the plugin). Added a
  **manifest-contract test** and a reusable **release checklist** in `docs/`.

### Fixed
- Three type-safety issues surfaced by the new lint gate (no behavior change):
  hardened the value-to-string helpers in the expression engine and Kanban view
  so non-primitive values never render as `[object Object]`, and dropped an
  unused binding in the view chrome.

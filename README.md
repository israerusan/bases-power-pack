# Bases Power Pack

Advanced database views and automation on top of Obsidian's native **Bases** feature. Bases Power Pack adds extra view types, roll-ups/formulas, and saved filters so your Bases behave like a real lightweight database.

> **Open-core / one-time purchase.** The plugin is free to use in its Lite tier. Premium features unlock with a one-time license — **~$29 (one-time)**.

---

## Lite vs. Premium

| Feature | Lite (free) | Premium (~$29 one-time) |
| --- | :---: | :---: |
| **Kanban view** (group notes by a frontmatter property) | ✅ | ✅ |
| **Calendar view** (notes placed by a date property) | — | ✅ |
| Gantt timeline view | — | ✅ (roadmap) |
| Roll-ups & formula columns | — | ✅ (roadmap) |
| Saved filters & view presets | — | ✅ (roadmap) |

The **Kanban view is the free "one extra view"** — fully usable with no license. Everything else is gated behind the license check (`LicenseManager.isPremium()`).

### How the views work

Both views read standard frontmatter, the same data Bases tables expose, so they work today without depending on Bases internals:

- **Kanban** — scans markdown notes for a configurable property (default `status`) and lays them out in columns. Click a card to open the note.
- **Calendar** — month grid that places notes onto days using a configurable date property (default `due`). Navigate months with the arrows.

Configure both properties in **Settings → Bases Power Pack**.

---

## Usage

Commands (open the command palette):

- **Open Kanban view (Lite)**
- **Open Calendar view (Premium)** — prompts to upgrade if no valid license
- **Verify license key**

There's also a ribbon icon for the Kanban board.

### Premium / licensing

Enter your license key in **Settings → Bases Power Pack → License**. The plugin validates the key against a configurable endpoint and caches the result; premium views unlock immediately on a successful check.

> The network validation call is currently **stubbed** for development (any key starting with `PREMIUM-` or ≥16 chars validates). Real billing via **Lemon Squeezy / Gumroad** is left as a clean `TODO(billing)` in `src/licenseManager.ts`.

---

## Build

```bash
npm install
npm run build      # type-checks then bundles to main.js
npm run dev        # watch mode
```

`npm run build` produces `main.js` in the project root alongside `manifest.json` and `styles.css` — the three files Obsidian loads.

### Install into a vault for testing

Copy `main.js`, `manifest.json`, and `styles.css` into:

```
<your-vault>/.obsidian/plugins/bases-power-pack/
```

Then enable **Bases Power Pack** in *Settings → Community plugins*.

---

## Project layout

```
bases-power-pack/
├── manifest.json          # Obsidian plugin manifest
├── versions.json          # version -> minAppVersion map
├── package.json
├── tsconfig.json
├── esbuild.config.mjs     # bundler config
├── styles.css
└── src/
    ├── main.ts            # plugin entry, commands, view registration
    ├── settings.ts        # settings interface + settings tab
    ├── licenseManager.ts  # open-core license gate (stubbed network call)
    └── views/
        ├── kanbanView.ts  # Lite (free) view
        └── calendarView.ts# Premium (gated) view
```

## License

MIT (plugin source). Premium feature access is governed by a commercial license key.

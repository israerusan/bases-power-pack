# Bases Power Pack

Advanced database views and automation on top of Obsidian's native **Bases** feature. Bases Power Pack adds extra view types, roll-ups/formulas, and saved filters so your Bases behave like a real lightweight database.

> **Open-core / one-time purchase.** The plugin is free to use in its Lite tier. Premium features unlock with a one-time license — **~$29 (one-time)**.

---

## Lite vs. Premium

| Feature | Lite (free) | Premium (~$29 one-time) |
| --- | :---: | :---: |
| **Kanban view** (group notes by a frontmatter property) | ✅ | ✅ |
| **Kanban quick filters** (search, sort, hide done) | ✅ | ✅ |
| **Kanban quick add** (create a note directly from a column) | ✅ | ✅ |
| **Kanban drag-and-drop updates** (move a card, write frontmatter) | ✅ | ✅ |
| **Kanban add / remove columns** (create a new status column from the board) | ✅ | ✅ |
| **Kanban color-coded columns & cards** (stable color per column value) | ✅ | ✅ |
| **Kanban card metadata** (raw due / priority / owner / tags lines) | ✅ | ✅ |
| **Calendar view** (notes placed by a date property) | — | ✅ |
| **Gantt timeline view** (bars from start/end dates) | — | ✅ |
| **Roll-ups** (aggregate an expression across rows) | — | ✅ |
| **Formulas** (computed columns / card values) | — | ✅ |
| **Saved filters & view presets** | — | ✅ |
| **`.base` file as data source** (read Bases filters + formulas) | — | ✅ |

Lite is now a genuinely useful kanban layer: create cards, move cards, search/sort the board, and see core metadata without paying. Premium still owns the database brains — calendar, Gantt, formulas, roll-ups, saved filters, and `.base`-driven workflows.

### How the views work

All three views run on a shared query engine. In the **Lite** tier they read standard frontmatter across the vault; in **Premium** they can instead take a `.base` file as their data source, applying its filters and formulas.

- **Kanban** — groups rows by a configurable property (default `status`), supports quick search/sort/hide-done controls, lets you create a note directly from any column, add brand-new status columns from the board (so you can drag a card to a status no note has yet), and drag cards between columns to update frontmatter. Columns and their cards are color-coded by a stable hue per value (toggle in settings). Premium cards can also show a formula value (e.g. `round(done / total * 100, 0) + "%"`). Click a card to open the note.
- **Calendar** — month grid that places rows onto days using a configurable date property (default `due`). Navigate months with the arrows.
- **Gantt** — horizontal timeline; each row becomes a bar from a start date property to an optional end date, with a "today" marker.

### `.base` integration (Premium)

Point **Settings → Bases Power Pack → Active base** at any `.base` file. The plugin parses its `filters` and `formulas` and uses that as the row set for every view — so a Bases database can be visualized as a kanban board, calendar, or Gantt chart. Choose *All notes* to run over the whole vault instead.

### Formulas & roll-ups (Premium)

Formulas and roll-ups share one safe expression language (no `eval`): arithmetic, comparisons, `&&`/`||`, `if(cond, a, b)`, and functions like `sum`, `avg`, `round`, `contains`, `empty`, `default`, `date`, and `datediff`. Reference any frontmatter key by name (`done`, `total`), `file.*` fields (`file.name`, `file.mtime`), or a key with spaces via `prop("key name")`.

- **Formulas** from the active `.base` are available to every filter, roll-up, and the Kanban card line.
- **Roll-ups** aggregate an expression across the visible rows (`count`, `sum`, `avg`, `min`, `max`, `unique`, `filled`, `empty`, `range`) and render as a summary bar. Configure them in settings.

### Saved filters (Premium)

Save named filter expressions (e.g. `status != "done" && priority > 2`) in settings, then switch between them from each view's toolbar. They apply on top of the active base's own filters.

Configure everything in **Settings → Bases Power Pack**.

---

## Usage

Commands (open the command palette):

- **Open Kanban view (Lite)**
- **Open Calendar view (Premium)** — hidden until a valid license is active
- **Open Gantt view (Premium)** — hidden until a valid license is active
- **Verify license key**

There's also a ribbon icon for the Kanban board.

### Premium / licensing

Enter your license key in **Settings → Bases Power Pack → License**. Keys are verified **offline with Ed25519 signatures** (via [tweetnacl](https://www.npmjs.com/package/tweetnacl)) — no account, server, or network call. The result is cached in `isPro`; premium views and settings unlock immediately on a valid key.

A license key is `base64url(payload).base64url(signature)`, signed by the author's private key and verified against the public key embedded in `src/license/publicKey.ts`.

**Selling keys (author workflow):**

```bash
node scripts/keygen.mjs                 # one-time: create keypair (.license-private.key + public key)
npm run license:generate -- buyer@email.com   # after a sale: mint a key to email the customer
```

> Billing/delivery (taking payment, emailing the key) is handled out-of-band by **Lemon Squeezy / Gumroad** — see the `TODO(billing)` in `src/license/LicenseManager.ts`. No plugin code changes are needed to wire a storefront; you just deliver the generated key.

---

## Build

```bash
npm install
npm run build      # bundles to main.js
npm run dev        # watch mode
npm run typecheck  # tsc --noEmit
npm test           # offline license verification tests
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
├── .github/workflows/
│   └── release.yml        # tag-driven GitHub release (build + attach assets)
├── scripts/
│   ├── keygen.mjs         # one-time Ed25519 keypair generator (author)
│   ├── generate-license.mjs   # mint a customer key (author)
│   └── customer-license-template.txt
├── tests/
│   └── license.test.mjs   # offline license sign/verify round-trip
└── src/
    ├── main.ts            # plugin entry, commands, view registration
    ├── settings.ts        # settings interface + settings tab
    ├── license/
    │   ├── LicenseManager.ts  # offline Ed25519 verification
    │   └── publicKey.ts       # embedded public key
    ├── types/tweetnacl.d.ts   # minimal tweetnacl type shim
    └── views/
        ├── kanbanView.ts  # Lite (free) view
        └── calendarView.ts# Premium (gated) view
```

> **Reference:** the licensing approach, settings-tab patterns, build/test setup, and project layout are adapted from the [Vault Spotlight](https://github.com/) plugin — see "Borrowed from Vault Spotlight" notes in the repo.

## License

MIT (plugin source). Premium feature access is governed by a signed license key.

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
| **Kanban reorder columns** (drag a column header to reposition it) | ✅ | ✅ |
| **Kanban color-coded columns & cards** (stable color per column value) | ✅ | ✅ |
| **Kanban card metadata** (raw due / priority / owner / tags lines) | ✅ | ✅ |
| **Kanban inline card edit** (click a field, write frontmatter in place) | ✅ | ✅ |
| **Kanban group-by picker** (re-group the board from the toolbar) | ✅ | ✅ |
| **Right-click menus** (card: open/move/rename/edit/delete · column: color/rename/WIP/add) | ✅ | ✅ |
| **Bulk edit** (set/clear/toggle a property across the visible cards) | ✅ | ✅ |
| **WIP limits** (per-column work-in-progress caps; flag or block over-limit) | ✅ | ✅ |
| **Undo** (reverse the last move, edit, bulk change, or column rename) | ✅ | ✅ |
| **Move Rules automation** (on entering a column, auto-write frontmatter) | — | ✅ |
| **Calendar view** (Month / Week / Agenda) | — | ✅ |
| **Calendar drag-to-reschedule** (move an event, write the date) | — | ✅ |
| **Calendar create-on-day** + color-by property | — | ✅ |
| **Quick search** (filter cards/events/bars by name, path, folder, tags) | ✅ | ✅ |
| **Right-click menus on calendar events & Gantt bars** (reschedule/set-date, open, rename, delete) | — | ✅ |
| **Gantt timeline view** (bars from start/end dates) | — | ✅ |
| **Gantt drag-to-move / resize** (reschedule + change duration) | — | ✅ |
| **Gantt zoom, scroll-to-today, progress fill & milestones** | — | ✅ |
| **Outline / hierarchy view** (nest notes by a parent property into a tree) | — | ✅ |
| **Outline drag-to-reparent** + add-child, branch roll-ups (count · done/total · progress) | — | ✅ |
| **Rename-safe hierarchy** (renaming a parent repoints its children) | — | ✅ |
| **Roll-ups** (aggregate an expression across rows) | — | ✅ |
| **Formulas** (computed columns / card values) | — | ✅ |
| **Saved filters & view presets** | — | ✅ |
| **`.base` file as data source** (read Bases filters + formulas) | — | ✅ |

Lite is a genuinely useful kanban layer: create, move, and inline-edit cards, re-group and search/sort the board, all without paying. Premium is the **interactive planning suite** — a calendar and Gantt you can *drag to plan* (they write dates back to your notes, just like the free board writes status), plus the database brains: formulas, roll-ups, saved filters, and `.base`-driven workflows.

### How the views work

All three views run on a shared query engine. In the **Lite** tier they read standard frontmatter across the vault; in **Premium** they can instead take a `.base` file as their data source, applying its filters and formulas.

- **Kanban** — groups rows by a configurable property (default `status`), supports quick search/sort/hide-done controls and a toolbar **group-by picker**, lets you create a note directly from any column, add brand-new status columns from the board (so you can drag a card to a status no note has yet), drag cards between columns to update frontmatter, and drag column headers to reorder the board. Click any card metadata field to **edit it in place** — the parsed value is written straight to frontmatter. Set a **WIP limit** on any column (right-click its header) to cap its cards. Columns and their cards are color-coded by a stable hue per value (toggle in settings). Premium cards can also show a formula value (e.g. `round(done / total * 100, 0) + "%"`). Click a card to open the note.
- **Calendar** — Month, Week, or Agenda. Places rows onto days using a configurable date property (default `due`), highlights today, and can color events by any property. **Drag an event to another day to reschedule it** (the date property is rewritten, preserving any time-of-day), or hover a day and click **+** to create a note dated to that day. A toolbar **search** filters events; **right-click an event** to reschedule via a prompt, open, rename, or delete without dragging.
- **Gantt** — horizontal timeline; each row becomes a bar from a start date property to an optional end date. **Drag a bar to move it, drag its right edge to resize** (both write frontmatter). Zoom the time scale, scroll to today, fill bars by a `progress` property (accepts a `0–1` fraction or a `0–100` percent), and show `milestone` notes as diamonds. A toolbar **search** filters bars; **right-click a bar** to set its start/end date via a prompt, open, rename, or delete.
- **Outline** — an indented tree of your notes linked by a `parent` frontmatter property holding the parent note's path. Each branch rolls up a **descendant count** and a **done / total + progress** bar over its leaf tasks. **Drag a row onto another to reparent it**, drop it on the top strip to detach it, or right-click to add a child, set/clear the parent, and open/rename/delete. Cycles and dangling parents are flagged, not crashed; a parent that's filtered out still appears as a faint placeholder so its children stay nested. Renaming or moving a parent note automatically repoints its children.

### WIP limits (Free)

Right-click a Kanban column header and choose **Set WIP limit…** to cap how many cards it should hold. The header then shows `count / limit`, and a column over its cap turns red. Turn on **Settings → Bases Power Pack → Enforce WIP limits** to *block* a move that would push a column past its limit (a notice explains why) — with it off, over-limit columns are simply flagged. Creating notes, bulk edits, and Move Rules are never blocked; only moves are. A limit follows its column across a rename.

### Undo (Free)

Every frontmatter write Power Pack makes — a drag-to-move, a reschedule, a Gantt resize, an inline card edit, a bulk edit, or a whole column rename across many notes — is reversible. Run **Undo last change** from the command palette to restore the exact prior values; a multi-note operation (bulk edit, column rename) undoes as a single step.

### Outline / hierarchy (Premium)

Give your notes real structure: initiative → project → task → subtask. Each note names its parent by **path** in a frontmatter property (default `parent`, e.g. `parent: Projects/Website.md`), and the **Outline** view renders the whole forest as an indented, collapsible tree.

- **Branch roll-ups.** Every parent shows how many notes are under it and a **done / total** progress bar over its leaf tasks (a note counts as done when its group value is `done` or it has a truthy `done`).
- **Drag to reparent.** Drag a row onto another to nest it (writes the parent path), or drop it on the top strip to make it top-level — all undoable. The right-click menu adds *Add child note*, *Set parent…*, *Make top-level*, plus the shared open / rename / delete actions.
- **Safe by construction.** Parent cycles and dangling parent paths are flagged and quarantined, never crashed. A parent filtered out of the current view shows as a faint placeholder so its visible children stay nested. Renaming or moving a parent note automatically repoints its children.
- Set the parent property, an optional sibling-`order` property, and a quick-add folder in **Settings → Bases Power Pack**.

### `.base` integration (Premium)

Point **Settings → Bases Power Pack → Active base** at any `.base` file. The plugin parses its `filters` and `formulas` and uses that as the row set for every view — so a Bases database can be visualized as a kanban board, calendar, or Gantt chart. Choose *All notes* to run over the whole vault instead.

### Formulas & roll-ups (Premium)

Formulas and roll-ups share one safe expression language (no `eval`): arithmetic, comparisons, `&&`/`||`, `if(cond, a, b)`, and functions like `sum`, `avg`, `round`, `contains`, `empty`, `default`, `date`, and `datediff`. Reference any frontmatter key by name (`done`, `total`), `file.*` fields (`file.name`, `file.mtime`), or a key with spaces via `prop("key name")`.

- **Formulas** from the active `.base` are available to every filter, roll-up, and the Kanban card line.
- **Roll-ups** aggregate an expression across the visible rows (`count`, `sum`, `avg`, `min`, `max`, `unique`, `filled`, `empty`, `range`) and render as a summary bar. Configure them in settings.

### Automation — Move Rules (Premium)

Turn the Kanban board into a workflow. A **Move Rule** fires when a card's
trigger property *enters* a value — for example, dragging a card into the
**Done** column. Each rule runs an ordered list of frontmatter actions:

- **Set to value** — write a literal (e.g. `done = true`).
- **Set to today / now** — stamp a date (e.g. `completed = 2026-07-15`) or a
  timestamp.
- **Clear** — remove a property.
- **Toggle** — flip a boolean.
- **Copy from** — copy another property's current value.

Rules fire only on a genuine transition (dropping a card back where it already
was does nothing), and the writes a rule makes never trigger another rule.
Configure them under **Settings → Bases Power Pack → Move Rules**.

### Right-click menus & bulk edit (Free)

Right-click a **card** to open it, move it to another column (which fires any
Move Rules), edit a field, rename the note, or delete it. Right-click a
**column header** to add a note, recolor the column, rename it (which rewrites
the property on every note in that column), or remove an empty column. The
**Bulk edit** toolbar button sets, clears, or toggles a property across every
card currently visible on the board.

### Saved filters (Premium)

Save named filter expressions (e.g. `status != "done" && priority > 2`) in settings, then switch between them from each view's toolbar. They apply on top of the active base's own filters.

Configure everything in **Settings → Bases Power Pack**.

---

## Usage

Commands (open the command palette):

- **Open Kanban view (Lite)**
- **Open Calendar view (Premium)** — hidden until a valid license is active
- **Open Gantt view (Premium)** — hidden until a valid license is active
- **Open Outline view (Premium)** — hidden until a valid license is active
- **Undo last change** — reverse the most recent frontmatter edit (available only when there is something to undo)
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

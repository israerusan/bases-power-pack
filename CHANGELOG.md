# Changelog

All notable changes to Bases Power Pack are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [1.8.0] - 2026-07-16

"Control & Confidence." Makes every destructive edit reversible, brings the
premium views up to Kanban's usability, and gives the free board a real
workflow tool — WIP limits — that honors the "Power Pack" name.

### Added — WIP limits (free, flagship)
- **Per-column work-in-progress limits.** Right-click a Kanban column header →
  **Set WIP limit…** to cap how many cards a column should hold. The header
  shows `count / limit`, and a column over its cap turns red.
- **Optional enforcement.** A new **Enforce WIP limits** setting blocks a move
  that would push a column past its limit (a notice explains why); left off, an
  over-limit column is only flagged. Creation, bulk edit, and automation are
  never blocked — only moves. WIP limits survive a column rename.

### Added — Undo
- **Undo last change.** A command that reverses the most recent Power Pack
  frontmatter edit — a drag-to-move, reschedule, Gantt resize, inline edit,
  bulk edit, or a whole column rename across many notes — restoring the exact
  prior values. Multi-note operations undo as a single step.

### Added — Usability parity across views
- **Quick search on Calendar and Gantt.** The search box that filtered the
  Kanban now filters the Calendar and Gantt too (name, path, folder, tags).
- **Right-click menus on Calendar events and Gantt bars.** A keyboard/mouse
  action path that doesn't require dragging: reschedule / set start·end date via
  a prompt, plus open, open-to-the-right, edit a field, rename, and delete —
  the same actions the Kanban card menu offers.

### Fixed
- **Agenda means upcoming.** The Calendar agenda listed every dated note ever;
  it now shows today and forward, with a search-aware empty state.
- **Gantt progress accepts fractions.** A `progress` of `0.5` now fills a bar to
  50% (previously it read as 0.5%); both `0–1` fractions and `0–100` percentages
  work, clamped to 100.
- **Invalid dates are rejected.** Typing an impossible date (e.g. `2026-13-45`)
  into a reschedule/set-date prompt is refused instead of being written to
  frontmatter and silently dropped from the calendar.

### Internal
- New pure, unit-tested cores: `query/undo.ts` (invertible writes + a bounded,
  reentrant undo stack), `query/search.ts` (the shared row matcher), and
  `query/wip.ts` (limit math). The per-note actions (open / rename / delete /
  edit field) are hoisted into the shared `PowerPackView` base so all three
  views share one implementation.

## [1.7.0] - 2026-07-15

Makes the "automation" in the plugin's own description true, adds the missing
right-click actions, and rebuilds the engine room for speed and robustness.

### Added — Automation
- **Move Rules (premium).** When a card's trigger property *enters* a value
  (e.g. dragged into "Done"), run ordered frontmatter actions automatically:
  set a literal, set today / now, clear, toggle true/false, or copy another
  property. Rules only fire on a real transition, and automation writes never
  re-trigger another rule. Configure them in settings.
- **Bulk edit (free).** A **Bulk edit** button on the Kanban toolbar sets,
  clears, or toggles one property across every visible/filtered card in one
  pass, with a confirmation showing the count.

### Added — Right-click menus (free)
- **Card context menu.** Right-click a card for: open / open to the right,
  move to another column (which fires Move Rules), edit any card field, rename
  the note, and delete it (to trash, with confirmation).
- **Column context menu.** Right-click a column header to add a note, rename
  the column (rewrites the property on every note in it), set a color, or
  remove an empty column.

### Changed — Performance & robustness
- **Shared vault snapshot.** Views previously re-scanned every markdown file on
  every render *and* every search keystroke. There is now one cached snapshot,
  rebuilt only when the vault actually changes — search and metadata updates no
  longer walk the whole vault.
- **Debounced re-render.** A burst of vault writes now coalesces into a single
  re-render instead of one per changed note.
- **Transactional writes.** All frontmatter writes go through one hardened path:
  a failed write surfaces as a notice instead of an unhandled error, and the
  cache is refreshed so the board never shows stale state after an edit.

### Internal
- New `PowerPackView` base class removes the lifecycle/upgrade-notice
  duplication across the three views.
- New pure, unit-tested automation engine (`query/automation.ts`).
- Reduced-motion support and empty/upgrade-state polish.

## [1.6.0] - 2026-07-15

Premium stops being read-only. Every premium view can now write back to your
notes, and two quality-of-life upgrades land in the free tier.

### Added — Premium (interactive)
- **Calendar drag-to-reschedule.** Drag an event onto another day and the note's
  date property is rewritten (a time-of-day suffix on the original value is
  preserved). Same "drag = truth" model as the free Kanban board.
- **Create-on-day.** Hover a calendar day and hit **+** to create a note already
  dated to that day, in an optional configured folder.
- **Month / Week / Agenda modes.** Switch layouts from the toolbar; the choice is
  remembered. Week is a tall 7-day strip; Agenda is a chronological list grouped
  by day with a Today marker.
- **Color-by property + today highlight.** Tint events by any property's value
  (stable hue), and the current day is outlined.
- **Gantt drag-to-move and resize.** Drag a bar to shift its dates (start and end
  move together); drag its right edge to change the duration. Both write
  frontmatter. A tiny drag still counts as a click that opens the note.
- **Gantt zoom, scroll-to-today, progress & milestones.** Zoom the time scale
  (Quarter → Day), jump to today, fill bars by a `progress` property (0–100), and
  render notes flagged by a `milestone` property as diamonds. Month ticks label
  the axis.

### Added — Free (Lite)
- **Inline card edit.** Click a card's metadata field (due, priority, owner, …)
  to edit it in place; the parsed value is written to frontmatter (numbers stay
  numbers, `tags`-style fields become lists, an emptied field is removed).
- **Group-by picker in the board toolbar.** Re-group the board by any frontmatter
  property on the fly, without opening settings.

### Settings
- New premium settings: **Gantt progress property**, **Gantt milestone
  property**, **Calendar color property**, **Calendar quick-add folder**.

## [1.5.0] - 2026-07-14

### Added
- **Reorder columns by dragging their headers (free).** Grab a column header and
  drop it on another column to change the left-to-right order. The order is
  remembered per group-by property; columns you haven't placed keep their natural
  order after the ones you have. Card drag-and-drop (move a note between columns)
  is unaffected — the two drags are told apart by their payload.

## [1.4.0] - 2026-07-14

### Added
- **Add columns from the board (free).** A "+ Add column" tile creates a new
  empty, droppable column for the group-by property — so you can drag a card to
  a status no note has yet (e.g. move `status: open` → a freshly created `close`
  column). Added columns are remembered per group-by property; an empty one can
  be removed with its `×` (no notes are touched).
- **Color-coded columns and cards (free).** Each column and its cards take a
  stable color derived from the column value, so the board is scannable at a
  glance. Toggle with the new **Color columns** setting (on by default).

### Notes
- Drag-and-drop still writes the exact column label to frontmatter; the new
  add-column feature is what lets you introduce a status value that no note
  currently has.

## [1.3.0] - 2026-07-14

### Added
- **The free Kanban board is now a real working board, not just a read-only
  grouping.** All of the following are available in the Lite (free) tier:
  - **Quick filters** — a search box, a sort selector (name, due date, priority,
    recently changed, or default order), and a "hide done" toggle.
  - **Drag-and-drop** — drag a card between columns to update its grouped
    frontmatter property (written via `processFrontMatter`, so existing
    frontmatter is preserved).
  - **Quick add** — a `+` on each column header creates a note already assigned
    to that column, optionally in a configured folder.
  - **Card metadata lines** — configurable raw properties (default `due` and
    `priority`) shown on each card.
- Settings: **Card detail fields** and **Quick add folder** for the free Kanban.

### Fixed
- Quick-add column values are YAML-quoted, so column names containing `:`, `[`,
  `#`, etc. produce valid frontmatter.
- The Kanban search box keeps focus across re-renders (previously each keystroke
  rebuilt the view and dropped focus).
- Quick-add opens the new note in a new tab instead of replacing the board.

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

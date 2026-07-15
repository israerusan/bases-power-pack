# Changelog

All notable changes to Bases Power Pack are documented here. This project follows
[Semantic Versioning](https://semver.org/).

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

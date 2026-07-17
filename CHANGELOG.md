# Changelog

All notable changes to Bases Power Pack are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [1.11.0] - 2026-07-16

A **trust & everyday-speed** release, driven by a six-lens round-table critique
(product, architecture, design, competitive strategy, accessibility/mobile,
performance) converged over two rounds and then implemented as one deduplicated
scope: cheap high-trust correctness fixes plus the most-cited quality lifts.

### Added
- **Semantic card chips (free).** Known fields render as scannable chips instead
  of identical grey `key: value` lines: a **due pill** that turns red when
  overdue and amber when due within 2 days (muted on done cards), a **priority
  badge** for conventional values (high/medium/low, P1…, urgent — unrecognized
  values keep the stable per-value hue), and **tag pills**. Every chip keeps the
  same click-to-edit wiring and carries a meaningful aria-label.
- **Property-aware quick-search (free).** Search now understands `key:value`
  tokens — `priority:high`, `owner:sam`, `tag:blocked` — alongside plain words;
  tokens AND together (`owner:sam urgent`). Works identically in every view. A
  literal `foo:bar` string still matches as plain text.
- **Overdue surfacing (premium Calendar).** The Agenda gets an **Overdue**
  section (past-due notes were silently dropped from "Upcoming"), and events on
  past days are flagged with a red edge in Month/Week. The agenda "Today" marker
  no longer reuses the Lite tier badge.
- **Per-column roll-up chips (premium).** Your configured roll-ups now also
  compute per Kanban column ("Doing 6/8 · 21 pts"), so a WIP cap can be read by
  weight, not just card count.
- **Persistent board controls (free).** "Sort" and "Hide done" are remembered
  per group-by property across view reopens and restarts (they reset every
  session before).

### Fixed
- **Formula arithmetic is date/version-safe.** `due - 7` used to compute
  `2026 - 7 = 2019` and `"1.4.0" / 2` returned `0.7` (the lenient parse the 1.10
  comparison fix didn't reach). Now: date − date = whole-day difference,
  date ± N = a shifted date, and `-`, `*`, `/`, `%` on non-numeric values return
  null instead of garbage. A malformed number literal (`1.2.3`) is a parse error
  instead of a silent NaN.
- **Column rename is scoped to the board.** Renaming a Kanban column inside a
  filtered `.base` rewrote the group property on every matching note
  vault-wide — including notes the base excluded. It now targets the board's
  own rows and says explicitly when matching notes outside the filter are left
  unchanged.
- **WIP limits can't be bypassed by searching.** The badge and the block both
  counted the search-filtered board, so hiding cards with a search let a drop
  sneak past the cap. Both now count the column's true membership.
- **Kanban quick-add is guarded and instant.** A failed create surfaces as a
  Notice (was an unhandled rejection), and the new card appears in its column
  immediately instead of one debounce later (the metadata cache hadn't indexed
  the new file yet).
- **Gantt keyboard scheduling isn't single-shot.** Arrow-moving a bar re-focuses
  it after the re-render (focus used to drop to the body after the first press),
  and **milestones are keyboard-operable** (they were mouse-only). A latent
  argument-limit crash on very large timelines removed.

### Performance
- **Per-file snapshot patching.** A frontmatter write (drag, inline edit, bulk
  op) now rebuilds only that note's snapshot entry; previously every write —
  including the plugin's own — invalidated the whole vault snapshot and
  re-scanned every markdown file before repaint.

### UI
- Toolbars wrap instead of clipping in narrow panes; the search box flexes; the
  calendar period label no longer reserves a fixed 140px.
- Comfortable touch targets (≥40px) for segmented buttons and calendar
  navigation on coarse pointers; chip states re-expressed under forced-colors.

## [1.10.0] - 2026-07-16

A polish release focused on **touch, keyboard access, and correctness**, driven
by a multi-agent audit across performance, UI, UX, maintainability,
accessibility, mobile, and robustness — then a second adversarial pass to catch
regressions.

### Added — Touch & keyboard access
- **Works on mobile now.** Every card, calendar event, Gantt bar, and Outline
  row has a persistent **⋯ menu button** that reaches its full action set (move,
  reschedule, set start/end date, set parent, edit, rename, delete) by tap —
  previously these lived only behind HTML5 drag and right-click, both dead on
  touch. Bigger touch targets, an always-visible calendar **+**, and a wider
  Gantt resize handle on coarse pointers.
- **Keyboard operable.** Cards/events/bars/rows are focusable: Enter opens,
  Shift+F10 / Menu opens actions. The **Outline is a real tree** (arrow keys to
  navigate, expand/collapse, `role=tree`/`aria-expanded`). Gantt bars move/resize
  with the arrow keys; Kanban columns reorder from the column menu.
- **Undo button.** Each view toolbar shows an **Undo** button (with the exact
  action in its tooltip) when there's something to undo — undo was previously
  only a hidden command.

### Added — UI & settings
- Focus rings throughout, a **high-contrast / forced-colors** fallback, and
  theme-consistent colors (calendar hues now match the board; the Gantt grip is
  visible in dark themes).
- A configurable **Done value** (so "Hide done" and Outline progress work for
  boards whose terminal column is "Complete", "Shipped", etc.).
- Premium settings grouped under **Calendar / Gantt / Outline** sub-headings; a
  confirmation before a bulk column rename.

### Fixed
- **Date & version comparisons were wrong.** `due >= "2026-06-01"` matched
  January and `due == today` matched any date that year, because numeric-leading
  strings were compared by their leading number. Dates/versions now compare
  correctly; `"50%"`-style values still order numerically.
- A single far-future date no longer renders a Gantt bar thousands of pixels off
  the timeline (it's reported as "outside the visible range").
- Search no longer jumps the caret to the end on every keystroke or breaks
  mobile/CJK input; it's debounced.
- A background vault change can no longer wipe an in-progress inline edit or drag
  (and can no longer leave auto-refresh frozen).
- Four view-driving settings are now type-sanitized on load; undo reports when a
  note can't be restored because it moved.

### Internal
- The resolve pipeline is memoized (no per-keystroke `.base` re-read / Row
  rebuild); the search + focus-restore logic is hoisted into `PowerPackView`;
  new `dnd.ts` (drag MIME constants) and an Obsidian `App.setting` type
  augmentation; expanded pure-core tests (date/unit compare, Gantt off-axis).

## [1.9.0] - 2026-07-16

Adds the one axis the product was missing: **structure**. Status (Kanban), time
(Calendar), and duration (Gantt) were covered; now notes can nest.

### Added — Outline / hierarchy view (Premium)
- **A new tree view.** Link notes with a `parent` frontmatter property holding
  the parent note's path, and the Outline view renders the whole forest as an
  indented, collapsible tree (Month/Week/Agenda-style toolbar with search,
  expand-all / collapse-all).
- **Branch roll-ups.** Every parent shows a descendant count and a
  **done / total** progress bar rolled up over its leaf tasks.
- **Drag to reparent.** Drag a row onto another to nest it, or onto the top
  strip to detach it — all undoable. Right-click to add a child note, set or
  clear the parent, and the shared open / rename / delete actions.
- **Safe by construction.** Parent cycles and dangling parent paths are flagged
  and quarantined instead of crashing; a parent filtered out of the current view
  appears as a faint placeholder so its children stay nested; validation runs
  against the whole vault so a move can never create a hidden cycle.
- **Rename-safe.** Renaming or moving a parent note automatically repoints every
  child that referenced it, as a single undo step (rename events are coalesced,
  so moving a folder is one pass, not one per file).
- New settings: Outline parent property, optional sibling-order property, and a
  quick-add folder.

### Internal
- New pure, unit-tested core `query/hierarchy.ts` (forest build with cycle /
  missing / ghost handling, flatten-by-expansion, branch metrics, reparent
  validation, rename retarget), exercised by ~30 new assertions.

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

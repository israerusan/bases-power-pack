# Bases Power Pack

**Run real Kanban, Calendar, and Gantt boards that write straight back to your notes — no Dataview, no cloud, no account.**

Most Bases boards only *display* your notes. Bases Power Pack **writes the changes back**: drag a card, reschedule a date, resize a timeline bar — the note's frontmatter updates. Offline, in Markdown, with real planning views on top.

![Move a card across columns and reorder it in one gesture](docs/assets/hero-drag.gif)

### Get Premium — **$29 one-time**, not a subscription

[**Unlock Bases Power Pack Premium →**](https://buymeacoffee.com/vaultspotlight/e/560211)

Paste the key → **unlocks instantly, offline.** No account, no server. The free Lite tier is a fully usable Kanban board — try it first.

<!-- SOCIAL PROOF SLOT — add 2–3 short, real user quotes (or a "used by N people" line) here the moment you have them.
     One real quote beats zero. Do NOT ship placeholder or invented quotes — an empty marker is better than fake proof.
     Example once real:
     > "Replaced three Dataview dashboards with one board that actually updates my notes." — @handle -->

## Lite (free) vs Premium

Most Bases boards only display. This one writes your changes back, stays offline, and adds the planning views Bases doesn't ship.

| Capability | Lite (free) | Premium |
| --- | :---: | :---: |
| Real Kanban board for Bases / frontmatter notes | ✅ | ✅ |
| Drag cards across columns and reorder them manually | ✅ | ✅ |
| Quick add, inline edit, bulk edit, search, export to Markdown | ✅ | ✅ |
| Swimlanes, WIP limits, multi-select moves, touch + keyboard moves | ✅ | ✅ |
| Calendar + Gantt planning views | — | ✅ |
| Dashboard + Pivot + Gallery + Feed views | — | ✅ |
| Formulas, roll-ups, saved filters, `.base`-driven workflows | — | ✅ |
| Move Rules automation, CSV export, color rules | — | ✅ |
| Board Analytics | — | ✅ |

[**Get Premium — $29 one-time →**](https://buymeacoffee.com/vaultspotlight/e/560211) · Paste the key → unlocks instantly, offline.

---

## Premium: turn your vault into a lightweight project system

**Turn your vault into a lightweight project system — without leaving Markdown.** You already keep the work in notes; Premium gives you the boards, timelines, and dashboards to actually run it. The views below are the proof:

- **Calendar & Gantt** — schedule and plan on a real timeline; drag events to reschedule, drag bars to move or resize work against milestones. Every change writes back to the note.
- **Dashboard & Analytics** — KPI cards, distribution charts, throughput, workload, and aging work — the management questions answered without exporting your vault into some other analytics tool.
- **Formulas, roll-ups & saved filters** — compute across your notes and save the views you reopen every day.
- **Automation** — Move Rules, rule-based color coding, and `.base`-driven workflows so the board maintains itself.
- **Pivot, Gallery & Feed** — cross-tabulate like a spreadsheet, browse as a visual grid, or read a reverse-chronological stream.

![Gantt timeline with draggable planning bars](docs/assets/gantt-premium.png)

_Gantt turns your notes into a real timeline: drag bars to move work, resize them to change duration, and plan against milestones._

![Dashboard with KPI cards and distribution chart](docs/assets/dashboard-premium.png)

_Dashboard gives you KPI cards and visual distribution without exporting your vault into some other analytics toy._

![Board analytics modal with throughput and workload breakdowns](docs/assets/analytics-premium.png)

_Analytics makes the board answer the obvious management questions: throughput, workload, bottlenecks, and what is aging badly._

![Move a card from Review to Done in one motion](docs/assets/review-to-done.gif)

_Move work cleanly from Review to Done without opening a note or babysitting frontmatter._

### Get Premium — $29 one-time

[**Unlock Bases Power Pack Premium →**](https://buymeacoffee.com/vaultspotlight/e/560211) · one-time, no subscription.

1. Purchase via [Buy Me a Coffee](https://buymeacoffee.com/vaultspotlight/e/560211) ($29 one-time).
2. Your license key is emailed to you **automatically, within seconds** — delivery is fully automated, no waiting.
3. **Paste the key → unlocks instantly, offline.** (Settings → Bases Power Pack → License.) No account, no always-on server, no mandatory cloud.

---

## All views at a glance

- **Kanban** — group work by a property like `status`, drag cards, reorder them, and edit metadata in place.
- **Calendar** — see work by day/week/month and drag events to reschedule them.
- **Gantt** — plan spans and milestones on a timeline; drag bars to move or resize them.
- **Outline** — turn parent/child notes into a real hierarchy with progress roll-ups.
- **Pivot** — cross-tabulate rows × columns like a lightweight spreadsheet.
- **Dashboard** — KPI cards and distribution charts over your current dataset.
- **Gallery** — visual card grid with cover images and metadata pills.
- **Feed** — reverse-chronological stream grouped by day, week, or month.
- **Analytics** — a premium board analytics modal for throughput, workload, bottlenecks, and aging work.

## 2-minute quick start

1. Run **Open Kanban view (Lite)** from the command palette or click the ribbon icon.
2. Add a property like `status: To Do` to a few notes.
3. Drag a card to another column and watch the note update.
4. Click **⋯** on a card to edit, rename, move, or delete.
5. Use **search** to narrow the board and **Export** to copy it out.
6. If you want planning views, analytics, and database-style workflows, unlock Premium.

## Commands

Available from the command palette:

- **Open Kanban view (Lite)**
- **Open Calendar view (Premium)**
- **Open Gantt view (Premium)**
- **Open Outline view (Premium)**
- **Open Pivot view (Premium)**
- **Open Dashboard view (Premium)**
- **Open Gallery view (Premium)**
- **Open Feed view (Premium)**
- **Undo last change**
- **Verify license key**

Premium view commands are always visible. If you have not unlocked Premium yet, they open an in-view unlock screen rather than quietly vanishing from the palette.

## Install into a vault for testing

Copy these three files into:

```text
<your-vault>/.obsidian/plugins/bases-power-pack/
```

Files:

```text
main.js
manifest.json
styles.css
```

Then enable **Bases Power Pack** in **Settings → Community plugins**.

## Build

```bash
npm install
npm run build
npm run dev
npm run typecheck
npm test
```

`npm run build` produces `main.js` in the project root alongside `manifest.json` and `styles.css`.

## License

MIT for the source code. Premium feature access is governed by a signed license key.

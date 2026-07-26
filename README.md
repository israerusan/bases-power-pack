# Bases Power Pack

_Stop babysitting YAML — run your projects from a board, calendar, and timeline that write straight back to your notes._

Turn Obsidian **Bases** into a real planning workspace: a genuinely useful free Kanban board, plus premium Calendar, Gantt, Dashboard, Gallery, Pivot, Feed, formulas, roll-ups, saved filters, and automation.

> **Start free. Upgrade once.** Bases Power Pack has a free Lite tier, and Premium unlocks with a **$29 one-time** license.

[Buy Premium / purchase info](#buy-premium) · [See premium views](#premium-views) · [Compare Lite vs Premium](#what-you-get)

## See it in action

![Move a card across columns and reorder it in one gesture](docs/assets/hero-drag.gif)

_Move a card across columns and reorder it in one gesture._

![Move a card from Review to Done in one motion](docs/assets/review-to-done.gif)

_Move work cleanly from Review to Done without opening a note or babysitting frontmatter._

## Premium views

![Gantt timeline with draggable planning bars](docs/assets/gantt-premium.png)

_Gantt turns your notes into a real timeline: drag bars to move work, resize them to change duration, and plan against milestones._

![Dashboard with KPI cards and distribution chart](docs/assets/dashboard-premium.png)

_Dashboard gives you KPI cards and visual distribution without exporting your vault into some other analytics toy._

![Board analytics modal with throughput and workload breakdowns](docs/assets/analytics-premium.png)

_Analytics makes the board answer the obvious management questions: throughput, workload, bottlenecks, and what is aging badly._

## Why people buy it

- **The free tier is actually useful.** You get a real Kanban board, not a bait-and-switch demo.
- **It writes back to your notes.** Drag a card, reschedule a date, resize a timeline bar — the frontmatter updates.
- **It reduces note janitor work.** Inline edits, bulk edit, search, saved filters, and automation keep you in the workflow instead of babysitting YAML.
- **Premium adds planning depth, not filler.** Calendar, Gantt, Dashboard, Gallery, Pivot, Feed, formulas, roll-ups, and `.base` workflows are the upgrade story.
- **It stays local-friendly.** No account and no mandatory cloud dependency just to unlock what you bought.

## What you get

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

**Lite** is a fully usable Kanban board you can live in for free. **Premium** adds the planning, analytics, and database-style workflows for people running real projects out of their vault.

Purchase: [Buy Me a Coffee — Bases Power Pack Premium](https://buymeacoffee.com/vaultspotlight/e/560211). License keys are verified **offline** (Ed25519) — no account, server, or subscription.

### Activate Premium

1. Purchase via [Buy Me a Coffee](https://buymeacoffee.com/vaultspotlight/e/560211) ($29 one-time).
2. Your license key is emailed to you **automatically, within seconds** — delivery is fully automated, no waiting.
3. Paste it into **Settings → Bases Power Pack → License** — it unlocks instantly, offline.

## Views at a glance

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

## Buy Premium

Premium is a **one-time unlock**, not a subscription.

Current purchase info:
- Buy/start here: https://buymeacoffee.com/vaultspotlight/e/560211
- Author profile: https://github.com/israerusan
- Already purchased? Paste your key into **Settings → Bases Power Pack → License**

Premium unlocks:
- Calendar, Gantt, Outline, Pivot, Dashboard, Gallery, and Feed views
- Analytics, formulas, roll-ups, saved filters, and `.base`-driven workflows
- Move Rules automation, CSV export, and rule-based color coding

Your key is verified **offline**. No account, no always-on server, no mandatory cloud dependency.

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

Premium view commands are always visible. If you have not unlocked Premium yet, they open an in-view unlock screen instead of disappearing like cowards.

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

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal static site (repo `BarettMac.github.io`, served at `https://barettmac.github.io/`) built with **Eleventy** and deployed to GitHub Pages via GitHub Actions. It's the first client site of an eventual small multi-client "financial planning portal" (joke-branded "MacLeod Financial Associates") — the current content is a retirement-withdrawal dashboard for the site owner's parents, living at `/parents/`. The bare domain root is a redirect stub to `/parents/`, kept separate so a real landing page can replace it later without disturbing the parents' site or its already-shared URL.

## Commands

- `npm run dev` — Eleventy dev server with live reload (`npx eleventy --serve`), default `http://localhost:8080/`.
- `npm run build` — one-off build to `_site/` (`npx eleventy`).
- `npm test` — Playwright suite, run against a built+served copy of the site (the config's `webServer` builds and serves automatically — no need to run `dev`/`build` first). `npm run test:headed` / `npm run test:ui` for interactive runs.
- Node 24 and Python 3.13 are both installed system-wide (via winget). No environment-specific PATH workarounds should be needed in a fresh terminal.

**Playwright + Eleventy dev server gotcha:** Eleventy's dev server does not handle concurrent connections well — multiple parallel Playwright workers hitting it at once cause page loads to hang/timeout. `playwright.config.js` intentionally sets `fullyParallel: false` / `workers: 1` to work around this. Don't "fix" this back to parallel without re-testing; it will reintroduce flaky timeouts.

## Deployment

`.github/workflows/deploy.yml` builds with Eleventy and publishes `_site/` via `actions/deploy-pages` on every push to `main`. This requires the repo's **Settings → Pages → Source** to be set to "GitHub Actions" (a one-time manual step in the GitHub web UI — not scriptable, `gh` CLI isn't available in this environment). Pushing to `main` is still what publishes the site, but now via a build, not a raw file copy — a broken build blocks the deploy (visible as a failed check in the Actions tab) rather than silently shipping something stale.

## Architecture

```
.eleventy.js                    # config: passthrough copy, dir mapping, toJSON filter
static-root/index.html          # root redirect stub -> /parents/ (untouched by Eleventy templating)
src/
  _includes/layouts/
    base.njk                    # <html> shell: theme-init script, token/site CSS links
    plan.njk                    # layout: layouts/base.njk; adds the sidebar shell
  _includes/partials/
    nav.njk                     # sidebar <nav>, loops {client}.nav data, active-link highlighting
  _data/parents/
    nav.json                    # [{title, url}] sidebar entries -> exposed as `parents.nav`
    planData.json                # dashboard's embedded dataset -> exposed as `parents.planData`
  assets/css/
    tokens.css                  # :root / :root[data-theme="dark"] custom properties only
    site.css                    # everything else — components, layout, sidebar/mobile nav
  assets/js/
    dashboard.js                # chart engine (see below) — only loaded on pages that use it
    theme.js                    # theme-toggle button + localStorage persistence, loaded on every page
  parents/
    parents.json                 # directory data: {"layout":"layouts/plan.njk","client":"parents"}
    index.njk                    # the dashboard -> /parents/
    plan-overview.njk            # placeholder page (real content pending PDF review)
```

**Per-client pattern:** `src/parents/parents.json` is an Eleventy *directory data file* — every template under `src/parents/**` automatically inherits `layout: layouts/plan.njk` and `client: parents` without repeating front matter. `_data/parents/*.json` files are namespaced by Eleventy's directory-based global data merging, so `_data/parents/nav.json` becomes `parents.nav` in any template. Adding a second client later means: a new `src/<client>/<client>.json` + `src/_data/<client>/{nav,planData}.json` — nothing shared (layouts, CSS, theme.js) needs to change.

**Plan data is embedded at build time, not fetched at runtime.** `index.njk` does `<script id="planData" type="application/json">{{ parents.planData | toJSON | safe }}</script>`, and `dashboard.js` still does `JSON.parse(document.getElementById('planData').textContent)` exactly as before. This avoids the CORS-on-`file://` failure mode a runtime `fetch()` would hit and keeps each built page self-contained. Regenerating data means editing `src/_data/parents/planData.json` and rebuilding — there's no live-editing use case here.

**`dashboard.js` (the chart engine)** — no framework, no chart library, moved essentially unchanged from the original single-file site:
- `RAW` = the parsed JSON; `D` = whichever of `RAW.nominal` / `RAW.real` is currently active. Toggling currency reassigns `D = RAW[state.currency]` and calls `renderAll()` — every render function (`renderTiles`, `stacked`, `rateChart`, `tableView`) reads from the global `D`, not a passed-in dataset, so don't refactor these to take `D` as a parameter without updating all call sites.
- `state` holds the current UI selection (currency, year range, grouped/detailed, per-series legend on/off). `renderAll()` re-derives everything from `state` + `D` on every change — no incremental update path.
- Charts are hand-rolled inline SVG (`el()` builds elements via `createElementNS`). `stacked()` handles both the stacked-area chart (portfolio value) and stacked-bar charts (withdrawals, expenses) via `opts.mode`. `rateChart()` is a one-off for the single-series withdrawal-rate bars.
- The 2046 withdrawal-rate gap: ProjectionLab's export reports 0% for 2046 despite a nonzero withdrawal that year. `rateComputed`/`rateEstimated` (computed once per currency mode at load) backfill it from `withdrawalTotal[i] / portfolioTotal[i-1]` and flag it as estimated (footnoted with `*`). Preserve this when regenerating data.
- All colors are read from CSS custom properties via `cv('--token')` — never hardcode a color in this file; add/change colors in `tokens.css` instead.
- **Only loaded on pages that use it** (currently just `parents/index.njk`, via a page-level `<script src="/assets/js/dashboard.js" defer>`) — it assumes `#tiles`, `#plot-*`, etc. exist in the DOM and will throw on a page without them. Don't move its `<script>` tag into a shared layout.

**`theme.js` (shared, every page)** — button toggle + `localStorage` persistence, so dark mode survives navigating between sidebar pages (a real gap in the original single-page version, fixed during the multi-page migration). It doesn't know about charts; on toggle it dispatches a `themechange` DOM event, and `dashboard.js` listens for that event to call `renderAll()` (charts need to redraw with fresh `getComputedStyle` colors). The inline script at the top of `base.njk`'s `<head>` applies a saved theme *before first paint* to avoid a flash of the wrong theme — keep that script inline and early, don't move it into `theme.js` itself (it has to run before the CSS renders, `defer`red external scripts run too late for that).

## Data pipeline: ProjectionLab CSV → `src/_data/parents/planData.json`

Source-of-truth exports from ProjectionLab live under `Excel Files/Nominal/` and `Excel Files/Real/` (Real = ProjectionLab's "Today's Currency"/inflation-adjusted display mode; Nominal = "Actual Currency"). Each currency has three CSVs: `*-all-accounts.csv`, `*-withdrawals-breakdown.csv`, `*-expenses-breakdown.csv`. Column layout is identical between Nominal and Real, just the numbers differ.

ProjectionLab also has a Plugin API (`window.projectionlabPluginAPI`, browser-only, needs Premium + a Plugin API Key) that could pull data live via `exportData()`. It's not used here — it's injected into an authenticated browser tab, not a REST endpoint reachable from a script — so manual CSV export/re-splice remains the path unless a browser-automation tool is introduced.

There is **no automated build** that regenerates `planData.json` from these CSVs — updating the data means re-running (or rewriting) a one-off PowerShell conversion. It should now write straight to `src/_data/parents/planData.json` (a plain JSON file), not splice into HTML. Non-obvious quirks to preserve if you write that script again:

- Each `*-all-accounts.csv` has a duplicate first data row (starting balances before that year's activity) — skip row 0 of the data rows, not the header.
- The header line isn't always on the same line number between exports (varies by a blank-line preamble) — find it by scanning for the line starting with `Year,`, don't assume a fixed offset.
- Column → series name renames used in the JSON: `Aub - TD Taxable` → `Aubrey non-registered`, `Darla - TD Taxable` → `Darla non-registered`, `Darla - EQ GICs` → `Darla GICs`. The detailed `Cash savings` series is `Savings + Savings [Auto-Created]` summed (withdrawals-side `Cash savings` is just `Savings [Auto-Created]` alone, not summed).
- `grouped` series are sums of `detailed` series, not separate CSV columns:
  - Accounts: `TFSAs (tax-free)` = Aubrey TFSA + Darla TFSA; `RRSPs (taxed on withdrawal)` = Aubrey RRSP + Darla RRSP; `Non-registered & GICs` = Aubrey non-registered + Darla non-registered + Darla GICs; `Cash savings` as above.
  - Withdrawals: same account grouping, but RRSP grouping is the `RMD:` columns.
  - Expenses: `Travel & fun` = Camping and Other Fun + Extra Travel + Trip to Spain; `Vehicles` = New Car + Second Vehicle Annual + New (Used) Truck; `Inflation shocks` = Price Shock + Price Shock #2 + Price Shock #3; `Everyday living`/`Extra living`/`Tax payments` map 1:1 to their CSV columns.
  - `portfolioTotal[year]` = sum of that year's `accounts.grouped` values (not a separate CSV column).
- `withdrawalRate` is identical between Nominal and Real (it's a ratio, inflation cancels out) — if regenerated values diverge, something's wrong in the conversion.

## `PDFs/`

`PDFs/Mom and Dad's Financial Plan - 2026.pdf` is a source document (the parents' full advisor-prepared financial plan) used to inform page copy — it is **intentionally untracked** (`.gitignore`d), not just missing from git by accident. This repo is public; the PDF likely contains more raw personal detail (full names, addresses, account numbers) than the curated dashboard figures do. Don't `git add` it. Pulling content *from* it into a page (reworded, hand-picked) is fine; committing the file itself is not.

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

`.github/workflows/deploy.yml` builds with Eleventy, encrypts the `/parents/` pages (see below), and publishes `_site/` via `actions/deploy-pages` on every push to `main`. This requires the repo's **Settings → Pages → Source** to be set to "GitHub Actions" (a one-time manual step in the GitHub web UI — not scriptable, `gh` CLI isn't available in this environment). Pushing to `main` is still what publishes the site, but now via a build, not a raw file copy — a broken build blocks the deploy (visible as a failed check in the Actions tab) rather than silently shipping something stale.

## Access protection

The site's source repo is public and GitHub Pages doesn't support private sites for personal (non-Enterprise) accounts — a private repo would hide the *source*, not the *published page*. Two independent layers compensate:

- **`noindex` + `robots.txt`:** `base.njk` sets `<meta name="robots" content="noindex, nofollow">` on every page (also added directly to `static-root/index.html`, which bypasses that layout), and `static-root/robots.txt` disallows all crawlers. This only stops search-engine indexing/crawling — it does nothing against someone who already has the URL.
- **StaticCrypt (`npm run encrypt`):** encrypts the built `/parents/**` HTML with AES, gated behind a shared passphrase entered in-browser, so the actual financial content isn't readable by URL alone. Only runs in `.github/workflows/deploy.yml`, as a step *after* `npx eleventy` and *before* the Pages upload — never part of `npm run build`/`dev`/`test`, since Playwright and local dev need to read/interact with real (unencrypted) markup.
  - The passphrase is supplied via the `STATICRYPT_PASSWORD` GitHub Actions secret (repo **Settings → Secrets and variables → Actions**) — never commit it in plaintext. StaticCrypt reads it from that env var automatically when no `-p` flag is passed.
  - The `--salt` value baked into the `encrypt` script in `package.json` is not secret (StaticCrypt's own docs: it's visible in the encrypted output regardless) — it's pinned to a fixed value so `--remember` persistence survives across redeploys; a random salt per build would invalidate everyone's "remembered" unlock on every push.
  - Only `_site/parents/**` is encrypted — the root redirect stub (`_site/index.html`) has no financial content and is left untouched so it doesn't force a second passphrase prompt before bouncing to `/parents/`.
  - `--remember 1` (1 day) was chosen over StaticCrypt's other options after finding it has no true "forget on tab close" mode — only "never remember" (re-prompts on every page, including just clicking between Dashboard and Plan overview) or "remember N days via localStorage." 1 day was the closest practical fit.

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
- **Pseudonyms, not the parents' real names:** the source CSV/JSON exports from ProjectionLab use the real names (`Aubrey`/`Aub`, `Darla`) since that's what's in the parents' actual ProjectionLab profiles — that's fine, those exports aren't rendered directly. But every series name written into `planData.json` (and any prose on the site, e.g. `plan-overview.njk`) MUST use the pseudonyms **Ray** (for Aubrey/Aub) and **Irene** (for Darla) instead. This repo is public, so the real names should never appear in anything actually built/served by Eleventy. When converting a fresh CSV export, rename during the conversion step, not after.
- Column → series name renames used in the JSON: `Aub - TD Taxable` → `Ray non-registered`, `Darla - TD Taxable` → `Irene non-registered`, `Darla - EQ GICs` → `Irene GICs`. The detailed `Cash savings` series is `Savings + Savings [Auto-Created]` summed (withdrawals-side `Cash savings` is just `Savings [Auto-Created]` alone, not summed).
- `grouped` series are sums of `detailed` series, not separate CSV columns:
  - Accounts: `TFSAs (tax-free)` = Ray TFSA + Irene TFSA; `RRSPs (taxed on withdrawal)` = Ray RRSP + Irene RRSP; `Non-registered & GICs` = Ray non-registered + Irene non-registered + Irene GICs; `Cash savings` as above.
  - Withdrawals: same account grouping, but RRSP grouping is the `RMD:` columns.
  - Expenses: `Travel & fun` = Camping and Other Fun + Extra Travel + Trip to Spain; `Vehicles` = New Car + Second Vehicle Annual + New (Used) Truck; `Inflation shocks` = Price Shock + Price Shock #2 + Price Shock #3; `Everyday living`/`Extra living`/`Tax payments` map 1:1 to their CSV columns.
  - `portfolioTotal[year]` = sum of that year's `accounts.grouped` values (not a separate CSV column).
- `withdrawalRate` is identical between Nominal and Real (it's a ratio, inflation cancels out) — if regenerated values diverge, something's wrong in the conversion.

## `PDFs/`, `Excel Files/`, `JSON Files/`

`PDFs/Mom and Dad's Financial Plan - 2026.pdf` is a source document (the parents' full advisor-prepared financial plan) used to inform page copy. `Excel Files/Nominal|Real/*.csv` and `JSON Files/Real/*.json` are the raw ProjectionLab exports described in the data pipeline section above — the source-of-truth for regenerating `planData.json`. All three are **intentionally untracked** (`.gitignore`d as of 2026-08-20; the Excel/JSON files were previously committed and were removed with `git rm --cached`, so old copies still exist in git history), not just missing by accident. This repo is public, and all of them carry more raw detail than the curated/pseudonymized dashboard figures do — the CSV/JSON exports still use the parents' real names (`Aub`/`Darla`), not the `Ray`/`Irene` pseudonyms used on the site (see the pipeline note above on why that's fine for these specific files but not for anything built). Don't `git add` any of them. Pulling data/content *from* them into the site (converted, reworded, hand-picked) is fine; committing the source files themselves is not.

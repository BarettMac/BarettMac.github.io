# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, single-page personal site (`index.html`) hosted on GitHub Pages (repo name `BarettMac.github.io`). There is no build step, no package manager, and no test framework — the page is plain HTML/CSS/vanilla JS in one file, deployed by pushing to `main`.

## Commands

There is nothing to install or build. To preview changes, open `index.html` directly in a browser, or serve the directory with any static file server. This environment has no Node or Python available (a `python.exe` App-Execution-Alias stub exists but does not run), so:

- For data munging (CSV parsing, JSON generation), use **PowerShell** (`Import-Csv`, `ConvertTo-Json`, etc.) — see `Excel Files/` workflow below.
- For visually verifying page changes, there's no `chromium-cli`/Playwright installed either. Use headless Microsoft Edge directly:
  ```
  msedge.exe --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --user-data-dir=<scratch dir> --window-size=1280,2600 \
    --screenshot=<out.png> "file:///C:/path/to/index.html"
  ```
  Use a Windows-style `file:///C:/...` URL (not a Git-Bash `/c/...` path) or Edge returns `ERR_FILE_NOT_FOUND`. A fresh `--user-data-dir` is required each run.

## Architecture of index.html

Everything lives in one file, in three parts:

1. **CSS** (`<style>`) — theming is done entirely via CSS custom properties on `:root` / `:root[data-theme="dark"]`, toggled by a JS button (`#theme`). All chart/UI colors reference `--s1`..`--s8` (series colors) or semantic tokens (`--text-primary`, `--muted`, `--grid`, etc.) — never hardcode colors in the SVG-drawing JS, read them via `cv('--token')`.

2. **Embedded data** (`<script id="planData" type="application/json">`) — a single JSON blob containing the entire dataset for the charts: `years`, plus a `nominal` and `real` sub-object (see "Nominal vs Real" below), each holding `accounts`, `withdrawals`, `expenses` (each split into `grouped`/`detailed` series), and top-level `withdrawalTotal`, `withdrawalRate`, `expenseTotal`, `portfolioTotal` arrays aligned to `years`. This is generated data, not hand-authored — see the CSV pipeline below before editing it directly.

3. **JS** (`<script>`, one IIFE) — no framework, no chart library. Key pieces:
   - `RAW` = the parsed JSON; `D` = whichever of `RAW.nominal` / `RAW.real` is currently active. Toggling currency just reassigns `D = RAW[state.currency]` and calls `renderAll()` — every render function (`renderTiles`, `stacked`, `rateChart`, `tableView`) reads from the global `D`, not from a passed-in dataset, so don't refactor these to take `D` as a parameter without updating all call sites.
   - `state` holds the current UI selection (currency, year range, grouped/detailed, per-series legend on/off). `renderAll()` re-derives everything from `state` + `D` — there's no incremental update path, every control change does a full re-render.
   - Charts are hand-rolled inline SVG (`el()` helper builds elements via `createElementNS`), not Canvas and not a charting library. `stacked()` handles both the stacked-area chart (portfolio value) and stacked-bar charts (withdrawals, expenses) via `opts.mode`. `rateChart()` is a separate one-off for the single-series withdrawal-rate bars.
   - The 2046 withdrawal-rate gap: ProjectionLab's export reports 0% withdrawal rate for 2046 despite a nonzero withdrawal that year. `rateComputed`/`rateEstimated` (computed once per currency mode at load, in the `['nominal','real'].forEach(...)` block) backfill it from `withdrawalTotal[i] / portfolioTotal[i-1]` and flag it as estimated (footnoted with `*` in the UI). Preserve this when regenerating data — don't assume the source CSV's `Withdrawal Rate` column is complete.

## Data pipeline: ProjectionLab CSV → embedded JSON

Source-of-truth exports from ProjectionLab live under `Excel Files/Nominal/` and `Excel Files/Real/` (Real = ProjectionLab's "Today's Currency"/inflation-adjusted display mode; Nominal = "Actual Currency"). Each currency has three CSVs: `*-all-accounts.csv`, `*-withdrawals-breakdown.csv`, `*-expenses-breakdown.csv`. Column layout is identical between Nominal and Real, just the numbers differ.

ProjectionLab also has a Plugin API (`window.projectionlabPluginAPI`, browser-only, needs Premium + a Plugin API Key) that could pull data live via `exportData()`. It's not used here — it's injected into an authenticated browser tab, not a REST endpoint reachable from a script — so manual CSV export/re-splice remains the path unless a browser-automation tool is introduced.

There is **no automated build** that regenerates `index.html`'s embedded JSON from these CSVs — updating the data means re-running (or rewriting) a one-off PowerShell conversion and re-splicing the JSON into the `#planData` script tag. Non-obvious quirks to preserve if you write that script again:

- Each `*-all-accounts.csv` has a duplicate first data row (starting balances before that year's activity) — skip row 0 of the data rows, not the header.
- The header line isn't always on the same line number between exports (varies by a blank-line preamble) — find it by scanning for the line starting with `Year,`, don't assume a fixed offset.
- Column → series name renames used in the embedded JSON: `Aub - TD Taxable` → `Aubrey non-registered`, `Darla - TD Taxable` → `Darla non-registered`, `Darla - EQ GICs` → `Darla GICs`. The detailed `Cash savings` series is `Savings + Savings [Auto-Created]` summed (withdrawals-side `Cash savings` is just `Savings [Auto-Created]` alone, not summed).
- `grouped` series are sums of `detailed` series, not separate CSV columns:
  - Accounts: `TFSAs (tax-free)` = Aubrey TFSA + Darla TFSA; `RRSPs (taxed on withdrawal)` = Aubrey RRSP + Darla RRSP; `Non-registered & GICs` = Aubrey non-registered + Darla non-registered + Darla GICs; `Cash savings` as above.
  - Withdrawals: same account grouping, but RRSP grouping is the `RMD:` columns.
  - Expenses: `Travel & fun` = Camping and Other Fun + Extra Travel + Trip to Spain; `Vehicles` = New Car + Second Vehicle Annual + New (Used) Truck; `Inflation shocks` = Price Shock + Price Shock #2 + Price Shock #3; `Everyday living`/`Extra living`/`Tax payments` map 1:1 to their CSV columns.
  - `portfolioTotal[year]` = sum of that year's `accounts.grouped` values (not a separate CSV column).
- `withdrawalRate` is identical between Nominal and Real (it's a ratio, inflation cancels out) — if regenerated values diverge, something's wrong in the conversion.

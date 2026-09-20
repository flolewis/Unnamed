# Courtside — NBA Season Lab

A sample 2026–27 NBA dashboard with 30 team profiles, current rosters, historical player statistics, transparent projections, and adjustable team-outlook scenarios.

## Data and model

- Free ESPN public endpoints; no paid subscription or API key.
- Browser refresh uses the public CORS-enabled feed, with a server-side fallback and dated bundled snapshots.
- Baseline: 2025–26 regular season. Player histories include up to three seasons.
- lib/nba-provider.mjs fetches and normalizes sources, including traded-player totals.
- lib/model.ts implements the documented model and bounded outcome distribution.
- The Sources & model view lists formulas, assumptions, timestamps, and limitations.
- Predictions are illustrative and uncalibrated. No paid projections, injury predictions, lineup-synergy metrics, or bookmaker odds are implied.

## Development

Requires Node 22.13+. Install with npm run install:ci, preview with npm run dev, and build with npm run build.

Refresh snapshots with node scripts/collect-nba.mjs followed by node scripts/index-snapshots.mjs.

Verify with node --experimental-strip-types scripts/verify-model.mjs and npx tsc --noEmit.

The build emits a Cloudflare-compatible Worker under dist/server and browser assets under dist/client. Sites identity is retained in .openai/hosting.json. No credentials are stored in source.

## Interaction

Choose any team, adjust availability/development/roster fit, set a good-season threshold, and inspect player forecasts versus actuals. Team selection resets scenario assumptions. The feature-detected configure_nba_outlook WebMCP tool shares the same state and validates its inputs.

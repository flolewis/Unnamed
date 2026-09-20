# Courtside — NBA Season Lab

A free-data NBA fantasy and team outlook site for 2026–27. ESPN supplies current rosters, historical player averages and standings. PBP Stats supplies 2025–26 pace and teammate on/off usage. Research snapshots are dated; the Refresh button updates ESPN inputs only.

## Model v2

- Separate fitted regressions for minutes, games played, and each per-minute counting statistic. Two-season weights, age effects, and small-sample shrinkage are selected using a time split.
- Editable roles, minutes, games, usage, and pace. Expected seasonal minutes cannot exceed 240 per team game. Unassigned minutes remain visible; missing rookie production is not fabricated.
- On/off absence scenarios for two returning leaders on every team. Measured usage changes shrink by minimum on/off minutes divided by that quantity plus 500 and cap at 20 percent. This is an exploratory association, not a causal or injury model.
- Team baseline regression uses prior win pace and two years of scoring margin. Edited roster production is mapped through the fitted margin coefficient; this translation remains experimental and does not measure player defensive impact.
- 2,000 seeded joint schedule simulations: 1,200 real published games plus 30 balanced within-conference placeholders. Each team plays 82 games and total league wins are 1,230 in every run. Home advantage and rest are not modeled.

## Evaluation and limits

Train outcomes through 2022; select parameters on 2023; evaluate once on 2024–2026. Production coefficients are refitted through 2026. The report exposes both gains and regressions against repeating last season, plus failed interval coverage. It is a component evaluation, not validation of edited rotations, current-roster adjustments, or final simulated probabilities.

The historical player cohort comes from current 2026 rosters, so retired players are missing and survivorship bias remains. Rates and minutes are conditional on a target-year appearance. No returned target season is treated as zero games for the games model. Ages are approximated by subtracting season differences from current age. These limitations preclude a claim of complete preseason validation.

Held-out fantasy FP/G MAE: 4.42 versus 4.51; team wins MAE: 9.41 versus 9.33. Final probabilities and sensitivity ranges are experimental, not calibrated or medical estimates.

## Reproduce

- `node scripts/collect-nba.mjs` and `node scripts/index-snapshots.mjs`: recent ESPN snapshots.
- `node scripts/collect-model-data.mjs`: historical current-cohort stats, 2015–2026 standings, 2026–27 schedule.
- `node scripts/train-model.mjs`: rebuild fitted model and report. The fit sees prior-season features only; parameter selection does not use held-out outcomes.
- `node scripts/collect-context.mjs` then `node scripts/refresh-onoff.mjs`: PBP Stats context; the second script retries missing snapshots slowly.
- `node --experimental-strip-types scripts/verify-model.mjs`: model budgets, bounded probabilities, joint league totals, scenario direction, overrides, missing history, trade deduplication.
- `node node_modules/typescript/bin/tsc --noEmit`: type check.
- `node scripts/run-framework.mjs build`: production build.

The deployed site uses the existing Sites project in `.openai/hosting.json`. No paid API keys are required. Public endpoints are unofficial integrations and may change.

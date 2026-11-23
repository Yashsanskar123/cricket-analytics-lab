# IPL Cricket Analytics — EDA Report

**Generated:** 2026-10-22

## 1. Project objective

Explore IPL match and ball-by-ball data to understand scoring trends,
team performance, batting, bowling, dismissals, toss decisions and venue patterns.

## 2. Dataset overview

- Matches in match-level dataset: 1,243
- Delivery records in phase-level dataset: 295,732
- Recorded dismissal events: 14,705

## 3. Key findings

### First-innings scoring
- Mean first-innings score: 168.57
- Median first-innings score: 168.00

### Innings phases
The phase analysis compares scoring rates during Powerplay, Middle and Death overs.
See `charts/team_phase_run_rates.png`.

### Batting
The batting leaderboard and consistency analysis compare run volume, strike rate
and variation in innings scores.

### Bowling
The bowling analysis compares wicket totals and economy rates, subject to the
dataset's coverage and the bowling metric definitions used.

### Dismissals
The dismissal analysis compares the frequency of caught, bowled, run out, LBW
and other recorded dismissal types.

### Toss and venues
These charts describe associations in the observed matches. They do not establish
that a toss decision or venue alone causes a match outcome or scoring difference.

## 4. Generated charts

- `charts/batters_runs_vs_strike_rate.png`
- `charts/batting_consistency.png`
- `charts/dismissal_types.png`
- `charts/first_innings_score_distribution.png`
- `charts/first_innings_scoring_trends.png`
- `charts/team_phase_run_rates.png`
- `charts/team_win_percentage.png`
- `charts/top_10_batters_by_runs.png`
- `charts/top_10_bowlers_by_economy.png`
- `charts/top_10_bowlers_by_wickets.png`
- `charts/toss_decision_analysis.png`
- `charts/venue_scoring_comparison.png`

## 5. Data limitations

- The season field currently uses calendar year as a proxy for IPL season.
- Historical team and venue aliases may be split across separate labels.
- Minimum sample thresholds affect which players, teams and venues are compared.
- Toss and venue comparisons are descriptive, not causal.
- Custom metrics must be documented and must not be presented as official metrics.
- Findings depend on the coverage and quality of the source data.

## 6. Next steps

1. Validate team and venue aliases.
2. Verify metric definitions and sample thresholds.
3. Add automated data-quality checks.
4. Review every chart and confirm its interpretation.
5. Export a final report after the findings have been validated.

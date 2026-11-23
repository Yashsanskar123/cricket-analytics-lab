# Notebook 03 v3: Results, systematically

Source: `notebooks/03_live_first_innings_prediction_v3.ipynb`. This report summarizes the saved notebook execution outputs; it does not rerun or modify the notebook.

## 1. Executive summary

| Question | Result |
|---|---|
| How much data was read? | 1,243 YAML match files parsed; 0 load errors. |
| How many matches were used to create model rows? | 1,215 complete first innings; 28 shortened/curtailed innings were excluded. |
| How many model rows were made? | 23,013 match-at-over snapshots, covering 1,215 matches. |
| How was evaluation split? | Rolling-origin validation for seasons 2021–2025; 2026 was held out for one final evaluation. |
| Validation size | 349 unique validation matches across the five seasons; each match remains wholly within its season's validation fold. |
| Final holdout size | 71 matches in 2026, or 1,345 snapshots. This is a small, one-season holdout. |
| Best validation model | Stage-wise (Ridge + Par), mean MAE 16.41 runs over overs 1–19. |
| 2026 holdout result | Stage-wise mean MAE 17.59 runs over overs 1–19. |
| Prediction-range result | The nominal 80% range covered 80.2% of validation snapshots and 76.2% of 2026 holdout snapshots. |

**MAE** is the average absolute difference between predicted and actual final score. For example, MAE 16 means predictions were off by about 16 runs on average. For the live models, each prediction uses the score and wickets known at the end of the stated over.

## 2. Cell-by-cell output inventory

Notebook has 28 cells. Markdown cells describe the method; code cells produce the corresponding results below. “No printed output” means the cell defines helpers or draws a chart rather than printing a numeric result.

| Cell | Type / purpose | Result recorded in the notebook |
|---:|---|---|
| 0 | Markdown: notebook overview | Explains that v3 cleans up v2; its main changes are a later stage cut, validation-based range scaling, and a 2026-only final holdout. |
| 1 | Code: imports and project setup | Found the project root and 1,243 YAML files. |
| 2 | Markdown: parsing section | Introduces first-innings ball-by-ball parsing. |
| 3 | Code: parse raw YAML | Parsed 1,243 matches; 0 load errors. |
| 4 | Code: filter and standardize venues | Excluded 28 shortened/curtailed first innings. Standardized venue labels from 60 raw names to 36. |
| 5 | Markdown: leak-safe context | Defines league and venue context using earlier match dates only. |
| 6 | Code: build prior context | Generated recent league average and era-adjusted venue context; displayed venue summaries and recent examples. |
| 7 | Markdown: build snapshots | Describes one row per match and completed over, with remaining runs as the target. |
| 8 | Code: create snapshots/features | Created 23,013 snapshots from 1,215 matches; displayed a sample of feature rows. |
| 9 | Markdown: leak tests | States that leakage checks must pass before trusting the models. |
| 10 | Code: run leak tests | All four checks passed: over features use only information available then; league/venue context uses earlier dates; same-day matches share the same prior; over-19 runs do not exceed the final score. |
| 11 | Markdown: models/split | Validation folds are 2021–2025; 2026 is reserved for the final holdout. |
| 12 | Code: define models and split | Development data: 21,668 snapshots. Holdout: 1,345 snapshots. Validation seasons: 2021, 2022, 2023, 2024, 2025. |
| 13 | Code: train and score validation folds | Printed MAE by over for the candidate models. Detailed comparisons are in sections 3 and 5 below. |
| 14 | Markdown: bootstrap method | Explains paired, match-level bootstrap comparisons with 2,000 resamples and 95% confidence intervals. |
| 15 | Code: define comparison helpers | No printed output; defines the paired comparison and bootstrap helper functions used later. |
| 16 | Markdown: stage-cut question | Introduces the validation-only test of whether Par should replace Ridge in late overs. |
| 17 | Code: test stage cut | Par was better than Ridge only at over 19: +2.35 runs, 95% CI [1.75, 2.93]. At overs 12–18 it was not better. |
| 18 | Code: compare pre-match baselines | On 349 validation matches: league average MAE 26.54; raw venue baseline 28.63; era-adjusted venue baseline 26.14. |
| 19 | Code: model ranking and paired comparisons | Stage-wise ranked first in validation (16.41 mean MAE). It beat plain Ridge by 0.12 runs on average (95% CI [0.09, 0.15]); overall gain is small. |
| 20 | Code: per-season/checkpoint detail | Shows the best model's MAE by validation season and bootstrap intervals at overs 1, 3, 6, 10, 15, and 18. |
| 21 | Code: plot error by over | Draws the chart; no additional printed metric. Error generally decreases as more of the innings is observed. |
| 22 | Markdown: prediction intervals | Explains how the nominal 80% score range is calibrated. |
| 23 | Code: choose interval calibration | Validation selected 2 calibration seasons and width scale 1.05. Pooled validation coverage: 80.2%; average range width: 52.8 runs. |
| 24 | Markdown: final holdout warning | Says 2026 is evaluated once and should not be reused to tune the model. |
| 25 | Code: evaluate 2026 holdout | 71 matches. Stage-wise mean MAE: 17.59; pooled 80% range coverage: 76.2%. See section 4. |
| 26 | Markdown: live-use instructions | Describes supplying cumulative runs, wickets, boundaries, and venue after each completed over. |
| 27 | Code: fit final live model/example | Example prediction: 202 runs, with an 80% range of 171–232. |

## 3. Validation: model MAE by over

These are rolling-origin validation seasons 2021–2025. Lower is better. Values are runs.

| End of over | Stage-wise Ridge + Par | Ridge | Ridge v1 features | Gradient boosting | Par table | Run rate × 20 |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 26.0 | 26.0 | 26.2 | 26.9 | 29.0 | 74.4 |
| 3 | 24.4 | 24.4 | 24.3 | 25.7 | 27.1 | 43.6 |
| 6 | 21.0 | 21.0 | 20.8 | 22.1 | 23.0 | 28.9 |
| 10 | 16.9 | 16.9 | 16.9 | 17.5 | 17.9 | 21.6 |
| 15 | 10.4 | 10.4 | 10.6 | 11.4 | 11.2 | 14.4 |
| 18 | 7.2 | 7.2 | 7.7 | 8.1 | 7.0 | 8.2 |
| **Mean, overs 1–19** | **16.41** | **16.53** | **16.59** | **17.32** | **17.72** | **26.00** |

At most displayed overs, Stage-wise and Ridge are identical: the Stage-wise model uses Par only at over 19. This explains why their overall difference is modest.

## 4. Final holdout: 2026 MAE by over

This season was not used to choose the model or its settings. It contains 71 matches. Lower MAE is better.

| End of over | Stage-wise Ridge + Par | Ridge | Ridge v1 features | Gradient boosting | Par table | Run rate × 20 |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 28.8 | 28.8 | 29.1 | 32.0 | 35.6 | 74.8 |
| 3 | 25.0 | 25.0 | 25.1 | 28.6 | 32.5 | 45.0 |
| 6 | 21.0 | 21.0 | 21.2 | 22.6 | 25.7 | 35.1 |
| 10 | 17.7 | 17.7 | 17.7 | 18.9 | 19.3 | 24.0 |
| 15 | 12.5 | 12.5 | 12.3 | 13.0 | 12.1 | 13.3 |
| 18 | 10.3 | 10.3 | 11.8 | 8.3 | 7.3 | 8.1 |
| **Mean, overs 1–19** | **17.59** | **17.81** | **18.05** | **18.92** | **19.87** | **27.40** |

The result is directionally similar to validation: the Stage-wise model has the lowest average across all overs, but its advantage over Ridge is only 0.22 runs on this small holdout. At over 18, Gradient boosting and Par are lower than Stage-wise; one checkpoint does not change the overall ranking.

## 5. Key paired comparisons and model choices

| Comparison | Validation result | Interpretation |
|---|---|---|
| Stage-wise vs Ridge, mean over overs | Gain 0.12 runs; 95% CI [0.09, 0.15] | Stage-wise is statistically better in this comparison, but the practical improvement is small. |
| Ridge vs Ridge with v1 features, mean over overs | Gain 0.07 runs; 95% CI [-0.03, 0.18] | No clear overall improvement from the extra v2 feature set; there is a gain at over 18. |
| Gradient boosting vs Ridge, mean over overs | Gain -0.77 runs; 95% CI [-1.42, -0.11] | Negative gain means Gradient boosting is worse; Ridge is better overall on validation. |
| Ridge vs Par table, mean over overs | Gain 1.15 runs; 95% CI [0.59, 1.68] | Ridge is better overall. |
| Par vs Ridge, over 19 | Gain 2.35 runs; 95% CI [1.75, 2.93] | Par is better only for the final over, supporting the stage cut at 18. |
| Era-adjusted venue baseline vs raw venue baseline | Gain 2.49 runs; 95% CI [1.26, 3.75] | Era adjustment improves on the raw historical venue average. |
| Era-adjusted venue baseline vs league-average-only | Gain 0.40 runs; 95% CI [-0.21, 1.01] | No clear improvement over league average alone. |

Positive “gain” means the named challenger reduces error compared with the reference. If the confidence interval crosses zero, the notebook labels the result as noise/not clearly different.

## 6. 80% prediction ranges

| Dataset / point in innings | Coverage | Average range width | Meaning |
|---|---:|---:|---|
| Validation, pooled across overs | 80.2% | 52.8 runs | Calibration target was 80%; selected using validation only. |
| 2026 holdout, pooled across overs | 76.2% | Not reported as one pooled width in the notebook output | The interval caught fewer than the intended 80% on this season. |

| End of over | Validation coverage | Validation average width | 2026 holdout coverage | 2026 average width |
|---:|---:|---:|---:|---:|
| 1 | 78% | 78.34 | 76% | 81.03 |
| 3 | 77% | 73.96 | 76% | 78.09 |
| 6 | 77% | 67.24 | 86% | 74.04 |
| 10 | 78% | 53.02 | 80% | 56.90 |
| 15 | 83% | 37.32 | 69% | 35.70 |
| 18 | 80% | 23.62 | 53% | 21.67 |

Coverage becomes less reliable in late overs on the small 2026 sample. Read the 2026 coverage as a warning/check, not a precise guarantee.

## 7. What to take away

1. **Live match state helps:** from over 1 to over 18, validation MAE for Stage-wise drops from about 26 to 7 runs. The model learns as actual runs and wickets arrive.
2. **The simple run-rate projection is poor early:** at over 1 it has MAE about 74 runs, versus about 26 for the learned models.
3. **Ridge is already strong:** Stage-wise improves mean validation MAE over Ridge by only 0.12 runs, because it changes the prediction only for over 19.
4. **The final-over switch has evidence:** validation says Par beats Ridge by about 2.35 runs at over 19, while it does not win at overs 12–18.
5. **2026 is a modest sanity check:** 71 matches; Stage-wise MAE is 17.59 over overs 1–19. The confidence from one season is limited.
6. **The interval is not perfectly calibrated on 2026:** 76.2% coverage versus the intended 80%, with particularly low coverage at overs 15 and 18.
7. **Do not compare MAE at different overs as if they were the same task:** over 1 predicts with very little live information; over 18 has nearly the whole innings available.

## 8. Version note

v3's own notebook says 2025–26 had already been used to make v1/v2 decisions. v3 therefore moves 2025 into validation and reserves 2026 as the final holdout. This is a cleaner test design, but 2026 is only one season and 71 matches. The v2 MAE values in the notebook's experiment log use older splits/settings and should not be directly compared with v3's rolling-origin results.

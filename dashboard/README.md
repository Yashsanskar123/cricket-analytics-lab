# Cricket Analytics Lab – dashboard

React + Recharts dashboard for your IPL notebooks 03–07. It reads JSON files that the notebooks write.

## 1. Folder layout

```
cricket-analytics-lab/
  data/raw/*.yaml            <- your 1,243 Cricsheet files (already there)
  notebooks/                 <- 01 … 07
  dashboard/                 <- THIS folder (unzip here)
    public/data/             <- notebooks write nb03.json … explorer.json here
    src/
```

## 2. Create the data (once, then whenever you re-run models)

Each notebook has a new last cell, "Export for the dashboard". Run these:

| Notebook | Writes | Time (approx) |
|---|---|---|
| 03_live_first_innings_prediction_v3 | nb03.json | run top to bottom, last cell is quick |
| 04_live_win_probability | nb04.json | same |
| 05_player_features_playing_xi | nb05.json | same |
| 06_whole_match_model_and_par_score | nb06.json | last cell builds the model grids, a few minutes |
| 07_dashboard_data_explorer | explorer.json | needs no model, quick |

Files go to `dashboard/public/data/` automatically.
To write somewhere else, set the environment variable `IPL_DASHBOARD_DATA` to that folder before starting Jupyter.

## 3. Run the dashboard

Needs Node 18+.

```
cd dashboard
npm install
npm run dev
```

It opens at http://localhost:5173. Open **Connect data** to see which files were found. After re-running a notebook, press **Re-read data folder**.

`npm run build` makes a static site in `dist/`.

## 4. No file system access? Drop files instead

On the Connect data screen you can drag the JSON files onto the page. They are stored in that browser.

## What each file feeds

- nb03: Score Engine
- nb04: Win Probability
- nb05: Player Impact
- nb06: Match Centre (real trained-model probabilities), Par Lab, Replays, Model Evidence, Overview
- explorer: Data Explorer

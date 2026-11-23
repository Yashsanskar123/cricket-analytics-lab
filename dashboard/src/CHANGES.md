# Dashboard update — what changed (nothing removed)

NEW files: ui.jsx, matchdata.js, selection.jsx, matchviews.jsx
EDITED: lib.js, main.jsx, style.css
All your original screens still exist (kept as tabs inside the pages).

## Data steps (once)
1. Run notebook 08_match_index_export.ipynb -> matches.json
2. Run paste cells at end of nb03, nb04, nb06 -> predictions.json
3. Copy the JSON into dashboard/public/data/ , open Connect data, press "Re-read data folder".
See DATA_CONTRACT.md for exact fields.

## Not done yet
Player Impact (needs players.json from notebook 05), Model Cards / Data & Method upgrades, ball-by-ball replays.

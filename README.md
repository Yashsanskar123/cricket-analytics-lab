# 🏏 Cricket Analytics Lab

An end-to-end IPL cricket analytics and machine learning project that transforms ball-by-ball match data into actionable cricket insights, predictive models, and interactive visualizations.

The project combines historical match analysis, innings score prediction, chase win probability, par-score estimation, and an interactive React dashboard.

## 📌 Project Overview

Cricket Analytics Lab explores IPL match data to understand team performance, match dynamics, scoring patterns, and predictive outcomes.

It brings together:
- Historical IPL data analysis.
- Machine learning models for innings and match prediction.
- Over-by-over win probability analysis.
- Par-score estimation for run chases.
- Interactive dashboard for exploring matches, teams, seasons, and model outputs.

## ✨ Key Features

### 1. Historical Match Analytics
- IPL match and innings statistics.
- Season-wise scoring trends.
- Team and venue analysis.
- Batting-first versus chasing performance.
- Match result and score distributions.

### 2. First-Innings Score Prediction
- Over-by-over first-innings score projections.
- Predicted final totals.
- Prediction intervals.
- Actual versus projected score analysis.

### 3. Live Win Probability
- Chase win probability estimation.
- Over-by-over probability tracking.
- Match turning-point identification.
- Comparison of model predictions with actual outcomes.

### 4. Par Score Engine
- Model-based par-score estimation during a chase.
- Actual score versus par comparison.
- Runs ahead or behind par.
- Required run rate and chase context.

### 5. Interactive Analytics Dashboard
The React dashboard provides dedicated sections for:

| Section | Functionality |
|---|---|
| Overview | IPL historical statistics |
| Match Centre | Selected-match scorecards and analytics |
| Par Lab | Par-score analysis |
| Replays | Over-by-over match replay |
| Score Engine | Actual versus projected scores |
| Win Probability | Match-level probability analysis |
| Model Evidence | Model evaluation and evidence |
| Player Impact | Player-related analysis |
| Data Explorer | Season, team, venue and match filters |
| Model Cards | Model documentation |
| Data & Method | Data and methodology information |
| Connect Data | Load and refresh dashboard datasets |

## 🧠 Machine Learning & Analytics

The project is organized into dedicated Jupyter notebooks:

| Notebook | Purpose |
|---|---|
| `03_live_first_innings_prediction_v3.ipynb` | First-innings live score prediction |
| `04_live_win_probability.ipynb` | Chase win probability modelling |
| `05_player_features_playing_xi.ipynb` | Player features and playing XI analysis |
| `06_whole_match_model_and_par_score.ipynb` | Whole-match modelling and par-score estimation |
| `07_dashboard_data_explorer.ipynb` | Historical analytics and dashboard exploration |
| `08_match_index_export.ipynb` | Historical match indexing and dashboard data export |

The modelling workflow distinguishes between training data, validation data, and holdout data to support more meaningful model evaluation.

## 🛠️ Technology Stack

**Programming & Analytics**
- Python
- Jupyter Notebook
- Pandas
- NumPy
- Scikit-learn

**Machine Learning**
- Classification and regression
- Probability modelling
- Model validation and evaluation
- Feature engineering

**Frontend & Visualization**
- React
- Vite
- JavaScript
- Recharts

**Data**
- Cricsheet IPL ball-by-ball match data
- YAML match files
- JSON dashboard exports

## 📂 Project Structure

```text
cricket-analytics-lab/
│
├── data/
│   ├── raw/
│   ├── cleaned/
│   └── processed/
│
├── notebooks/
│   ├── 03_live_first_innings_prediction_v3.ipynb
│   ├── 04_live_win_probability.ipynb
│   ├── 05_player_features_playing_xi.ipynb
│   ├── 06_whole_match_model_and_par_score.ipynb
│   ├── 07_dashboard_data_explorer.ipynb
│   └── 08_match_index_export.ipynb
│
├── dashboard/
│   ├── public/
│   │   └── data/
│   └── src/
│
├── docs/
├── src/
├── tests/
│
├── .gitignore
└── README.md
```

*The structure above is a high-level representation; individual folders may contain additional files.*

## 🚀 Getting Started

### Prerequisites

- Python 3.10+
- Node.js and npm
- Git
- Jupyter Notebook or JupyterLab

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/cricket-analytics-lab.git

cd cricket-analytics-lab
```

### 2. Set up the Python environment

```bash
python -m venv .venv
```

Activate the environment:

**Windows**

```powershell
.venv\Scripts\activate
```

Install the project's Python dependencies using its requirements file, if provided:

```bash
pip install -r requirements.txt
```

### 3. Run the notebooks

Open Jupyter:

```bash
jupyter notebook
```

Run the required notebooks and their export cells to generate the datasets consumed by the dashboard.

### 4. Run the dashboard

```bash
cd dashboard
npm install
npm run dev
```

Open the local URL displayed by Vite in your browser.

Use the **Connect Data** section to load or refresh the exported JSON datasets.

## 📊 Data & Methodology

The project uses ball-by-ball cricket data to construct innings-level and match-level analytical features.

The workflow includes:

1. Raw match data ingestion.
2. Data cleaning and preprocessing.
3. Match and innings feature engineering.
4. Model training and evaluation.
5. Historical match indexing.
6. JSON export for dashboard consumption.
7. Interactive visualization and analysis.

Model outputs should be interpreted in the context of their training, validation, and holdout splits. Predictions are not available for every historical match.




## 👨‍💻 Author

**Sanskar Sirvaiya**

Cricket Analytics | Data Science | Machine Learning | Sports Analytics

---

*Built to explore cricket through data, statistics, and machine learning.*

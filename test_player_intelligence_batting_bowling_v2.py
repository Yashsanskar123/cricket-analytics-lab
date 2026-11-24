import unittest

from player_intelligence_pipeline import (
    build_bowling_innings_rows,
    summarize_batting_innings,
    summarize_bowling_innings,
)


class CombinedBattingBowlingTests(unittest.TestCase):
    def setUp(self):
        self.registry = {"A Batter": "a", "B Batter": "b", "X Bowler": "x"}

    def test_bowling_innings_counts_legal_balls_and_charged_runs(self):
        innings = {"overs": [{"over": 0, "deliveries": [
            {"batter": "A Batter", "bowler": "X Bowler", "non_striker": "B Batter",
             "runs": {"batter": 1, "total": 1}},
            {"batter": "A Batter", "bowler": "X Bowler", "non_striker": "B Batter",
             "runs": {"batter": 0, "total": 1}, "extras": {"wides": 1}},
            {"batter": "A Batter", "bowler": "X Bowler", "non_striker": "B Batter",
             "runs": {"batter": 0, "total": 2}, "extras": {"byes": 2}},
            {"batter": "A Batter", "bowler": "X Bowler", "non_striker": "B Batter",
             "runs": {"batter": 0, "total": 0},
             "wickets": [{"kind": "bowled", "player_out": "A Batter"}]},
        ]}]}
        rows = build_bowling_innings_rows(
            innings, self.registry, "m1", "2025-04-01", 2025,
            "Ground", "Team B", "Team A", 1
        )
        row = rows[0]
        self.assertEqual(row["balls"], 3)
        self.assertEqual(row["runs_conceded"], 2)
        self.assertEqual(row["wickets"], 1)
        self.assertEqual(row["overs"], "0.3")

    def test_bowling_haul_and_best_figures_summary(self):
        rows = [
            {"balls": 24, "dots": 12, "runs_conceded": 20, "wickets": 4, "maidens": 1},
            {"balls": 18, "dots": 8, "runs_conceded": 25, "wickets": 2, "maidens": 0},
        ]
        summary = summarize_bowling_innings(rows)
        self.assertEqual(summary["wickets"], 6)
        self.assertEqual(summary["best_figures"], {"wickets": 4, "runs_conceded": 20})
        self.assertEqual(summary["four_wicket_hauls"], 1)
        self.assertEqual(summary["maidens"], 1)

    def test_batting_milestones_and_distribution(self):
        rows = [
            {"runs": 8, "status": "out"},
            {"runs": 35, "status": "not_out"},
            {"runs": 72, "status": "out"},
            {"runs": 101, "status": "not_out"},
        ]
        summary = summarize_batting_innings(rows)
        self.assertEqual(summary["highest_score"], 101)
        self.assertEqual(summary["thirties"], 1)
        self.assertEqual(summary["fifties"], 1)
        self.assertEqual(summary["hundreds"], 1)
        self.assertEqual(summary["not_out_innings"], 2)
        self.assertEqual(summary["scoring_distribution"]["0_9"], 1)

    def test_empty_summaries_are_safe(self):
        self.assertEqual(summarize_batting_innings([])["innings"], 0)
        self.assertEqual(summarize_bowling_innings([])["innings"], 0)


if __name__ == "__main__":
    unittest.main()

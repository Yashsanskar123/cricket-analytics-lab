import importlib.util
import unittest
from pathlib import Path

PIPELINE = Path(__file__).with_name("partnership_intelligence_pipeline.py")
spec = importlib.util.spec_from_file_location("partnership_pipeline_batch03", PIPELINE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class TeamOppositionIntelligenceTests(unittest.TestCase):
    def setUp(self):
        self.rows = [
            {"team":"Mumbai Indians", "opposition":"Chennai Super Kings", "season":2024,
             "match_id":"m1", "runs":60, "balls":40, "batter1_runs":30, "batter2_runs":25,
             "extras":5, "fours":6, "sixes":2, "dot_balls":12, "deliveries":42,
             "boundary_runs":36, "pair":"A & B", "ended_by_wicket":True, "team_won":True},
            {"team":"Mumbai Indians", "opposition":"Chennai Super Kings", "season":2024,
             "match_id":"m1", "runs":20, "balls":18, "batter1_runs":12, "batter2_runs":8,
             "extras":0, "fours":2, "sixes":0, "dot_balls":5, "deliveries":18,
             "boundary_runs":8, "pair":"C & D", "ended_by_wicket":False, "team_won":True},
            {"team":"Mumbai Indians", "opposition":"Royal Challengers Bengaluru", "season":2025,
             "match_id":"m2", "runs":40, "balls":30, "batter1_runs":35, "batter2_runs":5,
             "extras":0, "fours":4, "sixes":1, "dot_balls":8, "deliveries":30,
             "boundary_runs":22, "pair":"E & F", "ended_by_wicket":True, "team_won":False},
            {"team":"Chennai Super Kings", "opposition":"Mumbai Indians", "season":2024,
             "match_id":"m3", "runs":50, "balls":36, "batter1_runs":45, "batter2_runs":5,
             "extras":0, "fours":5, "sixes":1, "dot_balls":9, "deliveries":36,
             "boundary_runs":26, "pair":"G & H", "ended_by_wicket":True, "team_won":True},
        ]

    def test_team_rollup_distinct_matches_and_win_rate(self):
        rows = module.build_team_opposition_intelligence(self.rows)["team"]
        mi = next(x for x in rows if x["team"] == "Mumbai Indians")
        self.assertEqual(mi["partnerships"], 3)
        self.assertEqual(mi["matches"], 2)
        self.assertEqual(mi["runs"], 120)
        self.assertEqual(mi["wins"], 1)
        self.assertEqual(mi["win_rate_pct"], 50.0)
        self.assertEqual(mi["best_partnership"], 60)

    def test_season_rollup_separates_seasons(self):
        rows = module.build_team_opposition_intelligence(self.rows)["team_season"]
        mi24 = next(x for x in rows if x["team"] == "Mumbai Indians" and x["season"] == 2024)
        self.assertEqual(mi24["partnerships"], 2)
        self.assertEqual(mi24["runs"], 80)

    def test_opposition_is_directional(self):
        rows = module.build_team_opposition_intelligence(self.rows)["team_opposition"]
        mi_csk = next(x for x in rows if x["team"] == "Mumbai Indians" and x["opposition"] == "Chennai Super Kings")
        csk_mi = next(x for x in rows if x["team"] == "Chennai Super Kings" and x["opposition"] == "Mumbai Indians")
        self.assertEqual(mi_csk["runs"], 80)
        self.assertEqual(csk_mi["runs"], 50)

    def test_team_opposition_season_dimensions(self):
        rows = module.build_team_opposition_intelligence(self.rows)["team_opposition_season"]
        self.assertTrue(any(x["team"] == "Mumbai Indians" and x["opposition"] == "Royal Challengers Bengaluru" and x["season"] == 2025 for x in rows))

    def test_rates_and_contributions(self):
        rows = module.build_team_opposition_intelligence(self.rows)["team"]
        mi = next(x for x in rows if x["team"] == "Mumbai Indians")
        self.assertAlmostEqual(mi["run_rate"], 120 * 6 / 88, places=3)
        self.assertAlmostEqual(mi["batter_contribution_pct"], 115 * 100 / 120, places=2)
        self.assertAlmostEqual(mi["dot_ball_pct"], 25 * 100 / 90, places=2)


if __name__ == "__main__":
    unittest.main(verbosity=2)

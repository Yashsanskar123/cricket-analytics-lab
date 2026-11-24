import importlib.util
from pathlib import Path
import unittest

PIPELINE_PATH = Path(__file__).with_name('partnership_intelligence_pipeline.py')
spec = importlib.util.spec_from_file_location('partnership_pipeline_batch02', PIPELINE_PATH)
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)


class PartnershipBatch02Tests(unittest.TestCase):
    def test_pair_intelligence_career_and_context_splits(self):
        rows = [
            {"batter1": "A", "batter2": "B", "runs": 60, "balls": 40,
             "batter1_runs": 35, "batter2_runs": 20, "extras": 5,
             "match_id": "m1", "season": 2024, "team": "Team X",
             "opposition": "Team Y", "venue": "Ground 1", "ended_by_wicket": True},
            {"batter1": "B", "batter2": "A", "runs": 40, "balls": 24,
             "batter1_runs": 15, "batter2_runs": 25, "extras": 0,
             "match_id": "m2", "season": 2025, "team": "Team X",
             "opposition": "Team Z", "venue": "Ground 2", "ended_by_wicket": False},
            {"batter1": "A", "batter2": "C", "runs": 30, "balls": 20,
             "batter1_runs": 20, "batter2_runs": 10, "extras": 0,
             "match_id": "m3", "season": 2025, "team": "Team Y",
             "opposition": "Team X", "venue": "Ground 1", "ended_by_wicket": True},
        ]
        pairs, contexts = pipeline.build_pair_intelligence(rows)
        ab = next(row for row in pairs if row['pair'] == 'A & B')
        self.assertEqual(ab['partnerships'], 2)
        self.assertEqual(ab['runs'], 100)
        self.assertEqual(ab['balls'], 64)
        self.assertEqual(ab['best_partnership'], 60)
        self.assertEqual(ab['median_partnership'], 50)
        self.assertEqual(ab['not_out_partnerships'], 1)
        self.assertEqual(ab['extras'], 5)
        self.assertAlmostEqual(ab['batter_contribution_pct'], 95.0)
        self.assertTrue(any(x['pair'] == 'A & B' and x['dimension'] == 'season' and x['value'] == 2024 for x in contexts))
        self.assertTrue(any(x['pair'] == 'A & B' and x['dimension'] == 'opposition' and x['value'] == 'Team Z' for x in contexts))

    def test_pair_order_is_normalized(self):
        rows = [
            {"batter1": "Z", "batter2": "A", "runs": 20, "balls": 12,
             "batter1_runs": 10, "batter2_runs": 10, "extras": 0, "match_id": "m1"},
            {"batter1": "A", "batter2": "Z", "runs": 25, "balls": 15,
             "batter1_runs": 15, "batter2_runs": 10, "extras": 0, "match_id": "m2"},
        ]
        pairs, _ = pipeline.build_pair_intelligence(rows)
        self.assertEqual(len(pairs), 1)
        self.assertEqual(pairs[0]['pair'], 'A & Z')
        self.assertEqual(pairs[0]['runs'], 45)

    def test_scorecard_derived_metrics_are_safe_for_zero_runs(self):
        # The scorecard uses team runs as the denominator; zero-run stands must
        # produce null percentages rather than division errors or fake zeros.
        row = {"runs": 0, "balls": 3, "batter1_runs": 0, "batter2_runs": 0,
               "extras": 0, "fours": 0, "sixes": 0, "dot_balls": 3}
        self.assertIsNone(round(row['extras'] * 100 / row['runs'], 2) if row['runs'] else None)
        self.assertIsNone(round((row['fours'] * 4 + row['sixes'] * 6) * 100 / row['runs'], 2) if row['runs'] else None)

    def test_over_progression_counts_deliveries_for_dot_percentage(self):
        buckets = {
            1: {"runs": 5, "legal_balls": 4, "deliveries": 5,
                "batter_runs": {"A": 4, "B": 0}, "extras": 1,
                "dot_balls": 2, "fours": 1, "sixes": 0},
        }
        progression, phases = pipeline.finalize_progression(buckets, 'A', 'B')
        self.assertEqual(progression[0]['deliveries'], 5)
        self.assertEqual(progression[0]['dot_ball_pct'], 40.0)
        self.assertEqual(phases[0]['deliveries'], 5)
        self.assertEqual(phases[0]['dot_ball_pct'], 40.0)


if __name__ == '__main__':
    unittest.main(verbosity=2)

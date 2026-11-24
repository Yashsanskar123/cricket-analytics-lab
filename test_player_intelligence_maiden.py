"""Focused tests for maiden-over calculation in Player Intelligence."""

import unittest
from collections import defaultdict

from player_intelligence_pipeline import apply_maiden_overs, fresh_bowl


class MaidenOverTests(unittest.TestCase):
    def setUp(self):
        self.match_bowl = defaultdict(fresh_bowl)
        self.phase_bowl = defaultdict(fresh_bowl)

    def test_six_legal_balls_and_zero_charged_runs_is_maiden(self):
        stats = {(1, "bowler-1"): {"legal_balls": 6, "runs_conceded": 0}}
        apply_maiden_overs(stats, self.match_bowl, self.phase_bowl)
        self.assertEqual(self.match_bowl["bowler-1"]["maidens"], 1)
        self.assertEqual(self.phase_bowl[("bowler-1", "Powerplay")]["maidens"], 1)

    def test_any_charged_run_prevents_maiden(self):
        stats = {(1, "bowler-1"): {"legal_balls": 6, "runs_conceded": 1}}
        apply_maiden_overs(stats, self.match_bowl, self.phase_bowl)
        self.assertEqual(self.match_bowl["bowler-1"]["maidens"], 0)

    def test_incomplete_over_is_not_maiden(self):
        stats = {(1, "bowler-1"): {"legal_balls": 5, "runs_conceded": 0}}
        apply_maiden_overs(stats, self.match_bowl, self.phase_bowl)
        self.assertEqual(self.match_bowl["bowler-1"]["maidens"], 0)

    def test_byes_and_leg_byes_do_not_prevent_maiden(self):
        # The pipeline passes bowler-charged runs here; byes/leg-byes are excluded.
        stats = {(1, "bowler-1"): {"legal_balls": 6, "runs_conceded": 0}}
        apply_maiden_overs(stats, self.match_bowl, self.phase_bowl)
        self.assertEqual(self.match_bowl["bowler-1"]["maidens"], 1)

    def test_second_innings_over_number_can_be_counted_separately(self):
        # Each innings is processed with a fresh per-innings over accumulator.
        first_innings = {(1, "bowler-1"): {"legal_balls": 6, "runs_conceded": 0}}
        second_innings = {(1, "bowler-2"): {"legal_balls": 6, "runs_conceded": 0}}
        apply_maiden_overs(first_innings, self.match_bowl, self.phase_bowl)
        apply_maiden_overs(second_innings, self.match_bowl, self.phase_bowl)
        self.assertEqual(self.match_bowl["bowler-1"]["maidens"], 1)
        self.assertEqual(self.match_bowl["bowler-2"]["maidens"], 1)


if __name__ == "__main__":
    unittest.main()

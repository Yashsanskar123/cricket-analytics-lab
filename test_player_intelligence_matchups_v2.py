import unittest

from player_intelligence_pipeline import (
    fresh_matchup,
    add_matchup_delivery,
    finalize_matchup_line,
    phase_for,
)


class MatchupIntelligenceV2Tests(unittest.TestCase):
    def test_wides_are_excluded_from_balls_and_dots(self):
        store = {}
        wide = {
            "runs": {"batter": 0, "total": 1},
            "extras": {"wides": 1},
        }
        add_matchup_delivery(store, ("batter-1", "bowler-1"), wide, 0, 1, [])
        result = finalize_matchup_line(store[("batter-1", "bowler-1")])
        self.assertEqual(result["balls"], 0)
        self.assertEqual(result["dot_balls"], 0)
        self.assertIsNone(result["strike_rate"])

    def test_zero_run_no_ball_is_a_batting_dot_but_not_a_legal_ball(self):
        store = {}
        no_ball = {
            "runs": {"batter": 0, "total": 1},
            "extras": {"noballs": 1},
        }
        add_matchup_delivery(store, ("batter-1", "bowler-1"), no_ball, 0, 0, [])
        result = finalize_matchup_line(store[("batter-1", "bowler-1")])
        self.assertEqual(result["balls"], 1)
        self.assertEqual(result["dot_balls"], 1)
        self.assertEqual(result["dot_pct"], 100.0)

    def test_non_boundary_runs_do_not_count_as_fours_or_sixes(self):
        store = {}
        delivery = {
            "runs": {"batter": 4, "total": 4},
            "non_boundary": True,
        }
        add_matchup_delivery(store, ("batter-1", "bowler-1"), delivery, 4, 0, [])
        result = finalize_matchup_line(store[("batter-1", "bowler-1")])
        self.assertEqual(result["runs"], 4)
        self.assertEqual(result["fours"], 0)

    def test_only_bowler_credited_wickets_are_counted_with_types(self):
        store = {}
        delivery = {"runs": {"batter": 0, "total": 0}}
        wickets = [
            {"kind": "bowled", "player_out": "A"},
            {"kind": "run out", "player_out": "B"},
        ]
        add_matchup_delivery(store, ("batter-1", "bowler-1"), delivery, 0, 0, [w for w in wickets if w["kind"] == "bowled"])
        result = finalize_matchup_line(store[("batter-1", "bowler-1")])
        self.assertEqual(result["dismissals"], 1)
        self.assertEqual(result["dismissal_types"], {"bowled": 1})

    def test_phase_boundaries(self):
        self.assertEqual(phase_for(6), "Powerplay")
        self.assertEqual(phase_for(7), "Middle")
        self.assertEqual(phase_for(15), "Middle")
        self.assertEqual(phase_for(16), "Death")

    def test_empty_matchup_finalizes_safely(self):
        result = finalize_matchup_line(fresh_matchup())
        self.assertEqual(result["balls"], 0)
        self.assertIsNone(result["average"])
        self.assertEqual(result["dismissal_types"], {})


if __name__ == "__main__":
    unittest.main()

import unittest

from player_intelligence_pipeline import (
    batting_participants_for_innings,
    fresh_bat,
    finalize_bat,
)


class BattingInningsTests(unittest.TestCase):
    def setUp(self):
        self.registry = {
            "A Batter": "a",
            "B Batter": "b",
            "C Batter": "c",
            "Unused XI Player": "unused",
        }

    def test_striker_and_non_striker_are_both_counted(self):
        innings = {"deliveries": [
            {0.1: {"batter": "A Batter", "non_striker": "B Batter",
                   "bowler": "X", "runs": {"total": 0, "batter": 0}}},
        ]}
        self.assertEqual(
            batting_participants_for_innings(innings, self.registry),
            {"a", "b"},
        )

    def test_repeated_deliveries_count_player_once_per_innings(self):
        innings = {"deliveries": [
            {0.1: {"batter": "A Batter", "non_striker": "B Batter"}},
            {0.2: {"batter": "A Batter", "non_striker": "B Batter"}},
            {0.3: {"batter": "B Batter", "non_striker": "A Batter"}},
        ]}
        self.assertEqual(
            batting_participants_for_innings(innings, self.registry),
            {"a", "b"},
        )

    def test_unused_xi_player_is_not_counted(self):
        innings = {"deliveries": [
            {0.1: {"batter": "A Batter", "non_striker": "B Batter"}},
        ]}
        participants = batting_participants_for_innings(innings, self.registry)
        self.assertNotIn("unused", participants)

    def test_participation_is_separate_for_each_innings(self):
        first = {"deliveries": [
            {0.1: {"batter": "A Batter", "non_striker": "B Batter"}},
        ]}
        second = {"deliveries": [
            {0.1: {"batter": "C Batter", "non_striker": "A Batter"}},
        ]}
        self.assertEqual(
            batting_participants_for_innings(first, self.registry), {"a", "b"}
        )
        self.assertEqual(
            batting_participants_for_innings(second, self.registry), {"a", "c"}
        )

    def test_finalized_batting_stats_expose_innings_count(self):
        line = fresh_bat()
        line["runs"] = 24
        line["balls"] = 18
        line["innings"] = 2
        self.assertEqual(finalize_bat(line)["innings"], 2)
        self.assertNotIn("innings", finalize_bat(line, include_innings=False))


if __name__ == "__main__":
    unittest.main()

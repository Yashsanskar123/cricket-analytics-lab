import unittest

from player_intelligence_pipeline import build_batting_innings_rows


class BattingScorecardTests(unittest.TestCase):
    def setUp(self):
        self.registry = {
            "A Opener": "a",
            "B Opener": "b",
            "C Batter": "c",
            "D Batter": "d",
        }

    def test_creates_one_row_for_each_crease_participant(self):
        innings = {"deliveries": [
            {0.1: {"batter": "A Opener", "non_striker": "B Opener",
                   "runs": {"batter": 4, "total": 4}}},
            {0.2: {"batter": "A Opener", "non_striker": "B Opener",
                   "runs": {"batter": 1, "total": 1}}},
            {0.3: {"batter": "B Opener", "non_striker": "A Opener",
                   "runs": {"batter": 0, "total": 0}}},
        ]}
        rows = build_batting_innings_rows(
            innings, self.registry, "match1", "2025-04-01", 2025,
            "Wankhede", "Mumbai", "Chennai", 1
        )
        self.assertEqual(len(rows), 2)
        a = next(row for row in rows if row["player_id"] == "a")
        b = next(row for row in rows if row["player_id"] == "b")
        self.assertEqual((a["runs"], a["balls"], a["fours"]), (5, 2, 1))
        self.assertEqual((b["runs"], b["balls"]), (0, 1))
        self.assertEqual(a["opponent"], "Chennai")
        self.assertEqual(a["venue"], "Wankhede")

    def test_wide_does_not_count_as_batter_ball(self):
        innings = {"deliveries": [
            {0.1: {"batter": "A Opener", "non_striker": "B Opener",
                   "runs": {"batter": 0, "total": 1},
                   "extras": {"wides": 1}}},
        ]}
        rows = build_batting_innings_rows(
            innings, self.registry, "m", "2025-01-01", 2025,
            "Ground", "Team A", "Team B", 1
        )
        a = next(row for row in rows if row["player_id"] == "a")
        self.assertEqual(a["balls"], 0)

    def test_non_boundary_four_is_not_a_four(self):
        innings = {"deliveries": [
            {0.1: {"batter": "A Opener", "non_striker": "B Opener",
                   "runs": {"batter": 4, "total": 4}, "non_boundary": True}},
        ]}
        rows = build_batting_innings_rows(
            innings, self.registry, "m", "2025-01-01", 2025,
            "Ground", "Team A", "Team B", 1
        )
        a = next(row for row in rows if row["player_id"] == "a")
        self.assertEqual(a["runs"], 4)
        self.assertEqual(a["fours"], 0)

    def test_dismissal_status_and_type_are_recorded(self):
        innings = {"deliveries": [
            {0.1: {"batter": "A Opener", "non_striker": "B Opener",
                   "runs": {"batter": 0, "total": 0},
                   "wickets": [{"kind": "bowled", "player_out": "A Opener"}]}},
        ]}
        rows = build_batting_innings_rows(
            innings, self.registry, "m", "2025-01-01", 2025,
            "Ground", "Team A", "Team B", 1
        )
        a = next(row for row in rows if row["player_id"] == "a")
        b = next(row for row in rows if row["player_id"] == "b")
        self.assertEqual(a["status"], "out")
        self.assertEqual(a["dismissal_types"], ["bowled"])
        self.assertEqual(b["status"], "not_out")

    def test_separate_innings_metadata_is_preserved(self):
        innings = {"deliveries": [
            {0.1: {"batter": "C Batter", "non_striker": "D Batter",
                   "runs": {"batter": 2, "total": 2}}},
        ]}
        rows = build_batting_innings_rows(
            innings, self.registry, "m2", "2026-05-01", 2026,
            "Chepauk", "CSK", "RCB", 2
        )
        self.assertEqual(rows[0]["innings_number"], 2)
        self.assertEqual(rows[0]["match_id"], "m2")
        self.assertEqual(rows[0]["season"], 2026)


if __name__ == "__main__":
    unittest.main()

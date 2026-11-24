import unittest
from partnership_intelligence_pipeline import build_venue_and_wicket_intelligence


def row(**overrides):
    base = {
        "venue": "Wankhede Stadium", "team": "Mumbai Indians", "opposition": "Chennai Super Kings",
        "season": 2024, "wicket_number": 1, "runs": 60, "balls": 40,
        "match_id": "match-1", "pair": "A & B", "team_won": True,
        "ended_by_wicket": True, "deliveries": 42, "dot_balls": 12, "extras": 4,
        "fours": 5, "sixes": 3, "boundary_runs": 38, "innings": 1,
        "phase_splits": [
            {"phase": "Powerplay", "runs": 25, "legal_balls": 18},
            {"phase": "Middle", "runs": 35, "legal_balls": 22},
        ],
    }
    base.update(overrides)
    return base


class VenueWicketIntelligenceTests(unittest.TestCase):
    def test_venue_summary_and_contexts(self):
        out = build_venue_and_wicket_intelligence([row()])
        venue = out["venue_intelligence"][0]
        self.assertEqual(venue["venue"], "Wankhede Stadium")
        self.assertEqual(venue["runs"], 60)
        self.assertEqual(venue["matches"], 1)
        self.assertEqual(out["venue_season_intelligence"][0]["season"], 2024)
        self.assertEqual(out["venue_team_intelligence"][0]["team"], "Mumbai Indians")
        self.assertEqual(out["venue_opposition_intelligence"][0]["opposition"], "Chennai Super Kings")

    def test_wicket_summary_tracks_ended_and_unfinished(self):
        rows = [row(), row(match_id="match-2", runs=30, ended_by_wicket=False, wicket_number=1)]
        out = build_venue_and_wicket_intelligence(rows)
        wicket = out["wicket_intelligence"][0]
        self.assertEqual(wicket["partnerships"], 2)
        self.assertEqual(wicket["runs"], 90)
        self.assertEqual(wicket["dismissal_ended_partnerships"], 1)
        self.assertEqual(wicket["unfinished_partnerships"], 1)

    def test_wicket_team_and_phase_splits(self):
        out = build_venue_and_wicket_intelligence([row()])
        self.assertEqual(out["wicket_team_intelligence"][0]["team"], "Mumbai Indians")
        phase = {x["phase"]: x for x in out["wicket_phase_intelligence"]}
        self.assertEqual(phase["Powerplay"]["runs"], 25)
        self.assertEqual(phase["Middle"]["legal_balls"], 22)

    def test_empty_input_returns_empty_exports(self):
        out = build_venue_and_wicket_intelligence([])
        self.assertEqual(out["venue_intelligence"], [])
        self.assertEqual(out["wicket_intelligence"], [])
        self.assertEqual(out["wicket_phase_intelligence"], [])

    def test_distinct_match_win_rate(self):
        rows = [row(), row(match_id="match-1", runs=20)]
        out = build_venue_and_wicket_intelligence(rows)
        self.assertEqual(out["venue_intelligence"][0]["matches"], 1)
        self.assertEqual(out["venue_intelligence"][0]["wins"], 1)
        self.assertEqual(out["venue_intelligence"][0]["win_rate_pct"], 100.0)


if __name__ == "__main__":
    unittest.main()

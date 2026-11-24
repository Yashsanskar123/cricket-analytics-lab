import unittest
from player_intelligence_pipeline import build_recruitment_intelligence


class RecruitmentIntelligenceTests(unittest.TestCase):
    def make_player(self, pid, role, percentiles):
        return {"id": pid, "name": f"Player {pid}", "role": role,
                "peer_percentiles": percentiles}

    def test_replacement_candidates_are_role_matched(self):
        players = [
            self.make_player("b1", "Batter", {"batting.average": 70, "batting.strike_rate": 65}),
            self.make_player("b2", "Batter", {"batting.average": 68, "batting.strike_rate": 62}),
            self.make_player("b3", "Batter", {"batting.average": 20, "batting.strike_rate": 25}),
            self.make_player("w1", "Bowler", {"bowling.economy": 70, "bowling.strike_rate": 60}),
        ]
        result = build_recruitment_intelligence(players, {})
        target = players[0]["recruitment"]["replacement_candidates"]
        self.assertEqual(target[0]["player_id"], "b2")
        self.assertTrue(all(row["role"] == "Batter" for row in target))
        self.assertNotIn("b1", [row["player_id"] for row in target])

    def test_replacement_candidates_limited_to_five(self):
        players = [self.make_player(str(i), "Bowler", {"bowling.economy": i * 10}) for i in range(8)]
        build_recruitment_intelligence(players, {})
        self.assertLessEqual(len(players[0]["recruitment"]["replacement_candidates"]), 5)

    def test_other_role_gets_empty_candidates(self):
        player = self.make_player("x", "Other", {})
        build_recruitment_intelligence([player], {})
        self.assertEqual(player["recruitment"]["replacement_candidates"], [])

    def test_team_squad_counts_recorded_roles(self):
        players = [self.make_player("b", "Batter", {}),
                   self.make_player("w", "Bowler", {}),
                   self.make_player("a", "All-rounder", {})]
        result = build_recruitment_intelligence(players, {("Team A", 2025): {"b", "w", "a"}})
        squad = result["team_squads"][0]
        self.assertEqual(squad["players_recorded_in_xi"], 3)
        self.assertEqual(squad["role_counts"]["Batter"], 1)
        self.assertEqual(squad["role_coverage_gaps"], [])

    def test_team_squad_reports_role_coverage_gaps(self):
        players = [self.make_player("b", "Batter", {}), self.make_player("w", "Bowler", {})]
        result = build_recruitment_intelligence(players, {("Team B", 2024): {"b", "w"}})
        squad = result["team_squads"][0]
        self.assertEqual(squad["role_coverage_gaps"], ["All-rounder"])
        self.assertEqual(squad["suggested_recruitment_roles"], ["All-rounder"])

    def test_methodology_discloses_data_limitations(self):
        result = build_recruitment_intelligence([], {})
        self.assertTrue(any("contracts" in item for item in result["methodology"]["limitations"]))


if __name__ == "__main__":
    unittest.main()

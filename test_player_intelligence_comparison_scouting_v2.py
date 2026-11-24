import unittest
from player_intelligence_pipeline import percentile_rank, build_comparison_and_scouting


def profile(pid, role="Batter", runs=500, average=35, strike_rate=140,
            dot_pct=28, boundary_pct=16, wickets=0, economy=None,
            bowling_average=None, bowling_strike_rate=None, bowling_dot_pct=None,
            matches=30, batting_balls=400, bowling_balls=0):
    return {
        "id": str(pid), "name": f"Player {pid}", "role": role, "matches": matches,
        "batting": {"runs": runs, "balls": batting_balls, "average": average,
                    "strike_rate": strike_rate, "dot_pct": dot_pct,
                    "boundary_pct": boundary_pct},
        "bowling": {"wickets": wickets, "balls": bowling_balls, "economy": economy,
                    "average": bowling_average, "strike_rate": bowling_strike_rate,
                    "dot_pct": bowling_dot_pct},
    }


class ComparisonScoutingTests(unittest.TestCase):
    def test_percentile_higher_is_better(self):
        self.assertEqual(percentile_rank(10, [1, 2, 3, 4, 5]), 100.0)

    def test_percentile_lower_is_better(self):
        self.assertEqual(percentile_rank(1, [1, 2, 3, 4, 5], "lower"), 100.0)

    def test_small_peer_group_returns_none(self):
        self.assertIsNone(percentile_rank(10, [1, 2, 3, 4]))

    def test_role_aware_percentiles_and_scouting_fields(self):
        players = [profile(i, runs=400+i*10, average=25+i, strike_rate=110+i*5,
                           dot_pct=40-i, boundary_pct=10+i) for i in range(8)]
        build_comparison_and_scouting(players)
        self.assertIn("batting.average", players[-1]["peer_percentiles"])
        self.assertIn("archetypes", players[-1]["scouting"])
        self.assertIn("strengths", players[-1]["scouting"])
        self.assertIn("development_areas", players[-1]["scouting"])
        self.assertIn("similar_players", players[-1])

    def test_bowler_metrics_use_lower_is_better_where_appropriate(self):
        players = [profile(i, role="Bowler", batting_balls=20, bowling_balls=300,
                           wickets=20+i, economy=10-i*0.3,
                           bowling_average=35-i, bowling_strike_rate=25-i,
                           bowling_dot_pct=20+i*2) for i in range(8)]
        build_comparison_and_scouting(players)
        p = players[-1]
        self.assertIn("bowling.economy", p["peer_percentiles"])
        self.assertGreater(p["peer_percentiles"]["bowling.economy"],
                           players[0]["peer_percentiles"]["bowling.economy"])

    def test_similar_players_exclude_self_and_are_role_matched(self):
        players = [profile(i) for i in range(7)]
        players += [profile("bowler", role="Bowler", batting_balls=10,
                            bowling_balls=300, wickets=40, economy=7,
                            bowling_average=20, bowling_strike_rate=17,
                            bowling_dot_pct=45)]
        build_comparison_and_scouting(players)
        for p in players:
            self.assertNotIn(p["id"], [x["player_id"] for x in p["similar_players"]])
            self.assertTrue(all(x["role"] == p["role"] for x in p["similar_players"]))


if __name__ == "__main__":
    unittest.main()

"""Focused tests for Cricsheet boundary classification."""

import unittest

from player_intelligence_pipeline import is_batter_boundary


def delivery(batter_runs, wides=0, non_boundary=False):
    return {
        "runs": {"batter": batter_runs, "total": batter_runs + wides},
        "extras": ({"wides": wides} if wides else {}),
        "non_boundary": non_boundary,
    }


class BoundaryClassificationTests(unittest.TestCase):
    def test_regular_four_is_boundary(self):
        self.assertTrue(is_batter_boundary(delivery(4), 4))

    def test_regular_six_is_boundary(self):
        self.assertTrue(is_batter_boundary(delivery(6), 6))

    def test_non_boundary_four_is_not_boundary(self):
        self.assertFalse(is_batter_boundary(delivery(4, non_boundary=True), 4))

    def test_non_boundary_six_is_not_boundary(self):
        self.assertFalse(is_batter_boundary(delivery(6, non_boundary=True), 6))

    def test_wrong_run_value_is_not_boundary(self):
        self.assertFalse(is_batter_boundary(delivery(3), 4))
        self.assertFalse(is_batter_boundary(delivery(4), 6))

    def test_wide_is_not_credited_as_batter_boundary(self):
        self.assertFalse(is_batter_boundary(delivery(4, wides=1), 4))

    def test_missing_non_boundary_flag_defaults_to_boundary(self):
        raw = {"runs": {"batter": 4}, "extras": {}}
        self.assertTrue(is_batter_boundary(raw, 4))


if __name__ == "__main__":
    unittest.main()

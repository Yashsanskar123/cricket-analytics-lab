import contextlib
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path

import yaml

PIPELINE_PATH = Path(__file__).with_name('partnership_intelligence_pipeline.py')
spec = importlib.util.spec_from_file_location('partnership_pipeline_under_test', PIPELINE_PATH)
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)


def delivery(batter, non_striker, batter_runs=0, total_runs=None, extras=None, wickets=None):
    extras = extras or {}
    if total_runs is None:
        total_runs = batter_runs + sum(int(v) for v in extras.values())
    result = {
        'batter': batter,
        'non_striker': non_striker,
        'runs': {'batter': batter_runs, 'total': total_runs},
    }
    if extras:
        result['extras'] = extras
    if wickets is not None:
        result['wickets'] = wickets
    return result


class PartnershipPhaseProgressionTests(unittest.TestCase):
    def test_phase_boundaries(self):
        self.assertEqual(pipeline.phase_for_over(1), 'Powerplay')
        self.assertEqual(pipeline.phase_for_over(6), 'Powerplay')
        self.assertEqual(pipeline.phase_for_over(7), 'Middle')
        self.assertEqual(pipeline.phase_for_over(15), 'Middle')
        self.assertEqual(pipeline.phase_for_over(16), 'Death')
        self.assertEqual(pipeline.phase_for_over(20), 'Death')

    def test_progression_cumulative_runs_and_phase_rollup(self):
        buckets = {
            6: {'runs': 5, 'legal_balls': 2, 'batter_runs': {'A': 4, 'B': 0}, 'extras': 1,
                'dot_balls': 0, 'fours': 1, 'sixes': 0},
            7: {'runs': 7, 'legal_balls': 3, 'batter_runs': {'A': 1, 'B': 6}, 'extras': 0,
                'dot_balls': 1, 'fours': 0, 'sixes': 1},
            16: {'runs': 4, 'legal_balls': 2, 'batter_runs': {'A': 2, 'B': 2}, 'extras': 0,
                 'dot_balls': 0, 'fours': 0, 'sixes': 0},
        }
        progression, phases = pipeline.finalize_progression(buckets, 'A', 'B')
        self.assertEqual([x['cumulative_runs'] for x in progression], [5, 12, 16])
        self.assertEqual([x['phase'] for x in progression], ['Powerplay', 'Middle', 'Death'])
        self.assertEqual(progression[1]['batter2_runs'], 6)
        self.assertEqual([x['phase'] for x in phases], ['Powerplay', 'Middle', 'Death'])
        self.assertEqual(phases[0]['run_rate'], 15.0)
        self.assertEqual(phases[1]['legal_balls'], 3)

    def test_pipeline_exports_phase_records_and_true_wicket_numbers(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data_root = root / 'data'
            data_root.mkdir()
            output = root / 'dashboard' / 'public' / 'data' / 'partnership_intelligence.json'
            match = {
                'info': {
                    'dates': ['2024-04-01'],
                    'teams': ['Team A', 'Team B'],
                    'venue': 'Test Ground',
                    'outcome': {'winner': 'Team A'},
                    'registry': {'people': {}},
                },
                'innings': [{
                    '1st innings': {
                        'team': 'Team A',
                        'deliveries': [
                            {'0.1': delivery('A', 'B', 1)},
                            {'0.2': delivery('A', 'B', 4)},
                            {'0.3': delivery('A', 'B', 0, wickets=[{'kind': 'bowled', 'player_out': 'A'}])},
                            {'6.1': delivery('B', 'C', 2)},
                            {'6.2': delivery('B', 'C', 0, total_runs=1, extras={'wides': 1})},
                            {'6.3': delivery('C', 'B', 0)},
                            {'15.1': delivery('B', 'C', 6)},
                            {'15.2': delivery('C', 'B', 1)},
                        ],
                    }
                }],
            }
            (data_root / 'sample.yaml').write_text(yaml.safe_dump(match, sort_keys=False), encoding='utf-8')
            old_data_root, old_out = pipeline.DATA_ROOT, pipeline.OUT
            try:
                pipeline.DATA_ROOT = data_root
                pipeline.OUT = output
                with contextlib.redirect_stdout(io.StringIO()):
                    pipeline.main()
            finally:
                pipeline.DATA_ROOT, pipeline.OUT = old_data_root, old_out

            payload = json.loads(output.read_text(encoding='utf-8'))
            self.assertEqual(len(payload['partnerships']), 2)
            first, second = payload['partnerships']
            self.assertEqual(first['partnership_number'], 1)
            self.assertEqual(first['wicket_number'], 1)
            self.assertEqual(second['partnership_number'], 2)
            self.assertEqual(second['wicket_number'], 2)
            self.assertEqual([x['phase'] for x in second['phase_splits']], ['Middle', 'Death'])
            self.assertEqual([x['over'] for x in second['over_progression']], [7, 16])
            self.assertEqual(second['over_progression'][0]['legal_balls'], 2)
            self.assertEqual(second['over_progression'][0]['runs'], 3)
            self.assertEqual([x['phase'] for x in payload['by_phase']], ['Powerplay', 'Middle', 'Death'])
            self.assertEqual(len(payload['phase_partnerships']), 3)
            self.assertTrue(any(x['dimension'] == 'team' and x['value'] == 'Team A'
                                for x in payload['by_phase_context']))
            # Existing export keys remain available for the current frontend.
            for key in ('meta', 'partnerships', 'pairs', 'by_wicket', 'by_team', 'by_venue', 'errors'):
                self.assertIn(key, payload)


if __name__ == '__main__':
    unittest.main(verbosity=2)

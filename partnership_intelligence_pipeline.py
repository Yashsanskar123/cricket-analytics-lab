"""
Build IPL Partnership Intelligence exports from Cricsheet YAML.

Run from repository root:
    python partnership_intelligence_pipeline.py

Writes:
    dashboard/public/data/partnership_intelligence.json

Uses only Cricsheet ball-by-ball data. No model training or backend.
"""
from __future__ import annotations

import json
import math
from statistics import median, pstdev
from collections import defaultdict
from datetime import datetime
from pathlib import Path

try:
    import yaml
except ImportError:
    raise SystemExit("Missing PyYAML. Activate your project venv and run: pip install pyyaml")

ROOT = Path(__file__).resolve().parent
DATA_ROOT = ROOT / "data"
OUT = ROOT / "dashboard" / "public" / "data" / "partnership_intelligence.json"
NOT_A_WICKET = {"retired hurt", "retired not out"}

# Canonical franchise labels for analytics. Original source labels are retained
# separately on each partnership record for historical traceability.
TEAM_ALIASES = {
    "Delhi Daredevils": "Delhi Capitals",
    "Delhi Capitals": "Delhi Capitals",
    "Kings XI Punjab": "Punjab Kings",
    "Punjab Kings": "Punjab Kings",
    "Royal Challengers Bangalore": "Royal Challengers Bengaluru",
    "Royal Challengers Bengaluru": "Royal Challengers Bengaluru",
    "Rising Pune Supergiants": "Rising Pune Supergiant",
    "Rising Pune Supergiant": "Rising Pune Supergiant",
}

# Conservative venue aliases: merge only clear naming variants of the same ground.
VENUE_ALIASES = {
    "Wankhede Stadium": "Wankhede Stadium",
    "Wankhede Stadium, Mumbai": "Wankhede Stadium",
    "Eden Gardens": "Eden Gardens",
    "Eden Gardens, Kolkata": "Eden Gardens",
    "Feroz Shah Kotla": "Arun Jaitley Stadium",
    "Arun Jaitley Stadium": "Arun Jaitley Stadium",
    "Arun Jaitley Stadium, Delhi": "Arun Jaitley Stadium",
    "M Chinnaswamy Stadium": "M. Chinnaswamy Stadium",
    "M.Chinnaswamy Stadium": "M. Chinnaswamy Stadium",
    "M Chinnaswamy Stadium, Bengaluru": "M. Chinnaswamy Stadium",
    "Rajiv Gandhi International Stadium": "Rajiv Gandhi International Stadium",
    "Rajiv Gandhi International Stadium, Uppal": "Rajiv Gandhi International Stadium",
    "Rajiv Gandhi International Stadium,Uppal": "Rajiv Gandhi International Stadium",
    "Rajiv Gandhi International Stadium, Uppal, Hyderabad": "Rajiv Gandhi International Stadium",
    "MA Chidambaram Stadium": "MA Chidambaram Stadium",
    "MA ChidambaramStadium": "MA Chidambaram Stadium",
    "MA Chidambaram Stadium, Chepauk": "MA Chidambaram Stadium",
    "MA Chidambaram Stadium, Chepauk, Chennai": "MA Chidambaram Stadium",
    "Sawai Mansingh Stadium": "Sawai Mansingh Stadium",
    "Sawai Mansingh Stadium, Jaipur": "Sawai Mansingh Stadium",
    "Brabourne Stadium": "Brabourne Stadium",
    "Brabourne Stadium, Mumbai": "Brabourne Stadium",
    "Dr DY Patil Sports Academy": "Dr DY Patil Sports Academy",
    "Dr DY Patil Sports Academy, Mumbai": "Dr DY Patil Sports Academy",
    "Punjab Cricket Association Stadium, Mohali": "Punjab Cricket Association Stadium, Mohali",
    "Punjab Cricket Association IS Bindra Stadium": "Punjab Cricket Association IS Bindra Stadium, Mohali",
    "Punjab Cricket Association IS Bindra Stadium, Mohali": "Punjab Cricket Association IS Bindra Stadium, Mohali",
    "Punjab Cricket Association IS Bindra Stadium, Mohali, Chandigarh": "Punjab Cricket Association IS Bindra Stadium, Mohali",
    "Himachal Pradesh Cricket Association Stadium": "Himachal Pradesh Cricket Association Stadium",
    "Himachal Pradesh Cricket Association Stadium, Dharamsala": "Himachal Pradesh Cricket Association Stadium",
    "Dr. Y.S. Rajasekhara Reddy ACA-VDCA Cricket Stadium": "Dr. Y.S. Rajasekhara Reddy ACA-VDCA Cricket Stadium",
    "Dr. Y.S. Rajasekhara Reddy ACA-VDCA Cricket Stadium, Visakhapatnam": "Dr. Y.S. Rajasekhara Reddy ACA-VDCA Cricket Stadium",
    "Maharashtra Cricket Association Stadium": "Maharashtra Cricket Association Stadium, Pune",
    "Maharashtra Cricket Association Stadium, Pune": "Maharashtra Cricket Association Stadium, Pune",
    "Shaheed Veer Narayan Singh International Stadium": "Shaheed Veer Narayan Singh International Stadium, Raipur",
    "Shaheed Veer Narayan Singh International Stadium, Raipur": "Shaheed Veer Narayan Singh International Stadium, Raipur",
    "Maharaja Yadavindra Singh International Cricket Stadium, Mullanpur": "Maharaja Yadavindra Singh International Cricket Stadium, Mullanpur",
    "Maharaja Yadavindra Singh International Cricket Stadium, New Chandigarh": "Maharaja Yadavindra Singh International Cricket Stadium, Mullanpur",
    "Zayed Cricket Stadium, Abu Dhabi": "Sheikh Zayed Stadium",
    "Sheikh Zayed Stadium": "Sheikh Zayed Stadium",
}

def canonical_team(name):
    return TEAM_ALIASES.get(name, name)

def canonical_venue(name):
    return VENUE_ALIASES.get(name, name)


def deliveries_for(innings):
    """Yield (over number, delivery) for legacy and current Cricsheet formats."""
    if isinstance(innings.get("deliveries"), list):
        for item in innings["deliveries"]:
            if not isinstance(item, dict) or not item:
                continue
            over_key, delivery = next(iter(item.items()))
            if isinstance(delivery, dict):
                try:
                    over_no = int(str(over_key).split(".")[0]) + 1
                except (TypeError, ValueError):
                    over_no = 1
                yield over_no, delivery
    elif isinstance(innings.get("overs"), list):
        for idx, over in enumerate(innings["overs"]):
            if not isinstance(over, dict):
                continue
            try:
                over_no = int(over.get("over", idx)) + 1
            except (TypeError, ValueError):
                over_no = idx + 1
            for delivery in over.get("deliveries", []):
                if isinstance(delivery, dict):
                    yield over_no, delivery


def innings_for(match):
    out = []
    for item in match.get("innings", []):
        if not isinstance(item, dict):
            continue
        # Current format: {team, overs, ...}
        if "team" in item:
            if not item.get("super_over"):
                out.append(item)
        # Legacy format: {"1st innings": {team, deliveries}}
        elif item:
            _, inn = next(iter(item.items()))
            if isinstance(inn, dict):
                out.append(inn)
    return out[:2]


def as_int(value):
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return 0


def phase_for_over(over_no):
    """Return the standard IPL innings phase for a 1-based over number."""
    if over_no <= 6:
        return "Powerplay"
    if over_no <= 15:
        return "Middle"
    return "Death"


def finalize_progression(over_buckets, batter1, batter2):
    """Finalize per-over progression and phase summaries for one partnership."""
    progression = []
    phase_map = {}
    cumulative_runs = 0
    cumulative_balls = 0
    for over_no in sorted(over_buckets):
        item = over_buckets[over_no]
        cumulative_runs += item["runs"]
        cumulative_balls += item["legal_balls"]
        progression.append({
            "over": over_no,
            "phase": phase_for_over(over_no),
            "runs": item["runs"],
            "legal_balls": item["legal_balls"],
            "deliveries": item.get("deliveries", item.get("legal_balls", 0)),
            "batter1_runs": item["batter_runs"].get(batter1, 0),
            "batter2_runs": item["batter_runs"].get(batter2, 0),
            "extras": item["extras"],
            "dot_balls": item["dot_balls"],
            "fours": item["fours"],
            "sixes": item["sixes"],
            "dot_ball_pct": round(item["dot_balls"] * 100 / item.get("deliveries", item.get("legal_balls", 0)), 2) if item.get("deliveries", item.get("legal_balls", 0)) else None,
            "cumulative_runs": cumulative_runs,
            "cumulative_legal_balls": cumulative_balls,
        })
        phase = phase_for_over(over_no)
        agg = phase_map.setdefault(phase, {
            "phase": phase, "runs": 0, "legal_balls": 0,
            "batter1_runs": 0, "batter2_runs": 0, "extras": 0,
            "dot_balls": 0, "fours": 0, "sixes": 0, "deliveries": 0, "overs": [],
        })
        agg["runs"] += item["runs"]
        agg["legal_balls"] += item["legal_balls"]
        agg["batter1_runs"] += item["batter_runs"].get(batter1, 0)
        agg["batter2_runs"] += item["batter_runs"].get(batter2, 0)
        for key in ("extras", "dot_balls", "fours", "sixes"):
            agg[key] += item[key]
        agg["deliveries"] += item.get("deliveries", item.get("legal_balls", 0))
        agg["overs"].append(over_no)

    phase_splits = []
    for phase in ("Powerplay", "Middle", "Death"):
        if phase not in phase_map:
            continue
        item = phase_map[phase]
        balls = item["legal_balls"]
        phase_splits.append({
            **item,
            "run_rate": round(item["runs"] * 6 / balls, 3) if balls else None,
            "over_count": len(item["overs"]),
            "dot_ball_pct": round(item["dot_balls"] * 100 / item["deliveries"], 2) if item["deliveries"] else None,
        })
    return progression, phase_splits



def build_pair_intelligence(partnerships):
    """Build career pair rankings plus season/team/opposition/venue splits."""
    grouped = defaultdict(list)
    contexts = defaultdict(list)
    for row in partnerships:
        pair_key = tuple(sorted((row.get("batter1", "Unknown"), row.get("batter2", "Unknown"))))
        grouped[pair_key].append(row)
        for dimension in ("season", "team", "opposition", "venue"):
            contexts[(pair_key, dimension, row.get(dimension))].append(row)

    def summarize(rows, pair_key, dimension=None, value=None):
        runs = [int(r.get("runs", 0)) for r in rows]
        balls = sum(int(r.get("balls", 0)) for r in rows)
        total_runs = sum(runs)
        batter_runs = sum(int(r.get("batter1_runs", 0)) + int(r.get("batter2_runs", 0)) for r in rows)
        result = {
            "batter1": pair_key[0], "batter2": pair_key[1],
            "pair": f"{pair_key[0]} & {pair_key[1]}",
            "partnerships": len(rows),
            "matches": len({r.get("match_id") for r in rows if r.get("match_id")}),
            "runs": total_runs, "balls": balls,
            "average_runs": round(total_runs / len(rows), 3) if rows else None,
            "run_rate": round(total_runs * 6 / balls, 3) if balls else None,
            "fifties": sum(runs_value >= 50 for runs_value in runs),
            "hundreds": sum(runs_value >= 100 for runs_value in runs),
            "best_partnership": max(runs, default=0),
            "median_partnership": round(median(runs), 3) if runs else None,
            "partnership_runs_stddev": round(pstdev(runs), 3) if len(runs) > 1 else 0.0,
            "batter_runs": batter_runs,
            "extras": sum(int(r.get("extras", 0)) for r in rows),
            "batter_contribution_pct": round(batter_runs * 100 / total_runs, 2) if total_runs else None,
            "not_out_partnerships": sum(not r.get("ended_by_wicket", False) for r in rows),
            "wins": len({r.get("match_id") for r in rows if r.get("team_won") and r.get("match_id")}),
            "win_rate_pct": round(len({r.get("match_id") for r in rows if r.get("team_won") and r.get("match_id")}) * 100 / len({r.get("match_id") for r in rows if r.get("match_id")}), 2) if any(r.get("match_id") for r in rows) else None,
            "boundary_runs": sum(int(r.get("boundary_runs", int(r.get("fours", 0)) * 4 + int(r.get("sixes", 0)) * 6)) for r in rows),
        }
        if dimension is not None:
            result["dimension"] = dimension
            result["value"] = value
        return result

    pair_rows = [summarize(rows, pair_key) for pair_key, rows in grouped.items()]
    pair_rows.sort(key=lambda x: (x["runs"], x["partnerships"]), reverse=True)
    context_rows = [summarize(rows, pair_key, dimension, value)
                    for (pair_key, dimension, value), rows in contexts.items()]
    context_rows.sort(key=lambda x: (x["dimension"], str(x["value"]), -x["runs"]))
    return pair_rows, context_rows


def build_team_opposition_intelligence(partnerships):
    """Aggregate partnership output by team, season and opposition contexts."""
    buckets = {
        "team": defaultdict(list),
        "team_season": defaultdict(list),
        "team_opposition": defaultdict(list),
        "team_opposition_season": defaultdict(list),
    }
    for row in partnerships:
        team = row.get("team") or "Unknown"
        opposition = row.get("opposition") or "Unknown"
        season = row.get("season")
        buckets["team"][team].append(row)
        buckets["team_season"][(team, season)].append(row)
        buckets["team_opposition"][(team, opposition)].append(row)
        buckets["team_opposition_season"][(team, opposition, season)].append(row)

    def summarize(rows, dimensions):
        runs = [int(r.get("runs", 0)) for r in rows]
        balls = sum(int(r.get("balls", 0)) for r in rows)
        match_ids = {r.get("match_id") for r in rows if r.get("match_id")}
        wins = {r.get("match_id") for r in rows if r.get("team_won") and r.get("match_id")}
        total_runs = sum(runs)
        batter_runs = sum(int(r.get("batter1_runs", 0)) + int(r.get("batter2_runs", 0)) for r in rows)
        extras = sum(int(r.get("extras", 0)) for r in rows)
        legal_balls = balls
        deliveries = sum(int(r.get("deliveries", 0)) for r in rows)
        boundaries = sum(int(r.get("boundary_runs", 4 * int(r.get("fours", 0)) + 6 * int(r.get("sixes", 0)))) for r in rows)
        best = max(rows, key=lambda r: int(r.get("runs", 0)), default=None)
        return {
            **dimensions,
            "partnerships": len(rows),
            "matches": len(match_ids),
            "runs": total_runs,
            "balls": legal_balls,
            "average_runs": round(total_runs / len(rows), 3) if rows else None,
            "run_rate": round(total_runs * 6 / legal_balls, 3) if legal_balls else None,
            "best_partnership": int(best.get("runs", 0)) if best else 0,
            "best_pair": best.get("pair") if best else None,
            "best_match_id": best.get("match_id") if best else None,
            "fifties": sum(value >= 50 for value in runs),
            "hundreds": sum(value >= 100 for value in runs),
            "not_out_partnerships": sum(not r.get("ended_by_wicket", False) for r in rows),
            "wins": len(wins),
            "win_rate_pct": round(len(wins) * 100 / len(match_ids), 2) if match_ids else None,
            "batter_runs": batter_runs,
            "extras": extras,
            "batter_contribution_pct": round(batter_runs * 100 / total_runs, 2) if total_runs else None,
            "extras_pct": round(extras * 100 / total_runs, 2) if total_runs else None,
            "boundary_runs": boundaries,
            "boundary_run_pct": round(boundaries * 100 / total_runs, 2) if total_runs else None,
            "dot_balls": sum(int(r.get("dot_balls", 0)) for r in rows),
            "deliveries": deliveries,
            "dot_ball_pct": round(sum(int(r.get("dot_balls", 0)) for r in rows) * 100 / deliveries, 2) if deliveries else None,
        }

    output = {}
    for name, groups in buckets.items():
        rows = []
        for key, records in groups.items():
            if name == "team":
                dimensions = {"team": key}
            elif name == "team_season":
                dimensions = {"team": key[0], "season": key[1]}
            elif name == "team_opposition":
                dimensions = {"team": key[0], "opposition": key[1]}
            else:
                dimensions = {"team": key[0], "opposition": key[1], "season": key[2]}
            rows.append(summarize(records, dimensions))
        rows.sort(key=lambda x: (x["runs"], x["partnerships"]), reverse=True)
        output[name] = rows
    return output



def build_venue_and_wicket_intelligence(partnerships):
    """Build venue and wicket-position aggregates from partnership records."""
    venue_groups = {
        "venue": defaultdict(list),
        "venue_season": defaultdict(list),
        "venue_team": defaultdict(list),
        "venue_opposition": defaultdict(list),
    }
    wicket_groups = {
        "wicket": defaultdict(list),
        "wicket_team": defaultdict(list),
        "wicket_phase": defaultdict(list),
    }

    for row in partnerships:
        venue = row.get("venue") or "Unknown venue"
        team = row.get("team") or "Unknown"
        opposition = row.get("opposition") or "Unknown"
        season = row.get("season")
        for name, key in (("venue", venue), ("venue_season", (venue, season)),
                          ("venue_team", (venue, team)),
                          ("venue_opposition", (venue, opposition))):
            venue_groups[name][key].append(row)

        wicket = int(row.get("wicket_number") or 0)
        wicket_groups["wicket"][wicket].append(row)
        wicket_groups["wicket_team"][(wicket, team)].append(row)
        for split in row.get("phase_splits", []):
            wicket_groups["wicket_phase"][(wicket, split.get("phase", "Unknown"))].append((row, split))

    def summarize(rows, dimensions):
        runs = [int(r.get("runs", 0)) for r in rows]
        total = sum(runs)
        balls = sum(int(r.get("balls", 0)) for r in rows)
        matches = {r.get("match_id") for r in rows if r.get("match_id")}
        wins = {r.get("match_id") for r in rows if r.get("team_won") and r.get("match_id")}
        best = max(rows, key=lambda r: int(r.get("runs", 0)), default=None)
        deliveries = sum(int(r.get("deliveries", 0)) for r in rows)
        dots = sum(int(r.get("dot_balls", 0)) for r in rows)
        extras = sum(int(r.get("extras", 0)) for r in rows)
        boundary_runs = sum(int(r.get("boundary_runs", 4 * int(r.get("fours", 0)) + 6 * int(r.get("sixes", 0)))) for r in rows)
        return {
            **dimensions, "partnerships": len(rows), "matches": len(matches),
            "runs": total, "balls": balls,
            "average_runs": round(total / len(rows), 3) if rows else None,
            "run_rate": round(total * 6 / balls, 3) if balls else None,
            "best_partnership": int(best.get("runs", 0)) if best else 0,
            "best_pair": best.get("pair") if best else None,
            "best_match_id": best.get("match_id") if best else None,
            "fifties": sum(x >= 50 for x in runs), "hundreds": sum(x >= 100 for x in runs),
            "not_out_partnerships": sum(not r.get("ended_by_wicket", False) for r in rows),
            "wins": len(wins), "win_rate_pct": round(len(wins) * 100 / len(matches), 2) if matches else None,
            "extras": extras, "extras_pct": round(extras * 100 / total, 2) if total else None,
            "dot_balls": dots, "deliveries": deliveries,
            "dot_ball_pct": round(dots * 100 / deliveries, 2) if deliveries else None,
            "boundary_runs": boundary_runs,
            "boundary_run_pct": round(boundary_runs * 100 / total, 2) if total else None,
        }

    venue_output = {}
    for name, groups in venue_groups.items():
        rows_out = []
        for key, rows in groups.items():
            if name == "venue": dims = {"venue": key}
            elif name == "venue_season": dims = {"venue": key[0], "season": key[1]}
            elif name == "venue_team": dims = {"venue": key[0], "team": key[1]}
            else: dims = {"venue": key[0], "opposition": key[1]}
            rows_out.append(summarize(rows, dims))
        rows_out.sort(key=lambda x: (x["runs"], x["partnerships"]), reverse=True)
        venue_output[name] = rows_out

    wicket_output = []
    for wicket, rows in sorted(wicket_groups["wicket"].items()):
        item = summarize(rows, {"wicket_number": wicket})
        item["dismissal_ended_partnerships"] = sum(bool(r.get("ended_by_wicket")) for r in rows)
        item["unfinished_partnerships"] = sum(not bool(r.get("ended_by_wicket")) for r in rows)
        item["innings_1_partnerships"] = sum(int(r.get("innings", 0)) == 1 for r in rows)
        item["innings_2_partnerships"] = sum(int(r.get("innings", 0)) == 2 for r in rows)
        wicket_output.append(item)

    wicket_team_output = []
    for (wicket, team), rows in sorted(wicket_groups["wicket_team"].items()):
        wicket_team_output.append(summarize(rows, {"wicket_number": wicket, "team": team}))

    wicket_phase_output = []
    for (wicket, phase), records in sorted(wicket_groups["wicket_phase"].items()):
        rows = [row for row, _ in records]
        splits = [split for _, split in records]
        runs = sum(int(x.get("runs", 0)) for x in splits)
        balls = sum(int(x.get("legal_balls", 0)) for x in splits)
        wicket_phase_output.append({
            "wicket_number": wicket, "phase": phase, "partnership_phase_segments": len(splits),
            "matches": len({r.get("match_id") for r in rows if r.get("match_id")}),
            "runs": runs, "legal_balls": balls,
            "average_runs_per_segment": round(runs / len(splits), 3) if splits else None,
            "run_rate": round(runs * 6 / balls, 3) if balls else None,
        })

    return {
        **{f"{name}_intelligence" if name == "venue" else f"{name}_intelligence": rows for name, rows in venue_output.items()},
        "wicket_intelligence": wicket_output,
        "wicket_team_intelligence": wicket_team_output,
        "wicket_phase_intelligence": wicket_phase_output,
    }

def person_name(raw_name, registry, reverse_registry):
    """Resolve a Cricsheet player value to a display name.

    Cricsheet info.registry.people maps display name -> player ID. Ball-by-ball
    batter fields normally contain display names, so looking them up directly
    in registry would incorrectly replace them with IDs. The reverse map also
    handles files whose delivery values already contain an ID.
    """
    if not raw_name:
        return "Unknown"
    raw = str(raw_name)
    if raw in registry:
        return raw
    return reverse_registry.get(raw, raw)


def main():
    files = sorted(set(DATA_ROOT.rglob("*.yaml")) | set(DATA_ROOT.rglob("*.yml")))
    if not files:
        raise SystemExit(f"No YAML files found under {DATA_ROOT}")

    partnerships = []
    errors = []
    parsed = 0
    season_set = set()
    team_set = set()
    venue_set = set()
    wicket_agg = defaultdict(lambda: {"partnerships": 0, "runs": 0, "balls": 0})
    match_winners = {}

    print(f"Found {len(files):,} YAML files. Building partnership records...", flush=True)

    for file_index, path in enumerate(files, start=1):
        try:
            with path.open("r", encoding="utf-8") as handle:
                match = yaml.safe_load(handle) or {}
            if not isinstance(match, dict):
                raise ValueError("Match root is not a mapping")

            info = match.get("info") or {}
            dates = info.get("dates") or []
            date = str(dates[0])[:10] if dates else ""
            try:
                season = int(date[:4])
            except ValueError:
                season = None
            if season is None:
                continue

            registry = ((info.get("registry") or {}).get("people") or {})
            reverse_registry = {str(player_id): str(player_name) for player_name, player_id in registry.items()}
            venue_original = info.get("venue") or "Unknown venue"
            venue = canonical_venue(venue_original)
            teams_original = info.get("teams") or []
            teams = [canonical_team(team) for team in teams_original]
            outcome = info.get("outcome") or {}
            winner = canonical_team(outcome.get("winner")) if outcome.get("winner") else None
            match_id = path.stem
            venue_set.add(venue)
            season_set.add(season)
            match_winners[match_id] = winner

            for innings_index, innings in enumerate(innings_for(match), start=1):
                batting_team_original = innings.get("team") or "Unknown team"
                batting_team = canonical_team(batting_team_original)
                team_set.add(batting_team)
                active_pair = None
                partnership_runs = 0
                partnership_balls = 0
                batter_runs = defaultdict(int)
                batter_balls = defaultdict(int)
                fours = 0
                sixes = 0
                dots = 0
                extras_total = 0
                wickets_fallen = 0
                partnership_number = 0
                over_buckets = {}

                def close_partnership(completed_by_wicket=False):
                    nonlocal partnership_number, partnership_runs, partnership_balls
                    nonlocal batter_runs, batter_balls, fours, sixes, dots, extras_total, over_buckets
                    if not active_pair:
                        return
                    a, b = active_pair
                    if not a or not b or a == "Unknown" or b == "Unknown":
                        return
                    partnership_number += 1
                    total = partnership_runs
                    actual_wicket_number = wickets_fallen + 1
                    over_progression, phase_splits = finalize_progression(over_buckets, a, b)
                    row = {
                        "id": f"{match_id}-{innings_index}-{partnership_number}",
                        "partnership_number": partnership_number,
                        "match_id": match_id,
                        "date": date,
                        "season": season,
                        "venue": venue,
                        "venue_original": venue_original,
                        "team": batting_team,
                        "team_original": batting_team_original,
                        "opposition": next((t for t in teams if t != batting_team), "Unknown"),
                        "opposition_original": next((t for t in teams_original if t != batting_team_original), "Unknown"),
                        "innings": innings_index,
                        "wicket_number": actual_wicket_number,
                        "batter1": a,
                        "batter2": b,
                        "pair": f"{a} & {b}",
                        "runs": total,
                        "balls": partnership_balls,
                        "run_rate": round(total * 6 / partnership_balls, 3) if partnership_balls else None,
                        "batter1_runs": batter_runs.get(a, 0),
                        "batter2_runs": batter_runs.get(b, 0),
                        "batter1_balls": batter_balls.get(a, 0),
                        "batter2_balls": batter_balls.get(b, 0),
                        "extras": extras_total,
                        "fours": fours,
                        "sixes": sixes,
                        "dot_balls": dots,
                        "deliveries": sum(x.get("deliveries", x.get("legal_balls", 0)) for x in over_buckets.values()),
                        "start_over": min(over_buckets) if over_buckets else None,
                        "end_over": max(over_buckets) if over_buckets else None,
                        "duration_overs": len(over_buckets),
                        "boundary_runs": fours * 4 + sixes * 6,
                        "boundary_count": fours + sixes,
                        "boundary_run_pct": round((fours * 4 + sixes * 6) * 100 / total, 2) if total else None,
                        "dot_ball_pct": round(dots * 100 / sum(x.get("deliveries", x.get("legal_balls", 0)) for x in over_buckets.values()), 2) if sum(x.get("deliveries", x.get("legal_balls", 0)) for x in over_buckets.values()) else None,
                        "extras_pct": round(extras_total * 100 / total, 2) if total else None,
                        "batter1_contribution_pct": round(batter_runs.get(a, 0) * 100 / total, 2) if total else None,
                        "batter2_contribution_pct": round(batter_runs.get(b, 0) * 100 / total, 2) if total else None,
                        "ended_by_wicket": bool(completed_by_wicket),
                        "over_progression": over_progression,
                        "phase_splits": phase_splits,
                    }
                    partnerships.append(row)
                    wa = wicket_agg[actual_wicket_number]
                    wa["partnerships"] += 1
                    wa["runs"] += total
                    wa["balls"] += partnership_balls
                    partnership_runs = 0
                    partnership_balls = 0
                    batter_runs = defaultdict(int)
                    batter_balls = defaultdict(int)
                    fours = sixes = dots = extras_total = 0
                    over_buckets = {}

                for over_no, delivery in deliveries_for(innings):
                    striker_raw = delivery.get("batter", delivery.get("batsman"))
                    non_striker_raw = delivery.get("non_striker", delivery.get("non-striker"))
                    striker = person_name(striker_raw, registry, reverse_registry)
                    non_striker = person_name(non_striker_raw, registry, reverse_registry)
                    observed_pair = (striker, non_striker) if striker_raw and non_striker_raw else None

                    # The next delivery after a wicket identifies the incoming batter.
                    if observed_pair and (active_pair is None or set(observed_pair) != set(active_pair)):
                        if active_pair is not None and partnership_runs == 0 and partnership_balls == 0:
                            active_pair = observed_pair
                        elif active_pair is None:
                            active_pair = observed_pair
                        elif partnership_runs == 0 and partnership_balls == 0:
                            active_pair = observed_pair

                    if active_pair is None and observed_pair:
                        active_pair = observed_pair

                    runs_obj = delivery.get("runs") or {}
                    extras_obj = delivery.get("extras") or {}
                    batter_run = as_int(runs_obj.get("batter", runs_obj.get("batsman", 0)))
                    total_run = as_int(runs_obj.get("total", 0))
                    wides = as_int(extras_obj.get("wides", 0))
                    no_balls = as_int(extras_obj.get("noballs", extras_obj.get("no_balls", 0)))
                    extras = max(0, total_run - batter_run)
                    legal_ball = wides == 0 and no_balls == 0

                    # Store delivery-level contributions within this partnership's over.
                    over_item = over_buckets.setdefault(over_no, {
                        "runs": 0, "legal_balls": 0, "deliveries": 0, "batter_runs": defaultdict(int),
                        "extras": 0, "dot_balls": 0, "fours": 0, "sixes": 0,
                    })
                    over_item["runs"] += total_run
                    over_item["legal_balls"] += int(legal_ball)
                    over_item["deliveries"] += 1
                    over_item["extras"] += extras
                    over_item["dot_balls"] += int(total_run == 0)
                    over_item["fours"] += int(batter_run == 4)
                    over_item["sixes"] += int(batter_run == 6)
                    if striker_raw:
                        over_item["batter_runs"][striker] += batter_run

                    partnership_runs += total_run
                    extras_total += extras
                    if legal_ball:
                        partnership_balls += 1
                    if striker_raw:
                        batter_runs[striker] += batter_run
                        if wides == 0:
                            batter_balls[striker] += 1
                    if batter_run == 4:
                        fours += 1
                    elif batter_run == 6:
                        sixes += 1
                    if total_run == 0:
                        dots += 1

                    wickets = delivery.get("wickets")
                    if wickets is None:
                        one = delivery.get("wicket")
                        wickets = [one] if isinstance(one, dict) else []
                    valid_wickets = [
                        w for w in wickets
                        if isinstance(w, dict) and str(w.get("kind", "")).lower() not in NOT_A_WICKET
                    ]
                    if valid_wickets:
                        close_partnership(completed_by_wicket=True)
                        wickets_fallen += len(valid_wickets)
                        # New pair will be identified by the next delivery.
                        active_pair = None

                if active_pair is not None and (partnership_runs > 0 or partnership_balls > 0):
                    close_partnership(completed_by_wicket=False)

            parsed += 1
            if file_index % 100 == 0 or file_index == len(files):
                print(f"  Processed {file_index:,}/{len(files):,} matches", flush=True)

        except Exception as exc:
            errors.append({"file": path.name, "error": str(exc)[:240]})

    # Add match wins after all records are known.
    for row in partnerships:
        row["team_won"] = match_winners.get(row["match_id"]) == row["team"]

    pair_rows, pair_contexts = build_pair_intelligence(partnerships)
    team_opposition_data = build_team_opposition_intelligence(partnerships)
    venue_wicket_data = build_venue_and_wicket_intelligence(partnerships)

    wicket_rows = []
    for wicket, agg in sorted(wicket_agg.items()):
        wicket_rows.append({
            "wicket_number": wicket, "partnerships": agg["partnerships"],
            "runs": agg["runs"],
            "average_runs": round(agg["runs"] / agg["partnerships"], 3) if agg["partnerships"] else None,
            "balls": agg["balls"],
            "run_rate": round(agg["runs"] * 6 / agg["balls"], 3) if agg["balls"] else None,
        })

    # Aggregate team and venue context directly from innings partnership rows.
    team_rows = defaultdict(lambda: {"partnerships": 0, "runs": 0, "balls": 0, "matches": set()})
    venue_rows = defaultdict(lambda: {"partnerships": 0, "runs": 0, "balls": 0, "matches": set()})
    for row in partnerships:
        for store, key in ((team_rows, row["team"]), (venue_rows, row["venue"])):
            store[key]["partnerships"] += 1
            store[key]["runs"] += row["runs"]
            store[key]["balls"] += row["balls"]
            store[key]["matches"].add(row["match_id"])

    # Phase-level partnership records and aggregates for phase/team/season/opposition/venue analysis.
    phase_partnerships = []
    phase_agg = defaultdict(lambda: {
        "partnerships": 0, "runs": 0, "balls": 0, "extras": 0,
        "dot_balls": 0, "fours": 0, "sixes": 0, "matches": set(),
    })
    phase_context = defaultdict(lambda: {
        "partnerships": 0, "runs": 0, "balls": 0, "matches": set(),
    })
    for row in partnerships:
        for split in row.get("phase_splits", []):
            phase_row = {
                "partnership_id": row["id"], "match_id": row["match_id"],
                "date": row["date"], "season": row["season"],
                "team": row["team"], "opposition": row["opposition"],
                "venue": row["venue"], "innings": row["innings"],
                "wicket_number": row["wicket_number"],
                "batter1": row["batter1"], "batter2": row["batter2"],
                "pair": row["pair"], **split,
            }
            phase_partnerships.append(phase_row)
            agg = phase_agg[split["phase"]]
            agg["partnerships"] += 1
            agg["runs"] += split["runs"]
            agg["balls"] += split["legal_balls"]
            for key in ("extras", "dot_balls", "fours", "sixes"):
                agg[key] += split[key]
            agg["matches"].add(row["match_id"])
            for dimension, value in (("team", row["team"]), ("season", row["season"]),
                                     ("opposition", row["opposition"]), ("venue", row["venue"])):
                ctx = phase_context[(split["phase"], dimension, value)]
                ctx["partnerships"] += 1
                ctx["runs"] += split["runs"]
                ctx["balls"] += split["legal_balls"]
                ctx["matches"].add(row["match_id"])

    by_phase = []
    for phase in ("Powerplay", "Middle", "Death"):
        if phase not in phase_agg:
            continue
        agg = phase_agg[phase]
        by_phase.append({
            "phase": phase, "partnerships": agg["partnerships"],
            "matches": len(agg["matches"]), "runs": agg["runs"],
            "balls": agg["balls"],
            "average_runs": round(agg["runs"] / agg["partnerships"], 3) if agg["partnerships"] else None,
            "run_rate": round(agg["runs"] * 6 / agg["balls"], 3) if agg["balls"] else None,
            "extras": agg["extras"], "dot_balls": agg["dot_balls"],
            "fours": agg["fours"], "sixes": agg["sixes"],
        })

    by_phase_context = []
    for (phase, dimension, value), agg in phase_context.items():
        by_phase_context.append({
            "phase": phase, "dimension": dimension, "value": value,
            "partnerships": agg["partnerships"], "matches": len(agg["matches"]),
            "runs": agg["runs"], "balls": agg["balls"],
            "average_runs": round(agg["runs"] / agg["partnerships"], 3) if agg["partnerships"] else None,
            "run_rate": round(agg["runs"] * 6 / agg["balls"], 3) if agg["balls"] else None,
        })

    def finalize_context(store, key_name):
        out = []
        for key, agg in store.items():
            out.append({
                key_name: key, "matches": len(agg["matches"]),
                "partnerships": agg["partnerships"], "runs": agg["runs"],
                "balls": agg["balls"],
                "average_runs": round(agg["runs"] / agg["partnerships"], 3) if agg["partnerships"] else None,
                "run_rate": round(agg["runs"] * 6 / agg["balls"], 3) if agg["balls"] else None,
            })
        return sorted(out, key=lambda x: x["runs"], reverse=True)

    payload = {
        "meta": {
            "generated": datetime.now().isoformat(timespec="seconds"),
            "matches_parsed": parsed, "yaml_files_found": len(files),
            "partnerships": len(partnerships), "pairs": len(pair_rows),
            "seasons": sorted(season_set), "teams": sorted(team_set), "venues": sorted(venue_set),
            "source": "Cricsheet YAML ball-by-ball",
            "notes": [
                "Partnership runs include all team runs scored while the pair was together, including extras.",
                "Partnership balls count legal deliveries only (wides and no-balls excluded).",
                "A partnership closes on a recorded dismissal; unfinished final partnerships are retained.",
                "Wicket number is based on wickets already fallen; partnership_number is a separate sequence within the innings.",
                "Phase boundaries are overs 1-6 Powerplay, 7-15 Middle, and 16+ Death.",
                "Over progression records only deliveries faced while the partnership was active; one over may appear in multiple partnerships.",
                "Team and opposition summaries aggregate partnership records; win rate is based on distinct matches represented in those records.",
                "Team-opposition summaries are directional: team is the batting side and opposition is the opposing franchise.",
                "Venue and wicket intelligence are derived from completed partnership records; wicket phase rows represent phase segments, not unique partnerships.",
                "Pair identity is ordered as the two batters at the start of that partnership.",
                "Records cover the first two non-super-over innings only.",
                "Canonical team and venue labels are used for analytics; original source labels are retained in *_original fields."
            ]
        },
        "partnerships": partnerships,
        "pairs": pair_rows,
        "pair_contexts": pair_contexts,
        "team_intelligence": team_opposition_data["team"],
        "team_season_intelligence": team_opposition_data["team_season"],
        "opposition_intelligence": team_opposition_data["team_opposition"],
        "team_opposition_season": team_opposition_data["team_opposition_season"],
        "venue_intelligence": venue_wicket_data["venue_intelligence"],
        "venue_season_intelligence": venue_wicket_data["venue_season_intelligence"],
        "venue_team_intelligence": venue_wicket_data["venue_team_intelligence"],
        "venue_opposition_intelligence": venue_wicket_data["venue_opposition_intelligence"],
        "wicket_intelligence": venue_wicket_data["wicket_intelligence"],
        "wicket_team_intelligence": venue_wicket_data["wicket_team_intelligence"],
        "wicket_phase_intelligence": venue_wicket_data["wicket_phase_intelligence"],
        "by_wicket": wicket_rows,
        "by_team": finalize_context(team_rows, "team"),
        "by_venue": finalize_context(venue_rows, "venue"),
        "by_phase": by_phase,
        "phase_partnerships": phase_partnerships,
        "by_phase_context": by_phase_context,
        "errors": errors,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    temp = OUT.with_suffix(".json.tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temp.replace(OUT)
    print("\nPARTNERSHIP INTELLIGENCE EXPORT COMPLETE")
    print(f"YAML files found : {len(files):,}")
    print(f"Matches parsed   : {parsed:,}")
    print(f"Partnerships     : {len(partnerships):,}")
    print(f"Player pairs     : {len(pair_rows):,}")
    print(f"Seasons          : {min(season_set) if season_set else 'n/a'}–{max(season_set) if season_set else 'n/a'}")
    print(f"Parse errors     : {len(errors):,}")
    print(f"Output           : {OUT}")


if __name__ == "__main__":
    main()

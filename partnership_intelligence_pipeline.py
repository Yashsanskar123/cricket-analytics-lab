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
    pair_agg = defaultdict(lambda: {
        "partnerships": 0, "runs": 0, "balls": 0, "not_out": 0,
        "fifties": 0, "hundreds": 0, "wins": 0, "matches": set()
    })
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
                innings_runs = 0

                def close_partnership(completed_by_wicket=False):
                    nonlocal partnership_number, partnership_runs, partnership_balls
                    nonlocal batter_runs, batter_balls, fours, sixes, dots, extras_total
                    if not active_pair:
                        return
                    a, b = active_pair
                    if not a or not b or a == "Unknown" or b == "Unknown":
                        return
                    partnership_number += 1
                    total = partnership_runs
                    row = {
                        "id": f"{match_id}-{innings_index}-{partnership_number}",
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
                        "wicket_number": partnership_number,
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
                        "ended_by_wicket": bool(completed_by_wicket),
                    }
                    partnerships.append(row)
                    # Aggregate the same pair together regardless of batting order.
                    key = tuple(sorted((a, b)))
                    agg = pair_agg[key]
                    agg["partnerships"] += 1
                    agg["runs"] += total
                    agg["balls"] += partnership_balls
                    agg["not_out"] += 0 if completed_by_wicket else 1
                    agg["fifties"] += int(total >= 50)
                    agg["hundreds"] += int(total >= 100)
                    agg["matches"].add(match_id)
                    wa = wicket_agg[partnership_number]
                    wa["partnerships"] += 1
                    wa["runs"] += total
                    wa["balls"] += partnership_balls
                    partnership_runs = 0
                    partnership_balls = 0
                    batter_runs = defaultdict(int)
                    batter_balls = defaultdict(int)
                    fours = sixes = dots = extras_total = 0

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

                    partnership_runs += total_run
                    innings_runs += total_run
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

    pair_rows = []
    for (a, b), agg in pair_agg.items():
        pair_rows.append({
            "batter1": a, "batter2": b, "pair": f"{a} & {b}",
            "partnerships": agg["partnerships"], "matches": len(agg["matches"]),
            "runs": agg["runs"], "balls": agg["balls"],
            "average_runs": round(agg["runs"] / agg["partnerships"], 3) if agg["partnerships"] else None,
            "run_rate": round(agg["runs"] * 6 / agg["balls"], 3) if agg["balls"] else None,
            "fifties": agg["fifties"], "hundreds": agg["hundreds"],
            "not_out_partnerships": agg["not_out"],
        })
    pair_rows.sort(key=lambda x: (x["runs"], x["partnerships"]), reverse=True)

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
                "Pair identity is ordered as the two batters at the start of that partnership.",
                "Records cover the first two non-super-over innings only.",
                "Canonical team and venue labels are used for analytics; original source labels are retained in *_original fields."
            ]
        },
        "partnerships": partnerships,
        "pairs": pair_rows,
        "by_wicket": wicket_rows,
        "by_team": finalize_context(team_rows, "team"),
        "by_venue": finalize_context(venue_rows, "venue"),
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

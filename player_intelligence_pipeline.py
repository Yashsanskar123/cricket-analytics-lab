"""Build all-season IPL Player Intelligence exports from Cricsheet YAML.

Run from the repository root:
    python player_intelligence_pipeline.py

Reads data/raw/*.yaml (also searches data/ recursively) and writes:
    dashboard/public/data/player_intelligence.json

No model training, no backend, and no changes to existing notebook exports.
"""
from __future__ import annotations
import json, math, re, sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

try:
    import yaml
except ImportError:
    print("Missing dependency: PyYAML. Install with: pip install pyyaml")
    raise SystemExit(1)

ROOT = Path(__file__).resolve().parent
DATA_ROOT = ROOT / "data"
OUT = ROOT / "dashboard" / "public" / "data" / "player_intelligence.json"
NOT_A_WICKET = {"retired hurt", "retired not out"}
BOWLER_WICKET_KINDS = {"bowled", "caught", "lbw", "stumped", "caught and bowled", "hit wicket"}


def deliveries_for(inn):
    if isinstance(inn.get("deliveries"), list):
        for item in inn["deliveries"]:
            if isinstance(item, dict) and item:
                key, delivery = next(iter(item.items()))
                # Cricsheet's legacy format stores the over.ball key outside the delivery.
                if isinstance(delivery, dict):
                    yield {**delivery, "_over": key}
    elif isinstance(inn.get("overs"), list):
        for over_index, over in enumerate(inn["overs"]):
            over_number = over.get("over", over_index)
            for d in over.get("deliveries", []):
                if isinstance(d, dict):
                    yield {**d, "_over": over_number}


def innings_for(match):
    out = []
    for item in match.get("innings", []):
        if not isinstance(item, dict):
            continue
        if "team" in item:
            if not item.get("super_over"):
                out.append(item)
        elif item:
            name, inn = next(iter(item.items()))
            if name in ("1st innings", "2nd innings") and isinstance(inn, dict):
                out.append(inn)
    return out[:2]


def num(x):
    try:
        v = float(x or 0)
        return v if math.isfinite(v) else 0.0
    except (TypeError, ValueError):
        return 0.0


def phase_for(over_no):
    if over_no <= 6: return "Powerplay"
    if over_no <= 15: return "Middle"
    return "Death"


def is_batter_boundary(delivery, boundary_runs):
    """Return True only when batter runs qualify as an actual boundary.

    Cricsheet's non_boundary flag marks runs completed without the ball
    reaching the boundary. Such runs still count toward batter runs, but
    must not be credited as a four or six.
    """
    runs = delivery.get("runs") or {}
    extras = delivery.get("extras") or {}
    batter_runs = int(num(runs.get("batter", runs.get("batsman", 0))))
    wides = int(num(extras.get("wides", 0)))
    return (
        batter_runs == boundary_runs
        and wides == 0
        and not bool(delivery.get("non_boundary", False))
    )


def batting_participants_for_innings(inn, registry):
    """Players recorded at the crease during at least one delivery of an innings.

    Cricsheet identifies the striker and non-striker on each delivery. This
    excludes unused players in the XI, while acknowledging that a batter who
    entered and faced no delivery cannot be identified from ball-by-ball data.
    """
    participants = set()
    for delivery in deliveries_for(inn):
        batter = delivery.get("batter", delivery.get("batsman"))
        non_striker = delivery.get("non_striker", delivery.get("non-striker"))
        for player_name in (batter, non_striker):
            if player_name:
                participants.add(str(registry.get(player_name, player_name)))
    return participants


def build_batting_innings_rows(inn, registry, match_id, date, season, venue,
                               batting_team, opponent, innings_number):
    """Build one batting scorecard row per player who appeared at the crease.

    Batting position is inferred from first appearance in delivery order. The
    order of the two opening batters can be ambiguous in ball-by-ball data.
    """
    order = []
    stats = {}

    for raw in deliveries_for(inn):
        batter = raw.get("batter", raw.get("batsman"))
        non_striker = raw.get("non_striker", raw.get("non-striker"))
        if not batter:
            continue

        batter_id = str(registry.get(batter, batter))
        non_striker_id = str(registry.get(non_striker, non_striker)) if non_striker else None

        for pid in (batter_id, non_striker_id):
            if pid and pid not in stats:
                order.append(pid)
                stats[pid] = {"runs": 0, "balls": 0, "fours": 0, "sixes": 0,
                              "dismissals": 0, "dismissal_types": []}

        runs = raw.get("runs") or {}
        extras = raw.get("extras") or {}
        batter_runs = int(num(runs.get("batter", runs.get("batsman", 0))))
        wides = int(num(extras.get("wides", 0)))
        stats[batter_id]["runs"] += batter_runs
        if wides == 0:
            stats[batter_id]["balls"] += 1
        if is_batter_boundary(raw, 4):
            stats[batter_id]["fours"] += 1
        if is_batter_boundary(raw, 6):
            stats[batter_id]["sixes"] += 1

        wickets = raw.get("wickets")
        if wickets is None:
            one = raw.get("wicket")
            wickets = [one] if isinstance(one, dict) else []
        for wicket in wickets:
            if not isinstance(wicket, dict) or wicket.get("kind") in NOT_A_WICKET:
                continue
            player_out = wicket.get("player_out")
            if player_out:
                out_id = str(registry.get(player_out, player_out))
                if out_id not in stats:
                    order.append(out_id)
                    stats[out_id] = {"runs": 0, "balls": 0, "fours": 0, "sixes": 0,
                                     "dismissals": 0, "dismissal_types": []}
                stats[out_id]["dismissals"] += 1
                stats[out_id]["dismissal_types"].append(wicket.get("kind", "unknown"))

    rows = []
    for position, pid in enumerate(order, start=1):
        line = stats[pid]
        rows.append({
            "match_id": match_id, "date": date, "season": season,
            "player_id": pid, "player": next(
                (name for name, player_id in registry.items() if str(player_id) == pid), pid
            ),
            "batting_team": batting_team, "opponent": opponent,
            "venue": venue, "innings_number": innings_number,
            "batting_position_inferred": position,
            "runs": line["runs"], "balls": line["balls"],
            "fours": line["fours"], "sixes": line["sixes"],
            "strike_rate": safe_div(line["runs"] * 100, line["balls"]),
            "dismissals": line["dismissals"],
            "dismissal_types": line["dismissal_types"],
            "status": "out" if line["dismissals"] else "not_out",
        })
    return rows


def build_bowling_innings_rows(inn, registry, match_id, date, season, venue,
                               bowling_team, opponent, innings_number):
    """Build one bowling-innings line per bowler in this innings."""
    stats = {}
    over_stats = defaultdict(lambda: {"legal_balls": 0, "runs_conceded": 0})
    for raw in deliveries_for(inn):
        bowler = raw.get("bowler")
        if not bowler:
            continue
        pid = str(registry.get(bowler, bowler))
        line = stats.setdefault(pid, {"runs_conceded": 0, "balls": 0, "wickets": 0,
                                      "dots": 0, "fours_conceded": 0,
                                      "sixes_conceded": 0, "maidens": 0})
        runs = raw.get("runs") or {}
        extras = raw.get("extras") or {}
        total = int(num(runs.get("total", 0)))
        batter_runs = int(num(runs.get("batter", runs.get("batsman", 0))))
        wides = int(num(extras.get("wides", 0)))
        noballs = int(num(extras.get("noballs", 0)))
        byes = int(num(extras.get("byes", 0)) + num(extras.get("legbyes", 0))
                   + num(extras.get("penalty", 0)))
        conceded = max(0, total - byes)
        line["runs_conceded"] += conceded
        if wides == 0 and noballs == 0:
            line["balls"] += 1
        if batter_runs == 0 and total == 0:
            line["dots"] += 1
        if is_batter_boundary(raw, 4):
            line["fours_conceded"] += 1
        if is_batter_boundary(raw, 6):
            line["sixes_conceded"] += 1
        over_key = raw.get("_over", raw.get("over", 0))
        if isinstance(over_key, str):
            try:
                over_key = float(over_key.split(".")[0])
            except (TypeError, ValueError):
                over_key = 0
        over_no = int(num(over_key)) + 1
        over_line = over_stats[(over_no, pid)]
        over_line["runs_conceded"] += conceded
        if wides == 0 and noballs == 0:
            over_line["legal_balls"] += 1
        wickets = raw.get("wickets")
        if wickets is None:
            one = raw.get("wicket")
            wickets = [one] if isinstance(one, dict) else []
        line["wickets"] += sum(
            1 for w in wickets if isinstance(w, dict)
            and w.get("kind") in BOWLER_WICKET_KINDS
        )
    for (over_no, pid), over_line in over_stats.items():
        if over_line["legal_balls"] == 6 and over_line["runs_conceded"] == 0:
            stats[pid]["maidens"] += 1
    rows = []
    for pid, line in stats.items():
        balls, wickets = line["balls"], line["wickets"]
        rows.append({
            "match_id": match_id, "date": date, "season": season,
            "player_id": pid,
            "player": next((n for n, player_id in registry.items()
                            if str(player_id) == pid), pid),
            "bowling_team": bowling_team, "opponent": opponent,
            "venue": venue, "innings_number": innings_number,
            "runs_conceded": line["runs_conceded"], "balls": balls,
            "overs": f"{balls // 6}.{balls % 6}", "wickets": wickets,
            "maidens": line["maidens"],
            "economy": safe_div(line["runs_conceded"] * 6, balls),
            "average": safe_div(line["runs_conceded"], wickets),
            "strike_rate": safe_div(balls, wickets),
            "dots": line["dots"], "dot_pct": safe_div(line["dots"] * 100, balls),
            "fours_conceded": line["fours_conceded"],
            "sixes_conceded": line["sixes_conceded"],
        })
    return rows


def summarize_batting_innings(rows):
    scores = [int(r["runs"]) for r in rows]
    if not rows:
        return {"innings": 0, "highest_score": 0, "thirties": 0, "fifties": 0,
                "hundreds": 0, "not_out_innings": 0, "average_runs_per_innings": None,
                "scoring_distribution": {"0_9": 0, "10_29": 0, "30_49": 0,
                                         "50_99": 0, "100_plus": 0}}
    return {
        "innings": len(rows), "highest_score": max(scores),
        "thirties": sum(30 <= x < 50 for x in scores),
        "fifties": sum(50 <= x < 100 for x in scores),
        "hundreds": sum(x >= 100 for x in scores),
        "not_out_innings": sum(r["status"] == "not_out" for r in rows),
        "average_runs_per_innings": safe_div(sum(scores), len(scores)),
        "scoring_distribution": {
            "0_9": sum(0 <= x <= 9 for x in scores),
            "10_29": sum(10 <= x <= 29 for x in scores),
            "30_49": sum(30 <= x < 50 for x in scores),
            "50_99": sum(50 <= x < 100 for x in scores),
            "100_plus": sum(x >= 100 for x in scores),
        },
    }


def summarize_bowling_innings(rows):
    if not rows:
        return {"innings": 0, "wickets": 0, "best_figures": None,
                "three_wicket_hauls": 0, "four_wicket_hauls": 0,
                "five_wicket_hauls": 0, "maidens": 0,
                "average_economy": None, "dot_pct": None}
    balls = sum(int(r["balls"]) for r in rows)
    dots = sum(int(r["dots"]) for r in rows)
    runs = sum(int(r["runs_conceded"]) for r in rows)
    wickets = sum(int(r["wickets"]) for r in rows)
    best = max(rows, key=lambda r: (int(r["wickets"]), -int(r["runs_conceded"])))
    return {
        "innings": len(rows), "wickets": wickets,
        "best_figures": {"wickets": int(best["wickets"]),
                         "runs_conceded": int(best["runs_conceded"])},
        "three_wicket_hauls": sum(r["wickets"] == 3 for r in rows),
        "four_wicket_hauls": sum(r["wickets"] == 4 for r in rows),
        "five_wicket_hauls": sum(r["wickets"] >= 5 for r in rows),
        "maidens": sum(int(r["maidens"]) for r in rows),
        "average_economy": safe_div(runs * 6, balls),
        "dot_pct": safe_div(dots * 100, balls),
    }


def fresh_bat():
    return defaultdict(float, {"runs":0,"balls":0,"dismissals":0,"fours":0,"sixes":0,"dot_balls":0,"innings":0})

def fresh_bowl():
    return defaultdict(float, {"runs":0,"balls":0,"wickets":0,"maidens":0,"dots":0,"fours":0,"sixes":0})

def add_line(store, key, factory):
    if key not in store: store[key] = factory()
    return store[key]

def fresh_matchup():
    return {"balls": 0, "runs": 0, "dismissals": 0, "fours": 0,
            "sixes": 0, "dot_balls": 0, "dismissal_types": defaultdict(int)}

def add_matchup_delivery(store, key, raw, batter_runs, wides, credited_wickets):
    """Accumulate one batter-vs-bowler delivery.

    Matchup balls exclude wides. Dot balls use the batting dot-ball definition:
    zero batter runs and no wide; a no-ball with zero batter runs is a dot.
    Only bowler-credited wickets count as matchup dismissals.
    """
    line = add_line(store, key, fresh_matchup)
    line["balls"] += int(wides == 0)
    line["runs"] += batter_runs
    line["dot_balls"] += int(batter_runs == 0 and wides == 0)
    line["fours"] += int(is_batter_boundary(raw, 4))
    line["sixes"] += int(is_batter_boundary(raw, 6))
    for wicket in credited_wickets:
        line["dismissals"] += 1
        line["dismissal_types"][str(wicket.get("kind", "unknown"))] += 1
    return line

def finalize_matchup_line(line):
    balls = int(line["balls"])
    runs = int(line["runs"])
    dismissals = int(line["dismissals"])
    fours = int(line["fours"])
    sixes = int(line["sixes"])
    return {
        "balls": balls, "runs": runs, "dismissals": dismissals,
        "strike_rate": safe_div(runs * 100, balls),
        "average": safe_div(runs, dismissals),
        "fours": fours, "sixes": sixes,
        "boundary_runs": 4 * fours + 6 * sixes,
        "dot_balls": int(line["dot_balls"]),
        "dot_pct": safe_div(line["dot_balls"] * 100, balls),
        "dismissal_types": dict(sorted(line["dismissal_types"].items())),
    }

def safe_div(a,b): return round(a/b, 3) if b else None

def apply_maiden_overs(over_stats, match_bowl, match_phase_bowl):
    """Add completed maiden overs to match and phase bowling aggregates.

    An over is a maiden when the same bowler delivers six legal balls and
    concedes zero runs charged to the bowler. Wides and no-balls are charged
    runs and prevent a maiden; byes, leg-byes and penalty runs are not charged.
    """
    for (over_no, bowler_id), stats in over_stats.items():
        if stats["legal_balls"] == 6 and stats["runs_conceded"] == 0:
            match_bowl[bowler_id]["maidens"] += 1
            match_phase_bowl[(bowler_id, phase_for(over_no))]["maidens"] += 1

def finalize_bat(x, include_innings=True):
    result = {"runs":int(x["runs"]),"balls":int(x["balls"]),"dismissals":int(x["dismissals"]),
            "average":safe_div(x["runs"],x["dismissals"]),"strike_rate":safe_div(x["runs"]*100,x["balls"]),
            "fours":int(x["fours"]),"sixes":int(x["sixes"]),"dot_balls":int(x["dot_balls"]),
            "boundary_runs":int(4*x["fours"]+6*x["sixes"]),
            "dot_pct":safe_div(x["dot_balls"]*100,x["balls"]),
            "boundary_pct":safe_div((x["fours"]+x["sixes"])*100,x["balls"])}
    if include_innings:
        result["innings"] = int(x["innings"])
    return result

def finalize_bowl(x):
    balls=int(x["balls"]); runs=int(x["runs"]); wk=int(x["wickets"])
    return {"runs_conceded":runs,"balls":balls,"overs":f"{balls//6}.{balls%6}","wickets":wk,
            "economy":safe_div(runs*6,balls),"average":safe_div(runs,wk),"strike_rate":safe_div(balls,wk),
            "maidens":int(x["maidens"]),"dots":int(x["dots"]),"fours_conceded":int(x["fours"]),"sixes_conceded":int(x["sixes"]),
            "dot_pct":safe_div(x["dots"]*100,balls)}


def percentile_rank(value, peers, direction="higher"):
    """Percentile among comparable peers; require at least five peers.

    Ties receive the midrank percentile. A 0-100 result is returned.
    """
    if value is None:
        return None
    clean=[]
    for peer in peers:
        try:
            number=float(peer)
            if math.isfinite(number): clean.append(number)
        except (TypeError, ValueError):
            continue
    if len(clean) < 5:
        return None
    try: value=float(value)
    except (TypeError, ValueError): return None
    if not math.isfinite(value): return None
    if direction == "lower":
        pct=sum(x >= value for x in clean) / len(clean) * 100
    else:
        pct=sum(x <= value for x in clean) / len(clean) * 100
    return round(pct, 1)


def build_comparison_and_scouting(players):
    """Attach role-aware peer percentiles, explainable scouting and peers."""
    metric_specs={
        "Batter": [("batting.average", "batting", "average", "higher"),
                   ("batting.strike_rate", "batting", "strike_rate", "higher"),
                   ("batting.dot_pct", "batting", "dot_pct", "lower"),
                   ("batting.boundary_pct", "batting", "boundary_pct", "higher")],
        "Bowler": [("bowling.economy", "bowling", "economy", "lower"),
                   ("bowling.average", "bowling", "average", "lower"),
                   ("bowling.strike_rate", "bowling", "strike_rate", "lower"),
                   ("bowling.dot_pct", "bowling", "dot_pct", "higher")],
        "All-rounder": [("batting.average", "batting", "average", "higher"),
                        ("batting.strike_rate", "batting", "strike_rate", "higher"),
                        ("bowling.economy", "bowling", "economy", "lower"),
                        ("bowling.strike_rate", "bowling", "strike_rate", "lower")],
    }
    groups=defaultdict(list)
    for player in players: groups[player.get("role", "Other")].append(player)
    for role, group in groups.items():
        specs=metric_specs.get(role, [])
        for player in group:
            percentiles={}
            for key, section, metric, direction in specs:
                value=(player.get(section) or {}).get(metric)
                peers=[(other.get(section) or {}).get(metric) for other in group
                       if other.get("id") != player.get("id") and
                       (other.get(section) or {}).get(metric) is not None]
                rank=percentile_rank(value, peers, direction)
                if rank is not None: percentiles[key]=rank
            player["peer_percentiles"]=percentiles

            batting=player.get("batting") or {}; bowling=player.get("bowling") or {}
            archetypes=[]; strengths=[]; development=[]
            if role in ("Batter", "All-rounder") and player.get("workload",{}).get("batting_balls_per_match",0)>=5:
                if (batting.get("strike_rate") or 0)>=145:
                    archetypes.append("High-tempo scorer")
                if (batting.get("average") or 0)>=35:
                    archetypes.append("High-average batter")
                if (batting.get("boundary_pct") or 0)>=18:
                    archetypes.append("Boundary-focused batter")
                if (batting.get("dot_pct") or 0)<=28:
                    archetypes.append("Low-dot-ball batter")
            if role in ("Bowler", "All-rounder") and player.get("workload",{}).get("bowling_balls_per_match",0)>=6:
                if bowling.get("economy") is not None and bowling["economy"]<=7.5:
                    archetypes.append("Economical bowler")
                if bowling.get("wickets",0)>=30:
                    archetypes.append("Wicket-taking bowler")
                if bowling.get("dot_pct") is not None and bowling["dot_pct"]>=40:
                    archetypes.append("Dot-ball specialist")
            for key, value in player["peer_percentiles"].items():
                if value>=75: strengths.append(key)
                elif value<=25: development.append(key)
            player["scouting"]={
                "archetypes":archetypes,
                "strengths":strengths,
                "development_areas":development,
                "basis":"Career statistics and role-matched peer percentiles; descriptive, not predictive.",
            }

        # Similarity uses only percentile dimensions available for both players.
        for player in group:
            candidates=[]
            own=player.get("peer_percentiles",{})
            for other in group:
                if other.get("id")==player.get("id"): continue
                theirs=other.get("peer_percentiles",{})
                shared=sorted(set(own)&set(theirs))
                if not shared: continue
                distance=sum(abs(own[k]-theirs[k]) for k in shared)/len(shared)
                candidates.append((distance, other))
            candidates.sort(key=lambda item:item[0])
            player["similar_players"]=[{"player_id":other.get("id"),"name":other.get("name"),
                                         "role":other.get("role"),"similarity_distance":round(distance,2),
                                         "shared_metrics":len(set(own)&set(other.get("peer_percentiles",{})))}
                                        for distance,other in candidates[:5]]
    # Ensure every player receives all expected fields, including Other role.
    for player in players:
        player.setdefault("peer_percentiles", {})
        player.setdefault("scouting", {"archetypes":[],"strengths":[],"development_areas":[],
                                        "basis":"Insufficient role-specific evidence."})
        player.setdefault("similar_players", [])
    return players


def build_recruitment_intelligence(players, team_roster_map):
    """Build explainable role-fit candidates and observed team-squad audits.

    Team membership comes only from recorded Cricsheet XIs. The output does
    not claim current contracts, availability, auction value, or official roles.
    """
    by_id = {str(player.get("id")): player for player in players}
    by_role = defaultdict(list)
    for player in players:
        role = player.get("role", "Other")
        if role in ("Batter", "Bowler", "All-rounder"):
            by_role[role].append(player)

    recruitment_rows = []
    for player in players:
        role = player.get("role", "Other")
        if role not in ("Batter", "Bowler", "All-rounder"):
            player["recruitment"] = {"role": role, "replacement_candidates": [],
                                     "basis": "Insufficient role-specific workload."}
            continue
        own = player.get("peer_percentiles") or {}
        candidates = []
        for candidate in by_role[role]:
            if str(candidate.get("id")) == str(player.get("id")):
                continue
            theirs = candidate.get("peer_percentiles") or {}
            shared = sorted(set(own) & set(theirs))
            if not shared:
                continue
            distance = sum(abs(float(own[k]) - float(theirs[k])) for k in shared) / len(shared)
            candidates.append((distance, candidate, shared))
        candidates.sort(key=lambda item: (item[0], str(item[1].get("name", ""))))
        replacement_candidates = [{
            "player_id": str(candidate.get("id")),
            "name": candidate.get("name"),
            "role": candidate.get("role"),
            "similarity_distance": round(distance, 2),
            "shared_metrics": shared,
            "matches_role": True,
        } for distance, candidate, shared in candidates[:5]]
        player["recruitment"] = {
            "role": role,
            "replacement_candidates": replacement_candidates,
            "basis": "Same inferred role; ranked by mean absolute difference across shared role-peer percentile metrics.",
        }
        for rank, candidate in enumerate(replacement_candidates, start=1):
            recruitment_rows.append({"target_player_id": str(player.get("id")),
                                     "target_player": player.get("name"),
                                     "candidate_rank": rank, **candidate})

    team_squads = []
    for (team, season), player_ids in sorted(team_roster_map.items(), key=lambda x: (str(x[0][0]), str(x[0][1]))):
        roster = [by_id[pid] for pid in sorted(player_ids) if pid in by_id]
        role_counts = {"Batter": 0, "Bowler": 0, "All-rounder": 0, "Other": 0}
        for player in roster:
            role_counts[player.get("role", "Other")] = role_counts.get(player.get("role", "Other"), 0) + 1
        missing_roles = [role for role in ("Batter", "Bowler", "All-rounder") if role_counts.get(role, 0) == 0]
        # Suggestions describe role coverage only; they are not a recommended XI.
        suggested_roles = missing_roles[:]
        team_squads.append({
            "team": team, "season": season,
            "players_recorded_in_xi": len(roster),
            "role_counts": role_counts,
            "role_coverage_gaps": missing_roles,
            "suggested_recruitment_roles": suggested_roles,
            "roster": [{"player_id": p.get("id"), "name": p.get("name"),
                        "role": p.get("role")} for p in roster],
            "basis": "Distinct players listed in Cricsheet playing XIs for this team and season; roles inferred from career workload."
        })

    return {"player_recruitment": recruitment_rows,
            "team_squads": team_squads,
            "methodology": {
                "replacement_candidates": "Same inferred role; mean absolute difference across shared role-peer percentile metrics; maximum five candidates.",
                "team_rosters": "Players recorded in match XIs, grouped by team and season.",
                "limitations": ["Cricsheet data does not establish current contracts, availability, auction price, salary, injuries, nationality eligibility, or transfer intent.",
                               "Role counts are inferred from career workload and do not prove tactical suitability or batting-order position.",
                               "Role coverage gaps are descriptive flags, not a prescribed playing XI or squad quota."]
            }}

def main():
    if not DATA_ROOT.exists():
        print(f"Could not find data directory: {DATA_ROOT}"); raise SystemExit(1)
    files = sorted(set(DATA_ROOT.rglob("*.yaml")) | set(DATA_ROOT.rglob("*.yml")))
    if not files:
        print(f"No Cricsheet YAML files found under {DATA_ROOT}"); raise SystemExit(1)

    players = {}
    match_rows = []
    batting_innings_rows = []
    bowling_innings_rows = []
    season_player_bat = defaultdict(fresh_bat)
    season_player_bowl = defaultdict(fresh_bowl)
    career_bat = defaultdict(fresh_bat); career_bowl = defaultdict(fresh_bowl)
    phase_bat = defaultdict(fresh_bat); phase_bowl = defaultdict(fresh_bowl)
    match_player_seen = defaultdict(set)
    career_matchup = {}
    season_matchup = {}
    phase_matchup = {}
    team_seasons = defaultdict(set)
    team_roster_map = defaultdict(set)
    errors=[]; parsed=0

    for path in files:
        try:
            with path.open("r",encoding="utf-8") as f: match=yaml.safe_load(f)
            if not isinstance(match,dict): raise ValueError("root is not a mapping")
            info=match.get("info") or {}
            date=str((info.get("dates") or [""])[0])[:10]
            try: season=int(date[:4])
            except Exception: season=None
            registry=((info.get("registry") or {}).get("people") or {})
            for name,pid in registry.items(): players[str(pid)]={"id":str(pid),"name":name}
            inns=innings_for(match)
            if not inns: continue
            mid=str(path.stem); teams=[]; match_bat=defaultdict(fresh_bat); match_bowl=defaultdict(fresh_bowl)
            # Include every player named in the recorded XIs, even if they did not bat or bowl.
            for team_name, squad in (info.get("players") or {}).items():
                for player_name in squad:
                    pid=str(registry.get(player_name, player_name))
                    players.setdefault(pid,{"id":pid,"name":player_name})
                    if season is not None:
                        team_roster_map[(team_name, season)].add(pid)
                    match_bat[pid]  # create a zero batting line for appearance tracking
                    match_player_seen[pid].add(mid)
            match_phase_bat=defaultdict(fresh_bat); match_phase_bowl=defaultdict(fresh_bowl)
            matchups = {}
            season_matchups = {}
            phase_matchups = {}
            total_runs=[]
            for inn_idx,inn in enumerate(inns[:2],start=1):
                team=inn.get("team") or "Unknown"; teams.append(team)
                opponent = next((t for t in (info.get("teams") or []) if t != team), "Unknown")
                if season: team_seasons[(team,season)].add(mid)
                batting_innings_rows.extend(build_batting_innings_rows(
                    inn, registry, mid, date, season, info.get("venue") or "Unknown",
                    team, opponent, inn_idx
                ))
                bowling_innings_rows.extend(build_bowling_innings_rows(
                    inn, registry, mid, date, season, info.get("venue") or "Unknown",
                    opponent, team, inn_idx
                ))
                # Maiden calculations are scoped to one innings because over
                # numbers restart at zero in the second innings.
                over_bowling_stats = defaultdict(lambda: {"legal_balls": 0, "runs_conceded": 0})
                batting_participants = batting_participants_for_innings(inn, registry)
                for raw in deliveries_for(inn):
                    if not isinstance(raw,dict): continue
                    batter=raw.get("batter",raw.get("batsman")); bowler=raw.get("bowler")
                    if not batter: continue
                    batter_id=str(registry.get(batter,batter)); bowler_id=str(registry.get(bowler,bowler)) if bowler else "Unknown"
                    over_key=raw.get("_over",raw.get("over",0))
                    if isinstance(over_key,str):
                        try: over_key=float(over_key.split(".")[0])
                        except: over_key=0
                    over_no=int(num(over_key))+1
                    phase=phase_for(over_no)
                    runs=raw.get("runs") or {}; extras=raw.get("extras") or {}
                    bat_runs=int(num(runs.get("batter",runs.get("batsman",0))))
                    total=int(num(runs.get("total",0)))
                    wides=int(num(extras.get("wides",0))); noballs=int(num(extras.get("noballs",0)))
                    bye=int(num(extras.get("byes",0))+num(extras.get("legbyes",0))+num(extras.get("penalty",0)))
                    wk=raw.get("wickets")
                    if wk is None:
                        one=raw.get("wicket"); wk=[one] if isinstance(one,dict) else []
                    wk=[w for w in wk if isinstance(w,dict) and w.get("kind") not in NOT_A_WICKET]
                    out_ids=[str(registry.get(w.get("player_out"),w.get("player_out"))) for w in wk if w.get("player_out")]
                    credited=sum(1 for w in wk if w.get("kind") in BOWLER_WICKET_KINDS)
                    b=add_line(match_bat,batter_id,fresh_bat); bp=add_line(match_phase_bat,(batter_id,phase),fresh_bat)
                    if wides==0:
                        b["balls"]+=1; bp["balls"]+=1
                    b["runs"]+=bat_runs; bp["runs"]+=bat_runs
                    if is_batter_boundary(raw, 4): b["fours"]+=1; bp["fours"]+=1
                    if is_batter_boundary(raw, 6): b["sixes"]+=1; bp["sixes"]+=1
                    if bat_runs==0 and wides==0: b["dot_balls"]+=1; bp["dot_balls"]+=1
                    for out_id in out_ids:
                        ob=add_line(match_bat,out_id,fresh_bat); op=add_line(match_phase_bat,(out_id,phase),fresh_bat)
                        ob["dismissals"]+=1; op["dismissals"]+=1
                    bw=add_line(match_bowl,bowler_id,fresh_bowl); bwp=add_line(match_phase_bowl,(bowler_id,phase),fresh_bowl)
                    # Bowler concession excludes byes and leg-byes; wides/no-balls are charged.
                    conceded=max(0,total-bye)
                    bw["runs"]+=conceded; bwp["runs"]+=conceded
                    if bowler_id != "Unknown":
                        over_stats = over_bowling_stats[(over_no, bowler_id)]
                        over_stats["runs_conceded"] += conceded
                        if wides == 0 and noballs == 0:
                            over_stats["legal_balls"] += 1
                    if wides==0 and noballs==0: bw["balls"]+=1; bwp["balls"]+=1
                    bw["wickets"]+=credited; bwp["wickets"]+=credited
                    if bat_runs==0 and total==0: bw["dots"]+=1; bwp["dots"]+=1
                    if is_batter_boundary(raw, 4): bw["fours"]+=1; bwp["fours"]+=1
                    if is_batter_boundary(raw, 6): bw["sixes"]+=1; bwp["sixes"]+=1
                    if bowler_id != "Unknown":
                        pair = (batter_id, bowler_id)
                        credited_wickets = [w for w in wk if w.get("kind") in BOWLER_WICKET_KINDS]
                        add_matchup_delivery(matchups, pair, raw, bat_runs, wides, credited_wickets)
                        add_matchup_delivery(season_matchups, (batter_id, bowler_id, season),
                                             raw, bat_runs, wides, credited_wickets)
                        add_matchup_delivery(phase_matchups, (batter_id, bowler_id, season, phase),
                                             raw, bat_runs, wides, credited_wickets)
                apply_maiden_overs(over_bowling_stats, match_bowl, match_phase_bowl)
                for participant_id in batting_participants:
                    match_bat[participant_id]["innings"] += 1
                total_runs.append(sum(v["runs"] for v in match_bat.values()))
            if season is None: continue
            # Aggregate each match once into season and career totals.
            for pid,line in match_bat.items():
                key=(pid,season); dst=season_player_bat[key]
                for k,v in line.items(): dst[k]+=v
                for k,v in line.items(): career_bat[pid][k]+=v
                match_player_seen[pid].add(mid)
            for pid,line in match_bowl.items():
                for k,v in line.items(): season_player_bowl[(pid,season)][k]+=v; career_bowl[pid][k]+=v
                match_player_seen[pid].add(mid)
            for (pid,phase),line in match_phase_bat.items():
                for k,v in line.items(): phase_bat[(pid,season,phase)][k]+=v
            for (pid,phase),line in match_phase_bowl.items():
                for k,v in line.items(): phase_bowl[(pid,season,phase)][k]+=v
            for pair, line in matchups.items():
                target = career_matchup.setdefault(pair, fresh_matchup())
                for key in ("balls", "runs", "dismissals", "fours", "sixes", "dot_balls"):
                    target[key] += line[key]
                for kind, count in line["dismissal_types"].items():
                    target["dismissal_types"][kind] += count
            for key, line in season_matchups.items():
                target = season_matchup.setdefault(key, fresh_matchup())
                for metric in ("balls", "runs", "dismissals", "fours", "sixes", "dot_balls"):
                    target[metric] += line[metric]
                for kind, count in line["dismissal_types"].items():
                    target["dismissal_types"][kind] += count
            for key, line in phase_matchups.items():
                target = phase_matchup.setdefault(key, fresh_matchup())
                for metric in ("balls", "runs", "dismissals", "fours", "sixes", "dot_balls"):
                    target[metric] += line[metric]
                for kind, count in line["dismissal_types"].items():
                    target["dismissal_types"][kind] += count
            parsed+=1
        except Exception as e:
            errors.append({"file":path.name,"error":str(e)[:220]})

    def name(pid): return players.get(str(pid),{}).get("name",str(pid))
    batting_intel = defaultdict(list)
    batting_intel_season = defaultdict(list)
    bowling_intel = defaultdict(list)
    bowling_intel_season = defaultdict(list)
    for row in batting_innings_rows:
        batting_intel[row["player_id"]].append(row)
        batting_intel_season[(row["player_id"], row["season"])].append(row)
    for row in bowling_innings_rows:
        bowling_intel[row["player_id"]].append(row)
        bowling_intel_season[(row["player_id"], row["season"])].append(row)

    profiles=[]
    for pid in set(career_bat)|set(career_bowl):
        bat=career_bat[pid]; bowl=career_bowl[pid]
        seasons=sorted({s for p,s in season_player_bat if p==pid}|{s for p,s in season_player_bowl if p==pid})
        appearances=max(1,len(match_player_seen[pid]))
        bat_per_match=bat["balls"]/appearances
        bowl_per_match=bowl["balls"]/appearances
        # Require sustained two-discipline workload; occasional part-time overs do not
        # turn specialist batters (e.g. Kohli/Rohit) into all-rounders.
        if bat["balls"]>=300 and bowl["balls"]>=180 and bat_per_match>=8 and bowl_per_match>=12:
            role="All-rounder"
        elif bowl_per_match>=12 and bowl["balls"]>=180:
            role="Bowler" if bat_per_match<8 else "All-rounder"
        elif bat_per_match>=5 and bat["balls"]>=120:
            role="Batter"
        elif bowl["balls"]>=60 and bowl_per_match>=6:
            role="Bowler"
        else:
            role="Other"
        profiles.append({"id":str(pid),"name":name(pid),"role":role,"matches":len(match_player_seen[pid]),
                         "workload":{"batting_balls_per_match":round(bat_per_match,2),"bowling_balls_per_match":round(bowl_per_match,2)},
                         "batting":finalize_bat(bat),"bowling":finalize_bowl(bowl),"seasons":seasons,
                         "batting_intelligence":summarize_batting_innings(batting_intel[pid]),
                         "bowling_intelligence":summarize_bowling_innings(bowling_intel[pid]),
                         "season_stats":[{"season":s,"batting":finalize_bat(season_player_bat[(pid,s)]),
                                          "bowling":finalize_bowl(season_player_bowl[(pid,s)]),
                                          "batting_intelligence":summarize_batting_innings(batting_intel_season[(pid,s)]),
                                          "bowling_intelligence":summarize_bowling_innings(bowling_intel_season[(pid,s)])}
                                         for s in seasons]})
    profiles.sort(key=lambda p:(p["batting"]["runs"],p["bowling"]["wickets"]),reverse=True)
    build_comparison_and_scouting(profiles)
    recruitment_data = build_recruitment_intelligence(profiles, team_roster_map)

    phase_rows=[]
    for key in set(phase_bat)|set(phase_bowl):
        pid,season,phase=key
        bat_line=phase_bat[key]
        bowl_line=phase_bowl[key]
        phase_rows.append({"player_id":pid,"player":name(pid),"season":season,"phase":phase,
                           "batting":finalize_bat(bat_line),"bowling":finalize_bowl(bowl_line)})
    def matchup_rows_for(store, key_fields):
        rows = []
        for key, line in store.items():
            if line["balls"] < 1:
                continue
            batter, bowler = key[0], key[1]
            row = {"batter_id": batter, "batter": name(batter),
                   "bowler_id": bowler, "bowler": name(bowler)}
            if "season" in key_fields:
                row["season"] = key[key_fields.index("season")]
            if "phase" in key_fields:
                row["phase"] = key[key_fields.index("phase")]
            row.update(finalize_matchup_line(line))
            rows.append(row)
        rows.sort(key=lambda x: (x["balls"], x["dismissals"]), reverse=True)
        return rows

    career_matchup_rows = matchup_rows_for(career_matchup, ("batter", "bowler"))
    matchup_rows = matchup_rows_for(season_matchup, ("batter", "bowler", "season"))
    phase_matchup_rows = matchup_rows_for(
        phase_matchup, ("batter", "bowler", "season", "phase")
    )
    seasons=sorted({s for _,s in season_player_bat}|{s for _,s in season_player_bowl})
    payload={"meta":{"generated":datetime.now().isoformat(timespec="seconds"),"matches_parsed":parsed,
                      "yaml_files_found":len(files),"players":len(profiles),"seasons":seasons,
                      "source":"Cricsheet YAML ball-by-ball","notes":["Player roles are inferred from sustained batting and bowling workload per appearance, not official classifications. All-rounder requires substantial workload in both disciplines.",
                      "Strike rate uses balls faced; bowling economy uses legal balls and runs charged to the bowler. Matchup dismissals include bowler-credited wickets only.",
                      "Phase definitions: Powerplay overs 1-6, Middle overs 7-15, Death overs 16-20.",
                      "Batting innings counts a player once per innings when listed as striker or non-striker on at least one delivery; unused XI players are excluded. A batter who entered but faced no delivery cannot be identified from ball-by-ball data.",
                      "Innings scorecards include one row per crease participant. Batting position is inferred from first appearance in delivery order; opening batter order may be ambiguous.",
                       "Bowling innings lines count legal balls excluding wides and no-balls; runs conceded include wides and no-balls but exclude byes, leg-byes and penalty runs. Bowler-credited wickets use the defined bowler wicket kinds.",
                      "Matchup balls exclude wides. Matchup dot balls are deliveries with zero batter runs and no wide; zero-run no-balls count as batting dots. Matchup dismissals include bowler-credited wickets only, with dismissal types recorded.",
                      "Matchup exports include career totals, season totals, and season-plus-phase splits. Phase definitions: Powerplay overs 1-6, Middle overs 7-15, Death overs 16-20.",
                      "Comparison percentiles are calculated within inferred role groups and require at least five comparable peers. Scouting archetypes use explicit career-stat thresholds; similar players use shared role-peer percentile dimensions. These are descriptive statistics, not predictions or verified player attributes."],
                      "comparison_scouting":{"percentile_scale":"0-100","minimum_peer_count":5,
                      "similar_players_max":5,"role_groups":["Batter","Bowler","All-rounder","Other"],
                      "metrics":{"batting.average":"higher","batting.strike_rate":"higher",
                      "batting.dot_pct":"lower","batting.boundary_pct":"higher",
                      "bowling.economy":"lower","bowling.average":"lower",
                      "bowling.strike_rate":"lower","bowling.dot_pct":"higher"}}},
            "players":profiles,"phase_splits":phase_rows,
            "career_matchups":career_matchup_rows,"matchups":matchup_rows,
            "phase_matchups":phase_matchup_rows,
            "batting_innings":batting_innings_rows,"bowling_innings":bowling_innings_rows,
            "recruitment":recruitment_data,
            "errors":errors[:30]}
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(payload,separators=(",",":"),ensure_ascii=False),encoding="utf-8")
    print("PLAYER INTELLIGENCE EXPORT COMPLETE")
    print(f"YAML files found : {len(files):,}")
    print(f"Matches parsed  : {parsed:,}")
    print(f"Players profiled: {len(profiles):,}")
    print(f"Seasons         : {seasons[0] if seasons else 'n/a'}–{seasons[-1] if seasons else 'n/a'}")
    print(f"Phase records   : {len(phase_rows):,}")
    print(f"Matchups        : {len(matchup_rows):,}")
    print(f"Parse errors    : {len(errors):,}")
    print(f"Output          : {OUT}")
    if errors:
        print("Sample errors:")
        for e in errors[:5]: print(f"  {e['file']}: {e['error']}")

if __name__=="__main__": main()

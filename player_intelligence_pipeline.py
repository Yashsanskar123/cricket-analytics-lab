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


def fresh_bat():
    return defaultdict(float, {"runs":0,"balls":0,"dismissals":0,"fours":0,"sixes":0,"dot_balls":0})

def fresh_bowl():
    return defaultdict(float, {"runs":0,"balls":0,"wickets":0,"maidens":0,"dots":0,"fours":0,"sixes":0})

def add_line(store, key, factory):
    if key not in store: store[key] = factory()
    return store[key]

def safe_div(a,b): return round(a/b, 3) if b else None

def finalize_bat(x):
    return {"runs":int(x["runs"]),"balls":int(x["balls"]),"dismissals":int(x["dismissals"]),
            "average":safe_div(x["runs"],x["dismissals"]),"strike_rate":safe_div(x["runs"]*100,x["balls"]),
            "fours":int(x["fours"]),"sixes":int(x["sixes"]),"dot_balls":int(x["dot_balls"]),
            "boundary_runs":int(4*x["fours"]+6*x["sixes"]),
            "dot_pct":safe_div(x["dot_balls"]*100,x["balls"]),
            "boundary_pct":safe_div((x["fours"]+x["sixes"])*100,x["balls"])}

def finalize_bowl(x):
    balls=int(x["balls"]); runs=int(x["runs"]); wk=int(x["wickets"])
    return {"runs_conceded":runs,"balls":balls,"overs":f"{balls//6}.{balls%6}","wickets":wk,
            "economy":safe_div(runs*6,balls),"average":safe_div(runs,wk),"strike_rate":safe_div(balls,wk),
            "maidens":int(x["maidens"]),"dots":int(x["dots"]),"fours_conceded":int(x["fours"]),"sixes_conceded":int(x["sixes"]),
            "dot_pct":safe_div(x["dots"]*100,balls)}

def main():
    if not DATA_ROOT.exists():
        print(f"Could not find data directory: {DATA_ROOT}"); raise SystemExit(1)
    files = sorted(set(DATA_ROOT.rglob("*.yaml")) | set(DATA_ROOT.rglob("*.yml")))
    if not files:
        print(f"No Cricsheet YAML files found under {DATA_ROOT}"); raise SystemExit(1)

    players = {}
    match_rows = []
    season_player_bat = defaultdict(fresh_bat)
    season_player_bowl = defaultdict(fresh_bowl)
    career_bat = defaultdict(fresh_bat); career_bowl = defaultdict(fresh_bowl)
    phase_bat = defaultdict(fresh_bat); phase_bowl = defaultdict(fresh_bowl)
    match_player_seen = defaultdict(set)
    matchup = defaultdict(lambda: defaultdict(float))
    season_matchup = defaultdict(lambda: defaultdict(float))
    team_seasons = defaultdict(set)
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
                    match_bat[pid]  # create a zero batting line for appearance tracking
                    match_player_seen[pid].add(mid)
            match_phase_bat=defaultdict(fresh_bat); match_phase_bowl=defaultdict(fresh_bowl)
            matchups=defaultdict(lambda: defaultdict(float)); total_runs=[]
            for inn_idx,inn in enumerate(inns[:2],start=1):
                team=inn.get("team") or "Unknown"; teams.append(team)
                if season: team_seasons[(team,season)].add(mid)
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
                    if bat_runs==4 and wides==0: b["fours"]+=1; bp["fours"]+=1
                    if bat_runs==6 and wides==0: b["sixes"]+=1; bp["sixes"]+=1
                    if bat_runs==0 and wides==0: b["dot_balls"]+=1; bp["dot_balls"]+=1
                    for out_id in out_ids:
                        ob=add_line(match_bat,out_id,fresh_bat); op=add_line(match_phase_bat,(out_id,phase),fresh_bat)
                        ob["dismissals"]+=1; op["dismissals"]+=1
                    bw=add_line(match_bowl,bowler_id,fresh_bowl); bwp=add_line(match_phase_bowl,(bowler_id,phase),fresh_bowl)
                    # Bowler concession excludes byes and leg-byes; wides/no-balls are charged.
                    conceded=max(0,total-bye)
                    bw["runs"]+=conceded; bwp["runs"]+=conceded
                    if wides==0 and noballs==0: bw["balls"]+=1; bwp["balls"]+=1
                    bw["wickets"]+=credited; bwp["wickets"]+=credited
                    if bat_runs==0 and total==0: bw["dots"]+=1; bwp["dots"]+=1
                    if bat_runs==4: bw["fours"]+=1; bwp["fours"]+=1
                    if bat_runs==6: bw["sixes"]+=1; bwp["sixes"]+=1
                    if bowler_id!="Unknown":
                        mm=add_line(matchups,(batter_id,bowler_id),lambda:defaultdict(float))
                        # Matchup dismissals count only wickets credited to the bowler.
                        mm["balls"] += (1 if wides==0 else 0); mm["runs"]+=bat_runs
                        mm["dismissals"] += credited
                        mm["fours"] += (1 if bat_runs==4 else 0); mm["sixes"] += (1 if bat_runs==6 else 0)
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
            for pair,line in matchups.items():
                for k,v in line.items():
                    matchup[(pair[0],pair[1])][k]+=v
                    season_matchup[(pair[0],pair[1],season)][k]+=v
            parsed+=1
        except Exception as e:
            errors.append({"file":path.name,"error":str(e)[:220]})

    def name(pid): return players.get(str(pid),{}).get("name",str(pid))
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
                         "season_stats":[{"season":s,"batting":finalize_bat(season_player_bat[(pid,s)]),"bowling":finalize_bowl(season_player_bowl[(pid,s)])} for s in seasons]})
    profiles.sort(key=lambda p:(p["batting"]["runs"],p["bowling"]["wickets"]),reverse=True)

    phase_rows=[]
    for key in set(phase_bat)|set(phase_bowl):
        pid,season,phase=key
        bat_line=phase_bat[key]
        bowl_line=phase_bowl[key]
        phase_rows.append({"player_id":pid,"player":name(pid),"season":season,"phase":phase,
                           "batting":finalize_bat(bat_line),"bowling":finalize_bowl(bowl_line)})
    matchup_rows=[]
    for (batter,bowler,season),x in season_matchup.items():
        if x["balls"]<1: continue
        matchup_rows.append({"batter_id":batter,"batter":name(batter),"bowler_id":bowler,"bowler":name(bowler),"season":season,
                             "balls":int(x["balls"]),"runs":int(x["runs"]),"dismissals":int(x["dismissals"]),
                             "strike_rate":safe_div(x["runs"]*100,x["balls"]),"average":safe_div(x["runs"],x["dismissals"]),
                             "fours":int(x["fours"]),"sixes":int(x["sixes"])})
    matchup_rows.sort(key=lambda x:(x["balls"],x["dismissals"]),reverse=True)
    seasons=sorted({s for _,s in season_player_bat}|{s for _,s in season_player_bowl})
    payload={"meta":{"generated":datetime.now().isoformat(timespec="seconds"),"matches_parsed":parsed,
                      "yaml_files_found":len(files),"players":len(profiles),"seasons":seasons,
                      "source":"Cricsheet YAML ball-by-ball","notes":["Player roles are inferred from sustained batting and bowling workload per appearance, not official classifications. All-rounder requires substantial workload in both disciplines.",
                      "Strike rate uses balls faced; bowling economy uses legal balls and runs charged to the bowler. Matchup dismissals include bowler-credited wickets only.",
                      "Phase definitions: Powerplay overs 1-6, Middle overs 7-15, Death overs 16-20."]},
            "players":profiles,"phase_splits":phase_rows,"matchups":matchup_rows,
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

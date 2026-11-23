
from pathlib import Path
from collections import Counter
from datetime import date, datetime

import yaml

DATA_DIR = Path("data/raw")


def get_match_date(info):
    dates = info.get("dates", [])

    if not dates:
        return None

    value = dates[0]

    if isinstance(value, (date, datetime)):
        return value.date() if isinstance(value, datetime) else value

    try:
        return date.fromisoformat(str(value))
    except ValueError:
        return None


def extract_innings(match):
    """Support the innings structure in the uploaded Cricsheet YAML."""
    for innings_entry in match.get("innings", []) or []:
        if not isinstance(innings_entry, dict):
            continue

        # Older Cricsheet YAML: {"1st innings": {...}}
        for innings_name, innings_data in innings_entry.items():
            if not isinstance(innings_data, dict):
                continue

            team = innings_data.get("team", "Unknown")

            # Older structure: innings_data["deliveries"]
            if isinstance(innings_data.get("deliveries"), list):
                yield innings_name, team, innings_data["deliveries"]
                continue

            # Alternative structure: innings_data["overs"]
            for over in innings_data.get("overs", []) or []:
                deliveries = over.get("deliveries", [])

                for delivery in deliveries:
                    yield innings_name, team, [delivery]


def extract_delivery_records(deliveries):
    """Unwrap the delivery records used by Cricsheet YAML."""
    for item in deliveries:
        if not isinstance(item, dict):
            continue

        # Older format: {0.1: {batsman: ..., runs: ...}}
        if "runs" in item and (
            "batsman" in item or "batter" in item
        ):
            yield item
            continue

        # One-key mapping where the key is the ball label.
        for ball_label, delivery in item.items():
            if isinstance(delivery, dict) and "runs" in delivery:
                yield delivery


yaml_files = sorted(DATA_DIR.rglob("*.yaml"))
yaml_files += sorted(DATA_DIR.rglob("*.yml"))

if not yaml_files:
    raise FileNotFoundError(
        f"No YAML files found under {DATA_DIR.resolve()}"
    )

match_count = 0
innings_count = 0
delivery_count = 0
total_runs = 0
batter_runs = 0
extra_runs = 0
wicket_events = 0

seasons = Counter()
teams = Counter()
venues = Counter()
errors = []
missing_dates = 0
missing_results = 0

print(f"YAML files found: {len(yaml_files)}")

for file_path in yaml_files:
    try:
        with file_path.open("r", encoding="utf-8") as f:
            match = yaml.safe_load(f)

        if not isinstance(match, dict):
            raise ValueError("Top-level YAML content is not a mapping")

        info = match.get("info", {})
        if not isinstance(info, dict):
            raise ValueError("Missing or invalid info section")

        match_count += 1

        match_date = get_match_date(info)

        if match_date is None:
            missing_dates += 1
            season_label = str(info.get("season", "Unknown"))
        else:
            # Prefer the supplied season; derive the year only if absent.
            season_label = str(
                info.get("season", match_date.year)
            )

        seasons[season_label] += 1

        for team in info.get("teams", []) or []:
            teams[team] += 1

        venues[info.get("venue", "Unknown")] += 1

        if not info.get("outcome"):
            missing_results += 1

        for innings_name, batting_team, deliveries in extract_innings(match):
            innings_count += 1

            for delivery in extract_delivery_records(deliveries):
                delivery_count += 1

                runs = delivery.get("runs", {}) or {}
                total_runs += runs.get("total", 0) or 0
                batter_runs += runs.get(
                    "batsman", runs.get("batter", 0)
                ) or 0
                extra_runs += runs.get("extras", 0) or 0

                # Uploaded YAML uses singular "wicket".
                # Also support a list under "wickets" if present.
                wicket = delivery.get("wicket")
                wickets = delivery.get("wickets")

                if isinstance(wicket, dict):
                    wicket_events += 1
                elif isinstance(wickets, list):
                    wicket_events += len(wickets)
                elif isinstance(wickets, dict):
                    wicket_events += 1

    except Exception as exc:
        errors.append((file_path.name, str(exc)))


print("\n--- DATASET OVERVIEW ---")
print(f"Files found: {len(yaml_files)}")
print(f"Matches parsed: {match_count}")
print(f"Innings parsed: {innings_count}")
print(f"Delivery records: {delivery_count:,}")
print(f"Total runs: {total_runs:,}")
print(f"Batter runs: {batter_runs:,}")
print(f"Extras: {extra_runs:,}")
print(f"Recorded wicket events: {wicket_events:,}")
print(f"Distinct teams: {len(teams)}")
print(f"Distinct venues: {len(venues)}")
print(f"Matches missing dates: {missing_dates}")
print(f"Matches missing outcome metadata: {missing_results}")

print("\n--- MATCHES BY SEASON / YEAR ---")
for season, count in sorted(seasons.items()):
    print(f"{season}: {count}")

print("\n--- TEAMS BY MATCH APPEARANCES ---")
for team, count in teams.most_common():
    print(f"{team}: {count}")

print("\n--- TOP 10 VENUES ---")
for venue, count in venues.most_common(10):
    print(f"{venue}: {count}")

print("\n--- FILE ERRORS ---")
print(f"Files with errors: {len(errors)}")

for filename, error in errors[:10]:
    print(f"{filename}: {error}")

print("\n--- BASIC CONSISTENCY CHECK ---")
print(f"Batter runs + extras: {batter_runs + extra_runs}")
print(f"Total runs: {total_runs}")
print(f"Run totals reconcile: {batter_runs + extra_runs == total_runs}")

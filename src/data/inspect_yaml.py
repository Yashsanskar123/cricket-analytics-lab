
from pathlib import Path
import yaml
from pprint import pprint

DATA_DIR = Path("data/raw")

files = sorted(DATA_DIR.rglob("*.yaml"))
if not files:
    files = sorted(DATA_DIR.rglob("*.yml"))

if not files:
    raise FileNotFoundError("No YAML files found.")

file_path = files[0]

with file_path.open("r", encoding="utf-8") as f:
    match = yaml.safe_load(f)

print("FILE:", file_path.name)
print("\nTOP-LEVEL KEYS:")
print(list(match.keys()))

print("\nINFO KEYS:")
info = match.get("info", {})
print(list(info.keys()))

print("\nSEASON:")
print(info.get("season", "Not present at info.season"))

print("\nEVENT:")
pprint(info.get("event"))

print("\nFIRST INNINGS STRUCTURE:")
innings = match.get("innings", [])
pprint(innings[0] if innings else "No innings found", depth=5)

print("\nFIRST DELIVERY:")
if innings:
    first_innings = innings[0]
    if isinstance(first_innings, dict):
        innings_details = next(iter(first_innings.values()))
        if isinstance(innings_details, dict):
            overs = innings_details.get("overs", [])
            if overs:
                deliveries = overs[0].get("deliveries", [])
                if deliveries:
                    pprint(deliveries[0], depth=5)

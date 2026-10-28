#!/usr/bin/env python3
"""Extract the game's location and alt-biome placement rules for Vh.WorldGen.

The rules (ZoneSystem.m_locations, AltBiomeList) are the same for every seed of
a game version. The oracle plugin dumps them with each seed's placed instances
(oracle.locations.json); this keeps just the rules, tagged with the game
version, as seedgen/Vh.WorldGen/Data/locations.json, which the library embeds so
location placement runs without the game (server and browser).

    py scripts/export_location_rules.py [fixture-dir]

Re-run after a Valheim update, from a fixture made with that version
(scripts/oracle_fixtures.sh).
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURES = os.path.join(ROOT, "seedgen", "Vh.WorldGen.Tests", "oracle-fixtures")
OUT = os.path.join(ROOT, "seedgen", "Vh.WorldGen", "Data", "locations.json")


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(FIXTURES, sorted(os.listdir(FIXTURES))[0])
    with open(os.path.join(src, "oracle.locations.json"), encoding="utf8") as fh:
        dump = json.load(fh)
    with open(os.path.join(src, "oracle.json"), encoding="utf8") as fh:
        meta = json.load(fh)
    out = {
        "gameVersion": meta.get("gameVersion"),
        "locations": dump["locations"],
        "altBiomes": dump["altBiomes"],
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf8", newline="\n") as fh:
        json.dump(out, fh, indent=1, ensure_ascii=False)
        fh.write("\n")
    print(f"{OUT}: {len(out['locations'])} location types, {len(out['altBiomes'])} alt biomes, game {out['gameVersion']}")


if __name__ == "__main__":
    main()

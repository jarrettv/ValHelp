#!/usr/bin/env python3
"""
export_poi_catalog.py — every POI the map can show, for the POI admin page.

The admin page used to list only the prefabs one generated world happened to
place. This writes the full list instead, from the game's own data:

  prefabs    every location the game can place (each enabled ZoneLocation in
             ZoneSystem's list and the LocationLists loaded with it), with its
             biome(s) and per-world quantity, plus the pieces seedgen maps as
             POIs of their own (maypoles, inside farms). Type and name are
             seedgen's (`dotnet run -- prefab-types`), so they match the POIs.
  altBiomes  every biome variant in AltBiomeList, with its biome(s).

The newer LocationLists carry stale m_prefabName copies, so prefab names come
from each entry's SoftReference via the bundle manifest.

    python scripts/export_poi_catalog.py      # -> web/public/data/vh/poi-catalog.json

Re-run after a game update (loading the bundles takes a few minutes).
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from export_dungeon_rooms import DEFAULT_DATA, ROOT, UnityPy, asset_id, soft_ref_paths  # noqa: E402

OUT = os.path.join(ROOT, "web", "public", "data", "vh", "poi-catalog.json")

# Heightmap.Biome flags -> the names seedgen writes on POIs.
BIOMES = [(1, "Meadows"), (2, "Swamp"), (4, "Mountain"), (8, "BlackForest"), (16, "Plains"),
          (32, "AshLands"), (64, "DeepNorth"), (256, "Ocean"), (512, "Mistlands")]


def biome_names(flags: int) -> list[str]:
    return [name for bit, name in BIOMES if flags & bit]


def seedgen_prefabs() -> list[dict]:
    proj = os.path.join(ROOT, "seedgen")
    subprocess.run(["dotnet", "build", proj, "-nologo", "-v", "q"], check=True, stdout=subprocess.DEVNULL)
    out = subprocess.run(["dotnet", "run", "--no-build", "--project", proj, "--", "prefab-types"],
                         check=True, capture_output=True, text=True).stdout
    return json.loads(out[out.index("["):])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=DEFAULT_DATA, help="the game's valheim_Data folder")
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()

    names = soft_ref_paths(args.data)
    bundles = os.path.join(args.data, "StreamingAssets", "SoftRef", "Bundles")
    files = [os.path.join(bundles, f) for f in os.listdir(bundles)]
    # ZoneSystem lives in the scenes, not the bundles.
    files += [os.path.join(args.data, f) for f in os.listdir(args.data) if f.startswith("level") or f.endswith(".assets")]
    env = UnityPy.load(*files)

    locations: dict[str, dict] = {}
    alts: dict[str, dict] = {}
    for o in env.objects:
        if o.type.name != "MonoBehaviour":
            continue
        try:
            script = o.read().m_Script.read().m_Name
        except Exception:
            continue
        if script in ("ZoneSystem", "LocationList"):
            for z in o.read_typetree().get("m_locations") or []:
                prefab = names.get(asset_id(z["m_prefab"])) or z["m_prefabName"] or z["m_name"]
                e = locations.setdefault(prefab, {"enabled": False, "biome": 0, "quantity": 0})
                if z["m_enable"] and z["m_quantity"] > 0:
                    e["enabled"] = True
                    e["biome"] |= z["m_biome"]
                    e["quantity"] = max(e["quantity"], z["m_quantity"])
        elif script == "AltBiomeList":
            for a in o.read_typetree()["m_alts"]:
                e = alts.setdefault(a["m_name"], {"enabled": False, "biome": 0})
                e["enabled"] |= bool(a["m_enabled"])
                e["biome"] |= a["m_biome"]

    known = {p["prefab"]: p for p in seedgen_prefabs()}
    prefabs = []
    for prefab, loc in sorted(locations.items()):
        if not loc["enabled"]:
            continue
        k = known.get(prefab)
        prefabs.append({
            "prefab": prefab,
            # Locations seedgen doesn't know come out as type Unknown, "#<hash>".
            "type": k["type"] if k else "Unknown",
            "name": k["name"] if k else prefab,
            "biomes": biome_names(loc["biome"]),
            "quantity": loc["quantity"],
            **({} if k else {"unmapped": True}),
        })
    by_prefab = {p["prefab"]: p for p in prefabs}
    for k in known.values():
        if k["inside"]:
            hosts = [by_prefab[h] for h in k["inside"] if h in by_prefab]
            prefabs.append({
                "prefab": k["prefab"], "type": k["type"], "name": k["name"],
                "biomes": sorted({b for h in hosts for b in h["biomes"]}, key=[n for _, n in BIOMES].index),
                "inside": k["inside"],
            })

    catalog = {
        "prefabs": prefabs,
        "altBiomes": [{"name": n, "biomes": biome_names(a["biome"])} for n, a in alts.items() if a["enabled"]],
    }
    with open(args.out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(catalog, f, indent=1)
        f.write("\n")

    unmapped = [p["prefab"] for p in prefabs if p.get("unmapped")]
    stale = sorted(p for p, k in known.items() if not k["inside"] and not locations.get(p, {}).get("enabled"))
    print(f"wrote {args.out}: {len(prefabs)} prefabs, {len(catalog['altBiomes'])} biome variants", file=sys.stderr)
    if unmapped:
        print(f"  placed by the game but unknown to seedgen (add to LocationFinder): {', '.join(unmapped)}", file=sys.stderr)
    if stale:
        print(f"  known to seedgen but no longer placed: {', '.join(stale)}", file=sys.stderr)


if __name__ == "__main__":
    main()

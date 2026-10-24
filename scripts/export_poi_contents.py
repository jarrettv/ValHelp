#!/usr/bin/env python3
"""
export_poi_contents.py — what a map location can hold, for the POI card.

Seedgen reports, per location instance, how many of each networked object it
spawned (WorldGen/DungeonSim.cs re-runs the game's rolls). This catalogue says
what those objects are, from the game's own prefabs:

  objects    every object a location or dungeon room can spawn that holds
             something worth showing, by prefab name:
               chest    Container: its DropTable as rolls (min-max) and, per
                        item, the chance it's in a chest and its stack range
               pickup   Pickable / PickableItem: the item(s) you pick up
               item     a loose item lying there (ItemDrop)
               enemy    CreatureSpawner: the creature and its star levels
               spawner  SpawnArea: what it keeps spawning
               smash    DropOnDestroyed / MineRock5: loot when broken
               beehive  a buildable Beehive, or a wild one (its smash loot)
             each with its display name (English localization).
  locations  per location prefab, the objects it can hold: the most of each
             one instance can have, and the chance of each copy (the RandomSpawn
             rolls above it; dungeons: "rooms" instead, the rooms it may use).
  vegvisirs  per location prefab / dungeon room, the boss locations its
             vegvisir stones reveal.
  names      display names for the item and creature codes used above.

Also writes seedgen/WorldGen/Data/contents.json ({prefab: kind}), the objects
seedgen counts per POI.

    python scripts/export_poi_contents.py

Re-run after a game update, after export_dungeon_rooms.py (it reads the
dungeon rooms from seedgen/WorldGen/Data/dungeons.json.gz).
"""
from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from export_dungeon_rooms import DEFAULT_DATA, ROOT, UnityPy, Exporter, prefab_name  # noqa: E402

OUT = os.path.join(ROOT, "web", "public", "data", "vh", "poi-contents.json")
SEEDGEN_OUT = os.path.join(ROOT, "seedgen", "WorldGen", "Data", "contents.json")
DUNGEONS = os.path.join(ROOT, "seedgen", "WorldGen", "Data", "dungeons.json.gz")
# Smashables the game gives no name.
SMASH_NAMES = {"Charred_altar_bellfragment": "Bell fragment altar"}


def localization(data_dir: str) -> dict[str, str]:
    """$token -> English, from the game's localization CSV."""
    env = UnityPy.load(os.path.join(data_dir, "resources.assets"))
    for o in env.objects:
        if o.type.name != "TextAsset":
            continue
        d = o.read()
        if d.m_Name != "localization":
            continue
        text = d.m_Script if isinstance(d.m_Script, str) else d.m_Script.decode("utf-8", "replace")
        rows = csv.reader(io.StringIO(text))
        head = next(rows)
        en = head.index("English")
        return {r[0]: r[en] for r in rows if len(r) > en and r[0]}
    return {}


def drop_odds(t: dict, item_of) -> dict | None:
    """DropTable -> rolls and, per item, the chance a drop list holds it.

    DropTable.GetDropList: nothing unless Random.value <= m_dropChance; else
    Range(m_dropMin, m_dropMax + 1) weighted picks, each removed after it is
    picked when m_oneOfEach. The per-item chance is worked out by sampling.
    """
    drops = [(item_of(d["m_item"]), d["m_stackMin"], d["m_stackMax"], d["m_weight"]) for d in t["m_drops"]]
    drops = [d for d in drops if d[0]]
    if not drops:
        return None
    lo, hi, chance, one = t["m_dropMin"], t["m_dropMax"], t["m_dropChance"], bool(t["m_oneOfEach"])
    rng = random.Random(1)
    n_trials = 20000
    hits = {d[0]: 0 for d in drops}
    for _ in range(n_trials):
        pool = list(drops)
        got = set()
        for _ in range(rng.randint(lo, max(lo, hi))):
            if not pool:
                break
            total = sum(d[3] for d in pool)
            r = rng.uniform(0, total)
            acc = 0.0
            pick = pool[-1]
            for d in pool:
                acc += d[3]
                if r <= acc:
                    pick = d
                    break
            got.add(pick[0])
            if one:
                pool.remove(pick)
        for g in got:
            hits[g] += 1
    total_w = sum(d[3] for d in drops) or 1
    items = {}
    for code, smin, smax, w in drops:
        e = items.setdefault(code, {"item": code, "chance": 0.0, "min": smin, "max": smax, "weight": 0.0})
        e["chance"] = round(chance * hits[code] / n_trials, 3)
        e["min"], e["max"] = min(e["min"], smin), max(e["max"], smax)
        e["weight"] = round(e["weight"] + w / total_w, 4)
    return {"rolls": [lo, hi], "chance": round(chance, 3), "oneOfEach": one,
            "items": sorted(items.values(), key=lambda e: -e["chance"])}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=DEFAULT_DATA, help="the game's valheim_Data folder")
    args = ap.parse_args()

    loc_text = localization(args.data)

    def tr(token: str) -> str:
        return loc_text.get(token[1:], token) if token and token.startswith("$") else token

    bundles = os.path.join(args.data, "StreamingAssets", "SoftRef", "Bundles")
    print(f"loading bundles from {bundles} ...", file=sys.stderr)
    env = UnityPy.load(bundles)
    ex = Exporter(env)

    roots = {}       # bundle-root GameObject name -> GameObject
    go_name = {}     # GameObject path ID -> name
    comp_go = {}     # component path ID -> its GameObject's name
    for o in env.objects:
        if o.type.name != "GameObject":
            continue
        go = o.read()
        go_name[o.path_id] = go.m_Name
        is_root = False
        for c in go.m_Components:
            comp_go[c.path_id] = go.m_Name
            try:
                if c.type.name == "Transform" and c.deref().read().m_Father.path_id == 0:
                    is_root = True
            except Exception:
                pass
        if is_root:
            roots.setdefault(go.m_Name, go)
    print(f"{len(roots)} prefabs", file=sys.stderr)

    def go_ref(p) -> str | None:
        pid = p["m_PathID"] if isinstance(p, dict) else p.path_id
        return go_name.get(pid) or comp_go.get(pid) if pid else None

    def scripts_of(go) -> dict[str, dict]:
        out = {}
        for c in ex.components(go):
            if c.type.name == "MonoBehaviour":
                sc = ex.script_of(c)
                if sc and sc not in out:
                    try:
                        out[sc] = c.read_typetree()
                    except Exception:
                        pass
        return out

    names: dict[str, str] = {}

    def item_name(code: str) -> str:
        if code not in names:
            go = roots.get(code)
            sc = scripts_of(go) if go is not None else {}
            n = sc.get("ItemDrop", {}).get("m_itemData", {}).get("m_shared", {}).get("m_name", "")
            if not n:
                for k in ("Humanoid", "Character", "Container", "Pickable", "Destructible", "Piece", "HoverText"):
                    n = sc.get(k, {}).get("m_name") or sc.get(k, {}).get("m_text") or ""
                    if n:
                        break
            names[code] = tr(n) if n else code
        return names[code]

    def item_of(p) -> str | None:
        code = go_ref(p)
        if code:
            item_name(code)
        return code

    def describe(prefab: str) -> dict | None:
        go = roots.get(prefab)
        if go is None:
            return None
        sc = scripts_of(go)
        if "Container" in sc:
            t = sc["Container"]
            odds = drop_odds(t["m_defaultItems"], item_of)
            return {"kind": "chest", "name": tr(t["m_name"]), **({"table": odds} if odds else {})}
        # A wild beehive (abandoned houses, bear caves) is a breakable structure,
        # not the buildable Beehive: smash it for its queen and honey.
        if prefab == "Beehive" and "DropOnDestroyed" in sc:
            odds = drop_odds(sc["DropOnDestroyed"]["m_dropWhenDestroyed"], item_of)
            items = [i["item"] for i in (odds or {}).get("items", [])]
            return {"kind": "beehive", "name": "Beehive", "item": "QueenBee" if "QueenBee" in items else (items or [None])[0],
                    **({"table": odds} if odds else {})}
        if "Beehive" in sc:
            t = sc["Beehive"]
            return {"kind": "beehive", "name": tr(t.get("m_name", "")) or "Beehive",
                    "item": item_of(t["m_honeyItem"]), "max": t.get("m_maxHoney", 0)}
        if "PickableItem" in sc:
            t = sc["PickableItem"]
            # RandomItem has no weight: each is equally likely.
            rnd = [(item_of(r["m_itemPrefab"]), r.get("m_stackMin", 1), r.get("m_stackMax", 1), r.get("m_weight", 1))
                   for r in t.get("m_randomItemPrefabs", [])]
            rnd = [r for r in rnd if r[0]]
            if rnd:
                tw = sum(r[3] for r in rnd) or 1
                return {"kind": "pickup", "name": "Random item",
                        "items": [{"item": c, "chance": round(w / tw, 3), "min": a, "max": b} for c, a, b, w in rnd]}
            code = item_of(t["m_itemPrefab"])
            return {"kind": "pickup", "name": item_name(code) if code else prefab,
                    "items": [{"item": code, "chance": 1, "min": t.get("m_stack", 1), "max": t.get("m_stack", 1)}]} if code else None
        if "Pickable" in sc:
            t = sc["Pickable"]
            code = item_of(t["m_itemPrefab"])
            if not code:
                return None
            e = {"kind": "pickup", "name": tr(t.get("m_overrideName", "")) or item_name(code),
                 "items": [{"item": code, "chance": 1, "min": t["m_amount"], "max": t["m_amount"]}]}
            if t.get("m_respawnTimeMinutes", 0) > 0:
                e["respawnMinutes"] = t["m_respawnTimeMinutes"]
            return e
        if "CreatureSpawner" in sc:
            t = sc["CreatureSpawner"]
            code = item_of(t["m_creaturePrefab"])
            if not code:
                return None
            e = {"kind": "enemy", "name": item_name(code), "creature": code,
                 "levels": [t["m_minLevel"], t["m_maxLevel"]]}
            if t.get("m_respawnTimeMinuts", 0) > 0:
                e["respawnMinutes"] = t["m_respawnTimeMinuts"]
            return e
        if "SpawnArea" in sc:
            t = sc["SpawnArea"]
            sp = [(item_of(p["m_prefab"]), p["m_weight"], p["m_minLevel"], p["m_maxLevel"]) for p in t["m_prefabs"]]
            sp = [s for s in sp if s[0]]
            if not sp:
                return None
            tw = sum(s[1] for s in sp) or 1
            n = tr(sc.get("Destructible", {}).get("m_name", "")) or tr(sc.get("HoverText", {}).get("m_text", ""))
            return {"kind": "spawner", "name": n or prefab_name(prefab).replace("_", " "),
                    "creatures": [{"creature": c, "chance": round(w / tw, 3), "levels": [a, b]} for c, w, a, b in sp]}
        if "ItemDrop" in sc:
            return {"kind": "item", "name": item_name(prefab), "item": prefab}
        # Broken into another prefab that holds the loot (the Sealbreaker altar crystal).
        spawned = sc.get("Destructible", {}).get("m_spawnWhenDestroyed")
        if spawned and "Piece" not in sc and "WearNTear" not in sc:
            target = go_ref(spawned)
            inner = describe(target) if target and target != prefab else None
            if inner and inner["kind"] in ("smash", "item"):
                n = tr(sc["Destructible"].get("m_name", "")) or tr(sc.get("HoverText", {}).get("m_text", ""))
                return {**inner, "kind": "smash", "name": n or inner["name"]}
        for k, f in (("MineRock5", "m_dropItems"), ("MineRock", "m_dropItems"), ("DropOnDestroyed", "m_dropWhenDestroyed")):
            if k in sc and f in sc[k]:
                if "Piece" in sc or "WearNTear" in sc:
                    return None   # building pieces drop their build cost
                odds = drop_odds(sc[k][f], item_of)
                if odds is None:
                    return None
                n = ""
                for nk in ("Destructible", "HoverText", "Piece"):
                    n = sc.get(nk, {}).get("m_name") or sc.get(nk, {}).get("m_text") or ""
                    if n:
                        break
                return {"kind": "smash", "name": tr(n) or SMASH_NAMES.get(prefab) or prefab.replace("_", " "),
                        "table": odds}
        return None

    # What can hold what: location prefabs, plus dungeon rooms from the room export.
    dungeons = json.load(gzip.open(DUNGEONS, "rt"))
    holders: dict[str, dict] = {}
    for name, l in dungeons["locations"].items():
        holders[name] = {"tree": l, "dungeon": "generator" in l, "themes": l.get("generator", {}).get("themes", 0)}
    rooms = {r["name"]: r for r in dungeons["rooms"]}

    def tree_objects(t: dict) -> dict[str, dict]:
        """Prefab -> {max, chance per copy}: the RandomSpawn chances above each net view."""
        nodes = t["nodes"]
        rs = {r[0]: r[1] / 100.0 for r in t["randomSpawns"]}
        ro = {}
        for r in t["randomObjects"]:
            total = sum(w for _, w in r[6]) or 1
            for n, w in r[6]:
                ro[n] = w / total
        out: dict[str, dict] = {}
        for node, prefab in t["netViews"]:
            if node == 0:
                continue
            p, n, active = 1.0, node, True
            while n >= 0:
                active &= bool(nodes[n][1]) or n in rs or n in ro
                p *= rs.get(n, 1.0) * ro.get(n, 1.0)
                n = nodes[n][0]
            if not active:
                continue
            e = out.setdefault(prefab, {"max": 0, "chances": []})
            e["max"] += 1
            e["chances"].append(round(min(p, 1.0), 3))
        return out

    objects: dict[str, dict] = {}
    skip: set[str] = set()

    def known(prefab: str) -> bool:
        if prefab in objects:
            return True
        if prefab in skip:
            return False
        try:
            d = describe(prefab)
        except Exception as e:   # a field this script doesn't know: report it, skip the object
            print(f"  {prefab}: {type(e).__name__} {e}", file=sys.stderr)
            d = None
        if d is None:
            skip.add(prefab)
            return False
        objects[prefab] = d
        return True

    locations_out = {}
    for name, h in sorted(holders.items()):
        own = {p: e for p, e in tree_objects(h["tree"]).items() if known(p)}
        entry = {"objects": {p: {"max": e["max"], "chance": max(e["chances"])} for p, e in sorted(own.items())}}
        if h["dungeon"]:
            th = h["themes"]
            entry["rooms"] = sorted(r["name"] for r in dungeons["rooms"]
                                    if r["listEnabled"] and r["enabled"] and (r["listTheme"] & th))
        if h["tree"].get("vegvisirs"):
            entry["vegvisirs"] = sorted({loc for _, locs in h["tree"]["vegvisirs"] for loc in locs})
        if entry["objects"] or entry.get("rooms") or entry.get("vegvisirs"):
            locations_out[name] = entry

    rooms_out = {}
    for rname, r in sorted(rooms.items()):
        own = {p: e for p, e in tree_objects(r).items() if known(p)}
        e = {"objects": {p: {"max": v["max"], "chance": max(v["chances"])} for p, v in sorted(own.items())}}
        if r.get("vegvisirs"):
            e["vegvisirs"] = sorted({loc for _, locs in r["vegvisirs"] for loc in locs})
        if e["objects"] or e.get("vegvisirs"):
            rooms_out[rname] = e

    for d in objects.values():
        for c in [d.get("creature")] + [c["creature"] for c in d.get("creatures", [])]:
            if c:
                item_name(c)

    out = {"objects": dict(sorted(objects.items())), "locations": locations_out, "rooms": rooms_out,
           "names": dict(sorted((k, v) for k, v in names.items() if v and v != k))}
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
        f.write("\n")
    with open(SEEDGEN_OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump({p: d["kind"] for p, d in sorted(objects.items())}, f, indent=1)
        f.write("\n")
    kinds = {}
    for d in objects.values():
        kinds[d["kind"]] = kinds.get(d["kind"], 0) + 1
    print(f"wrote {OUT}: {len(objects)} objects {kinds}, {len(locations_out)} locations, {len(rooms_out)} rooms",
          file=sys.stderr)


if __name__ == "__main__":
    main()

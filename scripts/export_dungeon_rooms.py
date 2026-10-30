#!/usr/bin/env python3
"""
export_dungeon_rooms.py — the room catalog seedgen's dungeon simulator runs on.

Dungeon interiors (infested mines, frost caves, crypts…) are built at spawn by
DungeonGenerator from the rooms in DungeonDB's room lists. Seedgen re-runs that
generator in C# (seedgen/WorldGen/DungeonSim.cs) to count what each dungeon
holds — black core stands, Sealbreaker crystals, Fenris claw/hair pickups —
without booting the game. This script exports everything it needs from the
game's own bundles:

  rooms      every RoomData in DungeonDB.m_roomLists order (the order the game
             draws from), with the Room settings and, per room, the objects the
             generator touches: RoomConnections, RandomSpawns, RandomObjects and
             ZNetViews, each on a node of the room's hierarchy (depth-first,
             the order GetComponentsInChildren returns them), plus its
             Vegvisirs (static scenery, so not ZNetViews).
  locations  every location prefab: its own RandomSpawns/RandomObjects/ZNetViews/
             Vegvisirs (SpawnLocation rolls them), and for those with a
             DungeonGenerator its settings and the interior/generator transforms.

Floats are written exactly as the game stores them (float32), because the
generator seeds each room's rolls from its integer-truncated position.

    python scripts/export_dungeon_rooms.py            # -> seedgen/Vh.WorldGen/Data/dungeons.json.gz

Format (positional arrays to keep it small; DungeonCatalog.cs reads it):
  node         [parent, active, px, py, pz, qx, qy, qz, qw (, sx, sy, sz)]  local transform
  connection   [node, type, entrance, allowDoor, doorOnlyIfOtherAlsoAllowsDoor]
  randomSpawn  [node, chance, requireTheme, requireBiome, notInLava, minElevation, maxElevation, offObjectNode]
  randomObject [node, requireTheme, requireBiome, notInLava, minElevation, maxElevation, [[objectNode, weight], ...]]
  netView      [node, prefabName]   (Utils.GetPrefabName of the node's name)
  vegvisir     [node, [locationName, ...]]   (Vegvisir.m_locations: the boss it reveals)
  awake        [node, kind, arg]   what each component's Awake draws from Unity's
               global Random when SpawnLocation instantiates it, in component order:
               kind 0 = arg fixed draws, 1 = WearNTear (2, +1 with the location's
               random initial damage), 2 = Container rolling chests[arg],
               3 = not modelled (later chests in the location can't be predicted)
  chest        [dropMin, dropMax, dropChance, oneOfEach, [[item, stackMin, stackMax, weight, maxStack], ...]]
               Container.m_defaultItems; stackMin/Max already clamped as
               DropTable.AddItemToList does (>= 1, <= the item's max stack);
               maxStack for Inventory.AddItem merging repeats into one stack

Loading the bundles takes a couple of minutes.
"""
from __future__ import annotations

import argparse
import gzip
import json
import os
import re
import sys

try:
    import UnityPy
except ImportError:  # pragma: no cover
    sys.exit("UnityPy is required:  pip install UnityPy")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DATA = r"C:\Program Files (x86)\Steam\steamapps\common\Valheim\valheim_Data"
OUT = os.path.join(ROOT, "seedgen", "Vh.WorldGen", "Data", "dungeons.json.gz")


def soft_ref_paths(data_dir: str) -> dict[str, str]:
    """SoftRef asset ID (32 hex) -> prefab name, from the bundle manifest."""
    txt = open(os.path.join(data_dir, "StreamingAssets", "SoftRef", "manifest"), encoding="utf-8-sig").read()
    out = {}
    for aid, path in re.findall(r"- asset ID: ([0-9a-f]{32})\s*\n(?:  [^\n]*\n)*?  path in bundle: ([^\n]+)", txt):
        out[aid] = os.path.splitext(os.path.basename(path.strip()))[0]
    return out


def asset_id(ref) -> str:
    """SoftReference m_assetID {v0..v3} -> the manifest's hex form (v3 first)."""
    a = ref["m_assetID"]
    return "".join("%08x" % a[k] for k in ("v3", "v2", "v1", "v0"))


# Components whose Awake/OnEnable never touches UnityEngine.Random (checked in
# the decompiled 1.0 code). Any other MonoBehaviour that isn't modelled in
# awake_op() makes the chests after it unpredictable (kind 3).
NO_DRAW = {
    "ZNetView", "Piece", "RandomSpawn", "RandomObject", "SimpleMeshCombine", "RandomPieceRotation", "Door",
    "DropOnDestroyed", "SpawnOnDamaged", "MusicLocation", "Destructible", "StaticPhysics", "HoverText",
    "SpawnArea", "Chair", "AutoJumpLedge", "ZSyncTransform", "ZSyncAnimation", "EffectArea", "LightLod",
    "TimedDestruction", "Vegvisir", "Location", "RoomConnection", "Room", "DungeonGenerator", "LocationProxy",
}
FIXED_DRAWS = {"CreatureSpawner": 1, "Floating": 1, "LightFlicker": 1, "ZSFX": 1}


class Exporter:
    def __init__(self, env):
        self.env = env
        # Script class name per MonoBehaviour, filled lazily.
        self._script = {}
        # GameObject path ID -> (name, ItemDrop max stack), set by main() for chest tables.
        self.item_of = lambda pid: (None, 1)
        # Unmodelled components (kind 3) by script, reported at the end.
        self.unmodelled = {}

    def awake_op(self, sc: str, t: dict, comps, chests: list):
        """(kind, arg) for one component's Awake on instantiation, or None (no draws)."""
        if sc in NO_DRAW:
            return None
        if sc in FIXED_DRAWS:
            return (0, FIXED_DRAWS[sc])
        if sc == "WearNTear":
            return (1, 0)
        if sc == "Container":
            dt = t["m_defaultItems"]
            drops = []
            for d in dt["m_drops"]:
                name, max_stack = self.item_of(d["m_item"]["m_PathID"])
                # AddItemToList: Range(max(1, min), min(maxStack, max) + 1); the
                # resource-rate ScaleDrops is the same single Range at 1x.
                drops.append([name or "?", max(1, d["m_stackMin"]), min(max_stack, d["m_stackMax"]), d["m_weight"], max_stack])
            chests.append([dt["m_dropMin"], dt["m_dropMax"], dt["m_dropChance"], int(bool(dt["m_oneOfEach"])), drops])
            return (2, len(chests) - 1)
        if sc == "Pickable":     # InvokeRepeating("UpdateRespawn", Range(1, 5), ...)
            return (0, 1) if t.get("m_respawnTimeMinutes", 0) > 0 else None
        if sc == "PickableItem":  # SetupRandomPrefab: Range over the list, then ScaleDrops' Range
            return (0, 2) if not t["m_itemPrefab"]["m_PathID"] and t.get("m_randomItemPrefabs") else None
        if sc == "Aoe":
            return (0, 1) if t.get("m_ttlMax", 0) > 0 else None
        if sc == "LodFadeInOut":
            # Invoke("FadeIn", Range) when a camera is over 20 m away and the object has a LODGroup:
            # always, for a zone spawned around a player (and on the dedicated server the oracle runs).
            return (0, 1) if any(c.type.name == "LODGroup" for c in comps) else None
        self.unmodelled[sc] = self.unmodelled.get(sc, 0) + 1
        return (3, 0)

    def script_of(self, mb_reader) -> str:
        key = (mb_reader.assets_file.name, mb_reader.path_id)
        if key not in self._script:
            try:
                self._script[key] = mb_reader.read().m_Script.read().m_ClassName
            except Exception:
                self._script[key] = ""
        return self._script[key]

    @staticmethod
    def components(go):
        for c in go.m_Components:
            try:
                yield c.deref()
            except Exception:
                continue

    def hierarchy(self, root_go, with_awake=False):
        """Depth-first pre-order nodes under (and including) root_go, with the
        components seedgen cares about. Node 0 is the root. with_awake: also each
        component's Awake draws and the chests' tables (locations' own objects)."""
        nodes, conns, rspawns, robjects, nviews, vegs, keyed = [], [], [], [], [], [], {}
        awake, chests = [], []
        go_index = {}

        def v3(d):
            return [d["x"], d["y"], d["z"]]

        def q4(d):
            return [d["x"], d["y"], d["z"], d["w"]]

        def visit(go, parent):
            idx = len(nodes)
            go_index[go.object_reader.path_id] = idx
            tr = None
            comps = list(self.components(go))
            for c in comps:
                if c.type.name in ("Transform", "RectTransform"):
                    tr = c.read_typetree()
            node = {"name": go.m_Name, "parent": parent, "active": bool(go.m_IsActive)}
            if tr:
                node["pos"] = v3(tr["m_LocalPosition"])
                node["rot"] = q4(tr["m_LocalRotation"])
                s = v3(tr["m_LocalScale"])
                if s != [1.0, 1.0, 1.0]:
                    node["scale"] = s
            nodes.append(node)
            for c in comps:
                if c.type.name != "MonoBehaviour":
                    continue
                sc = self.script_of(c)
                if with_awake and sc not in NO_DRAW and sc:
                    try:
                        op = self.awake_op(sc, c.read_typetree(), comps, chests)
                    except Exception as e:
                        print(f"  {go.m_Name}: {sc}: {e}", file=sys.stderr)
                        op = (3, 0)
                    if op:
                        awake.append({"node": idx, "kind": op[0], "arg": op[1]})
                if sc in ("RoomConnection", "RandomSpawn", "RandomObject", "ZNetView", "Vegvisir", "Room", "Location",
                          "DungeonGenerator"):
                    t = c.read_typetree()
                    if sc == "RoomConnection":
                        conns.append({"node": idx, "type": t["m_type"], "entrance": bool(t["m_entrance"]),
                                      "allowDoor": bool(t["m_allowDoor"]),
                                      "doorOnlyIfOther": bool(t["m_doorOnlyIfOtherAlsoAllowsDoor"])})
                    elif sc == "RandomSpawn":
                        rspawns.append({"node": idx, "chance": t["m_chanceToSpawn"],
                                        "requireTheme": t["m_dungeonRequireTheme"],
                                        "requireBiome": t["m_requireBiome"], "notInLava": bool(t["m_notInLava"]),
                                        "minElevation": t["m_minElevation"], "maxElevation": t["m_maxElevation"],
                                        "offObject": t["m_OffObject"]["m_PathID"]})
                    elif sc == "RandomObject":
                        robjects.append({"node": idx,
                                         "objects": [{"go": o["m_object"]["m_PathID"], "weight": o["m_weight"]}
                                                     for o in t["m_objects"]],
                                         "requireTheme": t["m_dungeonRequireTheme"],
                                         "requireBiome": t["m_requireBiome"], "notInLava": bool(t["m_notInLava"]),
                                         "minElevation": t["m_minElevation"], "maxElevation": t["m_maxElevation"]})
                    elif sc == "ZNetView":
                        nviews.append({"node": idx})
                    elif sc == "Vegvisir":
                        vegs.append({"node": idx, "locations": [l["m_locationName"] for l in t["m_locations"]]})
                    else:
                        # First one wins: the prefab's own Room/Location sits on the root,
                        # and some rooms nest another room's prefab inside them.
                        keyed.setdefault(sc, (idx, t))
            tr_reader = next((c for c in comps if c.type.name in ("Transform", "RectTransform")), None)
            if tr_reader is not None:
                for ch in tr_reader.read().m_Children:
                    try:
                        visit(ch.deref().read().m_GameObject.read(), idx)
                    except Exception:
                        continue

        visit(root_go, -1)
        # GameObject references (OffObject, RandomObject entries) -> node indices.
        for r in rspawns:
            r["offObject"] = go_index.get(r["offObject"], -1) if r["offObject"] else -1
        for r in robjects:
            for o in r["objects"]:
                o["node"] = go_index.get(o.pop("go"), -1)

        # Keep only the nodes the generator looks at, plus their ancestors (the
        # active-in-hierarchy rules walk up the chain). Pre-order is preserved,
        # so component order still matches GetComponentsInChildren.
        keep = {0}
        refs = [c["node"] for c in conns] + [r["node"] for r in rspawns] + [r["offObject"] for r in rspawns]             + [r["node"] for r in robjects] + [o["node"] for r in robjects for o in r["objects"]]             + [v["node"] for v in nviews] + [v["node"] for v in vegs] + [i for i, _ in keyed.values()]             + [a["node"] for a in awake]
        for n in refs:
            while n >= 0 and n not in keep:
                keep.add(n)
                n = nodes[n]["parent"]
        order = sorted(keep)
        remap = {old: new for new, old in enumerate(order)}
        remap[-1] = -1
        pruned = []
        for old in order:
            nd = dict(nodes[old])
            nd["parent"] = remap[nd["parent"]]
            pruned.append(nd)
        for c in conns: c["node"] = remap[c["node"]]
        for r in rspawns:
            r["node"] = remap[r["node"]]
            r["offObject"] = remap.get(r["offObject"], -1)
        for r in robjects:
            r["node"] = remap[r["node"]]
            for o in r["objects"]: o["node"] = remap.get(o["node"], -1)
        for v in nviews: v["node"] = remap[v["node"]]
        for v in vegs: v["node"] = remap[v["node"]]
        for a in awake: a["node"] = remap[a["node"]]
        keyed = {k: (remap[i], t) for k, (i, t) in keyed.items()}
        go_index = {pid: remap[i] for pid, i in go_index.items() if i in remap}
        return pruned, conns, rspawns, robjects, nviews, vegs, keyed, go_index, (awake, chests)


def prefab_name(name: str) -> str:
    """Utils.GetPrefabName: cut at the first '(' or ' '."""
    cut = [i for i in (name.find("("), name.find(" ")) if i >= 0]
    return name[:min(cut)] if cut else name


def compact(nodes, conns, rsp, rob, nv, vg, aw=None) -> dict:
    def node(n):
        a = [n["parent"], 1 if n["active"] else 0] + n.get("pos", [0.0, 0.0, 0.0]) + n.get("rot", [0.0, 0.0, 0.0, 1.0])
        return a + n["scale"] if "scale" in n else a
    return {
        "nodes": [node(n) for n in nodes],
        "connections": [[c["node"], c["type"], int(c["entrance"]), int(c["allowDoor"]), int(c["doorOnlyIfOther"])]
                        for c in conns],
        "randomSpawns": [[r["node"], r["chance"], r["requireTheme"], r["requireBiome"], int(r["notInLava"]),
                          r["minElevation"], r["maxElevation"], r["offObject"]] for r in rsp],
        "randomObjects": [[r["node"], r["requireTheme"], r["requireBiome"], int(r["notInLava"]), r["minElevation"],
                           r["maxElevation"], [[o["node"], o["weight"]] for o in r["objects"]]] for r in rob],
        "netViews": [[v["node"], prefab_name(nodes[v["node"]]["name"])] for v in nv],
        "vegvisirs": [[v["node"], v["locations"]] for v in vg],
        **({"awake": [[a["node"], a["kind"], a["arg"]] for a in aw[0]], "chests": aw[1]} if aw else {}),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=DEFAULT_DATA, help="the game's valheim_Data folder")
    ap.add_argument("--out", default=OUT)
    args = ap.parse_args()

    names = soft_ref_paths(args.data)
    bundles = os.path.join(args.data, "StreamingAssets", "SoftRef", "Bundles")
    print(f"loading bundles from {bundles} ...", file=sys.stderr)
    env = UnityPy.load(bundles)
    ex = Exporter(env)

    # Root GameObjects by name (room and location prefabs are bundle roots).
    roots = {}
    go_names = {}   # path ID -> GameObject name, for PPtrs to prefabs (door types)
    dbs, lists = [], {}
    for o in env.objects:
        if o.type.name == "MonoBehaviour":
            sc = ex.script_of(o)
            if sc == "DungeonDB":
                dbs.append(o)
            elif sc == "RoomList":
                mb = o.read()
                lists[(o.assets_file.name, mb.m_GameObject.path_id)] = o
        elif o.type.name == "GameObject":
            go = o.read()
            go_names[o.path_id] = go.m_Name
            # Bundle roots have a Transform without a parent.
            for c in ex.components(go):
                if c.type.name == "Transform":
                    if c.read().m_Father.path_id == 0:
                        roots.setdefault(go.m_Name, go)
                    break

    max_stack = {}

    def item_of(pid):
        """A DropTable's item PPtr -> (prefab name, ItemDrop m_maxStackSize)."""
        name = go_names.get(pid)
        if name not in max_stack:
            ms = 1
            go = roots.get(name)
            for c in (ex.components(go) if go is not None else []):
                if c.type.name == "MonoBehaviour" and ex.script_of(c) == "ItemDrop":
                    ms = c.read_typetree()["m_itemData"]["m_shared"]["m_maxStackSize"]
                    break
            max_stack[name] = ms
        return name, max_stack[name]
    ex.item_of = item_of

    # DungeonDB.m_roomLists, in order; RoomList GameObjects live in the same file.
    db = dbs[0]
    dbt = db.read_typetree()
    room_entries = []
    for ref in dbt["m_roomLists"]:
        pid = ref["m_PathID"]
        rl = next(v for (f, gid), v in lists.items() if gid == pid)
        for rd in rl.read_typetree()["m_rooms"]:
            room_entries.append((names.get(asset_id(rd["m_prefab"])), bool(rd["m_enabled"]), rd["m_theme"]))
    print(f"{len(room_entries)} rooms in {len(dbt['m_roomLists'])} room lists", file=sys.stderr)

    rooms = []
    for name, enabled, theme in room_entries:
        go = roots.get(name)
        if go is None:
            print(f"  missing room prefab {name}", file=sys.stderr)
            continue
        nodes, conns, rsp, rob, nv, vg, keyed, _, _ = ex.hierarchy(go)
        _, r = keyed["Room"]
        rooms.append({
            "name": name, "listEnabled": enabled, "listTheme": theme,
            "size": [r["m_size"]["x"], r["m_size"]["y"], r["m_size"]["z"]],
            "theme": r["m_theme"], "enabled": bool(r["m_enabled"]), "entrance": bool(r["m_entrance"]),
            "endCap": bool(r["m_endCap"]), "divider": bool(r["m_divider"]), "endCapPrio": r["m_endCapPrio"],
            "minPlaceOrder": r["m_minPlaceOrder"], "weight": r["m_weight"], "faceCenter": bool(r["m_faceCenter"]),
            "perimeter": bool(r["m_perimeter"]),
            **compact(nodes, conns, rsp, rob, nv, vg),
        })

    # Every location prefab: SpawnLocation's own rolls decide what a plain
    # location holds too (POI contents); dungeons add their generator.
    locations = {}
    for name, go in sorted(roots.items()):
        comps = {ex.script_of(c) for c in ex.components(go) if c.type.name == "MonoBehaviour"}
        if "Location" not in comps:
            continue
        nodes, conns, rsp, rob, nv, vg, keyed, go_index, aw = ex.hierarchy(go, with_awake=True)
        li, lt = keyed["Location"]
        if "DungeonGenerator" not in keyed:
            locations[name] = {**compact(nodes, conns, rsp, rob, nv, vg, aw),
                               "applyRandomDamage": bool(lt["m_applyRandomDamage"]),
                               "useCustomInteriorTransform": False, "interiorNode": -1, "generatorNode": -1}
            continue
        gi, g = keyed["DungeonGenerator"]
        interior = lt["m_interiorTransform"]["m_PathID"]
        # m_interiorTransform points at a Transform; map it to its GameObject node.
        interior_node = -1
        if interior:
            tr = go.object_reader.assets_file.objects.get(interior)
            if tr is not None:
                interior_node = go_index.get(tr.read().m_GameObject.path_id, -1)
        locations[name] = {
            **compact(nodes, conns, rsp, rob, nv, vg, aw),
            "applyRandomDamage": bool(lt["m_applyRandomDamage"]),
            "useCustomInteriorTransform": bool(lt["m_useCustomInteriorTransform"]),
            "interiorNode": interior_node, "generatorNode": gi,
            "generator": {
                "algorithm": g["m_algorithm"], "maxRooms": g["m_maxRooms"], "minRooms": g["m_minRooms"],
                "minRequiredRooms": g["m_minRequiredRooms"], "requiredRooms": g["m_requiredRooms"],
                "alternativeFunctionality": bool(g["m_alternativeFunctionality"]), "themes": g["m_themes"],
                "doorChance": g["m_doorChance"],
                "zoneSize": [g["m_zoneSize"]["x"], g["m_zoneSize"]["y"], g["m_zoneSize"]["z"]],
                "useCustomInteriorTransform": bool(g["m_useCustomInteriorTransform"]),
                "addBaseSeedToRandomSpawn": bool(g["m_addBaseSeedToRandomSpawn"]),
                "campRadiusMin": g["m_campRadiusMin"], "campRadiusMax": g["m_campRadiusMax"],
                "maxTilt": g["m_maxTilt"], "minAltitude": g["m_minAltitude"],
                "perimeterSections": g["m_perimeterSections"], "perimeterBuffer": g["m_perimeterBuffer"],
                "originalPosition": [g["m_originalPosition"]["x"], g["m_originalPosition"]["y"], g["m_originalPosition"]["z"]],
                "doorTypes": [[prefab_name(go_names.get(d["m_prefab"]["m_PathID"], "?")), d["m_connectionType"], d["m_chance"]]
                              for d in g["m_doorTypes"]],
            },
        }
    dungeons = [n for n, l in locations.items() if "generator" in l]
    print(f"{len(rooms)} rooms, {len(locations)} locations, {len(dungeons)} with a generator: {', '.join(dungeons)}",
          file=sys.stderr)

    if ex.unmodelled:
        print("Awake not modelled (chests spawned after these are unpredictable): "
              + ", ".join(f"{k} {v}" for k, v in sorted(ex.unmodelled.items(), key=lambda kv: -kv[1])), file=sys.stderr)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    # mtime=0 keeps the gzip byte-identical across re-exports of the same data.
    with gzip.GzipFile(args.out, "wb", mtime=0) as f:
        f.write(json.dumps({"rooms": rooms, "locations": locations}, separators=(",", ":")).encode("utf-8"))
    print(f"wrote {args.out} ({os.path.getsize(args.out) // 1024} KB)", file=sys.stderr)


if __name__ == "__main__":
    main()

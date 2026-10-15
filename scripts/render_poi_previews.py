#!/usr/bin/env python3
"""
render_poi_previews.py — preview images for every map POI prefab, for the
/auth/pois admin page.

The prefab list comes from seedgen/WorldGen/LocationFinder.cs (everything
seedgen can emit), each one is found under Assets/world/Locations/ in the game's
bundles and rendered with render_prefab.py, then stored as a small WebP in
web/public/data/vh/renders.db (table poi_previews), which the API serves at
/api/poi/preview/<Prefab>.webp (api/ModuleStuff/StuffEndpointsMob.cs).

    python scripts/render_poi_previews.py              # render the missing ones
    python scripts/render_poi_previews.py --force      # re-render everything
    python scripts/render_poi_previews.py TarPit1 Ruin1   # just these

Loading the bundles takes about a minute; each render a few seconds.
"""
from __future__ import annotations

import argparse
import os
import io
import re
import sqlite3
import sys
import time

import numpy as np  # noqa: F401  (render_prefab needs it; fail early if missing)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_prefab as rp  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCATION_FINDER = os.path.join(ROOT, "seedgen", "WorldGen", "LocationFinder.cs")
DB_PATH = os.path.join(ROOT, "web", "public", "data", "vh", "renders.db")


def open_db(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE IF NOT EXISTS poi_previews ("
                 "prefab TEXT PRIMARY KEY, webp BLOB NOT NULL)")
    return conn


def prefab_names() -> list[str]:
    """Every prefab LocationFinder maps: FriendlyNames / ExtraPrefabs keys and
    LocationConfig prefab arguments."""
    src = open(LOCATION_FINDER, encoding="utf-8").read()
    names = set(re.findall(r'\["([A-Za-z0-9_]+)"\]\s*=', src))
    names |= set(re.findall(r'new LocationConfig\("([A-Za-z0-9_]+)"', src))
    return sorted(names, key=str.lower)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("only", nargs="*", help="render just these prefabs")
    ap.add_argument("--force", action="store_true", help="re-render existing previews")
    ap.add_argument("--bundles", default=rp.DEFAULT_BUNDLES)
    ap.add_argument("--db", default=DB_PATH)
    ap.add_argument("--size", type=int, default=320)
    ap.add_argument("--yaw", type=float, default=35.0)
    ap.add_argument("--pitch", type=float, default=35.0)
    ap.add_argument("--quality", type=int, default=80)
    ap.add_argument("--frame-pct", type=float, default=0.5,
                    help="frame this percentile range of vertices (0 = full extent)")
    a = ap.parse_args()

    wanted = a.only or prefab_names()
    conn = open_db(a.db)
    have = {r[0] for r in conn.execute("SELECT prefab FROM poi_previews")}
    todo = [n for n in wanted if a.force or a.only or n not in have]
    if not todo:
        print("all previews present (use --force to re-render)")
        return

    # Thumbnails don't need the default 3x supersampling, and it's most of the cost.
    rp.SUPERSAMPLE = 2
    env = rp.load_env(a.bundles)
    # Prefer Assets/world/Locations/, but some locations live elsewhere
    # (BogWitch_Camp is under Props).
    by_name = {}
    for path in sorted(env.container.container_dict, key=lambda p: "/world/locations/" not in p.lower()):
        low = path.lower()
        if low.endswith(".prefab"):
            by_name.setdefault(os.path.basename(low)[:-len(".prefab")], path)

    done, missing, failed = 0, [], []
    for name in todo:
        path = by_name.get(name.lower())
        if path is None:
            missing.append(name)
            continue
        t0 = time.time()
        try:
            go = env.container.container_dict[path].read()
            # Locations nest deeper than single props (the Bog Witch camp is 15 levels).
            parts = rp.collect_meshes(go, want_texture=True, max_depth=20)
            # Dungeon interiors sit far above the world; including them leaves the
            # entrance you'd actually find as a speck. Keep them only if they're
            # all there is.
            exterior = [p for p in parts if "interior" not in p[0].lower()]
            parts = exterior or parts
            if not parts:
                # Villages and camps are assembled at runtime by a DungeonGenerator
                # from room prefabs; the location itself has nothing to draw.
                failed.append((name, "no meshes (built at runtime, or effects only)"))
                continue
            P, N, UV, MAT = rp.build_scene(parts, want_texture=True)
            def draw(cull=True):
                return rp.render(P, N, UV, MAT, a.size, a.yaw, a.pitch, "none", 0.9,
                                 ambient=0.45, exposure=1.5, frame_pct=a.frame_pct, cull=cull)
            img = draw()
            # Interiors (caves, dungeon rooms) face inward and vanish under
            # back-face culling; draw both sides if almost nothing came out.
            coverage = (np.asarray(img)[..., 3] > 0).mean()
            if coverage < 0.01:
                img = draw(cull=False)
            buf = io.BytesIO()
            img.save(buf, "WEBP", quality=a.quality, method=6)
            conn.execute("INSERT OR REPLACE INTO poi_previews (prefab, webp) VALUES (?, ?)",
                         (name, buf.getvalue()))
            conn.commit()
            done += 1
            print(f"  {name}: {len(P)} tris, {buf.tell() // 1024} KB, {time.time() - t0:.1f}s", flush=True)
        except Exception as e:  # one bad prefab shouldn't sink the batch
            failed.append((name, f"{type(e).__name__}: {e}"))

    print(f"\nrendered {done}/{len(todo)} into {os.path.relpath(a.db, ROOT)}")
    if missing:
        print(f"no prefab found for: {', '.join(missing)}")
    for name, why in failed:
        print(f"failed {name}: {why}")


if __name__ == "__main__":
    main()

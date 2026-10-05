from __future__ import annotations

"""Render bestiary creature portraits headlessly, straight from the game files.

The in-game route (CreatureCapturePlugin + ingest_captures.py) needs Valheim
running with a world loaded. This does the same job from the asset bundles, so a
whole biome can be re-rendered unattended.

Output is deliberately shaped to match the capture plugin's, so the existing
ingest step consumes it unchanged:

    python scripts/render_creatures.py --biome "Deep North"
    python scripts/ingest_captures.py --folder <printed folder> --credit "..."

One PNG per star level, transparent background, named `<prefab>_<star>.png`.
Star levels come from the prefab's own LevelEffects, so a two-star creature gets
the tint and the star visual the game gives it — not a recoloured copy.

    --biome NAME     only creatures whose bestiary biome contains NAME
    --code CODE      one bestiary code (repeatable), ignoring --biome
    --stars          render star variants too (default: only 0)
    --size N         square output, default 512
    --out DIR        where the PNGs go
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import render_prefab as rp  # noqa: E402

REPO = Path(__file__).resolve().parents[1]
ITEMS = REPO / "web" / "public" / "data" / "vh" / "items.json"

# A single camera suits most creatures — three-quarter view, slightly above.
# Anything that reads badly from there gets an entry here rather than a
# special-cased render call.
CAMERA = {
    "_default": dict(yaw=35.0, pitch=12.0),
    "Seal": dict(yaw=40.0, pitch=22.0),          # low and long
    "Seal_Pup": dict(yaw=40.0, pitch=25.0),
    "BlobMork": dict(yaw=25.0, pitch=18.0),
    "BlobMorkMini": dict(yaw=25.0, pitch=18.0),
    "Writhan": dict(yaw=45.0, pitch=18.0),
    "ElakingMole": dict(yaw=40.0, pitch=18.0),
    "FrostWisp": dict(yaw=0.0, pitch=0.0),
    "Ghost_Void": dict(yaw=0.0, pitch=0.0),
}

LIGHT = dict(ambient=0.55, exposure=1.12, bump=1.0)


def prefab_path(cd, stem: str) -> str | None:
    """Container path whose file stem is exactly `stem` — 'Seal' must not match
    'Seal_Pup'."""
    want = f"/{stem}.prefab".lower()
    hits = [c for c in cd if c.lower().endswith(want)]
    if not hits:
        return None
    # Characters/ is the creature itself; anything else is an attack or effect.
    chars = [h for h in hits if "/characters/" in h.lower()]
    return sorted(chars or hits, key=len)[0]


def creatures(biome: str | None, codes: list[str]) -> list[dict]:
    items = json.loads(ITEMS.read_text(encoding="utf-8"))
    out = []
    for it in items:
        td = it.get("trophyDrop") or {}
        if not td.get("id"):
            continue
        if codes:
            if it["code"] not in codes:
                continue
        elif biome and biome.lower() not in (td.get("biome") or "").lower():
            continue
        out.append({
            "code": it["code"],
            "prefab": td["id"],
            "name": td.get("creature") or it.get("name") or it["code"],
            "maxStar": td.get("maxStar") or 0,
            "boss": bool(td.get("boss")),
        })
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--bundles", default=rp.DEFAULT_BUNDLES)
    ap.add_argument("--biome", default=None)
    ap.add_argument("--code", action="append", default=[])
    ap.add_argument("--stars", action="store_true", help="render star variants too")
    ap.add_argument("--size", type=int, default=512)
    ap.add_argument("--out", type=Path, default=REPO / "renders_out")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    rows = creatures(a.biome, a.code)
    if not rows:
        sys.exit("no creatures matched")

    env = rp.load_env(a.bundles)
    cd = env.container.container_dict

    a.out.mkdir(parents=True, exist_ok=True)
    print(f"{len(rows)} creature(s) -> {a.out}")

    made, missing, failed = 0, [], []
    for row in rows:
        path = prefab_path(cd, row["prefab"])
        if not path:
            missing.append(row["prefab"])
            print(f"  MISSING prefab {row['prefab']} ({row['name']})")
            continue

        # Bosses are captured as a single portrait; everyone else gets 0..maxStar.
        top = 0 if (row["boss"] or not a.stars) else int(row["maxStar"])
        cam = CAMERA.get(row["prefab"], CAMERA["_default"])

        go = cd[path].read()
        setups = rp.level_setups(go)
        for star in range(0, top + 1):
            setup = setups[star - 1] if star > 0 and len(setups) >= star else None
            enable = (setup["enable"],) if (setup and setup["enable"]) else ()
            out_png = a.out / f"{row['prefab']}_{star}.png"
            if a.dry_run:
                print(f"  would render {row['name']} *{star} <- {path}")
                continue
            try:
                parts = rp.collect_meshes(go, want_texture=True, enable=enable)
                if not parts:
                    failed.append(f"{row['prefab']}_{star} (no meshes)")
                    continue
                P, N, UV, MAT = rp.build_scene(parts, want_texture=True)
                img = rp.render(P, N, UV, MAT, a.size, cam["yaw"], cam["pitch"],
                                "none", 1.0, 0.5, None, LIGHT["ambient"],
                                LIGHT["exposure"], 0.0, "#ffffff", LIGHT["bump"])
                if setup:
                    arr = rp.apply_hsv(np.asarray(img, dtype=np.float32) / 255.0,
                                       setup["hue"], setup["saturation"], setup["value"])
                    from PIL import Image
                    img = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), "RGBA")
                img.save(out_png)
                made += 1
                print(f"  {row['name']} *{star} -> {out_png.name} ({len(P)} tris)")
            except Exception as exc:                     # one bad creature must not
                failed.append(f"{row['prefab']}_{star}: {exc}")   # stop the batch
                print(f"  FAILED {row['prefab']} *{star}: {exc}")

    print(f"\nrendered {made} frame(s) into {a.out}")
    if missing:
        print(f"  no prefab found for: {sorted(set(missing))}")
    if failed:
        print(f"  failed: {failed}")


if __name__ == "__main__":
    main()

from __future__ import annotations

"""Ingest in-game creature captures (from CreatureCapturePlugin) into a dedicated
SQLite database of per-star WebP renders — one file, no loose images, and separate
from items.db (which extract_items.py rebuilds from scratch every run).

For each `<prefab>_<star>.png` in a capture folder:
  1. crop to the alpha bounds (trim transparent margin)
  2. fit within 512x512 (preserve aspect), centered on a transparent square
  3. posterize the RGB (stylized banding + better compression), alpha untouched
  4. encode lossless WebP → stored as a BLOB in renders.db

Schema:  renders(code TEXT, star INT, webp BLOB, width INT, height INT, credit TEXT,
                 PRIMARY KEY(code, star))
`code` is mapped from the capture's prefab via items.json `trophyDrop.id`.

    python scripts/ingest_captures.py                    # newest capture_ folder
    python scripts/ingest_captures.py --folder <path>
    python scripts/ingest_captures.py --bits 3           # stronger posterize
    python scripts/ingest_captures.py --db <path>        # default web/public/data/vh/renders.db
"""

import argparse
import io
import json
import sqlite3
import sys
from pathlib import Path

from PIL import Image, ImageOps

REPO = Path(__file__).resolve().parents[1]
VH = REPO / "web" / "public" / "data" / "vh"
ITEMS = VH / "items.json"
DEFAULT_DB = VH / "renders.db"
CAPTURE_ROOT = Path(r"C:\Program Files (x86)\Steam\steamapps\common\Valheim\BepInEx")

SIZE = 512
CREDIT = "ValHelp (in-game capture)"

# Static boss "sacrificial stone" prefabs (captured via `vhcapturestones`) map to
# the boss's bestiary code, so bosses get a portrait even though we don't render
# the rigged boss creature itself.
BOSS_STONE_MAP = {
    "BossStone_Eikthyr": "TrophyEikthyr",
    "BossStone_TheElder": "TrophyTheElder",
    "BossStone_Bonemass": "TrophyBonemass",
    "BossStone_DragonQueen": "TrophyDragonQueen",
    "BossStone_Yagluth": "TrophyGoblinKing",
    "BossStone_TheQueen": "TrophySeekerQueen",
    "BossStone_Fader": "TrophyFader",
}


def newest_capture_folder() -> Path | None:
    dirs = sorted(CAPTURE_ROOT.glob("creature_capture_*"), key=lambda p: p.name)
    return dirs[-1] if dirs else None


def to_webp(path: Path, bits: int) -> tuple[bytes, int, int]:
    img = Image.open(path).convert("RGBA")
    bbox = img.split()[3].getbbox()          # crop to non-transparent content
    if bbox:
        img = img.crop(bbox)
    img.thumbnail((SIZE, SIZE), Image.LANCZOS)
    r, g, b, a = img.split()
    rgb = ImageOps.posterize(Image.merge("RGB", (r, g, b)), bits)   # posterize color only
    img = Image.merge("RGBA", (*rgb.split(), a))
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    canvas.paste(img, ((SIZE - img.width) // 2, (SIZE - img.height) // 2), img)
    buf = io.BytesIO()
    canvas.save(buf, "WEBP", lossless=True, quality=100, method=6)
    return buf.getvalue(), SIZE, SIZE


def main() -> None:
    ap = argparse.ArgumentParser(description="Ingest creature captures into renders.db")
    ap.add_argument("--folder", type=Path, default=None)
    ap.add_argument("--bits", type=int, default=4, help="posterize bits/channel (1-8, default 4)")
    ap.add_argument("--db", type=Path, default=DEFAULT_DB)
    args = ap.parse_args()

    folder = args.folder or newest_capture_folder()
    if not folder or not folder.exists():
        sys.exit(f"no capture folder found (looked in {CAPTURE_ROOT})")
    print(f"ingesting {folder.name}  (posterize {args.bits}-bit, {SIZE}px) -> {args.db.name}")

    items = json.loads(ITEMS.read_text(encoding="utf-8"))
    id_to_code = {
        it["trophyDrop"]["id"]: it["code"]
        for it in items
        if it.get("page") == "bestiary" and it.get("trophyDrop", {}).get("id")
    }

    args.db.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(args.db)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS renders ("
        "code TEXT NOT NULL, star INTEGER NOT NULL, webp BLOB NOT NULL, "
        "width INTEGER, height INTEGER, credit TEXT, PRIMARY KEY(code, star))"
    )

    written, unmapped = 0, set()
    for png in sorted(folder.glob("*.png")):
        prefab, _, star = png.stem.rpartition("_")
        if not star.isdigit():
            continue
        code = BOSS_STONE_MAP.get(prefab)
        if not code and prefab.startswith("Vegvisir"):
            code = "Vegvisir"  # all boss vegvisirs collapse to one example render
        if not code:
            code = id_to_code.get(prefab)
        if not code:
            unmapped.add(prefab)
            continue
        webp, w, h = to_webp(png, args.bits)
        conn.execute(
            "INSERT OR REPLACE INTO renders (code, star, webp, width, height, credit) VALUES (?,?,?,?,?,?)",
            (code, int(star), webp, w, h, CREDIT),
        )
        written += 1

    conn.commit()

    # Rebuild mob-images.json to point every frame at the API endpoint that serves
    # the blob from renders.db (api/ModuleStuff/StuffEndpointsMob). The frontend
    # uses these strings directly as <img src>, so no frontend change is needed.
    images: dict[str, dict] = {}
    for code, star in conn.execute("SELECT code, star FROM renders ORDER BY code, star"):
        images.setdefault(code, {}).setdefault("stars", {})[str(star)] = f"/api/mob/{code}_{star}.webp"
    manifest = {
        "_credit": {"note": "Creature renders captured in-game from Valheim (ValHelp)."},
        "images": images,
    }
    (VH / "mob-images.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    n_codes = conn.execute("SELECT COUNT(DISTINCT code) FROM renders").fetchone()[0]
    total = conn.execute("SELECT COUNT(*) FROM renders").fetchone()[0]
    conn.close()
    print(f"  wrote mob-images.json ({len(images)} creatures -> /api/mob/*.webp)")

    mb = args.db.stat().st_size / 1024 / 1024
    print(f"wrote {written} frames this run; renders.db now holds {total} frames / {n_codes} creatures ({mb:.2f} MB)")
    if unmapped:
        print(f"  WARN unmapped prefabs (no bestiary code): {sorted(unmapped)}")


if __name__ == "__main__":
    main()

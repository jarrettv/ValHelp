from __future__ import annotations

import argparse
import io
import json
import sqlite3
from pathlib import Path


#!/usr/bin/env python3
"""
export_trophy_icons.py

Pull trophy icons out of the extracted icon database and drop them into
<repo>/data/Trophy alongside their metadata JSON, so `sync_data_images.py` and
`generate_data_db.py` can pick them up like any other hand-curated asset.

The icons live in web/public/data/vh/icons.db (built by ValHelpTools'
extract_items.py), which is the only place the 1.0 / Deep North art exists --
the loose PNGs under data/ predate the update.

Usage:
    python export_trophy_icons.py [--dry-run] [--verbose]
"""


ICONS_DB = Path("web") / "public" / "data" / "vh" / "icons.db"
ITEMS_JSON = Path("web") / "public" / "data" / "vh" / "items.json"
TROPHY_DIR = Path("data") / "Trophy"

# Trophies added by Valheim 1.0. Biome is the trophy-hunt biome (which is how
# the rest of data/Trophy is keyed), not the item's spoiler tier.
NEW_TROPHIES = {
    "TrophyBarka": "Deep North",
    "TrophyBlob_Morkhalla": "Deep North",
    "TrophyElaking": "Deep North",
    "TrophyJotunWarrior": "Deep North",
    "TrophyJotunWitch": "Deep North",
    "TrophyMole": "Deep North",
    "TrophyMoose": "Deep North",
    "TrophySeal": "Deep North",
    # Not Deep North, but new in 1.0 and dropped by existing-biome mobs.
    "TrophyBlob_Frost": "Mountain",
    "TrophyBlob_Lava": "Ashlands",
    # TrophyHuntMod files Writhan under Deep North; we score it as Swamp.
    "TrophyWrithan": "Swamp",
}


def repo_root() -> Path:
    # scripts/export_trophy_icons.py -> repo root is two levels up
    return Path(__file__).resolve().parents[1]


def load_item_meta(items_path: Path) -> dict[str, dict]:
    raw = json.loads(items_path.read_text(encoding="utf-8"))
    items = raw["items"] if isinstance(raw, dict) and "items" in raw else raw
    return {item["code"]: item for item in items if "code" in item}


def write_json(path: Path, payload: dict, dry_run: bool) -> None:
    # data/Trophy/*.json is CRLF with 4-space indent; keep new files identical.
    text = json.dumps(payload, indent=4, ensure_ascii=False) + "\n"
    if dry_run:
        return
    path.write_bytes(text.replace("\n", "\r\n").encode("utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Show actions without writing files.")
    parser.add_argument("--verbose", action="store_true", help="Print per-trophy progress.")
    args = parser.parse_args()

    root = repo_root()
    icons_db = root / ICONS_DB
    items_json = root / ITEMS_JSON
    trophy_dir = root / TROPHY_DIR

    if not icons_db.exists():
        print(f"error: {icons_db} not found")
        return 1
    if not items_json.exists():
        print(f"error: {items_json} not found")
        return 1

    meta = load_item_meta(items_json)
    conn = sqlite3.connect(icons_db)

    written = 0
    missing: list[str] = []

    for code, biome in sorted(NEW_TROPHIES.items()):
        row = conn.execute("SELECT png FROM icons WHERE code = ?", (code,)).fetchone()
        if row is None:
            missing.append(code)
            continue

        png_path = trophy_dir / f"{code}.png"
        if not args.dry_run:
            png_path.write_bytes(row[0])

        item = meta.get(code, {})
        payload = {
            "code": code,
            "type": "Trophy",
            "name": item.get("name", f"{code} Trophy"),
            "desc": item.get("desc", ""),
            "image": f"/img/Trophy/{code}.png",
            "drop": "",
            "usage": "",
            "weight": float(item.get("weight", 2.0)),
            "stack": int(item.get("stack", 20)),
            "biome": biome,
        }
        write_json(trophy_dir / f"{code}.json", payload, args.dry_run)

        written += 1
        if args.verbose:
            size = len(row[0])
            print(f"  {code:24s} {payload['name']:24s} {biome:12s} {size} bytes")

    conn.close()

    verb = "would export" if args.dry_run else "exported"
    print(f"{verb} {written} trophy icons + metadata to {TROPHY_DIR}")
    if missing:
        print(f"missing from icons.db (skipped): {', '.join(missing)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

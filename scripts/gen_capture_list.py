from __future__ import annotations

"""Generate the creature list consumed by the in-game `vhcaptureall` command
(CreatureCapturePlugin). Each line is "<prefab> <maxStars>  # Name (Biome)".

Prefab and maxStars come straight from the bestiary in items.json
(`trophyDrop.id` and `trophyDrop.maxStar`), so the captures match the star
ranges we extracted from the game. Bosses capture a single portrait (0 stars).

    python scripts/gen_capture_list.py          # only creatures MISSING art
    python scripts/gen_capture_list.py --all    # every bestiary creature

Writes scripts/vhcapture_list.txt and (best effort) drops a copy in the game's
BepInEx root so `vhcaptureall` finds it.
"""

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ITEMS = REPO / "web" / "public" / "data" / "vh" / "items.json"
MANIFEST = REPO / "web" / "public" / "data" / "vh" / "mob-images.json"
OUT = REPO / "scripts" / "vhcapture_list.txt"
BEPINEX = Path(r"C:\Program Files (x86)\Steam\steamapps\common\Valheim\BepInEx\vhcapture_list.txt")


def has_complete_art(code: str, td: dict, images: dict) -> bool:
    e = images.get(code)
    if not e:
        return False
    if e.get("image"):  # single/definitive portrait
        return True
    stars = {int(k) for k in (e.get("stars") or {}).keys()}
    if not stars:
        return False
    if td.get("boss") or not td.get("maxStar"):
        return True  # any frame is enough for a no-star creature / boss
    want = set(range(td.get("minStar", 0), td["maxStar"] + 1))
    return want.issubset(stars)


def main() -> None:
    include_all = "--all" in sys.argv[1:]
    items = json.loads(ITEMS.read_text(encoding="utf-8"))
    images = json.loads(MANIFEST.read_text(encoding="utf-8")).get("images", {})

    include_bosses = "--bosses" in sys.argv[1:]
    rows = []
    for it in items:
        if it.get("page") != "bestiary":
            continue
        td = it.get("trophyDrop")
        if not td or not td.get("id"):
            continue
        if td.get("boss") and not include_bosses:
            continue  # bosses are multi-part / staged — capture separately if ever wanted
        if not include_all and has_complete_art(it["code"], td, images):
            continue
        prefab = td["id"]
        max_stars = 0 if td.get("boss") else int(td.get("maxStar") or 0)
        rows.append((prefab, max_stars, td.get("creature", it.get("name", "")), td.get("biome", "")))

    rows.sort(key=lambda r: (r[3], r[2]))

    lines = [
        "# vhcapture_list.txt — consumed by the in-game `vhcaptureall` command.",
        f"# {'ALL bestiary creatures' if include_all else 'creatures MISSING artwork'} ({len(rows)} entries).",
        "# Format: <prefab> <maxStars>",
        "",
    ]
    for prefab, ms, name, biome in rows:
        lines.append(f"{prefab} {ms}  # {name} ({biome or '—'})")
    text = "\n".join(lines) + "\n"

    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT} ({len(rows)} creatures)")
    try:
        BEPINEX.write_text(text, encoding="utf-8")
        print(f"copied to {BEPINEX}")
    except Exception as exc:  # noqa: BLE001
        print(f"(could not copy to BepInEx: {exc}) — copy it there manually")


if __name__ == "__main__":
    main()

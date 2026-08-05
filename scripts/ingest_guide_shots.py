from __future__ import annotations

"""Ingest guide screenshots: drop raw captures in one inbox, get web-ready WebP
files in the right biome folder.

Drop a file in `screenshots/raw/` named `<biome>-<slug>.png` and run the script:

    screenshots/raw/meadows-hero.png  ->  web/public/img/guide/meadows/hero.webp

which is exactly the path `docs/biome_meadows.md` already points at. Subfolders
work too if you prefer them: `screenshots/raw/meadows/hero.png` is equivalent.

Each image is:
  1. resized to fit MAX_WIDTH (aspect preserved, never upscaled)
  2. posterized (stylized banding + much smaller lossless files)
  3. encoded as lossless WebP into web/public/img/guide/<biome>/
  4. the original moved to screenshots/done/ so the inbox self-clears

    python scripts/ingest_guide_shots.py           # process the inbox
    python scripts/ingest_guide_shots.py --todo    # which shots are still missing?
    python scripts/ingest_guide_shots.py --bits 4  # stronger posterize (default 5)
    python scripts/ingest_guide_shots.py --width 1600
    python scripts/ingest_guide_shots.py --keep    # don't move originals to done/
"""

import argparse
import difflib
import re
import sys
from pathlib import Path

from PIL import Image, ImageOps

REPO = Path(__file__).resolve().parents[1]
RAW = REPO / "screenshots" / "raw"
DONE = REPO / "screenshots" / "done"
OUT_ROOT = REPO / "web" / "public" / "img" / "guide"
DOCS = REPO / "web" / "public" / "data" / "vh" / "docs"

MAX_WIDTH = 1200          # guide renders at max-width 600px; 2x for retina
BITS = 5                  # posterize bits/channel — 5 is subtle, 4 is obvious
SOURCE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}

# Biome slugs must match ArticlesPage.tsx BIOMES + the docs/biome_*.md filenames.
# Longest-first so `black-forest-hero.png` beats a naive split on the first dash.
BIOMES = [
    "meadows", "black-forest", "swamp", "mountain",
    "plains", "ocean", "mistlands", "ashlands",
]
DOC_FOR = {b: f"biome_{b.replace('-', '')}.md" for b in BIOMES}

IMG_RE = re.compile(r'<img\s+src="/img/guide/([a-z-]+)/([^"/]+)\.webp"')
ALT_RE = re.compile(r'\salt="([^"]*)"')      # doubles as the shot brief for --todo

try:                                          # captions carry em-dashes and 📷
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def split_name(stem: str) -> tuple[str, str] | None:
    """`meadows-hero` -> ('meadows', 'hero'). Longest biome prefix wins."""
    for biome in sorted(BIOMES, key=len, reverse=True):
        if stem == biome:
            return None                      # no slug, just a biome name
        if stem.startswith(biome + "-"):
            return biome, stem[len(biome) + 1:]
    return None


def collect_sources() -> list[tuple[Path, str, str]]:
    """Every processable file in the inbox as (path, biome, slug)."""
    found: list[tuple[Path, str, str]] = []
    unmatched: list[Path] = []
    for path in sorted(RAW.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in SOURCE_EXT:
            continue
        rel = path.relative_to(RAW)
        if len(rel.parts) > 1 and rel.parts[0] in BIOMES:
            found.append((path, rel.parts[0], path.stem))     # raw/<biome>/<slug>.png
            continue
        parsed = split_name(path.stem)
        if parsed:
            found.append((path, parsed[0], parsed[1]))        # raw/<biome>-<slug>.png
        else:
            unmatched.append(path)
    for path in unmatched:
        print(f"  SKIP {path.relative_to(RAW)} — name must start with a biome: {', '.join(BIOMES)}")
    return found


def convert(src: Path, dest: Path, width: int, bits: int) -> tuple[int, int, int, int]:
    img = Image.open(src)
    img = img.convert("RGB")                      # screenshots have no meaningful alpha
    if img.width > width:
        img.thumbnail((width, 10 ** 6), Image.LANCZOS)
    img = ImageOps.posterize(img, bits)
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, "WEBP", lossless=True, quality=100, method=6)
    return img.width, img.height, src.stat().st_size, dest.stat().st_size


def shot_slots() -> list[tuple[str, str, str]]:
    """Every /img/guide/<biome>/<slug>.webp referenced by a biome doc, with the
    img's alt text as the shot brief. Returns (biome, slug, alt)."""
    slots: list[tuple[str, str, str]] = []
    for biome in BIOMES:
        doc = DOCS / DOC_FOR[biome]
        if not doc.exists():
            continue
        for line in doc.read_text(encoding="utf-8").splitlines():
            m = IMG_RE.search(line)
            if not m:
                continue
            alt = ALT_RE.search(line)
            slots.append((m.group(1), m.group(2), alt.group(1) if alt else ""))
    return slots


def report_todo() -> None:
    slots = shot_slots()
    if not slots:
        print("no /img/guide/<biome>/<slug>.webp references found in the biome docs")
        return
    have = sum(1 for b, s, _ in slots if (OUT_ROOT / b / f"{s}.webp").exists())
    print(f"guide screenshots: {have}/{len(slots)} captured")
    print(f"drop files in:      {RAW}\n")
    current = None
    for biome, slug, caption in slots:
        if biome != current:
            print(f"{biome}:")
            current = biome
        exists = (OUT_ROOT / biome / f"{slug}.webp").exists()
        mark = "[x]" if exists else "[ ]"
        drop = "" if exists else f"   <- drop {biome}-{slug}.png"
        print(f"  {mark} {slug}{drop}")
        if caption and not exists:
            print(f"        {caption}")
    if have < len(slots):
        print(f"\nname them exactly as above, drop into {RAW}, then run:")
        print("  python scripts/ingest_guide_shots.py")


def main() -> None:
    ap = argparse.ArgumentParser(description="Ingest guide screenshots into web/public/img/guide")
    ap.add_argument("--todo", action="store_true", help="list captured/missing shots and exit")
    ap.add_argument("--bits", type=int, default=BITS, help=f"posterize bits/channel 1-8 (default {BITS})")
    ap.add_argument("--width", type=int, default=MAX_WIDTH, help=f"max output width (default {MAX_WIDTH})")
    ap.add_argument("--keep", action="store_true", help="leave originals in raw/ instead of moving to done/")
    args = ap.parse_args()

    if args.todo:
        report_todo()
        return

    RAW.mkdir(parents=True, exist_ok=True)
    sources = collect_sources()
    if not sources:
        print(f"nothing to do — drop <biome>-<slug>.png files in {RAW.relative_to(REPO)}")
        return

    slots = shot_slots()
    referenced = {(b, s) for b, s, _ in slots}

    print(f"processing {len(sources)} image(s)  (posterize {args.bits}-bit, max {args.width}px, lossless webp)")
    raw_total = out_total = 0
    orphans: list[tuple[str, str]] = []
    for src, biome, slug in sources:
        dest = OUT_ROOT / biome / f"{slug}.webp"
        w, h, in_bytes, out_bytes = convert(src, dest, args.width, args.bits)
        raw_total += in_bytes
        out_total += out_bytes
        print(f"  {biome}/{slug}.webp  {w}x{h}  {in_bytes/1024:.0f}K -> {out_bytes/1024:.0f}K")
        if (biome, slug) not in referenced:
            orphans.append((biome, slug))
        if not args.keep:
            DONE.mkdir(parents=True, exist_ok=True)
            src.replace(DONE / src.name)

    print(f"wrote {len(sources)} file(s)  {raw_total/1024/1024:.1f}MB -> {out_total/1024/1024:.1f}MB")
    if not args.keep:
        print(f"  originals moved to {DONE.relative_to(REPO)}")

    # A slug no doc points at will never appear on the site — almost always a typo
    # in the dropped filename. Suggest the closest slot the biome is still missing.
    for biome, slug in orphans:
        near = difflib.get_close_matches(slug, [s for b, s, _ in slots if b == biome], n=1, cutoff=0.4)
        hint = f" — did you mean {biome}-{near[0]}.png?" if near else ""
        print(f"  WARN {biome}/{slug}.webp is not referenced by any guide doc{hint}")

    missing = [(b, s) for b, s, _ in slots if not (OUT_ROOT / b / f"{s}.webp").exists()]
    if missing:
        print(f"  {len(missing)} shot(s) still missing — run --todo for the list")


if __name__ == "__main__":
    main()

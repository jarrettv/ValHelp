from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Dict, Optional, Tuple


#!/usr/bin/env python3
"""
fill_trophy_metadata.py

Scan <repo>/data/Trophy for image files that are missing a companion metadata
JSON file and create the JSON when needed. Metadata defaults can be adjusted via
command-line options.

Usage:
    python fill_trophy_metadata.py [--dry-run] [--verbose]

Options:
    --dry-run  Show the actions without writing files.
    --verbose  Print detailed progress information.
"""


TROPHY_DIR = Path("data") / "Trophy"
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}
JSON_EXT = ".json"
DEFAULT_TEMPLATE: Dict[str, str | int | float] = {
    "code": "",
    "type": "Trophy",
    "name": "",
    "desc": "",
    "image": "",
    "drop": "",
    "usage": "",
    "weight": 2.0,
    "stack": 20,
    "biome": "",
}


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def ensure_dir(path: Path, dry_run: bool, verbose: bool) -> None:
    if path.exists():
        return
    if dry_run:
        if verbose:
            print(f"[DRY] mkdir {path}")
        return
    path.mkdir(parents=True, exist_ok=True)
    if verbose:
        print(f"created directory {path}")


def parse_trophy_definitions(trophies_ts: Path, verbose: bool) -> Dict[str, Dict[str, str]]:
    code_map: Dict[str, Dict[str, str]] = {}
    if not trophies_ts.exists():
        if verbose:
            print(f"warning: trophies.ts not found at {trophies_ts}")
        return code_map

    try:
        content = trophies_ts.read_text(encoding="utf-8")
    except Exception as exc:
        if verbose:
            print(f"warning: unable to read {trophies_ts}: {exc}")
        return code_map

    entry_pattern = re.compile(
        r"\{\s*name:\s*\"(?P<name>[^\"]+)\"\s*,\s*biome:\s*\"(?P<biome>[^\"]+)\"\s*,\s*code:\s*\"(?P<code>[^\"]+)\"\s*\}",
        re.MULTILINE,
    )

    for match in entry_pattern.finditer(content):
        code = match.group("code")
        code_map[code] = {
            "name": match.group("name"),
            "biome": match.group("biome"),
        }

    return code_map


def build_metadata(image_path: Path, template: Dict[str, str | int | float], code_map: Dict[str, Dict[str, str]]) -> Dict[str, str | int | float]:
    metadata = dict(template)
    stem = image_path.stem
    trophy_info = code_map.get(stem)

    metadata["code"] = stem
    metadata["type"] = "Trophy"

    if trophy_info:
        metadata["name"] = trophy_info.get("name", stem.replace("_", " ").title())
        metadata["biome"] = trophy_info.get("biome", "")
    else:
        metadata["name"] = stem.replace("_", " ").title()
        metadata["biome"] = ""

    metadata["image"] = f"/img/Trophy/{stem}{image_path.suffix.lower()}"
    return metadata


def resolve_image_for_json(json_path: Path) -> Optional[Path]:
    for ext in IMAGE_EXTS:
        candidate = json_path.with_suffix(ext)
        if candidate.exists():
            return candidate
    return None


def apply_template_to_metadata(
    json_path: Path,
    metadata: Dict[str, str | int | float],
    template: Dict[str, str | int | float],
    code_map: Dict[str, Dict[str, str]],
    verbose: bool,
) -> Tuple[Dict[str, str | int | float], bool]:
    updated = dict(metadata)
    stem = json_path.stem
    image_file = resolve_image_for_json(json_path)
    trophy_info = code_map.get(stem)

    def set_default(key: str, value):
        if key not in updated:
            updated[key] = value
            return True
        current = updated[key]
        if current is None and value is not None:
            updated[key] = value
            return True
        if current in (None, "") and value not in (None, ""):
            updated[key] = value
            return True
        return False

    changed = False

    if updated.get("code") != stem:
        updated["code"] = stem
        changed = True

    if updated.get("type") != "Trophy":
        updated["type"] = "Trophy"
        changed = True

    if trophy_info:
        if updated.get("name") != trophy_info.get("name"):
            updated["name"] = trophy_info.get("name", updated.get("name") or stem.replace("_", " ").title())
            changed = True
        if updated.get("biome") != trophy_info.get("biome"):
            updated["biome"] = trophy_info.get("biome", updated.get("biome") or "")
            changed = True
    else:
        changed |= set_default("name", stem.replace("_", " ").title())
        changed |= set_default("biome", "")

    if image_file:
        canonical_image = f"/img/Trophy/{stem}{image_file.suffix.lower()}"
        if updated.get("image") != canonical_image:
            updated["image"] = canonical_image
            changed = True
    else:
        changed |= set_default("image", updated.get("image", ""))
        if image_file is None and verbose:
            print(f"warning: no image found for {json_path}")

    changed |= set_default("desc", template.get("desc", ""))
    changed |= set_default("drop", template.get("drop", ""))
    changed |= set_default("usage", template.get("usage", ""))

    if "weight" not in updated or not isinstance(updated["weight"], (int, float)):
        updated["weight"] = template.get("weight", 2.0)
        changed = True
    if "stack" not in updated or not isinstance(updated["stack"], (int, float)):
        updated["stack"] = template.get("stack", 20)
        changed = True

    ordered_keys = [
        "code",
        "type",
        "name",
        "desc",
        "image",
        "drop",
        "usage",
        "weight",
        "stack",
        "biome",
    ]

    ordered_metadata: Dict[str, str | int | float] = {}
    for key in ordered_keys:
        if key in updated:
            ordered_metadata[key] = updated[key]
    for key, value in updated.items():
        if key not in ordered_metadata:
            ordered_metadata[key] = value

    if ordered_metadata != metadata:
        changed = True

    return ordered_metadata, changed


def write_metadata(json_path: Path, metadata: Dict[str, str | int | float], dry_run: bool, verbose: bool) -> None:
    if dry_run:
        print(f"[DRY] write {json_path}")
        return

    ensure_dir(json_path.parent, dry_run=False, verbose=verbose)
    json_text = json.dumps(metadata, ensure_ascii=False, indent=4) + "\n"
    json_path.write_text(json_text, encoding="utf-8")
    if verbose:
        print(f"wrote {json_path}")


def find_missing_metadata(trophy_dir: Path, verbose: bool) -> Dict[Path, Path]:
    missing: Dict[Path, Path] = {}
    for image_path in trophy_dir.rglob("*"):
        if image_path.is_dir():
            continue
        if image_path.suffix.lower() not in IMAGE_EXTS:
            continue

        json_path = image_path.with_suffix(JSON_EXT)
        if json_path.exists():
            if verbose:
                print(f"metadata exists for {image_path}")
            continue

        missing[image_path] = json_path
    return missing


def main() -> None:
    parser = argparse.ArgumentParser(description="Create missing trophy metadata JSON files")
    parser.add_argument("--dry-run", action="store_true", help="Show actions without writing any files")
    parser.add_argument("--verbose", action="store_true", help="Verbose output")
    args = parser.parse_args()

    root = repo_root()
    trophy_dir = root / TROPHY_DIR

    if not trophy_dir.exists():
        print(f"Trophy directory does not exist: {trophy_dir}")
        return

    if args.verbose:
        print(f"repo root: {root}")
        print(f"trophy dir: {trophy_dir}")

    template = dict(DEFAULT_TEMPLATE)
    trophy_definitions = parse_trophy_definitions(root / "web" / "src" / "domain" / "trophies.ts", args.verbose)

    missing = find_missing_metadata(trophy_dir, args.verbose)

    for image_path, json_path in missing.items():
        metadata = build_metadata(image_path, template, trophy_definitions)
        if args.verbose:
            print(f"creating metadata for {image_path}")
        write_metadata(json_path, metadata, dry_run=args.dry_run, verbose=args.verbose)

    updated_files = 0
    for json_path in sorted(trophy_dir.rglob(f"*{JSON_EXT}")):
        try:
            existing = json.loads(json_path.read_text(encoding="utf-8"))
        except Exception as exc:
            print(f"warning: unable to read {json_path}: {exc}")
            continue

        if not isinstance(existing, dict):
            if args.verbose:
                print(f"warning: skipping {json_path} (expected a JSON object)")
            continue

        normalized, changed = apply_template_to_metadata(json_path, existing, template, trophy_definitions, args.verbose)
        if not changed:
            continue

        updated_files += 1
        if args.dry_run:
            print(f"[DRY] normalize {json_path}")
            continue

        json_text = json.dumps(normalized, ensure_ascii=False, indent=4) + "\n"
        json_path.write_text(json_text, encoding="utf-8")
        if args.verbose:
            print(f"normalized {json_path}")

    if args.verbose or args.dry_run:
        print(f"processed {len(missing)} image(s); normalized {updated_files} metadata file(s)")


if __name__ == "__main__":
    main()

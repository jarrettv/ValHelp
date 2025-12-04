from __future__ import annotations

import argparse
import json
import sys
from collections import OrderedDict
from pathlib import Path
from typing import Any, Dict, List


#!/usr/bin/env python3
"""
generate_data_db.py

Aggregate all JSON payloads under <repo>/data/**/*.json into a flat list where
each record includes its `code`. The resulting manifest is written to
<repo>/web/public/data.json so the frontend can fetch a single optimized data
bundle.

Usage:
    python generate_data_db.py [--dry-run] [--verbose] [--pretty]

Options:
    --dry-run  Show the actions without writing the output file.
    --verbose  Print additional progress details.
    --pretty   Format the output JSON with indentation (default: compact).
"""


DATA_ROOT_NAME = "data"
OUTPUT_PATH = Path("web") / "public" / "data.json"
JSON_EXT = ".json"


def repo_root() -> Path:
    # scripts/generate_data_db.py -> repo root is two levels up
    return Path(__file__).resolve().parents[1]


def load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def sanitize_component(value: str) -> str:
    return value.replace("/", "_").replace("\\", "_")


def gather_records(data_root: Path, verbose: bool) -> List[Dict[str, Any]]:
    records_by_code: Dict[str, Dict[str, Any]] = {}
    if not data_root.exists():
        raise FileNotFoundError(f"data directory does not exist: {data_root}")

    json_files = sorted(data_root.rglob(f"*{JSON_EXT}"))
    if verbose:
        print(f"found {len(json_files)} json files under {data_root}")

    for json_path in json_files:
        try:
            data = load_json(json_path)
        except Exception as exc:
            print(f"warning: unable to parse {json_path}: {exc}", file=sys.stderr)
            continue

        code = data.get("code")
        if not isinstance(code, str) or not code.strip():
            print(f"warning: skipping {json_path} because it lacks a valid 'code' field", file=sys.stderr)
            continue

        code_key = code.strip()
        if code_key in records_by_code:
            print(f"warning: duplicate code '{code_key}' in {json_path}; keeping first entry", file=sys.stderr)
            continue

        data.pop("code", None)

        image_path = data.get("image")
        ext = Path(image_path).suffix if isinstance(image_path, str) and image_path.strip() else ".png"
        ext = ext.lower() if ext else ".png"

        type_value = data.get("type")
        type_name_raw = type_value.strip() if isinstance(type_value, str) else "Unknown"
        type_component = sanitize_component(type_name_raw)
        canonical_image = f"/img/{type_component}/{code_key}{ext}"
        data["image"] = canonical_image

        ordered: "OrderedDict[str, Any]" = OrderedDict()
        ordered["code"] = code_key
        ordered["type"] = type_value
        ordered["name"] = data.get("name")
        ordered["desc"] = data.get("desc")
        ordered["image"] = canonical_image
        for field, value in data.items():
            if field in ordered:
                continue
            ordered[field] = value

        records_by_code[code_key] = dict(ordered)
        if verbose:
            print(f"added {code_key} from {json_path}")

    return list(records_by_code.values())


def write_manifest(manifest: List[Dict[str, Any]], output_path: Path, dry_run: bool, pretty: bool, verbose: bool) -> None:
    ensure_dir(output_path.parent, dry_run=dry_run)

    payload = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n" if pretty else json.dumps(manifest, ensure_ascii=False, separators=(",", ":"))

    if dry_run:
        print(f"[DRY] write {output_path}")
        return

    if output_path.exists():
        try:
            existing = output_path.read_text(encoding="utf-8")
            if existing == payload:
                if verbose:
                    print(f"no changes for {output_path}")
                return
        except Exception:
            pass

    output_path.write_text(payload, encoding="utf-8")
    if verbose:
        print(f"wrote {output_path}")


def ensure_dir(path: Path, dry_run: bool) -> None:
    if path.exists():
        return
    if dry_run:
        print(f"[DRY] mkdir {path}")
        return
    path.mkdir(parents=True, exist_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a unified data.json manifest for the frontend")
    parser.add_argument("--dry-run", action="store_true", help="Show actions without writing output")
    parser.add_argument("--verbose", action="store_true", help="Verbose output")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON (indent=2)")
    args = parser.parse_args()

    root = repo_root()
    data_root = root / DATA_ROOT_NAME
    output_path = root / OUTPUT_PATH

    if args.verbose:
        print(f"repo root: {root}")
        print(f"data root: {data_root}")
        print(f"output path: {output_path}")

    records = gather_records(data_root, verbose=args.verbose)

    def sort_key(entry: Dict[str, Any]) -> tuple[str, str, float | int, str]:
        type_component = str(entry.get("type", "")).lower()
        wield_component = str(entry.get("wield", "")).lower()
        power_value = entry.get("power")
        power_component: float | int
        if isinstance(power_value, (int, float)):
            power_component = power_value
        else:
            power_component = float("inf")
        return type_component, wield_component, power_component, str(entry.get("code", ""))

    ordered_manifest = sorted(records, key=sort_key)
    write_manifest(ordered_manifest, output_path, dry_run=args.dry_run, pretty=args.pretty, verbose=args.verbose)

    if args.verbose or args.dry_run:
        print(f"processed {len(records)} records")


if __name__ == "__main__":
    main()

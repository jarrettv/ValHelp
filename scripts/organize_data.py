from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

#!/usr/bin/env python3
"""
organize_data.py

Relocate images and sister JSON metadata to root/data/<type>/<code>.<ext> and
produce a consolidated data manifest under api/wwwroot/data/materials.json.

The JSON file supplies the type and code fields that define the destination path.
The script can either copy or move the files and keeps the metadata in sync with
the new location. The script also removes the id field from the json since we
only use code as the unique identifier.

Usage:
    python organize_data.py [--move] [--dry-run] [--verbose]

Options:
    --move     Move files instead of copying (default: copy).
    --dry-run  Print actions without making changes.
    --verbose  Print extra progress information.
"""


IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".ico"}
JSON_EXT = ".json"
SOURCE_DIR_NAME = "stuff"          # under <repo>/api/wwwroot
TARGET_ROOT_NAME = "data"          # under <repo>/
MANIFEST_RELATIVE_PATH = Path("api") / "wwwroot" / "data" / "materials.json"


def repo_root() -> Path:
        # script lives in <repo>/scripts/organize_data.py -> repo is parent
        return Path(__file__).resolve().parents[1]


def sha1_of_file(path: Path) -> str:
        digest = hashlib.sha1()
        with path.open("rb") as handle:
                while True:
                        chunk = handle.read(128 * 1024)
                        if not chunk:
                                break
                        digest.update(chunk)
        return digest.hexdigest()


def ensure_dir(path: Path, dry_run: bool) -> None:
        if path.exists():
                return
        if dry_run:
                print(f"[DRY] mkdir {path}")
                return
        path.mkdir(parents=True, exist_ok=True)


def unique_destination(dest: Path, src_tag: str) -> Path:
        base = dest.stem
        parent = dest.parent
        suffix = dest.suffix
        candidate = parent / f"{base}-{src_tag}{suffix}"
        counter = 1
        while candidate.exists():
                candidate = parent / f"{base}-{src_tag}-{counter}{suffix}"
                counter += 1
        return candidate


def normalize_path(path: Path) -> Path:
        try:
                return path.resolve(strict=False)
        except Exception:
                return path


def copy_or_move_file(src: Path, dest: Path, move: bool, dry_run: bool, verbose: bool) -> Path:
        src_norm = normalize_path(src)
        dest_norm = normalize_path(dest)

        if src_norm == dest_norm:
                if verbose:
                        print(f"already in place: {src_norm}")
                return dest_norm

        ensure_dir(dest.parent, dry_run=dry_run)

        if dest.exists():
                try:
                        if src.is_file() and dest.is_file() and sha1_of_file(src) == sha1_of_file(dest):
                                if verbose:
                                        print(f"identical file already exists: {dest}")
                                if move and not dry_run and src.exists():
                                        if verbose:
                                                print(f"removing original after verifying identical: {src}")
                                        src.unlink()
                                return dest_norm
                except Exception:
                        pass
                new_dest = unique_destination(dest, src.parent.name)
                if verbose and new_dest != dest:
                        print(f"destination conflict, using {new_dest}")
                dest = new_dest
                dest_norm = normalize_path(dest)

        if dry_run:
                operation = "move" if move else "copy"
                print(f"[DRY] {operation} {src} -> {dest}")
                return dest_norm

        if move:
                shutil.move(str(src), str(dest))
        else:
                shutil.copy2(str(src), str(dest))
        return dest_norm


def sanitize_component(value: str) -> str:
        return value.replace("/", "_").replace("\\", "_")


def resolve_image_path(json_path: Path, metadata: dict, wwwroot: Path, target_root: Path, verbose: bool) -> Optional[Path]:
        candidates = []
        image_field = metadata.get("image")
        if isinstance(image_field, str):
                trimmed = image_field.strip()
                if trimmed:
                        if trimmed.startswith("/"):
                                candidates.append(wwwroot / trimmed.lstrip("/"))
                        else:
                                candidates.append(json_path.parent / trimmed)

        # Fallback: same stem with known image extensions next to JSON
        for ext in IMAGE_EXTS:
                candidates.append(json_path.with_suffix(ext))
                candidates.append(json_path.parent / f"{json_path.stem}{ext}")

        # If already organized, look in the target folder as well
        code = metadata.get("code")
        type_name = metadata.get("type")
        if isinstance(code, str) and isinstance(type_name, str):
                type_component = sanitize_component(type_name.strip())
                code_component = sanitize_component(code.strip())
                for ext in IMAGE_EXTS:
                        candidates.append(target_root / type_component / f"{code_component}{ext}")

        seen: set[str] = set()
        for candidate in candidates:
                normalized = normalize_path(candidate)
                key = str(normalized).lower()
                if key in seen:
                        continue
                seen.add(key)
                if normalized.exists() and normalized.is_file():
                        if verbose:
                                print(f"found image for {json_path}: {normalized}")
                        return normalized
        return None


def write_json_record(dest: Path, data: dict, dry_run: bool, verbose: bool) -> Path:
        json_text = json.dumps(data, ensure_ascii=False, indent=4) + "\n"

        if dry_run:
                print(f"[DRY] write json {dest}")
                return normalize_path(dest)

        ensure_dir(dest.parent, dry_run=False)

        if dest.exists():
                try:
                        existing = dest.read_text(encoding="utf-8")
                        if existing == json_text:
                                if verbose:
                                        print(f"skip identical json: {dest}")
                                return normalize_path(dest)
                except Exception:
                        pass

        dest.write_text(json_text, encoding="utf-8")
        if verbose:
                print(f"wrote json {dest}")
        return normalize_path(dest)


def write_manifest(manifest: Dict[str, Any], manifest_path: Path, dry_run: bool, verbose: bool) -> None:
        ensure_dir(manifest_path.parent, dry_run=dry_run)
        payload = json.dumps(manifest, ensure_ascii=False, separators=(",", ":"))

        if dry_run:
                print(f"[DRY] write manifest {manifest_path}")
                return

        if manifest_path.exists():
                try:
                        existing = manifest_path.read_text(encoding="utf-8")
                        if existing == payload:
                                if verbose:
                                        print(f"skip identical manifest: {manifest_path}")
                                return
                except Exception:
                        pass

        manifest_path.write_text(payload, encoding="utf-8")
        if verbose:
                print(f"wrote manifest {manifest_path}")


def process_json(json_path: Path, root: Path, wwwroot: Path, target_root: Path, move: bool, dry_run: bool, verbose: bool) -> Optional[Tuple[bool, str, Dict[str, Any]]]:
        try:
                with json_path.open("r", encoding="utf-8") as handle:
                        data = json.load(handle)
        except Exception as exc:
                print(f"warning: failed to parse JSON {json_path}: {exc}")
                return None

        data.pop("id", None)

        type_value = data.get("type")
        code_value = data.get("code")
        if not isinstance(type_value, str) or not type_value.strip():
                if verbose:
                        print(f"skip {json_path}: missing type field")
                return None
        if not isinstance(code_value, str) or not code_value.strip():
                if verbose:
                        print(f"skip {json_path}: missing code field")
                return None

        raw_type = type_value.strip()
        raw_code = code_value.strip()
        type_component = sanitize_component(raw_type)
        code_component = sanitize_component(raw_code)

        image_path = resolve_image_path(json_path, data, wwwroot, target_root, verbose)
        if image_path is None:
                print(f"warning: no image found for {json_path}")
                return None

        destination_dir = target_root / type_component
        ensure_dir(destination_dir, dry_run=dry_run)
        destination_file = destination_dir / f"{code_component}{image_path.suffix.lower()}"
        actual_dest = copy_or_move_file(image_path, destination_file, move=move, dry_run=dry_run, verbose=verbose)
        moved_flag = normalize_path(image_path) != actual_dest

        try:
                relative_image = actual_dest.relative_to(root)
                image_value = "/" + relative_image.as_posix()
        except ValueError:
                image_value = actual_dest.as_posix()

        data["image"] = image_value

        json_dest = destination_dir / f"{code_component}{JSON_EXT}"
        json_dest_norm = write_json_record(json_dest, data, dry_run=dry_run, verbose=verbose)

        if move:
                src_norm = normalize_path(json_path)
                if dry_run:
                        if src_norm != json_dest_norm:
                                print(f"[DRY] remove original json {json_path}")
                else:
                        if src_norm != json_dest_norm and json_path.exists():
                                if verbose:
                                        print(f"removing original json {json_path}")
                                json_path.unlink()

        return moved_flag, raw_type, data


def organize_images(root: Path, move: bool, dry_run: bool, verbose: bool) -> None:
        wwwroot = root / "api" / "wwwroot"
        source_root = wwwroot / SOURCE_DIR_NAME
        target_root = root / TARGET_ROOT_NAME
        manifest_path = root / MANIFEST_RELATIVE_PATH

        if not source_root.exists():
                print(f"source directory does not exist: {source_root}")
                return

        if verbose:
                print(f"repo root: {root}")
                print(f"source root: {source_root}")
                print(f"target root: {target_root}")
                print(f"manifest path: {manifest_path}")

        processed = 0
        moved = 0
        collections: Dict[str, Dict[str, Any]] = {}

        for json_path in source_root.rglob(f"*{JSON_EXT}"):
                processed += 1
                result = process_json(json_path, root, wwwroot, target_root, move=move, dry_run=dry_run, verbose=verbose)
                if result is None:
                        continue

                moved_flag, raw_type, record = result
                if moved_flag:
                        moved += 1

                type_label = raw_type.strip() or "Unknown"
                key = type_label.casefold()
                entry = collections.setdefault(key, {"type": type_label, "items": []})
                if not entry.get("type"):
                        entry["type"] = type_label
                entry["items"].append(record)

        manifest_payload = {
                "types": [entry for entry in collections.values() if entry["items"]]
        }
        write_manifest(manifest_payload, manifest_path, dry_run=dry_run, verbose=verbose)

        if verbose or not dry_run:
                action = "moved" if move else "copied"
                print(f"processed {processed} JSON files, {action} {moved} images and generated manifest with {len(manifest_payload['types'])} type groups")


def main() -> None:
        parser = argparse.ArgumentParser(description="Organize wwwroot images using type/code metadata from adjacent JSON files")
        parser.add_argument("--move", action="store_true", help="Move files instead of copying")
        parser.add_argument("--dry-run", action="store_true", help="Show what would be done without making changes")
        parser.add_argument("--verbose", action="store_true", help="Verbose output")
        args = parser.parse_args()

        root = repo_root()
        organize_images(root, move=args.move, dry_run=args.dry_run, verbose=args.verbose)


if __name__ == "__main__":
        main()
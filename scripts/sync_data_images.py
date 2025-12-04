from __future__ import annotations

import argparse
import filecmp
import re
import shutil
from pathlib import Path
from typing import Iterable


#!/usr/bin/env python3
"""
sync_data_images.py

Copy image assets from <repo>/data into <repo>/web/public/img while preserving the
relative directory structure and file metadata (timestamps, mode, etc.).

Usage:
    python sync_data_images.py [--dry-run] [--verbose] [--force]

Options:
    --dry-run  Show the planned copy operations without modifying files.
    --verbose  Emit detailed progress information.
    --force    Overwrite destination files even when they appear identical.
"""


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".bmp", ".ico"}
DATA_ROOT = Path("data")
TARGET_ROOT = Path("web") / "public" / "img"


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def is_image(path: Path) -> bool:
    return path.suffix.lower() in IMAGE_EXTENSIONS


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


def needs_copy(src: Path, dest: Path, force: bool) -> bool:
    if force or not dest.exists():
        return True
    try:
        # filecmp.cmp compares contents when shallow=False
        return not filecmp.cmp(src, dest, shallow=False)
    except OSError:
        return True


def copy_file(src: Path, dest: Path, dry_run: bool, verbose: bool) -> None:
    operation = "copy"
    if dry_run:
        print(f"[DRY] {operation} {src} -> {dest}")
        return
    ensure_dir(dest.parent, dry_run=False, verbose=verbose)
    shutil.copy2(src, dest)
    if verbose:
        print(f"{operation} {src} -> {dest}")


def iter_images(root: Path) -> Iterable[Path]:
    for path in root.rglob("*"):
        if path.is_file() and is_image(path):
            yield path


def sanitize_segment(segment: str) -> str:
    sanitized = segment.replace(" magic", "")
    return sanitized


def sanitize_relative_path(rel_path: Path) -> Path:
    parts = [sanitize_segment(part) for part in rel_path.parts]
    return Path(*parts)


def main() -> None:
    parser = argparse.ArgumentParser(description="Copy image assets from data/ into web/public/img")
    parser.add_argument("--dry-run", action="store_true", help="Show actions without writing files")
    parser.add_argument("--verbose", action="store_true", help="Verbose output")
    parser.add_argument("--force", action="store_true", help="Always overwrite destination files")
    args = parser.parse_args()

    root = repo_root()
    data_root = root / DATA_ROOT
    target_root = root / TARGET_ROOT

    if not data_root.exists():
        print(f"data directory does not exist: {data_root}")
        return

    if args.verbose:
        print(f"repo root: {root}")
        print(f"data root: {data_root}")
        print(f"target root: {target_root}")

    copied = 0
    skipped = 0

    for src in iter_images(data_root):
        rel = sanitize_relative_path(src.relative_to(data_root))
        dest = target_root / rel

        if not needs_copy(src, dest, args.force):
            skipped += 1
            if args.verbose:
                print(f"skip identical: {src}")
            continue

        copy_file(src, dest, dry_run=args.dry_run, verbose=args.verbose)
        copied += 1

    if args.verbose or args.dry_run:
        print(f"copied {copied} file(s), skipped {skipped} identical file(s)")


if __name__ == "__main__":
    main()

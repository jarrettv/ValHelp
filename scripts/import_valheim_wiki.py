from __future__ import annotations

"""Import Valheim wiki material data into local JSON files and images.

The script scrapes the portable infobox on a Valheim wiki page, converts the
captured values into the local ValHelp data schema, and writes the resulting
JSON manifest plus associated image into the ``/data/<type>/`` directory.

Example usage::

    python scripts/import_valheim_wiki.py \
        "https://valheim.fandom.com/wiki/Bronzehead_arrow" \
        --verbose

The script requires ``requests`` and ``beautifulsoup4``.
"""

import argparse
import json
import re
import time
from collections import OrderedDict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Tuple
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

DEFAULT_OUTPUT_ROOT = Path(__file__).resolve().parents[1] / "data"
USER_AGENT = "ValHelpDataBot/1.0 (+https://github.com/jarrettv/ValHelp)"


def fetch_html(url: str) -> BeautifulSoup:
    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
            response.raise_for_status()
            return BeautifulSoup(response.text, "html.parser")
        except requests.RequestException as exc:
            last_exc = exc
            # brief backoff for transient failures (connection reset / 503)
            time.sleep(0.6 * (attempt + 1))
    raise last_exc or RuntimeError(f"Failed to fetch {url}")


def extract_infobox(soup: BeautifulSoup) -> Tuple[str | None, Dict[str, Any]]:
    infobox = soup.find(class_="portable-infobox")
    if infobox is None:
        raise RuntimeError("Unable to locate a portable infobox on the page")

    title_node = infobox.find(class_="pi-title")
    name = title_node.get_text(strip=True) if title_node else None

    data: Dict[str, Any] = {}
    for item in infobox.find_all(class_="pi-item"):
        key = item.get("data-source")
        if not key:
            label_node = item.find(class_="pi-data-label")
            if label_node:
                label = label_node.get_text(" ", strip=True)
                if label:
                    key = label
        if not key:
            continue
        value_node = item.find(class_="pi-data-value") or item
        parsed = parse_value(value_node)
        data[key.strip().lower()] = parsed

    internal_node = infobox.select_one('div[data-source="id"] .pi-data-value, div[data-source="id"] div')
    if internal_node:
        internal_id = internal_node.get_text(strip=True)
        if internal_id:
            data["_internal_id"] = internal_id

    image_node = infobox.find("img")
    if image_node and image_node.get("src"):
        data["_image_url"] = clean_image_url(image_node["src"])

    if name:
        data.setdefault("name", name)

    description_node = infobox.find("div", class_="infobox-description")
    if description_node:
        data.setdefault("description", description_node.get_text(strip=True))

    return name, data


def parse_value(node: BeautifulSoup) -> Any:
    if node is None:
        return None
    if node.name == "li":
        return node.get_text(" ", strip=True)
    list_items = node.find_all("li")
    if list_items:
        return [parse_value(li) for li in list_items]
    text = node.get_text(" ", strip=True)
    return text


def clean_image_url(src: str) -> str:
    if src.startswith("//"):
        return f"https:{src}"
    if "/revision" in src:
        return src.split("/revision", 1)[0]
    return src


def ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


FIELD_ALIASES: Mapping[str, Tuple[str, ...]] = {
    "type": ("type", "item type"),
    "desc": ("description", "about"),
    "usage": ("usage", "used for"),
    "source": ("crafting station", "station"),
    "craft": ("craft", "crafting"),
    "repair": ("repair",),
    "weight": ("weight",),
    "stack": ("stack", "stack size", "max stack"),
    "durab": ("durability", "durability health"),
    "power": ("power", "piercing"),
    "drop": ("drop", "dropped by"),
    "aliases": ("also known as", "aliases"),
    "mats": ("materials", "recipe", "crafting materials"),
}

CODE_ALIASES: Tuple[str, ...] = ("internal id", "internal-id", "code")


def sanitize_code(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]", "", value)
    return cleaned


def pick_field(raw: Mapping[str, Any], aliases: Iterable[str]) -> Any:
    for alias in aliases:
        if alias in raw and raw[alias]:
            return raw[alias]
    return None


def to_number(value: Any) -> Any:
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        try:
            if "." in value:
                return float(value)
            return int(value)
        except ValueError:
            return value
    return value


def parse_materials(value: Any) -> Dict[str, str] | None:
    if isinstance(value, dict):
        return {str(k): str(v) for k, v in value.items()}
    items: List[str]
    if isinstance(value, list):
        items = [str(v) for v in value]
    elif isinstance(value, str):
        items = [part.strip() for part in re.split(r"[,;]\s*", value) if part.strip()]
    else:
        return None

    materials: Dict[str, str] = {}
    single_pattern = re.compile(r"^(?P<name>.+?)(?:\s*[x×]\s*(?P<count>[0-9]+))?$")
    pair_pattern = re.compile(r"(?P<name>.+?)\s*[x×]\s*(?P<count>[0-9]+)")

    for item in items:
        item = item.strip()
        if not item:
            continue

        # Some pages (notably crafting stations) present recipes as a single
        # space-separated string: "Stone x4 Coal x4 Wood x10".
        pair_matches = list(pair_pattern.finditer(item))
        if len(pair_matches) > 1:
            for match in pair_matches:
                mat_name = match.group("name").strip()
                count = match.group("count") or "1"
                if mat_name:
                    materials[mat_name] = count
            continue

        match = single_pattern.match(item)
        if not match:
            continue
        mat_name = match.group("name").strip()
        count = match.group("count") or "1"
        if mat_name:
            materials[mat_name] = count
    return materials or None


def _normalize_material_key(value: str) -> str:
    value = value.strip().lower().replace("×", "x")
    return re.sub(r"[^a-z0-9]", "", value)


def _build_material_name_index(data_root: Path) -> Dict[str, Tuple[str, str]]:
    """Build a lookup from normalized material names/aliases -> (code, name)."""

    index: Dict[str, Tuple[str, str]] = {}
    for json_path in sorted(data_root.rglob("*.json")):
        try:
            payload = json.loads(json_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(payload, dict):
            continue

        code = payload.get("code")
        name = payload.get("name")
        if isinstance(code, str) and code.strip() and isinstance(name, str) and name.strip():
            index.setdefault(_normalize_material_key(name), (code.strip(), name.strip()))

        aliases = payload.get("aliases")
        if isinstance(code, str) and code.strip() and isinstance(aliases, list):
            for alias in aliases:
                if isinstance(alias, str) and alias.strip() and isinstance(name, str) and name.strip():
                    index.setdefault(_normalize_material_key(alias), (code.strip(), name.strip()))

    return index


def _mats_dict_to_code_list(
    mats: Dict[str, str],
    *,
    material_index: Dict[str, Tuple[str, str]],
) -> List[Dict[str, Any]]:
    result: List[Dict[str, Any]] = []
    for mat_name, count in mats.items():
        if not isinstance(mat_name, str) or not mat_name.strip():
            continue
        key = _normalize_material_key(mat_name)
        resolved = material_index.get(key)
        if resolved:
            code, canonical_name = resolved
            result.append({"code": code, "name": canonical_name, "count": str(count)})
        else:
            # Best-effort fallback; sync_missing_materials.py can backfill + rewrite later.
            result.append({"code": "", "name": mat_name.strip(), "count": str(count)})
    return result


def normalise_aliases(value: Any) -> List[str] | None:
    if isinstance(value, list):
        return [str(v) for v in value]
    if isinstance(value, str):
        return [part.strip() for part in re.split(r"[,/]| and ", value) if part.strip()]
    return None


def build_entry(
    url: str,
    raw_name: str | None,
    raw: Dict[str, Any],
    code: str,
    type_hint: str | None,
    image_rel_path: str | None,
) -> OrderedDict[str, Any]:
    entry: "OrderedDict[str, Any]" = OrderedDict()
    entry["code"] = code
    entry["name"] = raw.get("name") or raw_name or code
    entry["desc"] = pick_field(raw, FIELD_ALIASES["desc"]) or ""
    entry_type = type_hint or pick_field(raw, FIELD_ALIASES["type"]) or "Unknown"
    entry["type"] = entry_type
    entry["image"] = image_rel_path or ""

    for target, aliases in FIELD_ALIASES.items():
        if target in {"type", "desc", "mats", "aliases"}:
            continue
        value = pick_field(raw, aliases)
        if value is None:
            continue
        if target in {"weight", "stack", "power"}:
            value = to_number(value)
        entry[target] = value

    mats_value = parse_materials(pick_field(raw, FIELD_ALIASES["mats"]))
    if mats_value:
        entry["mats"] = mats_value

    aliases_value = normalise_aliases(pick_field(raw, FIELD_ALIASES["aliases"]))
    if aliases_value:
        entry["aliases"] = aliases_value

    entry["source_url"] = url

    return entry


def download_image(url: str, dest: Path) -> None:
    if not url:
        return
    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
            response.raise_for_status()
            ensure_directory(dest.parent)
            dest.write_bytes(response.content)
            return
        except requests.RequestException as exc:
            last_exc = exc
            time.sleep(0.6 * (attempt + 1))
    raise last_exc or RuntimeError(f"Failed to download image {url}")


def import_url(
    url: str,
    *,
    output_root: Path = DEFAULT_OUTPUT_ROOT,
    image_ext: str = ".png",
    dry_run: bool = False,
    verbose: bool = False,
) -> tuple[OrderedDict[str, Any], Path, Path | None]:
    repo_root = Path(__file__).resolve().parents[1]
    output_root_arg = Path(output_root)
    resolved_output_root = output_root_arg if output_root_arg.is_absolute() else (repo_root / output_root_arg)

    soup = fetch_html(url)
    raw_name, raw_data = extract_infobox(soup)

    if verbose:
        print(f"extracted fields: {sorted(raw_data.keys())}")

    image_url = raw_data.get("_image_url")
    raw_code = raw_data.get("_internal_id") or pick_field(raw_data, CODE_ALIASES)
    if not isinstance(raw_code, str) or not raw_code.strip():
        raise ValueError("Unable to determine internal ID from wiki infobox (expected 'Internal ID').")
    code = sanitize_code(raw_code.strip())
    if not code:
        raise ValueError("Internal ID resolved to an empty code after sanitization.")

    type_value = pick_field(raw_data, FIELD_ALIASES["type"]) or "Misc"
    output_dir = resolved_output_root / str(type_value)
    ensure_directory(output_dir)

    resolved_image_ext = Path(urlparse(image_url).path).suffix if image_url else ""
    if not resolved_image_ext:
        resolved_image_ext = image_ext
    resolved_image_ext = resolved_image_ext or ".png"

    image_path: Path | None = None
    image_rel_path: str | None = None
    if image_url:
        image_path = output_dir / f"{code}{resolved_image_ext}"
        image_rel_path = f"/data/{type_value}/{image_path.name}"

    entry = build_entry(url, raw_name, raw_data, code, type_value, image_rel_path)

    # Normalize materials into code-based references (keep display name too).
    mats_value = entry.get("mats")
    if isinstance(mats_value, dict) and mats_value:
        material_index = _build_material_name_index(resolved_output_root)
        entry["mats"] = _mats_dict_to_code_list(mats_value, material_index=material_index)
    json_path = output_dir / f"{code}.json"

    if dry_run:
        return entry, json_path, image_path

    ensure_directory(output_dir)
    json_path.write_text(json.dumps(entry, indent=4, ensure_ascii=False) + "\n", encoding="utf-8")
    if verbose:
        print(f"wrote {json_path}")

    if image_url and image_path is not None:
        download_image(image_url, image_path)
        if verbose:
            print(f"downloaded image to {image_path}")

    return entry, json_path, image_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Import Valheim wiki data into local JSON format")
    parser.add_argument("url", help="Valheim wiki page URL")
    parser.add_argument(
        "--output-root",
        default=DEFAULT_OUTPUT_ROOT,
        type=Path,
        help="Root directory for data output (defaults to repo /data)",
    )
    parser.add_argument("--image-ext", default=".png", help="Image extension fallback if detection fails")
    parser.add_argument("--dry-run", action="store_true", help="Preview actions without writing files")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    args = parser.parse_args()

    if args.dry_run:
        entry, json_path, image_path = import_url(
            args.url,
            output_root=args.output_root,
            image_ext=args.image_ext,
            dry_run=True,
            verbose=args.verbose,
        )
        print("--- dry run ---")
        print(json.dumps(entry, indent=2, ensure_ascii=False))
        print(f"would write JSON: {json_path}")
        if image_path is not None:
            image_url = entry.get("_image_url") if isinstance(entry, dict) else None
            # Note: entry does not include the raw image url; this is only a hint.
            print(f"would download image -> {image_path}")
        return

    import_url(
        args.url,
        output_root=args.output_root,
        image_ext=args.image_ext,
        dry_run=False,
        verbose=args.verbose,
    )


if __name__ == "__main__":
    main()

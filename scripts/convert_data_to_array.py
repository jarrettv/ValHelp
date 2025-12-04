from __future__ import annotations

import json
from pathlib import Path

INPUT_PATH = Path("web") / "public" / "data.json"
OUTPUT_PATH = Path("web") / "public" / "data2.json"


def main() -> None:
    raw = INPUT_PATH.read_text(encoding="utf-8")
    source = json.loads(raw)

    if isinstance(source, dict):
        records = []
        for code, payload in source.items():
            entry = dict(payload)
            entry.setdefault("code", code)
            records.append(entry)
    elif isinstance(source, list):
        records = []
        seen_codes = set()
        for item in source:
            entry = dict(item)
            code = entry.get("code")
            if not isinstance(code, str) or not code:
                raise ValueError("each entry must include a non-empty 'code' field")
            if code in seen_codes:
                raise ValueError(f"duplicate code detected: {code}")
            seen_codes.add(code)
            records.append(entry)
    else:
        raise TypeError("input JSON must be an object or an array")

    OUTPUT_PATH.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(records)} records to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()

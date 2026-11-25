"""Phase 2: Valheim's official Steam announcements → complaints.game_patch (the patch timeline).

ISteamNews/GetNewsForApp, steam_community_announcements feed only. It returns about 200 items per call, so
this pages backwards with enddate. Early patches are titled only by version ("0.153.2"), later ones
"Patch 0.217.14 – Hildir's Request", so the version is parsed out of the title. Public-test (PTB)
announcements are kept but flagged, because the date that matters is when a patch reached everyone.
Milestones are the named content updates plus the early access launch and 1.0.

Running it again is cheap and harmless (upsert).
"""
from __future__ import annotations

import re
import sys
from datetime import datetime, timezone

import requests

import db

API = "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/"
APPID = 892970
VERSION_RE = re.compile(r"\b([01]\.\d{1,3}\.\d{1,3})\b")
# A dash and a name after the version ("Patch 0.218.15 – Ashlands"), or announcements of a release itself.
MILESTONE_RE = re.compile(r"\d\s+[–-]\s+\S|Has Arrived|arrives!|Release and Roadmap", re.I)


def fetch_all(session: requests.Session) -> list[dict]:
    items: dict[str, dict] = {}
    enddate = None
    while True:
        params = {"appid": APPID, "count": 200, "maxlength": 0, "feeds": "steam_community_announcements"}
        if enddate:
            params["enddate"] = enddate
        r = session.get(API, params=params, timeout=60)
        r.raise_for_status()
        batch = r.json()["appnews"]["newsitems"]
        fresh = [n for n in batch if n["gid"] not in items]
        if not fresh:
            return list(items.values())
        for n in fresh:
            items[n["gid"]] = n
        enddate = min(n["date"] for n in batch) - 1


def main() -> int:
    conn = db.connect()
    session = requests.Session()
    session.headers["User-Agent"] = "valhelp-complaints/1.0"
    news = fetch_all(session)
    with conn.transaction():
        for n in news:
            title = n["title"].strip()
            m = VERSION_RE.search(title)
            conn.execute(
                """INSERT INTO complaints.game_patch (gid, published_at, title, version, is_public_test,
                                                      is_milestone, url, body)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (gid) DO UPDATE SET title = excluded.title, version = excluded.version,
                     is_public_test = excluded.is_public_test, is_milestone = excluded.is_milestone,
                     url = excluded.url, body = excluded.body""",
                (n["gid"], datetime.fromtimestamp(n["date"], tz=timezone.utc), title,
                 m.group(1) if m else None, "public test" in title.lower(),
                 bool(MILESTONE_RE.search(title)) and "public test" not in title.lower(),
                 n.get("url"), n.get("contents")),
            )
    rows = conn.execute(
        """SELECT count(*), count(version), count(*) FILTER (WHERE is_milestone),
                  min(published_at)::date, max(published_at)::date FROM complaints.game_patch""").fetchone()
    print(f"{rows[0]} announcements, {rows[1]} with a version, {rows[2]} milestones, {rows[3]}..{rows[4]}")
    for d, t in conn.execute("SELECT published_at::date, title FROM complaints.game_patch WHERE is_milestone "
                             "ORDER BY published_at"):
        print(f"  {d}  {t}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

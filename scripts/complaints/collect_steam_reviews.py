"""Collect Valheim Steam reviews into complaints.raw_post (source = 'steam_review').

Uses IUserReviewsService/GetAppReviews (the /appreviews endpoint was retired 2026-10-22). No key needed.

Pages in "Updated" order (newest edit first), so one walk covers every review, and a later run catches
both new reviews and edits to old ones:
  1. Backfill: walk the whole list once from '*', saving the cursor after every committed page, so an
     interrupted run picks up where it stopped. The newest timestamp_updated seen on the first page is the
     high-water mark.
  2. Incremental (every later run): walk from '*' until a page is entirely older than the high-water
     mark minus an overlap, then move the mark forward.
Re-fetching a review refreshes its text, votes and playtime (upsert), so running it again is harmless.

    .venv/Scripts/python collect_steam_reviews.py              # backfill/resume, then incremental
    .venv/Scripts/python collect_steam_reviews.py --max-pages 5
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone

import requests

import db

APPID = 892970
SOURCE = "steam_review"
API = "https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/"
FILTER_UPDATED = 2
PURCHASE_ALL = 1
OVERLAP_SECONDS = 2 * 86400


def ts(v: int | None) -> datetime | None:
    return datetime.fromtimestamp(v, tz=timezone.utc) if v else None


def fetch_page(session: requests.Session, cursor: str, per_page: int) -> dict:
    inp = {
        "appid": APPID,
        "filter": FILTER_UPDATED,
        "languages": ["all"],
        "purchase_type": PURCHASE_ALL,
        "review_type": 0,
        "num_per_page": per_page,
        "cursor": cursor,
        "filter_offtopic_activity": False,  # keep review-bomb periods; they are complaint signal too
    }
    delay = 5.0
    for attempt in range(8):
        try:
            r = session.get(API, params={"input_json": json.dumps(inp)}, timeout=60)
        except requests.RequestException as e:
            print(f"  network error ({e}); retry in {delay:.0f}s", flush=True)
        else:
            if r.status_code == 200:
                return r.json().get("response", {})
            print(f"  HTTP {r.status_code}; retry in {delay:.0f}s", flush=True)
        time.sleep(delay)
        delay = min(delay * 2, 300)
    raise RuntimeError("GetAppReviews kept failing; state is saved, run again later")


def to_row(rv: dict, hash_author) -> dict:
    a = rv.get("author") or {}
    rid = str(rv["recommendationid"])
    meta = {k: v for k, v in rv.items() if k not in ("review", "author", "recommendationid")}
    meta["author"] = {k: v for k, v in a.items() if k != "steamid"}
    return {
        "source": SOURCE,
        "external_id": rid,
        "parent_external_id": None,
        "url": f"https://steamcommunity.com/profiles/{a['steamid']}/recommended/{APPID}/" if a.get("steamid") else None,
        "author_hash": hash_author("steam", a.get("steamid")),
        "posted_at": ts(rv["timestamp_created"]),
        "edited_at": ts(rv.get("timestamp_updated")),
        "language": rv.get("language"),
        "title": None,
        "body": rv.get("review") or "",
        "score": rv.get("votes_up"),
        "recommended": rv.get("voted_up"),
        "author_playtime_min": a.get("playtime_at_review"),
        "meta": meta,
    }


def walk(conn, session, hash_author, state: dict, *, incremental: bool, per_page: int, max_pages: int | None,
         sleep: float) -> int:
    cursor = "*" if incremental else state.get("backfill_cursor", "*")
    stop_before = (state.get("hwm", 0) - OVERLAP_SECONDS) if incremental else None
    seen_cursors = set()
    pages = total_ins = total_upd = 0
    newest = state.get("hwm", 0)
    label = "incremental" if incremental else "backfill"

    while max_pages is None or pages < max_pages:
        resp = fetch_page(session, cursor, per_page)
        reviews = resp.get("reviews") or []
        next_cursor = resp.get("cursor")
        if pages == 0 and "total_matching" in resp:
            print(f"[{label}] total_matching={resp['total_matching']}", flush=True)
        if not reviews:
            if not incremental:
                state["backfill_done"] = True
                state.pop("backfill_cursor", None)
            with conn.transaction():
                db.save_state(conn, SOURCE, state)
            print(f"[{label}] reached end", flush=True)
            break

        rows = [to_row(rv, hash_author) for rv in reviews]
        page_max = max(rv.get("timestamp_updated") or 0 for rv in reviews)
        page_min = min(rv.get("timestamp_updated") or 0 for rv in reviews)
        newest = max(newest, page_max)

        with conn.transaction():
            ins, upd = db.upsert_posts(conn, rows)
            if incremental:
                pass  # hwm moves only once the walk finishes
            else:
                if "hwm" not in state:
                    state["hwm"] = page_max
                state["backfill_cursor"] = next_cursor
            db.save_state(conn, SOURCE, state)
        pages += 1
        total_ins += ins
        total_upd += upd
        print(f"[{label}] page {pages}: +{ins} new, {upd} refreshed, updated "
              f"{ts(page_min):%Y-%m-%d}..{ts(page_max):%Y-%m-%d}", flush=True)

        if incremental and page_max < stop_before:
            break
        if not next_cursor or next_cursor in seen_cursors or next_cursor == cursor:
            if not incremental:
                state["backfill_done"] = True
                state.pop("backfill_cursor", None)
                with conn.transaction():
                    db.save_state(conn, SOURCE, state)
            print(f"[{label}] cursor stopped advancing; end", flush=True)
            break
        seen_cursors.add(cursor)
        cursor = next_cursor
        time.sleep(sleep)

    if incremental and (max_pages is None or pages < max_pages):
        state["hwm"] = newest
        state["last_incremental_at"] = int(time.time())
        with conn.transaction():
            db.save_state(conn, SOURCE, state)
    print(f"[{label}] done: {pages} pages, {total_ins} new, {total_upd} refreshed", flush=True)
    return pages


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--per-page", type=int, default=100)
    ap.add_argument("--max-pages", type=int, default=None, help="stop after N pages (state is kept)")
    ap.add_argument("--sleep", type=float, default=0.75, help="seconds between pages")
    args = ap.parse_args()

    conn = db.connect()
    hash_author = db.author_hasher(conn)
    state = db.load_state(conn, SOURCE)
    session = requests.Session()
    session.headers["User-Agent"] = "valhelp-complaints/1.0"

    if not state.get("backfill_done"):
        print(f"backfill {'resuming' if state.get('backfill_cursor') else 'starting'}", flush=True)
        walk(conn, session, hash_author, state, incremental=False, per_page=args.per_page,
             max_pages=args.max_pages, sleep=args.sleep)
        if not state.get("backfill_done"):
            return 0
    walk(conn, session, hash_author, state, incremental=True, per_page=args.per_page,
         max_pages=args.max_pages, sleep=args.sleep)
    return 0


if __name__ == "__main__":
    sys.exit(main())

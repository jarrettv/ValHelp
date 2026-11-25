"""Collect subreddit posts and comments into complaints.raw_post (sources 'reddit_post', 'reddit_comment').

Uses the Arctic Shift archive API (arctic-shift.photon-reddit.com). It needs no login: Reddit's own
self-service API apps are blocked ("Max clients have been reached"). Arctic Shift ingests close to real
time, so this covers both the full history and recent activity.

Walks each (subreddit, kind) oldest → newest by created_utc and keeps the last timestamp in
complaints.collector_state. The first run backfills, an interrupted run resumes, and later runs fetch only
what's new. Every page re-requests from 1 s before the last timestamp, and the upsert on
(source, external_id) drops the duplicates.

Caveat: Arctic Shift captures items shortly after posting, so score is often an early snapshot (frequently
1). Treat Reddit scores as weak.

    .venv/Scripts/python collect_reddit.py                       # r/valheim posts, then comments
    .venv/Scripts/python collect_reddit.py --kinds posts --max-pages 3
"""
from __future__ import annotations

import argparse
import sys
import time
from datetime import datetime, timezone

import requests

import db

API = "https://arctic-shift.photon-reddit.com/api"
START = 1514764800  # 2018-01-01; r/valheim predates early access (Feb 2021) but has almost nothing before
DEAD = {"[deleted]", "[removed]", ""}

POST_FIELDS = None  # Arctic Shift only accepts a subset of field names for posts; fetch everything
COMMENT_FIELDS = None  # field filtering accepts only an undocumented subset; fetch everything


def ts(v) -> datetime | None:
    return datetime.fromtimestamp(int(v), tz=timezone.utc) if v else None


def edited_ts(item) -> datetime | None:
    e = item.get("edited")
    return ts(e) if isinstance(e, (int, float)) and e > 1 else None


def get(session: requests.Session, kind: str, params: dict) -> list[dict]:
    delay = 5.0
    for _ in range(10):
        try:
            r = session.get(f"{API}/{kind}/search", params=params, timeout=90)
        except requests.RequestException as e:
            print(f"  network error ({e}); retry in {delay:.0f}s", flush=True)
        else:
            if r.status_code == 400 and "slow down" not in r.text.lower():
                raise RuntimeError(f"Arctic Shift rejected the request: {r.text[:300]}")
            if r.status_code == 200:
                body = r.json()
                if body.get("error"):
                    raise RuntimeError(f"Arctic Shift error: {body['error']}")
                return body.get("data") or []
            print(f"  HTTP {r.status_code}; retry in {delay:.0f}s", flush=True)
        time.sleep(delay)
        delay = min(delay * 2, 300)
    raise RuntimeError("Arctic Shift kept failing; state is saved, run again later")


def post_row(p: dict, hash_author) -> dict | None:
    title = p.get("title") or ""
    body = p.get("selftext") or ""
    if body in DEAD:
        body = ""
    if not title and not body:
        return None
    author = p.get("author")
    meta = {k: p.get(k) for k in ("upvote_ratio", "num_comments", "link_flair_text", "is_self", "url",
                                   "over_18", "stickied", "distinguished", "removed_by_category")
            if p.get(k) is not None}
    return {
        "source": "reddit_post",
        "external_id": f"t3_{p['id']}",
        "parent_external_id": None,
        "url": "https://www.reddit.com" + p["permalink"] if p.get("permalink") else None,
        "author_hash": None if author in DEAD or author is None else hash_author("reddit", author),
        "posted_at": ts(p["created_utc"]),
        "edited_at": edited_ts(p),
        "language": None,
        "title": title,
        "body": body,
        "score": p.get("score"),
        "recommended": None,
        "author_playtime_min": None,
        "meta": meta,
    }


def comment_row(c: dict, hash_author) -> dict | None:
    body = c.get("body") or ""
    if body in DEAD:
        return None
    author = c.get("author")
    return {
        "source": "reddit_comment",
        "external_id": f"t1_{c['id']}",
        "parent_external_id": c.get("link_id"),
        "url": ("https://www.reddit.com" + c["permalink"] if c.get("permalink") else
                f"https://www.reddit.com/comments/{c['link_id'][3:]}/_/{c['id']}/" if c.get("link_id") else None),
        "author_hash": None if author in DEAD or author is None else hash_author("reddit", author),
        "posted_at": ts(c["created_utc"]),
        "edited_at": edited_ts(c),
        "language": None,
        "title": None,
        "body": body,
        "score": c.get("score"),
        "recommended": None,
        "author_playtime_min": None,
        "meta": {"parent_id": c.get("parent_id"), "distinguished": c.get("distinguished"),
                 "stickied": c.get("stickied")},
    }


def walk(conn, session, hash_author, subreddit: str, kind: str, max_pages: int | None, sleep: float) -> None:
    source = "reddit_post" if kind == "posts" else "reddit_comment"
    key = f"r/{subreddit}/{kind}"
    state = db.load_state(conn, source, key)
    after = int(state.get("after", START))
    fields = POST_FIELDS if kind == "posts" else COMMENT_FIELDS
    to_row = post_row if kind == "posts" else comment_row
    pages = ins_total = 0

    while max_pages is None or pages < max_pages:
        params = {"subreddit": subreddit, "after": max(after - 1, 0), "sort": "asc", "limit": "auto"}
        if fields:
            params["fields"] = fields
        items = get(session, kind, params)
        newest = max((int(i["created_utc"]) for i in items), default=after)
        if not items or newest <= after:
            # A full page at a single timestamp would stall here; it hasn't happened on r/valheim, but don't loop.
            if items and len(items) >= 100:
                after += 1
                continue
            print(f"[{key}] caught up at {ts(after):%Y-%m-%d %H:%M}", flush=True)
            break
        rows = [r for r in (to_row(i, hash_author) for i in items) if r]
        with conn.transaction():
            ins, upd = db.upsert_posts(conn, rows)
            state["after"] = newest
            db.save_state(conn, source, state, key)
        after = newest
        pages += 1
        ins_total += ins
        if pages % 10 == 1 or ins:
            print(f"[{key}] page {pages}: +{ins} new ({len(items)} fetched) through {ts(newest):%Y-%m-%d %H:%M}",
                  flush=True)
        time.sleep(sleep)
    print(f"[{key}] done: {pages} pages, {ins_total} new", flush=True)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--subreddits", nargs="+", default=["valheim"])
    ap.add_argument("--kinds", nargs="+", choices=["posts", "comments"], default=["posts", "comments"])
    ap.add_argument("--max-pages", type=int, default=None, help="per subreddit/kind; state is kept")
    ap.add_argument("--sleep", type=float, default=0.5)
    args = ap.parse_args()

    conn = db.connect()
    hash_author = db.author_hasher(conn)
    session = requests.Session()
    session.headers["User-Agent"] = "valhelp-complaints/1.0"
    for sub in args.subreddits:
        for kind in args.kinds:
            walk(conn, session, hash_author, sub, kind, args.max_pages, args.sleep)
    return 0


if __name__ == "__main__":
    sys.exit(main())

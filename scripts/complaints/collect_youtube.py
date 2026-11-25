"""Collect YouTube comments on Valheim videos into complaints.raw_post (source 'youtube_comment').

YouTube Data API v3. The key comes from $VH_YOUTUBE_KEY, or else user-secrets "Complaints:YouTubeApiKey".
The free quota is 10,000 units/day (resets at midnight Pacific):
  search.list = 100 units (50 videos), videos.list = 1 (50 videos), commentThreads/comments.list = 1 (100 comments).
Units used are tracked per Pacific day in complaints.collector_state. A run stops cleanly at --budget, and
the next run continues: search page tokens, per-video comment page tokens and statuses are all saved.

Steps (default = all three):
  discover  search QUERIES → complaints.yt_video (title/description must mention Valheim)
  stats     videos.list for views/likes/comment counts (decides which videos to read first)
  comments  every thread and reply, for pending videos with >= --min-comments, most comments first.
            --refresh-days N also re-reads finished videos older than N days, but only new threads.

    .venv/Scripts/python collect_youtube.py
    .venv/Scripts/python collect_youtube.py add https://youtu.be/XXXX ...    # hand-picked videos
    .venv/Scripts/python collect_youtube.py comments --budget 2000
"""
from __future__ import annotations

import argparse
import html
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import requests

import db

API = "https://www.googleapis.com/youtube/v3"
SOURCE = "youtube_comment"
PACIFIC = ZoneInfo("America/Los_Angeles")

# (query, order). Complaint-leaning queries first; the broad ones find the big general videos where most
# comments are.
QUERIES = [
    ("valheim review", "relevance"),
    ("valheim 1.0 review", "relevance"),
    ("valheim problems", "relevance"),
    ("valheim rant", "relevance"),
    ("valheim worth it", "relevance"),
    ("valheim criticism", "relevance"),
    ("what's wrong with valheim", "relevance"),
    ("valheim netcode lag desync", "relevance"),
    ("valheim combat hitbox", "relevance"),
    ("valheim building frustrating", "relevance"),
    ("valheim update patch notes", "relevance"),
    ("valheim deep north", "relevance"),
    ("valheim ashlands", "relevance"),
    ("valheim mistlands", "relevance"),
    ("valheim", "viewCount"),
    ("valheim 1.0", "date"),
]
SEARCH_PAGES = 4  # x 50 results per query


class QuotaExhausted(Exception):
    pass


class YouTube:
    def __init__(self, conn, key: str, budget: int):
        self.conn = conn
        self.key = key
        self.budget = budget
        self.session = requests.Session()
        self.session.headers["User-Agent"] = "valhelp-complaints/1.0"
        self.quota = db.load_state(conn, "youtube", "quota")
        today = datetime.now(PACIFIC).date().isoformat()
        if self.quota.get("day") != today:
            self.quota = {"day": today, "used": 0}

    @property
    def used(self) -> int:
        return self.quota["used"]

    def call(self, method: str, cost: int, **params) -> dict:
        if self.used + cost > self.budget:
            raise QuotaExhausted(f"budget {self.budget} reached ({self.used} used today)")
        params["key"] = self.key
        delay = 5.0
        for _ in range(6):
            try:
                r = self.session.get(f"{API}/{method}", params=params, timeout=60)
            except requests.RequestException as e:
                print(f"  network error ({e}); retry in {delay:.0f}s", flush=True)
                time.sleep(delay)
                delay *= 2
                continue
            self.quota["used"] += cost  # failed calls still cost quota
            with self.conn.transaction():
                db.save_state(self.conn, "youtube", self.quota, "quota")
            if r.status_code == 200:
                return r.json()
            reason = ""
            try:
                reason = r.json()["error"]["errors"][0]["reason"]
            except Exception:
                pass
            if reason in ("quotaExceeded", "dailyLimitExceeded"):
                raise QuotaExhausted(f"YouTube says {reason}")
            if r.status_code in (403, 404, 400):
                raise ApiError(r.status_code, reason, r.text[:300])
            print(f"  HTTP {r.status_code} {reason}; retry in {delay:.0f}s", flush=True)
            time.sleep(delay)
            delay = min(delay * 2, 120)
        raise RuntimeError(f"{method} kept failing")


class ApiError(Exception):
    def __init__(self, status, reason, text):
        super().__init__(f"HTTP {status} {reason}: {text}")
        self.status, self.reason = status, reason


def parse_ts(s: str | None) -> datetime | None:
    return datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None


VIDEO_ID_RE = re.compile(r"(?:v=|youtu\.be/|shorts/|live/|embed/)([A-Za-z0-9_-]{11})|^([A-Za-z0-9_-]{11})$")


def upsert_videos(conn, items: list[dict], found_by: str) -> int:
    new = 0
    with conn.transaction():
        for it in items:
            vid = it["id"]["videoId"] if isinstance(it["id"], dict) else it["id"]
            sn = it["snippet"]
            row = conn.execute(
                """INSERT INTO complaints.yt_video (video_id, title, channel_id, channel_title, published_at,
                                                    description, found_by)
                   VALUES (%s, %s, %s, %s, %s, %s, ARRAY[%s::text])
                   ON CONFLICT (video_id) DO UPDATE SET
                     found_by = CASE WHEN %s::text = ANY(complaints.yt_video.found_by) THEN complaints.yt_video.found_by
                                     ELSE complaints.yt_video.found_by || %s::text END
                   RETURNING (xmax = 0)""",
                (vid, html.unescape(sn["title"]), sn.get("channelId"), html.unescape(sn.get("channelTitle") or ""),
                 parse_ts(sn["publishedAt"]), html.unescape(sn.get("description") or ""), found_by, found_by, found_by),
            ).fetchone()
            new += bool(row[0])
    return new


def discover(yt: YouTube, conn) -> None:
    for q, order in QUERIES:
        key = f"search:{order}:{q}"
        st = db.load_state(conn, "youtube", key)
        while not st.get("done") and st.get("pages", 0) < SEARCH_PAGES:
            params = dict(part="snippet", q=q, type="video", maxResults=50, order=order, relevanceLanguage="en")
            if st.get("token"):
                params["pageToken"] = st["token"]
            data = yt.call("search", 100, **params)
            items = [i for i in data.get("items", [])
                     if "valheim" in (i["snippet"]["title"] + " " + i["snippet"].get("description", "")).lower()]
            new = upsert_videos(conn, items, f"{order}:{q}")
            st["pages"] = st.get("pages", 0) + 1
            st["token"] = data.get("nextPageToken")
            st["done"] = not st["token"]
            with conn.transaction():
                db.save_state(conn, "youtube", st, key)
            print(f"[discover] {q!r} ({order}) page {st['pages']}: {len(items)} valheim videos, {new} new "
                  f"[quota {yt.used}]", flush=True)


def stats(yt: YouTube, conn, force: bool = False) -> None:
    where = "TRUE" if force else "stats_fetched_at IS NULL"
    ids = [r[0] for r in conn.execute(f"SELECT video_id FROM complaints.yt_video WHERE {where}")]
    for i in range(0, len(ids), 50):
        chunk = ids[i:i + 50]
        data = yt.call("videos", 1, part="statistics", id=",".join(chunk), maxResults=50)
        with conn.transaction():
            seen = set()
            for it in data.get("items", []):
                s = it.get("statistics", {})
                seen.add(it["id"])
                conn.execute(
                    """UPDATE complaints.yt_video SET view_count = %s, like_count = %s, comment_count = %s,
                       stats_fetched_at = now() WHERE video_id = %s""",
                    (s.get("viewCount"), s.get("likeCount"), s.get("commentCount"), it["id"]))
            for vid in set(chunk) - seen:  # deleted/private
                conn.execute("UPDATE complaints.yt_video SET comments_status = 'error', stats_fetched_at = now() "
                             "WHERE video_id = %s", (vid,))
    print(f"[stats] {len(ids)} videos [quota {yt.used}]", flush=True)


def comment_row(c: dict, video_id: str, hash_author, parent_comment: str | None = None) -> dict:
    sn = c["snippet"]
    return {
        "source": SOURCE,
        "external_id": c["id"],
        "parent_external_id": video_id,
        "url": f"https://www.youtube.com/watch?v={video_id}&lc={c['id']}",
        "author_hash": hash_author("youtube", (sn.get("authorChannelId") or {}).get("value")),
        "posted_at": parse_ts(sn["publishedAt"]),
        "edited_at": parse_ts(sn.get("updatedAt")),
        "language": None,
        "title": None,
        "body": sn.get("textOriginal") or sn.get("textDisplay") or "",
        "score": sn.get("likeCount"),
        "recommended": None,
        "author_playtime_min": None,
        "meta": {"reply_to": parent_comment} if parent_comment else {},
    }


def video_comments(yt: YouTube, conn, hash_author, video_id: str, token: str | None,
                   stop_before: datetime | None) -> tuple[int, datetime | None]:
    total = 0
    newest = None
    while True:
        params = dict(part="snippet,replies", videoId=video_id, maxResults=100, order="time",
                      textFormat="plainText")
        if token:
            params["pageToken"] = token
        data = yt.call("commentThreads", 1, **params)
        rows = []
        oldest_thread = None
        for th in data.get("items", []):
            top = th["snippet"]["topLevelComment"]
            rows.append(comment_row(top, video_id, hash_author))
            t = parse_ts(top["snippet"]["publishedAt"])
            oldest_thread = t if oldest_thread is None else min(oldest_thread, t)
            newest = t if newest is None else max(newest, t)
            included = (th.get("replies") or {}).get("comments", [])
            if th["snippet"].get("totalReplyCount", 0) > len(included):
                rtoken = None
                while True:
                    rp = dict(part="snippet", parentId=top["id"], maxResults=100, textFormat="plainText")
                    if rtoken:
                        rp["pageToken"] = rtoken
                    rdata = yt.call("comments", 1, **rp)
                    rows += [comment_row(r, video_id, hash_author, top["id"]) for r in rdata.get("items", [])]
                    rtoken = rdata.get("nextPageToken")
                    if not rtoken:
                        break
            else:
                rows += [comment_row(r, video_id, hash_author, top["id"]) for r in included]
        token = data.get("nextPageToken")
        if stop_before and oldest_thread and oldest_thread < stop_before:
            token = None
        with conn.transaction():
            db.upsert_posts(conn, rows)
            conn.execute("UPDATE complaints.yt_video SET comments_page_token = %s WHERE video_id = %s",
                         (token, video_id))
        total += len(rows)
        if not token:
            return total, newest


def comments(yt: YouTube, conn, hash_author, min_comments: int, refresh_days: int | None) -> None:
    hwm_sql = """UPDATE complaints.yt_video SET comments_status = 'done', comments_fetched_at = now(),
                 newest_comment_at = GREATEST(newest_comment_at, %s), comments_page_token = NULL
                 WHERE video_id = %s"""
    todo = conn.execute(
        """SELECT video_id, title, comments_page_token, newest_comment_at, comments_status FROM complaints.yt_video
           WHERE (comments_status = 'pending' AND coalesce(comment_count, 0) >= %s)
              OR (%s::int IS NOT NULL AND comments_status = 'done'
                  AND comments_fetched_at < now() - make_interval(days => %s::int))
           ORDER BY comments_status DESC, comment_count DESC NULLS LAST""",
        (min_comments, refresh_days, refresh_days or 0)).fetchall()
    print(f"[comments] {len(todo)} videos to read", flush=True)
    for vid, title, token, newest_at, status in todo:
        stop_before = newest_at - timedelta(days=2) if status == "done" and newest_at else None
        try:
            n, newest = video_comments(yt, conn, hash_author, vid, token, stop_before)
        except ApiError as e:
            st = "disabled" if e.reason == "commentsDisabled" else "error"
            with conn.transaction():
                conn.execute("UPDATE complaints.yt_video SET comments_status = %s, comments_fetched_at = now() "
                             "WHERE video_id = %s", (st, vid))
            print(f"[comments] {vid} {title[:60]!r}: {st} ({e.reason})", flush=True)
            continue
        with conn.transaction():
            conn.execute(hwm_sql, (newest, vid))
        print(f"[comments] {vid} {title[:60]!r}: {n} comments [quota {yt.used}]", flush=True)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("step", nargs="?", default="all", choices=["all", "discover", "stats", "comments", "add"])
    ap.add_argument("videos", nargs="*", help="for 'add': video ids or URLs")
    ap.add_argument("--budget", type=int, default=9500, help="max quota units to use today (of 10,000)")
    ap.add_argument("--min-comments", type=int, default=20)
    ap.add_argument("--refresh-days", type=int, default=None)
    args = ap.parse_args()

    conn = db.connect()
    hash_author = db.author_hasher(conn)
    yt = YouTube(conn, db.user_secret("Complaints:YouTubeApiKey", "VH_YOUTUBE_KEY"), args.budget)
    try:
        if args.step == "add":
            ids = []
            for v in args.videos:
                m = VIDEO_ID_RE.search(v)
                if not m:
                    print(f"not a video id/url: {v}")
                    continue
                ids.append(m.group(1) or m.group(2))
            if ids:
                data = yt.call("videos", 1, part="snippet", id=",".join(ids[:50]))
                print(f"added {upsert_videos(conn, data.get('items', []), 'manual')} new of {len(ids)}")
                stats(yt, conn)
            return 0
        if args.step in ("all", "discover"):
            discover(yt, conn)
        if args.step in ("all", "stats"):
            stats(yt, conn)
        if args.step in ("all", "comments"):
            comments(yt, conn, hash_author, args.min_comments, args.refresh_days)
    except QuotaExhausted as e:
        print(f"stopping: {e}. Progress is saved; run again after midnight Pacific.", flush=True)
    print(f"quota used today: {yt.used}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())

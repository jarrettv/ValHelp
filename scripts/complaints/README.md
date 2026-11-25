# Complaints pipeline

Goal: a documentation page ranking the major Valheim complaints, with date-aware status (fixed by a patch,
still around, or new since 1.0).

| Phase | What | Status |
|---|---|---|
| 1. Collect | Raw posts from public sources → `complaints.raw_post` (dev DB) | Steam reviews, Reddit, YouTube comments ✅ |
| 2. Timeline | `collect_patches.py` → `complaints.game_patch` (Steam announcements). Views `complaints.era` (content-update eras) and `complaints.post_dated` (each post with its text date, live patch, era, `post_1_0`) | ✅ |
| 3. Analyse (local) | complaint-span classifier → embeddings → clustering (BERTopic) → labels; seed topics: netcode, build menu UX/bugs, hitboxes, Forge of Potential | todo |
| 4. Score | per-topic volume over time, pre/post-1.0, fixed/persisting/new, vote- and playtime-weighted | todo |
| 5. Page | JSON snapshot → `/complaints` page | todo |

All of this is **dev-DB only** (vance.host). Only the finished phase-5 snapshot ships.

## Setup

```sh
cd scripts/complaints
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
```

The DB comes from `$VH_COMPLAINTS_PG` (libpq URL or Npgsql string). Without it, the dev API's user-secrets
`ConnectionStrings:valhelp` is used. `db.connect()` creates the `complaints` schema (`schema.sql`) on first use.

## Sources

| Source (`raw_post.source`) | Script | Notes |
|---|---|---|
| `steam_review` | `collect_steam_reviews.py` | `IUserReviewsService/GetAppReviews` (the old `/appreviews` was retired 2026-10-22). All languages, all purchase types, off-topic/review-bomb periods included. Walks in "Updated" order. The first run backfills (resumable cursor in `complaints.collector_state`), and later runs fetch only new and edited reviews. About 566k reviews ≈ 5.7k pages. |
| `steam_forum` | todo | Scrape the public discussion board |
| `reddit_post`, `reddit_comment` | `collect_reddit.py` | Arctic Shift archive API, no login (Reddit's self-service API apps are blocked: "Max clients have been reached"). It's close to real time, so one walk forward by `created_utc` covers history, and later runs pick up what's new. Scores are early snapshots and weak. `--subreddits` defaults to `valheim`. |
| `youtube_comment` | `collect_youtube.py` | Data API v3. Key in user-secrets `Complaints:YouTubeApiKey` (or `$VH_YOUTUBE_KEY`). Steps: `discover` (search queries → `complaints.yt_video`), `stats`, `comments` (all threads and replies, most commented videos first). Quota is tracked per Pacific day, so a run stops at `--budget` and resumes the next day. `add <url…>` for hand-picked videos. `--refresh-days N` re-reads only new threads. |
| `youtube_transcript` | todo | Auto-captions via yt-dlp for targeted videos only (no Whisper for now) |

Skipped on purpose: Discord (reading servers we don't run needs a user-token self-bot, which breaks ToS), and
Twitch VODs/chat (no captions, VODs expire, chat is low-signal).

## Data notes

- `posted_at` is when the post was created. `edited_at` is the last edit, and `body` is the text as of that edit (Steam
  keeps only the latest text). Phase 2 should date-tag by `edited_at` when the review was rewritten.
- `author_hash` is an HMAC with a salt stored in `complaints.settings`, so the same author hashes the same everywhere.
  `url` still contains the Steam profile id, because that is the only public link to a review. Don't put raw URLs in
  aggregate exports except as quote citations.
- `score` = helpful votes. `recommended` = thumbs up. `author_playtime_min` = playtime at review time.
  `meta` holds the rest of the API record (`written_during_early_access`, `refunded`, `weighted_vote_score`, ...).

Handy checks:

```sql
SELECT source, count(*), min(posted_at), max(posted_at) FROM complaints.raw_post GROUP BY 1;
SELECT * FROM complaints.collector_state;
```

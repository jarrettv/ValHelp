-- Complaints pipeline, phase 1: raw collected posts. Dev DB only (vance.host); never shipped to Supabase.
-- Idempotent: db.connect() runs it on every start.

CREATE SCHEMA IF NOT EXISTS complaints;

-- One row per collected post/review/comment/transcript chunk from any source.
CREATE TABLE IF NOT EXISTS complaints.raw_post (
    id                  bigserial PRIMARY KEY,
    source              text NOT NULL,           -- 'steam_review', 'steam_forum', 'reddit', 'youtube_comment', ...
    external_id         text NOT NULL,           -- id on the source platform
    parent_external_id  text,                    -- thread/video/post this belongs to (null for top-level)
    url                 text,
    author_hash         text,                    -- HMAC of the platform author id (salt in complaints.settings)
    posted_at           timestamptz NOT NULL,
    edited_at           timestamptz,             -- last edit; body is the text as of this time
    language            text,                    -- as reported by the source (Steam API codes: 'english', ...)
    title               text,
    body                text NOT NULL,
    score               integer,                 -- helpful votes / upvotes / likes, as the source counts them
    recommended         boolean,                 -- Steam thumbs up/down; null elsewhere
    author_playtime_min integer,                 -- author's playtime when writing, where known (Steam)
    meta                jsonb NOT NULL DEFAULT '{}'::jsonb,  -- everything else the source returns
    first_fetched_at    timestamptz NOT NULL DEFAULT now(),
    fetched_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_raw_post_source_ext UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS ix_raw_post_source_posted ON complaints.raw_post (source, posted_at);
CREATE INDEX IF NOT EXISTS ix_raw_post_posted ON complaints.raw_post (posted_at);

-- Resumable cursors / high-water marks per collector.
CREATE TABLE IF NOT EXISTS complaints.collector_state (
    source     text NOT NULL,
    key        text NOT NULL DEFAULT 'default',
    state      jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_collector_state PRIMARY KEY (source, key)
);

-- YouTube videos we collect comments (and later captions) for. Found by search queries or added by hand.
CREATE TABLE IF NOT EXISTS complaints.yt_video (
    video_id            text PRIMARY KEY,
    title               text NOT NULL,
    channel_id          text,
    channel_title       text,
    published_at        timestamptz NOT NULL,
    description         text,
    view_count          bigint,
    like_count          bigint,
    comment_count       bigint,
    found_by            text[] NOT NULL DEFAULT '{}',  -- search queries / 'manual'
    comments_status     text NOT NULL DEFAULT 'pending', -- pending | done | disabled | error
    comments_fetched_at timestamptz,
    newest_comment_at   timestamptz,                  -- high-water mark for incremental refreshes
    comments_page_token text,                         -- resume point when the daily quota ran out mid-video
    stats_fetched_at    timestamptz,
    first_seen_at       timestamptz NOT NULL DEFAULT now()
);

-- Phase 2: official Steam announcements (patch notes, update launches), the timeline posts are dated against.
CREATE TABLE IF NOT EXISTS complaints.game_patch (
    gid             text PRIMARY KEY,            -- Steam news item id
    published_at    timestamptz NOT NULL,
    title           text NOT NULL,
    version         text,                        -- '0.217.14', '1.0.21' (parsed from the title)
    is_public_test  boolean NOT NULL DEFAULT false,
    is_milestone    boolean NOT NULL DEFAULT false, -- named update / EA launch / 1.0
    url             text,
    body            text
);
CREATE INDEX IF NOT EXISTS ix_game_patch_published ON complaints.game_patch (published_at);

-- Content-update eras: each milestone runs until the next one.
CREATE OR REPLACE VIEW complaints.era AS
SELECT CASE
         WHEN title ILIKE '%Release and Roadmap%' THEN 'Early Access launch'
         WHEN title ILIKE '%1.0 Has Arrived%' THEN '1.0'
         WHEN title ILIKE '%Hearth & Home%' THEN 'Hearth & Home'
         ELSE trim(both ' !' from regexp_replace(title, '^Patch [0-9.]+\s*[–-]\s*', ''))
       END AS era,
       published_at AS starts_at,
       lead(published_at) OVER (ORDER BY published_at) AS ends_at
FROM complaints.game_patch
WHERE is_milestone;

-- Every post with the date its text is from (last edit, falling back to posted), the live patch at that time,
-- and its era. Posts before the early access launch get era 'Pre-release'.
CREATE OR REPLACE VIEW complaints.post_dated AS
SELECT p.*,
       coalesce(p.edited_at, p.posted_at) AS text_at,
       rel.version AS live_version,
       coalesce(e.era, 'Pre-release') AS era,
       coalesce(p.edited_at, p.posted_at) >= (SELECT starts_at FROM complaints.era WHERE era = '1.0') AS post_1_0
FROM complaints.raw_post p
LEFT JOIN LATERAL (
    SELECT g.version FROM complaints.game_patch g
    WHERE g.version IS NOT NULL AND NOT g.is_public_test AND g.published_at <= coalesce(p.edited_at, p.posted_at)
    ORDER BY g.published_at DESC LIMIT 1
) rel ON true
LEFT JOIN complaints.era e
       ON coalesce(p.edited_at, p.posted_at) >= e.starts_at
      AND (e.ends_at IS NULL OR coalesce(p.edited_at, p.posted_at) < e.ends_at);

CREATE TABLE IF NOT EXISTS complaints.settings (
    key   text PRIMARY KEY,
    value text NOT NULL
);

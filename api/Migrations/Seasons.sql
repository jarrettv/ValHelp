
ALTER TABLE users ADD obs_secret_code text NOT NULL DEFAULT 'CHANGEME';

UPDATE scorings SET rates = '{}' WHERE rates IS NULL;
ALTER TABLE scorings ALTER COLUMN rates SET NOT NULL;

ALTER TABLE events ADD season_code text;

CREATE TABLE seasons (
    code text NOT NULL,
    name text NOT NULL,
    pitch text NOT NULL,
    mode text NOT NULL,
    "desc" text NOT NULL,
    hours real NOT NULL,
    owner_id integer NOT NULL,
    is_active boolean NOT NULL,
    created_at timestamp with time zone NOT NULL,
    created_by text NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    updated_by text NOT NULL,
    admins jsonb,
    schedule jsonb NOT NULL,
    score_items jsonb,
    stats jsonb NOT NULL,
    CONSTRAINT pk_seasons PRIMARY KEY (code)
);

CREATE INDEX ix_events_season_code ON events (season_code);

ALTER TABLE events ADD CONSTRAINT fk_events_seasons_season_code FOREIGN KEY (season_code) REFERENCES seasons (code);

INSERT INTO seasons (code, name, pitch, mode, "desc", hours, owner_id, is_active, created_at, created_by, updated_at, updated_by, admins, schedule, score_items, stats)
VALUES ('hunt-ash', 'Trophy Hunt Ashlands', 'Vanilla game and drop rates', 'TrophyHunt', 'Early days trophy hunts', 4, 1, true, '2024-05-01', 'Archy', '2024-05-01', 'Archy', '[]', '{}', '[]', '{}');

INSERT INTO seasons (code, name, pitch, mode, "desc", hours, owner_id, is_active, created_at, created_by, updated_at, updated_by, admins, schedule, score_items, stats)
VALUES ('hunt-bog', 'Trophy Hunt Bogwitch', 'Vanilla game and drop rates', 'TrophyHunt', 'New broom trophy, lol', 4, 1, true, '2024-10-01', 'Archy', '2024-10-01', 'Archy', '[]', '{}', '[]', '{}');

INSERT INTO seasons (code, name, pitch, mode, "desc", hours, owner_id, is_active, created_at, created_by, updated_at, updated_by, admins, schedule, score_items, stats)
VALUES ('hunt-arm', 'Trophy Hunt Call to Arms', 'Vanilla game and drop rates', 'TrophyHunt', 'Bears ghosts viles, oh my', 4, 1, true, '2025-09-01', 'Archy', '2024-10-01', 'Archy', '[]', '{}', '[]', '{}');

INSERT INTO seasons (code, name, pitch, mode, "desc", hours, owner_id, is_active, created_at, created_by, updated_at, updated_by, admins, schedule, score_items, stats)
VALUES ('saga-bog', 'Trophy Saga ToC #1', 'Modded with 100% drop rate', 'TrophySaga', 'TODO: add details here, best 3 scores', 4, 1, true, '2025-03-01', 'RustyCali', '2025-05-01', 'RustyCali', '[]', '{}', '[]', '{}');

INSERT INTO seasons (code, name, pitch, mode, "desc", hours, owner_id, is_active, created_at, created_by, updated_at, updated_by, admins, schedule, score_items, stats)
VALUES ('saga-arm', 'Trophy Saga Call to Arms', 'Modded with 100% drop rate', 'TrophySaga', 'TODO: add details here, hosted by Xmal', 4, 1, true, '2025-03-01', 'Xmal', '2025-10-01', 'Xmal', '[]', '{}', '[]', '{}');


INSERT INTO seasons (code, name, pitch, mode, "desc", hours, owner_id, is_active, created_at, created_by, updated_at, updated_by, admins, schedule, score_items, stats)
VALUES ('rush-bog', 'Trophy Rush Bogwitch', 'Very hard and 100% drop rates', 'TrophyRush', 'New broom trophy, lol', 4, 1, true, '2024-10-01', 'ThreadMenace', '2024-10-01', 'ThreadMenace', '[]', '{}', '[]', '{}');

INSERT INTO seasons (code, name, pitch, mode, "desc", hours, owner_id, is_active, created_at, created_by, updated_at, updated_by, admins, schedule, score_items, stats)
VALUES ('rush-arm', 'Trophy Rush Call to Arms', 'Very hard and 100% drop rates', 'TrophyRush', 'Bears ghosts viles, oh my', 4, 1, true, '2025-09-01', 'Sobewan', '2024-10-01', 'Sobewan', '[]', '{}', '[]', '{}');

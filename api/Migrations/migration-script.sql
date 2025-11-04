START TRANSACTION;
ALTER TABLE events ADD is_private boolean NOT NULL DEFAULT FALSE;

ALTER TABLE events ADD owner_id integer NOT NULL DEFAULT 1;

CREATE INDEX ix_events_owner_id ON events (owner_id);

ALTER TABLE events ADD CONSTRAINT fk_events_users_owner_id FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE;

INSERT INTO "__EFMigrationsHistory" (migration_id, product_version)
VALUES ('20250622181859_MakeOwnerRequired', '9.0.1');

ALTER TABLE events ADD private_password text;

INSERT INTO "__EFMigrationsHistory" (migration_id, product_version)
VALUES ('20250622190431_AddPrivatePassword', '9.0.1');

CREATE TABLE avatars (
    hash text NOT NULL,
    data bytea NOT NULL,
    content_type text NOT NULL,
    uploaded_at timestamp with time zone NOT NULL,
    CONSTRAINT pk_avatars PRIMARY KEY (hash)
);

INSERT INTO "__EFMigrationsHistory" (migration_id, product_version)
VALUES ('20250816152909_Avatar', '9.0.1');

ALTER TABLE scorings ADD drop_rate_type text NOT NULL DEFAULT '';

ALTER TABLE scorings ADD rates jsonb;

INSERT INTO "__EFMigrationsHistory" (migration_id, product_version)
VALUES ('20251007145024_DropRates', '9.0.1');

ALTER TABLE users ADD obs_secret_code text NOT NULL DEFAULT '';

UPDATE scorings SET rates = '' WHERE rates IS NULL;
ALTER TABLE scorings ALTER COLUMN rates SET NOT NULL;
ALTER TABLE scorings ALTER COLUMN rates SET DEFAULT '{}';

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

INSERT INTO "__EFMigrationsHistory" (migration_id, product_version)
VALUES ('20251103184733_Seasons', '9.0.1');

COMMIT;


-- Character tracking (ModuleCharacters, see CHARACTER_TRACKING.md): a native
-- watcher uploads .fch saves; each upload becomes a snapshot with the parsed
-- profile and only the explored-map tiles that changed.
START TRANSACTION;

  -- Watchers paired to a user through the device-code flow. Only the token's
  -- SHA-256 is stored.
  CREATE TABLE IF NOT EXISTS char_devices (
      id bigserial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users (id),
      name text NOT NULL,
      token_hash text NOT NULL UNIQUE,
      created_at timestamp with time zone NOT NULL,
      last_seen_at timestamp with time zone NOT NULL,
      revoked_at timestamp with time zone
  );
  CREATE INDEX IF NOT EXISTS ix_char_devices_user_id ON char_devices (user_id);

  -- Pending pairings (short-lived). device_code is the watcher's secret,
  -- user_code what the user confirms on the site.
  CREATE TABLE IF NOT EXISTS char_device_links (
      device_code text PRIMARY KEY,
      user_code text NOT NULL UNIQUE,
      device_name text NOT NULL,
      created_at timestamp with time zone NOT NULL,
      expires_at timestamp with time zone NOT NULL,
      user_id integer REFERENCES users (id),
      approved_at timestamp with time zone,
      claimed_at timestamp with time zone
  );

  -- A world instance, keyed by the game's world UID (shared by every character
  -- that plays it). seed is null until resolved; seed_hash may be known first.
  CREATE TABLE IF NOT EXISTS char_worlds (
      id bigserial PRIMARY KEY,
      uid bigint NOT NULL UNIQUE,
      name text,
      seed text,
      seed_hash integer,
      created_at timestamp with time zone NOT NULL,
      seedgen_at timestamp with time zone,
      seedgen_by integer REFERENCES users (id)
  );

  -- A tracked character (one per user + in-game player id). latest_raw is the
  -- gzipped .fch of the newest snapshot, kept for diffing and re-parsing.
  CREATE TABLE IF NOT EXISTS characters (
      id bigserial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users (id),
      player_id bigint NOT NULL,
      name text NOT NULL,
      created_at timestamp with time zone NOT NULL,
      updated_at timestamp with time zone NOT NULL,
      latest_hash text NOT NULL,
      latest_file_time timestamp with time zone NOT NULL,
      latest_raw bytea NOT NULL,
      CONSTRAINT uq_characters_user_player UNIQUE (user_id, player_id)
  );

  -- One per distinct save. play_seconds is the game's active play clock
  -- (TimeInBase + TimeOutOfBase); axis_seconds only moves forward, so a
  -- restored backup (play clock drops) is flagged as a rewind instead.
  CREATE TABLE IF NOT EXISTS char_snapshots (
      id bigserial PRIMARY KEY,
      character_id bigint NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
      file_time timestamp with time zone NOT NULL,
      uploaded_at timestamp with time zone NOT NULL,
      hash text NOT NULL,
      session integer NOT NULL,
      play_seconds real NOT NULL,
      axis_seconds real NOT NULL,
      rewind boolean NOT NULL,
      world_id bigint REFERENCES char_worlds (id),
      data jsonb NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ix_char_snapshots_character ON char_snapshots (character_id, file_time);
  -- The clock (seconds) of the world the save was made in, from the world save
  -- written with it (local worlds only); in-game day = world_seconds / 1200.
  ALTER TABLE char_snapshots ADD COLUMN IF NOT EXISTS world_seconds double precision;

  -- Explored-map tiles that changed in a snapshot: tile = ty * 32 + tx over the
  -- 2048x2048 grid, 64x64 cells each, bit-packed rows (512 bytes). others is the
  -- cartography-table layer, null when empty.
  CREATE TABLE IF NOT EXISTS char_map_tiles (
      snapshot_id bigint NOT NULL REFERENCES char_snapshots (id) ON DELETE CASCADE,
      world_id bigint NOT NULL REFERENCES char_worlds (id),
      tile smallint NOT NULL,
      explored bytea NOT NULL,
      others bytea,
      CONSTRAINT pk_char_map_tiles PRIMARY KEY (snapshot_id, world_id, tile)
  );

COMMIT;

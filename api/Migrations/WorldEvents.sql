-- Usage events from the Worlds pages (ModuleWorlds/WorldsEvents.cs, web/src/analytics.ts):
-- seeds generated and opened, zoom depth, POI clicks, device. Anonymous visitors are a random
-- per-tab session id; user_id is set when logged in. Read on /auth/events.
START TRANSACTION;

  CREATE TABLE IF NOT EXISTS world_events (
    id bigserial PRIMARY KEY,
    at timestamptz NOT NULL,
    session text NOT NULL,
    user_id integer NULL,
    kind text NOT NULL,
    seed text NULL,
    device text NULL,
    data jsonb NULL
  );

  CREATE INDEX IF NOT EXISTS ix_world_events_at ON world_events (at);
  CREATE INDEX IF NOT EXISTS ix_world_events_kind_at ON world_events (kind, at);
  CREATE INDEX IF NOT EXISTS ix_world_events_seed ON world_events (seed);

  COMMIT;

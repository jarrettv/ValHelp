-- Public worlds: an optional user (shown by avatar) and a tiny tag on each,
-- set from /auth/public-worlds (ModuleWorlds/WorldsPublic.cs). Run after PublicWorlds.sql.
START TRANSACTION;

  ALTER TABLE public_worlds ADD COLUMN IF NOT EXISTS user_id integer NULL REFERENCES users (id) ON DELETE SET NULL;
  ALTER TABLE public_worlds ADD COLUMN IF NOT EXISTS tag text NULL;

  COMMIT;

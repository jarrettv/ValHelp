-- Manual boss progress for the speedrun OBS overlay (/obs2/bosses), set by an
-- admin on /auth/obs-runs to get ahead of the game's saves. data is
-- CharObs.ObsOverride: {"bosses": {"dragon": {"found": true, "defeated": null, "steps": [3]}}}.
-- Each value is a floor over what the latest save says.
START TRANSACTION;

  CREATE TABLE IF NOT EXISTS char_obs_overrides (
      character_id bigint PRIMARY KEY REFERENCES characters (id) ON DELETE CASCADE,
      data jsonb NOT NULL,
      updated_at timestamp with time zone NOT NULL
  );

COMMIT;

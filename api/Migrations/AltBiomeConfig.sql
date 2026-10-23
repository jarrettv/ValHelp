-- Admin overrides for how each biome variant (alt biome) shows on the map
-- (ModuleWorlds/WorldsPoiConfig.cs). Edited on /auth/pois next to the POI settings.
START TRANSACTION;

  CREATE TABLE IF NOT EXISTS alt_biome_settings (
      name text NOT NULL,
      visible boolean,
      color text,
      updated_at timestamp with time zone NOT NULL,
      CONSTRAINT pk_alt_biome_settings PRIMARY KEY (name)
  );

  COMMIT;

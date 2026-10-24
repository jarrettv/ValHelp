-- What each location's POI card shows (ModuleWorlds/WorldsPoiConfig.cs, PoiSetting.Contents):
-- card entry -> shown, as jsonb on the prefab's row; prefab '*' holds the all-locations choices.
-- Edited on /auth/pois.
START TRANSACTION;

  ALTER TABLE poi_settings ADD COLUMN IF NOT EXISTS contents jsonb;

  COMMIT;

-- POI card contents (show/hide + map-adornment stars) copied from the dev DB
-- (vance.host) on 2026-10-24, for production (Supabase). Idempotent: run it
-- again and you get the same result. ModuleWorlds/WorldsPoiConfig.cs,
-- PoiSetting.Contents; edited on /auth/pois ("Contents").
--
-- Each prefab's contents are replaced with dev's; prefab '*' is every location.
-- Rows that don't exist yet are created with no map override (visible/icon/
-- color/lod null), which is what the admin API does. Contents on any other
-- row are cleared, so production ends up matching dev exactly.
START TRANSACTION;

  ALTER TABLE poi_settings ADD COLUMN IF NOT EXISTS contents jsonb;

  INSERT INTO poi_settings (prefab, contents, updated_at)
  VALUES ('*', '{"CreepProp_egg_hanging01": false, "Pickable_DvergrMineTreasure": false, "Pickable_ForestCryptRemains01": false, "Pickable_ForestCryptRemains02": false, "Pickable_ForestCryptRemains03": false, "Pickable_Item": false, "Pickable_MeatPile": false, "Pickable_Mushroom_yellow": false, "Pickable_RoyalJelly": false, "Pickable_StoneRock": true, "Pickable_SunkenCryptRandom": false, "Spawner_Blob": false, "Spawner_CharredCross": false, "Spawner_DraugrPile": false, "Spawner_Draugr_Elite": false, "Spawner_SeekerBrute_respawn_240": false, "Spawner_Seeker_respawn_240": false, "Spawner_Tick_stared": false, "Spawner_Tick_stared_respawn_240": false, "blackmarble_altar_crystal": true, "blackmarble_post01": false, "dvergrprops_pickaxe": false, "dvergrtown_wood_beam": false, "dvergrtown_wood_pole": false, "dvergrtown_wood_support": false, "fenrirhide_hanging": true, "hanging_hairstrands": true, "item:Amber": false, "item:AmberPearl": false, "item:BattleaxeWood": false, "item:Coins": false, "item:Ruby": false, "item:SledgeWood": false, "item:THSwordWood": false, "item:Tankard_dvergr": false, "item:Upgrader2Armor": false, "item:Upgrader2Weapon": false, "item:Upgrader3Armor": false, "item:Upgrader3Weapon": false, "item:Upgrader4Armor": false, "item:Upgrader4Weapon": false, "item:Upgrader5Armor": false, "item:Upgrader5Weapon": false, "item:Upgrader6Armor": false, "item:Upgrader6Weapon": false, "item:Upgrader7Armor": false, "item:Upgrader7Weapon": false, "star:Beehive": true, "star:Fish4_cave": true, "star:Pickable_BlackCoreStand": true, "star:blackmarble_altar_crystal": true, "star:item:AxeHead1": true, "star:item:AxeHead2": true, "star:item:Hook": true, "star:item:OnionSeeds": true}'::jsonb, now())
  ON CONFLICT (prefab) DO UPDATE SET contents = EXCLUDED.contents, updated_at = now();

  INSERT INTO poi_settings (prefab, contents, updated_at)
  VALUES ('BearCave', '{"star:Spawner_Bjorn_sleeping": true}'::jsonb, now())
  ON CONFLICT (prefab) DO UPDATE SET contents = EXCLUDED.contents, updated_at = now();

  INSERT INTO poi_settings (prefab, contents, updated_at)
  VALUES ('CharredFortress', '{"Spawner_Charred_Archer": false, "star:Charred_altar_bellfragment": true}'::jsonb, now())
  ON CONFLICT (prefab) DO UPDATE SET contents = EXCLUDED.contents, updated_at = now();

  INSERT INTO poi_settings (prefab, contents, updated_at)
  VALUES ('Hildir_camp', '{"star:vegvisir": false, "vegvisir": false}'::jsonb, now())
  ON CONFLICT (prefab) DO UPDATE SET contents = EXCLUDED.contents, updated_at = now();

  INSERT INTO poi_settings (prefab, contents, updated_at)
  VALUES ('SwampRuin1', '{"Spawner_Draugr": false}'::jsonb, now())
  ON CONFLICT (prefab) DO UPDATE SET contents = EXCLUDED.contents, updated_at = now();

  INSERT INTO poi_settings (prefab, contents, updated_at)
  VALUES ('SwampRuin2', '{"Spawner_Draugr": false}'::jsonb, now())
  ON CONFLICT (prefab) DO UPDATE SET contents = EXCLUDED.contents, updated_at = now();

  INSERT INTO poi_settings (prefab, contents, updated_at)
  VALUES ('TrollCave02', '{"star:Spawner_Troll": true}'::jsonb, now())
  ON CONFLICT (prefab) DO UPDATE SET contents = EXCLUDED.contents, updated_at = now();

  UPDATE poi_settings SET contents = NULL, updated_at = now()
  WHERE contents IS NOT NULL AND prefab NOT IN ('*', 'BearCave', 'CharredFortress', 'Hildir_camp', 'SwampRuin1', 'SwampRuin2', 'TrollCave02');

  COMMIT;

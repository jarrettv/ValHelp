-- POI map config: per-prefab overrides from /auth/pois, exported from the
-- local database on 2026-10-14 (44 prefabs). Safe to run more than once.
--
-- No icon uploads: every icon these rows name ships as a file in
-- web/public/img/Poi, so deploy the web build before (or with) this script.
--
-- Rows already in prod that aren't listed here are left alone. To make prod
-- match this list exactly, uncomment the DELETE.

START TRANSACTION;

-- Tables (same as PoiConfig.sql), in case that hasn't been run yet.
CREATE TABLE IF NOT EXISTS poi_icons (
    name text NOT NULL,
    svg text NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT pk_poi_icons PRIMARY KEY (name)
);

CREATE TABLE IF NOT EXISTS poi_settings (
    prefab text NOT NULL,
    visible boolean,
    icon text,
    color text,
    lod integer,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT pk_poi_settings PRIMARY KEY (prefab)
);

INSERT INTO poi_settings (prefab, visible, icon, color, lod, updated_at) VALUES
  ('AbandonedLogCabin02', true, 'logcabin', NULL, NULL, now()),
  ('AbandonedLogCabin03', true, 'logcabin', NULL, NULL, now()),
  ('AbandonedLogCabin04', true, 'logcabin', NULL, NULL, now()),
  ('AncientUpgradeStation', true, 'forgeofpotential', NULL, 0, now()),
  ('CharredFortress', NULL, NULL, NULL, 1, now()),
  ('DrakeNest01', NULL, NULL, NULL, 1, now()),
  ('FrozenShip01_DN', NULL, NULL, NULL, 3, now()),
  ('FrozenShip02_DN', NULL, NULL, NULL, 3, now()),
  ('FrozenShip03_DN', NULL, NULL, NULL, 3, now()),
  ('GoblinCamp2', NULL, 'goblincamp', NULL, NULL, now()),
  ('GoblinHut01', true, 'goblinhut', NULL, NULL, now()),
  ('GoblinHut02', true, 'goblinhut', NULL, NULL, now()),
  ('GoblinHut03', true, 'goblinhut', NULL, NULL, now()),
  ('Greydwarf_camp1', NULL, NULL, NULL, 1, now()),
  ('Hildir_cave', true, 'quest', NULL, 1, now()),
  ('Hildir_crypt', true, 'quest', NULL, 1, now()),
  ('Hildir_plainsfortress', true, 'quest', NULL, 1, now()),
  ('LumberCamp', true, 'northhut', NULL, NULL, now()),
  ('NorthVillage', NULL, 'northvillage', NULL, NULL, now()),
  ('PlaceofMystery1', NULL, NULL, NULL, 0, now()),
  ('PlaceofMystery2', NULL, NULL, NULL, 0, now()),
  ('PlaceofMystery3', NULL, NULL, NULL, 0, now()),
  ('ShipWreck01_DN', NULL, 'shipwreck', '#57423d', 2, now()),
  ('ShipWreck02_DN', NULL, NULL, '#45342b', 2, now()),
  ('StoneHenge1', true, 'stonehenge', NULL, 2, now()),
  ('StoneHenge2', true, 'stonehenge', NULL, 2, now()),
  ('StoneHenge6', true, 'stonehenge', NULL, 2, now()),
  ('StoneTower3', NULL, NULL, NULL, 3, now()),
  ('SunkenCrypt4', NULL, NULL, NULL, 1, now()),
  ('TarPit1', true, 'tarpit', NULL, NULL, now()),
  ('TarPit2', true, 'tarpit', NULL, NULL, now()),
  ('TarPit3', true, 'tarpit', NULL, NULL, now()),
  ('TheHole01', NULL, 'thehole', NULL, NULL, now()),
  ('WoodFarm1', true, 'farm', NULL, 2, now()),
  ('WoodHouse1', true, 'woodhouse2', NULL, NULL, now()),
  ('WoodHouse10', true, 'woodhouse', NULL, NULL, now()),
  ('WoodHouse11', true, 'woodhouse', NULL, NULL, now()),
  ('WoodHouse12', true, 'woodhouse6', NULL, NULL, now()),
  ('WoodHouse13', true, 'woodhouse', NULL, NULL, now()),
  ('WoodHouse5', true, 'woodhouse', NULL, NULL, now()),
  ('WoodHouse7', true, 'woodhouse2', NULL, NULL, now()),
  ('WoodHouse9', true, 'woodhouse', NULL, NULL, now()),
  ('WoodVillage1', true, 'farm', NULL, 2, now()),
  ('WoodVillage2', true, 'farm', NULL, 2, now())
ON CONFLICT (prefab) DO UPDATE SET
    visible    = EXCLUDED.visible,
    icon       = EXCLUDED.icon,
    color      = EXCLUDED.color,
    lod        = EXCLUDED.lod,
    updated_at = EXCLUDED.updated_at;

-- DELETE FROM poi_settings WHERE prefab NOT IN (
--   'AbandonedLogCabin02', 'AbandonedLogCabin03', 'AbandonedLogCabin04', 'AncientUpgradeStation', 'CharredFortress', 'DrakeNest01', 'FrozenShip01_DN', 'FrozenShip02_DN', 'FrozenShip03_DN', 'GoblinCamp2', 'GoblinHut01', 'GoblinHut02', 'GoblinHut03', 'Greydwarf_camp1', 'Hildir_cave', 'Hildir_crypt', 'Hildir_plainsfortress', 'LumberCamp', 'NorthVillage', 'PlaceofMystery1', 'PlaceofMystery2', 'PlaceofMystery3', 'ShipWreck01_DN', 'ShipWreck02_DN', 'StoneHenge1', 'StoneHenge2', 'StoneHenge6', 'StoneTower3', 'SunkenCrypt4', 'TarPit1', 'TarPit2', 'TarPit3', 'TheHole01', 'WoodFarm1', 'WoodHouse1', 'WoodHouse10', 'WoodHouse11', 'WoodHouse12', 'WoodHouse13', 'WoodHouse5', 'WoodHouse7', 'WoodHouse9', 'WoodVillage1', 'WoodVillage2'
-- );

COMMIT;

START TRANSACTION;

  CREATE TABLE poi_icons (
      name text NOT NULL,
      svg text NOT NULL,
      updated_at timestamp with time zone NOT NULL,
      CONSTRAINT pk_poi_icons PRIMARY KEY (name)
  );

  CREATE TABLE poi_settings (
      prefab text NOT NULL,
      visible boolean,
      icon text,
      color text,
      lod integer,
      updated_at timestamp with time zone NOT NULL,
      CONSTRAINT pk_poi_settings PRIMARY KEY (prefab)
  );

  COMMIT;

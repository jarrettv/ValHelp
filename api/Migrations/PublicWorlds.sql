-- Public worlds: the seeds anyone may open on /worlds (ModuleWorlds/WorldsPublic.cs).
-- sort_order 0 is the world /worlds opens on. Managed from the seed picker by the owner.
START TRANSACTION;

  CREATE TABLE IF NOT EXISTS public_worlds (
      seed text NOT NULL,
      sort_order integer NOT NULL,
      pinned_at timestamp with time zone NOT NULL,
      CONSTRAINT pk_public_worlds PRIMARY KEY (seed)
  );

  INSERT INTO public_worlds (seed, sort_order, pinned_at)
  VALUES ('JVModsFun', 0, now())
  ON CONFLICT (seed) DO NOTHING;

  COMMIT;

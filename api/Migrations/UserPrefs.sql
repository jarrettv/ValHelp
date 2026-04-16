START TRANSACTION;

  ALTER TABLE users ADD prefs jsonb NOT NULL DEFAULT '{}';

  INSERT INTO "__EFMigrationsHistory" (migration_id, product_version)
  VALUES ('20260415232422_UserPrefs', '9.0.1');

  COMMIT;

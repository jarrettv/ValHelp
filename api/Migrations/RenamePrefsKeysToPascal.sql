-- One-shot data migration: rename User.prefs jsonb keys from camelCase (written by the
-- old hand-rolled JSON writer) to PascalCase (what EF Core .ToJson() reads/writes).
--
-- Old shape: { "favs": {"items":[...], "at":"..."}, "speedRuns": {...}, "feedback":[{"page":"...","msg":"...","at":"..."}], "blocked":"..." }
-- New shape: { "Favs": {"Items":[...], "At":"..."}, "SpeedRuns": {...}, "Feedback":[{"Page":"...","Msg":"...","At":"..."}], "Blocked":"..." }
--
-- Idempotent: rows already in the new shape (or partially migrated) are skipped.
-- Run once against the valhelp database after deploying the EF .ToJson() mapping.

BEGIN;

UPDATE users
SET prefs = jsonb_strip_nulls(jsonb_build_object(
    'Favs', CASE WHEN jsonb_typeof(prefs->'favs') = 'object' THEN
        jsonb_strip_nulls(jsonb_build_object(
            'Items', prefs->'favs'->'items',
            'At',    prefs->'favs'->'at'
        ))
    END,
    'SpeedRuns', CASE WHEN jsonb_typeof(prefs->'speedRuns') = 'object' THEN
        jsonb_strip_nulls(jsonb_build_object(
            'Items', prefs->'speedRuns'->'items',
            'At',    prefs->'speedRuns'->'at'
        ))
    END,
    'Feedback', CASE WHEN jsonb_typeof(prefs->'feedback') = 'array' THEN (
        SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
            'Page', elem->'page',
            'Msg',  elem->'msg',
            'At',   elem->'at'
        )))
        FROM jsonb_array_elements(prefs->'feedback') AS elem
    ) END,
    'Blocked', prefs->'blocked'
))
WHERE prefs IS NOT NULL
  AND prefs <> '{}'::jsonb
  AND (prefs ? 'favs' OR prefs ? 'speedRuns' OR prefs ? 'feedback' OR prefs ? 'blocked')
  AND NOT (prefs ? 'Favs' OR prefs ? 'SpeedRuns' OR prefs ? 'Feedback' OR prefs ? 'Blocked');

COMMIT;

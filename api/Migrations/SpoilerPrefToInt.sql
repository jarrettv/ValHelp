-- One-shot data migration: User.prefs -> 'Spoiler' changes from a UserPrefsItems
-- object to a plain integer level (how many biomes are revealed, 1-based).
--
-- Old shape: { "Spoiler": { "Items": ["4.5"], "At": "..." } }
-- New shape: { "Spoiler": 4 }
--
-- The old fractional value was slider-animation state; only floor() ever gated
-- content, so flooring loses nothing. Values are clamped to 1-16 to match the
-- range PostSpoiler accepts.
--
-- Idempotent: rows already holding a number (or no Spoiler key) are skipped.
-- MUST run before deploying the int? mapping — EF cannot read the old object
-- shape into an int and will throw on any user row that still has it.

BEGIN;

-- Parseable values → floored, clamped int.
UPDATE users
SET prefs = jsonb_set(
        prefs,
        '{Spoiler}',
        to_jsonb(GREATEST(1, LEAST(16, FLOOR((prefs->'Spoiler'->'Items'->>0)::numeric)::int)))
    )
WHERE jsonb_typeof(prefs->'Spoiler') = 'object'
  AND (prefs->'Spoiler'->'Items'->>0) ~ '^[0-9]+(\.[0-9]+)?$';

-- Anything still an object (empty/garbage Items) → drop the key; the user just
-- falls back to their local slider value on the next visit.
UPDATE users
SET prefs = prefs - 'Spoiler'
WHERE jsonb_typeof(prefs->'Spoiler') = 'object';

COMMIT;

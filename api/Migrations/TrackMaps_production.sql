-- Production migration: TrackMaps + TrackMapsBvec + TrackMapsPaths
-- Run against production database before deploying new code
-- Safe to run multiple times (IF NOT EXISTS checks)

START TRANSACTION;

-- Migration 1: TrackMaps table
CREATE TABLE IF NOT EXISTS track_maps (
    seed text NOT NULL,
    map_tex bytea NOT NULL,
    height_tex bytea NOT NULL,
    mask_tex bytea NOT NULL,
    uploaded_at timestamp with time zone NOT NULL,
    uploaded_by text NOT NULL,
    CONSTRAINT pk_track_maps PRIMARY KEY (seed)
);

-- Migration 2: BVEC cache columns
ALTER TABLE track_maps ADD COLUMN IF NOT EXISTS bvec bytea;
ALTER TABLE track_maps ADD COLUMN IF NOT EXISTS bvec_at timestamp with time zone;

-- Migration 3: Paths cache column
ALTER TABLE track_maps ADD COLUMN IF NOT EXISTS paths text;

COMMIT;

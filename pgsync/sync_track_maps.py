#!/usr/bin/env python3
"""
Sync track_maps from supabase to local DB one row at a time.
Avoids statement timeouts from bulk COPY of large bytea blobs.

Uses --preserve semantics: rows already in dest (by seed PK) are skipped.

Usage:
  docker run --rm --network valhelp_default \
    --env-file /opt/stacks/valhelp/.env \
    -v /opt/stacks/valhelp/pgsync:/scripts \
    python:3-slim bash -c "pip install -q psycopg2-binary && python3 /scripts/sync_track_maps.py"
"""

import os
import sys
import time
import psycopg2

FROM_URL = os.environ["PGSYNC_FROM_URL"]
TO_URL = os.environ["PGSYNC_TO_URL"]

COLUMNS = [
    "seed", "map_tex", "height_tex", "mask_tex",
    "uploaded_at", "uploaded_by", "bvec", "bvec_at", "paths",
]

def main():
    print("[sync_track_maps] connecting to source (supabase)...")
    src = psycopg2.connect(FROM_URL)
    src.set_session(readonly=True)

    print("[sync_track_maps] connecting to dest (local)...")
    dst = psycopg2.connect(TO_URL)

    # Get seeds already in dest
    with dst.cursor() as cur:
        cur.execute("SELECT seed FROM track_maps")
        existing = {row[0] for row in cur.fetchall()}
    print(f"[sync_track_maps] dest has {len(existing)} existing row(s)")

    # Get seeds from source
    with src.cursor() as cur:
        cur.execute("SELECT seed FROM track_maps ORDER BY uploaded_at")
        source_seeds = [row[0] for row in cur.fetchall()]
    print(f"[sync_track_maps] source has {len(source_seeds)} row(s)")

    missing = [s for s in source_seeds if s not in existing]
    if not missing:
        print("[sync_track_maps] nothing to sync — all rows present")
        src.close()
        dst.close()
        return

    print(f"[sync_track_maps] syncing {len(missing)} new row(s)...")

    cols_sql = ", ".join(COLUMNS)
    placeholders = ", ".join(["%s"] * len(COLUMNS))
    insert_sql = f"INSERT INTO track_maps ({cols_sql}) VALUES ({placeholders}) ON CONFLICT (seed) DO NOTHING"

    synced = 0
    failed = 0
    for seed in missing:
        t0 = time.time()
        try:
            with src.cursor() as cur:
                cur.execute(f"SELECT {cols_sql} FROM track_maps WHERE seed = %s", (seed,))
                row = cur.fetchone()
            if row is None:
                print(f"  {seed}: not found on source (skipped)")
                continue

            with dst.cursor() as cur:
                cur.execute(insert_sql, row)
            dst.commit()

            elapsed = time.time() - t0
            blob_mb = sum(len(v) for v in row if isinstance(v, (bytes, memoryview))) / 1048576
            print(f"  {seed}: synced ({blob_mb:.1f} MB, {elapsed:.1f}s)")
            synced += 1

        except Exception as e:
            dst.rollback()
            elapsed = time.time() - t0
            print(f"  {seed}: FAILED ({e}) ({elapsed:.1f}s)")
            failed += 1

    src.close()
    dst.close()
    print(f"[sync_track_maps] done: {synced} synced, {failed} failed, {len(existing)} already present")

if __name__ == "__main__":
    main()

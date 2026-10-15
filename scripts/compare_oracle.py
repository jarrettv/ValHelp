#!/usr/bin/env python3
"""Diff the seedgen worldgen oracle against our managed reimplementation.

The oracle (seedgen/oracle) dumps the *game's own* GetBiome / GetBiomeHeight /
GetForestFactor over the 2048x2048 minimap grid, plus a Mathf.PerlinNoise
fixture. This script reports where we disagree, in an order chosen so the first
failing section is the root cause rather than a symptom:

  1. perlin  — the only native black box in the chain. If this fails, nothing
               downstream can match and fixing anything else is wasted effort.
  2. biome   — integer-valued, so it only breaks where noise crosses a
               threshold. A small mismatch count here with a failing perlin is
               expected and not a separate bug.
  3. height  — continuous, so any noise error lands in every pixel. This is the
               one that silently broke before: an 8-bit biome map tolerates
               noise error that a float height does not.
  4. forest  — continuous, feeds the forest mask channel.

Usage:
    py scripts/compare_oracle.py <oracle-dir> [--ours <dir>]
    py scripts/compare_oracle.py <oracle-dir> --perlin-only

<oracle-dir> holds the oracle.* files (fetched from
/api/v2/seed<hash>/oracle.height.f32.gz etc, or copied from a seed's artifact
directory). --ours points at matching .f32/.u8 raw dumps from the managed side;
omit it to just summarise the oracle itself.
"""

import argparse
import gzip
import json
import os
import struct
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def read_gz(path):
    with gzip.open(path, "rb") as fh:
        return fh.read()


def as_f32(buf):
    return struct.unpack(f"<{len(buf) // 4}f", buf[: len(buf) // 4 * 4])


def pct(n, d):
    return f"{100.0 * n / d:.3f}%" if d else "n/a"


def ulp_diff_f32(a, b):
    """Distance in representable float32 steps. 0 = bit-identical."""
    ia = struct.unpack("<i", struct.pack("<f", a))[0]
    ib = struct.unpack("<i", struct.pack("<f", b))[0]
    if ia < 0:
        ia = -2147483648 - ia
    if ib < 0:
        ib = -2147483648 - ib
    return abs(ia - ib)


def summarise_floats(name, want, got):
    if len(want) != len(got):
        print(f"{name}: LENGTH MISMATCH — oracle {len(want):,} vs ours {len(got):,}")
        return False

    exact = 0
    within_1ulp = 0
    worst = 0.0
    worst_at = -1
    worst_pair = (0.0, 0.0)
    for i, (a, b) in enumerate(zip(want, got)):
        if a == b:
            exact += 1
            continue
        if ulp_diff_f32(a, b) <= 1:
            within_1ulp += 1
        d = abs(a - b)
        if d > worst:
            worst, worst_at, worst_pair = d, i, (a, b)

    n = len(want)
    bad = n - exact
    print(f"{name}:")
    print(f"  bit-identical : {exact:,}/{n:,} ({pct(exact, n)})")
    if bad:
        print(f"  differing     : {bad:,} ({pct(bad, n)}), of which {within_1ulp:,} are <=1 ulp")
        print(f"  worst abs diff: {worst:.9g} at index {worst_at} "
              f"(oracle {worst_pair[0]:.9g}, ours {worst_pair[1]:.9g})")
    return bad == 0


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("oracle_dir")
    ap.add_argument("--ours", help="dir with our raw dumps: height.f32, biome.u8, forest.f32")
    ap.add_argument("--perlin-only", action="store_true",
                    help="only check the Perlin fixture (fast, and the root cause if it fails)")
    args = ap.parse_args()

    od = args.oracle_dir
    meta_path = os.path.join(od, "oracle.json")
    if os.path.exists(meta_path):
        with open(meta_path, encoding="utf8") as fh:
            meta = json.load(fh)
        print(f"oracle: seed={meta.get('seed')} name={meta.get('worldSeedName')!r} "
              f"game={meta.get('gameVersion')} worldGen={meta.get('worldGenVersion')} "
              f"grid={meta.get('gridSize')}@{meta.get('pixelSize')}")
    else:
        print(f"note: no oracle.json in {od}")
    print()

    ok = True

    # 1. Perlin — inputs are stored alongside outputs, so we never have to
    #    reproduce the input generator (one less thing to get subtly wrong).
    pf = os.path.join(od, "oracle.perlin.f32.gz")
    if os.path.exists(pf):
        trip = as_f32(read_gz(pf))
        n = len(trip) // 3
        print(f"── perlin fixture ({n:,} samples) ──")
        try:
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            from perlin_ref import noise as ours_noise  # optional local reference
        except Exception:
            print("  no perlin_ref.py alongside this script — showing oracle values only.")
            print("  Feed these (x, y) -> noise pairs to the managed implementation to")
            print("  validate it offline; that settles Mathf.PerlinNoise without the game.")
            for k in range(0, min(n, 5)):
                x, y, v = trip[k * 3], trip[k * 3 + 1], trip[k * 3 + 2]
                print(f"    PerlinNoise({x:.6g}, {y:.6g}) = {v:.9g}")
        else:
            want = [trip[k * 3 + 2] for k in range(n)]
            got = [ours_noise(trip[k * 3], trip[k * 3 + 1]) for k in range(n)]
            ok &= summarise_floats("  perlin", want, got)
        print()
    else:
        print(f"note: no perlin fixture in {od}\n")

    if args.perlin_only:
        return

    if not args.ours:
        print("no --ours given; nothing to diff against.")
        return

    # 2. biome — uint8 dense BiomeIndex
    bo = os.path.join(od, "oracle.biome.u8.gz")
    bm = os.path.join(args.ours, "biome.u8")
    if os.path.exists(bo) and os.path.exists(bm):
        want = read_gz(bo)
        got = open(bm, "rb").read()
        print("── biome ──")
        if len(want) != len(got):
            print(f"  LENGTH MISMATCH — oracle {len(want):,} vs ours {len(got):,}")
            ok = False
        else:
            bad = sum(1 for a, b in zip(want, got) if a != b)
            print(f"  identical: {len(want) - bad:,}/{len(want):,} ({pct(len(want) - bad, len(want))})")
            if bad:
                print(f"  differing: {bad:,} ({pct(bad, len(want))}) — expected to be small and")
                print("             confined to biome thresholds if perlin is slightly off")
                ok = False
        print()

    # 3 + 4. continuous fields
    for label, oname, mname in (
        ("height", "oracle.height.f32.gz", "height.f32"),
        ("forest", "oracle.forest.f32.gz", "forest.f32"),
    ):
        op = os.path.join(od, oname)
        mp = os.path.join(args.ours, mname)
        if not (os.path.exists(op) and os.path.exists(mp)):
            continue
        print(f"── {label} ──")
        ok &= summarise_floats(f"  {label}", as_f32(read_gz(op)), as_f32(open(mp, "rb").read()))
        print()

    print("VERDICT:", "bit-exact" if ok else "MISMATCH — fix the first failing section above")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()

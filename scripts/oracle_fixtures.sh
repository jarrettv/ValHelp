#!/usr/bin/env bash
# Worldgen ground truth for the regression tests (seedgen/Vh.WorldGen.Tests):
# boots the real game (local seedgen image + its Valheim server volume) once per
# seed with the oracle plugin, and copies the game's own height / biome / forest
# grids, river network and Perlin fixture into seedgen/Vh.WorldGen.Tests/oracle-fixtures/<seed>/.
#
#   scripts/oracle_fixtures.sh JVModsFun NewDNTest ...
#
# Needs: the valhelp-valhelp-seedgen image, the valhelp_seedgen_server volume (a
# Valheim dedicated server with BepInEx) and a built plugin
# (dotnet build seedgen/oracle -c Release). Loot sampling is switched off, so a
# job is a server boot plus the grid sweep, a couple of minutes each.
# Re-run after a Valheim update: oracle.json records the game version.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/seedgen/Vh.WorldGen.Tests/oracle-fixtures"
WORK="$(mktemp -d)"
NAME=vh-worldgen-oracle
PORT=5593
DLL="$ROOT/seedgen/oracle/bin/Release/ValHelpOracle.dll"
[ $# -gt 0 ] || { echo "usage: $0 <seed>..." >&2; exit 2; }
[ -f "$DLL" ] || { echo "build the plugin first: dotnet build seedgen/oracle -c Release" >&2; exit 1; }

# Docker on Windows wants native paths for bind mounts.
native() { if command -v cygpath >/dev/null; then cygpath -m "$1"; else echo "$1"; fi; }

docker rm -f "$NAME" >/dev/null 2>&1 || true
MSYS_NO_PATHCONV=1 docker run -d --name "$NAME" -p "$PORT:5580" \
  -v valhelp_seedgen_server:/valheim \
  -v "$(native "$DLL"):/app/oracle/ValHelpOracle.dll:ro" \
  -v "$(native "$WORK"):/data" \
  -e VALHELP_LOOT_ONLY=__none__ \
  valhelp-valhelp-seedgen:latest >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

for _ in $(seq 1 90); do curl -sf -m 3 "localhost:$PORT/health" >/dev/null 2>&1 && break; sleep 5; done

seed_hash() {
  python - "$1" <<'EOF'
import sys
s = sys.argv[1]; M = 0xffffffff; n1 = n2 = 5381; i = 0
while i < len(s):
    n1 = (((n1 << 5) + n1) & M) ^ ord(s[i])
    if i == len(s) - 1: break
    n2 = (((n2 << 5) + n2) & M) ^ ord(s[i + 1]); i += 2
r = (n1 + n2 * 1566083941) & M
print(r - (1 << 32) if r >= 1 << 31 else r)
EOF
}

# One seed at a time, copied as soon as it's done, so a failure costs only that seed.
status=0
for seed in "$@"; do
  started=$(date +%s)
  curl -sf -X POST "localhost:$PORT/api/seedgen/regen" -H 'content-type: application/json'     -d "{\"seed\":\"$seed\",\"oracle\":true}" >/dev/null
  while :; do
    n=$(curl -s -m 5 "localhost:$PORT/api/seedgen/queue" | python -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "?")
    [ "$n" = "0" ] && break
    if [ $(( $(date +%s) - started )) -gt 1500 ]; then echo "$seed: still running after 25 min" >&2; docker logs --tail 20 "$NAME" >&2; exit 1; fi
    sleep 10
  done
  src="$WORK/v2/seed$(seed_hash "$seed")"
  if [ ! -f "$src/oracle.height.f32.gz" ]; then
    echo "$seed: FAILED after $(( $(date +%s) - started ))s (no oracle dump)" >&2
    docker logs "$NAME" 2>&1 | grep -E "Job #.* failed" -A3 | tail -4 >&2
    status=1; continue
  fi
  mkdir -p "$OUT/$seed"
  cp "$src"/oracle.json "$src"/oracle.height.f32.gz "$src"/oracle.biome.u8.gz      "$src"/oracle.forest.f32.gz "$src"/oracle.perlin.f32.gz "$src"/oracle.rivers.bin.gz "$src"/oracle.locations.json "$src"/oracle.altbiomes.json "$src"/oracle.altbiomes.u8.gz "$OUT/$seed/"
  echo "$seed -> $OUT/$seed (game $(grep -o '"gameVersion": "[^"]*"' "$OUT/$seed/oracle.json" | cut -d'"' -f4), $(( $(date +%s) - started ))s)"
done
exit $status

#!/bin/bash
# Deploys seedgen (with the worldgen oracle) to a remote host and runs one
# oracle job, leaving the dump in ./oracle-out/ locally.
#
#   scripts/deploy_seedgen_oracle.sh [seed]
#
# Env overrides:
#   HOST       ssh target                      (default jv@jv-server)
#   REMOTE_DIR repo path on the host           (default /opt/stacks/valhelp)
#   SEED       seed to generate                (default NewDNTest)
#   PORT       seedgen HTTP port on the host   (default 5580)
#   SKIP_BUILD 1 to reuse the existing image
#
# The oracle plugin targets net472 and references the game + BepInEx assemblies,
# so it cannot be built inside the Linux image — it is built here and shipped.
set -euo pipefail

HOST="${HOST:-jv@jv-server}"
REMOTE_DIR="${REMOTE_DIR:-/opt/stacks/valhelp}"
SEED="${SEED:-${1:-NewDNTest}}"
PORT="${PORT:-5580}"
OUT="${OUT:-oracle-out}"

say() { printf '\n=== %s ===\n' "$*"; }

say "1/6 build oracle plugin locally"
dotnet build seedgen/oracle -c Release --nologo
PLUGIN=seedgen/oracle/bin/Release/ValHelpOracle.dll
[ -f "$PLUGIN" ] || { echo "plugin not built: $PLUGIN" >&2; exit 1; }
ls -l "$PLUGIN"

say "2/6 sync seedgen to $HOST:$REMOTE_DIR"
# --delete keeps the remote tree honest; scoped to seedgen/ and scripts/ only so
# it cannot touch anything else on the host.
rsync -az --delete \
  --exclude 'bin/' --exclude 'obj/' --exclude 'oracle/bin/' --exclude 'oracle/obj/' \
  seedgen/ "$HOST:$REMOTE_DIR/seedgen/"
rsync -az scripts/compare_oracle.py "$HOST:$REMOTE_DIR/scripts/"
# The built DLL is excluded above, so ship it explicitly to where the Dockerfile
# expects it (COPY oracle/bin/Release/ValHelpOracle.dl[l]).
ssh "$HOST" "mkdir -p '$REMOTE_DIR/seedgen/oracle/bin/Release'"
rsync -az "$PLUGIN" "$HOST:$REMOTE_DIR/seedgen/oracle/bin/Release/"

say "3/6 build image on $HOST"
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  ssh "$HOST" "cd '$REMOTE_DIR' && docker compose --profile seedgen build valhelp-seedgen"
else
  echo "skipped (SKIP_BUILD=1)"
fi

say "4/6 restart seedgen"
ssh "$HOST" "cd '$REMOTE_DIR' && docker compose --profile seedgen up -d valhelp-seedgen"

# BepInEx install happens at container start, after update-server.sh. Wait for
# the API rather than guessing a sleep duration.
say "5/6 wait for seedgen to answer, then run the oracle job"
ssh "$HOST" "bash -s" <<REMOTE
set -euo pipefail
cd '$REMOTE_DIR'

for i in \$(seq 1 120); do
  if curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1; then echo "seedgen up after \${i}0s"; break; fi
  sleep 10
  [ "\$i" = 120 ] && { echo "seedgen never came up; last 80 log lines:" >&2; docker compose --profile seedgen logs --tail=80 valhelp-seedgen >&2; exit 1; }
done

echo "-- install-bepinex / update-server output --"
docker compose --profile seedgen logs valhelp-seedgen 2>&1 | grep -E 'install-bepinex|update-server' | tail -20 || true

echo "-- submitting oracle job for seed $SEED --"
curl -sf -X POST "http://localhost:$PORT/api/seedgen/regen" \
  -H 'content-type: application/json' \
  -d '{"seed":"$SEED","oracle":true}' | tee /tmp/oracle-submit.json
echo

# Oracle = server boot + location gen + a single-threaded 2048^2 sweep.
# Poll for the artifact rather than assuming a duration.
HASH=\$(docker compose --profile seedgen exec -T valhelp-seedgen \
        sh -c 'ls /data/v2 2>/dev/null' >/dev/null 2>&1 || true)
for i in \$(seq 1 90); do
  if docker compose --profile seedgen logs valhelp-seedgen 2>&1 | grep -q 'valhelp-oracle. DONE'; then
    echo "oracle dump complete"; break
  fi
  if docker compose --profile seedgen logs valhelp-seedgen 2>&1 | grep -qE 'valhelp-oracle. FAILED|Job #[0-9]+ failed'; then
    echo "oracle job FAILED; relevant log:" >&2
    docker compose --profile seedgen logs valhelp-seedgen 2>&1 | grep -E 'valhelp-oracle|Job #|Oracle' | tail -40 >&2
    exit 1
  fi
  sleep 10
done

echo "-- oracle files on host --"
docker compose --profile seedgen exec -T valhelp-seedgen \
  sh -c 'find /data -name "oracle.*" -printf "%s\t%p\n"' || true
REMOTE

say "6/6 pull the dump back to ./$OUT"
mkdir -p "$OUT"
# Resolve the seed hash the same way seedgen does, then fetch over the HTTP API
# (no container paths, no docker cp).
HASH=$(ssh "$HOST" "cd '$REMOTE_DIR' && docker compose --profile seedgen exec -T valhelp-seedgen \
        sh -c 'ls /data/v2 2>/dev/null | head -1'" | tr -d '\r\n')
echo "seed dir: ${HASH:-<none>}"
if [ -z "$HASH" ]; then
  echo "no seed dir found under /data/v2 — check the logs above" >&2
  exit 1
fi
for f in oracle.json oracle.perlin.f32.gz oracle.biome.u8.gz oracle.height.f32.gz oracle.forest.f32.gz; do
  if ssh "$HOST" "curl -sf 'http://localhost:$PORT/api/v2/${HASH#seed}/$f'" > "$OUT/$f" 2>/dev/null \
     || ssh "$HOST" "curl -sf 'http://localhost:$PORT/api/v2/$HASH/$f'" > "$OUT/$f" 2>/dev/null; then
    echo "  got $f ($(wc -c < "$OUT/$f") bytes)"
  else
    rm -f "$OUT/$f"; echo "  MISSING $f"
  fi
done

say "done"
echo "Perlin is the only native black box in the chain — check it first:"
echo "  py scripts/compare_oracle.py $OUT --perlin-only"

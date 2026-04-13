#!/bin/bash
set -e

SEED="$1"
if [ -z "$SEED" ]; then
  echo "Usage: docker run --rm valhelp-seedgen <seed> [worldgen_version]" >&2
  exit 1
fi

WORLDGEN="${2:-2}"
WORLD="sg_$(echo "$SEED" | tr -cd 'a-zA-Z0-9' | head -c 20)"
WORLDS_DIR="/root/.config/unity3d/IronGate/Valheim/worlds_local"
SERVER_DIR="/valheim"

mkdir -p "$WORLDS_DIR"

# 1. Create .fwl for this seed
echo "[seedgen] Creating .fwl for seed=$SEED worldgen=$WORLDGEN" >&2
dotnet /app/seedgen.dll create-fwl "$SEED" "$WORLDS_DIR/$WORLD.fwl" --worldgen "$WORLDGEN"

# 2. Start server in background
echo "[seedgen] Starting Valheim server..." >&2
cd "$SERVER_DIR"

# Server needs these env vars
export SteamAppId=892970
export LD_LIBRARY_PATH="$SERVER_DIR/linux64:$LD_LIBRARY_PATH"

./valheim_server.x86_64 \
  -nographics -batchmode \
  -world "$WORLD" -name "$WORLD" \
  -port 2456 -password "seedgen_tmp" \
  > /tmp/server.log 2>&1 &
SERVER_PID=$!

# 3. Wait for world save (locations written by then)
echo "[seedgen] Waiting for world generation..." >&2
TIMEOUT=120
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  if grep -q "World saved" /tmp/server.log 2>/dev/null; then
    echo "[seedgen] World saved detected after ${ELAPSED}s" >&2
    break
  fi
  # Also check for "Game server connected" as backup signal
  if grep -q "Game server connected" /tmp/server.log 2>/dev/null; then
    # Give it a couple more seconds for the save to flush
    sleep 3
    echo "[seedgen] Server ready after ${ELAPSED}s" >&2
    break
  fi
  sleep 1
  ELAPSED=$((ELAPSED + 1))
done

if [ $ELAPSED -ge $TIMEOUT ]; then
  echo "[seedgen] ERROR: Timed out waiting for server" >&2
  cat /tmp/server.log >&2
  kill $SERVER_PID 2>/dev/null || true
  exit 1
fi

# 4. Kill server
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true

# 5. Parse .db → JSON to stdout
DB_FILE="$WORLDS_DIR/$WORLD.db"
if [ ! -f "$DB_FILE" ]; then
  echo "[seedgen] ERROR: No .db file generated at $DB_FILE" >&2
  ls -la "$WORLDS_DIR/" >&2
  exit 1
fi

echo "[seedgen] Parsing $DB_FILE..." >&2
dotnet /app/seedgen.dll parse-db "$DB_FILE" "$SEED"

# 6. Cleanup
rm -f "$WORLDS_DIR/$WORLD".*
echo "[seedgen] Done." >&2

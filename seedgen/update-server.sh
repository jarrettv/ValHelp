#!/bin/bash
# Downloads/updates the Valheim dedicated server if not present or outdated.
# The server directory is expected to be a mounted volume for persistence.
set -e

VALHEIM_DIR="${VALHEIM_SERVER_DIR:-/valheim}"
STEAMCMD="/steamcmd/steamcmd.sh"
MARKER="$VALHEIM_DIR/.installed"
MANIFEST="$VALHEIM_DIR/steamapps/appmanifest_896660.acf"

# Steam build id of the installed server, or empty if not installed yet.
read_buildid() {
  [ -f "$MANIFEST" ] || return 0
  sed -n 's/.*"buildid"[^"]*"\([0-9]*\)".*/\1/p' "$MANIFEST" | head -n1
}

BEFORE="$(read_buildid)"

# The 24h window keeps container restarts from hammering steamcmd. Set
# VALHEIM_FORCE_UPDATE=1 to bypass it — needed when a known game release has to
# be picked up now rather than within a day.
if [ -f "$VALHEIM_DIR/valheim_server.x86_64" ] && [ -f "$MARKER" ] && [ "${VALHEIM_FORCE_UPDATE:-0}" != "1" ]; then
  AGE=$(( $(date +%s) - $(stat -c %Y "$MARKER") ))
  if [ $AGE -lt 86400 ]; then
    echo "[update-server] Valheim server up to date (build ${BEFORE:-unknown}, checked ${AGE}s ago)"
    exit 0
  fi
  echo "[update-server] Checking for Valheim server updates (build ${BEFORE:-unknown})..."
else
  echo "[update-server] Installing/updating Valheim dedicated server (build ${BEFORE:-none})..."
fi

mkdir -p "$VALHEIM_DIR"

# SteamCMD sometimes needs a warm-up login
$STEAMCMD +force_install_dir "$VALHEIM_DIR" +login anonymous +quit 2>/dev/null || true

# app_info_update avoids steamcmd's "Missing configuration" failure, and stale
# downloading/temp dirs from an interrupted update leave the manifest stuck in
# an update-failed state (0x6) that every later run trips over.
rm -rf "$VALHEIM_DIR/steamapps/downloading" "$VALHEIM_DIR/steamapps/temp"
if ! $STEAMCMD +force_install_dir "$VALHEIM_DIR" +login anonymous \
  +app_info_update 1 +app_update 896660 validate +quit; then
  # Don't crash-loop the container over a transient Steam failure when a
  # working server is already installed; the next start retries.
  if [ -f "$VALHEIM_DIR/valheim_server.x86_64" ]; then
    echo "[update-server] WARNING: update failed, continuing with build ${BEFORE:-unknown}" >&2
    exit 0
  fi
  exit 1
fi

touch "$MARKER"

AFTER="$(read_buildid)"
echo "[update-server] Valheim server ready at $VALHEIM_DIR (build ${AFTER:-unknown})"

if [ -n "${VALHEIM_EXPECTED_BUILDID:-}" ] && [ "$AFTER" != "$VALHEIM_EXPECTED_BUILDID" ]; then
  echo "[update-server] WARNING: expected build $VALHEIM_EXPECTED_BUILDID but have ${AFTER:-unknown}." >&2
fi

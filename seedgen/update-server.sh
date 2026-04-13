#!/bin/bash
# Downloads/updates the Valheim dedicated server if not present or outdated.
# The server directory is expected to be a mounted volume for persistence.
set -e

VALHEIM_DIR="${VALHEIM_SERVER_DIR:-/valheim}"
STEAMCMD="/steamcmd/steamcmd.sh"
MARKER="$VALHEIM_DIR/.installed"

if [ -f "$VALHEIM_DIR/valheim_server.x86_64" ] && [ -f "$MARKER" ]; then
  AGE=$(( $(date +%s) - $(stat -c %Y "$MARKER") ))
  # Re-check for updates every 24 hours
  if [ $AGE -lt 86400 ]; then
    echo "[update-server] Valheim server up to date (checked ${AGE}s ago)"
    exit 0
  fi
  echo "[update-server] Checking for Valheim server updates..."
else
  echo "[update-server] Installing Valheim dedicated server..."
fi

mkdir -p "$VALHEIM_DIR"

# SteamCMD sometimes needs a warm-up login
$STEAMCMD +force_install_dir "$VALHEIM_DIR" +login anonymous +quit 2>/dev/null || true

$STEAMCMD +force_install_dir "$VALHEIM_DIR" +login anonymous \
  +app_update 896660 validate +quit

touch "$MARKER"
echo "[update-server] Valheim server ready at $VALHEIM_DIR"

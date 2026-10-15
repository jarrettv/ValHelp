#!/bin/bash
# Installs BepInEx + the ValHelp worldgen oracle plugin into the Valheim server dir.
#
# Must run AFTER update-server.sh: `app_update ... validate` can clobber or remove
# files under the server directory, so BepInEx goes on top of a settled install.
#
# BepInEx is inert unless a process sets DOORSTOP_ENABLE=TRUE (SeedGenWorker does
# that only for oracle jobs), so installing it does not affect ordinary POI runs.
#
# Non-fatal by design: if the download fails or the plugin was not built, the
# server still works for POI generation and only oracle jobs fail, with a message
# pointing here.
set -uo pipefail

VALHEIM_DIR="${VALHEIM_SERVER_DIR:-/valheim}"
VERSION="${BEPINEX_VERSION:-5.4.2202}"
PLUGIN_SRC="${ORACLE_PLUGIN:-/app/oracle/ValHelpOracle.dll}"
MARKER="$VALHEIM_DIR/.bepinex-$VERSION"
URL="https://gcdn.thunderstore.io/live/repository/packages/denikson-BepInExPack_Valheim-${VERSION}.zip"

log() { echo "[install-bepinex] $*"; }

if [ ! -d "$VALHEIM_DIR" ]; then
  log "no server dir at $VALHEIM_DIR — skipping"
  exit 0
fi

install_pack() {
  command -v unzip >/dev/null 2>&1 || { log "unzip not available"; return 1; }
  local tmp
  tmp="$(mktemp -d)" || return 1
  log "downloading BepInEx $VERSION"
  curl -sSfL "$URL" -o "$tmp/pack.zip" || { log "download failed: $URL"; rm -rf "$tmp"; return 1; }
  unzip -q -o "$tmp/pack.zip" -d "$tmp/x" || { log "unzip failed"; rm -rf "$tmp"; return 1; }

  # The Thunderstore pack nests everything under BepInExPack_Valheim/; older or
  # repackaged archives put it at the root. Handle both by locating doorstop_libs.
  local root
  root="$(dirname "$(find "$tmp/x" -maxdepth 3 -type d -name doorstop_libs | head -n1)")"
  if [ -z "$root" ] || [ ! -d "$root" ]; then
    log "unexpected archive layout — no doorstop_libs found"
    rm -rf "$tmp"
    return 1
  fi

  cp -r "$root"/. "$VALHEIM_DIR"/ || { log "copy failed"; rm -rf "$tmp"; return 1; }
  rm -rf "$tmp"
  return 0
}

if [ -f "$MARKER" ] && [ -f "$VALHEIM_DIR/doorstop_libs/libdoorstop_x64.so" ]; then
  log "BepInEx $VERSION already present"
else
  rm -f "$VALHEIM_DIR"/.bepinex-* 2>/dev/null
  if install_pack; then
    touch "$MARKER"
    log "BepInEx $VERSION installed"
  else
    log "WARNING: BepInEx not installed — oracle jobs will fail, POI jobs unaffected"
    exit 0
  fi
fi

# The plugin is built on the host (it needs the game + BepInEx reference
# assemblies) and copied into the image. See seedgen/oracle/README.md.
if [ -f "$PLUGIN_SRC" ]; then
  mkdir -p "$VALHEIM_DIR/BepInEx/plugins"
  cp -f "$PLUGIN_SRC" "$VALHEIM_DIR/BepInEx/plugins/" \
    && log "oracle plugin installed ($(basename "$PLUGIN_SRC"))"
else
  log "WARNING: no oracle plugin at $PLUGIN_SRC — oracle jobs will produce no dump"
fi

# Sanity-check the two files SeedGenWorker points Doorstop at, so a broken install
# is reported here rather than as a silent no-op mod layer at job time.
for f in doorstop_libs/libdoorstop_x64.so BepInEx/core/BepInEx.Preloader.dll; do
  [ -f "$VALHEIM_DIR/$f" ] || log "WARNING: missing $f"
done

exit 0

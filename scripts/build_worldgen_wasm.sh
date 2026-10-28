#!/usr/bin/env bash
# Build the browser worldgen (seedgen/Vh.WorldGen.Wasm, ahead-of-time compiled)
# and copy it to web/public/worldgen/, where the Worlds page and the admin dev
# page (/auth/worldgen) load it from. Generated output: gitignored, so run this
# before `npm run dev` or a web build; CI runs it (.github/workflows/main_valhelp.yml).
#
# Needs the wasm-tools-net9 workload: dotnet workload install wasm-tools-net9
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/seedgen/Vh.WorldGen.Wasm/bin/Release/net9.0/publish/wwwroot/_framework"
# Each publish fingerprints its files with new names; clear old ones so they don't pile up.
rm -rf "$ROOT/seedgen/Vh.WorldGen.Wasm/bin/Release/net9.0/publish"
dotnet publish "$ROOT/seedgen/Vh.WorldGen.Wasm" -c Release -nologo -v q
DST="$ROOT/web/public/worldgen/_framework"
rm -rf "$DST"
mkdir -p "$DST"
cp -r "$SRC"/. "$DST"/
echo "worldgen wasm -> $DST ($(du -sh "$DST" | cut -f1))"

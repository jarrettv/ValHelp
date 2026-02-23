#!/usr/bin/env bash
set -euo pipefail

INTERVAL_SECONDS="${PGSYNC_INTERVAL_SECONDS:-14400}" # 4 hours
RUN_ONCE="${RUN_ONCE:-0}"
PROGRESS_INTERVAL_SECONDS="${PGSYNC_PROGRESS_INTERVAL_SECONDS:-900}" # 15 minutes
DEBUG_ECHO_URLS="${PGSYNC_DEBUG_ECHO_URLS:-0}"

CONFIG_DIR="${PGSYNC_CONFIG_DIR:-/config}"

if [[ ! -f "${CONFIG_DIR}/.pgsync.yml" ]]; then
	echo "Missing ${CONFIG_DIR}/.pgsync.yml" >&2
	if [[ -f "${CONFIG_DIR}/.pgsync.yml.example" ]]; then
		echo "Tip: copy ${CONFIG_DIR}/.pgsync.yml.example -> ${CONFIG_DIR}/.pgsync.yml" >&2
	fi
	exit 1
fi

cd "${CONFIG_DIR}"

TZ="${TZ:-UTC}"
export TZ

if [[ "${DEBUG_ECHO_URLS}" == "1" ]]; then
	echo "[pgsync] DEBUG: PGSYNC_FROM_URL=${PGSYNC_FROM_URL:-}" >&2
	echo "[pgsync] DEBUG: PGSYNC_TO_URL=${PGSYNC_TO_URL:-}" >&2
fi

now_local() {
	date '+%Y-%m-%d %H:%M:%S %Z'
}

format_duration() {
	local total="$1"
	if [[ "$total" -lt 0 ]]; then total=0; fi
	local h=$(( total / 3600 ))
	local m=$(( (total % 3600) / 60 ))
	local s=$(( total % 60 ))
	printf '%02dh %02dm %02ds' "$h" "$m" "$s"
}

sleep_for() {
	local base="$1"
	local total="$base"
	local start_epoch
	start_epoch="$(date +%s)"
	local next_epoch=$(( start_epoch + total ))

	echo "[pgsync] TZ=${TZ} | now=$(now_local) | next_run=$(date -d "@${next_epoch}" '+%Y-%m-%d %H:%M:%S %Z') | sleeping=$(format_duration "${total}")" >&2

	local remaining="$total"
	while [[ "$remaining" -gt 0 ]]; do
		local step="${PROGRESS_INTERVAL_SECONDS}"
		if [[ "$step" -gt "$remaining" ]]; then
			step="$remaining"
		fi
		sleep "$step"
		remaining=$(( remaining - step ))
		if [[ "$remaining" -gt 0 ]]; then
			echo "[pgsync] TZ=${TZ} | now=$(now_local) | next_run=$(date -d "@${next_epoch}" '+%Y-%m-%d %H:%M:%S %Z') | remaining=$(format_duration "${remaining}")" >&2
		fi
	done
}

run_sync() {
	echo "[pgsync] Running: pgsync $*" >&2
	pgsync "$@" --jobs 1
	echo "[pgsync] Sync complete" >&2
}

if [[ "${RUN_ONCE}" == "1" ]]; then
	run_sync "$@"
	exit 0
fi

while true; do
	run_sync "$@"
	sleep_for "${INTERVAL_SECONDS}"
done

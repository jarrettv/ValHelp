#!/usr/bin/env bash
set -euo pipefail

INTERVAL_SECONDS="${PGSYNC_INTERVAL_SECONDS:-14400}" # 4 hours
RUN_ONCE="${RUN_ONCE:-0}"
PROGRESS_INTERVAL_SECONDS="${PGSYNC_PROGRESS_INTERVAL_SECONDS:-900}" # 15 minutes
DEBUG_ECHO_URLS="${PGSYNC_DEBUG_ECHO_URLS:-0}"

CONFIG_DIR="${PGSYNC_CONFIG_DIR:-/config}"
LOG_DIR="${PGSYNC_LOG_DIR:-/logs}"
LOG_FILE="${LOG_DIR}/pgsync.log"

# Rotate log if over 5MB
if [[ -f "${LOG_FILE}" ]] && [[ "$(stat -f%z "${LOG_FILE}" 2>/dev/null || stat -c%s "${LOG_FILE}" 2>/dev/null || echo 0)" -gt 5242880 ]]; then
	mv "${LOG_FILE}" "${LOG_FILE}.1"
fi

# Tee all output to log file (stdout + stderr)
exec > >(tee -a "${LOG_FILE}") 2>&1

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

WATERMARK_DAYS="${PGSYNC_WATERMARK_DAYS:-7}"

run_full() {
	echo "[pgsync] Full sync (truncate+copy): pgsync $*" >&2
	pgsync "$@" --jobs 1
}

run_delta() {
	local table="$1"
	local col="$2"
	local where="WHERE \"${col}\" > now() - interval '${WATERMARK_DAYS} days'"
	echo "[pgsync] Delta sync: ${table} (${where})" >&2
	pgsync "$table" "${where}" --preserve --jobs 1
}

run_all() {
	# Phase 1: small reference tables — truncate+copy (cheap, handles updates)
	run_full small

	# Phase 2: large tables — preserve + rolling watermark
	# Only new rows within the window get copied; existing rows are skipped.
	run_delta track_logs at
	run_delta players updated_at

	# Phase 3: track_maps — bespoke row-by-row sync (blobs too large for pgsync bulk COPY)
	echo "[pgsync] Row-by-row sync: track_maps" >&2
	python3 /scripts/sync_track_maps.py
}

if [[ "${RUN_ONCE}" == "1" ]]; then
	run_all
	echo "[pgsync] Sync complete" >&2
	exit 0
fi

while true; do
	run_all
	echo "[pgsync] Sync complete" >&2
	sleep_for "${INTERVAL_SECONDS}"
done

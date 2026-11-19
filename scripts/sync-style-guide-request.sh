#!/usr/bin/env bash
# "Sync now" on the monitor dashboard's docs-writer card. The monitor cannot run host commands,
# so it writes styleguide-sync.request.json into the request directory. This script, run by cron
# every minute, renames it to styleguide-sync.running.json, runs sync-style-guide.sh as that
# request, and deletes the running file when the sync ends:
#   * * * * * /bin/bash <repo>/scripts/sync-style-guide-request.sh >> <repo>/.state/cron-style-guide.log 2>&1
#
# The request directory is STYLE_GUIDE_REQUEST_DIR from the repo's .env, else the directory of
# STYLE_GUIDE_STATUS_FILE (the sync writes its status next to the requests), else <repo>/.state.
#
# The sync keeps its sanity gate: a request forces a run, not the acceptance of a damaged upstream.
#
# Usage: sync-style-guide-request.sh [--repo-root <path>] [--env-file <path>] [-- <sync arguments>]
#
# Exit codes: 0 = nothing to do, or the sync ran (its own result is in the status file and log)
#             2 = missing/invalid configuration

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE=""
EXTRA=()

while [ $# -gt 0 ]; do
    case "$1" in
        --repo-root) REPO_ROOT="$2"; shift ;;
        --env-file) ENV_FILE="$2"; shift ;;
        --) shift; EXTRA=("$@"); break ;;
        *) echo "Unknown argument: $1" >&2; exit 2 ;;
    esac
    shift
done
[ -n "$ENV_FILE" ] || ENV_FILE="$REPO_ROOT/.env"

# Reads one KEY=value from the env file (last occurrence wins; surrounding quotes stripped).
get_env() {
    local key="$1" line val
    line="$(grep -E "^[[:space:]]*${key}[[:space:]]*=" "$ENV_FILE" 2>/dev/null | tail -n 1 || true)"
    if [ -z "$line" ]; then echo ""; return; fi
    val="${line#*=}"
    val="${val#"${val%%[![:space:]]*}"}"
    val="${val%"${val##*[![:space:]]}"}"
    val="${val%\"}"; val="${val#\"}"
    val="${val%\'}"; val="${val#\'}"
    echo "$val"
}

DIR="$(get_env STYLE_GUIDE_REQUEST_DIR)"
if [ -z "$DIR" ]; then
    STATUS_FILE="$(get_env STYLE_GUIDE_STATUS_FILE)"
    if [ -n "$STATUS_FILE" ]; then DIR="$(dirname "$STATUS_FILE")"; else DIR="$REPO_ROOT/.state"; fi
fi
if [ ! -d "$DIR" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') Config error: request directory does not exist: $DIR" >&2
    exit 2
fi

REQUEST="$DIR/styleguide-sync.request.json"
RUNNING="$DIR/styleguide-sync.running.json"

exec 9>"$DIR/.styleguide-sync.lock"
flock -n 9 || exit 0 # the previous request is still running

# Holding the lock means no request runs, so a leftover running file is from a VM that stopped
# mid-run: clear it so the dashboard does not show "running" forever.
rm -f "$RUNNING"
[ -f "$REQUEST" ] || exit 0

# Without the rename the request would stay and start a sync every minute.
if ! mv -T "$REQUEST" "$RUNNING"; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') Cannot rename $REQUEST to $RUNNING; no sync started." >&2
    exit 2
fi

# The "by" string of {"at":"...","by":"..."}; empty when it is null, missing, or the file is not JSON.
BY="$(tr -d '\n\r' < "$RUNNING" \
    | sed -n 's/.*"by"[[:space:]]*:[[:space:]]*"\(\([^"\\]\|\\.\)*\)".*/\1/p' \
    | sed 's/\\"/"/g; s/\\\\/\\/g')"

echo "$(date '+%Y-%m-%d %H:%M:%S') Dashboard request: $(tr -d '\n\r' < "$RUNNING")"

ARGS=(--repo-root "$REPO_ROOT" --env-file "$ENV_FILE" --trigger dashboard)
[ -n "$BY" ] && ARGS+=(--by "$BY")

bash "$SCRIPT_DIR/sync-style-guide.sh" "${ARGS[@]}" ${EXTRA[@]+"${EXTRA[@]}"}

rm -f "$RUNNING"
exit 0

#!/usr/bin/env bash
# Syncs .claude/skills/docs-writer/references/style-guide.md from its upstream GitHub repo.
#
# Daily flow (cron): fetch upstream -> compare -> overwrite -> git commit + push (main)
# -> docker compose build + up -d of the docs-writer service (STYLE_GUIDE_COMPOSE_SERVICE). The local file is a verbatim copy of upstream by design
# (local deltas live in style-guide-supplement.md).
#
# Config comes from the repo's .env (STYLE_GUIDE_* keys, see .env.example). See scripts/README.md
# for the cron entry, exit codes, and testing.
#
# Usage: sync-style-guide.sh [--dry-run] [--skip-docker] [--repo-root <path>] [--env-file <path>]
#                            [--upstream-file <path>] [--trigger cron|dashboard|manual] [--by <who>]
#
# Every run (except --dry-run) writes a status file the monitor dashboard reads: see write_status.
# --trigger and --by say what started the run; they only end up in that file.
# --upstream-file uses a local file as the fetched upstream (no network, no token). For tests.
#
# Exit codes:
#   0 = up to date / synced successfully
#   1 = unexpected error
#   2 = missing/invalid configuration
#   3 = upstream fetch failed
#   4 = git preflight or pull failed (needs a human: wrong branch, dirty target file, diverged clone)
#   5 = git commit/push failed (unpushed commit is retried on the next run)
#   6 = docker build/up failed (retried on the next run via the pending-rebuild flag)
#   7 = upstream rejected by the sanity gate (damaged or truncated file; nothing is changed,
#       retried on the next run)

set -u

DRY_RUN=0
SKIP_DOCKER=0
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE=""
UPSTREAM_FILE=""
TRIGGER="manual"
BY=""

while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run) DRY_RUN=1 ;;
        --skip-docker) SKIP_DOCKER=1 ;;
        --repo-root) REPO_ROOT="$2"; shift ;;
        --env-file) ENV_FILE="$2"; shift ;;
        --upstream-file) UPSTREAM_FILE="$2"; shift ;;
        --trigger) TRIGGER="$2"; shift ;;
        --by) BY="$2"; shift ;;
        *) echo "Unknown argument: $1" >&2; exit 2 ;;
    esac
    shift
done
[ -n "$ENV_FILE" ] || ENV_FILE="$REPO_ROOT/.env"
case "$TRIGGER" in
    cron|dashboard|manual) ;;
    *) echo "Unknown --trigger: $TRIGGER (expected cron, dashboard or manual)" >&2; exit 2 ;;
esac

TARGET_REL='.claude/skills/docs-writer/references/style-guide.md'
TARGET_ABS="$REPO_ROOT/$TARGET_REL"
COMMIT_MARKER='chore: sync style guide'
STATE_DIR="$REPO_ROOT/.state"
LOG_FILE="$STATE_DIR/style-guide-sync.log"
FLAG_FILE="$STATE_DIR/style-guide-rebuild-pending"
# Overridden by STYLE_GUIDE_STATUS_FILE once the env file is read
STATUS_FILE="$STATE_DIR/style-guide-sync.status.json"
# true = local file equals upstream and is pushed; false = it is not; null = upstream never compared
IN_SYNC=null
UPSTREAM_COMMIT=""
UPSTREAM_COMMIT_AT=""

# Never hang on an interactive credential prompt under cron; fail fast (exit 5) instead.
export GIT_TERMINAL_PROMPT=0

log() {
    local line
    line="$(date '+%Y-%m-%d %H:%M:%S') $*"
    echo "$line"
    echo "$line" >> "$LOG_FILE"
}

trim_log() {
    if [ -f "$LOG_FILE" ] && [ "$(wc -c < "$LOG_FILE")" -gt 1048576 ]; then
        tail -n 500 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
    fi
}

git_r() {
    git -C "$REPO_ROOT" "$@"
}

# Reads one KEY=value from the env file (last occurrence wins; surrounding quotes stripped).
get_env() {
    local key="$1" line val
    line="$(grep -E "^[[:space:]]*${key}[[:space:]]*=" "$ENV_FILE" | tail -n 1 || true)"
    if [ -z "$line" ]; then echo ""; return; fi
    val="${line#*=}"
    val="${val#"${val%%[![:space:]]*}"}"
    val="${val%"${val##*[![:space:]]}"}"
    val="${val%\"}"; val="${val#\"}"
    val="${val%\'}"; val="${val#\'}"
    echo "$val"
}

# Strip a UTF-8 BOM and CR characters so CRLF/LF and BOM differences never register as changes.
normalized() {
    sed '1s/^\xEF\xBB\xBF//' "$1" | tr -d '\r'
}

# Escapes a value for use inside a JSON string. Control characters (git output can carry them)
# become spaces, and the value is cut to 500 bytes: it is a line on a dashboard card.
json_escape() {
    printf '%s' "$1" | tr '\001-\037\177' ' ' | cut -c 1-500 | sed 's/\\/\\\\/g; s/"/\\"/g'
}

# Writes the status file the dashboard reads. Never fails the run: a missing or unwritable
# directory is logged and ignored. The directory is not created (on the VM it is a shared one).
#   $1 = exit code, $2 = synced | up-to-date | rejected | failed, $3 = reason (may be empty)
write_status() {
    local code="$1" result="$2" reason="$3" now last="" body dir tmp=""
    [ "$DRY_RUN" = 1 ] && return 0
    now="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    if [ "$result" = synced ]; then
        last="$now"
    elif [ -f "$STATUS_FILE" ]; then
        last="$(grep -o '"lastSyncedAt"[[:space:]]*:[[:space:]]*"[0-9TZ:.+-]*"' "$STATUS_FILE" 2>/dev/null | head -n 1 | sed 's/.*"\([^"]*\)"$/\1/')"
    fi

    body="{\"at\":\"$now\",\"result\":\"$result\",\"exitCode\":$code"
    if [ -n "$reason" ]; then body="$body,\"reason\":\"$(json_escape "$reason")\""; else body="$body,\"reason\":null"; fi
    body="$body,\"inSync\":$IN_SYNC"
    [ -n "$UPSTREAM_COMMIT" ] && body="$body,\"upstreamCommit\":\"$UPSTREAM_COMMIT\""
    [ -n "$UPSTREAM_COMMIT_AT" ] && body="$body,\"upstreamCommitAt\":\"$UPSTREAM_COMMIT_AT\""
    [ -n "$last" ] && body="$body,\"lastSyncedAt\":\"$last\""
    body="$body,\"trigger\":\"$TRIGGER\""
    [ -n "$BY" ] && body="$body,\"by\":\"$(json_escape "$BY")\""
    body="$body}"

    # Temp file + rename, so the dashboard never reads half a file. mktemp makes it 0600;
    # the monitor container reads it as another user.
    dir="$(dirname "$STATUS_FILE")"
    if ! { tmp="$(mktemp "$dir/.style-guide-status.XXXXXX" 2>/dev/null)" \
            && printf '%s\n' "$body" > "$tmp" && chmod 644 "$tmp" && mv -f "$tmp" "$STATUS_FILE"; }; then
        [ -n "$tmp" ] && rm -f "$tmp"
        log "Warning: could not write status to $STATUS_FILE"
    fi
    return 0
}

# Logs a message, writes the status file and exits. Every exit after argument parsing goes here.
#   $1 = exit code, $2 = result, $3 = message (logged; also the status reason unless the run succeeded)
finish() {
    local code="$1" result="$2" message="${3:-}" reason=""
    [ -n "$message" ] && log "$message"
    [ "$code" != 0 ] && reason="$message"
    write_status "$code" "$result" "$reason"
    exit "$code"
}

# Looks up the newest upstream commit that touched the file, for the status file. Best effort.
fetch_upstream_commit() {
    local json
    json="$(curl -sS --max-time 20 \
        -H "Authorization: Bearer $TOKEN" \
        -H 'Accept: application/vnd.github+json' \
        -H 'User-Agent: docsWriter-style-guide-sync' \
        -H 'X-GitHub-Api-Version: 2022-11-28' \
        "https://api.github.com/repos/$OWNER/$REPO/commits?path=$FILE_PATH&sha=$BRANCH&per_page=1" 2>/dev/null)" || return 0
    UPSTREAM_COMMIT="$(printf '%s' "$json" | grep -o '"sha"[[:space:]]*:[[:space:]]*"[0-9a-f]\{40\}"' | head -n 1 | grep -o '[0-9a-f]\{40\}' | cut -c 1-7)"
    UPSTREAM_COMMIT_AT="$(printf '%s' "$json" | grep -o '"date"[[:space:]]*:[[:space:]]*"[0-9TZ:.+-]*"' | head -n 1 | sed 's/.*"\([^"]*\)"$/\1/')"
    [ -n "$UPSTREAM_COMMIT" ] && log "Upstream commit: $UPSTREAM_COMMIT ($UPSTREAM_COMMIT_AT)"
    return 0
}

# Sanity gate: upstream is generated, and the generator sometimes emits a damaged or truncated
# file. Prints the reason and returns 1 when the (normalized) upstream file must not be synced.
#   $1 = normalized upstream file, $2 = local style guide (may not exist)
gate_reason() {
    local up="$1" local_file="$2" first toc n last up_lines local_lines

    first="$(grep -m 1 -v '^[[:space:]]*$' "$up" || true)"
    case "$first" in
        '# '*) ;;
        *) echo "first line is not a level-1 heading"; return 1 ;;
    esac

    # Every numbered entry of the file's own table of contents must have its "## N." heading.
    # Entries may be "1. [Title]" or "- [1. Title]". Prints the numbers, or one word when there
    # is nothing to check: NONE (no table of contents), EMPTY (heading only), UNNUMBERED.
    toc="$(awk '
        tolower($0) ~ /^## table of contents[ \t]*$/ { t = 1; seen = 1; next }
        t && (/^## / || /^---/) { t = 0 }
        t && /[^ \t]/ {
            entries++
            if (match($0, /^[-*+ \t]*\[?[0-9]+\./)) {
                s = substr($0, RSTART, RLENGTH); gsub(/[^0-9]/, "", s); print s; numbered++
            }
        }
        END {
            if (!seen) print "NONE"
            else if (!entries) print "EMPTY"
            else if (!numbered) print "UNNUMBERED"
        }
    ' "$up")"
    case "$toc" in
        NONE) log "Upstream has no table of contents; section check skipped." >&2 ;;
        UNNUMBERED) log "Upstream table of contents has no numbered entries; section check skipped." >&2 ;;
        EMPTY) echo "table of contents is empty (file is truncated)"; return 1 ;;
        *)
            for n in $toc; do
                if ! grep -q "^## ${n}\. " "$up"; then
                    echo "section $n is missing (file is truncated)"
                    return 1
                fi
            done
            ;;
    esac

    # CommonMark fences: a fence opens on a line of 3+ backticks or tildes (indented at most 3
    # spaces, info string allowed) and closes only on a line of the same character alone that is
    # at least as long. Everything else inside is content: shorter fences, the other character.
    if ! awk '
        {
            sp = 0; while (substr($0, sp + 1, 1) == " ") sp++
            if (sp > 3) next
            body = substr($0, sp + 1); c = substr(body, 1, 1)
            if (c != "`" && c != "~") next
            n = 0; while (substr(body, n + 1, 1) == c) n++
            if (n < 3) next
            rest = substr(body, n + 1)
            if (!fence) { if (c == "~" || index(rest, "`") == 0) { fence = n; fc = c } }
            else if (c == fc && n >= fence && rest ~ /^[ \t]*$/) fence = 0
        }
        END { exit fence ? 1 : 0 }
    ' "$up"; then
        echo "ends inside an open code fence"
        return 1
    fi

    # How the file ends. The table of contents cannot see a cut inside the last section, so catch
    # the two endings a cut-off file shows that a finished one does not: half a table row, and a
    # heading with nothing under it. A cut in the middle of a sentence there is not detectable
    # (a healthy upstream file has no trailing newline either, so that is no signal).
    last="$(grep -v '^[[:space:]]*$' "$up" | tail -n 1)"
    last="${last%"${last##*[![:space:]]}"}"
    case "$last" in
        '|'*)
            case "$last" in
                '|'*'|') ;;
                *) echo "ends in the middle of a table row"; return 1 ;;
            esac
            ;;
        '#'*) echo "ends with a heading"; return 1 ;;
    esac

    if [ -f "$local_file" ]; then
        up_lines="$(wc -l < "$up" | tr -d ' ')"
        local_lines="$(normalized "$local_file" | wc -l | tr -d ' ')"
        if [ $((up_lines * 100)) -lt $((local_lines * 60)) ]; then
            echo "upstream has $up_lines lines, local has $local_lines (under 60%)"
            return 1
        fi
    fi
    return 0
}

# Runs docker compose build + up -d, for STYLE_GUIDE_COMPOSE_SERVICE only when it is set.
# Returns non-zero on failure (flag file left in place).
docker_rebuild() {
    local step out
    touch "$FLAG_FILE"
    if [ -z "$COMPOSE_SERVICE" ]; then
        log "STYLE_GUIDE_COMPOSE_SERVICE is not set: rebuilding and restarting every service of the compose project."
    fi
    for step in build "up -d"; do
        log "Running: docker compose $step${COMPOSE_SERVICE:+ $COMPOSE_SERVICE} in $COMPOSE_WORKDIR"
        # shellcheck disable=SC2086
        if ! out="$(cd "$COMPOSE_WORKDIR" && docker compose ${COMPOSE_FILE_ARG} $step $COMPOSE_SERVICE 2>&1)"; then
            log "docker compose $step failed. Last output:"
            printf '%s\n' "$out" | tail -n 15 | while IFS= read -r l; do log "  $l"; done
            return 1
        fi
    done
    rm -f "$FLAG_FILE"
    log "Docker rebuild complete; container is running the new style guide."
    return 0
}

# Recovers from earlier partial failures: an unpushed sync commit (push failed) and/or
# a pushed-but-not-rebuilt container (docker failed, flag file present).
self_heal() {
    local need_docker=0 unpushed head_subject out
    [ -f "$FLAG_FILE" ] && need_docker=1

    unpushed="$(git_r log origin/main..main --oneline 2>/dev/null || true)"
    head_subject="$(git_r log -1 --pretty=%s 2>/dev/null || true)"
    if [ -n "$unpushed" ] && [ "${head_subject#"$COMMIT_MARKER"}" != "$head_subject" ]; then
        if [ "$DRY_RUN" = 1 ]; then
            log "DryRun: an unpushed sync commit exists (push would be retried)."
        else
            log "Unpushed sync commit found from a previous run; retrying push."
            if ! out="$(git_r push origin main 2>&1)"; then
                IN_SYNC=false
                finish 5 failed "git push retry failed: $out"
            fi
            log "Push retry succeeded."
            need_docker=1
        fi
    fi

    if [ "$need_docker" = 1 ]; then
        if [ "$DRY_RUN" = 1 ] || [ "$SKIP_DOCKER" = 1 ]; then
            log "A docker rebuild is pending (skipped: dry-run/skip-docker)."
        else
            docker_rebuild || finish 6 failed "docker rebuild failed (see the log); it is retried on the next run."
        fi
    fi
}

mkdir -p "$STATE_DIR"
trim_log

# One sync at a time: the cron runs and a dashboard request can start in the same minute, and two
# runs in one clone fail each other's git pull. The later run steps aside; the running one reports.
if command -v flock >/dev/null 2>&1; then
    exec 8>"$STATE_DIR/style-guide-sync.lock"
    if ! flock -n 8; then
        log "Another style-guide sync is running; this run is skipped."
        exit 0
    fi
fi

# --- Config -------------------------------------------------------------------
if [ ! -f "$ENV_FILE" ]; then
    finish 2 failed "Config error: env file not found at $ENV_FILE"
fi
STATUS_OVERRIDE="$(get_env STYLE_GUIDE_STATUS_FILE)"
[ -n "$STATUS_OVERRIDE" ] && STATUS_FILE="$STATUS_OVERRIDE"
TOKEN="$(get_env STYLE_GUIDE_GITHUB_TOKEN)"
OWNER="$(get_env STYLE_GUIDE_REPO_OWNER)";   OWNER="${OWNER:-Continia}"
REPO="$(get_env STYLE_GUIDE_REPO_NAME)";     REPO="${REPO:-Continia-agent-friendly-style-guidelines}"
FILE_PATH="$(get_env STYLE_GUIDE_FILE_PATH)"; FILE_PATH="${FILE_PATH:-docsguidelines/llmfriendly/style-guide.md}"
BRANCH="$(get_env STYLE_GUIDE_BRANCH)";      BRANCH="${BRANCH:-main}"
COMPOSE_PATH="$(get_env STYLE_GUIDE_COMPOSE_DIR)"
COMPOSE_SERVICE="$(get_env STYLE_GUIDE_COMPOSE_SERVICE)"

if [ -z "$TOKEN" ] && [ -z "$UPSTREAM_FILE" ]; then
    finish 2 failed "Config error: STYLE_GUIDE_GITHUB_TOKEN is not set in $ENV_FILE"
fi
COMPOSE_WORKDIR=""
COMPOSE_FILE_ARG=""
# The name goes on a command line unquoted, so it must be a plain compose service name.
case "$COMPOSE_SERVICE" in
    *[!A-Za-z0-9_.-]*|[!A-Za-z0-9]*)
        finish 2 failed "Config error: STYLE_GUIDE_COMPOSE_SERVICE is not a compose service name: $COMPOSE_SERVICE"
        ;;
esac
if [ "$SKIP_DOCKER" = 0 ] && [ "$DRY_RUN" = 0 ]; then
    if [ -z "$COMPOSE_PATH" ]; then
        finish 2 failed "Config error: STYLE_GUIDE_COMPOSE_DIR is not set in $ENV_FILE (or use --skip-docker)"
    elif [ -f "$COMPOSE_PATH" ]; then
        # A compose file path was given; run compose against that file from its directory
        COMPOSE_WORKDIR="$(dirname "$COMPOSE_PATH")"
        COMPOSE_FILE_ARG="-f $COMPOSE_PATH"
    elif [ -d "$COMPOSE_PATH" ]; then
        COMPOSE_WORKDIR="$COMPOSE_PATH"
    else
        finish 2 failed "Config error: STYLE_GUIDE_COMPOSE_DIR does not exist: $COMPOSE_PATH"
    fi
fi

# --- Git preflight --------------------------------------------------------------
if ! branch="$(git_r rev-parse --abbrev-ref HEAD 2>&1)"; then
    finish 4 failed "Git preflight failed: $branch"
fi
if [ "$branch" != "main" ]; then
    finish 4 failed "Git preflight failed: clone is on branch '$branch', expected 'main'."
fi
if [ -n "$(git_r status --porcelain -- "$TARGET_REL")" ]; then
    finish 4 failed "Git preflight failed: $TARGET_REL has uncommitted local changes; refusing to overwrite. Commit or discard them first."
fi

# --- Fetch upstream ---------------------------------------------------------------
TMP_FILE="$(mktemp)"
NORM_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE" "$NORM_FILE"' EXIT
URL="https://api.github.com/repos/$OWNER/$REPO/contents/$FILE_PATH?ref=$BRANCH"
if [ -n "$UPSTREAM_FILE" ]; then
    if ! cp "$UPSTREAM_FILE" "$TMP_FILE"; then
        finish 3 failed "Fetch failed: cannot read --upstream-file $UPSTREAM_FILE"
    fi
    HTTP_CODE=200
elif ! HTTP_CODE="$(curl -sS --max-time 60 -o "$TMP_FILE" -w '%{http_code}' \
        -H "Authorization: Bearer $TOKEN" \
        -H 'Accept: application/vnd.github.raw+json' \
        -H 'User-Agent: docsWriter-style-guide-sync' \
        -H 'X-GitHub-Api-Version: 2022-11-28' \
        "$URL" 2>&1)"; then
    finish 3 failed "Fetch failed for $OWNER/$REPO/$FILE_PATH@$BRANCH: $HTTP_CODE"
fi
if [ "$HTTP_CODE" != "200" ]; then
    finish 3 failed "Fetch failed for $OWNER/$REPO/$FILE_PATH@$BRANCH (HTTP $HTTP_CODE). Note: 404 can mean a wrong path/branch OR a token without access to the repo."
fi
[ -n "$UPSTREAM_FILE" ] || fetch_upstream_commit

# --- Compare (cheap check; git decides authoritatively later) ------------------------
# Before the sanity gate: a local file that already equals upstream needs no judging. That is
# also the way out when the gate wrongly refuses a healthy guide: copy it in by hand and commit.
normalized "$TMP_FILE" > "$NORM_FILE"
if [ -f "$TARGET_ABS" ] && cmp -s "$NORM_FILE" <(normalized "$TARGET_ABS"); then
    log "Style guide is up to date with $OWNER/$REPO@$BRANCH."
    IN_SYNC=true
    self_heal
    finish 0 up-to-date
fi
IN_SYNC=false

# --- Sanity gate ------------------------------------------------------------------
if ! REJECT_REASON="$(gate_reason "$NORM_FILE" "$TARGET_ABS")"; then
    log "Upstream rejected: $REJECT_REASON"
    write_status 7 rejected "$REJECT_REASON"
    exit 7
fi

UPSTREAM_LINES="$(normalized "$TMP_FILE" | wc -l | tr -d ' ')"
LOCAL_LINES=0
[ -f "$TARGET_ABS" ] && LOCAL_LINES="$(normalized "$TARGET_ABS" | wc -l | tr -d ' ')"
log "Style guide differs from upstream (local $LOCAL_LINES lines, upstream $UPSTREAM_LINES lines)."

if [ "$DRY_RUN" = 1 ]; then
    log "DryRun: would overwrite, commit, push, and rebuild. No changes made."
    self_heal
    finish 0 up-to-date
fi

# --- Update: pull first, then write ---------------------------------------------------
if ! out="$(git_r pull --ff-only 2>&1)"; then
    finish 4 failed "git pull --ff-only failed; clone needs attention: $out"
fi

# Write LF, no BOM - matches how a Linux clone checks the file out
mkdir -p "$(dirname "$TARGET_ABS")"
normalized "$TMP_FILE" > "$TARGET_ABS"

# Authoritative gate: git's own normalization decides whether a commit is needed
# (empty here means the pull already delivered the change, or the diff was EOL/BOM-only)
if [ -z "$(git_r status --porcelain -- "$TARGET_REL")" ]; then
    log "File written but git sees no change (pull already delivered it, or EOL-only difference). Nothing to commit."
    IN_SYNC=true
    self_heal
    finish 0 up-to-date
fi

# --- Commit + push (pathspec-scoped so unrelated changes are never swept in) ----------
if ! out="$(git_r add -- "$TARGET_REL" 2>&1)"; then
    finish 5 failed "git add failed: $out"
fi
COMMIT_MESSAGE="$COMMIT_MARKER from upstream ($(date '+%Y-%m-%d'))"
if ! out="$(git_r commit -m "$COMMIT_MESSAGE" -- "$TARGET_REL" 2>&1)"; then
    finish 5 failed "git commit failed: $out"
fi
log "Committed: $COMMIT_MESSAGE"
if ! out="$(git_r push origin main 2>&1)"; then
    finish 5 failed "git push failed (commit kept locally; push is retried on the next run): $out"
fi
log "Pushed to origin/main."
IN_SYNC=true

# --- Docker rebuild ---------------------------------------------------------------------
if [ "$SKIP_DOCKER" = 1 ]; then
    log "SkipDocker: container not rebuilt; a rebuild-pending flag is set so the next full run does it."
    touch "$FLAG_FILE"
    finish 0 synced
fi
if ! docker_rebuild; then
    finish 6 failed "Docker failed; the rebuild-pending flag stays and is retried on the next run."
fi

finish 0 synced "Sync complete."

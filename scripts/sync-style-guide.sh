#!/usr/bin/env bash
# Syncs .claude/skills/docs-writer/references/style-guide.md from its upstream GitHub repo.
#
# Daily flow (cron): fetch upstream -> compare -> overwrite -> git commit + push (main)
# -> docker compose build + up -d. The local file is a verbatim copy of upstream by design
# (local deltas live in style-guide-supplement.md).
#
# Config comes from the repo's .env (STYLE_GUIDE_* keys, see .env.example). See scripts/README.md
# for the cron entry, exit codes, and testing.
#
# Usage: sync-style-guide.sh [--dry-run] [--skip-docker] [--repo-root <path>] [--env-file <path>]
#
# Exit codes:
#   0 = up to date / synced successfully
#   1 = unexpected error
#   2 = missing/invalid configuration
#   3 = upstream fetch failed
#   4 = git preflight or pull failed (needs a human: wrong branch, dirty target file, diverged clone)
#   5 = git commit/push failed (unpushed commit is retried on the next run)
#   6 = docker build/up failed (retried on the next run via the pending-rebuild flag)

set -u

DRY_RUN=0
SKIP_DOCKER=0
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE=""

while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run) DRY_RUN=1 ;;
        --skip-docker) SKIP_DOCKER=1 ;;
        --repo-root) REPO_ROOT="$2"; shift ;;
        --env-file) ENV_FILE="$2"; shift ;;
        *) echo "Unknown argument: $1" >&2; exit 2 ;;
    esac
    shift
done
[ -n "$ENV_FILE" ] || ENV_FILE="$REPO_ROOT/.env"

TARGET_REL='.claude/skills/docs-writer/references/style-guide.md'
TARGET_ABS="$REPO_ROOT/$TARGET_REL"
COMMIT_MARKER='chore: sync style guide'
STATE_DIR="$REPO_ROOT/.state"
LOG_FILE="$STATE_DIR/style-guide-sync.log"
FLAG_FILE="$STATE_DIR/style-guide-rebuild-pending"

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

# Runs docker compose build + up -d. Returns non-zero on failure (flag file left in place).
docker_rebuild() {
    local step out
    touch "$FLAG_FILE"
    for step in build "up -d"; do
        log "Running: docker compose $step in $COMPOSE_WORKDIR"
        # shellcheck disable=SC2086
        if ! out="$(cd "$COMPOSE_WORKDIR" && docker compose ${COMPOSE_FILE_ARG} $step 2>&1)"; then
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
                log "Push retry failed: $out"
                exit 5
            fi
            log "Push retry succeeded."
            need_docker=1
        fi
    fi

    if [ "$need_docker" = 1 ]; then
        if [ "$DRY_RUN" = 1 ] || [ "$SKIP_DOCKER" = 1 ]; then
            log "A docker rebuild is pending (skipped: dry-run/skip-docker)."
        else
            docker_rebuild || exit 6
        fi
    fi
}

mkdir -p "$STATE_DIR"
trim_log

# --- Config -------------------------------------------------------------------
if [ ! -f "$ENV_FILE" ]; then
    log "Config error: env file not found at $ENV_FILE"
    exit 2
fi
TOKEN="$(get_env STYLE_GUIDE_GITHUB_TOKEN)"
OWNER="$(get_env STYLE_GUIDE_REPO_OWNER)";   OWNER="${OWNER:-Continia}"
REPO="$(get_env STYLE_GUIDE_REPO_NAME)";     REPO="${REPO:-Continia-agent-friendly-style-guidelines}"
FILE_PATH="$(get_env STYLE_GUIDE_FILE_PATH)"; FILE_PATH="${FILE_PATH:-docsguidelines/llmfriendly/style-guide.md}"
BRANCH="$(get_env STYLE_GUIDE_BRANCH)";      BRANCH="${BRANCH:-main}"
COMPOSE_PATH="$(get_env STYLE_GUIDE_COMPOSE_DIR)"

if [ -z "$TOKEN" ]; then
    log "Config error: STYLE_GUIDE_GITHUB_TOKEN is not set in $ENV_FILE"
    exit 2
fi
COMPOSE_WORKDIR=""
COMPOSE_FILE_ARG=""
if [ "$SKIP_DOCKER" = 0 ] && [ "$DRY_RUN" = 0 ]; then
    if [ -z "$COMPOSE_PATH" ]; then
        log "Config error: STYLE_GUIDE_COMPOSE_DIR is not set in $ENV_FILE (or use --skip-docker)"
        exit 2
    elif [ -f "$COMPOSE_PATH" ]; then
        # A compose file path was given; run compose against that file from its directory
        COMPOSE_WORKDIR="$(dirname "$COMPOSE_PATH")"
        COMPOSE_FILE_ARG="-f $COMPOSE_PATH"
    elif [ -d "$COMPOSE_PATH" ]; then
        COMPOSE_WORKDIR="$COMPOSE_PATH"
    else
        log "Config error: STYLE_GUIDE_COMPOSE_DIR does not exist: $COMPOSE_PATH"
        exit 2
    fi
fi

# --- Git preflight --------------------------------------------------------------
if ! branch="$(git_r rev-parse --abbrev-ref HEAD 2>&1)"; then
    log "Git preflight failed: $branch"
    exit 4
fi
if [ "$branch" != "main" ]; then
    log "Git preflight failed: clone is on branch '$branch', expected 'main'."
    exit 4
fi
if [ -n "$(git_r status --porcelain -- "$TARGET_REL")" ]; then
    log "Git preflight failed: $TARGET_REL has uncommitted local changes; refusing to overwrite. Commit or discard them first."
    exit 4
fi

# --- Fetch upstream ---------------------------------------------------------------
TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT
URL="https://api.github.com/repos/$OWNER/$REPO/contents/$FILE_PATH?ref=$BRANCH"
if ! HTTP_CODE="$(curl -sS -o "$TMP_FILE" -w '%{http_code}' \
        -H "Authorization: Bearer $TOKEN" \
        -H 'Accept: application/vnd.github.raw+json' \
        -H 'User-Agent: docsWriter-style-guide-sync' \
        -H 'X-GitHub-Api-Version: 2022-11-28' \
        "$URL" 2>&1)"; then
    log "Fetch failed for $OWNER/$REPO/$FILE_PATH@$BRANCH: $HTTP_CODE"
    exit 3
fi
if [ "$HTTP_CODE" != "200" ]; then
    log "Fetch failed for $OWNER/$REPO/$FILE_PATH@$BRANCH (HTTP $HTTP_CODE). Note: 404 can mean a wrong path/branch OR a token without access to the repo."
    exit 3
fi

# --- Compare (cheap gate; git decides authoritatively later) ------------------------
if [ -f "$TARGET_ABS" ] && cmp -s <(normalized "$TMP_FILE") <(normalized "$TARGET_ABS"); then
    log "Style guide is up to date with $OWNER/$REPO@$BRANCH."
    self_heal
    exit 0
fi

UPSTREAM_LINES="$(normalized "$TMP_FILE" | wc -l | tr -d ' ')"
LOCAL_LINES=0
[ -f "$TARGET_ABS" ] && LOCAL_LINES="$(normalized "$TARGET_ABS" | wc -l | tr -d ' ')"
log "Style guide differs from upstream (local $LOCAL_LINES lines, upstream $UPSTREAM_LINES lines)."

if [ "$DRY_RUN" = 1 ]; then
    log "DryRun: would overwrite, commit, push, and rebuild. No changes made."
    self_heal
    exit 0
fi

# --- Update: pull first, then write ---------------------------------------------------
if ! out="$(git_r pull --ff-only 2>&1)"; then
    log "git pull --ff-only failed; clone needs attention: $out"
    exit 4
fi

# Write LF, no BOM - matches how a Linux clone checks the file out
normalized "$TMP_FILE" > "$TARGET_ABS"

# Authoritative gate: git's own normalization decides whether a commit is needed
# (empty here means the pull already delivered the change, or the diff was EOL/BOM-only)
if [ -z "$(git_r status --porcelain -- "$TARGET_REL")" ]; then
    log "File written but git sees no change (pull already delivered it, or EOL-only difference). Nothing to commit."
    self_heal
    exit 0
fi

# --- Commit + push (pathspec-scoped so unrelated changes are never swept in) ----------
if ! out="$(git_r add -- "$TARGET_REL" 2>&1)"; then
    log "git add failed: $out"
    exit 5
fi
COMMIT_MESSAGE="$COMMIT_MARKER from upstream ($(date '+%Y-%m-%d'))"
if ! out="$(git_r commit -m "$COMMIT_MESSAGE" -- "$TARGET_REL" 2>&1)"; then
    log "git commit failed: $out"
    exit 5
fi
log "Committed: $COMMIT_MESSAGE"
if ! out="$(git_r push origin main 2>&1)"; then
    log "git push failed (commit kept locally; push is retried on the next run): $out"
    exit 5
fi
log "Pushed to origin/main."

# --- Docker rebuild ---------------------------------------------------------------------
if [ "$SKIP_DOCKER" = 1 ]; then
    log "SkipDocker: container not rebuilt; a rebuild-pending flag is set so the next full run does it."
    touch "$FLAG_FILE"
    exit 0
fi
if ! docker_rebuild; then
    log "Docker failed; the rebuild-pending flag stays and is retried on the next run."
    exit 6
fi

log "Sync complete."
exit 0

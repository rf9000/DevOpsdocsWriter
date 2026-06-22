#!/bin/sh
set -e

# Claude Code refuses to authenticate (the API returns 401) and rejects
# --dangerously-skip-permissions when the agent runs as root. The watcher must
# therefore run as the non-root 'bun' user. We still start as root so we can
# fix the ownership of mounted/named volumes (Docker creates them root-owned),
# then drop privileges.
if [ "$(id -u)" = "0" ]; then
  # State/output are named volumes; /home/claude is the agent's HOME where
  # Claude Code writes ~/.claude.json and refreshed tokens. The bind-mounted
  # ~/.claude already arrives owned by the host user (uid 1000 == bun), so we
  # deliberately do NOT recurse into it.
  chown bun:bun /home/claude 2>/dev/null || true
  chown -R bun:bun /app/.state /app/.output 2>/dev/null || true
  exec su -s /bin/sh bun -c 'export HOME=/home/claude && cd /app && exec bun run src/cli/index.ts watch'
fi

# Already non-root (e.g. the container was started with --user): run directly.
export HOME=/home/claude
exec bun run src/cli/index.ts watch

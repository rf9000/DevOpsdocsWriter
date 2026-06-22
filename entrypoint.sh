#!/bin/sh
set -e

# Claude Code refuses to authenticate (the API returns 401) and rejects
# --dangerously-skip-permissions when the agent runs as root. The watcher must
# therefore run as the non-root 'bun' user. We still start as root so we can
# fix the ownership of mounted/named volumes (Docker creates them root-owned),
# then drop privileges.
if [ "$(id -u)" = "0" ]; then
  # State/output are named volumes; /home/claude is the agent's HOME where
  # Claude Code writes ~/.claude.json and refreshed tokens. We recurse into the
  # bind-mounted ~/.claude too: all the agent services run as uid 1000, so we
  # normalise the shared credential file to 1000 here. This also REPAIRS a file
  # that an earlier root run may have rewritten as root:root (mode 600) — which
  # otherwise locks every non-root service out of the shared credentials.
  chown -R bun:bun /home/claude 2>/dev/null || true
  chown -R bun:bun /app/.state /app/.output 2>/dev/null || true
  exec su -s /bin/sh bun -c 'export HOME=/home/claude && cd /app && exec bun run src/cli/index.ts watch'
fi

# Already non-root (e.g. the container was started with --user): run directly.
export HOME=/home/claude
exec bun run src/cli/index.ts watch

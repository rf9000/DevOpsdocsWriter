#!/bin/sh
set -e

# Seed ~/.claude.json before anything starts an agent.
#
# Claude Code refuses to run when its config file is missing *while* backups
# exist in ~/.claude/backups: rather than initialise a fresh config over what
# looks like a lost one, it exits 1 with "Claude configuration file not found".
#
# Here that combination is the NORMAL state after every rebuild. ~/.claude.json
# lives in the container's writable layer and is wiped on each recreate, but
# ~/.claude is a bind mount of the host home shared with the other agent
# containers — so their backups always outlive our config. Left alone, the
# first agent invocation after every `compose up --build` (the daily
# style-guide sync included) fails, and only self-heals because the dying CLI
# writes a config on its way out.
#
# An empty object is enough to keep the guard quiet; Claude Code fills in the
# rest on first start. Runs before the privilege drop below, so the chown that
# follows normalises ownership to 'bun'.
if [ ! -f /home/claude/.claude.json ]; then
  echo '{}' > /home/claude/.claude.json
  chmod 600 /home/claude/.claude.json
  echo "entrypoint: seeded empty /home/claude/.claude.json"
fi

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

  # The skill linker writes junctions into each source repo's .claude/skills,
  # so 'bun' needs group write there. The host grants that through the repo's
  # group (e.g. 'repoagents', gid 1001), which the container knows nothing
  # about. compose `group_add` does not help: `su` below calls initgroups(),
  # which rebuilds the supplementary groups from /etc/group and drops Docker's.
  # So mirror each mounted repo's group into /etc/group and add 'bun' to it.
  # Read at start-up rather than baked in, so a host-side regroup needs only a
  # restart. Root's group is never granted.
  for repo in /repos/*/; do
    [ -d "$repo" ] || continue
    gid=$(stat -c %g "$repo") || continue
    [ "$gid" = "0" ] && continue
    group=$(getent group "$gid" | cut -d: -f1)
    if [ -z "$group" ]; then
      group="host$gid"
      groupadd -g "$gid" "$group" || continue
    fi
    usermod -aG "$group" bun || true
  done

  exec su -s /bin/sh bun -c 'export HOME=/home/claude && cd /app && exec bun run src/cli/index.ts watch'
fi

# Already non-root (e.g. the container was started with --user): run directly.
export HOME=/home/claude
exec bun run src/cli/index.ts watch

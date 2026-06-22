# docsWriter — Bun watcher that drives the Claude Agent SDK over the AL repo.
FROM oven/bun:1-debian

# Tools the Claude agent's Bash/Grep/git operations rely on at runtime.
# (ripgrep ships inside the Agent SDK CLI; git + bash + certs do not.)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        bash \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# The Agent SDK reads ~/.claude for auth + settings; the compose file mounts
# the host's .claude to /home/claude/.claude, so HOME must point there. The
# watcher runs as the non-root 'bun' user — Claude Code refuses to authenticate
# (401) and rejects --dangerously-skip-permissions when run as root — so 'bun'
# must own this home to write ~/.claude.json and refreshed OAuth tokens.
ENV HOME=/home/claude
RUN mkdir -p /home/claude/.claude && chown -R bun:bun /home/claude

WORKDIR /app

# Install dependencies first for layer caching.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# App source: src/ (code + prompts) and .claude/skills (junction-linked into
# the target repo at run time) are both required by the running watcher.
COPY . .

# State is persisted via a named volume mounted here.
RUN mkdir -p /app/.state /app/.output && chown -R bun:bun /app

# Entrypoint fixes volume ownership as root, then drops to the non-root 'bun'
# user to start the watcher (see entrypoint.sh for why root cannot run it).
COPY --chmod=755 entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]

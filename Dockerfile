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
# the host's .claude to /home/claude/.claude, so HOME must point there.
ENV HOME=/home/claude
RUN mkdir -p /home/claude/.claude

WORKDIR /app

# Install dependencies first for layer caching.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# App source: src/ (code + prompts) and .claude/skills (junction-linked into
# the target repo at run time) are both required by the running watcher.
COPY . .

# State is persisted via a named volume mounted here.
RUN mkdir -p /app/.state /app/.output

CMD ["bun", "run", "src/cli/index.ts", "watch"]

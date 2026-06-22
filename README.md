# docsWriter

Automatically generates documentation articles from Azure DevOps work items. Tag a work item `write-docs`, and docsWriter reads its description, comments, and linked pull requests, drives the Claude Agent SDK over your AL source repo to produce a complete Continia Banking documentation article, attaches the article to the work item, posts a confirmation comment, and removes the tag.

Built with Bun, TypeScript, Zod, and `@anthropic-ai/claude-agent-sdk`.

## How it works

1. **Poll** — every N minutes, find work items across the project tagged `write-docs`.
2. **Gather context** — for each item, read its title/description, all comments, and any linked pull requests (PR metadata + changed-file paths).
3. **Link skills** — junction-link docsWriter's docs-writing skills (`.claude/skills/`: `docs-article-generator`, `docs-writer`, `docs-validator`) into the source repo's `.claude/skills/` so the agent can invoke them via the `Skill` tool. Junctions need no admin on Windows and are removed after each run.
4. **Generate** — run the Claude Agent SDK with the source repo as its working directory. The agent invokes `docs-article-generator`, reconstructs the feature flow from the AL code via LSP, auto-picks the next unused `CB-###`, writes the validated article to `OUTPUT_DIR`, and reports the validator verdict. Agent writes are fenced to `OUTPUT_DIR` — nothing is written into the source or docs repo.
5. **Publish back** — upload the article as a `.md` attachment, link it to the work item, post a "docs attached" comment, and remove the `write-docs` tag.

State (processed ids + a daily cap) is persisted as JSON to avoid runaway generation.

## Getting started

1. Install dependencies:
   ```bash
   bun install
   ```
2. Copy `.env.example` to `.env` and fill in your settings (Azure DevOps creds, `TARGET_REPO_PATH`, `DOCS_REPO_PATH`):
   ```bash
   cp .env.example .env
   ```
3. Verify:
   ```bash
   bun test
   bun run typecheck
   ```
4. List tagged items and dry-run a single one:
   ```bash
   bun src/cli/index.ts debug-tags
   bun src/cli/index.ts test-item <work-item-id>   # dry-run: writes the article to OUTPUT_DIR, no ADO writes
   ```
5. Start the watcher:
   ```bash
   bun run start
   ```

## Configuration

See `.env.example`. Required: `AZURE_DEVOPS_PAT`/`ORG`/`PROJECT`, `TARGET_REPO_PATH` (AL source repo), `DOCS_REPO_PATH` (continia.docs.articles). Optional: `WRITE_DOCS_TAG` (default `write-docs`), `OUTPUT_DIR`, `SKILLS_SOURCE_DIR`, `POLL_INTERVAL_MINUTES`, `MAX_DOCS_PER_DAY`, `CLAUDE_MODEL`, `PROMPT_PATH`, `STATE_DIR`.

## Project structure

```
src/
├── cli/index.ts                 # CLI: watch, run-once, test-item, debug-tags, reset-state
├── config/index.ts              # Zod env validation
├── sdk/azure-devops-client.ts   # ADO REST client: tags, comments, PRs, attachments
├── services/
│   ├── watcher.ts               # Polling loop, daily cap, tag removal, graceful shutdown
│   ├── processor.ts             # Per-item orchestration (gather → link → generate → attach)
│   ├── generator.ts             # Claude Agent SDK runner + tool gating (writes fenced to OUTPUT_DIR)
│   ├── skill-linker.ts          # Junction docs skills into the source repo
│   └── skill-loader.ts          # Discover skills for the prompt listing
├── prompts/write-docs.md        # System prompt appended to the agent
├── state/state-store.ts         # JSON state + daily cap
├── utils/html.ts                # ADO rich-text → plain text
└── types/index.ts               # Shared interfaces

.claude/skills/                  # Docs-writing skills junction-linked into the source repo
tests/                           # Mirror of src/ with full coverage
```

## Commands

| Command | Description |
|---------|-------------|
| `bun run start` | Start the watcher (polls every N minutes) |
| `bun run once` | Run a single poll cycle and exit |
| `bun src/cli/index.ts test-item <id>` | Generate docs for one item (dry-run) |
| `bun src/cli/index.ts debug-tags` | List items carrying the `write-docs` tag |
| `bun src/cli/index.ts reset-state` | Clear processed state |
| `bun test` | Run all tests |
| `bun run typecheck` | TypeScript type checking |

Add `--dry-run` to `watch`/`run-once` to generate articles but skip all Azure DevOps writes and tag removal.

## Patterns

See [PATTERNS.md](PATTERNS.md) for the architectural patterns used.

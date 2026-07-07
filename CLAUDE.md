# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

docsWriter watches Azure DevOps for work items tagged `write-docs`, then auto-generates a documentation article for the feature. For each tagged item it reads the description, comments, and linked pull requests, junction-links its own docs-writing skills into the AL source repo, drives the Claude Agent SDK over that repo to produce a validated Continia documentation article, attaches the article to the work item, posts a confirmation comment, and removes the tag.

## Architecture

- **Runtime:** Bun (TypeScript)
- **Validation:** Zod for environment config
- **AI:** `@anthropic-ai/claude-agent-sdk` — the agent runs with `cwd` = the AL source repo and uses `Read/Grep/Glob/Bash/Skill/LSP/Write/Edit`
- **Testing:** Bun's built-in test framework

## Pipeline (per tagged work item)

1. `watcher.ts` polls `queryTaggedWorkItems(writeDocsTag)`.
2. `processor.ts` gathers context: `getWorkItem` (+relations) → `getWorkItemComments` → `parsePullRequestRefs` → `getPullRequestContext` (metadata + changed files).
3. `classifier.ts` runs a read-only classifier agent (Read/Grep/Glob/LSP, cwd = the product's AL repo) that decides `newfeature`/`update`/`changelog` + the target article, returned as a structured `<<<CLASSIFICATION>>>` block. Non-optional: a classifier failure fails the item (tag kept → retried). The decision drives the drafting prompt, the deliverable filename, and a code-generated candidate-articles note in the work-item comment.
4. `skill-linker.ts` junctions `.claude/skills/*` into `{TARGET_REPO_PATH}/.claude/skills/` (removed in a `finally`).
5. `generator.ts` runs the agent; it invokes `docs-article-generator`, auto-picks the next `<PREFIX>-###`, and writes the article to `OUTPUT_DIR`. Writes are fenced to `OUTPUT_DIR` via `canUseTool`.
6. `processor.ts` uploads the article as an attachment, links it, comments, and the watcher removes the tag.

## Key Patterns

- **Dependency injection** via `Deps` interfaces on every service for testability (no module mocking)
- **Exponential backoff retry** on Azure DevOps API calls (5xx/network errors)
- **Tool gating** — `makeCanUseTool` blocks destructive bash and fences `Write/Edit` to `OUTPUT_DIR` (enforces "attach only", nothing written into the source/docs repo)
- **Directory junctions** for skills (no admin needed on Windows), created/removed per run
- **JSON state store** with Set-based O(1) lookups + a daily generation cap
- **Polling watcher** with graceful SIGINT/SIGTERM shutdown; tag removal prevents reprocessing

## Commands

- `bun test` — run all tests
- `bun run typecheck` — TypeScript type checking
- `bun run start` — start the watcher
- `bun run once` — single poll cycle
- `bun src/cli/index.ts debug-tags` — list tagged items
- `bun src/cli/index.ts test-item <id>` — dry-run a single item
- `bun src/cli/index.ts classify-item <id>` — classifier-only run for a work item (prints the JSON decision)

## File Layout

- `src/config/` — Zod env validation
- `src/sdk/` — Azure DevOps REST client (tags, comments, PRs, attachments)
- `src/services/` — watcher, processor, classifier (classification-only agent), generator (agent runner), skill-linker, skill-loader
- `src/prompts/` — `write-docs.md` system prompt
- `src/state/` — JSON persistence + daily cap
- `src/utils/` — HTML→text helper
- `src/types/` — shared interfaces
- `.claude/skills/` — docs-writing skills junction-linked into the source repo at run time
- `tests/` — mirrors src/ structure

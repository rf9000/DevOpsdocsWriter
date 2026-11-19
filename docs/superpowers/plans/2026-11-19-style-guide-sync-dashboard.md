# Style-Guide Sync: Gate, Dashboard Status, Sync Now — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The style-guide sync refuses a damaged upstream file, reports every run to the monitor dashboard, and can be started from a "Sync now" button there.

**Architecture:** `scripts/sync-style-guide.sh` (host-side bash, this repo) gains a sanity gate and writes a JSON status file. A second host script, run by cron every minute, turns a request file into a sync run. The monitor (`monitor-the-situation`, a separate repo) reads the status file and writes the request file through the `monitor-requests` directory it already mounts; the two repos share only three file names and one JSON shape.

**Tech Stack:** bash + curl + git + awk (no jq) on the Linux VM; Bun + TypeScript + `bun test` in both repos.

**Spec:** `docs/superpowers/specs/2026-11-19-style-guide-sync-dashboard-design.md`

## Global Constraints

- Repos: Part A is `C:\GeneralDev\DevOpsPullers\DevOpsdocsWriter` (this repo). Part B is `C:\GeneralDev\DevOpsPullers\monitor-the-situation`. Each part gets its own feature branch in its own repo (`feat/style-guide-sync-status`); never commit to `main` directly, never push without the owner asking.
- This repo has an uncommitted change to `package.json` that belongs to the owner. Do not stage, revert or edit it. Stage files by explicit path only.
- The scripts run on Linux under cron and, for tests, under Git Bash on Windows. Use only bash, curl, git, awk, sed, grep, tr, wc, date, mktemp. No jq, no python.
- Do not change the agent's system prompt (`src/prompts/`), the skills, or `style-guide-supplement.md`.
- `skill-distributor` is out of scope: do not touch that repo.
- File contract between the repos, all in one directory (on the VM `/home/azureuser/teams/continia-banking/monitor-requests`, in the monitor `/vol/requests`):
  - `styleguide-sync.status.json` — written by the sync script.
  - `styleguide-sync.request.json` — written by the monitor: `{"at":"<ISO>","by":"<user>"|null}`.
  - `styleguide-sync.running.json` — the request file, renamed by the request script while the sync runs.
- Status JSON shape (keys exactly these; optional ones are omitted, not null, unless stated):
  `at` (ISO UTC, `YYYY-MM-DDTHH:MM:SSZ`), `result` (`synced` | `up-to-date` | `rejected` | `failed`), `exitCode` (number), `reason` (string or `null`), `inSync` (`true` | `false` | `null` when upstream could not be fetched), `upstreamCommit` (7 chars, optional), `upstreamCommitAt` (ISO, optional), `lastSyncedAt` (ISO, optional), `trigger` (`cron` | `dashboard` | `manual`), `by` (string, optional).
- Gate thresholds: upstream rejected below **60%** of the local line count. Dashboard staleness: status older than **48 hours**.
- New exit code **7** = upstream rejected. Existing exit codes 0–6 keep their meaning.
- "Sync now" never bypasses the gate. There is no override flag.
- One deviation from the spec: the test hook is a `--upstream-file <path>` argument instead of a `STYLE_GUIDE_FETCH_URL` override (curl reports no HTTP status for `file://`).

## Review Focus

1. The status directory does not exist or is not writable (first deploy, before `monitor-requests` is set up): the sync must still run and exit with its normal code; it logs one warning. Test in Task 2.
2. No local `style-guide.md` yet, or an upstream file with CRLF line endings and a BOM: the gate works on normalized content and skips the shrink rule when there is no local file. Tests in Task 1.
3. An upstream file with no table of contents: the missing-section rule is skipped (logged), the other three rules still apply. Test in Task 1.
4. The status file is half-written, empty, not JSON, or has unknown `result`: the dashboard shows the grey "no sync status yet" line and does not throw. Test in Task 5.
5. The request file is unreadable JSON, or `by` contains quotes or spaces: the request script still runs the sync, with `by` passed as one argument or left out. Test in Task 3.

---

# Part A — DevOpsdocsWriter

## File structure

| File | Responsibility |
|---|---|
| `scripts/sync-style-guide.sh` (modify) | Fetch, **gate**, compare, commit, push, rebuild, **write status** |
| `scripts/sync-style-guide-request.sh` (create) | Turn a dashboard request file into one sync run |
| `tests/scripts/helpers.ts` (create) | Build a throwaway git repo + bare origin; run a script with bash |
| `tests/scripts/sync-style-guide.test.ts` (create) | Gate, status and exit-code tests |
| `tests/scripts/sync-style-guide-request.test.ts` (create) | Request-script tests (skipped on Windows: needs `flock`) |
| `tests/fixtures/style-guide/good.md` (create) | A small valid guide |
| `scripts/README.md`, `README.md`, `.env.example` (modify) | Gate, exit 7, status file, request script, cron lines |

### Task 1: Sanity gate

**Files:**
- Modify: `scripts/sync-style-guide.sh`
- Create: `tests/scripts/helpers.ts`, `tests/scripts/sync-style-guide.test.ts`, `tests/fixtures/style-guide/good.md`

**Interfaces:**
- Produces (script): argument `--upstream-file <path>` — use this file as the fetched upstream; skip curl, skip the token check, skip the commits-API call of Task 2. Exit code `7` on rejection. Bash function `gate_reason <normalized-upstream-file> <local-file-or-empty>`: prints the rejection reason and returns 1, or prints nothing and returns 0.
- Produces (tests): `helpers.ts` exports
  - `makeRepo(localGuide: string | null): Promise<{ root: string; origin: string; guidePath: string }>` — temp dir with a bare `origin` and a clone on `main` containing `.claude/skills/docs-writer/references/style-guide.md` (when `localGuide` is not null) committed and pushed, plus an empty `.env`. Sets `user.name`/`user.email` locally in the clone.
  - `runSync(root: string, args: string[]): Promise<{ code: number; out: string }>` — runs `bash scripts/sync-style-guide.sh --repo-root <root> --skip-docker ...args` from this repo with `Bun.spawn`.
  - `fixture(name: string): string` — reads `tests/fixtures/style-guide/<name>`.

- [ ] **Step 1: Write the fixture `tests/fixtures/style-guide/good.md`**

About 40 lines. First line `# Continia Documentation Style Guide (Agent Reference)`. A `## Table of contents` with three numbered entries (`1. [Frontmatter](#1-frontmatter)` and so on). Three sections `## 1. Frontmatter`, `## 2. Procedures`, `## 3. Links`. Section 1 contains a nested fence: a four-backtick block that holds a three-backtick `meta` block (copy the shape from the upstream guide's section 1.1). LF line endings.

- [ ] **Step 2: Write the failing tests in `tests/scripts/sync-style-guide.test.ts`**

Each test builds its upstream by string edits on `fixture('good.md')`, writes it to a temp file, and calls `runSync(root, ['--upstream-file', file])`. The local guide is `good.md` unless stated.

```ts
test('good upstream that differs is committed and pushed', ...)
// upstream = good + '\nExtra line.\n' → code 0; guide file equals upstream;
// `git log -1 --pretty=%s` starts with 'chore: sync style guide';
// `git log origin/main -1 --pretty=%s` is the same commit.

test('rejects upstream whose first non-empty line is not an H1', ...)
// upstream = '`HUMAN_GUIDE` was supplied inline.\n\n`````markdown\n' + good
// → code 7; guide file unchanged; `git status --porcelain` empty; out contains 'first line is not a level-1 heading'

test('rejects upstream that misses a section listed in its table of contents', ...)
// upstream = good cut off just before '## 3. Links' → code 7; out contains 'section 3 is missing'

test('rejects upstream that ends inside an open code fence', ...)
// upstream = good + '\n```\nunclosed\n' → code 7; out contains 'ends inside an open code fence'

test('accepts nested fences that are all closed', ...)
// upstream = good + '\nExtra line.\n' → code 0 (same as the first test; asserts the nested fence in good.md does not trip the rule)

test('rejects upstream under 60% of the local line count', ...)
// local = good + 60 filler lines inside section 3; upstream = good → code 7; out contains 'lines, local has'

test('skips the shrink rule when there is no local guide', ...)
// makeRepo(null); upstream = good → code 0; guide file created and committed

test('gate ignores CRLF and a BOM', ...)
// upstream = '\uFEFF' + good with \n → \r\n, plus one extra line → code 0

test('upstream without a table of contents skips the section rule', ...)
// upstream = good with the '## Table of contents' block removed, plus one extra line → code 0; out contains 'no table of contents'
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun test tests/scripts/sync-style-guide.test.ts`
Expected: FAIL — `Unknown argument: --upstream-file` (exit 2).

- [ ] **Step 4: Implement `--upstream-file` and `gate_reason` in `scripts/sync-style-guide.sh`**

- `--upstream-file <path>`: copy the file to `$TMP_FILE` instead of running curl; `TOKEN` is then not required.
- Call the gate right after the fetch section, before "Compare", on `normalized "$TMP_FILE"`. On rejection: `log "Upstream rejected: <reason>"`, exit 7. No file is written, `self_heal` is not called.
- Rules, in this order; the first that fails gives the reason:
  1. First non-empty line does not start with `# ` → `first line is not a level-1 heading`.
  2. Table of contents = the lines between `## Table of contents` and the next line starting with `## ` or `---`. For each entry matching `^[0-9]+\. `, with number N, the file must contain a line matching `^## N\. ` → otherwise `section N is missing (file is truncated)`, for the lowest missing N. No table of contents: log `Upstream has no table of contents; section check skipped.` and continue.
  3. Fence tracking → `ends inside an open code fence`. Algorithm (awk): a fence line is optional leading spaces, then 3 or more backticks, then anything without a backtick. With no fence open, a fence line opens one and records its backtick count. With a fence open, only a line of backticks alone (no info string) with a count **>= the recorded count** closes it; every other line, shorter fence lines included, is content. Reject when a fence is open at end of file.
  4. A local file exists and `upstream_lines * 100 < local_lines * 60` → `upstream has U lines, local has L (under 60%)`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test tests/scripts/sync-style-guide.test.ts`
Expected: 9 pass.

- [ ] **Step 6: Check the gate against the real upstream**

Run: `bash scripts/sync-style-guide.sh --dry-run`
Expected today (upstream commit `d76806e` is damaged): `Upstream rejected: first line is not a level-1 heading`, exit code 7.

- [ ] **Step 7: Commit**

```bash
git add scripts/sync-style-guide.sh tests/scripts/helpers.ts tests/scripts/sync-style-guide.test.ts tests/fixtures/style-guide/good.md
git commit -m "feat: reject a damaged upstream style guide before syncing it"
```

### Task 2: Status file

**Files:**
- Modify: `scripts/sync-style-guide.sh`
- Modify: `tests/scripts/sync-style-guide.test.ts`, `tests/scripts/helpers.ts`

**Interfaces:**
- Consumes: Task 1's exit code 7 and `--upstream-file`.
- Produces: arguments `--trigger <cron|dashboard|manual>` (default `manual`) and `--by <who>`; env key `STYLE_GUIDE_STATUS_FILE` in `.env` (default `<repo-root>/.state/style-guide-sync.status.json`); the status JSON from Global Constraints. `helpers.ts` adds `readStatus(root: string): Promise<Record<string, unknown> | null>` and `makeRepo` gains an optional second parameter `env: string` written to `.env`.

- [ ] **Step 1: Write the failing tests**

```ts
test('a sync writes status synced', ...)
// → status.result 'synced', exitCode 0, inSync true, reason null, trigger 'manual',
//   at and lastSyncedAt match /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/, no 'by' key

test('an up-to-date run writes up-to-date and keeps lastSyncedAt', ...)
// run 1 syncs; run 2 with the same upstream → result 'up-to-date', inSync true,
//   lastSyncedAt equals run 1's lastSyncedAt

test('a rejection writes rejected with the reason and inSync false', ...)
// → result 'rejected', exitCode 7, inSync false, reason 'first line is not a level-1 heading'

test('trigger and by are recorded, and by is JSON-escaped', ...)
// args: --trigger dashboard --by 'a "b" c' → status.trigger 'dashboard', status.by 'a "b" c' (JSON.parse succeeds)

test('a push failure writes failed with exit code 5', ...)
// set origin URL to a missing path after makeRepo → code 5; result 'failed', exitCode 5, reason contains 'push'

test('a wrong branch writes failed with exit code 4 and inSync null', ...)
// `git checkout -b other` in the clone → code 4; result 'failed', inSync null

test('an unwritable status path does not change the exit code', ...)
// .env: STYLE_GUIDE_STATUS_FILE=<root>/missing-dir/sub/status.json, upstream = local → code 0; out contains 'could not write status'

test('--dry-run writes no status file', ...)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/scripts/sync-style-guide.test.ts`
Expected: the eight new tests FAIL (`readStatus` returns null / unknown argument `--trigger`).

- [ ] **Step 3: Implement the status writer**

- One function `finish <exitCode> <result> <reason-or-empty>` that writes the status and exits; replace every `exit N` after the config section with it. Config errors (exit 2) before the status path is known also go through it once the path is resolved; an unknown argument keeps its plain `exit 2`.
- Results: exit 0 after a commit+push → `synced`; exit 0 otherwise → `up-to-date`; exit 7 → `rejected`; everything else → `failed`. The reason for `failed` is the same text the script logs for that exit.
- `inSync`: `true` for `synced` and `up-to-date`; `false` for `rejected` and for failures after the compare found a difference; `null` when the script stopped before the compare.
- Write atomically: `mktemp` in the status file's directory, then `mv`. Do not create the directory. On any failure: `log "Warning: could not write status to <path>"` and keep the exit code.
- `lastSyncedAt`: now for `synced`; otherwise the value read back from the existing status file with grep/sed; omitted when there is none.
- JSON string escaping for `reason` and `by`: backslash and double quote escaped, newlines and tabs replaced by a space.
- `upstreamCommit` / `upstreamCommitAt`: one call after a successful fetch, `GET https://api.github.com/repos/$OWNER/$REPO/commits?path=$FILE_PATH&sha=$BRANCH&per_page=1` with the same headers and token. Take the first `"sha"` (first 7 chars) and the first `"date"` in the response. Any failure: omit both keys and continue. Skipped with `--upstream-file`.
- `--dry-run`: no status file.
- Timestamps: `date -u '+%Y-%m-%dT%H:%M:%SZ'`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test tests/scripts/sync-style-guide.test.ts`
Expected: 17 pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/sync-style-guide.sh tests/scripts/helpers.ts tests/scripts/sync-style-guide.test.ts
git commit -m "feat: write a status file after every style-guide sync run"
```

### Task 3: Request script, docs, cron

**Files:**
- Create: `scripts/sync-style-guide-request.sh`, `tests/scripts/sync-style-guide-request.test.ts`
- Modify: `scripts/README.md`, `README.md`, `.env.example`

**Interfaces:**
- Consumes: `sync-style-guide.sh --trigger dashboard --by <who>`; `STYLE_GUIDE_STATUS_FILE`.
- Produces: `sync-style-guide-request.sh [--repo-root <path>] [--env-file <path>] [-- <extra args passed to the sync>]`. Request directory = `STYLE_GUIDE_REQUEST_DIR` from `.env`, default the directory of `STYLE_GUIDE_STATUS_FILE`. Always exits 0 unless the directory is missing (exit 2).

- [ ] **Step 1: Write the failing tests** (`describe.skipIf(process.platform === 'win32')`; `flock` is Linux-only)

Each test uses `makeRepo` with `.env` pointing `STYLE_GUIDE_STATUS_FILE` into a temp request directory, and passes `-- --skip-docker --upstream-file <file>`.

```ts
test('no request file: exits 0 and runs nothing', ...)          // no status file afterwards
test('a request runs the sync as the requester', ...)
// request {"at":"2026-11-19T10:00:00Z","by":"someone@example.com"} → status.trigger 'dashboard',
//   status.by 'someone@example.com'; request and running files both gone
test('an unreadable request still runs the sync, without by', ...) // file content 'not json' → trigger 'dashboard', no 'by' key
test('a by with quotes and spaces is passed as one argument', ...) // by: 'a "b" c' → status.by 'a "b" c'
test('a leftover running file is cleared', ...)                   // only running.json present → exit 0, file gone, no status
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/scripts/sync-style-guide-request.test.ts` (on Linux/WSL; on Windows they report as skipped)
Expected: FAIL — script not found.

- [ ] **Step 3: Implement `scripts/sync-style-guide-request.sh`**

Model it on `monitor-the-situation/deploy/factcheck-run-request.sh`: `flock -n` on `<dir>/.styleguide-sync.lock` (exit 0 when held); remove a leftover `styleguide-sync.running.json`; exit 0 when there is no `styleguide-sync.request.json`; rename request → running; read `by` with sed (the JSON string value, with `\"` and `\\` unescaped); run the sync with `--trigger dashboard`, plus `--by "$by"` when not empty; remove the running file whatever the sync's exit code.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test tests/scripts/` then `bun test` and `bun run typecheck`
Expected: all pass (request tests skipped on Windows), typecheck clean.

- [ ] **Step 5: Update the docs**

- `scripts/README.md`: the gate (four rules, 60%), exit code 7 in the table ("upstream rejected — recovers by itself when upstream is regenerated"), the status file and its keys, `--trigger`/`--by`, a `sync-style-guide-request.sh` section, the two new `.env` keys, and these cron lines replacing the single `0 6 * * *` line:

```cron
@reboot sleep 360 && /bin/bash /home/azureuser/teams/continia-banking/DevOpsdocsWriter/scripts/sync-style-guide.sh --trigger cron >> /home/azureuser/teams/continia-banking/DevOpsdocsWriter/.state/cron-style-guide.log 2>&1
0 6 * * * /bin/bash /home/azureuser/teams/continia-banking/DevOpsdocsWriter/scripts/sync-style-guide.sh --trigger cron >> /home/azureuser/teams/continia-banking/DevOpsdocsWriter/.state/cron-style-guide.log 2>&1
* * * * * /bin/bash /home/azureuser/teams/continia-banking/DevOpsdocsWriter/scripts/sync-style-guide-request.sh >> /home/azureuser/teams/continia-banking/DevOpsdocsWriter/.state/cron-style-guide.log 2>&1
```

  State why `@reboot` is there (the VM is deallocated daily and often started after 06:00).
- `README.md` line 48: one more sentence — a damaged upstream is rejected, and the dashboard shows the sync state and has "Sync now".
- `.env.example`: add, commented, `STYLE_GUIDE_STATUS_FILE=/home/azureuser/teams/continia-banking/monitor-requests/styleguide-sync.status.json` and `STYLE_GUIDE_REQUEST_DIR=` with one comment line each.

- [ ] **Step 6: Commit**

```bash
git add scripts/sync-style-guide-request.sh tests/scripts/sync-style-guide-request.test.ts scripts/README.md README.md .env.example
git commit -m "feat: run a style-guide sync on request from the dashboard"
```

---

# Part B — monitor-the-situation

Work in `C:\GeneralDev\DevOpsPullers\monitor-the-situation` on its own branch. Read `src/factcheck-run.ts`, `tests/factcheck-run.test.ts`, `src/agent-build.ts` and the `/api/factcheck/run` route in `src/server.ts` first: this part copies those patterns.

## File structure

| File | Responsibility |
|---|---|
| `src/styleguide-sync.ts` (create) | Read the status + request files, write the request |
| `src/types.ts`, `src/config.ts`, `src/main.ts`, `src/server.ts` (modify) | Types, env key, wiring, snapshot fields, route |
| `public/app.js`, `public/style.css` (modify) | The line and button on the docs-writer card |
| `tests/styleguide-sync.test.ts` (create), `tests/server-actions.test.ts` (modify) | Unit and route tests |
| `compose.snippet.yml`, `README.md`, `docs/VM-ARCHITECTURE.md` (modify) | Env key, cron lines |

### Task 4: `StyleGuideSync`

**Files:**
- Create: `src/styleguide-sync.ts`, `tests/styleguide-sync.test.ts`
- Modify: `src/types.ts`

**Interfaces:**
- Produces, in `src/types.ts`:

```ts
// docsWriter's style-guide sync (DevOpsdocsWriter scripts/sync-style-guide.sh writes the status file).
export interface StyleGuideSyncStatus {
  at: string;
  result: 'synced' | 'up-to-date' | 'rejected' | 'failed';
  exitCode: number;
  reason: string | null;
  inSync: boolean | null;
  upstreamCommit?: string;
  upstreamCommitAt?: string;
  lastSyncedAt?: string;
  trigger?: string;
  by?: string;
}
export interface StyleGuideView {
  status: StyleGuideSyncStatus | null; // null: no status file yet, or it is unreadable
  stale: boolean; // the status is older than 48 hours: the host cron is probably not running
  run: { state: 'requested' | 'running'; at: string; by: string | null } | null;
}
```

- Produces, in `src/styleguide-sync.ts`:

```ts
export class StyleGuideSync {
  constructor(dir: string, now?: () => Date);
  view(): Promise<StyleGuideView>;
  request(by: string | null): Promise<boolean>; // false when a sync is already requested or running
}
```

- [ ] **Step 1: Write the failing tests in `tests/styleguide-sync.test.ts`** (temp dir per test, fixed `now` = `2026-11-19T12:00:00Z`)

```ts
test('no files: status null, not stale, no run', ...)
test('reads a status file', ...)                       // every field of a full status round-trips
test('status older than 48 hours is stale', ...)       // at '2026-11-17T11:59:59Z' → stale true; '2026-11-17T12:00:01Z' → false
test.each(['', '{"at":', 'null', '[]', '{"at":"x","result":"weird","exitCode":0}'])('unreadable status %p reads as null', ...)
test('request writes the request file once', ...)      // first true, file is {"at":"2026-11-19T12:00:00.000Z","by":"u"}; second false
test('request is refused while running', ...)          // running file present → false
test('view reports requested, then running', ...)
```

- [ ] **Step 2: Run to verify they fail**

Run: `bun test tests/styleguide-sync.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/styleguide-sync.ts`**

File names from Global Constraints. Validate the status with zod (`result` enum, `at` string, `exitCode` number; `reason` and `inSync` default to `null`); any failure → `status: null`. `stale` is false when `status` is null or `at` does not parse. `request` uses the `wx` flag exactly as `FactCheckRunner.request` does.

- [ ] **Step 4: Run to verify they pass**

Run: `bun test tests/styleguide-sync.test.ts && bun run typecheck` — Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/styleguide-sync.ts src/types.ts tests/styleguide-sync.test.ts
git commit -m "feat: read docs-writer's style-guide sync status and request a sync"
```

### Task 5: Snapshot, route, wiring

**Files:**
- Modify: `src/config.ts`, `src/main.ts`, `src/server.ts`, `src/types.ts`, `tests/server-actions.test.ts`

**Interfaces:**
- Consumes: `StyleGuideSync`, `StyleGuideView` (Task 4).
- Produces:
  - Config key `STYLEGUIDE_REQUEST_DIR: z.string().optional()`.
  - Server option `styleGuide?: { sync: StyleGuideSync; current: () => StyleGuideView | null; onRequested?: () => void }`.
  - `Snapshot.styleGuide?: StyleGuideView | null` — null when the key is unset or the viewer does not see the `docs-writer` agent (`seesAgent`). `Snapshot.styleGuideAdmin?: boolean` — `!!opts.styleGuide && adminsFactCheck(view) && seesAgent(view, 'docs-writer')`.
  - `POST /api/styleguide/sync` → 404 when off, 403 without `styleGuideAdmin`, 409 `{ error: 'a sync is already requested or running' }`, else 202 `{ requested: true }`, action-log name `styleguide-sync`.

- [ ] **Step 1: Write the failing tests in `tests/server-actions.test.ts`** (same harness as the `/api/factcheck/run` tests there)

```ts
test('POST /api/styleguide/sync is 404 when the feature is off', ...)
test('POST /api/styleguide/sync is 403 without factcheck-admin', ...)
test('POST /api/styleguide/sync is 403 for a factcheck-admin who does not see docs-writer', ...)
test('POST /api/styleguide/sync writes the request with the user and returns 202', ...)
test('a second request returns 409', ...)
test('the snapshot carries styleGuide only for viewers of docs-writer', ...)
test('a malformed status file gives styleGuide.status null and the snapshot still serializes', ...)
```

- [ ] **Step 2: Run to verify they fail**

Run: `bun test tests/server-actions.test.ts` — Expected: the seven new tests FAIL.

- [ ] **Step 3: Implement**

In `main.ts`, create the `StyleGuideSync` when `STYLEGUIDE_REQUEST_DIR` is set, poll `view()` on the same interval and in the same way `AgentBuilds` is polled, keep the last view in a variable for `current`, and call the poll from `onRequested` so the card shows "requested" at once. In `server.ts`, add the two snapshot fields next to `factCheckAdmin` and the route next to `/api/factcheck/run`.

- [ ] **Step 4: Run to verify they pass**

Run: `bun test tests/ && bun run typecheck` — Expected: all pass, clean.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/main.ts src/server.ts src/types.ts tests/server-actions.test.ts
git commit -m "feat: style-guide sync status in the snapshot and a Sync now route"
```

### Task 6: Card line, button, deploy docs

**Files:**
- Modify: `public/app.js`, `public/style.css`, `compose.snippet.yml`, `README.md`, `docs/VM-ARCHITECTURE.md`
- Test: the UI test file that covers pure render helpers (follow `tests/coder-fixpr-ui.test.ts`)

**Interfaces:**
- Consumes: `snap.styleGuide`, `snap.styleGuideAdmin`, `POST api/styleguide/sync`.
- Produces: `styleGuideLine(view, nowMs)` in `public/app.js`, returning `{ tone: 'ok' | 'bad' | 'warn' | 'none', text: string }`.

- [ ] **Step 1: Write the failing tests for `styleGuideLine`** (exact copy; relative times use the existing helper in `app.js`)

| Input | tone | text |
|---|---|---|
| `status: null` | `none` | `Style guide: no sync status yet` |
| result `synced` or `up-to-date`, not stale | `ok` | `Style guide: in sync · checked <ago>` |
| result `rejected` | `bad` | `Style guide: not the newest · upstream rejected: <reason>` + ` · last synced <date>` when `lastSyncedAt` is set |
| result `failed` | `bad` | `Style guide: sync failed (exit <exitCode>: <reason>)` |
| `stale: true`, result ok | `warn` | `Style guide: last check <ago>` |
| `run.state` `requested` / `running` | unchanged tone | text + ` · sync requested` / ` · syncing…` |

A `bad` result wins over `stale`. `reason` is escaped with the file's existing HTML-escape helper where the line is inserted.

- [ ] **Step 2: Run to verify they fail** — `bun test tests/` — Expected: new tests FAIL.

- [ ] **Step 3: Implement**

Render the line on the `docs-writer` card only, under the card header, when `snap.styleGuide` is not null. With `snap.styleGuideAdmin`, add a "Sync now" button (title: `Fetch the style guide from GitHub now. A damaged upstream file is still rejected.`), disabled while `run` is not null; its click handler is a copy of the "Run check now" handler at `public/app.js:190` posting to `api/styleguide/sync`. Colours: reuse the existing ok / error / warning classes in `style.css`; add only layout rules.

- [ ] **Step 4: Run to verify they pass** — `bun test tests/ && bun run typecheck` — Expected: all pass.

- [ ] **Step 5: See it in the browser**

Put a `styleguide-sync.status.json` with result `rejected` in a temp dir, run `STYLEGUIDE_REQUEST_DIR=<that dir> bun run dev`, open the dashboard: the docs-writer card shows the red line; "Sync now" creates `styleguide-sync.request.json` and the line shows "sync requested". Replace the status with an `up-to-date` one: the line turns green.

- [ ] **Step 6: Deploy docs**

- `compose.snippet.yml`: `STYLEGUIDE_REQUEST_DIR: /vol/requests` next to `FACTCHECK_REQUEST_DIR`, with a comment line. Run `bun test tests/compose.test.ts`.
- `README.md`: the env-table row.
- `docs/VM-ARCHITECTURE.md`: replace the paragraph that says the sync moved to `skill-distributor` with the three cron lines from Task 3 and one sentence on the status and request files.

- [ ] **Step 7: Commit**

```bash
git add public/app.js public/style.css compose.snippet.yml README.md docs/VM-ARCHITECTURE.md tests/
git commit -m "feat: show the style-guide sync on the docs-writer card, with Sync now"
```

---

## After both parts (owner, on the VM)

Not agent work; listed so nothing is forgotten:

1. Pull both repos on the VM; rebuild the monitor.
2. In docsWriter's `.env` on the VM: `STYLE_GUIDE_GITHUB_TOKEN`, `STYLE_GUIDE_COMPOSE_DIR`, `STYLE_GUIDE_STATUS_FILE`.
3. Add the three cron lines (`crontab -e` as `azureuser`).
4. Confirm non-interactive `git push` works for that clone.
5. Expect the card to show red "upstream rejected" until the upstream generator produces a complete file.

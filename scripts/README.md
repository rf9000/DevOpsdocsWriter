# scripts/

Host-side tooling that runs on the VM, outside the docsWriter container.

## sync-style-guide.sh

Keeps `.claude/skills/docs-writer/references/style-guide.md` in sync with its upstream source:
[`Continia/Continia-agent-friendly-style-guidelines`](https://github.com/Continia/Continia-agent-friendly-style-guidelines) → `docsguidelines/llmfriendly/style-guide.md` (branch `main`).

The local file is a **verbatim copy** of upstream by design — local deltas live in
`style-guide-supplement.md` — so the script replaces it wholesale. Runs daily via cron on the
Linux VM and does, in order:

1. Fetch the upstream file (GitHub Contents API, token from `.env`).
2. Run the **sanity gate** (below). A damaged upstream file stops the run here.
3. Compare with the local copy (line-ending and BOM tolerant; `git status` is the authoritative
   gate, so CRLF/LF differences never cause churn commits).
4. If different: `git pull --ff-only`, overwrite the file, commit **only that file** to `main`, push.
5. `docker compose build` + `docker compose up -d` so the container runs with the new guide.
6. Write the **status file** (below), whatever the outcome.

If nothing changed, it logs one line and exits. Logs go to `.state/style-guide-sync.log`.

### Sanity gate

Upstream is produced by a generator, and its output is sometimes damaged: generator chatter
before the title, the whole guide wrapped in a code fence, or a file cut off halfway. The script
rejects the upstream file, changes nothing, and exits 7 when any of these holds:

| Rule | Reason in the log and status file |
|---|---|
| The first non-empty line is not a level-1 heading (`# `) | `first line is not a level-1 heading` |
| A numbered entry in the file's own table of contents has no `## N.` heading | `section N is missing (file is truncated)` |
| The file ends inside an open code fence | `ends inside an open code fence` |
| It has under 60% of the local file's lines | `upstream has U lines, local has L (under 60%)` |

A file without a table of contents skips the second rule. With no local file there is no fourth
rule. There is no override: fix the upstream file, and the next run syncs it.

### Status file

Every run except `--dry-run` writes one JSON object, through a temp file and a rename. The path
is `STYLE_GUIDE_STATUS_FILE`; on the VM it points into `monitor-requests`, the directory the
monitor dashboard mounts, so the docs-writer card shows whether the guide is the newest. The
script does not create the directory; when it cannot write, it logs a warning and carries on.

| Key | Value |
|---|---|
| `at` | When the run ended (UTC) |
| `result` | `synced`, `up-to-date`, `rejected` (gate) or `failed` |
| `exitCode` | The script's exit code |
| `reason` | Why it was rejected or failed; `null` otherwise |
| `inSync` | `true`: the local file equals upstream and is pushed. `false`: it does not. `null`: the run stopped before it could compare |
| `upstreamCommit`, `upstreamCommitAt` | The newest upstream commit that touched the file. Left out when the lookup fails |
| `lastSyncedAt` | When a run last synced; carried over from the previous status file |
| `trigger`, `by` | `--trigger cron\|dashboard\|manual` (default `manual`) and `--by <who>` |

### Usage

```bash
bash scripts/sync-style-guide.sh               # full sync
bash scripts/sync-style-guide.sh --dry-run     # fetch + compare + report only
bash scripts/sync-style-guide.sh --skip-docker # sync + push, no container rebuild
```

`--repo-root <path>`, `--env-file <path>` and `--upstream-file <path>` (use a local file as the
fetched upstream; no network, no token) exist for testing against a throwaway clone.

### Configuration (`.env` in the repo root)

| Key | Required | Default |
|---|---|---|
| `STYLE_GUIDE_GITHUB_TOKEN` | yes | — (fine-grained PAT, **Contents: read-only**, scoped to the style-guide repo) |
| `STYLE_GUIDE_COMPOSE_DIR` | yes¹ | — (the directory containing `docker-compose.yml`, **or** the full path to the compose file itself) |
| `STYLE_GUIDE_STATUS_FILE` | no | `.state/style-guide-sync.status.json`. On the VM: `/home/azureuser/teams/continia-banking/monitor-requests/styleguide-sync.status.json` |
| `STYLE_GUIDE_REQUEST_DIR` | no | the directory of `STYLE_GUIDE_STATUS_FILE` (used by `sync-style-guide-request.sh`) |
| `STYLE_GUIDE_REPO_OWNER` | no | `Continia` |
| `STYLE_GUIDE_REPO_NAME` | no | `Continia-agent-friendly-style-guidelines` |
| `STYLE_GUIDE_FILE_PATH` | no | `docsguidelines/llmfriendly/style-guide.md` |
| `STYLE_GUIDE_BRANCH` | no | `main` |

¹ not needed with `--dry-run` / `--skip-docker`.

### Exit codes and recovery

| Exit | Meaning | Recovers by itself? |
|---|---|---|
| 0 | up to date / synced | — |
| 1 | unexpected error | check the log |
| 2 | missing config | fix `.env` |
| 3 | fetch failed (note: GitHub returns **404** both for a wrong path and for a token without repo access) | retried next day |
| 4 | git preflight/pull failed (wrong branch, dirty target file, diverged clone) | **needs a human** — the script never stashes/resets |
| 5 | commit/push failed | yes — an unpushed sync commit is detected and re-pushed on the next run |
| 6 | docker failed | yes — a `.state/style-guide-rebuild-pending` flag makes the next run retry the rebuild even when the content already matches |
| 7 | upstream rejected by the sanity gate | yes, once upstream is regenerated into a complete file — the fix is in the upstream repo |

## sync-style-guide-request.sh

The dashboard's "Sync now" button. The monitor cannot run host commands, so it writes
`styleguide-sync.request.json` (`{"at":"...","by":"..."}`) into the request directory. This script
runs from cron every minute and:

1. Takes a lock (`flock`); exits when a requested sync is still running.
2. Removes a leftover `styleguide-sync.running.json` (a VM that stopped mid-run).
3. Exits when there is no request.
4. Renames the request to `styleguide-sync.running.json` and runs
   `sync-style-guide.sh --trigger dashboard --by <who>`.
5. Deletes the running file. The sync's result is in the status file and the log.

The sanity gate still applies: a request forces a run, not the acceptance of a damaged file.
Arguments after `--` are passed on to the sync (used by the tests).

### Cron registration (run once on the VM, as the user that owns the git clone)

```bash
crontab -e
```

Add (adjust the repo path):

```cron
@reboot sleep 360 && /bin/bash /home/azureuser/path/to/DevOpsdocsWriter/scripts/sync-style-guide.sh --trigger cron >> /home/azureuser/path/to/DevOpsdocsWriter/.state/cron-style-guide.log 2>&1
0 6 * * * /bin/bash /home/azureuser/path/to/DevOpsdocsWriter/scripts/sync-style-guide.sh --trigger cron >> /home/azureuser/path/to/DevOpsdocsWriter/.state/cron-style-guide.log 2>&1
* * * * * /bin/bash /home/azureuser/path/to/DevOpsdocsWriter/scripts/sync-style-guide-request.sh >> /home/azureuser/path/to/DevOpsdocsWriter/.state/cron-style-guide.log 2>&1
```

The `@reboot` line is the one that usually runs: Azure auto-shutdown deallocates the VM every
afternoon, and it is often started after 06:00, so the fixed time is missed on most days. The
6-minute sleep lets the network come up. The dashboard shows an amber line when no run has
reported for 48 hours, which is how a missing cron line shows up.

The script logs itself to `.state/style-guide-sync.log`; the cron redirect only catches anything
unexpected outside the script's own logging.

**Prerequisites on the VM — check before the first scheduled run:**

- **Non-interactive `git push` must work** for the cron user in the repo clone: either an SSH
  remote with a passphrase-less key (or an agent available to cron), or an HTTPS remote with a
  stored credential helper. The script sets `GIT_TERMINAL_PROMPT=0`, so a missing credential
  fails fast (exit 5, retried the next day) instead of hanging.
- The cron user must be able to run docker without sudo (member of the `docker` group).
- The clone must be on `main`. The script refuses to run otherwise.
- The request directory (`monitor-requests`) must exist and be writable by the cron user; the
  monitor container mounts the same directory.

### Automated tests

`bun test tests/scripts` runs both scripts against throwaway clones with a local bare `origin`
(`--upstream-file`, `--skip-docker`). The request-script tests need `flock` and are skipped on
Windows; run them on Linux or in a container.

### Testing checklist

1. `--dry-run` → expect one "up to date" line (proves token, URL, `.env` parsing, and that
   line-ending differences between the clone and upstream compare equal).
2. Append a scratch line to the local `style-guide.md`, run `--dry-run` → must report "differs";
   restore with `git checkout -- .claude/skills/docs-writer/references/style-guide.md`.
3. Full pipeline on a throwaway clone: clone this repo to a temp dir, point `origin` at a scratch
   repo, copy `.env` in, run with `--repo-root <tempclone> --skip-docker`. Verify: one commit
   touching only the style-guide file, pushed; a second run exits 0 quietly.
4. Failure spot-checks on the temp clone: bad token → exit 3; dirty target file → exit 4; broken
   `origin` URL → exit 5, restore the URL, re-run → the push retry fires.
5. Real run without `--skip-docker` when a change is pending → confirm build/up and that the
   `.state/style-guide-rebuild-pending` flag is created and removed.
6. After registering cron, trigger it once out of band (`run-parts`-style manual run as the same
   user, e.g. `bash -lc '<the exact cron command>'`) and check the log — this proves the
   non-interactive environment (no ssh-agent, minimal PATH), which a normal shell run cannot.

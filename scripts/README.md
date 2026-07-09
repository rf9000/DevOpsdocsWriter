# scripts/

Host-side tooling that runs on the VM, outside the docsWriter container.

## sync-style-guide.sh

Keeps `.claude/skills/docs-writer/references/style-guide.md` in sync with its upstream source:
[`Continia/Continia-agent-friendly-style-guidelines`](https://github.com/Continia/Continia-agent-friendly-style-guidelines) → `docsguidelines/llmfriendly/style-guide.md` (branch `main`).

The local file is a **verbatim copy** of upstream by design — local deltas live in
`style-guide-supplement.md` — so the script replaces it wholesale. Runs daily via cron on the
Linux VM and does, in order:

1. Fetch the upstream file (GitHub Contents API, token from `.env`).
2. Compare with the local copy (line-ending and BOM tolerant; `git status` is the authoritative
   gate, so CRLF/LF differences never cause churn commits).
3. If different: `git pull --ff-only`, overwrite the file, commit **only that file** to `main`, push.
4. `docker compose build` + `docker compose up -d` so the container runs with the new guide.

If nothing changed, it logs one line and exits. Logs go to `.state/style-guide-sync.log`.

### Usage

```bash
bash scripts/sync-style-guide.sh               # full sync
bash scripts/sync-style-guide.sh --dry-run     # fetch + compare + report only
bash scripts/sync-style-guide.sh --skip-docker # sync + push, no container rebuild
```

`--repo-root <path>` and `--env-file <path>` exist for testing against a throwaway clone.

### Configuration (`.env` in the repo root)

| Key | Required | Default |
|---|---|---|
| `STYLE_GUIDE_GITHUB_TOKEN` | yes | — (fine-grained PAT, **Contents: read-only**, scoped to the style-guide repo) |
| `STYLE_GUIDE_COMPOSE_DIR` | yes¹ | — (the directory containing `docker-compose.yml`, **or** the full path to the compose file itself) |
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

### Cron registration (run once on the VM, as the user that owns the git clone)

```bash
crontab -e
```

Add (adjust the repo path):

```cron
0 6 * * * /bin/bash /home/azureuser/path/to/DevOpsdocsWriter/scripts/sync-style-guide.sh >> /home/azureuser/path/to/DevOpsdocsWriter/.state/cron-style-guide.log 2>&1
```

The script logs itself to `.state/style-guide-sync.log`; the cron redirect only catches anything
unexpected outside the script's own logging.

**Prerequisites on the VM — check before the first scheduled run:**

- **Non-interactive `git push` must work** for the cron user in the repo clone: either an SSH
  remote with a passphrase-less key (or an agent available to cron), or an HTTPS remote with a
  stored credential helper. The script sets `GIT_TERMINAL_PROMPT=0`, so a missing credential
  fails fast (exit 5, retried the next day) instead of hanging.
- The cron user must be able to run docker without sudo (member of the `docker` group).
- The clone must be on `main`. The script refuses to run otherwise.

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

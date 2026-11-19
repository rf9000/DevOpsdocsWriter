# Style-guide sync: safe, visible on the dashboard, and forceable

Date: 2026-11-19. Size: a small project across two repos (DevOpsdocsWriter, monitor-the-situation).

## Intent

The docs-writer style guide (`.claude/skills/docs-writer/references/style-guide.md`) must follow its
upstream, `Continia/Continia-agent-friendly-style-guidelines` →
`docsguidelines/llmfriendly/style-guide.md`. When upstream changes, the new guide is copied into
this repo, committed, and pushed to `rf9000/DevOpsdocsWriter`, without a person doing it. When that
does not happen, the dashboard says so, so nobody assumes the agent runs on the newest guide. An
admin can start a sync from the dashboard instead of waiting for the next scheduled run.

## Current state

- `scripts/sync-style-guide.sh` already does fetch → compare → commit only that file → push →
  `docker compose build` + `up -d`. It has never completed a sync: the read token was unapproved
  until recently, and the script was never in the VM crontab.
- A copy of the script lives in `skill-distributor`. That service is not really in use, so this
  repo's script is the live one. skill-distributor is out of scope.
- Upstream is produced by a generator whose output is unstable. The current upstream file
  (commit `d76806e`, 2026-11-10) is damaged: it opens with generator chatter, wraps the guide in an
  unclosed code fence, and stops inside section 2.2 of 11. The last four versions were 153, 751,
  683 and 157 lines. A verbatim sync today would replace the working 632-line guide with it.
- The dashboard shows nothing about the style guide. It has a pattern for host-side actions: the
  monitor writes a request file into `monitor-requests` (mounted at `/vol/requests`), and a
  host cron script running every minute picks it up (`deploy/factcheck-run-request.sh`).

## Goals

1. A damaged upstream file is never committed.
2. Every sync run leaves a status the dashboard can read.
3. The dashboard shows when the guide is not the newest, and why.
4. A "Sync now" button on the dashboard starts a sync within about a minute.
5. The sync actually runs on the VM (cron registered).

Non-goals: fixing the upstream generator; anything in skill-distributor; syncing other files than
`style-guide.md`; changing the supplement or the precedence rules.

Anti-goal: a force path that pushes a damaged guide. "Sync now" forces a run, not acceptance.

## Approaches

- **A. Keep the sync in this repo, add a gate, a status file and a request-file trigger
  (chosen).** Reuses the working script and the dashboard's existing request-file pattern. No new
  service, no new credentials in the monitor.
- **B. Run the sync through skill-distributor.** Rejected by the owner: the distributor is not
  really used.
- **C. A GitHub Action in the upstream repo that pushes here.** Needs a write token for this repo
  stored upstream and a change in a repo owned by others; the container rebuild would still need a
  host job. Rejected.

## Design

### DevOpsdocsWriter: `scripts/sync-style-guide.sh`

**Sanity gate**, after the fetch and before the compare. Upstream is rejected when any of these
holds:

- the first non-empty line is not a level-1 heading (`# `);
- a section listed in the file's own table of contents has no matching `## N.` heading (this
  catches truncation without hard-coding the number of sections);
- the file ends inside an open code fence;
- it has fewer than 60% of the local file's lines.

A rejection logs the reason, makes no change, and exits with the new code **7** ("upstream
rejected"). It is retried on the next run, so it recovers by itself once upstream is regenerated.

**Status file**, written on every exit path (atomic: write a temp file, then rename). Path from
`STYLE_GUIDE_STATUS_FILE` in `.env`; default `.state/style-guide-sync.status.json`. On the VM it
points into `monitor-requests`, which the monitor already mounts. Shape:

```json
{
  "at": "2026-11-19T06:06:12Z",
  "result": "synced | up-to-date | rejected | failed",
  "exitCode": 7,
  "reason": "upstream ends inside section 2.2; sections 3-11 missing",
  "inSync": false,
  "upstreamCommit": "d76806e",
  "upstreamCommitAt": "2026-11-10T09:14:00Z",
  "lastSyncedAt": "2026-10-20T06:06:10Z",
  "trigger": "cron | dashboard",
  "by": "user@example.com"
}
```

`inSync` is true only when the local file equals upstream after normalization. `upstreamCommit`
comes from one extra call to the GitHub commits API for the file path (same read token); if that
call fails the fields are omitted and the sync continues. `lastSyncedAt` is carried over from the
previous status file when the run did not sync. A `--trigger <name>` and `--by <who>` argument pair
feeds the last two fields. `--dry-run` writes no status file.

### DevOpsdocsWriter: `scripts/sync-style-guide-request.sh` (new)

Host cron, every minute. Takes a `flock`, exits when `styleguide-sync.request.json` is absent,
renames it to `styleguide-sync.running.json`, runs the sync with `--trigger dashboard --by <by>`,
and deletes the running file. A leftover running file from a VM that stopped mid-run is cleared
the same way the fact-check script does it.

### Cron on the VM

- `@reboot sleep 360 && sync-style-guide.sh` — the VM is deallocated daily and often started after
  06:00, so a fixed time is missed most days.
- `0 6 * * *` the same command, for days the VM stays up.
- `* * * * *` `sync-style-guide-request.sh`.

Registering these is a manual step on the VM; `scripts/README.md` gets the exact lines.

### monitor-the-situation

- Config: `STYLEGUIDE_REQUEST_DIR` (writable, `/vol/requests`); unset hides the feature.
- A `StyleGuideSync` class modelled on `FactCheckRunner`: reads the status file plus the
  request/running files, and writes the request with the `wx` flag so two clicks make one request.
- The snapshot's docs-writer entry carries the status. The docs-writer card gets one line:
  - green "Style guide: in sync · checked 2 h ago";
  - red "Style guide: not the newest · upstream rejected: <reason> · since 10 Nov";
  - red "Style guide: sync failed (exit 5: push failed)";
  - amber "Style guide: last check 3 days ago" when the status is older than 48 hours, which is
    how a missing cron line shows up;
  - grey "no sync status yet" when the file is absent.
- `POST /api/styleguide/sync`, gated to the same role as "Run check now", returns 202 and logs to
  the action log. The button reads "Sync now", and shows "requested" / "running" while a request
  is pending.

### Cleanup in this repo

`scripts/README.md`, `README.md` and `.env.example` are updated for the gate, exit code 7, the
status file, the request script and the cron lines.

## Testing

- The script: a bash test under `tests/scripts/` that runs it against a throwaway clone with a
  local bare `origin` and a stubbed fetch (a `STYLE_GUIDE_FETCH_URL` override pointing at a
  `file://` fixture). Cases: good upstream syncs and writes status; each gate rule rejects with
  exit 7 and leaves the file untouched; up to date; push failure writes `failed`.
- The monitor: unit tests for `StyleGuideSync` (state machine, double request, missing and
  malformed status file) and the route's role gate, in the style of the fact-check tests.

## Left to the builder

Exact wording and placement of the card line; the gate's implementation details in bash; whether
the status writer is a function or a trap.

## Calls made without the owner (correct these if wrong)

- The container rebuild after a sync stays as it is today.
- "Sync now" keeps the gate; there is no override.
- The 60% shrink threshold and the 48-hour staleness threshold.
- skill-distributor's copy of the script and guide are left alone.

## Changes after the final review (2026-11-19)

- The compare now runs before the gate: a local file that already equals upstream is "up to
  date" without being judged. This is the way out when the gate wrongly refuses a healthy guide
  (copy it in by hand and commit); there is still no override flag.
- More gate rules: an empty table of contents, a last line that is half a table row, a last line
  that is a heading. The table of contents is read case-insensitively and with bulleted entries.
  Fences follow CommonMark (tilde fences, at most 3 spaces of indent).
- No "must end with a newline" rule: the healthy upstream guide has no trailing newline.
- Known gap: a cut in the middle of a sentence inside the last section is not detected.
- The sync takes a lock, so a cron run and a dashboard request cannot run in the same clone at
  once; the later one is skipped.
- The status reason is cut to 500 characters and stripped of control characters.
- The test hook is `--upstream-file <path>`, not a `STYLE_GUIDE_FETCH_URL` override.

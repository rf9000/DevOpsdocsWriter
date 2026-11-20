# Force a new article — design

Date: 2026-11-20
Size: small change

## Intent

A docs user wants to decide that a feature gets its own article, even when the
classifier (correctly) finds an existing article the change could be folded
into. The classifier was not wrong in the case that prompted this; the user
simply wanted the two articles kept separate. So this is a human override on
top of the classifier's decision, not a change to the classification rules.

## Goals

- A user can force a new article from the work item itself, in two ways:
  - **Comment marker:** a comment containing `#new-article`.
  - **Tag:** the tag `write-docs-new` (configurable), which also triggers the
    run on its own, exactly like `write-docs`.
- The override is deterministic (decided in code, not by an agent) and visible:
  the work-item comment says a new article was forced and what the classifier
  would have done otherwise.

## Non-goals

- No change to `classify-docs.md`, `write-docs.md`, or the code-built agent
  prompts. The drafter receives an ordinary `newfeature` decision.
- No free-text interpretation of comments ("please make a separate article").
- No ledger or dashboard field for forced runs.

## Anti-goals

- docsWriter's own comments must never trigger the override. The note it posts
  therefore never contains the literal marker text.
- A forced run must not lose the classifier's finding: the article it would
  have updated stays visible to the human as a candidate.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| A | Comment marker `#new-article`, override in code after the classifier | Deterministic, testable, no prompt change. Sticky: applies on every later run until the comment is deleted. |
| B | Second trigger tag `write-docs-new` | One-shot (removed after the run), visible on the board. Watcher has to query and remove two tags. |
| C | Let the classifier interpret free-text comments | No syntax to learn, but non-deterministic, needs a prompt change, and can misfire on comments that merely mention other articles. |

**Chosen: A and B together** (the user's pick). They share one override; they
differ only in how the wish is expressed. C is dropped.

## Design

### Detection (`processor.ts`)

`gatherItemContext` already has both inputs: the fetched comments and the work
item's fields. It returns a new `forceNew` value:

- `'comment'` when any comment's stripped text matches `#new-article`
  (case-insensitive, as a whole token, anywhere in the comment);
- `'tag'` when `System.Tags` contains `config.writeDocsNewTag`
  (case-insensitive exact tag match);
- otherwise undefined. When both are present, `'tag'` is reported.

Detecting the tag inside the processor (rather than passing a flag from the
watcher) means `test-item` and `classify-item` honour it with no CLI changes.

### Override

A pure function, applied right after `deps.classifyDocs` in both
`runDocsItem` and `classifyGatheredItem`:

- `kind === 'newfeature'`: unchanged.
- `kind === 'update'`: becomes `newfeature`; `target` / `targetFile` are
  removed and the former target is put first in `candidates` (reason: the
  classifier's update target). `docsFolder` / `idPrefix` are kept — the new
  article lands in the same docs home as the article it would have updated.
- `kind === 'changelog'`: becomes `newfeature`; the home the classifier chose
  is kept.

The result carries `forced: { by: 'comment' | 'tag', from: OutputKind, target?: string }`
so the log line and the work-item comment can report it. Everything
downstream (deliverable filename, drafting prompt, id minting) already keys on
`classification.kind` and needs no change.

### Work-item comment

A code-generated note next to `candidateNote`, for example: "A new article was
forced by a work-item comment. The classifier would otherwise have updated
CB-161." (or "…by the `write-docs-new` tag…", or "…have written a changelog
entry."). Only added when the override actually changed the kind.

### Watcher and config (tag trigger)

- New env `WRITE_DOCS_NEW_TAG`, default `write-docs-new` → `config.writeDocsNewTag`.
- `runPollCycle` queries both tags and processes the de-duplicated union;
  `pruneFailures` and `lookupTriggeredBy` use both tags.
- On success both trigger tags are removed. On failure both stay, so the retry
  is still forced.
- `debug-tags` lists items for both tags.

### Behaviour worth knowing

- The comment marker is sticky by design: "this feature gets its own article"
  is a property of the work item. To undo, delete or edit the comment.
- The tag is one-shot: it is removed after a successful run.

## Left to the builder

- Exact wording of the note and log lines.
- Where the marker constant and the override function live.
- Confirming `getWorkItem` returns `System.Tags` in the gathered work item
  (it is fetched with relations; the watcher's tag helpers read the same field).
- Tests: detection (comment / tag / neither / docsWriter-style comment without
  the marker), the override for each kind, the comment note, the watcher's
  two-tag union and removal, the config default. README, `.env.example`, CLI
  help and `CLAUDE.md` get the new tag and marker.

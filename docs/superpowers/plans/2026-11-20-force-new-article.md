# Force a New Article Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user force docsWriter to write a new article instead of an update or changelog, by a `#new-article` comment or a `write-docs-new` tag on the work item.

**Architecture:** One pure module (`force-new.ts`) detects the wish from the gathered comments and the work item's tags, and rewrites the classifier's decision to `newfeature`. The processor applies it right after the classifier in both the full run and `classify-item`. The watcher polls the second tag as an additional trigger and removes it after a successful run.

**Tech Stack:** Bun, TypeScript, Zod, `bun test`. Dependency injection through the existing `Deps` interfaces (no module mocking).

**Spec:** `docs/superpowers/specs/2026-11-20-force-new-article-design.md`

## Global Constraints

- Comment marker is exactly `#new-article`, matched case-insensitively as a whole token anywhere in a comment's stripped text.
- Force tag comes from env `WRITE_DOCS_NEW_TAG`, default `write-docs-new`, exposed as `config.writeDocsNewTag`. Tag matching is a case-insensitive exact match on one `;`-separated entry of `System.Tags`.
- When both the tag and the marker are present, the source reported is `'tag'`.
- No change to `src/prompts/classify-docs.md`, `src/prompts/write-docs.md`, or any code-built agent prompt in `classifier.ts` / `generator.ts`.
- Text docsWriter posts to the work item must never contain the literal `#new-article`.
- No ledger or dashboard field for forced runs.
- No new product-specific naming or hardcoding.
- `bun test` and `bun run typecheck` pass at the end of every task.

## Review Focus

1. Marker embedded in a longer token (`#new-article-ideas`, `foo#new-article`, `##new-article`) must not force. Test in Task 1.
2. A forced `update` whose target id is already among the candidates must not list it twice. Test in Task 1.
3. Classifier already said `newfeature` while force is requested: decision unchanged, no `forced` field, no note in the comment. Tests in Tasks 1 and 2.
4. A work item carrying both `write-docs` and `write-docs-new` is processed once per poll and loses both tags. Test in Task 3.
5. A failed run of a force-tagged item keeps the force tag, and the item is not pruned from the failure backoff when it carries only the force tag. Test in Task 3.

---

### Task 1: Force-new module and config

**Files:**
- Create: `src/services/force-new.ts`
- Create: `tests/services/force-new.test.ts`
- Modify: `src/services/classifier.ts` (`DocsClassification` gains `forced?`)
- Modify: `src/types/index.ts` (`AppConfig.writeDocsNewTag`)
- Modify: `src/config/index.ts` (env `WRITE_DOCS_NEW_TAG`)
- Modify: `tests/helpers.ts`, `tests/config/config.test.ts`

**Interfaces:**
- Produces, from `src/services/force-new.ts`:
  - `export type ForceNewSource = 'comment' | 'tag';`
  - `export interface ForcedNew { by: ForceNewSource; from: OutputKind; target?: string }`
  - `export function detectForceNew(comments: readonly string[], tags: string, forceTag: string): ForceNewSource | undefined` — `tags` is the raw `System.Tags` string (`"a; b; c"`).
  - `export function applyForceNew(c: DocsClassification, by: ForceNewSource | undefined): DocsClassification`
  - `export function forcedNote(c: DocsClassification, forceTag: string): string`
- Produces: `DocsClassification.forced?: ForcedNew` (import the type into `classifier.ts` with `import type`, so there is no runtime cycle); `AppConfig.writeDocsNewTag: string`.

- [ ] **Step 1: Write the failing config test** in `tests/config/config.test.ts`, following the existing default/override tests:

```ts
expect(cfg.writeDocsNewTag).toBe('write-docs-new');            // default
// with baseEnv({ WRITE_DOCS_NEW_TAG: 'doc-it-new' })
expect(cfg.writeDocsNewTag).toBe('doc-it-new');
```

- [ ] **Step 2: Write the failing module tests** in `tests/services/force-new.test.ts`. Build classifications with a small local helper; use prefix `CB`, folder `continia-banking`.

```ts
describe('detectForceNew', () => {
  test('marker in a comment', () =>
    expect(detectForceNew(['Please split this. #new-article'], '', 'write-docs-new')).toBe('comment'));
  test('marker is case-insensitive', () =>
    expect(detectForceNew(['#New-Article'], '', 'write-docs-new')).toBe('comment'));
  test('marker followed by punctuation', () =>
    expect(detectForceNew(['(#new-article).'], '', 'write-docs-new')).toBe('comment'));
  test.each(['#new-article-ideas', 'foo#new-article', '##new-article', 'new-article', '#new-articles'])(
    'no match for %s', (text) =>
      expect(detectForceNew([text], '', 'write-docs-new')).toBeUndefined());
  test('tag, case-insensitive exact entry', () =>
    expect(detectForceNew([], 'Foo; Write-Docs-New ;bar', 'write-docs-new')).toBe('tag'));
  test('tag that only contains the force tag is not a match', () =>
    expect(detectForceNew([], 'write-docs-new-later; write-docs', 'write-docs-new')).toBeUndefined());
  test('tag wins when both are present', () =>
    expect(detectForceNew(['#new-article'], 'write-docs-new', 'write-docs-new')).toBe('tag'));
  test('neither', () =>
    expect(detectForceNew(['just a comment'], 'write-docs', 'write-docs-new')).toBeUndefined());
});

describe('applyForceNew', () => {
  test('no source: returns the decision unchanged', ...);            // toEqual(input), no `forced`
  test('newfeature: unchanged, no `forced`', ...);
  test('update → newfeature', () => {
    // input: kind 'update', target 'CB-161', targetFile 'payments/export.md',
    //        candidates [{ id: 'CB-200', ... }]
    // expect: kind 'newfeature'; 'target' and 'targetFile' not in result;
    //         docsFolder / idPrefix unchanged;
    //         candidates[0] = { id: 'CB-161', file: 'payments/export.md',
    //                           docsFolder: 'continia-banking',
    //                           reason: "The classifier's update target" };
    //         candidates[1].id === 'CB-200';
    //         forced = { by: 'comment', from: 'update', target: 'CB-161' }
  });
  test('update whose target is already a candidate: listed once, first', ...);
  test('changelog → newfeature', ...); // docsFolder/idPrefix kept; forced = { by: 'tag', from: 'changelog' }
  test('does not mutate its input', ...);
});

describe('forcedNote', () => {
  test('empty when not forced', ...);
  test('comment + update', () => expect(note).toBe(
    '\n\n**New article forced** — requested by a work-item comment. The classifier would otherwise have updated CB-161.'));
  test('tag + changelog', () => expect(note).toBe(
    '\n\n**New article forced** — requested by the `write-docs-new` tag. The classifier would otherwise have written a changelog entry.'));
  test('never contains the marker', () => expect(note).not.toContain('#new-article'));
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test tests/services/force-new.test.ts tests/config/config.test.ts`
Expected: FAIL (module not found; `writeDocsNewTag` undefined).

- [ ] **Step 4: Add the config field.** `WRITE_DOCS_NEW_TAG: z.string().default("write-docs-new")` in `src/config/index.ts`, mapped to `writeDocsNewTag`; add `writeDocsNewTag: string` to `AppConfig` with a doc comment ("Tag that triggers documentation and forces a new article"); add `writeDocsNewTag: 'write-docs-new'` to the config in `tests/helpers.ts`.

- [ ] **Step 5: Implement `src/services/force-new.ts`** with the three functions above, and add `forced?: ForcedNew` to `DocsClassification`. Marker regex: `/(?<![\w#])#new-article(?![\w-])/i`. The note strings are fixed by the tests in Step 2. `applyForceNew` returns a new object and removes the former target from `candidates` before putting it first.

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test tests/services/force-new.test.ts tests/config/config.test.ts && bun run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/services/force-new.ts tests/services/force-new.test.ts src/services/classifier.ts src/types/index.ts src/config/index.ts tests/helpers.ts tests/config/config.test.ts
git commit -m "feat: detect and apply a forced new article"
```

---

### Task 2: Apply the override in the processor

**Files:**
- Modify: `src/services/processor.ts` (`GatheredItem`, `gatherItemContext`, `classifyGatheredItem`, `runDocsItem`)
- Test: `tests/services/processor.test.ts`

**Interfaces:**
- Consumes: `detectForceNew`, `applyForceNew`, `forcedNote`, `ForceNewSource` from Task 1; `config.writeDocsNewTag`.
- Produces: `GatheredItem.forceNew?: ForceNewSource`. `classifyItem` and `processDocsItem` keep their signatures.

- [ ] **Step 1: Write the failing tests** in `tests/services/processor.test.ts`, using the file's existing deps builder and fake classifier. The fake classifier returns `kind: 'update'`, `target: 'CB-161'` unless stated.

```ts
test('gatherItemContext reports forceNew from a comment marker', ...);   // comment text '<div>Own article please #new-article</div>' → forceNew === 'comment'
test('gatherItemContext reports forceNew from the force tag', ...);      // fields['System.Tags'] = 'write-docs-new' → 'tag'
test('gatherItemContext: no marker, no tag → forceNew undefined', ...);
test('classifyItem returns the forced decision', ...);
// marker comment → classification.kind === 'newfeature',
// classification.forced equals { by: 'comment', from: 'update', target: 'CB-161' },
// classification.candidates[0].id === 'CB-161'
test('processDocsItem drafts a forced item as a new article', ...);
// force tag present → generateDocs is called with context.classification.kind === 'newfeature'
// and no context.classification.target; the attachment name is the newfeature
// deliverable name (deliverableFileName(id, { kind: 'newfeature' }));
// the posted comment contains 'New article forced' and 'CB-161'
// and does not contain '#new-article'
test('processDocsItem: force requested but classifier already chose newfeature', ...);
// posted comment does not contain 'New article forced'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/services/processor.test.ts`
Expected: the new tests FAIL (`forceNew` undefined, kind still `update`).

- [ ] **Step 3: Implement.**
  - `gatherItemContext`: after the comments are stripped, compute `forceNew = detectForceNew(comments, String(workItem.fields['System.Tags'] ?? ''), config.writeDocsNewTag)`, log it when set, and return it in `GatheredItem`.
  - `classifyGatheredItem` and `runDocsItem`: wrap the classifier result — `const classification = applyForceNew(await deps.classifyDocs(...), forceNew)`. In `runDocsItem`, log one line when `classification.forced` is set, naming the source and the original kind/target.
  - `runDocsItem` comment body: append `forcedNote(classification, config.writeDocsNewTag)` directly before `candidateNote(classification)`.
  - Nothing else changes: `chosenHome`, `targetFileHomeMismatch`, `deliverableFileName`, `commentHeader` and the drafting context already key on the (now rewritten) classification.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/services/processor.test.ts && bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/processor.ts tests/services/processor.test.ts
git commit -m "feat: force a new article from a work-item comment or tag"
```

---

### Task 3: Watcher polls and removes the force tag; docs

**Files:**
- Modify: `src/services/watcher.ts` (`runPollCycle`, `startWatcher` log)
- Modify: `src/cli/index.ts` (`debug-tags`, help text)
- Modify: `README.md`, `.env.example`, `CLAUDE.md`
- Test: `tests/services/watcher.test.ts`

**Interfaces:**
- Consumes: `config.writeDocsNewTag`. `WatcherDeps` is unchanged; `queryTaggedWorkItems` is called once per tag.

- [ ] **Step 1: Write the failing tests** in `tests/services/watcher.test.ts`, using the file's existing deps builder. `queryTaggedWorkItems` fake returns per tag: `write-docs` → `[101, 102]`, `write-docs-new` → `[102, 103]`.

```ts
test('polls both trigger tags and processes each item once', ...);
// queryTaggedWorkItems called with config.writeDocsTag and config.writeDocsNewTag;
// processDocsItem called exactly once each for 101, 102, 103, in that order
test('removes both trigger tags after a successful run', ...);
// for each documented item: removeTagFromWorkItem called with config.writeDocsTag
// and with config.writeDocsNewTag; addTagToWorkItem with config.docsWrittenTag
test('a failure removing one trigger tag still attempts the other', ...);
test('a failed force-tagged item keeps its tags and its failure record', ...);
// only 103 (force tag only) fails → removeTagFromWorkItem not called for 103;
// on the next cycle stateStore.getFailure(103) is still set (not pruned)
test('dry run removes no tags', ...);
test('triggered-by lookup considers both tags', ...);
// work item updates add only 'write-docs-new' → ledger record carries that user's name
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/services/watcher.test.ts`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement in `runPollCycle`.** Query `config.writeDocsTag`, then `config.writeDocsNewTag`; `itemIds` is the de-duplicated union in that order (use it for `pruneFailures`, the loop, and the skipped count). Pass `[config.writeDocsTag, config.writeDocsNewTag]` to `lookupTriggeredBy`. On success, remove each of the two tags in its own `try`/`catch` with the existing warning log. Update the polling and "Watching tag" log lines to name both tags.

- [ ] **Step 4: Update `debug-tags`** to print one line per trigger tag, and add `WRITE_DOCS_NEW_TAG` to the CLI help ("Tag that triggers documentation and forces a new article (default: write-docs-new)").

- [ ] **Step 5: Update docs.**
  - `.env.example`: commented `# WRITE_DOCS_NEW_TAG=write-docs-new` next to `WRITE_DOCS_TAG`, with a one-line explanation.
  - `README.md`: add `WRITE_DOCS_NEW_TAG` to the optional variables, and a short "Forcing a new article" section: tag `write-docs-new` (one-shot, removed after the run) or a comment containing `#new-article` (applies on every run until the comment is deleted); both turn an update or changelog decision into a new article and the work-item comment names what the classifier would have done.
  - `CLAUDE.md`: pipeline step 1 polls both tags; step 3 notes the code override after the classifier; add `force-new.ts` to the `src/services/` line.

- [ ] **Step 6: Run the full suite**

Run: `bun test && bun run typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/services/watcher.ts src/cli/index.ts tests/services/watcher.test.ts README.md .env.example CLAUDE.md
git commit -m "feat: write-docs-new tag triggers a forced new article"
```

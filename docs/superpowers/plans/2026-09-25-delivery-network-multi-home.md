# Delivery Network (Continia eDocuments): multi-home products

## Context

A work item in area path `Continia Software\Continia eDocuments` fails with:

> docsWriter could not determine the product for this work item: System.AreaPath is
> "Continia Software\Continia eDocuments", which does not map to a known Continia product.

`PRODUCTS` in `src/config/products.ts` has nine entries and none matches the `Continia eDocuments`
segment, so `resolveProduct()` returns undefined and `resolveItemProduct()` emits that message.

It is not a one-line registry add. Every existing product is one area → one docs folder → one
article-id prefix → one AL repo, keyed off `product.prefix`. Delivery Network breaks the last two:

- **No docs home of its own.** `continia.docs.articles/en-us/` has no Delivery Network or
  eDocuments folder. `en-us/settings.json` lists `continia-edocuments-export` /
  `continia-edocuments-import` under `removedProducts`; the content was folded into two mirrored
  subfolders — `continia-document-capture/business-functionality/continia-edocuments/` (34 files,
  `DC-###`) and `continia-document-output/business-functionality/continia-edocuments/` (28 files,
  `DO-###`). Confirmed with the user: articles for this product live in both DC and DO.
- **A third AL repo.** The source is `Continia Delivery Network` —
  `/home/azureuser/repos/Delivery%20Network%20-%20Extensions`. It has no volume mount and no
  `TARGET_REPO_PATH_*`.
- **Prefix and repo share one key.** `resolveItemProduct` does
  `config.targetRepoPaths[product.prefix]`, so a product cannot have prefix `DC`/`DO` but read the
  CDN repo.

**Outcome.** An eDocuments work item resolves to Continia Delivery Network, the classifier searches
both the DC and DO docs folders and picks the one the deliverable belongs to, and the drafting agent
reads the Delivery Network AL repo.

**Scope.** eDocuments only. Four registry entries are separately broken against the current docs
repo and are deliberately left alone: Payment Management, Collection Management, OPplus and
Sustainability all name folders that no longer exist (renamed to kebab-case in the GitBook
migration; Sustainability deleted outright). Noted for follow-up: prefix `CS` now belongs to the
`continia-suite` folder, so the stale Sustainability entry is a live mis-mint risk.

## Design

A product gains a list of candidate docs homes and a separate repo key. The classifier — which
already runs before any drafting and already returns a structured decision — also decides which
home. The generator is unaffected: it still receives one folder and one prefix.

The id-minting rule makes folder granularity matter.
`.claude/skills/docs-article-generator/SKILL.md:78-82` takes "the highest existing `<PREFIX>-`
number in the product's docs folder + 1", so a home must be the whole product folder
(`continia-document-output`), never the `continia-edocuments` subfolder — otherwise a new id
collides with articles elsewhere in DO.

## Global Constraints

- **Single-home products must not change behavior.** The nine existing products keep a
  byte-identical classifier system prompt, drafter system prompt, and work-item comment.
- **Fail closed.** Any ambiguity the classifier cannot resolve (a home it cannot determine, an
  article id whose prefix is outside the product's homes) is a parse failure → `null` → the item is
  retried, never drafted on a guess.
- **Homes have distinct prefixes within a product.** The home a `DC-###`/`DO-###` id belongs to is
  derivable from its prefix; that is what removes the need for a per-candidate agent field.
- `bun run typecheck` and `bun test` stay clean after every task.

## Interfaces

- **Task 1 produces** `DocsHome { docsFolder, prefix }`, `ProductInfo { areaName, name, homes,
  repoKey }`, and the tenth registry entry.
- **Task 2 consumes** `DocsHome`; **produces** `ResolvedHome = DocsHome & { path: string }`,
  `ClassifierContext.homes`, `DocsClassification.docsFolder` / `.idPrefix`,
  `ClassificationCandidate.docsFolder`, and `parseClassification(message, homes)`.
- **Task 3 consumes** all of Task 1 and Task 2; **produces** `GatheredItem.docsHomes`.
- **Task 4 consumes** `DocsClassification.docsFolder` and `ClassificationCandidate.docsFolder`.

## Review Focus

- A single-home product whose classifier emits a `home` field anyway.
- An `update` whose `target` prefix matches one home but whose `targetFile` looks like the other.
- Candidates whose prefix is outside the product's homes (e.g. a `CB-` id in a DC/DO run).
- A product whose docs folders are partly missing on disk (one home resolvable, one not).

---

## Task 1: Product registry — multi-home products and a repo key

**Files:** `src/config/products.ts`, `tests/config/products.test.ts`

### Interfaces

Produces:

```ts
export interface DocsHome {
  /** Folder under `<DOCS_REPO_PATH>/en-us/`, spelled exactly as on disk. */
  docsFolder: string;
  /** The article-id prefix used in that folder. */
  prefix: string;
}

export interface ProductInfo {
  areaName: string;
  name: string;
  /** Candidate docs homes. Exactly one for every product but Delivery Network. */
  homes: readonly DocsHome[];
  /** Key for `TARGET_REPO_PATH_<REPOKEY>`; equals homes[0].prefix for single-home products. */
  repoKey: string;
}
```

`ProductInfo.docsFolder` and `ProductInfo.prefix` are removed.

### Steps

1. **Write the failing tests** in `tests/config/products.test.ts`:
   - `resolveProduct('Continia Software\\Continia Banking\\Banking Connectivity')` →
     `homes[0].prefix === 'CB'`, `homes[0].docsFolder === 'continia-banking'`, `repoKey === 'CB'`,
     `homes.length === 1`.
   - `resolveProduct('Continia Software\\Continia eDocuments')` → `name === 'Continia Delivery
     Network'`, `repoKey === 'CDN'`, `homes` deep-equals
     `[{ docsFolder: 'continia-document-capture', prefix: 'DC' },
       { docsFolder: 'continia-document-output', prefix: 'DO' }]`.
   - `resolveProduct('Continia Software\\Continia eDocuments\\Sending')` resolves the same
     (left-to-right segment scan still works).
   - The exhaustive folder map test becomes a map from `areaName` to
     `homes.map(h => [h.docsFolder, h.prefix])`, with all ten entries; Document Capture and
     Document Output keep their own single-home entries.
   - Every product's `repoKey` equals `homes[0].prefix` except Delivery Network (`CDN`).
   - Within one product, home prefixes are unique (the Global Constraint that makes
     prefix→home derivation sound).
2. `bun test tests/config/products.test.ts` — **Expected:** fails to compile / fails on
   `homes` being undefined.
3. **Implement** in `src/config/products.ts`: add `DocsHome`, reshape `ProductInfo`, keep the terse
   tuple table for the nine single-home products (each mapping to
   `homes: [{ docsFolder, prefix }], repoKey: prefix` so entries stay one line each), and add the
   Delivery Network entry alongside:

   ```ts
   {
     areaName: 'Continia eDocuments',   // the ADO area segment
     name: 'Continia Delivery Network', // the product name used in prompts and comments
     repoKey: 'CDN',
     homes: [
       { docsFolder: 'continia-document-capture', prefix: 'DC' },
       { docsFolder: 'continia-document-output',  prefix: 'DO' },
     ],
   }
   ```

   `resolveProduct()` is unchanged.
4. `bun test tests/config/products.test.ts` — **Expected:** all pass.
5. Commit: `Give products a list of docs homes and a separate repo key`. The rest of the
   codebase still references `product.prefix`/`product.docsFolder` and will not typecheck until
   Task 3; that is expected and `bun run typecheck` is not a gate on this task.

---

## Task 2: Classifier — choose the docs home

**Files:** `src/services/classifier.ts`, `src/prompts/classify-docs.md`,
`tests/services/classifier.test.ts`

### Interfaces

Consumes `DocsHome` (Task 1). Produces:

```ts
export type ResolvedHome = DocsHome & { /** Absolute path to the folder on disk. */ path: string };

export interface ClassificationCandidate {
  id: string;
  /** Path of the article file, relative to `docsFolder`. */
  file: string;
  /** The docs home this candidate lives in (derived from its id prefix). */
  docsFolder: string;
  reason: string;
}

export interface DocsClassification {
  kind: OutputKind;
  /** The docs home the deliverable belongs to (a `docsFolder` of the product). */
  docsFolder: string;
  /** The article-id prefix of that home. */
  idPrefix: string;
  target?: string;
  /** Path of the target article, relative to `docsFolder`. */
  targetFile?: string;
  candidates: ClassificationCandidate[];
  reasoning: string;
}

export interface ClassifierContext {
  /* … unchanged work-item fields … */
  /** The product's candidate docs homes (`docsRepoPath` + `idPrefix` replaced). */
  homes: ResolvedHome[];
  productName: string;
}

export function parseClassification(
  agentMessage: string,
  homes: readonly DocsHome[],
): DocsClassification | null;
```

### Steps

1. **Write the failing tests** in `tests/services/classifier.test.ts`. Update the existing
   `parseClassification` cases to pass `[{ docsFolder: 'continia-banking', prefix: 'CB' }]` (the
   `DC-12` newfeature case gets a DC home), then add:
   - **update, multi-home:** `target: 'DO-44'` with homes `[DC, DO]` → `docsFolder ===
     'continia-document-output'`, `idPrefix === 'DO'`; no `home` field needed.
   - **update, prefix outside the homes:** `target: 'CB-1'` with homes `[DC, DO]` → `null`.
   - **newfeature, multi-home, explicit home:** `home: 'continia-document-capture'` →
     `docsFolder === 'continia-document-capture'`, `idPrefix === 'DC'`.
   - **newfeature, multi-home, missing home:** → `null` (fail closed).
   - **newfeature, multi-home, unknown home:** `home: 'continia-banking'` → `null`.
   - **changelog, multi-home, missing home:** → `null`; with a valid `home` → resolves.
   - **single home:** a `home` field is ignored; `docsFolder`/`idPrefix` come from the one home.
   - **candidates:** with homes `[DC, DO]`, candidates `DC-1`, `DO-2`, `CB-3` → the `CB-3`
     candidate is dropped, `DC-1.docsFolder === 'continia-document-capture'`,
     `DO-2.docsFolder === 'continia-document-output'`.
   - **single-home candidates** carry that home's `docsFolder`.

   And for `buildClassifierSystemPrompt`: update `mockClassifierContext` to `homes`, keep the
   existing single-home assertions, and add a multi-home case asserting both folders and both
   prefixes appear and that a `home` field is required. Add an assertion that the single-home
   prompt does **not** mention `home` / a second folder (the byte-identity constraint).
2. `bun test tests/services/classifier.test.ts` — **Expected:** fails (arity/`homes` errors).
3. **Implement** in `src/services/classifier.ts`:
   - `ResolvedHome`, the reshaped `ClassifierContext`, `ClassificationCandidate.docsFolder`,
     `DocsClassification.docsFolder` + `.idPrefix`.
   - `parseClassification(agentMessage, homes)`: after the `kind` check, resolve the home —
     `update` derives it from `target`'s prefix (a prefix outside `homes` → `null`);
     `newfeature`/`changelog` use the single home when there is one, otherwise require `home`
     to name an allowed `docsFolder` (missing/unknown → `null`). Candidates resolve their home
     from their own id prefix and are dropped when it is outside `homes`.
   - `buildClassifierSystemPrompt`: when `homes.length === 1`, emit today's wording **verbatim**
     (`context.homes[0]` supplying the path and prefix). When there is more than one, enumerate the
     folders with their prefixes, phrase the scope as *the docs home for this deliverable* rather
     than "the product's own folder", and require the `home` field for `newfeature`/`changelog`.
   - `classifyDocsChange` passes `context.homes` into `parseClassification` (both call sites).
4. **Update** `src/prompts/classify-docs.md`: line 7 ("Search ONLY inside that folder"), line 18 and
   line 38 ("target must be an id that exists in the docs folder") gain a multi-home clause; the
   block template gains the optional `home` field and a `docsFolder` on each candidate. The
   concrete paths stay interpolated in TypeScript.
5. `bun test tests/services/classifier.test.ts` — **Expected:** all pass.
6. Commit: `Let the classifier pick which docs home a deliverable belongs to`.

---

## Task 3: Processor — resolve a list of homes

**Files:** `src/services/processor.ts`, `src/services/watcher.ts`, `src/types/index.ts`,
`tests/services/processor.test.ts`, `tests/helpers.ts`

### Interfaces

Consumes Tasks 1 and 2. Produces `GatheredItem.docsHomes: ResolvedHome[]` (replacing
`docsSearchPath`) and `resolveItemProduct` returning `{ product, docsHomes, targetRepoPath }`.

### Steps

1. **Write the failing tests** in `tests/services/processor.test.ts`:
   - Existing `:375` (docs-path scoping) and `:401` (per-product AL repo) — the classifier now
     receives `homes`; assert `homes` is a one-entry list with the product's folder path and
     prefix, and that `DocsContext.docsRepoPath`/`idPrefix` still come from the chosen home.
   - `:482` (missing docs folder) — now means *no* home exists; the message lists every path tried.
   - New: a CDN work item (`System.AreaPath: 'Continia Software\\Continia eDocuments'`) with both
     `continia-document-capture` and `continia-document-output` on disk and
     `targetRepoPaths: { CDN: 'C:/repos/al-cdn' }` → the classifier sees both home paths in
     DC-then-DO order, and `seenCfg.targetRepoPath === 'C:/repos/al-cdn'`.
   - New: a CDN item with only `continia-document-output` on disk → one home reaches the
     classifier (a product keeps working while one folder is mid-migration).
   - New: a CDN item with neither folder → `productIssue` naming both attempted paths.
   - New: a CDN item missing `TARGET_REPO_PATH_CDN` → `productIssue` containing
     `TARGET_REPO_PATH_CDN`.
   - New: the classifier's chosen home drives `DocsContext` — a CDN item whose `classifyDocs` mock
     returns `docsFolder: 'continia-document-output', idPrefix: 'DO'` gives
     `DocsContext.docsRepoPath === <docsDir>/en-us/continia-document-output` and
     `idPrefix === 'DO'`.
   - `:464` (`TARGET_REPO_PATH_DC`) passes unchanged — DC's repoKey is still `DC`.
   - Update every `classifyDocs` mock in the file to return `docsFolder`/`idPrefix`.
2. `bun test tests/services/processor.test.ts` — **Expected:** fails.
3. **Implement** in `src/services/processor.ts`:
   - `resolveItemProduct` looks the repo up by `product.repoKey` and names
     `TARGET_REPO_PATH_${product.repoKey}` in its message; maps each home to
     `join(config.docsRepoPath, 'en-us', home.docsFolder)`, keeps the ones that exist, and fails
     with a `productIssue` listing every path tried only when none exist.
   - `GatheredItem.docsSearchPath` → `docsHomes`; the log line lists all homes and the repo key.
   - Both `classifyDocs` call sites pass `homes: docsHomes`.
   - `DocsContext` is built from the classifier's chosen home: look `classification.docsFolder` up
     in `docsHomes` and use that entry's `path` and `prefix`. A `docsFolder` not among the homes
     cannot occur (the parser fails closed) — throw a clear error if it does.
4. **Update** `src/types/index.ts:13` (the comment now says keyed by product repo key) and
   `src/services/watcher.ts:151-152` (`Source repo [${prefix}]` → repo key wording).
5. **Update** `tests/helpers.ts` if a fixture needs it.
6. `bun test tests/services/processor.test.ts` — **Expected:** all pass.
7. `bun run typecheck` — **Expected:** clean (generator still compiles; Task 4 only changes
   rendering).
8. Commit: `Resolve a list of docs homes per work item and key the AL repo off repoKey`.

---

## Task 4: Generator — cross-home paths in the drafter prompt and the comment

**Files:** `src/services/generator.ts`, `src/services/processor.ts` (`candidateNote`),
`src/prompts/write-docs.md`, `tests/services/generator.test.ts`,
`tests/services/processor.test.ts`

### Interfaces

Consumes `DocsClassification.docsFolder` and `ClassificationCandidate.docsFolder`. `DocsContext`
keeps its shape.

### Steps

1. **Write the failing tests:**
   - `tests/services/generator.test.ts`: the `ctx` fixture's `classification` gains
     `docsFolder: 'continia-banking', idPrefix: 'CB'`. Add: a candidate in the **same** home renders
     as today (bare relative path, no folder prefix); a candidate in a **different** home renders
     with its `docsFolder/` prefix. Same for an `update`'s `targetFile`. Add a multi-home
     counterpart to the `/ONLY inside this folder/i` assertion — with the chosen home's path, the
     drafter is still scoped to one folder.
   - `tests/services/processor.test.ts`: `candidateNote` renders a cross-home candidate with its
     folder prefix and a same-home candidate without one.
2. `bun test tests/services/generator.test.ts tests/services/processor.test.ts` —
   **Expected:** the new cases fail.
3. **Implement:** a shared helper that renders a candidate/target path as `docsFolder/file` when its
   `docsFolder` differs from the decision's `docsFolder`, and as the bare `file` otherwise. Use it
   in `renderDecidedClassification` (generator) and `candidateNote` (processor).
4. **Update** `src/prompts/write-docs.md:24` — "Stay inside the product's docs folder" reads as the
   docs home named in the appended automation rules.
5. `bun test` — **Expected:** the whole suite passes.
6. `bun run typecheck` — **Expected:** clean.
7. Commit: `Qualify cross-home article paths in the drafter prompt and the work-item comment`.

---

## Task 5: Configuration and deployment

**Files:** `.env.example`, `README.md` (if it names per-product repos), plus a deployment note for
the host-side changes that live outside this repo.

### Steps

1. Add a commented `# TARGET_REPO_PATH_CDN=` beside the existing per-product lines in
   `.env.example`, and note that the key is the product's **repo key**, not its article-id prefix.
   `src/config/index.ts` needs no change — the `^TARGET_REPO_PATH_([A-Z][A-Z0-9]*)$` regex already
   accepts `CDN`.
2. `bun test && bun run typecheck` — **Expected:** clean.
3. Commit: `Document the Delivery Network repo path`.
4. **Outside this repo** (report to the user, do not attempt):
   - `docker-compose.yml`, `docs-writer` service: add
     `- TARGET_REPO_PATH_CDN=/repos/delivery-network` and the mount
     `- /home/azureuser/repos/Delivery%20Network%20-%20Extensions:/repos/delivery-network:rw`
     (`rw` because skill-linker junctions `.claude/skills` into the source repo).
   - `/home/azureuser/teams/continia-banking/.env.docs-writer`: add `TARGET_REPO_PATH_CDN`. The
     compose `environment:` block overrides it with the container path, as it already does for
     CB/DC/EM/DO.

---

## Verification

1. `bun run typecheck` and `bun test` clean.
2. `bun src/cli/index.ts classify-item <the failing eDocuments item>` — previously the
   `productIssue` message; now prints a decision with `docsFolder` of `continia-document-capture` or
   `continia-document-output` and a matching `DC-###`/`DO-###` id.
3. Regression: `classify-item` on a known Continia Banking item — output unchanged, and the
   single-home system prompt is byte-identical to before.
4. `bun src/cli/index.ts test-item <id>` — dry run end to end on the eDocuments item.
5. Rebuild the container; `docker compose logs docs-writer` shows
   `Source repo [CDN]: /repos/delivery-network` at startup, and `ls /repos/delivery-network` inside
   the container is non-empty.

Steps 2–5 need a plain terminal (and the Linux host for 5) — the agent SDK will not launch nested
inside a Claude Code session.

## Caveats

- The docs checkout at `/home/azureuser/repos/continia.docs.articles` is at `c3448562c` (Sep 21),
  four days stale. `git pull` and re-confirm the two folder names before relying on them.
- No mounted AL repo has `.alpackages` — CB, DC, DO and CDN alike — so LSP symbol resolution is
  already degraded everywhere and the agents fall back to Grep/Glob/Serena. Not a CDN-specific
  regression, but it caps article accuracy for this product as much as the others.
- The Delivery Network repo is 382 MB and gets mounted read-write for the skills junction.
- Home order matters only as a tie-break hint to the classifier; DC-then-DO is arbitrary (DC has 34
  eDocuments files, DO has 28). Flip it if sending-side items turn out to dominate.
- Docs-folder scoping is advisory prompt text only — there is no SDK read-allowlist, and
  `canUseTool` fences writes to `OUTPUT_DIR` regardless of product. A two-home product relies on the
  same soft boundary the nine single-home products already do; the blast radius is unchanged, but
  the prompt wording carries more weight.

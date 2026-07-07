# Internal Classifier Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a non-optional classifier phase that decides new-article vs delta-update vs changelog *before* the drafting agent runs, returns a structured decision the pipeline enforces in code (drafting instruction, deliverable filename, work-item candidate comment), plus a `classify-item` CLI command for cheap eval runs.

**Architecture:** A new `src/services/classifier.ts` runs a second, small Claude Agent SDK `query()` with read-only tools (`Read`/`Grep`/`Glob`/`LSP`), cwd = the product's AL source repo, and the product's docs folder path. It returns a `DocsClassification` parsed from a `<<<CLASSIFICATION>>>` JSON block. `processor.ts` calls it after context gathering and before skill junctions/drafting; the decision is injected into the drafting system prompt as non-negotiable, drives the deliverable filename (the drafter's `<<<DOCS-OUTPUT-KIND>>>` marker becomes a consistency check only), and its `candidates` list is appended to the work-item comment in code.

**Tech Stack:** Bun (TypeScript), `@anthropic-ai/claude-agent-sdk`, Bun built-in test framework, dependency injection via `Deps` interfaces (no module mocking).

## Global Constraints

- Runtime is **Bun**; run tests with `bun test`, typecheck with `bun run typecheck` (`tsc --noEmit`). Both must pass at the end of every task.
- **No module mocking** — testability comes from `Deps` interfaces (see `ProcessorDeps` in `src/services/processor.ts`).
- Windows repo: paths in code use `join`/`resolve` from `node:path`; never hardcode machine paths (all machine paths come from `.env`).
- No new env vars: the classifier reuses `config.claudeModel`, `config.maxTurns`, `config.targetRepoPath` (already per-product-resolved by the processor), and the product-scoped docs path.
- The docs repo and the AL source repo are READ-ONLY for agents. The classifier gets **no** Write/Edit/Bash tools at all.
- Multi-product: never hardcode `CB` or "Continia Banking" in new code/prompts — always use the resolved `idPrefix`/`productName` (see memory: project is going multi-product).
- Commit after every task with a conventional-commit message ending in:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- All existing tests (92 as of plan writing) must stay green; task test counts below are minimums.

---

### Task 1: Classification types + `parseClassification`

**Files:**
- Modify: `src/types/index.ts` (add `OutputKind`)
- Modify: `src/services/processor.ts:74-75` (re-export `OutputKind` instead of defining it)
- Create: `src/services/classifier.ts`
- Test: `tests/services/classifier.test.ts`

**Interfaces:**
- Consumes: `OutputKind` (moved to `src/types/index.ts`), `PrContext` from `src/types/index.ts`.
- Produces (later tasks rely on these exact names):
  - `interface ClassificationCandidate { id: string; file: string; reason: string }`
  - `interface DocsClassification { kind: OutputKind; target?: string; targetFile?: string; candidates: ClassificationCandidate[]; reasoning: string }`
  - `function parseClassification(agentMessage: string): DocsClassification | null`

- [ ] **Step 1: Move `OutputKind` to `src/types/index.ts`**

In `src/types/index.ts`, add at the end of the file:

```typescript
/** The three kinds of deliverable the pipeline can produce (see code-to-docs.md §6). */
export type OutputKind = 'newfeature' | 'update' | 'changelog';
```

In `src/services/processor.ts`, replace these exact lines:

```typescript
/** The three kinds of deliverable the agent can produce (see code-to-docs.md §6). */
export type OutputKind = 'newfeature' | 'update' | 'changelog';
```

with:

```typescript
export type { OutputKind } from '../types/index.ts';
```

and add `OutputKind` to the existing `import type {...} from '../types/index.ts'` list at the top of `processor.ts` (it is used by `OutputClassification`).

- [ ] **Step 2: Run the full suite to prove the move is behavior-neutral**

Run: `bun run typecheck && bun test`
Expected: typecheck clean, 92 pass (imports of `OutputKind` from `processor.ts` still work via the re-export).

- [ ] **Step 3: Write the failing tests for `parseClassification`**

Create `tests/services/classifier.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import { parseClassification } from '../../src/services/classifier.ts';

const wrap = (json: string) =>
  `Some reasoning text.\n<<<CLASSIFICATION>>>\n${json}\n<<<END-CLASSIFICATION>>>\nbye`;

describe('parseClassification', () => {
  test('parses a full update decision', () => {
    const result = parseClassification(
      wrap(
        JSON.stringify({
          kind: 'update',
          target: 'CB-33',
          targetFile: 'Business functionality/Payment Import/Reconciliation/Account identification methods.md',
          candidates: [{ id: 'CB-161', file: 'Business functionality/Payment Import/Using Templates in Banking Import.md', reason: 'documents templates' }],
          reasoning: 'New columns on the documented Bank Transaction Code Rules page.',
        }),
      ),
    );
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('update');
    expect(result!.target).toBe('CB-33');
    expect(result!.targetFile).toContain('Account identification methods.md');
    expect(result!.candidates).toHaveLength(1);
    expect(result!.candidates[0]!.id).toBe('CB-161');
    expect(result!.reasoning).toContain('Bank Transaction Code Rules');
  });

  test('parses a newfeature decision with candidates and no target', () => {
    const result = parseClassification(
      wrap(JSON.stringify({ kind: 'newfeature', candidates: [{ id: 'DC-12', file: 'a.md', reason: 'related' }], reasoning: 'no home' })),
    );
    expect(result!.kind).toBe('newfeature');
    expect(result!.target).toBeUndefined();
    expect(result!.candidates[0]!.id).toBe('DC-12');
  });

  test('tolerates a ```json fence inside the markers', () => {
    const result = parseClassification(
      wrap('```json\n' + JSON.stringify({ kind: 'changelog', candidates: [], reasoning: 'bug fix' }) + '\n```'),
    );
    expect(result!.kind).toBe('changelog');
  });

  test('normalizes target and candidate ids to upper case', () => {
    const result = parseClassification(
      wrap(JSON.stringify({ kind: 'update', target: 'cb-33', candidates: [{ id: 'cb-161', file: '', reason: '' }], reasoning: '' })),
    );
    expect(result!.target).toBe('CB-33');
    expect(result!.candidates[0]!.id).toBe('CB-161');
  });

  test('returns null when the block is missing', () => {
    expect(parseClassification('no markers here')).toBeNull();
  });

  test('returns null on invalid JSON', () => {
    expect(parseClassification(wrap('{ not json'))).toBeNull();
  });

  test('returns null on an unknown kind', () => {
    expect(parseClassification(wrap(JSON.stringify({ kind: 'rewrite', candidates: [], reasoning: '' })))).toBeNull();
  });

  test('returns null for an update without a valid target', () => {
    expect(parseClassification(wrap(JSON.stringify({ kind: 'update', candidates: [], reasoning: '' })))).toBeNull();
    expect(parseClassification(wrap(JSON.stringify({ kind: 'update', target: '33', candidates: [], reasoning: '' })))).toBeNull();
  });

  test('drops malformed candidates but keeps valid ones', () => {
    const result = parseClassification(
      wrap(
        JSON.stringify({
          kind: 'newfeature',
          candidates: [{ id: 'CB-1', file: 'x.md', reason: 'ok' }, { id: 'not-an-id' }, 'garbage', { file: 'no-id.md' }],
          reasoning: '',
        }),
      ),
    );
    expect(result!.candidates).toHaveLength(1);
    expect(result!.candidates[0]!.id).toBe('CB-1');
  });

  test('defaults missing candidates/reasoning', () => {
    const result = parseClassification(wrap(JSON.stringify({ kind: 'newfeature' })));
    expect(result!.candidates).toEqual([]);
    expect(result!.reasoning).toBe('');
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `bun test tests/services/classifier.test.ts`
Expected: FAIL — cannot resolve `../../src/services/classifier.ts`.

- [ ] **Step 5: Implement types + parser in `src/services/classifier.ts`**

Create `src/services/classifier.ts`:

```typescript
import type { OutputKind, PrContext } from '../types/index.ts';

/** An existing article that could plausibly own the change. */
export interface ClassificationCandidate {
  /** Article id, e.g. `CB-161`. */
  id: string;
  /** Path of the article file, relative to the product docs folder. */
  file: string;
  /** One line: why this article is a plausible home. */
  reason: string;
}

/**
 * The classifier's structured decision, parsed from its
 * `<<<CLASSIFICATION>>>` block. `candidates` are runner-up targets for an
 * `update` and possible existing homes for a `newfeature`; the processor posts
 * them to the work item so a human can second-guess the call.
 */
export interface DocsClassification {
  kind: OutputKind;
  /** Existing article id an update targets (required when kind is `update`). */
  target?: string;
  /** Product-docs-folder-relative path of the target article (when kind is `update`). */
  targetFile?: string;
  /** Other plausible homes for the change (may be empty). */
  candidates: ClassificationCandidate[];
  /** Short justification, logged for diagnosis. */
  reasoning: string;
}

/** Everything the classifier needs to decide; a strict subset of DocsContext. */
export interface ClassifierContext {
  itemId: number;
  itemTitle: string;
  itemType: string;
  itemDescription: string;
  comments: string[];
  pullRequests: PrContext[];
  /** The product's folder inside the docs set (read-only), e.g. `<DOCS_REPO_PATH>/en-us/Continia Banking`. */
  docsRepoPath: string;
  /** Resolved product name (docs folder name), e.g. "Continia Banking". */
  productName: string;
  /** The product's article-id prefix, e.g. "CB". */
  idPrefix: string;
}

const CLASSIFICATION_BLOCK_RE =
  /<<<CLASSIFICATION>>>\s*([\s\S]*?)\s*<<<END-CLASSIFICATION>>>/;

const ARTICLE_ID_RE = /^[A-Z][A-Z0-9]*-\d+$/;

/**
 * Parse the classifier agent's `<<<CLASSIFICATION>>>` JSON block. Strict on
 * the decision itself (unknown kind or an update without a valid target is a
 * parse failure → null, so the pipeline fails closed and retries), lenient on
 * the informational fields (malformed candidates are dropped, missing
 * reasoning defaults to empty).
 */
export function parseClassification(agentMessage: string): DocsClassification | null {
  const block = CLASSIFICATION_BLOCK_RE.exec(agentMessage)?.[1];
  if (!block) return null;
  const raw = block.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  const kind = obj.kind;
  if (kind !== 'newfeature' && kind !== 'update' && kind !== 'changelog') return null;

  const target =
    typeof obj.target === 'string' ? obj.target.trim().toUpperCase() : undefined;
  if (kind === 'update' && (!target || !ARTICLE_ID_RE.test(target))) return null;

  const candidates: ClassificationCandidate[] = [];
  if (Array.isArray(obj.candidates)) {
    for (const entry of obj.candidates) {
      if (typeof entry !== 'object' || entry === null) continue;
      const c = entry as Record<string, unknown>;
      if (typeof c.id !== 'string') continue;
      const id = c.id.trim().toUpperCase();
      if (!ARTICLE_ID_RE.test(id)) continue;
      candidates.push({
        id,
        file: typeof c.file === 'string' ? c.file : '',
        reason: typeof c.reason === 'string' ? c.reason : '',
      });
    }
  }

  return {
    kind,
    ...(kind === 'update'
      ? {
          target,
          targetFile: typeof obj.targetFile === 'string' ? obj.targetFile : undefined,
        }
      : {}),
    candidates,
    reasoning: typeof obj.reasoning === 'string' ? obj.reasoning : '',
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun run typecheck && bun test`
Expected: typecheck clean; all tests pass (92 existing + 10 new).

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/services/processor.ts src/services/classifier.ts tests/services/classifier.test.ts
git commit -m "feat: add classification types and <<<CLASSIFICATION>>> parser

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Classifier prompt file + prompt builders

**Files:**
- Create: `src/prompts/classify-docs.md`
- Modify: `src/services/classifier.ts` (append two functions)
- Test: `tests/services/classifier.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `ClassifierContext` from Task 1.
- Produces:
  - `function buildClassifierSystemPrompt(promptPath: string, context: ClassifierContext): string`
  - `function buildClassifierUserPrompt(context: ClassifierContext): string`

- [ ] **Step 1: Create `src/prompts/classify-docs.md`**

Create the file with exactly this content:

```markdown
You are a documentation classifier for Continia solutions. A work item in Azure DevOps has been tagged for documentation. Your ONLY job is to decide what kind of documentation deliverable the change requires and, when it is an update, which existing article it targets. You do NOT write any documentation.

## How to work

- Your working directory is the AL **source repository** (the merged, current state of the code — it is the source of truth over work-item prose and PR descriptions).
- Use `Read`, `Grep`, `Glob`, and `LSP` to inspect the changed AL objects (the linked PR's changed files are your entry points) and reconstruct which user-facing pages, fields, columns, and actions the change touches. Collect their **captions** — captions are how you match against the docs.
- The product's published docs folder (read-only) is given in the run instructions. Search ONLY inside that folder. Match articles on **shared UI captions / the same page or setup object**, never on title-word similarity.
- You have no write tools. NEVER ask a question or wait for input — decide and answer.

## Decision rules

Classify the change as exactly one of `newfeature`, `update`, or `changelog`:

- **`update`** — an existing article documents the page/setup object the changed UI lives on, and this change extends what it covers. **New fields, columns, or actions on a page that an existing article documents are ALWAYS `update`** — even when the capability feels new, and even when several articles plausibly cover the area. Multi-candidate ambiguity decides only *which* article to target, never the kind: prefer the article that documents the page the new UI lives on; list the others as `candidates`.
- **`changelog`** — a pure bug fix or internal refactor with no user-visible change.
- **`newfeature`** — no existing article documents the changed surface: a genuinely NEW page, setup object, or workflow (never new UI elements on a documented page), or only tangential/title-similarity matches exist. List the closest existing articles as `candidates` so a human can consider merging instead.

To find the target/candidates: grep the docs folder for the exact page captions and field captions your changed AL objects carry, and read the matching articles' headings. An article "documents the page" when it has a section about that page or walks through its fields/actions — a passing mention does not count.

## Required output

End your final message with EXACTLY this block (valid JSON between the markers):

<<<CLASSIFICATION>>>
{
  "kind": "newfeature | update | changelog",
  "target": "<PREFIX>-### — ONLY when kind is update: the existing article id to update",
  "targetFile": "path of the target article relative to the product docs folder — ONLY when kind is update",
  "candidates": [
    { "id": "<PREFIX>-###", "file": "relative path", "reason": "one line: why this article is a plausible home" }
  ],
  "reasoning": "2-4 sentences: the captions you matched and why you chose this kind and target"
}
<<<END-CLASSIFICATION>>>

Rules for the block:
- `kind` is required and must be one of the three values.
- `target` and `targetFile` are required when kind is `update`, and must be omitted otherwise. Never mint a new id — `target` must be an id that exists in the docs folder.
- `candidates` may be empty. For `update`, list runner-up articles that also relate. For `newfeature`, list the closest existing articles (these are shown to a human as "consider updating instead").
- Do not put anything else between the markers.
```

- [ ] **Step 2: Write the failing tests for the prompt builders**

Append to `tests/services/classifier.test.ts`:

```typescript
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  buildClassifierSystemPrompt,
  buildClassifierUserPrompt,
} from '../../src/services/classifier.ts';
import type { ClassifierContext } from '../../src/services/classifier.ts';

function mockClassifierContext(overrides: Partial<ClassifierContext> = {}): ClassifierContext {
  return {
    itemId: 78567,
    itemTitle: 'Description templates on bank transaction code rules',
    itemType: 'Feature',
    itemDescription: 'Adds per-rule description templates.',
    comments: ['first comment'],
    pullRequests: [
      {
        pullRequestId: 49391,
        title: 'Per-rule templates',
        description: 'Adds two columns.',
        status: 'completed',
        sourceRefName: 'refs/heads/feature/x',
        targetRefName: 'refs/heads/main',
        changedFiles: ['src/BankTransactionCodeRules.Page.al'],
      },
    ],
    docsRepoPath: 'C:/docs/en-us/Continia Banking',
    productName: 'Continia Banking',
    idPrefix: 'CB',
    ...overrides,
  };
}

describe('buildClassifierSystemPrompt', () => {
  test('appends product, prefix, and docs-folder scope to the base prompt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'clf-prompt-'));
    const promptPath = join(dir, 'classify-docs.md');
    writeFileSync(promptPath, 'BASE CLASSIFIER PROMPT');
    try {
      const sys = buildClassifierSystemPrompt(promptPath, mockClassifierContext());
      expect(sys).toContain('BASE CLASSIFIER PROMPT');
      expect(sys).toContain('Continia Banking');
      expect(sys).toContain('`CB`');
      expect(sys).toContain('C:/docs/en-us/Continia Banking');
      expect(sys).toContain('READ-ONLY');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('buildClassifierUserPrompt', () => {
  test('contains the work item, comments, and PR changed files, and asks only for classification', () => {
    const prompt = buildClassifierUserPrompt(mockClassifierContext());
    expect(prompt).toContain('78567');
    expect(prompt).toContain('Description templates on bank transaction code rules');
    expect(prompt).toContain('first comment');
    expect(prompt).toContain('src/BankTransactionCodeRules.Page.al');
    expect(prompt).toContain('<<<CLASSIFICATION>>>');
    expect(prompt).not.toContain('Write the article');
  });

  test('omits empty sections', () => {
    const prompt = buildClassifierUserPrompt(
      mockClassifierContext({ comments: [], pullRequests: [], itemDescription: '' }),
    );
    expect(prompt).not.toContain('## Work item comments');
    expect(prompt).not.toContain('## Linked pull requests');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test tests/services/classifier.test.ts`
Expected: FAIL — `buildClassifierSystemPrompt` is not exported.

- [ ] **Step 4: Implement the builders in `src/services/classifier.ts`**

Add at the top of the file: `import { readFileSync } from 'fs';`

Append to the file:

```typescript
/**
 * The classifier's system prompt: the focused decision rules from
 * `src/prompts/classify-docs.md` plus the per-run product scope. Deliberately
 * small — the classifier sees classification rules only, never drafting rules.
 */
export function buildClassifierSystemPrompt(
  promptPath: string,
  context: ClassifierContext,
): string {
  const basePrompt = readFileSync(promptPath, 'utf-8');
  return [
    basePrompt,
    `## Run scope\n\n` +
      `- This work item belongs to the product **${context.productName}** (article-id prefix \`${context.idPrefix}\`).\n` +
      `- The published docs set for ${context.productName} is at \`${context.docsRepoPath}\` — this is the product's own folder and it is READ-ONLY. Search ONLY inside this folder; never scan other products' folders.\n` +
      `- Article ids in \`target\` and \`candidates\` must use the \`${context.idPrefix}-###\` form and must exist in that folder.`,
  ].join('\n\n');
}

/** The classification request: the work item context, mirroring buildUserPrompt in generator.ts. */
export function buildClassifierUserPrompt(context: ClassifierContext): string {
  const lines: string[] = [
    '# Classification request',
    '',
    `Decide the documentation deliverable kind (newfeature / update / changelog) for the work item below, and when it is an update, the target article. Answer with the \`<<<CLASSIFICATION>>>\` block; do NOT write any documentation.`,
    '',
    '## Work item',
    `**ID:** ${context.itemId}`,
    `**Type:** ${context.itemType}`,
    `**Title:** ${context.itemTitle}`,
  ];

  if (context.itemDescription) {
    lines.push('', '**Description:**', context.itemDescription);
  }

  if (context.comments.length > 0) {
    lines.push('', '## Work item comments');
    context.comments.forEach((c, i) => {
      lines.push('', `**Comment ${i + 1}:**`, c);
    });
  }

  if (context.pullRequests.length > 0) {
    lines.push('', '## Linked pull requests');
    for (const pr of context.pullRequests) {
      lines.push(
        '',
        `### PR #${pr.pullRequestId}: ${pr.title}`,
        `**Status:** ${pr.status}  |  **Source:** ${pr.sourceRefName} → ${pr.targetRefName}`,
      );
      if (pr.description) {
        lines.push('', '**PR description (may be out of date — verify against the current code):**', pr.description);
      }
      if (pr.changedFiles.length > 0) {
        lines.push('', '**Changed files:**', ...pr.changedFiles.map((f) => `- ${f}`));
      }
    }
    lines.push(
      '',
      'Use the changed files as entry points to find the pages, fields, columns, and actions this change touches, and their captions. The AL code in your working directory is the source of truth; on any mismatch between prose and code, code wins.',
    );
  }

  return lines.join('\n');
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run typecheck && bun test`
Expected: typecheck clean; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/prompts/classify-docs.md src/services/classifier.ts tests/services/classifier.test.ts
git commit -m "feat: add classifier prompt and prompt builders

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `classifyDocsChange` SDK runner

**Files:**
- Modify: `src/services/classifier.ts` (append the runner)

**Interfaces:**
- Consumes: `buildClassifierSystemPrompt`, `buildClassifierUserPrompt`, `parseClassification` (Tasks 1-2); `AppConfig` from `src/types/index.ts`; `query` from `@anthropic-ai/claude-agent-sdk`.
- Produces: `async function classifyDocsChange(config: AppConfig, context: ClassifierContext): Promise<DocsClassification>` — **throws** a descriptive `Error` when the agent fails or the block cannot be parsed (the pipeline fails closed; the tag stays and the item retries).

Note: this mirrors the `query()` loop in `generateDocs` (`src/services/generator.ts:120-230`) — read that function before writing this one. There is deliberately no unit test for the network loop (the codebase does not mock the SDK); it is exercised via the `classify-item` CLI in Task 6. The prompt-path convention: the classifier prompt lives next to the drafting prompt, derived from `config.promptPath` by replacing the filename — do NOT add a new env var.

- [ ] **Step 1: Implement the runner**

Add to the imports at the top of `src/services/classifier.ts`:

```typescript
import { dirname, join } from 'path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { AppConfig } from '../types/index.ts';
```

(and merge `OutputKind, PrContext` into the same `import type` from `../types/index.ts`.)

Append:

```typescript
/** The classifier prompt lives next to the drafting prompt (`config.promptPath`). */
export function classifierPromptPath(config: AppConfig): string {
  return join(dirname(config.promptPath), 'classify-docs.md');
}

/**
 * Run the classifier agent: a second, small SDK query with read-only tools,
 * cwd = the product's AL source repo. Returns the parsed decision; throws when
 * the agent errors or its final message has no parseable
 * `<<<CLASSIFICATION>>>` block, so the caller fails closed and the item is
 * retried on a later poll instead of drafting with a guessed kind.
 */
export async function classifyDocsChange(
  config: AppConfig,
  context: ClassifierContext,
): Promise<DocsClassification> {
  const systemPrompt = buildClassifierSystemPrompt(classifierPromptPath(config), context);

  let result: string | undefined;
  let resultSubtype: string | undefined;
  let resultError: string | undefined;
  const assistantTexts: string[] = [];
  let turnCount = 0;
  const stderrChunks: string[] = [];

  try {
    for await (const message of query({
      prompt: buildClassifierUserPrompt(context),
      options: {
        model: config.claudeModel,
        maxTurns: config.maxTurns,
        tools: ['Read', 'Grep', 'Glob', 'LSP'],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: systemPrompt,
        },
        settingSources: ['project'],
        cwd: config.targetRepoPath,
        stderr: (data: string) => {
          stderrChunks.push(data);
        },
      },
    })) {
      if (message.type === 'assistant') {
        turnCount++;
        const text = message.message.content
          .filter((b): b is { type: 'text'; text: string } => (b as { type: string }).type === 'text')
          .map((b) => b.text)
          .join('\n');
        if (text.trim()) assistantTexts.push(text);
      }
      if (message.type === 'result') {
        console.log(
          `  Classifier cost: $${message.total_cost_usd.toFixed(4)} | ${message.usage.input_tokens ?? 0} in / ${message.usage.output_tokens ?? 0} out | ${message.num_turns} turns`,
        );
        resultSubtype = message.subtype;
        if (message.subtype === 'success') {
          result = message.result;
        } else {
          const errs = message.errors?.length ? message.errors.join('; ') : '';
          resultError = errs || undefined;
        }
      }
    }
  } catch (err) {
    const base = err instanceof Error ? err.message : String(err);
    const stderr = stderrChunks.join('').trim();
    throw new Error(`Classifier failed: ${base}${stderr ? `\n  stderr tail: ${stderr.slice(-2000)}` : ''}`);
  }

  // Fall back to the last assistant text when no success result arrived — the
  // classification block may still be there (mirrors generateDocs recovery).
  const finalText = result ?? assistantTexts[assistantTexts.length - 1];
  if (!finalText) {
    throw new Error(
      `Classifier produced no output (subtype=${resultSubtype ?? 'none'}, turns=${turnCount})${resultError ? `: ${resultError}` : ''}`,
    );
  }

  const classification = parseClassification(finalText);
  if (!classification) {
    const tail = finalText.trim().slice(-1500);
    throw new Error(
      `Classifier returned no parseable <<<CLASSIFICATION>>> block (subtype=${resultSubtype ?? 'none'}). Final message tail:\n${tail}`,
    );
  }
  return classification;
}
```

- [ ] **Step 2: Verify**

Run: `bun run typecheck && bun test`
Expected: typecheck clean; all tests pass (no new tests in this task).

- [ ] **Step 3: Commit**

```bash
git add src/services/classifier.ts
git commit -m "feat: add classifyDocsChange SDK runner (read-only classifier agent)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Drafting agent receives the decision as non-negotiable

**Files:**
- Modify: `src/services/generator.ts` (DocsContext + buildSystemPrompt)
- Modify: `src/prompts/write-docs.md` (Classify hard rule)
- Test: `tests/services/generator.test.ts`

**Interfaces:**
- Consumes: `DocsClassification` from `src/services/classifier.ts`.
- Produces: `DocsContext` gains a required field `classification: DocsClassification`. `buildSystemPrompt` renders the decided kind instead of asking the agent to classify. Task 5 relies on the exact field name `classification`.

- [ ] **Step 1: Write the failing tests**

In `tests/services/generator.test.ts`: first find every object literal typed as `DocsContext` (there is a `mockContext`-style helper or inline literals — read the file) and add to each:

```typescript
classification: { kind: 'newfeature' as const, candidates: [], reasoning: '' },
```

Then append these tests (adapting the context-building helper name to what the file actually uses):

```typescript
describe('buildSystemPrompt classification handoff', () => {
  test('renders a decided update with target and forbids re-classifying', () => {
    // build a context exactly like the existing prompt tests do, with:
    // classification: { kind: 'update', target: 'CB-33', targetFile: 'Reconciliation/Account identification methods.md', candidates: [{ id: 'CB-161', file: 'Using Templates in Banking Import.md', reason: 'documents templates' }], reasoning: 'columns live on a documented page' }
    const sys = buildSystemPrompt(promptPath, [], ctx);
    expect(sys).toContain('already decided');
    expect(sys).toContain('DELTA UPDATE NOTE');
    expect(sys).toContain('CB-33');
    expect(sys).toContain('Account identification methods.md');
    expect(sys).toContain('do NOT re-classify');
    // decision criteria are gone — the drafter is no longer asked to choose
    expect(sys).not.toContain('Then choose exactly one output');
  });

  test('renders a decided newfeature with next-unused-id instruction', () => {
    // classification: { kind: 'newfeature', candidates: [], reasoning: '' }
    const sys = buildSystemPrompt(promptPath, [], ctx);
    expect(sys).toContain('already decided');
    expect(sys).toContain('NEW ARTICLE');
    expect(sys).toContain('next unused');
  });

  test('renders a decided changelog', () => {
    // classification: { kind: 'changelog', candidates: [], reasoning: '' }
    const sys = buildSystemPrompt(promptPath, [], ctx);
    expect(sys).toContain('already decided');
    expect(sys).toContain('CHANGELOG ENTRY');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/services/generator.test.ts`
Expected: FAIL — `classification` is not a known property / new assertions unmet.

- [ ] **Step 3: Implement in `src/services/generator.ts`**

Add the import:

```typescript
import type { DocsClassification } from './classifier.ts';
```

Add to `DocsContext` (after `idPrefix`):

```typescript
  /** The upstream classifier's decision — the drafter must produce exactly this kind. */
  classification: DocsClassification;
```

In `buildSystemPrompt`, replace the two bullets `- **Classify.** ...` (the line starting with `` `- **Classify.** Reconstruct the feature ``) **and** its three nested kind bullets (`  - **update** ...`, `  - **changelog** ...`, `  - **newfeature** ...`) with the following code (insert it in the same position in the template string). Keep every other bullet in the section unchanged:

```typescript
      `${renderDecidedClassification(context)}\n` +
```

And add this function at module level (below `buildSystemPrompt`):

```typescript
/**
 * Render the upstream classifier's decision as a non-negotiable instruction.
 * The drafter never re-litigates new-vs-update — that decision was made by the
 * dedicated classifier phase; the drafter only executes it (and may voice
 * disagreement in the work-item comment).
 */
function renderDecidedClassification(context: DocsContext): string {
  const c = context.classification;
  const lines: string[] = [];
  const disagree =
    `If, while drafting, you find strong evidence this decision is wrong, still produce the decided kind and add one line to the work-item comment starting with "Classifier disagreement:" explaining why.`;
  const marker = `Echo exactly this decision in the \`<<<DOCS-OUTPUT-KIND>>>\` marker.`;

  if (c.kind === 'update') {
    lines.push(
      `- **Classification (already decided — do NOT re-classify).** An upstream classifier examined the changed AL objects and the docs set and decided: this run produces a DELTA UPDATE NOTE targeting the existing article **${c.target}**${c.targetFile ? ` (\`${c.targetFile}\`)` : ''}. Do not search for a different target and do not mint a new id. ${disagree} ${marker}`,
      `- The delta note is read by a human writer and MUST use the scaffold from \`code-to-docs.md\` §6: open with \`# Update to ${c.target} — <article title>\`, then a blockquote banner stating it is an update to an existing article (not a standalone page), then \`Target file:\` and \`Work item:\` lines, then \`## What changed\`, \`## Suggested edits\`, and \`## Points to verify before publishing\`. A delta note delivered as bare content without this scaffold is a FAILED output — proportionality caps the edits' content, never the scaffold.`,
    );
  } else if (c.kind === 'changelog') {
    lines.push(
      `- **Classification (already decided — do NOT re-classify).** An upstream classifier decided: this run produces a CHANGELOG ENTRY (pure bug fix / internal refactor, no user-visible change) — not an article. Follow the changelog template in the style guide (Functional Area + business-focused description + 5-digit work-item ID). ${disagree} ${marker}`,
    );
  } else {
    lines.push(
      `- **Classification (already decided — do NOT re-classify).** An upstream classifier decided: this run produces a NEW ARTICLE. AUTO-SELECT the next unused \`${context.idPrefix}-###\` (highest existing \`${context.idPrefix}-\` number + 1) and scale the article depth to the change magnitude (a minor change is ONE tight section, not a multi-section build-up). ${disagree} ${marker}`,
    );
  }

  if (c.candidates.length > 0) {
    lines.push(
      `- Related existing articles found by the classifier (for cross-links${c.kind === 'newfeature' ? '; the pipeline already tells the work item they may be merge candidates' : ''}): ${c.candidates.map((x) => `${x.id}${x.file ? ` (\`${x.file}\`)` : ''}`).join(', ')}.`,
    );
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: Update `src/prompts/write-docs.md`**

Replace the sentence at the start of the `- **Classify.**` hard-rule bullet:

```markdown
- **Classify.** Search the product's docs folder for an existing article covering this feature, matching on shared UI captions / the same page or setup object (not title wording).
```

with:

```markdown
- **Classification is decided upstream.** A dedicated classifier phase has already decided whether this run produces a new article, a delta update (and its target article), or a changelog entry — the decision is stated in the appended automation rules. Follow it exactly; do NOT re-classify or switch kinds. If you find strong evidence it is wrong, still produce the decided kind and add a one-line "Classifier disagreement:" note to the work-item comment. The rest of this rule describes the decision criteria for reference only:
```

(keep the remainder of that bullet's existing text unchanged, as reference context).

Finally, keep the build green: `processor.ts` builds a `DocsContext` literal and now misses the new required field. In `src/services/processor.ts`, inside the `const context: DocsContext = {...}` literal, add:

```typescript
      classification: { kind: 'newfeature', candidates: [], reasoning: 'pre-classifier default' },
```

(This stub is replaced with the real classifier call in Task 5.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run typecheck && bun test`
Expected: typecheck clean; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/services/generator.ts src/prompts/write-docs.md src/services/processor.ts tests/services/generator.test.ts
git commit -m "feat: drafting prompt takes the classification as a fixed upstream decision

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Processor wiring — classify before drafting, filename + candidate comment from the decision

**Files:**
- Modify: `src/services/processor.ts`
- Test: `tests/services/processor.test.ts`

**Interfaces:**
- Consumes: `classifyDocsChange`, `ClassifierContext`, `DocsClassification` from `src/services/classifier.ts`; `DocsContext.classification` from Task 4.
- Produces (Task 6 relies on these):
  - `ProcessorDeps` gains `classifyDocs: (config: AppConfig, context: ClassifierContext) => Promise<DocsClassification>`
  - `function candidateNote(c: DocsClassification): string` (exported, pure)
  - `async function gatherItemContext(config, itemId, deps)` returning `GatheredItem | { productIssue: string }` where `interface GatheredItem { workItem: WorkItemResponse; itemTitle: string; itemType: string; itemDescription: string; comments: string[]; pullRequests: PrContext[]; product: ProductInfo; docsSearchPath: string; targetRepoPath: string }` (exported)

- [ ] **Step 1: Write the failing tests**

In `tests/services/processor.test.ts`, extend `makeDeps` with a default classifier mock (add to the object literal):

```typescript
    classifyDocs: mock(() =>
      Promise.resolve({
        kind: 'newfeature' as const,
        candidates: [],
        reasoning: 'test default',
      }),
    ),
```

Add these tests to the `processDocsItem` describe block:

```typescript
  test('classifier decision drives the deliverable filename (drafter marker cannot override)', async () => {
    const config = cfg();
    const deps = makeDeps({
      classifyDocs: mock(() =>
        Promise.resolve({
          kind: 'update' as const,
          target: 'CB-33',
          targetFile: 'Reconciliation/Account identification methods.md',
          candidates: [],
          reasoning: 'documented page',
        }),
      ),
      generateDocs: mock((_cfg, ctx: DocsContext) => {
        writeFileSync(ctx.outputPath, '# Update note\n');
        // drafter marker disagrees — classifier must win
        return Promise.resolve(
          'done\n<<<DOCS-OUTPUT-KIND>>>\nkind: newfeature\n<<<END-DOCS-OUTPUT-KIND>>>',
        );
      }),
    });

    const result = await processDocsItem(config, 42, deps);

    expect(result.documented).toBe(true);
    expect(result.articlePath).toContain('workitem-42-update-CB-33.md');
  });

  test('passes the classification into the drafting context', async () => {
    const config = cfg();
    let seen: DocsContext | undefined;
    const deps = makeDeps({
      classifyDocs: mock(() =>
        Promise.resolve({ kind: 'changelog' as const, candidates: [], reasoning: 'bug fix' }),
      ),
      generateDocs: mock((_cfg, ctx: DocsContext) => {
        seen = ctx;
        writeFileSync(ctx.outputPath, 'entry\n');
        return Promise.resolve('done');
      }),
    });

    await processDocsItem(config, 42, deps);

    expect(seen!.classification.kind).toBe('changelog');
  });

  test('classifier failure fails the item before any drafting or junctions', async () => {
    const config = cfg();
    const deps = makeDeps({
      classifyDocs: mock(() => Promise.reject(new Error('no parseable block'))),
    });

    const result = await processDocsItem(config, 42, deps);

    expect(result.documented).toBe(false);
    expect(result.error).toContain('no parseable block');
    expect(deps.createSkillJunctions).toHaveBeenCalledTimes(0);
    expect(deps.generateDocs).toHaveBeenCalledTimes(0);
  });

  test('newfeature candidates are appended to the posted comment as merge suggestions', async () => {
    const config = cfg();
    const addWorkItemComment = mock(() => Promise.resolve({}));
    const deps = makeDeps({
      classifyDocs: mock(() =>
        Promise.resolve({
          kind: 'newfeature' as const,
          candidates: [
            { id: 'CB-33', file: 'Reconciliation/Account identification methods.md', reason: 'documents the rules page' },
            { id: 'CB-161', file: 'Using Templates in Banking Import.md', reason: 'documents templates' },
          ],
          reasoning: '',
        }),
      ),
      addWorkItemComment,
    });

    await processDocsItem(config, 42, deps);

    const comment = (addWorkItemComment.mock.calls[0] as unknown[])[2] as string;
    expect(comment).toContain('candidates for updating instead');
    expect(comment).toContain('CB-33');
    expect(comment).toContain('CB-161');
  });

  test('update runner-up candidates are posted as "also relates to"', async () => {
    const config = cfg();
    const addWorkItemComment = mock(() => Promise.resolve({}));
    const deps = makeDeps({
      classifyDocs: mock(() =>
        Promise.resolve({
          kind: 'update' as const,
          target: 'CB-33',
          candidates: [{ id: 'CB-161', file: '', reason: 'templates concept' }],
          reasoning: '',
        }),
      ),
      addWorkItemComment,
    });

    await processDocsItem(config, 42, deps);

    const comment = (addWorkItemComment.mock.calls[0] as unknown[])[2] as string;
    expect(comment).toContain('Also relates to');
    expect(comment).toContain('CB-161');
  });
```

Also update the existing test `'full flow: generates, attaches, links and comments; junctions cleaned up'`: its comment `// No classification marker → defaults to a new-feature article.` is now wrong — change it to `// Default classifier mock → new-feature article.` (the assertion itself, `workitem-42-newfeature.md`, still holds via the default `classifyDocs` mock).

If any other existing test relied on the drafter's `<<<DOCS-OUTPUT-KIND>>>` marker naming the file (search the test file for `DOCS-OUTPUT-KIND`), rewrite it to set the same decision on a `classifyDocs` mock instead, keeping its filename assertion. Keep the `extractOutputKind` unit tests unchanged — the function still exists as a consistency check.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/services/processor.test.ts`
Expected: FAIL — `classifyDocs` is not a known `ProcessorDeps` property.

- [ ] **Step 3: Implement in `src/services/processor.ts`**

1. Imports — add:

```typescript
import * as classifier from './classifier.ts';
import type { ClassifierContext, DocsClassification } from './classifier.ts';
```

2. `ProcessorDeps` — add after `generateDocs`:

```typescript
  classifyDocs: (config: AppConfig, context: ClassifierContext) => Promise<DocsClassification>;
```

3. `defaultDeps` — add: `classifyDocs: classifier.classifyDocsChange,`

4. Extract gathering into an exported function. Move the body of `processDocsItem` from `const workItem = await deps.getWorkItem(...)` through the end of the PR-gathering loop (everything up to but NOT including the `discoverSkills` call) into:

```typescript
export interface GatheredItem {
  workItem: WorkItemResponse;
  itemTitle: string;
  itemType: string;
  itemDescription: string;
  comments: string[];
  pullRequests: PrContext[];
  product: ProductInfo;
  docsSearchPath: string;
  targetRepoPath: string;
}

/**
 * Fetch the work item, resolve its product, and gather comments + linked PR
 * context — the shared front half of both classification and full processing.
 */
export async function gatherItemContext(
  config: AppConfig,
  itemId: number,
  deps: ProcessorDeps = defaultDeps,
): Promise<GatheredItem | { productIssue: string }> {
  const workItem = await deps.getWorkItem(config, itemId);
  const itemTitle = String(workItem.fields['System.Title'] ?? '');
  const itemType = String(workItem.fields['System.WorkItemType'] ?? '');
  const itemDescription = stripHtmlToText(
    String(workItem.fields['System.Description'] ?? ''),
  );
  log(`  #${itemId}: "${itemTitle}" (${itemType})`);

  const resolution = resolveItemProduct(config, workItem);
  if ('productIssue' in resolution) return resolution;
  const { product, docsSearchPath, targetRepoPath } = resolution;
  log(`  #${itemId}: Product: ${product.docsFolder} (${product.prefix}) — docs scope: ${docsSearchPath}`);

  const rawComments = await deps.getWorkItemComments(config, itemId);
  const comments = rawComments
    .map((c) => stripHtmlToText(String(c.text ?? '')))
    .filter((c) => c.length > 0);
  if (comments.length > 0) log(`  #${itemId}: ${comments.length} comment(s)`);

  const prRefs = deps.parsePullRequestRefs(workItem);
  const pullRequests: PrContext[] = [];
  for (const ref of prRefs) {
    try {
      pullRequests.push(await deps.getPullRequestContext(config, ref));
    } catch (err) {
      log(`  #${itemId}: Skipping PR #${ref.pullRequestId} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (pullRequests.length > 0) log(`  #${itemId}: ${pullRequests.length} linked PR(s)`);

  return { workItem, itemTitle, itemType, itemDescription, comments, pullRequests, product, docsSearchPath, targetRepoPath };
}
```

5. Rewrite `processDocsItem` to use it. Inside the existing `try`, replace the moved code with:

```typescript
    const gathered = await gatherItemContext(config, itemId, deps);
    if ('productIssue' in gathered) {
      log(`  #${itemId}: Product unresolved — ${gathered.productIssue}`);
      return {
        itemId,
        documented: false,
        error: gathered.productIssue,
        productIssue: gathered.productIssue,
      };
    }
    const { itemTitle, itemType, itemDescription, comments, pullRequests, product, docsSearchPath, targetRepoPath } = gathered;
    const effectiveConfig: AppConfig = { ...config, targetRepoPath };

    // Non-optional classifier phase: decide new-vs-update-vs-changelog BEFORE
    // any drafting tokens are spent. A classifier failure fails the item
    // (tag kept → retried later); we never draft on a guessed kind.
    log(`  #${itemId}: Classifying (new article vs update vs changelog)...`);
    const classification = await deps.classifyDocs(effectiveConfig, {
      itemId,
      itemTitle,
      itemType,
      itemDescription,
      comments,
      pullRequests,
      docsRepoPath: docsSearchPath,
      productName: product.docsFolder,
      idPrefix: product.prefix,
    });
    log(
      `  #${itemId}: Classifier: ${classification.kind}` +
        `${classification.target ? ` → ${classification.target}` : ''}` +
        `${classification.candidates.length ? ` | candidates: ${classification.candidates.map((c) => c.id).join(', ')}` : ''}` +
        `${classification.reasoning ? `\n  #${itemId}: Classifier reasoning: ${classification.reasoning}` : ''}`,
    );
```

6. In the `DocsContext` literal, replace the Task-4 stub line `classification: { kind: 'newfeature', ... }` with `classification,`.

7. Replace the post-drafting classification block. Change:

```typescript
    const classification = extractOutputKind(summary);
    const deliverableName = deliverableFileName(itemId, classification);
```

to:

```typescript
    // The classifier's decision names the deliverable; the drafter's marker is
    // only a consistency check (it may not override the upstream decision).
    const drafterView = extractOutputKind(summary);
    if (
      drafterView.kind !== classification.kind ||
      (classification.kind === 'update' && drafterView.target !== classification.target)
    ) {
      log(
        `  #${itemId}: WARNING — drafter marker (${drafterView.kind}${drafterView.target ? ` ${drafterView.target}` : ''}) ` +
          `disagrees with classifier (${classification.kind}${classification.target ? ` ${classification.target}` : ''}); classifier wins.`,
      );
    }
    const deliverableName = deliverableFileName(itemId, {
      kind: classification.kind,
      target: classification.target,
    });
```

and update the `log(... Classified as ...)` line below it to read from `classification` (same fields, unchanged shape).

8. Candidate note — add the exported pure helper near `extractCommentBody`:

```typescript
/**
 * Render the classifier's candidate articles as a Markdown addendum for the
 * work-item comment. Built in code (not by the agent) so the honesty note is
 * guaranteed present: for a new article, the human sees which existing
 * articles were considered; for an update, which runner-ups also relate.
 */
export function candidateNote(c: DocsClassification): string {
  if (c.candidates.length === 0) return '';
  const list = c.candidates
    .map((x) => `- ${x.id}${x.file ? ` (\`${x.file}\`)` : ''}${x.reason ? ` — ${x.reason}` : ''}`)
    .join('\n');
  return c.kind === 'newfeature'
    ? `\n\n**Possible existing homes** — a new article was written, but these articles may be candidates for updating instead:\n${list}`
    : `\n\n**Also relates to**\n${list}`;
}
```

and change `const commentBody = extractCommentBody(summary);` to:

```typescript
    const commentBody = extractCommentBody(summary) + candidateNote(classification);
```

9. Update the doc comment on `extractOutputKind` (it is now a consistency check, not the naming authority): replace its last sentence with: `The classifier phase is the naming authority; this marker is kept as a consistency check on the drafter.`

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run typecheck && bun test`
Expected: typecheck clean; all tests pass (old + 5 new). If a watcher/integration test constructs `ProcessorDeps` directly (check `tests/integration/end-to-end.test.ts` and `tests/services/watcher.test.ts` for `generateDocs:` mocks), add the same default `classifyDocs` mock there.

- [ ] **Step 5: Commit**

```bash
git add src/services/processor.ts tests/services/processor.test.ts tests/integration/end-to-end.test.ts tests/services/watcher.test.ts
git commit -m "feat: run the classifier phase before drafting; decision drives filename and candidate comment

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: `classify-item` CLI command

**Files:**
- Modify: `src/services/processor.ts` (add `classifyItem`)
- Modify: `src/cli/index.ts` (new command + HELP)
- Test: `tests/services/processor.test.ts`

**Interfaces:**
- Consumes: `gatherItemContext`, `ProcessorDeps` (Task 5); `classifyDocs` dep.
- Produces: `async function classifyItem(config: AppConfig, itemId: number, deps?: ProcessorDeps): Promise<{ classification: DocsClassification } | { productIssue: string }>`

- [ ] **Step 1: Write the failing tests**

Append to `tests/services/processor.test.ts` (import `classifyItem` from the processor):

```typescript
describe('classifyItem', () => {
  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), 'clf-out-'));
    docsDir = mkdtempSync(join(tmpdir(), 'clf-docs-'));
    mkdirSync(join(docsDir, 'en-us', 'Continia Banking'), { recursive: true });
  });
  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(docsDir, { recursive: true, force: true });
  });

  test('classifies without drafting, junctions, or ADO writes', async () => {
    const config = cfg();
    const deps = makeDeps({
      classifyDocs: mock(() =>
        Promise.resolve({ kind: 'update' as const, target: 'CB-33', candidates: [], reasoning: 'r' }),
      ),
    });

    const result = await classifyItem(config, 42, deps);

    expect('classification' in result && result.classification.target).toBe('CB-33');
    expect(deps.generateDocs).toHaveBeenCalledTimes(0);
    expect(deps.createSkillJunctions).toHaveBeenCalledTimes(0);
    expect(deps.uploadAttachment).toHaveBeenCalledTimes(0);
    expect(deps.addWorkItemComment).toHaveBeenCalledTimes(0);
  });

  test('returns productIssue for an unmapped area path', async () => {
    const config = cfg();
    const deps = makeDeps({
      getWorkItem: mock(() =>
        Promise.resolve(
          mockWorkItem({ fields: { ...mockWorkItem().fields, 'System.AreaPath': 'Continia Software\\InHouse' } }),
        ),
      ),
    });

    const result = await classifyItem(config, 42, deps);

    expect('productIssue' in result).toBe(true);
    expect(deps.classifyDocs).toHaveBeenCalledTimes(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/services/processor.test.ts`
Expected: FAIL — `classifyItem` is not exported.

- [ ] **Step 3: Implement `classifyItem` in `src/services/processor.ts`**

```typescript
/**
 * Classification-only entry point (the `classify-item` CLI command): gather
 * the work item context and run just the classifier — no junctions, no
 * drafting, no ADO writes. Cheap enough to replay repeatedly when tuning the
 * classification rules against known work items.
 */
export async function classifyItem(
  config: AppConfig,
  itemId: number,
  deps: ProcessorDeps = defaultDeps,
): Promise<{ classification: DocsClassification } | { productIssue: string }> {
  const gathered = await gatherItemContext(config, itemId, deps);
  if ('productIssue' in gathered) return gathered;
  const { itemTitle, itemType, itemDescription, comments, pullRequests, product, docsSearchPath, targetRepoPath } = gathered;
  const classification = await deps.classifyDocs(
    { ...config, targetRepoPath },
    {
      itemId,
      itemTitle,
      itemType,
      itemDescription,
      comments,
      pullRequests,
      docsRepoPath: docsSearchPath,
      productName: product.docsFolder,
      idPrefix: product.prefix,
    },
  );
  return { classification };
}
```

- [ ] **Step 4: Add the CLI command in `src/cli/index.ts`**

Import `classifyItem` next to the existing `processDocsItem` import. Add the case after `test-item`:

```typescript
  case 'classify-item': {
    const itemIdArg = process.argv[3];
    if (!itemIdArg || isNaN(Number(itemIdArg))) {
      console.error('Usage: docswriter classify-item <work-item-id>');
      process.exitCode = 1;
      break;
    }
    const config = loadConfig();
    config.dryRun = true;
    console.log(`Classifying work item #${itemIdArg} (no article is drafted, no ADO writes)\n`);
    const result = await classifyItem(config, Number(itemIdArg));
    if ('productIssue' in result) {
      console.log(`Failed: ${result.productIssue}`);
      process.exitCode = 1;
      break;
    }
    console.log(JSON.stringify(result.classification, null, 2));
    break;
  }
```

In `HELP`, add below the `test-item` line:

```
  classify-item <id>  Run only the classifier for a work item (prints the JSON decision)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run typecheck && bun test`
Expected: typecheck clean; all tests pass. Also run `bun src/cli/index.ts help` and confirm the new command is listed.

- [ ] **Step 6: Commit**

```bash
git add src/services/processor.ts src/cli/index.ts tests/services/processor.test.ts
git commit -m "feat: add classify-item CLI command for classifier-only eval runs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Documentation + final verification

**Files:**
- Modify: `CLAUDE.md` (Pipeline section)
- Modify: `README.md` (pipeline/commands description — read it first and match its structure)

**Interfaces:** none (docs only).

- [ ] **Step 1: Update `CLAUDE.md`**

In the `## Pipeline (per tagged work item)` list, insert a new step 3 after the `processor.ts` gathering step and renumber the rest:

```markdown
3. `classifier.ts` runs a read-only classifier agent (Read/Grep/Glob/LSP, cwd = the product's AL repo) that decides `newfeature`/`update`/`changelog` + the target article, returned as a structured `<<<CLASSIFICATION>>>` block. Non-optional: a classifier failure fails the item (tag kept → retried). The decision drives the drafting prompt, the deliverable filename, and a code-generated candidate-articles note in the work-item comment.
```

In `## Commands`, add below the `test-item` line:

```markdown
- `bun src/cli/index.ts classify-item <id>` — classifier-only run for a work item (prints the JSON decision)
```

In `## File Layout`, extend the services line to mention the classifier: `watcher, processor, classifier (classification-only agent), generator (agent runner), skill-linker, skill-loader`.

- [ ] **Step 2: Update `README.md`**

Read `README.md`; wherever it describes the per-item pipeline and the CLI commands, mirror the same two additions (classifier phase + `classify-item` command) in the document's own style. Keep edits minimal.

- [ ] **Step 3: Final full verification**

Run: `bun run typecheck && bun test`
Expected: typecheck clean; full suite green.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: document the classifier phase and classify-item command

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Post-plan manual verification (main session, not a subagent)

After all tasks: run `bun src/cli/index.ts classify-item 78567` two or three times and confirm the decision is stable (`update` targeting a real article, with candidates listed), then `bun src/cli/index.ts test-item 78567` and confirm the deliverable filename matches the classifier decision and the summary file ends with the candidate note.

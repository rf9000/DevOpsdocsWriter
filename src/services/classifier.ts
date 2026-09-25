import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { AppConfig, OutputKind, PrContext } from '../types/index.ts';
import type { DocsHome } from '../config/products.ts';

/** One of a product's docs homes, located on disk. */
export type ResolvedHome = DocsHome & {
  /** Absolute path to the folder, e.g. `<DOCS_REPO_PATH>/en-us/continia-banking`. */
  path: string;
};

/** An existing article that could plausibly own the change. */
export interface ClassificationCandidate {
  /** Article id, e.g. `CB-161`. */
  id: string;
  /** Path of the article file, relative to `docsFolder`. */
  file: string;
  /**
   * The docs home this candidate lives in, derived from its id prefix. Equal to
   * the decision's `docsFolder` for every single-home product.
   */
  docsFolder: string;
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
  /**
   * The docs home the deliverable belongs to — one of the product's
   * `docsFolder`s. The only product with a real choice here is Continia
   * Delivery Network; everyone else has exactly one home.
   */
  docsFolder: string;
  /** The article-id prefix of that home, e.g. "DO". */
  idPrefix: string;
  /** Existing article id an update targets (required when kind is `update`). */
  target?: string;
  /** Path of the target article, relative to `docsFolder` (when kind is `update`). */
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
  /**
   * The product's docs homes that exist on disk (read-only), in tie-break
   * order. One entry for every product but Continia Delivery Network.
   */
  homes: ResolvedHome[];
  /** Resolved solution name, e.g. "Continia Banking". */
  productName: string;
}

const CLASSIFICATION_BLOCK_RE =
  /<<<CLASSIFICATION>>>\s*([\s\S]*?)\s*<<<END-CLASSIFICATION>>>/;

const ARTICLE_ID_RE = /^[A-Z][A-Z0-9]*-\d+$/;

/** The home an article id belongs to, identified by its prefix. */
function homeOfId(id: string, homes: readonly DocsHome[]): DocsHome | undefined {
  const prefix = id.slice(0, id.lastIndexOf('-'));
  return homes.find((h) => h.prefix === prefix);
}

/**
 * Parse the classifier agent's `<<<CLASSIFICATION>>>` JSON block. Strict on
 * the decision itself (unknown kind, an update without a valid target, or a
 * deliverable whose docs home cannot be resolved is a parse failure → null, so
 * the pipeline fails closed and retries), lenient on the informational fields
 * (malformed candidates are dropped, missing reasoning defaults to empty).
 *
 * `homes` are the product's docs homes. With one home everything resolves to
 * it and the agent is never asked. With several (Continia Delivery Network),
 * an `update` derives its home from the target id's prefix, while a
 * `newfeature` / `changelog` must name it in a `home` field.
 */
export function parseClassification(
  agentMessage: string,
  homes: readonly DocsHome[],
): DocsClassification | null {
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

  // Resolve the docs home the deliverable belongs to. One home → no choice to
  // make (and an agent-supplied `home` is ignored). Several → the target's
  // prefix decides an update; anything else must be named explicitly.
  let home: DocsHome | undefined;
  if (homes.length === 1) {
    home = homes[0];
  } else if (kind === 'update') {
    home = homeOfId(target!, homes);
  } else {
    const named = typeof obj.home === 'string' ? obj.home.trim() : '';
    home = named ? homes.find((h) => h.docsFolder === named) : undefined;
  }
  if (!home) return null;

  const candidates: ClassificationCandidate[] = [];
  if (Array.isArray(obj.candidates)) {
    for (const entry of obj.candidates) {
      if (typeof entry !== 'object' || entry === null) continue;
      const c = entry as Record<string, unknown>;
      if (typeof c.id !== 'string') continue;
      const id = c.id.trim().toUpperCase();
      if (!ARTICLE_ID_RE.test(id)) continue;
      // A candidate whose prefix belongs to no home of this product is another
      // product's article — the id would mint or cross-link out of scope.
      const candidateHome = homeOfId(id, homes);
      if (!candidateHome) continue;
      candidates.push({
        id,
        file: typeof c.file === 'string' ? c.file : '',
        docsFolder: candidateHome.docsFolder,
        reason: typeof c.reason === 'string' ? c.reason : '',
      });
    }
  }

  return {
    kind,
    docsFolder: home.docsFolder,
    idPrefix: home.prefix,
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
  return [basePrompt, buildRunScope(context)].join('\n\n');
}

/**
 * The per-run product scope. A single-home product gets exactly the wording it
 * got before multi-home products existed — the nine of them must see no prompt
 * change. A product with several homes is additionally asked to pick one.
 */
function buildRunScope(context: ClassifierContext): string {
  const homes = context.homes;
  if (homes.length === 1) {
    const home = homes[0]!;
    return (
      `## Run scope\n\n` +
      `- This work item belongs to the product **${context.productName}** (article-id prefix \`${home.prefix}\`).\n` +
      `- The published docs set for ${context.productName} is at \`${home.path}\` — this is the product's own folder and it is READ-ONLY. Search ONLY inside this folder; never scan other products' folders.\n` +
      `- Article ids in \`target\` and \`candidates\` must use the \`${home.prefix}-###\` form and must exist in that folder.`
    );
  }

  const list = homes
    .map((h) => `  - \`${h.path}\` — article-id prefix \`${h.prefix}\``)
    .join('\n');
  const folderNames = homes.map((h) => `\`${h.docsFolder}\``).join(' / ');
  const prefixForms = homes.map((h) => `\`${h.prefix}-###\``).join(' or ');
  return (
    `## Run scope\n\n` +
    `- This work item belongs to the product **${context.productName}**. Its documentation does not have a folder of its own — it lives in ${homes.length} folders of the docs set, so you must also decide WHICH of them the deliverable belongs to.\n` +
    `- Candidate docs homes, in tie-break order (they are READ-ONLY). Search ONLY inside these folders; never scan other products' folders:\n${list}\n` +
    `- Pick the home whose captions and subject match the changed AL code (for example, the receiving/capture side versus the sending/output side). The order above is a tie-break hint only, not a default.\n` +
    `- Article ids in \`target\` and \`candidates\` must use the prefix of the folder the article lives in (${prefixForms}) and must exist in that folder. An id with any other prefix belongs to a different product — never use one.\n` +
    `- When \`kind\` is \`newfeature\` or \`changelog\`, you MUST add a \`"home"\` field to the block naming the chosen folder exactly as spelled here: ${folderNames}. When \`kind\` is \`update\`, the home follows from the target id's prefix and \`"home"\` is not needed.`
  );
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

/** The classifier prompt lives next to the drafting prompt (`config.promptPath`). */
export function classifierPromptPath(config: AppConfig): string {
  return join(dirname(config.promptPath), 'classify-docs.md');
}

// Mirrors generator.ts's `extractAssistantText`: the explicit `unknown[]` param
// annotation is required because the SDK's assistant message `content` field
// otherwise resolves to `any` (its upstream `@anthropic-ai/sdk` types aren't
// installed as a resolvable package here), which makes an inline
// `.filter((b): b is {...} => ...)` type predicate fail with TS7006.
function extractAssistantText(message: { message: { content: unknown[] } }): string {
  return message.message.content
    .filter((b): b is { type: 'text'; text: string } => (b as { type: string }).type === 'text')
    .map((b) => b.text)
    .join('\n');
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
        const text = extractAssistantText(message);
        if (text.trim()) assistantTexts.push(text);
      }
      if (message.type === 'result') {
        console.log(
          `  Classifier cost: $${message.total_cost_usd.toFixed(4)} | ${message.usage.input_tokens ?? 0} in / ${message.usage.output_tokens ?? 0} out | ${message.num_turns} turns`,
        );
        resultSubtype = message.subtype;
        if (message.subtype === 'success') {
          // The CLI reports subtype 'success' with is_error set when the turn
          // itself failed — an API rejection (an unsupported request parameter,
          // say) arrives that way, carrying its message in `result` and writing
          // nothing to stderr. Without this branch the real error is dropped
          // and the process's bare exit code is all that survives.
          if (message.is_error) {
            resultError = message.result?.trim() || undefined;
          } else {
            result = message.result;
          }
        } else {
          const errs = message.errors?.length ? message.errors.join('; ') : '';
          resultError = errs || undefined;
        }
      }
    }
  } catch (err) {
    const base = err instanceof Error ? err.message : String(err);
    const stderr = stderrChunks.join('').trim();
    // A failed result message usually arrives *before* the process exits, so
    // without resultError here the diagnosis is just "exited with code 1" with
    // an empty stderr — the actual cause is already in hand, so report it.
    throw new Error(
      `Classifier failed: ${base}${resultError ? `\n  result error: ${resultError}` : ''}${stderr ? `\n  stderr tail: ${stderr.slice(-2000)}` : ''}`,
    );
  }

  // Fall back to the last assistant text when no success result arrived — the
  // classification block may still be there (mirrors generateDocs recovery).
  const finalText = result ?? assistantTexts[assistantTexts.length - 1];
  if (!finalText) {
    throw new Error(
      `Classifier produced no output (subtype=${resultSubtype ?? 'none'}, turns=${turnCount})${resultError ? `: ${resultError}` : ''}`,
    );
  }

  // The block can straddle a streamed-message boundary, leaving the final
  // result text with the end marker but not the opening one — when the final
  // text alone does not parse, retry against the run's full assistant text.
  const classification =
    parseClassification(finalText, context.homes) ??
    parseClassification(assistantTexts.join('\n'), context.homes);
  if (!classification) {
    const tail = finalText.trim().slice(-1500);
    throw new Error(
      `Classifier returned no parseable <<<CLASSIFICATION>>> block (subtype=${resultSubtype ?? 'none'}, checked the final message and the full run text). Final message tail:\n${tail}`,
    );
  }
  return classification;
}

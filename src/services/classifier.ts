import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { AppConfig, OutputKind, PrContext } from '../types/index.ts';

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

  // The block can straddle a streamed-message boundary, leaving the final
  // result text with the end marker but not the opening one — when the final
  // text alone does not parse, retry against the run's full assistant text.
  const classification =
    parseClassification(finalText) ?? parseClassification(assistantTexts.join('\n'));
  if (!classification) {
    const tail = finalText.trim().slice(-1500);
    throw new Error(
      `Classifier returned no parseable <<<CLASSIFICATION>>> block (subtype=${resultSubtype ?? 'none'}, checked the final message and the full run text). Final message tail:\n${tail}`,
    );
  }
  return classification;
}

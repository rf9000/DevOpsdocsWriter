import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

import type {
  AppConfig,
  DocsProcessResult,
  OutputKind,
  PrContext,
  PullRequestRef,
  WorkItemComment,
  WorkItemResponse,
} from '../types/index.ts';
import type { DocsContext } from './generator.ts';
import type { DiscoveredSkill } from './skill-loader.ts';

import * as sdk from '../sdk/azure-devops-client.ts';
import * as gen from './generator.ts';
import * as linker from './skill-linker.ts';
import * as classifier from './classifier.ts';
import type { ClassifierContext, DocsClassification } from './classifier.ts';
import { discoverSkills } from './skill-loader.ts';
import { markdownToHtml, stripHtmlToText } from '../utils/html.ts';
import { resolveProduct } from '../config/products.ts';
import type { ProductInfo } from '../config/products.ts';

export interface ProcessorDeps {
  getWorkItem: (config: AppConfig, id: number) => Promise<WorkItemResponse>;
  getWorkItemComments: (config: AppConfig, id: number) => Promise<WorkItemComment[]>;
  parsePullRequestRefs: (workItem: WorkItemResponse) => PullRequestRef[];
  getPullRequestContext: (config: AppConfig, ref: PullRequestRef) => Promise<PrContext>;
  discoverSkills: (skillsRoot: string) => DiscoveredSkill[];
  createSkillJunctions: (targetRepoPath: string, skillsSourceDir: string) => string[];
  removeSkillJunctions: (created: string[]) => void;
  generateDocs: (config: AppConfig, context: DocsContext) => Promise<string>;
  classifyDocs: (config: AppConfig, context: ClassifierContext) => Promise<DocsClassification>;
  uploadAttachment: (
    config: AppConfig,
    fileName: string,
    content: string | Buffer,
  ) => Promise<{ id: string; url: string }>;
  linkAttachmentToWorkItem: (
    config: AppConfig,
    id: number,
    url: string,
    name: string,
    comment: string,
  ) => Promise<unknown>;
  addWorkItemComment: (config: AppConfig, id: number, html: string) => Promise<unknown>;
}

const defaultDeps: ProcessorDeps = {
  getWorkItem: sdk.getWorkItem,
  getWorkItemComments: sdk.getWorkItemComments,
  parsePullRequestRefs: sdk.parsePullRequestRefs,
  getPullRequestContext: sdk.getPullRequestContext,
  discoverSkills,
  createSkillJunctions: linker.createSkillJunctions,
  removeSkillJunctions: linker.removeSkillJunctions,
  generateDocs: gen.generateDocs,
  classifyDocs: classifier.classifyDocsChange,
  uploadAttachment: sdk.uploadAttachment,
  linkAttachmentToWorkItem: sdk.linkAttachmentToWorkItem,
  addWorkItemComment: sdk.addWorkItemComment,
};

function log(message: string): void {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] ${message}`);
}

const COMMENT_BLOCK_RE =
  /<<<WORKITEM-COMMENT>>>\s*([\s\S]*?)\s*<<<END-WORKITEM-COMMENT>>>/;

const ARTICLE_BLOCK_RE = /<<<ARTICLE>>>\s*([\s\S]*?)\s*<<<END-ARTICLE>>>/;

const OUTPUT_KIND_BLOCK_RE =
  /<<<DOCS-OUTPUT-KIND>>>\s*([\s\S]*?)\s*<<<END-DOCS-OUTPUT-KIND>>>/;

export type { OutputKind } from '../types/index.ts';

export interface OutputClassification {
  kind: OutputKind;
  /** The existing article id an update targets (e.g. `CB-142`); only set for `update`. */
  target?: string;
}

/**
 * Read the agent's `<<<DOCS-OUTPUT-KIND>>>` marker, which tells the pipeline
 * whether it produced a new article, a delta update, or a changelog entry so the
 * deliverable can be named and framed accordingly. Defaults to `newfeature` when
 * the marker is absent — that is the historical always-new-article behavior, so
 * older agent output stays backward compatible.
 * The classifier phase is the naming authority; this marker is kept as a
 * consistency check on the drafter.
 */
export function extractOutputKind(agentMessage: string): OutputClassification {
  const block = OUTPUT_KIND_BLOCK_RE.exec(agentMessage)?.[1];
  if (!block) return { kind: 'newfeature' };
  const kind =
    (/kind:\s*(newfeature|update|changelog)/i.exec(block)?.[1]?.toLowerCase() as
      | OutputKind
      | undefined) ?? 'newfeature';
  const target = /target:\s*([A-Za-z][A-Za-z0-9]*-\d+)/i.exec(block)?.[1]?.toUpperCase();
  return kind === 'update' && target ? { kind, target } : { kind };
}

/** Typed deliverable filename so each attachment is self-identifying. */
export function deliverableFileName(itemId: number, c: OutputClassification): string {
  switch (c.kind) {
    case 'update':
      return c.target
        ? `workitem-${itemId}-update-${c.target}.md`
        : `workitem-${itemId}-update.md`;
    case 'changelog':
      return `workitem-${itemId}-changelog.md`;
    default:
      return `workitem-${itemId}-newfeature.md`;
  }
}

/** The HTML comment header line, framed to match the kind of deliverable. */
function commentHeader(c: OutputClassification, attachmentName: string): string {
  const name = escapeHtml(attachmentName);
  switch (c.kind) {
    case 'update':
      return `📄 <b>Documentation update${c.target ? ` for ${escapeHtml(c.target)}` : ''} attached:</b> ${name}`;
    case 'changelog':
      return `📄 <b>Changelog entry generated and attached:</b> ${name}`;
    default:
      return `📄 <b>Documentation article generated and attached:</b> ${name}`;
  }
}

/**
 * Recover the article body the agent embeds between `<<<ARTICLE>>>` …
 * `<<<END-ARTICLE>>>` markers. The agent is required to Write the validated
 * article to the output path AND mirror it here as a safety copy; when it
 * drafts the article inline but skips the Write, this lets the pipeline still
 * attach + comment instead of failing closed. Returns null when no block is
 * present (genuinely no article produced).
 */
export function extractArticleBody(agentMessage: string): string | null {
  const match = ARTICLE_BLOCK_RE.exec(agentMessage);
  const body = match?.[1];
  return body === undefined ? null : body.trim();
}

/**
 * The agent is told to wrap the human-facing comment in
 * `<<<WORKITEM-COMMENT>>>` … `<<<END-WORKITEM-COMMENT>>>` markers and keep its
 * validation report outside them. We post only what's between the markers, so a
 * verbose agent can't leak the full validator log into the work item. Falls
 * back to the whole message when the markers are absent.
 */
export function extractCommentBody(agentMessage: string): string {
  const match = COMMENT_BLOCK_RE.exec(agentMessage);
  return (match?.[1] ?? agentMessage).trim();
}

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

/**
 * Resolve which product a work item belongs to and everything that hangs off
 * that: the product's docs folder (the ONLY folder the agent may search for
 * existing/related articles), its article-id prefix, and its AL source repo.
 * Returns a `productIssue` message instead when any of the three cannot be
 * resolved — the watcher posts it to the work item once and keeps the tag so
 * the item retries after the work item (or .env) is fixed.
 */
export function resolveItemProduct(
  config: AppConfig,
  workItem: WorkItemResponse,
): { product: ProductInfo; docsSearchPath: string; targetRepoPath: string } | { productIssue: string } {
  const fieldValue = String(workItem.fields[config.productField] ?? '');
  const product = resolveProduct(fieldValue);
  if (!product) {
    return {
      productIssue:
        `docsWriter could not determine the product for this work item: ` +
        `${config.productField} is "${fieldValue || '(empty)'}", which does not map to a known Continia product. ` +
        `Move the work item into a product area (or correct the field) and it will be picked up on the next poll.`,
    };
  }
  const targetRepoPath = config.targetRepoPaths[product.prefix];
  if (!targetRepoPath) {
    return {
      productIssue:
        `docsWriter resolved this work item to ${product.docsFolder} (${product.prefix}), ` +
        `but no TARGET_REPO_PATH_${product.prefix} is configured, so the AL source cannot be read. ` +
        `Configure it in the docsWriter .env and the item will be picked up on the next poll.`,
    };
  }
  const docsSearchPath = join(config.docsRepoPath, 'en-us', product.docsFolder);
  if (!existsSync(docsSearchPath)) {
    return {
      productIssue:
        `docsWriter resolved this work item to ${product.docsFolder} (${product.prefix}), ` +
        `but the docs folder was not found at ${docsSearchPath}. ` +
        `Check DOCS_REPO_PATH and the docs repo checkout; the item will be picked up on the next poll.`,
    };
  }
  return { product, docsSearchPath, targetRepoPath };
}

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

export async function processDocsItem(
  config: AppConfig,
  itemId: number,
  deps: ProcessorDeps = defaultDeps,
): Promise<DocsProcessResult> {
  log(`Processing work item #${itemId}...`);

  try {
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

    // Skills (for the prompt listing) + junction them into the source repo
    const discovered = deps.discoverSkills(resolve(config.skillsSourceDir));
    if (discovered.length > 0) {
      log(`  #${itemId}: ${discovered.length} docs skill(s): ${discovered.map((s) => s.name).join(', ')}`);
    }

    const outputDir = resolve(config.outputDir);
    mkdirSync(outputDir, { recursive: true });
    const fileName = `workitem-${itemId}-docs.md`;
    const outputPath = join(outputDir, fileName);

    const context: DocsContext = {
      itemId,
      itemTitle,
      itemType,
      itemDescription,
      comments,
      pullRequests,
      discoveredSkills: discovered,
      outputPath,
      docsRepoPath: docsSearchPath,
      productName: product.docsFolder,
      idPrefix: product.prefix,
      classification,
    };

    let summary: string;
    const created = deps.createSkillJunctions(effectiveConfig.targetRepoPath, config.skillsSourceDir);
    log(`  #${itemId}: Linked ${created.length} skill junction(s) into source repo`);
    try {
      log(`  #${itemId}: Generating documentation article...`);
      summary = await deps.generateDocs(effectiveConfig, context);
    } finally {
      deps.removeSkillJunctions(created);
      log(`  #${itemId}: Removed skill junction(s)`);
    }

    if (!existsSync(outputPath)) {
      // The agent finished without writing the article to the expected path.
      // It is required to mirror the final article between <<<ARTICLE>>>
      // markers as a safety copy — recover from that so a forgotten Write
      // doesn't lose the whole article (the costly part is already done).
      const recovered = extractArticleBody(summary);
      if (recovered) {
        writeFileSync(outputPath, recovered.endsWith('\n') ? recovered : `${recovered}\n`);
        log(
          `  #${itemId}: Agent did not Write the article; recovered it from the ` +
            `final message (${recovered.length} chars) → ${outputPath}`,
        );
      } else {
        // No file and no recoverable block. Log the final message — it reveals
        // whether the agent drafted elsewhere or bailed — so a silent "did not
        // produce an article" is diagnosable from the logs.
        const trimmed = summary.trim();
        log(`  #${itemId}: No article at ${outputPath} and no <<<ARTICLE>>> block. Agent final message (${trimmed.length} chars):`);
        log(trimmed.length > 8000 ? `${trimmed.slice(0, 8000)}\n…(truncated)` : trimmed || '(empty)');
        return {
          itemId,
          documented: false,
          error: `Agent did not produce an article at ${outputPath}`,
        };
      }
    }

    // The agent writes to a fixed path; rename it to a self-identifying
    // deliverable name (new article / delta update / changelog) so the
    // on-disk file, the attachment, and articlePath all carry the kind.
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
    const deliverablePath = join(outputDir, deliverableName);
    if (deliverablePath !== outputPath) {
      renameSync(outputPath, deliverablePath);
    }
    log(
      `  #${itemId}: Classified as ${classification.kind}` +
        `${classification.target ? ` (${classification.target})` : ''} → ${deliverableName}`,
    );

    const commentBody = extractCommentBody(summary) + candidateNote(classification);

    if (config.dryRun) {
      const summaryPath = join(outputDir, `workitem-${itemId}-summary.md`);
      writeFileSync(summaryPath, commentBody.endsWith('\n') ? commentBody : `${commentBody}\n`);
      log(`  #${itemId}: [DRY RUN] Output   → ${deliverablePath}`);
      log(`  #${itemId}: [DRY RUN] Summary  → ${summaryPath}`);
      log(`  #${itemId}: [DRY RUN] Skipping ADO writes`);
      return { itemId, documented: true, articlePath: deliverablePath, summaryPath };
    }

    // Attach the deliverable, then comment.
    const content = readFileSync(deliverablePath, 'utf-8');
    const attachmentName = deliverableName;
    const uploaded = await deps.uploadAttachment(config, attachmentName, content);
    await deps.linkAttachmentToWorkItem(
      config,
      itemId,
      uploaded.url,
      attachmentName,
      `Generated documentation (${classification.kind})`,
    );
    log(`  #${itemId}: Attached ${attachmentName}`);

    // ADO comments render as HTML, not Markdown, so the agent's Markdown
    // summary must be converted — otherwise `##`, `**bold**` and ``` fences
    // show up literally.
    const comment = `${commentHeader(classification, attachmentName)}${markdownToHtml(commentBody)}`;
    await deps.addWorkItemComment(config, itemId, comment);
    log(`  #${itemId}: Posted confirmation comment`);

    return { itemId, documented: true, articlePath: deliverablePath };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log(`  #${itemId}: Error — ${errorMsg}`);
    return { itemId, documented: false, error: errorMsg };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

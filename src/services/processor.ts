import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

import type {
  AppConfig,
  DocsProcessResult,
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
import { discoverSkills } from './skill-loader.ts';
import { markdownToHtml, stripHtmlToText } from '../utils/html.ts';

export interface ProcessorDeps {
  getWorkItem: (config: AppConfig, id: number) => Promise<WorkItemResponse>;
  getWorkItemComments: (config: AppConfig, id: number) => Promise<WorkItemComment[]>;
  parsePullRequestRefs: (workItem: WorkItemResponse) => PullRequestRef[];
  getPullRequestContext: (config: AppConfig, ref: PullRequestRef) => Promise<PrContext>;
  discoverSkills: (skillsRoot: string) => DiscoveredSkill[];
  createSkillJunctions: (targetRepoPath: string, skillsSourceDir: string) => string[];
  removeSkillJunctions: (created: string[]) => void;
  generateDocs: (config: AppConfig, context: DocsContext) => Promise<string>;
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
  uploadAttachment: sdk.uploadAttachment,
  linkAttachmentToWorkItem: sdk.linkAttachmentToWorkItem,
  addWorkItemComment: sdk.addWorkItemComment,
};

function log(message: string): void {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] ${message}`);
}

export async function processDocsItem(
  config: AppConfig,
  itemId: number,
  deps: ProcessorDeps = defaultDeps,
): Promise<DocsProcessResult> {
  log(`Processing work item #${itemId}...`);

  try {
    const workItem = await deps.getWorkItem(config, itemId);
    const itemTitle = String(workItem.fields['System.Title'] ?? '');
    const itemType = String(workItem.fields['System.WorkItemType'] ?? '');
    const itemDescription = stripHtmlToText(
      String(workItem.fields['System.Description'] ?? ''),
    );
    log(`  #${itemId}: "${itemTitle}" (${itemType})`);

    // Comments
    const rawComments = await deps.getWorkItemComments(config, itemId);
    const comments = rawComments
      .map((c) => stripHtmlToText(String(c.text ?? '')))
      .filter((c) => c.length > 0);
    if (comments.length > 0) log(`  #${itemId}: ${comments.length} comment(s)`);

    // Linked pull requests
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
    };

    let summary: string;
    const created = deps.createSkillJunctions(config.targetRepoPath, config.skillsSourceDir);
    log(`  #${itemId}: Linked ${created.length} skill junction(s) into source repo`);
    try {
      log(`  #${itemId}: Generating documentation article...`);
      summary = await deps.generateDocs(config, context);
    } finally {
      deps.removeSkillJunctions(created);
      log(`  #${itemId}: Removed skill junction(s)`);
    }

    if (!existsSync(outputPath)) {
      // The agent finished without writing the article to the expected path.
      // Log its final message — it reveals whether the agent drafted the
      // article inline, tried to write elsewhere, or bailed — so a silent
      // "did not produce an article" is diagnosable from the logs.
      const trimmed = summary.trim();
      log(`  #${itemId}: No article at ${outputPath}. Agent final message (${trimmed.length} chars):`);
      log(trimmed.length > 8000 ? `${trimmed.slice(0, 8000)}\n…(truncated)` : trimmed || '(empty)');
      return {
        itemId,
        documented: false,
        error: `Agent did not produce an article at ${outputPath}`,
      };
    }

    if (config.dryRun) {
      const summaryPath = join(outputDir, `workitem-${itemId}-summary.md`);
      writeFileSync(summaryPath, summary.endsWith('\n') ? summary : `${summary}\n`);
      log(`  #${itemId}: [DRY RUN] Article  → ${outputPath}`);
      log(`  #${itemId}: [DRY RUN] Summary  → ${summaryPath}`);
      log(`  #${itemId}: [DRY RUN] Skipping ADO writes`);
      return { itemId, documented: true, articlePath: outputPath, summaryPath };
    }

    // Attach the article, then comment.
    const content = readFileSync(outputPath, 'utf-8');
    const attachmentName = fileName;
    const uploaded = await deps.uploadAttachment(config, attachmentName, content);
    await deps.linkAttachmentToWorkItem(
      config,
      itemId,
      uploaded.url,
      attachmentName,
      'Generated documentation article',
    );
    log(`  #${itemId}: Attached ${attachmentName}`);

    // ADO comments render as HTML, not Markdown, so the agent's Markdown
    // summary must be converted — otherwise `##`, `**bold**` and ``` fences
    // show up literally.
    const comment =
      `📄 <b>Documentation article generated and attached:</b> ${escapeHtml(attachmentName)}` +
      `${markdownToHtml(summary)}`;
    await deps.addWorkItemComment(config, itemId, comment);
    log(`  #${itemId}: Posted confirmation comment`);

    return { itemId, documented: true, articlePath: outputPath };
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

import { readFileSync } from 'fs';
import { isAbsolute, relative, resolve } from 'path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import type { AppConfig, PrContext } from '../types/index.ts';
import type { DiscoveredSkill } from './skill-loader.ts';

const DENIED_BASH_PATTERNS = [
  /\bgit\s+(push|commit|merge|rebase|reset|checkout|branch\s+-[dD]|stash\s+drop|clean|tag\s+-d)/,
  /\brm\s+(-rf?|--recursive)/,
  /\brmdir\b/,
  /\bdel\b/,
  /\bmkdir\b/,
  /\bmv\b/,
  /\bcp\b/,
  /\b(chmod|chown)\b/,
  /\bnpm\s+(publish|install|uninstall)/,
  /\bbun\s+(add|remove|install|publish)/,
  /\bcurl\s.*(-X\s*(POST|PUT|PATCH|DELETE)|--data|--request\s*(POST|PUT|PATCH|DELETE))/,
  /\baz\s+devops/,
  /\bgh\s+(pr|issue)\s+(create|close|merge|delete|comment)/,
  />\s*[^\s]/, // redirect output to file
  /\btee\b/,
  /\bsed\s+-i/,
  /\bawk\b.*>/, // awk with output redirect
];

/** True if `child` resolves to a path inside `parent`. */
function isUnderDir(child: string, parent: string, cwd: string): boolean {
  const abs = isAbsolute(child) ? child : resolve(cwd, child);
  const rel = relative(resolve(parent), abs);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Build a tool gate that:
 *  - blocks destructive bash commands, and
 *  - fences Write/Edit/NotebookEdit to `outputDir` so the agent can never write
 *    into the source repo or the docs repo (enforces "attach only").
 */
export function makeCanUseTool(outputDir: string, cwd: string) {
  const writeTools = new Set(['Write', 'Edit', 'NotebookEdit', 'MultiEdit']);
  return async function canUseTool(
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<PermissionResult> {
    if (toolName === 'Bash') {
      const command = String(input.command ?? '');
      for (const pattern of DENIED_BASH_PATTERNS) {
        if (pattern.test(command)) {
          return {
            behavior: 'deny',
            message: `Blocked destructive bash command: ${command}`,
          };
        }
      }
    }

    if (writeTools.has(toolName)) {
      const target = String(input.file_path ?? input.notebook_path ?? '');
      if (!target || !isUnderDir(target, outputDir, cwd)) {
        return {
          behavior: 'deny',
          message: `Writes are only allowed under the output directory (${outputDir}). Write the article there, not into the source or docs repo. Rejected path: ${target}`,
        };
      }
    }

    return { behavior: 'allow' };
  };
}

export interface DocsContext {
  itemId: number;
  itemTitle: string;
  itemType: string;
  itemDescription: string;
  comments: string[];
  pullRequests: PrContext[];
  discoveredSkills: DiscoveredSkill[];
  /** Absolute path the agent must write the finished article to. */
  outputPath: string;
  /**
   * Absolute path to the resolved product's folder inside the published docs
   * set (read-only), e.g. `<DOCS_REPO_PATH>/en-us/Continia Banking`. The agent
   * searches ONLY this folder for existing articles + the next article id.
   */
  docsRepoPath: string;
  /** Resolved product name (docs folder name), e.g. "Continia Banking". */
  productName: string;
  /** The product's article-id prefix, e.g. "CB". */
  idPrefix: string;
}

/**
 * Append the captured Claude Code process stderr to an error message so an
 * otherwise-opaque "process exited with code 1" carries the real cause. The
 * tail is kept (where fatal errors land) and capped to avoid flooding logs.
 */
function withStderr(message: string, stderrChunks: string[], maxChars = 4000): string {
  const stderr = stderrChunks.join('').trim();
  if (!stderr) return message;
  const tail = stderr.length > maxChars ? `…(truncated)…\n${stderr.slice(-maxChars)}` : stderr;
  return `${message}\n  Claude Code process stderr:\n${tail}`;
}

function extractAssistantText(message: { message: { content: unknown[] } }): string {
  return message.message.content
    .filter((b): b is { type: 'text'; text: string } => (b as { type: string }).type === 'text')
    .map((b) => b.text)
    .join('\n');
}

/**
 * Run the Claude Agent SDK against the source repo to generate a documentation
 * article. The agent invokes the docs-article-generator skill, writes the
 * finished article to `context.outputPath`, and returns a short summary
 * (including the validator verdict) as its final message.
 */
export async function generateDocs(
  config: AppConfig,
  context: DocsContext,
): Promise<string> {
  const systemPrompt = buildSystemPrompt(
    config.promptPath,
    context.discoveredSkills,
    context,
  );

  const canUseTool = makeCanUseTool(resolve(config.outputDir), config.targetRepoPath);

  let result: string | undefined;
  let resultSubtype: string | undefined;
  // Detail extracted from an error result (auth failures, permission denials,
  // …). The SDK carries the real cause in `errors`/`permission_denials`, NOT on
  // stderr — without surfacing it, the failure reads as an opaque non-success.
  let resultError: string | undefined;
  const assistantTexts: string[] = [];
  const toolUses = new Map<string, number>();
  let turnCount = 0;
  // The SDK pipes the underlying Claude Code process's stderr only when a
  // `stderr` callback is provided — otherwise it is discarded and any startup
  // failure surfaces as an opaque "process exited with code 1". Capture it so
  // the real error (auth, config, missing binary, …) is preserved.
  const stderrChunks: string[] = [];

  try {
    for await (const message of query({
      prompt: buildUserPrompt(context),
      options: {
        model: config.claudeModel,
        maxTurns: config.maxTurns,
        tools: ['Read', 'Grep', 'Glob', 'Bash', 'Skill', 'LSP', 'Write', 'Edit'],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        canUseTool,
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
        if (text.trim()) {
          assistantTexts.push(text);
        }
        for (const block of message.message.content) {
          if ((block as { type: string }).type === 'tool_use') {
            const name = (block as { name: string }).name;
            toolUses.set(name, (toolUses.get(name) ?? 0) + 1);
          }
        }
      }
      if (message.type === 'result') {
        const models = Object.keys(message.modelUsage).join(', ') || 'unknown';
        const tools =
          [...toolUses.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => `${name}×${count}`)
            .join(', ') || 'none';
        console.log(
          `  Cost: $${message.total_cost_usd.toFixed(4)} | ${message.usage.input_tokens ?? 0} in / ${message.usage.output_tokens ?? 0} out | ${message.num_turns} turns | ${models}`,
        );
        console.log(`  Tools: ${tools}`);
        resultSubtype = message.subtype;
        if (message.subtype === 'success') {
          result = message.result;
        } else {
          const errs = message.errors?.length ? message.errors.join('; ') : '';
          const denials = message.permission_denials?.length
            ? `denied tools: ${message.permission_denials.map((d) => d.tool_name).join(', ')}`
            : '';
          resultError = [errs, denials].filter(Boolean).join(' | ') || undefined;
          if (message.subtype === 'error_max_turns') {
            console.error(`  Agent hit max turns (${turnCount}).`);
          } else {
            console.error(
              `  Agent ended with result subtype: ${message.subtype}${resultError ? ` — ${resultError}` : ''}`,
            );
          }
        }
      }
    }
  } catch (err) {
    const base = err instanceof Error ? err.message : String(err);
    throw new Error(withStderr(base, stderrChunks));
  }

  if (result === undefined) {
    const last = assistantTexts[assistantTexts.length - 1];
    if (last) return last.trim();
    const detail = resultError ? `: ${resultError}` : '';
    throw new Error(
      withStderr(
        `No result received from Claude Agent SDK (subtype=${resultSubtype ?? 'none'}, turns=${turnCount})${detail}`,
        stderrChunks,
      ),
    );
  }

  return result.trim();
}

export function buildSystemPrompt(
  promptPath: string,
  discoveredSkills: DiscoveredSkill[],
  context: DocsContext,
): string {
  const basePrompt = readFileSync(promptPath, 'utf-8');
  const sections: string[] = [basePrompt];

  if (discoveredSkills.length > 0) {
    const listing = discoveredSkills
      .map((s) => `- **${s.name}**: ${s.description}`)
      .join('\n');
    sections.push(
      `## Available Invocable Skills\n\n` +
        `The following docs-writing skills are available via the \`Skill\` tool. ` +
        `Use \`docs-article-generator\` as the entry point; it delegates drafting to ` +
        `\`docs-writer\` and validation to \`docs-validator\`.\n\n` +
        `${listing}`,
    );
  }

  sections.push(
    `## Output and automation rules\n\n` +
      `- This is an UNATTENDED run. NEVER ask the user a question or wait for input — make the best decision and proceed.\n` +
      `- This work item belongs to the product **${context.productName}** (article-id prefix \`${context.idPrefix}\`).\n` +
      `- The published docs set for ${context.productName} is at \`${context.docsRepoPath}\` — this is the product's own folder. Read it with Read/Grep/Glob to find existing articles, related articles, and the highest \`${context.idPrefix}-\` id. Search ONLY inside this folder; never scan other products' folders. It is READ-ONLY — never write into it.\n` +
      `- **Size and frame before classifying.** First assess the change MAGNITUDE (minor tweak / workflow improvement / new feature / technical addition) and answer the IMPACT BRIEF (problem solved, what the user can now do, when noticed, before vs. now, where in the UI, config needed). See \`docs-article-generator\` → \`code-to-docs.md\` §3 (magnitude → depth) and §4 (impact brief). The magnitude caps how much you write — a couple of new fields is NOT a full multi-section article — and tilts the call toward an update. Keep the output PROPORTIONAL: section count should track what the user actually has to understand or do; never add explainer sections, reference tables, or extra hints to pad a small change.\n` +
      `- **Classify.** Reconstruct the feature and its user-facing UI captions from the changed AL objects, then search the docs set for an existing article that already covers it — anchor the match on shared UI captions / the same page or setup object, NOT on title similarity. Then choose exactly one output (see \`code-to-docs.md\` §6):\n` +
      `  - **update** — a CONFIDENT match exists AND this change extends what that article already covers, OR the change is a MINOR tweak with a plausible existing home (for a small change, prefer an update over a new file). Produce a DELTA NOTE targeting that article's existing \`${context.idPrefix}-###\`; do NOT mint a new id.\n` +
      `  - **changelog** — a pure bug fix / internal refactor with no user-visible change. Produce a changelog entry, not an article.\n` +
      `  - **newfeature** — no match, OR an uncertain match on a SUBSTANTIAL change, OR a genuinely new sub-topic. Draft a new article scaled to the magnitude (a minor change with no existing home is ONE tight section, not a multi-section build-up) and AUTO-SELECT the next unused \`${context.idPrefix}-###\` (highest existing \`${context.idPrefix}-\` number + 1). When you fall back here from an UNCERTAIN match, name the most likely existing article in the work-item comment as "may overlap ${context.idPrefix}-### — consider merging instead".\n` +
      `- **Impact is NOT in the code.** Why the feature matters, what problem it solves, when a user notices it, and what the system did before live in the work item / comments / PR. State impact in the article ONLY when sourced there — never manufacture a plausible "why" or before/after to enrich the intro (that is the filler to avoid). When impact is not sourced, keep the intro minimal and list the unanswered questions under "Context needed from author/SME" in the work-item comment.\n` +
      `- **Frontmatter:** a new article MUST open with a fenced \`\`\`meta\`\`\` block (GitBook format) in field order title, date, description, id, lang — NEVER a \`--- ... ---\` YAML block. Older sibling articles still using \`---\` are mid-migration; reading one for tone does NOT license copying its legacy frontmatter.\n` +
      `- You MUST use the \`Write\` tool to save the FINAL output to EXACTLY this absolute path: \`${context.outputPath}\`. The file is the deliverable; drafting it only in your message is a FAILED run. Do not end your turn until that file exists.\n` +
      `- Do NOT create or leave any file inside the docs repository — it is read-only context. All writes must go to the output path above.\n` +
      `- Validation: for a **newfeature** article, run \`docs-validator\` and fix every BLOCKING finding before finishing. For an **update** delta note or a **changelog** entry, do NOT run the article-structure validation (it is not a standalone publishable article) — but every bold UI term must still trace to a real AL caption (code wins).\n` +
      `- Include a verbatim safety copy of the output between \`<<<ARTICLE>>>\` and \`<<<END-ARTICLE>>>\` markers in your final message (the exact contents you wrote to the path).\n` +
      `- End your final message with a classification marker so the pipeline can name the deliverable:\n` +
      `  \`\`\`\n` +
      `  <<<DOCS-OUTPUT-KIND>>>\n` +
      `  kind: newfeature | update | changelog\n` +
      `  target: ${context.idPrefix}-### (include only when kind is update)\n` +
      `  <<<END-DOCS-OUTPUT-KIND>>>\n` +
      `  \`\`\`\n` +
      `- Finish with the \`docs-validator\` verdict (when run) and a one-line summary of what the output covers.`,
  );

  return sections.join('\n\n');
}

export function buildUserPrompt(context: DocsContext): string {
  const lines: string[] = [
    '# Documentation request',
    '',
    `A work item has been tagged for documentation. Generate a complete documentation article for the feature it describes, then write it to \`${context.outputPath}\`.`,
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
        lines.push(
          '',
          '**PR description (may be out of date — verify against the current code):**',
          pr.description,
        );
      }
      if (pr.changedFiles.length > 0) {
        lines.push(
          '',
          '**Changed files:**',
          ...pr.changedFiles.map((f) => `- ${f}`),
        );
      }
    }
    lines.push(
      '',
      'Use the changed files as entry points, but reconstruct the COMPLETE feature flow from the AL codebase (do not document only the diff).',
      'The AL code in your working directory is the source of truth — it is the current, merged state of the feature. Descriptions, comments, and PR descriptions are written early and may describe behavior that was changed or removed before merge. If prose claims a behavior, page, field, action, or UI element you cannot find in the current code, treat it as removed: do not document it. On any mismatch between prose and code, code wins.',
    );
  }

  return lines.join('\n');
}

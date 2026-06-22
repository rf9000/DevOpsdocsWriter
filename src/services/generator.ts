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
        maxTurns: 60,
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
        } else if (message.subtype === 'error_max_turns') {
          console.error(`  Agent hit max turns (${turnCount}).`);
        } else {
          console.error(`  Agent ended with result subtype: ${message.subtype}`);
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
    throw new Error(
      withStderr(
        `No result received from Claude Agent SDK (subtype=${resultSubtype ?? 'none'}, turns=${turnCount})`,
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
      `- When the skill needs the unique \`CB-###\` article id, AUTO-SELECT the next unused id by scanning the docs repository for the highest existing \`CB-\` number and incrementing it. Do not prompt.\n` +
      `- Write the FINAL, validated article to EXACTLY this absolute path: \`${context.outputPath}\`.\n` +
      `- Do NOT create or leave any file inside the docs repository — it is read-only context. All writes must go to the output path above.\n` +
      `- End your final message with the \`docs-validator\` verdict and a one-line summary of what the article covers.`,
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
        lines.push('', pr.description);
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
    );
  }

  return lines.join('\n');
}

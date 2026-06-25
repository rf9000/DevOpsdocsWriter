import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import {
  buildUserPrompt,
  buildSystemPrompt,
  makeCanUseTool,
} from '../../src/services/generator.ts';
import type { DocsContext } from '../../src/services/generator.ts';

function ctx(overrides: Partial<DocsContext> = {}): DocsContext {
  return {
    itemId: 42,
    itemTitle: 'Bank reconciliation',
    itemType: 'Feature',
    itemDescription: 'Lets users reconcile statements.',
    comments: [],
    pullRequests: [],
    discoveredSkills: [],
    outputPath: 'C:/out/workitem-42-docs.md',
    ...overrides,
  };
}

describe('buildUserPrompt', () => {
  test('includes work item, comments and PRs with changed files', () => {
    const prompt = buildUserPrompt(
      ctx({
        comments: ['First note', 'Second note'],
        pullRequests: [
          {
            pullRequestId: 7,
            title: 'Add reconcile page',
            description: 'PR body',
            status: 'completed',
            sourceRefName: 'refs/heads/feat',
            targetRefName: 'refs/heads/main',
            changedFiles: ['/src/Recon.al'],
          },
        ],
      }),
    );

    expect(prompt).toContain('Bank reconciliation');
    expect(prompt).toContain('Comment 1');
    expect(prompt).toContain('Second note');
    expect(prompt).toContain('PR #7: Add reconcile page');
    expect(prompt).toContain('/src/Recon.al');
    expect(prompt).toContain('workitem-42-docs.md');
  });

  test('omits empty sections', () => {
    const prompt = buildUserPrompt(ctx());
    expect(prompt).not.toContain('Work item comments');
    expect(prompt).not.toContain('Linked pull requests');
  });

  test('flags PR descriptions as possibly stale and asserts code wins', () => {
    const prompt = buildUserPrompt(
      ctx({
        pullRequests: [
          {
            pullRequestId: 7,
            title: 'Add reconcile page',
            description: 'Adds a notification when reconciliation completes.',
            status: 'completed',
            sourceRefName: 'refs/heads/feat',
            targetRefName: 'refs/heads/main',
            changedFiles: ['/src/Recon.al'],
          },
        ],
      }),
    );

    // The PR description must be marked as potentially outdated...
    expect(prompt).toMatch(/may (be )?(out of date|outdated|stale)/i);
    // ...and the changed-files guidance must establish code-over-prose.
    expect(prompt).toMatch(/source of truth/i);
    expect(prompt).toMatch(/do not document/i);
  });
});

describe('buildSystemPrompt', () => {
  let dir: string;
  let promptPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gen-test-'));
    promptPath = join(dir, 'write-docs.md');
    writeFileSync(promptPath, 'BASE PROMPT');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test('embeds base prompt, skill listing and output rules', () => {
    const sys = buildSystemPrompt(
      promptPath,
      [{ name: 'docs-article-generator', description: 'gen', skillDir: 'x' }],
      ctx({ outputPath: 'C:/out/file.md' }),
    );
    expect(sys).toContain('BASE PROMPT');
    expect(sys).toContain('docs-article-generator');
    expect(sys).toContain('CB-###');
    expect(sys).toContain('C:/out/file.md');
    expect(sys).toContain('UNATTENDED');
  });
});

describe('makeCanUseTool', () => {
  const outputDir = resolve('C:/work/.output');
  const cwd = resolve('C:/repos/al');
  const gate = makeCanUseTool(outputDir, cwd);

  test('blocks destructive bash', async () => {
    const r = await gate('Bash', { command: 'git push origin main' });
    expect(r.behavior).toBe('deny');
  });

  test('allows safe bash', async () => {
    const r = await gate('Bash', { command: 'git diff main...HEAD' });
    expect(r.behavior).toBe('allow');
  });

  test('allows writes inside the output dir', async () => {
    const r = await gate('Write', {
      file_path: join(outputDir, 'workitem-1-docs.md'),
    });
    expect(r.behavior).toBe('allow');
  });

  test('denies writes into the docs/source repo', async () => {
    const r = await gate('Write', {
      file_path: 'C:/repos/continia.docs.articles/en-us/CB-100.md',
    });
    expect(r.behavior).toBe('deny');
  });

  test('denies edits outside the output dir', async () => {
    const r = await gate('Edit', { file_path: join(cwd, 'src/App.al') });
    expect(r.behavior).toBe('deny');
  });

  test('allows non-write tools', async () => {
    expect((await gate('Read', { file_path: 'anything' })).behavior).toBe('allow');
    expect((await gate('Grep', {})).behavior).toBe('allow');
  });
});

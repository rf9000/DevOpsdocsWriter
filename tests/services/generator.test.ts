import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import {
  buildUserPrompt,
  buildSystemPrompt,
  makeCanUseTool,
  summarizeDenials,
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
    docsRepoPath: 'C:/repos/continia.docs.articles/en-us/Continia Banking',
    productName: 'Continia Banking',
    idPrefix: 'CB',
    classification: { kind: 'newfeature' as const, docsFolder: 'continia-banking', idPrefix: 'CB', candidates: [], reasoning: '' },
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

  test('gives the agent the docs repo path and the new/update/changelog protocol', () => {
    const sys = buildSystemPrompt(
      promptPath,
      [],
      ctx({ docsRepoPath: 'C:/repos/continia.docs.articles/en-us/Continia Banking' }),
    );
    // The docs set path must be passed so detection of existing articles works.
    expect(sys).toContain('C:/repos/continia.docs.articles/en-us/Continia Banking');
    // The three output kinds and the classification marker must be specified.
    expect(sys).toContain('newfeature');
    expect(sys).toContain('update');
    expect(sys).toContain('changelog');
    expect(sys).toContain('DOCS-OUTPUT-KIND');
  });

  test('scopes the docs search to the product folder and uses the product id prefix', () => {
    const sys = buildSystemPrompt(
      promptPath,
      [],
      ctx({
        docsRepoPath: '/home/azureuser/repos/continia.docs.articles/en-us/Continia Document Capture',
        productName: 'Continia Document Capture',
        idPrefix: 'DC',
      }),
    );
    expect(sys).toContain('Continia Document Capture');
    expect(sys).toContain('/home/azureuser/repos/continia.docs.articles/en-us/Continia Document Capture');
    // Id-minting and the update-target marker must use the product's prefix...
    expect(sys).toContain('DC-###');
    expect(sys).toContain('`DC-` number');
    // ...and no Banking prefix may leak into a DC run.
    expect(sys).not.toContain('CB-');
    // The scope instruction must forbid cross-product searching.
    expect(sys).toMatch(/ONLY inside this folder/i);
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

  // Discarding stderr and duplicating a file descriptor create no file. Blocking
  // them cost the agent turns on every exploratory command it tried to quieten.
  test('allows redirects that write no file', async () => {
    const safe = [
      'find /repos -maxdepth 2 -iname "*migration*" 2>/dev/null',
      'git fetch --all --quiet 2>&1 | tail -20',
      'rg "Handled" src/ 2>/dev/null',
      'ls -l >/dev/null',
      'grep -r foo . 2>&1 | head',
      'some-cmd &>/dev/null',
      'echo hi >&2',
    ];
    for (const command of safe) {
      expect(
        [(await gate('Bash', { command })).behavior, command],
      ).toEqual(['allow', command]);
    }
  });

  // ...but a redirect that does create or truncate a file is still the way a
  // shell could write into the source repo, so it stays blocked.
  test('still blocks redirects that create a file', async () => {
    const unsafe = [
      'echo hello > /repos/al/note.md',
      'cat a.md >> b.md',
      'grep foo src/ 2>errors.log',
      'awk "{print}" x > y',
    ];
    for (const command of unsafe) {
      expect(
        [(await gate('Bash', { command })).behavior, command],
      ).toEqual(['deny', command]);
    }
  });

  // mkdir creates no content, and every path that could write content — Write,
  // Edit, a file redirect — is fenced independently.
  test('allows mkdir', async () => {
    expect((await gate('Bash', { command: 'mkdir -p /app/.output' })).behavior).toBe('allow');
  });

  // The bare-command patterns matched their word anywhere in the line, so any
  // command that merely mentioned one was denied.
  test('matches bare destructive commands only at command position', async () => {
    const safe = [
      'grep -rn "del" src/',
      'rg "mv" src/',
      'grep -c "cp" README.md',
      'ls | grep tee',
      'rg rmdir src/',
    ];
    for (const command of safe) {
      expect(
        [(await gate('Bash', { command })).behavior, command],
      ).toEqual(['allow', command]);
    }
  });

  test('still blocks those commands when they are the command', async () => {
    const unsafe = [
      'rmdir /repos/al/src',
      'mv a.md b.md',
      'cp a.md b.md',
      'cat x | tee out.md',
      'ls; del file.md',
      'rm -rf /repos/al',
      'chmod 777 /repos/al',
      'sed -i "s/a/b/" file.md',
    ];
    for (const command of unsafe) {
      expect(
        [(await gate('Bash', { command })).behavior, command],
      ).toEqual(['deny', command]);
    }
  });
});

describe('makeCanUseTool denial logging', () => {
  const outputDir = resolve('C:/work/.output');
  const cwd = resolve('C:/repos/al');

  test('logs each denied write with the tool name and rejected path', async () => {
    const lines: string[] = [];
    const gate = makeCanUseTool(outputDir, cwd, (msg) => lines.push(msg));

    await gate('Write', { file_path: 'C:/repos/continia.docs.articles/en-us/CB-100.md' });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Write');
    expect(lines[0]).toContain('C:/repos/continia.docs.articles/en-us/CB-100.md');
  });

  test('logs a denied bash command', async () => {
    const lines: string[] = [];
    const gate = makeCanUseTool(outputDir, cwd, (msg) => lines.push(msg));

    await gate('Bash', { command: 'git push origin main' });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Bash');
    expect(lines[0]).toContain('git push origin main');
  });

  test('logs nothing for allowed calls', async () => {
    const lines: string[] = [];
    const gate = makeCanUseTool(outputDir, cwd, (msg) => lines.push(msg));

    await gate('Write', { file_path: join(outputDir, 'workitem-1-docs.md') });
    await gate('Bash', { command: 'git diff main...HEAD' });
    await gate('Read', { file_path: 'anything' });

    expect(lines).toHaveLength(0);
  });
});

describe('summarizeDenials', () => {
  test('aggregates denials into tool×count pairs', () => {
    expect(
      summarizeDenials([
        { tool_name: 'Write' },
        { tool_name: 'Write' },
        { tool_name: 'Bash' },
      ]),
    ).toBe('Write×2, Bash×1');
  });

  test('returns empty string for no denials', () => {
    expect(summarizeDenials([])).toBe('');
    expect(summarizeDenials(undefined)).toBe('');
  });
});

describe('buildSystemPrompt classification handoff', () => {
  let dir: string;
  let promptPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gen-test-'));
    promptPath = join(dir, 'write-docs.md');
    writeFileSync(promptPath, 'BASE PROMPT');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test('renders a decided update with target and forbids re-classifying', () => {
    const sys = buildSystemPrompt(
      promptPath,
      [],
      ctx({
        classification: {
          kind: 'update',
          docsFolder: 'continia-banking',
          idPrefix: 'CB',
          target: 'CB-33',
          targetFile: 'Reconciliation/Account identification methods.md',
          candidates: [
            {
              id: 'CB-161',
              file: 'Using Templates in Banking Import.md',
              docsFolder: 'continia-banking',
              reason: 'documents templates',
            },
          ],
          reasoning: 'columns live on a documented page',
        },
      }),
    );
    expect(sys).toContain('already decided');
    expect(sys).toContain('DELTA UPDATE NOTE');
    expect(sys).toContain('CB-33');
    expect(sys).toContain('Account identification methods.md');
    expect(sys).toContain('do NOT re-classify');
    // decision criteria are gone — the drafter is no longer asked to choose
    expect(sys).not.toContain('Then choose exactly one output');
  });

  test('renders a decided newfeature with next-unused-id instruction', () => {
    const sys = buildSystemPrompt(
      promptPath,
      [],
      ctx({
        classification: { kind: 'newfeature', docsFolder: 'continia-banking', idPrefix: 'CB', candidates: [], reasoning: '' },
      }),
    );
    expect(sys).toContain('already decided');
    expect(sys).toContain('NEW ARTICLE');
    expect(sys).toContain('next unused');
  });

  // Article paths are stored relative to the docs home they live in. With one
  // home that is unambiguous and must keep reading exactly as it did; with two
  // (Continia Delivery Network) a path from the other home has to say so.
  test('a candidate from the deliverable home renders as a bare relative path', () => {
    const sys = buildSystemPrompt(
      promptPath,
      [],
      ctx({
        classification: {
          kind: 'newfeature',
          docsFolder: 'continia-document-output',
          idPrefix: 'DO',
          candidates: [
            {
              id: 'DO-2',
              file: 'business-functionality/continia-edocuments/sending.md',
              docsFolder: 'continia-document-output',
              reason: 'sending side',
            },
          ],
          reasoning: '',
        },
      }),
    );
    expect(sys).toContain('`business-functionality/continia-edocuments/sending.md`');
    expect(sys).not.toContain('continia-document-output/business-functionality');
  });

  test('a candidate from the product other docs home is qualified with its folder', () => {
    const sys = buildSystemPrompt(
      promptPath,
      [],
      ctx({
        classification: {
          kind: 'newfeature',
          docsFolder: 'continia-document-output',
          idPrefix: 'DO',
          candidates: [
            {
              id: 'DC-1',
              file: 'business-functionality/continia-edocuments/receiving.md',
              docsFolder: 'continia-document-capture',
              reason: 'capture side',
            },
          ],
          reasoning: '',
        },
      }),
    );
    expect(sys).toContain(
      '`continia-document-capture/business-functionality/continia-edocuments/receiving.md`',
    );
  });

  test("an update target file stays relative to the deliverable's own home", () => {
    const sys = buildSystemPrompt(
      promptPath,
      [],
      ctx({
        classification: {
          kind: 'update',
          docsFolder: 'continia-document-capture',
          idPrefix: 'DC',
          target: 'DC-7',
          targetFile: 'business-functionality/continia-edocuments/receiving.md',
          candidates: [],
          reasoning: '',
        },
      }),
    );
    expect(sys).toContain('`business-functionality/continia-edocuments/receiving.md`');
    expect(sys).not.toContain('continia-document-capture/business-functionality');
  });

  test('a multi-home product is still scoped to the one home the classifier chose', () => {
    const sys = buildSystemPrompt(
      promptPath,
      [],
      ctx({
        docsRepoPath: '/repos/continia.docs.articles/en-us/continia-document-output',
        productName: 'Continia Delivery Network',
        idPrefix: 'DO',
        classification: {
          kind: 'newfeature',
          docsFolder: 'continia-document-output',
          idPrefix: 'DO',
          candidates: [],
          reasoning: '',
        },
      }),
    );
    expect(sys).toContain('/repos/continia.docs.articles/en-us/continia-document-output');
    expect(sys).toContain('DO-###');
    expect(sys).toMatch(/ONLY inside this folder/i);
    // The other home must not leak into the drafting scope.
    expect(sys).not.toContain('continia-document-capture');
  });

  test('renders a decided changelog', () => {
    const sys = buildSystemPrompt(
      promptPath,
      [],
      ctx({
        classification: { kind: 'changelog', docsFolder: 'continia-banking', idPrefix: 'CB', candidates: [], reasoning: '' },
      }),
    );
    expect(sys).toContain('already decided');
    expect(sys).toContain('CHANGELOG ENTRY');
  });
});

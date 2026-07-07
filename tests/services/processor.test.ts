import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { AppConfig } from '../../src/types/index.ts';
import {
  processDocsItem,
  classifyItem,
  extractCommentBody,
  extractArticleBody,
  extractOutputKind,
  deliverableFileName,
} from '../../src/services/processor.ts';
import type { ProcessorDeps } from '../../src/services/processor.ts';
import type { DocsContext } from '../../src/services/generator.ts';
import { mockConfig, mockWorkItem } from '../helpers.ts';

let outDir: string;
let docsDir: string;

/** mockConfig wired to the per-test temp dirs (real docs folder so product resolution passes). */
function cfg(overrides: Partial<AppConfig> = {}): AppConfig {
  return mockConfig({ outputDir: outDir, docsRepoPath: docsDir, ...overrides });
}

function makeDeps(overrides: Partial<ProcessorDeps> = {}): ProcessorDeps {
  return {
    getWorkItem: mock(() => Promise.resolve(mockWorkItem())),
    getWorkItemComments: mock(() => Promise.resolve([])),
    parsePullRequestRefs: mock(() => []),
    getPullRequestContext: mock(() =>
      Promise.reject(new Error('should not be called')),
    ),
    discoverSkills: mock(() => []),
    createSkillJunctions: mock(() => ['link-a']),
    removeSkillJunctions: mock(() => {}),
    // default: agent writes the article to the requested path
    generateDocs: mock((_cfg, ctx: DocsContext) => {
      writeFileSync(ctx.outputPath, '# Article\n');
      return Promise.resolve('VALIDATOR: PASS — documents the feature.');
    }),
    uploadAttachment: mock(() =>
      Promise.resolve({ id: 'a1', url: 'https://example.com/a1' }),
    ),
    linkAttachmentToWorkItem: mock(() => Promise.resolve({})),
    addWorkItemComment: mock(() => Promise.resolve({})),
    classifyDocs: mock(() =>
      Promise.resolve({
        kind: 'newfeature' as const,
        candidates: [],
        reasoning: 'test default',
      }),
    ),
    ...overrides,
  };
}

describe('processDocsItem', () => {
  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), 'proc-out-'));
    docsDir = mkdtempSync(join(tmpdir(), 'proc-docs-'));
    mkdirSync(join(docsDir, 'en-us', 'Continia Banking'), { recursive: true });
  });
  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(docsDir, { recursive: true, force: true });
  });

  test('full flow: generates, attaches, links and comments; junctions cleaned up', async () => {
    const config = cfg();
    const deps = makeDeps();

    const result = await processDocsItem(config, 42, deps);

    expect(result.documented).toBe(true);
    // Default classifier mock → new-feature article.
    expect(result.articlePath).toContain('workitem-42-newfeature.md');
    expect(deps.createSkillJunctions).toHaveBeenCalledTimes(1);
    expect(deps.removeSkillJunctions).toHaveBeenCalledTimes(1);
    expect(deps.uploadAttachment).toHaveBeenCalledTimes(1);
    expect(deps.linkAttachmentToWorkItem).toHaveBeenCalledTimes(1);
    expect(deps.addWorkItemComment).toHaveBeenCalledTimes(1);
  });

  test('posts the comment as HTML, converting the Markdown summary', async () => {
    const config = cfg();
    const addWorkItemComment = mock(() => Promise.resolve({}));
    const deps = makeDeps({
      generateDocs: mock((_cfg, ctx: DocsContext) => {
        writeFileSync(ctx.outputPath, '# Article\n');
        return Promise.resolve('## Verdict\n\n**PASS** — documents `CB-3631`.');
      }),
      addWorkItemComment,
    });

    await processDocsItem(config, 42, deps);

    expect(addWorkItemComment).toHaveBeenCalledTimes(1);
    const comment = (addWorkItemComment.mock.calls[0] as unknown[])[2] as string;
    expect(comment).toContain('<b>Documentation article generated and attached:</b>');
    expect(comment).toContain('<strong>PASS</strong>');
    expect(comment).toContain('<code>CB-3631</code>');
    // raw Markdown tokens must not leak into the rendered comment
    expect(comment).not.toContain('## Verdict');
    expect(comment).not.toContain('**PASS**');
  });

  test('posts only the marked comment block, not the validator dump', async () => {
    const config = cfg();
    const addWorkItemComment = mock(() => Promise.resolve({}));
    const deps = makeDeps({
      generateDocs: mock((_cfg, ctx: DocsContext) => {
        writeFileSync(ctx.outputPath, '# Article\n');
        return Promise.resolve(
          'Validation Report\nAC01 — Bold UI term accuracy\nVerdict: PASS\n\n' +
            '<<<WORKITEM-COMMENT>>>\n' +
            'Documents the Request Header Log feature.\n\n' +
            'No content concerns — all UI terms and behavior traced to the AL code.\n' +
            '<<<END-WORKITEM-COMMENT>>>',
        );
      }),
      addWorkItemComment,
    });

    await processDocsItem(config, 42, deps);

    const comment = (addWorkItemComment.mock.calls[0] as unknown[])[2] as string;
    expect(comment).toContain('Documents the Request Header Log feature.');
    expect(comment).toContain('No content concerns');
    // the validator report outside the markers must not reach the comment
    expect(comment).not.toContain('Validation Report');
    expect(comment).not.toContain('AC01');
    expect(comment).not.toContain('Verdict: PASS');
    expect(comment).not.toContain('WORKITEM-COMMENT');
  });

  test('extractCommentBody falls back to the whole message without markers', () => {
    expect(extractCommentBody('  plain summary  ')).toBe('plain summary');
  });

  test('dry-run: writes article but performs no ADO writes', async () => {
    const config = cfg({ dryRun: true });
    const deps = makeDeps();

    const result = await processDocsItem(config, 42, deps);

    expect(result.documented).toBe(true);
    expect(deps.uploadAttachment).toHaveBeenCalledTimes(0);
    expect(deps.linkAttachmentToWorkItem).toHaveBeenCalledTimes(0);
    expect(deps.addWorkItemComment).toHaveBeenCalledTimes(0);
    // junctions still cleaned up
    expect(deps.removeSkillJunctions).toHaveBeenCalledTimes(1);
    // summary written to a sibling file rather than dumped to the terminal
    const summaryPath = join(outDir, 'workitem-42-summary.md');
    expect(existsSync(summaryPath)).toBe(true);
    expect(readFileSync(summaryPath, 'utf-8')).toContain('VALIDATOR: PASS');
    expect(result.summaryPath).toBe(summaryPath);
  });

  test('fetches PR context for linked pull requests', async () => {
    const config = cfg();
    const getPr = mock(() =>
      Promise.resolve({
        pullRequestId: 7,
        title: 'PR',
        description: '',
        status: 'active',
        sourceRefName: '',
        targetRefName: '',
        changedFiles: [],
      }),
    );
    const deps = makeDeps({
      parsePullRequestRefs: mock(() => [
        { projectId: 'p', repoId: 'r', pullRequestId: 7 },
      ]),
      getPullRequestContext: getPr,
    });

    await processDocsItem(config, 42, deps);
    expect(getPr).toHaveBeenCalledTimes(1);
  });

  test('fails when the agent produces no article file and no recoverable article block', async () => {
    const config = cfg();
    const deps = makeDeps({
      generateDocs: mock(() => Promise.resolve('done')), // writes nothing
    });

    const result = await processDocsItem(config, 42, deps);
    expect(result.documented).toBe(false);
    expect(result.error).toContain('did not produce an article');
    expect(deps.uploadAttachment).toHaveBeenCalledTimes(0);
    expect(deps.removeSkillJunctions).toHaveBeenCalledTimes(1);
  });

  test('recovers the article from the agent message when no file was written', async () => {
    const config = cfg();
    const article = '```meta\nid: CB-999\n```\n\n# Recovered Feature\n\nBody text.';
    const deps = makeDeps({
      // Agent drafted the article inline and forgot to Write the file.
      generateDocs: mock(() =>
        Promise.resolve(
          `Here is the article.\n\n<<<ARTICLE>>>\n${article}\n<<<END-ARTICLE>>>\n\n` +
            `<<<WORKITEM-COMMENT>>>\nDocuments the recovered feature.\n<<<END-WORKITEM-COMMENT>>>`,
        ),
      ),
    });

    const result = await processDocsItem(config, 42, deps);

    expect(result.documented).toBe(true);
    expect(result.articlePath).toContain('workitem-42-newfeature.md');
    // The recovered article was written to disk and uploaded.
    expect(existsSync(result.articlePath!)).toBe(true);
    expect(readFileSync(result.articlePath!, 'utf-8')).toContain('# Recovered Feature');
    expect(deps.uploadAttachment).toHaveBeenCalledTimes(1);
    expect(deps.linkAttachmentToWorkItem).toHaveBeenCalledTimes(1);
    expect(deps.addWorkItemComment).toHaveBeenCalledTimes(1);
  });

  test('extractArticleBody returns the marked block, or null when absent', () => {
    expect(
      extractArticleBody('pre\n<<<ARTICLE>>>\n# Title\nbody\n<<<END-ARTICLE>>>\npost'),
    ).toBe('# Title\nbody');
    expect(extractArticleBody('no markers here')).toBeNull();
  });

  test('removes junctions even if generation throws', async () => {
    const config = cfg();
    const deps = makeDeps({
      generateDocs: mock(() => Promise.reject(new Error('boom'))),
    });

    const result = await processDocsItem(config, 42, deps);
    expect(result.documented).toBe(false);
    expect(result.error).toContain('boom');
    expect(deps.removeSkillJunctions).toHaveBeenCalledTimes(1);
  });

  test('an update deliverable is named for its target id and framed as an update', async () => {
    const config = cfg();
    const uploadAttachment = mock(() =>
      Promise.resolve({ id: 'a1', url: 'https://example.com/a1' }),
    );
    const addWorkItemComment = mock(() => Promise.resolve({}));
    const deps = makeDeps({
      classifyDocs: mock(() =>
        Promise.resolve({
          kind: 'update' as const,
          target: 'CB-142',
          candidates: [],
          reasoning: 'documented page',
        }),
      ),
      generateDocs: mock((_cfg, ctx: DocsContext) => {
        writeFileSync(ctx.outputPath, '# Update to CB-142\n');
        return Promise.resolve(
          '<<<WORKITEM-COMMENT>>>\nDelta update to the Payment approval article.\n<<<END-WORKITEM-COMMENT>>>\n' +
            '<<<DOCS-OUTPUT-KIND>>>\nkind: update\ntarget: CB-142\n<<<END-DOCS-OUTPUT-KIND>>>',
        );
      }),
      uploadAttachment,
      addWorkItemComment,
    });

    const result = await processDocsItem(config, 42, deps);

    expect(result.documented).toBe(true);
    expect(result.articlePath).toContain('workitem-42-update-CB-142.md');
    // The attachment carries the typed, target-bearing name.
    const attachName = (uploadAttachment.mock.calls[0] as unknown[])[1] as string;
    expect(attachName).toBe('workitem-42-update-CB-142.md');
    // The comment header is framed as an update for the target id, not a new article.
    const comment = (addWorkItemComment.mock.calls[0] as unknown[])[2] as string;
    expect(comment).toContain('Documentation update for CB-142 attached:');
    expect(comment).not.toContain('article generated');
  });

  test('scopes the docs path to the resolved product folder and passes prefix + repo', async () => {
    let seenCtx: DocsContext | undefined;
    let seenCfg: AppConfig | undefined;
    const createSkillJunctions = mock(() => ['link-a']);
    const deps = makeDeps({
      createSkillJunctions,
      generateDocs: mock((c: AppConfig, ctx: DocsContext) => {
        seenCfg = c;
        seenCtx = ctx;
        writeFileSync(ctx.outputPath, '# Article\n');
        return Promise.resolve('ok');
      }),
    });

    const result = await processDocsItem(cfg(), 42, deps);

    expect(result.documented).toBe(true);
    // mockWorkItem's area path is Continia Software\Continia Banking\Banking Connectivity
    expect(seenCtx!.docsRepoPath).toBe(join(docsDir, 'en-us', 'Continia Banking'));
    expect(seenCtx!.productName).toBe('Continia Banking');
    expect(seenCtx!.idPrefix).toBe('CB');
    // The agent runs against the product's AL repo, resolved from targetRepoPaths.
    expect(seenCfg!.targetRepoPath).toBe('C:/repos/al-source');
    expect((createSkillJunctions.mock.calls[0] as unknown[])[0]).toBe('C:/repos/al-source');
  });

  test('selects the AL repo of the resolved product, not the default', async () => {
    mkdirSync(join(docsDir, 'en-us', 'Continia Document Capture'), { recursive: true });
    let seenCfg: AppConfig | undefined;
    let seenCtx: DocsContext | undefined;
    const deps = makeDeps({
      getWorkItem: mock(() =>
        Promise.resolve(
          mockWorkItem({
            fields: {
              'System.Title': 'DC feature',
              'System.WorkItemType': 'Feature',
              'System.AreaPath': 'Continia Software\\Document Capture\\OCR',
            },
          }),
        ),
      ),
      generateDocs: mock((c: AppConfig, ctx: DocsContext) => {
        seenCfg = c;
        seenCtx = ctx;
        writeFileSync(ctx.outputPath, '# Article\n');
        return Promise.resolve('ok');
      }),
    });
    const config = cfg({
      targetRepoPaths: { CB: 'C:/repos/al-banking', DC: 'C:/repos/al-doccapture' },
    });

    const result = await processDocsItem(config, 42, deps);

    expect(result.documented).toBe(true);
    expect(seenCfg!.targetRepoPath).toBe('C:/repos/al-doccapture');
    expect(seenCtx!.idPrefix).toBe('DC');
    expect(seenCtx!.docsRepoPath).toBe(join(docsDir, 'en-us', 'Continia Document Capture'));
  });

  test('unmapped area path → productIssue, no agent run, no junctions', async () => {
    const generateDocs = mock(() => Promise.resolve('should not run'));
    const deps = makeDeps({
      getWorkItem: mock(() =>
        Promise.resolve(
          mockWorkItem({
            fields: {
              'System.Title': 'Infra task',
              'System.WorkItemType': 'Task',
              'System.AreaPath': 'Continia Software\\InHouse',
            },
          }),
        ),
      ),
      generateDocs,
    });

    const result = await processDocsItem(cfg(), 42, deps);

    expect(result.documented).toBe(false);
    expect(result.productIssue).toContain('does not map to a known Continia product');
    expect(result.productIssue).toContain('Continia Software\\InHouse');
    expect(generateDocs).toHaveBeenCalledTimes(0);
    expect(deps.createSkillJunctions).toHaveBeenCalledTimes(0);
    // The processor itself does not comment — the watcher does, exactly once.
    expect(deps.addWorkItemComment).toHaveBeenCalledTimes(0);
  });

  test('resolved product without a configured AL repo → productIssue naming the env var', async () => {
    mkdirSync(join(docsDir, 'en-us', 'Continia Document Capture'), { recursive: true });
    const deps = makeDeps({
      getWorkItem: mock(() =>
        Promise.resolve(
          mockWorkItem({
            fields: { 'System.AreaPath': 'Continia Software\\Document Capture' },
          }),
        ),
      ),
    });

    const result = await processDocsItem(cfg(), 42, deps); // only CB configured

    expect(result.documented).toBe(false);
    expect(result.productIssue).toContain('TARGET_REPO_PATH_DC');
  });

  test('missing product docs folder → productIssue', async () => {
    rmSync(join(docsDir, 'en-us', 'Continia Banking'), { recursive: true, force: true });
    const deps = makeDeps();

    const result = await processDocsItem(cfg(), 42, deps);

    expect(result.documented).toBe(false);
    expect(result.productIssue).toContain('docs folder was not found');
  });

  test('a changelog deliverable is named and framed as a changelog entry', async () => {
    const config = cfg();
    const addWorkItemComment = mock(() => Promise.resolve({}));
    const deps = makeDeps({
      classifyDocs: mock(() =>
        Promise.resolve({ kind: 'changelog' as const, candidates: [], reasoning: 'bug fix' }),
      ),
      generateDocs: mock((_cfg, ctx: DocsContext) => {
        writeFileSync(ctx.outputPath, 'Changelog: fixed a rounding bug.\n');
        return Promise.resolve(
          '<<<DOCS-OUTPUT-KIND>>>\nkind: changelog\n<<<END-DOCS-OUTPUT-KIND>>>',
        );
      }),
      addWorkItemComment,
    });

    const result = await processDocsItem(config, 42, deps);

    expect(result.articlePath).toContain('workitem-42-changelog.md');
    const comment = (addWorkItemComment.mock.calls[0] as unknown[])[2] as string;
    expect(comment).toContain('Changelog entry generated and attached:');
  });

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
});

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

describe('extractOutputKind', () => {
  test('defaults to newfeature when the marker is absent (backward compatible)', () => {
    expect(extractOutputKind('just a summary, no marker')).toEqual({ kind: 'newfeature' });
  });

  test('parses an update with its target id', () => {
    const msg = 'pre\n<<<DOCS-OUTPUT-KIND>>>\nkind: update\ntarget: CB-142\n<<<END-DOCS-OUTPUT-KIND>>>\npost';
    expect(extractOutputKind(msg)).toEqual({ kind: 'update', target: 'CB-142' });
  });

  test('parses update targets for any product prefix', () => {
    expect(
      extractOutputKind('<<<DOCS-OUTPUT-KIND>>>\nkind: update\ntarget: DC-178\n<<<END-DOCS-OUTPUT-KIND>>>'),
    ).toEqual({ kind: 'update', target: 'DC-178' });
    expect(
      extractOutputKind('<<<DOCS-OUTPUT-KIND>>>\nkind: update\ntarget: COPP-04\n<<<END-DOCS-OUTPUT-KIND>>>'),
    ).toEqual({ kind: 'update', target: 'COPP-04' });
  });

  test('parses newfeature and changelog kinds', () => {
    expect(
      extractOutputKind('<<<DOCS-OUTPUT-KIND>>>\nkind: newfeature\n<<<END-DOCS-OUTPUT-KIND>>>'),
    ).toEqual({ kind: 'newfeature' });
    expect(
      extractOutputKind('<<<DOCS-OUTPUT-KIND>>>\nkind: changelog\n<<<END-DOCS-OUTPUT-KIND>>>'),
    ).toEqual({ kind: 'changelog' });
  });

  test('drops a stray target on a non-update kind', () => {
    const msg = '<<<DOCS-OUTPUT-KIND>>>\nkind: newfeature\ntarget: CB-9\n<<<END-DOCS-OUTPUT-KIND>>>';
    expect(extractOutputKind(msg)).toEqual({ kind: 'newfeature' });
  });
});

describe('deliverableFileName', () => {
  test('encodes each kind in the filename', () => {
    expect(deliverableFileName(42, { kind: 'newfeature' })).toBe('workitem-42-newfeature.md');
    expect(deliverableFileName(42, { kind: 'update', target: 'CB-142' })).toBe(
      'workitem-42-update-CB-142.md',
    );
    expect(deliverableFileName(42, { kind: 'update' })).toBe('workitem-42-update.md');
    expect(deliverableFileName(42, { kind: 'changelog' })).toBe('workitem-42-changelog.md');
  });
});

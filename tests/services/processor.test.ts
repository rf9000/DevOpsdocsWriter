import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { processDocsItem } from '../../src/services/processor.ts';
import type { ProcessorDeps } from '../../src/services/processor.ts';
import type { DocsContext } from '../../src/services/generator.ts';
import { mockConfig, mockWorkItem } from '../helpers.ts';

let outDir: string;

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
    ...overrides,
  };
}

describe('processDocsItem', () => {
  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), 'proc-out-'));
  });
  afterEach(() => rmSync(outDir, { recursive: true, force: true }));

  test('full flow: generates, attaches, links and comments; junctions cleaned up', async () => {
    const config = mockConfig({ outputDir: outDir });
    const deps = makeDeps();

    const result = await processDocsItem(config, 42, deps);

    expect(result.documented).toBe(true);
    expect(result.articlePath).toContain('workitem-42-docs.md');
    expect(deps.createSkillJunctions).toHaveBeenCalledTimes(1);
    expect(deps.removeSkillJunctions).toHaveBeenCalledTimes(1);
    expect(deps.uploadAttachment).toHaveBeenCalledTimes(1);
    expect(deps.linkAttachmentToWorkItem).toHaveBeenCalledTimes(1);
    expect(deps.addWorkItemComment).toHaveBeenCalledTimes(1);
  });

  test('dry-run: writes article but performs no ADO writes', async () => {
    const config = mockConfig({ outputDir: outDir, dryRun: true });
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
    const config = mockConfig({ outputDir: outDir });
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

  test('fails when the agent produces no article file', async () => {
    const config = mockConfig({ outputDir: outDir });
    const deps = makeDeps({
      generateDocs: mock(() => Promise.resolve('done')), // writes nothing
    });

    const result = await processDocsItem(config, 42, deps);
    expect(result.documented).toBe(false);
    expect(result.error).toContain('did not produce an article');
    expect(deps.uploadAttachment).toHaveBeenCalledTimes(0);
    expect(deps.removeSkillJunctions).toHaveBeenCalledTimes(1);
  });

  test('removes junctions even if generation throws', async () => {
    const config = mockConfig({ outputDir: outDir });
    const deps = makeDeps({
      generateDocs: mock(() => Promise.reject(new Error('boom'))),
    });

    const result = await processDocsItem(config, 42, deps);
    expect(result.documented).toBe(false);
    expect(result.error).toContain('boom');
    expect(deps.removeSkillJunctions).toHaveBeenCalledTimes(1);
  });
});

import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runPollCycle } from '../../src/services/watcher.ts';
import type { WatcherDeps } from '../../src/services/watcher.ts';
import { StateStore } from '../../src/state/state-store.ts';
import { mockConfig } from '../helpers.ts';

function makeDeps(overrides: Partial<WatcherDeps> = {}): WatcherDeps {
  return {
    queryTaggedWorkItems: mock(() => Promise.resolve([])),
    processDocsItem: mock((_c, id: number) =>
      Promise.resolve({ itemId: id, documented: true }),
    ),
    removeTagFromWorkItem: mock(() => Promise.resolve()),
    addTagToWorkItem: mock(() => Promise.resolve()),
    addWorkItemComment: mock(() => Promise.resolve({})),
    ...overrides,
  };
}

describe('runPollCycle', () => {
  let dir: string;
  let store: StateStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'watcher-test-'));
    store = new StateStore(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test('no tagged items → all zeros', async () => {
    const deps = makeDeps();
    const result = await runPollCycle(mockConfig(), store, deps);
    expect(result).toEqual({ documented: 0, skipped: 0, errors: 0 });
    expect(deps.processDocsItem).toHaveBeenCalledTimes(0);
  });

  test('documents each tagged item and removes the tag', async () => {
    const deps = makeDeps({
      queryTaggedWorkItems: mock(() => Promise.resolve([101, 102])),
    });
    const result = await runPollCycle(mockConfig(), store, deps);

    expect(result.documented).toBe(2);
    expect(deps.removeTagFromWorkItem).toHaveBeenCalledTimes(2);
    expect(store.isProcessed(101)).toBe(true);
    expect(store.isProcessed(102)).toBe(true);
  });

  test('adds the docs-written tag to each documented item', async () => {
    const deps = makeDeps({
      queryTaggedWorkItems: mock(() => Promise.resolve([101, 102])),
    });
    const config = mockConfig();
    await runPollCycle(config, store, deps);

    expect(deps.addTagToWorkItem).toHaveBeenCalledTimes(2);
    expect(deps.addTagToWorkItem).toHaveBeenCalledWith(config, 101, config.docsWrittenTag);
    expect(deps.addTagToWorkItem).toHaveBeenCalledWith(config, 102, config.docsWrittenTag);
  });

  test('a failed tag removal still adds the docs-written tag', async () => {
    const deps = makeDeps({
      queryTaggedWorkItems: mock(() => Promise.resolve([101])),
      removeTagFromWorkItem: mock(() => Promise.reject(new Error('boom'))),
    });
    const result = await runPollCycle(mockConfig(), store, deps);
    expect(result.documented).toBe(1);
    expect(deps.addTagToWorkItem).toHaveBeenCalledTimes(1);
  });

  test('dry-run does not remove or add tags', async () => {
    const deps = makeDeps({
      queryTaggedWorkItems: mock(() => Promise.resolve([101])),
    });
    const result = await runPollCycle(mockConfig({ dryRun: true }), store, deps);
    expect(result.documented).toBe(1);
    expect(deps.removeTagFromWorkItem).toHaveBeenCalledTimes(0);
    expect(deps.addTagToWorkItem).toHaveBeenCalledTimes(0);
  });

  test('a failed item does not add the docs-written tag', async () => {
    const deps = makeDeps({
      queryTaggedWorkItems: mock(() => Promise.resolve([300])),
      processDocsItem: mock(() =>
        Promise.resolve({ itemId: 300, documented: false, error: 'x' }),
      ),
    });
    await runPollCycle(mockConfig(), store, deps);
    expect(deps.addTagToWorkItem).toHaveBeenCalledTimes(0);
  });

  test('failed item counts as error, tag kept, not marked processed', async () => {
    const deps = makeDeps({
      queryTaggedWorkItems: mock(() => Promise.resolve([300])),
      processDocsItem: mock(() =>
        Promise.resolve({ itemId: 300, documented: false, error: 'x' }),
      ),
    });
    const result = await runPollCycle(mockConfig(), store, deps);
    expect(result.errors).toBe(1);
    expect(deps.removeTagFromWorkItem).toHaveBeenCalledTimes(0);
    expect(store.isProcessed(300)).toBe(false);
  });

  test('respects the daily cap', async () => {
    const deps = makeDeps({
      queryTaggedWorkItems: mock(() => Promise.resolve([1, 2, 3])),
    });
    const result = await runPollCycle(mockConfig({ maxDocsPerDay: 2 }), store, deps);
    expect(result.documented).toBe(2);
    expect(result.skipped).toBe(1);
    expect(deps.processDocsItem).toHaveBeenCalledTimes(2);
  });

  test('posts the product-resolution comment once, keeps the tag, and does not repeat it', async () => {
    const addWorkItemComment = mock(() => Promise.resolve({}));
    const deps = makeDeps({
      queryTaggedWorkItems: mock(() => Promise.resolve([300])),
      processDocsItem: mock(() =>
        Promise.resolve({
          itemId: 300,
          documented: false,
          error: 'unmapped',
          productIssue: 'could not map area path "X" to a product',
        }),
      ),
      addWorkItemComment,
    });

    // First cycle: comment posted, tag kept, item not marked processed.
    let result = await runPollCycle(mockConfig(), store, deps);
    expect(result.errors).toBe(1);
    expect(addWorkItemComment).toHaveBeenCalledTimes(1);
    const html = (addWorkItemComment.mock.calls[0] as unknown[])[2] as string;
    expect(html).toContain('could not map area path');
    expect(deps.removeTagFromWorkItem).toHaveBeenCalledTimes(0);
    expect(store.isProcessed(300)).toBe(false);

    // Second cycle: same failure, but the comment is NOT posted again.
    result = await runPollCycle(mockConfig(), store, deps);
    expect(result.errors).toBe(1);
    expect(addWorkItemComment).toHaveBeenCalledTimes(1);
  });

  test('dry-run does not post the product-resolution comment', async () => {
    const addWorkItemComment = mock(() => Promise.resolve({}));
    const deps = makeDeps({
      queryTaggedWorkItems: mock(() => Promise.resolve([300])),
      processDocsItem: mock(() =>
        Promise.resolve({
          itemId: 300,
          documented: false,
          error: 'unmapped',
          productIssue: 'could not map',
        }),
      ),
      addWorkItemComment,
    });
    await runPollCycle(mockConfig({ dryRun: true }), store, deps);
    expect(addWorkItemComment).toHaveBeenCalledTimes(0);
  });

  test('an ordinary failure without productIssue posts no comment', async () => {
    const addWorkItemComment = mock(() => Promise.resolve({}));
    const deps = makeDeps({
      queryTaggedWorkItems: mock(() => Promise.resolve([300])),
      processDocsItem: mock(() =>
        Promise.resolve({ itemId: 300, documented: false, error: 'agent crashed' }),
      ),
      addWorkItemComment,
    });
    await runPollCycle(mockConfig(), store, deps);
    expect(addWorkItemComment).toHaveBeenCalledTimes(0);
  });

  test('a thrown error in processing is counted, not fatal', async () => {
    const deps = makeDeps({
      queryTaggedWorkItems: mock(() => Promise.resolve([1, 2])),
      processDocsItem: mock((_c, id: number) =>
        id === 1
          ? Promise.reject(new Error('boom'))
          : Promise.resolve({ itemId: id, documented: true }),
      ),
    });
    const result = await runPollCycle(mockConfig(), store, deps);
    expect(result.errors).toBe(1);
    expect(result.documented).toBe(1);
  });
});

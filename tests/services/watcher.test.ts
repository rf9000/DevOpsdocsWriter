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

  test('dry-run does not remove tags', async () => {
    const deps = makeDeps({
      queryTaggedWorkItems: mock(() => Promise.resolve([101])),
    });
    const result = await runPollCycle(mockConfig({ dryRun: true }), store, deps);
    expect(result.documented).toBe(1);
    expect(deps.removeTagFromWorkItem).toHaveBeenCalledTimes(0);
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

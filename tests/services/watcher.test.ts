import { describe, test, expect, mock, spyOn, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runPollCycle, retryAfter } from '../../src/services/watcher.ts';
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
    recordLedger: mock(() => {}),
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

describe('runPollCycle cost ledger', () => {
  let dir: string;
  let store: StateStore;
  const at = new Date('2026-10-13T09:00:00.000Z');

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'watcher-ledger-'));
    store = new StateStore(dir);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const ledgerLines = (deps: WatcherDeps) =>
    (deps.recordLedger as ReturnType<typeof mock>).mock.calls.map((c) => (c as unknown[])[1]);

  test('a documented item writes a completed line with cost, title and product', async () => {
    const deps = makeDeps({
      queryTaggedWorkItems: mock(() => Promise.resolve([101])),
      processDocsItem: mock(() =>
        Promise.resolve({
          itemId: 101,
          documented: true,
          title: 'Bank sync',
          productName: 'Continia Banking',
          costUsd: 1.2345,
        }),
      ),
      now: () => at,
    });
    await runPollCycle(mockConfig(), store, deps);
    expect(ledgerLines(deps)).toEqual([
      {
        at: at.toISOString(),
        workItemId: 101,
        outcome: 'completed',
        costUsd: 1.2345,
        title: 'Bank sync',
        product: 'Continia Banking',
      },
    ]);
  });

  test('a failed run writes a failed line with its error and spend', async () => {
    const deps = makeDeps({
      queryTaggedWorkItems: mock(() => Promise.resolve([102])),
      processDocsItem: mock(() =>
        Promise.resolve({ itemId: 102, documented: false, error: 'agent crashed', costUsd: 0.5 }),
      ),
      now: () => at,
    });
    await runPollCycle(mockConfig(), store, deps);
    expect(ledgerLines(deps)).toEqual([
      { at: at.toISOString(), workItemId: 102, outcome: 'failed', costUsd: 0.5, error: 'agent crashed' },
    ]);
  });

  test('a thrown error writes a failed line with no spend', async () => {
    const deps = makeDeps({
      queryTaggedWorkItems: mock(() => Promise.resolve([103])),
      processDocsItem: mock(() => Promise.reject(new Error('boom'))),
      now: () => at,
    });
    await runPollCycle(mockConfig(), store, deps);
    expect(ledgerLines(deps)).toEqual([
      { at: at.toISOString(), workItemId: 103, outcome: 'failed', costUsd: 0, error: 'Error: boom' },
    ]);
  });

  test('an unresolved product writes one skipped line, with the comment, not one per poll', async () => {
    const deps = makeDeps({
      queryTaggedWorkItems: mock(() => Promise.resolve([104])),
      processDocsItem: mock(() =>
        Promise.resolve({ itemId: 104, documented: false, error: 'unmapped', productIssue: 'could not map' }),
      ),
      now: () => at,
    });
    await runPollCycle(mockConfig(), store, deps);
    await runPollCycle(mockConfig(), store, deps);
    expect(ledgerLines(deps)).toEqual([
      { at: at.toISOString(), workItemId: 104, outcome: 'skipped', costUsd: 0, reason: 'could not map' },
    ]);
  });

  test('items skipped by the backoff write no line', async () => {
    store.recordFailure(105, 'x', at);
    store.recordFailure(105, 'x', at);
    store.recordFailure(105, 'x', at);
    const deps = makeDeps({ queryTaggedWorkItems: mock(() => Promise.resolve([105])), now: () => at });
    await runPollCycle(mockConfig(), store, deps);
    expect(deps.recordLedger).toHaveBeenCalledTimes(0);
  });

  test('a dry run writes no line', async () => {
    const deps = makeDeps({ queryTaggedWorkItems: mock(() => Promise.resolve([106])) });
    await runPollCycle(mockConfig({ dryRun: true }), store, deps);
    expect(deps.recordLedger).toHaveBeenCalledTimes(0);
  });

  test('a ledger write failure does not fail the item', async () => {
    const deps = makeDeps({
      queryTaggedWorkItems: mock(() => Promise.resolve([107])),
      recordLedger: mock(() => {
        throw new Error('disk full');
      }),
    });
    const result = await runPollCycle(mockConfig(), store, deps);
    expect(result.documented).toBe(1);
    expect(store.isProcessed(107)).toBe(true);
  });
});

describe('retryAfter', () => {
  const at = '2026-09-30T10:00:00.000Z';
  const hoursLater = (h: number) => new Date(Date.parse(at) + h * 3_600_000).toISOString();

  test('no pause before the third consecutive failure', () => {
    expect(retryAfter({ count: 1, lastError: 'x', lastFailedAt: at })).toBeNull();
    expect(retryAfter({ count: 2, lastError: 'x', lastFailedAt: at })).toBeNull();
  });

  test('cooldown grows 1h, 4h, then 24h', () => {
    expect(retryAfter({ count: 3, lastError: 'x', lastFailedAt: at })?.toISOString()).toBe(hoursLater(1));
    expect(retryAfter({ count: 4, lastError: 'x', lastFailedAt: at })?.toISOString()).toBe(hoursLater(4));
    expect(retryAfter({ count: 5, lastError: 'x', lastFailedAt: at })?.toISOString()).toBe(hoursLater(24));
    expect(retryAfter({ count: 9, lastError: 'x', lastFailedAt: at })?.toISOString()).toBe(hoursLater(24));
  });
});

describe('runPollCycle failure backoff', () => {
  let dir: string;
  let store: StateStore;
  let logs: string[];
  let logSpy: ReturnType<typeof spyOn>;
  let clock: Date;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'watcher-backoff-'));
    store = new StateStore(dir);
    clock = new Date('2026-09-30T10:00:00Z');
    logs = [];
    logSpy = spyOn(console, 'log').mockImplementation((m: unknown) => {
      logs.push(String(m));
    });
  });
  afterEach(() => {
    logSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  const advance = (minutes: number) => {
    clock = new Date(clock.getTime() + minutes * 60_000);
  };

  function failingDeps(error = 'EACCES: permission denied') {
    return makeDeps({
      queryTaggedWorkItems: mock(() => Promise.resolve([300])),
      processDocsItem: mock(() => Promise.resolve({ itemId: 300, documented: false, error })),
      now: () => clock,
    });
  }

  async function failCycles(deps: WatcherDeps, n: number) {
    for (let i = 0; i < n; i++) {
      await runPollCycle(mockConfig(), store, deps);
      advance(5);
    }
  }

  test('retries on every poll until the third failure, then skips with the error logged', async () => {
    const deps = failingDeps();
    await failCycles(deps, 3);
    expect(deps.processDocsItem).toHaveBeenCalledTimes(3);
    expect(logs.some((l) => l.includes('#300: Failed 3 times in a row') && l.includes('pausing retries until'))).toBe(true);

    logs = [];
    const result = await runPollCycle(mockConfig(), store, deps);
    expect(deps.processDocsItem).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ documented: 0, skipped: 1, errors: 0 });
    const line = logs.find((l) => l.includes('#300: Skipped'));
    expect(line).toContain('failed 3 time(s)');
    expect(line).toContain('next retry after');
    expect(line).toContain('last error: EACCES: permission denied');
  });

  test('retries once the cooldown has passed, and pauses longer on another failure', async () => {
    const deps = failingDeps();
    await failCycles(deps, 3); // third failure at 10:10, clock now 10:15
    advance(56); // 11:11 — past the 1h cooldown
    await runPollCycle(mockConfig(), store, deps);
    expect(deps.processDocsItem).toHaveBeenCalledTimes(4);
    expect(store.getFailure(300)?.count).toBe(4);

    advance(60); // one hour later — inside the 4h cooldown
    await runPollCycle(mockConfig(), store, deps);
    expect(deps.processDocsItem).toHaveBeenCalledTimes(4);
  });

  test('a success clears the failure record', async () => {
    let fail = true;
    const deps = makeDeps({
      queryTaggedWorkItems: mock(() => Promise.resolve([300])),
      processDocsItem: mock(() =>
        Promise.resolve(fail ? { itemId: 300, documented: false, error: 'x' } : { itemId: 300, documented: true }),
      ),
      now: () => clock,
    });
    await failCycles(deps, 2);
    fail = false;
    await runPollCycle(mockConfig(), store, deps);
    expect(store.getFailure(300)).toBeUndefined();
  });

  test('a thrown error counts as a failure', async () => {
    const deps = makeDeps({
      queryTaggedWorkItems: mock(() => Promise.resolve([300])),
      processDocsItem: mock(() => Promise.reject(new Error('boom'))),
      now: () => clock,
    });
    await failCycles(deps, 1);
    expect(store.getFailure(300)).toMatchObject({ count: 1, lastError: 'Error: boom' });
  });

  test('product-resolution failures are not counted, so a fixed work item retries at once', async () => {
    const deps = makeDeps({
      queryTaggedWorkItems: mock(() => Promise.resolve([300])),
      processDocsItem: mock(() =>
        Promise.resolve({ itemId: 300, documented: false, error: 'unmapped', productIssue: 'unmapped' }),
      ),
      now: () => clock,
    });
    await failCycles(deps, 4);
    expect(deps.processDocsItem).toHaveBeenCalledTimes(4);
    expect(store.getFailure(300)).toBeUndefined();
  });

  test('removing the tag forgets the failures, so re-tagging retries at once', async () => {
    const deps = failingDeps();
    await failCycles(deps, 3);
    deps.queryTaggedWorkItems = mock(() => Promise.resolve([]));
    await runPollCycle(mockConfig(), store, deps);
    expect(store.getFailure(300)).toBeUndefined();

    deps.queryTaggedWorkItems = mock(() => Promise.resolve([300]));
    await runPollCycle(mockConfig(), store, deps);
    expect(deps.processDocsItem).toHaveBeenCalledTimes(4);
  });

  test('a skipped item does not block the items after it', async () => {
    const deps = makeDeps({
      queryTaggedWorkItems: mock(() => Promise.resolve([300, 301])),
      processDocsItem: mock((_c, id: number) =>
        Promise.resolve(id === 300 ? { itemId: id, documented: false, error: 'x' } : { itemId: id, documented: false, error: 'y' }),
      ),
      now: () => clock,
    });
    await failCycles(deps, 3);
    // Both paused now; a new item 302 still gets processed.
    deps.queryTaggedWorkItems = mock(() => Promise.resolve([300, 301, 302]));
    const result = await runPollCycle(mockConfig(), store, deps);
    expect(result.skipped).toBe(2);
    expect(deps.processDocsItem).toHaveBeenLastCalledWith(expect.anything(), 302);
  });
});

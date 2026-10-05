import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { StateStore } from '../../src/state/state-store.ts';

describe('StateStore', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'state-test-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('persists processed ids across reloads', () => {
    const store = new StateStore(dir);
    store.markProcessed(1);
    store.markProcessed(2);
    store.save();

    const reloaded = new StateStore(dir);
    expect(reloaded.isProcessed(1)).toBe(true);
    expect(reloaded.isProcessed(2)).toBe(true);
    expect(reloaded.isProcessed(3)).toBe(false);
    expect(reloaded.processedCount).toBe(2);
  });

  test('records when each item was drafted, keeping the latest time', () => {
    const store = new StateStore(dir);
    store.markProcessed(1, new Date('2026-10-01T08:00:00Z'));
    store.markProcessed(1, new Date('2026-10-03T09:00:00Z'), 'Continia Banking');
    store.save();

    const raw = JSON.parse(require('fs').readFileSync(join(dir, 'processed-items.json'), 'utf-8'));
    expect(raw.processedAt).toEqual({ '1': '2026-10-03T09:00:00.000Z' });
    expect(raw.processedProduct).toEqual({ '1': 'Continia Banking' });
    expect(raw.processedItemIds).toEqual([1]);
  });

  test('dedupes markProcessed', () => {
    const store = new StateStore(dir);
    store.markProcessed(1);
    store.markProcessed(1);
    expect(store.processedCount).toBe(1);
  });

  test('daily cap blocks once the max is reached and resets per day', () => {
    const store = new StateStore(dir);
    expect(store.canGenerateToday(2)).toBe(true);
    store.incrementDailyCount();
    store.incrementDailyCount();
    expect(store.canGenerateToday(2)).toBe(false);
    expect(store.dailyDocsCount).toBe(2);
  });

  test('reset clears state', () => {
    const store = new StateStore(dir);
    store.markProcessed(1);
    store.incrementDailyCount();
    store.reset();
    expect(store.processedCount).toBe(0);
    expect(store.dailyDocsCount).toBe(0);
  });

  test('recovers from corrupt state file', () => {
    const store = new StateStore(dir);
    store.markProcessed(1);
    store.save();
    // corrupt it
    require('fs').writeFileSync(join(dir, 'processed-items.json'), 'not json');
    const reloaded = new StateStore(dir);
    expect(reloaded.processedCount).toBe(0);
  });
  describe('failure records', () => {
    const t1 = new Date('2026-09-30T10:00:00Z');
    const t2 = new Date('2026-09-30T10:05:00Z');

    test('recordFailure counts consecutive failures and keeps the latest error', () => {
      const store = new StateStore(dir);
      expect(store.getFailure(7)).toBeUndefined();
      store.recordFailure(7, 'first', t1);
      const rec = store.recordFailure(7, 'second', t2);
      expect(rec).toEqual({ count: 2, lastError: 'second', lastFailedAt: t2.toISOString() });
      expect(store.getFailure(7)).toEqual(rec);
    });

    test('clearFailure forgets the item', () => {
      const store = new StateStore(dir);
      store.recordFailure(7, 'x', t1);
      store.clearFailure(7);
      expect(store.getFailure(7)).toBeUndefined();
    });

    test('failure records persist across reloads', () => {
      const store = new StateStore(dir);
      store.recordFailure(7, 'EACCES', t1);
      store.save();
      expect(new StateStore(dir).getFailure(7)).toEqual({
        count: 1,
        lastError: 'EACCES',
        lastFailedAt: t1.toISOString(),
      });
    });

    test('pruneFailures drops records for items not in the keep list', () => {
      const store = new StateStore(dir);
      store.recordFailure(7, 'x', t1);
      store.recordFailure(8, 'y', t1);
      store.pruneFailures([8]);
      expect(store.getFailure(7)).toBeUndefined();
      expect(store.getFailure(8)).toBeDefined();
    });

    test('a state file written before failure tracking loads with no records', () => {
      require('fs').writeFileSync(
        join(dir, 'processed-items.json'),
        JSON.stringify({ processedItemIds: [1], lastRunAt: '', dailyDocsCount: 0, dailyCountDate: '' }),
      );
      const store = new StateStore(dir);
      expect(store.isProcessed(1)).toBe(true);
      expect(store.getFailure(1)).toBeUndefined();
      store.recordFailure(1, 'x', t1);
      expect(store.getFailure(1)?.count).toBe(1);
    });
  });
});

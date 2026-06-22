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
});

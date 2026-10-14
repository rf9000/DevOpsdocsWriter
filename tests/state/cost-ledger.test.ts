import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { appendCostRecord } from '../../src/state/cost-ledger.ts';

describe('appendCostRecord', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cost-ledger-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test('appends one JSON line per record, creating the folder', () => {
    const path = join(dir, 'nested', 'cost-ledger.jsonl');
    appendCostRecord(path, { at: '2026-10-13T09:00:00.000Z', workItemId: 1, outcome: 'completed', costUsd: 1.5 });
    appendCostRecord(path, { at: '2026-10-13T10:00:00.000Z', workItemId: 2, outcome: 'failed', costUsd: 0, error: 'x' });

    const lines = readFileSync(path, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.map((l) => l.workItemId)).toEqual([1, 2]);
    expect(lines[1]).toEqual({ at: '2026-10-13T10:00:00.000Z', workItemId: 2, outcome: 'failed', costUsd: 0, error: 'x' });
  });
});

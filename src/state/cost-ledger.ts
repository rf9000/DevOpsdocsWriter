import { appendFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { LedgerRecord } from '../types/index.ts';

/**
 * Append one record to the JSONL cost ledger. Same format as the sibling
 * agents' ledgers, so the dashboard reads every bot with one parser. Throws on
 * I/O errors; the caller decides whether that matters.
 */
export function appendCostRecord(path: string, record: LedgerRecord): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(record)}\n`, 'utf-8');
}

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import type { ProcessedState } from '../types/index.ts';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export class StateStore {
  private filePath: string;
  private state: ProcessedState;
  private processedSet: Set<number>;
  private productCommentedSet: Set<number>;

  constructor(stateDir: string) {
    this.filePath = join(stateDir, 'processed-items.json');
    this.state = this.load();
    this.processedSet = new Set(this.state.processedItemIds);
    this.productCommentedSet = new Set(this.state.productCommentedItemIds);
  }

  private load(): ProcessedState {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, 'utf-8');
        const parsed: unknown = JSON.parse(raw);
        if (
          parsed !== null &&
          typeof parsed === 'object' &&
          'processedItemIds' in parsed &&
          Array.isArray((parsed as ProcessedState).processedItemIds)
        ) {
          const p = parsed as Partial<ProcessedState>;
          return {
            processedItemIds: p.processedItemIds ?? [],
            productCommentedItemIds: p.productCommentedItemIds ?? [],
            lastRunAt: p.lastRunAt ?? '',
            dailyDocsCount: p.dailyDocsCount ?? 0,
            dailyCountDate: p.dailyCountDate ?? '',
          };
        }
      }
    } catch {
      // file doesn't exist or is corrupted JSON — start fresh
    }
    return {
      processedItemIds: [],
      productCommentedItemIds: [],
      lastRunAt: '',
      dailyDocsCount: 0,
      dailyCountDate: '',
    };
  }

  save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    this.state.lastRunAt = new Date().toISOString();
    writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8');
  }

  isProcessed(itemId: number): boolean {
    return this.processedSet.has(itemId);
  }

  markProcessed(itemId: number): void {
    if (!this.processedSet.has(itemId)) {
      this.processedSet.add(itemId);
      this.state.processedItemIds.push(itemId);
    }
  }

  /** Whether the "could not resolve product" comment was already posted for this item. */
  hasProductComment(itemId: number): boolean {
    return this.productCommentedSet.has(itemId);
  }

  markProductCommented(itemId: number): void {
    if (!this.productCommentedSet.has(itemId)) {
      this.productCommentedSet.add(itemId);
      this.state.productCommentedItemIds.push(itemId);
    }
  }

  canGenerateToday(max: number): boolean {
    const today = todayISO();
    if (this.state.dailyCountDate !== today) {
      this.state.dailyDocsCount = 0;
      this.state.dailyCountDate = today;
    }
    return this.state.dailyDocsCount < max;
  }

  incrementDailyCount(): void {
    const today = todayISO();
    if (this.state.dailyCountDate !== today) {
      this.state.dailyDocsCount = 0;
      this.state.dailyCountDate = today;
    }
    this.state.dailyDocsCount++;
  }

  get dailyDocsCount(): number {
    return this.state.dailyDocsCount;
  }

  reset(): void {
    this.state = {
      processedItemIds: [],
      productCommentedItemIds: [],
      lastRunAt: '',
      dailyDocsCount: 0,
      dailyCountDate: '',
    };
    this.processedSet = new Set();
    this.productCommentedSet = new Set();
    this.save();
  }

  get processedCount(): number {
    return this.state.processedItemIds.length;
  }
}

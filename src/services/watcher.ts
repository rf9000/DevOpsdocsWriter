import type { AppConfig, DocsProcessResult } from '../types/index.ts';
import { StateStore } from '../state/state-store.ts';
import * as sdk from '../sdk/azure-devops-client.ts';
import * as proc from './processor.ts';

export interface WatcherDeps {
  queryTaggedWorkItems: (config: AppConfig, tag: string) => Promise<number[]>;
  processDocsItem: (config: AppConfig, itemId: number) => Promise<DocsProcessResult>;
  removeTagFromWorkItem: (
    config: AppConfig,
    workItemId: number,
    tag: string,
  ) => Promise<void>;
  addTagToWorkItem: (
    config: AppConfig,
    workItemId: number,
    tag: string,
  ) => Promise<void>;
}

const defaultDeps: WatcherDeps = {
  queryTaggedWorkItems: sdk.queryTaggedWorkItems,
  processDocsItem: proc.processDocsItem,
  removeTagFromWorkItem: sdk.removeTagFromWorkItem,
  addTagToWorkItem: sdk.addTagToWorkItem,
};

function log(message: string): void {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] ${message}`);
}

export async function runPollCycle(
  config: AppConfig,
  stateStore: StateStore,
  deps: WatcherDeps = defaultDeps,
): Promise<{ documented: number; skipped: number; errors: number }> {
  log(`Polling for work items tagged "${config.writeDocsTag}"...`);
  const itemIds = await deps.queryTaggedWorkItems(config, config.writeDocsTag);
  log(`Found ${itemIds.length} tagged work item(s)`);

  let documented = 0;
  let skipped = 0;
  let errors = 0;

  for (const itemId of itemIds) {
    if (!stateStore.canGenerateToday(config.maxDocsPerDay)) {
      log(`Daily limit reached (${config.maxDocsPerDay}). Skipping remaining items.`);
      skipped += itemIds.length - (documented + errors);
      break;
    }

    try {
      const result = await deps.processDocsItem(config, itemId);
      if (result.documented) {
        stateStore.markProcessed(itemId);
        stateStore.incrementDailyCount();
        documented++;

        // Remove the tag so the item is not picked up again (skipped in dry-run).
        if (!config.dryRun) {
          try {
            await deps.removeTagFromWorkItem(config, itemId, config.writeDocsTag);
            log(`#${itemId}: Removed "${config.writeDocsTag}" tag`);
          } catch (tagErr) {
            log(`#${itemId}: Warning — failed to remove tag: ${tagErr}`);
          }

          // Mark the item as documented so it is visible in the ADO overview
          // (idempotent — keeps an existing tag if the item was reopened).
          try {
            await deps.addTagToWorkItem(config, itemId, config.docsWrittenTag);
            log(`#${itemId}: Added "${config.docsWrittenTag}" tag`);
          } catch (tagErr) {
            log(`#${itemId}: Warning — failed to add tag: ${tagErr}`);
          }
        }
      } else {
        log(`#${itemId}: Documentation failed — ${result.error ?? 'unknown reason'}`);
        errors++;
      }
    } catch (err) {
      log(`#${itemId}: Fatal error — ${err}`);
      errors++;
    }
  }

  stateStore.save();
  return { documented, skipped, errors };
}

function sleep(ms: number, signal: { aborted: boolean }): Promise<void> {
  return new Promise((resolve) => {
    const checkInterval = 1000;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += checkInterval;
      if (signal.aborted || elapsed >= ms) {
        clearInterval(timer);
        resolve();
      }
    }, checkInterval);
  });
}

export async function startWatcher(config: AppConfig): Promise<void> {
  const stateStore = new StateStore(config.stateDir);
  const signal = { aborted: false };

  const shutdown = () => {
    log('Shutting down...');
    signal.aborted = true;
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  log(`Starting docsWriter — polling every ${config.pollIntervalMinutes} minutes`);
  log(`Watching tag: "${config.writeDocsTag}"`);
  log(`Source repo: ${config.targetRepoPath}`);
  log(`Max ${config.maxDocsPerDay} articles per day`);

  while (!signal.aborted) {
    try {
      const result = await runPollCycle(config, stateStore);
      log(`Cycle complete: ${result.documented} documented, ${result.skipped} skipped, ${result.errors} errors`);
    } catch (err) {
      log(`Cycle failed: ${err}`);
    }

    if (!signal.aborted) {
      log(`Sleeping ${config.pollIntervalMinutes} minutes...`);
      await sleep(config.pollIntervalMinutes * 60 * 1000, signal);
    }
  }

  log('Watcher stopped');
}

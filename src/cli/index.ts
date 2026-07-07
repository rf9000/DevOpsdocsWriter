#!/usr/bin/env bun

import { loadConfig } from '../config/index.ts';
import { startWatcher, runPollCycle } from '../services/watcher.ts';
import { StateStore } from '../state/state-store.ts';
import { queryTaggedWorkItems } from '../sdk/azure-devops-client.ts';
import { processDocsItem, classifyItem } from '../services/processor.ts';

const HELP = `
docsWriter — auto-generate Azure DevOps documentation articles from tagged work items

Usage:
  docswriter <command>

Commands:
  watch            Start the long-running watcher (polls every N minutes)
  run-once         Run a single poll cycle and exit
  test-item <id>   Generate docs for a single work item (dry-run, no ADO writes)
  classify-item <id>  Run only the classifier for a work item (prints the JSON decision)
  debug-tags       List work items currently carrying the write-docs tag
  reset-state      Clear the processed-item state and exit
  help             Show this help message

Options:
  --dry-run        Read-only mode: generate the article + skip Azure DevOps writes and tag removal

Environment variables (see .env.example):
  AZURE_DEVOPS_PAT/ORG/PROJECT   Azure DevOps connection (required)
  TARGET_REPO_PATH_<PREFIX>      Per-product AL source repos, e.g. TARGET_REPO_PATH_CB
                                 (at least one required; legacy TARGET_REPO_PATH = CB)
  DOCS_REPO_PATH                 continia.docs.articles repo (required)
  PRODUCT_FIELD                  Work item field that identifies the product
                                 (default: System.AreaPath)
  WRITE_DOCS_TAG                 Tag that triggers documentation (default: write-docs)
  OUTPUT_DIR                     Where the article is written (default: .output)
  SKILLS_SOURCE_DIR              docsWriter's skills (default: .claude/skills)
  POLL_INTERVAL_MINUTES          Polling interval (default: 15)
  MAX_DOCS_PER_DAY               Daily cap (default: 5)
  CLAUDE_MODEL                   Claude model (default: claude-sonnet-4-6)
`.trim();

const command = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

switch (command) {
  case 'watch': {
    const config = loadConfig();
    config.dryRun = dryRun;
    if (dryRun) console.log('[DRY RUN] No writes will be made to Azure DevOps\n');
    await startWatcher(config);
    break;
  }

  case 'run-once': {
    const config = loadConfig();
    config.dryRun = dryRun;
    if (dryRun) console.log('[DRY RUN] No writes will be made to Azure DevOps\n');
    const stateStore = new StateStore(config.stateDir);
    const result = await runPollCycle(config, stateStore);
    console.log(`Done: ${result.documented} documented, ${result.skipped} skipped, ${result.errors} errors`);
    break;
  }

  case 'test-item': {
    const itemIdArg = process.argv[3];
    if (!itemIdArg || isNaN(Number(itemIdArg))) {
      console.error('Usage: docswriter test-item <work-item-id>');
      process.exitCode = 1;
      break;
    }
    const config = loadConfig();
    config.dryRun = true;
    console.log(`[DRY RUN] Generating docs for work item #${itemIdArg}\n`);
    const result = await processDocsItem(config, Number(itemIdArg));
    if (result.documented) {
      console.log(`\nDone:`);
      console.log(`  Article: ${result.articlePath}`);
      if (result.summaryPath) console.log(`  Summary: ${result.summaryPath}`);
    } else {
      console.log(`\nDone: failed${result.error ? ` (${result.error})` : ''}`);
    }
    break;
  }

  case 'classify-item': {
    const itemIdArg = process.argv[3];
    if (!itemIdArg || isNaN(Number(itemIdArg))) {
      console.error('Usage: docswriter classify-item <work-item-id>');
      process.exitCode = 1;
      break;
    }
    const config = loadConfig();
    config.dryRun = true;
    console.log(`Classifying work item #${itemIdArg} (no article is drafted, no ADO writes)\n`);
    const result = await classifyItem(config, Number(itemIdArg));
    if ('productIssue' in result) {
      console.log(`Failed: ${result.productIssue}`);
      process.exitCode = 1;
      break;
    }
    console.log(JSON.stringify(result.classification, null, 2));
    break;
  }

  case 'debug-tags': {
    const config = loadConfig();
    const ids = await queryTaggedWorkItems(config, config.writeDocsTag);
    console.log(`Work items tagged "${config.writeDocsTag}": ${ids.length === 0 ? '(none)' : ids.join(', ')}`);
    break;
  }

  case 'reset-state': {
    const config = loadConfig();
    const stateStore = new StateStore(config.stateDir);
    stateStore.reset();
    console.log('State has been reset');
    break;
  }

  case 'help':
  default:
    console.log(HELP);
    break;
}

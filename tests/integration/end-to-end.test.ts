import { describe, test, expect } from 'bun:test';
import { loadConfig } from '../../src/config/index.ts';
import {
  queryTaggedWorkItems,
  getWorkItem,
  getWorkItemComments,
} from '../../src/sdk/azure-devops-client.ts';

// These tests hit the live Azure DevOps API. They are skipped unless real
// credentials are present in the environment.
const hasCreds =
  !!process.env.AZURE_DEVOPS_PAT &&
  !!process.env.AZURE_DEVOPS_ORG &&
  !!process.env.AZURE_DEVOPS_PROJECT &&
  !!process.env.TARGET_REPO_PATH &&
  !!process.env.DOCS_REPO_PATH;

const maybe = hasCreds ? describe : describe.skip;

maybe('integration (live Azure DevOps)', () => {
  test('lists work items carrying the write-docs tag', async () => {
    const config = loadConfig();
    const ids = await queryTaggedWorkItems(config, config.writeDocsTag);
    expect(Array.isArray(ids)).toBe(true);
  });

  test('fetches a tagged work item and its comments', async () => {
    const config = loadConfig();
    const ids = await queryTaggedWorkItems(config, config.writeDocsTag);
    if (ids.length === 0) return;
    const item = await getWorkItem(config, ids[0]!);
    expect(item.id).toBe(ids[0]!);
    const comments = await getWorkItemComments(config, ids[0]!);
    expect(Array.isArray(comments)).toBe(true);
  });
});

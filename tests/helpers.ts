import type { AppConfig, WorkItemResponse } from '../src/types/index.ts';

export function mockConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    org: 'my-org',
    orgUrl: 'https://dev.azure.com/my-org',
    project: 'my-project',
    pat: 'test-pat-token',
    targetRepoPath: 'C:/repos/al-source',
    docsRepoPath: 'C:/repos/continia.docs.articles',
    outputDir: '.output',
    skillsSourceDir: '.claude/skills',
    writeDocsTag: 'write-docs',
    docsWrittenTag: 'Docs-Article-Written',
    pollIntervalMinutes: 5,
    maxDocsPerDay: 5,
    claudeModel: 'claude-sonnet-4-6',
    maxTurns: 60,
    promptPath: './prompt.md',
    stateDir: '.state',
    dryRun: false,
    ...overrides,
  };
}

export function mockWorkItem(
  overrides: Partial<WorkItemResponse> = {},
): WorkItemResponse {
  return {
    id: 42,
    fields: {
      'System.Title': 'Test feature',
      'System.WorkItemType': 'Feature',
      'System.Description': 'A test feature.',
      'System.State': 'Active',
      'System.Tags': 'write-docs',
    },
    rev: 1,
    url: 'https://example.com/42',
    ...overrides,
  };
}

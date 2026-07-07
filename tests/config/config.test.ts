import { describe, test, expect } from 'bun:test';
import { loadConfig } from '../../src/config/index.ts';

function baseEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    AZURE_DEVOPS_PAT: 'pat',
    AZURE_DEVOPS_ORG: 'org',
    AZURE_DEVOPS_PROJECT: 'proj',
    TARGET_REPO_PATH: 'C:/repos/al',
    DOCS_REPO_PATH: 'C:/repos/docs',
    ...overrides,
  };
}

describe('loadConfig', () => {
  test('loads required values and derives orgUrl', () => {
    const cfg = loadConfig(baseEnv());
    expect(cfg.org).toBe('org');
    expect(cfg.orgUrl).toBe('https://dev.azure.com/org');
    expect(cfg.project).toBe('proj');
    expect(cfg.targetRepoPath).toBe('C:/repos/al');
    expect(cfg.docsRepoPath).toBe('C:/repos/docs');
  });

  test('applies defaults for optional values', () => {
    const cfg = loadConfig(baseEnv());
    expect(cfg.writeDocsTag).toBe('write-docs');
    expect(cfg.docsWrittenTag).toBe('Docs-Article-Written');
    expect(cfg.outputDir).toBe('.output');
    expect(cfg.skillsSourceDir).toBe('.claude/skills');
    expect(cfg.pollIntervalMinutes).toBe(15);
    expect(cfg.maxDocsPerDay).toBe(5);
    expect(cfg.claudeModel).toBe('claude-sonnet-4-6');
    expect(cfg.dryRun).toBe(false);
  });

  test('coerces numeric env vars', () => {
    const cfg = loadConfig(
      baseEnv({ POLL_INTERVAL_MINUTES: '30', MAX_DOCS_PER_DAY: '2' }),
    );
    expect(cfg.pollIntervalMinutes).toBe(30);
    expect(cfg.maxDocsPerDay).toBe(2);
  });

  test('throws when a required var is missing', () => {
    expect(() => loadConfig(baseEnv({ DOCS_REPO_PATH: undefined }))).toThrow(
      /DOCS_REPO_PATH/,
    );
    expect(() => loadConfig(baseEnv({ TARGET_REPO_PATH: undefined }))).toThrow(
      /TARGET_REPO_PATH/,
    );
  });

  test('legacy TARGET_REPO_PATH maps to the CB product repo', () => {
    const cfg = loadConfig(baseEnv());
    expect(cfg.targetRepoPaths).toEqual({ CB: 'C:/repos/al' });
    expect(cfg.targetRepoPath).toBe('C:/repos/al');
  });

  test('collects per-product TARGET_REPO_PATH_<PREFIX> vars', () => {
    const cfg = loadConfig(
      baseEnv({
        TARGET_REPO_PATH: undefined,
        TARGET_REPO_PATH_CB: 'C:/repos/al-banking',
        TARGET_REPO_PATH_DC: 'C:/repos/al-doccapture',
        TARGET_REPO_PATH_COPP: 'C:/repos/al-opplus',
      }),
    );
    expect(cfg.targetRepoPaths).toEqual({
      CB: 'C:/repos/al-banking',
      DC: 'C:/repos/al-doccapture',
      COPP: 'C:/repos/al-opplus',
    });
    // The fallback default prefers CB.
    expect(cfg.targetRepoPath).toBe('C:/repos/al-banking');
  });

  test('an explicit TARGET_REPO_PATH_CB wins over the legacy TARGET_REPO_PATH', () => {
    const cfg = loadConfig(
      baseEnv({ TARGET_REPO_PATH_CB: 'C:/repos/al-banking-explicit' }),
    );
    expect(cfg.targetRepoPaths['CB']).toBe('C:/repos/al-banking-explicit');
  });

  test('defaults productField to System.AreaPath and honours the override', () => {
    expect(loadConfig(baseEnv()).productField).toBe('System.AreaPath');
    expect(
      loadConfig(baseEnv({ PRODUCT_FIELD: 'Custom.Product' })).productField,
    ).toBe('Custom.Product');
  });

  test('honours overrides for the tag and dirs', () => {
    const cfg = loadConfig(
      baseEnv({ WRITE_DOCS_TAG: 'doc-it', OUTPUT_DIR: 'out' }),
    );
    expect(cfg.writeDocsTag).toBe('doc-it');
    expect(cfg.outputDir).toBe('out');
  });
});

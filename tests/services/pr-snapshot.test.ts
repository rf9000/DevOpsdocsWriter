import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { AppConfig, PrContext } from '../../src/types/index.ts';
import {
  snapshotPullRequest,
  removeSnapshots,
  renderSnapshotLines,
  hasSnapshot,
} from '../../src/services/pr-snapshot.ts';
import { mockConfig } from '../helpers.ts';

let outDir: string;

function cfg(): AppConfig {
  return mockConfig({ outputDir: outDir });
}

function pr(overrides: Partial<PrContext> = {}): PrContext {
  return {
    pullRequestId: 61281,
    title: 'Store payment file hash',
    description: '',
    status: 'active',
    sourceRefName: 'refs/heads/feat',
    targetRefName: 'refs/heads/main',
    changedFiles: ['/app/Payment Register/PaymentRegisters.Page.al', '/app/Setup/BankingSetup.Table.al'],
    repoId: 'repo-1',
    headCommitId: 'ada0bae7aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    deletedFiles: [],
    ...overrides,
  };
}

const quiet = () => {};

describe('snapshotPullRequest', () => {
  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), 'snap-out-'));
  });
  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
  });

  test('writes every changed AL file of an unmerged PR at its head commit', async () => {
    const getFileAtCommit = mock((_c: AppConfig, _repo: string, path: string, commit: string) =>
      Promise.resolve(`// ${path} @ ${commit}`),
    );

    const result = await snapshotPullRequest(cfg(), 86874, pr(), { getFileAtCommit, log: quiet });

    expect(getFileAtCommit).toHaveBeenCalledTimes(2);
    for (const call of getFileAtCommit.mock.calls) {
      expect(call[1]).toBe('repo-1');
      expect(call[3]).toBe('ada0bae7aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    }
    const snap = result.snapshot!;
    expect(snap.commitId).toBe('ada0bae7aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(snap.files).toEqual([
      '/app/Payment Register/PaymentRegisters.Page.al',
      '/app/Setup/BankingSetup.Table.al',
    ]);
    const onDisk = join(snap.dir, 'app', 'Payment Register', 'PaymentRegisters.Page.al');
    expect(readFileSync(onDisk, 'utf-8')).toBe(
      '// /app/Payment Register/PaymentRegisters.Page.al @ ada0bae7aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );
  });

  test('leaves a completed PR untouched: its code is in the working directory', async () => {
    const getFileAtCommit = mock(() => Promise.resolve('x'));
    const input = pr({ status: 'completed' });

    const result = await snapshotPullRequest(cfg(), 1, input, { getFileAtCommit, log: quiet });

    expect(result).toBe(input);
    expect(result.snapshot).toBeUndefined();
    expect(getFileAtCommit).not.toHaveBeenCalled();
  });

  test('leaves an abandoned PR untouched', async () => {
    const getFileAtCommit = mock(() => Promise.resolve('x'));
    const result = await snapshotPullRequest(cfg(), 1, pr({ status: 'abandoned' }), {
      getFileAtCommit,
      log: quiet,
    });
    expect(result.snapshot).toBeUndefined();
    expect(getFileAtCommit).not.toHaveBeenCalled();
  });

  test('skips deleted files and files that are not AL source, and reports the deletions', async () => {
    const getFileAtCommit = mock(() => Promise.resolve('x'));
    const result = await snapshotPullRequest(
      cfg(),
      1,
      pr({
        changedFiles: ['/app/A.Page.al', '/app/Gone.Codeunit.al', '/app/Translations/app.g.xlf', '/app'],
        deletedFiles: ['/app/Gone.Codeunit.al'],
      }),
      { getFileAtCommit, log: quiet },
    );

    expect(result.snapshot!.files).toEqual(['/app/A.Page.al']);
    expect(result.snapshot!.deletedFiles).toEqual(['/app/Gone.Codeunit.al']);
    expect(getFileAtCommit).toHaveBeenCalledTimes(1);
  });

  test('fails when an unmerged PR has no known head commit', async () => {
    const getFileAtCommit = mock(() => Promise.resolve('x'));
    await expect(
      snapshotPullRequest(cfg(), 1, pr({ headCommitId: '' }), { getFileAtCommit, log: quiet }),
    ).rejects.toThrow(/head commit/i);
  });

  test('fails when a changed file cannot be fetched, instead of falling back to stale code', async () => {
    const getFileAtCommit = mock(() => Promise.reject(new Error('Azure DevOps API error 500')));
    await expect(
      snapshotPullRequest(cfg(), 1, pr(), { getFileAtCommit, log: quiet }),
    ).rejects.toThrow(/PR #61281/);
  });

  test('refuses a path that escapes the snapshot directory', async () => {
    const getFileAtCommit = mock(() => Promise.resolve('x'));
    await expect(
      snapshotPullRequest(cfg(), 1, pr({ changedFiles: ['/../../evil.al'] }), {
        getFileAtCommit,
        log: quiet,
      }),
    ).rejects.toThrow(/outside/i);
  });

  test('removeSnapshots deletes the work item snapshot folder', async () => {
    const getFileAtCommit = mock(() => Promise.resolve('x'));
    const result = await snapshotPullRequest(cfg(), 86874, pr(), { getFileAtCommit, log: quiet });
    expect(existsSync(result.snapshot!.dir)).toBe(true);

    removeSnapshots(cfg(), 86874);

    expect(existsSync(result.snapshot!.dir)).toBe(false);
    // Removing again (nothing there) must not throw.
    removeSnapshots(cfg(), 86874);
  });
});

describe('renderSnapshotLines', () => {
  const snapshot = {
    commitId: 'ada0bae7aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    dir: '/out/.pr-snapshots/workitem-1/pr-61281',
    files: ['/app/A.Page.al'],
    deletedFiles: ['/app/Gone.Codeunit.al'],
  };

  test('renders nothing for a PR without a snapshot', () => {
    expect(renderSnapshotLines(pr({ status: 'completed' }))).toEqual([]);
    expect(hasSnapshot([pr({ status: 'completed' })])).toBe(false);
  });

  test('points the agent at the snapshot and away from the working copy and git', () => {
    const text = renderSnapshotLines(pr({ snapshot })).join('\n');
    expect(text).toContain('not merged');
    expect(text).toContain('/out/.pr-snapshots/workitem-1/pr-61281');
    expect(text).toContain('ada0bae7');
    expect(text).toContain('/app/A.Page.al');
    expect(text).toMatch(/git/);
    expect(text).toContain('/app/Gone.Codeunit.al');
    expect(hasSnapshot([pr({ snapshot })])).toBe(true);
  });
});

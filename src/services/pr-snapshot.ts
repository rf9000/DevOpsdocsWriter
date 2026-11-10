import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'path';

import type { AppConfig, PrContext, PrSnapshot } from '../types/index.ts';
import * as sdk from '../sdk/azure-devops-client.ts';

/**
 * Snapshot of an unmerged pull request's changed files, read over REST at the
 * PR's head commit.
 *
 * The AL repo the agent runs in holds merged code. While a PR is still open its
 * change is not there, so the agent used to pick the code up from whatever the
 * local clone happened to hold (a checked-out branch, a remote-tracking ref),
 * which lags behind the PR after a push. Work item 86874 got an article
 * describing an action that the PR's latest commit had already removed. The
 * snapshot pins the agent to the exact commit Azure DevOps reports as the head.
 */

/** Folder under OUTPUT_DIR holding the snapshots (the agent can read there). */
const SNAPSHOT_ROOT = '.pr-snapshots';

/** A pull request whose code is not on the target branch yet. */
const UNMERGED_STATUS = 'active';

/**
 * Source files worth snapshotting. Every product is AL; translations and other
 * generated files in a PR are large and carry nothing the docs need.
 */
const SOURCE_EXTENSIONS = new Set(['.al']);

const FETCH_BATCH_SIZE = 6;

export interface SnapshotDeps {
  getFileAtCommit: (
    config: AppConfig,
    repoId: string,
    path: string,
    commitId: string,
  ) => Promise<string>;
  log?: (message: string) => void;
}

const defaultDeps: SnapshotDeps = { getFileAtCommit: sdk.getFileAtCommit };

function isSourceFile(path: string): boolean {
  return SOURCE_EXTENSIONS.has(extname(path).toLowerCase());
}

function itemSnapshotDir(config: AppConfig, itemId: number): string {
  return join(resolve(config.outputDir), SNAPSHOT_ROOT, `workitem-${itemId}`);
}

/**
 * For an unmerged PR: fetch every changed source file at the head commit, write
 * it under the snapshot folder, and return the PR with `snapshot` set. A merged
 * or abandoned PR is returned unchanged.
 *
 * Any failure throws. Falling back to the working tree is exactly the stale
 * read this exists to prevent; a failed item keeps its tag and is retried.
 */
export async function snapshotPullRequest(
  config: AppConfig,
  itemId: number,
  pr: PrContext,
  deps: SnapshotDeps = defaultDeps,
): Promise<PrContext> {
  if (pr.status !== UNMERGED_STATUS) return pr;

  const label = `PR #${pr.pullRequestId}`;
  if (!pr.repoId || !pr.headCommitId) {
    throw new Error(
      `${label} is not merged and its head commit is unknown, so its code cannot be read reliably`,
    );
  }
  const { repoId, headCommitId } = pr;

  const deleted = new Set(pr.deletedFiles ?? []);
  const files = pr.changedFiles.filter((f) => isSourceFile(f) && !deleted.has(f));
  const dir = join(itemSnapshotDir(config, itemId), `pr-${pr.pullRequestId}`);

  const targets = files.map((file) => {
    const target = resolve(dir, `.${file.startsWith('/') ? '' : '/'}${file}`);
    const rel = relative(dir, target);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`${label}: changed file path resolves outside the snapshot folder: ${file}`);
    }
    return { file, target };
  });

  for (let i = 0; i < targets.length; i += FETCH_BATCH_SIZE) {
    await Promise.all(
      targets.slice(i, i + FETCH_BATCH_SIZE).map(async ({ file, target }) => {
        let content: string;
        try {
          content = await deps.getFileAtCommit(config, repoId, file, headCommitId);
        } catch (err) {
          throw new Error(
            `${label}: could not read ${file} at ${headCommitId.slice(0, 8)}: ` +
              `${err instanceof Error ? err.message : String(err)}`,
          );
        }
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, content);
      }),
    );
  }

  const snapshot: PrSnapshot = {
    commitId: headCommitId,
    dir,
    files,
    deletedFiles: (pr.deletedFiles ?? []).filter(isSourceFile),
  };
  (deps.log ?? console.log)(
    `  #${itemId}: ${label} is not merged; snapshotted ${files.length} changed file(s) at ${headCommitId.slice(0, 8)}`,
  );
  return { ...pr, snapshot };
}

/** Remove every snapshot written for a work item. Safe when none exist. */
export function removeSnapshots(config: AppConfig, itemId: number): void {
  rmSync(itemSnapshotDir(config, itemId), { recursive: true, force: true });
}

/** True when at least one PR carries a snapshot the agent must read from. */
export function hasSnapshot(pullRequests: PrContext[]): boolean {
  return pullRequests.some((pr) => pr.snapshot !== undefined);
}

/** Prompt lines telling the agent where an unmerged PR's code is. Empty without a snapshot. */
export function renderSnapshotLines(pr: PrContext): string[] {
  const snap = pr.snapshot;
  if (!snap) return [];

  const lines = [
    '',
    `**This pull request is not merged.** Your working directory does not hold its change: the files it touches are missing there or out of date. ` +
      `Each changed AL file was fetched at the pull request's latest commit (\`${snap.commitId.slice(0, 8)}\`) and saved under \`${snap.dir}\` at the same relative path. ` +
      `For these files, Read the snapshot copy and ignore the working-directory copy. ` +
      `Do not use git (\`git show\`, \`git diff\`, \`git log\`, branches) to read this change; local refs can lag behind the pull request.`,
  ];
  if (snap.files.length > 0) {
    lines.push(
      '',
      '**Snapshot files (relative to the snapshot folder):**',
      ...snap.files.map((f) => `- ${f}`),
    );
  }
  if (snap.deletedFiles.length > 0) {
    lines.push(
      '',
      '**Deleted by this pull request (treat as removed, even if still present in your working directory):**',
      ...snap.deletedFiles.map((f) => `- ${f}`),
    );
  }
  return lines;
}

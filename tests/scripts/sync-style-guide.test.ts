import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture, git, makeRepo, posix, readStatus, runSync, runSyncWithDocker, upstreamFile } from './helpers.ts';

setDefaultTimeout(300_000);

const good = await fixture('good.md');
const SYNC_SUBJECT = 'chore: sync style guide';

/** Runs the sync with `upstream` as the fetched file. */
async function sync(root: string, upstream: string, args: string[] = []) {
  return runSync(root, ['--upstream-file', await upstreamFile(root, upstream), ...args]);
}

describe('sanity gate', () => {
  test.concurrent('good upstream that differs is committed and pushed', async () => {
    const { root, guidePath } = await makeRepo(good);
    const upstream = `${good}\nExtra line.\n`;

    const res = await sync(root, upstream);

    expect(res.out).toContain('Pushed to origin/main');
    expect(res.code).toBe(0);
    expect(await readFile(guidePath, 'utf8')).toBe(upstream);
    expect(await git(root, 'log', '-1', '--pretty=%s')).toStartWith(SYNC_SUBJECT);
    expect(await git(root, 'rev-parse', 'origin/main')).toBe(await git(root, 'rev-parse', 'HEAD'));
  });

  test.concurrent('rejects upstream whose first non-empty line is not an H1', async () => {
    const { root, guidePath } = await makeRepo(good);

    const res = await sync(root, `\`HUMAN_GUIDE\` was supplied inline.\n\n\`\`\`\`\`markdown\n${good}`);

    expect(res.out).toContain('first line is not a level-1 heading');
    expect(res.code).toBe(7);
    expect(await readFile(guidePath, 'utf8')).toBe(good);
    expect(await git(root, 'status', '--porcelain')).toBe('');
  });

  test.concurrent('rejects upstream that misses a section listed in its table of contents', async () => {
    const { root, guidePath } = await makeRepo(good);

    const res = await sync(root, good.slice(0, good.indexOf('## 3. Links')));

    expect(res.out).toContain('section 3 is missing');
    expect(res.code).toBe(7);
    expect(await readFile(guidePath, 'utf8')).toBe(good);
  });

  test.concurrent('rejects upstream that ends inside an open code fence', async () => {
    const { root, guidePath } = await makeRepo(good);

    const res = await sync(root, `${good}\n\`\`\`\nunclosed\n`);

    expect(res.out).toContain('ends inside an open code fence');
    expect(res.code).toBe(7);
    expect(await readFile(guidePath, 'utf8')).toBe(good);
  });

  test.concurrent('rejects upstream under 60% of the local line count', async () => {
    const filler = Array.from({ length: 60 }, (_, i) => `Filler line ${i}.`).join('\n');
    const local = `${good}\n${filler}\n`;
    const { root, guidePath } = await makeRepo(local);

    const res = await sync(root, good);

    expect(res.out).toContain('lines, local has');
    expect(res.code).toBe(7);
    expect(await readFile(guidePath, 'utf8')).toBe(local);
  });

  test.concurrent('skips the shrink rule when there is no local guide', async () => {
    const { root, guidePath } = await makeRepo(null);
    expect(existsSync(guidePath)).toBe(false);

    const res = await sync(root, good);

    expect(res.code).toBe(0);
    expect(await readFile(guidePath, 'utf8')).toBe(good);
    expect(await git(root, 'log', '-1', '--pretty=%s')).toStartWith(SYNC_SUBJECT);
  });

  test.concurrent('gate ignores CRLF and a BOM', async () => {
    const { root, guidePath } = await makeRepo(good);
    const upstream = `${good}\nExtra line.\n`;

    const res = await sync(root, `${String.fromCharCode(0xfeff)}${upstream.replaceAll('\n', '\r\n')}`);

    expect(res.code).toBe(0);
    expect(await readFile(guidePath, 'utf8')).toBe(upstream);
  });

  test.concurrent('rejects upstream that ends in the middle of a table row', async () => {
    const { root, guidePath } = await makeRepo(good);

    const res = await sync(root, `${good}\n| Situation | Ru\n`);

    expect(res.out).toContain('ends in the middle of a table row');
    expect(res.code).toBe(7);
    expect(await readFile(guidePath, 'utf8')).toBe(good);
  });

  test.concurrent('rejects upstream that ends with a heading', async () => {
    const { root } = await makeRepo(good);

    const res = await sync(root, `${good}\n### 3.1 Cross-references\n`);

    expect(res.out).toContain('ends with a heading');
    expect(res.code).toBe(7);
  });

  // The real upstream guide has no newline after its last line, so that alone must not reject it.
  test.concurrent('accepts upstream without a trailing newline', async () => {
    const { root } = await makeRepo(good);

    const res = await sync(root, `${good}
The last sentence has no newline after it.`);

    expect(res.out).toContain('Pushed to origin/main');
    expect(res.code).toBe(0);
  });

  test.concurrent('reads a table of contents with other casing and bulleted entries', async () => {
    const { root } = await makeRepo(good);
    const bulleted = good.replace('## Table of contents', '## Table of Contents').replace(/^(\d)\. \[/gm, '- [$1. ');
    expect(bulleted).toContain('- [3. Links]');

    const res = await sync(root, bulleted.slice(0, bulleted.indexOf('## 3. Links')));

    expect(res.out).toContain('section 3 is missing');
    expect(res.code).toBe(7);
  });

  test.concurrent('rejects upstream cut off right after the table of contents heading', async () => {
    const { root } = await makeRepo(null);

    const res = await sync(root, `${good.slice(0, good.indexOf('1. [Frontmatter]'))}`);

    expect(res.out).toContain('table of contents is empty');
    expect(res.code).toBe(7);
  });

  test.concurrent('accepts a closed tilde fence that holds a backtick fence line', async () => {
    const { root } = await makeRepo(good);

    const res = await sync(root, `${good}\n~~~\n\`\`\`\nshown, not opened\n~~~\n`);

    expect(res.code).toBe(0);
  });

  test.concurrent('accepts a backtick line inside an indented code block', async () => {
    const { root } = await makeRepo(good);

    const res = await sync(root, `${good}\nIndented code:\n\n    \`\`\`\n\nDone.\n`);

    expect(res.code).toBe(0);
  });

  test.concurrent('a guide that already equals upstream is in sync, whatever the gate thinks of it', async () => {
    const odd = `Not a heading.\n\n${good}`;
    const { root } = await makeRepo(odd);

    const res = await sync(root, odd);

    expect(res.out).toContain('up to date');
    expect(res.code).toBe(0);
  });

  test.concurrent('upstream without a table of contents skips the section rule', async () => {
    const { root } = await makeRepo(good);
    const noToc = good.replace(/## Table of contents[\s\S]*?(?=## 1\. )/, '');
    expect(noToc).not.toContain('Table of contents');

    const res = await sync(root, `${noToc}\nExtra line.\n`);

    expect(res.out).toContain('no table of contents');
    expect(res.code).toBe(0);
  });
});

describe('status file', () => {
  const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;
  const changed = `${good}\nExtra line.\n`;
  const damaged = `Generator chatter.\n\n${good}`;

  test.concurrent('a sync writes status synced', async () => {
    const { root } = await makeRepo(good);

    await sync(root, changed);

    const status = await readStatus(root);
    expect(status).toMatchObject({ result: 'synced', exitCode: 0, inSync: true, reason: null, trigger: 'manual' });
    expect(status?.at).toMatch(ISO);
    expect(status?.lastSyncedAt).toMatch(ISO);
    expect(status).not.toHaveProperty('by');
  });

  test.concurrent('an up-to-date run writes up-to-date and keeps lastSyncedAt', async () => {
    const { root } = await makeRepo(good);
    const statusPath = join(root, '.state', 'style-guide-sync.status.json');
    await sync(root, changed);
    const first = await readStatus(root);
    await writeFile(statusPath, JSON.stringify({ ...first, lastSyncedAt: '2026-01-02T03:04:05Z' }));

    const res = await sync(root, changed);

    expect(res.code).toBe(0);
    expect(await readStatus(root)).toMatchObject({ result: 'up-to-date', exitCode: 0, inSync: true, reason: null, lastSyncedAt: '2026-01-02T03:04:05Z' });
  });

  test.concurrent('a rejection writes rejected with the reason and inSync false', async () => {
    const { root } = await makeRepo(good);

    await sync(root, damaged);

    const status = await readStatus(root);
    expect(status).toMatchObject({ result: 'rejected', exitCode: 7, inSync: false, reason: 'first line is not a level-1 heading' });
    expect(status).not.toHaveProperty('lastSyncedAt');
  });

  test.concurrent('trigger and by are recorded, and by is JSON-escaped', async () => {
    const { root } = await makeRepo(good);

    const by = `a "b" ${String.fromCharCode(92)} c${String.fromCharCode(27)}d`; // quote, backslash, ESC

    await sync(root, good, ['--trigger', 'dashboard', '--by', by]);

    expect(await readStatus(root)).toMatchObject({ trigger: 'dashboard', by: `a "b" ${String.fromCharCode(92)} c d` });
  });

  test.concurrent('an unknown trigger is a usage error', async () => {
    const { root } = await makeRepo(good);

    const res = await sync(root, good, ['--trigger', 'nonsense']);

    expect(res.code).toBe(2);
  });

  test.concurrent('a push failure writes failed with exit code 5', async () => {
    const { root } = await makeRepo(good);
    await git(root, 'remote', 'set-url', '--push', 'origin', posix(join(root, 'no-such-remote.git')));

    const res = await sync(root, changed);

    expect(res.code).toBe(5);
    const status = await readStatus(root);
    expect(status).toMatchObject({ result: 'failed', exitCode: 5, inSync: false });
    expect(String(status?.reason)).toContain('push');
  });

  test.concurrent('a wrong branch writes failed with exit code 4 and inSync null', async () => {
    const { root } = await makeRepo(good);
    await git(root, 'checkout', '-q', '-b', 'other');

    const res = await sync(root, changed);

    expect(res.code).toBe(4);
    expect(await readStatus(root)).toMatchObject({ result: 'failed', exitCode: 4, inSync: null });
  });

  test.concurrent('an unwritable status path does not change the exit code', async () => {
    const { root } = await makeRepo(good);
    const missing = posix(join(root, 'missing-dir', 'sub', 'status.json'));
    await writeFile(join(root, '.env'), `STYLE_GUIDE_STATUS_FILE=${missing}\n`);

    const res = await sync(root, good);

    expect(res.out).toContain('could not write status');
    expect(res.code).toBe(0);
  });

  test.concurrent('the status path comes from STYLE_GUIDE_STATUS_FILE', async () => {
    const { root } = await makeRepo(good);
    const custom = posix(join(root, '..', 'custom-status.json'));
    await writeFile(join(root, '.env'), `STYLE_GUIDE_STATUS_FILE=${custom}\n`);

    await sync(root, good);

    expect(await readStatus(root, custom)).toMatchObject({ result: 'up-to-date' });
    expect(await readStatus(root)).toBeNull();
  });

  test.concurrent('a long failure reason is cut to 500 characters', async () => {
    const { root } = await makeRepo(good);

    const res = await sync(root, changed, ['--env-file', `/nonexistent/${'x'.repeat(600)}`]);

    expect(res.code).toBe(2);
    const reason = String((await readStatus(root))?.reason);
    expect(reason).toStartWith('Config error: env file not found');
    expect(reason.length).toBe(500);
  });

  // flock is not in Git Bash on Windows; there the script runs without the lock.
  test.skipIf(process.platform === 'win32')('a second sync is skipped while one is running', async () => {
    const { root } = await makeRepo(good);
    const lock = join(root, '.state', 'style-guide-sync.lock');
    await mkdir(join(root, '.state'), { recursive: true });
    const holder = Bun.spawn(['flock', lock, 'sleep', '30'], { stdout: 'ignore', stderr: 'ignore' });
    await Bun.sleep(500);
    try {
      const res = await sync(root, changed);

      expect(res.out).toContain('Another style-guide sync is running');
      expect(res.code).toBe(0);
      expect(await readStatus(root)).toBeNull();
      expect(await git(root, 'log', '-1', '--pretty=%s')).toBe('initial');
    } finally {
      holder.kill();
    }
  });

  test.concurrent('--dry-run writes no status file', async () => {
    const { root } = await makeRepo(good);

    const res = await sync(root, changed, ['--dry-run']);

    expect(res.code).toBe(0);
    expect(await readStatus(root)).toBeNull();
  });
});

describe('container rebuild', () => {
  const changed = `${good}\nExtra line.\n`;
  /** A clone whose .env points compose at the clone's parent directory. */
  async function setup(extraEnv = '') {
    const { root } = await makeRepo(good);
    await writeFile(join(root, '.env'), `STYLE_GUIDE_COMPOSE_DIR=${posix(join(root, '..'))}\n${extraEnv}`);
    return root;
  }
  const withDocker = async (root: string, upstream: string, dockerExit = 0) =>
    runSyncWithDocker(root, ['--upstream-file', await upstreamFile(root, upstream)], dockerExit);

  test.concurrent('a sync rebuilds and restarts only the configured service', async () => {
    const root = await setup('STYLE_GUIDE_COMPOSE_SERVICE=docs-writer\n');

    const res = await withDocker(root, changed);

    expect(res.code).toBe(0);
    expect(res.docker).toEqual(['compose build docs-writer', 'compose up -d docs-writer']);
    expect(await readStatus(root)).toMatchObject({ result: 'synced' });
  });

  test.concurrent('without a configured service the whole compose project is rebuilt', async () => {
    const root = await setup();

    const res = await withDocker(root, changed);

    expect(res.code).toBe(0);
    expect(res.docker).toEqual(['compose build', 'compose up -d']);
    expect(res.out).toContain('every service');
  });

  test.concurrent('nothing is rebuilt when the guide is up to date or upstream is rejected', async () => {
    const root = await setup('STYLE_GUIDE_COMPOSE_SERVICE=docs-writer\n');

    expect((await withDocker(root, good)).docker).toEqual([]);
    expect((await withDocker(root, `Chatter.\n\n${good}`)).docker).toEqual([]);
  });

  test.concurrent('a service name that is not a compose service name is a config error', async () => {
    const root = await setup('STYLE_GUIDE_COMPOSE_SERVICE=docs-writer; rm -rf x\n');

    const res = await withDocker(root, changed);

    expect(res.code).toBe(2);
    expect(res.docker).toEqual([]);
    expect(String((await readStatus(root))?.reason)).toContain('STYLE_GUIDE_COMPOSE_SERVICE');
  });

  test.concurrent('a failed build is exit 6 and stops before the restart', async () => {
    const root = await setup('STYLE_GUIDE_COMPOSE_SERVICE=docs-writer\n');

    const res = await withDocker(root, changed, 1);

    expect(res.code).toBe(6);
    expect(res.docker).toEqual(['compose build docs-writer']);
    expect(await readStatus(root)).toMatchObject({ result: 'failed', exitCode: 6, inSync: true });
  });
});

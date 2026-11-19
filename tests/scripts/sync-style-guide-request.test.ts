import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fixture, makeRepo, posix, readStatus, runScript, upstreamFile } from './helpers.ts';

setDefaultTimeout(300_000);

const good = await fixture('good.md');

/** A clone whose status file lives in a separate request directory, as on the VM. */
async function setup() {
  const { root } = await makeRepo(good);
  const dir = join(dirname(root), 'monitor-requests');
  await mkdir(dir);
  await writeFile(join(root, '.env'), `STYLE_GUIDE_STATUS_FILE=${posix(join(dir, 'styleguide-sync.status.json'))}\n`);
  return {
    root,
    request: join(dir, 'styleguide-sync.request.json'),
    running: join(dir, 'styleguide-sync.running.json'),
    status: () => readStatus(root, join(dir, 'styleguide-sync.status.json')),
  };
}

/** Runs the request script; the sync it starts reads `good` as upstream and skips docker. */
async function runRequest(root: string) {
  return runScript('sync-style-guide-request.sh', ['--repo-root', posix(root), '--', '--skip-docker', '--upstream-file', await upstreamFile(root, good)]);
}

// The script takes its lock with flock, which Git Bash on Windows does not have.
describe.skipIf(process.platform === 'win32')('sync-style-guide-request.sh', () => {
  test.concurrent('no request file: exits 0 and runs nothing', async () => {
    const s = await setup();

    const res = await runRequest(s.root);

    expect(res.code).toBe(0);
    expect(await s.status()).toBeNull();
  });

  test.concurrent('a request runs the sync as the requester', async () => {
    const s = await setup();
    await writeFile(s.request, JSON.stringify({ at: '2026-11-19T10:00:00Z', by: 'someone@example.com' }));

    const res = await runRequest(s.root);

    expect(res.code).toBe(0);
    expect(await s.status()).toMatchObject({ result: 'up-to-date', trigger: 'dashboard', by: 'someone@example.com' });
    expect(existsSync(s.request)).toBe(false);
    expect(existsSync(s.running)).toBe(false);
  });

  test.concurrent('an unreadable request still runs the sync, without by', async () => {
    const s = await setup();
    await writeFile(s.request, 'not json');

    await runRequest(s.root);

    const status = await s.status();
    expect(status).toMatchObject({ trigger: 'dashboard' });
    expect(status).not.toHaveProperty('by');
  });

  test.concurrent('a request with by null runs the sync without by', async () => {
    const s = await setup();
    await writeFile(s.request, JSON.stringify({ at: '2026-11-19T10:00:00Z', by: null }));

    await runRequest(s.root);

    const status = await s.status();
    expect(status).toMatchObject({ trigger: 'dashboard' });
    expect(status).not.toHaveProperty('by');
  });

  test.concurrent('a by with quotes and spaces is passed as one argument', async () => {
    const s = await setup();
    await writeFile(s.request, JSON.stringify({ at: '2026-11-19T10:00:00Z', by: 'a "b" c' }));

    await runRequest(s.root);

    expect(await s.status()).toMatchObject({ by: 'a "b" c' });
  });

  test.concurrent('a leftover running file is cleared', async () => {
    const s = await setup();
    await writeFile(s.running, JSON.stringify({ at: '2026-11-19T10:00:00Z', by: 'gone' }));

    const res = await runRequest(s.root);

    expect(res.code).toBe(0);
    expect(existsSync(s.running)).toBe(false);
    expect(await s.status()).toBeNull();
  });

  test.concurrent('a failing sync still clears the running file and exits 0', async () => {
    const s = await setup();
    await writeFile(s.request, JSON.stringify({ at: '2026-11-19T10:00:00Z', by: 'u' }));
    await writeFile(join(s.root, '.claude', 'skills', 'docs-writer', 'references', 'style-guide.md'), 'dirty\n');

    const res = await runRequest(s.root);

    expect(res.code).toBe(0);
    expect(existsSync(s.running)).toBe(false);
    expect(await s.status()).toMatchObject({ result: 'failed', exitCode: 4, trigger: 'dashboard' });
  });

  test.concurrent('a request that cannot be renamed is exit 2 and runs no sync', async () => {
    const s = await setup();
    await writeFile(s.request, JSON.stringify({ at: '2026-11-19T10:00:00Z', by: 'u' }));
    await mkdir(s.running); // a directory in the way: mv moves the request into it instead of renaming
    await writeFile(join(s.running, 'styleguide-sync.request.json'), 'older');
    await chmod(s.running, 0o555);

    const res = await runRequest(s.root);

    await chmod(s.running, 0o755);
    expect(res.code).toBe(2);
    expect(await s.status()).toBeNull();
  });

  test.concurrent('a missing request directory is exit 2', async () => {
    const { root } = await makeRepo(good);
    await writeFile(join(root, '.env'), `STYLE_GUIDE_REQUEST_DIR=${posix(join(root, 'nowhere'))}\n`);

    const res = await runRequest(root);

    expect(res.code).toBe(2);
  });
});

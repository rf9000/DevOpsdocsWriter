import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fixture, git, makeRepo, runSync, upstreamFile } from './helpers.ts';

setDefaultTimeout(60_000);

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

    const res = await sync(root, `﻿${upstream.replaceAll('\n', '\r\n')}`);

    expect(res.code).toBe(0);
    expect(await readFile(guidePath, 'utf8')).toBe(upstream);
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

import { describe, test, expect, afterEach, mock } from 'bun:test';
import {
  AzureDevOpsError,
  adoFetch,
  adoFetchWithRetry,
  queryTaggedWorkItems,
  getWorkItem,
  getWorkItemComments,
  parsePullRequestRefs,
  getPullRequestContext,
  uploadAttachment,
  linkAttachmentToWorkItem,
  addTagToWorkItem,
} from '../../src/sdk/azure-devops-client.ts';
import type { WorkItemResponse } from '../../src/types/index.ts';
import { mockConfig } from '../helpers.ts';

const originalFetch = globalThis.fetch;
let mockFn: ReturnType<typeof mock>;

function setMockFetch(body: unknown, status = 200) {
  mockFn = mock(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
  globalThis.fetch = mockFn as unknown as typeof fetch;
}

function setSequentialMockFetch(
  ...responses: Array<{ body: unknown; status?: number }>
) {
  let i = 0;
  mockFn = mock(() => {
    const r = responses[i] ?? responses[responses.length - 1]!;
    i++;
    return Promise.resolve(
      new Response(JSON.stringify(r.body), {
        status: r.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
  globalThis.fetch = mockFn as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('adoFetch', () => {
  test('builds the correct URL and auth header', async () => {
    setMockFetch({ hello: 'world' });
    const result = await adoFetch<{ hello: string }>(mockConfig(), 'some/path');

    expect(result).toEqual({ hello: 'world' });
    const call = mockFn.mock.calls[0]!;
    expect(call[0]).toBe('https://dev.azure.com/my-org/my-project/_apis/some/path');
    const headers = (call[1] as RequestInit).headers as Record<string, string>;
    expect(headers['Authorization']).toBe(
      'Basic ' + Buffer.from(':test-pat-token').toString('base64'),
    );
  });

  test('throws AzureDevOpsError on non-ok response', async () => {
    setMockFetch({ message: 'Not Found' }, 404);
    await expect(adoFetch(mockConfig(), 'missing')).rejects.toBeInstanceOf(
      AzureDevOpsError,
    );
  });
});

describe('adoFetchWithRetry', () => {
  test('retries on 500 then succeeds', async () => {
    setSequentialMockFetch({ body: {}, status: 500 }, { body: { ok: true } });
    const result = await adoFetchWithRetry<{ ok: boolean }>(
      mockConfig(),
      'p',
      undefined,
      [0, 0, 0],
    );
    expect(result).toEqual({ ok: true });
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  test('does not retry on 404', async () => {
    setSequentialMockFetch({ body: {}, status: 404 }, { body: { ok: true } });
    await expect(
      adoFetchWithRetry(mockConfig(), 'p', undefined, [0, 0, 0]),
    ).rejects.toBeInstanceOf(AzureDevOpsError);
    expect(mockFn).toHaveBeenCalledTimes(1);
  });
});

describe('queryTaggedWorkItems', () => {
  test('returns ids with an exact (case-insensitive) tag match', async () => {
    setSequentialMockFetch(
      { body: { workItems: [{ id: 1 }, { id: 2 }, { id: 3 }] } },
      {
        body: {
          value: [
            { id: 1, fields: { 'System.Tags': 'Write-Docs; other' } },
            { id: 2, fields: { 'System.Tags': 'write-docs-later' } }, // substring only
            { id: 3, fields: { 'System.Tags': 'foo' } },
          ],
        },
      },
    );

    const result = await queryTaggedWorkItems(mockConfig(), 'write-docs');
    expect(result).toEqual([1]);
    const wiql = JSON.parse(mockFn.mock.calls[0]![1]!.body as string).query as string;
    expect(wiql).toContain("[System.Tags] CONTAINS 'write-docs'");
    expect(wiql).not.toContain('WorkItemType'); // no type restriction
  });

  test('returns empty when nothing matches WIQL', async () => {
    setMockFetch({ workItems: [] });
    expect(await queryTaggedWorkItems(mockConfig(), 'write-docs')).toEqual([]);
  });
});

describe('addTagToWorkItem', () => {
  test('appends the tag, preserving existing tags', async () => {
    setSequentialMockFetch(
      { body: { id: 7, fields: { 'System.Tags': 'write-docs; other' } } },
      { body: { id: 7 } },
    );

    await addTagToWorkItem(mockConfig(), 7, 'Docs-Article-Written');

    expect(mockFn).toHaveBeenCalledTimes(2);
    const patch = mockFn.mock.calls[1]!;
    expect(patch[1]!.method).toBe('PATCH');
    const ops = JSON.parse(patch[1]!.body as string) as Array<{
      op: string;
      path: string;
      value: string;
    }>;
    expect(ops[0]!.op).toBe('replace');
    expect(ops[0]!.path).toBe('/fields/System.Tags');
    expect(ops[0]!.value).toBe('write-docs; other; Docs-Article-Written');
  });

  test('is idempotent — no PATCH when the tag already exists (case-insensitive)', async () => {
    setMockFetch({ id: 7, fields: { 'System.Tags': 'docs-article-written; other' } });

    await addTagToWorkItem(mockConfig(), 7, 'Docs-Article-Written');

    expect(mockFn).toHaveBeenCalledTimes(1); // only the read, no PATCH
  });
});

describe('getWorkItem', () => {
  test('expands relations', async () => {
    setMockFetch({ id: 100, fields: {}, rev: 1, url: 'u', relations: [] });
    await getWorkItem(mockConfig(), 100);
    const url = mockFn.mock.calls[0]![0] as string;
    expect(url).toContain('wit/workitems/100');
    expect(url).toContain('$expand=all');
  });
});

describe('getWorkItemComments', () => {
  test('returns the comments array', async () => {
    setMockFetch({ comments: [{ id: 1, text: 'hi' }] });
    const result = await getWorkItemComments(mockConfig(), 5);
    expect(result).toEqual([{ id: 1, text: 'hi' }]);
    expect(mockFn.mock.calls[0]![0] as string).toContain('wit/workItems/5/comments');
  });
});

describe('parsePullRequestRefs', () => {
  test('extracts projectId/repoId/prId from a PR ArtifactLink', () => {
    const wi: WorkItemResponse = {
      id: 1,
      fields: {},
      rev: 1,
      url: 'u',
      relations: [
        { rel: 'Hyperlink', url: 'https://example.com' },
        {
          rel: 'ArtifactLink',
          url: 'vstfs:///Git/PullRequestId/proj-guid%2Frepo-guid%2F1234',
        },
      ],
    };
    expect(parsePullRequestRefs(wi)).toEqual([
      { projectId: 'proj-guid', repoId: 'repo-guid', pullRequestId: 1234 },
    ]);
  });

  test('ignores non-PR artifact links and malformed urls', () => {
    const wi: WorkItemResponse = {
      id: 1,
      fields: {},
      rev: 1,
      url: 'u',
      relations: [
        { rel: 'ArtifactLink', url: 'vstfs:///Git/Commit/abc' },
        { rel: 'ArtifactLink', url: 'vstfs:///Git/PullRequestId/bad' },
      ],
    };
    expect(parsePullRequestRefs(wi)).toEqual([]);
  });

  test('returns empty when there are no relations', () => {
    expect(parsePullRequestRefs({ id: 1, fields: {}, rev: 1, url: 'u' })).toEqual([]);
  });
});

describe('getPullRequestContext', () => {
  test('returns metadata + changed files from the last iteration', async () => {
    setSequentialMockFetch(
      {
        body: {
          pullRequestId: 1234,
          title: 'Add feature',
          description: 'desc',
          status: 'completed',
          sourceRefName: 'refs/heads/feat',
          targetRefName: 'refs/heads/main',
        },
      },
      { body: { value: [{ id: 1 }, { id: 2 }] } },
      {
        body: {
          changeEntries: [
            { item: { path: '/src/A.al' } },
            { item: { path: '/src/B.al' } },
          ],
        },
      },
    );

    const result = await getPullRequestContext(mockConfig(), {
      projectId: 'p',
      repoId: 'r',
      pullRequestId: 1234,
    });

    expect(result.title).toBe('Add feature');
    expect(result.status).toBe('completed');
    expect(result.changedFiles).toEqual(['/src/A.al', '/src/B.al']);
    // iteration changes use the LAST iteration id (2)
    expect(mockFn.mock.calls[2]![0] as string).toContain('/iterations/2/changes');
  });

  test('returns metadata with no changed files when there are no iterations', async () => {
    setSequentialMockFetch(
      { body: { pullRequestId: 9, title: 'T' } },
      { body: { value: [] } },
    );
    const result = await getPullRequestContext(mockConfig(), {
      projectId: 'p',
      repoId: 'r',
      pullRequestId: 9,
    });
    expect(result.title).toBe('T');
    expect(result.changedFiles).toEqual([]);
  });
});

describe('uploadAttachment + linkAttachmentToWorkItem', () => {
  test('upload posts octet-stream and returns id/url', async () => {
    setMockFetch({ id: 'att-1', url: 'https://example.com/att-1' });
    const result = await uploadAttachment(mockConfig(), 'doc.md', '# hello');
    expect(result).toEqual({ id: 'att-1', url: 'https://example.com/att-1' });
    const call = mockFn.mock.calls[0]!;
    expect(call[0] as string).toContain('wit/attachments?fileName=doc.md');
    const init = call[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/octet-stream',
    );
    expect(init.body).toBe('# hello');
  });

  test('link sends an AttachedFile relation patch', async () => {
    setMockFetch({ id: 5, fields: {}, rev: 2, url: 'u' });
    await linkAttachmentToWorkItem(
      mockConfig(),
      5,
      'https://example.com/att-1',
      'doc.md',
      'Generated documentation article',
    );
    const init = mockFn.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe('PATCH');
    const body = JSON.parse(init.body as string);
    expect(body[0].op).toBe('add');
    expect(body[0].path).toBe('/relations/-');
    expect(body[0].value.rel).toBe('AttachedFile');
    expect(body[0].value.url).toBe('https://example.com/att-1');
    expect(body[0].value.attributes.name).toBe('doc.md');
  });
});

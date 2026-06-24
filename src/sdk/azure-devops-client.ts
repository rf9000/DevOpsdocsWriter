import type {
  AppConfig,
  PrContext,
  PullRequestRef,
  WorkItemComment,
  WorkItemResponse,
} from '../types/index.ts';

export class AzureDevOpsError extends Error {
  override readonly name = 'AzureDevOpsError';
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

export async function adoFetch<T>(
  config: AppConfig,
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${config.orgUrl}/${config.project}/_apis/${path}`;
  const authHeader =
    'Basic ' + Buffer.from(':' + config.pat).toString('base64');

  const headers: Record<string, string> = {
    Authorization: authHeader,
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> | undefined),
  };

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new AzureDevOpsError(
      `Azure DevOps API error ${res.status}: ${body}`,
      res.status,
    );
  }

  return (await res.json()) as T;
}

const DEFAULT_RETRY_DELAYS = [1000, 2000, 4000];

export async function adoFetchWithRetry<T>(
  config: AppConfig,
  path: string,
  options?: RequestInit,
  retryDelays: number[] = DEFAULT_RETRY_DELAYS,
): Promise<T> {
  const maxAttempts = retryDelays.length + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await adoFetch<T>(config, path, options);
    } catch (err: unknown) {
      const isLastAttempt = attempt === maxAttempts;

      if (err instanceof AzureDevOpsError) {
        if (err.statusCode < 500) {
          throw err;
        }
        if (isLastAttempt) {
          throw err;
        }
      } else {
        if (isLastAttempt) {
          throw err;
        }
      }

      const delay = retryDelays[attempt - 1] ?? 0;
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw new Error('adoFetchWithRetry: unexpected code path');
}

export async function getWorkItem(
  config: AppConfig,
  workItemId: number,
): Promise<WorkItemResponse> {
  const path = `wit/workitems/${workItemId}?$expand=all&api-version=7.0`;
  return adoFetchWithRetry<WorkItemResponse>(config, path);
}

interface WiqlFlatResponse {
  workItems: Array<{ id: number }>;
}

interface WorkItemsBatchResponse {
  value: Array<{ id: number; fields: Record<string, unknown> }>;
}

/**
 * Find work items across the whole project carrying the given tag.
 * WIQL `CONTAINS` is substring-based, so candidates are re-checked by exact,
 * case-insensitive tag match. Not scoped to a work item type — any tagged item
 * (Feature, PBI, User Story, Bug, ...) qualifies.
 */
export async function queryTaggedWorkItems(
  config: AppConfig,
  tag: string,
): Promise<number[]> {
  const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.State] NOT IN ('Closed', 'Removed') AND [System.Tags] CONTAINS '${tag}'`;

  const path = 'wit/wiql?api-version=7.0';
  const data = await adoFetchWithRetry<WiqlFlatResponse>(config, path, {
    method: 'POST',
    body: JSON.stringify({ query: wiql }),
  });

  const candidateIds = (data.workItems ?? []).map((wi) => wi.id);
  if (candidateIds.length === 0) return [];

  const tagLower = tag.toLowerCase();
  const taggedIds: number[] = [];
  const chunkSize = 200;

  for (let i = 0; i < candidateIds.length; i += chunkSize) {
    const chunk = candidateIds.slice(i, i + chunkSize);
    const ids = chunk.join(',');
    const tagsPath = `wit/workitems?ids=${ids}&fields=System.Tags&api-version=7.0`;
    const tagsData = await adoFetchWithRetry<WorkItemsBatchResponse>(config, tagsPath);

    for (const item of tagsData.value ?? []) {
      const tags = String(item.fields['System.Tags'] ?? '');
      const hasTag = tags.split(';').some((t) => t.trim().toLowerCase() === tagLower);
      if (hasTag) {
        taggedIds.push(item.id);
      }
    }
  }

  return taggedIds;
}

export async function removeTagFromWorkItem(
  config: AppConfig,
  workItemId: number,
  tagToRemove: string,
): Promise<void> {
  const workItem = await getWorkItem(config, workItemId);
  const currentTags = String(workItem.fields['System.Tags'] ?? '');
  const tags = currentTags
    .split(';')
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.toLowerCase() !== tagToRemove.toLowerCase());
  const newTags = tags.join('; ');
  // Must use "replace" — "add" on System.Tags merges instead of overwriting
  const path = `wit/workitems/${workItemId}?api-version=7.0`;
  await adoFetchWithRetry<WorkItemResponse>(config, path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json-patch+json' },
    body: JSON.stringify([{ op: 'replace', path: '/fields/System.Tags', value: newTags }]),
  });
}

/**
 * Add a tag to a work item, preserving existing tags. Idempotent: if the tag is
 * already present (case-insensitive) the work item is left untouched and no
 * request is made — so re-running over an item that was reopened keeps its tag.
 */
export async function addTagToWorkItem(
  config: AppConfig,
  workItemId: number,
  tagToAdd: string,
): Promise<void> {
  const workItem = await getWorkItem(config, workItemId);
  const currentTags = String(workItem.fields['System.Tags'] ?? '');
  const tags = currentTags
    .split(';')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tags.some((t) => t.toLowerCase() === tagToAdd.toLowerCase())) {
    return;
  }
  const newTags = [...tags, tagToAdd].join('; ');
  // Must use "replace" — "add" on System.Tags merges instead of overwriting
  const path = `wit/workitems/${workItemId}?api-version=7.0`;
  await adoFetchWithRetry<WorkItemResponse>(config, path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json-patch+json' },
    body: JSON.stringify([{ op: 'replace', path: '/fields/System.Tags', value: newTags }]),
  });
}

interface CommentResponse {
  id: number;
  text: string;
}

interface CommentsListResponse {
  comments: WorkItemComment[];
}

/** Fetch all comments on a work item (context for understanding the feature). */
export async function getWorkItemComments(
  config: AppConfig,
  workItemId: number,
): Promise<WorkItemComment[]> {
  const path = `wit/workItems/${workItemId}/comments?api-version=7.0-preview.4`;
  const data = await adoFetchWithRetry<CommentsListResponse>(config, path);
  return data.comments ?? [];
}

export async function addWorkItemComment(
  config: AppConfig,
  workItemId: number,
  commentHtml: string,
): Promise<CommentResponse> {
  const path = `wit/workitems/${workItemId}/comments?api-version=7.0-preview.4`;
  return adoFetchWithRetry<CommentResponse>(config, path, {
    method: 'POST',
    body: JSON.stringify({ text: commentHtml }),
  });
}

const PR_ARTIFACT_PREFIX = 'vstfs:///Git/PullRequestId/';

/**
 * Parse pull-request references from a work item's relations. ADO encodes PR
 * links as ArtifactLinks of the form
 * `vstfs:///Git/PullRequestId/{projectId}%2F{repoId}%2F{pullRequestId}`.
 */
export function parsePullRequestRefs(
  workItem: WorkItemResponse,
): PullRequestRef[] {
  const refs: PullRequestRef[] = [];
  for (const rel of workItem.relations ?? []) {
    if (rel.rel !== 'ArtifactLink') continue;
    if (!rel.url || !rel.url.startsWith(PR_ARTIFACT_PREFIX)) continue;

    const encoded = rel.url.slice(PR_ARTIFACT_PREFIX.length);
    const decoded = decodeURIComponent(encoded);
    const parts = decoded.split('/');
    if (parts.length !== 3) continue;

    const [projectId, repoId, prIdStr] = parts;
    const pullRequestId = Number(prIdStr);
    if (!projectId || !repoId || Number.isNaN(pullRequestId)) continue;

    refs.push({ projectId, repoId, pullRequestId });
  }
  return refs;
}

interface PullRequestResponse {
  pullRequestId: number;
  title?: string;
  description?: string;
  status?: string;
  sourceRefName?: string;
  targetRefName?: string;
}

interface IterationsResponse {
  value: Array<{ id: number }>;
}

interface ChangesResponse {
  changeEntries?: Array<{ item?: { path?: string } }>;
}

/**
 * Fetch PR metadata and the list of changed file paths (from the latest
 * iteration). The agent reads the actual code itself; this just points it
 * at the relevant files.
 */
export async function getPullRequestContext(
  config: AppConfig,
  ref: PullRequestRef,
): Promise<PrContext> {
  const base = `git/repositories/${ref.repoId}/pullrequests/${ref.pullRequestId}`;
  const pr = await adoFetchWithRetry<PullRequestResponse>(
    config,
    `${base}?api-version=7.0`,
  );

  let changedFiles: string[] = [];
  try {
    const iterations = await adoFetchWithRetry<IterationsResponse>(
      config,
      `git/repositories/${ref.repoId}/pullRequests/${ref.pullRequestId}/iterations?api-version=7.0`,
    );
    const last = iterations.value?.[iterations.value.length - 1];
    if (last) {
      const changes = await adoFetchWithRetry<ChangesResponse>(
        config,
        `git/repositories/${ref.repoId}/pullRequests/${ref.pullRequestId}/iterations/${last.id}/changes?api-version=7.0`,
      );
      changedFiles = (changes.changeEntries ?? [])
        .map((c) => c.item?.path ?? '')
        .filter((p) => p.length > 0);
    }
  } catch {
    // changed-file listing is best-effort; metadata alone is still useful
  }

  return {
    pullRequestId: ref.pullRequestId,
    title: pr.title ?? '',
    description: pr.description ?? '',
    status: pr.status ?? '',
    sourceRefName: pr.sourceRefName ?? '',
    targetRefName: pr.targetRefName ?? '',
    changedFiles,
  };
}

export interface UploadedAttachment {
  id: string;
  url: string;
}

/** Upload a file to the project's attachment store. Returns its id + url. */
export async function uploadAttachment(
  config: AppConfig,
  fileName: string,
  content: string | Buffer,
): Promise<UploadedAttachment> {
  const path = `wit/attachments?fileName=${encodeURIComponent(fileName)}&api-version=7.0`;
  return adoFetchWithRetry<UploadedAttachment>(config, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: content,
  });
}

/** Link a previously uploaded attachment to a work item. */
export async function linkAttachmentToWorkItem(
  config: AppConfig,
  workItemId: number,
  attachmentUrl: string,
  name: string,
  comment: string,
): Promise<WorkItemResponse> {
  const path = `wit/workitems/${workItemId}?api-version=7.0`;
  return adoFetchWithRetry<WorkItemResponse>(config, path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json-patch+json' },
    body: JSON.stringify([
      {
        op: 'add',
        path: '/relations/-',
        value: {
          rel: 'AttachedFile',
          url: attachmentUrl,
          attributes: { name, comment },
        },
      },
    ]),
  });
}

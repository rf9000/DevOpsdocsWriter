/** Application configuration loaded from environment variables. */
export interface AppConfig {
  org: string;
  orgUrl: string;
  project: string;
  pat: string;
  /**
   * AL source repo for the item currently being processed (cwd for the agent).
   * Loaded as a fallback default; the processor overrides it per work item with
   * the entry from `targetRepoPaths` for the resolved product.
   */
  targetRepoPath: string;
  /** Per-product AL source repos, keyed by article-id prefix (from `TARGET_REPO_PATH_<PREFIX>` env vars). */
  targetRepoPaths: Record<string, string>;
  /** Work item field that identifies the product (default `System.AreaPath`). */
  productField: string;
  /** Local path to the continia.docs.articles repo (read for sibling tone, toc, article-id lookups). */
  docsRepoPath: string;
  /** Directory the agent writes the finished article into and docsWriter reads to attach. */
  outputDir: string;
  /** Directory holding docsWriter's own docs-writing skills, junction-linked into the source repo. */
  skillsSourceDir: string;
  /** Tag that marks a work item for documentation. */
  writeDocsTag: string;
  /** Tag added once an article has been attached, so documented items are visible in ADO. */
  docsWrittenTag: string;
  pollIntervalMinutes: number;
  maxDocsPerDay: number;
  claudeModel: string;
  /** Maximum agent turns before the SDK aborts with error_max_turns. */
  maxTurns: number;
  promptPath: string;
  stateDir: string;
  dryRun: boolean;
}

/** A relation (link) on a work item — present when fetched with $expand=all. */
export interface WorkItemRelation {
  rel: string;
  url: string;
  attributes?: Record<string, unknown>;
}

/** Response shape when fetching a single work item. */
export interface WorkItemResponse {
  id: number;
  fields: Record<string, unknown>;
  rev: number;
  url: string;
  relations?: WorkItemRelation[];
}

/** A single comment on a work item. */
export interface WorkItemComment {
  id: number;
  text: string;
  createdBy?: { displayName?: string };
  createdDate?: string;
}

/** Reference to a pull request linked to a work item (parsed from an ArtifactLink). */
export interface PullRequestRef {
  projectId: string;
  repoId: string;
  pullRequestId: number;
}

/** Pull request details + changed files gathered to inform the docs. */
export interface PrContext {
  pullRequestId: number;
  title: string;
  description: string;
  status: string;
  sourceRefName: string;
  targetRefName: string;
  changedFiles: string[];
}

/** Persisted state tracking which items have already been documented + daily cap. */
export interface ProcessedState {
  processedItemIds: number[];
  /** Items already given a "could not resolve product" comment, so it is posted only once. */
  productCommentedItemIds: number[];
  lastRunAt: string;
  dailyDocsCount: number;
  dailyCountDate: string;
}

/** Result summary after processing a single item. */
export interface DocsProcessResult {
  itemId: number;
  documented: boolean;
  /** Path to the generated article file (when documented). */
  articlePath?: string;
  /** Path to the agent summary file (written on dry runs instead of logging it). */
  summaryPath?: string;
  error?: string;
  /**
   * Human-readable explanation when the item was skipped because its product
   * could not be resolved (unmapped area path, missing TARGET_REPO_PATH_<PREFIX>,
   * or missing docs folder). The watcher posts it as a one-time work-item comment.
   */
  productIssue?: string;
}

/** The three kinds of deliverable the pipeline can produce (see code-to-docs.md §6). */
export type OutputKind = 'newfeature' | 'update' | 'changelog';

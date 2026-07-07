import { z } from "zod";
import type { AppConfig } from "../types/index.ts";

const envSchema = z.object({
  AZURE_DEVOPS_PAT: z.string().min(1, "AZURE_DEVOPS_PAT is required"),
  AZURE_DEVOPS_ORG: z.string().min(1, "AZURE_DEVOPS_ORG is required"),
  AZURE_DEVOPS_PROJECT: z.string().min(1, "AZURE_DEVOPS_PROJECT is required"),
  /** Legacy single-product form; treated as TARGET_REPO_PATH_CB when that is absent. */
  TARGET_REPO_PATH: z.string().optional(),
  DOCS_REPO_PATH: z.string().min(1, "DOCS_REPO_PATH is required"),
  PRODUCT_FIELD: z.string().default("System.AreaPath"),
  WRITE_DOCS_TAG: z.string().default("write-docs"),
  DOCS_WRITTEN_TAG: z.string().default("Docs-Article-Written"),
  OUTPUT_DIR: z.string().default(".output"),
  SKILLS_SOURCE_DIR: z.string().default(".claude/skills"),
  POLL_INTERVAL_MINUTES: z.coerce.number().default(15),
  MAX_DOCS_PER_DAY: z.coerce.number().default(5),
  CLAUDE_MODEL: z.string().default("claude-sonnet-4-6"),
  MAX_TURNS: z.coerce.number().int().positive().default(60),
  PROMPT_PATH: z.string().default("src/prompts/write-docs.md"),
  STATE_DIR: z.string().default(".state"),
});

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): AppConfig {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    const messages = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid configuration:\n${messages}`);
  }

  const parsed = result.data;

  // Per-product AL source repos: TARGET_REPO_PATH_<PREFIX> (e.g. TARGET_REPO_PATH_CB,
  // TARGET_REPO_PATH_DC). The legacy single TARGET_REPO_PATH maps to CB (Continia
  // Banking, the original product) when TARGET_REPO_PATH_CB is not set explicitly.
  const targetRepoPaths: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    const match = /^TARGET_REPO_PATH_([A-Z][A-Z0-9]*)$/.exec(key);
    if (match?.[1] && value) targetRepoPaths[match[1]] = value;
  }
  if (!targetRepoPaths["CB"] && parsed.TARGET_REPO_PATH) {
    targetRepoPaths["CB"] = parsed.TARGET_REPO_PATH;
  }
  if (Object.keys(targetRepoPaths).length === 0) {
    throw new Error(
      "Invalid configuration:\n  - TARGET_REPO_PATH_<PREFIX>: at least one per-product AL repo is required (e.g. TARGET_REPO_PATH_CB), or the legacy TARGET_REPO_PATH.",
    );
  }
  const defaultTargetRepoPath =
    targetRepoPaths["CB"] ?? Object.values(targetRepoPaths)[0]!;

  return {
    org: parsed.AZURE_DEVOPS_ORG,
    orgUrl: `https://dev.azure.com/${parsed.AZURE_DEVOPS_ORG}`,
    project: parsed.AZURE_DEVOPS_PROJECT,
    pat: parsed.AZURE_DEVOPS_PAT,
    targetRepoPath: defaultTargetRepoPath,
    targetRepoPaths,
    productField: parsed.PRODUCT_FIELD,
    docsRepoPath: parsed.DOCS_REPO_PATH,
    outputDir: parsed.OUTPUT_DIR,
    skillsSourceDir: parsed.SKILLS_SOURCE_DIR,
    writeDocsTag: parsed.WRITE_DOCS_TAG,
    docsWrittenTag: parsed.DOCS_WRITTEN_TAG,
    pollIntervalMinutes: parsed.POLL_INTERVAL_MINUTES,
    maxDocsPerDay: parsed.MAX_DOCS_PER_DAY,
    claudeModel: parsed.CLAUDE_MODEL,
    maxTurns: parsed.MAX_TURNS,
    promptPath: parsed.PROMPT_PATH,
    stateDir: parsed.STATE_DIR,
    dryRun: false,
  };
}

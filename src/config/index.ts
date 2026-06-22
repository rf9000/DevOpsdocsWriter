import { z } from "zod";
import type { AppConfig } from "../types/index.ts";

const envSchema = z.object({
  AZURE_DEVOPS_PAT: z.string().min(1, "AZURE_DEVOPS_PAT is required"),
  AZURE_DEVOPS_ORG: z.string().min(1, "AZURE_DEVOPS_ORG is required"),
  AZURE_DEVOPS_PROJECT: z.string().min(1, "AZURE_DEVOPS_PROJECT is required"),
  TARGET_REPO_PATH: z.string().min(1, "TARGET_REPO_PATH is required"),
  DOCS_REPO_PATH: z.string().min(1, "DOCS_REPO_PATH is required"),
  WRITE_DOCS_TAG: z.string().default("write-docs"),
  OUTPUT_DIR: z.string().default(".output"),
  SKILLS_SOURCE_DIR: z.string().default(".claude/skills"),
  POLL_INTERVAL_MINUTES: z.coerce.number().default(15),
  MAX_DOCS_PER_DAY: z.coerce.number().default(5),
  CLAUDE_MODEL: z.string().default("claude-sonnet-4-6"),
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

  return {
    org: parsed.AZURE_DEVOPS_ORG,
    orgUrl: `https://dev.azure.com/${parsed.AZURE_DEVOPS_ORG}`,
    project: parsed.AZURE_DEVOPS_PROJECT,
    pat: parsed.AZURE_DEVOPS_PAT,
    targetRepoPath: parsed.TARGET_REPO_PATH,
    docsRepoPath: parsed.DOCS_REPO_PATH,
    outputDir: parsed.OUTPUT_DIR,
    skillsSourceDir: parsed.SKILLS_SOURCE_DIR,
    writeDocsTag: parsed.WRITE_DOCS_TAG,
    pollIntervalMinutes: parsed.POLL_INTERVAL_MINUTES,
    maxDocsPerDay: parsed.MAX_DOCS_PER_DAY,
    claudeModel: parsed.CLAUDE_MODEL,
    promptPath: parsed.PROMPT_PATH,
    stateDir: parsed.STATE_DIR,
    dryRun: false,
  };
}

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmdirSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from 'fs';
import { join, resolve } from 'path';

/**
 * Junction-link docsWriter's own docs-writing skills into the source repo's
 * `.claude/skills/` directory so the Claude agent (running with cwd = source
 * repo) can discover and invoke them via the `Skill` tool.
 *
 * Uses directory junctions (`symlink(..., 'junction')`) which, unlike true
 * symlinks, need no admin/Developer Mode on Windows. Returns the list of link
 * paths created so they can be cleaned up afterwards — a pre-existing real skill
 * directory (not one of our junctions) is never touched.
 */
export function createSkillJunctions(
  targetRepoPath: string,
  skillsSourceDir: string,
): string[] {
  const sourceRoot = resolve(skillsSourceDir);
  if (!existsSync(sourceRoot)) return [];

  const destRoot = join(targetRepoPath, '.claude', 'skills');
  mkdirSync(destRoot, { recursive: true });

  const created: string[] = [];

  for (const entry of readdirSync(sourceRoot)) {
    const srcDir = join(sourceRoot, entry);
    if (!statSync(srcDir).isDirectory()) continue;
    if (!existsSync(join(srcDir, 'SKILL.md'))) continue;

    const linkPath = join(destRoot, entry);

    if (existsSync(linkPath)) {
      // Adopt a stale junction from a previous run for cleanup; never remove a
      // real pre-existing skill directory.
      if (isLink(linkPath)) created.push(linkPath);
      continue;
    }

    symlinkSync(srcDir, linkPath, 'junction');
    created.push(linkPath);
  }

  return created;
}

/** Remove the junctions created by createSkillJunctions. Idempotent. */
export function removeSkillJunctions(created: string[]): void {
  for (const linkPath of created) {
    try {
      if (!existsSync(linkPath) && !isLink(linkPath)) continue;
      try {
        unlinkSync(linkPath);
      } catch {
        rmdirSync(linkPath);
      }
    } catch {
      // tolerate — cleanup is best-effort
    }
  }
}

function isLink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

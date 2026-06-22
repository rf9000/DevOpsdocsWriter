import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/** A docs-writing skill shipped with docsWriter. */
export interface DiscoveredSkill {
  name: string;
  description: string;
  skillDir: string;
}

/**
 * Extract the `description` value from YAML frontmatter in a SKILL.md file.
 * Frontmatter is delimited by `---` lines at the top of the file. Supports both
 * inline (`description: ...`) and block-scalar (`description: >-` / `|`) forms.
 */
export function extractFrontmatterDescription(content: string): string {
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') return '';

  const fmLines: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]!.trim() === '---') break;
    fmLines.push(lines[i]!);
  }

  for (let i = 0; i < fmLines.length; i++) {
    const line = fmLines[i]!;
    const inline = line.match(/^description:\s*"?(.+?)"?\s*$/);
    if (inline) {
      const value = inline[1]!.trim();
      // Block scalar indicator (>- , | , > ...): collect following indented lines.
      if (value === '>' || value === '>-' || value === '|' || value === '|-') {
        const block: string[] = [];
        for (let j = i + 1; j < fmLines.length; j++) {
          const bl = fmLines[j]!;
          if (/^\s+\S/.test(bl) || bl.trim() === '') {
            block.push(bl.trim());
          } else {
            break;
          }
        }
        return block.join(' ').replace(/\s+/g, ' ').trim();
      }
      return value;
    }
  }
  return '';
}

/**
 * Scan a skills root directory for invocable skills. Each subdirectory
 * containing a `SKILL.md` is treated as a discoverable skill. Returns name +
 * description (from YAML frontmatter) for each.
 */
export function discoverSkills(skillsRoot: string): DiscoveredSkill[] {
  if (!existsSync(skillsRoot)) return [];

  const entries = readdirSync(skillsRoot);
  const discovered: DiscoveredSkill[] = [];

  for (const entry of entries) {
    const entryPath = join(skillsRoot, entry);
    if (!statSync(entryPath).isDirectory()) continue;

    const skillMdPath = join(entryPath, 'SKILL.md');
    if (!existsSync(skillMdPath)) continue;

    const content = readFileSync(skillMdPath, 'utf-8');
    const description = extractFrontmatterDescription(content);
    if (!description) continue;

    discovered.push({
      name: entry,
      description,
      skillDir: entryPath,
    });
  }

  return discovered;
}

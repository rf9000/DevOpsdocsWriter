import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  createSkillJunctions,
  removeSkillJunctions,
} from '../../src/services/skill-linker.ts';

describe('skill-linker', () => {
  let root: string;
  let sourceDir: string;
  let targetRepo: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'linker-test-'));
    sourceDir = join(root, 'skills');
    targetRepo = join(root, 'al-repo');
    mkdirSync(targetRepo, { recursive: true });

    // Two valid skills + one dir without SKILL.md (should be ignored)
    for (const name of ['docs-writer', 'docs-validator']) {
      const d = join(sourceDir, name);
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, 'SKILL.md'), `---\nname: ${name}\ndescription: x\n---\n`);
    }
    mkdirSync(join(sourceDir, 'not-a-skill'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('creates junctions only for dirs containing SKILL.md', () => {
    const created = createSkillJunctions(targetRepo, sourceDir);
    expect(created.length).toBe(2);

    const linkRoot = join(targetRepo, '.claude', 'skills');
    expect(existsSync(join(linkRoot, 'docs-writer', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(linkRoot, 'docs-validator', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(linkRoot, 'not-a-skill'))).toBe(false);

    // content is readable through the junction
    const md = readFileSync(join(linkRoot, 'docs-writer', 'SKILL.md'), 'utf-8');
    expect(md).toContain('name: docs-writer');
  });

  test('removeSkillJunctions cleans up what it created, leaving the source intact', () => {
    const created = createSkillJunctions(targetRepo, sourceDir);
    removeSkillJunctions(created);

    const linkRoot = join(targetRepo, '.claude', 'skills');
    expect(existsSync(join(linkRoot, 'docs-writer'))).toBe(false);
    expect(existsSync(join(linkRoot, 'docs-validator'))).toBe(false);
    // source skills still there
    expect(existsSync(join(sourceDir, 'docs-writer', 'SKILL.md'))).toBe(true);
  });

  test('does not clobber or remove a pre-existing real skill directory', () => {
    const linkRoot = join(targetRepo, '.claude', 'skills');
    const real = join(linkRoot, 'docs-writer');
    mkdirSync(real, { recursive: true });
    writeFileSync(join(real, 'SKILL.md'), 'REAL');

    const created = createSkillJunctions(targetRepo, sourceDir);
    // docs-writer already existed as a real dir → not tracked; docs-validator linked
    expect(created.some((p) => p.endsWith('docs-validator'))).toBe(true);
    expect(created.some((p) => p.endsWith('docs-writer'))).toBe(false);

    removeSkillJunctions(created);
    // the real dir survives
    expect(readFileSync(join(real, 'SKILL.md'), 'utf-8')).toBe('REAL');
  });

  test('returns empty when the source dir does not exist', () => {
    expect(createSkillJunctions(targetRepo, join(root, 'nope'))).toEqual([]);
  });
});

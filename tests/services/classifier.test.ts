import { describe, test, expect } from 'bun:test';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  parseClassification,
  buildClassifierSystemPrompt,
  buildClassifierUserPrompt,
} from '../../src/services/classifier.ts';
import type { ClassifierContext } from '../../src/services/classifier.ts';

const wrap = (json: string) =>
  `Some reasoning text.\n<<<CLASSIFICATION>>>\n${json}\n<<<END-CLASSIFICATION>>>\nbye`;

describe('parseClassification', () => {
  test('parses a full update decision', () => {
    const result = parseClassification(
      wrap(
        JSON.stringify({
          kind: 'update',
          target: 'CB-33',
          targetFile: 'Business functionality/Payment Import/Reconciliation/Account identification methods.md',
          candidates: [{ id: 'CB-161', file: 'Business functionality/Payment Import/Using Templates in Banking Import.md', reason: 'documents templates' }],
          reasoning: 'New columns on the documented Bank Transaction Code Rules page.',
        }),
      ),
    );
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('update');
    expect(result!.target).toBe('CB-33');
    expect(result!.targetFile).toContain('Account identification methods.md');
    expect(result!.candidates).toHaveLength(1);
    expect(result!.candidates[0]!.id).toBe('CB-161');
    expect(result!.reasoning).toContain('Bank Transaction Code Rules');
  });

  test('parses a newfeature decision with candidates and no target', () => {
    const result = parseClassification(
      wrap(JSON.stringify({ kind: 'newfeature', candidates: [{ id: 'DC-12', file: 'a.md', reason: 'related' }], reasoning: 'no home' })),
    );
    expect(result!.kind).toBe('newfeature');
    expect(result!.target).toBeUndefined();
    expect(result!.candidates[0]!.id).toBe('DC-12');
  });

  test('tolerates a ```json fence inside the markers', () => {
    const result = parseClassification(
      wrap('```json\n' + JSON.stringify({ kind: 'changelog', candidates: [], reasoning: 'bug fix' }) + '\n```'),
    );
    expect(result!.kind).toBe('changelog');
  });

  test('normalizes target and candidate ids to upper case', () => {
    const result = parseClassification(
      wrap(JSON.stringify({ kind: 'update', target: 'cb-33', candidates: [{ id: 'cb-161', file: '', reason: '' }], reasoning: '' })),
    );
    expect(result!.target).toBe('CB-33');
    expect(result!.candidates[0]!.id).toBe('CB-161');
  });

  test('returns null when the block is missing', () => {
    expect(parseClassification('no markers here')).toBeNull();
  });

  test('returns null on invalid JSON', () => {
    expect(parseClassification(wrap('{ not json'))).toBeNull();
  });

  test('returns null on an unknown kind', () => {
    expect(parseClassification(wrap(JSON.stringify({ kind: 'rewrite', candidates: [], reasoning: '' })))).toBeNull();
  });

  test('returns null for an update without a valid target', () => {
    expect(parseClassification(wrap(JSON.stringify({ kind: 'update', candidates: [], reasoning: '' })))).toBeNull();
    expect(parseClassification(wrap(JSON.stringify({ kind: 'update', target: '33', candidates: [], reasoning: '' })))).toBeNull();
  });

  test('drops malformed candidates but keeps valid ones', () => {
    const result = parseClassification(
      wrap(
        JSON.stringify({
          kind: 'newfeature',
          candidates: [{ id: 'CB-1', file: 'x.md', reason: 'ok' }, { id: 'not-an-id' }, 'garbage', { file: 'no-id.md' }],
          reasoning: '',
        }),
      ),
    );
    expect(result!.candidates).toHaveLength(1);
    expect(result!.candidates[0]!.id).toBe('CB-1');
  });

  test('defaults missing candidates/reasoning', () => {
    const result = parseClassification(wrap(JSON.stringify({ kind: 'newfeature' })));
    expect(result!.candidates).toEqual([]);
    expect(result!.reasoning).toBe('');
  });
});

function mockClassifierContext(overrides: Partial<ClassifierContext> = {}): ClassifierContext {
  return {
    itemId: 78567,
    itemTitle: 'Description templates on bank transaction code rules',
    itemType: 'Feature',
    itemDescription: 'Adds per-rule description templates.',
    comments: ['first comment'],
    pullRequests: [
      {
        pullRequestId: 49391,
        title: 'Per-rule templates',
        description: 'Adds two columns.',
        status: 'completed',
        sourceRefName: 'refs/heads/feature/x',
        targetRefName: 'refs/heads/main',
        changedFiles: ['src/BankTransactionCodeRules.Page.al'],
      },
    ],
    docsRepoPath: 'C:/docs/en-us/Continia Banking',
    productName: 'Continia Banking',
    idPrefix: 'CB',
    ...overrides,
  };
}

describe('buildClassifierSystemPrompt', () => {
  test('appends product, prefix, and docs-folder scope to the base prompt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'clf-prompt-'));
    const promptPath = join(dir, 'classify-docs.md');
    writeFileSync(promptPath, 'BASE CLASSIFIER PROMPT');
    try {
      const sys = buildClassifierSystemPrompt(promptPath, mockClassifierContext());
      expect(sys).toContain('BASE CLASSIFIER PROMPT');
      expect(sys).toContain('Continia Banking');
      expect(sys).toContain('`CB`');
      expect(sys).toContain('C:/docs/en-us/Continia Banking');
      expect(sys).toContain('READ-ONLY');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('buildClassifierUserPrompt', () => {
  test('contains the work item, comments, and PR changed files, and asks only for classification', () => {
    const prompt = buildClassifierUserPrompt(mockClassifierContext());
    expect(prompt).toContain('78567');
    expect(prompt).toContain('Description templates on bank transaction code rules');
    expect(prompt).toContain('first comment');
    expect(prompt).toContain('src/BankTransactionCodeRules.Page.al');
    expect(prompt).toContain('<<<CLASSIFICATION>>>');
    expect(prompt).not.toContain('Write the article');
  });

  test('omits empty sections', () => {
    const prompt = buildClassifierUserPrompt(
      mockClassifierContext({ comments: [], pullRequests: [], itemDescription: '' }),
    );
    expect(prompt).not.toContain('## Work item comments');
    expect(prompt).not.toContain('## Linked pull requests');
  });
});

import { describe, test, expect } from 'bun:test';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  parseClassification,
  buildClassifierSystemPrompt,
  buildClassifierUserPrompt,
} from '../../src/services/classifier.ts';
import type { ClassifierContext, ResolvedHome } from '../../src/services/classifier.ts';
import type { DocsHome } from '../../src/config/products.ts';

const wrap = (json: string) =>
  `Some reasoning text.\n<<<CLASSIFICATION>>>\n${json}\n<<<END-CLASSIFICATION>>>\nbye`;

const CB: DocsHome = { docsFolder: 'continia-banking', prefix: 'CB' };
const DC: DocsHome = { docsFolder: 'continia-document-capture', prefix: 'DC' };
const DO: DocsHome = { docsFolder: 'continia-document-output', prefix: 'DO' };
/** Delivery Network's two homes, in registry order. */
const CDN_HOMES: DocsHome[] = [DC, DO];

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
      [CB],
    );
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('update');
    expect(result!.target).toBe('CB-33');
    expect(result!.targetFile).toContain('Account identification methods.md');
    expect(result!.docsFolder).toBe('continia-banking');
    expect(result!.idPrefix).toBe('CB');
    expect(result!.candidates).toHaveLength(1);
    expect(result!.candidates[0]!.id).toBe('CB-161');
    expect(result!.reasoning).toContain('Bank Transaction Code Rules');
  });

  test('parses a newfeature decision with candidates and no target', () => {
    const result = parseClassification(
      wrap(JSON.stringify({ kind: 'newfeature', candidates: [{ id: 'DC-12', file: 'a.md', reason: 'related' }], reasoning: 'no home' })),
      [DC],
    );
    expect(result!.kind).toBe('newfeature');
    expect(result!.target).toBeUndefined();
    expect(result!.candidates[0]!.id).toBe('DC-12');
  });

  test('tolerates a ```json fence inside the markers', () => {
    const result = parseClassification(
      wrap('```json\n' + JSON.stringify({ kind: 'changelog', candidates: [], reasoning: 'bug fix' }) + '\n```'),
      [CB],
    );
    expect(result!.kind).toBe('changelog');
  });

  test('normalizes target and candidate ids to upper case', () => {
    const result = parseClassification(
      wrap(JSON.stringify({ kind: 'update', target: 'cb-33', candidates: [{ id: 'cb-161', file: '', reason: '' }], reasoning: '' })),
      [CB],
    );
    expect(result!.target).toBe('CB-33');
    expect(result!.candidates[0]!.id).toBe('CB-161');
  });

  test('returns null when the block is missing', () => {
    expect(parseClassification('no markers here', [CB])).toBeNull();
  });

  test('returns null on invalid JSON', () => {
    expect(parseClassification(wrap('{ not json'), [CB])).toBeNull();
  });

  test('returns null on an unknown kind', () => {
    expect(parseClassification(wrap(JSON.stringify({ kind: 'rewrite', candidates: [], reasoning: '' })), [CB])).toBeNull();
  });

  test('returns null for an update without a valid target', () => {
    expect(parseClassification(wrap(JSON.stringify({ kind: 'update', candidates: [], reasoning: '' })), [CB])).toBeNull();
    expect(parseClassification(wrap(JSON.stringify({ kind: 'update', target: '33', candidates: [], reasoning: '' })), [CB])).toBeNull();
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
      [CB],
    );
    expect(result!.candidates).toHaveLength(1);
    expect(result!.candidates[0]!.id).toBe('CB-1');
  });

  test('defaults missing candidates/reasoning', () => {
    const result = parseClassification(wrap(JSON.stringify({ kind: 'newfeature' })), [CB]);
    expect(result!.candidates).toEqual([]);
    expect(result!.reasoning).toBe('');
  });

  test('a single-home candidate carries that home folder', () => {
    const result = parseClassification(
      wrap(JSON.stringify({ kind: 'newfeature', candidates: [{ id: 'CB-1', file: 'x.md', reason: 'ok' }] })),
      [CB],
    );
    expect(result!.candidates[0]!.docsFolder).toBe('continia-banking');
  });

  test('a single home is used even when the agent names one', () => {
    const result = parseClassification(
      wrap(JSON.stringify({ kind: 'newfeature', home: 'continia-document-output', candidates: [] })),
      [CB],
    );
    expect(result!.docsFolder).toBe('continia-banking');
    expect(result!.idPrefix).toBe('CB');
  });

  // Delivery Network: two homes, so the deliverable's home has to be decided too.
  test('a multi-home update derives its home from the target prefix', () => {
    const result = parseClassification(
      wrap(JSON.stringify({ kind: 'update', target: 'DO-44', targetFile: 'business-functionality/continia-edocuments/sending.md', candidates: [], reasoning: '' })),
      CDN_HOMES,
    );
    expect(result!.docsFolder).toBe('continia-document-output');
    expect(result!.idPrefix).toBe('DO');
    expect(result!.targetFile).toBe('business-functionality/continia-edocuments/sending.md');
  });

  test('an update whose target prefix is outside the product homes fails closed', () => {
    expect(
      parseClassification(
        wrap(JSON.stringify({ kind: 'update', target: 'CB-1', targetFile: 'x.md', candidates: [] })),
        CDN_HOMES,
      ),
    ).toBeNull();
  });

  test('a multi-home newfeature uses the home the agent named', () => {
    const result = parseClassification(
      wrap(JSON.stringify({ kind: 'newfeature', home: 'continia-document-capture', candidates: [] })),
      CDN_HOMES,
    );
    expect(result!.docsFolder).toBe('continia-document-capture');
    expect(result!.idPrefix).toBe('DC');
  });

  test('a multi-home newfeature without a home fails closed', () => {
    expect(
      parseClassification(wrap(JSON.stringify({ kind: 'newfeature', candidates: [] })), CDN_HOMES),
    ).toBeNull();
  });

  test('a multi-home newfeature naming a folder outside the product fails closed', () => {
    expect(
      parseClassification(
        wrap(JSON.stringify({ kind: 'newfeature', home: 'continia-banking', candidates: [] })),
        CDN_HOMES,
      ),
    ).toBeNull();
  });

  test('a multi-home changelog needs a home too', () => {
    expect(
      parseClassification(wrap(JSON.stringify({ kind: 'changelog', candidates: [] })), CDN_HOMES),
    ).toBeNull();
    const result = parseClassification(
      wrap(JSON.stringify({ kind: 'changelog', home: 'continia-document-output', candidates: [] })),
      CDN_HOMES,
    );
    expect(result!.docsFolder).toBe('continia-document-output');
    expect(result!.idPrefix).toBe('DO');
  });

  test('candidates resolve their own home and drop foreign prefixes', () => {
    const result = parseClassification(
      wrap(
        JSON.stringify({
          kind: 'update',
          target: 'DC-5',
          targetFile: 'a.md',
          candidates: [
            { id: 'DC-1', file: 'capture.md', reason: 'capture side' },
            { id: 'DO-2', file: 'output.md', reason: 'sending side' },
            { id: 'CB-3', file: 'banking.md', reason: 'not this product' },
          ],
          reasoning: '',
        }),
      ),
      CDN_HOMES,
    );
    expect(result!.candidates.map((c) => c.id)).toEqual(['DC-1', 'DO-2']);
    expect(result!.candidates[0]!.docsFolder).toBe('continia-document-capture');
    expect(result!.candidates[1]!.docsFolder).toBe('continia-document-output');
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
    homes: [{ ...CB, path: 'C:/docs/en-us/Continia Banking' }],
    productName: 'Continia Banking',
    ...overrides,
  };
}

const cdnHomes: ResolvedHome[] = [
  { ...DC, path: 'C:/docs/en-us/continia-document-capture' },
  { ...DO, path: 'C:/docs/en-us/continia-document-output' },
];

describe('buildClassifierSystemPrompt', () => {
  let dir: string;
  let promptPath: string;

  function setup() {
    dir = mkdtempSync(join(tmpdir(), 'clf-prompt-'));
    promptPath = join(dir, 'classify-docs.md');
    writeFileSync(promptPath, 'BASE CLASSIFIER PROMPT');
  }

  test('appends product, prefix, and docs-folder scope to the base prompt', () => {
    setup();
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

  // A single-home product must not see any of the multi-home wording — the nine
  // existing products get the prompt they got before Delivery Network existed.
  test('a single-home product is never asked to choose a home', () => {
    setup();
    try {
      const sys = buildClassifierSystemPrompt(promptPath, mockClassifierContext());
      expect(sys.toLowerCase()).not.toContain('home');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a multi-home product gets both folders, both prefixes, and the home field', () => {
    setup();
    try {
      const sys = buildClassifierSystemPrompt(
        promptPath,
        mockClassifierContext({ productName: 'Continia Delivery Network', homes: cdnHomes }),
      );
      expect(sys).toContain('Continia Delivery Network');
      expect(sys).toContain('C:/docs/en-us/continia-document-capture');
      expect(sys).toContain('C:/docs/en-us/continia-document-output');
      expect(sys).toContain('`DC`');
      expect(sys).toContain('`DO`');
      // The agent must be told to name the chosen folder for newfeature/changelog.
      expect(sys).toContain('"home"');
      expect(sys).toContain('continia-document-capture');
      expect(sys).toContain('READ-ONLY');
      // "the product's own folder" is inaccurate when there are two.
      expect(sys).not.toContain("this is the product's own folder");
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

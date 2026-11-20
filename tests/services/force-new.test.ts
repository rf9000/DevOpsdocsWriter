import { describe, test, expect } from 'bun:test';
import { detectForceNew, applyForceNew, forcedNote } from '../../src/services/force-new.ts';
import type { DocsClassification } from '../../src/services/classifier.ts';

const TAG = 'write-docs-new';

function classification(overrides: Partial<DocsClassification> = {}): DocsClassification {
  return {
    kind: 'update',
    docsFolder: 'continia-banking',
    idPrefix: 'CB',
    target: 'CB-161',
    targetFile: 'payments/export.md',
    candidates: [
      { id: 'CB-200', file: 'payments/other.md', docsFolder: 'continia-banking', reason: 'Related' },
    ],
    reasoning: 'Extends the export page.',
    ...overrides,
  };
}

function changelog(): DocsClassification {
  return {
    kind: 'changelog',
    docsFolder: 'continia-banking',
    idPrefix: 'CB',
    candidates: [],
    reasoning: 'Small fix.',
  };
}

describe('detectForceNew', () => {
  test('marker in a comment', () => {
    expect(detectForceNew(['Please split this. #new-article'], '', TAG)).toBe('comment');
  });

  test('marker is case-insensitive', () => {
    expect(detectForceNew(['#New-Article'], '', TAG)).toBe('comment');
  });

  test('marker followed by punctuation', () => {
    expect(detectForceNew(['(#new-article).'], '', TAG)).toBe('comment');
  });

  test('marker in a later comment', () => {
    expect(detectForceNew(['first', 'second #new-article'], '', TAG)).toBe('comment');
  });

  test.each(['#new-article-ideas', 'foo#new-article', '##new-article', 'new-article', '#new-articles'])(
    'no match for %s',
    (text) => {
      expect(detectForceNew([text], '', TAG)).toBeUndefined();
    },
  );

  test('tag, case-insensitive exact entry', () => {
    expect(detectForceNew([], 'Foo; Write-Docs-New ;bar', TAG)).toBe('tag');
  });

  test('a tag that only contains the force tag is not a match', () => {
    expect(detectForceNew([], 'write-docs-new-later; write-docs', TAG)).toBeUndefined();
  });

  test('tag wins when both are present', () => {
    expect(detectForceNew(['#new-article'], 'write-docs-new', TAG)).toBe('tag');
  });

  test('neither', () => {
    expect(detectForceNew(['just a comment'], 'write-docs', TAG)).toBeUndefined();
  });
});

describe('applyForceNew', () => {
  test('no source: returns the decision unchanged', () => {
    const input = classification();
    expect(applyForceNew(input, undefined)).toEqual(input);
  });

  test('newfeature: unchanged, no forced field', () => {
    const input = classification({ kind: 'newfeature', target: undefined, targetFile: undefined });
    const result = applyForceNew(input, 'comment');
    expect(result).toEqual(input);
    expect(result.forced).toBeUndefined();
  });

  test('update becomes newfeature and keeps the old target as first candidate', () => {
    const result = applyForceNew(classification(), 'comment');
    expect(result.kind).toBe('newfeature');
    expect('target' in result).toBe(false);
    expect('targetFile' in result).toBe(false);
    expect(result.docsFolder).toBe('continia-banking');
    expect(result.idPrefix).toBe('CB');
    expect(result.candidates[0]).toEqual({
      id: 'CB-161',
      file: 'payments/export.md',
      docsFolder: 'continia-banking',
      reason: "The classifier's update target",
    });
    expect(result.candidates[1]?.id).toBe('CB-200');
    expect(result.candidates).toHaveLength(2);
    expect(result.forced).toEqual({ by: 'comment', from: 'update', target: 'CB-161' });
  });

  test('update whose target is already a candidate: listed once, first', () => {
    const input = classification({
      candidates: [
        { id: 'CB-200', file: 'payments/other.md', docsFolder: 'continia-banking', reason: 'Related' },
        { id: 'CB-161', file: 'payments/export.md', docsFolder: 'continia-banking', reason: 'Dup' },
      ],
    });
    const result = applyForceNew(input, 'tag');
    expect(result.candidates.map((c) => c.id)).toEqual(['CB-161', 'CB-200']);
  });

  test('update without a targetFile gets an empty candidate file', () => {
    const result = applyForceNew(classification({ targetFile: undefined }), 'tag');
    expect(result.candidates[0]?.file).toBe('');
  });

  test('changelog becomes newfeature in the same home', () => {
    const result = applyForceNew(changelog(), 'tag');
    expect(result.kind).toBe('newfeature');
    expect(result.docsFolder).toBe('continia-banking');
    expect(result.idPrefix).toBe('CB');
    expect(result.candidates).toEqual([]);
    expect(result.forced).toEqual({ by: 'tag', from: 'changelog' });
  });

  test('does not mutate its input', () => {
    const input = classification();
    const snapshot = structuredClone(input);
    applyForceNew(input, 'comment');
    expect(input).toEqual(snapshot);
  });
});

describe('forcedNote', () => {
  test('empty when not forced', () => {
    expect(forcedNote(classification(), TAG)).toBe('');
  });

  test('comment + update', () => {
    expect(forcedNote(applyForceNew(classification(), 'comment'), TAG)).toBe(
      '\n\n**New article forced** — requested by a work-item comment. The classifier would otherwise have updated CB-161.',
    );
  });

  test('tag + changelog', () => {
    expect(forcedNote(applyForceNew(changelog(), 'tag'), TAG)).toBe(
      '\n\n**New article forced** — requested by the `write-docs-new` tag. The classifier would otherwise have written a changelog entry.',
    );
  });

  test('never contains the marker', () => {
    expect(forcedNote(applyForceNew(classification(), 'comment'), TAG)).not.toContain('#new-article');
  });
});

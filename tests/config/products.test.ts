import { describe, test, expect } from 'bun:test';
import { PRODUCTS, resolveProduct } from '../../src/config/products.ts';

describe('resolveProduct', () => {
  test('resolves a nested product area path', () => {
    const p = resolveProduct('Continia Software\\Continia Banking\\Banking Connectivity');
    expect(p?.name).toBe('Continia Banking');
    expect(p?.repoKey).toBe('CB');
    expect(p?.homes).toHaveLength(1);
    expect(p?.homes[0]!.prefix).toBe('CB');
    expect(p?.homes[0]!.docsFolder).toBe('continia-banking');
  });

  test('resolves a product that is a direct child of the project root', () => {
    expect(resolveProduct('Continia Software\\Document Capture')?.homes[0]!.prefix).toBe('DC');
    expect(resolveProduct('Continia Software\\Expense Management\\Online')?.homes[0]!.prefix).toBe('EM');
    expect(resolveProduct('Continia Software\\OPplus')?.homes[0]!.prefix).toBe('COPP');
  });

  test('first mapped segment wins for variant parents (e.g. Continia Online)', () => {
    expect(resolveProduct('Continia Online\\Continia Banking')?.homes[0]!.prefix).toBe('CB');
    expect(resolveProduct('Continia Software\\Continia Docs\\Document Capture')?.homes[0]!.prefix).toBe('DC');
  });

  test('returns undefined for non-product areas', () => {
    expect(resolveProduct('Continia Software\\InHouse')).toBeUndefined();
    expect(resolveProduct('Continia Software\\Continia Core')).toBeUndefined();
    expect(resolveProduct('Continia Software')).toBeUndefined();
    expect(resolveProduct('')).toBeUndefined();
  });

  test('product names carry the full solution name', () => {
    expect(PRODUCTS.get('Document Capture')?.name).toBe('Continia Document Capture');
    expect(PRODUCTS.get('Continia Sustainability')?.name).toBe('Continia Sustainability');
  });

  // Delivery Network is the one product with no docs folder of its own: the
  // eDocuments content was folded into mirrored subfolders of Document Capture
  // and Document Output, so it has two homes (and its AL source is a third repo,
  // reached through repoKey rather than an article-id prefix).
  test('the eDocuments area resolves to Delivery Network with two docs homes', () => {
    const p = resolveProduct('Continia Software\\Continia eDocuments');
    expect(p?.name).toBe('Continia Delivery Network');
    expect(p?.repoKey).toBe('CDN');
    expect(p?.homes).toEqual([
      { docsFolder: 'continia-document-capture', prefix: 'DC' },
      { docsFolder: 'continia-document-output', prefix: 'DO' },
    ]);
  });

  test('a nested eDocuments area resolves the same', () => {
    expect(resolveProduct('Continia Software\\Continia eDocuments\\Sending')?.repoKey).toBe('CDN');
  });

  test('Document Capture and Document Output keep their own single-home entries', () => {
    expect(resolveProduct('Continia Software\\Document Capture')?.repoKey).toBe('DC');
    expect(resolveProduct('Continia Software\\Document Capture')?.homes).toHaveLength(1);
    expect(resolveProduct('Continia Software\\Document Output')?.repoKey).toBe('DO');
    expect(resolveProduct('Continia Software\\Document Output')?.homes).toHaveLength(1);
  });

  // The docs site is mid-migration to GitBook: products already synced from
  // there live in kebab-case folders, the rest keep the title-case ones. These
  // are spelled exactly as they are in continia.docs.articles/en-us (the
  // container host is Linux, so casing and hyphens are not interchangeable).
  test('docs homes match the folders that exist in the docs repo', () => {
    const homes = Object.fromEntries(
      [...PRODUCTS.values()].map((p) => [p.areaName, p.homes.map((h) => [h.docsFolder, h.prefix])]),
    );
    expect(homes).toEqual({
      'Continia Banking': [['continia-banking', 'CB']],
      'Document Capture': [['continia-document-capture', 'DC']],
      'Expense Management': [['continia-expense-management', 'EM']],
      'Payment Management': [['Continia Payment Management', 'PM']],
      'Collection Management': [['Continia Collection Management', 'CM']],
      'Document Output': [['continia-document-output', 'DO']],
      'Continia Finance': [['continia-finance', 'CF']],
      OPplus: [['Continia OPplus', 'COPP']],
      'Continia Sustainability': [['Continia Sustainability', 'CS']],
      'Continia eDocuments': [
        ['continia-document-capture', 'DC'],
        ['continia-document-output', 'DO'],
      ],
    });
  });

  test('repoKey equals the first home prefix for every single-home product', () => {
    for (const p of PRODUCTS.values()) {
      if (p.homes.length === 1) {
        expect(p.repoKey).toBe(p.homes[0]!.prefix);
      }
    }
    expect(PRODUCTS.get('Continia eDocuments')?.repoKey).toBe('CDN');
  });

  // The classifier derives which home an article id belongs to from its prefix,
  // so two homes of one product may never share a prefix.
  test('home prefixes are unique within a product', () => {
    for (const p of PRODUCTS.values()) {
      const prefixes = p.homes.map((h) => h.prefix);
      expect(new Set(prefixes).size).toBe(prefixes.length);
    }
  });
});

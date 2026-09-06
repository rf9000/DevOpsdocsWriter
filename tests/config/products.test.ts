import { describe, test, expect } from 'bun:test';
import { PRODUCTS, resolveProduct } from '../../src/config/products.ts';

describe('resolveProduct', () => {
  test('resolves a nested product area path', () => {
    const p = resolveProduct('Continia Software\\Continia Banking\\Banking Connectivity');
    expect(p?.prefix).toBe('CB');
    expect(p?.name).toBe('Continia Banking');
    expect(p?.docsFolder).toBe('continia-banking');
  });

  test('resolves a product that is a direct child of the project root', () => {
    expect(resolveProduct('Continia Software\\Document Capture')?.prefix).toBe('DC');
    expect(resolveProduct('Continia Software\\Expense Management\\Online')?.prefix).toBe('EM');
    expect(resolveProduct('Continia Software\\OPplus')?.prefix).toBe('COPP');
  });

  test('first mapped segment wins for variant parents (e.g. Continia Online)', () => {
    expect(resolveProduct('Continia Online\\Continia Banking')?.prefix).toBe('CB');
    expect(resolveProduct('Continia Software\\Continia Docs\\Document Capture')?.prefix).toBe('DC');
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

  // The docs site is mid-migration to GitBook: products already synced from
  // there live in kebab-case folders, the rest keep the title-case ones. These
  // are spelled exactly as they are in continia.docs.articles/en-us (the
  // container host is Linux, so casing and hyphens are not interchangeable).
  test('docs folders match the folders that exist in the docs repo', () => {
    const folders = Object.fromEntries(
      [...PRODUCTS.values()].map((p) => [p.prefix, p.docsFolder]),
    );
    expect(folders).toEqual({
      CB: 'continia-banking',
      DC: 'continia-document-capture',
      EM: 'continia-expense-management',
      PM: 'Continia Payment Management',
      CM: 'Continia Collection Management',
      DO: 'continia-document-output',
      CF: 'continia-finance',
      COPP: 'Continia OPplus',
      CS: 'Continia Sustainability',
    });
  });
});

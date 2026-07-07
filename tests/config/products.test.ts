import { describe, test, expect } from 'bun:test';
import { PRODUCTS, resolveProduct } from '../../src/config/products.ts';

describe('resolveProduct', () => {
  test('resolves a nested product area path', () => {
    const p = resolveProduct('Continia Software\\Continia Banking\\Banking Connectivity');
    expect(p?.prefix).toBe('CB');
    expect(p?.docsFolder).toBe('Continia Banking');
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

  test('docs folder names carry the full solution name', () => {
    expect(PRODUCTS.get('Document Capture')?.docsFolder).toBe('Continia Document Capture');
    expect(PRODUCTS.get('Continia Sustainability')?.docsFolder).toBe('Continia Sustainability');
  });
});

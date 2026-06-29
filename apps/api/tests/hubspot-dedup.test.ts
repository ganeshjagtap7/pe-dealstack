import { describe, it, expect } from 'vitest';
import { mergeBlankOnly } from '../src/services/hubspot/dedup.js';

describe('mergeBlankOnly', () => {
  it('fills only blank/null fields on the existing row', () => {
    const existing = { name: 'Acme', industry: null, website: '' };
    const incoming = { name: 'Acme Corp', industry: 'Mfg', website: 'acme.com' };
    expect(mergeBlankOnly(existing, incoming)).toEqual({
      name: 'Acme',          // non-empty existing preserved
      industry: 'Mfg',       // null filled
      website: 'acme.com',   // empty-string filled
    });
  });

  it('never introduces keys absent from incoming', () => {
    expect(mergeBlankOnly({ a: 'x' }, { a: '', b: 'y' })).toEqual({ a: 'x', b: 'y' });
  });

  it('ignores incoming null/empty so it cannot blank a populated field', () => {
    expect(mergeBlankOnly({ a: 'keep' }, { a: null })).toEqual({ a: 'keep' });
  });
});

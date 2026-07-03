// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from 'vitest';
import { extractDocWords } from './word-completion';

describe('extractDocWords', () => {
  it('returns empty array for empty prefix', () => {
    expect(extractDocWords('hello world', '')).toEqual([]);
  });

  it('returns words starting with prefix', () => {
    const words = extractDocWords('fooBar fooBarBaz bazFoo', 'foo');
    expect(words).toContain('fooBar');
    expect(words).toContain('fooBarBaz');
    expect(words).not.toContain('bazFoo');
  });

  it('excludes exact prefix match (no self-completion)', () => {
    // "hello" appears in the doc but exact match of prefix is excluded
    const words = extractDocWords('hello helloWorld helloBar', 'hello');
    expect(words).not.toContain('hello');
    expect(words).toContain('helloWorld');
    expect(words).toContain('helloBar');
  });

  it('deduplicates repeated words', () => {
    const words = extractDocWords('fooBar fooBar fooBar fooBarBaz', 'foo');
    const fooBarCount = words.filter((w) => w === 'fooBar').length;
    expect(fooBarCount).toBe(1);
  });

  it('returns results sorted alphabetically', () => {
    const words = extractDocWords('fooZeta fooAlpha fooBeta', 'foo');
    expect(words).toEqual([...words].sort());
  });

  it('skips words shorter than MIN_WORD_LEN (4)', () => {
    // "foo" is 3 chars — below minimum; "foox" is 4 chars — should be included
    const words = extractDocWords('fooBar foo foox', 'foo');
    // "foo" is exact prefix → excluded; "foox" is 4 chars → included
    expect(words).toContain('fooBar');
    expect(words).toContain('foox');
    // no single word less than 4 chars returned
    for (const w of words) {
      expect(w.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('matches underscore-prefixed identifiers', () => {
    const words = extractDocWords('_myPrivate _myOther', '_my');
    expect(words).toContain('_myPrivate');
    expect(words).toContain('_myOther');
  });

  it('returns empty array when no matches', () => {
    const words = extractDocWords('something entirely unrelated', 'xyz');
    expect(words).toEqual([]);
  });

  it('handles a realistic multi-word document', () => {
    const doc = `
      function calculateTotal(items) {
        return items.reduce((acc, item) => acc + item.price, 0);
      }
      function calculateDiscount(total) {
        return total * 0.1;
      }
    `;
    const words = extractDocWords(doc, 'calc');
    expect(words).toContain('calculateTotal');
    expect(words).toContain('calculateDiscount');
  });
});

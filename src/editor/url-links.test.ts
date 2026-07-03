// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Unit tests for url-links.ts — findUrlRanges logic.
 *
 * Tests cover:
 *  1. Detects https://example.com and http://foo.org/path?q=1 correctly.
 *  2. Two URLs on one line → two ranges.
 *  3. Non-URL text → empty array.
 *  4. Bracket-trim: trailing bracket excluded when URL is wrapped in matching brackets.
 *  5. URL with parens in path when prev char is not open-paren → no trim.
 *  6. www.example.com (no scheme) → empty array.
 */
import { describe, it, expect } from 'vitest';
import { findUrlRanges } from './url-links';

// ── 1. Single URL detection ───────────────────────────────────────────────────

describe('findUrlRanges single URL', () => {
  it('detects https://example.com at start', () => {
    const ranges = findUrlRanges('https://example.com');
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual({ from: 0, to: 19 });
  });

  it('detects http://foo.org/path?q=1 with correct positions', () => {
    const text = 'visit http://foo.org/path?q=1 now';
    const ranges = findUrlRanges(text);
    expect(ranges).toHaveLength(1);
    const url = text.slice(ranges[0]!.from, ranges[0]!.to);
    expect(url).toBe('http://foo.org/path?q=1');
  });
});

// ── 2. Two URLs on one line ───────────────────────────────────────────────────

describe('findUrlRanges multiple URLs', () => {
  it('returns two ranges for two URLs on one line', () => {
    const text = 'see https://example.com and https://foo.org for more';
    const ranges = findUrlRanges(text);
    expect(ranges).toHaveLength(2);
    expect(text.slice(ranges[0]!.from, ranges[0]!.to)).toBe('https://example.com');
    expect(text.slice(ranges[1]!.from, ranges[1]!.to)).toBe('https://foo.org');
  });
});

// ── 3. Non-URL text ───────────────────────────────────────────────────────────

describe('findUrlRanges non-URL text', () => {
  it('returns empty array for plain text', () => {
    expect(findUrlRanges('just some words, not a link')).toHaveLength(0);
  });
});

// ── 4. Bracket-trim ───────────────────────────────────────────────────────────

describe('findUrlRanges bracket-trim', () => {
  it('excludes trailing ) when URL wrapped in ()', () => {
    const text = '(https://example.com)';
    const ranges = findUrlRanges(text);
    expect(ranges).toHaveLength(1);
    // from=1 (after '('), to=20 (before ')')
    const url = text.slice(ranges[0]!.from, ranges[0]!.to);
    expect(url).toBe('https://example.com');
  });

  it('excludes trailing ] when URL wrapped in []', () => {
    const text = '[https://example.com]';
    const ranges = findUrlRanges(text);
    expect(ranges).toHaveLength(1);
    const url = text.slice(ranges[0]!.from, ranges[0]!.to);
    expect(url).toBe('https://example.com');
  });

  it('excludes trailing > when URL wrapped in <>', () => {
    const text = '<https://x.io>';
    const ranges = findUrlRanges(text);
    expect(ranges).toHaveLength(1);
    const url = text.slice(ranges[0]!.from, ranges[0]!.to);
    expect(url).toBe('https://x.io');
  });

  it('excludes trailing " when URL wrapped in double quotes', () => {
    const text = '"https://x.io"';
    const ranges = findUrlRanges(text);
    expect(ranges).toHaveLength(1);
    const url = text.slice(ranges[0]!.from, ranges[0]!.to);
    expect(url).toBe('https://x.io');
  });
});

// ── 5. URL with parens in path, no trim ──────────────────────────────────────

describe('findUrlRanges no trim when prev char is not open bracket', () => {
  it('keeps trailing ) when URL has parens in path but prev char is not (', () => {
    const text = 'see https://example.com/a(b)';
    const ranges = findUrlRanges(text);
    expect(ranges).toHaveLength(1);
    // prev char is ' ' (space), last char is ')' — pair is (' ', ')') which is not in the list
    const url = text.slice(ranges[0]!.from, ranges[0]!.to);
    expect(url).toBe('https://example.com/a(b)');
  });
});

// ── 6. No scheme → no match ───────────────────────────────────────────────────

describe('findUrlRanges no scheme', () => {
  it('returns empty for www.example.com without http(s) scheme', () => {
    expect(findUrlRanges('www.example.com')).toHaveLength(0);
  });
});

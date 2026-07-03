// SPDX-License-Identifier: GPL-3.0-or-later
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { convertExtended, addToMru, replaceAllInContent, buildSearchState } from './find-dialog';
import { PersistenceService } from '../services/persistence-service';
import type { SearchPrefs } from '../services/persistence-service';

// ── convertExtended ───────────────────────────────────────────────────────────

describe('convertExtended', () => {
  it('converts \\n to LF', () => {
    expect(convertExtended('a\\nb')).toBe('a\nb');
  });

  it('converts \\r to CR', () => {
    expect(convertExtended('a\\rb')).toBe('a\rb');
  });

  it('converts \\t to tab', () => {
    expect(convertExtended('a\\tb')).toBe('a\tb');
  });

  it('converts \\0 to NUL', () => {
    expect(convertExtended('a\\0b')).toBe('a\0b');
  });

  it('converts \\xFF to byte 0xFF', () => {
    expect(convertExtended('\\xFF')).toBe('\xFF');
  });

  it('converts \\x41 to "A"', () => {
    expect(convertExtended('\\x41')).toBe('A');
  });

  it('converts \\x00 to NUL', () => {
    expect(convertExtended('\\x00')).toBe('\x00');
  });

  it('converts \\\\ to backslash', () => {
    expect(convertExtended('\\\\')).toBe('\\');
  });

  it('passes through unknown escapes unchanged', () => {
    expect(convertExtended('\\q')).toBe('\\q');
    expect(convertExtended('\\z')).toBe('\\z');
  });

  it('handles mixed sequences', () => {
    expect(convertExtended('line1\\nline2\\ttab\\\\back')).toBe('line1\nline2\ttab\\back');
  });

  it('handles empty string', () => {
    expect(convertExtended('')).toBe('');
  });

  it('handles no escapes', () => {
    expect(convertExtended('hello world')).toBe('hello world');
  });

  it('handles \\xNN with uppercase hex', () => {
    expect(convertExtended('\\x4F')).toBe('O'); // 0x4F = 79 = 'O'
  });

  it('passes \\X through unchanged (bare uppercase X is not a hex escape)', () => {
    expect(convertExtended('\\X')).toBe('\\X');
  });
});

// ── addToMru ──────────────────────────────────────────────────────────────────

describe('addToMru', () => {
  it('prepends a new item', () => {
    expect(addToMru(['b', 'c'], 'a')).toEqual(['a', 'b', 'c']);
  });

  it('moves existing item to front', () => {
    expect(addToMru(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b']);
  });

  it('deduplicates: adding existing item does not duplicate', () => {
    const result = addToMru(['foo', 'bar'], 'foo');
    expect(result).toEqual(['foo', 'bar']);
    expect(result.filter((x) => x === 'foo')).toHaveLength(1);
  });

  it('caps at max (default 10)', () => {
    const arr = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    const result = addToMru(arr, 'new');
    expect(result).toHaveLength(10);
    expect(result[0]).toBe('new');
    expect(result[9]).toBe('9'); // '10' dropped
  });

  it('caps at custom max', () => {
    const arr = ['a', 'b', 'c'];
    const result = addToMru(arr, 'd', 3);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('d');
    expect(result).not.toContain('c');
  });

  it('handles empty array', () => {
    expect(addToMru([], 'first')).toEqual(['first']);
  });

  it('most-recent-first ordering', () => {
    let mru: string[] = [];
    mru = addToMru(mru, 'first', 10);
    mru = addToMru(mru, 'second', 10);
    mru = addToMru(mru, 'third', 10);
    expect(mru[0]).toBe('third');
    expect(mru[1]).toBe('second');
    expect(mru[2]).toBe('first');
  });
});

// ── PersistenceService search-prefs round-trip ────────────────────────────────

describe('PersistenceService search-prefs', () => {
  it('saveSearchPrefs/loadSearchPrefs round-trip', async () => {
    const svc = new PersistenceService();
    const prefs: SearchPrefs = {
      findMru: ['hello', 'world'],
      replaceMru: ['foo'],
      matchCase: true,
      wholeWord: false,
      wrap: true,
      backwards: false,
      searchMode: 'regexp',
      dotMatchesNewline: true,
    };
    await svc.saveSearchPrefs(prefs);
    const loaded = await svc.loadSearchPrefs();
    expect(loaded).toEqual(prefs);
  });

  it('loadSearchPrefs returns null when nothing saved', async () => {
    // Delete the DB to guarantee a clean state
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('notepad-web');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    const svc = new PersistenceService();
    const loaded = await svc.loadSearchPrefs();
    expect(loaded).toBeNull();
  });

  it('round-trips all searchMode values', async () => {
    const svc = new PersistenceService();
    for (const mode of ['normal', 'extended', 'regexp'] as const) {
      const prefs: SearchPrefs = {
        findMru: [],
        replaceMru: [],
        matchCase: false,
        wholeWord: false,
        wrap: true,
        backwards: false,
        searchMode: mode,
        dotMatchesNewline: false,
      };
      await svc.saveSearchPrefs(prefs);
      const loaded = await svc.loadSearchPrefs();
      expect(loaded?.searchMode).toBe(mode);
    }
  });
});

// ── replaceAllInContent ───────────────────────────────────────────────────────

describe('replaceAllInContent', () => {
  it('replaces all occurrences of a simple term', () => {
    const { newContent, count } = replaceAllInContent('foo bar foo baz foo', 'foo', 'baz', {
      matchCase: false,
      wholeWord: false,
      regexp: false,
    });
    expect(count).toBe(3);
    expect(newContent).toBe('baz bar baz baz baz');
  });

  it('returns original content and count 0 when no matches', () => {
    const { newContent, count } = replaceAllInContent('hello world', 'xyz', 'abc', {
      matchCase: false,
      wholeWord: false,
      regexp: false,
    });
    expect(count).toBe(0);
    expect(newContent).toBe('hello world');
  });

  it('respects matchCase option', () => {
    const { count } = replaceAllInContent('Foo foo FOO', 'foo', 'bar', {
      matchCase: true,
      wholeWord: false,
      regexp: false,
    });
    expect(count).toBe(1); // only exact 'foo' matches
  });

  it('respects wholeWord option', () => {
    const { count } = replaceAllInContent('foo foobar barfoo', 'foo', 'baz', {
      matchCase: false,
      wholeWord: true,
      regexp: false,
    });
    expect(count).toBe(1); // only standalone 'foo' matches
  });

  it('handles regexp mode', () => {
    const { newContent, count } = replaceAllInContent('abc 123 def 456', '\\d+', 'NUM', {
      matchCase: false,
      wholeWord: false,
      regexp: true,
    });
    expect(count).toBe(2);
    expect(newContent).toBe('abc NUM def NUM');
  });

  it('handles CRLF content gracefully', () => {
    const { newContent, count } = replaceAllInContent('foo\r\nfoo\r\nbar', 'foo', 'baz', {
      matchCase: false,
      wholeWord: false,
      regexp: false,
    });
    expect(count).toBe(2);
    expect(newContent).toBe('baz\nbaz\nbar');
  });

  it('handles empty replacement string (deletion)', () => {
    const { newContent, count } = replaceAllInContent('aXbXc', 'X', '', {
      matchCase: false,
      wholeWord: false,
      regexp: false,
    });
    expect(count).toBe(2);
    expect(newContent).toBe('abc');
  });

  it('convertExtended applied to replace string: \\n in replace becomes newline', () => {
    // Simulate Extended mode: both term and replace go through convertExtended
    const term = convertExtended('foo');
    const replace = convertExtended('bar\\nbaz');
    const { newContent } = replaceAllInContent('foo qux', term, replace, {
      matchCase: false,
      wholeWord: false,
      regexp: false,
    });
    expect(newContent).toBe('bar\nbaz qux');
  });
});

// ── buildSearchState ──────────────────────────────────────────────────────────

describe('buildSearchState', () => {
  it('forces wholeWord OFF in regexp mode even when the checkbox is checked', () => {
    const { opts } = buildSearchState('foo', '', {
      matchCase: false,
      wholeWord: true, // user had it checked, but regexp disables it
      isRegexp: true,
      isExtended: false,
    });
    expect(opts.wholeWord).toBe(false);
    expect(opts.regexp).toBe(true);
  });

  it('preserves wholeWord in non-regexp mode', () => {
    const { opts } = buildSearchState('foo', '', {
      matchCase: false,
      wholeWord: true,
      isRegexp: false,
      isExtended: false,
    });
    expect(opts.wholeWord).toBe(true);
  });

  it('applies convertExtended to BOTH term and replace in extended mode', () => {
    const { term, replace } = buildSearchState('a\\nb', 'c\\td', {
      matchCase: false,
      wholeWord: false,
      isRegexp: false,
      isExtended: true,
    });
    expect(term).toBe('a\nb');
    expect(replace).toBe('c\td');
  });

  it('leaves term and replace raw in normal mode', () => {
    const { term, replace } = buildSearchState('a\\nb', 'c\\td', {
      matchCase: true,
      wholeWord: false,
      isRegexp: false,
      isExtended: false,
    });
    expect(term).toBe('a\\nb');
    expect(replace).toBe('c\\td');
  });
});

// ── I1: regex capture-group expansion in replaceAllInContent ──────────────────

describe('replaceAllInContent — regex capture groups (I1)', () => {
  it('expands $1 capture group in regex mode', () => {
    // (\d+) → [$1]: each number gets wrapped in brackets.
    const { newContent, count } = replaceAllInContent('foo 42 bar 7 baz', '(\\d+)', '[$1]', {
      matchCase: false,
      wholeWord: false,
      regexp: true,
    });
    expect(count).toBe(2);
    expect(newContent).toBe('foo [42] bar [7] baz');
  });

  it('expands $& (full match) in regex mode', () => {
    const { newContent, count } = replaceAllInContent('cat dog', '\\b\\w+\\b', '<$&>', {
      matchCase: false,
      wholeWord: false,
      regexp: true,
    });
    expect(count).toBe(2);
    expect(newContent).toBe('<cat> <dog>');
  });

  it('does NOT expand $1 in plain mode (literal replacement)', () => {
    // In plain mode, $1 in the replacement string must stay as-is (literal).
    const { newContent, count } = replaceAllInContent('foo bar foo', 'foo', '$1', {
      matchCase: false,
      wholeWord: false,
      regexp: false,
    });
    expect(count).toBe(2);
    expect(newContent).toBe('$1 bar $1');
  });

  it('handles case-insensitive regex', () => {
    const { newContent, count } = replaceAllInContent('Foo FOO foo', '(foo)', '[\\1]', {
      matchCase: false,
      wholeWord: false,
      regexp: true,
    });
    // \1 is not a JS capture ref — $1 would be. Just verify count.
    expect(count).toBe(3);
    void newContent; // content varies; key thing is count correct
  });

  it('returns count 0 and original content for invalid regex', () => {
    const original = 'hello world';
    const { newContent, count } = replaceAllInContent(original, '[invalid', 'x', {
      matchCase: false,
      wholeWord: false,
      regexp: true,
    });
    expect(count).toBe(0);
    expect(newContent).toBe(original);
  });
});

// ── I2: CRLF preservation in replaceAllInContent ─────────────────────────────

describe('replaceAllInContent — EOL handling (I2)', () => {
  it('returns LF-normalised content (callers must re-apply EOL)', () => {
    // replaceAllInContent always normalises to LF; callers use applyEol() to restore.
    const { newContent, count } = replaceAllInContent('foo\r\nfoo\r\nbar', 'foo', 'baz', {
      matchCase: false,
      wholeWord: false,
      regexp: false,
    });
    expect(count).toBe(2);
    // Returned content uses LF (normalised inside the function).
    expect(newContent).toBe('baz\nbaz\nbar');
    // Caller is responsible for re-applying CRLF via applyEol().
  });
});

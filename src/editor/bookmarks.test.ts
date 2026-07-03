// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Unit tests for bookmarks.ts — pure logic helpers and CM6 StateField behavior.
 *
 * Tests cover:
 *  - toggleLine: add/remove
 *  - sortedBookmarks: ordering
 *  - nextBookmark / prevBookmark: wrapping, empty
 *  - invertBookmarks: every-line toggle
 *  - collectBookmarkedText: text extraction from CM6 Text
 *  - mapBookmarksThrough: bookmarks follow document edits
 *  - bookmarkState StateField: toggle/set/clear via effects, doc-change mapping
 */
import { describe, it, expect } from 'vitest';
import { EditorState, Text as CMText } from '@codemirror/state';
import {
  toggleLine,
  sortedBookmarks,
  nextBookmark,
  prevBookmark,
  invertBookmarks,
  collectBookmarkedText,
  mapBookmarksThrough,
  bookmarkState,
  toggleBookmarkEffect,
  setBookmarksEffect,
} from './bookmarks';

// ── toggleLine ────────────────────────────────────────────────────────────────

describe('toggleLine', () => {
  it('adds a line if not in the set', () => {
    const result = toggleLine(new Set([1, 3]), 5);
    expect(result.has(5)).toBe(true);
    expect(result.has(1)).toBe(true);
    expect(result.has(3)).toBe(true);
  });

  it('removes a line if already in the set', () => {
    const result = toggleLine(new Set([1, 3, 5]), 3);
    expect(result.has(3)).toBe(false);
    expect(result.has(1)).toBe(true);
    expect(result.has(5)).toBe(true);
  });

  it('toggling on an empty set adds the line', () => {
    const result = toggleLine(new Set(), 7);
    expect(result.has(7)).toBe(true);
    expect(result.size).toBe(1);
  });

  it('does not mutate the original set', () => {
    const original = new Set([2, 4]);
    toggleLine(original, 4);
    expect(original.has(4)).toBe(true); // original unchanged
  });
});

// ── sortedBookmarks ───────────────────────────────────────────────────────────

describe('sortedBookmarks', () => {
  it('returns lines in ascending order', () => {
    expect(sortedBookmarks(new Set([5, 1, 3]))).toEqual([1, 3, 5]);
  });

  it('returns empty array for empty set', () => {
    expect(sortedBookmarks(new Set())).toEqual([]);
  });
});

// ── nextBookmark ──────────────────────────────────────────────────────────────

describe('nextBookmark', () => {
  it('returns the next bookmarked line after the current', () => {
    expect(nextBookmark(new Set([1, 5, 10]), 5)).toBe(10);
  });

  it('wraps around to the first bookmark when past the last', () => {
    expect(nextBookmark(new Set([1, 5, 10]), 10)).toBe(1);
  });

  it('wraps around when current line is beyond all bookmarks', () => {
    expect(nextBookmark(new Set([2, 6]), 20)).toBe(2);
  });

  it('returns the first bookmark if current is before all bookmarks', () => {
    expect(nextBookmark(new Set([3, 7]), 1)).toBe(3);
  });

  it('returns -1 for an empty set', () => {
    expect(nextBookmark(new Set(), 5)).toBe(-1);
  });

  it('with single bookmark wraps to itself', () => {
    expect(nextBookmark(new Set([4]), 4)).toBe(4);
  });
});

// ── prevBookmark ──────────────────────────────────────────────────────────────

describe('prevBookmark', () => {
  it('returns the previous bookmarked line before the current', () => {
    expect(prevBookmark(new Set([1, 5, 10]), 10)).toBe(5);
  });

  it('wraps around to the last bookmark when before the first', () => {
    expect(prevBookmark(new Set([1, 5, 10]), 1)).toBe(10);
  });

  it('wraps around when current line is before all bookmarks', () => {
    expect(prevBookmark(new Set([3, 7]), 1)).toBe(7);
  });

  it('returns -1 for an empty set', () => {
    expect(prevBookmark(new Set(), 5)).toBe(-1);
  });

  it('with single bookmark wraps to itself', () => {
    expect(prevBookmark(new Set([4]), 4)).toBe(4);
  });
});

// ── invertBookmarks ───────────────────────────────────────────────────────────

describe('invertBookmarks', () => {
  it('adds bookmark to every unmarked line', () => {
    // 4-line doc with lines 2 and 4 bookmarked → invert gives 1, 3
    const result = invertBookmarks(new Set([2, 4]), 4);
    expect([...result].sort((a, b) => a - b)).toEqual([1, 3]);
  });

  it('removes bookmark from every marked line', () => {
    // all 3 lines bookmarked → invert gives empty
    const result = invertBookmarks(new Set([1, 2, 3]), 3);
    expect(result.size).toBe(0);
  });

  it('on empty bookmarks gives all lines bookmarked', () => {
    const result = invertBookmarks(new Set(), 3);
    expect([...result].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it('handles a single line doc', () => {
    const result = invertBookmarks(new Set(), 1);
    expect([...result]).toEqual([1]);
  });
});

// ── collectBookmarkedText ─────────────────────────────────────────────────────

describe('collectBookmarkedText', () => {
  it('collects text of bookmarked lines (including newlines for non-last lines)', () => {
    // "line1\nline2\nline3"
    const doc = CMText.of(['line1', 'line2', 'line3']);
    const text = collectBookmarkedText(new Set([1, 3]), doc);
    expect(text).toBe('line1\nline3');
  });

  it('returns empty string for no bookmarks', () => {
    const doc = CMText.of(['hello', 'world']);
    expect(collectBookmarkedText(new Set(), doc)).toBe('');
  });

  it('handles single bookmarked line (no trailing newline)', () => {
    const doc = CMText.of(['only']);
    const text = collectBookmarkedText(new Set([1]), doc);
    expect(text).toBe('only');
  });

  it('ignores out-of-range line numbers', () => {
    const doc = CMText.of(['a', 'b']);
    const text = collectBookmarkedText(new Set([0, 99]), doc);
    expect(text).toBe('');
  });

  it('includes intermediate lines when all bookmarked', () => {
    const doc = CMText.of(['a', 'b', 'c']);
    const text = collectBookmarkedText(new Set([1, 2, 3]), doc);
    expect(text).toBe('a\nb\nc');
  });
});

// ── mapBookmarksThrough ────────────────────────────────────────────────────────

describe('mapBookmarksThrough', () => {
  /** Build a minimal CM6 EditorState from content and dispatch a text change. */
  function makeState(content: string): EditorState {
    return EditorState.create({ doc: content, extensions: [bookmarkState] });
  }

  it('bookmark on line 3 moves to line 4 when a line is inserted before it', () => {
    const before = makeState('a\nb\nc\nd');
    // Insert a new line after line 1 by dispatching a change.
    const tr = before.update({
      changes: { from: 1, to: 1, insert: '\nnewline' },
    });
    const mapped = mapBookmarksThrough(new Set([3]), tr.changes, before.doc, tr.newDoc);
    // 'c' was on line 3, after insert it's now on line 4.
    expect(mapped.has(4)).toBe(true);
    expect(mapped.has(3)).toBe(false);
  });

  it('bookmark on line 2 stays on line 2 when a line is inserted after it', () => {
    const before = makeState('a\nb\nc');
    const tr = before.update({
      changes: { from: 3, to: 3, insert: '\ninserted' },
    });
    const mapped = mapBookmarksThrough(new Set([2]), tr.changes, before.doc, tr.newDoc);
    // 'b' was on line 2, insert is after it — stays on line 2.
    expect(mapped.has(2)).toBe(true);
  });

  it('bookmark is dropped when its own line is deleted (no ghost onto next line)', () => {
    // 'a\nb\nc': line 2 is 'b' at [2,3), its newline at [3,4).
    const before = makeState('a\nb\nc');
    // Delete 'b\n' (positions 2..4) — line 2 is removed, 'c' becomes line 2.
    const tr = before.update({ changes: { from: 2, to: 4, insert: '' } });
    const mapped = mapBookmarksThrough(new Set([2]), tr.changes, before.doc, tr.newDoc);
    // The bookmark must NOT survive on line 2 ('c') — that would be a ghost.
    expect(mapped.has(2)).toBe(false);
    expect(mapped.size).toBe(0);
  });

  it('bookmark survives on the now-empty line when only its content is deleted', () => {
    // 'hello\nworld': line 1 is 'hello' at [0,5), its newline at [5,6).
    const before = makeState('hello\nworld');
    // Delete just 'hello' (positions 0..5); the newline survives, line 1 is now empty.
    const tr = before.update({ changes: { from: 0, to: 5, insert: '' } });
    const mapped = mapBookmarksThrough(new Set([1]), tr.changes, before.doc, tr.newDoc);
    // Line 1 still exists (empty) — the bookmark stays on it.
    expect(mapped.has(1)).toBe(true);
  });

  it('bookmark follows its line up when the preceding newline is deleted (merge up)', () => {
    // 'a\nb\nc': line 2 'b' at [2,3). Delete the newline before it ([1,2)),
    // merging 'b' into line 1 → 'ab\nc'.
    const before = makeState('a\nb\nc');
    const tr = before.update({ changes: { from: 1, to: 2, insert: '' } });
    const mapped = mapBookmarksThrough(new Set([2]), tr.changes, before.doc, tr.newDoc);
    // 'b' now lives on line 1 ('ab') — bookmark follows it there, no drop.
    expect(mapped.has(1)).toBe(true);
    expect(mapped.size).toBe(1);
  });

  it('drops a deleted line but keeps an unaffected bookmark in the same edit', () => {
    // 'a\nb\nc\nd': bookmark lines 2 ('b') and 4 ('d'). Delete 'b\n' ([2,4)).
    const before = makeState('a\nb\nc\nd');
    const tr = before.update({ changes: { from: 2, to: 4, insert: '' } });
    const mapped = mapBookmarksThrough(new Set([2, 4]), tr.changes, before.doc, tr.newDoc);
    // Line 2 ('b') is gone; 'd' shifts from line 4 to line 3.
    expect(mapped.has(2)).toBe(false);
    expect(mapped.has(3)).toBe(true);
    expect(mapped.size).toBe(1);
  });
});

// ── bookmarkState StateField ───────────────────────────────────────────────────

describe('bookmarkState StateField', () => {
  function state(content: string): EditorState {
    return EditorState.create({ doc: content, extensions: [bookmarkState] });
  }

  it('starts empty', () => {
    const s = state('hello\nworld');
    expect(s.field(bookmarkState).size).toBe(0);
  });

  it('toggleBookmarkEffect adds a bookmark', () => {
    const s = state('a\nb\nc');
    const tr = s.update({ effects: toggleBookmarkEffect.of(2) });
    expect(tr.state.field(bookmarkState).has(2)).toBe(true);
  });

  it('toggleBookmarkEffect on bookmarked line removes it', () => {
    const s = state('a\nb\nc');
    const tr1 = s.update({ effects: toggleBookmarkEffect.of(2) });
    const tr2 = tr1.state.update({ effects: toggleBookmarkEffect.of(2) });
    expect(tr2.state.field(bookmarkState).has(2)).toBe(false);
  });

  it('setBookmarksEffect replaces all bookmarks', () => {
    const s = state('a\nb\nc\nd');
    const tr1 = s.update({ effects: toggleBookmarkEffect.of(1) });
    const tr2 = tr1.state.update({ effects: setBookmarksEffect.of(new Set([3, 4])) });
    const bm = tr2.state.field(bookmarkState);
    expect(bm.has(1)).toBe(false);
    expect(bm.has(3)).toBe(true);
    expect(bm.has(4)).toBe(true);
  });

  it('setBookmarksEffect with empty set clears all bookmarks', () => {
    const s = state('a\nb');
    const tr1 = s.update({ effects: toggleBookmarkEffect.of(1) });
    const tr2 = tr1.state.update({ effects: setBookmarksEffect.of(new Set()) });
    expect(tr2.state.field(bookmarkState).size).toBe(0);
  });

  it('bookmarks are mapped through document changes (line inserted before)', () => {
    const s = state('a\nb\nc');
    // Bookmark line 3 ('c').
    const tr1 = s.update({ effects: toggleBookmarkEffect.of(3) });
    // Insert a new line at position 1 (after 'a').
    const tr2 = tr1.state.update({ changes: { from: 1, to: 1, insert: '\nnew' } });
    // 'c' is now on line 4.
    const bm = tr2.state.field(bookmarkState);
    expect(bm.has(4)).toBe(true);
    expect(bm.has(3)).toBe(false);
  });

  it('multiple bookmarks map correctly after edit', () => {
    const s = state('a\nb\nc\nd\ne');
    // Bookmark lines 2 and 4.
    const tr1 = s.update({
      effects: [toggleBookmarkEffect.of(2), toggleBookmarkEffect.of(4)],
    });
    // Delete line 1 ('a\n' = from 0 to 2).
    const tr2 = tr1.state.update({ changes: { from: 0, to: 2, insert: '' } });
    // After deletion: 'b' is now line 1, 'c' is line 2, 'd' is line 3, 'e' is line 4.
    const bm = tr2.state.field(bookmarkState);
    // Original line 2 ('b') → line 1 after delete.
    expect(bm.has(1)).toBe(true);
    // Original line 4 ('d') → line 3 after delete.
    expect(bm.has(3)).toBe(true);
    expect(bm.size).toBe(2);
  });
});

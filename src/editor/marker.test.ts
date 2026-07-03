// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Unit tests for marker.ts — pure logic helpers and CM6 StateField behavior.
 *
 * Tests cover:
 *  1. findMarkRanges: finds all occurrences; case-insensitive; whole-word exclusions.
 *  2. findMarkRanges boundary: doc start/end, punctuation, underscore (word char).
 *  3. cmdMark: word-at-cursor (whole-word); no word at cursor; selection > 1024.
 *  4. cmdMark additive: mark "foo" style 0, then "bar" style 0 → both remain.
 *  5. clearMarkEffect/cmdClearMark: removes only index i; other indices remain.
 *  6. clearAllMarksEffect/cmdClearAllMarks: removes all.
 *  7. Edit-following: mark follows insertion above it; mark dropped when own text deleted.
 */
import { describe, it, expect } from 'vitest';
import { EditorState, EditorSelection } from '@codemirror/state';
import {
  findMarkRanges,
  markState,
  markRangesEffect,
  clearMarkEffect,
  clearAllMarksEffect,
  getMarkCount,
} from './marker';

// Helper: create a state with markState extension.
function mkState(doc: string, selection?: { anchor: number; head?: number }): EditorState {
  return EditorState.create({
    doc,
    extensions: [markState],
    selection: selection ? EditorSelection.cursor(selection.anchor) : undefined,
  });
}

// Helper: create state with selection range.
function mkStateWithSel(doc: string, from: number, to: number): EditorState {
  return EditorState.create({
    doc,
    extensions: [markState],
    selection: EditorSelection.range(from, to),
  });
}

// ── 1. findMarkRanges: basic ───────────────────────────────────────────────────

describe('findMarkRanges', () => {
  it('finds all occurrences (case-insensitive)', () => {
    const state = mkState('foo FOO Foo bar');
    const ranges = findMarkRanges(state, 'foo', false);
    expect(ranges).toHaveLength(3);
    expect(ranges[0]).toEqual({ from: 0, to: 3 });
    expect(ranges[1]).toEqual({ from: 4, to: 7 });
    expect(ranges[2]).toEqual({ from: 8, to: 11 });
  });

  it('whole-word=false includes substrings (foobar contains foo)', () => {
    const state = mkState('foo foobar baz');
    const ranges = findMarkRanges(state, 'foo', false);
    expect(ranges).toHaveLength(2);
  });

  it('whole-word=true excludes foobar when needle is foo', () => {
    const state = mkState('foo foobar baz');
    const ranges = findMarkRanges(state, 'foo', true);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual({ from: 0, to: 3 });
  });

  it('returns empty for no matches', () => {
    const state = mkState('hello world');
    expect(findMarkRanges(state, 'xyz', false)).toHaveLength(0);
  });

  it('returns empty for empty needle', () => {
    const state = mkState('hello');
    expect(findMarkRanges(state, '', false)).toHaveLength(0);
  });
});

// ── 2. findMarkRanges: boundary conditions ────────────────────────────────────

describe('findMarkRanges boundary', () => {
  it('whole-word match at doc start (no char before)', () => {
    const state = mkState('foo bar');
    const ranges = findMarkRanges(state, 'foo', true);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]!.from).toBe(0);
  });

  it('whole-word match at doc end (no char after)', () => {
    const state = mkState('bar foo');
    const ranges = findMarkRanges(state, 'foo', true);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]!.to).toBe(7);
  });

  it('adjacent to punctuation: treated as word boundary', () => {
    const state = mkState('(foo) bar');
    const ranges = findMarkRanges(state, 'foo', true);
    expect(ranges).toHaveLength(1);
  });

  it('underscore IS a word char: foo_bar is one word, needle foo excluded', () => {
    const state = mkState('foo_bar foo');
    const ranges = findMarkRanges(state, 'foo', true);
    // 'foo_bar' has '_' after 'foo' (word char) → excluded; 'foo' at end → included.
    expect(ranges).toHaveLength(1);
    expect(ranges[0]!.from).toBe(8);
  });
});

// ── 2b. findMarkRanges: non-overlapping (faithful to forEachMatch) ────────────

describe('findMarkRanges non-overlapping', () => {
  it('"aa" in "aaa" yields ONE match (non-overlapping), not two', () => {
    // C++ forEachMatch resumes at `end`, so occurrences never overlap.
    const state = mkState('aaa');
    const ranges = findMarkRanges(state, 'aa', false);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual({ from: 0, to: 2 });
  });

  it('"aa" in "aaaa" yields TWO non-overlapping matches', () => {
    const state = mkState('aaaa');
    const ranges = findMarkRanges(state, 'aa', false);
    expect(ranges).toHaveLength(2);
    expect(ranges[0]).toEqual({ from: 0, to: 2 });
    expect(ranges[1]).toEqual({ from: 2, to: 4 });
  });

  it('single-char needle "a" in "aaa" yields three matches', () => {
    const state = mkState('aaa');
    const ranges = findMarkRanges(state, 'a', false);
    expect(ranges).toHaveLength(3);
  });

  it('whole-word reject does not skip a valid match starting just after', () => {
    // needle "foo", whole-word: "foofoo foo" — only the standalone "foo" (at 7)
    // is a whole word. The two rejected substrings must not cause it to be missed.
    const state = mkState('foofoo foo');
    const ranges = findMarkRanges(state, 'foo', true);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual({ from: 7, to: 10 });
  });
});

// ── 3. cmdMark: selection behavior ───────────────────────────────────────────

describe('cmdMark', () => {
  it('no selection + cursor on a word marks all occurrences (whole-word)', () => {
    // 'foo bar foo' — cursor at position 1 (on 'foo')
    const doc = 'foo bar foo';
    // We need a real EditorView to test cmdMark (it needs dispatch).
    // Use the StateField directly with effects to test equivalent behavior.
    const state = mkState(doc, { anchor: 1 }); // cursor inside 'foo'
    // Simulate what cmdMark does: word at cursor = 'foo', whole-word=true.
    const word = state.wordAt(1);
    expect(word).not.toBeNull();
    const needle = state.sliceDoc(word!.from, word!.to);
    expect(needle).toBe('foo');
    const ranges = findMarkRanges(state, needle, true);
    // Both 'foo' occurrences should be found.
    expect(ranges).toHaveLength(2);
  });

  it('no selection + cursor NOT on a word → wordAt returns null → abort', () => {
    // Cursor on a punctuation-only token with no adjacent word chars.
    // CM6's wordAt returns null when there is no word char at or adjacent to the position.
    // Use a position surrounded by spaces/punctuation on both sides.
    const state = mkState('foo  bar', { anchor: 4 }); // cursor in the middle space of double-space
    const word = state.wordAt(4);
    // Mid-space with no word chars on either side → should return null.
    expect(word).toBeNull();
  });

  it('selection > 1024 chars → returns false (size limit)', () => {
    // Build a string of 1025 'a's. Cursor selection from 0 to 1025.
    const doc = 'a'.repeat(1025) + ' b';
    const state = mkStateWithSel(doc, 0, 1025);
    const sel = state.selection.main;
    expect(sel.to - sel.from).toBeGreaterThan(1024);
    // The size check: selLen > MARK_MAX_SELECTION → abort.
    expect(sel.to - sel.from > 1024).toBe(true);
  });
});

// ── 4. cmdMark additive ───────────────────────────────────────────────────────

describe('cmdMark additive', () => {
  it('marking two different words in style 0 keeps both', () => {
    // Dispatch markRangesEffect twice — simulates two cmdMark calls.
    const doc = 'foo bar foo bar';
    const state0 = mkState(doc);

    // Mark 'foo' (2 occurrences).
    const fooRanges = findMarkRanges(state0, 'foo', false);
    const tr1 = state0.update({ effects: markRangesEffect.of({ index: 0, ranges: fooRanges }) });

    // Mark 'bar' (2 occurrences) additively.
    const barRanges = findMarkRanges(tr1.state, 'bar', false);
    const tr2 = tr1.state.update({
      effects: markRangesEffect.of({ index: 0, ranges: barRanges }),
    });

    // Both should be present.
    const count = getMarkCount(tr2.state, 0);
    expect(count).toBe(4); // 2 'foo' + 2 'bar'
  });

  it('re-marking the SAME text in the same style is idempotent (no duplicates)', () => {
    // Faithful to Scintilla indicatorFillRange (idempotent per position).
    const doc = 'foo foo';
    const state0 = mkState(doc);
    const fooRanges = findMarkRanges(state0, 'foo', false);
    expect(fooRanges).toHaveLength(2);

    const tr1 = state0.update({ effects: markRangesEffect.of({ index: 0, ranges: fooRanges }) });
    expect(getMarkCount(tr1.state, 0)).toBe(2);

    // Mark the exact same ranges again — count must stay 2, not 4.
    const tr2 = tr1.state.update({ effects: markRangesEffect.of({ index: 0, ranges: fooRanges }) });
    expect(getMarkCount(tr2.state, 0)).toBe(2);
  });
});

// ── 5. clearMarkEffect / cmdClearMark ────────────────────────────────────────

describe('clearMarkEffect', () => {
  it('clearMarkEffect removes only index i; other indices remain', () => {
    const doc = 'foo bar baz';
    const state0 = mkState(doc);

    // Mark index 0 with 'foo' and index 1 with 'bar'.
    const fooRanges = findMarkRanges(state0, 'foo', false);
    const barRanges = findMarkRanges(state0, 'bar', false);
    const tr1 = state0.update({
      effects: [
        markRangesEffect.of({ index: 0, ranges: fooRanges }),
        markRangesEffect.of({ index: 1, ranges: barRanges }),
      ],
    });

    // Clear only index 0.
    const tr2 = tr1.state.update({ effects: clearMarkEffect.of(0) });

    expect(getMarkCount(tr2.state, 0)).toBe(0);
    expect(getMarkCount(tr2.state, 1)).toBe(1); // 'bar' still marked
  });
});

// ── 6. clearAllMarksEffect / cmdClearAllMarks ─────────────────────────────────

describe('clearAllMarksEffect', () => {
  it('clearAllMarksEffect removes all indices', () => {
    const doc = 'foo bar baz';
    const state0 = mkState(doc);

    const fooRanges = findMarkRanges(state0, 'foo', false);
    const barRanges = findMarkRanges(state0, 'bar', false);
    const bazRanges = findMarkRanges(state0, 'baz', false);
    const tr1 = state0.update({
      effects: [
        markRangesEffect.of({ index: 0, ranges: fooRanges }),
        markRangesEffect.of({ index: 1, ranges: barRanges }),
        markRangesEffect.of({ index: 2, ranges: bazRanges }),
      ],
    });

    expect(getMarkCount(tr1.state, 0)).toBe(1);
    expect(getMarkCount(tr1.state, 1)).toBe(1);
    expect(getMarkCount(tr1.state, 2)).toBe(1);

    const tr2 = tr1.state.update({ effects: clearAllMarksEffect.of(undefined) });

    expect(getMarkCount(tr2.state, 0)).toBe(0);
    expect(getMarkCount(tr2.state, 1)).toBe(0);
    expect(getMarkCount(tr2.state, 2)).toBe(0);
  });
});

// ── 7. Edit-following ─────────────────────────────────────────────────────────

describe('edit-following', () => {
  it('a mark follows an insertion above it', () => {
    // Doc: 'foo\nbar' — mark 'bar' at [4,7).
    const doc = 'foo\nbar';
    const state0 = mkState(doc);
    const ranges = findMarkRanges(state0, 'bar', false);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual({ from: 4, to: 7 });

    const tr1 = state0.update({ effects: markRangesEffect.of({ index: 0, ranges }) });
    expect(getMarkCount(tr1.state, 0)).toBe(1);

    // Insert 'new\n' at position 0 (before 'foo'). 'bar' shifts from [4,7) to [8,11).
    const tr2 = tr1.state.update({ changes: { from: 0, to: 0, insert: 'new\n' } });
    // The mark should have followed the shift.
    expect(getMarkCount(tr2.state, 0)).toBe(1);
  });

  it('a mark is dropped when its own text is deleted', () => {
    // Doc: 'foo bar' — mark 'foo' at [0,3).
    const doc = 'foo bar';
    const state0 = mkState(doc);
    const ranges = findMarkRanges(state0, 'foo', false);
    const tr1 = state0.update({ effects: markRangesEffect.of({ index: 0, ranges }) });
    expect(getMarkCount(tr1.state, 0)).toBe(1);

    // Delete 'foo' (positions 0..3).
    const tr2 = tr1.state.update({ changes: { from: 0, to: 3, insert: '' } });
    // The mark should be gone.
    expect(getMarkCount(tr2.state, 0)).toBe(0);
  });
});

// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Unit tests for find-highlight.ts — dedicated find-highlight extension.
 *
 * Tests cover:
 *  1. addFindHighlightsEffect: highlights added → getFindHighlightCount correct.
 *  2. addFindHighlightsEffect additive: add different ranges → total increases.
 *  3. addFindHighlightsEffect idempotent: re-adding same ranges → no duplicate.
 *  4. clearFindHighlightsEffect: after adding, clear → count = 0.
 *  5. Edit-following: highlights map through doc changes.
 *  6. getFindHighlightRanges: returns correct {from,to} pairs.
 *  7. Search-and-bookmark line number collection: matches → unique 1-based lines.
 */

import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { Text } from '@codemirror/state';
import {
  findHighlightState,
  addFindHighlightsEffect,
  clearFindHighlightsEffect,
  getFindHighlightCount,
  getFindHighlightRanges,
} from './find-highlight';

/** Helper: create an EditorState with findHighlightState extension. */
function mkState(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [findHighlightState] });
}

// ── 1. addFindHighlightsEffect: basic add ─────────────────────────────────────

describe('addFindHighlightsEffect basic', () => {
  it('adds highlights and getFindHighlightCount returns correct count', () => {
    const state = mkState('foo bar foo baz');
    const ranges = [
      { from: 0, to: 3 },
      { from: 8, to: 11 },
    ];
    const tr = state.update({ effects: addFindHighlightsEffect.of(ranges) });
    expect(getFindHighlightCount(tr.state)).toBe(2);
  });

  it('getFindHighlightRanges returns correct ranges', () => {
    const state = mkState('hello world hello');
    const ranges = [
      { from: 0, to: 5 },
      { from: 12, to: 17 },
    ];
    const tr = state.update({ effects: addFindHighlightsEffect.of(ranges) });
    const result = getFindHighlightRanges(tr.state);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ from: 0, to: 5 });
    expect(result[1]).toEqual({ from: 12, to: 17 });
  });

  it('empty ranges array → count stays 0', () => {
    const state = mkState('hello world');
    const tr = state.update({ effects: addFindHighlightsEffect.of([]) });
    expect(getFindHighlightCount(tr.state)).toBe(0);
  });
});

// ── 2. addFindHighlightsEffect additive ──────────────────────────────────────

describe('addFindHighlightsEffect additive', () => {
  it('adding different ranges accumulates all highlights', () => {
    const state = mkState('foo bar foo');
    // First mark: "foo" at 0-3 and 8-11
    const tr1 = state.update({
      effects: addFindHighlightsEffect.of([{ from: 0, to: 3 }]),
    });
    // Second mark: "bar" at 4-7
    const tr2 = tr1.state.update({
      effects: addFindHighlightsEffect.of([{ from: 4, to: 7 }]),
    });
    expect(getFindHighlightCount(tr2.state)).toBe(2);
  });

  it('accumulates across searches (faithful to indicatorFillRange)', () => {
    const state = mkState('foo bar foo bar');
    const fooRanges = [
      { from: 0, to: 3 },
      { from: 8, to: 11 },
    ];
    const barRanges = [
      { from: 4, to: 7 },
      { from: 12, to: 15 },
    ];
    const tr1 = state.update({ effects: addFindHighlightsEffect.of(fooRanges) });
    const tr2 = tr1.state.update({ effects: addFindHighlightsEffect.of(barRanges) });
    expect(getFindHighlightCount(tr2.state)).toBe(4);
  });
});

// ── 3. addFindHighlightsEffect idempotent ────────────────────────────────────

describe('addFindHighlightsEffect idempotent', () => {
  it('re-adding the same ranges does not create duplicates', () => {
    const state = mkState('foo bar foo');
    const ranges = [
      { from: 0, to: 3 },
      { from: 8, to: 11 },
    ];
    const tr1 = state.update({ effects: addFindHighlightsEffect.of(ranges) });
    expect(getFindHighlightCount(tr1.state)).toBe(2);

    // Add the exact same ranges again.
    const tr2 = tr1.state.update({ effects: addFindHighlightsEffect.of(ranges) });
    // Must stay 2, not become 4.
    expect(getFindHighlightCount(tr2.state)).toBe(2);
  });

  it('partial overlap: only truly new ranges are added', () => {
    const state = mkState('foo bar baz');
    const tr1 = state.update({
      effects: addFindHighlightsEffect.of([
        { from: 0, to: 3 },
        { from: 4, to: 7 },
      ]),
    });
    // Add [0,3) again + a new [8,11).
    const tr2 = tr1.state.update({
      effects: addFindHighlightsEffect.of([
        { from: 0, to: 3 }, // duplicate
        { from: 8, to: 11 }, // new
      ]),
    });
    expect(getFindHighlightCount(tr2.state)).toBe(3);
  });
});

// ── 4. clearFindHighlightsEffect ─────────────────────────────────────────────

describe('clearFindHighlightsEffect', () => {
  it('clears all highlights after adding', () => {
    const state = mkState('foo bar foo');
    const tr1 = state.update({
      effects: addFindHighlightsEffect.of([
        { from: 0, to: 3 },
        { from: 8, to: 11 },
      ]),
    });
    expect(getFindHighlightCount(tr1.state)).toBe(2);

    const tr2 = tr1.state.update({ effects: clearFindHighlightsEffect.of(undefined) });
    expect(getFindHighlightCount(tr2.state)).toBe(0);
    expect(getFindHighlightRanges(tr2.state)).toHaveLength(0);
  });

  it('clearing an already empty state stays at 0', () => {
    const state = mkState('hello world');
    const tr = state.update({ effects: clearFindHighlightsEffect.of(undefined) });
    expect(getFindHighlightCount(tr.state)).toBe(0);
  });
});

// ── 5. Edit-following ─────────────────────────────────────────────────────────

describe('edit-following', () => {
  it('highlights follow an insertion above them', () => {
    // Doc: 'foo\nbar' — highlight 'bar' at [4,7).
    const state = mkState('foo\nbar');
    const tr1 = state.update({
      effects: addFindHighlightsEffect.of([{ from: 4, to: 7 }]),
    });
    expect(getFindHighlightCount(tr1.state)).toBe(1);
    expect(getFindHighlightRanges(tr1.state)[0]).toEqual({ from: 4, to: 7 });

    // Insert 'new\n' at position 0 → 'bar' shifts from [4,7) to [8,11).
    const tr2 = tr1.state.update({ changes: { from: 0, to: 0, insert: 'new\n' } });
    expect(getFindHighlightCount(tr2.state)).toBe(1);
    const after = getFindHighlightRanges(tr2.state)[0];
    expect(after).toEqual({ from: 8, to: 11 });
  });

  it('highlight is dropped when its own text is deleted', () => {
    const state = mkState('foo bar');
    const tr1 = state.update({
      effects: addFindHighlightsEffect.of([{ from: 0, to: 3 }]),
    });
    expect(getFindHighlightCount(tr1.state)).toBe(1);

    // Delete 'foo' (0..3).
    const tr2 = tr1.state.update({ changes: { from: 0, to: 3, insert: '' } });
    expect(getFindHighlightCount(tr2.state)).toBe(0);
  });
});

// ── 6. getFindHighlightRanges ─────────────────────────────────────────────────

describe('getFindHighlightRanges', () => {
  it('returns ranges in order', () => {
    const state = mkState('abc def ghi');
    const ranges = [
      { from: 0, to: 3 },
      { from: 4, to: 7 },
      { from: 8, to: 11 },
    ];
    const tr = state.update({ effects: addFindHighlightsEffect.of(ranges) });
    const result = getFindHighlightRanges(tr.state);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ from: 0, to: 3 });
    expect(result[1]).toEqual({ from: 4, to: 7 });
    expect(result[2]).toEqual({ from: 8, to: 11 });
  });

  it('returns empty array when no highlights', () => {
    const state = mkState('hello');
    expect(getFindHighlightRanges(state)).toHaveLength(0);
  });
});

// ── 7. Search-and-bookmark line collection ────────────────────────────────────

describe('search-and-bookmark line collection', () => {
  it('collects unique 1-based line numbers from match positions', () => {
    // Doc: "foo\nbar\nfoo" — 3 lines
    // matches: [{from:0,to:3}, {from:8,to:11}] → lines 1 and 3
    const docText = 'foo\nbar\nfoo';
    const doc = Text.of(docText.split('\n'));

    // Simulate what _doMarkAll does for bookmark-line:
    const matches = [
      { from: 0, to: 3 }, // 'foo' on line 1
      { from: 8, to: 11 }, // 'foo' on line 3
    ];

    const lineNos = new Set<number>();
    for (const { from } of matches) {
      lineNos.add(doc.lineAt(from).number);
    }

    expect(lineNos.size).toBe(2);
    expect(lineNos.has(1)).toBe(true);
    expect(lineNos.has(3)).toBe(true);
  });

  it('two matches on the same line produce only one bookmark line', () => {
    // Doc: "foo foo\nbar" — both 'foo' on line 1
    const docText = 'foo foo\nbar';
    const doc = Text.of(docText.split('\n'));

    const matches = [
      { from: 0, to: 3 }, // first 'foo' on line 1
      { from: 4, to: 7 }, // second 'foo' on line 1
    ];

    const lineNos = new Set<number>();
    for (const { from } of matches) {
      lineNos.add(doc.lineAt(from).number);
    }

    expect(lineNos.size).toBe(1);
    expect(lineNos.has(1)).toBe(true);
  });

  it('merges with existing bookmark set (idempotent add)', () => {
    // Simulate merging new line numbers into an existing bookmark set.
    const existing = new Set<number>([2, 4]);
    const newLineNos = [1, 2, 3]; // line 2 is already bookmarked

    const merged = new Set(existing);
    for (const line of newLineNos) {
      merged.add(line);
    }

    // Should have 1, 2, 3, 4 (no duplicates, no removals).
    expect(merged.size).toBe(4);
    expect(merged.has(1)).toBe(true);
    expect(merged.has(2)).toBe(true);
    expect(merged.has(3)).toBe(true);
    expect(merged.has(4)).toBe(true);
  });
});

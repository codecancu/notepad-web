// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * marker.ts — CM6 Mark All Occurrences system, faithful to NotepadNext MarkerAppDecorator.
 *
 * Design:
 *  - markState: a StateField<DecorationSet> tracking 3 independent mark layers
 *    (indices 0, 1, 2), each with a distinct color class (.cm-mark-0/1/2).
 *  - markerExtension: the StateField + base theme rules.
 *  - Pure helper findMarkRanges(): exported for unit tests.
 *  - CM6 command factories: cmdMark(i), cmdClearMark(i), cmdClearAllMarks.
 *  - getMarkCount(): test/e2e helper.
 *
 * Faithful to NotepadNext MarkerAppDecorator:
 *  - 3 indicator colors: cyan (0,255,255), orange (255,128,0), yellow (255,255,0).
 *  - INDIC_ROUNDBOX with outline alpha 150 and fill alpha 100 → CSS rgba(r,g,b,0.59) border,
 *    rgba(r,g,b,0.39) background, border-radius:2px.
 *  - mark(i): word-at-cursor (whole-word) if no selection, else selected text (not whole-word).
 *  - Case-insensitive matching always. Additive (no pre-clear).
 *  - Selection size limit: 1024 chars.
 *  - clear(i): remove all marks of index i.
 *  - clearAll(): clear all 3 indices.
 */

import { StateField, StateEffect, EditorState } from '@codemirror/state';
import { EditorView, Decoration, DecorationSet } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

export const MARKER_COUNT = 3;
export const MARKER_COLORS: readonly (readonly [number, number, number])[] = [
  [0, 255, 255],
  [255, 128, 0],
  [255, 255, 0],
];
export const MARK_MAX_SELECTION = 1024;

// 3 identity-distinct mark decorations, one per marker index.
const markDeco = MARKER_COLORS.map((_, i) => Decoration.mark({ class: `cm-mark-${i}` }));

// ── Effects ────────────────────────────────────────────────────────────────────

export const markRangesEffect = StateEffect.define<{
  index: number;
  ranges: readonly { from: number; to: number }[];
}>();
export const clearMarkEffect = StateEffect.define<number>();
export const clearAllMarksEffect = StateEffect.define<undefined>();

// ── Pure helper ────────────────────────────────────────────────────────────────

/**
 * Find all occurrences of `needle` in the document (case-insensitive; whole-word gated).
 * Exported for unit tests. Returns sorted, non-overlapping {from,to} pairs.
 *
 * Faithful to MarkerAppDecorator.cpp:56–91:
 *  - Case-insensitive always (SCFIND_MATCHCASE never set).
 *  - wholeWord=true: a match is accepted only if the chars immediately outside
 *    [from,to) are not word chars (/[A-Za-z0-9_]/ = JS \w, Scintilla default).
 */
export function findMarkRanges(
  state: EditorState,
  needle: string,
  wholeWord: boolean,
): { from: number; to: number }[] {
  if (needle.length === 0) return [];
  const doc = state.doc;
  const text = doc.toString();
  const lower = text.toLowerCase();
  const needleLower = needle.toLowerCase();
  const results: { from: number; to: number }[] = [];
  const isWordChar = (c: string | null): boolean => c !== null && /\w/.test(c);
  let pos = 0;
  while (pos <= text.length - needleLower.length) {
    const idx = lower.indexOf(needleLower, pos);
    if (idx === -1) break;
    const from = idx;
    const to = idx + needleLower.length;
    let accept = true;
    if (wholeWord) {
      const before: string | null = from > 0 ? (text[from - 1] ?? null) : null;
      const after: string | null = to < text.length ? (text[to] ?? null) : null;
      accept = !isWordChar(before) && !isWordChar(after);
    }
    if (accept) {
      results.push({ from, to });
      // Non-overlapping: resume past this match — faithful to the C++
      // forEachMatch callback returning `end` (MarkerAppDecorator.cpp:87–90).
      pos = to;
    } else {
      // Whole-word reject: advance by one so a valid whole-word match that
      // begins just after this rejected substring is not skipped.
      pos = idx + 1;
    }
  }
  return results;
}

// ── StateField ─────────────────────────────────────────────────────────────────

/**
 * Per-document StateField<DecorationSet[]> tracking 3 mark layers.
 * Map through changes first, then apply effects. Additive on markRangesEffect.
 */
export const markState = StateField.define<DecorationSet[]>({
  create(): DecorationSet[] {
    return [Decoration.none, Decoration.none, Decoration.none];
  },

  update(decos: DecorationSet[], tr): DecorationSet[] {
    // Map through document changes first (keeps ranges position-correct).
    let next = decos.map((d) => d.map(tr.changes));

    // Apply effects.
    for (const effect of tr.effects) {
      if (effect.is(markRangesEffect)) {
        const { index, ranges } = effect.value;
        if (index < 0 || index >= MARKER_COUNT) continue;
        // Additive but idempotent: merge new ranges into the existing
        // DecorationSet, skipping any range already marked in this index.
        // Faithful to Scintilla indicatorFillRange, which is idempotent per
        // position — re-marking the same text must not stack duplicates.
        const existing = next[index]!;
        const seen = new Set<string>();
        existing.between(0, tr.newDoc.length, (from, to) => {
          seen.add(`${from}:${to}`);
        });
        const fresh = ranges.filter((r) => !seen.has(`${r.from}:${r.to}`));
        if (fresh.length === 0) continue;
        // deco.update({ add }) requires add sorted by `from`; findMarkRanges
        // returns sorted results and filter preserves order.
        const add = fresh.map((r) => markDeco[index]!.range(r.from, r.to));
        next = next.map((d, i) => (i === index ? d.update({ add, sort: true }) : d));
      } else if (effect.is(clearMarkEffect)) {
        const index = effect.value;
        if (index < 0 || index >= MARKER_COUNT) continue;
        next = next.map((d, i) => (i === index ? Decoration.none : d));
      } else if (effect.is(clearAllMarksEffect)) {
        next = [Decoration.none, Decoration.none, Decoration.none];
      }
    }

    return next;
  },

  provide(f): Extension {
    // Provide all 3 DecorationSets as separate decoration facets.
    return EditorView.decorations.computeN([f], (state) => state.field(f));
  },
});

// ── Base theme ──────────────────────────────────────────────────────────────────

const [c0, c1, c2] = MARKER_COLORS as unknown as [
  [number, number, number],
  [number, number, number],
  [number, number, number],
];

function markRule(r: number, g: number, b: number): Record<string, string> {
  return {
    backgroundColor: `rgba(${r},${g},${b},0.39)`,
    border: `1px solid rgba(${r},${g},${b},0.59)`,
    borderRadius: '2px',
  };
}

// ── Combined extension ──────────────────────────────────────────────────────────

/**
 * All marker extensions: StateField + base theme.
 * Include in sharedExtensions (editor-page.ts) so every per-doc state carries it.
 */
export const markerExtension: Extension = [
  markState,
  EditorView.baseTheme({
    '.cm-mark-0': markRule(c0[0], c0[1], c0[2]),
    '.cm-mark-1': markRule(c1[0], c1[1], c1[2]),
    '.cm-mark-2': markRule(c2[0], c2[1], c2[2]),
  }),
];

// ── Command factories ──────────────────────────────────────────────────────────

/**
 * Mark all occurrences of the word at cursor (whole-word) or selected text (not whole-word).
 * Faithful to MarkerAppDecorator::mark(editor, i).
 * - No selection → word at cursor, whole-word=true.
 * - Selection → selected text verbatim, whole-word=false.
 * - Selection > 1024 chars → abort (return false).
 * - Case-insensitive always.
 * - Additive: existing marks of index i are preserved.
 */
export function cmdMark(index: number): (view: EditorView) => boolean {
  return (view: EditorView): boolean => {
    const { state } = view;
    const sel = state.selection.main;
    let needle: string;
    let wholeWord: boolean;

    if (sel.empty) {
      // No selection: use word at cursor.
      const word = state.wordAt(sel.head);
      if (!word) return false;
      needle = state.sliceDoc(word.from, word.to);
      wholeWord = true;
    } else {
      // Selection: use selected text.
      const selLen = sel.to - sel.from;
      if (selLen > MARK_MAX_SELECTION) return false;
      needle = state.sliceDoc(sel.from, sel.to);
      wholeWord = false;
    }

    const ranges = findMarkRanges(state, needle, wholeWord);
    if (ranges.length === 0) return false;

    view.dispatch({
      effects: markRangesEffect.of({ index, ranges }),
      userEvent: 'marker.mark',
    });
    return true;
  };
}

/**
 * Remove all marks of indicator `index` from the whole document.
 * Faithful to MarkerAppDecorator::clear(editor, i).
 */
export function cmdClearMark(index: number): (view: EditorView) => boolean {
  return (view: EditorView): boolean => {
    const count = getMarkCount(view.state, index);
    if (count === 0) return false;
    view.dispatch({
      effects: clearMarkEffect.of(index),
      userEvent: 'marker.clear',
    });
    return true;
  };
}

/**
 * Clear all marks (indices 0, 1, 2).
 * Faithful to MarkerAppDecorator::clearAll(editor).
 */
export function cmdClearAllMarks(view: EditorView): boolean {
  const decos = view.state.field(markState);
  const hasAny = decos.some((d) => {
    let found = false;
    d.between(0, view.state.doc.length, () => {
      found = true;
    });
    return found;
  });
  if (!hasAny) return false;
  view.dispatch({
    effects: clearAllMarksEffect.of(undefined),
    userEvent: 'marker.clearAll',
  });
  return true;
}

// ── Test/e2e getter ────────────────────────────────────────────────────────────

/**
 * Count the number of marks of `index` in the given state.
 * Exported for unit tests and e2e test hooks.
 */
export function getMarkCount(state: EditorState, index: number): number {
  const decos = state.field(markState);
  if (index < 0 || index >= MARKER_COUNT) return 0;
  let count = 0;
  decos[index]!.between(0, state.doc.length, () => {
    count++;
  });
  return count;
}

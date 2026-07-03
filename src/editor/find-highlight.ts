// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * find-highlight.ts — Dedicated find-highlight extension for the Find dialog's Mark All.
 *
 * Faithful to NotepadNext FindReplaceDialog's "find_mark_highlight" INDIC_FULLBOX indicator:
 *  - Yellow fill #FFCC00 (rgb 255,204,0), fillAlpha 100/255 ≈ 0.39.
 *  - Outline same color, outlineAlpha 200/255 ≈ 0.78.
 *  - SEPARATE from the P4.3 marker slots (marker.ts 3 ROUNDBOX layers). Orthogonal system.
 *
 * Design mirrors marker.ts:
 *  - findHighlightState: StateField<DecorationSet> with add/clear effects.
 *  - addFindHighlightsEffect: ADDITIVE (accumulate, deduplicate) — faithful to
 *    indicatorFillRange which accumulates across searches unless purged.
 *  - clearFindHighlightsEffect: clear all highlights (faithful to indicatorClearRange).
 *  - Decoration.mark class `cm-find-highlight`.
 *  - findHighlightExtension: StateField + baseTheme (add to sharedExtensions).
 */

import { StateField, StateEffect, EditorState } from '@codemirror/state';
import { EditorView, Decoration, DecorationSet } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

// ── Effects ────────────────────────────────────────────────────────────────────

/**
 * Add highlight ranges ADDITIVELY.
 * Existing highlights are preserved; new ranges are merged and deduplicated
 * (faithful to Scintilla indicatorFillRange which is idempotent per position).
 */
export const addFindHighlightsEffect =
  StateEffect.define<readonly { from: number; to: number }[]>();

/**
 * Clear ALL find-highlights (faithful to indicatorClearRange over the whole doc).
 * Does NOT clear bookmarks — orthogonal systems.
 */
export const clearFindHighlightsEffect = StateEffect.define<undefined>();

// ── Decoration ─────────────────────────────────────────────────────────────────

const findHighlightDeco = Decoration.mark({ class: 'cm-find-highlight' });

// ── StateField ─────────────────────────────────────────────────────────────────

/**
 * Per-document StateField<DecorationSet> tracking the find-highlight ranges.
 * Map through changes first (keeps ranges position-correct across edits),
 * then apply effects.
 */
export const findHighlightState = StateField.define<DecorationSet>({
  create(): DecorationSet {
    return Decoration.none;
  },

  update(decos: DecorationSet, tr): DecorationSet {
    // Map through document changes first so highlights follow edits.
    let next = decos.map(tr.changes);

    for (const effect of tr.effects) {
      if (effect.is(addFindHighlightsEffect)) {
        const ranges = effect.value;
        // Deduplicate: build a set of "from:to" strings already in the DecorationSet.
        const seen = new Set<string>();
        next.between(0, tr.newDoc.length, (from, to) => {
          seen.add(`${from}:${to}`);
        });
        const fresh = ranges.filter((r) => !seen.has(`${r.from}:${r.to}`));
        if (fresh.length === 0) continue;
        // add requires sorted ranges; addFindHighlightsEffect callers use findMatches
        // which returns sorted results.
        const add = fresh.map((r) => findHighlightDeco.range(r.from, r.to));
        next = next.update({ add, sort: true });
      } else if (effect.is(clearFindHighlightsEffect)) {
        next = Decoration.none;
      }
    }

    return next;
  },

  provide(f): Extension {
    return EditorView.decorations.of((view) => view.state.field(f));
  },
});

// ── Getters (exported for tests and e2e) ──────────────────────────────────────

/**
 * Return all find-highlight ranges from the given EditorState.
 * Exported for Copy Marked Text and unit/e2e tests.
 */
export function getFindHighlightRanges(state: EditorState): { from: number; to: number }[] {
  const decos = state.field(findHighlightState);
  const ranges: { from: number; to: number }[] = [];
  decos.between(0, state.doc.length, (from, to) => {
    ranges.push({ from, to });
  });
  return ranges;
}

/**
 * Return the count of find-highlight ranges from the given EditorState.
 * Exported for unit/e2e tests.
 */
export function getFindHighlightCount(state: EditorState): number {
  const decos = state.field(findHighlightState);
  let count = 0;
  decos.between(0, state.doc.length, () => {
    count++;
  });
  return count;
}

// ── Combined extension ──────────────────────────────────────────────────────────

/**
 * All find-highlight extensions: StateField + base theme.
 * Add to sharedExtensions in editor-page.ts so every per-doc state carries it.
 * Faithful to NotepadNext INDIC_FULLBOX find_mark_highlight:
 *  - fill:    rgba(255,204,0,0.39) — fillAlpha 100/255 ≈ 0.39
 *  - outline: rgba(255,204,0,0.78) — outlineAlpha 200/255 ≈ 0.78
 *  - borderRadius 2px — approximates INDIC_FULLBOX box shape
 */
export const findHighlightExtension: Extension = [
  findHighlightState,
  EditorView.baseTheme({
    '.cm-find-highlight': {
      backgroundColor: 'rgba(255,204,0,0.39)',
      border: '1px solid rgba(255,204,0,0.78)',
      borderRadius: '2px',
    },
  }),
];

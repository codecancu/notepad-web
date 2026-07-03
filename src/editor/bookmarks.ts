// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * bookmarks.ts — CM6 bookmark system, faithful to NotepadNext BookMarkDecorator.
 *
 * Design:
 *  - bookmarkState: a StateField<Set<number>> tracking bookmarked line numbers
 *    (1-based, matching CM6's doc.line() convention). The Set is mapped through
 *    transactions by re-computing each stored line number via doc.lineAt() after
 *    changes, so bookmarks follow edits (lines inserted/deleted above shift them).
 *  - bookmarkGutter: a CM6 gutter() that renders a ● marker on bookmarked lines.
 *  - Pure helpers (exported for unit tests): toggle, next/prev index math, invert,
 *    collect bookmarked line text.
 *  - CM6 command wrappers: cmdToggleBookmark, cmdNextBookmark, cmdPrevBookmark,
 *    cmdClearBookmarks, cmdInvertBookmarks, cmdCutBookmarkedLines,
 *    cmdCopyBookmarkedLines, cmdDeleteBookmarkedLines.
 *
 * Faithful to NotepadNext BookMarkDecorator:
 *  - toggleBookmark(line): add if not set, remove if set.
 *  - nextBookmarkAfter(line): find next marked line, wrap to start.
 *  - previousBookMarkBefore(line): find prev marked line, wrap to end.
 *  - clearAllBookmarks(): remove all.
 *  - copyBookMarkedLines(): collect text of bookmarked lines.
 *  - cutBookMarkedLines(): copy + delete.
 *  - deleteBookMarkedLines(): remove the lines.
 */

import {
  StateField,
  StateEffect,
  Transaction,
  ChangeSet,
  Text as CMText,
  EditorState,
} from '@codemirror/state';
import { EditorView, gutter, GutterMarker } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

// ── State effects ─────────────────────────────────────────────────────────────

/** Toggle a single bookmark at a 1-based line number. */
export const toggleBookmarkEffect = StateEffect.define<number>();

/** Set all bookmarks at once (1-based line numbers). */
export const setBookmarksEffect = StateEffect.define<ReadonlySet<number>>();

// ── Pure helpers (exported for unit tests) ─────────────────────────────────────

/**
 * Toggle a line number in the set: add if absent, remove if present.
 * Returns a new Set (immutable update).
 * Faithful to BookMarkDecorator::toggleBookmark.
 */
export function toggleLine(bookmarks: ReadonlySet<number>, line: number): Set<number> {
  const next = new Set(bookmarks);
  if (next.has(line)) {
    next.delete(line);
  } else {
    next.add(line);
  }
  return next;
}

/**
 * Return the sorted array of bookmarked line numbers.
 */
export function sortedBookmarks(bookmarks: ReadonlySet<number>): number[] {
  return [...bookmarks].sort((a, b) => a - b);
}

/**
 * Find the next bookmarked line after `currentLine` (1-based), wrapping around.
 * Returns -1 if no bookmarks exist.
 * Faithful to BookMarkDecorator::nextBookmarkAfter.
 */
export function nextBookmark(bookmarks: ReadonlySet<number>, currentLine: number): number {
  const sorted = sortedBookmarks(bookmarks);
  if (sorted.length === 0) return -1;
  const after = sorted.find((l) => l > currentLine);
  return after !== undefined ? after : sorted[0]!;
}

/**
 * Find the previous bookmarked line before `currentLine` (1-based), wrapping around.
 * Returns -1 if no bookmarks exist.
 * Faithful to BookMarkDecorator::previousBookMarkBefore.
 */
export function prevBookmark(bookmarks: ReadonlySet<number>, currentLine: number): number {
  const sorted = sortedBookmarks(bookmarks);
  if (sorted.length === 0) return -1;
  // Search from the end for the last line < currentLine.
  const before = [...sorted].reverse().find((l) => l < currentLine);
  return before !== undefined ? before : sorted[sorted.length - 1]!;
}

/**
 * Invert bookmarks: toggle every line in a doc of `lineCount` lines.
 * Faithful to NotepadNext "Invert Bookmarks" — lines without a bookmark get one,
 * lines with a bookmark lose it.
 */
export function invertBookmarks(bookmarks: ReadonlySet<number>, lineCount: number): Set<number> {
  const next = new Set<number>();
  for (let i = 1; i <= lineCount; i++) {
    if (!bookmarks.has(i)) {
      next.add(i);
    }
  }
  return next;
}

/**
 * Collect the text of all bookmarked lines (including their line terminators).
 * Faithful to BookMarkDecorator::copyBookMarkedLines (returns each line's text
 * joined; uses the doc's own line objects to include the newline).
 */
export function collectBookmarkedText(bookmarks: ReadonlySet<number>, doc: CMText): string {
  const sorted = sortedBookmarks(bookmarks);
  const parts: string[] = [];
  for (const lineNo of sorted) {
    if (lineNo < 1 || lineNo > doc.lines) continue;
    const line = doc.line(lineNo);
    // Include the text + newline (or just text for the last line).
    const text =
      lineNo < doc.lines
        ? doc.sliceString(line.from, line.to) + '\n'
        : doc.sliceString(line.from, line.to);
    parts.push(text);
  }
  return parts.join('');
}

/**
 * Map bookmarked line numbers through a ChangeSet so bookmarks follow edits
 * (insertions/deletions above a bookmarked line shift its line number).
 * A bookmark is dropped only when its line is joined into the following line
 * (its terminating newline deleted); emptying a line's content keeps it.
 */
export function mapBookmarksThrough(
  bookmarks: ReadonlySet<number>,
  changes: ChangeSet,
  oldDoc: CMText,
  newDoc: CMText,
): Set<number> {
  const next = new Set<number>();
  for (const lineNo of bookmarks) {
    if (lineNo < 1 || lineNo > oldDoc.lines) continue;
    const oldLine = oldDoc.line(lineNo);

    // A non-last line ceases to exist as a distinct line only when its
    // terminating newline is deleted (the line is joined with the following
    // line). Detect that by testing whether the newline char's span
    // [oldLine.to, oldLine.to + 1) collapses to a single point through the
    // changes; if it does, drop the bookmark instead of letting it "ghost"
    // onto the unrelated content that now occupies the merged line.
    //
    // This is deliberately narrower than "the whole line collapsed to a point":
    // deleting only a line's *content* (leaving an empty line) keeps the
    // newline, so the bookmark correctly survives on the now-empty line. The
    // last line has no trailing newline, so this check does not apply — and no
    // ghosting is possible there since there is no following line.
    if (lineNo < oldDoc.lines) {
      const nlStart = changes.mapPos(oldLine.to, 1);
      const nlEnd = changes.mapPos(oldLine.to + 1, -1);
      if (nlStart === nlEnd) continue; // the '\n' was deleted → line merged away
    }

    // Map the line start position through the changes.
    // If the position was inside a deleted range, mapPos returns the boundary.
    const newFrom = changes.mapPos(oldLine.from, 1);
    // Verify the mapped position is still within the new doc.
    if (newFrom > newDoc.length) continue;
    const newLine = newDoc.lineAt(newFrom);
    // Only keep the bookmark if the line start maps cleanly.
    next.add(newLine.number);
  }
  return next;
}

// ── StateField ────────────────────────────────────────────────────────────────

/**
 * Per-document StateField that tracks bookmarked line numbers (1-based Set<number>).
 * Included in sharedExtensions so every per-doc EditorState carries it, and
 * view.setState() preserves the bookmarks when switching tabs.
 * Changes (edits) are handled by mapBookmarksThrough so bookmarks follow moved lines.
 */
export const bookmarkState = StateField.define<Set<number>>({
  create(): Set<number> {
    return new Set();
  },

  update(value: Set<number>, tr: Transaction): Set<number> {
    // First apply any explicit effects.
    let next = value;
    let changed = false;

    for (const effect of tr.effects) {
      if (effect.is(toggleBookmarkEffect)) {
        const lineNo: number = effect.value as number;
        next = toggleLine(next, lineNo);
        changed = true;
      } else if (effect.is(setBookmarksEffect)) {
        next = new Set(effect.value as ReadonlySet<number>);
        changed = true;
      }
    }

    // Then map through document changes (preserving line numbers after edits).
    if (tr.docChanged && next.size > 0) {
      next = mapBookmarksThrough(next, tr.changes, tr.startState.doc, tr.newDoc);
      changed = true;
    }

    return changed ? next : value;
  },
});

// ── Gutter marker ─────────────────────────────────────────────────────────────

/** DOM element rendered in the gutter for a bookmarked line (●). */
class BookmarkMarker extends GutterMarker {
  override toDOM(): Node {
    const el = document.createElement('span');
    el.className = 'cm-bookmark-marker';
    el.textContent = '●';
    el.title = 'Bookmark';
    el.setAttribute('aria-label', 'Bookmark');
    return el;
  }

  override eq(_other: GutterMarker): boolean {
    return _other instanceof BookmarkMarker;
  }
}

const bookmarkMarker = new BookmarkMarker();

/**
 * CM6 gutter that renders a ● marker on bookmarked lines.
 * Reads from bookmarkState so it re-renders whenever bookmarks change.
 */
export const bookmarkGutter: Extension = [
  gutter({
    class: 'cm-bookmark-gutter',
    lineMarker(view, line) {
      const bookmarks = view.state.field(bookmarkState);
      const lineNo = view.state.doc.lineAt(line.from).number;
      return bookmarks.has(lineNo) ? bookmarkMarker : null;
    },
    initialSpacer: () => bookmarkMarker,
  }),
  EditorView.baseTheme({
    '.cm-bookmark-gutter': {
      width: '18px',
      backgroundColor: 'inherit',
    },
    '.cm-bookmark-marker': {
      color: '#ff2020',
      fontSize: '14px',
      lineHeight: '1',
      cursor: 'pointer',
      display: 'inline-block',
      width: '100%',
      textAlign: 'center',
    },
  }),
];

// ── Combined extension ──────────────────────────────────────────────────────────

/**
 * All bookmark extensions: StateField + gutter.
 * Include in sharedExtensions (editor-page.ts) so every per-doc state carries them.
 */
export const bookmarkExtension: Extension = [bookmarkState, bookmarkGutter];

// ── CM6 commands ──────────────────────────────────────────────────────────────

/**
 * Toggle bookmark on the current line (or all lines covered by multi-cursor).
 * Faithful to BookMarkDecorator::toggleBookmark + margin click handler.
 * Keybinding: Ctrl+F2
 */
export function cmdToggleBookmark(view: EditorView): boolean {
  const { state } = view;
  // Collect all unique line numbers covered by any selection range.
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const fromLine = state.doc.lineAt(range.from).number;
    const toLine = state.doc.lineAt(range.to).number;
    for (let l = fromLine; l <= toLine; l++) {
      lines.add(l);
    }
  }
  const effects = [...lines].map((l) => toggleBookmarkEffect.of(l));
  view.dispatch({ effects });
  return true;
}

/**
 * Move caret to the next bookmarked line (wrapping).
 * Faithful to BookMarkDecorator::nextBookmarkAfter.
 * Keybinding: F2
 */
export function cmdNextBookmark(view: EditorView): boolean {
  const { state } = view;
  const bookmarks = state.field(bookmarkState);
  if (bookmarks.size === 0) return false;
  const currentLine = state.doc.lineAt(state.selection.main.head).number;
  const target = nextBookmark(bookmarks, currentLine);
  if (target === -1) return false;
  const line = state.doc.line(target);
  view.dispatch({
    selection: { anchor: line.from },
    scrollIntoView: true,
    userEvent: 'bookmark.navigate',
  });
  return true;
}

/**
 * Move caret to the previous bookmarked line (wrapping).
 * Faithful to BookMarkDecorator::previousBookMarkBefore.
 * Keybinding: Shift+F2
 */
export function cmdPrevBookmark(view: EditorView): boolean {
  const { state } = view;
  const bookmarks = state.field(bookmarkState);
  if (bookmarks.size === 0) return false;
  const currentLine = state.doc.lineAt(state.selection.main.head).number;
  const target = prevBookmark(bookmarks, currentLine);
  if (target === -1) return false;
  const line = state.doc.line(target);
  view.dispatch({
    selection: { anchor: line.from },
    scrollIntoView: true,
    userEvent: 'bookmark.navigate',
  });
  return true;
}

/**
 * Clear all bookmarks.
 * Faithful to BookMarkDecorator::clearAllBookmarks.
 */
export function cmdClearBookmarks(view: EditorView): boolean {
  const bookmarks = view.state.field(bookmarkState);
  if (bookmarks.size === 0) return false;
  view.dispatch({ effects: setBookmarksEffect.of(new Set()) });
  return true;
}

/**
 * Invert bookmarks: toggle every line.
 * Faithful to NotepadNext "Invert Bookmarks".
 */
export function cmdInvertBookmarks(view: EditorView): boolean {
  const { state } = view;
  const bookmarks = state.field(bookmarkState);
  const lineCount = state.doc.lines;
  const inverted = invertBookmarks(bookmarks, lineCount);
  view.dispatch({ effects: setBookmarksEffect.of(inverted) });
  return true;
}

/**
 * Delete all bookmarked lines from the document.
 * Faithful to BookMarkDecorator::deleteBookMarkedLines.
 * Lines are deleted bottom-up to avoid position invalidation.
 */
export function cmdDeleteBookmarkedLines(view: EditorView): boolean {
  const { state } = view;
  const bookmarks = state.field(bookmarkState);
  if (bookmarks.size === 0) return false;

  // Sort descending so we delete from the bottom up (positions stay valid).
  const sorted = sortedBookmarks(bookmarks).reverse();
  const changes: Array<{ from: number; to: number; insert: string }> = [];

  for (const lineNo of sorted) {
    if (lineNo < 1 || lineNo > state.doc.lines) continue;
    const line = state.doc.line(lineNo);
    // Delete the entire line including its trailing newline (if not the last line).
    const from = line.from;
    const to = lineNo < state.doc.lines ? line.to + 1 : line.to;
    changes.push({ from, to, insert: '' });
  }

  if (changes.length === 0) return false;

  view.dispatch({
    changes,
    // Clear bookmarks after deletion.
    effects: setBookmarksEffect.of(new Set()),
    userEvent: 'bookmark.delete',
  });
  return true;
}

/**
 * Copy the text of all bookmarked lines to the clipboard.
 * Faithful to BookMarkDecorator::copyBookMarkedLines.
 * Uses the async Clipboard API; falls back to execCommand for environments
 * where the Clipboard API is unavailable.
 */
export function cmdCopyBookmarkedLines(view: EditorView): boolean {
  const { state } = view;
  const bookmarks = state.field(bookmarkState);
  if (bookmarks.size === 0) return false;
  const text = collectBookmarkedText(bookmarks, state.doc);
  if (!text) return false;

  // Try async Clipboard API first.
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    void navigator.clipboard.writeText(text);
  } else {
    // Fallback: create a transient textarea, copy, and remove.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  return true;
}

/**
 * Cut bookmarked lines: copy to clipboard then delete them.
 * Faithful to BookMarkDecorator::cutBookMarkedLines.
 */
export function cmdCutBookmarkedLines(view: EditorView): boolean {
  const { state } = view;
  const bookmarks = state.field(bookmarkState);
  if (bookmarks.size === 0) return false;
  // Copy first.
  cmdCopyBookmarkedLines(view);
  // Then delete.
  return cmdDeleteBookmarkedLines(view);
}

// ── Exported state getter (for testing / e2e) ──────────────────────────────────

/**
 * Get the current bookmarked line numbers from an EditorState.
 * Useful for tests that need to assert on the set without dispatching effects.
 */
export function getBookmarks(state: EditorState): Set<number> {
  return state.field(bookmarkState);
}

// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * edit-commands.ts — Pure text transforms + thin CM6 command wrappers.
 *
 * Design:
 *  - Pure transforms (exported for unit tests) take / return plain strings.
 *  - CM6 commands wrap those transforms operating on EditorView state.
 *  - Sort/dedup operate on the selected line range; fall back to whole doc.
 *  - Comment tokens come from luaRegistry via the caller-supplied getter.
 *
 * Faithful to NotepadNext source:
 *  - Sorter.cpp  : CaseSensitiveSorter, CaseInsensitiveSorter, LineLengthSorter,
 *                  ReverseSorter (stable_sort / std::reverse equivalents).
 *  - ScintillaNext.cpp: removeDuplicateLines, removeConsecutiveDuplicateLines.
 *  - MainWindow.cpp: all action → method wires, comment actions, EOL handling.
 */

import { EditorView } from '@codemirror/view';
import { moveLineUp, moveLineDown, copyLineDown } from '@codemirror/commands';

// Re-export the CM6 move/duplicate builtins so callers only need one import.
export { moveLineUp, moveLineDown, copyLineDown as duplicateCurrentLine };

// ── Pure text transforms ─────────────────────────────────────────────────────

/** Split text into lines (handles LF, CRLF, CR). */
export function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/);
}

/** Join lines with the given EOL sequence. */
export function joinLines(lines: string[], eol: string): string {
  return lines.join(eol);
}

// ── Sort transforms ──────────────────────────────────────────────────────────

/** Sort lines ascending, case-sensitive (stable). */
export function sortLinesAsc(text: string): string {
  const eol = detectEol(text);
  const lines = splitLines(text);
  const sorted = [...lines].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return joinLines(sorted, eol);
}

/** Sort lines ascending, case-insensitive (stable). */
export function sortLinesAscCaseInsensitive(text: string): string {
  const eol = detectEol(text);
  const lines = splitLines(text);
  const sorted = stableSort(lines, (a, b) =>
    a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0,
  );
  return joinLines(sorted, eol);
}

/** Sort lines ascending by length (stable). */
export function sortLinesByLengthAsc(text: string): string {
  const eol = detectEol(text);
  const lines = splitLines(text);
  const sorted = stableSort(lines, (a, b) => a.length - b.length);
  return joinLines(sorted, eol);
}

/** Sort lines descending, case-sensitive (stable). */
export function sortLinesDesc(text: string): string {
  const eol = detectEol(text);
  const lines = splitLines(text);
  const sorted = stableSort(lines, (a, b) => (a > b ? -1 : a < b ? 1 : 0));
  return joinLines(sorted, eol);
}

/** Sort lines descending, case-insensitive (stable). */
export function sortLinesDescCaseInsensitive(text: string): string {
  const eol = detectEol(text);
  const lines = splitLines(text);
  const sorted = stableSort(lines, (a, b) =>
    a.toLowerCase() > b.toLowerCase() ? -1 : a.toLowerCase() < b.toLowerCase() ? 1 : 0,
  );
  return joinLines(sorted, eol);
}

/** Sort lines descending by length (stable). */
export function sortLinesByLengthDesc(text: string): string {
  const eol = detectEol(text);
  const lines = splitLines(text);
  const sorted = stableSort(lines, (a, b) => b.length - a.length);
  return joinLines(sorted, eol);
}

/** Reverse the order of lines (faithful to ReverseSorter). */
export function reverseLineOrder(text: string): string {
  const eol = detectEol(text);
  const lines = splitLines(text);
  return joinLines([...lines].reverse(), eol);
}

// ── Dedup transforms ─────────────────────────────────────────────────────────

/**
 * Remove all duplicate lines, keeping the first occurrence.
 * Faithful to ScintillaNext::removeDuplicateLines (ByteArrayUtils::removeDuplicates).
 */
export function removeDuplicateLines(text: string): string {
  const eol = detectEol(text);
  const lines = splitLines(text);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    if (!seen.has(line)) {
      seen.add(line);
      result.push(line);
    }
  }
  return joinLines(result, eol);
}

/**
 * Remove consecutive duplicate lines.
 * Faithful to ScintillaNext::removeConsecutiveDuplicateLines
 * (ByteArrayUtils::removeConsecutiveDuplicates).
 */
export function removeConsecutiveDuplicateLines(text: string): string {
  const eol = detectEol(text);
  const lines = splitLines(text);
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i === 0 || lines[i] !== lines[i - 1]) {
      result.push(lines[i]!);
    }
  }
  return joinLines(result, eol);
}

/**
 * Remove empty lines.
 * Faithful to MainWindow.cpp removeEmptyLines (regex \R\R+ → eol,
 * plus deleteLeadingEmptyLines / deleteTrailingEmptyLines).
 */
export function removeEmptyLines(text: string): string {
  const eol = detectEol(text);
  const lines = splitLines(text);
  const nonEmpty = lines.filter((l) => l.trim() !== '');
  return joinLines(nonEmpty, eol);
}

// ── Case transforms ──────────────────────────────────────────────────────────

/** Convert text to UPPER CASE. */
export function toUpperCase(text: string): string {
  return text.toUpperCase();
}

/** Convert text to lower case. */
export function toLowerCase(text: string): string {
  return text.toLowerCase();
}

// ── EOL conversion ───────────────────────────────────────────────────────────

/** Normalise all line endings in text to CRLF (Windows). */
export function applyEolCRLF(text: string): string {
  return text.replace(/\r\n|\r|\n/g, '\r\n');
}

/** Normalise all line endings in text to LF (Unix). */
export function applyEolLF(text: string): string {
  return text.replace(/\r\n|\r|\n/g, '\n');
}

/** Normalise all line endings in text to CR (Macintosh). */
export function applyEolCR(text: string): string {
  return text.replace(/\r\n|\r|\n/g, '\r');
}

// ── Join / Split Lines ────────────────────────────────────────────────────────

/**
 * Join selected lines: replace each line break in the range with a single space.
 * Faithful to ScintillaNext::linesJoin() via targetFromSelection().
 */
export function joinSelectedLines(text: string): string {
  // Replace every line break (and surrounding whitespace) with a single space.
  return text.replace(/(\r\n|\r|\n)[ \t]*/g, ' ');
}

/**
 * Split lines at word-wrap width (currently: split at each newline's embedded
 * soft-space where the word wrap would break).  Since CM6 does not expose a
 * pixel-based word-wrap position, this faithful port uses a heuristic:
 * Notepad++ calls linesSplit(0) which splits at the current viewport width.
 * We implement it as a no-op / identity for the moment and note that the
 * menu item is wired but the transform is a no-op when no wrap width is known.
 * The command wrapper operates on the selection.
 */
export function splitAtWrapWidth(text: string): string {
  // No visible wrap width available in a pure transform — return as-is.
  return text;
}

// ── Comment / Uncomment ──────────────────────────────────────────────────────

/**
 * Return the index of the first non-whitespace character in line,
 * or -1 if the line is pure whitespace / empty.
 * Mirrors ScintillaNext::lineIndentPosition() behaviour.
 */
function indentPos(line: string): number {
  const m = /\S/.exec(line);
  return m ? m.index : -1;
}

/**
 * Test whether a line is already commented at its indent position.
 * Strips the trailing space from the token when checking so that
 * `'  // code'` matches both `'//'` and `'// '` tokens.
 * Mirrors the ScintillaCommenter comparison:
 *   commentText == languageSingleLineComment
 */
function lineIsCommented(line: string, token: string): boolean {
  const pos = indentPos(line);
  if (pos === -1) return false; // pure-whitespace → never considered commented
  const tokenTrim = token.trimEnd();
  return line.startsWith(token, pos) || line.startsWith(tokenTrim, pos);
}

/**
 * Insert the comment token at the indent position (after leading whitespace).
 * `'  code'` + `'// '` → `'  // code'`
 */
function insertTokenAtIndent(line: string, token: string): string {
  const pos = indentPos(line);
  if (pos === -1) return line; // skip pure-whitespace lines (faithful to commentLine)
  return line.slice(0, pos) + token + line.slice(pos);
}

/**
 * Remove the comment token from the indent position of a line.
 * Strips the token whether or not the trailing space is present.
 */
function removeTokenAtIndent(line: string, token: string): string {
  const pos = indentPos(line);
  if (pos === -1) return line;
  const tokenTrim = token.trimEnd();
  if (line.startsWith(token, pos)) {
    return line.slice(0, pos) + line.slice(pos + token.length);
  }
  if (line.startsWith(tokenTrim, pos)) {
    return line.slice(0, pos) + line.slice(pos + tokenTrim.length);
  }
  return line;
}

/**
 * Add a comment token at the indent position of each non-blank line.
 * Pure-whitespace / empty lines are skipped (faithful to ScintillaCommenter::commentLine).
 */
export function addLineComment(text: string, token: string): string {
  const eol = detectEol(text);
  return splitLines(text)
    .map((l) => insertTokenAtIndent(l, token))
    .join(eol);
}

/**
 * Remove the comment token from the indent position of each line that has it.
 * Lines that are not commented are left unchanged.
 * Faithful to ScintillaCommenter::uncommentLine.
 */
export function removeLineComment(text: string, token: string): string {
  const eol = detectEol(text);
  return splitLines(text)
    .map((l) => (lineIsCommented(l, token) ? removeTokenAtIndent(l, token) : l))
    .join(eol);
}

/**
 * Toggle line comment PER LINE, independently (ScintillaCommenter::toggleLine).
 * For each line: if its first non-whitespace content starts with the token →
 * remove it; else → add it.  Pure-whitespace / empty lines are skipped on add.
 */
export function toggleLineComment(text: string, token: string): string {
  const eol = detectEol(text);
  return splitLines(text)
    .map((l) => {
      if (lineIsCommented(l, token)) {
        return removeTokenAtIndent(l, token);
      }
      return insertTokenAtIndent(l, token);
    })
    .join(eol);
}

// ── Encoding / Decoding ──────────────────────────────────────────────────────

/** Base64-encode UTF-8 text. Uses btoa(unescape(encodeURIComponent())) for full UTF-8 safety. */
export function base64Encode(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}

/** Base64-decode to UTF-8 text. */
export function base64Decode(text: string): string {
  try {
    return decodeURIComponent(escape(atob(text.trim())));
  } catch {
    return text; // Return unchanged on invalid input (faithful: no-op on bad input).
  }
}

/** URL-encode (percent-encode) text using encodeURIComponent. */
export function urlEncode(text: string): string {
  return encodeURIComponent(text);
}

/** URL-decode text using decodeURIComponent. */
export function urlDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text; // Return unchanged on invalid encoding.
  }
}

// ── CM6 command helpers ──────────────────────────────────────────────────────

/**
 * Get the text of the primary selection, or the full document text if nothing
 * is selected. Returns { text, from, to } — `from`/`to` are byte offsets into
 * the EditorState doc.
 */
function getSelectionOrDoc(view: EditorView): { text: string; from: number; to: number } {
  const { state } = view;
  const sel = state.selection.main;
  if (sel.empty) {
    // No selection → whole document.
    return { text: state.doc.toString(), from: 0, to: state.doc.length };
  }
  return { text: state.sliceDoc(sel.from, sel.to), from: sel.from, to: sel.to };
}

/**
 * Expand selection to cover whole lines (from start of first selected line to
 * end of last selected line, including its newline if not at doc end).
 * Used by sort/dedup/reverse which must operate on complete lines.
 */
function getLineRange(view: EditorView): { text: string; from: number; to: number } {
  const { state } = view;
  const sel = state.selection.main;
  if (sel.empty) {
    // No selection → whole document.
    return { text: state.doc.toString(), from: 0, to: state.doc.length };
  }
  const fromLine = state.doc.lineAt(sel.from);
  const toLine = state.doc.lineAt(sel.to);
  const from = fromLine.from;
  // Include the line's content but NOT its trailing newline so we can re-join
  // with the doc's own EOL detection.  (The trailing newline after the last
  // selected line is preserved by replacing only `from..to` without it.)
  const to = toLine.to;
  return { text: state.sliceDoc(from, to), from, to };
}

/**
 * Apply a text transform to the current selection (or whole doc if empty),
 * dispatch as a single transaction, and return true if a change was made.
 */
function applyTransformToSelection(view: EditorView, transform: (text: string) => string): boolean {
  const { text, from, to } = getSelectionOrDoc(view);
  const result = transform(text);
  if (result === text) return false;
  view.dispatch({
    changes: { from, to, insert: result },
    userEvent: 'edit-command',
  });
  return true;
}

/**
 * Apply a text transform to the current LINE RANGE (expanded to full lines),
 * dispatch as a single transaction.
 */
function applyTransformToLineRange(view: EditorView, transform: (text: string) => string): boolean {
  const { text, from, to } = getLineRange(view);
  const result = transform(text);
  if (result === text) return false;
  view.dispatch({
    changes: { from, to, insert: result },
    userEvent: 'edit-command',
  });
  return true;
}

// ── CM6 commands: Sort ───────────────────────────────────────────────────────

export const cmdSortLinesAsc = (view: EditorView): boolean =>
  applyTransformToLineRange(view, sortLinesAsc);

export const cmdSortLinesAscCI = (view: EditorView): boolean =>
  applyTransformToLineRange(view, sortLinesAscCaseInsensitive);

export const cmdSortLinesByLengthAsc = (view: EditorView): boolean =>
  applyTransformToLineRange(view, sortLinesByLengthAsc);

export const cmdSortLinesDesc = (view: EditorView): boolean =>
  applyTransformToLineRange(view, sortLinesDesc);

export const cmdSortLinesDescCI = (view: EditorView): boolean =>
  applyTransformToLineRange(view, sortLinesDescCaseInsensitive);

export const cmdSortLinesByLengthDesc = (view: EditorView): boolean =>
  applyTransformToLineRange(view, sortLinesByLengthDesc);

export const cmdReverseLineOrder = (view: EditorView): boolean =>
  applyTransformToLineRange(view, reverseLineOrder);

// ── CM6 commands: Dedup / remove ────────────────────────────────────────────

export const cmdRemoveDuplicateLines = (view: EditorView): boolean =>
  applyTransformToLineRange(view, removeDuplicateLines);

export const cmdRemoveConsecutiveDuplicateLines = (view: EditorView): boolean =>
  applyTransformToLineRange(view, removeConsecutiveDuplicateLines);

export const cmdRemoveEmptyLines = (view: EditorView): boolean =>
  applyTransformToLineRange(view, removeEmptyLines);

// ── CM6 commands: Join / Split ────────────────────────────────────────────────

export const cmdJoinLines = (view: EditorView): boolean =>
  applyTransformToSelection(view, joinSelectedLines);

/**
 * Split lines — currently a no-op because CM6 doesn't expose a viewport pixel
 * width for word-wrap splitting.  The menu item is wired but does nothing.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const cmdSplitLines = (_view: EditorView): boolean => false;

// ── CM6 commands: Convert Case ────────────────────────────────────────────────

export const cmdToUpperCase = (view: EditorView): boolean =>
  applyTransformToSelection(view, toUpperCase);

export const cmdToLowerCase = (view: EditorView): boolean =>
  applyTransformToSelection(view, toLowerCase);

// ── CM6 commands: EOL Conversion ──────────────────────────────────────────────

/**
 * Replace the entire document's line endings with CRLF and update
 * doc.eol in the store via the provided setter.
 */
export function makeEolCommand(
  eolValue: 'lf' | 'crlf' | 'cr',
  setter: () => void,
): (view: EditorView) => boolean {
  return (view: EditorView): boolean => {
    const text = view.state.doc.toString();
    let result: string;
    if (eolValue === 'crlf') result = applyEolCRLF(text);
    else if (eolValue === 'cr') result = applyEolCR(text);
    else result = applyEolLF(text);

    // No-op if text is already in the target EOL (M-4 guard).
    if (result === text) return false;

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: result },
      userEvent: 'edit-command',
    });
    setter();
    return true;
  };
}

// ── CM6 commands: Comment/Uncomment ───────────────────────────────────────────

/**
 * Build comment commands bound to a specific single-line comment token.
 * Pass a `getToken` function (called at command invocation time) so the active
 * document's language is used, not the language at command-creation time.
 */
export function makeCommentCommands(getToken: () => string | undefined): {
  toggle: (view: EditorView) => boolean;
  add: (view: EditorView) => boolean;
  remove: (view: EditorView) => boolean;
} {
  const withToken =
    (fn: (text: string, token: string) => string) =>
    (view: EditorView): boolean => {
      const token = getToken();
      if (!token) return false; // Language has no single-line comment → no-op.
      return applyTransformToSelection(view, (text) => fn(text, token));
    };

  return {
    toggle: withToken(toggleLineComment),
    add: withToken(addLineComment),
    remove: withToken(removeLineComment),
  };
}

// ── CM6 commands: Encoding / Decoding ────────────────────────────────────────

export const cmdBase64Encode = (view: EditorView): boolean =>
  applyTransformToSelection(view, base64Encode);

export const cmdBase64Decode = (view: EditorView): boolean =>
  applyTransformToSelection(view, base64Decode);

export const cmdUrlEncode = (view: EditorView): boolean =>
  applyTransformToSelection(view, urlEncode);

export const cmdUrlDecode = (view: EditorView): boolean =>
  applyTransformToSelection(view, urlDecode);

// ── Indent ──────────────────────────────────────────────────────────────────
// Re-export CM6 indent commands so the menu can use a single import.
export { indentMore, indentLess } from '@codemirror/commands';

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Detect the dominant EOL in a string (CRLF wins over bare CR/LF). */
function detectEol(text: string): string {
  if (text.includes('\r\n')) return '\r\n';
  if (text.includes('\r')) return '\r';
  return '\n';
}

/**
 * Stable sort a copy of `arr` using a comparator.
 * Array.prototype.sort is stable in V8/Node since v12 but we make it explicit.
 */
function stableSort<T>(arr: T[], cmp: (a: T, b: T) => number): T[] {
  return arr
    .map((v, i) => ({ v, i }))
    .sort((a, b) => cmp(a.v, b.v) || a.i - b.i)
    .map(({ v }) => v);
}

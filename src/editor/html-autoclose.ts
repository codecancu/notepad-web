// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * html-autoclose.ts — HTML tag auto-close, faithful to NotepadNext HTMLAutoCompleteDecorator.
 *
 * When the user types `>` to close an HTML opening tag, automatically inserts the
 * matching `</tag>` with the caret left between them (`<div>|</div>`).
 *
 * Faithful to HTMLAutoCompleteDecorator.cpp:
 *  - MAX_TAG_NAME_LENGTH = 64
 *  - MAX_TAG_LENGTH = 1024
 *  - Void tags (no closing tag): area base br col embed hr img input link meta source track wbr
 *  - Gate: HTML documents only (language facet name === 'html')
 *  - Trigger: inputHandler on typed `>`; scans backward to find the opening `<`
 *  - Skip: comment ends (-), self-closing (/), closing tags (/), PI (?), doctype/comment (!)
 *
 * Known deviations from source (acceptable per task brief):
 *  - Undo granularity: source inserts `</tag>` as a separate UndoAction; this implementation
 *    uses a single transaction so a single undo removes both `>` and `</tag>`.
 *  - Inside embedded script/style guard (cpp:45 SCE_HJ_START check) is omitted; typing `>`
 *    inside a `<script>` block will still trigger auto-close.
 */

import { EditorView } from '@codemirror/view';
import { language } from '@codemirror/language';
import type { Extension } from '@codemirror/state';

// ── Constants (faithful to cpp:23–26) ────────────────────────────────────────

export const MAX_TAG_NAME_LENGTH = 64;
export const MAX_TAG_LENGTH = 1024;

/**
 * Void HTML tags that must not be auto-closed.
 * Case-insensitive: always compare against `name.toLowerCase()`.
 * Faithful to HTMLAutoCompleteDecorator.cpp:24.
 */
export const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

// ── Pure helper ────────────────────────────────────────────────────────────────

/**
 * Decide whether to auto-close an HTML tag when the user types `>` at `insertPos`.
 *
 * Operates on the document text **before** `>` is inserted (i.e. `docText` is the
 * pre-insertion content and `insertPos` is where `>` will land).
 *
 * Returns the tag name to auto-close (e.g. `"div"`) or `null` to not close.
 *
 * Faithful to HTMLAutoCompleteDecorator::charAdded (cpp:38–90).
 *
 * @param docText   Full document text before `>` is inserted.
 * @param insertPos Position (0-based) where `>` will be inserted.
 */
export function computeCloseTag(docText: string, insertPos: number): string | null {
  // Step 1: beforePos = insertPos - 1; guard against empty doc.
  const beforePos = insertPos - 1;
  if (beforePos < 0) return null;

  // Step 2: inspect the char immediately before `>`.
  const beforeChar = docText[beforePos];
  if (beforeChar === '-') return null; // --> comment end
  if (beforeChar === '/') return null; // <tag/> self-closing

  // Step 3: scan backward from beforePos to find `<`, at most MAX_TAG_LENGTH chars.
  // Track nameEnd: whenever we see whitespace we set nameEnd = scan position,
  // so the tag name runs from just after `<` to the first whitespace after `<`.
  let tagOpen = -1;
  let nameEnd = insertPos;
  const minScan = Math.max(0, insertPos - MAX_TAG_LENGTH);
  for (let scan = beforePos; scan >= minScan; scan--) {
    const c = docText[scan];
    if (c !== undefined && /\s/.test(c)) nameEnd = scan;
    if (c === '<') {
      tagOpen = scan;
      break;
    }
  }
  if (tagOpen === -1) return null;

  // Step 4: validate tag name length.
  const nameStart = tagOpen + 1;
  if (nameEnd - nameStart >= MAX_TAG_NAME_LENGTH) return null;

  // Step 5: extract and validate the tag name.
  const name = docText.slice(nameStart, nameEnd);
  if (name.length === 0) return null; // `<>`
  if (name[0] === '/') return null; // `</div>` — closing tag
  if (name[0] === '?') return null; // `<?php`
  if (name[0] === '!') return null; // `<!--`, `<!doctype`
  if (VOID_TAGS.has(name.toLowerCase())) return null;

  return name;
}

// ── Extension ─────────────────────────────────────────────────────────────────

/**
 * CM6 inputHandler extension that auto-closes HTML tags when the user types `>`.
 *
 * Gated on the active language facet (`lang?.name === 'html'`) so it only fires
 * in HTML documents. Auto-tracks Language-menu switches with no controller changes.
 *
 * Faithful to HTMLAutoCompleteDecorator::charAdded (cpp:38–90).
 */
export const htmlAutoCloseExtension: Extension = EditorView.inputHandler.of(
  (view: EditorView, from: number, to: number, text: string): boolean => {
    // Only act on `>`.
    if (text !== '>') return false;

    // Gate: HTML documents only.
    const lang = view.state.facet(language);
    if (lang?.name !== 'html') return false;

    // Compute the tag to close using the pre-insertion document.
    const docText = view.state.doc.toString();
    const tagName = computeCloseTag(docText, from);
    if (tagName === null) return false;

    // Insert `>` + `</tagName>`, leaving caret right after `>` (between the tags).
    view.dispatch({
      changes: { from, to, insert: '>' + `</${tagName}>` },
      selection: { anchor: from + 1 }, // caret right after the typed '>'
      userEvent: 'input.type',
    });
    return true;
  },
);

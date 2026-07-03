// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * word-completion — document-word autocompletion source for CodeMirror 6.
 *
 * Faithful mapping of NotepadNext's AutoCompletion decorator:
 *   AutoCompletion uses Scintilla's built-in word-list from the current document.
 *   We replicate this by scanning the CM6 document text for unique words that
 *   share the current prefix, matching the same behaviour.
 *
 * The source is a pure function of the CompletionContext so it can be unit-tested
 * without a live EditorView.
 */

import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';

/** Minimum word length to include in completions (mirrors Scintilla default = 4 chars). */
const MIN_WORD_LEN = 4;

/** Maximum number of words to scan before stopping (perf guard for huge docs). */
const MAX_SCAN_WORDS = 5000;

/**
 * Extract unique words from `text` that start with `prefix` (case-sensitive).
 * Excludes the prefix itself if it appears as an exact match (avoids completing
 * a word with itself when the caret is at the end of the word).
 *
 * This is a pure function — fully unit-testable without DOM.
 */
export function extractDocWords(text: string, prefix: string): string[] {
  if (!prefix) return [];
  const re = /[A-Za-z_$][\w$]*/g;
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  let count = 0;
  while ((match = re.exec(text)) !== null) {
    const word = match[0];
    if (++count > MAX_SCAN_WORDS) break;
    if (word.length < MIN_WORD_LEN) continue;
    if (word === prefix) continue; // don't complete with the exact current word
    if (word.startsWith(prefix)) seen.add(word);
  }
  return Array.from(seen).sort();
}

/**
 * CM6 CompletionSource that suggests words already present in the document.
 * Faithful to NotepadNext's AutoCompletion which offers words from the current
 * document buffer (not a static dictionary).
 */
export function wordCompletionSource(context: CompletionContext): CompletionResult | null {
  // Match an identifier-like prefix at the cursor.
  const word = context.matchBefore(/[A-Za-z_$][\w$]*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;

  const prefix = word.text;
  const docText = context.state.doc.toString();
  const words = extractDocWords(docText, prefix);

  if (words.length === 0) return null;

  return {
    from: word.from,
    options: words.map((w) => ({ label: w, type: 'text' })),
    validFor: /^[\w$]*$/,
  };
}

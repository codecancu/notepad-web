// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * search-engine.ts — pure cross-document search engine.
 *
 * Faithful port of NotepadNext's Finder + SearchResultsCollector:
 *  - Uses @codemirror/search `SearchQuery` + `getCursor(Text)` for regex/case/word matching.
 *  - Non-overlapping matches (faithful to Finder.forEachMatch).
 *  - Per-line hit collapsing (faithful to SearchResultsCollector).
 *  - Open-docs-only (no FSA directory walk — explicitly out of scope per source + user decision).
 *  - 1-based line numbers (faithful to SearchResultsDock).
 */

import { SearchQuery } from '@codemirror/search';
import { Text } from '@codemirror/state';

export interface SearchOptions {
  matchCase: boolean;
  wholeWord: boolean;
  regexp: boolean;
}

/**
 * One matching LINE (multi hits on a line collapsed), faithful to SearchResultsCollector.
 * startCol/endCol = FIRST match's columns on the line (0-based offsets within the line).
 * hitCount = total number of matches on this line.
 */
export interface ResultLine {
  lineNo: number;
  lineText: string;
  startCol: number;
  endCol: number;
  hitCount: number;
}

/** All matching lines within one document. */
export interface FileResult {
  docId: string;
  name: string;
  hitCount: number;
  lines: ResultLine[];
}

/** A whole search run across N docs. */
export interface SearchRun {
  term: string;
  options: SearchOptions;
  totalHits: number;
  fileCount: number;
  files: FileResult[];
}

/**
 * Iterate all NON-overlapping matches of `term` in `text` (faithful to Finder.forEachMatch).
 *
 * Returns [] for:
 *  - empty term
 *  - invalid regex (caught, never throws)
 *  - `!q.valid` (SearchQuery considers it invalid)
 */
export function findMatches(
  text: Text,
  term: string,
  opts: SearchOptions,
): { from: number; to: number }[] {
  if (!term) return [];

  let q: SearchQuery;
  try {
    q = new SearchQuery({
      search: term,
      caseSensitive: opts.matchCase,
      regexp: opts.regexp,
      wholeWord: opts.wholeWord,
    });
  } catch {
    return [];
  }

  if (!q.valid) return [];

  const results: { from: number; to: number }[] = [];
  try {
    const cursor = q.getCursor(text);
    for (let it = cursor.next(); !it.done; it = cursor.next()) {
      results.push({ from: it.value.from, to: it.value.to });
    }
  } catch {
    // Defensive: treat any runtime error as no matches.
    return [];
  }

  return results;
}

/**
 * Find all matches across the given docs (faithful to findAllInDocuments — OPEN DOCS ONLY).
 * Collapses multiple hits on the same line into one ResultLine with aggregated hitCount,
 * keeping the FIRST match's startCol/endCol (faithful to SearchResultsCollector).
 */
export function findInDocs(
  docs: { id: string; name: string; content: string }[],
  term: string,
  opts: SearchOptions,
): SearchRun {
  const files: FileResult[] = [];
  let totalHits = 0;

  for (const doc of docs) {
    // Normalize CRLF → LF before building the search Text so line offsets match
    // the live EditorView, which uses EditorState.create() and normalizes CRLF→LF.
    // Without normalization, Text.of(content.split('\n')) retains trailing '\r'
    // on each line, causing line numbers and column offsets to diverge from the
    // live view's doc for CRLF documents.
    const normalized = doc.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const text = Text.of(normalized.split('\n'));
    const matches = findMatches(text, term, opts);

    if (matches.length === 0) continue;

    // Collapse matches by line number.
    // Map: lineNo (1-based) → ResultLine (first hit's position stored).
    const lineMap = new Map<number, ResultLine>();
    const lineOrder: number[] = [];

    for (const { from, to } of matches) {
      const line = text.lineAt(from);
      const lineNo = line.number; // 1-based
      const startCol = from - line.from;
      const endCol = to - line.from;

      if (!lineMap.has(lineNo)) {
        lineMap.set(lineNo, {
          lineNo,
          lineText: line.text,
          startCol,
          endCol,
          hitCount: 1,
        });
        lineOrder.push(lineNo);
      } else {
        // Collapse: increment hitCount; keep first match's position.
        lineMap.get(lineNo)!.hitCount++;
      }
    }

    const lines = lineOrder.map((n) => lineMap.get(n)!);
    const hitCount = matches.length;
    totalHits += hitCount;

    files.push({
      docId: doc.id,
      name: doc.name,
      hitCount,
      lines,
    });
  }

  return {
    term,
    options: opts,
    totalHits,
    fileCount: files.length,
    files,
  };
}

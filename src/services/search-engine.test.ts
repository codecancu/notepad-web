// SPDX-License-Identifier: GPL-3.0-or-later
import { Text } from '@codemirror/state';
import { findMatches, findInDocs } from './search-engine';
import type { SearchOptions } from './search-engine';

const DEFAULT_OPTS: SearchOptions = { matchCase: false, wholeWord: false, regexp: false };

// ── findMatches ───────────────────────────────────────────────────────────────

describe('findMatches', () => {
  it('returns [] for empty term', () => {
    const text = Text.of(['hello world']);
    expect(findMatches(text, '', DEFAULT_OPTS)).toEqual([]);
  });

  it('finds plain text (case-insensitive by default)', () => {
    const text = Text.of(['Hello World']);
    const matches = findMatches(text, 'hello', DEFAULT_OPTS);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({ from: 0, to: 5 });
  });

  it('matchCase=true — no match when case differs', () => {
    const text = Text.of(['Hello World']);
    const matches = findMatches(text, 'hello', { ...DEFAULT_OPTS, matchCase: true });
    expect(matches).toHaveLength(0);
  });

  it('matchCase=true — matches when case matches', () => {
    const text = Text.of(['Hello World']);
    const matches = findMatches(text, 'Hello', { ...DEFAULT_OPTS, matchCase: true });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({ from: 0, to: 5 });
  });

  it('wholeWord=true — excludes substrings', () => {
    const text = Text.of(['football is a sport']);
    // "foot" is a substring of "football", wholeWord=true should not match
    const matches = findMatches(text, 'foot', { ...DEFAULT_OPTS, wholeWord: true });
    expect(matches).toHaveLength(0);
  });

  it('wholeWord=true — matches whole word', () => {
    const text = Text.of(['foot and football']);
    const matches = findMatches(text, 'foot', { ...DEFAULT_OPTS, wholeWord: true });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({ from: 0, to: 4 });
  });

  it('regexp mode — matches regex pattern', () => {
    const text = Text.of(['abc 123 def 456']);
    const matches = findMatches(text, '\\d+', { ...DEFAULT_OPTS, regexp: true });
    expect(matches).toHaveLength(2);
    expect(matches[0]).toEqual({ from: 4, to: 7 });
    expect(matches[1]).toEqual({ from: 12, to: 15 });
  });

  it('invalid regex — returns [] without throwing', () => {
    const text = Text.of(['some text']);
    expect(() => findMatches(text, '[invalid(', { ...DEFAULT_OPTS, regexp: true })).not.toThrow();
    expect(findMatches(text, '[invalid(', { ...DEFAULT_OPTS, regexp: true })).toEqual([]);
  });

  it('non-overlapping: "aa" in "aaaa" → 2 matches at [0,2],[2,4]', () => {
    const text = Text.of(['aaaa']);
    const matches = findMatches(text, 'aa', DEFAULT_OPTS);
    expect(matches).toHaveLength(2);
    expect(matches[0]).toEqual({ from: 0, to: 2 });
    expect(matches[1]).toEqual({ from: 2, to: 4 });
  });

  it('multi-line document — finds matches across multiple lines', () => {
    const text = Text.of(['foo', 'bar foo', 'baz']);
    const matches = findMatches(text, 'foo', DEFAULT_OPTS);
    expect(matches).toHaveLength(2);
    // First match on line 1 at positions 0-3
    expect(matches[0]).toEqual({ from: 0, to: 3 });
    // Second match on line 2 "bar foo"; line 2 starts at position 4 ('foo\n' = 4 chars)
    // "bar foo": 'foo' is at offset 4 within line 2, so absolute position = 4 + 4 = 8
    expect(matches[1]).toEqual({ from: 8, to: 11 });
  });

  it('returns [] when term not found', () => {
    const text = Text.of(['hello world']);
    expect(findMatches(text, 'xyz', DEFAULT_OPTS)).toEqual([]);
  });
});

// ── findInDocs ────────────────────────────────────────────────────────────────

describe('findInDocs', () => {
  it('returns empty SearchRun for empty doc list', () => {
    const run = findInDocs([], 'foo', DEFAULT_OPTS);
    expect(run.totalHits).toBe(0);
    expect(run.fileCount).toBe(0);
    expect(run.files).toHaveLength(0);
    expect(run.term).toBe('foo');
  });

  it('excludes docs with 0 hits', () => {
    const docs = [
      { id: '1', name: 'a.txt', content: 'hello world' },
      { id: '2', name: 'b.txt', content: 'no match here' },
    ];
    const run = findInDocs(docs, 'hello', DEFAULT_OPTS);
    expect(run.fileCount).toBe(1);
    expect(run.files[0]?.docId).toBe('1');
  });

  it('counts totalHits + fileCount correctly across multiple docs', () => {
    const docs = [
      { id: '1', name: 'a.txt', content: 'foo foo' },
      { id: '2', name: 'b.txt', content: 'foo bar foo baz foo' },
    ];
    const run = findInDocs(docs, 'foo', DEFAULT_OPTS);
    expect(run.fileCount).toBe(2);
    expect(run.totalHits).toBe(5); // 2 + 3
  });

  it('per-line collapsing: line with 2 hits → one ResultLine with hitCount=2', () => {
    const docs = [{ id: '1', name: 'a.txt', content: 'foo bar foo' }];
    const run = findInDocs(docs, 'foo', DEFAULT_OPTS);
    expect(run.files).toHaveLength(1);
    expect(run.files[0]!.lines).toHaveLength(1);
    expect(run.files[0]!.lines[0]!.hitCount).toBe(2);
    // fileResult.hitCount is total hits (2), not lines
    expect(run.files[0]!.hitCount).toBe(2);
  });

  it('first hit position stored on collapsed line (startCol/endCol of first match)', () => {
    const docs = [{ id: '1', name: 'a.txt', content: 'aa bb aa' }];
    const run = findInDocs(docs, 'aa', DEFAULT_OPTS);
    const resultLine = run.files[0]!.lines[0]!;
    expect(resultLine.startCol).toBe(0);
    expect(resultLine.endCol).toBe(2);
    expect(resultLine.hitCount).toBe(2);
  });

  it('correct lineNo (1-based) and lineText', () => {
    const docs = [
      {
        id: '1',
        name: 'a.txt',
        content: 'line one\nline two has foo\nline three',
      },
    ];
    const run = findInDocs(docs, 'foo', DEFAULT_OPTS);
    expect(run.files[0]!.lines).toHaveLength(1);
    const rl = run.files[0]!.lines[0]!;
    expect(rl.lineNo).toBe(2); // 1-based, second line
    expect(rl.lineText).toBe('line two has foo');
  });

  it('multiple lines each with hits produce separate ResultLines', () => {
    const docs = [
      {
        id: '1',
        name: 'a.txt',
        content: 'foo on line one\nfoo on line two\nnone here',
      },
    ];
    const run = findInDocs(docs, 'foo', DEFAULT_OPTS);
    expect(run.files[0]!.lines).toHaveLength(2);
    expect(run.files[0]!.lines[0]!.lineNo).toBe(1);
    expect(run.files[0]!.lines[1]!.lineNo).toBe(2);
  });

  it('empty term → empty SearchRun', () => {
    const docs = [{ id: '1', name: 'a.txt', content: 'hello' }];
    const run = findInDocs(docs, '', DEFAULT_OPTS);
    expect(run.totalHits).toBe(0);
    expect(run.fileCount).toBe(0);
  });

  it('preserves doc id and name in FileResult', () => {
    const docs = [{ id: 'doc-abc', name: 'myfile.ts', content: 'target word here' }];
    const run = findInDocs(docs, 'target', DEFAULT_OPTS);
    expect(run.files[0]!.docId).toBe('doc-abc');
    expect(run.files[0]!.name).toBe('myfile.ts');
  });
});

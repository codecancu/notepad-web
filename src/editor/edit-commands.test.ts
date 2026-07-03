// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from 'vitest';
import {
  sortLinesAsc,
  sortLinesAscCaseInsensitive,
  sortLinesByLengthAsc,
  sortLinesDesc,
  sortLinesDescCaseInsensitive,
  sortLinesByLengthDesc,
  reverseLineOrder,
  removeDuplicateLines,
  removeConsecutiveDuplicateLines,
  removeEmptyLines,
  joinSelectedLines,
  toUpperCase,
  toLowerCase,
  applyEolCRLF,
  applyEolLF,
  applyEolCR,
  base64Encode,
  base64Decode,
  urlEncode,
  urlDecode,
  addLineComment,
  removeLineComment,
  toggleLineComment,
} from './edit-commands';

// ── Sort ─────────────────────────────────────────────────────────────────────

describe('sortLinesAsc', () => {
  it('sorts lines ascending, case-sensitive', () => {
    expect(sortLinesAsc('banana\napple\ncherry')).toBe('apple\nbanana\ncherry');
  });

  it('is stable (preserves relative order of equal lines)', () => {
    expect(sortLinesAsc('b\na\nb')).toBe('a\nb\nb');
  });

  it('handles a single line (no-op)', () => {
    expect(sortLinesAsc('hello')).toBe('hello');
  });

  it('preserves CRLF EOL', () => {
    expect(sortLinesAsc('b\r\na\r\nc')).toBe('a\r\nb\r\nc');
  });

  it('uppercase comes before lowercase (ASCII order)', () => {
    // 'A' (65) < 'a' (97)
    expect(sortLinesAsc('apple\nApple')).toBe('Apple\napple');
  });
});

describe('sortLinesAscCaseInsensitive', () => {
  it('sorts case-insensitively ascending', () => {
    expect(sortLinesAscCaseInsensitive('Banana\napple\nCherry')).toBe('apple\nBanana\nCherry');
  });

  it('is stable', () => {
    // Both 'Apple' and 'apple' are equal case-insensitively; original order preserved.
    const result = sortLinesAscCaseInsensitive('apple\nApple');
    expect(result).toBe('apple\nApple');
  });
});

describe('sortLinesByLengthAsc', () => {
  it('sorts by line length ascending', () => {
    expect(sortLinesByLengthAsc('bbb\na\ncc')).toBe('a\ncc\nbbb');
  });

  it('is stable for equal lengths', () => {
    expect(sortLinesByLengthAsc('ab\ncd\nef')).toBe('ab\ncd\nef');
  });
});

describe('sortLinesDesc', () => {
  it('sorts lines descending, case-sensitive', () => {
    expect(sortLinesDesc('apple\nbanana\ncherry')).toBe('cherry\nbanana\napple');
  });
});

describe('sortLinesDescCaseInsensitive', () => {
  it('sorts case-insensitively descending', () => {
    expect(sortLinesDescCaseInsensitive('Apple\nbanana\nCherry')).toBe('Cherry\nbanana\nApple');
  });
});

describe('sortLinesByLengthDesc', () => {
  it('sorts by line length descending', () => {
    expect(sortLinesByLengthDesc('a\nbb\nccc')).toBe('ccc\nbb\na');
  });
});

describe('reverseLineOrder', () => {
  it('reverses the order of lines', () => {
    expect(reverseLineOrder('a\nb\nc')).toBe('c\nb\na');
  });

  it('preserves CRLF EOL', () => {
    expect(reverseLineOrder('1\r\n2\r\n3')).toBe('3\r\n2\r\n1');
  });

  it('single line is identity', () => {
    expect(reverseLineOrder('only')).toBe('only');
  });
});

// ── Dedup ─────────────────────────────────────────────────────────────────────

describe('removeDuplicateLines', () => {
  it('removes all duplicate lines keeping first occurrence', () => {
    expect(removeDuplicateLines('a\nb\na\nc\nb')).toBe('a\nb\nc');
  });

  it('no change when all unique', () => {
    expect(removeDuplicateLines('x\ny\nz')).toBe('x\ny\nz');
  });

  it('works with CRLF', () => {
    expect(removeDuplicateLines('a\r\nb\r\na\r\nc')).toBe('a\r\nb\r\nc');
  });
});

describe('removeConsecutiveDuplicateLines', () => {
  it('removes consecutive duplicates only', () => {
    expect(removeConsecutiveDuplicateLines('a\na\nb\nb\na')).toBe('a\nb\na');
  });

  it('no change when no consecutive duplicates', () => {
    expect(removeConsecutiveDuplicateLines('a\nb\na')).toBe('a\nb\na');
  });
});

describe('removeEmptyLines', () => {
  it('removes blank lines', () => {
    expect(removeEmptyLines('a\n\nb\n\nc')).toBe('a\nb\nc');
  });

  it('removes whitespace-only lines', () => {
    expect(removeEmptyLines('a\n   \nb')).toBe('a\nb');
  });

  it('no change when no empty lines', () => {
    expect(removeEmptyLines('a\nb\nc')).toBe('a\nb\nc');
  });
});

// ── Join ──────────────────────────────────────────────────────────────────────

describe('joinSelectedLines', () => {
  it('joins lines with a space', () => {
    expect(joinSelectedLines('hello\nworld')).toBe('hello world');
  });

  it('strips leading whitespace on continuation lines', () => {
    expect(joinSelectedLines('foo\n  bar')).toBe('foo bar');
  });

  it('handles CRLF', () => {
    expect(joinSelectedLines('a\r\nb')).toBe('a b');
  });

  it('single line is unchanged', () => {
    expect(joinSelectedLines('only')).toBe('only');
  });
});

// ── Case ──────────────────────────────────────────────────────────────────────

describe('toUpperCase', () => {
  it('uppercases text', () => {
    expect(toUpperCase('hello World')).toBe('HELLO WORLD');
  });

  it('empty string', () => {
    expect(toUpperCase('')).toBe('');
  });
});

describe('toLowerCase', () => {
  it('lowercases text', () => {
    expect(toLowerCase('Hello WORLD')).toBe('hello world');
  });
});

// ── EOL Conversion ────────────────────────────────────────────────────────────

describe('applyEolCRLF', () => {
  it('converts LF to CRLF', () => {
    expect(applyEolCRLF('a\nb\nc')).toBe('a\r\nb\r\nc');
  });

  it('normalizes mixed EOLs', () => {
    expect(applyEolCRLF('a\r\nb\nc')).toBe('a\r\nb\r\nc');
  });

  it('no-op if already CRLF', () => {
    expect(applyEolCRLF('a\r\nb')).toBe('a\r\nb');
  });
});

describe('applyEolLF', () => {
  it('converts CRLF to LF', () => {
    expect(applyEolLF('a\r\nb\r\nc')).toBe('a\nb\nc');
  });

  it('converts CR to LF', () => {
    expect(applyEolLF('a\rb')).toBe('a\nb');
  });
});

describe('applyEolCR', () => {
  it('converts LF to CR', () => {
    expect(applyEolCR('a\nb')).toBe('a\rb');
  });

  it('converts CRLF to CR', () => {
    expect(applyEolCR('a\r\nb')).toBe('a\rb');
  });
});

// ── Base64 ────────────────────────────────────────────────────────────────────

describe('base64Encode / base64Decode', () => {
  it('encodes ASCII text', () => {
    expect(base64Encode('hello')).toBe('aGVsbG8=');
  });

  it('round-trips ASCII', () => {
    expect(base64Decode(base64Encode('hello world'))).toBe('hello world');
  });

  it('round-trips UTF-8 (emoji)', () => {
    const text = 'hello 🌍';
    expect(base64Decode(base64Encode(text))).toBe(text);
  });

  it('decode returns input unchanged on invalid base64', () => {
    expect(base64Decode('!!!invalid!!!')).toBe('!!!invalid!!!');
  });
});

// ── URL Encode / Decode ───────────────────────────────────────────────────────

describe('urlEncode / urlDecode', () => {
  it('encodes special characters', () => {
    expect(urlEncode('hello world&foo=bar')).toBe('hello%20world%26foo%3Dbar');
  });

  it('round-trips ASCII', () => {
    expect(urlDecode(urlEncode('hello world'))).toBe('hello world');
  });

  it('round-trips UTF-8', () => {
    const text = 'héllo wörld';
    expect(urlDecode(urlEncode(text))).toBe(text);
  });

  it('decode returns input unchanged on invalid percent-encoding', () => {
    expect(urlDecode('%zz')).toBe('%zz');
  });
});

// ── Comment / Uncomment ───────────────────────────────────────────────────────
// These tests assert faithful ScintillaCommenter::commentLine / uncommentLine /
// toggleLine per-line, indent-position behavior (NOT old bulk all-or-nothing).

describe('addLineComment', () => {
  it('inserts token at indent position (after leading whitespace)', () => {
    // Faithful: insert AFTER leading spaces, not at column 0.
    expect(addLineComment('  code', '// ')).toBe('  // code');
  });

  it('works with no indent', () => {
    expect(addLineComment('foo\nbar', '//')).toBe('//foo\n//bar');
  });

  it('works with # token', () => {
    expect(addLineComment('print()', '#')).toBe('#print()');
  });

  it('handles CRLF', () => {
    expect(addLineComment('a\r\nb', '//')).toBe('//a\r\n//b');
  });

  it('skips pure-whitespace / empty lines (faithful to commentLine)', () => {
    // Empty line → indentPos returns -1 → skip (identity).
    expect(addLineComment('foo\n\nbar', '//')).toBe('//foo\n\n//bar');
    // Whitespace-only line → also skipped.
    expect(addLineComment('foo\n   \nbar', '//')).toBe('//foo\n   \n//bar');
  });

  it('handles indented lines across multiple lines', () => {
    expect(addLineComment('  a\n  b', '// ')).toBe('  // a\n  // b');
  });
});

describe('removeLineComment', () => {
  it('removes token at indent position', () => {
    // Token sits after leading whitespace.
    expect(removeLineComment('  // code', '// ')).toBe('  code');
  });

  it('removes token from each line that has it (no indent)', () => {
    expect(removeLineComment('//foo\n//bar', '//')).toBe('foo\nbar');
  });

  it('leaves lines without token unchanged', () => {
    expect(removeLineComment('//foo\nbar', '//')).toBe('foo\nbar');
  });

  it('only removes the first occurrence of the token', () => {
    expect(removeLineComment('////foo', '//')).toBe('//foo');
  });

  it('strips token without trailing space when token has trailing space', () => {
    // Token is '// ' but line has '//code' (no space) — still removes '//' part.
    expect(removeLineComment('//code', '// ')).toBe('code');
  });
});

describe('toggleLineComment', () => {
  it('is decided per-line independently (faithful to ScintillaCommenter::toggleLine)', () => {
    // '//foo' is commented → remove; 'bar' is not → add.
    expect(toggleLineComment('//foo\nbar', '//')).toBe('foo\n//bar');
  });

  it('adds comment token at indent position', () => {
    expect(toggleLineComment('  code', '// ')).toBe('  // code');
  });

  it('removes comment token at indent position', () => {
    expect(toggleLineComment('  // code', '// ')).toBe('  code');
  });

  it('adds comment when no lines are commented', () => {
    expect(toggleLineComment('foo\nbar', '//')).toBe('//foo\n//bar');
  });

  it('removes comment when lines are commented', () => {
    expect(toggleLineComment('//foo\n//bar', '//')).toBe('foo\nbar');
  });

  it('handles mixed comment/uncomment selection (each decided independently)', () => {
    // '//foo' → remove; 'bar' → add; '//baz' → remove.
    expect(toggleLineComment('//foo\nbar\n//baz', '//')).toBe('foo\n//bar\nbaz');
  });

  it('skips pure-whitespace lines on add (passes through unchanged)', () => {
    // Empty line stays empty when toggling-add.
    expect(toggleLineComment('foo\n\nbar', '//')).toBe('//foo\n\n//bar');
  });

  it('handles empty string (single empty line — skipped on add)', () => {
    // '' → indentPos = -1 → insertTokenAtIndent returns '' unchanged.
    expect(toggleLineComment('', '//')).toBe('');
  });

  it('handles indented mixed selection', () => {
    // '  // a' → commented → remove; '  b' → not commented → add.
    expect(toggleLineComment('  // a\n  b', '// ')).toBe('  a\n  // b');
  });
});

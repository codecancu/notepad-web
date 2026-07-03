// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Unit tests for html-autoclose.ts — pure computeCloseTag logic.
 *
 * Tests exercise the pure helper directly against the docText string and insertPos,
 * covering all skip rules and the scan/name-extraction algorithm.
 */
import { describe, it, expect } from 'vitest';
import { computeCloseTag, MAX_TAG_NAME_LENGTH, MAX_TAG_LENGTH } from './html-autoclose';

// ── Helper: build doc + insertPos from "text before `>`" ─────────────────────
//
// We represent a test case as the text that appears BEFORE the `>` is typed.
// `insertPos` = text.length (i.e., `>` goes at the end).

function check(before: string): string | null {
  return computeCloseTag(before, before.length);
}

// ── 1. Basic auto-close ────────────────────────────────────────────────────────

describe('computeCloseTag — basic', () => {
  it('<div + > → returns "div"', () => {
    expect(check('<div')).toBe('div');
  });

  it('<span + > → returns "span"', () => {
    expect(check('<span')).toBe('span');
  });

  it('<p + > → returns "p"', () => {
    expect(check('<p')).toBe('p');
  });
});

// ── 2. Attributes: name stops at first whitespace ─────────────────────────────

describe('computeCloseTag — attributes', () => {
  it('<div class="x" + > → returns "div"', () => {
    expect(check('<div class="x"')).toBe('div');
  });

  it('<div class="x" id="y" + > → returns "div"', () => {
    expect(check('<div class="x" id="y"')).toBe('div');
  });

  it('<section data-foo="bar" + > → returns "section"', () => {
    expect(check('<section data-foo="bar"')).toBe('section');
  });
});

// ── 3. Void tags: no auto-close ───────────────────────────────────────────────

describe('computeCloseTag — void tags', () => {
  it('<br + > → null (void)', () => {
    expect(check('<br')).toBeNull();
  });

  it('<img + > → null (void)', () => {
    expect(check('<img')).toBeNull();
  });

  it('<input + > → null (void)', () => {
    expect(check('<input')).toBeNull();
  });

  it('<hr + > → null (void)', () => {
    expect(check('<hr')).toBeNull();
  });

  it('<meta + > → null (void)', () => {
    expect(check('<meta')).toBeNull();
  });

  it('<link + > → null (void)', () => {
    expect(check('<link')).toBeNull();
  });

  it('<area + > → null (void)', () => {
    expect(check('<area')).toBeNull();
  });

  it('<base + > → null (void)', () => {
    expect(check('<base')).toBeNull();
  });

  it('<col + > → null (void)', () => {
    expect(check('<col')).toBeNull();
  });

  it('<embed + > → null (void)', () => {
    expect(check('<embed')).toBeNull();
  });

  it('<source + > → null (void)', () => {
    expect(check('<source')).toBeNull();
  });

  it('<track + > → null (void)', () => {
    expect(check('<track')).toBeNull();
  });

  it('<wbr + > → null (void)', () => {
    expect(check('<wbr')).toBeNull();
  });

  it('<BR + > → null (case-insensitive void check)', () => {
    expect(check('<BR')).toBeNull();
  });

  it('<Img + > → null (case-insensitive void check)', () => {
    expect(check('<Img')).toBeNull();
  });

  it('<INPUT + > → null (case-insensitive void check)', () => {
    expect(check('<INPUT')).toBeNull();
  });
});

// ── 4. Closing/comment/PI: skip rules ────────────────────────────────────────

describe('computeCloseTag — skip rules for special tag starts', () => {
  it('</div + > → null (closing tag, name[0] === "/")', () => {
    expect(check('</div')).toBeNull();
  });

  it('<!-- + > → null (comment open, name[0] === "!")', () => {
    expect(check('<!--')).toBeNull();
  });

  it('<!doctype html + > → null (doctype, name[0] === "!")', () => {
    expect(check('<!doctype html')).toBeNull();
  });

  it('<?php + > → null (PI, name[0] === "?")', () => {
    expect(check('<?php')).toBeNull();
  });
});

// ── 5. beforeChar guards ──────────────────────────────────────────────────────

describe('computeCloseTag — beforeChar guards', () => {
  it('<div/ + > → null (self-closing, beforeChar "/")', () => {
    expect(check('<div/')).toBeNull();
  });

  it('<!-- x -- + > → null (comment end, beforeChar "-")', () => {
    expect(check('<!-- x --')).toBeNull();
  });

  it('-- + > alone (no <) → null (no opening < found)', () => {
    // beforeChar is '-', so returns null immediately
    expect(check('--')).toBeNull();
  });
});

// ── 6. No `<` within MAX_TAG_LENGTH ──────────────────────────────────────────

describe('computeCloseTag — no opening < within limit', () => {
  it('plain text without < + > → null', () => {
    expect(check('hello world')).toBeNull();
  });

  it('text longer than MAX_TAG_LENGTH without < → null', () => {
    // Build a string of MAX_TAG_LENGTH+10 chars with no `<`
    const long = 'a'.repeat(MAX_TAG_LENGTH + 10);
    expect(check(long)).toBeNull();
  });

  it('< just beyond MAX_TAG_LENGTH window → null (out of scan range)', () => {
    // Put a `<div` at position 0, then pad with MAX_TAG_LENGTH chars of 'x',
    // so the `<` is outside the scan window when `>` is typed at the end.
    const before = '<div' + 'x'.repeat(MAX_TAG_LENGTH);
    // insertPos = before.length; scan window = [before.length - MAX_TAG_LENGTH, ...]
    // The `<` is at position 0 which is before (before.length - MAX_TAG_LENGTH) = 4.
    expect(check(before)).toBeNull();
  });
});

// ── 7. Tag name length limit ──────────────────────────────────────────────────

describe('computeCloseTag — tag name length limit', () => {
  it('tag name exactly MAX_TAG_NAME_LENGTH - 1 chars → returns name', () => {
    const name = 'a'.repeat(MAX_TAG_NAME_LENGTH - 1);
    expect(check('<' + name)).toBe(name);
  });

  it('tag name exactly MAX_TAG_NAME_LENGTH chars → null (>= limit)', () => {
    const name = 'a'.repeat(MAX_TAG_NAME_LENGTH);
    expect(check('<' + name)).toBeNull();
  });

  it('tag name > MAX_TAG_NAME_LENGTH chars → null', () => {
    const name = 'a'.repeat(MAX_TAG_NAME_LENGTH + 5);
    expect(check('<' + name)).toBeNull();
  });
});

// ── 8. Empty tag `<>` ─────────────────────────────────────────────────────────

describe('computeCloseTag — empty tag', () => {
  it('< + > → null (empty tag name)', () => {
    expect(check('<')).toBeNull();
  });
});

// ── 9. Edge cases ─────────────────────────────────────────────────────────────

describe('computeCloseTag — edge cases', () => {
  it('insertPos = 0 (empty doc) → null', () => {
    expect(computeCloseTag('', 0)).toBeNull();
  });

  it('tag in mid-document surrounded by other content', () => {
    // doc: "some text <div class='x'" — insertPos at end
    expect(check("some text <div class='x'")).toBe('div');
  });

  it('nested: "<div><span" → returns "span" (most recent open tag)', () => {
    expect(check('<div><span')).toBe('span');
  });
});

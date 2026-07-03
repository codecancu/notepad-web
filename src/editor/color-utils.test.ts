// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Unit tests for BGR→RGB colour conversion helpers.
 *
 * Key fact about the NotepadNext Lua palette:
 *   init.lua's `rgb()` function converts a human-readable RGB hex literal
 *   into a Scintilla BGR integer:
 *     rgb(0xRRGGBB) → (BB << 16) | (GG << 8) | RR
 *
 *   Therefore LangDef.fgColor values are in Scintilla BGR format.
 *   `bgrToCss()` converts them back to CSS #rrggbb.
 *
 *   Example chain (cpp.lua keyword colour):
 *     cpp.lua:  fgColor = rgb(0x0000FF)  -- 0x0000FF is CSS blue (#0000ff)
 *     Lua rgb() stores: (0xFF << 16) | 0x0000 | 0x00 = 0xFF0000 (Scintilla BGR)
 *     LangDef.fgColor = 0xFF0000
 *     bgrToCss(0xFF0000): B=0xFF, G=0x00, R=0x00 → CSS #0000ff  ✓ blue
 */

import { describe, it, expect } from 'vitest';
import { bgrToCss, rgbIntToCss } from './color-utils';

describe('bgrToCss — Scintilla BGR integers (the format LangDef.fgColor is stored in)', () => {
  it('bgrToCss(0xFF0000) → #0000ff (keyword blue: B=0xFF, G=0x00, R=0x00)', () => {
    // cpp.lua INSTRUCTION WORD: rgb(0x0000FF) → fgColor = 0xFF0000
    // bgrToCss(0xFF0000): B=0xFF → ff, G=0x00 → 00, R=0x00 → 00 → #0000ff
    expect(bgrToCss(0xff0000)).toBe('#0000ff');
  });

  it('bgrToCss(0x008000) → #008000 (comment green: symmetric)', () => {
    // cpp.lua COMMENT: rgb(0x008000) → fgColor = 0x008000 (green is symmetric)
    expect(bgrToCss(0x008000)).toBe('#008000');
  });

  it('bgrToCss(0x0080FF) → #ff8000 (number orange: B=0x00,G=0x80,R=0xFF)', () => {
    // cpp.lua NUMBER: rgb(0xFF8000) → fgColor = 0x0080FF
    // bgrToCss: B=0x00 → 00, G=0x80 → 80, R=0xFF → ff → #ff8000
    expect(bgrToCss(0x0080ff)).toBe('#ff8000');
  });

  it('bgrToCss(0x808080) → #808080 (string grey: symmetric)', () => {
    expect(bgrToCss(0x808080)).toBe('#808080');
  });

  it('bgrToCss(0x800000) → #000080 (operator dark blue: B=0x80,G=0x00,R=0x00)', () => {
    // cpp.lua OPERATOR: rgb(0x000080) → fgColor = 0x800000
    // bgrToCss: B=0x80 → 80, G=0x00 → 00, R=0x00 → 00 → #000080
    expect(bgrToCss(0x800000)).toBe('#000080');
  });

  it('bgrToCss(0x000000) → #000000 (black)', () => {
    expect(bgrToCss(0x000000)).toBe('#000000');
  });

  it('bgrToCss(0xFFFFFF) → #ffffff (white)', () => {
    expect(bgrToCss(0xffffff)).toBe('#ffffff');
  });

  it('bgrToCss(0x0000FF) → #ff0000 (Scintilla red: B=0x00,G=0x00,R=0xFF)', () => {
    // Pure red in Scintilla BGR format (low byte = R)
    expect(bgrToCss(0x0000ff)).toBe('#ff0000');
  });

  it('pads single-digit components (0x010203 → #030201)', () => {
    // BGR: B=0x01, G=0x02, R=0x03 → CSS #030201
    expect(bgrToCss(0x010203)).toBe('#030201');
  });
});

describe('rgbIntToCss — already-in-CSS-order RGB integers', () => {
  it('rgbIntToCss(0x0000FF) → #0000ff (pure blue in CSS order)', () => {
    expect(rgbIntToCss(0x0000ff)).toBe('#0000ff');
  });

  it('rgbIntToCss(0xFF0000) → #ff0000 (pure red in CSS order)', () => {
    expect(rgbIntToCss(0xff0000)).toBe('#ff0000');
  });

  it('rgbIntToCss(0x008000) → #008000 (green)', () => {
    expect(rgbIntToCss(0x008000)).toBe('#008000');
  });

  it('rgbIntToCss(0x000000) → #000000 (black)', () => {
    expect(rgbIntToCss(0x000000)).toBe('#000000');
  });

  it('rgbIntToCss(0xFFFFFF) → #ffffff (white)', () => {
    expect(rgbIntToCss(0xffffff)).toBe('#ffffff');
  });

  it('rgbIntToCss pads single-digit components (0x010203 → #010203)', () => {
    expect(rgbIntToCss(0x010203)).toBe('#010203');
  });
});

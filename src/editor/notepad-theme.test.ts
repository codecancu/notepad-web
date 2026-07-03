// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Unit tests for the Notepad++ HighlightStyle bridge.
 *
 * Verifies:
 *   1. CANONICAL colours match the expected Notepad++ defaults.
 *   2. buildNotepadHighlightStyle() produces a HighlightStyle whose specs
 *      map the keyword tag to the canonical #0000ff blue.
 *   3. buildHighlightExtension() returns a non-null Extension.
 *
 * CPP_STYLES uses post-rgb() Scintilla BGR values (as stored in LangDef.fgColor
 * after the Lua `rgb()` byte-swap), which bgrToCss() then converts to CSS.
 * Example: cpp.lua rgb(0x0000FF) → fgColor = 0xFF0000 (Scintilla BGR for blue).
 */

import { describe, it, expect } from 'vitest';
import { tags } from '@lezer/highlight';
import { CANONICAL, buildNotepadHighlightStyle, buildHighlightExtension } from './notepad-theme';
import type { StyleDef } from '../services/lua-registry';

/**
 * C++ styles using post-rgb() Scintilla BGR values that match the actual
 * LangDef.fgColor integers returned by LuaRegistry (confirmed by registry tests).
 *
 *   rgb(0x0000FF) → fgColor = 0xFF0000  (keyword: blue in CSS)
 *   rgb(0x8000FF) → fgColor = 0xFF0080  (type: purple in CSS)
 *   rgb(0xFF8000) → fgColor = 0x0080FF  (number: orange in CSS)
 *   rgb(0x808080) → fgColor = 0x808080  (string: grey — symmetric)
 *   rgb(0x000080) → fgColor = 0x800000  (operator: dark blue in CSS)
 *   rgb(0x008000) → fgColor = 0x008000  (comment: green — symmetric)
 *   rgb(0x008080) → fgColor = 0x808000  (doc comment: teal in CSS)
 *   rgb(0x804000) → fgColor = 0x004080  (preprocessor: brown in CSS)
 *   rgb(0x000000) → fgColor = 0x000000  (default: black — symmetric)
 */
const CPP_STYLES: Record<string, StyleDef> = {
  'INSTRUCTION WORD': { id: 5, fgColor: 0xff0000, bgColor: 0xffffff, fontStyle: 1 },
  'TYPE WORD': { id: 16, fgColor: 0xff0080, bgColor: 0xffffff },
  NUMBER: { id: 4, fgColor: 0x0080ff, bgColor: 0xffffff },
  STRING: { id: 6, fgColor: 0x808080, bgColor: 0xffffff },
  CHARACTER: { id: 7, fgColor: 0x808080, bgColor: 0xffffff },
  OPERATOR: { id: 10, fgColor: 0x800000, bgColor: 0xffffff, fontStyle: 1 },
  COMMENT: { id: 1, fgColor: 0x008000, bgColor: 0xffffff },
  'COMMENT LINE': { id: 2, fgColor: 0x008000, bgColor: 0xffffff },
  'COMMENT DOC': { id: 3, fgColor: 0x808000, bgColor: 0xffffff },
  PREPROCESSOR: { id: 9, fgColor: 0x004080, bgColor: 0xffffff },
  DEFAULT: { id: 11, fgColor: 0x000000, bgColor: 0xffffff },
};

describe('CANONICAL colours', () => {
  it('keyword is #0000ff (canonical Notepad++ blue)', () => {
    expect(CANONICAL.keyword).toBe('#0000ff');
  });

  it('typeName is #8000ff (canonical Notepad++ purple)', () => {
    expect(CANONICAL.typeName).toBe('#8000ff');
  });

  it('number is #ff8000 (canonical Notepad++ orange)', () => {
    expect(CANONICAL.number).toBe('#ff8000');
  });

  it('string is #808080 (canonical Notepad++ grey)', () => {
    expect(CANONICAL.string).toBe('#808080');
  });

  it('comment is #008000 (canonical Notepad++ green)', () => {
    expect(CANONICAL.comment).toBe('#008000');
  });

  it('operator is #000080 (canonical Notepad++ dark blue)', () => {
    expect(CANONICAL.operator).toBe('#000080');
  });

  it('meta is #804000 (canonical Notepad++ preprocessor brown)', () => {
    expect(CANONICAL.meta).toBe('#804000');
  });

  it('default is #000000 (canonical Notepad++ black)', () => {
    expect(CANONICAL.default).toBe('#000000');
  });
});

describe('buildNotepadHighlightStyle — tag→colour mapping (BGR values)', () => {
  it('returns a HighlightStyle object with specs', () => {
    const hs = buildNotepadHighlightStyle(CPP_STYLES);
    expect(hs).toBeDefined();
    // HighlightStyle has a .specs array of TagStyle entries.
    expect(Array.isArray((hs as unknown as { specs: unknown[] }).specs)).toBe(true);
  });

  it('keyword tag maps to #0000ff (faithful blue: bgrToCss(0xFF0000) = #0000ff)', () => {
    // fgColor = 0xFF0000 (Scintilla BGR for blue after Lua rgb(0x0000FF))
    // bgrToCss(0xFF0000): B=0xFF,G=0x00,R=0x00 → CSS #0000ff
    const hs = buildNotepadHighlightStyle(CPP_STYLES);
    const specs = (hs as unknown as { specs: Array<{ tag: unknown; color?: string }> }).specs;
    const kwSpec = specs.find((s) => {
      const t = s.tag;
      if (Array.isArray(t)) return t.some((tg) => tg === tags.keyword);
      return t === tags.keyword;
    });
    expect(kwSpec).toBeDefined();
    expect(kwSpec!.color).toBe('#0000ff');
  });

  it('keyword tag spec has fontWeight bold (cpp INSTRUCTION WORD fontStyle=1)', () => {
    const hs = buildNotepadHighlightStyle(CPP_STYLES);
    const specs = (
      hs as unknown as { specs: Array<{ tag: unknown; color?: string; fontWeight?: string }> }
    ).specs;
    const kwSpec = specs.find((s) => {
      const t = s.tag;
      if (Array.isArray(t)) return t.some((tg) => tg === tags.keyword);
      return t === tags.keyword;
    });
    expect(kwSpec?.fontWeight).toBe('bold');
  });

  it('comment tag maps to #008000 (green — symmetric BGR value)', () => {
    // fgColor = 0x008000 (symmetric: same as CSS #008000)
    const hs = buildNotepadHighlightStyle(CPP_STYLES);
    const specs = (hs as unknown as { specs: Array<{ tag: unknown; color?: string }> }).specs;
    const cmtSpec = specs.find((s) => {
      const t = s.tag;
      if (Array.isArray(t)) return t.some((tg) => tg === tags.comment);
      return t === tags.comment;
    });
    expect(cmtSpec).toBeDefined();
    expect(cmtSpec!.color).toBe('#008000');
  });

  it('falls back to CANONICAL.keyword when styles map is empty', () => {
    const hs = buildNotepadHighlightStyle({});
    const specs = (hs as unknown as { specs: Array<{ tag: unknown; color?: string }> }).specs;
    const kwSpec = specs.find((s) => {
      const t = s.tag;
      if (Array.isArray(t)) return t.some((tg) => tg === tags.keyword);
      return t === tags.keyword;
    });
    expect(kwSpec).toBeDefined();
    expect(kwSpec!.color).toBe(CANONICAL.keyword); // '#0000ff'
  });
});

describe('buildHighlightExtension', () => {
  it('returns a non-null Extension', () => {
    const ext = buildHighlightExtension(CPP_STYLES);
    expect(ext).not.toBeNull();
    expect(ext).not.toBeUndefined();
  });
});

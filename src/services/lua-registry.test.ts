// SPDX-License-Identifier: GPL-3.0-or-later
// @vitest-environment node
/**
 * Tests for LuaRegistry — verifies that real language data round-trips through
 * Wasmoon + NotepadNext's init.lua + languages/*.lua without mocking.
 *
 * This file uses the Node environment (not happy-dom) because wasmoon's WASM
 * initializer uses `document.baseURI` when `window` is defined (happy-dom)
 * which breaks the createRequire() call with an http:// URL.  In Node mode
 * the module resolves the wasm file from its own __dirname correctly.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { LuaRegistry } from './lua-registry';

// One registry instance shared across all tests (init is async, ~1-2 s).
let registry: LuaRegistry;

beforeAll(async () => {
  registry = new LuaRegistry(undefined); // undefined → node path (no URI)
  await registry.ready();
}, 60_000 /* generous timeout for WASM init */);

describe('LuaRegistry — registry population', () => {
  it('loads at least 80 languages', () => {
    expect(registry.listLanguages().length).toBeGreaterThanOrEqual(80);
  });

  it('has no load failures', () => {
    expect(registry.loadFailures).toHaveLength(0);
  });

  it('listLanguages() returns an array of strings', () => {
    const langs = registry.listLanguages();
    expect(Array.isArray(langs)).toBe(true);
    expect(langs.every((l) => typeof l === 'string')).toBe(true);
  });
});

describe('LuaRegistry — C++ language data', () => {
  it('getLanguage("C++") returns a LangDef', () => {
    const lang = registry.getLanguage('C++');
    expect(lang).toBeDefined();
    expect(lang!.name).toBe('C++');
  });

  it('C++ extensions include "cpp"', () => {
    const lang = registry.getLanguage('C++')!;
    expect(lang.extensions).toContain('cpp');
  });

  it('C++ extensions include "h" and "hpp"', () => {
    const lang = registry.getLanguage('C++')!;
    expect(lang.extensions).toContain('h');
    expect(lang.extensions).toContain('hpp');
  });

  it('C++ lexer is "cpp"', () => {
    expect(registry.getLanguage('C++')!.lexer).toBe('cpp');
  });

  it('C++ styles map is non-empty', () => {
    const styles = registry.getLanguage('C++')!.styles;
    expect(Object.keys(styles).length).toBeGreaterThan(0);
  });

  it('C++ styles have numeric fgColor values', () => {
    const styles = registry.getLanguage('C++')!.styles;
    for (const s of Object.values(styles)) {
      expect(typeof s.fgColor).toBe('number');
      expect(typeof s.bgColor).toBe('number');
    }
  });

  it('C++ DEFAULT style fgColor is 0 (black, rgb(0x000000) = 0)', () => {
    const def = registry.getLanguage('C++')!.styles['DEFAULT'];
    expect(def).toBeDefined();
    expect(def!.fgColor).toBe(0);
  });

  it('C++ keywords[1] (type words) contains "class"', () => {
    const kw = registry.getLanguage('C++')!.keywords;
    // Lua integer table keys come back as string "0", "1", …
    // "class" is a type/keyword in set 1 (not instruction word set 0)
    expect(kw['1']).toContain('class');
  });

  it('C++ keywords[0] (instruction words) contains "if"', () => {
    const kw = registry.getLanguage('C++')!.keywords;
    expect(kw['0']).toContain('if');
  });
});

describe('LuaRegistry — Python language data', () => {
  it('getLanguage("Python") returns a LangDef', () => {
    expect(registry.getLanguage('Python')).toBeDefined();
  });

  it('Python extensions include "py"', () => {
    expect(registry.getLanguage('Python')!.extensions).toContain('py');
  });

  it('Python tabSettings is "spaces"', () => {
    expect(registry.getLanguage('Python')!.tabSettings).toBe('spaces');
  });

  it('Python has firstLine patterns', () => {
    const fp = registry.getLanguage('Python')!.firstLine;
    expect(Array.isArray(fp)).toBe(true);
    expect((fp ?? []).length).toBeGreaterThan(0);
  });
});

describe('LuaRegistry — detectByExtension()', () => {
  it('detects Python from "main.py"', () => {
    expect(registry.detectByExtension('main.py')).toBe('Python');
  });

  it('detects C++ from "foo.cpp"', () => {
    expect(registry.detectByExtension('foo.cpp')).toBe('C++');
  });

  it('detects JavaScript from "app.js"', () => {
    expect(registry.detectByExtension('app.js')).toBe('JavaScript');
  });

  it('detects HTML from "index.html"', () => {
    expect(registry.detectByExtension('index.html')).toBe('HTML');
  });

  it('returns null for a file with no extension', () => {
    expect(registry.detectByExtension('Makefile')).toBeNull();
  });

  it('returns null for an unknown extension', () => {
    expect(registry.detectByExtension('file.xyz_unknown_ext')).toBeNull();
  });

  it('is case-insensitive for extension matching', () => {
    expect(registry.detectByExtension('MAIN.PY')).toBe('Python');
  });
});

describe('LuaRegistry — detectByFirstLine()', () => {
  it('detects Python from a shebang line', () => {
    expect(registry.detectByFirstLine('#!/usr/bin/env python3')).toBe('Python');
  });

  // Regression: Lua first_line patterns with %-escaped punctuation must translate.
  it('detects XML from the prolog (Lua pattern ^<%?xml)', () => {
    expect(registry.detectByFirstLine('<?xml version="1.0" encoding="UTF-8"?>')).toBe('XML');
  });

  it('detects INI from a section header (Lua pattern ^%[.+%])', () => {
    // pattern is ^%[.+%][\r\n] → needs a trailing newline after the section header
    expect(registry.detectByFirstLine('[General]\n')).toBe('ini file');
  });

  it('returns null for a non-matching line', () => {
    expect(registry.detectByFirstLine('just some random text')).toBeNull();
  });
});

describe('LuaRegistry — style colour correctness (rgb() round-trip)', () => {
  it('C++ INSTRUCTION WORD fgColor is correct for rgb(0x0000FF)', () => {
    // rgb(0x0000FF) in init.lua: input=0x0000FF → R=0x00,G=0x00,B=0xFF
    // rgb() swaps: ((B)<<16)|(G<<8)|R = (0xFF<<16)|(0x00<<8)|0x00 = 0xFF0000 = 16711680
    const style = registry.getLanguage('C++')!.styles['INSTRUCTION WORD'];
    expect(style).toBeDefined();
    expect(style!.fgColor).toBe(0xff0000); // 16711680
  });

  it('C++ COMMENT fgColor is correct for rgb(0x008000)', () => {
    // rgb(0x008000): R=0x00,G=0x80,B=0x00 → swapped: (0x00<<16)|(0x80<<8)|0x00 = 0x008000 = 32768
    const style = registry.getLanguage('C++')!.styles['COMMENT'];
    expect(style).toBeDefined();
    expect(style!.fgColor).toBe(0x008000); // 32768 — green unchanged (symmetric)
  });
});

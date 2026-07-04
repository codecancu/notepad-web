// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * LuaRegistry — runs the real NotepadNext init.lua + languages/*.lua inside a
 * Wasmoon (Lua-in-WASM) engine and exposes the resulting language table as a
 * typed TypeScript API.
 *
 * All Lua sources are embedded at build time via lua-sources.ts (no remote
 * fetch, CSP-safe). The Wasmoon engine is created once and reused.
 */

import { LuaFactory } from 'wasmoon';
import { LUA_SOURCES } from '../lua-data/lua-sources';

// ── Types ────────────────────────────────────────────────────────────────────

/** A single style entry from a language's `styles` table. */
export interface StyleDef {
  /** Scintilla style id */
  id: number;
  /**
   * Foreground colour as a 24-bit Scintilla BGR integer, as returned by the
   * Lua `rgb()` function in init.lua.
   *
   * Encoding: init.lua's `rgb(R,G,B)` takes a human-readable RGB hex literal
   * and byte-swaps it into Scintilla's 0xBBGGRR format:
   *   rgb(0xRRGGBB) → (0xBB << 16) | (0xGG << 8) | 0xRR
   *
   * To convert to a CSS colour, use `bgrToCss(fgColor)` from color-utils.ts
   * (not `rgbIntToCss`).
   *
   * Example: cpp.lua `rgb(0x0000FF)` (CSS blue) → fgColor = 0xFF0000.
   *   bgrToCss(0xFF0000) → '#0000ff' ✓
   */
  fgColor: number;
  /** Background colour (same Scintilla BGR encoding as fgColor). */
  bgColor: number;
  /** Scintilla fontStyle bitmask (1=bold, 2=italic, 4=underline, 8=EOLFilled). */
  fontStyle?: number;
}

/** Represents one language as loaded from the Lua registry. */
export interface LangDef {
  name: string;
  lexer?: string;
  extensions: string[];
  singleLineComment?: string;
  /** Keyword sets keyed by Scintilla keyword-set index as a STRING ("0","1",…) — Lua 0/1-indexed tables come back string-keyed in JS. Index as keywords['0']. */
  keywords: Record<string, string>;
  properties?: Record<string, string>;
  styles: Record<string, StyleDef>;
  tabSettings?: string;
  tabSize?: number;
  firstLine?: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the Wasmoon custom WASM URI.
 *
 * - In a Chrome MV3 extension: uses `chrome.runtime.getURL('glue.wasm')`.
 * - In a real browser served via http-server (e2e): `/glue.wasm`.
 * - In a Node.js / Vitest environment (including happy-dom): `undefined` so
 *   LuaFactory uses the bundled WASM path that ships with the wasmoon package.
 *
 * Detection priority:
 * 1. If `process.versions.node` is set → Node (Vitest, even under happy-dom
 *    which still runs JS in Node but fakes the DOM).
 * 2. Chrome extension runtime → extension origin URI.
 * 3. Otherwise → relative `glue.wasm` (resolves against the document base, so
 *    it works for http-server AND a PWA hosted under a sub-path).
 */
export function resolveWasmUri(): string | undefined {
  // In Node (Vitest / happy-dom / SSR), process.versions.node is always set.
  if (
    typeof process !== 'undefined' &&
    typeof process.versions === 'object' &&
    process.versions !== null &&
    typeof (process.versions as Record<string, unknown>)['node'] === 'string'
  ) {
    return undefined; // Let wasmoon find its own bundled wasm via __dirname.
  }
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    return chrome.runtime.getURL('glue.wasm');
  }
  // Relative (not "/glue.wasm") so it resolves against the document base — works
  // for e2e http-server AND the PWA hosted under a sub-path
  // (https://user.github.io/notepad-web/ would 404 on an absolute "/glue.wasm").
  return 'glue.wasm';
}

// ── LuaRegistry ─────────────────────────────────────────────────────────────

export class LuaRegistry {
  // Lazily initialized: the Wasmoon engine is only spun up on the first ready()
  // call, NOT in the constructor. This keeps merely importing/constructing the
  // singleton (or calling detectByExtension before load) from booting Wasmoon —
  // which fails under happy-dom test environments (wasm URI resolves to a bad
  // http:// path). Production still inits early because the app awaits ready().
  private _ready: Promise<void> | null = null;
  private readonly _wasmUri: string | undefined;
  private _languages: Map<string, LangDef> = new Map();
  /** Names of language modules that failed to load (gracefully skipped). */
  readonly loadFailures: string[] = [];

  constructor(wasmUri?: string) {
    this._wasmUri = wasmUri ?? resolveWasmUri();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Resolves once init.lua has been executed and the registry is populated. Triggers the (memoized) Wasmoon init on first call. */
  ready(): Promise<void> {
    if (!this._ready) this._ready = this._init(this._wasmUri);
    return this._ready;
  }

  /** Returns the LangDef for the given NotepadNext language name, e.g. `"C++"`. */
  getLanguage(name: string): LangDef | undefined {
    return this._languages.get(name);
  }

  /** Lists all language names that were successfully loaded. */
  listLanguages(): string[] {
    return Array.from(this._languages.keys());
  }

  /**
   * Detects the language for a filename by matching its extension against every
   * loaded language's `extensions` list.
   * Returns the NotepadNext language name (e.g. `"Python"`) or `null`.
   */
  detectByExtension(filename: string): string | null {
    const dot = filename.lastIndexOf('.');
    if (dot < 0) return null;
    const ext = filename.slice(dot + 1).toLowerCase();
    for (const [name, lang] of this._languages) {
      for (const e of lang.extensions) {
        if (e.toLowerCase() === ext) return name;
      }
    }
    return null;
  }

  /**
   * Detects language by testing `firstLine` patterns (mirrors Lua
   * `DetectLanguageFromContents`).  Returns the language name or `null`.
   */
  detectByFirstLine(line: string): string | null {
    for (const [name, lang] of this._languages) {
      if (!lang.firstLine) continue;
      for (const pattern of lang.firstLine) {
        // Convert a basic Lua pattern to a JS RegExp.
        // NotepadNext patterns are simple anchored strings like "^#!.*python".
        try {
          if (new RegExp(luaPatternToJs(pattern)).test(line)) return name;
        } catch {
          // Ignore patterns that don't translate cleanly.
        }
      }
    }
    return null;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async _init(wasmUri: string | undefined): Promise<void> {
    const factory = new LuaFactory(wasmUri);

    // Mount every language module so require("cpp") resolves to cpp.lua, etc.
    const mountPromises: Promise<void>[] = [];
    for (const [modName, src] of Object.entries(LUA_SOURCES)) {
      if (modName === 'init') continue; // mounted separately below
      mountPromises.push(factory.mountFile(`${modName}.lua`, src));
    }
    await Promise.all(mountPromises);

    // Mount init.lua (not strictly required as a file, but consistent).
    await factory.mountFile('init.lua', LUA_SOURCES['init'] ?? '');

    const lua = await factory.createEngine();
    try {
      // Point package.path at the root of the virtual filesystem.
      await lua.doString(`package.path = "?.lua;" .. package.path`);

      // Run init.lua — this defines rgb(), DetectLanguageFromContents, and
      // populates the global `languages` table.
      await lua.doString(LUA_SOURCES['init'] ?? '');

      // Read back the `languages` table from the Lua VM.
      const raw = lua.global.get('languages') as Record<string, unknown>;
      this._buildRegistry(raw);
    } finally {
      lua.global.close();
    }
  }

  private _buildRegistry(raw: Record<string, unknown>): void {
    for (const [name, value] of Object.entries(raw)) {
      if (typeof value !== 'object' || value === null) continue;
      try {
        const lang = this._coerceLangDef(name, value as Record<string, unknown>);
        this._languages.set(name, lang);
      } catch (err) {
        this.loadFailures.push(name);
        console.warn(`[LuaRegistry] Failed to coerce language "${name}":`, err);
      }
    }
  }

  private _coerceLangDef(name: string, v: Record<string, unknown>): LangDef {
    // extensions — Lua array → JS array of strings
    const extensions = arrayOrEmpty<string>(v['extensions']);

    // keywords — Lua table with integer or string keys → Record<string,string>
    const keywords: Record<string, string> = {};
    if (typeof v['keywords'] === 'object' && v['keywords'] !== null) {
      for (const [k, w] of Object.entries(v['keywords'] as Record<string, unknown>)) {
        if (typeof w === 'string') keywords[k] = w;
      }
    }

    // properties
    const properties: Record<string, string> | undefined = v['properties']
      ? stringRecord(v['properties'] as Record<string, unknown>)
      : undefined;

    // styles
    const styles: Record<string, StyleDef> = {};
    if (typeof v['styles'] === 'object' && v['styles'] !== null) {
      for (const [styleName, s] of Object.entries(v['styles'] as Record<string, unknown>)) {
        if (typeof s !== 'object' || s === null) continue;
        const sr = s as Record<string, unknown>;
        const id = Number(sr['id']);
        const fgColor = Number(sr['fgColor']);
        const bgColor = Number(sr['bgColor']);
        const styleDef: StyleDef = { id, fgColor, bgColor };
        if (typeof sr['fontStyle'] === 'number') {
          styleDef.fontStyle = sr['fontStyle'];
        }
        styles[styleName] = styleDef;
      }
    }

    // first_line — Lua array → JS string[]
    const firstLine: string[] | undefined = v['first_line']
      ? arrayOrEmpty<string>(v['first_line'])
      : undefined;

    const lang: LangDef = {
      name,
      extensions,
      keywords,
      styles,
    };
    if (typeof v['lexer'] === 'string') lang.lexer = v['lexer'];
    if (typeof v['singleLineComment'] === 'string') lang.singleLineComment = v['singleLineComment'];
    if (properties) lang.properties = properties;
    if (typeof v['tabSettings'] === 'string') lang.tabSettings = v['tabSettings'];
    if (typeof v['tabSize'] === 'number') lang.tabSize = v['tabSize'];
    if (firstLine && firstLine.length > 0) lang.firstLine = firstLine;

    return lang;
  }
}

// ── Utility helpers ──────────────────────────────────────────────────────────

function arrayOrEmpty<T>(v: unknown): T[] {
  if (!v || typeof v !== 'object') return [];
  // Lua arrays come back as JS objects with numeric string keys "1","2",...
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj);
  // If keys are all numeric, sort and extract values
  if (keys.every((k) => /^\d+$/.test(k))) {
    return keys
      .map(Number)
      .sort((a, b) => a - b)
      .map((i) => obj[String(i)] as T);
  }
  // Otherwise treat as plain array (shouldn't happen for Lua sequences, but safe)
  return Object.values(obj) as T[];
}

function stringRecord(v: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === 'string') out[k] = val;
  }
  return out;
}

/**
 * Very small Lua-pattern → JS-RegExp translator covering the subset used in
 * NotepadNext's `first_line` patterns (anchors, wildcards, character classes).
 * Falls back gracefully if conversion throws.
 */
function luaPatternToJs(pat: string): string {
  // Lua patterns use % for escapes; most used here are plain or anchored.
  // Common transformations needed for NotepadNext patterns:
  //   %d → \d,  %a → [a-zA-Z],  %s → \s,  %w → \w,  %p → \p{P},
  //   %% → %,   .  → .  (already wildcard in both)
  return (
    pat
      // %-escaped punctuation (e.g. %? %[ %] %( %) %. %+ %- %% %^ %$) → JS literal
      // escape. Runs FIRST: the chars below (d/a/s/w/p) are not in this set, so the
      // named-class replacements still apply. Fixes silent misdetection of XML
      // (`^<%?xml`) and INI (`^%[.+%]`) first_line patterns.
      .replace(/%([%^$()[\]{}.*+?\-])/g, '\\$1')
      .replace(/%d/g, '\\d')
      .replace(/%a/g, '[a-zA-Z]')
      .replace(/%s/g, '\\s')
      .replace(/%w/g, '\\w')
      .replace(/%p/g, '[!-/:-@[-`{-~]')
  );
}

// ── Singleton ────────────────────────────────────────────────────────────────

/** Shared singleton registry instance for use in the extension. */
export const luaRegistry = new LuaRegistry();

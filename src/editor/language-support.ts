// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * language-support — maps a NotepadNext language name (or its `.lexer` string)
 * to a CodeMirror 6 Extension (LanguageSupport or StreamLanguage).
 *
 * Coverage:
 *   Full CM6 LanguageSupport (native Lezer grammars — best tokenization):
 *     JavaScript/TypeScript, Python, HTML, CSS, JSON, C/C++, Java, Rust,
 *     PHP, SQL, XML, Markdown
 *
 *   StreamLanguage via @codemirror/legacy-modes (good coverage):
 *     Shell/Bash, YAML, TOML, Diff, Go, Haskell, CoffeeScript, R,
 *     Lua, Perl, Ruby, Clojure, Fortran, Groovy, Scala, Pascal/Delphi,
 *     Scheme, Erlang, Smalltalk, PowerShell, VHDL, Verilog,
 *     AppleScript, VBScript, Batch/DOS, Dockerfile, LaTeX, Makefile
 *
 *   Plaintext fallback (no tokenization): everything else
 */

import type { Extension } from '@codemirror/state';
import { StreamLanguage } from '@codemirror/language';

// ── Native Lezer LanguageSupport ──────────────────────────────────────────────

import { javascript, jsxLanguage, tsxLanguage } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { rust } from '@codemirror/lang-rust';
import { php } from '@codemirror/lang-php';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { markdown } from '@codemirror/lang-markdown';

// ── Legacy StreamLanguage modes ───────────────────────────────────────────────

import { shell } from '@codemirror/legacy-modes/mode/shell';
import { yaml } from '@codemirror/legacy-modes/mode/yaml';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { diff } from '@codemirror/legacy-modes/mode/diff';
import { go } from '@codemirror/legacy-modes/mode/go';
import { haskell } from '@codemirror/legacy-modes/mode/haskell';
import { coffeeScript } from '@codemirror/legacy-modes/mode/coffeescript';
import { r } from '@codemirror/legacy-modes/mode/r';
import { lua as luaMode } from '@codemirror/legacy-modes/mode/lua';
import { perl } from '@codemirror/legacy-modes/mode/perl';
import { ruby } from '@codemirror/legacy-modes/mode/ruby';
import { clojure } from '@codemirror/legacy-modes/mode/clojure';
import { fortran } from '@codemirror/legacy-modes/mode/fortran';
import { groovy } from '@codemirror/legacy-modes/mode/groovy';
import { pascal } from '@codemirror/legacy-modes/mode/pascal';
import { scheme } from '@codemirror/legacy-modes/mode/scheme';
import { erlang } from '@codemirror/legacy-modes/mode/erlang';
import { powerShell } from '@codemirror/legacy-modes/mode/powershell';
import { vhdl } from '@codemirror/legacy-modes/mode/vhdl';
import { verilog } from '@codemirror/legacy-modes/mode/verilog';
import { vbScript } from '@codemirror/legacy-modes/mode/vbscript';
import { objectiveC } from '@codemirror/legacy-modes/mode/clike';
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { properties } from '@codemirror/legacy-modes/mode/properties';
import { smalltalk } from '@codemirror/legacy-modes/mode/smalltalk';

// ── Helpers ───────────────────────────────────────────────────────────────────

function stream(mode: Parameters<typeof StreamLanguage.define>[0]): Extension {
  return StreamLanguage.define(mode);
}

// javascript() returns LanguageSupport; cast for our Extension union.
const JS: Extension = javascript() as unknown as Extension;
const JSX: Extension = jsxLanguage.extension;
const TS: Extension = javascript({ typescript: true }) as unknown as Extension;
const TSX: Extension = tsxLanguage.extension;

// ── Name → Extension map ──────────────────────────────────────────────────────
// Keys are lowercased NotepadNext language names OR lexer ids.

const LANG_MAP: Record<string, Extension> = {
  // JavaScript / TypeScript
  javascript: JS,
  'javascript (babel)': JS,
  jsx: JSX,
  typescript: TS,
  tsx: TSX,

  // Python
  python: python() as unknown as Extension,

  // HTML/CSS/JSON
  html: html() as unknown as Extension,
  css: css() as unknown as Extension,
  json: json() as unknown as Extension,

  // C / C++
  c: cpp() as unknown as Extension,
  'c++': cpp() as unknown as Extension,
  cpp: cpp() as unknown as Extension,

  // Java
  java: java() as unknown as Extension,

  // Rust
  rust: rust() as unknown as Extension,

  // PHP
  php: php() as unknown as Extension,

  // SQL
  sql: sql() as unknown as Extension,

  // XML
  xml: xml() as unknown as Extension,
  xsl: xml() as unknown as Extension,

  // Markdown
  markdown: markdown() as unknown as Extension,

  // Shell / Bash
  shell: stream(shell),
  bash: stream(shell),
  sh: stream(shell),

  // YAML
  yaml: stream(yaml),

  // TOML
  toml: stream(toml),

  // Diff / Patch
  diff: stream(diff),

  // Go
  go: stream(go),

  // Haskell
  haskell: stream(haskell),

  // CoffeeScript
  coffeescript: stream(coffeeScript),

  // R
  r: stream(r),

  // Lua
  lua: stream(luaMode),

  // Perl
  perl: stream(perl),

  // Ruby
  ruby: stream(ruby),

  // Clojure
  clojure: stream(clojure),

  // Fortran
  fortran: stream(fortran),
  fortran77: stream(fortran),

  // Groovy
  groovy: stream(groovy),

  // Pascal / Delphi
  pascal: stream(pascal),
  delphi: stream(pascal),

  // Scheme
  scheme: stream(scheme),

  // Erlang
  erlang: stream(erlang),

  // PowerShell
  powershell: stream(powerShell),

  // VHDL
  vhdl: stream(vhdl),

  // Verilog / SystemVerilog
  verilog: stream(verilog),
  systemverilog: stream(verilog),

  // VBScript
  vbscript: stream(vbScript),
  'visual basic': stream(vbScript),
  vb: stream(vbScript),

  // Objective-C (falls back to C-like via legacy-modes)
  'objective-c': stream(objectiveC),

  // Dockerfile
  dockerfile: stream(dockerFile),

  // LaTeX / TeX
  latex: stream(stex),
  tex: stream(stex),

  // Properties / INI files
  ini: stream(properties),
  properties: stream(properties),

  // Smalltalk
  smalltalk: stream(smalltalk),

  // Batch/DOS — no legacy mode available; plaintext fallback
  // 'batch': null  — covered by plaintext fallback
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the CM6 Extension for the given NotepadNext language name (case-
 * insensitive), or `null` for plaintext (no tokenization).
 *
 * Accepts either the language `name` (e.g. `"C++"`) or `lexer` id
 * (e.g. `"cpp"`).
 */
export function languageExtensionFor(name: string): Extension | null {
  const key = name.toLowerCase().trim();
  return LANG_MAP[key] ?? null;
}

/**
 * List of language names that have real CM6 tokenization (for reporting).
 */
export const SUPPORTED_LANGUAGES = Object.keys(LANG_MAP);

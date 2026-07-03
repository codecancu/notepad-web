// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * notepad-theme — CM6 HighlightStyle derived from the real NotepadNext Lua
 * palette, giving faithful Notepad++ colours on top of CodeMirror 6 tokenization.
 *
 * Design:
 *   1. A set of hard-coded canonical Notepad++ colours (used as safe fallbacks
 *      when the async luaRegistry is not yet ready).
 *   2. `buildNotepadHighlightStyle(styles)` — given a LangDef.styles map (or the
 *      C++ map as reference), constructs a @codemirror/language HighlightStyle
 *      mapping standard @lezer/highlight Tags to the palette colours.
 *   3. `notepadHighlight` — the pre-built Extension using canonical colours so
 *      the editor is styled immediately; call `rebuildHighlight(langStyles)` to
 *      hot-swap it once the registry resolves.
 *
 * Style name → Tag mapping rationale (based on C++ / Python / JS .lua files):
 *   "INSTRUCTION WORD"  → keyword (bold blue #0000FF — Notepad++ default)
 *   "TYPE WORD"         → typeName (#8000FF)
 *   "NUMBER"            → number  (#FF8000)
 *   "STRING"            → string  (#808080)
 *   "CHARACTER"         → character (#808080)
 *   "COMMENT"           → comment  (#008000)
 *   "COMMENT LINE"      → lineComment (#008000)
 *   "COMMENT DOC"       → docComment (#008080)
 *   "OPERATOR"          → operator (bold #000080)
 *   "PREPROCESSOR"      → meta / processingInstruction (#804000)
 *   "DEFAULT"           → content (#000000)
 */

import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';
import type { StyleDef } from '../services/lua-registry';
import { bgrToCss } from './color-utils';

// ── Canonical Notepad++ colours (light theme, from cpp.lua) ─────────────────

/** Canonical Notepad++ token colours — used as fallback before the registry loads. */
export const CANONICAL = {
  keyword: '#0000ff', // INSTRUCTION WORD (bold)
  typeName: '#8000ff', // TYPE WORD
  number: '#ff8000', // NUMBER
  string: '#808080', // STRING / CHARACTER
  comment: '#008000', // COMMENT, COMMENT LINE
  docComment: '#008080', // COMMENT DOC, COMMENT LINE DOC
  operator: '#000080', // OPERATOR (bold)
  meta: '#804000', // PREPROCESSOR
  default: '#000000', // DEFAULT
  regexp: '#000000', // REGEX
} as const;

// ── Helper ────────────────────────────────────────────────────────────────────

/** Scintilla fontStyle bitmask constants. */
const BOLD = 1;
const ITALIC = 2;

function fontStyleAttrs(fontStyle: number | undefined): {
  fontWeight?: string;
  fontStyle?: string;
} {
  const out: { fontWeight?: string; fontStyle?: string } = {};
  if (!fontStyle) return out;
  if (fontStyle & BOLD) out.fontWeight = 'bold';
  if (fontStyle & ITALIC) out.fontStyle = 'italic';
  return out;
}

/**
 * Extract a CSS colour from the styles map (falls back to `fallback`).
 *
 * LangDef.fgColor values are in Scintilla BGR format (the result of the Lua
 * `rgb()` function which converts human-readable RGB → Scintilla BGR so that
 * Scintilla can use them directly). We therefore use `bgrToCss` to recover
 * the intended CSS colour.
 */
function col(styles: Record<string, StyleDef>, name: string, fallback: string): string {
  const s = styles[name];
  // Note: check `=== undefined`, NOT `!s.fgColor` — a black foreground is the
  // valid value 0x000000, which is falsy and would otherwise be dropped.
  if (!s || s.fgColor === undefined) return fallback;
  return bgrToCss(s.fgColor);
}

/** Build a HighlightStyle from a LangDef.styles record (e.g. from C++). */
export function buildNotepadHighlightStyle(styles: Record<string, StyleDef>): HighlightStyle {
  const kwStyle = styles['INSTRUCTION WORD'];
  const opStyle = styles['OPERATOR'];

  return HighlightStyle.define([
    // ── Keywords ──────────────────────────────────────────────────────────────
    {
      tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword, tags.moduleKeyword],
      color: col(styles, 'INSTRUCTION WORD', CANONICAL.keyword),
      ...fontStyleAttrs(kwStyle?.fontStyle),
    },
    {
      tag: [tags.definitionKeyword, tags.modifier],
      color: col(styles, 'INSTRUCTION WORD', CANONICAL.keyword),
      ...fontStyleAttrs(kwStyle?.fontStyle),
    },

    // ── Types ────────────────────────────────────────────────────────────────
    {
      tag: [tags.typeName, tags.className, tags.namespace],
      color: col(styles, 'TYPE WORD', CANONICAL.typeName),
    },

    // ── Numbers ──────────────────────────────────────────────────────────────
    {
      tag: [tags.number, tags.integer, tags.float],
      color: col(styles, 'NUMBER', CANONICAL.number),
    },

    // ── Strings / characters ─────────────────────────────────────────────────
    {
      tag: [tags.string, tags.special(tags.string)],
      color: col(styles, 'STRING', CANONICAL.string),
    },
    {
      tag: tags.character,
      color: col(styles, 'CHARACTER', CANONICAL.string),
    },

    // ── Operators ────────────────────────────────────────────────────────────
    {
      tag: [tags.operator, tags.punctuation, tags.bracket, tags.separator],
      color: col(styles, 'OPERATOR', CANONICAL.operator),
      ...fontStyleAttrs(opStyle?.fontStyle),
    },
    {
      tag: tags.arithmeticOperator,
      color: col(styles, 'OPERATOR', CANONICAL.operator),
      ...fontStyleAttrs(opStyle?.fontStyle),
    },
    {
      tag: tags.compareOperator,
      color: col(styles, 'OPERATOR', CANONICAL.operator),
      ...fontStyleAttrs(opStyle?.fontStyle),
    },
    {
      tag: tags.logicOperator,
      color: col(styles, 'OPERATOR', CANONICAL.operator),
      ...fontStyleAttrs(opStyle?.fontStyle),
    },

    // ── Comments ─────────────────────────────────────────────────────────────
    {
      tag: [tags.comment, tags.lineComment, tags.blockComment],
      color: col(styles, 'COMMENT LINE', col(styles, 'COMMENT', CANONICAL.comment)),
    },
    {
      tag: tags.docComment,
      color: col(styles, 'COMMENT DOC', CANONICAL.docComment),
    },
    {
      tag: tags.docString,
      color: col(styles, 'COMMENT DOC', CANONICAL.docComment),
    },

    // ── Preprocessor / meta ──────────────────────────────────────────────────
    {
      tag: [tags.meta, tags.processingInstruction],
      color: col(styles, 'PREPROCESSOR', CANONICAL.meta),
    },
    {
      tag: tags.annotation,
      color: col(styles, 'PREPROCESSOR', CANONICAL.meta),
    },

    // ── Regex ────────────────────────────────────────────────────────────────
    {
      tag: tags.regexp,
      color: col(styles, 'REGEX', CANONICAL.regexp),
    },

    // ── Builtins / variables ─────────────────────────────────────────────────
    {
      tag: [tags.variableName, tags.local(tags.variableName)],
      color: col(styles, 'DEFAULT', CANONICAL.default),
    },
    {
      tag: [tags.function(tags.variableName), tags.function(tags.name)],
      color: col(styles, 'DEFAULT', CANONICAL.default),
    },

    // ── Definitions ──────────────────────────────────────────────────────────
    {
      tag: [tags.definition(tags.variableName), tags.definition(tags.name)],
      color: col(styles, 'DEFAULT', CANONICAL.default),
    },

    // ── HTML/XML specifics ───────────────────────────────────────────────────
    {
      tag: tags.tagName,
      color: col(styles, 'INSTRUCTION WORD', CANONICAL.keyword),
    },
    {
      tag: tags.attributeName,
      color: col(styles, 'TYPE WORD', CANONICAL.typeName),
    },
    {
      tag: tags.attributeValue,
      color: col(styles, 'STRING', CANONICAL.string),
    },

    // ── Default ──────────────────────────────────────────────────────────────
    {
      tag: tags.name,
      color: col(styles, 'DEFAULT', CANONICAL.default),
    },
  ]);
}

// ── Pre-built extension (canonical colours, no registry dependency) ───────────

/** The canonical Notepad++ HighlightStyle using the C++ palette constants. */
const _canonicalStyle = HighlightStyle.define([
  {
    tag: [
      tags.keyword,
      tags.controlKeyword,
      tags.operatorKeyword,
      tags.moduleKeyword,
      tags.definitionKeyword,
      tags.modifier,
    ],
    color: CANONICAL.keyword,
    fontWeight: 'bold',
  },
  {
    tag: [tags.typeName, tags.className, tags.namespace],
    color: CANONICAL.typeName,
  },
  {
    tag: [tags.number, tags.integer, tags.float],
    color: CANONICAL.number,
  },
  {
    tag: [tags.string, tags.special(tags.string), tags.character],
    color: CANONICAL.string,
  },
  {
    tag: [
      tags.operator,
      tags.arithmeticOperator,
      tags.compareOperator,
      tags.logicOperator,
      tags.punctuation,
      tags.bracket,
      tags.separator,
    ],
    color: CANONICAL.operator,
    fontWeight: 'bold',
  },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment],
    color: CANONICAL.comment,
  },
  {
    tag: [tags.docComment, tags.docString],
    color: CANONICAL.docComment,
  },
  {
    tag: [tags.meta, tags.processingInstruction, tags.annotation],
    color: CANONICAL.meta,
  },
  {
    tag: tags.regexp,
    color: CANONICAL.regexp,
  },
  {
    tag: [tags.tagName],
    color: CANONICAL.keyword,
  },
  {
    tag: [tags.attributeName],
    color: CANONICAL.typeName,
  },
  {
    tag: [tags.attributeValue],
    color: CANONICAL.string,
  },
  {
    tag: [
      tags.name,
      tags.variableName,
      tags.function(tags.variableName),
      tags.function(tags.name),
      tags.definition(tags.variableName),
    ],
    color: CANONICAL.default,
  },
]);

/**
 * The canonical Notepad++ CM6 highlight extension (pre-built, no async
 * dependency). Safe to include in the initial editor extensions array.
 */
export const notepadHighlight: Extension = syntaxHighlighting(_canonicalStyle);

/**
 * Build and return a `syntaxHighlighting(...)` extension from a live
 * `LangDef.styles` map (e.g. from `luaRegistry.getLanguage('C++').styles`).
 * Use this to rebuild after the registry resolves.
 */
export function buildHighlightExtension(styles: Record<string, StyleDef>): Extension {
  return syntaxHighlighting(buildNotepadHighlightStyle(styles));
}

// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * notepad-light-theme — CM6 extensions matching the Notepad++ light theme.
 *
 * Values derived from real NotepadNext editor defaults:
 *   EditorManager.cpp  setCaretWidth(2)           → 2 px blinking caret
 *                      setCaretLineVisible(true)   → faint current-line highlight
 *   npp.css            white editor bg (#ffffff)
 *   Scintilla defaults  selection = light-blue    → #b5d5ff (Scintilla SELBACK default)
 *
 * Implementation note — why two extensions:
 *   `EditorView.theme()` generates a unique CSS class (e.g. ͼ4) that CM6 adds to
 *   .cm-editor only when the facet is correctly wired.  `EditorView.baseTheme()`
 *   always targets the stable `.ͼ1` (baseThemeID) class that is ALWAYS present on
 *   every cm-editor, plus `&light` / `&dark` scopes for theme-aware rules.
 *   We use `baseTheme` for the structural colors so they are reliably applied.
 *
 *   A companion `EditorView.theme()` is exported as `notepadLightThemeExtra` for
 *   the themeCompartment so that CM6's own `dark` facet is kept consistent.
 */

import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

// ── Palette (faithful to Notepad++ light defaults) ────────────────────────────

/** Editor content area background — pure white as in Notepad++. */
const BG = '#ffffff';

/** Gutter (line-number panel) background — slightly off-white, like Notepad++. */
const GUTTER_BG = '#f0f0f0';

/** Gutter foreground (line numbers) — muted dark-gray. */
const GUTTER_FG = '#707070';

/** Active-line highlight — very faint blue matching Notepad++ caret-line colour. */
const ACTIVE_LINE_BG = '#e8f2ff';

/** Selection background — Scintilla default light-blue. */
const SELECTION_BG = '#b5d5ff';

/** Active line gutter highlight. */
const ACTIVE_GUTTER_BG = '#d8e8ff';

// ── Base theme (always applied via the stable ͼ1 base class) ─────────────────

/**
 * Base theme rules targeting `.ͼ1` (always-present base class) with `&light`
 * scoping, so they apply whenever a non-dark theme is active.
 *
 * This is the reliable mechanism for light-mode structural colours.
 */
const _notepadBase: Extension = EditorView.baseTheme({
  // ── Content area ───────────────────────────────────────────────────────────
  '&light': {
    backgroundColor: BG,
    color: '#000000',
  },
  '&light .cm-content': {
    backgroundColor: BG,
    caretColor: '#000000',
    fontFamily: '"Courier New", Courier, monospace',
  },
  // ── Caret: 2 px, faithful to EditorManager.cpp setCaretWidth(2) ─────────
  '&light .cm-cursor, &light .cm-dropCursor': {
    borderLeftWidth: '2px',
    borderLeftColor: '#000000',
  },
  // ── Current-line highlight ────────────────────────────────────────────────
  '&light .cm-activeLine': {
    backgroundColor: ACTIVE_LINE_BG,
  },
  // ── Selection ────────────────────────────────────────────────────────────
  '&light.cm-focused .cm-selectionBackground, &light .cm-selectionBackground': {
    backgroundColor: SELECTION_BG,
  },
  // ── Gutters (line-number panel) ──────────────────────────────────────────
  '&light .cm-gutters': {
    backgroundColor: GUTTER_BG,
    color: GUTTER_FG,
    borderRight: '1px solid #d0d0d0',
  },
  '&light .cm-lineNumbers .cm-gutterElement': {
    paddingRight: '8px',
  },
  '&light .cm-activeLineGutter': {
    backgroundColor: ACTIVE_GUTTER_BG,
  },
  // ── Search match highlight ─────────────────────────────────────────────────
  '&light .cm-searchMatch': {
    backgroundColor: '#ffff00',
    outline: '1px solid #cccc00',
  },
  '&light .cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: '#ffa500',
  },
  // ── Bracket matching (BraceMatch faithful: subtle green bg + bold) ────────
  '&light .cm-matchingBracket': {
    backgroundColor: '#e0ffe0',
    outline: '1px solid #50a050',
    fontWeight: 'bold',
  },
  '&light .cm-nonmatchingBracket': {
    backgroundColor: '#ffe0e0',
    outline: '1px solid #c05050',
    color: '#c00000',
  },
  // ── Selection matches (SmartHighlighter faithful: subtle yellow/tan) ────
  // highlightSelectionMatches() adds .cm-selectionMatch on all occurrences
  // of the word at the caret — faithful to NotepadNext SmartHighlighter.
  '&light .cm-selectionMatch': {
    backgroundColor: '#ffe0a0',
    outline: '1px solid #d0a000',
  },
  // ── Autocomplete tooltip z-index — ensure it appears above dockview ─────
  '&light .cm-tooltip.cm-tooltip-autocomplete': {
    zIndex: '9999',
    border: '1px solid #c8c8c8',
    backgroundColor: '#ffffff',
    boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
  },
  '&light .cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: '#b5d5ff',
    color: '#000000',
  },
  '&light .cm-tooltip-autocomplete ul li': {
    padding: '1px 8px',
    fontFamily: '"Courier New", Courier, monospace',
    fontSize: '13px',
  },

  // ── Dark-mode structural rules ──────────────────────────────────────────────
  // A usable dark theme so the caret stays visible and the monospace font is
  // applied in dark mode too (previously dark mode used a bare marker with no
  // structural rules, so the &light caret/font never fired → invisible caret and
  // browser-default font). These &dark rules fire when the dark marker is active.
  '&dark': {
    backgroundColor: '#1e1e1e',
    color: '#e0e0e0',
  },
  '&dark .cm-content': {
    backgroundColor: '#1e1e1e',
    caretColor: '#e0e0e0',
    fontFamily: '"Courier New", Courier, monospace',
  },
  '&dark .cm-cursor, &dark .cm-dropCursor': {
    borderLeftWidth: '2px',
    borderLeftColor: '#e0e0e0',
  },
  '&dark .cm-activeLine': {
    backgroundColor: '#2a2a2a',
  },
  '&dark.cm-focused .cm-selectionBackground, &dark .cm-selectionBackground': {
    backgroundColor: '#264f78',
  },
  '&dark .cm-gutters': {
    backgroundColor: '#252526',
    color: '#858585',
    borderRight: '1px solid #3a3a3a',
  },
  '&dark .cm-activeLineGutter': {
    backgroundColor: '#2a2a2a',
  },
});

// ── Light-mode theme marker (non-dark) ───────────────────────────────────────

/**
 * Thin `EditorView.theme()` extension (no `dark: true`) that marks the editor
 * as a light theme so `&light` rules in `_notepadBase` fire correctly.
 *
 * The `themeCompartment` swaps between this and a dark marker depending on the
 * user's theme preference.  For `system`/`light`, use `notepadLightTheme`
 * (which includes both this marker and the base rules).
 */
export const notepadLightMarker: Extension = EditorView.theme({}, { dark: false });

/**
 * Complete Notepad++ light theme extension combining structural base-theme
 * rules (`_notepadBase`) with the non-dark theme marker (`notepadLightMarker`).
 *
 * Include this in the editor's extensions or in the `themeCompartment` for
 * system/light mode.
 */
export const notepadLightTheme: Extension = [_notepadBase, notepadLightMarker];

/**
 * The structural base theme (CSS only, no light/dark marker). Both `&light` and
 * `&dark` scoped rules live here; which set fires depends on the active marker.
 *
 * Put THIS in sharedExtensions (always present, both scopes available) and let
 * the themeCompartment supply ONLY the marker (`notepadLightMarker` /
 * `notepadDarkMarker`). Keeping a single marker in the compartment avoids the
 * light/dark marker conflict that previously left the caret and font unstyled.
 */
export const notepadBase: Extension = _notepadBase;

/** Dark-mode marker (sets CM6's darkTheme facet true → `&dark` rules fire). */
export const notepadDarkMarker: Extension = EditorView.theme({}, { dark: true });

/** Complete dark theme (base rules + dark marker) — for the themeCompartment. */
export const notepadDarkTheme: Extension = [_notepadBase, notepadDarkMarker];

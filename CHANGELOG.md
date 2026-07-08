# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] — 2026-07-08

### Added

- **Split view (two editor panes)** — a faithful Notepad++ two-view layout.
  `View → Split Horizontal` stacks a second editor pane below; `Split Vertical`
  places it side-by-side. Each pane has its own tab strip, and every open
  document belongs to exactly one pane. Right-click a tab → **Move to Other
  View** to relocate it. The pane you last clicked is the focused pane that
  Find/Replace, the status bar, macros, the Lua Console, and menu commands act
  on. Choosing Split again collapses back to a single pane, as does closing the
  last tab in the secondary pane. The split layout — which files are in which
  pane, the orientation, and each pane's active tab — is restored on reload.

### Fixed

- **New tabs focus the editor.** Opening a tab via the `+` button or
  `File → New` now places the caret in the text area so you can type
  immediately, without clicking first.
- **Switching tabs focuses the editor.** Activating an existing tab (including
  from the `>>` overflow dropdown) focuses its editor pane.
- **Reload focuses the editor.** After a page reload, the active document's
  editor is focused so you can keep typing right away.

## [0.2.0] — 2026-07-03

### Changed

- **Renamed the project to Notepad Web.** The Chrome extension ID, IndexedDB
  store name, and npm package name are now `notepad-web`. Existing local session
  data stored under the previous `notepad-ts` store name is **not migrated** —
  users upgrading from v0.1.0 will start with a fresh session.
- **Engine re-base: Monaco → CodeMirror 6 + Wasmoon.**
  The editor core is now CodeMirror 6 (`@codemirror/*`, `@lezer/*`).
  Wasmoon (Lua 5.4 in WASM) executes the real NotepadNext `init.lua` and
  per-language `.lua` palette files inside the extension, with no remote
  requests — satisfying the MV3 `script-src 'self' 'wasm-unsafe-eval'` CSP.
- Session restore now also restores each document's cursor position and scroll
  offset on reload.

### Added

**Phase 1-3 — engine, theme, chrome:**

- **Faithful Notepad++ light theme** — token colours, status bar colour
  `rgb(240,240,240)`, and chrome reproduced from the `.lua`-driven palette.
- **`.lua`-driven language detection** — file extension → language name
  resolved via the real NotepadNext Lua language registry.
- **tabSize / wordWrap settings** with per-tab state; new tabs inherit the
  current tab's settings.
- **Menu bar** (File / Edit / View / Search / Language / Tools) with keyboard
  accelerators; menus are wired to all editor commands.
- **Toolbar (action bar)** below the menu bar — icon buttons for New / Open /
  Save / Save All / Close / Close All, Cut / Copy / Paste, Undo / Redo,
  Find / Replace, Zoom In / Out, Word Wrap, Show All Characters, and the macro
  actions (faithful to NotepadNext `mainToolBar`, using NotepadNext's own icon
  PNGs bundled locally — no remote requests).
- **Tab overflow** — a `>>` chevron reveals tabs that do not fit when the
  window is narrow, via a dropdown (faithful to Notepad++).
- **Right-click context menus** — editor menu (Undo / Redo / Cut / Copy / Paste
  / Delete / Select All, with faithful right-click caret behaviour) and tab menu
  (Close / Close All Except Active / to Left / to Right / Save / Save As /
  Reload / Copy File Name).
- **Dockview multi-pane dock panels** — Document Map, Function List panel
  structure using `dockview-core`.
- **Wasmoon smoke e2e test** — asserts `1 + 1 = 2` runs in Lua-in-WASM under
  the MV3 CSP, proving the local wasm load works end-to-end.
- **CDN dead-string neutralization** — `string-replace-loader` removes the
  inert `https://unpkg.com/wasmoon@…` fallback literal from the wasmoon UMD
  bundle at build time (`grep -c unpkg.com dist/*.js` = 0).
- **Hardened manifest-compliance check** — `scripts/package.mjs` now also
  scans `dist/*.js` for CDN/remote URL literals (`checkNoRemoteCode`) and
  throws if any are found; covered by new unit tests in
  `scripts/package.test.mjs`.
- GPL-3.0-or-later license and OSS governance documents
  (`THIRD_PARTY_LICENSES.md` updated for CM6 + Wasmoon deps).
- GitHub Actions CI workflow (lint, typecheck, unit tests, build, E2E tests).

**Phase 4 — editor decorators:**

- **Bookmarks**: gutter markers, toggle (Ctrl+F2), next/prev (F2/Shift+F2),
  clear all, invert, cut/copy/delete bookmarked lines (`BookMarkDecorator`).
- **Mark All Occurrences**: 3 distinct mark styles + Clear per-style / Clear
  All (`MarkerAppDecorator`).
- **Clickable URL links**: Ctrl/Cmd+click opens URLs in a new tab
  (`URLFinder`).
- **HTML tag auto-close**: typing `>` automatically closes the open tag
  (`HTMLAutoCompleteDecorator`).
- **Bracket matching**, selection-match highlighting, word autocompletion, and
  auto-close/surround brackets.

**Phase 5 — Macros + Lua Console:**

- **Macro record/replay**: Start/Stop Recording, Playback (Ctrl+Shift+P), Run
  a Macro Multiple Times (N times or to end-of-file), Save Current Recorded
  Macro, run saved macros (`Macro`/`MacroManager`).
- **Lua Console dock**: persistent Wasmoon REPL with an `editor` API bridge
  over the active document (`LuaConsoleDock`/`LuaExtension`).

**Phase 6 — Search system:**

- **3-tab Find / Replace / Mark dialog** (Ctrl+F / Ctrl+H) with match-case,
  whole-word, wrap-around, backwards, and Normal/Extended/Regex search modes;
  MRU history (`FindReplaceDialog`).
- **Find in all open documents** → clickable Search Results dock
  (`SearchResultsDock`).
- **Mark All** (dedicated highlight) + Copy Marked Text; **Search-and-Bookmark**
  (bookmark all lines matching the search term).

**Eyeball-round fixes (pre-release polish):**

- **Toolbar**: icon buttons render at correct sizes; active-state highlight
  restored after BUG-10 (leading menu icons) fix.
- **Tab overflow**: `>>` chevron dropdown now appears when tabs exceed the
  tab-bar width on narrow windows (faithful to Notepad++ behaviour).
- **Right-click context menus**: editor and tab context menus restored; caret
  moves to right-click position only when clicking outside an existing selection
  (faithful NotepadNext behaviour).
- **Floating dialogs**: Find/Replace and other dialogs float correctly outside
  the `#app` grid after BUG-12 CSS overlay fix.
- **Global shortcuts**: Ctrl+F / Ctrl+H / Ctrl+Shift+P wired end-to-end.
- **Editor scroll**: cursor/scroll position restored on session reload.
- **Tab-indent**: Tab key now indents (via `indentWithTab`) instead of moving
  focus (BUG-13).
- **Per-tab font**: font-size zoom setting is now scoped per tab.
- **Menu icons**: leading icons in menus render at correct 16 px (BUG-10).
- **Language grouping**: Language menu sub-menus grouped by first letter (BUG-11).

### Removed

- Monaco editor and `monaco-editor-webpack-plugin` (replaced by CodeMirror 6).

### Known limitations / deferred

- **EditorConfig (`.editorconfig`) support is NOT included.** Walking parent
  directories to discover `.editorconfig` files is not permitted by the File
  System Access API for single-file opens; deferred to a future release.
- **Find-in-Files searches only open documents.** Directory-recursive search
  requires broad file-system access that exceeds browser sandbox constraints;
  this behaviour is faithful to NotepadNext, which also does not recurse
  directories from the search dialog.
- **Recent Files require re-picking.** The File System Access API does not
  provide a mechanism to persist file handles across browser sessions, so
  reopening a recent file always triggers a new file-picker.

---

## [0.1.0] — Initial MVP

### Added

- Initial MVP: Monaco editor, multi-tab support, open/save files via File
  System Access API with upload/download fallback, session restore for unsaved
  buffers, settings panel, light/dark/follow-OS themes.
- GPL-3.0-or-later license and OSS governance documents.
- GitHub Actions CI workflow (lint, typecheck, unit tests, build, E2E tests).

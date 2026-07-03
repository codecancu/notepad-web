# Notepad Web — Faithful Port Plan (NotepadNext → Web/Extension)

## Context

NotepadNext is a Qt/C++/Scintilla desktop reimplementation of Notepad++. We are porting its **functionality faithfully** to a Chrome MV3 extension. The first MVP used Monaco and looked like VS Code; per user direction we re-base on a fidelity-first stack and drive every UI/behavior decision from the actual source (not invented).

**Locked technology stack (user-approved):**

- **CodeMirror 6** editor core (fully skinnable → real Notepad++ look, no VS Code chrome)
- **Wasmoon** (Lua 5.4 in WASM) — runs the _actual_ `src/scripts/init.lua` + `src/languages/*.lua` for the language registry/styles, and powers the Lua console
- **dockview** — real dockable panels (replicates Qt-Advanced-Docking-System)
- `.lua` data drives highlighting (extensions, keyword sets, exact style colors)

**Source of truth:** `/Users/phienle-mac/workspaces/NotepadNext/src` (read-only reference). Repo: `/Users/phienle-mac/workspaces/NotepadNext/notepad-ts` (GPL-3, branch `feature/port-chrome-extension`).

**Faithfulness principle:** functionality/logic is read from source; only _technology_ choices are surfaced for approval.

## Execution prerequisite (BLOCKER)

Subagent-driven execution needs `Bash(npm/npx/node:*)` permission (cleared by a `/model` reset; the safety classifier blocks the agent from self-granting it). **The user must add it** (`/permissions` or `.claude/settings.local.json`). git/Read/Edit/Write already work for subagents. The project has been relocated under the session root so subagents can reach it.

---

## Phased roadmap (each phase is review-gated, shippable)

### Phase 1 — Core swap + faithful highlighting + theme _(fixes the "looks like VS Code" complaint)_

Tasks P1.1–P1.7 (already broken out):

- **P1.1** swap Monaco→CM6, integrate Wasmoon (load smoke under MV3 CSP, wasm bundled locally), build green, quarantine Monaco-coupled tests.
- **P1.2** `EditorController` on CM6 (EditorState per doc, switch correctness).
- **P1.3** bundle `init.lua` + `languages/*.lua` (GPL, copied from source); Wasmoon `require`-resolver runs `init.lua`; expose `getLanguage(name)→{lexer,extensions,keywords,styles,first_line,...}`.
- **P1.4** highlight bridge: detect language by extension/first-line (from `.lua`, mirrors `DetectLanguageFromContents`); CM6 `HighlightStyle` built from `.lua` `styles` palette (exact colors, e.g. keyword `#0000FF`, type `#8000FF`, number `#FF8000`, string `#808080`, operator `#000080`, preprocessor `#804000`).
- **P1.5** faithful light theme + chrome from `src/stylesheets/npp.css` (gray tabs `#C0C0C0`, active `#F0F0F0` + orange accent `#FFCAB0`, caret width 2, current-line, light status bar).
- **P1.6** reconcile existing features on CM6 (tabs, FSA open/save, autosave/session, settings via CM6 compartments); re-enable quarantined e2e on CM6.
- **P1.7** governance/CI/THIRD_PARTY (CM6/Wasmoon MIT) touch-up + whole-phase review.

### Phase 2 — Real menu bar (`MainWindow.ui` structure)

8 menus exactly as source: **File · Edit · Search · View · Language · Settings · Macro · Help**, with submenus (Close More, Recent Files, Copy More/Copy As, Indent, EOL Conversion, Convert Case, Line Operations, Comment/Uncomment, Encoding/Decoding, Bookmarks, Mark All Occurrences/Clear Marks, Zoom, Show Symbol, Fold/Unfold Level). Wire each action to its handler (built progressively across later phases); items not yet backed are wired as they land. Keyboard shortcuts mirror source (cross-platform `ControlOrMeta`).

### Phase 3 — dockview panels (`src/docks/`)

FileList (open files + dirty state), FolderAsWorkspace (File System Access **directory handle** → tree), SearchResults (tree, `searchResultActivated`), LuaConsole (Wasmoon REPL + history), EditorInspector, LanguageInspector, DebugLog. Map `toggleViewAction()` → View/Help menu items.

### Phase 4 — Editor features / decorators (`src/decorators/` + Edit-menu ops)

- CM6 built-ins to enable: AutoCompletion, AutoIndentation, LineNumbers, bracketMatching, highlightSelectionMatches, multi-selection, fold gutter, whitespace/indent-guide rendering, zoom (font compartment).
- Port: SurroundSelection, HTML tag auto-close, URLFinder (clickable links), BookMark system (toggle/navigate/operate-on-marked-lines), MarkerAppDecorator (3 mark styles), HighlightedScrollBar (tick marks), EditorConfig (`.editorconfig` via `editorconfig` npm).
- Line Operations (port from `Sorter`/`ScintillaSorter`/`ScintillaNext`): sort (case-sensitive/insensitive/by-length, asc/desc), reverse, duplicate, split, join, move up/down, remove empty / duplicate / consecutive-duplicate lines.
- Encoding/Decoding ops: Base64 / URL encode+decode (trivial, Web APIs).
- Convert Case (upper/lower); EOL Conversion (LF/CRLF/CR via `applyEol`); Column/block editor.

### Phase 5 — Macros + Lua console

- Macro record/replay reimplemented on **CM6 transactions** (record document ops + commands; replay N times / till-EOF), mirroring `Macro`/`MacroStep`/`MacroManager`; editor dialog + persistence (IndexedDB).
- Lua console fully wired via Wasmoon with an `editor` API wrapper (mirror the `editor.Style*`/`KeyWords`/`Property`/`UseTabs`/`TabWidth` surface from `LuaExtension.cpp`).

### Phase 6 — Search system (`Finder`/`QRegexSearch`/`SearchResultsCollector`)

Find/Find-Next/Prev/Replace/Replace-All, whole-word/match-case/**regex** (JS `RegExp`, backrefs `$1`), Go to Line, Quick Find widget, Find-in-Files (across open docs + FSA directory) → SearchResults dock; Mark-All-Occurrences; Search-and-Bookmark.

### Phase 7 — Session / settings / polish / release

- Full session restore (FSA handles + unsaved/temp buffer content + caret/selection/fold/bookmarks/scroll), Recent Files (`RecentFilesListManager`), Preferences UI (`PreferencesDialog` settings: show-symbol/word-wrap/font/EOL/word-chars/url-highlight/…), Export as HTML (`HtmlConverter` equivalent).
- Governance/CI refresh, manifest-compliance package, tag `v0.2.0`.

---

## Browser-infeasible / deferred (documented, not silently dropped)

- **Print** (Ctrl+P) — `window.print()` is a poor analog; defer.
- **Export/Copy as RTF** — defer (HTML export covered).
- **Non-UTF-8 encoding detection/conversion** (uchardet) — MVP is UTF-8 + BOM; optional `jschardet` later.
- **Move to Trash / Rename on disk** — partial via File System Access API; subject to permission.
- **Check for Updates / About Qt** — N/A (Web Store handles updates).

## Verification (per phase)

- Unit (Vitest): pure logic (registry from `.lua`, language detection, line ops, encoding, macro model).
- e2e (Playwright, `--no-sandbox`, `ControlOrMeta`): mount, type, tabs, open/save (mocked FSA), session reload, menu actions, find/replace, dock toggles, theme.
- Gates: `npm run build/lint/typecheck/test/test:e2e` green; manifest compliance (`scripts/package.mjs`) stays MV3 + `permissions:["storage"]` + exact CSP (+ `wasm-unsafe-eval` for Wasmoon, all wasm local) + no remote code.

## Key source references

- Menus: `src/dialogs/MainWindow.ui` + `MainWindow.cpp`
- Palette/styles + language data: `src/languages/*.lua`, `src/scripts/init.lua`
- Chrome theme: `src/stylesheets/npp.css`
- Decorators: `src/decorators/*`
- Docks: `src/docks/*`
- Macros: `src/Macro*.{h,cpp}`, `MacroManager`, `MacroRecorder`
- Search: `src/Finder.cpp`, `QRegexSearch.cpp`, `SearchResultsCollector`
- Encoding/EOL: `src/ScintillaNext.cpp` (BomType, eolMode)
- Session/settings: `SessionManager`, `ApplicationSettings`, `RecentFilesListManager`
- Lua bridge: `src/LuaExtension.cpp`

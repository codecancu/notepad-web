# Third-Party Licenses

This project bundles or depends on the following third-party packages.

## Runtime dependencies

### CodeMirror 6 (`@codemirror/*`)

- License: MIT
- Repository: <https://github.com/codemirror/dev>
- Packages bundled: `@codemirror/autocomplete`, `@codemirror/commands`,
  `@codemirror/lang-cpp`, `@codemirror/lang-css`, `@codemirror/lang-html`,
  `@codemirror/lang-java`, `@codemirror/lang-javascript`,
  `@codemirror/lang-json`, `@codemirror/lang-markdown`, `@codemirror/lang-php`,
  `@codemirror/lang-python`, `@codemirror/lang-rust`, `@codemirror/lang-sql`,
  `@codemirror/lang-xml`, `@codemirror/language`, `@codemirror/search`,
  `@codemirror/state`, `@codemirror/view`.
- All packages are MIT-licensed and bundled into the extension's `dist/`
  directory.

### CodeMirror legacy-modes (`@codemirror/legacy-modes`)

- License: MIT
- Repository: <https://github.com/codemirror/legacy-modes>
- Provides StreamLanguage adapters for languages not yet ported to the Lezer
  parser ecosystem.  Bundled into `dist/`.

### Lezer (`@lezer/*`)

- License: MIT
- Repository: <https://github.com/lezer-parser>
- Packages bundled: `@lezer/highlight` (and transitive Lezer grammar packages
  pulled in by the `@codemirror/lang-*` packages above).
- Bundled into `dist/`.

### wasmoon

- License: MIT
- Repository: <https://github.com/nicowillis/wasmoon>
- Bundles `glue.wasm` (compiled from the Lua 5.4 reference implementation,
  MIT-licensed by the Lua authors).
- The UMD bundle contains one inert dead-code string
  `https://unpkg.com/wasmoon@…/dist/glue.wasm`; this string is never executed
  because `LuaFactory` is always constructed with a local
  `chrome-extension://…/glue.wasm` URI.  The literal is neutralized at webpack
  build time via `string-replace-loader` so it does not appear in `dist/`.

### dockview-core

- License: MIT
- Repository: <https://github.com/mathuo/dockview>
- Provides the dock/panel layout engine used for the Document Map, Function
  List, Lua Console, and Search Results panels.  Bundled into `dist/`.

### NotepadNext Lua language data (bundled under `src/lua-data/`)

- License: GPL-3.0-or-later
- Repository: <https://github.com/dail8859/NotepadNext>
- The `.lua` files in `src/lua-data/` are derived from NotepadNext's language
  definition and colour-scheme Lua scripts.  They are part of this project's
  GPL-3.0-or-later code base and are covered by this project's own `LICENSE`
  file.
- MIT is GPL-3.0-compatible.  No GPL-incompatible runtime dependencies are
  shipped.

### NotepadNext toolbar icons (bundled under `public/icons/` → `dist/icons/`)

- License: GPL-3.0-or-later (NotepadNext project)
- Repository: <https://github.com/dail8859/NotepadNext>
- The PNG files in `public/icons/` (newfile.png, openFile.png, saved.png,
  saveAll.png, closeFile.png, closeAll.png, cut.png, copy.png, paste.png,
  undo.png, redo.png, find.png, findReplace.png, zoomIn.png, zoomOut.png,
  wrap.png, invisibleChar.png, indentGuide.png, startRecord.png, stopRecord.png,
  playRecord.png, playRecord_m.png, saveRecord.png) are taken from the
  NotepadNext source tree and are covered by NotepadNext's GPL-3.0-or-later
  license, which is compatible with this project's own GPL-3.0-or-later license.
- **FamFamFam Silk icon set attribution**: Several of these icons
  (including cut, copy, paste, undo, redo, find, and others) match the
  FamFamFam Silk icon set by Mark James, which is licensed under
  [Creative Commons Attribution 2.5](https://creativecommons.org/licenses/by/2.5/).
  Original set: <http://www.famfamfam.com/lab/icons/silk/>.
  NotepadNext incorporates these without a separate attribution file; this
  project credits the original author here.  GPL-3.0-or-later is compatible
  with CC-BY-2.5 for distribution purposes.

## Development-only dependencies (not bundled in the extension)

| Package | License |
|---|---|
| webpack, webpack-cli | MIT |
| ts-loader, css-loader, style-loader, copy-webpack-plugin, html-webpack-plugin | MIT |
| string-replace-loader | MIT |
| typescript, typescript-eslint | Apache-2.0 |
| eslint, @typescript-eslint/eslint-plugin, @typescript-eslint/parser | MIT |
| prettier | MIT |
| vitest, happy-dom, fake-indexeddb | MIT |
| @playwright/test | Apache-2.0 |
| @types/chrome | MIT |
| globals | MIT |
| http-server | MIT |

Development dependencies are used only during the build and test pipeline and
are not distributed to end users.

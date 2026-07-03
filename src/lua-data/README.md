# Lua Language Data

This directory contains Lua source files copied from the
[NotepadNext](https://github.com/dail8859/NotepadNext) project, used to build
the faithful language registry for NotePad Web.

- `init.lua` — entry point; defines `rgb()`, `DetectLanguageFromContents`, and
  builds the `languages` global table by requiring all per-language modules.
- `languages/` — per-language modules (87 files), one per supported language.
  Each returns a table with `lexer`, `extensions`, `keywords`, `styles`, etc.

**License:** GPL-3.0-or-later (same as NotepadNext and this project).

These files are loaded at runtime into a Wasmoon (Lua-in-WASM) engine to
produce the real language registry without any hand-maintained translation.

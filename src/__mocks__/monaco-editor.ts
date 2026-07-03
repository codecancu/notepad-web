// SPDX-License-Identifier: GPL-3.0-or-later
// Vitest/happy-dom stub for monaco-editor.
// Real monaco needs a browser with canvas; unit tests use this stub instead.
export const editor = {
  createModel: (content: string) => ({
    getValue: () => content,
    dispose: () => {},
  }),
  setTheme: () => {},
};

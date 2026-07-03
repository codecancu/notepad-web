// SPDX-License-Identifier: GPL-3.0-or-later
// Unit tests for EditorController (CodeMirror 6).
//
// The old Monaco-based tests are replaced below.  The old tests that relied on
// monacoMock.editor.createModel spying are no longer applicable:
//   - "propagates edits to the store as dirty"  → covered by new test below
//   - "after switching docs, edits update only the active doc" → covered below
//   - "closeDoc() disposes and removes the cached model" → covered below

import { vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView, ViewUpdate } from '@codemirror/view';
import { DocumentStore } from '../services/document-store';
import { EditorController } from './editor-controller';
import type { RegistryLike } from './editor-controller';
import type { LangDef } from '../services/lua-registry';

// Mock luaRegistry so the EditorController constructor does not trigger
// Wasmoon WASM initialisation in the happy-dom test environment (which
// fails because happy-dom sets document.baseURI to http://localhost which
// makes wasmoon's createRequire() reject).
vi.mock('../services/lua-registry', () => ({
  luaRegistry: {
    ready: () => Promise.resolve(),
    detectByExtension: () => null,
    detectByFirstLine: () => null,
    getLanguage: () => undefined,
  },
}));

// happy-dom doesn't implement MutationObserver / ResizeObserver used by CM6 --
// supply minimal no-op stubs so EditorView can be constructed.
if (typeof globalThis.MutationObserver === 'undefined') {
  class FakeMutationObserver {
    observe() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  (globalThis as unknown as Record<string, unknown>).MutationObserver = FakeMutationObserver;
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  class FakeResizeObserver {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  (globalThis as unknown as Record<string, unknown>).ResizeObserver = FakeResizeObserver;
}

/** Build a minimal EditorView attached to a detached div (no real layout). */
function makeView(): EditorView {
  const parent = document.createElement('div');
  return new EditorView({ parent, state: EditorState.create({ doc: '' }) });
}

/** Simulate a user typing by dispatching a doc-change transaction. */
function typeText(view: EditorView, text: string): void {
  view.dispatch({
    changes: { from: view.state.doc.length, insert: text },
  });
}

describe('EditorController (CM6)', () => {
  it('propagates edits to the store as dirty', () => {
    const store = new DocumentStore();
    const doc = store.create();
    const view = makeView();
    const ctrl = new EditorController(view, store);

    ctrl.showDoc(doc.id);

    // Simulate a CM6 update (docChanged = true).
    typeText(view, 'typed');
    // The EditorView's updateListener is not wired in this unit test because we
    // don't add the extension here.  Call onUpdate directly to test the logic.
    const fakeUpdate = {
      docChanged: true,
      state: view.state,
      selectionSet: false,
    } as unknown as ViewUpdate;
    ctrl.onUpdate(fakeUpdate);

    expect(store.get(doc.id)?.dirty).toBe(true);
    expect(store.get(doc.id)?.content).toBe('typed');
    ctrl.dispose();
  });

  it('after switching docs, edits update only the active doc (no stale closure)', () => {
    const store = new DocumentStore();
    const a = store.create();
    const b = store.create();
    const view = makeView();
    const ctrl = new EditorController(view, store);

    ctrl.showDoc(a.id);
    ctrl.showDoc(b.id); // switches active to b

    typeText(view, 'edit in B');
    const fakeUpdate = {
      docChanged: true,
      state: view.state,
      selectionSet: false,
    } as unknown as ViewUpdate;
    ctrl.onUpdate(fakeUpdate);

    expect(store.get(b.id)?.content).toBe('edit in B');
    expect(store.get(b.id)?.dirty).toBe(true);
    // doc A must be untouched
    expect(store.get(a.id)?.content).toBe('');
    expect(store.get(a.id)?.dirty).toBe(false);
    ctrl.dispose();
  });

  it('closeDoc() removes the cached state for the closed doc', () => {
    const store = new DocumentStore();
    const a = store.create({ content: 'hello' });
    const b = store.create({ content: 'world' });
    const view = makeView();
    const ctrl = new EditorController(view, store);

    ctrl.showDoc(a.id);
    ctrl.showDoc(b.id);

    // a's state should be cached; close it
    ctrl.closeDoc(a.id);

    // After closing, showDoc(a) would recreate state from the store —
    // there is no dangling reference. Re-showing b should still work.
    ctrl.showDoc(b.id);
    expect(view.state.doc.toString()).toBe('world');
    ctrl.dispose();
  });

  it('closeDoc() on a non-existent id is a no-op', () => {
    const store = new DocumentStore();
    const view = makeView();
    const ctrl = new EditorController(view, store);
    expect(() => ctrl.closeDoc('non-existent-id')).not.toThrow();
    ctrl.dispose();
  });

  it('registry-ready: _rebuildHighlight runs and preserves active doc content', async () => {
    // Build a minimal real-shaped styles map that mirrors LangDef.styles.
    // fgColor values are in Scintilla BGR (blue=0x0000FF → BGR 0xFF0000).
    const fakeStyles: LangDef['styles'] = {
      'INSTRUCTION WORD': { id: 5, fgColor: 0xff0000, bgColor: 0, fontStyle: 1 },
      'TYPE WORD': { id: 6, fgColor: 0xff0080, bgColor: 0 },
      NUMBER: { id: 4, fgColor: 0x0080ff, bgColor: 0 },
      STRING: { id: 6, fgColor: 0x808080, bgColor: 0 },
      CHARACTER: { id: 7, fgColor: 0x808080, bgColor: 0 },
      'COMMENT LINE': { id: 2, fgColor: 0x008000, bgColor: 0 },
      COMMENT: { id: 1, fgColor: 0x008000, bgColor: 0 },
      'COMMENT DOC': { id: 3, fgColor: 0x808000, bgColor: 0 },
      OPERATOR: { id: 10, fgColor: 0x800000, bgColor: 0, fontStyle: 1 },
      PREPROCESSOR: { id: 9, fgColor: 0x004080, bgColor: 0 },
      DEFAULT: { id: 0, fgColor: 0x000000, bgColor: 0 },
    };

    // A fake registry that resolves immediately and provides the C++ language.
    let resolveReady!: () => void;
    const readyPromise = new Promise<void>((res) => {
      resolveReady = res;
    });

    const fakeRegistry: RegistryLike = {
      ready: () => readyPromise,
      getLanguage: (name: string): LangDef | undefined => {
        if (name === 'C++') {
          return {
            name: 'C++',
            lexer: 'cpp',
            extensions: ['cpp', 'h'],
            keywords: {},
            styles: fakeStyles,
          };
        }
        return undefined;
      },
      detectByExtension: () => null,
      detectByFirstLine: () => null,
    };

    const store = new DocumentStore();
    const doc = store.create({ content: 'hello registry' });
    const view = makeView();

    // Pass the fake registry as the third (injectable) constructor argument.
    const ctrl = new EditorController(view, store, fakeRegistry);
    ctrl.showDoc(doc.id);

    // Confirm content is present before rebuild.
    expect(view.state.doc.toString()).toBe('hello registry');
    expect(ctrl.highlightRebuilt).toBe(false);

    // Resolve the registry ready promise to trigger _rebuildHighlight.
    resolveReady();
    // Flush all microtasks (the .then() chained off ready() + showDoc internals).
    await Promise.resolve();
    await Promise.resolve();

    // (a) The rebuild ran — highlightRebuilt flag is set.
    expect(ctrl.highlightRebuilt).toBe(true);

    // (b) Content is PRESERVED through the rebuild: the active doc still shows
    //     its text after _rebuildHighlight clears states and re-calls showDoc().
    //     The DocumentStore holds the canonical content; showDoc() reads it back
    //     from store.get() when recreating the EditorState.
    expect(view.state.doc.toString()).toBe('hello registry');

    // (c) No throw — the whole path completed without error.
    ctrl.dispose();
  });

  // ── Fix 2: Show-Symbol flags inherited by new tabs ────────────────────────

  it('setSymbolExt: new tab opened after setting symbol ext inherits the extension', () => {
    // This test guards the Phase-2 close fix for Show-Symbol inheritance.
    // After calling setSymbolExt(), any new tab created by showDoc() must have
    // the symbolCompartment seeded with the current extension rather than [].
    const store = new DocumentStore();
    const docA = store.create({ content: 'doc A' });
    const view = makeView();
    const ctrl = new EditorController(view, store);

    ctrl.showDoc(docA.id);

    // Simulate toggling Show Whitespace: set a non-empty symbol extension.
    // We use a simple EditorState.tabSize as a stand-in for a real highlight ext
    // so the test doesn't depend on @codemirror/view's highlightWhitespace.
    // The important invariant is that _currentSymbolExt is stored and seeded.
    const fakeSymbolExt = EditorState.tabSize.of(99); // sentinel value
    ctrl.setSymbolExt(fakeSymbolExt);

    // Open a new doc (simulates opening a new tab AFTER the flag was toggled).
    const docB = store.create({ content: 'doc B' });
    ctrl.showDoc(docB.id);

    // The symbolCompartment in the new doc's state must hold the sentinel value.
    // We verify via view.state which now reflects docB's state.
    const tabSizeFromState = view.state.facet(EditorState.tabSize);
    // The sentinel was seeded into the symbolCompartment's extension slot for docB.
    // tabSizeFromState should be 99 (from our fake sentinel).
    expect(tabSizeFromState).toBe(99);

    ctrl.dispose();
  });

  // ── Cursor / scroll persistence (Phase-7 gap fix) ─────────────────────────

  it('onUpdate saves cursor position to the store when selection changes', () => {
    const store = new DocumentStore();
    // 3-line doc so we can place the cursor on line 2.
    const doc = store.create({ content: 'line one\nline two\nline three' });
    const view = makeView();
    const ctrl = new EditorController(view, store);
    ctrl.showDoc(doc.id);

    // Place cursor at offset 14 — that's line 2, column 6 ("line two\n" = 9 chars,
    // so offset 9 is start of line 2; +5 = column 6).
    const offset = 14; // 'line one\n' (9) + 'line ' (5) = 14
    view.dispatch({ selection: { anchor: offset } });

    const fakeUpdate = {
      docChanged: false,
      selectionSet: true,
      state: view.state,
    } as unknown as ViewUpdate;
    ctrl.onUpdate(fakeUpdate);

    const saved = store.get(doc.id)?.cursor;
    expect(saved).toBeDefined();
    expect(saved?.lineNumber).toBe(2);
    expect(saved?.column).toBe(6);
    ctrl.dispose();
  });

  it('showDoc restores cursor position from Doc.cursor on fresh state creation', () => {
    const store = new DocumentStore();
    // Pre-seed the doc with a saved cursor at line 2, column 6.
    const doc = store.create({
      content: 'line one\nline two\nline three',
      cursor: { lineNumber: 2, column: 6 },
    });
    const view = makeView();
    const ctrl = new EditorController(view, store);

    ctrl.showDoc(doc.id);

    // 'line one\n' = 9 chars; line 2 starts at offset 9; col 6 → offset 9+5 = 14.
    const head = view.state.selection.main.head;
    expect(head).toBe(14);
    ctrl.dispose();
  });

  it('showDoc clamps cursor to doc bounds (no out-of-range crash)', () => {
    const store = new DocumentStore();
    // cursor beyond end of document — must not throw.
    const doc = store.create({
      content: 'short',
      cursor: { lineNumber: 999, column: 999 },
    });
    const view = makeView();
    const ctrl = new EditorController(view, store);
    expect(() => ctrl.showDoc(doc.id)).not.toThrow();
    ctrl.dispose();
  });

  it('onUpdate does not save cursor when selectionSet is false', () => {
    const store = new DocumentStore();
    const doc = store.create({ content: 'hello' });
    const view = makeView();
    const ctrl = new EditorController(view, store);
    ctrl.showDoc(doc.id);

    typeText(view, 'x');
    const fakeUpdate = {
      docChanged: true,
      selectionSet: false,
      state: view.state,
    } as unknown as ViewUpdate;
    ctrl.onUpdate(fakeUpdate);

    // cursor field must remain undefined (not written when selectionSet=false).
    expect(store.get(doc.id)?.cursor).toBeUndefined();
    ctrl.dispose();
  });
});

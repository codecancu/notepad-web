// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach } from 'vitest';
import { mountEditorInspectorPanel } from './editor-inspector-panel';
import { DocumentStore } from '../services/document-store';
import type { EditorView } from '@codemirror/view';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeEl(): HTMLDivElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

/** Build a minimal fake EditorView with a controllable selection state. */
function makeFakeView(
  selectionRanges: Array<{ anchor: number; head: number; from: number; to: number }> = [],
  docLength = 42,
  docLines = 3,
): { current: EditorView | null } {
  const fakeView = {
    state: {
      selection: {
        main: { head: 0 },
        ranges: selectionRanges.map((r) => ({
          anchor: r.anchor,
          head: r.head,
          from: r.from,
          to: r.to,
          empty: r.from === r.to,
        })),
      },
      doc: {
        length: docLength,
        lines: docLines,
      },
    },
  } as unknown as EditorView;
  return { current: fakeView };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('EditorInspectorPanel', () => {
  let store: DocumentStore;
  let el: HTMLDivElement;

  beforeEach(() => {
    store = new DocumentStore();
    el = makeEl();
  });

  it('renders the panel header', () => {
    const viewRef = makeFakeView();
    mountEditorInspectorPanel(el, store, viewRef);
    expect(el.textContent).toContain('Editor Inspector');
  });

  it('shows initial caret as Ln 1, Col 1', () => {
    const viewRef = makeFakeView();
    mountEditorInspectorPanel(el, store, viewRef);
    expect(el.textContent).toContain('Ln 1, Col 1');
  });

  it('shows "none" selection when no selection is active', () => {
    const viewRef = makeFakeView([{ anchor: 5, head: 5, from: 5, to: 5 }]);
    mountEditorInspectorPanel(el, store, viewRef);
    expect(el.textContent).toContain('none');
  });

  it('shows selection char count when text is selected', () => {
    const viewRef = makeFakeView([{ anchor: 0, head: 10, from: 0, to: 10 }]);
    mountEditorInspectorPanel(el, store, viewRef);
    expect(el.textContent).toContain('10 chars');
  });

  it('shows range anchor→head for non-empty selections', () => {
    const viewRef = makeFakeView([{ anchor: 2, head: 8, from: 2, to: 8 }]);
    mountEditorInspectorPanel(el, store, viewRef);
    expect(el.textContent).toContain('2→8');
  });

  it('shows document length from fake view state', () => {
    const viewRef = makeFakeView([], 42, 3);
    mountEditorInspectorPanel(el, store, viewRef);
    expect(el.textContent).toContain('42 chars');
    expect(el.textContent).toContain('3 lines');
  });

  it('shows EOL, language, dirty, and BOM from store', () => {
    const doc = store.create({
      name: 'test.ts',
      languageId: 'TypeScript',
      eol: 'crlf',
      dirty: true,
      bom: true,
    });
    void doc;
    const viewRef = makeFakeView();
    mountEditorInspectorPanel(el, store, viewRef);
    expect(el.textContent).toContain('CRLF');
    expect(el.textContent).toContain('TypeScript');
    expect(el.textContent).toContain('yes');
    expect(el.textContent).toContain('UTF-8 BOM');
  });

  it('re-renders when the store changes (reactive)', () => {
    const viewRef = makeFakeView();
    mountEditorInspectorPanel(el, store, viewRef);

    // No doc yet — language shows —
    expect(el.textContent).toContain('—');

    // Add a doc — panel should update.
    store.create({ name: 'new.py', languageId: 'Python' });
    expect(el.textContent).toContain('Python');
    expect(el.textContent).toContain('new.py');
  });

  it('updates caret on cm-cursor-change event', () => {
    const viewRef = makeFakeView();
    mountEditorInspectorPanel(el, store, viewRef);
    expect(el.textContent).toContain('Ln 1, Col 1');

    // Dispatch a cursor-change event on the document.
    document.dispatchEvent(
      new CustomEvent('cm-cursor-change', {
        bubbles: true,
        detail: { line: 5, col: 12 },
      }),
    );

    expect(el.textContent).toContain('Ln 5, Col 12');
  });

  it('disposer removes store subscription — no re-render after cleanup', () => {
    const viewRef = makeFakeView();
    const cleanup = mountEditorInspectorPanel(el, store, viewRef);
    expect(typeof cleanup).toBe('function');

    // Capture state.
    const textBefore = el.textContent ?? '';

    // Dispose.
    cleanup();

    // Mutate store — should NOT trigger re-render.
    store.create({ name: 'ghost.ts', languageId: 'JavaScript' });

    expect(el.textContent).toBe(textBefore);
    expect(el.textContent).not.toContain('ghost.ts');
  });

  it('disposer removes cm-cursor-change listener — no re-render after cleanup', () => {
    const viewRef = makeFakeView();
    const cleanup = mountEditorInspectorPanel(el, store, viewRef);

    const textBefore = el.textContent ?? '';

    // Dispose.
    cleanup();

    // Dispatch cursor event — should NOT update caret display.
    document.dispatchEvent(
      new CustomEvent('cm-cursor-change', {
        bubbles: true,
        detail: { line: 99, col: 99 },
      }),
    );

    expect(el.textContent).toBe(textBefore);
    expect(el.textContent).not.toContain('Ln 99');
  });
});

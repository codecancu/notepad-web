// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountFileListPanel } from './file-list-panel';
import { DocumentStore } from '../services/document-store';
import type { EditorController } from '../editor/editor-controller';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeController(): EditorController {
  return {
    showDoc: vi.fn(),
  } as unknown as EditorController;
}

function makeEl(): HTMLDivElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('FileListPanel', () => {
  let store: DocumentStore;
  let controller: EditorController;
  let el: HTMLDivElement;

  beforeEach(() => {
    store = new DocumentStore();
    controller = makeController();
    el = makeEl();
  });

  it('shows "No open files" when store is empty', () => {
    mountFileListPanel(el, store, controller);
    expect(el.textContent).toContain('No open files');
  });

  it('lists all open document names', () => {
    store.create({ name: 'alpha.ts' });
    store.create({ name: 'beta.py' });
    mountFileListPanel(el, store, controller);
    expect(el.textContent).toContain('alpha.ts');
    expect(el.textContent).toContain('beta.py');
  });

  it('shows dirty marker (●) for dirty documents', () => {
    const doc = store.create({ name: 'dirty.ts' });
    store.update(doc.id, { dirty: true });
    mountFileListPanel(el, store, controller);
    expect(el.textContent).toContain('●');
  });

  it('does not show dirty marker for clean documents', () => {
    store.create({ name: 'clean.ts' });
    mountFileListPanel(el, store, controller);
    expect(el.textContent).not.toContain('●');
  });

  it('re-renders when store changes (reactive)', () => {
    mountFileListPanel(el, store, controller);
    expect(el.textContent).toContain('No open files');

    // Add a doc after mount — the subscription should trigger re-render.
    store.create({ name: 'new.md' });
    expect(el.textContent).toContain('new.md');
    expect(el.textContent).not.toContain('No open files');
  });

  it('applies active highlight to the active document', () => {
    const doc1 = store.create({ name: 'first.ts' });
    store.create({ name: 'second.ts' });
    store.setActive(doc1.id);
    mountFileListPanel(el, store, controller);

    // The panel renders rows as divs with inline style — check that exactly one row
    // has the active highlight colour.
    const fileList = el.querySelector('#file-list-items');
    expect(fileList).not.toBeNull();
    const allRows = Array.from(fileList!.children) as HTMLElement[];
    const activeRows = allRows.filter((r) => r.style.background.includes('cce5ff'));
    expect(activeRows).toHaveLength(1);
  });

  it('calls store.setActive and controller.showDoc on row click', () => {
    const doc = store.create({ name: 'click-me.ts' });
    mountFileListPanel(el, store, controller);

    const fileList = el.querySelector('#file-list-items')!;
    const row = fileList.children[0] as HTMLElement;
    row.click();

    expect(store.activeId).toBe(doc.id);
    expect(controller.showDoc).toHaveBeenCalledWith(doc.id);
  });

  it('dispose/unsubscribe: store mutations do not re-render after cleanup', () => {
    // Mount, grab the cleanup, then dispose.
    const cleanup = mountFileListPanel(el, store, controller);
    expect(typeof cleanup).toBe('function');

    // Capture the DOM snapshot before dispose.
    const textBeforeDispose = el.textContent;

    // Dispose — releases the store subscription.
    cleanup();

    // Mutate the store AFTER disposing; the panel should NOT re-render.
    store.create({ name: 'ghost.ts' });

    // The text content should be unchanged (subscription was released).
    expect(el.textContent).toBe(textBeforeDispose);
    expect(el.textContent).not.toContain('ghost.ts');
  });

  it('active highlight updates reactively on setActive', () => {
    const doc1 = store.create({ name: 'a.ts' });
    const doc2 = store.create({ name: 'b.ts' });
    store.setActive(doc1.id);
    mountFileListPanel(el, store, controller);

    const fileList = el.querySelector('#file-list-items')!;
    const beforeActive = Array.from(fileList.children).filter((r) =>
      (r as HTMLElement).style.background.includes('cce5ff'),
    );
    expect(beforeActive).toHaveLength(1);
    expect((beforeActive[0] as HTMLElement).textContent).toContain('a.ts');

    // Switch active to doc2.
    store.setActive(doc2.id);

    const updatedActiveRows = Array.from(fileList.children).filter((r) =>
      (r as HTMLElement).style.background.includes('cce5ff'),
    );
    expect(updatedActiveRows).toHaveLength(1);
    expect((updatedActiveRows[0] as HTMLElement).textContent).toContain('b.ts');
  });
});

// SPDX-License-Identifier: GPL-3.0-or-later
import { DocumentStore } from './document-store';

describe('DocumentStore', () => {
  it('creates an untitled doc, makes it active, and notifies subscribers', () => {
    const store = new DocumentStore();
    let calls = 0;
    store.subscribe(() => calls++);
    const doc = store.create();
    expect(doc.name).toMatch(/^untitled-\d+$/);
    expect(doc.languageId).toBe('plaintext');
    expect(doc.dirty).toBe(false);
    expect(store.activeId).toBe(doc.id);
    expect(store.list()).toHaveLength(1);
    expect(calls).toBe(1);
  });

  it('updates a doc and marks dirty via patch', () => {
    const store = new DocumentStore();
    const doc = store.create();
    store.update(doc.id, { content: 'hi', dirty: true });
    expect(store.get(doc.id)?.content).toBe('hi');
    expect(store.get(doc.id)?.dirty).toBe(true);
  });

  it('removes the active doc and re-points active to a neighbor', () => {
    const store = new DocumentStore();
    const a = store.create();
    const b = store.create();
    store.setActive(a.id);
    store.remove(a.id);
    expect(store.get(a.id)).toBeUndefined();
    expect(store.activeId).toBe(b.id);
  });

  it('sets activeId to null when the last doc is removed', () => {
    const store = new DocumentStore();
    const a = store.create();
    store.remove(a.id);
    expect(store.activeId).toBeNull();
  });
});

describe('DocumentStore — split views', () => {
  it('new docs default to view 0 and the focused view is 0', () => {
    const store = new DocumentStore();
    const a = store.create();
    expect(store.get(a.id)?.view ?? 0).toBe(0);
    expect(store.focusedView()).toBe(0);
    expect(store.listForView(0)).toHaveLength(1);
    expect(store.listForView(1)).toHaveLength(0);
    expect(store.hasView(1)).toBe(false);
  });

  it('listForView returns only that view’s docs, preserving order', () => {
    const store = new DocumentStore();
    const a = store.create();
    const b = store.create();
    const c = store.create();
    store.moveToView(b.id, 1);
    expect(store.listForView(0).map((d) => d.id)).toEqual([a.id, c.id]);
    expect(store.listForView(1).map((d) => d.id)).toEqual([b.id]);
    expect(store.hasView(1)).toBe(true);
  });

  it('moveToView reassigns the doc, focuses the target view, and sets it active there', () => {
    const store = new DocumentStore();
    const a = store.create();
    const b = store.create();
    store.setActive(a.id); // focus view 0, active a
    store.moveToView(a.id, 1);
    expect(store.get(a.id)?.view).toBe(1);
    expect(store.focusedView()).toBe(1);
    expect(store.activeForView(1)?.id).toBe(a.id);
    // view 0 re-points its active to the remaining neighbor (b)
    expect(store.activeForView(0)?.id).toBe(b.id);
  });

  it('activeId / active() follow the focused view', () => {
    const store = new DocumentStore();
    const a = store.create();
    const b = store.create();
    store.moveToView(b.id, 1); // b now in view 1, view 1 focused + active
    expect(store.activeId).toBe(b.id);
    expect(store.active()?.id).toBe(b.id);
    store.setFocusedView(0);
    expect(store.activeId).toBe(a.id);
    expect(store.active()?.id).toBe(a.id);
  });

  it('remove re-points the neighbor within the same view only', () => {
    const store = new DocumentStore();
    const a = store.create(); // view 0
    const b = store.create(); // view 0
    const c = store.create(); // view 0 -> move to view 1
    const d = store.create(); // view 0 -> move to view 1
    store.moveToView(c.id, 1);
    store.moveToView(d.id, 1);
    // view 1 has [c, d], active d (last move focuses+activates d)
    store.setActiveForView(1, c.id);
    store.remove(c.id);
    // neighbor within view 1 is d, view 0 active untouched
    expect(store.activeForView(1)?.id).toBe(d.id);
    expect(store.listForView(0).map((x) => x.id)).toEqual([a.id, b.id]);
  });

  it('setFocusedView and setActiveForView notify subscribers', () => {
    const store = new DocumentStore();
    const a = store.create();
    let calls = 0;
    store.subscribe(() => calls++);
    store.setFocusedView(1);
    store.setActiveForView(0, a.id);
    expect(calls).toBe(2);
  });
});

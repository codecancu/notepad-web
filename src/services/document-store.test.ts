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

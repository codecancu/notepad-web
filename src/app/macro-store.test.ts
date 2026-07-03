// SPDX-License-Identifier: GPL-3.0-or-later
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MacroStore } from './macro-store';
import { PersistenceService } from '../services/persistence-service';
import type { SavedMacro } from '../services/persistence-service';

describe('MacroStore', () => {
  let svc: PersistenceService;
  let store: MacroStore;

  beforeEach(async () => {
    svc = new PersistenceService();
    // Clear any macros left by previous tests (fake-indexeddb shares state).
    await svc.saveMacros([]);
    store = new MacroStore(svc);
    await store.load();
  });

  it('list() is empty initially', () => {
    expect(store.list()).toEqual([]);
  });

  it('add() inserts a macro', async () => {
    const m: SavedMacro = { name: 'test', steps: [{ type: 'insert', text: 'hi' }] };
    await store.add(m);
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]!.name).toBe('test');
  });

  it('add() replaces a macro with the same name', async () => {
    const m1: SavedMacro = { name: 'test', steps: [{ type: 'insert', text: 'hi' }] };
    const m2: SavedMacro = { name: 'test', steps: [{ type: 'insert', text: 'bye' }] };
    await store.add(m1);
    await store.add(m2);
    expect(store.list()).toHaveLength(1);
    expect((store.list()[0]!.steps[0] as { type: 'insert'; text: string }).text).toBe('bye');
  });

  it('get() returns macro by name', async () => {
    const m: SavedMacro = { name: 'mymacro', steps: [] };
    await store.add(m);
    expect(store.get('mymacro')).toBeDefined();
    expect(store.get('mymacro')!.name).toBe('mymacro');
  });

  it('get() returns undefined for unknown name', () => {
    expect(store.get('nonexistent')).toBeUndefined();
  });

  it('remove() deletes a macro', async () => {
    await store.add({ name: 'a', steps: [] });
    await store.add({ name: 'b', steps: [] });
    await store.remove('a');
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]!.name).toBe('b');
  });

  it('remove() of a nonexistent name is a no-op and does NOT persist', async () => {
    await store.add({ name: 'a', steps: [] });
    const spy = vi.spyOn(svc, 'saveMacros');
    await store.remove('does-not-exist');
    expect(spy).not.toHaveBeenCalled();
    expect(store.list()).toHaveLength(1);
    spy.mockRestore();
  });

  it('persists macros to PersistenceService on add', async () => {
    const m: SavedMacro = { name: 'persist-test', steps: [{ type: 'insert', text: 'x' }] };
    await store.add(m);
    const store2 = new MacroStore(svc);
    await store2.load();
    expect(store2.list()).toHaveLength(1);
    expect(store2.list()[0]!.name).toBe('persist-test');
  });

  it('persists macros to PersistenceService on remove', async () => {
    await store.add({ name: 'keep', steps: [] });
    await store.add({ name: 'delete-me', steps: [] });
    await store.remove('delete-me');
    const store2 = new MacroStore(svc);
    await store2.load();
    expect(store2.list()).toHaveLength(1);
    expect(store2.list()[0]!.name).toBe('keep');
  });
});

// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FileActions } from './file-actions';
import { DocumentStore } from '../services/document-store';
import type { FileService } from '../services/file-service';
import type { EditorController } from '../editor/editor-controller';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFileService(overrides: Partial<FileService> = {}): FileService {
  return {
    isFsaSupported: vi.fn(() => true),
    open: vi.fn(async () => null),
    saveAs: vi.fn(async () => null),
    saveTo: vi.fn(async () => undefined),
    ensureWritable: vi.fn(async () => true),
    ...overrides,
  } as unknown as FileService;
}

function makeController(): EditorController {
  return {
    showDoc: vi.fn(),
    closeDoc: vi.fn(),
    setEditorOptions: vi.fn(),
    langCompartment: { reconfigure: vi.fn() },
  } as unknown as EditorController;
}

function makeFakeHandle(name: string): FileSystemFileHandle {
  return { name } as unknown as FileSystemFileHandle;
}

// ── saveAll tests ──────────────────────────────────────────────────────────────

describe('FileActions.saveAll', () => {
  let store: DocumentStore;
  let file: FileService;
  let controller: EditorController;
  let actions: FileActions;

  beforeEach(() => {
    store = new DocumentStore();
    file = makeFileService();
    controller = makeController();
    actions = new FileActions({ file, store, controller });
  });

  it('saves all docs that have a handle via saveTo (not saveAs)', async () => {
    const h1 = makeFakeHandle('a.txt');
    const h2 = makeFakeHandle('b.txt');
    const d1 = store.create({ name: 'a.txt', content: 'hello', handle: h1, dirty: true });
    const d2 = store.create({ name: 'b.txt', content: 'world', handle: h2, dirty: true });

    await actions.saveAll();

    expect(file.saveTo).toHaveBeenCalledTimes(2);
    expect(file.saveTo).toHaveBeenCalledWith(h1, d1.content, d1.eol, d1.bom);
    expect(file.saveTo).toHaveBeenCalledWith(h2, d2.content, d2.eol, d2.bom);
    expect(file.saveAs).not.toHaveBeenCalled();

    // dirty flag cleared.
    expect(store.get(d1.id)!.dirty).toBe(false);
    expect(store.get(d2.id)!.dirty).toBe(false);
  });

  it('calls saveAs for untitled (handle-less) docs', async () => {
    const fakeHandle = makeFakeHandle('new.txt');
    (file.saveAs as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeHandle);

    const d1 = store.create({ name: 'untitled-1', content: 'data', dirty: true });

    await actions.saveAll();

    expect(file.saveAs).toHaveBeenCalledOnce();
    expect(file.saveTo).not.toHaveBeenCalled();

    // handle + name updated, dirty cleared.
    const updated = store.get(d1.id)!;
    expect(updated.handle).toBe(fakeHandle);
    expect(updated.name).toBe('new.txt');
    expect(updated.dirty).toBe(false);
  });

  it('saves mix of handle-bearing and untitled docs', async () => {
    const h1 = makeFakeHandle('saved.txt');
    const fakeHandle = makeFakeHandle('chosen.txt');
    (file.saveAs as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeHandle);

    const d1 = store.create({ name: 'saved.txt', content: 'A', handle: h1, dirty: true });
    const d2 = store.create({ name: 'untitled-1', content: 'B', dirty: true });

    await actions.saveAll();

    expect(file.saveTo).toHaveBeenCalledOnce();
    expect(file.saveTo).toHaveBeenCalledWith(h1, d1.content, d1.eol, d1.bom);
    expect(file.saveAs).toHaveBeenCalledOnce();
    expect(store.get(d1.id)!.dirty).toBe(false);
    expect(store.get(d2.id)!.dirty).toBe(false);
  });

  it('skips untitled doc gracefully when user cancels the saveAs picker', async () => {
    // saveAs returns null (user cancelled).
    (file.saveAs as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const d1 = store.create({ name: 'untitled-1', content: 'data', dirty: true });

    await actions.saveAll();

    // dirty stays true since user cancelled.
    expect(store.get(d1.id)!.dirty).toBe(true);
  });

  it('saveActive only saves the active doc, not all docs', async () => {
    const h1 = makeFakeHandle('a.txt');
    const h2 = makeFakeHandle('b.txt');
    store.create({ name: 'a.txt', content: 'A', handle: h1, dirty: true });
    const d2 = store.create({ name: 'b.txt', content: 'B', handle: h2, dirty: true });
    // d2 is active (last created).

    await actions.saveActive();

    expect(file.saveTo).toHaveBeenCalledOnce();
    expect(file.saveTo).toHaveBeenCalledWith(h2, d2.content, d2.eol, d2.bom);
  });
});

// ── Close-variant list math tests ─────────────────────────────────────────────

describe('FileActions close variants (list math)', () => {
  let store: DocumentStore;
  let file: FileService;
  let controller: EditorController;
  let actions: FileActions;

  beforeEach(() => {
    store = new DocumentStore();
    file = makeFileService();
    controller = makeController();
    // confirmFn always accepts — we test the list math, not the dialog.
    actions = new FileActions({ file, store, controller, confirmFn: () => true });
  });

  // ── closeAllExceptActive ────────────────────────────────────────────────────

  it('closeAllExceptActive removes all docs except the active one', () => {
    const d1 = store.create({ name: 'a.txt', content: '' });
    const d2 = store.create({ name: 'b.txt', content: '' });
    const d3 = store.create({ name: 'c.txt', content: '' });
    // d3 is active.
    store.setActive(d3.id);

    actions.closeAllExceptActive();

    const remaining = store.list().map((d) => d.id);
    expect(remaining).toContain(d3.id);
    expect(remaining).not.toContain(d1.id);
    expect(remaining).not.toContain(d2.id);
    expect(remaining).toHaveLength(1);
  });

  it('closeAllExceptActive with only one doc is a no-op', () => {
    const d1 = store.create({ name: 'solo.txt', content: '' });
    actions.closeAllExceptActive();
    expect(store.list().map((d) => d.id)).toContain(d1.id);
    expect(store.list()).toHaveLength(1);
  });

  it('closeAllExceptActive leaves exactly 1 doc when all others closed', () => {
    store.create({ name: 'a.txt', content: '' });
    store.create({ name: 'b.txt', content: '' });
    const d3 = store.create({ name: 'c.txt', content: '' });
    store.setActive(d3.id);

    actions.closeAllExceptActive();

    expect(store.list()).toHaveLength(1);
    expect(store.active()!.id).toBe(d3.id);
  });

  // ── closeAllToLeft ──────────────────────────────────────────────────────────

  it('closeAllToLeft removes docs left of active, keeps active and right', () => {
    const d1 = store.create({ name: 'a.txt', content: '' });
    const d2 = store.create({ name: 'b.txt', content: '' });
    const d3 = store.create({ name: 'c.txt', content: '' });
    const d4 = store.create({ name: 'd.txt', content: '' });
    store.setActive(d3.id);

    actions.closeAllToLeft();

    const remaining = store.list().map((d) => d.id);
    expect(remaining).not.toContain(d1.id);
    expect(remaining).not.toContain(d2.id);
    expect(remaining).toContain(d3.id);
    expect(remaining).toContain(d4.id);
  });

  it('closeAllToLeft when active is leftmost is a no-op', () => {
    const d1 = store.create({ name: 'a.txt', content: '' });
    store.create({ name: 'b.txt', content: '' });
    store.setActive(d1.id);

    actions.closeAllToLeft();

    expect(store.list()).toHaveLength(2);
  });

  it('closeAllToLeft: list-math — docs to the left of index 2 in a 4-doc list', () => {
    const ids = [];
    for (let i = 0; i < 4; i++) {
      ids.push(store.create({ name: `f${i}.txt`, content: '' }).id);
    }
    // Active = index 2 (f2.txt).
    store.setActive(ids[2]!);

    actions.closeAllToLeft();

    const remaining = store.list().map((d) => d.id);
    // f0 and f1 should be gone; f2 and f3 remain.
    expect(remaining).not.toContain(ids[0]!);
    expect(remaining).not.toContain(ids[1]!);
    expect(remaining).toContain(ids[2]!);
    expect(remaining).toContain(ids[3]!);
  });

  // ── closeAllToRight ─────────────────────────────────────────────────────────

  it('closeAllToRight removes docs right of active, keeps active and left', () => {
    const d1 = store.create({ name: 'a.txt', content: '' });
    const d2 = store.create({ name: 'b.txt', content: '' });
    const d3 = store.create({ name: 'c.txt', content: '' });
    const d4 = store.create({ name: 'd.txt', content: '' });
    store.setActive(d2.id);

    actions.closeAllToRight();

    const remaining = store.list().map((d) => d.id);
    expect(remaining).toContain(d1.id);
    expect(remaining).toContain(d2.id);
    expect(remaining).not.toContain(d3.id);
    expect(remaining).not.toContain(d4.id);
  });

  it('closeAllToRight when active is rightmost is a no-op', () => {
    store.create({ name: 'a.txt', content: '' });
    const d2 = store.create({ name: 'b.txt', content: '' });
    store.setActive(d2.id);

    actions.closeAllToRight();

    expect(store.list()).toHaveLength(2);
  });

  it('closeAllToRight: list-math — docs to the right of index 1 in a 4-doc list', () => {
    const ids = [];
    for (let i = 0; i < 4; i++) {
      ids.push(store.create({ name: `g${i}.txt`, content: '' }).id);
    }
    // Active = index 1 (g1.txt).
    store.setActive(ids[1]!);

    actions.closeAllToRight();

    const remaining = store.list().map((d) => d.id);
    expect(remaining).toContain(ids[0]!);
    expect(remaining).toContain(ids[1]!);
    expect(remaining).not.toContain(ids[2]!);
    expect(remaining).not.toContain(ids[3]!);
  });

  // ── dirty-confirm skipping ──────────────────────────────────────────────────

  it('closeAllExceptActive skips dirty docs when user declines confirm', () => {
    const d1 = store.create({ name: 'dirty.txt', content: 'X', dirty: true });
    const d2 = store.create({ name: 'active.txt', content: '' });
    store.setActive(d2.id);

    // Override confirmFn to reject.
    const rejectActions = new FileActions({
      file,
      store,
      controller,
      confirmFn: () => false,
    });

    rejectActions.closeAllExceptActive();

    // d1 should still be present because confirm was rejected.
    expect(store.get(d1.id)).toBeDefined();
    expect(store.list()).toHaveLength(2);
  });
});

// ── Fix 3: Reload robustness (try/catch) ─────────────────────────────────────

describe('FileActions.reloadActive — try/catch robustness', () => {
  let alertSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    alertSpy = vi.spyOn(globalThis, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('shows a user-facing alert when getFile() throws (stale/expired handle)', async () => {
    const store = new DocumentStore();
    const file = makeFileService();
    const controller = makeController();

    // Build a handle whose getFile() rejects to simulate a stale/permission-expired handle.
    const failingHandle = {
      name: 'stale.txt',
      getFile: vi.fn().mockRejectedValue(new DOMException('NotAllowedError')),
    } as unknown as FileSystemFileHandle;

    const doc = store.create({
      name: 'stale.txt',
      content: 'old content',
      handle: failingHandle,
      dirty: false,
    });
    store.setActive(doc.id);

    const actions = new FileActions({ file, store, controller });
    await actions.reloadActive();

    // Must show an alert, NOT rethrow.
    expect(alertSpy).toHaveBeenCalledOnce();
    expect(alertSpy.mock.calls[0]![0]).toMatch(/Could not reload/);

    // Store content must be unchanged (no partial update).
    expect(store.get(doc.id)!.content).toBe('old content');
    expect(store.get(doc.id)!.dirty).toBe(false);

    // showDoc must NOT have been called (no re-render with stale data).
    expect(controller.showDoc).not.toHaveBeenCalled();
  });
});

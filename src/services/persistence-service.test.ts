// SPDX-License-Identifier: GPL-3.0-or-later
import 'fake-indexeddb/auto';
import { PersistenceService } from './persistence-service';
import type { SavedMacro } from './persistence-service';

describe('PersistenceService', () => {
  it('round-trips a session snapshot', async () => {
    const svc = new PersistenceService();
    await svc.saveSession({
      docs: [
        {
          id: '1',
          name: 'a.ts',
          content: 'x',
          languageId: 'typescript',
          dirty: true,
          eol: 'lf',
          bom: false,
        },
      ],
      activeId: '1',
    });
    const loaded = await svc.loadSession();
    expect(loaded?.activeId).toBe('1');
    expect(loaded!.docs[0]!.content).toBe('x');
  });

  it('round-trips cursor and scrollTop fields in the session snapshot', async () => {
    // Confirms that the Doc.cursor and Doc.scrollTop fields (used by the Phase-7
    // cursor/scroll restore fix) are persisted correctly through IndexedDB.
    const svc = new PersistenceService();
    await svc.saveSession({
      docs: [
        {
          id: '42',
          name: 'scroll.ts',
          content: 'line one\nline two\nline three',
          languageId: 'typescript',
          dirty: false,
          eol: 'lf',
          bom: false,
          cursor: { lineNumber: 2, column: 6 },
          scrollTop: 120,
        },
      ],
      activeId: '42',
    });
    const loaded = await svc.loadSession();
    const doc = loaded!.docs[0]!;
    expect(doc.cursor).toEqual({ lineNumber: 2, column: 6 });
    expect(doc.scrollTop).toBe(120);
  });

  it('returns null when nothing saved', async () => {
    const svc = new PersistenceService();
    await svc.clear();
    expect(await svc.loadSession()).toBeNull();
  });

  it('saveMacros/loadMacros round-trips named macros', async () => {
    const svc = new PersistenceService();
    const macros: SavedMacro[] = [
      { name: 'my-macro', steps: [{ type: 'insert', text: 'hello' }] },
      { name: 'other', steps: [{ type: 'command', name: 'cursorLineDown' }] },
    ];
    await svc.saveMacros(macros);
    const loaded = await svc.loadMacros();
    expect(loaded).toEqual(macros);
  });

  it('loadMacros returns [] when nothing saved', async () => {
    // Use a fresh DB name via a fresh factory to guarantee no prior data.
    const svc = new PersistenceService();
    // Explicitly save an empty list to clear any state left from previous tests.
    await svc.saveMacros([]);
    const loaded = await svc.loadMacros();
    expect(loaded).toEqual([]);
  });

  it('loadMacros returns [] when the macros key is entirely absent (?? [] branch)', async () => {
    // Wipe the whole DB so the 'macros' key is genuinely missing (not an empty
    // array) — exercises the `result ?? []` fallback in loadMacros().
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('notepad-web');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    const svc = new PersistenceService();
    const loaded = await svc.loadMacros();
    expect(loaded).toEqual([]);
  });
});

// SPDX-License-Identifier: GPL-3.0-or-later
import type { Doc, DocId } from './document-store';
import type { MacroStep } from '../editor/macro';

export type { MacroStep };

export interface SavedMacro {
  name: string;
  steps: MacroStep[];
}

export type PersistedDoc = Doc;
export interface SessionSnapshot {
  docs: PersistedDoc[];
  /** Focused-view active doc id (kept for back-compat with pre-split sessions). */
  activeId: DocId | null;
  /** Per-view active doc ids [primary, secondary]. Optional for old snapshots. */
  activeIds?: [DocId | null, DocId | null];
  /** Split orientation when a secondary pane is present ('h' stacked, 'v' side-by-side). */
  splitOrientation?: 'h' | 'v' | null;
}

export interface SearchPrefs {
  findMru: string[];
  replaceMru: string[];
  matchCase: boolean;
  wholeWord: boolean;
  wrap: boolean;
  backwards: boolean;
  searchMode: 'normal' | 'extended' | 'regexp';
  dotMatchesNewline: boolean;
}

const DB_NAME = 'notepad-web';
const STORE = 'kv';
const SESSION_KEY = 'session';
const MACROS_KEY = 'macros';
const SEARCH_PREFS_KEY = 'search-prefs';

export class PersistenceService {
  constructor(private idb: IDBFactory = indexedDB) {}

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = this.idb.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    });
  }

  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
    const db = await this.open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
      });
    } finally {
      db.close();
    }
  }

  async saveSession(s: SessionSnapshot): Promise<void> {
    await this.tx('readwrite', (store) => store.put(s, SESSION_KEY));
  }

  async loadSession(): Promise<SessionSnapshot | null> {
    const result = await this.tx<SessionSnapshot | undefined>('readonly', (store) =>
      store.get(SESSION_KEY),
    );
    return result ?? null;
  }

  async clear(): Promise<void> {
    await this.tx('readwrite', (store) => store.delete(SESSION_KEY));
  }

  async saveMacros(macros: SavedMacro[]): Promise<void> {
    await this.tx('readwrite', (store) => store.put(macros, MACROS_KEY));
  }

  async loadMacros(): Promise<SavedMacro[]> {
    const result = await this.tx<SavedMacro[] | undefined>('readonly', (store) =>
      store.get(MACROS_KEY),
    );
    return result ?? [];
  }

  async saveSearchPrefs(prefs: SearchPrefs): Promise<void> {
    await this.tx('readwrite', (store) => store.put(prefs, SEARCH_PREFS_KEY));
  }

  async loadSearchPrefs(): Promise<SearchPrefs | null> {
    const result = await this.tx<SearchPrefs | undefined>('readonly', (store) =>
      store.get(SEARCH_PREFS_KEY),
    );
    return result ?? null;
  }
}

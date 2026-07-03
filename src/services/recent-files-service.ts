// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * RecentFilesService — persists and retrieves a capped, deduped list of
 * recently-opened file names.
 *
 * Design:
 *   - Backed by the same IndexedDB database ('notepad-web') used by
 *     PersistenceService, stored under the key 'recent-files'.
 *   - Cap: at most MAX_RECENT entries (oldest dropped when exceeded).
 *   - Dedup: adding a name that already exists moves it to the front.
 *   - Clear: wipes the list entirely.
 *   - FileSystemFileHandle objects are intentionally NOT persisted because
 *     the File System Access API does not allow serialising handles across
 *     origins/sessions without the StorageFoundation API (not yet broadly
 *     available).  We persist names only, which is sufficient for the
 *     "Restore Recently Closed" display and "Clear Recent Files" action.
 *     Re-opening requires a new picker (user gesture).
 */

export interface RecentEntry {
  name: string;
}

const DB_NAME = 'notepad-web';
const STORE = 'kv';
const RECENT_KEY = 'recent-files';
const MAX_RECENT = 20;

export class RecentFilesService {
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

  /** Returns the current list (most-recent first). */
  async list(): Promise<RecentEntry[]> {
    const result = await this.tx<RecentEntry[] | undefined>('readonly', (store) =>
      store.get(RECENT_KEY),
    );
    return result ?? [];
  }

  /**
   * Record a file name as recently opened.
   * Deduplicates (moves existing entry to front) and caps at MAX_RECENT.
   */
  async add(name: string): Promise<void> {
    const current = await this.list();
    // Remove existing occurrence (dedup).
    const without = current.filter((e) => e.name !== name);
    // Prepend and cap.
    const next = [{ name }, ...without].slice(0, MAX_RECENT);
    await this.tx('readwrite', (store) => store.put(next, RECENT_KEY));
  }

  /** Clear the entire recent-files list. */
  async clear(): Promise<void> {
    await this.tx('readwrite', (store) => store.put([], RECENT_KEY));
  }
}

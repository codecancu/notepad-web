// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * search-results-store.ts — accumulating observable store for search runs.
 *
 * Faithful to SearchResultsDock stacking multiple searches (prior collapsed,
 * latest expanded). Module-level singleton `searchResultsStore`, matching
 * the pattern used by DocumentStore and other stores.
 *
 * No persistence needed — search results are ephemeral per session.
 */

import type { SearchRun } from './search-engine';

export type { SearchRun };

class SearchResultsStore {
  private _runs: SearchRun[] = [];
  private _listeners = new Set<() => void>();

  /** Append a run (most recent last). */
  addRun(run: SearchRun): void {
    this._runs.push(run);
    this._emit();
  }

  /** Return all runs (dock renders them stacked; latest expanded, prior collapsed). */
  runs(): SearchRun[] {
    return this._runs;
  }

  /** Clear all stored runs. */
  clear(): void {
    this._runs = [];
    this._emit();
  }

  /** Subscribe to changes; returns an unsubscribe function. */
  subscribe(fn: () => void): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  private _emit(): void {
    for (const fn of this._listeners) {
      try {
        fn();
      } catch {
        /* ignore listener errors */
      }
    }
  }
}

/** Application-level singleton (matches the pattern of other stores). */
export const searchResultsStore = new SearchResultsStore();

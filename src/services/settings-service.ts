// SPDX-License-Identifier: GPL-3.0-or-later
import type { KeyValueStore } from './chrome-adapter';
export type { KeyValueStore };

export interface Settings {
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  theme: 'light' | 'dark' | 'system';
  eol: 'lf' | 'crlf' | 'cr';
  /**
   * Enable/disable document-word autocompletion (faithful to NotepadNext AutoCompletion
   * decorator). Defaults to true. Can be toggled via Settings panel (future) or
   * reconfigured at runtime via EditorController.autoCompletionCompartment.
   */
  autoCompletion: boolean;
}

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  fontSize: 14,
  tabSize: 4,
  wordWrap: false,
  theme: 'system',
  eol: 'lf',
  autoCompletion: true,
});

const KEY = 'settings';

export class SettingsService {
  private listeners = new Set<(s: Settings) => void>();
  private current: Settings = DEFAULT_SETTINGS;
  private loaded = false;
  constructor(private store: KeyValueStore) {}

  async load(): Promise<Settings> {
    const stored = await this.store.get<Partial<Settings>>(KEY);
    this.current = { ...DEFAULT_SETTINGS, ...stored };
    this.loaded = true;
    return this.current;
  }

  async update(patch: Partial<Settings>): Promise<Settings> {
    // Hydrate from the store first so an update never clobbers persisted
    // values when load() was skipped.
    if (!this.loaded) await this.load();
    const next = { ...this.current, ...patch };
    // Persist before committing in-memory state, so a failed write never
    // leaves this.current out of sync with the store.
    await this.store.set(KEY, next);
    this.current = next;
    this.listeners.forEach((fn) => fn(this.current));
    return this.current;
  }

  subscribe(fn: (s: Settings) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

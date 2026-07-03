// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * MacroStore — in-memory list of saved macros with IndexedDB persistence.
 *
 * Faithful to NotepadNext MacroManager: owns the list of named saved macros
 * (distinct from the current unsaved macro which lives in macro.ts).
 * Loads from PersistenceService on init; persists on every mutation.
 */

import type { PersistenceService, SavedMacro } from '../services/persistence-service';

export type { SavedMacro };

export class MacroStore {
  private _macros: SavedMacro[] = [];

  constructor(private persistence: PersistenceService) {}

  /** Load saved macros from IndexedDB. Call once on startup before using the store. */
  async load(): Promise<void> {
    this._macros = await this.persistence.loadMacros();
  }

  /** Returns a shallow copy of the saved macro list. */
  list(): SavedMacro[] {
    return this._macros.slice();
  }

  /** Look up a macro by name. Returns undefined if not found. */
  get(name: string): SavedMacro | undefined {
    return this._macros.find((m) => m.name === name);
  }

  /** Add (or replace) a named macro and persist. */
  async add(macro: SavedMacro): Promise<void> {
    const idx = this._macros.findIndex((m) => m.name === macro.name);
    if (idx >= 0) {
      this._macros[idx] = macro;
    } else {
      this._macros.push(macro);
    }
    await this._persist();
  }

  /** Remove a macro by name and persist. No-op if not found. */
  async remove(name: string): Promise<void> {
    const before = this._macros.length;
    this._macros = this._macros.filter((m) => m.name !== name);
    if (this._macros.length !== before) {
      await this._persist();
    }
  }

  private async _persist(): Promise<void> {
    await this.persistence.saveMacros(this._macros);
  }
}

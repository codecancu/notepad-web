// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * MacroSaveDialog — Save Current Recorded Macro dialog.
 *
 * Faithful to NotepadNext MacroSaveDialog: a name text input (max 256);
 * OK/Save disabled until name is non-empty. The shortcut field from the C++
 * source is UI-only / unwired (TODO cpp:823) and is OMITTED here.
 *
 * Dialog pattern mirrors SettingsPanel: root element + innerHTML + hidden toggle.
 */

import type { MacroStore } from './macro-store';
import { getCurrentMacro } from '../editor/macro';

export class MacroSaveDialog {
  constructor(
    private root: HTMLElement,
    private macroStore: MacroStore,
    private onSaved: () => void,
  ) {}

  open(): void {
    // Don't re-render while already open.
    if (!this.root.hidden) return;

    const current = getCurrentMacro();
    if (!current) {
      alert('No recorded macro to save. Record a macro first.');
      return;
    }

    this.root.innerHTML = `
      <div class="dialog-overlay">
        <div class="dialog-box" role="dialog" aria-modal="true" aria-label="Save Current Recorded Macro">
          <h2 class="dialog-title">Save Current Recorded Macro</h2>
          <label class="dialog-field">
            Name
            <input
              id="msd-name"
              type="text"
              maxlength="256"
              placeholder="Macro name"
              autocomplete="off"
            />
          </label>
          <div class="dialog-actions">
            <button id="msd-ok" disabled>Save</button>
            <button id="msd-cancel">Cancel</button>
          </div>
        </div>
      </div>`;
    this.root.hidden = false;

    const nameInput = this.root.querySelector<HTMLInputElement>('#msd-name')!;
    const okBtn = this.root.querySelector<HTMLButtonElement>('#msd-ok')!;
    const cancelBtn = this.root.querySelector<HTMLButtonElement>('#msd-cancel')!;

    // Click on the overlay backdrop (not the dialog box) closes the dialog.
    const overlay = this.root.querySelector<HTMLElement>('.dialog-overlay');
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) this.root.hidden = true;
    });

    const updateOk = (): void => {
      okBtn.disabled = nameInput.value.trim().length === 0;
    };

    nameInput.addEventListener('input', updateOk);

    okBtn.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) return;
      const macro = getCurrentMacro();
      if (!macro) {
        alert('No recorded macro to save.');
        this.root.hidden = true;
        return;
      }
      // Clone as a SavedMacro with the user-supplied name.
      const saved = { name, steps: [...macro.steps] };
      void this.macroStore.add(saved).then(() => {
        this.root.hidden = true;
        this.onSaved();
      });
    });

    cancelBtn.addEventListener('click', () => {
      this.root.hidden = true;
    });

    nameInput.focus();
  }
}

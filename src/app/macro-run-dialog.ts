// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * MacroRunDialog — Run a Macro Multiple Times dialog.
 *
 * Faithful to NotepadNext MacroRunDialog:
 *   - comboBox (macro selector = saved macros + current unsaved if any)
 *   - radioEndOfFile ("Run Until End of File")
 *   - radioExecute ("Execute N times", default selected)
 *   - spinTimes (1..999999999, enabled only when Execute radio is selected)
 *
 * Dialog pattern mirrors SettingsPanel: root element + innerHTML + hidden toggle.
 */

import type { EditorView } from '@codemirror/view';
import type { MacroStore } from './macro-store';
import type { Macro } from '../editor/macro';
import { getCurrentMacro, replayMacro } from '../editor/macro';

const CURRENT_MACRO_SENTINEL = '__current__';

export class MacroRunDialog {
  constructor(
    private root: HTMLElement,
    private macroStore: MacroStore,
    private getView: () => EditorView,
  ) {}

  open(): void {
    // Don't re-render while already open.
    if (!this.root.hidden) return;

    const savedMacros = this.macroStore.list();
    const currentMacro = getCurrentMacro();

    if (savedMacros.length === 0 && !currentMacro) {
      alert('No macros available. Record or save a macro first.');
      return;
    }

    // Build <option> elements. The current unsaved macro is listed FIRST (and thus
    // default-selected) then the saved macros — faithful to MacroRunDialog::showEvent
    // (MacroRunDialog.cpp adds getCurrentMacro() first, then availableMacros).
    const optionsHtml = [
      ...(currentMacro
        ? [`<option value="${CURRENT_MACRO_SENTINEL}">&lt;Current Recorded Macro&gt;</option>`]
        : []),
      ...savedMacros.map((m) => `<option value="${escHtml(m.name)}">${escHtml(m.name)}</option>`),
    ].join('');

    this.root.innerHTML = `
      <div class="dialog-overlay">
        <div class="dialog-box" role="dialog" aria-modal="true" aria-label="Run a Macro Multiple Times">
          <h2 class="dialog-title">Run a Macro Multiple Times</h2>
          <label class="dialog-field">
            Macro
            <select id="mrd-macro">${optionsHtml}</select>
          </label>
          <div class="dialog-radios">
            <label>
              <input type="radio" name="mrd-mode" id="mrd-radio-execute" value="execute" checked />
              Execute N times
            </label>
            <label>
              <input type="radio" name="mrd-mode" id="mrd-radio-eof" value="eof" />
              Run Until End of File
            </label>
          </div>
          <label class="dialog-field">
            N
            <input
              id="mrd-times"
              type="number"
              min="1"
              max="999999999"
              value="1"
            />
          </label>
          <div class="dialog-actions">
            <button id="mrd-run">Run</button>
            <button id="mrd-cancel">Cancel</button>
          </div>
        </div>
      </div>`;
    this.root.hidden = false;

    const macroSelect = this.root.querySelector<HTMLSelectElement>('#mrd-macro')!;
    const radioExecute = this.root.querySelector<HTMLInputElement>('#mrd-radio-execute')!;
    const radioEof = this.root.querySelector<HTMLInputElement>('#mrd-radio-eof')!;
    const timesInput = this.root.querySelector<HTMLInputElement>('#mrd-times')!;
    const runBtn = this.root.querySelector<HTMLButtonElement>('#mrd-run')!;
    const cancelBtn = this.root.querySelector<HTMLButtonElement>('#mrd-cancel')!;

    // Click on the overlay backdrop (not the dialog box) closes the dialog.
    const overlay = this.root.querySelector<HTMLElement>('.dialog-overlay');
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) this.root.hidden = true;
    });

    const updateTimesEnabled = (): void => {
      timesInput.disabled = radioEof.checked;
    };

    radioExecute.addEventListener('change', updateTimesEnabled);
    radioEof.addEventListener('change', updateTimesEnabled);

    runBtn.addEventListener('click', () => {
      const selectedValue = macroSelect.value;
      let macro: Macro | null;

      if (selectedValue === CURRENT_MACRO_SENTINEL) {
        macro = getCurrentMacro();
      } else {
        const found = this.macroStore.get(selectedValue);
        macro = found ?? null;
      }

      if (!macro) {
        alert('Selected macro not found.');
        return;
      }

      const times = radioEof.checked ? -1 : Math.max(1, parseInt(timesInput.value, 10) || 1);
      this.root.hidden = true;
      replayMacro(this.getView(), macro, times);
    });

    cancelBtn.addEventListener('click', () => {
      this.root.hidden = true;
    });
  }
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

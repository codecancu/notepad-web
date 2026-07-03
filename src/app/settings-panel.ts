// SPDX-License-Identifier: GPL-3.0-or-later
import type { SettingsService, Settings } from '../services/settings-service';

export class SettingsPanel {
  /** Document-level Escape handler, registered while the panel is open. */
  private _escHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(
    private root: HTMLElement,
    private settings: SettingsService,
    private onApply: (s: Settings) => void,
  ) {}

  open(): void {
    // Don't re-render over an already-open panel (would discard in-progress edits).
    if (!this.root.hidden) return;
    this.settings
      .load()
      .then((s) => {
        // Render as a floating overlay so the panel never disrupts the #app grid.
        this.root.innerHTML = `
          <div class="dialog-overlay" id="set-overlay">
            <div class="dialog-box" role="dialog" aria-modal="true" aria-label="Preferences">
              <h2 class="dialog-title">Preferences</h2>
              <label class="dialog-field">Font size
                <input id="set-font" type="number" value="${s.fontSize}" min="6" max="72" />
              </label>
              <label class="dialog-field">Tab size
                <input id="set-tab" type="number" value="${s.tabSize}" min="1" max="16" />
              </label>
              <label class="dialog-field">
                <span style="display:flex;align-items:center;gap:6px;">
                  <input id="set-wrap" type="checkbox"${s.wordWrap ? ' checked' : ''} />
                  Word wrap
                </span>
              </label>
              <label class="dialog-field">Theme
                <select id="set-theme">
                  <option value="system"${s.theme === 'system' ? ' selected' : ''}>System</option>
                  <option value="light"${s.theme === 'light' ? ' selected' : ''}>Light</option>
                  <option value="dark"${s.theme === 'dark' ? ' selected' : ''}>Dark</option>
                </select>
              </label>
              <div class="dialog-actions">
                <button id="set-save">Save</button>
                <button id="set-cancel">Cancel</button>
              </div>
            </div>
          </div>`;
        this.root.hidden = false;

        const close = (): void => {
          this.root.hidden = true;
          if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler, { capture: true });
            this._escHandler = null;
          }
        };

        this.root.querySelector('#set-save')!.addEventListener('click', () => {
          void this.settings
            .update({
              fontSize: Number((this.root.querySelector('#set-font') as HTMLInputElement).value),
              tabSize: Number((this.root.querySelector('#set-tab') as HTMLInputElement).value),
              wordWrap: (this.root.querySelector('#set-wrap') as HTMLInputElement).checked,
              theme: (this.root.querySelector('#set-theme') as HTMLSelectElement)
                .value as Settings['theme'],
            })
            .then((next) => {
              this.onApply(next);
              close();
            });
        });

        this.root.querySelector('#set-cancel')!.addEventListener('click', close);

        // Click on the backdrop (overlay itself, not the box) closes the panel.
        const overlay = this.root.querySelector<HTMLElement>('#set-overlay');
        overlay?.addEventListener('click', (e) => {
          if (e.target === overlay) close();
        });

        // Escape key closes the panel.
        this._escHandler = (e: KeyboardEvent) => {
          if (e.key === 'Escape' && !this.root.hidden) {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        };
        document.addEventListener('keydown', this._escHandler, { capture: true });
      })
      .catch((err) => console.error('[SettingsPanel] failed to load settings', err));
  }
}

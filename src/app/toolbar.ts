// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Toolbar — Notepad++-faithful mainToolBar below the menu bar.
 *
 * Renders icon buttons matching NotepadNext's mainToolBar in order:
 *   New · Open · Save · SaveAll · Close · CloseAll  |
 *   Cut · Copy · Paste  |
 *   Undo · Redo  |
 *   Find · Replace  |
 *   ZoomIn · ZoomOut  |
 *   WordWrap · ShowAllChars · ShowIndentGuide  |
 *   MacroRecording · Playback · RunMacroMultipleTimes · SaveCurrentRecordedMacro
 *
 * All callbacks are taken from the same MenuBarActions object used by the menu bar —
 * no new handlers are invented here.
 *
 * Toggle buttons (WordWrap, ShowAllChars, MacroRecord) reflect pressed state via
 * aria-pressed and the .toolbar-btn--pressed CSS class.
 *
 * Disabled buttons (ShowIndentGuide; macro playback/run/save when no macro) are
 * greyed out, aria-disabled, and not clickable — matching the menu's pattern.
 *
 * Icons: PNG images bundled locally under icons/ (copied from NotepadNext source
 * via public/icons/ → webpack CopyPlugin → dist/icons/).  No remote fetch —
 * MV3 CSP compliant.  Macro Record swaps startRecord.png ↔ stopRecord.png based
 * on macroIsRecording(), matching the Qt normaloff/normalon iconset behaviour.
 *
 * Icon attribution: icons are from NotepadNext (GPL-3.0-or-later,
 * https://github.com/dail8859/NotepadNext).  Several icon filenames
 * (arrow_refresh, bin_closed, cog, cut, copy, paste, undo, redo, find, …)
 * match the FamFamFam Silk icon set by Mark James (CC-BY-2.5,
 * http://www.famfamfam.com/lab/icons/silk/).  NotepadNext ships them without a
 * separate attribution file; they are re-used here under the same GPL-3.0-or-later
 * terms as the rest of this port.  Attribution for the Silk set is noted in
 * THIRD_PARTY_LICENSES.md.
 *
 * ARIA: role="toolbar" on the container, each button has aria-label and title.
 */

import type { MenuBarActions } from './menu-bar';

// ── ToolbarState carries the toggle/enabled getters passed into render() ────────

export interface ToolbarState {
  /** True when word wrap is currently on. */
  wordWrapOn: () => boolean;
  /** True when Show All Chars is currently on (whitespace + EOL both active). */
  showAllCharsOn: () => boolean;
  /** True when macro recording is in progress. */
  macroIsRecording: () => boolean;
  /** True when a macro is available (gates Playback/Save). */
  macroHasMacro: () => boolean;
  /** True when a macro can be run (gates Run Multiple). */
  macroHasRunnable: () => boolean;
}

// ── Icon filename map ─────────────────────────────────────────────────────────
// Maps each logical icon key to the bundled PNG filename under icons/.
// Files are copied from NotepadNext/src/icons/ into public/icons/ and then
// shipped to dist/icons/ by webpack CopyPlugin — no remote fetch, MV3-safe.
//
// Filenames verified against NotepadNext src/dialogs/MainWindow.ui iconset
// entries (normaloff / normalon attributes).
//
// actionSave uses "saved.png" (the .ui <normalon>:/icons/saved.png</normalon>
// entry for actionSave).  Note: "saved.png" is the green floppy; NotepadNext
// shows it as the Save toolbar icon.

const ICON_FILES: Record<string, string> = {
  // File group  (from MainWindow.ui actionNew/Open/Save/SaveAll/Close/CloseAll)
  fileNew: 'newfile.png',
  fileOpen: 'openFile.png',
  fileSave: 'saved.png', // actionSave → normalon: :/icons/saved.png
  fileSaveAll: 'saveAll.png',
  fileClose: 'closeFile.png',
  fileCloseAll: 'closeAll.png',
  // Edit group
  editCut: 'cut.png',
  editCopy: 'copy.png',
  editPaste: 'paste.png',
  // Undo/Redo
  editUndo: 'undo.png',
  editRedo: 'redo.png',
  // Search (actionFind / actionReplace)
  searchFind: 'find.png',
  searchReplace: 'findReplace.png',
  // Zoom
  viewZoomIn: 'zoomIn.png',
  viewZoomOut: 'zoomOut.png',
  // View toggles
  viewWordWrap: 'wrap.png',
  viewShowAllChars: 'invisibleChar.png',
  viewShowIndentGuide: 'indentGuide.png',
  // Macro — record uses startRecord (idle) / stopRecord (active), toggled at
  // render time; other macro buttons have static icons.
  macroRecordIdle: 'startRecord.png',
  macroRecordActive: 'stopRecord.png',
  macroPlayback: 'playRecord.png',
  macroRunMultiple: 'playRecord_m.png',
  macroSave: 'saveRecord.png',
};

/**
 * Build an <img> element for a toolbar icon.
 * @param iconFile  filename under icons/ (e.g. "newfile.png")
 */
function makeIconImg(iconFile: string): HTMLImageElement {
  const img = document.createElement('img');
  img.src = `icons/${iconFile}`;
  img.width = 16;
  img.height = 16;
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  return img;
}

// ── Button descriptor ─────────────────────────────────────────────────────────

type ToolbarButtonDef =
  | {
      kind: 'button';
      id: string;
      label: string;
      title: string;
      /** Key into ICON_FILES for the default (idle) icon. */
      iconKey: string;
      /**
       * Optional key into ICON_FILES for the pressed/active icon.
       * When set and pressed() returns true, this icon is used instead of iconKey.
       */
      iconKeyPressed?: string;
      /** Returns true if this button should be rendered as pressed/active. */
      pressed?: (state: ToolbarState) => boolean;
      /** Returns true when this button should be disabled. */
      disabled?: (state: ToolbarState) => boolean;
      onClick: (actions: MenuBarActions, state: ToolbarState) => void;
    }
  | { kind: 'separator' };

const BUTTON_DEFS: ToolbarButtonDef[] = [
  // ── File group ────────────────────────────────────────────────────────────
  {
    kind: 'button',
    id: 'tb-new',
    label: 'New',
    title: 'New',
    iconKey: 'fileNew',
    onClick: (a) => a.fileNew(),
  },
  {
    kind: 'button',
    id: 'tb-open',
    label: 'Open',
    title: 'Open (Ctrl+O)',
    iconKey: 'fileOpen',
    onClick: (a) => a.fileOpen(),
  },
  {
    kind: 'button',
    id: 'tb-save',
    label: 'Save',
    title: 'Save (Ctrl+S)',
    iconKey: 'fileSave',
    onClick: (a) => a.fileSave(),
  },
  {
    kind: 'button',
    id: 'tb-save-all',
    label: 'Save All',
    title: 'Save All (Ctrl+Shift+S)',
    iconKey: 'fileSaveAll',
    onClick: (a) => a.fileSaveAll(),
  },
  {
    kind: 'button',
    id: 'tb-close',
    label: 'Close',
    title: 'Close',
    iconKey: 'fileClose',
    onClick: (a) => a.fileClose(),
  },
  {
    kind: 'button',
    id: 'tb-close-all',
    label: 'Close All',
    title: 'Close All (Ctrl+Shift+W)',
    iconKey: 'fileCloseAll',
    onClick: (a) => a.fileCloseAll(),
  },
  { kind: 'separator' },
  // ── Edit group ────────────────────────────────────────────────────────────
  {
    kind: 'button',
    id: 'tb-cut',
    label: 'Cut',
    title: 'Cut (Ctrl+X)',
    iconKey: 'editCut',
    onClick: (a) => a.editCut(),
  },
  {
    kind: 'button',
    id: 'tb-copy',
    label: 'Copy',
    title: 'Copy (Ctrl+C)',
    iconKey: 'editCopy',
    onClick: (a) => a.editCopy(),
  },
  {
    kind: 'button',
    id: 'tb-paste',
    label: 'Paste',
    title: 'Paste (Ctrl+V)',
    iconKey: 'editPaste',
    onClick: (a) => a.editPaste(),
  },
  { kind: 'separator' },
  // ── Undo/Redo ─────────────────────────────────────────────────────────────
  {
    kind: 'button',
    id: 'tb-undo',
    label: 'Undo',
    title: 'Undo (Ctrl+Z)',
    iconKey: 'editUndo',
    onClick: (a) => a.editUndo(),
  },
  {
    kind: 'button',
    id: 'tb-redo',
    label: 'Redo',
    title: 'Redo (Ctrl+Y)',
    iconKey: 'editRedo',
    onClick: (a) => a.editRedo(),
  },
  { kind: 'separator' },
  // ── Search ────────────────────────────────────────────────────────────────
  {
    kind: 'button',
    id: 'tb-find',
    label: 'Find',
    title: 'Find (Ctrl+F)',
    iconKey: 'searchFind',
    onClick: (a) => a.searchFind(),
  },
  {
    kind: 'button',
    id: 'tb-replace',
    label: 'Replace',
    title: 'Replace (Ctrl+H)',
    iconKey: 'searchReplace',
    onClick: (a) => a.searchReplace(),
  },
  { kind: 'separator' },
  // ── Zoom ──────────────────────────────────────────────────────────────────
  {
    kind: 'button',
    id: 'tb-zoom-in',
    label: 'Zoom In',
    title: 'Zoom In (Ctrl++)',
    iconKey: 'viewZoomIn',
    onClick: (a) => a.viewZoomIn(),
  },
  {
    kind: 'button',
    id: 'tb-zoom-out',
    label: 'Zoom Out',
    title: 'Zoom Out (Ctrl+-)',
    iconKey: 'viewZoomOut',
    onClick: (a) => a.viewZoomOut(),
  },
  { kind: 'separator' },
  // ── View toggles ──────────────────────────────────────────────────────────
  {
    kind: 'button',
    id: 'tb-word-wrap',
    label: 'Word Wrap',
    title: 'Word Wrap (Alt+Z)',
    iconKey: 'viewWordWrap',
    pressed: (s) => s.wordWrapOn(),
    onClick: (a) => a.viewWordWrap(),
  },
  {
    kind: 'button',
    id: 'tb-show-all-chars',
    label: 'Show All Chars',
    title: 'Show All Characters',
    iconKey: 'viewShowAllChars',
    pressed: (s) => s.showAllCharsOn(),
    onClick: (a) => a.viewShowAllChars(),
  },
  {
    // DISABLED: CM6 has no built-in indent-guide support — honest, faithful to
    // the prior port decision (same rationale as the View > Show Symbol menu).
    kind: 'button',
    id: 'tb-indent-guide',
    label: 'Show Indent Guide',
    title: 'Show Indent Guide (not supported)',
    iconKey: 'viewShowIndentGuide',
    disabled: () => true,
    onClick: () => {
      /* intentionally disabled — no CM6 support */
    },
  },
  { kind: 'separator' },
  // ── Macro group ───────────────────────────────────────────────────────────
  {
    kind: 'button',
    id: 'tb-macro-record',
    label: 'Macro Record',
    title: 'Start/Stop Macro Recording',
    iconKey: 'macroRecordIdle', // startRecord.png (idle)
    iconKeyPressed: 'macroRecordActive', // stopRecord.png (while recording)
    pressed: (s) => s.macroIsRecording(),
    onClick: (a, s) => {
      if (s.macroIsRecording()) {
        a.macroStopRecording();
      } else {
        a.macroStartRecording();
      }
    },
  },
  {
    kind: 'button',
    id: 'tb-macro-playback',
    label: 'Playback',
    title: 'Macro Playback (Ctrl+Shift+P)',
    iconKey: 'macroPlayback',
    disabled: (s) => !s.macroHasMacro(),
    onClick: (a) => a.macroPlayback(),
  },
  {
    kind: 'button',
    id: 'tb-macro-run-multiple',
    label: 'Run Macro Multiple Times',
    title: 'Run Macro Multiple Times',
    iconKey: 'macroRunMultiple',
    disabled: (s) => !s.macroHasRunnable(),
    onClick: (a) => a.macroRunMultiple(),
  },
  {
    kind: 'button',
    id: 'tb-macro-save',
    label: 'Save Current Macro',
    title: 'Save Current Recorded Macro',
    iconKey: 'macroSave',
    disabled: (s) => !s.macroHasMacro(),
    onClick: (a) => a.macroSaveCurrent(),
  },
];

// ── Toolbar class ─────────────────────────────────────────────────────────────

export class Toolbar {
  private root: HTMLElement;

  constructor(private container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'toolbar-inner';
    this.root.setAttribute('role', 'toolbar');
    this.root.setAttribute('aria-label', 'Main toolbar');
    this.root.className = 'toolbar';
    this.container.appendChild(this.root);
  }

  /**
   * Build/rebuild the toolbar DOM from current state.
   * Call this whenever toggle state (wordwrap, showAllChars, recording, macro
   * availability) changes — same trigger as app.ts uses for renderMenuBar().
   */
  render(actions: MenuBarActions, state: ToolbarState): void {
    this.root.innerHTML = '';

    for (const def of BUTTON_DEFS) {
      if (def.kind === 'separator') {
        const sep = document.createElement('span');
        sep.className = 'toolbar-sep';
        sep.setAttribute('aria-hidden', 'true');
        this.root.appendChild(sep);
        continue;
      }

      const isDisabled = def.disabled ? def.disabled(state) : false;
      const isPressed = def.pressed ? def.pressed(state) : false;

      const btn = document.createElement('button');
      btn.id = def.id;
      btn.type = 'button';
      btn.className = 'toolbar-btn';
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', def.label);
      btn.title = def.title;

      // Choose the active icon: use iconKeyPressed when pressed, otherwise iconKey.
      const activeIconKey = isPressed && def.iconKeyPressed ? def.iconKeyPressed : def.iconKey;
      const iconFile = ICON_FILES[activeIconKey];
      if (iconFile) {
        btn.appendChild(makeIconImg(iconFile));
      }

      if (isDisabled) {
        btn.classList.add('toolbar-btn--disabled');
        btn.setAttribute('aria-disabled', 'true');
        btn.setAttribute('tabindex', '-1');
      } else {
        btn.setAttribute('tabindex', '0');
        btn.addEventListener('click', () => def.onClick(actions, state));
      }

      if (isPressed) {
        btn.classList.add('toolbar-btn--pressed');
        btn.setAttribute('aria-pressed', 'true');
      } else if (def.pressed) {
        btn.setAttribute('aria-pressed', 'false');
      }

      this.root.appendChild(btn);
    }
  }
}

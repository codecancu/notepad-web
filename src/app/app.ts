// SPDX-License-Identifier: GPL-3.0-or-later
import { EditorView, keymap, highlightWhitespace } from '@codemirror/view';
import { Compartment } from '@codemirror/state';
import { autocompletion } from '@codemirror/autocomplete';
import { undo, redo, selectAll, indentMore, indentLess } from '@codemirror/commands';
import { foldAll, unfoldAll } from '@codemirror/language';
import { gotoLine, findNext, findPrevious } from '@codemirror/search';
import { notepadLightTheme } from '../editor/notepad-light-theme';
import { DocumentStore } from '../services/document-store';
import { PersistenceService } from '../services/persistence-service';
import { SettingsService } from '../services/settings-service';
import type { Settings } from '../services/settings-service';
import { ThemeService } from '../services/theme-service';
import { FileService } from '../services/file-service';
import { RecentFilesService } from '../services/recent-files-service';
import { EditorController } from '../editor/editor-controller';
import { TabBar } from './tabbar';
import { showContextMenu } from './context-menu';
import { FileActions } from './file-actions';
import { SessionSync } from './session-sync';
import { StatusBar } from './statusbar';
import { SettingsPanel } from './settings-panel';
import { MenuBar } from './menu-bar';
import { Toolbar } from './toolbar';
import { MacroStore } from './macro-store';
import { MacroSaveDialog } from './macro-save-dialog';
import { MacroRunDialog } from './macro-run-dialog';
import { FindDialog } from './find-dialog';
import { luaRegistry } from '../services/lua-registry';
import { languageExtensionFor } from '../editor/language-support';
import { wordCompletionSource } from '../editor/word-completion';
import {
  moveLineUp,
  moveLineDown,
  duplicateCurrentLine,
  cmdSortLinesAsc,
  cmdSortLinesAscCI,
  cmdSortLinesByLengthAsc,
  cmdSortLinesDesc,
  cmdSortLinesDescCI,
  cmdSortLinesByLengthDesc,
  cmdReverseLineOrder,
  cmdRemoveDuplicateLines,
  cmdRemoveConsecutiveDuplicateLines,
  cmdRemoveEmptyLines,
  cmdJoinLines,
  cmdSplitLines,
  cmdToUpperCase,
  cmdToLowerCase,
  makeEolCommand,
  makeCommentCommands,
  cmdBase64Encode,
  cmdBase64Decode,
  cmdUrlEncode,
  cmdUrlDecode,
} from '../editor/edit-commands';
import {
  cmdToggleBookmark,
  cmdNextBookmark,
  cmdPrevBookmark,
  cmdClearBookmarks,
  cmdInvertBookmarks,
  cmdCutBookmarkedLines,
  cmdCopyBookmarkedLines,
  cmdDeleteBookmarkedLines,
} from '../editor/bookmarks';
import { cmdMark, cmdClearMark, cmdClearAllMarks } from '../editor/marker';
import { applyEol } from '../services/text-utils';
import {
  startRecording,
  stopRecording,
  isRecording,
  getCurrentMacro,
  replayMacro,
  recordStep,
  fnToName,
} from '../editor/macro';

export interface AppDeps {
  view: EditorView;
  controller: EditorController;
  tabCompartment: Compartment;
  wrapCompartment: Compartment;
  store: DocumentStore;
  persistence: PersistenceService;
  settings: SettingsService;
  theme: ThemeService;
  file: FileService;
  /** Optional compartment for injecting extra keybindings (edit commands). */
  editKeymapCompartment?: Compartment;
  /** Optional compartment for whitespace/EOL symbol display. */
  symbolCompartment?: Compartment;
  /** Optional RecentFilesService override (for testing). */
  recentFiles?: RecentFilesService;
}

export class App {
  private controller: EditorController;
  private view: EditorView;

  constructor(private deps: AppDeps) {
    this.controller = deps.controller;
    this.view = deps.view;
  }

  async start(): Promise<void> {
    const loaded = await this.deps.settings.load();

    // Restore session from IndexedDB, or create one empty doc.
    const restored = await this.deps.persistence.loadSession().catch(() => null);
    if (restored && restored.docs.length) {
      restored.docs.forEach((d) => this.deps.store.add(d));
      if (restored.activeId) this.deps.store.setActive(restored.activeId);
    } else {
      this.deps.store.create();
    }

    // fileActionsRef and doSaveAsRef are populated after their respective values are
    // created below. The tabBarContextCallbacks wrapper closes over them lazily.
    const fileActionsRef: { current: FileActions | null } = { current: null };
    const doSaveAsRef: { current: (() => Promise<void>) | null } = { current: null };

    const tabbar = new TabBar(
      document.getElementById('tabbar')!,
      this.deps.store,
      (id) => {
        this.deps.store.setActive(id);
        this.controller.showDoc(id);
      },
      (id) => {
        const doc = this.deps.store.get(id);
        if (doc?.dirty && !confirm(`Discard unsaved changes to ${doc.name}?`)) return;
        this.deps.store.remove(id);
        const next = this.deps.store.active();
        if (next) {
          this.controller.showDoc(next.id);
        } else {
          const d = this.deps.store.create();
          this.controller.showDoc(d.id);
        }
        this.controller.closeDoc(id);
      },
      () => {
        const d = this.deps.store.create();
        this.controller.showDoc(d.id);
      },
      {
        onSave: () => void fileActionsRef.current?.saveActive(),
        onSaveAs: () => void doSaveAsRef.current?.(),
        onCloseAllExceptActive: () => fileActionsRef.current?.closeAllExceptActive(),
        onCloseAllToLeft: () => fileActionsRef.current?.closeAllToLeft(),
        onCloseAllToRight: () => fileActionsRef.current?.closeAllToRight(),
        onReload: () => void fileActionsRef.current?.reloadActive(),
      },
    );
    tabbar.render();

    const sync = new SessionSync(this.deps.store, this.deps.persistence);
    sync.attach();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void sync.flush();
    });
    window.addEventListener('pagehide', () => void sync.flush());

    const active = this.deps.store.active();
    if (active) this.controller.showDoc(active.id);

    const fileActions = new FileActions({
      file: this.deps.file,
      store: this.deps.store,
      controller: this.controller,
    });
    fileActionsRef.current = fileActions;

    const recentFilesService = this.deps.recentFiles ?? new RecentFilesService();

    // StatusBar: shows language · EOL · cursor for the active doc.
    const statusbar = new StatusBar(document.getElementById('statusbar')!, this.deps.store);
    // Update cursor position from CM6 view update — wired via the controller's
    // onUpdate which is called from the updateListener extension in editor-page.ts.
    this.view.dom.addEventListener('cm-cursor-change', (e: Event) => {
      const ce = e as CustomEvent<{ line: number; col: number }>;
      statusbar.setCursor(ce.detail.line, ce.detail.col);
    });

    // Track the current word-wrap state so the toolbar can read it synchronously.
    // Initialised to false; updated by applySettings() and doWordWrap().
    let wordWrapActive = false;

    // applySettings: push fontSize/tabSize/wordWrap/theme/autoCompletion to CM6.
    const applySettings = (s: Settings): void => {
      wordWrapActive = s.wordWrap;
      // ── Font size ──────────────────────────────────────────────────────────
      // Written to the editor DOM element's inline style; __getFontSize() reads it.
      this.view.dom.style.fontSize = `${s.fontSize}px`;

      // ── Tab size + Word wrap ───────────────────────────────────────────────
      // Delegate to EditorController.setEditorOptions() which BOTH reconfigures
      // the active view's compartments AND stores the current Extension values so
      // that new document states created by showDoc() (new tabs opened later)
      // are seeded with the current settings instead of CM6 defaults.
      this.controller.setEditorOptions({ tabSize: s.tabSize, wordWrap: s.wordWrap });

      // ── Autocompletion (AutoCompletion decorator faithful mapping) ─────────
      // Gated by Settings.autoCompletion. Uses wordCompletionSource (document-word
      // source faithful to NotepadNext AutoCompletion). The compartment lives on the
      // controller so new tabs opened after a settings change inherit the setting.
      const autoCompletionExt = s.autoCompletion
        ? autocompletion({ override: [wordCompletionSource] })
        : [];
      this.controller.setAutoCompletion(autoCompletionExt);

      // ── Theme ──────────────────────────────────────────────────────────────
      const eff = new ThemeService(() => s.theme).effective();
      // Swap the theme compartment: dark stub vs light (Notepad++ faithful).
      // Full dark theme is out of scope for P1.5; light/system → notepadLightTheme.
      // Use controller.setTheme() so the new extension is ALSO stored in
      // _currentThemeExt — this ensures new tabs opened after the theme change
      // inherit the correct theme rather than always defaulting to light mode.
      this.controller.setTheme(
        eff === 'dark' ? EditorView.theme({}, { dark: true }) : notepadLightTheme,
      );
    };

    // SettingsPanel: opened via Ctrl/Cmd+Comma (handled in keydown above).
    const panel = new SettingsPanel(
      document.getElementById('settings')!,
      this.deps.settings,
      applySettings,
    );

    // MacroStore: loads persisted saved macros from IndexedDB on startup.
    const macroStore = new MacroStore(this.deps.persistence);
    await macroStore
      .load()
      .catch((err) => console.error('[MacroStore] failed to load macros', err));
    // Wire E2E helper (populated after macroStore.load; updated lazily on every read).
    (window as { __savedMacroNames?: () => string[] }).__savedMacroNames = () =>
      macroStore.list().map((m) => m.name);

    // Macro dialogs: create container elements appended to document.body (not #app).
    // Appending to #app would make the root a grid item (since #app is display:grid),
    // potentially disrupting the shell layout.  Attaching to body means the element
    // sits outside the grid entirely; the position:fixed overlay CSS does the rest.
    const getMacroDialogEl = (id: string): HTMLElement => {
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement('div');
        el.id = id;
        el.hidden = true;
        document.body.appendChild(el);
      }
      return el;
    };

    // Lazy render callbacks: the actual renderMenuBar/renderToolbar functions are
    // defined later in this async start() body, but object wrappers break the TDZ
    // since we only call them after the functions have been assigned.
    const menuBarRef: { render: () => void } = { render: () => undefined };
    const toolbarRef: { render: () => void } = { render: () => undefined };

    const macroSaveDialog = new MacroSaveDialog(
      getMacroDialogEl('macro-save-dialog'),
      macroStore,
      () => menuBarRef.render(),
    );

    const macroRunDialog = new MacroRunDialog(
      getMacroDialogEl('macro-run-dialog'),
      macroStore,
      () => this.view,
    );

    const findDialog = new FindDialog(
      getMacroDialogEl('find-dialog'),
      this.deps.store,
      this.controller,
      this.deps.persistence,
    );

    // ── Helpers for focus-then-dispatch CM6 commands ────────────────────────

    /** Focus the CM view then run a CM6 command function on it. */
    const runCmd = (cmd: (v: EditorView) => boolean): void => {
      this.view.focus();
      if (isRecording() && fnToName.has(cmd)) {
        recordStep({ type: 'command', name: fnToName.get(cmd)! });
      }
      cmd(this.view);
    };

    // ── Clipboard helpers (menu-triggered; focus view first) ────────────────

    const doCut = (): void => {
      this.view.focus();
      document.execCommand('cut');
    };

    const doCopy = (): void => {
      this.view.focus();
      document.execCommand('copy');
    };

    const doPaste = (): void => {
      this.view.focus();
      document.execCommand('paste');
    };

    // ── Editor context menu ─────────────────────────────────────────────────
    // Attached to scrollDOM so it fires regardless of whether the pointer is over
    // the content area, gutter, or scrollbar region.
    this.view.scrollDOM.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Compute the CM6 doc position at the pointer.
      const pos = this.view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos !== null) {
        const sel = this.view.state.selection.main;
        // Only move the caret if the click is outside the current selection.
        if (pos < sel.from || pos > sel.to) {
          this.view.dispatch({ selection: { anchor: pos } });
        }
      }

      const hasSelection = !this.view.state.selection.main.empty;

      showContextMenu(
        [
          { label: 'Undo', enabled: true, action: () => runCmd(undo) },
          { label: 'Redo', enabled: true, action: () => runCmd(redo) },
          { label: '', type: 'separator', enabled: false },
          { label: 'Cut', enabled: hasSelection, action: doCut },
          { label: 'Copy', enabled: hasSelection, action: doCopy },
          { label: 'Paste', enabled: true, action: doPaste },
          {
            label: 'Delete',
            enabled: hasSelection,
            action: hasSelection
              ? () => {
                  const { from, to } = this.view.state.selection.main;
                  this.view.dispatch({ changes: { from, to, insert: '' } });
                }
              : undefined,
          },
          { label: '', type: 'separator', enabled: false },
          { label: 'Select All', enabled: true, action: () => runCmd(selectAll) },
        ],
        e.clientX,
        e.clientY,
      );
    });

    // ── File helpers ────────────────────────────────────────────────────────

    const doNew = (): void => {
      const d = this.deps.store.create();
      this.controller.showDoc(d.id);
    };

    const doClose = (): void => {
      const active_ = this.deps.store.active();
      if (!active_) return;
      const id = active_.id;
      if (active_.dirty && !confirm(`Discard unsaved changes to ${active_.name}?`)) return;
      this.deps.store.remove(id);
      const next = this.deps.store.active();
      if (next) {
        this.controller.showDoc(next.id);
      } else {
        const d = this.deps.store.create();
        this.controller.showDoc(d.id);
      }
      this.controller.closeDoc(id);
    };

    const doCloseAll = (): void => {
      const ids = this.deps.store.list().map((d) => d.id);
      for (const id of ids) {
        const doc = this.deps.store.get(id);
        if (doc?.dirty && !confirm(`Discard unsaved changes to ${doc.name}?`)) continue;
        this.deps.store.remove(id);
        this.controller.closeDoc(id);
      }
      // Ensure at least one doc is open.
      if (!this.deps.store.active()) {
        const d = this.deps.store.create();
        this.controller.showDoc(d.id);
      }
    };

    const doSaveAs = async (): Promise<void> => {
      const doc = this.deps.store.active();
      if (!doc) return;
      const handle = await this.deps.file.saveAs(doc.name, doc.content, doc.eol, doc.bom);
      if (!handle) return;
      this.deps.store.update(doc.id, { handle, name: handle.name });
      this.deps.store.update(doc.id, { dirty: false });
      // Record in recent files.
      void recentFilesService.add(handle.name);
      renderMenuBar();
    };
    doSaveAsRef.current = doSaveAs;

    // ── Show Symbol compartment ─────────────────────────────────────────────
    // Uses a CM6 Compartment (on the EditorController) to toggle whitespace/EOL
    // highlight extensions.  The controller's symbolCompartment is embedded in
    // every per-document EditorState so new tabs inherit the current setting.
    // Three states: whitespace only, EOL only, both (All Characters), or none.

    /** Bitmask for which symbol overlays are active. */
    let symbolFlags = 0;
    const FLAG_WHITESPACE = 1;
    const FLAG_EOL = 2;

    // CM6's highlightWhitespace() renders spaces/tabs as visible dots.
    // highlightTrailingWhitespace() only marks trailing ws — not what we want.
    // We combine highlightWhitespace() for Show Whitespace (dots on all spaces/tabs)
    // and a simple EditorView.theme entry to show CR/LF glyphs for Show EOL.

    /**
     * Build a CM6 extension set from the current symbolFlags.
     * highlightWhitespace() → spaces/tabs as visible marks.
     * For EOL, we inject a CSS class on .cm-line::after to show ¶.
     */
    const buildSymbolExt = (flags: number) => {
      const exts = [];
      if (flags & FLAG_WHITESPACE) {
        exts.push(highlightWhitespace());
      }
      if (flags & FLAG_EOL) {
        // Inject a CSS rule that appends ¶ after each line via ::after.
        exts.push(
          EditorView.theme({
            '.cm-line::after': {
              content: '"¶"',
              opacity: '0.4',
              color: '#888',
              pointerEvents: 'none',
            },
          }),
        );
      }
      return exts;
    };

    // Use the deps.symbolCompartment override if provided (for testing), but
    // prefer the controller's built-in symbolCompartment so that new document
    // states seeded by showDoc() inherit the current symbol-display flags.
    // When deps.symbolCompartment is provided (tests), fall back to dispatching
    // directly on it as before to avoid breaking the test contract.
    const legacySymbolCompartment = this.deps.symbolCompartment;

    const applySymbolFlags = (flags: number): void => {
      symbolFlags = flags;
      const ext = buildSymbolExt(flags);
      if (legacySymbolCompartment) {
        // Test-injection path: dispatch onto the injected compartment directly.
        this.view.dispatch({ effects: legacySymbolCompartment.reconfigure(ext) });
      } else {
        // Production path: use the controller's symbolCompartment so new tabs
        // opened after the toggle inherit the current setting (Fix 2).
        this.controller.setSymbolExt(ext);
      }
    };

    const doShowWhitespace = (): void => {
      applySymbolFlags(symbolFlags ^ FLAG_WHITESPACE);
      toolbarRef.render();
    };

    const doShowEol = (): void => {
      applySymbolFlags(symbolFlags ^ FLAG_EOL);
      toolbarRef.render();
    };

    const doShowAllChars = (): void => {
      // If both are already on, toggle both off; otherwise turn both on.
      const allOn = FLAG_WHITESPACE | FLAG_EOL;
      applySymbolFlags(symbolFlags === allOn ? 0 : allOn);
      toolbarRef.render();
    };

    // ── Fold helpers ─────────────────────────────────────────────────────────
    // foldAll/unfoldAll from @codemirror/language work on the current view's
    // syntax tree. They require a language with folding support (e.g. JS, Python).

    const doFoldAll = (): void => runCmd(foldAll);
    const doUnfoldAll = (): void => runCmd(unfoldAll);

    // ── Full Screen ──────────────────────────────────────────────────────────

    const doFullScreen = (): void => {
      if (!document.fullscreenElement) {
        void document.documentElement.requestFullscreen();
      } else {
        void document.exitFullscreen();
      }
    };

    // ── Zoom helpers ─────────────────────────────────────────────────────────

    const DEFAULT_FONT_SIZE = 14;

    const doZoomIn = async (): Promise<void> => {
      const s = await this.deps.settings.load();
      const next = await this.deps.settings.update({ fontSize: s.fontSize + 1 });
      applySettings(next);
    };

    const doZoomOut = async (): Promise<void> => {
      const s = await this.deps.settings.load();
      const next = await this.deps.settings.update({
        fontSize: Math.max(6, s.fontSize - 1),
      });
      applySettings(next);
    };

    const doZoomReset = async (): Promise<void> => {
      const next = await this.deps.settings.update({ fontSize: DEFAULT_FONT_SIZE });
      applySettings(next);
    };

    // ── Word-wrap toggle ─────────────────────────────────────────────────────

    const doWordWrap = async (): Promise<void> => {
      const s = await this.deps.settings.load();
      const next = await this.deps.settings.update({ wordWrap: !s.wordWrap });
      applySettings(next);
      toolbarRef.render();
    };

    // ── Encoding menu ────────────────────────────────────────────────────────
    // Toggle the BOM flag on the active doc. The flag is applied on the next save.

    const doEncodingUtf8 = (): void => {
      const doc = this.deps.store.active();
      if (!doc) return;
      this.deps.store.update(doc.id, { bom: false });
    };

    const doEncodingUtf8Bom = (): void => {
      const doc = this.deps.store.active();
      if (!doc) return;
      this.deps.store.update(doc.id, { bom: true });
    };

    // ── Recent Files ─────────────────────────────────────────────────────────

    const doRecentFilesRestoreLast = async (): Promise<void> => {
      const list = await recentFilesService.list();
      if (list.length === 0) {
        alert('No recently closed files to restore.');
        return;
      }
      // Attempt to open via picker (no stored handle; FSA requires user gesture).
      void fileActions.openFile();
    };

    const doRecentFilesOpenAll = async (): Promise<void> => {
      const list = await recentFilesService.list();
      if (list.length === 0) {
        alert('No recent files to open.');
        return;
      }
      // Opening each file requires a user-gesture FSA picker per file.
      // We open one picker per entry; the user selects the file.
      for (let i = 0; i < list.length; i++) {
        await fileActions.openFile();
      }
    };

    const doRecentFilesClear = async (): Promise<void> => {
      await recentFilesService.clear();
      renderMenuBar();
    };

    // ── About / Debug dialogs ─────────────────────────────────────────────────

    const doAbout = (): void => {
      alert('NotePad Web\nA Notepad++-faithful web editor.\nLicense: GPL-3.0-or-later');
    };

    const doDebugInfo = (): void => {
      const info = [
        `User Agent: ${navigator.userAgent}`,
        `CM6 docs open: ${this.deps.store.list().length}`,
        `Active doc: ${this.deps.store.active()?.name ?? '(none)'}`,
      ].join('\n');
      alert(info);
    };

    const doDebugLog = (): void => {
      // Delegate to the global toggle registered in editor-page.ts.
      // Using window indirection keeps app.ts free of a direct dockview import.
      (window as { __debugLogToggle?: () => void }).__debugLogToggle?.();
    };

    const doFileList = (): void => {
      (window as { __fileListToggle?: () => void }).__fileListToggle?.();
    };

    const doWorkspaceToggle = (): void => {
      (window as { __workspaceToggle?: () => void }).__workspaceToggle?.();
    };

    const doEditorInspector = (): void => {
      (window as { __editorInspectorToggle?: () => void }).__editorInspectorToggle?.();
    };

    const doLanguageInspector = (): void => {
      (window as { __languageInspectorToggle?: () => void }).__languageInspectorToggle?.();
    };

    const doLuaConsole = (): void => {
      (window as { __luaConsoleToggle?: () => void }).__luaConsoleToggle?.();
    };

    const doOpenFolder = (): void => {
      (window as { __workspaceOpen?: () => void }).__workspaceOpen?.();
    };

    // ── Edit commands (line ops, case, EOL, comment, encode) ─────────────────

    /** Get the single-line comment token for the currently active document's language. */
    const getCommentToken = (): string | undefined => {
      const doc = this.deps.store.active();
      if (!doc) return undefined;
      return luaRegistry.getLanguage(doc.languageId)?.singleLineComment;
    };

    const commentCmds = makeCommentCommands(getCommentToken);

    /** Build an EOL conversion command: normalise doc text + update store.eol. */
    const makeEolCmd = (eolValue: 'lf' | 'crlf' | 'cr') =>
      makeEolCommand(eolValue, () => {
        const doc = this.deps.store.active();
        if (!doc) return;
        // Update the store's eol so StatusBar reflects the change.
        this.deps.store.update(doc.id, { eol: eolValue });
        // Sync the doc content so the store agrees with the CM6 state.
        const text = this.view.state.doc.toString();
        this.deps.store.update(doc.id, { content: applyEol(text, eolValue) });
      });

    // ── Language menu items — built after registry resolves ───────────────────

    const buildLangItems = (): Array<{ label: string; action: () => void }> => {
      const names = luaRegistry.listLanguages().sort();
      return names.map((name) => ({
        label: name,
        action: () => {
          const doc = this.deps.store.active();
          if (!doc) return;
          // Update the store's languageId.
          this.deps.store.update(doc.id, { languageId: name });
          // Reconfigure the lang compartment with the CM6 extension.
          const ext = languageExtensionFor(name) ?? [];
          this.view.dispatch({
            effects: this.controller.langCompartment.reconfigure(ext),
          });
        },
      }));
    };

    // ── Build and render the menu bar + toolbar ───────────────────────────────

    const menubarEl = document.getElementById('menubar')!;
    const menuBar = new MenuBar(menubarEl);

    const toolbarEl = document.getElementById('toolbar')!;
    const toolbar = new Toolbar(toolbarEl);

    const renderMenuBar = (): void => {
      void recentFilesService.list().then((recentList) => {
        menuBar.buildAndRender(
          MenuBar.buildMenuDefs({
            fileNew: doNew,
            fileOpenFolder: doOpenFolder,
            fileOpen: () => {
              void fileActions.openFile().then(() => {
                // After opening, record the file in recent files.
                const active_ = this.deps.store.active();
                if (active_?.name) {
                  void recentFilesService.add(active_.name).then(() => renderMenuBar());
                }
              });
            },
            fileSave: () => void fileActions.saveActive(),
            fileSaveAs: () => void doSaveAs(),
            fileSaveAll: () => void fileActions.saveAll(),
            fileSaveCopyAs: () => void fileActions.saveCopyAs(),
            fileReload: () => void fileActions.reloadActive(),
            fileClose: doClose,
            fileCloseAll: doCloseAll,
            fileCloseAllExceptActive: () => fileActions.closeAllExceptActive(),
            fileCloseAllToLeft: () => fileActions.closeAllToLeft(),
            fileCloseAllToRight: () => fileActions.closeAllToRight(),
            editUndo: () => runCmd(undo),
            editRedo: () => runCmd(redo),
            editCut: doCut,
            editCopy: doCopy,
            editPaste: doPaste,
            editSelectAll: () => runCmd(selectAll),
            // Indent
            editIndentMore: () => runCmd(indentMore),
            editIndentLess: () => runCmd(indentLess),
            // Convert Case
            editUpperCase: () => runCmd(cmdToUpperCase),
            editLowerCase: () => runCmd(cmdToLowerCase),
            // EOL Conversion
            editEolWindows: () => runCmd(makeEolCmd('crlf')),
            editEolUnix: () => runCmd(makeEolCmd('lf')),
            editEolMac: () => runCmd(makeEolCmd('cr')),
            // Line Operations
            editDuplicateLine: () => runCmd(duplicateCurrentLine),
            editSplitLines: () => runCmd(cmdSplitLines),
            editJoinLines: () => runCmd(cmdJoinLines),
            editMoveLineUp: () => runCmd(moveLineUp),
            editMoveLineDown: () => runCmd(moveLineDown),
            editRemoveEmptyLines: () => runCmd(cmdRemoveEmptyLines),
            editRemoveDuplicateLines: () => runCmd(cmdRemoveDuplicateLines),
            editRemoveConsecutiveDupLines: () => runCmd(cmdRemoveConsecutiveDuplicateLines),
            editReverseLineOrder: () => runCmd(cmdReverseLineOrder),
            editSortLinesAsc: () => runCmd(cmdSortLinesAsc),
            editSortLinesAscCI: () => runCmd(cmdSortLinesAscCI),
            editSortLinesByLengthAsc: () => runCmd(cmdSortLinesByLengthAsc),
            editSortLinesDesc: () => runCmd(cmdSortLinesDesc),
            editSortLinesDescCI: () => runCmd(cmdSortLinesDescCI),
            editSortLinesByLengthDesc: () => runCmd(cmdSortLinesByLengthDesc),
            // Comment/Uncomment
            editToggleLineComment: () => runCmd(commentCmds.toggle),
            editAddLineComment: () => runCmd(commentCmds.add),
            editRemoveLineComment: () => runCmd(commentCmds.remove),
            // Encoding/Decoding
            editBase64Encode: () => runCmd(cmdBase64Encode),
            editBase64Decode: () => runCmd(cmdBase64Decode),
            editUrlEncode: () => runCmd(cmdUrlEncode),
            editUrlDecode: () => runCmd(cmdUrlDecode),
            searchFind: () => findDialog.open('find'),
            searchReplace: () => findDialog.open('replace'),
            searchFindNext: () => runCmd(findNext),
            searchFindPrev: () => runCmd(findPrevious),
            searchGoToLine: () => runCmd(gotoLine),
            searchToggleBookmark: () => runCmd(cmdToggleBookmark),
            searchNextBookmark: () => runCmd(cmdNextBookmark),
            searchPrevBookmark: () => runCmd(cmdPrevBookmark),
            searchClearBookmarks: () => runCmd(cmdClearBookmarks),
            searchInvertBookmarks: () => runCmd(cmdInvertBookmarks),
            searchCutBookmarkedLines: () => runCmd(cmdCutBookmarkedLines),
            searchCopyBookmarkedLines: () => runCmd(cmdCopyBookmarkedLines),
            searchDeleteBookmarkedLines: () => runCmd(cmdDeleteBookmarkedLines),
            searchAndBookmark: () => findDialog.openMarkTab({ bookmarkLine: true }),
            searchMarkStyle1: () => runCmd(cmdMark(0)),
            searchMarkStyle2: () => runCmd(cmdMark(1)),
            searchMarkStyle3: () => runCmd(cmdMark(2)),
            searchClearStyle1: () => runCmd(cmdClearMark(0)),
            searchClearStyle2: () => runCmd(cmdClearMark(1)),
            searchClearStyle3: () => runCmd(cmdClearMark(2)),
            searchClearAllStyles: () => runCmd(cmdClearAllMarks),
            viewShowWhitespace: doShowWhitespace,
            viewShowEndOfLine: doShowEol,
            viewShowAllChars: doShowAllChars,
            viewFoldAll: doFoldAll,
            viewUnfoldAll: doUnfoldAll,
            viewFullScreen: doFullScreen,
            viewWordWrap: () => void doWordWrap(),
            viewZoomIn: () => void doZoomIn(),
            viewZoomOut: () => void doZoomOut(),
            viewZoomReset: () => void doZoomReset(),
            encodingUtf8: doEncodingUtf8,
            encodingUtf8Bom: doEncodingUtf8Bom,
            recentFiles: recentList.map((entry) => ({
              name: entry.name,
              action: () => void fileActions.openFile(),
            })),
            recentFilesRestoreLast: () => void doRecentFilesRestoreLast(),
            recentFilesOpenAll: () => void doRecentFilesOpenAll(),
            recentFilesClear: () => void doRecentFilesClear(),
            settingsPrefs: () => panel.open(),
            helpAbout: doAbout,
            helpDebugInfo: doDebugInfo,
            helpDebugLog: doDebugLog,
            viewFileList: doFileList,
            viewWorkspace: doWorkspaceToggle,
            viewEditorInspector: doEditorInspector,
            viewLanguageInspector: doLanguageInspector,
            viewLuaConsole: doLuaConsole,
            langItems: buildLangItems(),
            macroStartRecording: () => {
              startRecording();
              renderMenuBar();
              renderToolbar();
            },
            macroStopRecording: () => {
              stopRecording();
              renderMenuBar();
              renderToolbar();
            },
            macroPlayback: () => {
              const macro = getCurrentMacro();
              if (macro) replayMacro(this.view, macro, 1);
            },
            macroIsRecording: isRecording,
            macroHasMacro: () => getCurrentMacro() !== null,
            // Run-Multiple is usable with any saved macro too (survives reload),
            // faithful to MainWindow.cpp:798 (availableMacros>0 || currentUnsaved).
            macroHasRunnable: () => getCurrentMacro() !== null || macroStore.list().length > 0,
            macroRunMultiple: () => macroRunDialog.open(),
            macroSaveCurrent: () => macroSaveDialog.open(),
            macroSavedItems: macroStore.list().map((m) => ({
              name: m.name,
              action: () => replayMacro(this.view, m, 1),
            })),
          }),
        );
      });
    };

    // Wire the lazy reference now that renderMenuBar is defined.
    menuBarRef.render = renderMenuBar;

    // ── Toolbar render ────────────────────────────────────────────────────────
    // The toolbar reuses the same callbacks as the menu bar. We build a stable
    // actions object (no recent-files list needed — toolbar doesn't use it) and
    // read toggle state from closures over the same live variables.
    const toolbarActions = {
      fileNew: doNew,
      fileOpen: () => void fileActions.openFile(),
      fileSave: () => void fileActions.saveActive(),
      fileSaveAs: () => void doSaveAs(),
      fileSaveAll: () => void fileActions.saveAll(),
      fileSaveCopyAs: () => void fileActions.saveCopyAs(),
      fileReload: () => void fileActions.reloadActive(),
      fileClose: doClose,
      fileCloseAll: doCloseAll,
      fileCloseAllExceptActive: () => fileActions.closeAllExceptActive(),
      fileCloseAllToLeft: () => fileActions.closeAllToLeft(),
      fileCloseAllToRight: () => fileActions.closeAllToRight(),
      editUndo: () => runCmd(undo),
      editRedo: () => runCmd(redo),
      editCut: doCut,
      editCopy: doCopy,
      editPaste: doPaste,
      editSelectAll: () => runCmd(selectAll),
      editIndentMore: () => runCmd(indentMore),
      editIndentLess: () => runCmd(indentLess),
      editUpperCase: () => runCmd(cmdToUpperCase),
      editLowerCase: () => runCmd(cmdToLowerCase),
      editEolWindows: () => runCmd(makeEolCmd('crlf')),
      editEolUnix: () => runCmd(makeEolCmd('lf')),
      editEolMac: () => runCmd(makeEolCmd('cr')),
      editDuplicateLine: () => runCmd(duplicateCurrentLine),
      editSplitLines: () => runCmd(cmdSplitLines),
      editJoinLines: () => runCmd(cmdJoinLines),
      editMoveLineUp: () => runCmd(moveLineUp),
      editMoveLineDown: () => runCmd(moveLineDown),
      editRemoveEmptyLines: () => runCmd(cmdRemoveEmptyLines),
      editRemoveDuplicateLines: () => runCmd(cmdRemoveDuplicateLines),
      editRemoveConsecutiveDupLines: () => runCmd(cmdRemoveConsecutiveDuplicateLines),
      editReverseLineOrder: () => runCmd(cmdReverseLineOrder),
      editSortLinesAsc: () => runCmd(cmdSortLinesAsc),
      editSortLinesAscCI: () => runCmd(cmdSortLinesAscCI),
      editSortLinesByLengthAsc: () => runCmd(cmdSortLinesByLengthAsc),
      editSortLinesDesc: () => runCmd(cmdSortLinesDesc),
      editSortLinesDescCI: () => runCmd(cmdSortLinesDescCI),
      editSortLinesByLengthDesc: () => runCmd(cmdSortLinesByLengthDesc),
      editToggleLineComment: () => runCmd(commentCmds.toggle),
      editAddLineComment: () => runCmd(commentCmds.add),
      editRemoveLineComment: () => runCmd(commentCmds.remove),
      editBase64Encode: () => runCmd(cmdBase64Encode),
      editBase64Decode: () => runCmd(cmdBase64Decode),
      editUrlEncode: () => runCmd(cmdUrlEncode),
      editUrlDecode: () => runCmd(cmdUrlDecode),
      searchFind: () => findDialog.open('find'),
      searchReplace: () => findDialog.open('replace'),
      searchFindNext: () => runCmd(findNext),
      searchFindPrev: () => runCmd(findPrevious),
      searchGoToLine: () => runCmd(gotoLine),
      viewShowWhitespace: doShowWhitespace,
      viewShowEndOfLine: doShowEol,
      viewShowAllChars: doShowAllChars,
      viewFoldAll: doFoldAll,
      viewUnfoldAll: doUnfoldAll,
      viewFullScreen: doFullScreen,
      viewWordWrap: () => void doWordWrap(),
      viewZoomIn: () => void doZoomIn(),
      viewZoomOut: () => void doZoomOut(),
      viewZoomReset: () => void doZoomReset(),
      encodingUtf8: doEncodingUtf8,
      encodingUtf8Bom: doEncodingUtf8Bom,
      recentFiles: [],
      recentFilesRestoreLast: () => {
        /* not used by toolbar */
      },
      recentFilesOpenAll: () => {
        /* not used by toolbar */
      },
      recentFilesClear: () => {
        /* not used by toolbar */
      },
      settingsPrefs: () => panel.open(),
      helpAbout: doAbout,
      helpDebugInfo: doDebugInfo,
      helpDebugLog: doDebugLog,
      viewFileList: doFileList,
      viewWorkspace: doWorkspaceToggle,
      viewEditorInspector: doEditorInspector,
      viewLanguageInspector: doLanguageInspector,
      viewLuaConsole: doLuaConsole,
      fileOpenFolder: doOpenFolder,
      langItems: [],
      searchToggleBookmark: () => runCmd(cmdToggleBookmark),
      searchNextBookmark: () => runCmd(cmdNextBookmark),
      searchPrevBookmark: () => runCmd(cmdPrevBookmark),
      searchClearBookmarks: () => runCmd(cmdClearBookmarks),
      searchInvertBookmarks: () => runCmd(cmdInvertBookmarks),
      searchCutBookmarkedLines: () => runCmd(cmdCutBookmarkedLines),
      searchCopyBookmarkedLines: () => runCmd(cmdCopyBookmarkedLines),
      searchDeleteBookmarkedLines: () => runCmd(cmdDeleteBookmarkedLines),
      searchAndBookmark: () => findDialog.openMarkTab({ bookmarkLine: true }),
      searchMarkStyle1: () => runCmd(cmdMark(0)),
      searchMarkStyle2: () => runCmd(cmdMark(1)),
      searchMarkStyle3: () => runCmd(cmdMark(2)),
      searchClearStyle1: () => runCmd(cmdClearMark(0)),
      searchClearStyle2: () => runCmd(cmdClearMark(1)),
      searchClearStyle3: () => runCmd(cmdClearMark(2)),
      searchClearAllStyles: () => runCmd(cmdClearAllMarks),
      macroStartRecording: () => {
        startRecording();
        renderMenuBar();
        renderToolbar();
      },
      macroStopRecording: () => {
        stopRecording();
        renderMenuBar();
        renderToolbar();
      },
      macroPlayback: () => {
        const macro = getCurrentMacro();
        if (macro) replayMacro(this.view, macro, 1);
      },
      macroIsRecording: isRecording,
      macroHasMacro: () => getCurrentMacro() !== null,
      macroHasRunnable: () => getCurrentMacro() !== null || macroStore.list().length > 0,
      macroRunMultiple: () => macroRunDialog.open(),
      macroSaveCurrent: () => macroSaveDialog.open(),
      macroSavedItems: [],
    };

    const renderToolbar = (): void => {
      toolbar.render(toolbarActions, {
        wordWrapOn: () => wordWrapActive,
        showAllCharsOn: () => symbolFlags === (FLAG_WHITESPACE | FLAG_EOL),
        macroIsRecording: isRecording,
        macroHasMacro: () => getCurrentMacro() !== null,
        macroHasRunnable: () => getCurrentMacro() !== null || macroStore.list().length > 0,
      });
    };

    // Wire the lazy toolbar reference now that renderToolbar is defined.
    toolbarRef.render = renderToolbar;

    // Initial render (lang list may be empty if registry not ready).
    renderMenuBar();
    renderToolbar();

    // Re-render once the Lua registry resolves so Language menu is populated.
    luaRegistry
      .ready()
      .then(() => {
        renderMenuBar();
        renderToolbar();
      })
      .catch(() => {
        /* graceful no-op */
      });

    // ── Keyboard shortcuts ───────────────────────────────────────────────────
    // Registered AFTER `fileActions`/`panel` are initialized (no TDZ), via a DOM
    // keydown listener so shortcuts work even outside editor focus.
    // The CM6 searchKeymap already handles Ctrl+F/H/G/F3/Shift+F3 when the
    // editor is focused; these only handle the non-CM6-keymap shortcuts.
    //
    // Edit-command shortcuts (Ctrl+J, Ctrl+/, Ctrl+K, Ctrl+Shift+K,
    // Ctrl+Shift+Up, Ctrl+Shift+Down) are also made GLOBAL by the handler below
    // so they fire even when the editor is not focused (e.g. after clicking the
    // toolbar or menu).  The CM6 keymap handles the editor-focused case and sets
    // defaultPrevented=true; guard #1 below detects that and skips the global
    // handler to prevent double-execution.
    //
    // Accelerator wiring notes (Phase-2 close fixes):
    //   WIRED:   Ctrl+Alt+S (Save As), Ctrl+Shift+S (Save All),
    //            Ctrl+Shift+W (Close All), Ctrl++ / Ctrl+= (Zoom In),
    //            Ctrl+- (Zoom Out), Ctrl+0 (Reset Zoom), Alt+Z (Word Wrap).
    //   DE-LABELED: Ctrl+N (browser-reserved — opens new browser window),
    //               Ctrl+W (browser-reserved — closes browser tab),
    //               Ctrl+Shift+T (browser-reserved — restores closed tab).
    //               Accelerator labels removed from those menu items so the UI
    //               is honest about what is actually interceptable.
    // ── Capture-phase handler for Ctrl+F / Ctrl+H ────────────────────────────
    // Must use capture so we intercept the event BEFORE CM6's keydown handler
    // (attached to view.dom) fires — CM6's defaultKeymap binds Ctrl-f to
    // cursorCharRight and Ctrl-h to deleteCharBackward (Emacs keys on Linux).
    // Without capture, CM6 sees the key first, modifies the document, and then
    // our bubble-phase listener fires (calling e.preventDefault() too late).
    document.addEventListener(
      'keydown',
      (e) => {
        const mod = e.ctrlKey || e.metaKey;
        if (!mod) return;
        if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          findDialog.open('find');
        } else if (e.key === 'h' || e.key === 'H') {
          e.preventDefault();
          findDialog.open('replace');
        }
      },
      { capture: true },
    );

    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;

      // Alt+Z → Word Wrap (no Ctrl/Meta required).
      if (!mod && e.altKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        void doWordWrap();
        return;
      }

      if (!mod) return;

      if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        void fileActions.openFile();
      } else if (e.key === 's' || e.key === 'S') {
        if (e.altKey) {
          // Ctrl+Alt+S → Save As
          e.preventDefault();
          void doSaveAs();
        } else if (e.shiftKey) {
          // Ctrl+Shift+S → Save All
          e.preventDefault();
          void fileActions.saveAll();
        } else {
          // Ctrl+S → Save
          e.preventDefault();
          void fileActions.saveActive();
        }
      } else if ((e.key === 'w' || e.key === 'W') && e.shiftKey) {
        // Ctrl+Shift+W → Close All
        e.preventDefault();
        doCloseAll();
      } else if (e.key === ',') {
        e.preventDefault();
        panel.open();
      } else if (e.key === '+' || e.key === '=') {
        // Ctrl++ (or Ctrl+= on keyboards where + requires Shift) → Zoom In
        e.preventDefault();
        void doZoomIn();
      } else if (e.key === '-') {
        // Ctrl+- → Zoom Out
        e.preventDefault();
        void doZoomOut();
      } else if (e.key === '0') {
        // Ctrl+0 → Reset Zoom
        e.preventDefault();
        void doZoomReset();
      }
    });

    // ── Global editor-command shortcuts ──────────────────────────────────────
    // Routes shortcut keys to the active editor even when it does not have focus
    // (e.g. user clicked the toolbar, menu, or a panel).
    //
    // Guard #1 — defaultPrevented:
    //   When the editor IS focused, CM6's keymap handles the key and calls
    //   e.preventDefault() before this bubble-phase listener fires.  We bail out
    //   immediately so the command is NOT run a second time.
    //   When the editor is NOT focused, CM6 never sees the event, so
    //   defaultPrevented remains false and we run the command ourselves.
    //
    // Guard #2 — non-editor text fields:
    //   The editor is a contenteditable DIV (.cm-content), NOT an INPUT/TEXTAREA.
    //   Skipping when activeElement is INPUT or TEXTAREA ensures we do NOT hijack
    //   keystrokes typed into the Find dialog, Lua Console, or settings inputs.
    //   (All dialog/console inputs are verified to be <input type="text"> elements,
    //   not contenteditable — so this guard is sufficient.)
    document.addEventListener('keydown', (e) => {
      // Guard #1: CM6 already handled this (editor was focused) — skip.
      if (e.defaultPrevented) return;

      // Guard #2: typing in a real text field (Find dialog, Lua console, etc.) — skip.
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;

      const mod = e.ctrlKey || e.metaKey;

      /** Run a CM6 command on the active view, focusing the editor first. */
      const runEditorCmd = (cmd: (v: import('@codemirror/view').EditorView) => boolean): void => {
        const v = this.controller.getView();
        v.focus();
        if (isRecording() && fnToName.has(cmd)) {
          recordStep({ type: 'command', name: fnToName.get(cmd)! });
        }
        cmd(v);
        e.preventDefault();
      };

      // ── Search / navigation ──────────────────────────────────────────────
      if (!mod && !e.shiftKey && e.key === 'F3') {
        runEditorCmd(findNext);
      } else if (!mod && e.shiftKey && e.key === 'F3') {
        runEditorCmd(findPrevious);
      } else if (mod && !e.shiftKey && (e.key === 'g' || e.key === 'G')) {
        runEditorCmd(gotoLine);

        // ── Bookmarks ──────────────────────────────────────────────────────
      } else if (mod && !e.shiftKey && e.key === 'F2') {
        runEditorCmd(cmdToggleBookmark);
      } else if (!mod && !e.shiftKey && e.key === 'F2') {
        runEditorCmd(cmdNextBookmark);
      } else if (!mod && e.shiftKey && e.key === 'F2') {
        runEditorCmd(cmdPrevBookmark);

        // ── Macro ──────────────────────────────────────────────────────────
      } else if (mod && e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        const macro = getCurrentMacro();
        if (macro) {
          const v = this.controller.getView();
          v.focus();
          replayMacro(v, macro, 1);
          e.preventDefault();
        }

        // ── Line operations ────────────────────────────────────────────────
      } else if (mod && !e.shiftKey && !e.altKey && (e.key === 'j' || e.key === 'J')) {
        runEditorCmd(cmdJoinLines);
      } else if (mod && !e.shiftKey && e.key === '/') {
        runEditorCmd(commentCmds.toggle);
      } else if (mod && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K')) {
        runEditorCmd(commentCmds.add);
      } else if (mod && e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        runEditorCmd(commentCmds.remove);
      } else if (mod && e.shiftKey && e.key === 'ArrowUp') {
        runEditorCmd(moveLineUp);
      } else if (mod && e.shiftKey && e.key === 'ArrowDown') {
        runEditorCmd(moveLineDown);
      } else if (!mod && e.altKey && e.key === 'ArrowDown') {
        runEditorCmd(duplicateCurrentLine);
      }
    });

    // ── Edit-command keymap injected into CM6 ────────────────────────────────
    // These shortcuts handle the editor-focused case (CM6 invokes them when the
    // editor has focus) and set defaultPrevented, which guard #1 above relies on
    // to prevent double-execution in the global handler.
    // They are registered via the editKeymapCompartment if provided, or directly
    // via a view.dispatch effect on the shared keymap.
    // We use a simpler approach: dispatch an additional keymap extension.
    if (this.deps.editKeymapCompartment) {
      this.view.dispatch({
        effects: this.deps.editKeymapCompartment.reconfigure(
          keymap.of([
            { key: 'Ctrl-j', run: cmdJoinLines },
            { key: 'Ctrl-/', run: commentCmds.toggle },
            { key: 'Ctrl-k', run: commentCmds.add },
            { key: 'Ctrl-Shift-k', run: commentCmds.remove },
            { key: 'Ctrl-Shift-ArrowUp', run: moveLineUp },
            { key: 'Ctrl-Shift-ArrowDown', run: moveLineDown },
            // Alt+Down = Duplicate Current Line (faithful NotepadNext accelerator).
            { key: 'Alt-ArrowDown', run: duplicateCurrentLine },
            // Bookmark keybindings (faithful NotepadNext accelerators):
            //   Ctrl+F2  = Toggle Bookmark
            //   F2       = Next Bookmark
            //   Shift+F2 = Previous Bookmark
            { key: 'Ctrl-F2', run: cmdToggleBookmark },
            { key: 'F2', run: cmdNextBookmark },
            { key: 'Shift-F2', run: cmdPrevBookmark },
            // Macro: Ctrl+Shift+P = Playback last recorded macro.
            {
              key: 'Ctrl-Shift-p',
              run: () => {
                const macro = getCurrentMacro();
                if (macro) {
                  replayMacro(this.view, macro, 1);
                  return true;
                }
                return false;
              },
            },
          ]),
        ),
      });
    }

    // Apply persisted settings to editor on startup.
    applySettings(loaded);
  }
}

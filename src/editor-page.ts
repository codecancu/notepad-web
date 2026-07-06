// SPDX-License-Identifier: GPL-3.0-or-later
import { EditorState, EditorSelection, Compartment, Prec } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { EditorView, ViewUpdate, lineNumbers, highlightActiveLine, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { LuaFactory } from 'wasmoon';
import './styles.css';
import { DocumentStore } from './services/document-store';
import type { ViewId } from './services/document-store';
import type { SecondaryEditorHost } from './app/app';
import { PersistenceService } from './services/persistence-service';
import { SettingsService } from './services/settings-service';
import { ThemeService } from './services/theme-service';
import { FileService } from './services/file-service';
import { createStorage } from './services/chrome-adapter';
import { App } from './app/app';
import { EditorController } from './editor/editor-controller';
import { notepadBase } from './editor/notepad-light-theme';
import { notepadHighlight } from './editor/notepad-theme';
import { dockManager } from './app/dock-manager';
import { debugLog, mountDebugLogPanel } from './app/debug-log-panel';
import { mountFileListPanel } from './app/file-list-panel';
import { mountWorkspacePanel } from './app/workspace-panel';
import { mountEditorInspectorPanel } from './app/editor-inspector-panel';
import { mountLanguageInspectorPanel } from './app/language-inspector-panel';
import { luaRegistry } from './services/lua-registry';
import { mountLuaConsolePanel } from './app/lua-console-panel';
import { luaConsoleEngine } from './services/lua-console-engine';
import { createEditorBridge } from './services/lua-editor-bridge';
import {
  bookmarkExtension,
  getBookmarks,
  toggleBookmarkEffect,
  cmdDeleteBookmarkedLines,
  cmdInvertBookmarks,
} from './editor/bookmarks';
import { markerExtension, getMarkCount } from './editor/marker';
import {
  findHighlightExtension,
  getFindHighlightCount,
  getFindHighlightRanges,
} from './editor/find-highlight';
import { urlLinksExtension } from './editor/url-links';
import { htmlAutoCloseExtension } from './editor/html-autoclose';
import { macroRecorderExtension, isRecording, getCurrentMacro } from './editor/macro';
import { languageExtensionFor } from './editor/language-support';
import { mountSearchResultsPanel } from './app/search-results-panel';
import { searchResultsStore } from './services/search-results-store';
import { findInDocs } from './services/search-engine';
import type { SearchOptions, SearchRun } from './services/search-engine';

declare global {
  interface Window {
    __appReady: Promise<void>;
    /** Facade matching old Monaco API used by e2e tests. */
    __editor: {
      getValue(): string;
      /** Return the current main selection range (from/to offsets). */
      getSelection(): { from: number; to: number };
    };
    __getFontSize: () => number;
    /**
     * The languageId of the document currently shown in the editor.
     * Set by EditorController.showDoc() via the store's active doc.
     * Used by open-save e2e to verify language detection without Monaco APIs.
     */
    __activeLanguage: string | null;
    /** Resolves to the result of running `return 1+1` in Lua (proves Wasmoon works under MV3 CSP). */
    __luaReady: Promise<number>;
    /** DockManager singleton exposed for App.ts menu wiring. */
    __dockManager: typeof dockManager;
    /** Toggle the Debug Log panel (wired to Help → Debug Log menu item). */
    __debugLogToggle: () => void;
    /** Toggle the File List panel (wired to View → File List menu item). */
    __fileListToggle: () => void;
    /** Toggle the Folder as Workspace panel (wired to View → Folder as Workspace). */
    __workspaceToggle: () => void;
    /** Open Folder as Workspace: show panel + trigger picker (wired to File → Open Folder). */
    __workspaceOpen: () => void;
    /** Toggle the Editor Inspector panel (wired to View → Editor Inspector). */
    __editorInspectorToggle: () => void;
    /** Toggle the Language Inspector panel (wired to View → Language Inspector). */
    __languageInspectorToggle: () => void;
    /** Toggle the Lua Console panel (wired to View → Lua Console menu item). */
    __luaConsoleToggle: () => void;
    /**
     * Set the active document's languageId (e2e helper — avoids viewport-clipped
     * Language menu clicks by directly patching the store).
     */
    __setActiveLanguage: (languageId: string) => void;
    /**
     * Return the current bookmarked line numbers (1-based) for the active editor.
     * Used by e2e tests to assert bookmark state without relying on DOM visibility.
     */
    __getBookmarks: () => number[];
    /**
     * Toggle bookmark on the current cursor line by dispatching directly to CM6.
     * Used by e2e tests to set bookmarks without relying on keyboard shortcut
     * interception (F-keys may be intercepted by the OS in some environments).
     */
    __toggleBookmarkOnCurrentLine: () => void;
    /**
     * Delete all bookmarked lines, bypassing the menu (for e2e reliability).
     */
    __cmdDeleteBookmarkedLines: () => void;
    /**
     * Invert all bookmarks, bypassing the menu (for e2e reliability).
     */
    __cmdInvertBookmarks: () => void;
    /**
     * Set bookmark on a specific 1-based line number directly (for e2e reliability
     * when cursor navigation is unreliable in headless mode).
     */
    __bookmarkLine: (lineNo: number) => void;
    /**
     * Return the number of marks of `index` (0/1/2) in the active editor.
     * Used by e2e tests to assert marker state.
     */
    __getMarkCount: (index: number) => number;
    /**
     * Return the number of .cm-url decorated elements visible in the editor.
     * Used by e2e tests to assert URL decoration state.
     */
    __getUrlCount: () => number;
    /**
     * Return the count of find-highlight ranges in the active editor.
     * Used by e2e tests (find-mark.spec.ts) to assert find-highlight state.
     */
    __getFindHighlightCount: () => number;
    /**
     * Return the find-highlight ranges {from,to}[] from the active editor.
     * Used by e2e tests (find-mark.spec.ts) to assert find-highlight ranges.
     */
    __getFindHighlightRanges: () => { from: number; to: number }[];
    /**
     * Dispatch a selection on the active editor view (for e2e tests to select text
     * before clicking Mark Style menu items).
     */
    __selectText: (from: number, to: number) => void;
    /**
     * Set the active document's language by name AND reconfigure the CM6 language
     * compartment — the full equivalent of clicking the Language menu.
     * Used by e2e tests for html-autoclose where the language facet must be live.
     */
    __setEditorLanguage: (languageId: string) => void;
    /** Returns true if macro recording is active. */
    __isRecording: () => boolean;
    /** Returns the number of steps in the current recorded macro, or 0. */
    __macroStepCount: () => number;
    /** Returns the list of saved macro names (for e2e tests). */
    __savedMacroNames: () => string[];
    /** Toggle the Search Results panel. */
    __searchResultsToggle: () => void;
    /** Show (never hide) the Search Results panel. */
    __searchResultsShow: () => void;
    /**
     * Programmatically run a find-in-open-docs and show the results dock.
     * Used by e2e tests (and the future Find dialog) to drive the search engine.
     * opts defaults: matchCase=false, wholeWord=false, regexp=false.
     */
    __runFindInOpenDocs: (term: string, opts?: Partial<SearchOptions>) => SearchRun;
    /** Return all accumulated search runs (for e2e assertions). */
    __searchResultsRuns: () => SearchRun[];
    /**
     * Directly set the active document's raw content in the DocumentStore and
     * reload the editor view via showDoc().  Used by e2e tests to inject CRLF
     * content that bypasses CM6's CRLF→LF normalisation on input, so we can
     * verify that the search engine and navigation code handle CRLF docs correctly.
     */
    __setActiveDocContent: (content: string) => void;
  }
}

// ── CodeMirror 6 setup ──────────────────────────────────────────────────────

const editKeymapCompartment = new Compartment();
// Note: the Show-Symbol compartment is now owned by EditorController
// (controller.symbolCompartment) so that new tabs seeded by showDoc() inherit
// the current symbol-display flags.  It must NOT be added to sharedExtensions
// here — the controller seeds it per-document via _currentSymbolExt.
//
// Similarly, the theme compartment is now owned by EditorController
// (controller.themeCompartment) so that new tabs seeded by showDoc() inherit
// the current theme (light/dark) rather than always defaulting to light.
// It must NOT be added to sharedExtensions here — the controller seeds it
// per-document via _currentThemeExt (default: notepadLightTheme).

// Mutable reference so the updateListener closure (created before the
// EditorController is instantiated) can reach the controller once set.
// The object wrapper avoids the prefer-const lint error on a reassigned let.
// controllerRef → primary pane controller; controllerBRef → secondary (split) pane.
const controllerRef: { current: EditorController | null } = { current: null };
const controllerBRef: { current: EditorController | null } = { current: null };

// ── Shared extensions ────────────────────────────────────────────────────────
//
// CM6's updateListener is a STATE-level facet (read from this.state.facet() on
// every update).  After view.setState(), the new state must include it or the
// listener is silently dropped — so every per-document EditorState created in
// EditorController.showDoc() must carry these shared extensions.
//
// We define them once here and pass them to the controller via
// setSharedExtensions() after construction.  The initial view state also uses
// them (keeping the two in sync).
//
// buildSharedExtensions() is parameterised by the pane's controller ref and view
// id so the SAME extension set can back a second (split) EditorView, each routing
// its updates to its own controller and tagging cursor events with its view id.
function buildSharedExtensions(
  ctrlRef: { current: EditorController | null },
  viewId: ViewId,
): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLine(),
    history(),
    // Bookmarks: StateField + gutter marker (faithful to NotepadNext BookMarkDecorator).
    // Must be in sharedExtensions so every per-doc EditorState carries the bookmark
    // StateField, and view.setState() preserves per-doc bookmarks across tab switches.
    bookmarkExtension,
    // Markers: 3 color layers for "Mark All Occurrences" (faithful to NotepadNext MarkerAppDecorator).
    // Must be in sharedExtensions so every per-doc EditorState carries the markState.
    markerExtension,
    // Find-highlight: dedicated yellow highlight for Find dialog's Mark All (P6.3).
    // Faithful to NotepadNext "find_mark_highlight" INDIC_FULLBOX indicator (#FFCC00).
    // SEPARATE from the P4.3 marker slots — orthogonal system.
    findHighlightExtension,
    // URL links: underlines clickable URLs; Ctrl/Cmd+click opens in new tab.
    ...urlLinksExtension,
    // HTML tag auto-close: inserts `</tag>` when user types `>` in HTML docs.
    // Faithful to NotepadNext HTMLAutoCompleteDecorator.
    htmlAutoCloseExtension,
    // Macro recorder: captures key presses and text input during recording.
    macroRecorderExtension,
    // BraceMatch → faithful NotepadNext bracket-pair highlight (()[]{})
    bracketMatching(),
    indentOnInput(),
    // SmartHighlighter → highlight all occurrences of the word at caret
    highlightSelectionMatches(),
    // SurroundSelection + auto-close brackets → closeBrackets() wraps a
    // non-empty selection when you type a bracket/quote (faithful NotepadNext).
    closeBrackets(),
    // Keymap ordering (highest-priority first via Prec.high):
    //   1. closeBracketsKeymap — Backspace must delete a bracket pair before
    //      the default Backspace fires (must be highest priority).
    //   2. completionKeymap   — Enter/Tab/Escape for autocomplete dropdown.
    //   3. searchKeymap       — Ctrl+F / Ctrl+H / F3 etc.
    //   4. indentWithTab + defaultKeymap + historyKeymap — CM6 defaults last.
    //      indentWithTab makes Tab indent / Shift-Tab dedent (faithful to
    //      NotepadNext); it sits BELOW completionKeymap's Prec.high Tab, so when
    //      the autocomplete popup is open Tab accepts the completion, and when it
    //      is closed Tab indents instead of moving focus out of the editor.
    //   5. editKeymapCompartment — injected by App.ts (Ctrl+/, Alt+Down …).
    //      Registered at normal precedence so it doesn't override the above.
    // search() initializes the searchState StateField so setSearchQuery / findNext /
    // findPrevious / replaceAll work without requiring the CM6 search panel to be
    // opened first (P6.2 Find dialog uses these commands directly).
    search(),
    Prec.high(keymap.of([...closeBracketsKeymap, ...completionKeymap])),
    keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    editKeymapCompartment.of([]),
    // Notepad++ light theme base rules (bg/caret/gutter/selection).
    // Included here so the initial EditorView state (before controller.setSharedExtensions
    // creates the first per-doc state) renders with the correct light theme immediately.
    // Per-doc states seed the controller-owned themeCompartment with the active
    // theme MARKER (default: notepadLightMarker) so new tabs inherit the theme.
    // Only the base CSS (both &light and &dark scopes) lives here; the marker in
    // the compartment decides which scope fires — avoiding a light/dark conflict.
    notepadBase,
    notepadHighlight,
    EditorView.updateListener.of((update: ViewUpdate) => {
      // Route to this pane's controller which writes to the DocumentStore.
      ctrlRef.current?.onUpdate(update);
      // Emit a custom event for cursor tracking in StatusBar, tagged with the
      // originating pane so the StatusBar can reflect only the focused view.
      if (update.selectionSet) {
        const pos = update.state.selection.main.head;
        const line = update.state.doc.lineAt(pos);
        update.view.dom.dispatchEvent(
          new CustomEvent('cm-cursor-change', {
            bubbles: true,
            detail: { line: line.number, col: pos - line.from + 1, view: viewId },
          }),
        );
      }
    }),
  ];
}

const sharedExtensions = buildSharedExtensions(controllerRef, 0);

const view = new EditorView({
  parent: document.getElementById('editor')!,
  state: EditorState.create({
    doc: '',
    extensions: sharedExtensions,
  }),
});

// Expose a getValue() / getSelection() facade for e2e tests.
window.__editor = {
  getValue(): string {
    return view.state.doc.toString();
  },
  getSelection(): { from: number; to: number } {
    const sel = view.state.selection.main;
    return { from: sel.from, to: sel.to };
  },
};

// Expose font-size hook for settings e2e test.
// applySettings() in app.ts sets view.dom.style.fontSize; we read it back here.
window.__getFontSize = () => {
  const fs = parseFloat(view.dom.style.fontSize);
  return isNaN(fs) ? 14 : fs;
};

// Expose the active document's detected languageId for open-save e2e assertions.
// Updated each time showDoc() displays a new document (via the store subscription).
window.__activeLanguage = null;

// ── Services & App ──────────────────────────────────────────────────────────

const store = new DocumentStore();
const controller = new EditorController(view, store);
controllerRef.current = controller;

// Focused-pane refs shared with App: App repoints these on focus change so every
// editor command, the Lua bridge, and the inspector panels follow the focused pane.
const focusedViewRef: { current: EditorView } = { current: view };
const focusedControllerRef: { current: EditorController } = { current: controller };

/**
 * Build the secondary (split) editor host. Two-phase: the host DOM (tab strip +
 * editor container) is created immediately so it can be mounted into the dockview
 * secondary group; the EditorView + EditorController are created by mount() only
 * AFTER the host is attached to the dock (creating the view beforehand breaks
 * dockview group insertion and mis-measures CM6). Called lazily by App.
 */
function createSecondaryEditor(): SecondaryEditorHost {
  const hostEl = document.createElement('div');
  hostEl.id = 'dock-editor-host-2';
  hostEl.style.cssText =
    'display:flex;flex-direction:column;height:100%;width:100%;overflow:hidden;';

  const tabbarWrapper = document.createElement('div');
  tabbarWrapper.style.cssText = 'flex:0 0 auto;';
  const tabbarEl = document.createElement('div');
  tabbarEl.id = 'tabbar-2';
  tabbarWrapper.appendChild(tabbarEl);

  const editorWrapper = document.createElement('div');
  editorWrapper.style.cssText = 'flex:1 1 auto;overflow:hidden;position:relative;min-height:0;';
  const editorEl = document.createElement('div');
  editorEl.id = 'editor-2';
  editorWrapper.appendChild(editorEl);

  hostEl.appendChild(tabbarWrapper);
  hostEl.appendChild(editorWrapper);

  return {
    hostEl,
    tabbarEl,
    mount() {
      const sharedB = buildSharedExtensions(controllerBRef, 1);
      const viewB = new EditorView({
        parent: editorEl,
        state: EditorState.create({ doc: '', extensions: sharedB }),
      });
      const controllerB = new EditorController(viewB, store);
      controllerBRef.current = controllerB;
      controllerB.setSharedExtensions(sharedB);
      controllerB.attachScrollListener();
      return { view: viewB, controller: controllerB };
    },
  };
}

// Pass the shared extensions (including updateListener) to the controller so
// every per-document EditorState created by showDoc() carries the updateListener.
// Without this, view.setState() silently drops the listener and edits are never
// propagated to the DocumentStore → SessionSync never receives content updates.
controller.setSharedExtensions(sharedExtensions);

// Wire the scroll listener so that the active doc's scrollTop is persisted to
// the DocumentStore on every scroll event (faithfully restores viewport on reload).
controller.attachScrollListener();

// Subscribe to the store so __activeLanguage stays current whenever the active
// document changes (tab switch, file open, or session restore).
store.subscribe(() => {
  const active = store.active();
  window.__activeLanguage = active?.languageId ?? null;
});

// E2E helper: set the active doc's languageId directly (bypasses the Language
// menu which can be viewport-clipped when the language list is long).
window.__setActiveLanguage = (languageId: string): void => {
  const doc = store.active();
  if (doc) store.update(doc.id, { languageId });
};

// E2E helper: set the active doc's language AND reconfigure the CM6 language
// compartment — equivalent to clicking the Language menu.
// Used by html-autoclose e2e tests where the `language` facet must be live.
window.__setEditorLanguage = (languageId: string): void => {
  const doc = store.active();
  if (doc) store.update(doc.id, { languageId });
  const ext = languageExtensionFor(languageId) ?? [];
  view.dispatch({ effects: controller.langCompartment.reconfigure(ext) });
};

// E2E helper: return the bookmarked line numbers (1-based, sorted) for the
// active editor state.  Used by e2e tests to assert bookmark state without
// relying on DOM class visibility (the CM6 gutter spacer element is hidden).
window.__getBookmarks = (): number[] => {
  const set = getBookmarks(view.state);
  return [...set].sort((a, b) => a - b);
};

// E2E helper: toggle bookmark on the current cursor line by dispatching directly
// to the CM6 view.  Used by e2e tests to bookmark lines without relying on
// keyboard shortcut interception (F-keys may be captured by the OS/browser).
window.__toggleBookmarkOnCurrentLine = (): void => {
  const lineNo = view.state.doc.lineAt(view.state.selection.main.head).number;
  view.dispatch({ effects: [toggleBookmarkEffect.of(lineNo)] });
};

// E2E helper: delete all bookmarked lines, bypassing the menu.
window.__cmdDeleteBookmarkedLines = (): void => {
  cmdDeleteBookmarkedLines(view);
};

// E2E helper: invert all bookmarks, bypassing the menu.
window.__cmdInvertBookmarks = (): void => {
  cmdInvertBookmarks(view);
};

// E2E helper: toggle bookmark on a specific 1-based line number directly.
// Avoids cursor navigation issues in headless Playwright environments.
window.__bookmarkLine = (lineNo: number): void => {
  view.dispatch({ effects: [toggleBookmarkEffect.of(lineNo)] });
};

// E2E helper: count marks of index (0/1/2) in the active editor.
window.__getMarkCount = (index: number): number => {
  return getMarkCount(view.state, index);
};

// E2E helper: count .cm-url DOM elements visible in the editor.
window.__getUrlCount = (): number => {
  return document.querySelectorAll('.cm-url').length;
};

// E2E helper: count find-highlight ranges (for find-mark.spec.ts).
window.__getFindHighlightCount = (): number => {
  return getFindHighlightCount(view.state);
};

// E2E helper: return find-highlight ranges (for find-mark.spec.ts).
window.__getFindHighlightRanges = (): { from: number; to: number }[] => {
  return getFindHighlightRanges(view.state);
};

// E2E helper: dispatch a selection on the active editor (for markers e2e).
window.__selectText = (from: number, to: number): void => {
  view.dispatch({ selection: EditorSelection.range(from, to) });
};

// E2E helper: check if macro recording is active.
window.__isRecording = () => isRecording();

// E2E helper: count steps in the current recorded macro.
window.__macroStepCount = () => getCurrentMacro()?.steps.length ?? 0;

// E2E helper: list saved macro names. Wired by App.start() once MacroStore is ready.
window.__savedMacroNames = () => [];

const storage = createStorage();
const settings = new SettingsService(storage);
const theme = new ThemeService(() => 'system');

const app = new App({
  view,
  controller,
  tabCompartment: controller.tabCompartment,
  wrapCompartment: controller.wrapCompartment,
  store,
  persistence: new PersistenceService(),
  settings,
  theme,
  file: new FileService(),
  editKeymapCompartment,
  // symbolCompartment is intentionally NOT passed here — App now uses
  // controller.setSymbolExt() / controller.symbolCompartment so that
  // new tabs opened after a Show-Symbol toggle inherit the current setting.
  // Split-view wiring: focused refs + dock + secondary-editor factory.
  viewRef: focusedViewRef,
  controllerRef: focusedControllerRef,
  dockManager,
  createSecondaryEditor,
});

// ── Expose dockManager + panel toggles globally for App to wire up menu ──────
window.__dockManager = dockManager;
window.__debugLogToggle = () => dockManager.togglePanel('debug-log');
window.__fileListToggle = () => dockManager.togglePanel('file-list');
window.__workspaceToggle = () => dockManager.togglePanel('workspace');
window.__editorInspectorToggle = () => dockManager.togglePanel('editor-inspector');
window.__languageInspectorToggle = () => dockManager.togglePanel('language-inspector');
window.__luaConsoleToggle = () => dockManager.togglePanel('lua-console');
window.__searchResultsToggle = () => dockManager.togglePanel('search-results');
window.__searchResultsShow = () => {
  if (!dockManager.isPanelVisible('search-results')) {
    dockManager.togglePanel('search-results');
  }
};

// E2E / P6.2 hook: run find-in-open-docs, add to store, show dock.
window.__runFindInOpenDocs = (term: string, opts?: Partial<SearchOptions>): SearchRun => {
  const resolvedOpts: SearchOptions = {
    matchCase: false,
    wholeWord: false,
    regexp: false,
    ...opts,
  };
  const docs = store.list().map((d) => ({ id: d.id, name: d.name, content: d.content }));
  const run = findInDocs(docs, term, resolvedOpts);
  searchResultsStore.addRun(run);
  if (!dockManager.isPanelVisible('search-results')) {
    dockManager.togglePanel('search-results');
  }
  return run;
};

// E2E hook: return all accumulated search runs.
window.__searchResultsRuns = () => searchResultsStore.runs();

// E2E hook: inject raw content (including CRLF) directly into the active doc's store
// entry, bypassing the CM6 updateListener that normalises CRLF→LF on user input.
// After setting the store content, the editor state cache is invalidated and showDoc()
// reloads the view so the live EditorState reflects the new content (normalised, as
// EditorState.create() does).  This lets e2e tests verify that the search engine and
// navigation correctly handle CRLF docs end-to-end.
window.__setActiveDocContent = (content: string): void => {
  const doc = store.active();
  if (!doc) return;
  // Set raw content in the store (preserves CRLF for the search engine to read).
  store.update(doc.id, { content });
  // Invalidate the controller's cached EditorState for this doc so that showDoc()
  // creates a fresh state from the new store content (EditorState.create normalises
  // CRLF→LF internally) rather than reusing the stale cached state.
  controller.invalidateDoc(doc.id);
  // Reload the view from the updated store content.
  controller.showDoc(doc.id);
};
window.__workspaceOpen = () => {
  // Show the workspace panel then trigger the open-folder button.
  if (!dockManager.isPanelVisible('workspace')) {
    dockManager.togglePanel('workspace');
  }

  // Robustly wait for #workspace-open-btn to appear in the DOM before clicking.
  // A single rAF is not enough when the panel mount is deferred by async layout
  // restore.  We poll via MutationObserver (up to ~1 s) so we never silently
  // no-op if the button hasn't rendered yet.
  const existing = document.getElementById('workspace-open-btn') as HTMLButtonElement | null;
  if (existing) {
    existing.click();
    return;
  }

  const TIMEOUT_MS = 1000;
  const deadline = Date.now() + TIMEOUT_MS;
  const observer = new MutationObserver(() => {
    const btn = document.getElementById('workspace-open-btn') as HTMLButtonElement | null;
    if (btn) {
      observer.disconnect();
      btn.click();
    } else if (Date.now() > deadline) {
      observer.disconnect();
      console.warn('[workspaceOpen] #workspace-open-btn did not appear within 1 s — giving up.');
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
};

// ── Install console interceptor so all console output is captured ────────────
debugLog.install();
debugLog.append('[Notepad Web] Startup');

// ── Dock-manager storage adapter (delegates to the KeyValueStore) ────────────
const dockStorage = {
  async get(key: string): Promise<string | null> {
    try {
      const val = await storage.get<string>(key);
      return typeof val === 'string' ? val : null;
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      await storage.set<string>(key, value);
    } catch {
      /* non-fatal */
    }
  },
};

// ── Register dockview panels BEFORE init so createComponent can resolve them ─
dockManager.registerPanel({
  id: 'debug-log',
  title: 'Debug Log',
  position: 'bottom',
  render: mountDebugLogPanel,
});

dockManager.registerPanel({
  id: 'file-list',
  title: 'Open Files',
  position: 'left',
  render: (el: HTMLElement) => mountFileListPanel(el, store, controller),
});

dockManager.registerPanel({
  id: 'workspace',
  title: 'Folder as Workspace',
  position: 'left',
  render: (el: HTMLElement) => mountWorkspacePanel(el, store, controller),
});

// Inspector panels read the FOCUSED view so they follow the active split pane.
const viewRef = focusedViewRef;

dockManager.registerPanel({
  id: 'editor-inspector',
  title: 'Editor Inspector',
  position: 'right',
  render: (el: HTMLElement) => mountEditorInspectorPanel(el, store, viewRef),
});

dockManager.registerPanel({
  id: 'language-inspector',
  title: 'Language Inspector',
  position: 'right',
  render: (el: HTMLElement) => mountLanguageInspectorPanel(el, store, luaRegistry),
});

dockManager.registerPanel({
  id: 'lua-console',
  title: 'Lua Console',
  position: 'bottom',
  render: (el: HTMLElement) => mountLuaConsolePanel(el, luaConsoleEngine),
});

dockManager.registerPanel({
  id: 'search-results',
  title: 'Search Results',
  position: 'bottom',
  render: (el: HTMLElement) => mountSearchResultsPanel(el, store, controller),
});

// Wire the editor bridge so Lua scripts manipulate the FOCUSED editor pane.
luaConsoleEngine.setEditorBridge(createEditorBridge(() => focusedViewRef.current));

// __appReady resolves after app.start() + dockview init + a rAF so CM6 has
// laid out at least once before e2e consumers poll for editor state.
window.__appReady = (async () => {
  // Start the app first (it sets up the TabBar DOM, session, etc.)
  await app.start();

  // Now initialize dockview: move #tabbar and #editor into the dockview CENTER panel.
  const dockEl = document.getElementById('dock')!;
  const editorEl = document.getElementById('editor')!;
  const tabbarEl = document.getElementById('tabbar')!;

  await dockManager.init(dockEl, editorEl, tabbarEl, dockStorage);

  // Recreate a persisted split pane's dock group now that the dock is initialised.
  app.finishStartup();

  // Request a CM6 measure so it picks up its new container size.
  view.requestMeasure();

  debugLog.append('[Notepad Web] Dock initialized');

  // Settle layout with a rAF.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
})();

// ── PWA service worker (installability + offline) ────────────────────────────
// Registered ONLY when the app is served over http(s) — never in the
// chrome-extension:// build (extension pages use the MV3 background worker).
if (
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  location.protocol === 'https:'
) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// ── Wasmoon smoke (proves Lua-in-WASM runs under MV3 CSP) ──────────────────
//
// The wasm binary is loaded from the extension origin (dist/glue.wasm),
// NOT from unpkg.com or any CDN.  We override the default CDN URI by passing
// chrome.runtime.getURL('glue.wasm') as the customWasmUri argument so that
// in production the file comes from the locally-bundled asset, satisfying
// MV3's "script-src 'self' 'wasm-unsafe-eval'" CSP.
//
// During e2e (http-server on localhost) we fall back to a relative path
// (served alongside editor.html by the webpack dev server / http-server).
function localWasmUri(): string {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    return chrome.runtime.getURL('glue.wasm');
  }
  // Non-extension (e2e http-server, or the PWA on GitHub Pages / any host):
  // resolve RELATIVE to the document so it also works under a sub-path such as
  // https://user.github.io/notepad-web/ (an absolute "/glue.wasm" would 404 there).
  return 'glue.wasm';
}

window.__luaReady = (async (): Promise<number> => {
  const factory = new LuaFactory(localWasmUri());
  const lua = await factory.createEngine();
  try {
    const result = await lua.doString('return 1+1');
    return result as number;
  } finally {
    lua.global.close();
  }
})();

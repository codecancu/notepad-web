// SPDX-License-Identifier: GPL-3.0-or-later
import { EditorState, EditorSelection, Compartment } from '@codemirror/state';
import { EditorView, ViewUpdate } from '@codemirror/view';
import { indentUnit } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import type { DocumentStore, DocId } from '../services/document-store';
import { luaRegistry as _defaultLuaRegistry } from '../services/lua-registry';
import type { LangDef } from '../services/lua-registry';
import { languageExtensionFor } from './language-support';
import { buildHighlightExtension, notepadHighlight } from './notepad-theme';
import { notepadLightTheme } from './notepad-light-theme';

/**
 * Minimal interface that EditorController needs from the Lua registry.
 * Injecting this instead of the singleton enables unit-testing the
 * registry-ready highlight-rebuild path without Wasmoon/WASM.
 *
 * @internal
 */
export interface RegistryLike {
  ready(): Promise<void>;
  getLanguage(name: string): LangDef | undefined;
  detectByExtension(filename: string): string | null;
  detectByFirstLine(line: string): string | null;
}

/**
 * EditorController manages one CodeMirror EditorView and keeps per-document
 * EditorState objects in a Map.  Switching tabs calls view.setState() so the
 * scroll position, selection, and undo history are preserved per document.
 *
 * CM6's updateListener is a STATE-level facet (read from this.state.facet()
 * after each update), NOT a view-level plugin.  After view.setState(), the new
 * state must include the updateListener extension or it will silently disappear.
 * Therefore every per-document EditorState created in showDoc() includes the
 * sharedExtensions passed from editor-page.ts (which carries the updateListener
 * as well as lineNumbers, history, keymaps, etc.).
 *
 * Language detection uses luaRegistry (the real .lua palette) and applies a
 * per-document CM6 Compartment for language + a shared notepadHighlight
 * extension for faithful Notepad++ colours.
 *
 * tabCompartment and wrapCompartment are embedded in every document's
 * EditorState alongside langCompartment so that view.setState() preserves
 * the compartment slots and App.applySettings() reconfigure calls take effect
 * immediately on the current view and survive tab switches.
 */
export class EditorController {
  private states = new Map<DocId, EditorState>();
  private activeDocId: DocId | null = null;

  /**
   * Shared language compartment on the EditorView for the currently active doc.
   * Embedded in every document's EditorState so setState() preserves it.
   */
  readonly langCompartment: Compartment;

  /**
   * Shared tab-size compartment (EditorState.tabSize + indentUnit).
   * Embedded in every document's EditorState so the setting persists across tabs.
   */
  readonly tabCompartment: Compartment;

  /**
   * Shared word-wrap compartment (EditorView.lineWrapping toggle).
   * Embedded in every document's EditorState so the setting persists across tabs.
   */
  readonly wrapCompartment: Compartment;

  /**
   * Shared Show-Symbol compartment (whitespace/EOL highlight).
   * Embedded in every document's EditorState so toggling Show Whitespace or
   * Show EOL is inherited by new tabs opened after the toggle.
   */
  readonly symbolCompartment: Compartment;

  /**
   * Shared autocompletion compartment.
   * Embedded in every document's EditorState so the autoCompletion setting
   * persists across tab switches and is inherited by new tabs.
   * Reconfigured by setAutoCompletion() (called from App.applySettings()).
   */
  readonly autoCompletionCompartment: Compartment;

  /**
   * Shared theme compartment (light/dark marker + base theme rules).
   * Embedded in every document's EditorState so the theme setting persists
   * across tab switches and is inherited by new tabs.
   * Reconfigured by setTheme() (called from App.applySettings()).
   *
   * Default: notepadLightTheme (light mode).  Swapped to a dark marker when
   * the user selects the dark theme.  Keeping this in the controller (rather
   * than only in editor-page.ts) ensures new per-doc EditorStates seeded by
   * showDoc() inherit the current theme instead of always starting in light mode.
   */
  readonly themeCompartment: Compartment;

  /**
   * The active highlight extension — canonical at startup, replaced by the
   * palette-derived one after luaRegistry resolves.  Stored so newly created
   * document states always include the most recent highlight extension.
   */
  private _highlightExt: Extension = notepadHighlight;

  /**
   * Extensions shared across all per-document states.  Must include
   * EditorView.updateListener (a state-level facet) so it survives setState().
   * Set from editor-page.ts after construction via setSharedExtensions().
   */
  private _sharedExtensions: Extension = [];

  /**
   * Current tab-size Extension value used to seed new document states.
   * Updated by setEditorOptions() so tabs opened after a settings change
   * inherit the correct tab size rather than the CM6 default (8).
   */
  private _currentTabExt: Extension = [];

  /**
   * Current word-wrap Extension value used to seed new document states.
   * Updated by setEditorOptions() so tabs opened after a settings change
   * inherit the correct wrap setting rather than the CM6 default (off).
   */
  private _currentWrapExt: Extension = [];

  /**
   * Current Show-Symbol extension (whitespace/EOL highlight) used to seed
   * new document states.  Updated by setSymbolExt() so tabs opened after
   * toggling Show Whitespace / Show EOL inherit the current symbol flags
   * rather than always starting with no symbol display.
   */
  private _currentSymbolExt: Extension = [];

  /**
   * Current autocompletion extension used to seed new document states.
   * Updated by setAutoCompletion() so tabs opened after the settings change
   * inherit the correct autocomplete setting.
   */
  private _currentAutoCompletionExt: Extension = [];

  /**
   * Current theme extension used to seed new document states.
   * Updated by setTheme() so tabs opened after a theme change inherit the
   * correct theme (light or dark) rather than always starting in light mode.
   *
   * Default: notepadLightTheme — faithful Notepad++ light colours.
   */
  private _currentThemeExt: Extension = notepadLightTheme;

  /**
   * @param view   The CodeMirror EditorView.
   * @param store  The DocumentStore that owns per-document content.
   * @param registry  Optional registry override. Defaults to the real
   *   luaRegistry singleton. Pass a fake in unit tests to exercise the
   *   registry-ready highlight-rebuild path without Wasmoon/WASM.
   *   @internal — the third parameter is intentionally undocumented in
   *   the public API; production callers should omit it.
   */
  constructor(
    private readonly view: EditorView,
    private readonly store: DocumentStore,
    private readonly _registry: RegistryLike = _defaultLuaRegistry,
  ) {
    this.langCompartment = new Compartment();
    this.tabCompartment = new Compartment();
    this.wrapCompartment = new Compartment();
    this.symbolCompartment = new Compartment();
    this.autoCompletionCompartment = new Compartment();
    this.themeCompartment = new Compartment();

    // Once the Lua registry resolves, rebuild highlighting for all open docs
    // using the real palette (the canonical fallback was already applied).
    // The .catch() swallows Wasmoon init failures in test/Node environments
    // where WASM loading is unavailable — the canonical fallback colours
    // remain in effect in that case.
    void this._registry
      .ready()
      .then(() => {
        this._rebuildHighlight();
      })
      .catch(() => {
        // Graceful no-op: canonical highlight colours remain active.
      });
  }

  /**
   * Whether the highlight has been rebuilt from the Lua palette.
   * True after _rebuildHighlight() completes successfully.
   * @internal — test observable only; not part of the public API.
   */
  get highlightRebuilt(): boolean {
    return this._highlightRebuilt;
  }
  private _highlightRebuilt = false;

  /**
   * Return the underlying EditorView.
   * Provides a clean accessor for panels that need to dispatch selections or
   * read live view state, avoiding `as unknown as` casts on private fields.
   */
  getView(): EditorView {
    return this.view;
  }

  /**
   * Evict the cached EditorState for `id` so the next showDoc() call creates
   * a fresh state from the current DocumentStore content.
   *
   * Used by e2e test helpers that update the store's raw content directly
   * (e.g. injecting CRLF content to test CRLF normalisation) — without eviction
   * showDoc() would reuse the stale cached state built from the old content.
   *
   * @internal — test/helper use only.
   */
  invalidateDoc(id: DocId): void {
    this.states.delete(id);
    // If the doc being invalidated is the currently active one, clear activeDocId
    // so showDoc() does not snapshot the live view's state (which has old content)
    // back into the map before building the fresh state.
    if (this.activeDocId === id) {
      this.activeDocId = null;
    }
  }

  /**
   * Provide the extensions that must be included in every per-document
   * EditorState.  Call this from editor-page.ts before calling showDoc().
   *
   * This MUST include EditorView.updateListener (which is a STATE-level facet
   * in CM6 — read from this.state.facet() after each update).  Without it
   * in every per-doc state, view.setState() silently drops the listener and
   * document edits are never propagated to the DocumentStore.
   */
  setSharedExtensions(ext: Extension): void {
    this._sharedExtensions = ext;
    // Invalidate all cached states so they pick up the new shared extensions.
    const activeId = this.activeDocId;
    this.states.clear();
    this.activeDocId = null;
    if (activeId !== null) {
      this.showDoc(activeId);
    }
  }

  /** Called by the EditorView's updateListener extension on every view update. */
  onUpdate(update: ViewUpdate): void {
    const id = this.activeDocId;
    if (id === null) return;
    if (update.docChanged) {
      const content = update.state.doc.toString();
      this.store.update(id, { content, dirty: true });
    }
    if (update.selectionSet) {
      const pos = update.state.selection.main.head;
      const line = update.state.doc.lineAt(pos);
      this.store.update(id, {
        cursor: { lineNumber: line.number, column: pos - line.from + 1 },
      });
    }
  }

  /**
   * Attach a scroll listener to the CM6 scrollDOM element so that the current
   * doc's scrollTop is persisted to the DocumentStore on every scroll event.
   * Call this once from editor-page.ts after the controller is constructed.
   * Returns a cleanup function that removes the listener.
   */
  attachScrollListener(): () => void {
    const handler = (): void => {
      const id = this.activeDocId;
      if (id === null) return;
      this.store.update(id, { scrollTop: this.view.scrollDOM.scrollTop });
    };
    this.view.scrollDOM.addEventListener('scroll', handler, { passive: true });
    return () => this.view.scrollDOM.removeEventListener('scroll', handler);
  }

  showDoc(id: DocId): void {
    const doc = this.store.get(id);
    if (!doc) return;
    // Snapshot the current CM state back into the map before switching.
    if (this.activeDocId !== null) {
      this.states.set(this.activeDocId, this.view.state);
    }
    let state = this.states.get(id);
    if (!state) {
      // Detect the language extension for the new doc.
      const { ext: langExt, name: resolvedName } = this._detectLang(
        doc.name ?? '',
        doc.content ?? '',
      );
      // Write the resolved language name back to the store as a non-dirty update
      // so the StatusBar label and window.__activeLanguage reflect the same language
      // that CM6 is actually highlighting.  Only update when the value changes to
      // avoid unnecessary store notifications.
      const canonicalId = resolvedName ?? 'plaintext';
      if (doc.languageId !== canonicalId) {
        this.store.update(id, { languageId: canonicalId });
      }
      // Every per-document EditorState must include:
      //   - langCompartment, tabCompartment, wrapCompartment (shared Compartments)
      //   - _highlightExt (Notepad++ colours, rebuilt after Lua registry resolves)
      //   - _sharedExtensions (updateListener + lineNumbers + history + keymaps …)
      // The updateListener is a state-level facet in CM6: after view.setState()
      // it is read from the NEW state, so it must be present in every per-doc state.

      // Restore cursor position from the persisted Doc.cursor field.
      // Convert { lineNumber, column } → character offset, clamped to doc length.
      let restoredSelection: ReturnType<typeof EditorSelection.cursor> | undefined;
      if (doc.cursor) {
        const cmDoc = EditorState.create({ doc: doc.content }).doc;
        const lineCount = cmDoc.lines;
        const lineNo = Math.max(1, Math.min(doc.cursor.lineNumber, lineCount));
        const line = cmDoc.line(lineNo);
        const col = Math.max(0, Math.min(doc.cursor.column - 1, line.length));
        restoredSelection = EditorSelection.cursor(line.from + col);
      }

      state = EditorState.create({
        doc: doc.content,
        selection: restoredSelection,
        extensions: [
          this.langCompartment.of(langExt ?? []),
          this.tabCompartment.of(this._currentTabExt),
          this.wrapCompartment.of(this._currentWrapExt),
          this.symbolCompartment.of(this._currentSymbolExt),
          this.autoCompletionCompartment.of(this._currentAutoCompletionExt),
          this.themeCompartment.of(this._currentThemeExt),
          this._highlightExt,
          this._sharedExtensions,
        ],
      });
      this.states.set(id, state);
    }
    this.activeDocId = id;
    this.view.setState(state);

    // Restore scroll position after setState (the scrollDOM is now showing the
    // new doc's content; setting scrollTop here positions the viewport correctly).
    // Only apply when restoring from a persisted snapshot (doc.scrollTop defined).
    const savedScroll = this.store.get(id)?.scrollTop;
    if (savedScroll !== undefined && savedScroll > 0) {
      // Use requestAnimationFrame so CM6 has completed its first layout pass
      // before we set scrollTop (avoids being overwritten by CM6's own scroll reset).
      requestAnimationFrame(() => {
        this.view.scrollDOM.scrollTop = savedScroll;
      });
    }
  }

  /**
   * Apply tab-size and word-wrap settings to the active view AND store the
   * resulting Extension values so that new document states created by showDoc()
   * are seeded with the current settings instead of CM6 defaults.
   *
   * Call this from App.applySettings() instead of dispatching compartment
   * reconfigures directly so new tabs always inherit the current settings.
   */
  setEditorOptions(opts: { tabSize: number; wordWrap: boolean }): void {
    const spaces = ' '.repeat(Math.max(1, opts.tabSize));
    this._currentTabExt = [EditorState.tabSize.of(opts.tabSize), indentUnit.of(spaces)];
    this._currentWrapExt = opts.wordWrap ? EditorView.lineWrapping : [];

    this.view.dispatch({
      effects: [
        this.tabCompartment.reconfigure(this._currentTabExt),
        this.wrapCompartment.reconfigure(this._currentWrapExt),
      ],
    });
  }

  /**
   * Apply the Show-Symbol extension (whitespace/EOL highlight) to the active
   * view AND store it so new document states created by showDoc() inherit the
   * current symbol-display setting rather than always starting with none.
   *
   * Call this from App.applySymbolFlags() instead of dispatching the compartment
   * reconfigure directly so new tabs always inherit the current symbol flags.
   */
  setSymbolExt(ext: Extension): void {
    this._currentSymbolExt = ext;
    this.view.dispatch({
      effects: this.symbolCompartment.reconfigure(ext),
    });
  }

  /**
   * Apply the autocompletion extension to the active view AND store it so new
   * document states created by showDoc() inherit the current setting.
   *
   * Faithful mapping: NotepadNext AutoCompletion decorator ↔ CM6 autocompletion()
   * with a document-word completion source.  Gated by the `autoCompletion`
   * setting (Settings.autoCompletion).
   *
   * Call this from App.applySettings() so new tabs always inherit the setting.
   */
  setAutoCompletion(ext: Extension): void {
    this._currentAutoCompletionExt = ext;
    this.view.dispatch({
      effects: this.autoCompletionCompartment.reconfigure(ext),
    });
  }

  /**
   * Apply the theme extension (light/dark marker + base rules) to the active
   * view AND store it so new document states created by showDoc() inherit the
   * correct theme rather than always falling back to the notepadLightTheme
   * default baked into _sharedExtensions.
   *
   * Without this, switching to dark mode only reconfigured the themeCompartment
   * on the CURRENT EditorState; new tabs created afterwards received
   * themeCompartment.of([]) from _sharedExtensions, causing the &light base-
   * theme rules (including fontFamily: "Courier New") to fire on new-tab states
   * while the dark-theme marker was absent.  The result: new tabs rendered light
   * colours and Courier New while existing tabs rendered dark colours and the
   * browser-default monospace — a per-tab font-family inconsistency.
   *
   * Call this from App.applySettings() instead of dispatching themeCompartment
   * reconfigure directly so new tabs always inherit the current theme.
   */
  setTheme(ext: Extension): void {
    this._currentThemeExt = ext;
    this.view.dispatch({
      effects: this.themeCompartment.reconfigure(ext),
    });
  }

  closeDoc(id: DocId): void {
    if (!this.states.has(id)) return;
    this.states.delete(id);
    if (this.activeDocId === id) {
      this.activeDocId = null;
    }
  }

  dispose(): void {
    this.states.clear();
    this.activeDocId = null;
    this.view.destroy();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Detect the CM6 language extension and the resolved language name for a
   * document by:
   *   1. Extension matching via luaRegistry.detectByExtension()
   *   2. First-line detection via luaRegistry.detectByFirstLine()
   *   3. Fallback: no language extension (plaintext)
   *
   * Returns { name, ext } where name is the resolved NotepadNext language name
   * (or null for plaintext) and ext is the CM6 Extension (or null).
   */
  private _detectLang(
    name: string,
    content: string,
  ): { name: string | null; ext: Extension | null } {
    let langName: string | null = null;

    // Try extension first.
    if (name) {
      langName = this._registry.detectByExtension(name);
    }

    // Try first-line pattern if extension didn't match.
    if (!langName && content) {
      const firstLine = content.split('\n')[0] ?? '';
      langName = this._registry.detectByFirstLine(firstLine);
    }

    if (!langName) return { name: null, ext: null };
    return { name: langName, ext: languageExtensionFor(langName) };
  }

  /**
   * Rebuild the HighlightStyle from the Lua palette once the registry resolves.
   * Uses the C++ language styles as the canonical reference palette since C++
   * has the most complete style coverage in the NotepadNext theme.
   *
   * Strategy: store the new highlight extension so future setState calls pick it
   * up; then rebuild the current active doc's state from scratch (invalidating the
   * cache) so it gets the updated palette + language detection from the now-ready
   * registry.
   */
  private _rebuildHighlight(): void {
    const cppLang = this._registry.getLanguage('C++');
    if (!cppLang) return;
    this._highlightExt = buildHighlightExtension(cppLang.styles);
    this._highlightRebuilt = true;

    // Invalidate all cached states so they'll be rebuilt with the new highlight.
    this.states.clear();

    // Re-show the active doc to rebuild its state with the updated extensions.
    if (this.activeDocId !== null) {
      const id = this.activeDocId;
      this.activeDocId = null; // prevent snapshot-back in showDoc()
      this.showDoc(id);
    }
  }
}

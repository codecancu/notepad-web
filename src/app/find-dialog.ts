// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * FindDialog — 3-tab Find/Replace/Mark dialog for Notepad Web (P6.2).
 *
 * Faithful to NotepadNext FindReplaceDlg: 3 tabs (Find | Replace | Mark),
 * shared options, MRU dropdowns, Extended/Regex search modes.
 *
 * Dialog pattern mirrors macro-save-dialog.ts: root element + innerHTML +
 * hidden toggle, Esc/close button to dismiss.
 */

import {
  SearchQuery,
  setSearchQuery,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
} from '@codemirror/search';
import { Text } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { DocumentStore } from '../services/document-store';
import type { EditorController } from '../editor/editor-controller';
import type { PersistenceService, SearchPrefs } from '../services/persistence-service';
import { findMatches, findInDocs } from '../services/search-engine';
import type { SearchOptions } from '../services/search-engine';
import { searchResultsStore } from '../services/search-results-store';
import {
  addFindHighlightsEffect,
  clearFindHighlightsEffect,
  getFindHighlightRanges,
} from '../editor/find-highlight';
import { bookmarkState, setBookmarksEffect } from '../editor/bookmarks';
import { applyEol } from '../services/text-utils';

export type FindTabName = 'find' | 'replace' | 'mark';

const MAX_MRU = 10;

/**
 * Convert extended escape sequences to their actual characters.
 * Handles: \n \r \t \0 \xNN \\
 * Unknown escapes are passed through unchanged.
 */
export function convertExtended(s: string): string {
  return s.replace(/\\(n|r|t|0|x[0-9a-fA-F]{2}|\\|.)/g, (match, ch: string) => {
    switch (ch) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case '0':
        return '\0';
      case '\\':
        return '\\';
      default:
        if (ch.startsWith('x')) {
          return String.fromCharCode(parseInt(ch.slice(1), 16));
        }
        return match; // pass through unknown escapes
    }
  });
}

/**
 * Add an item to an MRU list: move existing to front or prepend, cap at max.
 * Returns a new array (does not mutate).
 */
export function addToMru(arr: string[], item: string, max: number = MAX_MRU): string[] {
  const filtered = arr.filter((x) => x !== item);
  return [item, ...filtered].slice(0, max);
}

/**
 * Replace all occurrences of `term` in `content` string.
 * Returns the new content and the count of replacements.
 *
 * I1: In regexp mode, uses JS String.prototype.replace() so that capture-group
 * references ($1, $&, $$, etc.) in the replacement string are expanded —
 * matching CM6 replaceAll() and Scintilla replaceTargetRE behaviour for ALL docs.
 *
 * In plain/extended (non-regexp) mode, uses the existing right-to-left splice
 * so literal `$1` stays literal (correct: no group expansion outside regexp mode).
 *
 * I2: The returned content always uses LF line endings.  Callers that write back
 * to a non-active doc must re-apply the doc's EOL via applyEol().
 */
export function replaceAllInContent(
  content: string,
  term: string,
  replace: string,
  opts: SearchOptions,
): { newContent: string; count: number } {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  if (opts.regexp) {
    // I1: Build a global RegExp so JS expands $1/$&/$$ in the replacement string,
    // exactly as CM6's replaceAll() and Scintilla replaceTargetRE do.
    const flags = 'g' + (opts.matchCase ? '' : 'i');
    let re: RegExp;
    try {
      re = new RegExp(term, flags);
    } catch {
      return { newContent: content, count: 0 };
    }
    // Count matches first (matchAll doesn't consume/advance the string).
    const count = [...normalized.matchAll(re)].length;
    if (count === 0) return { newContent: content, count: 0 };
    // Native replace expands $1/$&/$$ in the replacement string.
    const result = normalized.replace(re, replace);
    return { newContent: result, count };
  }

  // Plain/extended mode: literal splice right-to-left (no group expansion — correct).
  const text = Text.of(normalized.split('\n'));
  const matches = findMatches(text, term, opts);
  if (matches.length === 0) return { newContent: content, count: 0 };

  let result = normalized;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i]!;
    result = result.slice(0, m.from) + replace + result.slice(m.to);
  }
  return { newContent: result, count: matches.length };
}

/**
 * Compute the resolved find term, replace string, and search options from raw
 * dialog inputs and mode flags. Pure — no DOM. Faithful to FindReplaceDialog.cpp:
 *  - Extended mode unescapes BOTH the find term and the replace string.
 *  - Regexp mode forces wholeWord OFF (the checkbox is disabled/meaningless).
 */
export function buildSearchState(
  rawTerm: string,
  rawReplace: string,
  flags: { matchCase: boolean; wholeWord: boolean; isRegexp: boolean; isExtended: boolean },
): { term: string; replace: string; opts: SearchOptions } {
  const wholeWord = flags.isRegexp ? false : flags.wholeWord;
  const term = flags.isExtended ? convertExtended(rawTerm) : rawTerm;
  const replace = flags.isExtended ? convertExtended(rawReplace) : rawReplace;
  return {
    term,
    replace,
    opts: { matchCase: flags.matchCase, wholeWord, regexp: flags.isRegexp },
  };
}

/** Show the search results panel if it isn't visible already (never hides it). */
function showSearchResultsPanel(): void {
  (window as { __searchResultsShow?: () => void }).__searchResultsShow?.();
}

export class FindDialog {
  private activeTab: FindTabName = 'find';
  private findMru: string[] = [];
  private replaceMru: string[] = [];
  private prefs: SearchPrefs = {
    findMru: [],
    replaceMru: [],
    matchCase: false,
    wholeWord: false,
    wrap: true,
    backwards: false,
    searchMode: 'normal',
    dotMatchesNewline: false,
  };
  /** Document-level Escape handler, registered while dialog is open. */
  private _escHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(
    private root: HTMLElement,
    private store: DocumentStore,
    private controller: EditorController,
    private persistence: PersistenceService,
  ) {
    // Load prefs asynchronously on construction
    void this.persistence.loadSearchPrefs().then((p) => {
      if (p) {
        this.prefs = p;
        this.findMru = p.findMru;
        this.replaceMru = p.replaceMru;
      }
    });
  }

  /** Open the dialog on the specified tab. */
  open(tab: FindTabName = 'find'): void {
    // M1: If already visible, just switch tab (without re-rendering) and re-focus
    // the find input — do NOT wipe any in-progress typed text.
    if (!this.root.hidden) {
      if (this.activeTab !== tab) {
        this.activeTab = tab;
        this._render();
      }
      const findInput = this.root.querySelector<HTMLInputElement>('#fd-find-input');
      if (findInput) {
        findInput.focus();
        findInput.select();
      }
      return;
    }
    this.activeTab = tab;
    this._render();
    this.root.hidden = false;
    // Register document-level Escape handler with capture so it fires before CM6.
    if (!this._escHandler) {
      this._escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !this.root.hidden) {
          e.preventDefault();
          e.stopPropagation();
          this.close();
        }
      };
      document.addEventListener('keydown', this._escHandler, { capture: true });
    }
  }

  /** Close the dialog. */
  close(): void {
    this.root.hidden = true;
    // Unregister Escape handler when dialog closes.
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler, { capture: true });
      this._escHandler = null;
    }
  }

  private get view(): EditorView {
    return this.controller.getView();
  }

  private _render(): void {
    this.root.innerHTML = `
      <div class="dialog-overlay fd-overlay">
        <div class="dialog-box fd-dialog" role="dialog" aria-modal="true" aria-label="Find / Replace / Mark">
          <div class="fd-tabs">
            <button class="fd-tab-btn${this.activeTab === 'find' ? ' active' : ''}" id="fd-tab-find" type="button">Find</button>
            <button class="fd-tab-btn${this.activeTab === 'replace' ? ' active' : ''}" id="fd-tab-replace" type="button">Replace</button>
            <button class="fd-tab-btn${this.activeTab === 'mark' ? ' active' : ''}" id="fd-tab-mark" type="button">Mark</button>
          </div>

          <div class="fd-body">
            <!-- Find input row -->
            <div class="fd-row">
              <label class="fd-label" for="fd-find-input">Find what:</label>
              <div class="fd-combo">
                <input id="fd-find-input" type="text" class="fd-input" autocomplete="off" spellcheck="false" value="${this._esc(this.findMru[0] ?? '')}" />
                <select id="fd-find-mru" class="fd-mru" size="1" aria-label="Find history">
                  ${this.findMru.map((s) => `<option value="${this._esc(s)}">${this._esc(s)}</option>`).join('')}
                </select>
              </div>
            </div>

            <!-- Replace input row — shown only on Replace/Mark tabs -->
            <div class="fd-row${this.activeTab === 'find' || this.activeTab === 'mark' ? ' fd-hidden' : ''}" id="fd-replace-row">
              <label class="fd-label" for="fd-replace-input">Replace with:</label>
              <div class="fd-combo">
                <input id="fd-replace-input" type="text" class="fd-input" autocomplete="off" spellcheck="false" value="${this._esc(this.replaceMru[0] ?? '')}" />
                <select id="fd-replace-mru" class="fd-mru" size="1" aria-label="Replace history">
                  ${this.replaceMru.map((s) => `<option value="${this._esc(s)}">${this._esc(s)}</option>`).join('')}
                </select>
              </div>
            </div>

            <!-- Options row -->
            <div class="fd-options-row">
              <div class="fd-checkboxes">
                <label><input type="checkbox" id="fd-check-matchcase" ${this.prefs.matchCase ? 'checked' : ''} /> Match case</label>
                <label><input type="checkbox" id="fd-check-wholeword" ${this.prefs.wholeWord ? 'checked' : ''} ${this.prefs.searchMode === 'regexp' ? 'disabled' : ''} /> Match whole word</label>
                <label><input type="checkbox" id="fd-check-wrap" ${this.prefs.wrap ? 'checked' : ''} /> Wrap around</label>
                <label><input type="checkbox" id="fd-check-backwards" ${this.prefs.backwards ? 'checked' : ''} ${this.prefs.searchMode === 'regexp' ? 'disabled' : ''} /> Backwards direction</label>
              </div>

              <fieldset class="fd-search-mode">
                <legend>Search Mode</legend>
                <label><input type="radio" name="fd-search-mode" id="fd-radio-normal" value="normal" ${this.prefs.searchMode === 'normal' ? 'checked' : ''} /> Normal</label>
                <label><input type="radio" name="fd-search-mode" id="fd-radio-extended" value="extended" ${this.prefs.searchMode === 'extended' ? 'checked' : ''} /> Extended (\\n \\r \\t \\0 \\xNN)</label>
                <label><input type="radio" name="fd-search-mode" id="fd-radio-regexp" value="regexp" ${this.prefs.searchMode === 'regexp' ? 'checked' : ''} /> Regular expression</label>
              </fieldset>

              <label class="fd-dotall">
                <input type="checkbox" id="fd-check-dotall" ${this.prefs.dotMatchesNewline ? 'checked' : ''} ${this.prefs.searchMode !== 'regexp' ? 'disabled' : ''} />
                . matches newline
              </label>
            </div>

            <!-- Mark-tab extras -->
            <div class="fd-mark-extras${this.activeTab === 'mark' ? '' : ' fd-hidden'}" id="fd-mark-extras">
              <label><input type="checkbox" id="fd-check-bookmark-line" /> Bookmark line</label>
              <label><input type="checkbox" id="fd-check-purge-each-search" /> Purge for each search</label>
            </div>

            <!-- Status line -->
            <div id="fd-status" class="fd-status" aria-live="polite"></div>

            <!-- Action buttons -->
            <div class="fd-actions">
              ${this._renderButtons()}
            </div>
          </div>
        </div>
      </div>`;

    this._wireEvents();

    // Focus the find input
    const findInput = this.root.querySelector<HTMLInputElement>('#fd-find-input');
    if (findInput) {
      findInput.focus();
      findInput.select();
    }
  }

  private _renderButtons(): string {
    if (this.activeTab === 'find') {
      return `
        <button id="fd-btn-find" type="button">Find</button>
        <button id="fd-btn-count" type="button">Count</button>
        <button id="fd-btn-find-all-doc" type="button">Find All in Current Document</button>
        <button id="fd-btn-find-all-docs" type="button">Find All in All Opened Documents</button>
        <button id="fd-btn-close" type="button">Close</button>`;
    }
    if (this.activeTab === 'replace') {
      return `
        <button id="fd-btn-find" type="button">Find</button>
        <button id="fd-btn-replace" type="button">Replace</button>
        <button id="fd-btn-replace-all" type="button">Replace All</button>
        <button id="fd-btn-replace-all-docs" type="button">Replace All in Opened Documents</button>
        <button id="fd-btn-close" type="button">Close</button>`;
    }
    // mark tab
    return `
      <button id="fd-btn-mark-all" type="button">Mark All</button>
      <button id="fd-btn-clear-marks" type="button">Clear all marks</button>
      <button id="fd-btn-copy-marked" type="button">Copy Marked Text</button>
      <button id="fd-btn-close" type="button">Close</button>`;
  }

  private _wireEvents(): void {
    const root = this.root;

    // Tab switching
    const tabFind = root.querySelector<HTMLButtonElement>('#fd-tab-find');
    const tabReplace = root.querySelector<HTMLButtonElement>('#fd-tab-replace');
    const tabMark = root.querySelector<HTMLButtonElement>('#fd-tab-mark');

    const switchTab = (tab: FindTabName): void => {
      // Save current input values before re-rendering
      this._syncInputsToPrefs();
      this.activeTab = tab;
      this._render();
    };

    tabFind?.addEventListener('click', () => switchTab('find'));
    tabReplace?.addEventListener('click', () => switchTab('replace'));
    tabMark?.addEventListener('click', () => switchTab('mark'));

    // Close button
    root.querySelector('#fd-btn-close')?.addEventListener('click', () => this.close());

    // Click on the overlay backdrop (not the dialog box) closes the dialog.
    const overlay = root.querySelector<HTMLElement>('.fd-overlay');
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    // MRU dropdowns: selecting from list fills the input
    const findInput = root.querySelector<HTMLInputElement>('#fd-find-input');
    const findMruSel = root.querySelector<HTMLSelectElement>('#fd-find-mru');
    const replaceInput = root.querySelector<HTMLInputElement>('#fd-replace-input');
    const replaceMruSel = root.querySelector<HTMLSelectElement>('#fd-replace-mru');

    findMruSel?.addEventListener('change', () => {
      if (findInput && findMruSel.value) findInput.value = findMruSel.value;
    });
    replaceMruSel?.addEventListener('change', () => {
      if (replaceInput && replaceMruSel.value) replaceInput.value = replaceMruSel.value;
    });

    // Search mode radio — toggle disabled states
    const modeRadios = root.querySelectorAll<HTMLInputElement>('input[name="fd-search-mode"]');
    const wholeWordCheck = root.querySelector<HTMLInputElement>('#fd-check-wholeword');
    const backwardsCheck = root.querySelector<HTMLInputElement>('#fd-check-backwards');
    const dotallCheck = root.querySelector<HTMLInputElement>('#fd-check-dotall');

    modeRadios.forEach((radio) => {
      radio.addEventListener('change', () => {
        const isRegexp = root.querySelector<HTMLInputElement>('#fd-radio-regexp')?.checked ?? false;
        if (backwardsCheck) backwardsCheck.disabled = isRegexp;
        if (wholeWordCheck) wholeWordCheck.disabled = isRegexp;
        if (dotallCheck) dotallCheck.disabled = !isRegexp;
      });
    });

    // Action buttons
    root.querySelector('#fd-btn-find')?.addEventListener('click', () => this._doFind());
    root.querySelector('#fd-btn-count')?.addEventListener('click', () => this._doCount());
    root
      .querySelector('#fd-btn-find-all-doc')
      ?.addEventListener('click', () => this._doFindAllInDoc());
    root
      .querySelector('#fd-btn-find-all-docs')
      ?.addEventListener('click', () => this._doFindAllInDocs());
    root.querySelector('#fd-btn-replace')?.addEventListener('click', () => this._doReplace());
    root
      .querySelector('#fd-btn-replace-all')
      ?.addEventListener('click', () => this._doReplaceAll());
    root
      .querySelector('#fd-btn-replace-all-docs')
      ?.addEventListener('click', () => this._doReplaceAllInDocs());

    // Mark tab actions (P6.3)
    root.querySelector('#fd-btn-mark-all')?.addEventListener('click', () => {
      this._doMarkAll();
    });
    root.querySelector('#fd-btn-clear-marks')?.addEventListener('click', () => {
      this._doClearMarks();
    });
    root.querySelector('#fd-btn-copy-marked')?.addEventListener('click', () => {
      this._doCopyMarkedText();
    });

    // Enter key in find input triggers Find
    findInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._doFind();
      }
    });
  }

  /** Sync current input values back to prefs (before tab switch or save). */
  private _syncInputsToPrefs(): void {
    const root = this.root;
    const findInput = root.querySelector<HTMLInputElement>('#fd-find-input');
    const replaceInput = root.querySelector<HTMLInputElement>('#fd-replace-input');
    const matchCaseCheck = root.querySelector<HTMLInputElement>('#fd-check-matchcase');
    const wholeWordCheck = root.querySelector<HTMLInputElement>('#fd-check-wholeword');
    const wrapCheck = root.querySelector<HTMLInputElement>('#fd-check-wrap');
    const backwardsCheck = root.querySelector<HTMLInputElement>('#fd-check-backwards');
    const dotallCheck = root.querySelector<HTMLInputElement>('#fd-check-dotall');
    const radioNormal = root.querySelector<HTMLInputElement>('#fd-radio-normal');
    const radioExtended = root.querySelector<HTMLInputElement>('#fd-radio-extended');
    const radioRegexp = root.querySelector<HTMLInputElement>('#fd-radio-regexp');

    if (matchCaseCheck) this.prefs.matchCase = matchCaseCheck.checked;
    if (wholeWordCheck) this.prefs.wholeWord = wholeWordCheck.checked;
    if (wrapCheck) this.prefs.wrap = wrapCheck.checked;
    if (backwardsCheck && !backwardsCheck.disabled) this.prefs.backwards = backwardsCheck.checked;
    if (dotallCheck) this.prefs.dotMatchesNewline = dotallCheck.checked;

    if (radioRegexp?.checked) this.prefs.searchMode = 'regexp';
    else if (radioExtended?.checked) this.prefs.searchMode = 'extended';
    else if (radioNormal?.checked) this.prefs.searchMode = 'normal';

    if (findInput?.value) {
      this.findMru = addToMru(this.findMru, findInput.value);
      this.prefs.findMru = this.findMru;
    }
    if (replaceInput?.value !== undefined) {
      if (replaceInput.value) {
        this.replaceMru = addToMru(this.replaceMru, replaceInput.value);
        this.prefs.replaceMru = this.replaceMru;
      }
    }
  }

  /** Read current dialog state and build SearchOptions. */
  private _getSearchState(): {
    term: string;
    replace: string;
    opts: SearchOptions;
    backwards: boolean;
    wrap: boolean;
    rawTerm: string;
  } {
    const root = this.root;
    const findInput = root.querySelector<HTMLInputElement>('#fd-find-input');
    const replaceInput = root.querySelector<HTMLInputElement>('#fd-replace-input');
    const matchCaseCheck = root.querySelector<HTMLInputElement>('#fd-check-matchcase');
    const wholeWordCheck = root.querySelector<HTMLInputElement>('#fd-check-wholeword');
    const wrapCheck = root.querySelector<HTMLInputElement>('#fd-check-wrap');
    const backwardsCheck = root.querySelector<HTMLInputElement>('#fd-check-backwards');
    const radioExtended = root.querySelector<HTMLInputElement>('#fd-radio-extended');
    const radioRegexp = root.querySelector<HTMLInputElement>('#fd-radio-regexp');

    const rawTerm = findInput?.value ?? '';
    const rawReplaceStr = replaceInput?.value ?? '';
    const matchCase = matchCaseCheck?.checked ?? false;
    const wrap = wrapCheck?.checked ?? true;
    const backwards = !(backwardsCheck?.disabled ?? false) && (backwardsCheck?.checked ?? false);
    const isRegexp = radioRegexp?.checked ?? false;
    const isExtended = radioExtended?.checked ?? false;

    const { term, replace, opts } = buildSearchState(rawTerm, rawReplaceStr, {
      matchCase,
      wholeWord: wholeWordCheck?.checked ?? false,
      isRegexp,
      isExtended,
    });

    return { term, replace, opts, backwards, wrap, rawTerm };
  }

  private _setStatus(msg: string): void {
    const status = this.root.querySelector<HTMLElement>('#fd-status');
    if (status) status.textContent = msg;
  }

  private _savePrefs(): void {
    this._syncInputsToPrefs();
    void this.persistence.saveSearchPrefs(this.prefs);
  }

  private _doFind(): void {
    const { term, opts, backwards } = this._getSearchState();
    if (!term) {
      this._setStatus('No search term entered.');
      return;
    }

    this._savePrefs();

    const q = new SearchQuery({
      search: term,
      caseSensitive: opts.matchCase,
      regexp: opts.regexp,
      wholeWord: opts.wholeWord,
    });
    const v = this.view;
    v.dispatch({ effects: setSearchQuery.of(q) });

    if (backwards) {
      findPrevious(v);
    } else {
      findNext(v);
    }
    v.focus();
  }

  private _doCount(): void {
    const { term, opts } = this._getSearchState();
    if (!term) {
      this._setStatus('No search term entered.');
      return;
    }

    this._savePrefs();

    const content = this.view.state.doc.toString();
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const text = Text.of(normalized.split('\n'));
    const matches = findMatches(text, term, opts);
    this._setStatus(`${matches.length} matches found.`);
  }

  private _doFindAllInDoc(): void {
    const { term, opts } = this._getSearchState();
    if (!term) {
      this._setStatus('No search term entered.');
      return;
    }

    this._savePrefs();

    const active = this.store.active();
    if (!active) return;
    const run = findInDocs(
      [{ id: active.id, name: active.name, content: active.content }],
      term,
      opts,
    );
    searchResultsStore.addRun(run);
    showSearchResultsPanel();

    this._setStatus(`${run.totalHits} matches found in current document.`);
  }

  private _doFindAllInDocs(): void {
    const { term, opts } = this._getSearchState();
    if (!term) {
      this._setStatus('No search term entered.');
      return;
    }

    this._savePrefs();

    const docs = this.store.list().map((d) => ({ id: d.id, name: d.name, content: d.content }));
    const run = findInDocs(docs, term, opts);
    searchResultsStore.addRun(run);
    showSearchResultsPanel();

    this._setStatus(`${run.totalHits} matches found in ${run.fileCount} files.`);
  }

  private _doReplace(): void {
    const { term, replace, opts, backwards } = this._getSearchState();
    if (!term) {
      this._setStatus('No search term entered.');
      return;
    }

    this._savePrefs();

    const q = new SearchQuery({
      search: term,
      replace,
      caseSensitive: opts.matchCase,
      regexp: opts.regexp,
      wholeWord: opts.wholeWord,
    });
    const v = this.view;
    v.dispatch({ effects: setSearchQuery.of(q) });
    replaceNext(v);

    // Move to next match after replace
    if (backwards) {
      findPrevious(v);
    } else {
      findNext(v);
    }
    v.focus();
  }

  private _doReplaceAll(): void {
    const { term, replace, opts } = this._getSearchState();
    if (!term) {
      this._setStatus('No search term entered.');
      return;
    }

    this._savePrefs();

    const q = new SearchQuery({
      search: term,
      replace,
      caseSensitive: opts.matchCase,
      regexp: opts.regexp,
      wholeWord: opts.wholeWord,
    });
    const v = this.view;
    v.dispatch({ effects: setSearchQuery.of(q) });
    replaceAll(v);
    v.focus();
    this._setStatus('Replace All completed.');
  }

  private _doReplaceAllInDocs(): void {
    const { term, replace, opts } = this._getSearchState();
    if (!term) {
      this._setStatus('No search term entered.');
      return;
    }

    this._savePrefs();

    const active = this.store.active();
    let totalCount = 0;

    // Active doc: use CM6 replaceAll for single undo transaction
    if (active) {
      const q = new SearchQuery({
        search: term,
        replace,
        caseSensitive: opts.matchCase,
        regexp: opts.regexp,
        wholeWord: opts.wholeWord,
      });
      const v = this.view;
      v.dispatch({ effects: setSearchQuery.of(q) });
      replaceAll(v);
      // Count replacements in active doc
      const { count } = replaceAllInContent(active.content, term, replace, opts);
      totalCount += count;
    }

    // Non-active docs: pure content replacement.
    // I2: Re-apply the doc's original EOL so a CRLF doc stays CRLF after replace.
    const allDocs = this.store.list();
    for (const doc of allDocs) {
      if (active && doc.id === active.id) continue;
      const { newContent, count } = replaceAllInContent(doc.content, term, replace, opts);
      if (count > 0) {
        // replaceAllInContent returns LF-normalised content; restore the original EOL.
        this.store.update(doc.id, { content: applyEol(newContent, doc.eol), dirty: true });
        this.controller.invalidateDoc(doc.id);
        totalCount += count;
      }
    }

    this.view.focus();
    this._setStatus(`Replaced ${totalCount} occurrences across all documents.`);
  }

  /**
   * Open the dialog on the Mark tab with "Bookmark line" pre-checked.
   * Entry point for Search → Bookmarks → "Search and Bookmark".
   * Faithful to NotepadNext's Search-and-Bookmark action which opens the Mark
   * tab with Bookmark line already checked so the user can type a term and run
   * Mark All immediately.
   */
  openMarkTab(opts: { bookmarkLine?: boolean } = {}): void {
    this.open('mark');
    if (opts.bookmarkLine) {
      const check = this.root.querySelector<HTMLInputElement>('#fd-check-bookmark-line');
      if (check) check.checked = true;
    }
  }

  /**
   * Mark All: find all matches of the current search term in the active doc,
   * apply find-highlights additively (or with purge gate), and optionally
   * bookmark the matching lines.
   * Faithful to FindReplaceDialog.cpp:713–748 markAll().
   */
  private _doMarkAll(): void {
    const { term, opts, rawTerm } = this._getSearchState();
    if (!term) {
      this._setStatus('No search term entered.');
      return;
    }

    this._savePrefs();

    const v = this.view;
    const purgeCheck = this.root.querySelector<HTMLInputElement>('#fd-check-purge-each-search');
    const bookmarkCheck = this.root.querySelector<HTMLInputElement>('#fd-check-bookmark-line');
    const purge = purgeCheck?.checked ?? false;
    const doBookmark = bookmarkCheck?.checked ?? false;

    const ranges = findMatches(v.state.doc, term, opts);

    if (purge) {
      // Clear find-highlights and bookmarks before adding new ones (faithful purge gate).
      v.dispatch({
        effects: [
          clearFindHighlightsEffect.of(undefined),
          setBookmarksEffect.of(new Set<number>()),
        ],
      });
    }

    // Add find-highlights additively.
    v.dispatch({ effects: addFindHighlightsEffect.of(ranges) });

    // Bookmark-line: collect unique 1-based line numbers, merge idempotently.
    if (doBookmark && ranges.length > 0) {
      // Re-read state after the highlight dispatch.
      const existing = new Set(v.state.field(bookmarkState));
      for (const { from } of ranges) {
        existing.add(v.state.doc.lineAt(from).number);
      }
      v.dispatch({ effects: setBookmarksEffect.of(existing) });
    }

    this._setStatus(`${ranges.length} occurrence(s) marked.`);

    // Push raw term to MRU (faithful to the other Mark All actions).
    if (rawTerm) {
      this.findMru = addToMru(this.findMru, rawTerm);
      this.prefs.findMru = this.findMru;
      void this.persistence.saveSearchPrefs(this.prefs);
    }
  }

  /**
   * Clear all find-highlights AND bookmarks in the active doc.
   * Faithful to FindReplaceDialog::clearAllMarks() (FindReplaceDialog.cpp:750-758)
   * which clears the mark indicator AND calls clearAllBookmarks().
   */
  private _doClearMarks(): void {
    const v = this.view;
    v.dispatch({
      effects: [clearFindHighlightsEffect.of(undefined), setBookmarksEffect.of(new Set<number>())],
    });
    this._setStatus('All marks and bookmarks cleared.');
  }

  /**
   * Copy Marked Text: collect text of all find-highlighted ranges, join with \n,
   * write to clipboard.
   * Faithful to FindReplaceDialog::copyMarkedText (concatenates ranges).
   * Clipboard: async API with execCommand fallback (mirrors bookmarks.ts pattern).
   */
  private _doCopyMarkedText(): void {
    const v = this.view;
    // Re-read from current state (findHighlightState must be present in sharedExtensions).
    const ranges = getFindHighlightRanges(v.state);
    if (ranges.length === 0) {
      this._setStatus('No marked text to copy.');
      return;
    }

    const parts = ranges.map(({ from, to }) => v.state.doc.sliceString(from, to));
    const text = parts.join('\n');

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      void navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }

    this._setStatus(`Copied ${parts.length} marked range(s) to clipboard.`);
  }

  /** Escape HTML entities in attribute values. */
  private _esc(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

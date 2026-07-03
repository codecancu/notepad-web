// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * MenuBar — Notepad++-faithful horizontal menu bar.
 *
 * Renders 9 top-level menus (File, Edit, Search, View, Encoding, Language,
 * Settings, Macro, Help) with their submenus in the same label/order/separator
 * layout as MainWindow.ui.  Items that are not yet implemented render DISABLED
 * (grey, not clickable) — they are never faked.
 *
 * Keyboard:  click top-menu opens dropdown;  Escape / click-outside closes;
 *            Arrow-Down / Arrow-Up moves within an open dropdown;
 *            Enter activates the focused item;  Arrow-Left / Arrow-Right
 *            moves between top-level menus when a dropdown is open.
 *
 * ARIA:  role="menubar" on the bar, role="menu" on each dropdown,
 *        role="menuitem" on each item (or role="separator" for dividers).
 *
 * Listener management:  document-level click and keydown handlers are registered
 * ONCE in the constructor (using bound references) so repeated buildAndRender()
 * calls (initial render + after luaRegistry.ready()) do NOT accumulate listeners.
 * Only DOM rebuilding happens in buildAndRender(); the document handlers remain
 * stable for the lifetime of the MenuBar instance.
 */

export interface MenuItem {
  label: string;
  accelerator?: string;
  action?: () => void;
  enabled: boolean;
  /** If set this item opens a submenu instead of dispatching action. */
  submenu?: MenuItem[];
  type?: 'separator';
  /** Optional icon filename (e.g. 'newfile.png') from the public/icons/ directory. */
  icon?: string;
}

export interface MenuDef {
  label: string;
  items: MenuItem[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sep(): MenuItem {
  return { label: '—', type: 'separator', enabled: false };
}

function item(
  label: string,
  accelerator: string | undefined,
  action: (() => void) | undefined,
  enabled: boolean,
  icon?: string,
): MenuItem {
  return { label, accelerator, action, enabled, ...(icon ? { icon } : {}) };
}

function disabled(label: string, accelerator?: string): MenuItem {
  return item(label, accelerator, undefined, false);
}

function enabled(label: string, action: () => void, accelerator?: string, icon?: string): MenuItem {
  return item(label, accelerator, action, true, icon);
}

function submenu(label: string, items: MenuItem[], enabled_: boolean = false): MenuItem {
  return { label, submenu: items, enabled: enabled_, action: undefined };
}

// ── MenuBar class ─────────────────────────────────────────────────────────────

export class MenuBar {
  private root: HTMLElement;
  private openMenuIdx: number | null = null;
  private menus: MenuDef[] = [];
  private topButtons: HTMLElement[] = [];
  private activeDropdown: HTMLElement | null = null;
  private focusedItemIdx: number | null = null;

  // Bound references kept so we can remove them if needed and — crucially —
  // so they are registered ONCE in the constructor, not on every render.
  private readonly _onDocClick: () => void;
  private readonly _onDocKeydown: (e: KeyboardEvent) => void;

  constructor(private container: HTMLElement) {
    this.root = document.createElement('nav');
    this.root.setAttribute('role', 'menubar');
    this.root.setAttribute('aria-label', 'Application menu');
    this.root.className = 'menubar';
    this.container.appendChild(this.root);

    // Register document-level listeners exactly once per MenuBar instance.
    // Subsequent buildAndRender() calls only rebuild the DOM, never re-attach these.
    this._onDocClick = () => this.closeAll();
    this._onDocKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.closeAll();
    };
    document.addEventListener('click', this._onDocClick);
    document.addEventListener('keydown', this._onDocKeydown);
  }

  /** Rebuild menu DOM from new definitions. Document-level listeners are NOT re-added. */
  buildAndRender(defs: MenuDef[]): void {
    this.menus = defs;
    this.root.innerHTML = '';
    this.topButtons = [];
    defs.forEach((menu, idx) => {
      const btn = document.createElement('button');
      btn.className = 'menubar-item';
      btn.textContent = menu.label;
      btn.setAttribute('role', 'menuitem');
      btn.setAttribute('aria-haspopup', 'menu');
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('tabindex', idx === 0 ? '0' : '-1');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.openMenuIdx === idx) {
          this.closeAll();
        } else {
          this.openMenu(idx);
        }
      });
      btn.addEventListener('keydown', (e) => this.handleTopKeydown(e, idx));
      btn.addEventListener('mouseenter', () => {
        // If any menu is open, hover switches to this one.
        if (this.openMenuIdx !== null && this.openMenuIdx !== idx) {
          this.openMenu(idx);
        }
      });
      this.topButtons.push(btn);
      this.root.appendChild(btn);
    });
  }

  // ── Open / close ────────────────────────────────────────────────────────────

  private openMenu(idx: number): void {
    this.closeAll();
    this.openMenuIdx = idx;
    const btn = this.topButtons[idx];
    if (!btn) return;
    btn.classList.add('active');
    btn.setAttribute('aria-expanded', 'true');

    const menuDef = this.menus[idx];
    if (!menuDef) return;
    const dropdown = this.buildDropdown(menuDef.items, () => this.closeAll());
    dropdown.classList.add('menubar-dropdown');

    // Position below the button.
    const rect = btn.getBoundingClientRect();
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom}px`;

    // Stop clicks inside dropdown from reaching the document close handler.
    dropdown.addEventListener('click', (e) => e.stopPropagation());

    document.body.appendChild(dropdown);
    this.activeDropdown = dropdown;
    this.focusedItemIdx = null;
  }

  private closeAll(): void {
    if (this.openMenuIdx !== null) {
      const btn = this.topButtons[this.openMenuIdx];
      btn?.classList.remove('active');
      btn?.setAttribute('aria-expanded', 'false');
      this.openMenuIdx = null;
    }
    if (this.activeDropdown) {
      this.activeDropdown.remove();
      this.activeDropdown = null;
    }
    // Level-2+ submenu panels are appended to document.body, so removing the
    // level-1 dropdown does NOT remove them — sweep them here so a submenu never
    // orphans on screen when the menu closes (click / click-outside / Escape /
    // switching to another top-level menu).
    document.querySelectorAll('.menubar-sub').forEach((el) => el.remove());
    this.focusedItemIdx = null;
  }

  // ── Dropdown builder ─────────────────────────────────────────────────────────

  private buildDropdown(items: MenuItem[], closeAll: () => void): HTMLElement {
    const ul = document.createElement('ul');
    ul.setAttribute('role', 'menu');
    ul.className = 'menubar-dropdown';

    items.forEach((it, i) => {
      const li = document.createElement('li');

      if (it.type === 'separator') {
        li.setAttribute('role', 'separator');
        li.className = 'menubar-sep';
        ul.appendChild(li);
        return;
      }

      li.setAttribute('role', 'menuitem');
      li.setAttribute('tabindex', '-1');
      li.className = 'menubar-entry';

      if (!it.enabled) {
        li.classList.add('disabled');
        li.setAttribute('aria-disabled', 'true');
      } else {
        li.addEventListener('click', (e) => {
          e.stopPropagation();
          if (it.submenu) return; // submenu handled by mouseenter
          closeAll();
          it.action?.();
        });
        li.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!it.submenu) {
              closeAll();
              it.action?.();
            }
          }
        });
      }

      // Leading icon column (16px) — spacer keeps label column aligned across all items.
      if (it.icon) {
        const img = document.createElement('img');
        img.src = `icons/${it.icon}`;
        img.width = 16;
        img.height = 16;
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        img.className = 'menubar-entry-icon';
        li.appendChild(img);
      } else {
        const spacer = document.createElement('span');
        spacer.className = 'menubar-entry-icon menubar-entry-icon-spacer';
        spacer.setAttribute('aria-hidden', 'true');
        li.appendChild(spacer);
      }

      // Label + optional accelerator.
      const labelSpan = document.createElement('span');
      labelSpan.className = 'menubar-entry-label';
      labelSpan.textContent = it.label;
      li.appendChild(labelSpan);

      if (it.accelerator) {
        const accelSpan = document.createElement('span');
        accelSpan.className = 'menubar-entry-accel';
        accelSpan.textContent = it.accelerator;
        accelSpan.setAttribute('aria-hidden', 'true');
        li.appendChild(accelSpan);
      }

      // Submenu indicator + hover sub-panel.
      if (it.submenu) {
        const arrow = document.createElement('span');
        arrow.className = 'menubar-entry-arrow';
        arrow.textContent = '▶';
        arrow.setAttribute('aria-hidden', 'true');
        li.appendChild(arrow);
        li.setAttribute('aria-haspopup', 'menu');

        // Fix 5: only attach submenu-open hover behavior when the item is enabled.
        // Disabled submenu-parent items must not expand on hover.
        if (it.enabled) {
          let subPanel: HTMLElement | null = null;

          li.addEventListener('mouseenter', () => {
            if (!it.submenu) return;
            // Remove any existing sibling sub-panel.
            ul.querySelectorAll('.menubar-sub').forEach((el) => el.remove());
            subPanel = this.buildDropdown(it.submenu!, closeAll);
            subPanel.classList.add('menubar-sub');
            // Position to the right of the parent item.
            const parentRect = li.getBoundingClientRect();
            subPanel.style.left = `${parentRect.right}px`;
            subPanel.style.top = `${parentRect.top}px`;
            document.body.appendChild(subPanel);

            // Self-close: once the pointer is inside the sub-panel, leaving it to
            // anywhere that is neither the parent item nor a nested sub-panel
            // dismisses it (so it doesn't linger after you move away).
            subPanel.addEventListener('mouseleave', (ev) => {
              const rel = (ev as MouseEvent).relatedTarget as Element | null;
              if (subPanel && !li.contains(rel) && !subPanel.contains(rel)) {
                subPanel.remove();
                subPanel = null;
              }
            });
          });

          li.addEventListener('mouseleave', (e) => {
            const related = (e as MouseEvent).relatedTarget as Element | null;
            if (subPanel && !subPanel.contains(related)) {
              subPanel.remove();
              subPanel = null;
            }
          });
        }
      } else {
        // For non-submenu items, close sub-panels when hovered.
        li.addEventListener('mouseenter', () => {
          ul.querySelectorAll('.menubar-sub').forEach((el) => el.remove());
        });
      }

      // Track data-idx for keyboard nav.
      li.dataset.idx = String(i);
      ul.appendChild(li);
    });

    // Keyboard navigation within dropdown.
    ul.addEventListener('keydown', (e) => this.handleDropdownKeydown(e, ul, closeAll));

    return ul;
  }

  // ── Keyboard nav ────────────────────────────────────────────────────────────

  private handleTopKeydown(e: KeyboardEvent, idx: number): void {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = (idx + 1) % this.topButtons.length;
      this.topButtons[next]?.focus();
      if (this.openMenuIdx !== null) this.openMenu(next);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = (idx - 1 + this.topButtons.length) % this.topButtons.length;
      this.topButtons[prev]?.focus();
      if (this.openMenuIdx !== null) this.openMenu(prev);
    } else if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (this.openMenuIdx !== idx) this.openMenu(idx);
      this.focusDropdownItem(0);
    }
  }

  private handleDropdownKeydown(e: KeyboardEvent, ul: HTMLElement, closeAll: () => void): void {
    const items = Array.from(ul.querySelectorAll<HTMLElement>('.menubar-entry'));
    const focused = ul.querySelector<HTMLElement>('.menubar-entry:focus');
    const cur = focused ? items.indexOf(focused) : -1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (cur + 1) % items.length;
      items[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (cur - 1 + items.length) % items.length;
      items[prev]?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      // Close submenu; move to prev top menu.
      closeAll();
      if (this.openMenuIdx !== null) {
        const prev = (this.openMenuIdx - 1 + this.topButtons.length) % this.topButtons.length;
        this.openMenu(prev);
        this.focusDropdownItem(0);
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      // Move to next top menu.
      closeAll();
      if (this.openMenuIdx !== null) {
        const next = (this.openMenuIdx + 1) % this.topButtons.length;
        this.openMenu(next);
        this.focusDropdownItem(0);
      }
    }
  }

  private focusDropdownItem(idx: number): void {
    if (!this.activeDropdown) return;
    const items = Array.from(this.activeDropdown.querySelectorAll<HTMLElement>('.menubar-entry'));
    items[idx]?.focus();
    this.focusedItemIdx = idx;
  }

  // ── Public factory ────────────────────────────────────────────────────────────

  /**
   * Build the Notepad++-faithful menu definitions from injected action callbacks.
   * Items that are not yet implemented are DISABLED (no action, greyed out).
   *
   * Menu order matches MainWindow.ui:
   *   File · Edit · Search · View · Encoding · Language · Settings · Macro · Help
   */
  static buildMenuDefs(actions: MenuBarActions): MenuDef[] {
    const {
      fileNew,
      fileOpen,
      fileOpenFolder,
      fileSave,
      fileSaveAs,
      fileSaveAll,
      fileSaveCopyAs,
      fileReload,
      fileClose,
      fileCloseAll,
      fileCloseAllExceptActive,
      fileCloseAllToLeft,
      fileCloseAllToRight,
      editUndo,
      editRedo,
      editCut,
      editCopy,
      editPaste,
      editSelectAll,
      editIndentMore,
      editIndentLess,
      editUpperCase,
      editLowerCase,
      editEolWindows,
      editEolUnix,
      editEolMac,
      editDuplicateLine,
      editJoinLines,
      editMoveLineUp,
      editMoveLineDown,
      editRemoveEmptyLines,
      editRemoveDuplicateLines,
      editRemoveConsecutiveDupLines,
      editReverseLineOrder,
      editSortLinesAsc,
      editSortLinesAscCI,
      editSortLinesByLengthAsc,
      editSortLinesDesc,
      editSortLinesDescCI,
      editSortLinesByLengthDesc,
      editToggleLineComment,
      editAddLineComment,
      editRemoveLineComment,
      editBase64Encode,
      editBase64Decode,
      editUrlEncode,
      editUrlDecode,
      searchFind,
      searchReplace,
      searchFindNext,
      searchFindPrev,
      searchGoToLine,
      viewShowWhitespace,
      viewShowEndOfLine,
      viewShowAllChars,
      viewFoldAll,
      viewUnfoldAll,
      viewFullScreen,
      viewWordWrap,
      viewZoomIn,
      viewZoomOut,
      viewZoomReset,
      encodingUtf8,
      encodingUtf8Bom,
      recentFiles,
      recentFilesRestoreLast,
      recentFilesOpenAll,
      recentFilesClear,
      settingsPrefs,
      helpAbout,
      helpDebugInfo,
      helpDebugLog,
      viewFileList,
      viewWorkspace,
      viewEditorInspector,
      viewLanguageInspector,
      viewLuaConsole,
      langItems,
      searchToggleBookmark,
      searchNextBookmark,
      searchPrevBookmark,
      searchClearBookmarks,
      searchInvertBookmarks,
      searchCutBookmarkedLines,
      searchCopyBookmarkedLines,
      searchDeleteBookmarkedLines,
      searchAndBookmark,
      searchMarkStyle1,
      searchMarkStyle2,
      searchMarkStyle3,
      searchClearStyle1,
      searchClearStyle2,
      searchClearStyle3,
      searchClearAllStyles,
      macroStartRecording,
      macroStopRecording,
      macroPlayback,
      macroIsRecording,
      macroHasMacro,
      macroHasRunnable,
      macroRunMultiple,
      macroSaveCurrent,
      macroSavedItems,
    } = actions;

    // ── File ─────────────────────────────────────────────────────────────────
    // Build Recent Files submenu dynamically from the provided list.
    const recentFileItems: MenuItem[] = [
      enabled('Restore Recently Closed File', recentFilesRestoreLast),
      enabled('Open All Recent Files', recentFilesOpenAll),
      enabled('Clear Recent Files List', recentFilesClear),
      sep(),
      ...recentFiles.map((rf) => enabled(rf.name, rf.action)),
    ];
    const fileMenu: MenuDef = {
      label: 'File',
      items: [
        // Ctrl+N is browser-reserved (opens a new browser window) and cannot be
        // intercepted from a web extension page — de-labeled to avoid misleading users.
        enabled('New', fileNew, undefined, 'newfile.png'),
        enabled('Open...', fileOpen, 'Ctrl+O', 'openFile.png'),
        enabled('Open Folder as Workspace', fileOpenFolder),
        enabled('Reload', fileReload, undefined, 'arrow_refresh.png'),
        enabled('Save', fileSave, 'Ctrl+S', 'saved.png'),
        enabled('Save As...', fileSaveAs, 'Ctrl+Alt+S'),
        enabled('Save a Copy As...', fileSaveCopyAs),
        enabled('Save All', fileSaveAll, 'Ctrl+Shift+S', 'saveAll.png'),
        submenu('Export As', [disabled('Export As HTML'), disabled('Export As RTF')]),
        disabled('Rename...'),
        // Ctrl+W is browser-reserved (closes the browser tab) and cannot be
        // intercepted from a web extension page — de-labeled to avoid misleading users.
        enabled('Close', fileClose, undefined, 'closeFile.png'),
        enabled('Close All', fileCloseAll, 'Ctrl+Shift+W', 'closeAll.png'),
        submenu(
          'Close More',
          [
            enabled('Close All Except Active Document', fileCloseAllExceptActive),
            enabled('Close All to the Left', fileCloseAllToLeft),
            enabled('Close All to the Right', fileCloseAllToRight),
          ],
          true,
        ),
        disabled('Move to Trash'),
        sep(),
        disabled('Print...'),
        sep(),
        submenu('Recent Files', recentFileItems, true),
        sep(),
        // window.close() is a no-op in a normal browser tab (only works for
        // windows opened via window.open()).  Disabled to be honest with the user.
        disabled('Exit'),
      ],
    };

    // ── Edit ─────────────────────────────────────────────────────────────────
    const editMenu: MenuDef = {
      label: 'Edit',
      items: [
        enabled('Undo', editUndo, 'Ctrl+Z', 'undo.png'),
        enabled('Redo', editRedo, 'Ctrl+Y', 'redo.png'),
        sep(),
        enabled('Cut', editCut, 'Ctrl+X', 'cut.png'),
        enabled('Copy', editCopy, 'Ctrl+C', 'copy.png'),
        enabled('Paste', editPaste, 'Ctrl+V', 'paste.png'),
        disabled('Delete', 'Del'),
        enabled('Select All', editSelectAll, 'Ctrl+A'),
        disabled('Select Next'),
        sep(),
        submenu('Copy More', [
          disabled('Copy Full Path'),
          disabled('Copy File Name'),
          disabled('Copy File Directory'),
        ]),
        submenu('Copy As', [disabled('Copy As HTML'), disabled('Copy As RTF')]),
        submenu(
          'Indent',
          [
            // Tab/Shift+Tab only fire when the CM6 indentWithTab extension is active;
            // omit accelerator hints here to avoid misleading labels.
            enabled('Increase Indent', editIndentMore, undefined, 'text_indent.png'),
            enabled('Decrease Indent', editIndentLess, undefined, 'text_indent_remove.png'),
          ],
          true,
        ),
        submenu(
          'Convert Case',
          [enabled('UPPER CASE', editUpperCase), enabled('lower case', editLowerCase)],
          true,
        ),
        submenu(
          'EOL Conversion',
          [
            enabled('Windows (CR LF)', editEolWindows),
            enabled('Unix (LF)', editEolUnix),
            enabled('Macintosh (CR)', editEolMac),
          ],
          true,
        ),
        submenu(
          'Line Operations',
          [
            enabled('Duplicate Current Line', editDuplicateLine, 'Alt+Down'),
            disabled('Split Lines'), // deferred: CM6 lacks a viewport wrap-width API
            enabled('Join Lines', editJoinLines, 'Ctrl+J'),
            enabled('Move Selected Lines Up', editMoveLineUp, 'Ctrl+Shift+Up'),
            enabled('Move Selected Lines Down', editMoveLineDown, 'Ctrl+Shift+Down'),
            sep(),
            enabled('Remove Empty Lines', editRemoveEmptyLines),
            enabled('Remove Duplicate Lines', editRemoveDuplicateLines),
            enabled('Remove Consecutive Duplicate Lines', editRemoveConsecutiveDupLines),
            enabled('Reverse Line Order', editReverseLineOrder),
            sep(),
            enabled('Sort Lines Ascending', editSortLinesAsc),
            enabled('Sort Lines Ascending (Case Insensitive)', editSortLinesAscCI),
            enabled('Sort Lines by Length Ascending', editSortLinesByLengthAsc),
            sep(),
            enabled('Sort Lines Descending', editSortLinesDesc),
            enabled('Sort Lines Descending (Case Insensitive)', editSortLinesDescCI),
            enabled('Sort Lines by Length Descending', editSortLinesByLengthDesc),
          ],
          true,
        ),
        submenu(
          'Comment/Uncomment',
          [
            enabled('Toggle Single Line Comment', editToggleLineComment, 'Ctrl+/'),
            enabled('Single Line Comment', editAddLineComment, 'Ctrl+K'),
            enabled('Single Line Uncomment', editRemoveLineComment, 'Ctrl+Shift+K'),
          ],
          true,
        ),
        submenu(
          'Encoding/Decoding',
          [
            enabled('Base64 Encode', editBase64Encode),
            enabled('URL Encode', editUrlEncode),
            sep(),
            enabled('Base64 Decode', editBase64Decode),
            enabled('URL Decode', editUrlDecode),
          ],
          true,
        ),
        sep(),
        disabled('Column Mode'),
      ],
    };

    // ── Search ───────────────────────────────────────────────────────────────
    // Fix 3: searchReplace is wired to openSearchPanel which in @codemirror/search
    // shows an inline panel that contains BOTH the Find input AND the Replace input
    // with a "Replace" / "Replace all" button row.  The same panel handles both
    // Find and Replace, so a separate replace-only entrypoint is not required.
    // The Replace... item correctly opens that combined panel.
    const searchMenu: MenuDef = {
      label: 'Search',
      items: [
        enabled('Find...', searchFind, 'Ctrl+F', 'find.png'),
        disabled('Find in Files...'),
        enabled('Find Next', searchFindNext, 'F3'),
        enabled('Find Previous', searchFindPrev, 'Shift+F3'),
        enabled('Replace...', searchReplace, 'Ctrl+H', 'findReplace.png'),
        sep(),
        disabled('Quick Find'),
        enabled('Go to Line...', searchGoToLine, 'Ctrl+G'),
        sep(),
        submenu(
          'Mark All Occurrences',
          [
            enabled('Mark Style 1', searchMarkStyle1),
            enabled('Mark Style 2', searchMarkStyle2),
            enabled('Mark Style 3', searchMarkStyle3),
          ],
          true,
        ),
        submenu(
          'Clear Marks',
          [
            enabled('Clear Style 1', searchClearStyle1),
            enabled('Clear Style 2', searchClearStyle2),
            enabled('Clear Style 3', searchClearStyle3),
            enabled('Clear All Styles', searchClearAllStyles),
          ],
          true,
        ),
        sep(),
        submenu(
          'Bookmarks',
          [
            enabled('Toggle Bookmark', searchToggleBookmark, 'Ctrl+F2'),
            enabled('Search and Bookmark', searchAndBookmark),
            sep(),
            enabled('Next Bookmark', searchNextBookmark, 'F2'),
            enabled('Previous Bookmark', searchPrevBookmark, 'Shift+F2'),
            sep(),
            enabled('Clear Bookmarks', searchClearBookmarks),
            enabled('Invert Bookmarks', searchInvertBookmarks),
            sep(),
            enabled('Cut Bookmarked Lines', searchCutBookmarkedLines),
            enabled('Copy Bookmarked Lines', searchCopyBookmarkedLines),
            enabled('Delete Bookmarked Lines', searchDeleteBookmarkedLines),
          ],
          true,
        ),
      ],
    };

    // ── View ─────────────────────────────────────────────────────────────────
    const viewMenu: MenuDef = {
      label: 'View',
      items: [
        enabled('Full Screen', viewFullScreen),
        sep(),
        enabled('File List', viewFileList),
        enabled('Folder as Workspace', viewWorkspace),
        enabled('Editor Inspector', viewEditorInspector),
        enabled('Language Inspector', viewLanguageInspector),
        enabled('Lua Console', viewLuaConsole),
        sep(),
        submenu(
          'Show Symbol',
          [
            // Show All Characters = whitespace + EOL combined.
            enabled('Show All Characters', viewShowAllChars, undefined, 'invisibleChar.png'),
            enabled('Show Whitespace', viewShowWhitespace),
            enabled('Show End of Line', viewShowEndOfLine),
            sep(),
            // Show Indent Guide: CM6 has no built-in indentation-marker extension
            // without the @replit/codemirror-indentation-markers 3rd-party dep.
            // DISABLED honestly — deferred to Phase 3 if dep is approved.
            disabled('Show Indent Guide'),
            // Show Wrap Symbol: CM6 has no native wrap-symbol glyph at EOL.
            // DISABLED honestly — deferred.
            disabled('Show Wrap Symbol'),
          ],
          true,
        ),
        submenu(
          'Zoom',
          [
            enabled('Zoom In', viewZoomIn, 'Ctrl++', 'zoomIn.png'),
            enabled('Zoom Out', viewZoomOut, 'Ctrl+-', 'zoomOut.png'),
            sep(),
            enabled('Reset Zoom', viewZoomReset, 'Ctrl+0'),
          ],
          true,
        ),
        enabled('Word Wrap', viewWordWrap, 'Alt+Z', 'wrap.png'),
        sep(),
        enabled('Fold All', viewFoldAll),
        enabled('Unfold All', viewUnfoldAll),
        // Per-depth Fold/Unfold Level 1-9: CM6 foldAll/unfoldAll don't expose
        // a depth parameter — folding at a specific nesting level is not cleanly
        // supported without a full AST walk. DISABLED honestly.
        submenu('Fold Level', [
          disabled('Fold Level 1 (depth folding not supported in CM6)'),
          disabled('Fold Level 2'),
          disabled('Fold Level 3'),
          disabled('Fold Level 4'),
          disabled('Fold Level 5'),
          disabled('Fold Level 6'),
          disabled('Fold Level 7'),
          disabled('Fold Level 8'),
          disabled('Fold Level 9'),
        ]),
        submenu('Unfold Level', [
          disabled('Unfold Level 1 (depth folding not supported in CM6)'),
          disabled('Unfold Level 2'),
          disabled('Unfold Level 3'),
          disabled('Unfold Level 4'),
          disabled('Unfold Level 5'),
          disabled('Unfold Level 6'),
          disabled('Unfold Level 7'),
          disabled('Unfold Level 8'),
          disabled('Unfold Level 9'),
        ]),
        sep(),
        disabled('Split Horizontal'),
        disabled('Split Vertical'),
      ],
    };

    // ── Encoding ──────────────────────────────────────────────────────────────
    // Feasible items: toggle BOM flag for the active doc on Save.
    // Full ANSI/UTF-16 conversion is infeasible without a full binary encoder
    // (TextEncoder only provides UTF-8; no browser API converts legacy code pages).
    // Those specific items are DISABLED honestly.
    const encodingMenu: MenuDef = {
      label: 'Encoding',
      items: [
        enabled('Encode in UTF-8', encodingUtf8),
        enabled('Encode in UTF-8-BOM', encodingUtf8Bom),
        sep(),
        // Full ANSI/UTF-16 conversion requires a code-page encoder not available
        // via any browser-native API. Deferred to Phase 4 if a polyfill is approved.
        disabled('Encode in ANSI (disabled — no browser code-page encoder)'),
        disabled('Encode in UTF-16 BE BOM (disabled — no browser code-page encoder)'),
        disabled('Encode in UTF-16 LE BOM (disabled — no browser code-page encoder)'),
      ],
    };

    // ── Language ──────────────────────────────────────────────────────────────
    // Group languages by first uppercase letter (faithful to MainWindow.cpp:1059-1073).
    // A letter with >1 language → submenu titled by the uppercase letter.
    // A letter with exactly 1 language → that language item directly in the menu.
    let langMenuItems: MenuItem[];
    if (langItems.length === 0) {
      langMenuItems = [disabled('(loading…)')];
    } else {
      // Group by first character (langItems is already sorted by label).
      const byLetter = new Map<string, LangItem[]>();
      for (const li of langItems) {
        const letter = li.label[0]!.toUpperCase();
        const group = byLetter.get(letter);
        if (group) {
          group.push(li);
        } else {
          byLetter.set(letter, [li]);
        }
      }
      langMenuItems = [];
      for (const [letter, group] of byLetter) {
        if (group.length > 1) {
          langMenuItems.push(
            submenu(
              letter,
              group.map((li) => enabled(li.label, li.action)),
              true,
            ),
          );
        } else {
          langMenuItems.push(enabled(group[0]!.label, group[0]!.action));
        }
      }
    }
    const languageMenu: MenuDef = {
      label: 'Language',
      items: langMenuItems,
    };

    // ── Settings ──────────────────────────────────────────────────────────────
    const settingsMenu: MenuDef = {
      label: 'Settings',
      items: [enabled('Preferences...', settingsPrefs, 'Ctrl+,', 'cog.png')],
    };

    // ── Macro ─────────────────────────────────────────────────────────────────
    // Playback + Save-Current act on the CURRENT unsaved recording only.
    // Run-Multiple can run any macro, so it is enabled when a current OR any
    // saved macro exists (faithful to MainWindow.cpp:798 availableMacros>0 ||
    // hasCurrentUnsavedMacro) — this keeps it usable after a page reload.
    const hasMacro = macroHasMacro();
    const hasRunnable = macroHasRunnable();
    const macroMenuItems: MenuItem[] = [
      macroIsRecording()
        ? disabled('Start Recording')
        : enabled('Start Recording', macroStartRecording, undefined, 'startRecord.png'),
      macroIsRecording()
        ? enabled('Stop Recording', macroStopRecording, undefined, 'stopRecord.png')
        : disabled('Stop Recording'),
      sep(),
      hasMacro
        ? enabled('Playback', macroPlayback, 'Ctrl+Shift+P', 'playRecord.png')
        : disabled('Playback', 'Ctrl+Shift+P'),
      sep(),
      hasRunnable
        ? enabled('Run a Macro Multiple Times...', macroRunMultiple, undefined, 'playRecord_m.png')
        : disabled('Run a Macro Multiple Times...'),
      hasMacro
        ? enabled('Save Current Recorded Macro...', macroSaveCurrent, undefined, 'saveRecord.png')
        : disabled('Save Current Recorded Macro...'),
      // Edit Macros… step-editor: DEFERRED (P5.2 scope decision). Faithful inert item.
      disabled('Edit Macros...'),
    ];
    // Dynamic saved-macro items: append after a separator if any saved macros exist.
    if (macroSavedItems.length > 0) {
      macroMenuItems.push(sep());
      for (const si of macroSavedItems) {
        macroMenuItems.push(enabled(si.name, si.action));
      }
    }
    const macroMenu: MenuDef = {
      label: 'Macro',
      items: macroMenuItems,
    };

    // ── Help ──────────────────────────────────────────────────────────────────
    const helpMenu: MenuDef = {
      label: 'Help',
      items: [
        sep(),
        disabled('Check for Updates'),
        sep(),
        disabled('About Qt'),
        enabled('About Notepad Web', helpAbout),
        enabled('Debug Info', helpDebugInfo),
        sep(),
        enabled('Debug Log', helpDebugLog),
      ],
    };

    return [
      fileMenu,
      editMenu,
      searchMenu,
      viewMenu,
      encodingMenu,
      languageMenu,
      settingsMenu,
      macroMenu,
      helpMenu,
    ];
  }
}

// ── Action interface ─────────────────────────────────────────────────────────

export interface LangItem {
  label: string;
  action: () => void;
}

export interface RecentFileItem {
  name: string;
  action: () => void;
}

export interface MenuBarActions {
  fileNew: () => void;
  fileOpen: () => void;
  fileOpenFolder: () => void;
  fileSave: () => void;
  fileSaveAs: () => void;
  fileSaveAll: () => void;
  fileSaveCopyAs: () => void;
  fileReload: () => void;
  fileClose: () => void;
  fileCloseAll: () => void;
  fileCloseAllExceptActive: () => void;
  fileCloseAllToLeft: () => void;
  fileCloseAllToRight: () => void;
  editUndo: () => void;
  editRedo: () => void;
  editCut: () => void;
  editCopy: () => void;
  editPaste: () => void;
  editSelectAll: () => void;
  // Indent
  editIndentMore: () => void;
  editIndentLess: () => void;
  // Convert Case
  editUpperCase: () => void;
  editLowerCase: () => void;
  // EOL Conversion
  editEolWindows: () => void;
  editEolUnix: () => void;
  editEolMac: () => void;
  // Line Operations
  editDuplicateLine: () => void;
  editSplitLines: () => void;
  editJoinLines: () => void;
  editMoveLineUp: () => void;
  editMoveLineDown: () => void;
  editRemoveEmptyLines: () => void;
  editRemoveDuplicateLines: () => void;
  editRemoveConsecutiveDupLines: () => void;
  editReverseLineOrder: () => void;
  editSortLinesAsc: () => void;
  editSortLinesAscCI: () => void;
  editSortLinesByLengthAsc: () => void;
  editSortLinesDesc: () => void;
  editSortLinesDescCI: () => void;
  editSortLinesByLengthDesc: () => void;
  // Comment/Uncomment
  editToggleLineComment: () => void;
  editAddLineComment: () => void;
  editRemoveLineComment: () => void;
  // Encoding/Decoding
  editBase64Encode: () => void;
  editBase64Decode: () => void;
  editUrlEncode: () => void;
  editUrlDecode: () => void;
  searchFind: () => void;
  searchReplace: () => void;
  searchFindNext: () => void;
  searchFindPrev: () => void;
  searchGoToLine: () => void;
  viewShowWhitespace: () => void;
  viewShowEndOfLine: () => void;
  viewShowAllChars: () => void;
  viewFoldAll: () => void;
  viewUnfoldAll: () => void;
  viewFullScreen: () => void;
  viewWordWrap: () => void;
  viewZoomIn: () => void;
  viewZoomOut: () => void;
  viewZoomReset: () => void;
  encodingUtf8: () => void;
  encodingUtf8Bom: () => void;
  recentFiles: RecentFileItem[];
  recentFilesRestoreLast: () => void;
  recentFilesOpenAll: () => void;
  recentFilesClear: () => void;
  settingsPrefs: () => void;
  helpAbout: () => void;
  helpDebugInfo: () => void;
  helpDebugLog: () => void;
  viewFileList: () => void;
  viewWorkspace: () => void;
  viewEditorInspector: () => void;
  viewLanguageInspector: () => void;
  viewLuaConsole: () => void;
  langItems: LangItem[];
  // Bookmarks (Search → Bookmarks submenu)
  searchToggleBookmark: () => void;
  searchNextBookmark: () => void;
  searchPrevBookmark: () => void;
  searchClearBookmarks: () => void;
  searchInvertBookmarks: () => void;
  searchCutBookmarkedLines: () => void;
  searchCopyBookmarkedLines: () => void;
  searchDeleteBookmarkedLines: () => void;
  /** Open Find dialog on the Mark tab with Bookmark line pre-checked (Search-and-Bookmark). */
  searchAndBookmark: () => void;
  // Markers (Search → Mark All Occurrences / Clear Marks submenus)
  searchMarkStyle1: () => void;
  searchMarkStyle2: () => void;
  searchMarkStyle3: () => void;
  searchClearStyle1: () => void;
  searchClearStyle2: () => void;
  searchClearStyle3: () => void;
  searchClearAllStyles: () => void;
  // Macro
  macroStartRecording: () => void;
  macroStopRecording: () => void;
  macroPlayback: () => void;
  /** True when a current OR any saved macro exists (gates Run-Multiple). */
  macroHasRunnable: () => boolean;
  macroIsRecording: () => boolean;
  macroHasMacro: () => boolean;
  macroRunMultiple: () => void;
  macroSaveCurrent: () => void;
  macroSavedItems: Array<{ name: string; action: () => void }>;
}

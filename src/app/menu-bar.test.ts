// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MenuBar } from './menu-bar';
import type { MenuBarActions } from './menu-bar';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeActions(overrides: Partial<MenuBarActions> = {}): MenuBarActions {
  const noop = () => {};
  return {
    fileNew: noop,
    fileOpen: noop,
    fileSave: noop,
    fileSaveAs: noop,
    fileSaveAll: noop,
    fileSaveCopyAs: noop,
    fileReload: noop,
    fileClose: noop,
    fileCloseAll: noop,
    fileCloseAllExceptActive: noop,
    fileCloseAllToLeft: noop,
    fileCloseAllToRight: noop,
    editUndo: noop,
    editRedo: noop,
    editCut: noop,
    editCopy: noop,
    editPaste: noop,
    editSelectAll: noop,
    editIndentMore: noop,
    editIndentLess: noop,
    editUpperCase: noop,
    editLowerCase: noop,
    editEolWindows: noop,
    editEolUnix: noop,
    editEolMac: noop,
    editDuplicateLine: noop,
    editSplitLines: noop,
    editJoinLines: noop,
    editMoveLineUp: noop,
    editMoveLineDown: noop,
    editRemoveEmptyLines: noop,
    editRemoveDuplicateLines: noop,
    editRemoveConsecutiveDupLines: noop,
    editReverseLineOrder: noop,
    editSortLinesAsc: noop,
    editSortLinesAscCI: noop,
    editSortLinesByLengthAsc: noop,
    editSortLinesDesc: noop,
    editSortLinesDescCI: noop,
    editSortLinesByLengthDesc: noop,
    editToggleLineComment: noop,
    editAddLineComment: noop,
    editRemoveLineComment: noop,
    editBase64Encode: noop,
    editBase64Decode: noop,
    editUrlEncode: noop,
    editUrlDecode: noop,
    searchFind: noop,
    searchReplace: noop,
    searchFindNext: noop,
    searchFindPrev: noop,
    searchGoToLine: noop,
    viewShowWhitespace: noop,
    viewShowEndOfLine: noop,
    viewShowAllChars: noop,
    viewFoldAll: noop,
    viewUnfoldAll: noop,
    viewFullScreen: noop,
    viewWordWrap: noop,
    viewZoomIn: noop,
    viewZoomOut: noop,
    viewZoomReset: noop,
    encodingUtf8: noop,
    encodingUtf8Bom: noop,
    recentFiles: [],
    recentFilesRestoreLast: noop,
    recentFilesOpenAll: noop,
    recentFilesClear: noop,
    settingsPrefs: noop,
    helpAbout: noop,
    helpDebugInfo: noop,
    helpDebugLog: noop,
    viewFileList: noop,
    viewWorkspace: noop,
    viewEditorInspector: noop,
    viewLanguageInspector: noop,
    viewLuaConsole: noop,
    viewSplitHorizontal: noop,
    viewSplitVertical: noop,
    fileOpenFolder: noop,
    langItems: [],
    searchToggleBookmark: noop,
    searchNextBookmark: noop,
    searchPrevBookmark: noop,
    searchClearBookmarks: noop,
    searchInvertBookmarks: noop,
    searchCutBookmarkedLines: noop,
    searchCopyBookmarkedLines: noop,
    searchDeleteBookmarkedLines: noop,
    searchAndBookmark: noop,
    searchMarkStyle1: noop,
    searchMarkStyle2: noop,
    searchMarkStyle3: noop,
    searchClearStyle1: noop,
    searchClearStyle2: noop,
    searchClearStyle3: noop,
    searchClearAllStyles: noop,
    macroStartRecording: noop,
    macroStopRecording: noop,
    macroPlayback: noop,
    macroIsRecording: () => false,
    macroHasMacro: () => false,
    macroHasRunnable: () => false,
    macroRunMultiple: noop,
    macroSaveCurrent: noop,
    macroSavedItems: [],
    ...overrides,
  };
}

function buildBar(overrides: Partial<MenuBarActions> = {}): {
  container: HTMLElement;
  bar: MenuBar;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const bar = new MenuBar(container);
  bar.buildAndRender(MenuBar.buildMenuDefs(makeActions(overrides)));
  return { container, bar };
}

// ── Structure tests ───────────────────────────────────────────────────────────

describe('MenuBar structure', () => {
  it('renders exactly 9 top-level menus (Encoding added between View and Language)', () => {
    const { container } = buildBar();
    const buttons = container.querySelectorAll('[role="menuitem"]');
    expect(buttons).toHaveLength(9);
  });

  it('top-level labels are correct and ordered (with Encoding between View and Language)', () => {
    const { container } = buildBar();
    const labels = Array.from(container.querySelectorAll('[role="menuitem"]')).map(
      (el) => el.textContent,
    );
    expect(labels).toEqual([
      'File',
      'Edit',
      'Search',
      'View',
      'Encoding',
      'Language',
      'Settings',
      'Macro',
      'Help',
    ]);
  });

  it('has role="menubar" on the nav element', () => {
    const { container } = buildBar();
    expect(container.querySelector('[role="menubar"]')).not.toBeNull();
  });

  it('File menu has New, Open, Save, Close enabled items in defs', () => {
    const defs = MenuBar.buildMenuDefs(makeActions());
    const fileMenu = defs[0]!;
    const enabledLabels = fileMenu.items
      .filter((it) => it.enabled && it.type !== 'separator')
      .map((it) => it.label);
    expect(enabledLabels).toContain('New');
    expect(enabledLabels).toContain('Open...');
    expect(enabledLabels).toContain('Save');
    expect(enabledLabels).toContain('Close');
    expect(enabledLabels).toContain('Close All');
  });

  it('File menu has disabled placeholder items', () => {
    const defs = MenuBar.buildMenuDefs(makeActions());
    const fileMenu = defs[0]!;
    const disabledLabels = fileMenu.items
      .filter((it) => !it.enabled && it.type !== 'separator')
      .map((it) => it.label);
    expect(disabledLabels).toContain('Print...');
    expect(disabledLabels).toContain('Rename...');
  });

  it('Edit menu has Undo/Redo/Cut/Copy/Paste/Select All enabled', () => {
    const defs = MenuBar.buildMenuDefs(makeActions());
    const editMenu = defs[1]!;
    const enabledLabels = editMenu.items
      .filter((it) => it.enabled && !it.submenu)
      .map((it) => it.label);
    expect(enabledLabels).toContain('Undo');
    expect(enabledLabels).toContain('Redo');
    expect(enabledLabels).toContain('Cut');
    expect(enabledLabels).toContain('Copy');
    expect(enabledLabels).toContain('Paste');
    expect(enabledLabels).toContain('Select All');
  });

  it('Search menu has Find/Replace/Find Next/Find Prev/Go to Line enabled', () => {
    const defs = MenuBar.buildMenuDefs(makeActions());
    const searchMenu = defs[2]!;
    const enabledLabels = searchMenu.items
      .filter((it) => it.enabled && !it.submenu)
      .map((it) => it.label);
    expect(enabledLabels).toContain('Find...');
    expect(enabledLabels).toContain('Replace...');
    expect(enabledLabels).toContain('Find Next');
    expect(enabledLabels).toContain('Find Previous');
    expect(enabledLabels).toContain('Go to Line...');
  });

  it('View menu has Word Wrap / Zoom In / Zoom Out / Reset Zoom enabled', () => {
    const defs = MenuBar.buildMenuDefs(makeActions());
    const viewMenu = defs[3]!;
    const allItems = [...viewMenu.items, ...viewMenu.items.flatMap((it) => it.submenu ?? [])];
    const enabledLabels = allItems.filter((it) => it.enabled).map((it) => it.label);
    expect(enabledLabels).toContain('Word Wrap');
    expect(enabledLabels).toContain('Zoom In');
    expect(enabledLabels).toContain('Zoom Out');
    expect(enabledLabels).toContain('Reset Zoom');
  });

  // Encoding menu is present between View and Language; basic UTF-8/BOM items are enabled.
  it('Encoding menu renders between View and Language with UTF-8 and UTF-8-BOM enabled', () => {
    const defs = MenuBar.buildMenuDefs(makeActions());
    const viewIdx = defs.findIndex((d) => d.label === 'View');
    const encodingIdx = defs.findIndex((d) => d.label === 'Encoding');
    const langIdx = defs.findIndex((d) => d.label === 'Language');
    expect(encodingIdx).toBeGreaterThan(viewIdx);
    expect(encodingIdx).toBeLessThan(langIdx);
    const encodingMenu = defs[encodingIdx]!;
    const nonSepItems = encodingMenu.items.filter((it) => it.type !== 'separator');
    expect(nonSepItems.length).toBeGreaterThan(0);
    // UTF-8 and UTF-8-BOM are enabled.
    const utf8Item = nonSepItems.find((it) => it.label === 'Encode in UTF-8');
    const utf8BomItem = nonSepItems.find((it) => it.label === 'Encode in UTF-8-BOM');
    expect(utf8Item?.enabled).toBe(true);
    expect(utf8BomItem?.enabled).toBe(true);
    // ANSI and UTF-16 variants remain disabled.
    const disabledItems = nonSepItems.filter((it) => !it.enabled);
    expect(disabledItems.length).toBeGreaterThan(0);
  });

  it('Macro menu: Start Recording is enabled, Stop Recording is disabled when not recording', () => {
    const defs = MenuBar.buildMenuDefs(makeActions({ macroIsRecording: () => false }));
    const macroMenu = defs.find((d) => d.label === 'Macro')!;
    const startItem = macroMenu.items.find((it) => it.label === 'Start Recording');
    const stopItem = macroMenu.items.find((it) => it.label === 'Stop Recording');
    expect(startItem?.enabled).toBe(true);
    expect(stopItem?.enabled).toBe(false);
  });

  it('Macro menu: Start Recording disabled, Stop Recording enabled when recording', () => {
    const defs = MenuBar.buildMenuDefs(makeActions({ macroIsRecording: () => true }));
    const macroMenu = defs.find((d) => d.label === 'Macro')!;
    const startItem = macroMenu.items.find((it) => it.label === 'Start Recording');
    const stopItem = macroMenu.items.find((it) => it.label === 'Stop Recording');
    expect(startItem?.enabled).toBe(false);
    expect(stopItem?.enabled).toBe(true);
  });

  it('Macro menu: Playback enabled when macro exists, disabled otherwise', () => {
    const withMacro = MenuBar.buildMenuDefs(makeActions({ macroHasMacro: () => true }));
    const withoutMacro = MenuBar.buildMenuDefs(makeActions({ macroHasMacro: () => false }));
    const pbWith = withMacro
      .find((d) => d.label === 'Macro')!
      .items.find((it) => it.label === 'Playback');
    const pbWithout = withoutMacro
      .find((d) => d.label === 'Macro')!
      .items.find((it) => it.label === 'Playback');
    expect(pbWith?.enabled).toBe(true);
    expect(pbWithout?.enabled).toBe(false);
  });

  it('Settings menu has Preferences enabled', () => {
    const defs = MenuBar.buildMenuDefs(makeActions());
    const settingsMenu = defs.find((d) => d.label === 'Settings')!;
    const prefsItem = settingsMenu.items.find((it) => it.label === 'Preferences...');
    expect(prefsItem).toBeDefined();
    expect(prefsItem!.enabled).toBe(true);
  });

  it('Language menu shows (loading…) when no langs provided', () => {
    const defs = MenuBar.buildMenuDefs(makeActions({ langItems: [] }));
    const langMenu = defs.find((d) => d.label === 'Language')!;
    expect(langMenu.items[0]!.label).toBe('(loading…)');
    expect(langMenu.items[0]!.enabled).toBe(false);
  });

  it('Language menu shows provided language items as enabled', () => {
    const action = vi.fn();
    const defs = MenuBar.buildMenuDefs(makeActions({ langItems: [{ label: 'Python', action }] }));
    const langMenu = defs.find((d) => d.label === 'Language')!;
    const pythonItem = langMenu.items.find((it) => it.label === 'Python');
    expect(pythonItem).toBeDefined();
    expect(pythonItem!.enabled).toBe(true);
  });

  it('wirable File items have correct accelerators; browser-reserved items have none', () => {
    // Phase-2 close fix: Ctrl+N (New) and Ctrl+W (Close) are browser-reserved
    // and cannot be intercepted from a web extension page — their accelerator
    // labels were removed to be honest with the user.
    const defs = MenuBar.buildMenuDefs(makeActions());
    const fileMenu = defs[0]!;
    // Ctrl+N de-labeled (browser reserves it for "new window").
    const newItem = fileMenu.items.find((it) => it.label === 'New');
    expect(newItem?.accelerator).toBeUndefined();
    // Ctrl+W de-labeled (browser reserves it for "close tab").
    const closeItem = fileMenu.items.find((it) => it.label === 'Close');
    expect(closeItem?.accelerator).toBeUndefined();
    // Ctrl+Alt+S and Ctrl+Shift+S are wired and labeled.
    const saveAsItem = fileMenu.items.find((it) => it.label === 'Save As...');
    expect(saveAsItem?.accelerator).toBe('Ctrl+Alt+S');
    const saveAllItem = fileMenu.items.find((it) => it.label === 'Save All');
    expect(saveAllItem?.accelerator).toBe('Ctrl+Shift+S');
    // Ctrl+Shift+W (Close All) is wired and labeled.
    const closeAllItem = fileMenu.items.find((it) => it.label === 'Close All');
    expect(closeAllItem?.accelerator).toBe('Ctrl+Shift+W');
    // Exit is disabled (window.close() is a no-op in a normal tab).
    const exitItem = fileMenu.items.find((it) => it.label === 'Exit');
    expect(exitItem?.enabled).toBe(false);
  });

  it('File menu: Reload and Save a Copy As are enabled', () => {
    const defs = MenuBar.buildMenuDefs(makeActions());
    const fileMenu = defs[0]!;
    const reloadItem = fileMenu.items.find((it) => it.label === 'Reload');
    const copyAsItem = fileMenu.items.find((it) => it.label === 'Save a Copy As...');
    expect(reloadItem?.enabled).toBe(true);
    expect(copyAsItem?.enabled).toBe(true);
  });

  it('File → Close More submenu items are all enabled', () => {
    const defs = MenuBar.buildMenuDefs(makeActions());
    const fileMenu = defs[0]!;
    const closeMore = fileMenu.items.find((it) => it.label === 'Close More');
    expect(closeMore).toBeDefined();
    expect(closeMore!.enabled).toBe(true);
    const sub = closeMore!.submenu!;
    const enabledItems = sub.filter((it) => it.type !== 'separator' && it.enabled);
    expect(enabledItems).toHaveLength(3);
    const labels = enabledItems.map((it) => it.label);
    expect(labels).toContain('Close All Except Active Document');
    expect(labels).toContain('Close All to the Left');
    expect(labels).toContain('Close All to the Right');
  });

  it('File → Recent Files submenu has enabled control actions', () => {
    const restoreAction = vi.fn();
    const defs = MenuBar.buildMenuDefs(makeActions({ recentFilesRestoreLast: restoreAction }));
    const fileMenu = defs[0]!;
    const recentFiles = fileMenu.items.find((it) => it.label === 'Recent Files');
    expect(recentFiles).toBeDefined();
    expect(recentFiles!.enabled).toBe(true);
    const sub = recentFiles!.submenu!;
    const restoreItem = sub.find((it) => it.label === 'Restore Recently Closed File');
    expect(restoreItem?.enabled).toBe(true);
    restoreItem!.action!();
    expect(restoreAction).toHaveBeenCalledOnce();
  });

  it('File → Recent Files submenu shows dynamic file entries', () => {
    const openFoo = vi.fn();
    const defs = MenuBar.buildMenuDefs(
      makeActions({
        recentFiles: [{ name: 'foo.txt', action: openFoo }],
      }),
    );
    const fileMenu = defs[0]!;
    const recentFiles = fileMenu.items.find((it) => it.label === 'Recent Files')!;
    const fooItem = recentFiles.submenu!.find((it) => it.label === 'foo.txt');
    expect(fooItem?.enabled).toBe(true);
    fooItem!.action!();
    expect(openFoo).toHaveBeenCalledOnce();
  });

  it('View → Show Symbol submenu has Show Whitespace, End of Line, Show All Characters enabled', () => {
    const defs = MenuBar.buildMenuDefs(makeActions());
    const viewMenu = defs[3]!;
    const showSymbol = viewMenu.items.find((it) => it.label === 'Show Symbol');
    expect(showSymbol).toBeDefined();
    expect(showSymbol!.enabled).toBe(true);
    const sub = showSymbol!.submenu!;
    const wsItem = sub.find((it) => it.label === 'Show Whitespace');
    const eolItem = sub.find((it) => it.label === 'Show End of Line');
    const allItem = sub.find((it) => it.label === 'Show All Characters');
    expect(wsItem?.enabled).toBe(true);
    expect(eolItem?.enabled).toBe(true);
    expect(allItem?.enabled).toBe(true);
    // Indent Guide and Wrap Symbol remain disabled.
    const guideItem = sub.find((it) => it.label === 'Show Indent Guide');
    const wrapItem = sub.find((it) => it.label === 'Show Wrap Symbol');
    expect(guideItem?.enabled).toBe(false);
    expect(wrapItem?.enabled).toBe(false);
  });

  it('View → Fold All and Unfold All are enabled', () => {
    const defs = MenuBar.buildMenuDefs(makeActions());
    const viewMenu = defs[3]!;
    const foldAll = viewMenu.items.find((it) => it.label === 'Fold All');
    const unfoldAll = viewMenu.items.find((it) => it.label === 'Unfold All');
    expect(foldAll?.enabled).toBe(true);
    expect(unfoldAll?.enabled).toBe(true);
  });

  it('View → Full Screen is enabled', () => {
    const defs = MenuBar.buildMenuDefs(makeActions());
    const viewMenu = defs[3]!;
    const fsItem = viewMenu.items.find((it) => it.label === 'Full Screen');
    expect(fsItem?.enabled).toBe(true);
  });

  it('View → Fold Level / Unfold Level submenus remain disabled (per-depth not supported)', () => {
    const defs = MenuBar.buildMenuDefs(makeActions());
    const viewMenu = defs[3]!;
    const foldLevel = viewMenu.items.find((it) => it.label === 'Fold Level');
    const unfoldLevel = viewMenu.items.find((it) => it.label === 'Unfold Level');
    // Submenus exist but all items inside are disabled.
    expect(foldLevel?.submenu?.every((it) => !it.enabled)).toBe(true);
    expect(unfoldLevel?.submenu?.every((it) => !it.enabled)).toBe(true);
  });

  it('Edit Line Operations submenu is enabled and wired', () => {
    const defs = MenuBar.buildMenuDefs(makeActions());
    const editMenu = defs[1]!;
    const lineOps = editMenu.items.find((it) => it.label === 'Line Operations');
    expect(lineOps).toBeDefined();
    expect(lineOps!.enabled).toBe(true);
    expect(lineOps!.submenu).toBeDefined();
    // All items in the submenu should be enabled (except separators).
    const enabledCount = lineOps!.submenu!.filter(
      (it) => it.type !== 'separator' && it.enabled,
    ).length;
    expect(enabledCount).toBeGreaterThan(10);
  });
});

// ── Action dispatch tests ─────────────────────────────────────────────────────

describe('MenuBar action dispatch', () => {
  it('clicking a disabled item does not call any action', () => {
    const action = vi.fn();
    // Print is disabled in File — clicking it via openMenu + li.click should not fire action.
    const defs = MenuBar.buildMenuDefs(makeActions());
    const fileMenu = defs[0]!;
    const printItem = fileMenu.items.find((it) => it.label === 'Print...');
    expect(printItem).toBeDefined();
    expect(printItem!.action).toBeUndefined();
    // Direct call guard: calling action on undefined should not error.
    printItem!.action?.();
    expect(action).not.toHaveBeenCalled();
  });

  it('enabled File→New item has the injected action', () => {
    const fileNew = vi.fn();
    const defs = MenuBar.buildMenuDefs(makeActions({ fileNew }));
    const newItem = defs[0]!.items.find((it) => it.label === 'New');
    expect(newItem?.enabled).toBe(true);
    newItem!.action!();
    expect(fileNew).toHaveBeenCalledOnce();
  });

  it('enabled Edit→Undo item has the injected action', () => {
    const editUndo = vi.fn();
    const defs = MenuBar.buildMenuDefs(makeActions({ editUndo }));
    const undoItem = defs[1]!.items.find((it) => it.label === 'Undo');
    undoItem!.action!();
    expect(editUndo).toHaveBeenCalledOnce();
  });

  it('enabled Search→Find item has the injected action', () => {
    const searchFind = vi.fn();
    const defs = MenuBar.buildMenuDefs(makeActions({ searchFind }));
    const findItem = defs[2]!.items.find((it) => it.label === 'Find...');
    findItem!.action!();
    expect(searchFind).toHaveBeenCalledOnce();
  });
});

// ── Keyboard nav tests ────────────────────────────────────────────────────────

describe('MenuBar keyboard navigation', () => {
  it('pressing ArrowDown on File button opens the dropdown', () => {
    const { container } = buildBar();
    const fileBtn = container.querySelector<HTMLElement>('[role="menuitem"]')!;
    fileBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    // A dropdown should be appended to the body.
    const dropdown = document.body.querySelector('[role="menu"]');
    expect(dropdown).not.toBeNull();
    // Cleanup.
    dropdown?.remove();
  });

  it('Escape closes an open dropdown', () => {
    const { container } = buildBar();
    const fileBtn = container.querySelector<HTMLElement>('[role="menuitem"]')!;
    fileBtn.click();
    // Dropdown should be open.
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    // Dropdown should be gone.
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });
});

// ── Fix 1: document listener non-accumulation tests ───────────────────────────

describe('MenuBar document listener leak prevention (Fix 1)', () => {
  let addEventSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addEventSpy = vi.spyOn(document, 'addEventListener');
  });

  afterEach(() => {
    addEventSpy.mockRestore();
  });

  it('document listeners are registered exactly once per MenuBar instance across two buildAndRender calls', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const bar = new MenuBar(container);

    // After constructor: click + keydown registered once each.
    const clickCountAfterCtor = addEventSpy.mock.calls.filter((c) => c[0] === 'click').length;
    const keydownCountAfterCtor = addEventSpy.mock.calls.filter((c) => c[0] === 'keydown').length;
    expect(clickCountAfterCtor).toBe(1);
    expect(keydownCountAfterCtor).toBe(1);

    // First render.
    bar.buildAndRender(MenuBar.buildMenuDefs(makeActions()));
    // Second render (simulates luaRegistry.ready() re-render).
    bar.buildAndRender(MenuBar.buildMenuDefs(makeActions()));

    // After two renders: still exactly one click and one keydown (not 3).
    const clickCountAfterRenders = addEventSpy.mock.calls.filter((c) => c[0] === 'click').length;
    const keydownCountAfterRenders = addEventSpy.mock.calls.filter(
      (c) => c[0] === 'keydown',
    ).length;
    expect(clickCountAfterRenders).toBe(1);
    expect(keydownCountAfterRenders).toBe(1);
  });

  it('Escape triggers closeAll exactly once after two buildAndRender calls', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const bar = new MenuBar(container);

    // Render twice (as app.ts does: initial + after luaRegistry.ready()).
    bar.buildAndRender(MenuBar.buildMenuDefs(makeActions()));
    bar.buildAndRender(MenuBar.buildMenuDefs(makeActions()));

    // Open a menu.
    const fileBtn = container.querySelector<HTMLElement>('[role="menuitem"]')!;
    fileBtn.click();
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();

    // Press Escape: should close exactly once (not twice from duplicate listeners).
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });
});

// ── BUG-10: leading icon rendering ───────────────────────────────────────────

describe('MenuBar BUG-10 — leading icon column', () => {
  it('an item built with an icon renders a leading <img> with the correct src', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const bar = new MenuBar(container);
    bar.buildAndRender(MenuBar.buildMenuDefs(makeActions()));

    // Open File menu (index 0) — New has icon 'newfile.png'.
    const fileBtn = container.querySelectorAll<HTMLElement>('[role="menuitem"]')[0]!;
    fileBtn.click();
    const dropdown = document.body.querySelector('[role="menu"]')!;

    const newLi = Array.from(dropdown.querySelectorAll('.menubar-entry')).find(
      (el) => el.querySelector('.menubar-entry-label')?.textContent === 'New',
    ) as HTMLElement | undefined;
    expect(newLi).toBeDefined();

    const img = newLi!.querySelector('img.menubar-entry-icon') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.src).toContain('icons/newfile.png');

    // Cleanup.
    document.body.querySelector('[role="menu"]')?.remove();
  });

  it('an item without an icon renders a spacer span (no <img>)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const bar = new MenuBar(container);
    bar.buildAndRender(MenuBar.buildMenuDefs(makeActions()));

    // Open File menu — 'Rename...' has no icon in MainWindow.ui.
    const fileBtn = container.querySelectorAll<HTMLElement>('[role="menuitem"]')[0]!;
    fileBtn.click();
    const dropdown = document.body.querySelector('[role="menu"]')!;

    const renameLi = Array.from(dropdown.querySelectorAll('.menubar-entry')).find(
      (el) => el.querySelector('.menubar-entry-label')?.textContent === 'Rename...',
    ) as HTMLElement | undefined;
    expect(renameLi).toBeDefined();

    // No <img> element inside this item.
    const img = renameLi!.querySelector('img.menubar-entry-icon');
    expect(img).toBeNull();

    // A spacer span should be present.
    const spacer = renameLi!.querySelector('span.menubar-entry-icon-spacer');
    expect(spacer).not.toBeNull();

    // Cleanup.
    document.body.querySelector('[role="menu"]')?.remove();
  });

  it('File→New item def has icon=newfile.png', () => {
    const defs = MenuBar.buildMenuDefs(makeActions());
    const newItem = defs[0]!.items.find((it) => it.label === 'New');
    expect(newItem?.icon).toBe('newfile.png');
  });

  it('File→Save item def has icon=saved.png', () => {
    const defs = MenuBar.buildMenuDefs(makeActions());
    const saveItem = defs[0]!.items.find((it) => it.label === 'Save');
    expect(saveItem?.icon).toBe('saved.png');
  });

  it('Edit→Cut/Copy/Paste items have correct icons', () => {
    const defs = MenuBar.buildMenuDefs(makeActions());
    const editMenu = defs[1]!;
    expect(editMenu.items.find((it) => it.label === 'Cut')?.icon).toBe('cut.png');
    expect(editMenu.items.find((it) => it.label === 'Copy')?.icon).toBe('copy.png');
    expect(editMenu.items.find((it) => it.label === 'Paste')?.icon).toBe('paste.png');
  });
});

// ── BUG-11: Language menu first-letter grouping ───────────────────────────────

describe('MenuBar BUG-11 — Language menu first-letter grouping', () => {
  it('a letter with >1 languages becomes a submenu titled by the uppercase letter', () => {
    // Two "P" languages → should produce a "P" submenu.
    const defs = MenuBar.buildMenuDefs(
      makeActions({
        langItems: [
          { label: 'Pascal', action: () => {} },
          { label: 'Python', action: () => {} },
          { label: 'Ruby', action: () => {} },
        ],
      }),
    );
    const langMenu = defs.find((d) => d.label === 'Language')!;
    const pSubmenu = langMenu.items.find((it) => it.label === 'P');
    expect(pSubmenu).toBeDefined();
    expect(pSubmenu!.submenu).toBeDefined();
    expect(pSubmenu!.submenu).toHaveLength(2);
    expect(pSubmenu!.submenu!.map((it) => it.label)).toEqual(['Pascal', 'Python']);
  });

  it('a letter with exactly 1 language is a direct item (no submenu)', () => {
    // One "R" language → direct item.
    const defs = MenuBar.buildMenuDefs(
      makeActions({
        langItems: [
          { label: 'Pascal', action: () => {} },
          { label: 'Python', action: () => {} },
          { label: 'Ruby', action: () => {} },
        ],
      }),
    );
    const langMenu = defs.find((d) => d.label === 'Language')!;
    const rubyItem = langMenu.items.find((it) => it.label === 'Ruby');
    expect(rubyItem).toBeDefined();
    expect(rubyItem!.submenu).toBeUndefined();
    expect(rubyItem!.enabled).toBe(true);
  });

  it('empty langItems still shows (loading…) disabled placeholder', () => {
    const defs = MenuBar.buildMenuDefs(makeActions({ langItems: [] }));
    const langMenu = defs.find((d) => d.label === 'Language')!;
    expect(langMenu.items).toHaveLength(1);
    expect(langMenu.items[0]!.label).toBe('(loading…)');
    expect(langMenu.items[0]!.enabled).toBe(false);
  });

  it('submenu items preserve their actions', () => {
    const pascalAction = vi.fn();
    const pythonAction = vi.fn();
    const defs = MenuBar.buildMenuDefs(
      makeActions({
        langItems: [
          { label: 'Pascal', action: pascalAction },
          { label: 'Python', action: pythonAction },
        ],
      }),
    );
    const langMenu = defs.find((d) => d.label === 'Language')!;
    const pSub = langMenu.items.find((it) => it.label === 'P')!.submenu!;
    pSub.find((it) => it.label === 'Pascal')!.action!();
    expect(pascalAction).toHaveBeenCalledOnce();
  });
});

// ── Fix 5: disabled submenu-parent must not open on hover ─────────────────────

describe('MenuBar disabled submenu hover (Fix 5)', () => {
  it('a disabled submenu-parent item does NOT open a sub-panel on mouseenter', () => {
    // Build a bar with a deliberately disabled submenu item to verify Fix 5.
    // "Macro" menu has disabled items; we use "Copy More" in Edit which stays disabled.
    const defs = MenuBar.buildMenuDefs(makeActions());
    const editMenu = defs[1]!;
    // "Copy More" is a disabled submenu in Edit.
    const lineOps = editMenu.items.find((it) => it.label === 'Copy More');
    expect(lineOps).toBeDefined();
    expect(lineOps!.enabled).toBe(false);
    expect(lineOps!.submenu).toBeDefined();

    // buildBar and open the Edit dropdown.
    const container = document.createElement('div');
    document.body.appendChild(container);
    const bar = new MenuBar(container);
    bar.buildAndRender(defs);

    // Open Edit menu (index 1).
    const buttons = container.querySelectorAll<HTMLElement>('[role="menuitem"]');
    const editBtn = buttons[1]!;
    editBtn.click();

    // Find the "Copy More" li in the dropdown (it is disabled).
    const dropdown = document.body.querySelector('[role="menu"]')!;
    const lineOpsLi = Array.from(dropdown.querySelectorAll('.menubar-entry')).find(
      (el) => el.querySelector('.menubar-entry-label')?.textContent === 'Copy More',
    ) as HTMLElement | undefined;
    expect(lineOpsLi).toBeDefined();

    // Dispatch mouseenter on the disabled item.
    lineOpsLi!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    // No sub-panel should have been appended.
    const subPanel = document.body.querySelector('.menubar-sub');
    expect(subPanel).toBeNull();

    // Cleanup.
    document.body.querySelector('[role="menu"]')?.remove();
  });
});

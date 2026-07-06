// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, vi } from 'vitest';
import { Toolbar } from './toolbar';
import type { ToolbarState } from './toolbar';
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

function makeState(overrides: Partial<ToolbarState> = {}): ToolbarState {
  return {
    wordWrapOn: () => false,
    showAllCharsOn: () => false,
    macroIsRecording: () => false,
    macroHasMacro: () => false,
    macroHasRunnable: () => false,
    ...overrides,
  };
}

function buildToolbar(
  actionOverrides: Partial<MenuBarActions> = {},
  stateOverrides: Partial<ToolbarState> = {},
): { container: HTMLElement; toolbar: Toolbar } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const toolbar = new Toolbar(container);
  toolbar.render(makeActions(actionOverrides), makeState(stateOverrides));
  return { container, toolbar };
}

// ── Structure tests ───────────────────────────────────────────────────────────

describe('Toolbar structure', () => {
  it('has role="toolbar" on the inner container', () => {
    const { container } = buildToolbar();
    expect(container.querySelector('[role="toolbar"]')).not.toBeNull();
  });

  it('renders all 22 expected buttons', () => {
    // 6 file + 3 edit + 2 undo/redo + 2 search + 2 zoom + 3 view + 4 macro = 22
    const { container } = buildToolbar();
    const buttons = container.querySelectorAll('.toolbar-btn');
    expect(buttons.length).toBe(22);
  });

  it('renders buttons in correct order — New is first, Save Macro is last', () => {
    const { container } = buildToolbar();
    const buttons = Array.from(container.querySelectorAll('.toolbar-btn'));
    expect(buttons[0]?.id).toBe('tb-new');
    expect(buttons[buttons.length - 1]?.id).toBe('tb-macro-save');
  });

  it('renders separators between groups', () => {
    const { container } = buildToolbar();
    const seps = container.querySelectorAll('.toolbar-sep');
    // 6 separators: after close-all, after paste, after redo, after replace, after zoom-out, after indent-guide
    expect(seps.length).toBe(6);
  });

  it('all non-disabled buttons have aria-label', () => {
    const { container } = buildToolbar();
    const buttons = container.querySelectorAll('.toolbar-btn:not(.toolbar-btn--disabled)');
    buttons.forEach((btn) => {
      expect(btn.getAttribute('aria-label')).toBeTruthy();
    });
  });

  it('all buttons have a title tooltip', () => {
    const { container } = buildToolbar();
    const buttons = container.querySelectorAll('.toolbar-btn');
    buttons.forEach((btn) => {
      expect((btn as HTMLButtonElement).title).toBeTruthy();
    });
  });

  it('buttons contain <img> icons (not inline SVG)', () => {
    const { container } = buildToolbar();
    const buttons = container.querySelectorAll('.toolbar-btn');
    buttons.forEach((btn) => {
      // Each button must have an <img>, not an <svg>
      expect(btn.querySelector('img')).not.toBeNull();
      expect(btn.querySelector('svg')).toBeNull();
    });
  });

  it('img icons have correct src ending per button', () => {
    const { container } = buildToolbar();
    const cases: Array<[string, string]> = [
      ['#tb-new', 'newfile.png'],
      ['#tb-open', 'openFile.png'],
      ['#tb-save', 'saved.png'],
      ['#tb-save-all', 'saveAll.png'],
      ['#tb-close', 'closeFile.png'],
      ['#tb-close-all', 'closeAll.png'],
      ['#tb-cut', 'cut.png'],
      ['#tb-copy', 'copy.png'],
      ['#tb-paste', 'paste.png'],
      ['#tb-undo', 'undo.png'],
      ['#tb-redo', 'redo.png'],
      ['#tb-find', 'find.png'],
      ['#tb-replace', 'findReplace.png'],
      ['#tb-zoom-in', 'zoomIn.png'],
      ['#tb-zoom-out', 'zoomOut.png'],
      ['#tb-word-wrap', 'wrap.png'],
      ['#tb-show-all-chars', 'invisibleChar.png'],
      ['#tb-indent-guide', 'indentGuide.png'],
      ['#tb-macro-record', 'startRecord.png'], // idle state
      ['#tb-macro-playback', 'playRecord.png'],
      ['#tb-macro-run-multiple', 'playRecord_m.png'],
      ['#tb-macro-save', 'saveRecord.png'],
    ];
    for (const [selector, expectedFile] of cases) {
      const img = container.querySelector<HTMLImageElement>(`${selector} img`);
      expect(img, `${selector} should have an <img>`).not.toBeNull();
      expect(img!.src, `${selector} img.src`).toContain(expectedFile);
    }
  });

  it('Macro Record shows stopRecord.png when recording (pressed state)', () => {
    const { container } = buildToolbar({}, { macroIsRecording: () => true });
    const img = container.querySelector<HTMLImageElement>('#tb-macro-record img');
    expect(img).not.toBeNull();
    expect(img!.src).toContain('stopRecord.png');
  });

  it('Macro Record shows startRecord.png when not recording', () => {
    const { container } = buildToolbar({}, { macroIsRecording: () => false });
    const img = container.querySelector<HTMLImageElement>('#tb-macro-record img');
    expect(img).not.toBeNull();
    expect(img!.src).toContain('startRecord.png');
  });

  it('img icons have aria-hidden=true', () => {
    const { container } = buildToolbar();
    const imgs = container.querySelectorAll('.toolbar-btn img');
    imgs.forEach((img) => {
      expect(img.getAttribute('aria-hidden')).toBe('true');
    });
  });
});

// ── Disabled state tests ──────────────────────────────────────────────────────

describe('Toolbar disabled states', () => {
  it('Show Indent Guide is always disabled', () => {
    const { container } = buildToolbar();
    const btn = container.querySelector('#tb-indent-guide');
    expect(btn?.classList.contains('toolbar-btn--disabled')).toBe(true);
    expect(btn?.getAttribute('aria-disabled')).toBe('true');
  });

  it('Macro Playback is disabled when no macro', () => {
    const { container } = buildToolbar({}, { macroHasMacro: () => false });
    const btn = container.querySelector('#tb-macro-playback');
    expect(btn?.classList.contains('toolbar-btn--disabled')).toBe(true);
  });

  it('Macro Playback is enabled when macro exists', () => {
    const { container } = buildToolbar({}, { macroHasMacro: () => true });
    const btn = container.querySelector('#tb-macro-playback');
    expect(btn?.classList.contains('toolbar-btn--disabled')).toBe(false);
  });

  it('Run Macro Multiple is disabled when no runnable macro', () => {
    const { container } = buildToolbar({}, { macroHasRunnable: () => false });
    const btn = container.querySelector('#tb-macro-run-multiple');
    expect(btn?.classList.contains('toolbar-btn--disabled')).toBe(true);
  });

  it('Run Macro Multiple is enabled when runnable macro exists', () => {
    const { container } = buildToolbar({}, { macroHasRunnable: () => true });
    const btn = container.querySelector('#tb-macro-run-multiple');
    expect(btn?.classList.contains('toolbar-btn--disabled')).toBe(false);
  });

  it('Save Macro is disabled when no macro', () => {
    const { container } = buildToolbar({}, { macroHasMacro: () => false });
    const btn = container.querySelector('#tb-macro-save');
    expect(btn?.classList.contains('toolbar-btn--disabled')).toBe(true);
  });

  it('Save Macro is enabled when macro exists', () => {
    const { container } = buildToolbar({}, { macroHasMacro: () => true });
    const btn = container.querySelector('#tb-macro-save');
    expect(btn?.classList.contains('toolbar-btn--disabled')).toBe(false);
  });

  it('disabled buttons do not fire callbacks on click', () => {
    const macroPlayback = vi.fn();
    const { container } = buildToolbar({ macroPlayback }, { macroHasMacro: () => false });
    const btn = container.querySelector<HTMLButtonElement>('#tb-macro-playback');
    btn?.click();
    expect(macroPlayback).not.toHaveBeenCalled();
  });
});

// ── Toggle (pressed) state tests ──────────────────────────────────────────────

describe('Toolbar toggle pressed states', () => {
  it('Word Wrap button shows pressed when wordWrapOn is true', () => {
    const { container } = buildToolbar({}, { wordWrapOn: () => true });
    const btn = container.querySelector('#tb-word-wrap');
    expect(btn?.classList.contains('toolbar-btn--pressed')).toBe(true);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('Word Wrap button shows not pressed when wordWrapOn is false', () => {
    const { container } = buildToolbar({}, { wordWrapOn: () => false });
    const btn = container.querySelector('#tb-word-wrap');
    expect(btn?.classList.contains('toolbar-btn--pressed')).toBe(false);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('Show All Chars button shows pressed when showAllCharsOn is true', () => {
    const { container } = buildToolbar({}, { showAllCharsOn: () => true });
    const btn = container.querySelector('#tb-show-all-chars');
    expect(btn?.classList.contains('toolbar-btn--pressed')).toBe(true);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('Macro Record button shows pressed when macroIsRecording is true', () => {
    const { container } = buildToolbar({}, { macroIsRecording: () => true });
    const btn = container.querySelector('#tb-macro-record');
    expect(btn?.classList.contains('toolbar-btn--pressed')).toBe(true);
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('Macro Record button shows not pressed when not recording', () => {
    const { container } = buildToolbar({}, { macroIsRecording: () => false });
    const btn = container.querySelector('#tb-macro-record');
    expect(btn?.classList.contains('toolbar-btn--pressed')).toBe(false);
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });
});

// ── Action dispatch tests ─────────────────────────────────────────────────────

describe('Toolbar action dispatch', () => {
  it('clicking New calls fileNew', () => {
    const fileNew = vi.fn();
    const { container } = buildToolbar({ fileNew });
    container.querySelector<HTMLButtonElement>('#tb-new')?.click();
    expect(fileNew).toHaveBeenCalledOnce();
  });

  it('clicking Open calls fileOpen', () => {
    const fileOpen = vi.fn();
    const { container } = buildToolbar({ fileOpen });
    container.querySelector<HTMLButtonElement>('#tb-open')?.click();
    expect(fileOpen).toHaveBeenCalledOnce();
  });

  it('clicking Save calls fileSave', () => {
    const fileSave = vi.fn();
    const { container } = buildToolbar({ fileSave });
    container.querySelector<HTMLButtonElement>('#tb-save')?.click();
    expect(fileSave).toHaveBeenCalledOnce();
  });

  it('clicking Save All calls fileSaveAll', () => {
    const fileSaveAll = vi.fn();
    const { container } = buildToolbar({ fileSaveAll });
    container.querySelector<HTMLButtonElement>('#tb-save-all')?.click();
    expect(fileSaveAll).toHaveBeenCalledOnce();
  });

  it('clicking Close calls fileClose', () => {
    const fileClose = vi.fn();
    const { container } = buildToolbar({ fileClose });
    container.querySelector<HTMLButtonElement>('#tb-close')?.click();
    expect(fileClose).toHaveBeenCalledOnce();
  });

  it('clicking Close All calls fileCloseAll', () => {
    const fileCloseAll = vi.fn();
    const { container } = buildToolbar({ fileCloseAll });
    container.querySelector<HTMLButtonElement>('#tb-close-all')?.click();
    expect(fileCloseAll).toHaveBeenCalledOnce();
  });

  it('clicking Cut calls editCut', () => {
    const editCut = vi.fn();
    const { container } = buildToolbar({ editCut });
    container.querySelector<HTMLButtonElement>('#tb-cut')?.click();
    expect(editCut).toHaveBeenCalledOnce();
  });

  it('clicking Copy calls editCopy', () => {
    const editCopy = vi.fn();
    const { container } = buildToolbar({ editCopy });
    container.querySelector<HTMLButtonElement>('#tb-copy')?.click();
    expect(editCopy).toHaveBeenCalledOnce();
  });

  it('clicking Paste calls editPaste', () => {
    const editPaste = vi.fn();
    const { container } = buildToolbar({ editPaste });
    container.querySelector<HTMLButtonElement>('#tb-paste')?.click();
    expect(editPaste).toHaveBeenCalledOnce();
  });

  it('clicking Undo calls editUndo', () => {
    const editUndo = vi.fn();
    const { container } = buildToolbar({ editUndo });
    container.querySelector<HTMLButtonElement>('#tb-undo')?.click();
    expect(editUndo).toHaveBeenCalledOnce();
  });

  it('clicking Redo calls editRedo', () => {
    const editRedo = vi.fn();
    const { container } = buildToolbar({ editRedo });
    container.querySelector<HTMLButtonElement>('#tb-redo')?.click();
    expect(editRedo).toHaveBeenCalledOnce();
  });

  it('clicking Find calls searchFind', () => {
    const searchFind = vi.fn();
    const { container } = buildToolbar({ searchFind });
    container.querySelector<HTMLButtonElement>('#tb-find')?.click();
    expect(searchFind).toHaveBeenCalledOnce();
  });

  it('clicking Replace calls searchReplace', () => {
    const searchReplace = vi.fn();
    const { container } = buildToolbar({ searchReplace });
    container.querySelector<HTMLButtonElement>('#tb-replace')?.click();
    expect(searchReplace).toHaveBeenCalledOnce();
  });

  it('clicking Zoom In calls viewZoomIn', () => {
    const viewZoomIn = vi.fn();
    const { container } = buildToolbar({ viewZoomIn });
    container.querySelector<HTMLButtonElement>('#tb-zoom-in')?.click();
    expect(viewZoomIn).toHaveBeenCalledOnce();
  });

  it('clicking Zoom Out calls viewZoomOut', () => {
    const viewZoomOut = vi.fn();
    const { container } = buildToolbar({ viewZoomOut });
    container.querySelector<HTMLButtonElement>('#tb-zoom-out')?.click();
    expect(viewZoomOut).toHaveBeenCalledOnce();
  });

  it('clicking Word Wrap calls viewWordWrap', () => {
    const viewWordWrap = vi.fn();
    const { container } = buildToolbar({ viewWordWrap });
    container.querySelector<HTMLButtonElement>('#tb-word-wrap')?.click();
    expect(viewWordWrap).toHaveBeenCalledOnce();
  });

  it('clicking Show All Chars calls viewShowAllChars', () => {
    const viewShowAllChars = vi.fn();
    const { container } = buildToolbar({ viewShowAllChars });
    container.querySelector<HTMLButtonElement>('#tb-show-all-chars')?.click();
    expect(viewShowAllChars).toHaveBeenCalledOnce();
  });

  it('clicking Macro Record (not recording) calls macroStartRecording', () => {
    const macroStartRecording = vi.fn();
    const { container } = buildToolbar({ macroStartRecording }, { macroIsRecording: () => false });
    container.querySelector<HTMLButtonElement>('#tb-macro-record')?.click();
    expect(macroStartRecording).toHaveBeenCalledOnce();
  });

  it('clicking Macro Record (while recording) calls macroStopRecording', () => {
    const macroStopRecording = vi.fn();
    const { container } = buildToolbar({ macroStopRecording }, { macroIsRecording: () => true });
    container.querySelector<HTMLButtonElement>('#tb-macro-record')?.click();
    expect(macroStopRecording).toHaveBeenCalledOnce();
  });

  it('clicking Playback (when macro available) calls macroPlayback', () => {
    const macroPlayback = vi.fn();
    const { container } = buildToolbar({ macroPlayback }, { macroHasMacro: () => true });
    container.querySelector<HTMLButtonElement>('#tb-macro-playback')?.click();
    expect(macroPlayback).toHaveBeenCalledOnce();
  });

  it('clicking Run Multiple (when runnable) calls macroRunMultiple', () => {
    const macroRunMultiple = vi.fn();
    const { container } = buildToolbar({ macroRunMultiple }, { macroHasRunnable: () => true });
    container.querySelector<HTMLButtonElement>('#tb-macro-run-multiple')?.click();
    expect(macroRunMultiple).toHaveBeenCalledOnce();
  });

  it('clicking Save Macro (when macro available) calls macroSaveCurrent', () => {
    const macroSaveCurrent = vi.fn();
    const { container } = buildToolbar({ macroSaveCurrent }, { macroHasMacro: () => true });
    container.querySelector<HTMLButtonElement>('#tb-macro-save')?.click();
    expect(macroSaveCurrent).toHaveBeenCalledOnce();
  });
});

// ── Re-render tests ───────────────────────────────────────────────────────────

describe('Toolbar re-render', () => {
  it('updates pressed state when re-rendered with new state', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const toolbar = new Toolbar(container);
    const actions = makeActions();

    // First render: word wrap off
    toolbar.render(actions, makeState({ wordWrapOn: () => false }));
    expect(container.querySelector('#tb-word-wrap')?.getAttribute('aria-pressed')).toBe('false');

    // Re-render: word wrap on
    toolbar.render(actions, makeState({ wordWrapOn: () => true }));
    expect(container.querySelector('#tb-word-wrap')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('updates disabled state when macro becomes available on re-render', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const toolbar = new Toolbar(container);
    const actions = makeActions();

    // First render: no macro
    toolbar.render(actions, makeState({ macroHasMacro: () => false }));
    expect(
      container.querySelector('#tb-macro-playback')?.classList.contains('toolbar-btn--disabled'),
    ).toBe(true);

    // Re-render: macro available
    toolbar.render(actions, makeState({ macroHasMacro: () => true }));
    expect(
      container.querySelector('#tb-macro-playback')?.classList.contains('toolbar-btn--disabled'),
    ).toBe(false);
  });
});

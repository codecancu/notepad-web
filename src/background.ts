// SPDX-License-Identifier: GPL-3.0-or-later
//
// Clicking the toolbar icon opens the editor. If the editor tab opened by a
// previous click is still around, focus it (and bring its window to the front)
// instead of opening a duplicate — so repeated clicks re-use the existing tab.
//
// The tab id is remembered in chrome.storage.session (tab ids are per-session,
// so session storage is the right lifetime). No extra permission is needed: we
// already hold "storage", and chrome.tabs.get/update/create + chrome.windows
// do NOT require the sensitive "tabs" permission (reading a tab's URL would —
// which we deliberately avoid to keep the permission set minimal).
const EDITOR_URL = chrome.runtime.getURL('editor.html');
const TAB_KEY = 'editorTabId';

async function openOrFocusEditor(): Promise<void> {
  const stored = await chrome.storage.session.get(TAB_KEY);
  const tabId = stored[TAB_KEY] as number | undefined;

  if (typeof tabId === 'number') {
    try {
      const tab = await chrome.tabs.get(tabId);
      await chrome.tabs.update(tabId, { active: true });
      if (tab.windowId !== undefined) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
      return;
    } catch {
      // The remembered tab was closed — fall through and open a fresh one.
    }
  }

  const created = await chrome.tabs.create({ url: EDITOR_URL });
  if (created.id !== undefined) {
    await chrome.storage.session.set({ [TAB_KEY]: created.id });
  }
}

chrome.action.onClicked.addListener(() => {
  void openOrFocusEditor();
});

// ── "Copy this text to Notepad Web" page context menu ────────────────────────
// On any page, right-clicking a text selection offers this item. Clicking it
// stashes the selected text in chrome.storage.session and opens/focuses the
// editor, which then creates a new document tab seeded with that text.
// selectionText is provided by the click event itself — no content script or
// host permission needed; only the benign "contextMenus" permission.
const MENU_ID = 'copyToNotepadWeb';
const PENDING_KEY = 'pendingText';

chrome.runtime.onInstalled.addListener(() => {
  // removeAll first so re-install / update never errors on a duplicate id.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Copy this text to Notepad Web',
      contexts: ['selection'],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID) return;
  const text = info.selectionText ?? '';
  if (!text) return;
  void (async () => {
    await chrome.storage.session.set({ [PENDING_KEY]: text });
    await openOrFocusEditor();
  })();
});

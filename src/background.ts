// SPDX-License-Identifier: GPL-3.0-or-later
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
});

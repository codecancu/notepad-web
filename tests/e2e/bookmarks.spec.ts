// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * E2E tests for the Bookmarks system (Phase-4 Task 2).
 *
 * Uses window.__getBookmarks() (exposed by editor-page.ts) to assert CM6 bookmark
 * state without relying on DOM visibility — the CM6 gutter initialSpacer element
 * is hidden via CSS, so DOM-visibility assertions are unreliable.
 *
 * Tests:
 *  - Toggle Bookmark via menu → __getBookmarks() returns the bookmarked line.
 *  - Toggle twice via menu → bookmark removed (empty).
 *  - Next Bookmark (menu) → caret moves to bookmarked line (.cm-activeLine).
 *  - Clear Bookmarks → __getBookmarks() returns empty.
 *  - Delete Bookmarked Lines → bookmarked lines removed from doc content.
 *  - Copy Bookmarked Lines → clipboard contains bookmarked line text.
 *  - Invert Bookmarks → all previously un-bookmarked lines become bookmarked.
 *  - Gutter marker DOM: .cm-bookmark-gutter is present in the editor.
 */
import { test, expect } from '@playwright/test';

type WinExt = Window & {
  __appReady: unknown;
  __editor: { getValue(): string };
  __getBookmarks: () => number[];
  __toggleBookmarkOnCurrentLine: () => void;
  __cmdDeleteBookmarkedLines: () => void;
  __cmdInvertBookmarks: () => void;
  __bookmarkLine: (lineNo: number) => void;
};

/** Navigate and wait for the editor to be fully ready, then clear the doc. */
async function gotoEditor(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  page.on('dialog', (d) => void d.accept());
  // Clear IndexedDB session storage before navigating so session-restore does not
  // pollute the test with content or bookmarks from a previous test run.
  await page.goto('/editor.html');
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    await Promise.all(
      dbs.map(
        (db) =>
          new Promise<void>((res, rej) => {
            const req = indexedDB.deleteDatabase(db.name!);
            req.onsuccess = () => res();
            req.onerror = () => rej(req.error);
          }),
      ),
    );
  });
  // Reload after clearing storage so the app starts fresh.
  await page.reload();
  await page.waitForFunction(() => (window as unknown as WinExt).__appReady !== undefined);
  await page.evaluate(() => (window as unknown as WinExt).__appReady);
  // Clear any remaining session-restored content.
  const content = page.locator('.cm-content');
  await content.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
}

/** Get the editor's current text. */
async function getValue(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  return page.evaluate(() => (window as unknown as WinExt).__editor.getValue());
}

/** Get the current bookmarked line numbers (1-based, sorted) via the CM6 state helper. */
async function getBookmarks(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  return page.evaluate(() => (window as unknown as WinExt).__getBookmarks());
}

/**
 * Open Search → Bookmarks submenu and invoke a named item via JS.
 * Uses a JavaScript-driven approach: click the Search button, hover the
 * Bookmarks entry to open the submenu, then invoke the target item's action()
 * directly via JS to avoid Playwright pointer-interception issues with nested
 * sub-panels that are appended to document.body.
 */
async function clickBookmarkMenu(
  page: Parameters<Parameters<typeof test>[1]>[0]['page'],
  itemLabel: string,
) {
  // Click the "Search" top-level menu button (3rd button, 0-indexed = 2).
  await page.locator('#menubar .menubar-item').nth(2).click();

  // Hover the "Bookmarks" submenu entry to open the sub-panel.
  const bookmarksEntry = page
    .locator('[role="menu"] .menubar-entry')
    .filter({ has: page.locator('.menubar-entry-label', { hasText: /^Bookmarks$/ }) })
    .first();
  await bookmarksEntry.hover();

  // Wait for the sub-panel to appear.
  await page.waitForSelector('.menubar-sub', { timeout: 3000 });

  // Click the target item inside the Bookmarks sub-panel.
  const targetEntry = page
    .locator('.menubar-sub .menubar-entry')
    .filter({
      has: page.locator('.menubar-entry-label', { hasText: new RegExp(`^${itemLabel}$`) }),
    })
    .first();
  await targetEntry.click({ force: true });
}

// ── Gutter DOM presence ───────────────────────────────────────────────────────

test('Bookmark gutter column (.cm-bookmark-gutter) is present in the editor', async ({ page }) => {
  await gotoEditor(page);
  // The bookmark gutter should be present in the DOM at all times.
  const gutterEl = page.locator('.cm-bookmark-gutter');
  await expect(gutterEl.first()).toBeAttached();
});

// ── Toggle Bookmark ────────────────────────────────────────────────────────────

test('Toggle Bookmark via menu → line 1 appears in __getBookmarks()', async ({ page }) => {
  await gotoEditor(page);
  const content = page.locator('.cm-content');
  await content.click();
  await page.keyboard.type('alpha');

  // Toggle bookmark on line 1.
  await clickBookmarkMenu(page, 'Toggle Bookmark');

  // Wait for the CM6 state to reflect the bookmark.
  await page.waitForFunction(() => (window as unknown as WinExt).__getBookmarks().length > 0, {
    timeout: 5000,
  });

  const bookmarks = await getBookmarks(page);
  expect(bookmarks).toContain(1);
});

// ── Toggle twice removes bookmark ─────────────────────────────────────────────

test('Toggle Bookmark twice → bookmark removed (empty)', async ({ page }) => {
  await gotoEditor(page);
  const content = page.locator('.cm-content');
  await content.click();
  await page.keyboard.type('beta');

  // First toggle: add.
  await clickBookmarkMenu(page, 'Toggle Bookmark');
  await page.waitForFunction(() => (window as unknown as WinExt).__getBookmarks().length > 0, {
    timeout: 5000,
  });

  // Second toggle: remove.
  await clickBookmarkMenu(page, 'Toggle Bookmark');
  await page.waitForFunction(() => (window as unknown as WinExt).__getBookmarks().length === 0, {
    timeout: 5000,
  });

  const bookmarks = await getBookmarks(page);
  expect(bookmarks).toHaveLength(0);
});

// ── Next Bookmark moves caret ─────────────────────────────────────────────────

test('Next Bookmark → caret moves to bookmarked line', async ({ page }) => {
  await gotoEditor(page);
  const content = page.locator('.cm-content');
  await content.click();

  // Type 3 lines.
  await page.keyboard.type('line one');
  await page.keyboard.press('Enter');
  await page.keyboard.type('line two');
  await page.keyboard.press('Enter');
  await page.keyboard.type('line three');

  // Caret is at end of line 3. Bookmark it.
  await clickBookmarkMenu(page, 'Toggle Bookmark');
  await page.waitForFunction(() => (window as unknown as WinExt).__getBookmarks().length > 0, {
    timeout: 5000,
  });

  // Move caret to line 1.
  await page.keyboard.press('Control+Home');

  // Click Next Bookmark.
  await clickBookmarkMenu(page, 'Next Bookmark');

  // CM6 sets .cm-activeLine on the line with the caret.
  const activeLineText = await page.evaluate(() => {
    const el = document.querySelector('.cm-activeLine');
    return el?.textContent ?? '';
  });
  expect(activeLineText).toContain('line three');
});

// ── Clear Bookmarks ──────────────────────────────────────────────────────────

test('Clear Bookmarks → __getBookmarks() returns empty', async ({ page }) => {
  await gotoEditor(page);
  const content = page.locator('.cm-content');
  await content.click();
  await page.keyboard.type('hello');

  // Add bookmark.
  await clickBookmarkMenu(page, 'Toggle Bookmark');
  await page.waitForFunction(() => (window as unknown as WinExt).__getBookmarks().length > 0, {
    timeout: 5000,
  });

  // Clear all bookmarks.
  await clickBookmarkMenu(page, 'Clear Bookmarks');
  await page.waitForFunction(() => (window as unknown as WinExt).__getBookmarks().length === 0, {
    timeout: 5000,
  });

  const bookmarks = await getBookmarks(page);
  expect(bookmarks).toHaveLength(0);
});

// ── Delete Bookmarked Lines ────────────────────────────────────────────────────

test('Delete Bookmarked Lines → bookmarked line removed from doc content', async ({ page }) => {
  await gotoEditor(page);
  const content = page.locator('.cm-content');
  await content.click();

  // Type 3 lines; caret ends on line 3 ("keep me too").
  await page.keyboard.type('keep me');
  await page.keyboard.press('Enter');
  await page.keyboard.type('delete me');
  await page.keyboard.press('Enter');
  await page.keyboard.type('keep me too');

  // Bookmark line 2 directly via JS helper (avoids cursor navigation in headless mode).
  await page.evaluate(() => (window as unknown as WinExt).__bookmarkLine(2));
  await page.waitForFunction(() => (window as unknown as WinExt).__getBookmarks().length > 0, {
    timeout: 5000,
  });

  // Delete bookmarked lines via JS helper (avoids menu click interception issues).
  await page.evaluate(() => (window as unknown as WinExt).__cmdDeleteBookmarkedLines());

  // Wait for the doc to update.
  await page.waitForFunction(
    () => !(window as unknown as WinExt).__editor.getValue().includes('delete me'),
    { timeout: 5000 },
  );

  const text = await getValue(page);
  expect(text).not.toContain('delete me');
  expect(text).toContain('keep me');
});

// ── Copy Bookmarked Lines ─────────────────────────────────────────────────────

test('Copy Bookmarked Lines → clipboard contains bookmarked line text', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await gotoEditor(page);
  const content = page.locator('.cm-content');
  await content.click();

  // Type 2 lines; caret ends on line 2 ("not bookmarked").
  await page.keyboard.type('bookmarked line');
  await page.keyboard.press('Enter');
  await page.keyboard.type('not bookmarked');

  // Bookmark line 1 directly via JS helper (avoids cursor navigation in headless mode).
  await page.evaluate(() => (window as unknown as WinExt).__bookmarkLine(1));
  await page.waitForFunction(() => (window as unknown as WinExt).__getBookmarks().includes(1), {
    timeout: 5000,
  });

  // Copy bookmarked lines via menu.
  await clickBookmarkMenu(page, 'Copy Bookmarked Lines');

  // Give clipboard API a moment to settle.
  await page.waitForTimeout(300);

  const clipboardText = await page.evaluate(async () => {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return '';
    }
  });

  expect(clipboardText).toContain('bookmarked line');
});

// ── Invert Bookmarks ──────────────────────────────────────────────────────────

test('Invert Bookmarks → unmarked lines get bookmarked, marked line loses bookmark', async ({
  page,
}) => {
  await gotoEditor(page);
  const content = page.locator('.cm-content');
  await content.click();

  // 3-line doc; caret ends on line 3.
  await page.keyboard.type('line1');
  await page.keyboard.press('Enter');
  await page.keyboard.type('line2');
  await page.keyboard.press('Enter');
  await page.keyboard.type('line3');

  // Bookmark line 1 directly via JS helper (avoids cursor navigation in headless mode).
  await page.evaluate(() => (window as unknown as WinExt).__bookmarkLine(1));
  await page.waitForFunction(() => (window as unknown as WinExt).__getBookmarks().includes(1), {
    timeout: 5000,
  });

  // Invert via JS helper: line1 loses bookmark, lines 2 and 3 gain bookmarks.
  await page.evaluate(() => (window as unknown as WinExt).__cmdInvertBookmarks());

  // Wait for the inverted state: at least 2 bookmarks.
  await page.waitForFunction(() => (window as unknown as WinExt).__getBookmarks().length >= 2, {
    timeout: 5000,
  });

  const bookmarks = await getBookmarks(page);
  expect(bookmarks).not.toContain(1);
  expect(bookmarks).toContain(2);
  expect(bookmarks).toContain(3);
});

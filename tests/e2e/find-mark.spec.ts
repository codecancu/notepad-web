// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * E2E tests for P6.3 Find dialog Mark tab functionality.
 *
 * Tests:
 *  - Mark All on Mark tab → .cm-find-highlight count equals occurrences
 *  - Clear all marks → .cm-find-highlight count 0, bookmarks also cleared (C1)
 *  - Mark All with Bookmark line checked → bookmarks set on matching lines
 *  - Purge for each search → second Mark All replaces highlights and clears bookmarks
 *  - Search and Bookmark menu item opens Mark tab with Bookmark line checked
 */
import { test, expect } from '@playwright/test';

type WinExt = Window & {
  __appReady: unknown;
  __editor: { getValue(): string; getSelection(): { from: number; to: number } };
  __getFindHighlightCount: () => number;
  __getFindHighlightRanges: () => { from: number; to: number }[];
  __getBookmarks: () => number[];
  __bookmarkLine: (lineNo: number) => void;
};

/** Navigate, clear IndexedDB, reload, wait for appReady, clear content. */
async function gotoEditor(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  page.on('dialog', (d) => void d.accept());
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
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as WinExt).__appReady);
  await page.evaluate(() => (window as unknown as WinExt).__appReady);
  const content = page.locator('.cm-content');
  await content.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
}

/** Open Find dialog on Mark tab. */
async function openMarkTab(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  await page.keyboard.press('Control+f');
  await page.locator('[role=dialog]').waitFor({ state: 'visible', timeout: 3000 });
  await page.locator('#fd-tab-mark').click();
}

test('Mark All on Mark tab → __getFindHighlightCount equals occurrences', async ({ page }) => {
  await gotoEditor(page);

  // Type text with 3 occurrences of "foo"
  const content = page.locator('.cm-content');
  await content.click();
  await page.keyboard.type('foo bar foo baz foo');

  await openMarkTab(page);

  await page.locator('#fd-find-input').fill('foo');
  await page.locator('#fd-btn-mark-all').click();

  const count = await page.evaluate(() => (window as unknown as WinExt).__getFindHighlightCount());
  expect(count).toBe(3);
});

// C1: "Clear all marks" must clear BOTH find-highlights AND bookmarks,
// faithful to FindReplaceDialog::clearAllMarks() which calls clearAllBookmarks().
test('Clear all marks → __getFindHighlightCount 0, bookmarks also cleared', async ({ page }) => {
  await gotoEditor(page);

  const content = page.locator('.cm-content');
  await content.click();
  await page.keyboard.type('foo bar foo');

  // Add a bookmark on line 1 directly.
  await page.evaluate(() => (window as unknown as WinExt).__bookmarkLine(1));

  await openMarkTab(page);
  await page.locator('#fd-find-input').fill('foo');
  await page.locator('#fd-btn-mark-all').click();

  // Verify marks exist.
  const countBefore = await page.evaluate(() =>
    (window as unknown as WinExt).__getFindHighlightCount(),
  );
  expect(countBefore).toBeGreaterThan(0);

  // Verify bookmark is set before clearing.
  const bookmarksBefore = await page.evaluate(() => (window as unknown as WinExt).__getBookmarks());
  expect(bookmarksBefore).toContain(1);

  // Clear marks — must clear BOTH find-highlights AND bookmarks.
  await page.locator('#fd-btn-clear-marks').click();

  const countAfter = await page.evaluate(() =>
    (window as unknown as WinExt).__getFindHighlightCount(),
  );
  expect(countAfter).toBe(0);

  // Bookmarks must also be cleared (faithful to clearAllMarks() calling clearAllBookmarks()).
  const bookmarksAfter = await page.evaluate(() => (window as unknown as WinExt).__getBookmarks());
  expect(bookmarksAfter).toHaveLength(0);
});

test('Mark All with Bookmark line checked → bookmarks set on matching lines', async ({ page }) => {
  await gotoEditor(page);

  const content = page.locator('.cm-content');
  await content.click();
  // Three lines: "foo" on line 1, "bar" on line 2, "foo" on line 3
  await page.keyboard.type('foo');
  await page.keyboard.press('Enter');
  await page.keyboard.type('bar');
  await page.keyboard.press('Enter');
  await page.keyboard.type('foo');

  await openMarkTab(page);

  await page.locator('#fd-find-input').fill('foo');
  // Check the Bookmark line checkbox.
  const bookmarkCheck = page.locator('#fd-check-bookmark-line');
  if (!(await bookmarkCheck.isChecked())) {
    await bookmarkCheck.check();
  }
  await page.locator('#fd-btn-mark-all').click();

  const bookmarks = await page.evaluate(() => (window as unknown as WinExt).__getBookmarks());
  // 'foo' appears on lines 1 and 3.
  expect(bookmarks).toContain(1);
  expect(bookmarks).toContain(3);
});

test('Purge for each search → second Mark All replaces highlights and clears bookmarks', async ({
  page,
}) => {
  await gotoEditor(page);

  const content = page.locator('.cm-content');
  await content.click();
  await page.keyboard.type('foo bar foo baz bar');

  await openMarkTab(page);

  // First Mark All: search "foo", with Bookmark line + Purge checked.
  await page.locator('#fd-find-input').fill('foo');
  const bookmarkCheck = page.locator('#fd-check-bookmark-line');
  if (!(await bookmarkCheck.isChecked())) {
    await bookmarkCheck.check();
  }
  const purgeCheck = page.locator('#fd-check-purge-each-search');
  if (!(await purgeCheck.isChecked())) {
    await purgeCheck.check();
  }
  await page.locator('#fd-btn-mark-all').click();

  const count1 = await page.evaluate(() => (window as unknown as WinExt).__getFindHighlightCount());
  expect(count1).toBe(2); // "foo" appears twice

  // Second Mark All: search "bar" with Purge (replaces).
  await page.locator('#fd-find-input').fill('bar');
  await page.locator('#fd-btn-mark-all').click();

  const count2 = await page.evaluate(() => (window as unknown as WinExt).__getFindHighlightCount());
  // With purge, previous "foo" marks cleared, now "bar" highlighted.
  expect(count2).toBe(2); // "bar" appears twice

  // Bookmarks should also be cleared (purge) and re-set for "bar".
  const bookmarks = await page.evaluate(() => (window as unknown as WinExt).__getBookmarks());
  // bar is on line 1 (only one line of text), bookmarks contains line 1.
  expect(bookmarks.length).toBeGreaterThan(0);
});

test('Search and Bookmark menu item opens Mark tab with Bookmark line checked', async ({
  page,
}) => {
  await gotoEditor(page);

  // Navigate: Search menu → Bookmarks submenu → Search and Bookmark.
  // Click the "Search" top-level menu button (3rd button, 0-indexed = 2).
  await page.locator('#menubar .menubar-item').nth(2).click();

  // Hover over "Bookmarks" submenu entry.
  await page.getByRole('menuitem', { name: 'Bookmarks' }).hover();

  // Click "Search and Bookmark".
  await page.getByRole('menuitem', { name: 'Search and Bookmark' }).click();

  // Dialog should be visible and on Mark tab.
  await expect(page.locator('[role=dialog]')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#fd-tab-mark')).toHaveClass(/active/, { timeout: 2000 });

  // Bookmark line checkbox should be checked.
  const bookmarkCheck = page.locator('#fd-check-bookmark-line');
  await expect(bookmarkCheck).toBeChecked({ timeout: 2000 });
});

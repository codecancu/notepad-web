// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * E2E tests for the Markers system (Phase-4 Task 3).
 *
 * Uses window.__getMarkCount() and window.__selectText() (exposed by editor-page.ts)
 * to assert CM6 marker state and set selections before clicking menu items.
 *
 * Tests:
 *  - Mark Style 1 via menu → .cm-mark-0 elements appear; __getMarkCount(0) > 0.
 *  - Clear Style 1 via menu → __getMarkCount(0) === 0.
 *  - Mark Style 2, then Clear Style 2 → only style 2 affected.
 *  - Clear All Styles → all markers removed.
 */
import { test, expect } from '@playwright/test';

type WinExt = Window & {
  __appReady: unknown;
  __editor: { getValue(): string };
  __getMarkCount: (index: number) => number;
  __selectText: (from: number, to: number) => void;
};

/** Navigate and wait for the editor to be fully ready, then clear the doc. */
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
  await page.waitForFunction(() => (window as unknown as WinExt).__appReady !== undefined);
  await page.evaluate(() => (window as unknown as WinExt).__appReady);
  // Clear content.
  const content = page.locator('.cm-content');
  await content.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
}

/**
 * Open Search → Mark All Occurrences submenu and click a named item.
 * Mirrors the bookmarks approach: click Search, hover Mark All Occurrences, click item.
 */
async function clickMarkMenu(
  page: Parameters<Parameters<typeof test>[1]>[0]['page'],
  itemLabel: string,
) {
  // Click the "Search" top-level menu button (3rd button, 0-indexed = 2).
  await page.locator('#menubar .menubar-item').nth(2).click();

  // Hover the "Mark All Occurrences" submenu entry to open the sub-panel.
  const markEntry = page
    .locator('[role="menu"] .menubar-entry')
    .filter({ has: page.locator('.menubar-entry-label', { hasText: /^Mark All Occurrences$/ }) })
    .first();
  await markEntry.hover();

  // Wait for the sub-panel to appear.
  await page.waitForSelector('.menubar-sub', { timeout: 3000 });

  // Click the target item inside the sub-panel.
  const targetEntry = page
    .locator('.menubar-sub .menubar-entry')
    .filter({
      has: page.locator('.menubar-entry-label', { hasText: new RegExp(`^${itemLabel}$`) }),
    })
    .first();
  await targetEntry.click({ force: true });
}

/**
 * Open Search → Clear Marks submenu and click a named item.
 */
async function clickClearMarkMenu(
  page: Parameters<Parameters<typeof test>[1]>[0]['page'],
  itemLabel: string,
) {
  // Click the "Search" top-level menu button.
  await page.locator('#menubar .menubar-item').nth(2).click();

  // Hover the "Clear Marks" submenu entry.
  const clearEntry = page
    .locator('[role="menu"] .menubar-entry')
    .filter({ has: page.locator('.menubar-entry-label', { hasText: /^Clear Marks$/ }) })
    .first();
  await clearEntry.hover();

  // Wait for the sub-panel.
  await page.waitForSelector('.menubar-sub', { timeout: 3000 });

  // Click the target item.
  const targetEntry = page
    .locator('.menubar-sub .menubar-entry')
    .filter({
      has: page.locator('.menubar-entry-label', { hasText: new RegExp(`^${itemLabel}$`) }),
    })
    .first();
  await targetEntry.click({ force: true });
}

// ── Mark Style 1 ──────────────────────────────────────────────────────────────

test('Mark Style 1 via menu → .cm-mark-0 elements appear', async ({ page }) => {
  await gotoEditor(page);
  const content = page.locator('.cm-content');
  await content.click();

  // Type a doc with repeated word.
  await page.keyboard.type('hello world hello world hello');

  // Select one occurrence of 'hello' (positions 0-5).
  await page.evaluate(() => (window as unknown as WinExt).__selectText(0, 5));

  // Click Mark Style 1.
  await clickMarkMenu(page, 'Mark Style 1');

  // Wait for marks to appear.
  await page.waitForFunction(() => (window as unknown as WinExt).__getMarkCount(0) > 0, {
    timeout: 5000,
  });

  const count = await page.evaluate(() => (window as unknown as WinExt).__getMarkCount(0));
  // 'hello' appears 3 times.
  expect(count).toBe(3);

  // DOM check: .cm-mark-0 elements should be present.
  const markEls = page.locator('.cm-mark-0');
  await expect(markEls.first()).toBeAttached();
});

// ── Clear Style 1 ─────────────────────────────────────────────────────────────

test('Clear Style 1 via menu → __getMarkCount(0) === 0', async ({ page }) => {
  await gotoEditor(page);
  const content = page.locator('.cm-content');
  await content.click();

  await page.keyboard.type('foo bar foo bar foo');

  // Select 'foo' (positions 0-3).
  await page.evaluate(() => (window as unknown as WinExt).__selectText(0, 3));

  // Mark style 1.
  await clickMarkMenu(page, 'Mark Style 1');
  await page.waitForFunction(() => (window as unknown as WinExt).__getMarkCount(0) > 0, {
    timeout: 5000,
  });

  // Clear style 1.
  await clickClearMarkMenu(page, 'Clear Style 1');
  await page.waitForFunction(() => (window as unknown as WinExt).__getMarkCount(0) === 0, {
    timeout: 5000,
  });

  const count = await page.evaluate(() => (window as unknown as WinExt).__getMarkCount(0));
  expect(count).toBe(0);
});

// ── Mark Style 2, then Clear Style 2 → other styles unaffected ───────────────

test('Mark Style 2 then Clear Style 2 → style 1 unaffected', async ({ page }) => {
  await gotoEditor(page);
  const content = page.locator('.cm-content');
  await content.click();

  await page.keyboard.type('alpha beta alpha beta');

  // Mark 'alpha' with style 1.
  await page.evaluate(() => (window as unknown as WinExt).__selectText(0, 5));
  await clickMarkMenu(page, 'Mark Style 1');
  await page.waitForFunction(() => (window as unknown as WinExt).__getMarkCount(0) > 0, {
    timeout: 5000,
  });

  // Mark 'beta' with style 2.
  await page.evaluate(() => (window as unknown as WinExt).__selectText(6, 10));
  await clickMarkMenu(page, 'Mark Style 2');
  await page.waitForFunction(() => (window as unknown as WinExt).__getMarkCount(1) > 0, {
    timeout: 5000,
  });

  // Clear style 2 only.
  await clickClearMarkMenu(page, 'Clear Style 2');
  await page.waitForFunction(() => (window as unknown as WinExt).__getMarkCount(1) === 0, {
    timeout: 5000,
  });

  // Style 1 ('alpha') should still be marked.
  const count0 = await page.evaluate(() => (window as unknown as WinExt).__getMarkCount(0));
  expect(count0).toBeGreaterThan(0);

  const count1 = await page.evaluate(() => (window as unknown as WinExt).__getMarkCount(1));
  expect(count1).toBe(0);
});

// ── Clear All Styles ──────────────────────────────────────────────────────────

test('Clear All Styles → all marks removed', async ({ page }) => {
  await gotoEditor(page);
  const content = page.locator('.cm-content');
  await content.click();

  await page.keyboard.type('one two three one two three');

  // Mark with multiple styles.
  await page.evaluate(() => (window as unknown as WinExt).__selectText(0, 3));
  await clickMarkMenu(page, 'Mark Style 1');
  await page.waitForFunction(() => (window as unknown as WinExt).__getMarkCount(0) > 0, {
    timeout: 5000,
  });

  await page.evaluate(() => (window as unknown as WinExt).__selectText(4, 7));
  await clickMarkMenu(page, 'Mark Style 2');
  await page.waitForFunction(() => (window as unknown as WinExt).__getMarkCount(1) > 0, {
    timeout: 5000,
  });

  // Clear all styles.
  await clickClearMarkMenu(page, 'Clear All Styles');
  await page.waitForFunction(
    () =>
      (window as unknown as WinExt).__getMarkCount(0) === 0 &&
      (window as unknown as WinExt).__getMarkCount(1) === 0,
    { timeout: 5000 },
  );

  expect(await page.evaluate(() => (window as unknown as WinExt).__getMarkCount(0))).toBe(0);
  expect(await page.evaluate(() => (window as unknown as WinExt).__getMarkCount(1))).toBe(0);
  expect(await page.evaluate(() => (window as unknown as WinExt).__getMarkCount(2))).toBe(0);
});

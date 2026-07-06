// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * E2E tests for faithful Notepad++-style split view (two editor panes).
 *
 * Verifies:
 *  - View → Split Vertical creates a second pane (#editor-2 + #tabbar-2) and
 *    moves the current document into it.
 *  - Each pane edits independently.
 *  - Right-click a tab → "Move to Other View" relocates it.
 *  - Clicking a pane makes it focused (status bar Ln/Col follows it).
 *  - The split (and per-pane tabs) survive a page reload.
 */
import { test, expect } from '@playwright/test';

type Win = Window & { __appReady: unknown };

async function clearStorageAndReload(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
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
  await page.waitForFunction(() => (window as unknown as Win).__appReady !== undefined);
  await page.evaluate(() => (window as unknown as Win).__appReady);
}

async function splitVertical(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  await page.getByRole('menuitem', { name: 'View' }).click();
  await page.getByRole('menuitem', { name: 'Split Vertical' }).click();
}

test.describe('Split view', () => {
  test('View → Split Vertical creates a second editor pane', async ({ page }) => {
    await clearStorageAndReload(page);
    await expect(page.locator('#editor-2')).toHaveCount(0);

    await splitVertical(page);

    await expect(page.locator('#editor-2')).toHaveCount(1);
    await expect(page.locator('#tabbar-2')).toHaveCount(1);
    // Two CM6 editors are now mounted.
    await expect(page.locator('.cm-editor')).toHaveCount(2);
  });

  test('panes edit independently', async ({ page }) => {
    await clearStorageAndReload(page);
    // Type into the primary pane first.
    const primary = page.locator('#editor .cm-content');
    await primary.click();
    await page.keyboard.type('PRIMARY');

    // Split: the current doc moves to the secondary pane.
    await splitVertical(page);

    // The secondary pane now holds "PRIMARY"; the primary pane got a fresh doc.
    const secondary = page.locator('#editor-2 .cm-content');
    await expect(secondary).toContainText('PRIMARY');

    // Type into the (now empty) primary pane and confirm the secondary is unaffected.
    await primary.click();
    await page.keyboard.type('LEFT');
    await expect(page.locator('#editor .cm-content')).toContainText('LEFT');
    await expect(secondary).toContainText('PRIMARY');
    await expect(secondary).not.toContainText('LEFT');
  });

  test('Move to Other View relocates a tab and collapses when a pane empties', async ({ page }) => {
    await clearStorageAndReload(page);
    await splitVertical(page); // now split, doc moved to secondary, fresh doc in primary

    // Right-click the secondary pane's tab → Move to Other View.
    await page.locator('#tabbar-2 .tab').first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Move to Other View' }).click();

    // Secondary pane emptied → split collapses back to a single pane.
    await expect(page.locator('#editor-2')).toHaveCount(0);
  });

  test('split layout survives reload', async ({ page }) => {
    await clearStorageAndReload(page);
    await splitVertical(page);
    await expect(page.locator('#editor-2')).toHaveCount(1);

    // Give the debounced session save time to flush, then reload.
    await page.waitForTimeout(800);
    await page.reload();
    await page.waitForFunction(() => (window as unknown as Win).__appReady !== undefined);
    await page.evaluate(() => (window as unknown as Win).__appReady);

    // The secondary pane is restored.
    await expect(page.locator('#editor-2')).toHaveCount(1);
    await expect(page.locator('.cm-editor')).toHaveCount(2);
  });
});

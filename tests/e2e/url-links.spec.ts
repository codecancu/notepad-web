// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * E2E tests for URL links (Phase-4 Task 4a).
 *
 * Tests:
 *  1. URL in doc content → .cm-url element appears with correct text.
 *  2. Ctrl+click on .cm-url → window.open called with the URL.
 *  3. Plain click on .cm-url → window.open NOT called.
 */
import { test, expect } from '@playwright/test';

type WinExt = Window & {
  __appReady: unknown;
  __editor: { getValue(): string };
  __getUrlCount: () => number;
  __openedUrl: string | null;
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

// ── 1. URL decorates as .cm-url ───────────────────────────────────────────────

test('URL in doc content → .cm-url element appears with correct text', async ({ page }) => {
  await gotoEditor(page);
  const content = page.locator('.cm-content');
  await content.click();

  await page.keyboard.type('visit https://example.com for info');

  // Wait for .cm-url to appear.
  await page.waitForSelector('.cm-url', { timeout: 5000 });

  const urlEl = page.locator('.cm-url').first();
  await expect(urlEl).toBeAttached();
  await expect(urlEl).toHaveText('https://example.com');
});

// ── 2. Ctrl+click opens the URL ───────────────────────────────────────────────

test('Ctrl+click on .cm-url opens the URL via window.open', async ({ page }) => {
  await gotoEditor(page);
  const content = page.locator('.cm-content');
  await content.click();

  await page.keyboard.type('visit https://example.com for info');

  await page.waitForSelector('.cm-url', { timeout: 5000 });

  // Stub window.open to capture the called URL.
  await page.evaluate(() => {
    (window as unknown as WinExt).__openedUrl = null;
    window.open = (url?: string | URL) => {
      (window as unknown as WinExt).__openedUrl = String(url ?? '');
      return null;
    };
  });

  const urlEl = page.locator('.cm-url').first();
  await urlEl.click({ modifiers: ['ControlOrMeta'] });

  const openedUrl = await page.evaluate(() => (window as unknown as WinExt).__openedUrl);
  expect(openedUrl).toBe('https://example.com');
});

// ── 3. Plain click does NOT open the URL ─────────────────────────────────────

test('Plain click on .cm-url does NOT call window.open', async ({ page }) => {
  await gotoEditor(page);
  const content = page.locator('.cm-content');
  await content.click();

  await page.keyboard.type('visit https://example.com for info');

  await page.waitForSelector('.cm-url', { timeout: 5000 });

  // Stub window.open before the plain click.
  await page.evaluate(() => {
    (window as unknown as WinExt).__openedUrl = null;
    window.open = (url?: string | URL) => {
      (window as unknown as WinExt).__openedUrl = String(url ?? '');
      return null;
    };
  });

  const urlEl = page.locator('.cm-url').first();
  await urlEl.click(); // plain click, no modifier

  const openedUrl = await page.evaluate(() => (window as unknown as WinExt).__openedUrl);
  expect(openedUrl).toBeNull();
});

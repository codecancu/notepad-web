// SPDX-License-Identifier: GPL-3.0-or-later
import { test, expect } from '@playwright/test';

test.describe('session', () => {
  test('content survives a reload', async ({ page }) => {
    // Accept any dirty-close confirm dialogs that might appear.
    page.on('dialog', (d) => void d.accept());

    await page.goto('/editor.html');
    await page.waitForFunction(() => !!(window as unknown as Record<string, unknown>).__appReady);
    await page.evaluate(() => (window as unknown as Record<string, unknown>).__appReady);

    // Type content into the CM6 editor via .cm-content (contenteditable).
    const content = page.locator('.cm-content').first();
    await content.click();
    await page.keyboard.type('persist me');

    // Wait (condition-based) for CM6's updateListener to propagate
    // docChanged → store.update() before triggering the flush.
    // This replaces the previous fixed waitForTimeout(600) which was flaky
    // under load: we poll __editor.getValue() until the store has the text.
    await page.waitForFunction(
      () =>
        (
          window as unknown as Record<string, unknown & { __editor: { getValue(): string } }>
        ).__editor.getValue() === 'persist me',
    );

    // Fire visibilitychange (hidden) to trigger SessionSync.flush(), which
    // starts an async IndexedDB write.
    await page.evaluate(() => {
      // Simulate the tab going hidden, which triggers sync.flush() via the
      // 'visibilitychange' listener registered in App.start().
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Give the async IndexedDB write a short bounded window to complete.
    // IndexedDB writes are near-instant in Chromium; 300 ms is a generous
    // upper bound that avoids tight coupling to the exact flush latency.
    await page.waitForTimeout(300);

    // Reload and wait for the app to re-initialize.
    await page.reload();
    await page.waitForFunction(() => !!(window as unknown as Record<string, unknown>).__appReady);
    await page.evaluate(() => (window as unknown as Record<string, unknown>).__appReady);

    // Use the CM6 __editor.getValue() facade (not the Monaco Model API).
    const value = await page.evaluate(() =>
      (
        window as unknown as Record<string, unknown & { __editor: { getValue(): string } }>
      ).__editor.getValue(),
    );
    expect(value).toContain('persist me');
  });
});

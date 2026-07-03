// SPDX-License-Identifier: GPL-3.0-or-later
import { test, expect } from '@playwright/test';

test.describe('tabs', () => {
  test('new tab adds a tab and switches active', async ({ page }) => {
    // Accept any dirty-close confirm dialogs that might appear.
    page.on('dialog', (d) => void d.accept());

    await page.goto('/editor.html');
    await page.waitForFunction(
      () => (window as unknown as Record<string, unknown>).__appReady !== undefined,
    );
    await page.evaluate(() => (window as unknown as Record<string, unknown>).__appReady);

    await page.locator('#tab-new').click();
    await expect(page.locator('.tab')).toHaveCount(2);
    await expect(page.locator('.tab.active')).toHaveCount(1);
  });

  test('closing a clean tab removes it', async ({ page }) => {
    // Accept any dirty-close confirm dialogs that might appear.
    page.on('dialog', (d) => void d.accept());

    await page.goto('/editor.html');
    await page.waitForFunction(
      () => (window as unknown as Record<string, unknown>).__appReady !== undefined,
    );
    await page.evaluate(() => (window as unknown as Record<string, unknown>).__appReady);

    // Open a second tab so we have 2 total.
    await page.locator('#tab-new').click();
    await expect(page.locator('.tab')).toHaveCount(2);

    // Close the first tab's close button.
    await page.locator('.tab .tab-close').first().click();
    await expect(page.locator('.tab')).toHaveCount(1);
  });

  test('tab-switch edit round-trip: each tab preserves its own content', async ({ page }) => {
    // This test guards the live updateListener/setState/sharedExtensions path
    // end-to-end.  The critical Phase-1 fix ensures the updateListener (a
    // STATE-level CM6 facet) survives view.setState() by embedding it in every
    // per-document EditorState.  Without that fix, edits in doc A would be lost
    // as soon as any tab switch triggered setState with a state that lacked the
    // listener.
    page.on('dialog', (d) => void d.accept());

    await page.goto('/editor.html');
    await page.waitForFunction(() => !!(window as unknown as Record<string, unknown>).__appReady);
    await page.evaluate(() => (window as unknown as Record<string, unknown>).__appReady);

    // Type text into doc A (the initial tab).
    const content = page.locator('.cm-content').first();
    await content.click();
    await page.keyboard.type('text in A');

    // Wait for CM6's updateListener to propagate the change to the DocumentStore.
    await page.waitForFunction(
      () =>
        (
          window as unknown as Record<string, unknown & { __editor: { getValue(): string } }>
        ).__editor.getValue() === 'text in A',
    );

    // Open a second tab (doc B) via the new-tab button.
    await page.locator('#tab-new').click();
    await expect(page.locator('.tab')).toHaveCount(2);

    // Type different text into doc B.
    const contentB = page.locator('.cm-content').first();
    await contentB.click();
    await page.keyboard.type('text in B');

    // Wait for doc B's content to propagate.
    await page.waitForFunction(
      () =>
        (
          window as unknown as Record<string, unknown & { __editor: { getValue(): string } }>
        ).__editor.getValue() === 'text in B',
    );

    // Switch back to tab A (first tab in the list).
    await page.locator('.tab').first().click();

    // Wait for the view to reflect doc A's content.
    await page.waitForFunction(
      () =>
        (
          window as unknown as Record<string, unknown & { __editor: { getValue(): string } }>
        ).__editor.getValue() === 'text in A',
    );
    const valueA = await page.evaluate(() =>
      (
        window as unknown as Record<string, unknown & { __editor: { getValue(): string } }>
      ).__editor.getValue(),
    );
    expect(valueA).toBe('text in A');

    // Switch to tab B and confirm B's content is intact.
    await page.locator('.tab').last().click();
    await page.waitForFunction(
      () =>
        (
          window as unknown as Record<string, unknown & { __editor: { getValue(): string } }>
        ).__editor.getValue() === 'text in B',
    );
    const valueB = await page.evaluate(() =>
      (
        window as unknown as Record<string, unknown & { __editor: { getValue(): string } }>
      ).__editor.getValue(),
    );
    expect(valueB).toBe('text in B');
  });
});

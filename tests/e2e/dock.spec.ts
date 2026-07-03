// SPDX-License-Identifier: GPL-3.0-or-later
import { test, expect } from '@playwright/test';

test.describe('dockview integration (P3)', () => {
  test('editor is visible inside the dock container', async ({ page }) => {
    await page.goto('/editor.html');
    await page.waitForFunction(() => !!(window as Record<string, unknown>).__appReady);
    await page.evaluate(() => (window as Record<string, unknown>).__appReady);

    // The CM6 editor should be visible inside the dockview layout.
    await expect(page.locator('.cm-editor')).toBeVisible();
  });

  test('editor still accepts typed text after dock mount', async ({ page }) => {
    await page.goto('/editor.html');
    await page.waitForFunction(() => !!(window as Record<string, unknown>).__appReady);
    await page.evaluate(() => (window as Record<string, unknown>).__appReady);

    const content = page.locator('.cm-content');
    await content.click();
    await page.keyboard.type('dock regression');

    const value = await page.evaluate(() =>
      (window as unknown as { __editor: { getValue(): string } }).__editor.getValue(),
    );
    expect(value).toContain('dock regression');
  });

  test('Help → Debug Log menu item toggles the Debug Log panel', async ({ page }) => {
    await page.goto('/editor.html');
    await page.waitForFunction(() => !!(window as Record<string, unknown>).__appReady);
    await page.evaluate(() => (window as Record<string, unknown>).__appReady);

    // The Debug Log panel should NOT be visible initially.
    await expect(page.locator('#debug-log-output')).toHaveCount(0);

    // Open Help menu.
    await page.getByRole('menuitem', { name: 'Help' }).click();
    // Click "Debug Log" item.
    await page.getByRole('menuitem', { name: 'Debug Log' }).click();

    // Wait for the panel to appear.
    await expect(page.locator('#debug-log-output')).toBeVisible({ timeout: 3000 });
  });

  test('tab bar is still accessible inside the dock layout', async ({ page }) => {
    await page.goto('/editor.html');
    await page.waitForFunction(() => !!(window as Record<string, unknown>).__appReady);
    await page.evaluate(() => (window as Record<string, unknown>).__appReady);

    // The new-tab button must be reachable inside the dockview layout.
    await expect(page.locator('#tab-new')).toBeVisible();
    await page.locator('#tab-new').click();
    await expect(page.locator('.tab')).toHaveCount(2);
  });

  test('exactly one tab strip visible — custom #tabbar shown, dockview editor-group header hidden', async ({
    page,
  }) => {
    await page.goto('/editor.html');
    await page.waitForFunction(() => !!(window as Record<string, unknown>).__appReady);
    await page.evaluate(() => (window as Record<string, unknown>).__appReady);

    // Our custom #tabbar must be visible.
    await expect(page.locator('#tabbar')).toBeVisible();

    // The dockview-native tab strip inside the editor group must be hidden.
    // The editor group carries the .dock-editor-group marker class; CSS sets
    // display:none on .dock-editor-group .dv-tabs-and-actions-container.
    // Assert: every .dv-tabs-and-actions-container inside .dock-editor-group
    // has computed display:none (the CSS rule is working).
    const allEditorGroupHeaders = page.locator('.dock-editor-group .dv-tabs-and-actions-container');
    const headerCount = await allEditorGroupHeaders.count();
    // Confirm all such elements are hidden (computed display = none).
    for (let i = 0; i < headerCount; i++) {
      const display = await allEditorGroupHeaders
        .nth(i)
        .evaluate((el) => getComputedStyle(el).display);
      expect(display, `editor-group dockview header [${i}] must be display:none`).toBe('none');
    }
    // And our custom #tabbar must remain visible — exactly one visible tab strip.
    await expect(page.locator('#tabbar')).toBeVisible();
  });
});

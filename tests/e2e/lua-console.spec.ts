// SPDX-License-Identifier: GPL-3.0-or-later
import { test, expect } from '@playwright/test';

test.describe('Lua Console panel (P5.3)', () => {
  test('View → Lua Console toggles the panel', async ({ page }) => {
    await page.goto('/editor.html');
    await page.waitForFunction(() => !!(window as Record<string, unknown>).__appReady);
    await page.evaluate(() => (window as Record<string, unknown>).__appReady);

    // Panel should not exist initially
    await expect(page.locator('#lua-console-output')).toHaveCount(0);

    // Open via menu
    await page.getByRole('menuitem', { name: 'View' }).click();
    await page.getByRole('menuitem', { name: 'Lua Console' }).click();

    // Panel should appear
    await expect(page.locator('#lua-console-output')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#lua-console-input')).toBeVisible({ timeout: 3000 });
  });

  test('editor.setText("hello from lua") sets editor content', async ({ page }) => {
    await page.goto('/editor.html');
    await page.waitForFunction(() => !!(window as Record<string, unknown>).__appReady);
    await page.evaluate(() => (window as Record<string, unknown>).__appReady);

    // Open Lua Console
    await page.getByRole('menuitem', { name: 'View' }).click();
    await page.getByRole('menuitem', { name: 'Lua Console' }).click();
    await expect(page.locator('#lua-console-input')).toBeVisible({ timeout: 5000 });

    // Type a command
    await page.locator('#lua-console-input').click();
    await page.keyboard.type('editor.setText("hello from lua")');
    await page.keyboard.press('Enter');

    // Wait for Lua engine to process (may take a moment on first run)
    await page.waitForTimeout(3000);

    // Assert editor content changed
    const editorContent = await page.evaluate(() =>
      (window as unknown as { __editor: { getValue(): string } }).__editor.getValue(),
    );
    expect(editorContent).toBe('hello from lua');
  });

  test('return 40 + 2 shows 42 in output', async ({ page }) => {
    await page.goto('/editor.html');
    await page.waitForFunction(() => !!(window as Record<string, unknown>).__appReady);
    await page.evaluate(() => (window as Record<string, unknown>).__appReady);

    // Open Lua Console
    await page.getByRole('menuitem', { name: 'View' }).click();
    await page.getByRole('menuitem', { name: 'Lua Console' }).click();
    await expect(page.locator('#lua-console-input')).toBeVisible({ timeout: 5000 });

    await page.locator('#lua-console-input').click();
    await page.keyboard.type('return 40 + 2');
    await page.keyboard.press('Enter');

    // Wait for result
    await page.waitForTimeout(3000);

    // Assert 42 appears in output
    await expect(page.locator('#lua-console-output')).toContainText('42', { timeout: 5000 });
  });
});

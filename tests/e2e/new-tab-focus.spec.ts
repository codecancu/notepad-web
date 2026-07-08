// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * E2E: opening a new tab focuses the editor so the user can type immediately,
 * without first clicking into the text area.
 */
import { test, expect } from '@playwright/test';

test.describe('New tab focus', () => {
  const inEditor = (page: Parameters<Parameters<typeof test>[1]>[0]['page']) =>
    page.evaluate(() => !!document.activeElement?.closest('.cm-editor'));

  test.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => void d.accept());
    await page.goto('/editor.html');
    await page.waitForFunction(
      () => (window as unknown as { __appReady?: unknown }).__appReady !== undefined,
    );
    await page.evaluate(() => (window as unknown as { __appReady: Promise<void> }).__appReady);
  });

  test('the + button focuses the editor and accepts typing right away', async ({ page }) => {
    await page.locator('#tab-new').click();
    await expect.poll(() => inEditor(page)).toBe(true);
    // Type without clicking into the editor first.
    await page.keyboard.type('HELLO');
    expect(
      await page.evaluate(() =>
        (window as unknown as { __editor: { getValue(): string } }).__editor.getValue(),
      ),
    ).toBe('HELLO');
  });

  test('File → New focuses the editor', async ({ page }) => {
    await page.getByRole('menuitem', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: 'New' }).first().click();
    await expect.poll(() => inEditor(page)).toBe(true);
  });

  test('switching to an existing tab focuses the editor', async ({ page }) => {
    // Open a second tab, then click back to the first tab.
    await page.locator('#tab-new').click();
    const firstTab = page.locator('#tabbar .tab').first();
    await firstTab.click();
    await expect.poll(() => inEditor(page)).toBe(true);
    await page.keyboard.type('X');
    expect(
      await page.evaluate(() =>
        (window as unknown as { __editor: { getValue(): string } }).__editor.getValue(),
      ),
    ).toBe('X');
  });

  test('the editor is focused after a page reload', async ({ page }) => {
    await page.reload();
    await page.waitForFunction(
      () => (window as unknown as { __appReady?: unknown }).__appReady !== undefined,
    );
    await page.evaluate(() => (window as unknown as { __appReady: Promise<void> }).__appReady);
    await expect.poll(() => inEditor(page)).toBe(true);
    // Can keep typing without clicking first.
    await page.keyboard.type('Y');
    expect(
      await page.evaluate(() =>
        (window as unknown as { __editor: { getValue(): string } }).__editor.getValue(),
      ),
    ).toContain('Y');
  });
});

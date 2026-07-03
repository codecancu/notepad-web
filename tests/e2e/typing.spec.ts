// SPDX-License-Identifier: GPL-3.0-or-later
import { test, expect } from '@playwright/test';

test('typed text lands in the active model', async ({ page }) => {
  await page.goto('/editor.html');
  await page.waitForFunction(() => (window as any).__appReady !== undefined);
  await page.evaluate(() => (window as any).__appReady);
  // CM6 editable area is .cm-content
  const content = page.locator('.cm-content');
  await content.click();
  await page.keyboard.type('hello world');
  const value = await page.evaluate(() => (window as any).__editor.getValue());
  expect(value).toContain('hello world');
});

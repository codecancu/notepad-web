// SPDX-License-Identifier: GPL-3.0-or-later
import { test, expect } from '@playwright/test';

test('editor mounts (CM6 .cm-editor visible)', async ({ page }) => {
  await page.goto('/editor.html');
  await page.waitForFunction(() => (window as any).__appReady !== undefined);
  await page.evaluate(() => (window as any).__appReady);
  await expect(page.locator('.cm-editor')).toBeVisible();
});

test('Wasmoon Lua-in-WASM returns 2 (1+1) under MV3 CSP', async ({ page }) => {
  await page.goto('/editor.html');
  await page.waitForFunction(() => (window as any).__luaReady !== undefined);
  const result = await page.evaluate(() => (window as any).__luaReady);
  expect(result).toBe(2);
});

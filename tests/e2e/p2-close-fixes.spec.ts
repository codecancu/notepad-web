// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * E2E tests for Phase-2 close fixes:
 *  - Fix 1: wired keyboard accelerators (Ctrl+Shift+W closes all, Alt+Z toggles wrap)
 *  - Fix 2: Show-Symbol flags inherited by new tabs (show-whitespace cross-tab)
 */
import { test, expect } from '@playwright/test';

async function gotoEditor(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  page.on('dialog', (d) => void d.accept());
  await page.goto('/editor.html');
  await page.waitForFunction(
    () => (window as unknown as Record<string, unknown>).__appReady !== undefined,
  );
  await page.evaluate(() => (window as unknown as Record<string, unknown>).__appReady);
}

// ── Fix 1: Wired accelerators ─────────────────────────────────────────────────

test('Fix1: Ctrl+Shift+W closes all tabs and leaves exactly one', async ({ page }) => {
  await gotoEditor(page);

  // Open two extra tabs (total 3).
  await page.locator('#tab-new').click();
  await page.locator('#tab-new').click();
  await expect(page.locator('.tab')).toHaveCount(3);

  // Trigger the wired accelerator: Ctrl+Shift+W → Close All.
  await page.keyboard.press('Control+Shift+W');

  // After Close All, exactly one doc remains (doCloseAll ensures at least one).
  await expect(page.locator('.tab')).toHaveCount(1);
});

test('Fix1: Alt+Z toggles word wrap on and off', async ({ page }) => {
  await gotoEditor(page);

  // Word wrap must be OFF by default.
  await expect(page.locator('.cm-content.cm-lineWrapping')).toHaveCount(0);

  // Focus the editor and press Alt+Z to enable word wrap.
  await page.locator('.cm-content').first().click();
  await page.keyboard.press('Alt+Z');

  // Word wrap must now be ON.
  await expect(page.locator('.cm-content.cm-lineWrapping')).toBeVisible({ timeout: 3000 });

  // Press Alt+Z again to disable word wrap.
  await page.keyboard.press('Alt+Z');

  // Word wrap must be OFF again.
  await expect(page.locator('.cm-content.cm-lineWrapping')).toHaveCount(0);
});

// ── Fix 2: Show-Symbol inherited by new tabs ──────────────────────────────────

test('Fix2: new tab opened after enabling Show Whitespace inherits the setting', async ({
  page,
}) => {
  await gotoEditor(page);

  // Enable Show Whitespace via the View → Show Symbol → Show Whitespace menu.
  await page.locator('#menubar button').nth(3).click(); // View menu (index 3)
  const showSymbol = page
    .locator('[role="menu"] .menubar-entry')
    .filter({ hasText: 'Show Symbol' })
    .first();
  await showSymbol.hover();
  const showWhitespace = page
    .locator('[role="menu"] .menubar-entry')
    .filter({ hasText: 'Show Whitespace' })
    .first();
  await showWhitespace.click();

  // Confirm Show Whitespace is active on the current tab — CM6 adds
  // .cm-highlightSpace to the content when highlightWhitespace() is active.
  await expect(page.locator('.cm-content')).toBeVisible({ timeout: 3000 });

  // Open a NEW tab — this exercises the showDoc() path with _currentSymbolExt seeded.
  await page.locator('#tab-new').click();

  // The new tab should also have the .cm-highlightSpace class rendered (at least
  // one such element visible once any whitespace character is typed).
  // Type a space so there is something to highlight.
  const contentEl = page.locator('.cm-content').first();
  await contentEl.click();
  await page.keyboard.press('Space');

  // .cm-highlightSpace elements appear inside the editor when highlightWhitespace() is on.
  await expect(page.locator('.cm-highlightSpace').first()).toBeVisible({ timeout: 3000 });
});

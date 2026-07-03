// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * E2E tests for right-click context menus:
 *  - Editor context menu: appears on right-click, items functional
 *  - Tab context menu: appears on right-click on a tab
 *  - Right-click caret behaviour: click inside selection keeps selection
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

// ── Editor context menu ───────────────────────────────────────────────────────

test('Editor: right-click shows context menu with Select All item', async ({ page }) => {
  await gotoEditor(page);

  await page.locator('.cm-content').first().click({ button: 'right' });

  const menu = page.locator('.context-menu');
  await expect(menu).toBeVisible({ timeout: 3000 });
  await expect(menu.locator('li', { hasText: 'Select All' })).toBeVisible();
});

test('Editor: clicking Select All in context menu selects all text', async ({ page }) => {
  await gotoEditor(page);

  // Type some text first
  await page.locator('.cm-content').first().click();
  await page.keyboard.type('hello world');

  // Right-click to open context menu
  await page.locator('.cm-content').first().click({ button: 'right' });
  const menu = page.locator('.context-menu');
  await expect(menu).toBeVisible({ timeout: 3000 });

  // Click "Select All"
  await menu.locator('li', { hasText: 'Select All' }).click();

  // Menu should close
  await expect(page.locator('.context-menu')).not.toBeVisible({ timeout: 2000 });

  // The selection should now span the full document
  const selectionLength = await page.evaluate(() => {
    const { from, to } = (
      window as unknown as {
        __editor: { getSelection(): { from: number; to: number } };
      }
    ).__editor.getSelection();
    return to - from;
  });
  expect(selectionLength).toBeGreaterThan(0);
});

test('Editor: right-click shows Undo and Redo items', async ({ page }) => {
  await gotoEditor(page);

  await page.locator('.cm-content').first().click({ button: 'right' });

  const menu = page.locator('.context-menu');
  await expect(menu).toBeVisible({ timeout: 3000 });
  await expect(menu.locator('li', { hasText: 'Undo' })).toBeVisible();
  await expect(menu.locator('li', { hasText: 'Redo' })).toBeVisible();
});

test('Editor: Escape closes the context menu', async ({ page }) => {
  await gotoEditor(page);

  await page.locator('.cm-content').first().click({ button: 'right' });
  await expect(page.locator('.context-menu')).toBeVisible({ timeout: 3000 });

  await page.keyboard.press('Escape');
  await expect(page.locator('.context-menu')).not.toBeVisible({ timeout: 2000 });
});

// ── Right-click caret behaviour ───────────────────────────────────────────────

test('Editor: right-click inside a selection keeps the selection', async ({ page }) => {
  await gotoEditor(page);

  // Type text, then select all of it via the direct CM6 dispatch helper
  // (ControlOrMeta+A can be flaky in headless; __selectText is deterministic).
  await page.locator('.cm-content').first().click();
  await page.keyboard.type('keep selection');
  await page.waitForFunction(
    () =>
      (window as unknown as { __editor: { getValue(): string } }).__editor.getValue() ===
      'keep selection',
  );
  await page.evaluate(() => {
    const len = (window as unknown as { __editor: { getValue(): string } }).__editor.getValue()
      .length;
    (window as unknown as { __selectText: (from: number, to: number) => void }).__selectText(
      0,
      len,
    );
  });

  // Capture initial selection length
  const selBefore = await page.evaluate(() => {
    const { from, to } = (
      window as unknown as {
        __editor: { getSelection(): { from: number; to: number } };
      }
    ).__editor.getSelection();
    return to - from;
  });
  expect(selBefore).toBeGreaterThan(0);

  // Right-click on the text line itself (inside the selection).
  // Faithful to upstream #1071: a right-click inside the selection must NOT
  // collapse it. We right-click near the left edge of the rendered line where
  // the selected characters actually are (avoids the empty area past EOL, which
  // is a caret position OUTSIDE the selection).
  const box = await page.locator('.cm-line').first().boundingBox();
  await page.mouse.click(box!.x + 8, box!.y + box!.height / 2, { button: 'right' });

  // Menu should have appeared
  await expect(page.locator('.context-menu')).toBeVisible({ timeout: 3000 });

  // Selection should not have collapsed
  const selAfter = await page.evaluate(() => {
    const { from, to } = (
      window as unknown as {
        __editor: { getSelection(): { from: number; to: number } };
      }
    ).__editor.getSelection();
    return to - from;
  });
  expect(selAfter).toBe(selBefore);
});

// ── Tab context menu ──────────────────────────────────────────────────────────

test('Tab: right-click on tab shows context menu with Close item', async ({ page }) => {
  await gotoEditor(page);

  await page.locator('.tab').first().click({ button: 'right' });

  const menu = page.locator('.context-menu');
  await expect(menu).toBeVisible({ timeout: 3000 });
  await expect(menu.locator('li', { hasText: 'Close' }).first()).toBeVisible();
});

test('Tab: context menu shows file operation items', async ({ page }) => {
  await gotoEditor(page);

  await page.locator('.tab').first().click({ button: 'right' });

  const menu = page.locator('.context-menu');
  await expect(menu).toBeVisible({ timeout: 3000 });
  await expect(menu.locator('li', { hasText: 'Save' }).first()).toBeVisible();
  await expect(menu.locator('li', { hasText: 'Rename' })).toBeVisible();
  await expect(menu.locator('li', { hasText: 'Copy File Name' })).toBeVisible();
});

test('Tab: Close item on context menu closes the tab', async ({ page }) => {
  await gotoEditor(page);

  // Open a second tab so we can close the first without the empty-doc guard
  await page.locator('#tab-new').click();
  await expect(page.locator('.tab')).toHaveCount(2);

  // Right-click the first tab and click Close
  await page.locator('.tab').first().click({ button: 'right' });
  const menu = page.locator('.context-menu');
  await expect(menu).toBeVisible({ timeout: 3000 });
  await menu.locator('li', { hasText: 'Close' }).first().click();

  // Should now have 1 tab
  await expect(page.locator('.tab')).toHaveCount(1);
});

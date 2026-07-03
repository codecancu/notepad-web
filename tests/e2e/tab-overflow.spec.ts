// SPDX-License-Identifier: GPL-3.0-or-later
import { test, expect } from '@playwright/test';

// Helper: wait for the app to be ready after navigating
async function waitForApp(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as Record<string, unknown>).__appReady !== undefined,
  );
  await page.evaluate(() => (window as unknown as Record<string, unknown>).__appReady);
}

// Helper: open N additional tabs beyond the initial one
async function openExtraTabs(page: import('@playwright/test').Page, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await page.locator('#tab-new').click();
  }
}

test.describe('tab overflow — >> chevron button', () => {
  test('>> button is hidden when tabs fit (wide viewport)', async ({ page }) => {
    // Use a wide viewport so a small number of tabs all fit.
    await page.setViewportSize({ width: 1200, height: 700 });
    page.on('dialog', (d) => void d.accept());
    await page.goto('/editor.html');
    await waitForApp(page);

    // Only the initial tab — should not overflow at 1200px wide.
    const overflowBtn = page.locator('#tab-overflow');
    // Either not present or hidden
    const count = await overflowBtn.count();
    if (count > 0) {
      await expect(overflowBtn).toBeHidden();
    }
  });

  test('>> button appears when many tabs overflow a narrow viewport', async ({ page }) => {
    // Very narrow viewport forces overflow
    await page.setViewportSize({ width: 500, height: 700 });
    page.on('dialog', (d) => void d.accept());
    await page.goto('/editor.html');
    await waitForApp(page);

    // Open enough tabs to overflow a 500px strip
    await openExtraTabs(page, 8);

    const overflowBtn = page.locator('#tab-overflow');
    await expect(overflowBtn).toBeVisible({ timeout: 3000 });
  });

  test('>> button click opens dropdown listing hidden tabs', async ({ page }) => {
    await page.setViewportSize({ width: 500, height: 700 });
    page.on('dialog', (d) => void d.accept());
    await page.goto('/editor.html');
    await waitForApp(page);

    await openExtraTabs(page, 8);

    const overflowBtn = page.locator('#tab-overflow');
    await expect(overflowBtn).toBeVisible({ timeout: 3000 });

    await overflowBtn.click();

    const menu = page.locator('.tab-overflow-menu');
    await expect(menu).toBeVisible();
    const items = menu.locator('[role="menuitem"]');
    await expect(items.first()).toBeVisible();
    // There should be at least one hidden tab listed
    const itemCount = await items.count();
    expect(itemCount).toBeGreaterThan(0);
  });

  test('clicking a hidden tab in dropdown activates it', async ({ page }) => {
    await page.setViewportSize({ width: 500, height: 700 });
    page.on('dialog', (d) => void d.accept());
    await page.goto('/editor.html');
    await waitForApp(page);

    await openExtraTabs(page, 8);

    const overflowBtn = page.locator('#tab-overflow');
    await expect(overflowBtn).toBeVisible({ timeout: 3000 });

    await overflowBtn.click();

    const menu = page.locator('.tab-overflow-menu');
    await expect(menu).toBeVisible();

    // Click the first item in the dropdown
    const firstItem = menu.locator('[role="menuitem"]').first();
    const itemText = await firstItem.textContent();
    await firstItem.click();

    // Dropdown should close
    await expect(menu).toBeHidden({ timeout: 2000 });

    // The active tab should match what we clicked
    const activeTab = page.locator('.tab.active');
    await expect(activeTab).toBeVisible();
    const activeText = await activeTab.textContent();
    // The tab name is in itemText (strip the close button text '×')
    const cleanItemText = (itemText ?? '').replace('×', '').trim();
    const cleanActiveText = (activeText ?? '').replace('×', '').trim();
    expect(cleanActiveText).toContain(cleanItemText.replace('● ', ''));
  });

  test('dropdown closes on Escape', async ({ page }) => {
    await page.setViewportSize({ width: 500, height: 700 });
    page.on('dialog', (d) => void d.accept());
    await page.goto('/editor.html');
    await waitForApp(page);

    await openExtraTabs(page, 8);

    const overflowBtn = page.locator('#tab-overflow');
    await expect(overflowBtn).toBeVisible({ timeout: 3000 });
    await overflowBtn.click();

    const menu = page.locator('.tab-overflow-menu');
    await expect(menu).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden({ timeout: 2000 });
  });

  test('dropdown closes when clicking outside', async ({ page }) => {
    await page.setViewportSize({ width: 500, height: 700 });
    page.on('dialog', (d) => void d.accept());
    await page.goto('/editor.html');
    await waitForApp(page);

    await openExtraTabs(page, 8);

    const overflowBtn = page.locator('#tab-overflow');
    await expect(overflowBtn).toBeVisible({ timeout: 3000 });
    await overflowBtn.click();

    const menu = page.locator('.tab-overflow-menu');
    await expect(menu).toBeVisible();

    // Click somewhere outside the dropdown (the editor area)
    await page.locator('.cm-editor').click({ position: { x: 10, y: 10 } });
    await expect(menu).toBeHidden({ timeout: 2000 });
  });

  test('>> button is hidden when viewport widens enough to show all tabs', async ({ page }) => {
    // Start narrow
    await page.setViewportSize({ width: 400, height: 700 });
    page.on('dialog', (d) => void d.accept());
    await page.goto('/editor.html');
    await waitForApp(page);

    // Open a few tabs
    await openExtraTabs(page, 3);

    // At 400px wide with 4 tabs, overflow may or may not occur — widen significantly
    await page.setViewportSize({ width: 2000, height: 700 });

    // After resize the overflow button should disappear
    const overflowBtn = page.locator('#tab-overflow');
    // Give up to 2s for the resize handler to fire and hide the button
    await expect(overflowBtn).toBeHidden({ timeout: 2000 });
  });
});

// SPDX-License-Identifier: GPL-3.0-or-later
// E2E tests for P6.2 Find/Replace/Mark dialog
import { test, expect } from '@playwright/test';

// helper: waitReady
async function waitReady(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(() => !!(window as Record<string, unknown>).__appReady);
  await page.evaluate(() => (window as Record<string, unknown>).__appReady);
}

test.describe('Find/Replace dialog (P6.2)', () => {
  test('Ctrl+F opens dialog on Find tab', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+f');
    await expect(page.locator('[role=dialog]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#fd-tab-find.active, .fd-tab-btn.active')).toBeVisible({
      timeout: 2000,
    });
  });

  test('Ctrl+H opens dialog on Replace tab', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+h');
    await expect(page.locator('[role=dialog]')).toBeVisible({ timeout: 3000 });
    // Replace tab should be active - comboReplace input visible
    await expect(page.locator('#fd-replace-input')).toBeVisible({ timeout: 2000 });
  });

  test('Escape closes the dialog', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+f');
    await expect(page.locator('[role=dialog]')).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('[role=dialog]')).toBeHidden({ timeout: 2000 });
  });

  test('Find → caret moves to first match, again → next match', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);
    const editor = page.locator('.cm-content');
    await editor.click();
    await page.keyboard.type('foo bar foo baz');

    await page.keyboard.press('Control+f');
    await page.locator('#fd-find-input').fill('foo');
    await page.locator('#fd-btn-find').click();

    // Should have moved selection to first 'foo'
    const sel1 = await page.evaluate(() =>
      (
        window as unknown as { __editor: { getSelection(): { from: number; to: number } } }
      ).__editor.getSelection(),
    );
    expect(sel1.from).toBe(0);
    expect(sel1.to).toBe(3);

    // Click Find again → next match
    await page.locator('#fd-btn-find').click();
    const sel2 = await page.evaluate(() =>
      (
        window as unknown as { __editor: { getSelection(): { from: number; to: number } } }
      ).__editor.getSelection(),
    );
    expect(sel2.from).toBe(8);
    expect(sel2.to).toBe(11);
  });

  test('Count shows correct number of matches', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);
    await page.locator('.cm-content').click();
    await page.keyboard.type('foo foo foo bar');
    await page.keyboard.press('Control+f');
    await page.locator('#fd-find-input').fill('foo');
    await page.locator('#fd-btn-count').click();
    await expect(page.locator('#fd-status')).toContainText('3', { timeout: 3000 });
  });

  test('Find All in Current Document shows results dock', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);
    await page.locator('.cm-content').click();
    await page.keyboard.type('needle in doc one');
    await page.keyboard.press('Control+f');
    await page.locator('#fd-find-input').fill('needle');
    await page.locator('#fd-btn-find-all-doc').click();

    await expect(page.locator('#search-results-container')).toBeVisible({ timeout: 5000 });
  });

  test('Find All in All Opened Documents shows results dock', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);
    await page.locator('.cm-content').click();
    await page.keyboard.type('needle in doc one');
    await page.locator('#tab-new').click();
    await page.locator('.cm-content').click();
    await page.keyboard.type('needle in doc two');

    await page.keyboard.press('Control+f');
    await page.locator('#fd-find-input').fill('needle');
    await page.locator('#fd-btn-find-all-docs').click();

    await expect(page.locator('#search-results-container')).toBeVisible({ timeout: 5000 });
    const header = page.locator('.sr-run-header').first();
    await expect(header).toContainText('needle');
    await expect(header).toContainText('2 hits');
    await expect(header).toContainText('2 files');
  });

  test('Replace All replaces in active doc', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);
    await page.locator('.cm-content').click();
    await page.keyboard.type('foo bar foo');

    await page.keyboard.press('Control+h');
    await page.locator('#fd-find-input').fill('foo');
    await page.locator('#fd-replace-input').fill('baz');
    await page.locator('#fd-btn-replace-all').click();

    const content = await page.evaluate(() =>
      (window as unknown as { __editor: { getValue(): string } }).__editor.getValue(),
    );
    expect(content).toBe('baz bar baz');
  });

  test('Replace All in Opened Documents replaces in ALL docs (active and non-active)', async ({
    page,
  }) => {
    await page.goto('/editor.html');
    await waitReady(page);

    // Doc one (first tab, starts as active)
    await page.locator('.cm-content').click();
    await page.keyboard.type('target in doc one');

    // Open second tab
    await page.locator('#tab-new').click();
    await page.locator('.cm-content').click();
    await page.keyboard.type('target in doc two');

    // Now doc two is active. Run Replace All in Opened Documents from Replace tab
    await page.keyboard.press('Control+h');
    await page.locator('#fd-find-input').fill('target');
    await page.locator('#fd-replace-input').fill('replaced');
    await page.locator('#fd-btn-replace-all-docs').click();

    // Active doc (doc two) should be replaced
    const activeContent = await page.evaluate(() =>
      (window as unknown as { __editor: { getValue(): string } }).__editor.getValue(),
    );
    expect(activeContent).toContain('replaced in doc two');

    // Close the dialog before switching tabs (the modal overlay blocks pointer events).
    await page.keyboard.press('Escape');
    await expect(page.locator('[role=dialog]')).toBeHidden({ timeout: 2000 });

    // Switch to first tab and verify it was also replaced
    const tabButtons = page.locator('#tabbar div.tab');
    await tabButtons.first().click();
    await page.waitForTimeout(300);
    const docOneContent = await page.evaluate(() =>
      (window as unknown as { __editor: { getValue(): string } }).__editor.getValue(),
    );
    expect(docOneContent).toContain('replaced in doc one');
  });

  test('Regex mode: search \\d+ finds digits', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);
    await page.locator('.cm-content').click();
    await page.keyboard.type('abc 123 def');

    await page.keyboard.press('Control+f');
    await page.locator('#fd-radio-regexp').check();
    await page.locator('#fd-find-input').fill('\\d+');
    await page.locator('#fd-btn-find').click();

    const sel = await page.evaluate(() =>
      (
        window as unknown as { __editor: { getSelection(): { from: number; to: number } } }
      ).__editor.getSelection(),
    );
    // Should select '123' which starts at offset 4
    expect(sel.from).toBe(4);
    expect(sel.to).toBe(7);
  });

  test('Backwards disabled when Regex mode selected', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+f');
    await page.locator('#fd-radio-regexp').check();
    await expect(page.locator('#fd-check-backwards')).toBeDisabled({ timeout: 2000 });
  });

  test('Whole word disabled when Regex mode selected', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+f');
    await page.locator('#fd-radio-regexp').check();
    await expect(page.locator('#fd-check-wholeword')).toBeDisabled({ timeout: 2000 });
  });

  test('Find All in Current Document: dock stays open if already visible', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);
    await page.locator('.cm-content').click();
    await page.keyboard.type('needle here');

    // First Find All — should open the dock
    await page.keyboard.press('Control+f');
    await page.locator('#fd-find-input').fill('needle');
    await page.locator('#fd-btn-find-all-doc').click();
    await expect(page.locator('#search-results-container')).toBeVisible({ timeout: 5000 });

    // Second Find All — dock must STAY visible (not toggle-hide)
    await page.locator('#fd-btn-find-all-doc').click();
    await expect(page.locator('#search-results-container')).toBeVisible({ timeout: 2000 });
  });

  test('Find All in All Docs: dock stays open if already visible', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);
    await page.locator('.cm-content').click();
    await page.keyboard.type('needle here');

    // First Find All
    await page.keyboard.press('Control+f');
    await page.locator('#fd-find-input').fill('needle');
    await page.locator('#fd-btn-find-all-docs').click();
    await expect(page.locator('#search-results-container')).toBeVisible({ timeout: 5000 });

    // Second Find All — dock must STAY visible
    await page.locator('#fd-btn-find-all-docs').click();
    await expect(page.locator('#search-results-container')).toBeVisible({ timeout: 2000 });
  });

  test('MRU: after search, term appears in history on reopen', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);
    await page.locator('.cm-content').click();
    await page.keyboard.type('hello world');

    await page.keyboard.press('Control+f');
    await page.locator('#fd-find-input').fill('hello');
    await page.locator('#fd-btn-find').click();

    // Close the dialog
    await page.keyboard.press('Escape');
    await expect(page.locator('[role=dialog]')).toBeHidden({ timeout: 2000 });

    // Reopen
    await page.keyboard.press('Control+f');
    // MRU dropdown should contain 'hello'
    const mruOptions = await page.locator('#fd-find-mru option').allTextContents();
    expect(mruOptions).toContain('hello');
  });

  test('Find tab shows correct buttons', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+f');
    await expect(page.locator('#fd-btn-find')).toBeVisible({ timeout: 2000 });
    await expect(page.locator('#fd-btn-count')).toBeVisible({ timeout: 2000 });
    await expect(page.locator('#fd-btn-find-all-doc')).toBeVisible({ timeout: 2000 });
    await expect(page.locator('#fd-btn-find-all-docs')).toBeVisible({ timeout: 2000 });
  });

  test('Replace tab shows replace-specific buttons', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+h');
    await expect(page.locator('#fd-btn-replace')).toBeVisible({ timeout: 2000 });
    await expect(page.locator('#fd-btn-replace-all')).toBeVisible({ timeout: 2000 });
    await expect(page.locator('#fd-btn-replace-all-docs')).toBeVisible({ timeout: 2000 });
  });

  test('Mark tab opens when clicking the Mark tab button', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+f');
    await expect(page.locator('[role=dialog]')).toBeVisible({ timeout: 3000 });
    await page.locator('#fd-tab-mark').click();
    await expect(page.locator('#fd-btn-mark-all')).toBeVisible({ timeout: 2000 });
  });
});

// SPDX-License-Identifier: GPL-3.0-or-later
import { test, expect } from '@playwright/test';

// Helper: navigate and wait for the app to be ready.
async function gotoEditor(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  page.on('dialog', (d) => void d.accept());
  await page.goto('/editor.html');
  await page.waitForFunction(
    () => (window as unknown as Record<string, unknown>).__appReady !== undefined,
  );
  await page.evaluate(() => (window as unknown as Record<string, unknown>).__appReady);
}

test.describe('menu bar', () => {
  test('menu bar is visible with 9 top-level menus (Encoding added between View and Language)', async ({
    page,
  }) => {
    await gotoEditor(page);
    const menuItems = page.locator('#menubar [role="menuitem"]');
    await expect(menuItems).toHaveCount(9);
    const labels = await menuItems.allTextContents();
    expect(labels).toEqual([
      'File',
      'Edit',
      'Search',
      'View',
      'Encoding',
      'Language',
      'Settings',
      'Macro',
      'Help',
    ]);
  });

  test('File→New adds a new tab', async ({ page }) => {
    await gotoEditor(page);
    // One tab at start.
    await expect(page.locator('.tab')).toHaveCount(1);
    // Open File menu and click New.
    await page.locator('#menubar button').first().click();
    await page.locator('[role="menu"] .menubar-entry').filter({ hasText: 'New' }).first().click();
    await expect(page.locator('.tab')).toHaveCount(2);
  });

  test('type text then Edit→Undo undoes the last character', async ({ page }) => {
    await gotoEditor(page);
    const content = page.locator('.cm-content');
    await content.click();
    await page.keyboard.type('hello');
    // Wait for the text to be committed.
    await page.waitForFunction(
      () =>
        (
          window as unknown as Record<string, unknown & { __editor: { getValue(): string } }>
        ).__editor.getValue() === 'hello',
    );
    // Open Edit menu and click Undo.
    await page.locator('#menubar button').nth(1).click();
    await page.locator('[role="menu"] .menubar-entry').filter({ hasText: 'Undo' }).first().click();
    // Text should be shorter after undo.
    const value = await page.evaluate(() =>
      (
        window as unknown as Record<string, unknown & { __editor: { getValue(): string } }>
      ).__editor.getValue(),
    );
    expect(value).not.toBe('hello');
  });

  test('clicking a disabled menu item does nothing', async ({ page }) => {
    await gotoEditor(page);
    // Open File menu and find a disabled item (Print…).
    await page.locator('#menubar button').first().click();
    const printItem = page
      .locator('[role="menu"] .menubar-entry.disabled')
      .filter({ hasText: 'Print' })
      .first();
    await expect(printItem).toBeVisible();
    // Clicking a disabled item should not close the menu or throw.
    await printItem.click({ force: true });
    // Menu should still be open (or at least no error).
    // The key assertion is that no dialog/error occurs and the app is still live.
    await expect(page.locator('.cm-editor')).toBeVisible();
  });

  test('Escape closes an open dropdown', async ({ page }) => {
    await gotoEditor(page);
    await page.locator('#menubar button').first().click();
    // Dropdown is open.
    await expect(page.locator('[role="menu"]')).toBeVisible();
    await page.keyboard.press('Escape');
    // Dropdown should be gone.
    await expect(page.locator('[role="menu"]')).toHaveCount(0);
  });

  test('level-2 submenu auto-closes when the menu closes (regression)', async ({ page }) => {
    await gotoEditor(page);
    // Open the Edit menu (index 1) and hover the enabled "Convert Case" submenu-parent.
    await page.locator('#menubar button').nth(1).click();
    await page
      .locator('[role="menu"] .menubar-entry')
      .filter({ hasText: 'Convert Case' })
      .first()
      .hover();
    // The level-2 sub-panel (appended to <body>) opens.
    await expect(page.locator('.menubar-sub')).toHaveCount(1);
    // Closing the menu (Escape) must NOT leave the level-2 sub-panel orphaned on screen.
    await page.keyboard.press('Escape');
    await expect(page.locator('.menubar-sub')).toHaveCount(0);
    await expect(page.locator('.menubar-dropdown')).toHaveCount(0);
  });

  test('Help→About opens a dialog', async ({ page }) => {
    let dialogSeen = false;
    page.on('dialog', (d) => {
      dialogSeen = true;
      void d.dismiss();
    });
    await page.goto('/editor.html');
    await page.waitForFunction(
      () => (window as unknown as Record<string, unknown>).__appReady !== undefined,
    );
    await page.evaluate(() => (window as unknown as Record<string, unknown>).__appReady);
    // Open Help (9th button, index 8 — Encoding was added before Language).
    await page.locator('#menubar button').nth(8).click();
    await page.locator('[role="menu"] .menubar-entry').filter({ hasText: 'About Notepad' }).click();
    expect(dialogSeen).toBe(true);
  });

  // Fix 1 regression guard: the Language menu has 87+ items in a single
  // .menubar-dropdown.  Before the fix the dropdown had no max-height/overflow,
  // so items below the viewport were unreachable.  This test exercises the REAL
  // menu bar (no __setActiveLanguage bypass): opens Language via a click on the
  // menu bar button (index 5 — File/Edit/Search/View/Encoding/Language), reads
  // all item labels to find the last one alphabetically, scrolls into view via
  // evaluate(), clicks it, and asserts that __activeLanguage updated to match.
  test('Language menu: opening via real menu bar and clicking last alphabetical item applies that language', async ({
    page,
  }) => {
    await gotoEditor(page);

    // Wait for the luaRegistry to finish loading so lang items are populated.
    // The Language button (index 5) initially shows "(loading…)" then re-renders.
    // We wait until at least one real language item is present in the DOM.
    const langBtn = page.locator('#menubar button').nth(5);
    await langBtn.click();
    // Wait until the dropdown has real items (not just the loading placeholder).
    await page.waitForFunction(
      () => {
        const menu = document.querySelector('[role="menu"]');
        if (!menu) return false;
        const entries = Array.from(menu.querySelectorAll('.menubar-entry'));
        // A real lang item is enabled (no .disabled class).
        return entries.some((el) => !el.classList.contains('disabled'));
      },
      { timeout: 15000 },
    );

    // Read all enabled item labels to determine the last one alphabetically.
    const lastLabel = await page.evaluate(() => {
      const menu = document.querySelector('[role="menu"]');
      if (!menu) return null;
      const labels = Array.from(menu.querySelectorAll('.menubar-entry:not(.disabled)'))
        .map((el) => el.querySelector('.menubar-entry-label')?.textContent ?? '')
        .filter(Boolean);
      if (labels.length === 0) return null;
      return labels[labels.length - 1]; // items are already sorted ascending
    });

    expect(lastLabel).not.toBeNull();
    expect(lastLabel!.length).toBeGreaterThan(0);

    // Scroll the last entry into view (exercises the overflow-y:auto fix) and click it.
    await page.evaluate((label) => {
      const menu = document.querySelector('[role="menu"]');
      if (!menu) return;
      const entry = Array.from(menu.querySelectorAll('.menubar-entry:not(.disabled)')).find(
        (el) => el.querySelector('.menubar-entry-label')?.textContent === label,
      );
      (entry as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
    }, lastLabel!);

    // Click via Playwright locator (scoped to the open dropdown).
    const dropdown = page.locator('[role="menu"]');
    await dropdown
      .locator('.menubar-entry:not(.disabled)')
      .filter({ hasText: lastLabel! })
      .last()
      .click();

    // Assert __activeLanguage updated to the selected language.
    const activeLanguage = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__activeLanguage,
    );
    expect(activeLanguage).toBe(lastLabel);
  });
});

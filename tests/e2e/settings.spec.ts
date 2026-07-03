// SPDX-License-Identifier: GPL-3.0-or-later
import { test, expect } from '@playwright/test';

test.describe('settings', () => {
  test('settings panel changes font size', async ({ page }) => {
    await page.goto('/editor.html');
    await page.waitForFunction(
      () => (window as unknown as Record<string, unknown>).__appReady !== undefined,
    );
    await page.evaluate(() => (window as unknown as Record<string, unknown>).__appReady);

    // Open the settings panel via keyboard shortcut.
    await page.locator('.cm-content').first().focus();
    await page.keyboard.press('ControlOrMeta+Comma');

    // Set font size to 20 and save.
    await page.locator('#set-font').fill('20');
    await page.locator('#set-save').click();

    // Use the CM6 __getFontSize() hook (reads view.dom.style.fontSize set by applySettings).
    const fontSize = await page.evaluate(() =>
      (window as unknown as Record<string, unknown & { __getFontSize(): number }>).__getFontSize(),
    );
    expect(Number(fontSize)).toBe(20);
  });

  test('settings panel changes tab size and it is reflected in CM6 state', async ({ page }) => {
    await page.goto('/editor.html');
    await page.waitForFunction(
      () => (window as unknown as Record<string, unknown>).__appReady !== undefined,
    );
    await page.evaluate(() => (window as unknown as Record<string, unknown>).__appReady);

    // Open settings and change tab size to 2.
    await page.locator('.cm-content').first().focus();
    await page.keyboard.press('ControlOrMeta+Comma');
    await page.locator('#set-tab').fill('2');
    await page.locator('#set-save').click();

    // CM6 writes the EditorState.tabSize facet as the CSS tab-size property on
    // .cm-content (the contenteditable element).  Wait until that updates.
    await page.waitForFunction(
      () => {
        const content = document.querySelector('.cm-content') as HTMLElement | null;
        if (!content) return false;
        return getComputedStyle(content).tabSize === '2';
      },
      { timeout: 3000 },
    );

    const tabSize = await page.evaluate(() => {
      const content = document.querySelector('.cm-content') as HTMLElement | null;
      if (!content) return null;
      return getComputedStyle(content).tabSize ?? null;
    });

    // tabSize should be '2' (CSS tab-size is set by CM6 from EditorState.tabSize).
    expect(String(tabSize)).toBe('2');
  });

  test('settings panel toggles word wrap', async ({ page }) => {
    await page.goto('/editor.html');
    await page.waitForFunction(
      () => (window as unknown as Record<string, unknown>).__appReady !== undefined,
    );
    await page.evaluate(() => (window as unknown as Record<string, unknown>).__appReady);

    // Open settings and enable word wrap.
    await page.locator('.cm-content').first().focus();
    await page.keyboard.press('ControlOrMeta+Comma');
    const wrapCheckbox = page.locator('#set-wrap');
    // Ensure it starts unchecked, then check it.
    await wrapCheckbox.check();
    await page.locator('#set-save').click();

    // When lineWrapping is active, CM6 adds .cm-lineWrapping to the content element.
    await expect(page.locator('.cm-content.cm-lineWrapping')).toBeVisible({ timeout: 3000 });
  });

  test('new tab opened after enabling word wrap inherits the setting', async ({ page }) => {
    // This test covers the previously broken behaviour where EditorController.showDoc()
    // always seeded new document states with empty compartments (CM6 defaults), so
    // settings applied mid-session were not inherited by tabs opened afterwards.
    await page.goto('/editor.html');
    await page.waitForFunction(
      () => (window as unknown as Record<string, unknown>).__appReady !== undefined,
    );
    await page.evaluate(() => (window as unknown as Record<string, unknown>).__appReady);

    // Open settings and enable word wrap.
    await page.locator('.cm-content').first().focus();
    await page.keyboard.press('ControlOrMeta+Comma');
    const wrapCheckbox = page.locator('#set-wrap');
    await wrapCheckbox.check();
    await page.locator('#set-save').click();

    // Confirm word wrap is active on the current tab first.
    await expect(page.locator('.cm-content.cm-lineWrapping')).toBeVisible({ timeout: 3000 });

    // Open a NEW tab — this exercises the showDoc() path for a fresh document state.
    await page.locator('#tab-new').click();

    // Accept any dirty-close confirmation dialog that may appear.
    page.on('dialog', (dialog) => void dialog.accept());

    // The new tab's editor must also have cm-lineWrapping — previously this would
    // fail because showDoc() seeded the new state with wrapCompartment.of([]).
    await expect(page.locator('.cm-content.cm-lineWrapping')).toBeVisible({ timeout: 3000 });
  });

  test('new tab opened after changing tab size inherits the setting', async ({ page }) => {
    // Mirror of the word-wrap cross-tab test, but for tabSize.
    await page.goto('/editor.html');
    await page.waitForFunction(
      () => (window as unknown as Record<string, unknown>).__appReady !== undefined,
    );
    await page.evaluate(() => (window as unknown as Record<string, unknown>).__appReady);

    // Change tab size to 2.
    await page.locator('.cm-content').first().focus();
    await page.keyboard.press('ControlOrMeta+Comma');
    await page.locator('#set-tab').fill('2');
    await page.locator('#set-save').click();

    // Confirm tab size is active on current tab.
    await page.waitForFunction(
      () => {
        const content = document.querySelector('.cm-content') as HTMLElement | null;
        return content ? getComputedStyle(content).tabSize === '2' : false;
      },
      { timeout: 3000 },
    );

    // Open a new tab and confirm the new tab also has tab-size: 2.
    await page.locator('#tab-new').click();
    page.on('dialog', (dialog) => void dialog.accept());

    await page.waitForFunction(
      () => {
        const content = document.querySelector('.cm-content') as HTMLElement | null;
        return content ? getComputedStyle(content).tabSize === '2' : false;
      },
      { timeout: 3000 },
    );

    const tabSize = await page.evaluate(() => {
      const content = document.querySelector('.cm-content') as HTMLElement | null;
      return content ? getComputedStyle(content).tabSize : null;
    });
    expect(String(tabSize)).toBe('2');
  });
});

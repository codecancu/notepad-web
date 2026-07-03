// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * E2E regression for BUG-13: pressing Tab inside the editor must INDENT
 * (insert the indent unit), not move focus out of the editor. Shift+Tab dedents.
 * Enabled by `indentWithTab` in the editor keymap (below the completion Tab, so
 * autocomplete-accept still wins when the popup is open).
 */
import { test, expect } from '@playwright/test';

type WinExt = Window & { __appReady: unknown; __editor: { getValue(): string } };

async function gotoEditor(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  page.on('dialog', (d) => void d.accept());
  await page.goto('/editor.html');
  await page.waitForFunction(() => (window as unknown as WinExt).__appReady !== undefined);
  await page.evaluate(() => (window as unknown as WinExt).__appReady);
  const content = page.locator('.cm-content').first();
  await content.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
}

async function getValue(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  return page.evaluate(() => (window as unknown as WinExt).__editor.getValue());
}

test.describe('Tab indents in the editor (BUG-13)', () => {
  test('Tab at line start inserts the indent unit (does not move focus away)', async ({ page }) => {
    await gotoEditor(page);
    await page.keyboard.type('abc');
    // Move caret to the start of the line, then press Tab.
    await page.keyboard.press('Home');
    await page.keyboard.press('Tab');
    const val = await getValue(page);
    // The line is now indented (leading whitespace) — Tab did NOT blur the editor.
    expect(val).toMatch(/^\s+abc$/);
    // The editor still holds focus (a contenteditable inside .cm-content).
    const editorFocused = await page.evaluate(
      () => document.activeElement?.closest('.cm-editor') != null,
    );
    expect(editorFocused).toBe(true);
  });

  test('Shift+Tab dedents an indented line', async ({ page }) => {
    await gotoEditor(page);
    await page.keyboard.type('abc');
    await page.keyboard.press('Home');
    await page.keyboard.press('Tab');
    expect(await getValue(page)).toMatch(/^\s+abc$/);
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+Tab');
    expect(await getValue(page)).toBe('abc');
  });
});

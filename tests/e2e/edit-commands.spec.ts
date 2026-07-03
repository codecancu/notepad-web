// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * E2E tests for Edit-menu actions (line ops, convert case, EOL, comment, encode).
 *
 * Pattern: navigate to /editor.html, wait for __appReady, type multiline text,
 * select all, trigger the action via the menu, then assert on __editor.getValue().
 */
import { test, expect } from '@playwright/test';

type WinExt = Window & {
  __appReady: unknown;
  __editor: { getValue(): string };
};

/** Navigate and wait for the editor to be fully ready. */
async function gotoEditor(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  page.on('dialog', (d) => void d.accept());
  await page.goto('/editor.html');
  await page.waitForFunction(() => (window as unknown as WinExt).__appReady !== undefined);
  await page.evaluate(() => (window as unknown as WinExt).__appReady);
}

/** Get the editor's current text. */
async function getValue(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  return page.evaluate(() => (window as unknown as WinExt).__editor.getValue());
}

// ── Sort Lines Ascending ──────────────────────────────────────────────────────

test('Edit → Sort Lines Ascending sorts the selected lines', async ({ page }) => {
  await gotoEditor(page);
  const content = page.locator('.cm-content');
  await content.click();
  // Type three lines in unsorted order.
  await page.keyboard.type('banana');
  await page.keyboard.press('Enter');
  await page.keyboard.type('apple');
  await page.keyboard.press('Enter');
  await page.keyboard.type('cherry');

  // Select all.
  await page.keyboard.press('ControlOrMeta+A');

  // Open Edit → Line Operations → Sort Lines Ascending.
  await page.locator('#menubar button').nth(1).click();
  const lineOps = page
    .locator('[role="menu"] .menubar-entry')
    .filter({ hasText: 'Line Operations' })
    .first();
  await lineOps.hover();
  const sortItem = page
    .locator('[role="menu"] .menubar-entry')
    .filter({ hasText: 'Sort Lines Ascending' })
    .first();
  await sortItem.click();

  const text = await getValue(page);
  const lines = text.split('\n');
  expect(lines[0]).toBe('apple');
  expect(lines[1]).toBe('banana');
  expect(lines[2]).toBe('cherry');
});

// ── Convert Case: UPPER CASE ──────────────────────────────────────────────────

test('Edit → Convert Case → UPPER CASE converts selection to uppercase', async ({ page }) => {
  await gotoEditor(page);
  const content = page.locator('.cm-content');
  await content.click();
  await page.keyboard.type('hello world');

  // Select all.
  await page.keyboard.press('ControlOrMeta+A');

  // Open Edit → Convert Case → UPPER CASE.
  await page.locator('#menubar button').nth(1).click();
  const convertCase = page
    .locator('[role="menu"] .menubar-entry')
    .filter({ hasText: 'Convert Case' })
    .first();
  await convertCase.hover();
  const upperItem = page
    .locator('[role="menu"] .menubar-entry')
    .filter({ hasText: 'UPPER CASE' })
    .first();
  await upperItem.click();

  const text = await getValue(page);
  expect(text).toBe('HELLO WORLD');
});

// ── Base64 Encode ─────────────────────────────────────────────────────────────

test('Edit → Encoding/Decoding → Base64 Encode encodes the selection', async ({ page }) => {
  await gotoEditor(page);
  const content = page.locator('.cm-content');
  await content.click();
  await page.keyboard.type('hello');

  // Select all.
  await page.keyboard.press('ControlOrMeta+A');

  await page.locator('#menubar button').nth(1).click();
  const encDec = page
    .locator('[role="menu"] .menubar-entry')
    .filter({ hasText: 'Encoding/Decoding' })
    .first();
  await encDec.hover();
  const encItem = page
    .locator('[role="menu"] .menubar-entry')
    .filter({ hasText: 'Base64 Encode' })
    .first();
  await encItem.click();

  const text = await getValue(page);
  expect(text).toBe('aGVsbG8=');
});

// ── Toggle Single Line Comment (Ctrl+/) ───────────────────────────────────────

test('Edit → Comment/Uncomment → Toggle Single Line Comment adds // on a JS doc', async ({
  page,
}) => {
  // Open a .js file so the language is JavaScript (singleLineComment = '//')
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).showOpenFilePicker = async () => [
      {
        name: 'test.js',
        getFile: async () => new File(['function foo() {}\n'], 'test.js'),
      },
    ];
  });

  await gotoEditor(page);

  // Open the JS file via Ctrl+O.
  await page.locator('.cm-content').first().focus();
  await page.keyboard.press('ControlOrMeta+O');
  await expect(page.locator('.tab', { hasText: 'test.js' })).toBeVisible({ timeout: 5000 });

  // Select all the content.
  await page.keyboard.press('ControlOrMeta+A');

  // Open Edit → Comment/Uncomment → Toggle Single Line Comment.
  await page.locator('#menubar button').nth(1).click();
  const commentMenu = page
    .locator('[role="menu"] .menubar-entry')
    .filter({ hasText: 'Comment/Uncomment' })
    .first();
  await commentMenu.hover();
  const toggleItem = page
    .locator('[role="menu"] .menubar-entry')
    .filter({ hasText: 'Toggle Single Line Comment' })
    .first();
  await toggleItem.click();

  const text = await getValue(page);
  // The JS singleLineComment token is "// " (with trailing space), so expect that prefix.
  expect(text).toContain('// function foo() {}');
});

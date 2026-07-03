// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * E2E tests for Phase-4 CM6 decorator extensions:
 *   BraceMatch    → bracketMatching()          — .cm-matchingBracket
 *   SmartHighlighter → highlightSelectionMatches() — .cm-selectionMatch
 *   AutoCompletion → autocompletion(wordCompletionSource) — .cm-tooltip-autocomplete
 *   SurroundSelection → closeBrackets()         — wraps selection with bracket
 */
import { test, expect } from '@playwright/test';

/** Wait for __appReady so all panels and session init complete. */
async function waitForApp(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/editor.html');
  await page.waitForFunction(
    () => (window as unknown as Record<string, unknown>).__appReady !== undefined,
  );
  await page.evaluate(() => (window as unknown as Record<string, unknown>).__appReady);
}

test.describe('CM6 decorator extensions (Phase-4)', () => {
  test('SmartHighlighter: typing a repeated word shows .cm-selectionMatch on occurrences', async ({
    page,
  }) => {
    await waitForApp(page);
    const content = page.locator('.cm-content');
    await content.click();

    // Type a word that repeats several times in the document.
    await page.keyboard.type('hello hello hello');

    // Place the caret inside "hello" (double-click selects the word).
    // CM6 highlightSelectionMatches() highlights other occurrences when
    // the selection matches a whole word.
    await page.keyboard.press('Home');
    // Select the first "hello" by double-clicking it.
    await page.locator('.cm-line').first().dblclick();

    // Wait for .cm-selectionMatch to appear (other occurrences highlighted).
    await page.waitForFunction(() => document.querySelector('.cm-selectionMatch') !== null, {
      timeout: 5000,
    });

    const matchCount = await page.evaluate(
      () => document.querySelectorAll('.cm-selectionMatch').length,
    );
    // At least one other occurrence is highlighted (we have 3 "hello"s; one is
    // the selection itself, the other two get .cm-selectionMatch).
    expect(matchCount).toBeGreaterThanOrEqual(1);
  });

  test('AutoCompletion: typing a prefix that matches a doc word shows autocomplete tooltip', async ({
    page,
  }) => {
    await waitForApp(page);
    const content = page.locator('.cm-content');
    await content.click();

    // Type a long enough word so wordCompletionSource registers it (≥4 chars).
    await page.keyboard.type('calculateTotal(x) ');

    // Now type the prefix — autocomplete should suggest "calculateTotal".
    await page.keyboard.type('calc');

    // Trigger explicit completion with Ctrl+Space (completionKeymap).
    await page.keyboard.press('Control+Space');

    // Wait for the autocomplete tooltip to appear.
    await page.waitForFunction(() => document.querySelector('.cm-tooltip-autocomplete') !== null, {
      timeout: 5000,
    });

    const tooltipVisible = await page.locator('.cm-tooltip-autocomplete').isVisible();
    expect(tooltipVisible).toBe(true);

    // Verify "calculateTotal" is listed in the suggestions.
    const tooltipText = await page.locator('.cm-tooltip-autocomplete').innerText();
    expect(tooltipText).toContain('calculateTotal');

    // Dismiss autocomplete.
    await page.keyboard.press('Escape');
  });

  test('SurroundSelection/closeBrackets: typing ( with selection wraps it', async ({ page }) => {
    await waitForApp(page);
    const content = page.locator('.cm-content');
    await content.click();

    // Type some text and select a word.
    await page.keyboard.type('hello world');
    // Select "world" using keyboard (Shift+Home then extend — simpler: go to end,
    // Shift+Left 5 times to select "world").
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Shift+ArrowLeft');
    }

    // Type a bracket — closeBrackets() should wrap the selection.
    await page.keyboard.type('(');

    // After wrapping, the document should contain "(world)".
    const value = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__editor.getValue() as string,
    );
    expect(value).toContain('(world)');
  });

  test('closeBrackets: typing ( without selection inserts () with cursor between', async ({
    page,
  }) => {
    await waitForApp(page);
    const content = page.locator('.cm-content');
    await content.click();

    // With no selection, type "(" — closeBrackets auto-closes to "()".
    await page.keyboard.type('(');

    const value = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__editor.getValue() as string,
    );
    expect(value).toContain('()');
  });

  test('BraceMatch: bracket matching highlight appears (.cm-matchingBracket)', async ({ page }) => {
    await waitForApp(page);
    const content = page.locator('.cm-content');
    await content.click();

    // Type a matched bracket pair.
    await page.keyboard.type('(hello)');
    // Position caret at the opening bracket by going to the start, then right once.
    await page.keyboard.press('Home');
    // The caret is before "(", move past it so the caret is between "(h..." and the bracket match fires.
    // CM6 bracketMatching() highlights the bracket at or adjacent to the caret.

    // Wait for .cm-matchingBracket to appear.
    await page.waitForFunction(() => document.querySelector('.cm-matchingBracket') !== null, {
      timeout: 5000,
    });

    const hasBraceMatch = await page.evaluate(
      () => document.querySelector('.cm-matchingBracket') !== null,
    );
    expect(hasBraceMatch).toBe(true);
  });
});

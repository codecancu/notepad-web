// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * E2E tests for CM6 language detection + Notepad++ colour highlighting.
 *
 * These tests verify that:
 *  1. Opening a .js file detects the JavaScript language (CM6 parser loads).
 *  2. A keyword token in the rendered editor receives the faithful Notepad++
 *     keyword colour (#0000ff / rgb(0,0,255)) via the syntaxHighlighting
 *     extension — confirmed by checking that a .cm-keyword (or any element
 *     with the keyword class) has the correct computed color.
 *
 * Implementation note: CM6's highlight classes are applied via injected CSS
 * (the HighlightStyle injects <style> tags whose rules target generated class
 * names like `.ͼ1`).  We locate the token span by its aria role or by walking
 * the DOM for spans with a colour matching the Notepad++ canonical value.
 *
 * Flakiness fix: replaced waitForTimeout(300) with waitForFunction polling so
 * the test waits until CM6 has actually injected the colour rather than using
 * a fixed time delay.
 */
import { test, expect } from '@playwright/test';

const KEYWORD_COLOR_RGB = 'rgb(0, 0, 255)'; // #0000ff

/** Poll until a span with the expected color appears in .cm-line, or timeout. */
async function waitForKeywordColor(
  page: import('@playwright/test').Page,
  expectedColor: string,
  timeout = 8000,
): Promise<string | null> {
  return page
    .waitForFunction(
      (color) => {
        const lines = document.querySelectorAll('.cm-line');
        for (const line of lines) {
          const spans = line.querySelectorAll('span');
          for (const span of spans) {
            if (window.getComputedStyle(span).color === color) return color;
          }
        }
        return null;
      },
      expectedColor,
      { timeout },
    )
    .then((h) => h.jsonValue() as Promise<string | null>)
    .catch(() => null);
}

test.describe('CM6 language detection + Notepad++ highlight', () => {
  test('JS file detected: keyword span rendered with Notepad++ blue', async ({ page }) => {
    // Intercept showOpenFilePicker to return a .js file with a keyword.
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>).showOpenFilePicker = async () => [
        {
          name: 'test.js',
          getFile: async () => new File(['function hello() { return 42; }\n'], 'test.js'),
        },
      ];
    });

    await page.goto('/editor.html');
    await page.waitForFunction(
      () => (window as unknown as Record<string, unknown>).__appReady !== undefined,
    );
    await page.evaluate(() => (window as unknown as Record<string, unknown>).__appReady);

    // Open the JS file via Ctrl+O.
    await page.locator('.cm-content').first().focus();
    await page.keyboard.press('ControlOrMeta+O');

    // Wait for the tab to appear.
    await expect(page.locator('.tab', { hasText: 'test.js' })).toBeVisible({ timeout: 5000 });

    // Poll until CM6 has tokenised and a keyword-colored span appears.
    // This replaces the fixed waitForTimeout(300) delay with a reliable condition.
    const keywordColor = await waitForKeywordColor(page, KEYWORD_COLOR_RGB);

    expect(keywordColor).toBe(KEYWORD_COLOR_RGB);
  });

  test('python file detected via extension: keyword colored blue', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>).showOpenFilePicker = async () => [
        {
          name: 'hello.py',
          getFile: async () => new File(['def greet():\n    return 42\n'], 'hello.py'),
        },
      ];
    });

    await page.goto('/editor.html');
    await page.waitForFunction(
      () => (window as unknown as Record<string, unknown>).__appReady !== undefined,
    );
    await page.evaluate(() => (window as unknown as Record<string, unknown>).__appReady);

    await page.locator('.cm-content').first().focus();
    await page.keyboard.press('ControlOrMeta+O');

    await expect(page.locator('.tab', { hasText: 'hello.py' })).toBeVisible({ timeout: 5000 });

    // Poll until CM6 has tokenised and a keyword-colored span appears.
    const keywordColor = await waitForKeywordColor(page, KEYWORD_COLOR_RGB);

    expect(keywordColor).toBe(KEYWORD_COLOR_RGB);
  });

  test('langCompartment is set when opening a .js file (language compartment wired)', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>).showOpenFilePicker = async () => [
        {
          name: 'app.js',
          getFile: async () => new File(['const x = 1;\n'], 'app.js'),
        },
      ];
    });

    await page.goto('/editor.html');
    await page.waitForFunction(
      () => (window as unknown as Record<string, unknown>).__appReady !== undefined,
    );
    await page.evaluate(() => (window as unknown as Record<string, unknown>).__appReady);

    await page.locator('.cm-content').first().focus();
    await page.keyboard.press('ControlOrMeta+O');

    await expect(page.locator('.tab', { hasText: 'app.js' })).toBeVisible({ timeout: 5000 });

    // Poll until CM6 has applied highlight classes to at least one span.
    await page.waitForFunction(
      () => {
        const lines = document.querySelectorAll('.cm-line');
        for (const line of lines) {
          if (line.querySelectorAll('span[class]').length > 0) return true;
        }
        return false;
      },
      { timeout: 8000 },
    );

    // Verify the CM6 editor has at least one highlighted span (syntax is active).
    const hasHighlightedSpans = await page.evaluate(() => {
      const lines = document.querySelectorAll('.cm-line');
      for (const line of lines) {
        if (line.querySelectorAll('span[class]').length > 0) return true;
      }
      return false;
    });

    expect(hasHighlightedSpans).toBe(true);
  });
});

// SPDX-License-Identifier: GPL-3.0-or-later
import { test, expect } from '@playwright/test';

test.describe('open-save', () => {
  test('opening a mocked file creates a tab with detected language', async ({ page }) => {
    // Intercept showOpenFilePicker to return a .py file so language detection runs.
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>).showOpenFilePicker = async () => [
        {
          name: 'demo.py',
          getFile: async () => new File(['print(1)\n'], 'demo.py'),
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

    // The tab should appear with the filename.
    await expect(page.locator('.tab', { hasText: 'demo.py' })).toBeVisible({ timeout: 5000 });

    // Use the CM6-compatible __activeLanguage hook (set via store subscription in
    // editor-page.ts) to assert Python was detected, instead of Monaco Model APIs.
    const lang = await page.waitForFunction(
      () => {
        const l = (window as unknown as Record<string, unknown>).__activeLanguage;
        return typeof l === 'string' && l !== 'plaintext' ? l : null;
      },
      { timeout: 5000 },
    );
    const langValue = await lang.jsonValue();
    expect((langValue as string).toLowerCase()).toContain('python');
  });

  /**
   * Proof test (Phase-2 Task 0): unification of language detection.
   *
   * .rb (Ruby) was present in luaRegistry (87-language faithful palette) but was
   * ABSENT from the old LanguageService DEFAULT_EXT_MAP (~22 entries).  Before
   * this refactor, opening a .rb file would show "plaintext" in the StatusBar
   * (from LanguageService) while the editor was syntax-highlighted as Ruby (from
   * luaRegistry).  After unification, BOTH the StatusBar label and CM6 highlighting
   * come from luaRegistry — this test asserts they agree.
   */
  test('ruby (.rb) file: StatusBar label matches registry (unification proof)', async ({
    page,
  }) => {
    // Intercept showOpenFilePicker to return a .rb file.
    // .rb is in luaRegistry but was absent from the old DEFAULT_EXT_MAP.
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>).showOpenFilePicker = async () => [
        {
          name: 'hello.rb',
          getFile: async () => new File(['def greet\n  puts "Hello"\nend\n'], 'hello.rb'),
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

    // Tab appears with the filename.
    await expect(page.locator('.tab', { hasText: 'hello.rb' })).toBeVisible({ timeout: 5000 });

    // 1) Assert __activeLanguage (driven by doc.languageId, set by EditorController
    //    via luaRegistry) reports 'Ruby' — not 'plaintext'.
    const lang = await page.waitForFunction(
      () => {
        const l = (window as unknown as Record<string, unknown>).__activeLanguage;
        return typeof l === 'string' && l !== 'plaintext' ? l : null;
      },
      { timeout: 8000 },
    );
    const langValue = (await lang.jsonValue()) as string;
    expect(langValue.toLowerCase()).toContain('ruby');

    // 2) Assert StatusBar shows the same registry-resolved label (not 'plaintext').
    //    The StatusBar reads doc.languageId, which EditorController now writes from
    //    luaRegistry — so they must always agree.
    const statusText = await page.locator('#statusbar').textContent();
    expect(statusText?.toLowerCase()).toContain('ruby');

    // 3) Assert CM6 has applied syntax highlighting spans (language parser loaded).
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

// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * E2E tests for the faithful Notepad++ light theme.
 *
 * Assertions use real getComputedStyle() (no mocks) to verify:
 *   1. .cm-editor background is white (rgb(255, 255, 255))
 *   2. Active tab has the npp.css peach/orange top border (rgb(255, 202, 176))
 *   3. Status bar is light (NOT the old VS Code blue — background is not dark)
 *   4. Tab bar background is light gray (rgb(192, 192, 192))
 *
 * Screenshots are not captured in this suite (CI runs headless); see the task
 * report for the manual verification note.
 */
import { test, expect } from '@playwright/test';

test.describe('Notepad++ light theme (P1.5)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/editor.html');
    await page.waitForFunction(
      () => (window as unknown as Record<string, unknown>).__appReady !== undefined,
    );
    await page.evaluate(() => (window as unknown as Record<string, unknown>).__appReady);
  });

  test('editor background is white (#ffffff → rgb(255, 255, 255))', async ({ page }) => {
    // CM6 sets background on .cm-editor (the `&` selector in EditorView.theme).
    // .cm-content is intentionally transparent; check .cm-editor instead.
    const bg = await page.evaluate(() => {
      const editor = document.querySelector('.cm-editor');
      if (!editor) return null;
      return window.getComputedStyle(editor).backgroundColor;
    });
    expect(bg).toBe('rgb(255, 255, 255)');
  });

  test('active tab has peach/orange top border (rgb(255, 202, 176))', async ({ page }) => {
    const borderColor = await page.evaluate(() => {
      const activeTab = document.querySelector('.tab.active');
      if (!activeTab) return null;
      return window.getComputedStyle(activeTab).borderTopColor;
    });
    expect(borderColor).toBe('rgb(255, 202, 176)');
  });

  test('status bar background is the npp.css light grey (#f0f0f0), not VS Code blue', async ({
    page,
  }) => {
    const bg = await page.evaluate(() => {
      const bar = document.getElementById('statusbar');
      if (!bar) return null;
      return window.getComputedStyle(bar).backgroundColor;
    });
    // Exact value from styles.css (#f0f0f0); replaces the old VS Code blue rgb(0,122,204).
    expect(bg).toBe('rgb(240, 240, 240)');
  });

  test('tab bar background is light gray (rgb(192, 192, 192))', async ({ page }) => {
    const bg = await page.evaluate(() => {
      const bar = document.getElementById('tabbar');
      if (!bar) return null;
      return window.getComputedStyle(bar).backgroundColor;
    });
    expect(bg).toBe('rgb(192, 192, 192)');
  });
});

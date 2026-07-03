// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * E2E regression for BUG-7: the editor must scroll both vertically (long docs)
 * and horizontally (long lines, word-wrap off) when content exceeds the viewport.
 *
 * Root cause was a missing bounded height on `.cm-editor` — it grew to content
 * height and was clipped by the `overflow:hidden` parent, so `.cm-scroller` never
 * got a bounded height to scroll within. Fixed by `.cm-editor { height: 100% }`
 * + `.cm-scroller { overflow: auto }`.
 */
import { test, expect } from '@playwright/test';

type WinExt = Window & {
  __appReady: unknown;
  __setActiveDocContent: (content: string) => void;
};

async function gotoEditor(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  page.on('dialog', (d) => void d.accept());
  await page.goto('/editor.html');
  await page.waitForFunction(() => (window as unknown as WinExt).__appReady !== undefined);
  await page.evaluate(() => (window as unknown as WinExt).__appReady);
}

test.describe('editor scrolling (BUG-7)', () => {
  test('vertical: a long document makes .cm-scroller scrollable and scrollTop moves', async ({
    page,
  }) => {
    await gotoEditor(page);
    // Inject 500 lines so content far exceeds the viewport height.
    await page.evaluate(() => {
      const lines = Array.from({ length: 500 }, (_, i) => `line ${i + 1}`).join('\n');
      (window as unknown as WinExt).__setActiveDocContent(lines);
    });
    const scroller = page.locator('.cm-scroller').first();
    await expect(scroller).toBeVisible();
    // Content overflows vertically.
    const overflowsV = await scroller.evaluate((el) => el.scrollHeight > el.clientHeight + 5);
    expect(overflowsV).toBe(true);
    // The scroller actually scrolls vertically.
    await scroller.evaluate((el) => {
      el.scrollTop = 400;
    });
    const scrolledV = await scroller.evaluate((el) => el.scrollTop);
    expect(scrolledV).toBeGreaterThan(0);
  });

  test('horizontal: a very long line (wrap off) makes .cm-scroller scroll horizontally', async ({
    page,
  }) => {
    await gotoEditor(page);
    // One very long single line — with word-wrap off it must overflow horizontally.
    await page.evaluate(() => {
      const longLine = 'x'.repeat(4000);
      (window as unknown as WinExt).__setActiveDocContent(longLine);
    });
    const scroller = page.locator('.cm-scroller').first();
    await expect(scroller).toBeVisible();
    const overflowsH = await scroller.evaluate((el) => el.scrollWidth > el.clientWidth + 5);
    expect(overflowsH).toBe(true);
    await scroller.evaluate((el) => {
      el.scrollLeft = 500;
    });
    const scrolledH = await scroller.evaluate((el) => el.scrollLeft);
    expect(scrolledH).toBeGreaterThan(0);
  });
});

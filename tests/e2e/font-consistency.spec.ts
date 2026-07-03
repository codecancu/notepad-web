// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * E2E test for font and theme consistency across tabs.
 *
 * Verifies:
 *   1. fontFamily and fontSize are IDENTICAL on .cm-content across all tabs.
 *   2. After zoom-in, font size holds on ALL tabs (not just the one active when zoom happened).
 *   3. Dark mode: new tabs opened after selecting dark mode inherit the dark theme
 *      (background is not white) — this is the PRIMARY regression test for the bug where
 *      themeCompartment was not tracked by EditorController, causing new per-doc EditorStates
 *      to always get themeCompartment.of([]) (empty = light), while existing tabs correctly
 *      showed the dark theme after applySettings() reconfigured the compartment.
 *
 * ROOT CAUSE (pre-fix): themeCompartment was a local Compartment in editor-page.ts and
 * was NOT tracked by EditorController.  App.applySettings() dispatched a reconfigure
 * directly on this.view which updated only the CURRENT EditorState.  New tabs created by
 * EditorController.showDoc() used EditorState.create({ extensions: _sharedExtensions })
 * which always seeded themeCompartment.of([]) — the empty initial value from sharedExtensions.
 * In dark mode this caused new tabs to have no dark marker → darkTheme facet = false →
 * &light CSS rules (including fontFamily: "Courier New") fired instead of the dark rules →
 * new tabs showed white background and Courier New while existing tabs showed dark background
 * and monospace, producing a per-tab font inconsistency.
 *
 * FIX: themeCompartment is now owned by EditorController (like tabCompartment,
 * wrapCompartment, symbolCompartment, autoCompletionCompartment).  App.applySettings()
 * calls controller.setTheme() which both dispatches the reconfigure on the active view AND
 * stores _currentThemeExt so showDoc() seeds new per-doc states with
 * themeCompartment.of(_currentThemeExt) — the current theme is always inherited.
 */
import { test, expect } from '@playwright/test';

test.describe('font consistency across tabs', () => {
  test.beforeEach(async ({ page }) => {
    page.on('dialog', (d) => void d.accept());
    await page.goto('/editor.html');
    await page.waitForFunction(() => !!(window as unknown as Record<string, unknown>).__appReady);
    await page.evaluate(() => (window as unknown as Record<string, unknown>).__appReady);
  });

  test('fontFamily and fontSize are identical across 3 tabs (open then switch)', async ({
    page,
  }) => {
    // Type text in tab 1.
    const content = page.locator('.cm-content').first();
    await content.click();
    await page.keyboard.type('tab one text');

    // Read font info on tab 1.
    const tab1Font = await page.evaluate(() => {
      const c = document.querySelector('.cm-content') as HTMLElement | null;
      if (!c) return null;
      const cs = window.getComputedStyle(c);
      return { fontSize: cs.fontSize, fontFamily: cs.fontFamily };
    });
    expect(tab1Font).not.toBeNull();

    // Open tab 2.
    await page.locator('#tab-new').click();
    const content2 = page.locator('.cm-content').first();
    await content2.click();
    await page.keyboard.type('tab two text');

    const tab2Font = await page.evaluate(() => {
      const c = document.querySelector('.cm-content') as HTMLElement | null;
      if (!c) return null;
      const cs = window.getComputedStyle(c);
      return { fontSize: cs.fontSize, fontFamily: cs.fontFamily };
    });

    // Open tab 3.
    await page.locator('#tab-new').click();
    const content3 = page.locator('.cm-content').first();
    await content3.click();
    await page.keyboard.type('tab three text');

    const tab3Font = await page.evaluate(() => {
      const c = document.querySelector('.cm-content') as HTMLElement | null;
      if (!c) return null;
      const cs = window.getComputedStyle(c);
      return { fontSize: cs.fontSize, fontFamily: cs.fontFamily };
    });

    // All three must be equal.
    expect(tab2Font?.fontSize).toBe(tab1Font?.fontSize);
    expect(tab2Font?.fontFamily).toBe(tab1Font?.fontFamily);
    expect(tab3Font?.fontSize).toBe(tab1Font?.fontSize);
    expect(tab3Font?.fontFamily).toBe(tab1Font?.fontFamily);

    // Switch back to tab 1 and verify still consistent.
    await page.locator('.tab').first().click();
    await page.waitForTimeout(100);
    const tab1FontAfter = await page.evaluate(() => {
      const c = document.querySelector('.cm-content') as HTMLElement | null;
      if (!c) return null;
      const cs = window.getComputedStyle(c);
      return { fontSize: cs.fontSize, fontFamily: cs.fontFamily };
    });
    expect(tab1FontAfter?.fontSize).toBe(tab1Font?.fontSize);
    expect(tab1FontAfter?.fontFamily).toBe(tab1Font?.fontFamily);

    // Switch to tab 2.
    await page.locator('.tab').nth(1).click();
    await page.waitForTimeout(100);
    const tab2FontAfter = await page.evaluate(() => {
      const c = document.querySelector('.cm-content') as HTMLElement | null;
      if (!c) return null;
      const cs = window.getComputedStyle(c);
      return { fontSize: cs.fontSize, fontFamily: cs.fontFamily };
    });
    expect(tab2FontAfter?.fontSize).toBe(tab1Font?.fontSize);
    expect(tab2FontAfter?.fontFamily).toBe(tab1Font?.fontFamily);
  });

  test('zoom-in then open new tab: new tab inherits zoomed font size', async ({ page }) => {
    // Zoom in 3 times via Ctrl++ (each press increments fontSize by 1px).
    await page.keyboard.press('Control++');
    await page.keyboard.press('Control++');
    await page.keyboard.press('Control++');
    await page.waitForTimeout(200);

    // Read font size on current (first) tab.
    const zoomedSize = await page.evaluate(() => {
      const c = document.querySelector('.cm-content') as HTMLElement | null;
      return c ? window.getComputedStyle(c).fontSize : null;
    });
    expect(zoomedSize).not.toBeNull();
    // Should be 14 + 3 = 17px.
    expect(zoomedSize).toBe('17px');

    // Open a second tab AFTER zoom.
    await page.locator('#tab-new').click();
    await page.waitForTimeout(200);

    // New tab must inherit the zoomed font size.
    const newTabSize = await page.evaluate(() => {
      const c = document.querySelector('.cm-content') as HTMLElement | null;
      return c ? window.getComputedStyle(c).fontSize : null;
    });
    expect(newTabSize).toBe(zoomedSize);

    // Switch back to tab 1 — must still be zoomed.
    await page.locator('.tab').first().click();
    await page.waitForTimeout(100);
    const tab1SizeAfterSwitch = await page.evaluate(() => {
      const c = document.querySelector('.cm-content') as HTMLElement | null;
      return c ? window.getComputedStyle(c).fontSize : null;
    });
    expect(tab1SizeAfterSwitch).toBe(zoomedSize);

    // Switch to tab 2 — must still be zoomed.
    await page.locator('.tab').last().click();
    await page.waitForTimeout(100);
    const tab2SizeAfterSwitch = await page.evaluate(() => {
      const c = document.querySelector('.cm-content') as HTMLElement | null;
      return c ? window.getComputedStyle(c).fontSize : null;
    });
    expect(tab2SizeAfterSwitch).toBe(zoomedSize);
  });

  test('zoom-in on tab 1, switch to tab 2, switch back: font size consistent', async ({ page }) => {
    // Open a second tab first.
    await page.locator('#tab-new').click();
    await page.waitForTimeout(100);

    // Type in tab 2.
    const content = page.locator('.cm-content').first();
    await content.click();
    await page.keyboard.type('hello tab two');

    // Switch to tab 1.
    await page.locator('.tab').first().click();
    await page.waitForTimeout(100);

    // Zoom in on tab 1.
    await page.keyboard.press('Control++');
    await page.keyboard.press('Control++');
    await page.waitForTimeout(200);

    const tab1Zoomed = await page.evaluate(() => {
      const c = document.querySelector('.cm-content') as HTMLElement | null;
      return c ? window.getComputedStyle(c).fontSize : null;
    });
    expect(tab1Zoomed).toBe('16px');

    // Switch to tab 2 — must have the same zoomed size.
    await page.locator('.tab').last().click();
    await page.waitForTimeout(200);

    const tab2AfterZoom = await page.evaluate(() => {
      const c = document.querySelector('.cm-content') as HTMLElement | null;
      return c ? window.getComputedStyle(c).fontSize : null;
    });
    expect(tab2AfterZoom).toBe(tab1Zoomed);

    // Switch back to tab 1 — still zoomed.
    await page.locator('.tab').first().click();
    await page.waitForTimeout(100);
    const tab1Final = await page.evaluate(() => {
      const c = document.querySelector('.cm-content') as HTMLElement | null;
      return c ? window.getComputedStyle(c).fontSize : null;
    });
    expect(tab1Final).toBe(tab1Zoomed);
  });

  test('fontFamily is always Courier New across all tabs', async ({ page }) => {
    // Open 3 tabs.
    await page.locator('#tab-new').click();
    await page.locator('#tab-new').click();
    await page.waitForTimeout(200);

    // Check all 3 tabs.
    for (let i = 0; i < 3; i++) {
      await page.locator('.tab').nth(i).click();
      await page.waitForTimeout(100);

      const fontFamily = await page.evaluate(() => {
        const c = document.querySelector('.cm-content') as HTMLElement | null;
        return c ? window.getComputedStyle(c).fontFamily : null;
      });
      // The &light baseTheme rule sets fontFamily to Courier New.
      expect(fontFamily).toContain('Courier New');
    }
  });

  test('dark mode: new tab opened after enabling dark mode inherits dark theme (not light)', async ({
    page,
  }) => {
    // Enable dark mode via the settings panel.
    await page.locator('.cm-content').first().focus();
    await page.keyboard.press('ControlOrMeta+Comma');
    await page.waitForTimeout(100);
    await page.locator('#set-theme').selectOption('dark');
    await page.locator('#set-save').click();
    await page.waitForTimeout(200);

    // Confirm tab 1 is now in dark mode (background is not white).
    const tab1Bg = await page.evaluate(() => {
      const editor = document.querySelector('.cm-editor') as HTMLElement | null;
      return editor ? window.getComputedStyle(editor).backgroundColor : null;
    });
    // Dark mode: the CM6 dark marker is set → baseDarkID class on .cm-editor →
    // no &light background override → background is transparent (inherits dark).
    // It must NOT be the light-mode white (#ffffff / rgb(255, 255, 255)).
    expect(tab1Bg).not.toBe('rgb(255, 255, 255)');

    // Open a second tab AFTER dark mode was enabled.
    await page.locator('#tab-new').click();
    await page.waitForTimeout(200);

    // The new tab must ALSO be dark — not light.
    // Pre-fix: themeCompartment was not tracked so new tabs got themeCompartment.of([])
    // which made the &light rules fire → white background → FAIL.
    // Post-fix: controller.setTheme() stores _currentThemeExt = dark marker, and
    // showDoc() seeds new states with themeCompartment.of(_currentThemeExt) → PASS.
    const tab2Bg = await page.evaluate(() => {
      const editor = document.querySelector('.cm-editor') as HTMLElement | null;
      return editor ? window.getComputedStyle(editor).backgroundColor : null;
    });
    expect(tab2Bg).not.toBe('rgb(255, 255, 255)');
    // Both tabs must have the SAME background.
    expect(tab2Bg).toBe(tab1Bg);

    // Switch back to tab 1 — still dark.
    await page.locator('.tab').first().click();
    await page.waitForTimeout(100);
    const tab1BgAfter = await page.evaluate(() => {
      const editor = document.querySelector('.cm-editor') as HTMLElement | null;
      return editor ? window.getComputedStyle(editor).backgroundColor : null;
    });
    expect(tab1BgAfter).toBe(tab1Bg);
  });
});

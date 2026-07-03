// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * E2E tests for BUG-12: Modal dialogs must float as fixed overlays.
 *
 * Checks:
 *  - .dialog-overlay is position:fixed
 *  - .dialog-overlay covers the full viewport (width ≈ window.innerWidth)
 *  - .dialog-box is visible and horizontally centred
 *  - Opening a dialog does NOT move the toolbar out of place
 *  - Same checks for Save-Macro and Run-Macro dialogs
 *  - Clicking the backdrop closes the dialog
 *  - Settings panel renders as a fixed overlay (not disrupting the grid)
 */
import { test, expect } from '@playwright/test';

async function waitReady(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(() => !!(window as Record<string, unknown>).__appReady);
  await page.evaluate(() => (window as Record<string, unknown>).__appReady);
}

/** Open a macro for Save / Run tests. */
async function recordOneMacro(page: import('@playwright/test').Page): Promise<void> {
  // Click the Macro menu (index 7 in the menubar)
  await page.locator('#menubar .menubar-item').nth(7).click();
  const startEntry = page
    .locator('[role="menu"] .menubar-entry')
    .filter({ has: page.locator('.menubar-entry-label', { hasText: /^Start Recording$/ }) })
    .first();
  await startEntry.click({ force: true });

  await page.locator('.cm-content').click();
  await page.keyboard.type('x');

  await page.locator('#menubar .menubar-item').nth(7).click();
  const stopEntry = page
    .locator('[role="menu"] .menubar-entry')
    .filter({ has: page.locator('.menubar-entry-label', { hasText: /^Stop Recording$/ }) })
    .first();
  await stopEntry.click({ force: true });
}

// ─── Find dialog ──────────────────────────────────────────────────────────────

test.describe('Find dialog floats correctly (BUG-12)', () => {
  test('dialog-overlay is position:fixed and covers viewport', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+f');
    await expect(page.locator('[role=dialog]')).toBeVisible({ timeout: 3000 });

    const overlayInfo = await page.evaluate(() => {
      const overlay = document.querySelector('.dialog-overlay') as HTMLElement | null;
      if (!overlay) return null;
      const cs = getComputedStyle(overlay);
      const rect = overlay.getBoundingClientRect();
      return {
        position: cs.position,
        width: rect.width,
        windowWidth: window.innerWidth,
      };
    });

    expect(overlayInfo).not.toBeNull();
    expect(overlayInfo!.position).toBe('fixed');
    // Overlay must cover the full viewport width (within 2px tolerance).
    expect(Math.abs(overlayInfo!.width - overlayInfo!.windowWidth)).toBeLessThanOrEqual(2);
  });

  test('dialog-box is visible and horizontally centred', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+f');
    await expect(page.locator('[role=dialog]')).toBeVisible({ timeout: 3000 });

    const centreInfo = await page.evaluate(() => {
      const box = document.querySelector('.dialog-box') as HTMLElement | null;
      if (!box) return null;
      const rect = box.getBoundingClientRect();
      const centre = (rect.left + rect.right) / 2;
      const vCentre = window.innerWidth / 2;
      return { offset: Math.abs(centre - vCentre), left: rect.left, right: rect.right };
    });

    expect(centreInfo).not.toBeNull();
    // Box horizontal centre should be within 20px of viewport centre.
    expect(centreInfo!.offset).toBeLessThan(20);
  });

  test('opening Find dialog does not move #toolbar', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);

    const toolbarBefore = await page.locator('#toolbar').boundingBox();
    expect(toolbarBefore).not.toBeNull();

    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+f');
    await expect(page.locator('[role=dialog]')).toBeVisible({ timeout: 3000 });

    const toolbarAfter = await page.locator('#toolbar').boundingBox();
    expect(toolbarAfter).not.toBeNull();

    // Toolbar position must not have changed.
    expect(Math.abs(toolbarBefore!.y - toolbarAfter!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(toolbarBefore!.x - toolbarAfter!.x)).toBeLessThanOrEqual(1);
  });

  test('clicking the backdrop closes the Find dialog', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+f');
    await expect(page.locator('[role=dialog]')).toBeVisible({ timeout: 3000 });

    // Click the top-left corner of the overlay (safely outside the dialog box).
    await page.mouse.click(5, 5);
    await expect(page.locator('[role=dialog]')).toBeHidden({ timeout: 2000 });
  });
});

// ─── Save-Macro dialog ────────────────────────────────────────────────────────

test.describe('Save-Macro dialog floats correctly (BUG-12)', () => {
  test('dialog-overlay is position:fixed and covers viewport', async ({ page }) => {
    page.on('dialog', (d) => void d.accept());
    await page.goto('/editor.html');
    await waitReady(page);
    await page.locator('.cm-content').click();
    await recordOneMacro(page);

    // Open Save Current Recorded Macro dialog.
    await page.locator('#menubar .menubar-item').nth(7).click();
    const saveEntry = page
      .locator('[role="menu"] .menubar-entry')
      .filter({
        has: page.locator('.menubar-entry-label', { hasText: /^Save Current Recorded Macro/ }),
      })
      .first();
    await saveEntry.click({ force: true });

    await expect(page.locator('#msd-name')).toBeVisible({ timeout: 3000 });

    const info = await page.evaluate(() => {
      const overlay = document.querySelector('.dialog-overlay') as HTMLElement | null;
      if (!overlay) return null;
      const cs = getComputedStyle(overlay);
      const rect = overlay.getBoundingClientRect();
      const box = overlay.querySelector('.dialog-box') as HTMLElement | null;
      const boxRect = box?.getBoundingClientRect() ?? null;
      return {
        position: cs.position,
        overlayWidth: rect.width,
        windowWidth: window.innerWidth,
        boxVisible: box !== null && (boxRect?.width ?? 0) > 0,
      };
    });

    expect(info).not.toBeNull();
    expect(info!.position).toBe('fixed');
    expect(Math.abs(info!.overlayWidth - info!.windowWidth)).toBeLessThanOrEqual(2);
    expect(info!.boxVisible).toBe(true);
  });
});

// ─── Run-Macro dialog ─────────────────────────────────────────────────────────

test.describe('Run-Macro dialog floats correctly (BUG-12)', () => {
  test('dialog-overlay is position:fixed and covers viewport', async ({ page }) => {
    page.on('dialog', (d) => void d.accept());
    await page.goto('/editor.html');
    await waitReady(page);
    await page.locator('.cm-content').click();
    await recordOneMacro(page);

    // Open Run a Macro Multiple Times dialog.
    await page.locator('#menubar .menubar-item').nth(7).click();
    const runEntry = page
      .locator('[role="menu"] .menubar-entry')
      .filter({
        has: page.locator('.menubar-entry-label', { hasText: /^Run a Macro Multiple Times/ }),
      })
      .first();
    await runEntry.click({ force: true });

    await expect(page.locator('#mrd-run')).toBeVisible({ timeout: 3000 });

    const info = await page.evaluate(() => {
      const overlay = document.querySelector('.dialog-overlay') as HTMLElement | null;
      if (!overlay) return null;
      const cs = getComputedStyle(overlay);
      const rect = overlay.getBoundingClientRect();
      const box = overlay.querySelector('.dialog-box') as HTMLElement | null;
      const boxRect = box?.getBoundingClientRect() ?? null;
      return {
        position: cs.position,
        overlayWidth: rect.width,
        windowWidth: window.innerWidth,
        boxVisible: box !== null && (boxRect?.width ?? 0) > 0,
      };
    });

    expect(info).not.toBeNull();
    expect(info!.position).toBe('fixed');
    expect(Math.abs(info!.overlayWidth - info!.windowWidth)).toBeLessThanOrEqual(2);
    expect(info!.boxVisible).toBe(true);
  });
});

// ─── Settings panel ───────────────────────────────────────────────────────────

test.describe('Settings panel floats correctly (BUG-12)', () => {
  test('settings overlay is position:fixed and does not move the toolbar', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);

    const toolbarBefore = await page.locator('#toolbar').boundingBox();
    expect(toolbarBefore).not.toBeNull();

    // Open settings.
    await page.locator('.cm-content').first().focus();
    await page.keyboard.press('ControlOrMeta+Comma');
    await expect(page.locator('#set-save')).toBeVisible({ timeout: 3000 });

    const info = await page.evaluate(() => {
      const overlay = document.querySelector('.dialog-overlay') as HTMLElement | null;
      if (!overlay) return null;
      return { position: getComputedStyle(overlay).position };
    });
    expect(info).not.toBeNull();
    expect(info!.position).toBe('fixed');

    // Toolbar must be unaffected.
    const toolbarAfter = await page.locator('#toolbar').boundingBox();
    expect(toolbarAfter).not.toBeNull();
    expect(Math.abs(toolbarBefore!.y - toolbarAfter!.y)).toBeLessThanOrEqual(1);
  });

  test('clicking the backdrop closes the Settings panel', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);

    await page.locator('.cm-content').first().focus();
    await page.keyboard.press('ControlOrMeta+Comma');
    await expect(page.locator('#set-save')).toBeVisible({ timeout: 3000 });

    // Click top-left corner of the overlay (safely outside the panel box).
    await page.mouse.click(5, 5);
    await expect(page.locator('#set-save')).toBeHidden({ timeout: 2000 });
  });
});

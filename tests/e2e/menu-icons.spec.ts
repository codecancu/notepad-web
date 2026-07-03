// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * E2E tests for BUG-10 (leading menu icons) and BUG-11 (Language menu
 * first-letter submenus).  Requires `npm run build` before running.
 */
import { test, expect } from '@playwright/test';

async function gotoEditor(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  page.on('dialog', (d) => void d.accept());
  await page.goto('/editor.html');
  await page.waitForFunction(
    () => (window as unknown as Record<string, unknown>).__appReady !== undefined,
  );
  await page.evaluate(() => (window as unknown as Record<string, unknown>).__appReady);
}

// ── BUG-10: leading icon column ───────────────────────────────────────────────

test.describe('BUG-10 — leading menu icons', () => {
  test('File menu New/Open/Save items each have a leading <img> that loads (naturalWidth>0)', async ({
    page,
  }) => {
    await gotoEditor(page);

    // Open File menu (first button, index 0).
    await page.locator('#menubar button').first().click();
    const dropdown = page.locator('[role="menu"]').first();
    await expect(dropdown).toBeVisible();

    for (const label of ['New', 'Open...', 'Save']) {
      const li = dropdown
        .locator('.menubar-entry')
        .filter({ hasText: new RegExp(`^${label.replace('...', '\\.\\.\\.')}`) })
        .first();
      await expect(li).toBeVisible();

      // Each item must contain a leading <img>.
      const img = li.locator('img.menubar-entry-icon');
      await expect(img).toHaveCount(1);

      // The image must have actually loaded (naturalWidth > 0).
      const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
      expect(naturalWidth, `icon for "${label}" did not load`).toBeGreaterThan(0);
    }

    // Close menu.
    await page.keyboard.press('Escape');
  });

  test('File menu Rename... (no icon in .ui) renders a spacer, not an <img>', async ({ page }) => {
    await gotoEditor(page);

    await page.locator('#menubar button').first().click();
    const dropdown = page.locator('[role="menu"]').first();

    const renameLi = dropdown.locator('.menubar-entry').filter({ hasText: 'Rename...' }).first();
    await expect(renameLi).toBeVisible();

    // No <img> — spacer only.
    await expect(renameLi.locator('img.menubar-entry-icon')).toHaveCount(0);
    await expect(renameLi.locator('span.menubar-entry-icon-spacer')).toHaveCount(1);

    await page.keyboard.press('Escape');
  });
});

// ── BUG-11: Language menu first-letter submenus ───────────────────────────────

test.describe('BUG-11 — Language menu first-letter submenus', () => {
  test('Language menu shows first-letter submenu buttons (single uppercase letter labels)', async ({
    page,
  }) => {
    await gotoEditor(page);

    // Open Language menu (index 5).
    const langBtn = page.locator('#menubar button').nth(5);
    await langBtn.click();

    // Wait until the loading placeholder is gone (real lang items loaded).
    await page.waitForFunction(
      () => {
        const menu = document.querySelector('[role="menu"]');
        if (!menu) return false;
        const entries = Array.from(menu.querySelectorAll('.menubar-entry'));
        return entries.some((el) => !el.classList.contains('disabled'));
      },
      { timeout: 15_000 },
    );

    // At least one item in the Language menu should be a single uppercase letter (submenu parent).
    // Match via the label span text, not the full element text (which includes the arrow ▶).
    const dropdown = page.locator('[role="menu"]').first();
    const letterItems = dropdown
      .locator('.menubar-entry')
      .filter({ has: page.locator('.menubar-entry-label').filter({ hasText: /^[A-Z]$/ }) });
    await expect(letterItems).not.toHaveCount(0);

    // Close menu.
    await page.keyboard.press('Escape');
  });

  test('hovering a first-letter submenu item reveals the languages in that group', async ({
    page,
  }) => {
    await gotoEditor(page);

    const langBtn = page.locator('#menubar button').nth(5);
    await langBtn.click();

    // Wait for real items.
    await page.waitForFunction(
      () => {
        const menu = document.querySelector('[role="menu"]');
        if (!menu) return false;
        return Array.from(menu.querySelectorAll('.menubar-entry')).some(
          (el) => !el.classList.contains('disabled'),
        );
      },
      { timeout: 15_000 },
    );

    // Hover over the first single-letter submenu parent.
    // Match via the label span text (not full element text, which includes the arrow ▶).
    const dropdown = page.locator('[role="menu"]').first();
    const firstLetterItem = dropdown
      .locator('.menubar-entry')
      .filter({ has: page.locator('.menubar-entry-label').filter({ hasText: /^[A-Z]$/ }) })
      .first();
    await firstLetterItem.hover();

    // A sub-panel should appear with language items.
    const subPanel = page.locator('.menubar-sub');
    await expect(subPanel).toHaveCount(1);
    const subEntries = subPanel.locator('.menubar-entry:not(.disabled)');
    await expect(subEntries).not.toHaveCount(0);

    await page.keyboard.press('Escape');
  });
});

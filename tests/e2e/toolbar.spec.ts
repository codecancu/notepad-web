// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * E2E tests for the Toolbar (BUG-2 / BUG-5).
 *
 * Tests:
 *  - Toolbar is visible below the menu bar
 *  - All expected action buttons are present
 *  - Toolbar buttons use bundled PNG <img> icons (not inline SVG) — BUG-5
 *  - PNG icons load successfully (naturalWidth > 0) — BUG-5
 *  - Macro Record icon swaps startRecord.png ↔ stopRecord.png — BUG-5
 *  - Clicking New adds a tab
 *  - Clicking Find opens the find dialog
 *  - Macro Record button toggles pressed state (__isRecording() true after click)
 *  - Show Indent Guide is disabled
 */
import { test, expect } from '@playwright/test';

type WinExt = Window & {
  __appReady: unknown;
  __isRecording: () => boolean;
};

async function gotoEditor(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  page.on('dialog', (d) => void d.accept());
  await page.goto('/editor.html');
  await page.waitForFunction(() => (window as unknown as WinExt).__appReady !== undefined);
  await page.evaluate(() => (window as unknown as WinExt).__appReady);
}

// ── Visibility ────────────────────────────────────────────────────────────────

test('toolbar is visible below the menu bar', async ({ page }) => {
  await gotoEditor(page);

  const toolbar = page.locator('#toolbar [role="toolbar"]');
  await expect(toolbar).toBeVisible();

  // The toolbar must appear below the menu bar.
  const menubarBox = await page.locator('#menubar').boundingBox();
  const toolbarBox = await page.locator('#toolbar').boundingBox();
  expect(menubarBox).not.toBeNull();
  expect(toolbarBox).not.toBeNull();
  // Toolbar top edge is at or below menu bar bottom edge.
  expect(toolbarBox!.y).toBeGreaterThanOrEqual(menubarBox!.y + menubarBox!.height - 2);
});

// ── Button presence ───────────────────────────────────────────────────────────

test('toolbar has all expected action buttons', async ({ page }) => {
  await gotoEditor(page);

  const expectedIds = [
    'tb-new',
    'tb-open',
    'tb-save',
    'tb-save-all',
    'tb-close',
    'tb-close-all',
    'tb-cut',
    'tb-copy',
    'tb-paste',
    'tb-undo',
    'tb-redo',
    'tb-find',
    'tb-replace',
    'tb-zoom-in',
    'tb-zoom-out',
    'tb-word-wrap',
    'tb-show-all-chars',
    'tb-indent-guide',
    'tb-macro-record',
    'tb-macro-playback',
    'tb-macro-run-multiple',
    'tb-macro-save',
  ];

  for (const id of expectedIds) {
    await expect(page.locator(`#${id}`)).toBeVisible();
  }
});

// ── Separators ────────────────────────────────────────────────────────────────

test('toolbar has separators between groups', async ({ page }) => {
  await gotoEditor(page);
  const seps = page.locator('#toolbar .toolbar-sep');
  await expect(seps).toHaveCount(6);
});

// ── New button ────────────────────────────────────────────────────────────────

test('clicking New toolbar button adds a tab', async ({ page }) => {
  await gotoEditor(page);
  // One tab at start.
  await expect(page.locator('.tab')).toHaveCount(1);
  // Click New.
  await page.locator('#tb-new').click();
  await expect(page.locator('.tab')).toHaveCount(2);
});

// ── Find button ───────────────────────────────────────────────────────────────

test('clicking Find toolbar button opens the find dialog', async ({ page }) => {
  await gotoEditor(page);
  await page.locator('#tb-find').click();
  // The find dialog should become visible. Assert the actual floating panel
  // (.fd-dialog inside the #find-dialog root) — the #find-dialog root itself is a
  // zero-height wrapper now that its only child is a position:fixed overlay.
  await expect(page.locator('#find-dialog .fd-dialog')).toBeVisible();
});

// ── Show Indent Guide is disabled ────────────────────────────────────────────

test('Show Indent Guide toolbar button is disabled', async ({ page }) => {
  await gotoEditor(page);
  const btn = page.locator('#tb-indent-guide');
  await expect(btn).toHaveAttribute('aria-disabled', 'true');
  await expect(btn).toHaveClass(/toolbar-btn--disabled/);
});

// ── Macro Record toggle ───────────────────────────────────────────────────────

test('clicking Macro Record toggles pressed state and __isRecording() becomes true', async ({
  page,
}) => {
  await gotoEditor(page);

  const recordBtn = page.locator('#tb-macro-record');

  // Initially not pressed.
  await expect(recordBtn).toHaveAttribute('aria-pressed', 'false');

  // Click to start recording.
  await recordBtn.click();

  // Wait for __isRecording to become true.
  await page.waitForFunction(() => (window as unknown as WinExt).__isRecording?.() === true, {
    timeout: 5000,
  });

  const isRecording = await page.evaluate(() => (window as unknown as WinExt).__isRecording());
  expect(isRecording).toBe(true);

  // The button should now show pressed state.
  await expect(recordBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(recordBtn).toHaveClass(/toolbar-btn--pressed/);

  // Click again to stop recording.
  await recordBtn.click();

  await page.waitForFunction(() => (window as unknown as WinExt).__isRecording?.() === false, {
    timeout: 5000,
  });
  await expect(recordBtn).toHaveAttribute('aria-pressed', 'false');
});

// ── Word Wrap toggle ──────────────────────────────────────────────────────────

test('clicking Word Wrap toolbar button toggles pressed state', async ({ page }) => {
  await gotoEditor(page);

  const wrapBtn = page.locator('#tb-word-wrap');

  // Initially not pressed (word wrap off by default).
  await expect(wrapBtn).toHaveAttribute('aria-pressed', 'false');

  // Click to enable word wrap.
  await wrapBtn.click();

  // Wait for toolbar to re-render with pressed state.
  await page.waitForFunction(
    () => document.querySelector('#tb-word-wrap')?.getAttribute('aria-pressed') === 'true',
    { timeout: 3000 },
  );

  await expect(wrapBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(wrapBtn).toHaveClass(/toolbar-btn--pressed/);
});

// ── PNG icon loading (BUG-5) ──────────────────────────────────────────────────

test('toolbar buttons use bundled PNG img icons (not inline SVG)', async ({ page }) => {
  await gotoEditor(page);

  // Every toolbar button must contain an <img> and no <svg>.
  const allButtons = page.locator('.toolbar-btn');
  const count = await allButtons.count();
  expect(count).toBe(22);

  for (let i = 0; i < count; i++) {
    const btn = allButtons.nth(i);
    await expect(btn.locator('img')).toHaveCount(1);
    await expect(btn.locator('svg')).toHaveCount(0);
  }
});

test('New button img src ends with newfile.png and loads (naturalWidth > 0)', async ({ page }) => {
  await gotoEditor(page);

  const img = page.locator('#tb-new img');
  await expect(img).toHaveCount(1);

  const src = await img.getAttribute('src');
  expect(src).toMatch(/newfile\.png$/);

  // Verify the image actually loads (naturalWidth > 0 means the PNG is served locally).
  const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
  expect(naturalWidth).toBeGreaterThan(0);
});

test('Save button img src ends with saved.png', async ({ page }) => {
  await gotoEditor(page);

  const img = page.locator('#tb-save img');
  await expect(img).toHaveCount(1);

  const src = await img.getAttribute('src');
  expect(src).toMatch(/saved\.png$/);
});

test('Macro Record idle icon is startRecord.png, active icon switches to stopRecord.png', async ({
  page,
}) => {
  await gotoEditor(page);

  const recordBtn = page.locator('#tb-macro-record');
  const img = recordBtn.locator('img');

  // Idle: startRecord.png
  let src = await img.getAttribute('src');
  expect(src).toMatch(/startRecord\.png$/);

  // Start recording → toolbar re-renders → icon should switch to stopRecord.png
  await recordBtn.click();
  await page.waitForFunction(() => (window as unknown as WinExt).__isRecording?.() === true, {
    timeout: 5000,
  });
  src = await img.getAttribute('src');
  expect(src).toMatch(/stopRecord\.png$/);

  // Stop recording → back to startRecord.png
  await recordBtn.click();
  await page.waitForFunction(() => (window as unknown as WinExt).__isRecording?.() === false, {
    timeout: 5000,
  });
  src = await img.getAttribute('src');
  expect(src).toMatch(/startRecord\.png$/);
});

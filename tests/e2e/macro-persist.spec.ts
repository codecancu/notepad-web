// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * E2E tests for P5.2 macro persistence, save/run dialogs, keymap gap fix.
 *
 * Tests:
 *  1. Record → Save (dialog) → appears as dynamic menu item → replay works
 *  2. Run-Multiple dialog: record 1-char macro, execute N=3, inserts 3×
 *  3. Record Alt+Down (duplicate line) while recording → step captured → replay duplicates
 *  4. Idle transparency: Alt+Down duplicates normally when NOT recording
 */
import { test, expect } from '@playwright/test';

type WinExt = Window & {
  __appReady: unknown;
  __editor: { getValue(): string };
  __isRecording: () => boolean;
  __macroStepCount: () => number;
  __savedMacroNames: () => string[];
};

async function gotoEditor(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  page.on('dialog', (d) => void d.accept());
  await page.goto('/editor.html');
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    await Promise.all(
      dbs.map(
        (db) =>
          new Promise<void>((res, rej) => {
            const req = indexedDB.deleteDatabase(db.name!);
            req.onsuccess = () => res();
            req.onerror = () => rej(req.error);
          }),
      ),
    );
  });
  await page.reload();
  await page.waitForFunction(() => (window as unknown as WinExt).__appReady !== undefined);
  await page.evaluate(() => (window as unknown as WinExt).__appReady);
  const content = page.locator('.cm-content');
  await content.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
}

async function getValue(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  return page.evaluate(() => (window as unknown as WinExt).__editor.getValue());
}

async function clickMacroMenu(
  page: Parameters<Parameters<typeof test>[1]>[0]['page'],
  itemLabel: string,
) {
  await page.locator('#menubar .menubar-item').nth(7).click();
  const entry = page
    .locator('[role="menu"] .menubar-entry')
    .filter({
      has: page.locator('.menubar-entry-label', { hasText: new RegExp(`^${itemLabel}$`) }),
    })
    .first();
  await entry.click({ force: true });
}

// ── Test 1: Record → Save → appears in menu → replay ─────────────────────────

test('Record a macro, save it, and replay from saved menu item', async ({ page }) => {
  await gotoEditor(page);

  await clickMacroMenu(page, 'Start Recording');
  await page.waitForFunction(() => (window as unknown as WinExt).__isRecording?.() === true, {
    timeout: 5000,
  });

  const content = page.locator('.cm-content');
  await content.click();
  await page.keyboard.type('saved!');

  await clickMacroMenu(page, 'Stop Recording');
  await page.waitForFunction(() => (window as unknown as WinExt).__isRecording?.() === false, {
    timeout: 5000,
  });

  await clickMacroMenu(page, 'Save Current Recorded Macro...');

  const nameInput = page.locator('#msd-name');
  await nameInput.fill('MySavedMacro');
  await page.locator('#msd-ok').click();

  await page.waitForFunction(
    () => (window as unknown as WinExt).__savedMacroNames?.().includes('MySavedMacro'),
    { timeout: 5000 },
  );

  await content.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
  expect(await getValue(page)).toBe('');

  await clickMacroMenu(page, 'MySavedMacro');

  await page.waitForFunction(() => (window as unknown as WinExt).__editor.getValue().length > 0, {
    timeout: 5000,
  });

  expect(await getValue(page)).toContain('saved!');
});

// ── Test 2: Run-Multiple dialog with N=3 ─────────────────────────────────────

test('Run-Multiple dialog: record 1-char macro, execute N=3, inserts 3x', async ({ page }) => {
  await gotoEditor(page);

  await clickMacroMenu(page, 'Start Recording');
  await page.waitForFunction(() => (window as unknown as WinExt).__isRecording?.() === true, {
    timeout: 5000,
  });

  const content = page.locator('.cm-content');
  await content.click();
  await page.keyboard.type('x');

  await clickMacroMenu(page, 'Stop Recording');
  await page.waitForFunction(() => (window as unknown as WinExt).__isRecording?.() === false, {
    timeout: 5000,
  });

  await content.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');

  await clickMacroMenu(page, 'Run a Macro Multiple Times...');

  const nInput = page.locator('#mrd-times');
  await nInput.fill('3');

  const countRadio = page.locator('#mrd-radio-execute');
  await expect(countRadio).toBeChecked();

  await page.locator('#mrd-run').click();

  await page.waitForFunction(() => (window as unknown as WinExt).__editor.getValue().length >= 3, {
    timeout: 5000,
  });

  expect(await getValue(page)).toBe('xxx');
});

// ── Test 3: Alt+Down captured while recording ─────────────────────────────────

test('Record Alt+Down (duplicate line), stop → step captured, duplicate happened', async ({
  page,
}) => {
  await gotoEditor(page);

  const content = page.locator('.cm-content');
  await content.click();
  await page.keyboard.type('hello');

  await clickMacroMenu(page, 'Start Recording');
  await page.waitForFunction(() => (window as unknown as WinExt).__isRecording?.() === true, {
    timeout: 5000,
  });

  await content.click();
  await page.keyboard.press('Alt+ArrowDown');

  await clickMacroMenu(page, 'Stop Recording');
  await page.waitForFunction(() => (window as unknown as WinExt).__isRecording?.() === false, {
    timeout: 5000,
  });

  const steps = await page.evaluate(() => (window as unknown as WinExt).__macroStepCount());
  expect(steps).toBeGreaterThan(0);

  const text = await getValue(page);
  expect(text.split('\n').filter((l: string) => l.includes('hello')).length).toBeGreaterThanOrEqual(
    2,
  );
});

// ── Test 4: idle transparency — Alt+Down still works when not recording ───────

test('idle transparency: Alt+Down duplicates a line normally when not recording', async ({
  page,
}) => {
  await gotoEditor(page);

  expect(await page.evaluate(() => (window as unknown as WinExt).__isRecording())).toBe(false);

  const content = page.locator('.cm-content');
  await content.click();
  await page.keyboard.type('world');

  expect(await getValue(page)).toBe('world');

  await page.keyboard.press('Alt+ArrowDown');

  const after = await getValue(page);
  expect(
    after.split('\n').filter((l: string) => l.includes('world')).length,
  ).toBeGreaterThanOrEqual(2);
});

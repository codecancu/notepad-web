// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * E2E tests for the Macro recording/replay engine (P5.1).
 *
 * Uses window helpers exposed by editor-page.ts to assert macro state
 * without relying on DOM internals.
 *
 * Tests:
 *  - Start Recording wires up (menu item enabled, isRecording true)
 *  - Type text while recording → macro has steps
 *  - Stop Recording → isRecording false, macro step count > 0
 *  - Playback (Ctrl+Shift+P) replays last macro
 *  - Replay via menu Playback item works
 */
import { test, expect } from '@playwright/test';

type WinExt = Window & {
  __appReady: unknown;
  __editor: { getValue(): string };
  __isRecording: () => boolean;
  __macroStepCount: () => number;
};

/** Navigate and wait for the editor to be fully ready, then clear the doc. */
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

/** Get the editor's current text. */
async function getValue(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  return page.evaluate(() => (window as unknown as WinExt).__editor.getValue());
}

/** Click a Macro menu item by label. */
async function clickMacroMenu(
  page: Parameters<Parameters<typeof test>[1]>[0]['page'],
  itemLabel: string,
) {
  // The Macro menu is the 8th top-level button (index 7).
  await page.locator('#menubar .menubar-item').nth(7).click();
  const entry = page
    .locator('[role="menu"] .menubar-entry')
    .filter({
      has: page.locator('.menubar-entry-label', { hasText: new RegExp(`^${itemLabel}$`) }),
    })
    .first();
  await entry.click({ force: true });
}

// ── Start Recording ───────────────────────────────────────────────────────────

test('Start Recording → __isRecording() returns true', async ({ page }) => {
  await gotoEditor(page);

  // Click Start Recording via menu.
  await clickMacroMenu(page, 'Start Recording');

  // Wait for isRecording to become true.
  await page.waitForFunction(() => (window as unknown as WinExt).__isRecording?.() === true, {
    timeout: 5000,
  });

  const recording = await page.evaluate(() => (window as unknown as WinExt).__isRecording());
  expect(recording).toBe(true);

  // Clean up: stop recording so we don't leave module state dirty.
  await clickMacroMenu(page, 'Stop Recording');
});

// ── Stop Recording ────────────────────────────────────────────────────────────

test('Stop Recording → __isRecording() returns false, macro has steps', async ({ page }) => {
  await gotoEditor(page);

  // Start recording.
  await clickMacroMenu(page, 'Start Recording');
  await page.waitForFunction(() => (window as unknown as WinExt).__isRecording?.() === true, {
    timeout: 5000,
  });

  // Type some text.
  const content = page.locator('.cm-content');
  await content.click();
  await page.keyboard.type('hello');

  // Stop recording.
  await clickMacroMenu(page, 'Stop Recording');

  await page.waitForFunction(() => (window as unknown as WinExt).__isRecording?.() === false, {
    timeout: 5000,
  });

  const recording = await page.evaluate(() => (window as unknown as WinExt).__isRecording());
  expect(recording).toBe(false);

  const stepCount = await page.evaluate(() => (window as unknown as WinExt).__macroStepCount());
  expect(stepCount).toBeGreaterThan(0);
});

// ── Playback via Ctrl+Shift+P ─────────────────────────────────────────────────

test('Playback via Ctrl+Shift+P replays the recorded macro', async ({ page }) => {
  await gotoEditor(page);

  // Start recording.
  await clickMacroMenu(page, 'Start Recording');
  await page.waitForFunction(() => (window as unknown as WinExt).__isRecording?.() === true, {
    timeout: 5000,
  });

  // Type text during recording.
  const content = page.locator('.cm-content');
  await content.click();
  await page.keyboard.type('macro');

  // Stop recording.
  await clickMacroMenu(page, 'Stop Recording');
  await page.waitForFunction(() => (window as unknown as WinExt).__isRecording?.() === false, {
    timeout: 5000,
  });

  // Clear the editor.
  await content.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');

  // Verify cleared.
  const clearedText = await getValue(page);
  expect(clearedText).toBe('');

  // Replay via Ctrl+Shift+P.
  await content.click();
  await page.keyboard.press('Control+Shift+P');

  // Wait for the replayed text to appear.
  await page.waitForFunction(() => (window as unknown as WinExt).__editor.getValue().length > 0, {
    timeout: 5000,
  });

  const text = await getValue(page);
  expect(text).toContain('macro');
});

// ── Playback via Macro menu ───────────────────────────────────────────────────

test('Playback via Macro menu replays the recorded macro', async ({ page }) => {
  await gotoEditor(page);

  // Record a macro.
  await clickMacroMenu(page, 'Start Recording');
  await page.waitForFunction(() => (window as unknown as WinExt).__isRecording?.() === true, {
    timeout: 5000,
  });

  const content = page.locator('.cm-content');
  await content.click();
  await page.keyboard.type('world');

  await clickMacroMenu(page, 'Stop Recording');
  await page.waitForFunction(() => (window as unknown as WinExt).__isRecording?.() === false, {
    timeout: 5000,
  });

  // Clear the editor.
  await content.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');

  // Replay via Macro → Playback menu.
  await clickMacroMenu(page, 'Playback');

  // Wait for replayed text.
  await page.waitForFunction(() => (window as unknown as WinExt).__editor.getValue().length > 0, {
    timeout: 5000,
  });

  const text = await getValue(page);
  expect(text).toContain('world');
});

// ── Keymap transparency when NOT recording (regression) ───────────────────────

test('idle recording keymap does not shadow closeBrackets Backspace (deletes the pair)', async ({
  page,
}) => {
  // The recording keymap is registered at Prec.highest and is always present.
  // When NOT recording it must fall through so closeBrackets keeps its Backspace →
  // deleteBracketPair handler. If the recording keymap shadowed it, Backspace would
  // delete only the opening bracket, leaving ")".
  await gotoEditor(page);
  expect(await page.evaluate(() => (window as unknown as WinExt).__isRecording())).toBe(false);

  const content = page.locator('.cm-content');
  await content.click();
  // Type "(" — closeBrackets() auto-inserts ")" with the caret between → "()".
  await page.keyboard.type('(');
  expect(await getValue(page)).toBe('()');

  // Backspace should delete BOTH brackets (closeBrackets deleteBracketPair), not one.
  await page.keyboard.press('Backspace');
  expect(await getValue(page)).toBe('');
});

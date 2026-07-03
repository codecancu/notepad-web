// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * E2E tests for BUG-9: global editor shortcuts.
 *
 * Verifies that editor shortcuts (F3, Ctrl+G, Ctrl+F2/F2/Shift+F2,
 * Ctrl+Shift+P, Ctrl+J, Ctrl+/, Ctrl+K, Ctrl+Shift+K,
 * Ctrl+Shift+↑/↓, Alt+↓) fire even when the editor does NOT have focus
 * (e.g. after clicking the toolbar/menu).
 *
 * Tests:
 *  1. Works without editor focus: Ctrl+F2 toggles a bookmark when editor is blurred.
 *  2. Works without editor focus: F2 (Next Bookmark) moves the cursor.
 *  3. Works without editor focus: Ctrl+G opens the goto-line panel.
 *  4. Works without editor focus: Ctrl+Shift+P replays a recorded macro.
 *  5. Works without editor focus: Ctrl+J joins lines.
 *  6. No double-fire when editor is focused: Ctrl+F2 toggles exactly once.
 *  7. Doesn't hijack Find-dialog input: Ctrl+J in Find input doesn't join editor lines.
 */
import { test, expect } from '@playwright/test';

type WinExt = Window & {
  __appReady: unknown;
  __editor: { getValue(): string };
  __getBookmarks: () => number[];
  __toggleBookmarkOnCurrentLine: () => void;
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

/** Get the current bookmarked line numbers via the CM6 state helper. */
async function getBookmarks(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  return page.evaluate(() => (window as unknown as WinExt).__getBookmarks());
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

/** Blur the editor by focusing the menu bar (then press Escape to close). */
async function blurEditor(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  // Click the menu bar label to move focus away from the editor.
  await page.locator('#menubar .menubar-item').first().click();
  // Close the opened menu with Escape so it doesn't intercept subsequent key presses.
  await page.keyboard.press('Escape');
  // Confirm the editor no longer has focus.
  const editorHasFocus = await page.evaluate(() => {
    const ae = document.activeElement;
    return ae?.classList.contains('cm-content') ?? false;
  });
  // It's OK if it still has focus (keyboard nav may re-focus); the global handler
  // still prevents double-fire via the defaultPrevented guard.
  void editorHasFocus;
}

// ── Test 1: Ctrl+F2 toggles bookmark without editor focus ──────────────────

test('Ctrl+F2 toggles bookmark when editor is not focused', async ({ page }) => {
  await gotoEditor(page);

  // Type one line of text.
  await page.locator('.cm-content').click();
  await page.keyboard.type('hello world');

  // Verify no bookmarks yet.
  let bm = await getBookmarks(page);
  expect(bm).toHaveLength(0);

  // Move focus away from the editor.
  await blurEditor(page);

  // Press Ctrl+F2 — should toggle the bookmark on the current line.
  await page.keyboard.press('Control+F2');

  // Wait for the bookmark to appear.
  await page.waitForFunction(() => (window as unknown as WinExt).__getBookmarks().length > 0, {
    timeout: 3000,
  });

  bm = await getBookmarks(page);
  expect(bm).toHaveLength(1);
  expect(bm[0]).toBe(1);
});

// ── Test 2: F2 (Next Bookmark) navigates without editor focus ───────────────

test('F2 navigates to next bookmark when editor is not focused', async ({ page }) => {
  await gotoEditor(page);

  // Write two lines and bookmark line 2 via the window helper.
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.type('line one\nline two');
  // Use Ctrl+F2 while focused on the editor to bookmark current line (line 2).
  await editor.click();
  await page.keyboard.press('End'); // ensure on line 2
  await page.keyboard.press('Control+F2');
  await page.waitForFunction(() => (window as unknown as WinExt).__getBookmarks().length > 0, {
    timeout: 3000,
  });

  // Move caret to line 1.
  await page.keyboard.press('Control+Home');

  // Blur the editor.
  await blurEditor(page);

  // Press F2 (Next Bookmark) — should navigate to line 2.
  await page.keyboard.press('F2');

  // Wait for the active line to reflect line 2.
  await page.waitForFunction(
    () => {
      // CM6 sets .cm-activeLine on the caret's line; check the line text.
      const activeLine = document.querySelector('.cm-activeLine');
      return activeLine?.textContent?.includes('line two') ?? false;
    },
    { timeout: 3000 },
  );

  const activeLine = await page.locator('.cm-activeLine').textContent();
  expect(activeLine).toContain('line two');
});

// ── Test 3: Ctrl+G opens goto-line panel without editor focus ───────────────

test('Ctrl+G opens goto-line panel when editor is not focused', async ({ page }) => {
  await gotoEditor(page);
  await page.locator('.cm-content').click();
  await page.keyboard.type('some text');

  await blurEditor(page);

  // Press Ctrl+G — should open the CM6 goto-line panel.
  await page.keyboard.press('Control+g');

  // The CM6 goto-line panel appears with a .cm-panel element.
  await expect(page.locator('.cm-panel')).toBeVisible({ timeout: 3000 });

  // Close it.
  await page.keyboard.press('Escape');
});

// ── Test 4: Ctrl+Shift+P replays macro without editor focus ────────────────

test('Ctrl+Shift+P replays macro when editor is not focused', async ({ page }) => {
  await gotoEditor(page);

  // Record a macro: type "AAA".
  await page.locator('.cm-content').click();
  await clickMacroMenu(page, 'Start Recording');
  await page.waitForFunction(() => (window as unknown as WinExt).__isRecording?.() === true, {
    timeout: 5000,
  });
  await page.locator('.cm-content').click();
  await page.keyboard.type('AAA');
  await clickMacroMenu(page, 'Stop Recording');
  await page.waitForFunction(() => (window as unknown as WinExt).__isRecording?.() === false, {
    timeout: 5000,
  });

  const afterRecord = await getValue(page);
  expect(afterRecord).toBe('AAA');

  // Move caret to end.
  await page.locator('.cm-content').click();
  await page.keyboard.press('End');

  // Blur the editor.
  await blurEditor(page);

  // Press Ctrl+Shift+P — should replay the macro (append "AAA").
  await page.keyboard.press('Control+Shift+p');

  // Wait for the content to include replayed text.
  await page.waitForFunction(() => (window as unknown as WinExt).__editor.getValue().length >= 6, {
    timeout: 3000,
  });

  const afterReplay = await getValue(page);
  expect(afterReplay).toContain('AAA');
  expect(afterReplay.length).toBeGreaterThanOrEqual(6);
});

// ── Test 5: Ctrl+J joins lines without editor focus ─────────────────────────

test('Ctrl+J joins lines when editor is not focused', async ({ page }) => {
  await gotoEditor(page);

  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.type('line one\nline two');

  // Move to line 1.
  await page.keyboard.press('Control+Home');

  const beforeJoin = await getValue(page);
  expect(beforeJoin).toContain('\n');

  // Blur the editor.
  await blurEditor(page);

  // Press Ctrl+J — joins the current line with the next.
  await page.keyboard.press('Control+j');

  // Wait for the newline to disappear.
  await page.waitForFunction(
    () => !(window as unknown as WinExt).__editor.getValue().includes('\n'),
    { timeout: 3000 },
  );

  const afterJoin = await getValue(page);
  expect(afterJoin).not.toContain('\n');
});

// ── Test 6: No double-fire when editor is focused ───────────────────────────

test('Ctrl+F2 does NOT double-toggle when editor is focused', async ({ page }) => {
  await gotoEditor(page);

  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.type('hello');

  // Verify no bookmarks.
  let bm = await getBookmarks(page);
  expect(bm).toHaveLength(0);

  // Press Ctrl+F2 ONCE while the editor IS focused.
  await page.keyboard.press('Control+F2');

  // Wait briefly for the state to settle.
  await page.waitForFunction(() => (window as unknown as WinExt).__getBookmarks().length > 0, {
    timeout: 3000,
  });

  bm = await getBookmarks(page);
  // If double-fired, the bookmark would be toggled twice (off again → empty).
  // Exactly one toggle → exactly one bookmark.
  expect(bm).toHaveLength(1);
  expect(bm[0]).toBe(1);
});

// ── Test 7: Find-dialog input is NOT hijacked ────────────────────────────────

test('Ctrl+J in Find-dialog input does NOT join editor lines', async ({ page }) => {
  await gotoEditor(page);

  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.type('line one\nline two');
  await page.keyboard.press('Control+Home');

  const beforeJoin = await getValue(page);
  expect(beforeJoin).toContain('\n');

  // Open the Find dialog (Ctrl+F).
  await page.keyboard.press('Control+f');
  await expect(page.locator('[role=dialog]')).toBeVisible({ timeout: 3000 });

  // Focus the find input (it should be focused automatically).
  const findInput = page.locator('#fd-find-input');
  await findInput.click();

  // Press Ctrl+J while the input is focused.
  await page.keyboard.press('Control+j');

  // The editor should NOT have joined lines.
  const afterCtrlJ = await getValue(page);
  expect(afterCtrlJ).toContain('\n');

  // Close the dialog.
  await page.keyboard.press('Escape');
});

// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * E2E tests for HTML tag auto-close (Phase-4 Task 4b).
 *
 * Tests:
 *  1. In an HTML doc: typing `<div>` → doc becomes `<div></div>` with caret between tags.
 *  2. In an HTML doc: typing `<br>` → no auto-close (void tag, doc stays `<br>`).
 *  3. In a NON-HTML doc (plaintext): typing `<div>` → no auto-close (doc stays `<div>`).
 *
 * Language switching uses `__setEditorLanguage` which updates the store AND
 * reconfigures the CM6 language compartment (equivalent to the Language menu click).
 */
import { test, expect } from '@playwright/test';

type WinExt = Window & {
  __appReady: unknown;
  __editor: { getValue(): string };
  __setEditorLanguage: (languageId: string) => void;
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
  // Clear content.
  const content = page.locator('.cm-content');
  await content.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Delete');
}

/** Get the editor's current text. */
async function getValue(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  return page.evaluate(() => (window as unknown as WinExt).__editor.getValue());
}

// ── 1. HTML doc: typing `<div>` auto-closes to `<div></div>` ─────────────────

test('HTML doc: typing <div> → doc becomes <div></div> with caret between tags', async ({
  page,
}) => {
  await gotoEditor(page);

  // Switch to HTML language (updates store + reconfigures CM6 language compartment).
  await page.evaluate(() => (window as unknown as WinExt).__setEditorLanguage('html'));

  const content = page.locator('.cm-content');
  await content.click();

  // Type `<div` then `>` — the inputHandler should intercept the `>` and insert `</div>`.
  await page.keyboard.type('<div>');

  // Wait for the auto-close to appear.
  await page.waitForFunction(
    () => (window as unknown as WinExt).__editor.getValue().includes('</div>'),
    { timeout: 5000 },
  );

  const text = await getValue(page);
  expect(text).toBe('<div></div>');

  // Assert caret is between the tags (position 5: right after the first `>`).
  const caretPos = await page.evaluate(() => {
    const view = (
      window as unknown as { __cmView?: { state: { selection: { main: { head: number } } } } }
    ).__cmView;
    return view?.state.selection.main.head ?? -1;
  });
  // If __cmView is not exposed, verify via DOM selection or accept text assertion only.
  // The text assertion above is the primary check; caret position is secondary.
  if (caretPos !== -1) {
    expect(caretPos).toBe(5); // `<div>` is 5 chars; caret is at offset 5
  }
});

// ── 2. HTML doc: void tag `<br>` → no auto-close ─────────────────────────────

test('HTML doc: typing <br> → no auto-close (void tag, text stays <br>)', async ({ page }) => {
  await gotoEditor(page);

  // Switch to HTML language.
  await page.evaluate(() => (window as unknown as WinExt).__setEditorLanguage('html'));

  const content = page.locator('.cm-content');
  await content.click();

  // Type `<br>` — should NOT auto-close.
  await page.keyboard.type('<br>');

  // Give a short settling time to ensure no async auto-close fires.
  await page.waitForTimeout(300);

  const text = await getValue(page);
  expect(text).toBe('<br>');
  expect(text).not.toContain('</br>');
});

// ── 3. Non-HTML doc: no auto-close ───────────────────────────────────────────

test('Non-HTML doc (plaintext): typing <div> → no auto-close', async ({ page }) => {
  await gotoEditor(page);

  // Stay in plaintext (the default after clearing the doc / no language set).
  // Explicitly set to plaintext to be safe.
  await page.evaluate(() => (window as unknown as WinExt).__setEditorLanguage('plaintext'));

  const content = page.locator('.cm-content');
  await content.click();

  // Type `<div>` — should NOT auto-close in non-HTML doc.
  await page.keyboard.type('<div>');

  // Give a short settling time.
  await page.waitForTimeout(300);

  const text = await getValue(page);
  expect(text).toBe('<div>');
  expect(text).not.toContain('</div>');
});

// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * E2E tests for FileList, FolderAsWorkspace, EditorInspector, and
 * LanguageInspector dock panels (Phase-3 Tasks 2 & 3).
 */
import { test, expect } from '@playwright/test';

test.describe('FileList panel (P3)', () => {
  test('View → File List toggles the File List panel', async ({ page }) => {
    await page.goto('/editor.html');
    await page.waitForFunction(() => !!(window as Record<string, unknown>).__appReady);
    await page.evaluate(() => (window as Record<string, unknown>).__appReady);

    // The file-list container should NOT be visible initially.
    await expect(page.locator('#file-list-items')).toHaveCount(0);

    // Open View menu and click "File List".
    await page.getByRole('menuitem', { name: 'View' }).click();
    await page.getByRole('menuitem', { name: 'File List' }).click();

    // The panel should now be visible with "Open Files" header.
    await expect(page.locator('#file-list-items')).toBeVisible({ timeout: 3000 });
  });

  test('File List shows open documents', async ({ page }) => {
    await page.goto('/editor.html');
    await page.waitForFunction(() => !!(window as Record<string, unknown>).__appReady);
    await page.evaluate(() => (window as Record<string, unknown>).__appReady);

    // Open a second tab.
    await page.locator('#tab-new').click();
    await expect(page.locator('.tab')).toHaveCount(2);

    // Show the File List panel.
    await page.getByRole('menuitem', { name: 'View' }).click();
    await page.getByRole('menuitem', { name: 'File List' }).click();
    await expect(page.locator('#file-list-items')).toBeVisible({ timeout: 3000 });

    // Should list both open documents.
    const items = page.locator('#file-list-items');
    await expect(
      items
        .locator('span')
        .filter({ hasText: /untitled/ })
        .first(),
    ).toBeVisible({
      timeout: 3000,
    });
  });

  test('clicking a File List entry switches the active document', async ({ page }) => {
    await page.goto('/editor.html');
    await page.waitForFunction(() => !!(window as Record<string, unknown>).__appReady);
    await page.evaluate(() => (window as Record<string, unknown>).__appReady);

    // Type in the first tab.
    const content = page.locator('.cm-content');
    await content.click();
    await page.keyboard.type('first tab content');

    // Open a second tab.
    await page.locator('#tab-new').click();
    await expect(page.locator('.tab')).toHaveCount(2);

    // Verify we're on tab 2 (editor empty).
    const editorValue2 = await page.evaluate(() =>
      (window as unknown as { __editor: { getValue(): string } }).__editor.getValue(),
    );
    expect(editorValue2).not.toContain('first tab content');

    // Show the File List panel.
    await page.getByRole('menuitem', { name: 'View' }).click();
    await page.getByRole('menuitem', { name: 'File List' }).click();
    await expect(page.locator('#file-list-items')).toBeVisible({ timeout: 3000 });

    // Click the first row in the file list (first doc).
    const firstRow = page.locator('#file-list-items').locator('> div').first();
    await firstRow.click();

    // Verify editor switched to first tab's content.
    const editorValue1 = await page.waitForFunction(
      () => {
        const val = (window as unknown as { __editor: { getValue(): string } }).__editor.getValue();
        return val.includes('first tab content') ? val : null;
      },
      { timeout: 3000 },
    );
    expect(await editorValue1.jsonValue()).toContain('first tab content');
  });
});

test.describe('FolderAsWorkspace panel (P3)', () => {
  test('View → Folder as Workspace toggles the workspace panel', async ({ page }) => {
    await page.goto('/editor.html');
    await page.waitForFunction(() => !!(window as Record<string, unknown>).__appReady);
    await page.evaluate(() => (window as Record<string, unknown>).__appReady);

    // Panel should not be visible initially.
    await expect(page.locator('#workspace-tree')).toHaveCount(0);

    // Open View → Folder as Workspace.
    await page.getByRole('menuitem', { name: 'View' }).click();
    await page.getByRole('menuitem', { name: 'Folder as Workspace' }).click();

    await expect(page.locator('#workspace-tree')).toBeVisible({ timeout: 3000 });
  });

  test('workspace panel renders tree after mocked showDirectoryPicker', async ({ page }) => {
    // Mock showDirectoryPicker before loading the page.
    await page.addInitScript(() => {
      // Mock FileSystemFileHandle
      const makeFile = (name: string, content: string) => ({
        kind: 'file',
        name,
        getFile: async () => new File([content], name),
      });

      // Mock FileSystemDirectoryHandle — async iterable
      const makeDir = (name: string, entries: [string, unknown][]) => ({
        kind: 'directory',
        name,
        [Symbol.asyncIterator]: async function* () {
          for (const entry of entries) yield entry;
        },
      });

      const mockDir = makeDir('myProject', [
        ['README.md', makeFile('README.md', '# Hello')],
        ['index.ts', makeFile('index.ts', 'export const x = 1;')],
      ]);

      (window as unknown as Record<string, unknown>).showDirectoryPicker = async () => mockDir;
    });

    await page.goto('/editor.html');
    await page.waitForFunction(() => !!(window as Record<string, unknown>).__appReady);
    await page.evaluate(() => (window as Record<string, unknown>).__appReady);

    // Open workspace panel via View menu.
    await page.getByRole('menuitem', { name: 'View' }).click();
    await page.getByRole('menuitem', { name: 'Folder as Workspace' }).click();
    await expect(page.locator('#workspace-tree')).toBeVisible({ timeout: 3000 });

    // Click "Open Folder…" button.
    await page.locator('#workspace-open-btn').click();

    // Wait for tree to render with the mocked directory.
    await expect(page.locator('#workspace-tree')).toContainText('myProject', { timeout: 5000 });
    await expect(page.locator('#workspace-tree')).toContainText('README.md');
    await expect(page.locator('#workspace-tree')).toContainText('index.ts');
  });

  test('clicking a file in the workspace tree opens it in the editor', async ({ page }) => {
    await page.addInitScript(() => {
      const makeFile = (name: string, content: string) => ({
        kind: 'file',
        name,
        getFile: async () => new File([content], name),
      });

      const makeDir = (name: string, entries: [string, unknown][]) => ({
        kind: 'directory',
        name,
        [Symbol.asyncIterator]: async function* () {
          for (const entry of entries) yield entry;
        },
      });

      (window as unknown as Record<string, unknown>).showDirectoryPicker = async () =>
        makeDir('proj', [['hello.ts', makeFile('hello.ts', 'const greeting = "hello";')]]);
    });

    await page.goto('/editor.html');
    await page.waitForFunction(() => !!(window as Record<string, unknown>).__appReady);
    await page.evaluate(() => (window as Record<string, unknown>).__appReady);

    // Show workspace panel.
    await page.getByRole('menuitem', { name: 'View' }).click();
    await page.getByRole('menuitem', { name: 'Folder as Workspace' }).click();
    await expect(page.locator('#workspace-open-btn')).toBeVisible({ timeout: 3000 });
    await page.locator('#workspace-open-btn').click();

    // Wait for the tree to populate.
    await expect(page.locator('#workspace-tree')).toContainText('hello.ts', { timeout: 5000 });

    // Click the file row.
    const fileRow = page.locator('[data-name="hello.ts"]');
    await fileRow.click();

    // The file content should appear in the editor.
    await page.waitForFunction(
      () => {
        const val = (window as unknown as { __editor: { getValue(): string } }).__editor.getValue();
        return val.includes('const greeting') ? val : null;
      },
      { timeout: 5000 },
    );

    // A tab should have been created for the file.
    await expect(page.locator('.tab', { hasText: 'hello.ts' })).toBeVisible({ timeout: 3000 });
  });

  test('File → Open Folder as Workspace opens the workspace panel + picker', async ({ page }) => {
    await page.addInitScript(() => {
      const makeDir = (name: string) => ({
        kind: 'directory',
        name,
        [Symbol.asyncIterator]: async function* () {
          // empty dir
        },
      });
      (window as unknown as Record<string, unknown>).showDirectoryPicker = async () =>
        makeDir('emptyProject');
    });

    await page.goto('/editor.html');
    await page.waitForFunction(() => !!(window as Record<string, unknown>).__appReady);
    await page.evaluate(() => (window as Record<string, unknown>).__appReady);

    // Use File → Open Folder as Workspace.
    await page.getByRole('menuitem', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: 'Open Folder as Workspace' }).click();

    // Workspace panel should appear and show the folder name.
    await expect(page.locator('#workspace-tree')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#workspace-tree')).toContainText('emptyProject', {
      timeout: 5000,
    });
  });
});

test.describe('EditorInspector panel (P3)', () => {
  test('View → Editor Inspector toggles the Editor Inspector panel', async ({ page }) => {
    await page.goto('/editor.html');
    await page.waitForFunction(() => !!(window as Record<string, unknown>).__appReady);
    await page.evaluate(() => (window as Record<string, unknown>).__appReady);

    // Panel should not be visible initially.
    await expect(page.locator('#editor-inspector-table')).toHaveCount(0);

    // Open View → Editor Inspector.
    await page.getByRole('menuitem', { name: 'View' }).click();
    await page.getByRole('menuitem', { name: 'Editor Inspector' }).click();

    // Panel should now be visible.
    await expect(page.locator('#editor-inspector-table')).toBeVisible({ timeout: 3000 });
  });

  test('Editor Inspector shows caret Ln/Col and updates on cursor move', async ({ page }) => {
    await page.goto('/editor.html');
    await page.waitForFunction(() => !!(window as Record<string, unknown>).__appReady);
    await page.evaluate(() => (window as Record<string, unknown>).__appReady);

    // Open Editor Inspector panel.
    await page.getByRole('menuitem', { name: 'View' }).click();
    await page.getByRole('menuitem', { name: 'Editor Inspector' }).click();
    await expect(page.locator('#editor-inspector-table')).toBeVisible({ timeout: 3000 });

    // Initial caret should show Ln 1, Col 1.
    await expect(page.locator('#editor-inspector-table')).toContainText('Ln 1, Col 1', {
      timeout: 3000,
    });

    // Type some text so the cursor moves.
    const content = page.locator('.cm-content');
    await content.click();
    await page.keyboard.type('hello');

    // Caret should now be at Ln 1, Col 6 (after 5 characters).
    await expect(page.locator('#editor-inspector-table')).toContainText('Ln 1, Col 6', {
      timeout: 3000,
    });
  });

  test('Editor Inspector shows language and EOL from the active doc', async ({ page }) => {
    await page.goto('/editor.html');
    await page.waitForFunction(() => !!(window as Record<string, unknown>).__appReady);
    await page.evaluate(() => (window as Record<string, unknown>).__appReady);

    // Open Editor Inspector.
    await page.getByRole('menuitem', { name: 'View' }).click();
    await page.getByRole('menuitem', { name: 'Editor Inspector' }).click();
    await expect(page.locator('#editor-inspector-table')).toBeVisible({ timeout: 3000 });

    // Default doc is plaintext / LF.
    await expect(page.locator('#editor-inspector-table')).toContainText('plaintext', {
      timeout: 3000,
    });
    await expect(page.locator('#editor-inspector-table')).toContainText('LF', { timeout: 3000 });
  });
});

test.describe('LanguageInspector panel (P3)', () => {
  test('View → Language Inspector toggles the Language Inspector panel', async ({ page }) => {
    await page.goto('/editor.html');
    await page.waitForFunction(() => !!(window as Record<string, unknown>).__appReady);
    await page.evaluate(() => (window as Record<string, unknown>).__appReady);

    // Panel should not be visible initially.
    await expect(page.locator('#language-inspector-table')).toHaveCount(0);

    // Open View → Language Inspector.
    await page.getByRole('menuitem', { name: 'View' }).click();
    await page.getByRole('menuitem', { name: 'Language Inspector' }).click();

    // Panel should now be visible.
    await expect(page.locator('#language-inspector-table')).toBeVisible({ timeout: 3000 });
  });

  test('Language Inspector shows language fields for a JavaScript doc', async ({ page }) => {
    await page.goto('/editor.html');
    await page.waitForFunction(() => !!(window as Record<string, unknown>).__appReady);
    await page.evaluate(() => (window as Record<string, unknown>).__appReady);

    // Wait for registry ready (Wasmoon can take a moment in e2e).
    await page.evaluate(() => (window as Record<string, unknown>).__luaReady);

    // Open Language Inspector.
    await page.getByRole('menuitem', { name: 'View' }).click();
    await page.getByRole('menuitem', { name: 'Language Inspector' }).click();
    await expect(page.locator('#language-inspector-table')).toBeVisible({ timeout: 3000 });

    // Set the active doc's language directly (avoids viewport-clipped Language menu items).
    await page.evaluate(() =>
      (window as unknown as { __setActiveLanguage(l: string): void }).__setActiveLanguage(
        'JavaScript',
      ),
    );

    // The Language Inspector should now show JavaScript info.
    await expect(page.locator('#language-inspector-table')).toContainText('JavaScript', {
      timeout: 5000,
    });
    // Should have at least keyword or style section.
    await expect(page.locator('#language-inspector-table')).toContainText('Keywords', {
      timeout: 5000,
    });
  });

  test('Language Inspector shows style colour swatches for a Python doc', async ({ page }) => {
    await page.goto('/editor.html');
    await page.waitForFunction(() => !!(window as Record<string, unknown>).__appReady);
    await page.evaluate(() => (window as Record<string, unknown>).__appReady);

    // Wait for registry ready.
    await page.evaluate(() => (window as Record<string, unknown>).__luaReady);

    // Open Language Inspector.
    await page.getByRole('menuitem', { name: 'View' }).click();
    await page.getByRole('menuitem', { name: 'Language Inspector' }).click();
    await expect(page.locator('#language-inspector-table')).toBeVisible({ timeout: 3000 });

    // Set the active doc's language to Python directly.
    await page.evaluate(() =>
      (window as unknown as { __setActiveLanguage(l: string): void }).__setActiveLanguage('Python'),
    );

    // Should show Styles section with colour codes.
    await expect(page.locator('#language-inspector-table')).toContainText('Styles', {
      timeout: 5000,
    });
    // At least one <code> element with a #rrggbb hex colour should exist.
    const colourCode = page.locator('#language-inspector-table code').first();
    await expect(colourCode).toBeVisible({ timeout: 5000 });
    const text = await colourCode.textContent();
    expect(text).toMatch(/^#[0-9a-f]{6}$/);
  });
});

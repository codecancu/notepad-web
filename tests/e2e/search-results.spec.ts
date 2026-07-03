// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * E2E tests for the Search Engine + Search Results Dock (Phase 6.1).
 *
 * These tests use the programmatic test hook `window.__runFindInOpenDocs(term, opts)`
 * which runs findInDocs over the current open docs, adds the run to searchResultsStore,
 * and shows the Search Results dock panel — matching the future P6.2 dialog trigger.
 */
import { test, expect } from '@playwright/test';

type SearchOpts = { matchCase?: boolean; wholeWord?: boolean; regexp?: boolean };
type SearchRun = {
  term: string;
  totalHits: number;
  fileCount: number;
  files: Array<{
    docId: string;
    name: string;
    hitCount: number;
    lines: Array<{ lineNo: number; lineText: string; hitCount: number }>;
  }>;
};

// Helper: wait for __appReady
async function waitReady(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(() => !!(window as Record<string, unknown>).__appReady);
  await page.evaluate(() => (window as Record<string, unknown>).__appReady);
}

// Helper: run find-in-open-docs programmatically
async function runFind(
  page: import('@playwright/test').Page,
  term: string,
  opts?: SearchOpts,
): Promise<SearchRun> {
  return page.evaluate(
    ([t, o]) =>
      (
        window as unknown as {
          __runFindInOpenDocs: (t: string, o?: SearchOpts) => SearchRun;
        }
      ).__runFindInOpenDocs(t, o ?? undefined),
    [term, opts ?? null] as [string, SearchOpts | null],
  );
}

test.describe('Search Results Dock (P6.1)', () => {
  test('dock shows search header with correct hit/file counts', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);

    // Type content into the first (default) tab
    const editor = page.locator('.cm-content');
    await editor.click();
    await page.keyboard.type('foo bar foo\nbaz qux\nfoo again');

    // Run find
    const run = await runFind(page, 'foo');
    expect(run.totalHits).toBe(3);
    expect(run.fileCount).toBe(1);

    // Dock should be visible
    await expect(page.locator('#search-results-container')).toBeVisible({ timeout: 5000 });

    // Header should contain the term and hit/file counts
    const header = page.locator('.sr-run-header').first();
    await expect(header).toBeVisible({ timeout: 3000 });
    // Faithful to C++ SearchResultsDock: always "hits"/"files" (no singular form).
    await expect(header).toContainText('Search "foo"');
    await expect(header).toContainText('3 hits');
    await expect(header).toContainText('1 files');
  });

  test('dock shows per-line result rows with correct line numbers', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);

    const editor = page.locator('.cm-content');
    await editor.click();
    await page.keyboard.type('alpha beta\nalpha gamma\nno match here');

    const run = await runFind(page, 'alpha');
    expect(run.fileCount).toBe(1);
    expect(run.files[0]?.lines).toHaveLength(2);

    await expect(page.locator('#search-results-container')).toBeVisible({ timeout: 5000 });

    // Should have result rows (class sr-result-row)
    const resultRows = page.locator('.sr-result-row');
    await expect(resultRows).toHaveCount(2, { timeout: 3000 });

    // First row should show line 1
    await expect(resultRows.first()).toContainText('1');
    // Second row should show line 2
    await expect(resultRows.nth(1)).toContainText('2');
  });

  test('per-line collapsing: line with 2 hits shows hitCount=2 in ResultLine', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);

    const editor = page.locator('.cm-content');
    await editor.click();
    await page.keyboard.type('foo foo\nno match');

    const run = await runFind(page, 'foo');
    // 2 hits on one line
    expect(run.totalHits).toBe(2);
    expect(run.files[0]?.lines).toHaveLength(1);
    expect(run.files[0]?.lines[0]?.hitCount).toBe(2);

    // The dock should show one result row (collapsed line)
    await expect(page.locator('#search-results-container')).toBeVisible({ timeout: 5000 });
    const resultRows = page.locator('.sr-result-row');
    await expect(resultRows).toHaveCount(1, { timeout: 3000 });
  });

  test('search across 2 open docs — fileCount=2 in dock header', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);

    // Type in tab 1
    const editor = page.locator('.cm-content');
    await editor.click();
    await page.keyboard.type('needle in doc one');

    // Open tab 2 and type in it
    await page.locator('#tab-new').click();
    await expect(page.locator('.tab')).toHaveCount(2);
    await editor.click();
    await page.keyboard.type('also needle in doc two');

    // Run search across both docs
    const run = await runFind(page, 'needle');
    expect(run.fileCount).toBe(2);
    expect(run.totalHits).toBe(2);

    await expect(page.locator('#search-results-container')).toBeVisible({ timeout: 5000 });
    const header = page.locator('.sr-run-header').first();
    await expect(header).toContainText('2 hits');
    await expect(header).toContainText('2 files');
  });

  test('clicking a result row navigates to correct doc and selects match', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);

    // Tab 1: type content with the search term
    const editor = page.locator('.cm-content');
    await editor.click();
    await page.keyboard.type('first tab content with target word');

    // Tab 2: different content (no match)
    await page.locator('#tab-new').click();
    await expect(page.locator('.tab')).toHaveCount(2);
    await editor.click();
    await page.keyboard.type('second tab no match here');

    // Verify we are on tab 2 (active doc has 'second tab' text)
    const valBefore = await page.evaluate(() =>
      (window as unknown as { __editor: { getValue(): string } }).__editor.getValue(),
    );
    expect(valBefore).toContain('second tab');

    // Run search — should find 'target' in tab 1
    const run = await runFind(page, 'target');
    expect(run.fileCount).toBe(1);

    // Capture expected match range from the search run result
    const expectedLine = run.files[0]!.lines[0]!;
    const expectedStartCol = expectedLine.startCol;
    const expectedEndCol = expectedLine.endCol;

    await expect(page.locator('#search-results-container')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.sr-result-row').first()).toBeVisible({ timeout: 3000 });

    // Click the result row
    await page.locator('.sr-result-row').first().click();

    // Editor should now show tab 1's content
    const valAfter = await page.waitForFunction(
      () => {
        const val = (window as unknown as { __editor: { getValue(): string } }).__editor.getValue();
        return val.includes('first tab content') ? val : null;
      },
      { timeout: 3000 },
    );
    expect(await valAfter.jsonValue()).toContain('first tab content');

    // Assert that the selection is on the expected match range.
    // 'target' starts at column expectedStartCol on line 1 of tab 1.
    const sel = await page.evaluate(() =>
      (
        window as unknown as {
          __editor: { getSelection(): { from: number; to: number } };
        }
      ).__editor.getSelection(),
    );
    // The match is on line 1, so lineObj.from=0; from = 0+startCol, to = 0+endCol.
    expect(sel.from).toBe(expectedStartCol);
    expect(sel.to).toBe(expectedEndCol);
  });

  test('clicking a result row in a CRLF doc selects the correct match (CRLF nav regression)', async ({
    page,
  }) => {
    // Regression test for Important #1: CRLF navigation bug.
    // Before the fix, search-engine.ts built Text.of(content.split('\n')) which
    // retained trailing '\r' on each line for CRLF content.  This caused line offsets
    // to diverge from the live EditorView (which normalises CRLF→LF via EditorState.create).
    // Clicking a result in a CRLF doc would dispatch a selection that was off by N chars
    // (one per preceding CRLF line), landing on the wrong text.
    //
    // Content layout (CRLF): "line1\r\nline2\r\nfoo here\r\nline4"
    // Live view (LF-normalised): "line1\nline2\nfoo here\nline4"
    //   line1: from=0, to=5  (len=5)
    //   line2: from=6, to=11 (len=5)
    //   line3: from=12, to=20 (len=8, "foo here")
    // 'foo' on line 3: from=12, to=15.
    await page.goto('/editor.html');
    await waitReady(page);

    // Inject raw CRLF content directly into the DocumentStore via the dedicated
    // test hook, bypassing CM6's CRLF→LF normalisation on keyboard input.
    // This simulates a real file opened with CRLF line endings.
    const crlfContent = 'line1\r\nline2\r\nfoo here\r\nline4';
    await page.evaluate((content: string) => {
      (window as unknown as { __setActiveDocContent: (c: string) => void }).__setActiveDocContent(
        content,
      );
    }, crlfContent);

    // Confirm the live view contains the content (normalised to LF by EditorState.create).
    await page.waitForFunction(
      () =>
        (window as unknown as { __editor: { getValue(): string } }).__editor
          .getValue()
          .includes('foo here'),
      { timeout: 3000 },
    );

    // Run search — the engine must normalise CRLF→LF to produce correct line numbers.
    const run = await runFind(page, 'foo');
    expect(run.fileCount).toBe(1);
    expect(run.files[0]!.lines[0]!.lineNo).toBe(3); // 'foo' is on line 3

    await expect(page.locator('#search-results-container')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.sr-result-row').first()).toBeVisible({ timeout: 3000 });

    // Click the result row.
    await page.locator('.sr-result-row').first().click();

    // Assert the selection lands exactly on 'foo' (offsets in the LF-normalised doc).
    // line3.from = len("line1\n") + len("line2\n") = 6 + 6 = 12.
    // 'foo'.length = 3, so selection should be [12, 15].
    const sel = await page.evaluate(() =>
      (
        window as unknown as {
          __editor: { getSelection(): { from: number; to: number } };
        }
      ).__editor.getSelection(),
    );
    expect(sel.from).toBe(12); // line3.from + startCol(0)
    expect(sel.to).toBe(15); // line3.from + endCol(3)
  });

  test('__searchResultsRuns returns accumulated runs', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);

    const editor = page.locator('.cm-content');
    await editor.click();
    await page.keyboard.type('some content here');

    await runFind(page, 'some');
    await runFind(page, 'content');

    const runs = await page.evaluate(() =>
      (window as unknown as { __searchResultsRuns: () => SearchRun[] }).__searchResultsRuns(),
    );
    expect(runs).toHaveLength(2);
    expect(runs[0]?.term).toBe('some');
    expect(runs[1]?.term).toBe('content');
  });

  test('latest run is expanded, prior runs are collapsed', async ({ page }) => {
    await page.goto('/editor.html');
    await waitReady(page);

    const editor = page.locator('.cm-content');
    await editor.click();
    await page.keyboard.type('word hello word\nword again');

    await runFind(page, 'word');
    await runFind(page, 'hello');

    await expect(page.locator('#search-results-container')).toBeVisible({ timeout: 5000 });

    // Two run headers should exist
    const headers = page.locator('.sr-run-header');
    await expect(headers).toHaveCount(2, { timeout: 3000 });

    // Newest-first: latest run ('hello') is at index 0 (faithful to C++ insertTopLevelItem(0, ...)).
    await expect(headers.nth(0)).toContainText('hello');

    // Latest run should have file rows visible (expanded)
    // Prior run should not show file rows
    await expect(page.locator('.sr-file-row')).toHaveCount(1, { timeout: 3000 });
  });
});

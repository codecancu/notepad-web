// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * SearchResults dock panel — 3-level tree faithful to SearchResultsDock.
 *
 * Tree structure:
 *   Search header:  `Search "term" (N hits in M files)` — latest expanded, prior collapsed.
 *   File row:       `name (N hits)` — expandable.
 *   Result row:     `<lineNo>: <lineText>` — clicking navigates to the match.
 *
 * Click a result row:
 *   store.setActive(docId) + controller.showDoc(docId) + dispatch selection to match range.
 *
 * Usage:
 *   import { mountSearchResultsPanel } from './search-results-panel';
 *   // Registered with DockManager via PanelDef.render.
 */

import { EditorSelection } from '@codemirror/state';
import type { DocumentStore } from '../services/document-store';
import type { EditorController } from '../editor/editor-controller';
import { searchResultsStore } from '../services/search-results-store';
import type { FileResult, ResultLine } from '../services/search-engine';

/**
 * Mount the SearchResults panel into `el`.
 * `store` = DocumentStore, `controller` = EditorController.
 * Returns an unsubscribe disposer.
 */
export function mountSearchResultsPanel(
  el: HTMLElement,
  store: DocumentStore,
  controller: EditorController,
): () => void {
  el.style.cssText =
    'display:flex;flex-direction:column;height:100%;width:100%;' +
    'background:#f5f5f5;overflow:hidden;font:12px "Segoe UI",system-ui,sans-serif;';

  // ── Toolbar ────────────────────────────────────────────────────────────────
  const toolbar = document.createElement('div');
  toolbar.style.cssText =
    'flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:3px 6px;' +
    'background:#e8e8e8;border-bottom:1px solid #ccc;';

  const titleEl = document.createElement('span');
  titleEl.textContent = 'Search Results';
  titleEl.style.cssText = 'font-weight:600;font-size:12px;color:#333;flex:1;';

  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear';
  clearBtn.style.cssText =
    'font:11px inherit;padding:1px 6px;border:1px solid #aaa;background:#f0f0f0;' +
    'cursor:pointer;border-radius:2px;';

  toolbar.appendChild(titleEl);
  toolbar.appendChild(clearBtn);

  // ── Scrollable results container ───────────────────────────────────────────
  const container = document.createElement('div');
  container.id = 'search-results-container';
  container.style.cssText = 'flex:1 1 auto;overflow:auto;padding:4px 0;';

  el.appendChild(toolbar);
  el.appendChild(container);

  // ── Track expanded state ───────────────────────────────────────────────────
  // Maps: runIndex → collapsed (false = expanded), fileIndex → collapsed
  const runCollapsed = new Map<number, boolean>();
  const fileCollapsed = new Map<string, boolean>(); // key: `${runIdx}-${fileIdx}`
  // Track the last seen run count so we can auto-collapse prior runs when a new
  // run is added (faithful to SearchResultsDock: "prior collapsed, latest expanded").
  let lastRunCount = 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  const render = (): void => {
    container.innerHTML = '';
    const runs = searchResultsStore.runs();

    if (runs.length === 0) {
      // Reset tracking when cleared.
      runCollapsed.clear();
      fileCollapsed.clear();
      lastRunCount = 0;
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:8px 10px;color:#999;font-size:12px;font-style:italic;';
      empty.textContent = 'No search results.';
      container.appendChild(empty);
      return;
    }

    // When a new run is added, auto-collapse all previously-expanded prior runs.
    // This faithfully mirrors SearchResultsDock where each new search collapses
    // the prior ones and opens the newest.
    if (runs.length > lastRunCount && lastRunCount > 0) {
      for (let i = 0; i < runs.length - 1; i++) {
        runCollapsed.set(i, true);
      }
    }
    lastRunCount = runs.length;

    // Render newest-first (faithful to SearchResultsDock.cpp:98 insertTopLevelItem(0, ...)).
    // We iterate by descending index so the latest run appears at the top.
    for (let runIdx = runs.length - 1; runIdx >= 0; runIdx--) {
      const run = runs[runIdx]!;
      const isLatest = runIdx === runs.length - 1;

      // Default: latest expanded, prior collapsed (unless user toggled).
      if (!runCollapsed.has(runIdx)) {
        runCollapsed.set(runIdx, !isLatest);
      }
      const runIsCollapsed = runCollapsed.get(runIdx) ?? !isLatest;

      // ── Search header row ────────────────────────────────────────────────
      const header = document.createElement('div');
      header.className = 'sr-run-header';
      header.style.cssText =
        'display:flex;align-items:center;padding:3px 6px;cursor:pointer;' +
        'background:#dce8f8;border-bottom:1px solid #b8d0ec;font-weight:700;' +
        'user-select:none;font-size:12px;color:#1a3a5c;';

      const arrow = document.createElement('span');
      arrow.textContent = runIsCollapsed ? '▶' : '▼';
      arrow.style.cssText = 'margin-right:5px;font-size:10px;opacity:0.7;';

      const label = document.createElement('span');
      // Faithful to C++ SearchResultsDock: always "hits"/"files" (no singular form).
      label.textContent = `Search "${run.term}" (${run.totalHits} hits in ${run.fileCount} files)`;

      header.appendChild(arrow);
      header.appendChild(label);

      header.addEventListener('click', () => {
        runCollapsed.set(runIdx, !runCollapsed.get(runIdx));
        render();
      });

      container.appendChild(header);

      if (runIsCollapsed) continue;

      // ── File rows ──────────────────────────────────────────────────────────
      run.files.forEach((file: FileResult, fileIdx: number) => {
        const fileKey = `${runIdx}-${fileIdx}`;
        if (!fileCollapsed.has(fileKey)) {
          fileCollapsed.set(fileKey, false); // default: expanded
        }
        const fileIsCollapsed = fileCollapsed.get(fileKey) ?? false;

        const fileRow = document.createElement('div');
        fileRow.className = 'sr-file-row';
        fileRow.style.cssText =
          'display:flex;align-items:center;padding:2px 6px 2px 18px;cursor:pointer;' +
          'background:#eef3fa;border-bottom:1px solid #d0dcea;font-weight:600;' +
          'user-select:none;font-size:12px;color:#2a4a7f;';

        const fileArrow = document.createElement('span');
        fileArrow.textContent = fileIsCollapsed ? '▶' : '▼';
        fileArrow.style.cssText = 'margin-right:5px;font-size:9px;opacity:0.7;';

        const fileLabel = document.createElement('span');
        // Faithful to C++ SearchResultsDock: always "hits" (no singular form).
        fileLabel.textContent = `${file.name} (${file.hitCount} hits)`;

        fileRow.appendChild(fileArrow);
        fileRow.appendChild(fileLabel);

        fileRow.addEventListener('click', () => {
          fileCollapsed.set(fileKey, !fileCollapsed.get(fileKey));
          render();
        });

        container.appendChild(fileRow);

        if (fileIsCollapsed) return;

        // ── Result rows ──────────────────────────────────────────────────────
        file.lines.forEach((resultLine: ResultLine) => {
          const resultRow = document.createElement('div');
          resultRow.className = 'sr-result-row';
          resultRow.style.cssText =
            'display:flex;align-items:baseline;padding:1px 6px 1px 36px;cursor:pointer;' +
            'border-bottom:1px solid #e8e8e8;font-size:11px;color:#222;' +
            'font-family:"Consolas","Courier New",monospace;';

          // Line number badge
          const lineNoSpan = document.createElement('span');
          lineNoSpan.textContent = String(resultLine.lineNo);
          lineNoSpan.style.cssText =
            'color:#888;margin-right:6px;min-width:2.5em;text-align:right;flex-shrink:0;';

          // Separator
          const sep = document.createElement('span');
          sep.textContent = ': ';
          sep.style.cssText = 'color:#aaa;margin-right:4px;flex-shrink:0;';

          // Line text (with optional match highlight)
          const lineText = resultLine.lineText;
          const startCol = resultLine.startCol;
          const endCol = resultLine.endCol;

          const textContainer = document.createElement('span');
          textContainer.style.cssText =
            'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;';

          if (startCol < endCol && endCol <= lineText.length) {
            // Split into before / match / after for highlighting.
            const before = document.createTextNode(lineText.slice(0, startCol));
            const matchSpan = document.createElement('mark');
            matchSpan.textContent = lineText.slice(startCol, endCol);
            matchSpan.style.cssText =
              'background:#ffdd57;color:#222;border-radius:2px;padding:0 1px;';
            const after = document.createTextNode(lineText.slice(endCol));
            textContainer.appendChild(before);
            textContainer.appendChild(matchSpan);
            textContainer.appendChild(after);
          } else {
            textContainer.textContent = lineText;
          }

          resultRow.appendChild(lineNoSpan);
          resultRow.appendChild(sep);
          resultRow.appendChild(textContainer);

          // Hover effect
          resultRow.addEventListener('mouseenter', () => {
            resultRow.style.background = '#cce5ff';
          });
          resultRow.addEventListener('mouseleave', () => {
            resultRow.style.background = '';
          });

          // Click: navigate to the match
          resultRow.addEventListener('click', () => {
            store.setActive(file.docId);
            controller.showDoc(file.docId);

            // Compute absolute offsets using the LIVE view's doc (post-showDoc).
            // The search engine normalises CRLF→LF before building its Text, which
            // matches what EditorState.create() does internally.  So resultLine.lineNo
            // and startCol/endCol are already in live-view (LF-normalised) coordinates.
            // We read the live doc directly to avoid any offset skew.
            const liveView = controller.getView();
            const liveDoc = liveView.state.doc;
            if (resultLine.lineNo < 1 || resultLine.lineNo > liveDoc.lines) return;
            const lineObj = liveDoc.line(resultLine.lineNo);
            const from = lineObj.from + resultLine.startCol;
            const to = lineObj.from + resultLine.endCol;

            liveView.dispatch({
              selection: EditorSelection.range(from, to),
              scrollIntoView: true,
            });
          });

          container.appendChild(resultRow);
        });
      });
    }
  };

  // Initial render
  render();

  // Clear button
  clearBtn.addEventListener('click', () => {
    runCollapsed.clear();
    fileCollapsed.clear();
    searchResultsStore.clear();
    // render() is called by the subscription
  });

  // Subscribe to store changes
  const unsub = searchResultsStore.subscribe(render);

  return unsub;
}

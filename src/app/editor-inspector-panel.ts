// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * EditorInspector dock panel — live read-only view of the active editor state.
 *
 * Displays:
 *   - Caret position (Ln / Col)
 *   - Selection: anchor → head ranges + character count
 *   - Document length (chars + lines)
 *   - Current EOL style
 *   - Language ID
 *   - Dirty flag
 *   - BOM flag
 *
 * Updates on:
 *   - DocumentStore subscription (active doc change, doc mutations)
 *   - `cm-cursor-change` CustomEvent dispatched on the CM6 view DOM
 *
 * Returns a cleanup disposer that removes all listeners (store + DOM event).
 */

import type { DocumentStore } from '../services/document-store';
import type { EditorView } from '@codemirror/view';

/** Render a label + value row into a table body. */
function row(label: string, value: string): HTMLTableRowElement {
  const tr = document.createElement('tr');
  const tdLabel = document.createElement('td');
  tdLabel.textContent = label;
  tdLabel.style.cssText =
    'padding:2px 8px 2px 4px;color:#555;font-weight:600;white-space:nowrap;vertical-align:top;';
  const tdValue = document.createElement('td');
  tdValue.textContent = value;
  tdValue.style.cssText = 'padding:2px 4px;color:#222;word-break:break-all;';
  tr.appendChild(tdLabel);
  tr.appendChild(tdValue);
  return tr;
}

/**
 * Mount the EditorInspector panel into `el`.
 * Called by DockManager via PanelDef.render.
 * Returns a cleanup disposer (removes store + DOM event listeners).
 */
export function mountEditorInspectorPanel(
  el: HTMLElement,
  store: DocumentStore,
  viewRef: { current: EditorView | null },
): () => void {
  el.style.cssText =
    'display:flex;flex-direction:column;height:100%;width:100%;' +
    'background:#f5f5f5;overflow:hidden;font:12px "Consolas","Courier New",monospace;';

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.style.cssText =
    'flex:0 0 auto;display:flex;align-items:center;padding:3px 6px;' +
    'background:#e8e8e8;border-bottom:1px solid #ccc;';
  const titleEl = document.createElement('span');
  titleEl.textContent = 'Editor Inspector';
  titleEl.style.cssText =
    'font-weight:600;font-size:12px;color:#333;font-family:"Segoe UI",system-ui,sans-serif;';
  toolbar.appendChild(titleEl);

  // Table container
  const tableWrap = document.createElement('div');
  tableWrap.style.cssText = 'flex:1 1 auto;overflow:auto;padding:6px 4px;';

  const table = document.createElement('table');
  table.id = 'editor-inspector-table';
  table.style.cssText = 'border-collapse:collapse;width:100%;';
  tableWrap.appendChild(table);

  el.appendChild(toolbar);
  el.appendChild(tableWrap);

  // Current caret position (updated via cm-cursor-change event).
  let curLine = 1;
  let curCol = 1;

  /** Rebuild the table with the latest state. */
  const render = (): void => {
    table.innerHTML = '';
    const doc = store.active();

    // Caret
    table.appendChild(row('Caret', `Ln ${curLine}, Col ${curCol}`));

    // Selection info from CM6 view state
    const view = viewRef.current;
    if (view) {
      const sel = view.state.selection;
      const ranges = sel.ranges;
      const selChars = ranges.reduce((sum, r) => sum + Math.abs(r.to - r.from), 0);
      if (selChars > 0) {
        const rangeStr = ranges
          .filter((r) => !r.empty)
          .map((r) => `${r.anchor}→${r.head}`)
          .join(', ');
        table.appendChild(row('Selection', `${selChars} chars`));
        table.appendChild(row('Ranges', rangeStr));
      } else {
        table.appendChild(row('Selection', 'none'));
        table.appendChild(row('Ranges', '—'));
      }
      // Document length from CM6 state (authoritative)
      const docChars = view.state.doc.length;
      const docLines = view.state.doc.lines;
      table.appendChild(row('Doc Length', `${docChars} chars, ${docLines} lines`));
    } else {
      table.appendChild(row('Selection', '—'));
      table.appendChild(row('Ranges', '—'));
      table.appendChild(row('Doc Length', doc ? `${doc.content.length} chars` : '—'));
    }

    // Store-level fields
    if (doc) {
      table.appendChild(row('EOL', doc.eol.toUpperCase()));
      table.appendChild(row('Language', doc.languageId));
      table.appendChild(row('Dirty', doc.dirty ? 'yes ●' : 'no'));
      table.appendChild(row('BOM', doc.bom ? 'yes (UTF-8 BOM)' : 'no'));
      table.appendChild(row('Name', doc.name));
    } else {
      table.appendChild(row('EOL', '—'));
      table.appendChild(row('Language', '—'));
      table.appendChild(row('Dirty', '—'));
      table.appendChild(row('BOM', '—'));
      table.appendChild(row('Name', '—'));
    }
  };

  // Initial render
  render();

  // Subscribe to DocumentStore for doc changes + active-doc switches.
  const unsubStore = store.subscribe(render);

  // Listen for cursor-change events on the CM6 view DOM.
  const onCursorChange = (e: Event): void => {
    const ce = e as CustomEvent<{ line: number; col: number }>;
    curLine = ce.detail.line;
    curCol = ce.detail.col;
    render();
  };

  // We attach to document (bubbling); cm-cursor-change bubbles from view.dom.
  document.addEventListener('cm-cursor-change', onCursorChange);

  // Cleanup disposer
  return (): void => {
    unsubStore();
    document.removeEventListener('cm-cursor-change', onCursorChange);
  };
}

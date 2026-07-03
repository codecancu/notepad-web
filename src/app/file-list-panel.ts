// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * FileList dock panel — shows all open documents as a vertical list with
 * dirty-state indicators and active-document highlighting.
 *
 * Usage:
 *   import { mountFileListPanel } from './file-list-panel';
 *   // Registered with DockManager via PanelDef.render.
 *
 * Design:
 *  - Subscribes to DocumentStore and re-renders on any change.
 *  - Clicking an entry calls store.setActive(id) + controller.showDoc(id).
 *  - The active document row is highlighted with a distinct background.
 *  - Dirty documents show a `●` bullet after the filename (faithful to NotepadNext).
 *  - Light chrome styling consistent with the rest of the Notepad Web UI.
 */

import type { DocumentStore } from '../services/document-store';
import type { EditorController } from '../editor/editor-controller';

/**
 * Mount the FileList panel into `el`. Called by DockManager via PanelDef.render.
 * Returns an unsubscribe function that callers (e.g. PanelRenderer.dispose) must
 * invoke to release the store subscription and prevent listener leaks.
 */
export function mountFileListPanel(
  el: HTMLElement,
  store: DocumentStore,
  controller: EditorController,
): () => void {
  el.style.cssText =
    'display:flex;flex-direction:column;height:100%;width:100%;' +
    'background:#f5f5f5;overflow:hidden;font:13px "Segoe UI",system-ui,sans-serif;';

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.style.cssText =
    'flex:0 0 auto;display:flex;align-items:center;padding:3px 6px;' +
    'background:#e8e8e8;border-bottom:1px solid #ccc;';
  const title = document.createElement('span');
  title.textContent = 'Open Files';
  title.style.cssText = 'font-weight:600;font-size:12px;color:#333;';
  toolbar.appendChild(title);

  // List container
  const list = document.createElement('div');
  list.id = 'file-list-items';
  list.style.cssText = 'flex:1 1 auto;overflow-y:auto;padding:2px 0;';

  el.appendChild(toolbar);
  el.appendChild(list);

  /** Full re-render of the list from the current store state. */
  const render = (): void => {
    list.innerHTML = '';
    const docs = store.list();
    const activeId = store.activeId;

    if (docs.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:8px 10px;color:#999;font-size:12px;font-style:italic;';
      empty.textContent = 'No open files';
      list.appendChild(empty);
      return;
    }

    for (const doc of docs) {
      const row = document.createElement('div');
      const isActive = doc.id === activeId;

      row.style.cssText =
        'display:flex;align-items:center;padding:4px 8px;cursor:pointer;' +
        'border-bottom:1px solid #e0e0e0;user-select:none;' +
        (isActive
          ? 'background:#cce5ff;color:#003d82;font-weight:600;'
          : 'background:transparent;color:#222;');

      // Dirty indicator
      if (doc.dirty) {
        const bullet = document.createElement('span');
        bullet.textContent = '●';
        bullet.title = 'Unsaved changes';
        bullet.style.cssText =
          'margin-right:5px;color:' + (isActive ? '#003d82' : '#c0392b') + ';font-size:10px;';
        row.appendChild(bullet);
      } else {
        // Spacer to keep name alignment consistent when no bullet
        const spacer = document.createElement('span');
        spacer.style.cssText = 'margin-right:15px;';
        row.appendChild(spacer);
      }

      // Filename label
      const label = document.createElement('span');
      label.textContent = doc.name;
      label.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;';
      label.title = doc.name;
      row.appendChild(label);

      // Hover effect
      row.addEventListener('mouseenter', () => {
        if (doc.id !== store.activeId) {
          row.style.background = '#e8f0fe';
        }
      });
      row.addEventListener('mouseleave', () => {
        if (doc.id !== store.activeId) {
          row.style.background = 'transparent';
        }
      });

      // Click: activate this document
      row.addEventListener('click', () => {
        store.setActive(doc.id);
        controller.showDoc(doc.id);
      });

      list.appendChild(row);
    }
  };

  // Initial render
  render();

  // Subscribe to store changes for live updates; return the unsubscribe so
  // callers (DockManager.PanelRenderer.dispose) can release the listener.
  return store.subscribe(render);
}

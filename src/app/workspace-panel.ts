// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * FolderAsWorkspace dock panel — opens a directory via the File System Access
 * API and renders a lazy-expanding tree of its contents.
 *
 * Usage:
 *   import { mountWorkspacePanel } from './workspace-panel';
 *   // Registered with DockManager via PanelDef.render.
 *
 * Design:
 *  - "Open Folder…" button → showDirectoryPicker() → FileSystemDirectoryHandle.
 *  - Tree is rendered lazily: directory children are fetched only when a node
 *    is expanded by the user (big folders don't block on first open).
 *  - Double-clicking (or single-clicking) a file leaf reads it via the file
 *    handle, creates a doc in DocumentStore (name, content, handle, language,
 *    eol, bom), and calls controller.showDoc().
 *  - Language detection reuses luaRegistry (same path as file-actions.ts).
 *  - FSA directory handles are session-only — the workspace resets on page reload
 *    because FileSystemDirectoryHandle is not broadly serializable to storage.
 *    This is an honest constraint of the browser FSA API.
 *  - If showDirectoryPicker is unavailable, a friendly message is shown instead.
 */

import type { DocumentStore } from '../services/document-store';
import type { EditorController } from '../editor/editor-controller';
import { luaRegistry } from '../services/lua-registry';
import { stripBom, detectEol } from '../services/text-utils';

// ── Types ────────────────────────────────────────────────────────────────────

/** A tree node — either a directory or a file. */
interface TreeNode {
  name: string;
  kind: 'directory' | 'file';
  handle: FileSystemDirectoryHandle | FileSystemFileHandle;
  /** For directories: children loaded lazily; undefined = not yet expanded. */
  children?: TreeNode[];
}

// ── Tree-building helpers ────────────────────────────────────────────────────

/**
 * Resolve the language id from the filename extension via luaRegistry.
 * Uses luaRegistry.detectByExtension() which does a single O(n) pass over
 * the loaded languages — no redundant listLanguages()+getLanguage() scan.
 * Falls back to 'plaintext' if no match.
 */
function detectLanguage(name: string): string {
  return luaRegistry.detectByExtension(name) ?? 'plaintext';
}

/**
 * Build top-level tree nodes from a directory handle.
 * Only reads the immediate children (lazy expansion).
 */
export async function buildTreeNodes(dirHandle: FileSystemDirectoryHandle): Promise<TreeNode[]> {
  const nodes: TreeNode[] = [];
  // FileSystemDirectoryHandle is an async iterable of [name, handle] pairs.
  // TypeScript's lib.dom.d.ts may not expose .entries() for all versions;
  // cast to a known async-iterable shape for compatibility.
  const iterable = dirHandle as unknown as AsyncIterable<[string, FileSystemHandle]>;
  for await (const [name, handle] of iterable) {
    nodes.push({ name, kind: handle.kind, handle } as TreeNode);
  }
  // Sort: directories first, then files, both alphabetically.
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return nodes;
}

// ── DOM renderer ─────────────────────────────────────────────────────────────

/**
 * Mount the FolderAsWorkspace panel into `el`.
 * Returns an optional cleanup function (currently a no-op placeholder) that
 * DockManager.PanelRenderer.dispose() will invoke for consistency with the
 * panel cleanup contract.  If workspace-panel ever acquires store subscriptions
 * or other teardown work, add it here.
 */
export function mountWorkspacePanel(
  el: HTMLElement,
  store: DocumentStore,
  controller: EditorController,
): () => void {
  const fsa =
    typeof (window as unknown as Record<string, unknown>).showDirectoryPicker === 'function';

  el.style.cssText =
    'display:flex;flex-direction:column;height:100%;width:100%;' +
    'background:#f5f5f5;overflow:hidden;font:13px "Segoe UI",system-ui,sans-serif;';

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.style.cssText =
    'flex:0 0 auto;display:flex;align-items:center;gap:6px;padding:3px 6px;' +
    'background:#e8e8e8;border-bottom:1px solid #ccc;';

  const title = document.createElement('span');
  title.style.cssText = 'font-weight:600;font-size:12px;color:#333;flex:1;';
  title.textContent = 'Workspace';

  const openBtn = document.createElement('button');
  openBtn.id = 'workspace-open-btn';
  openBtn.textContent = 'Open Folder…';
  openBtn.title = fsa ? 'Open a folder as workspace' : 'File System Access API not supported';
  openBtn.disabled = !fsa;
  openBtn.style.cssText =
    'font:11px inherit;padding:2px 8px;border:1px solid #aaa;' +
    'background:#f0f0f0;cursor:' +
    (fsa ? 'pointer' : 'not-allowed') +
    ';' +
    'border-radius:3px;white-space:nowrap;';

  toolbar.appendChild(title);
  toolbar.appendChild(openBtn);

  // Tree container
  const treeContainer = document.createElement('div');
  treeContainer.id = 'workspace-tree';
  treeContainer.style.cssText = 'flex:1 1 auto;overflow:auto;padding:2px 0;';

  el.appendChild(toolbar);
  el.appendChild(treeContainer);

  if (!fsa) {
    const msg = document.createElement('div');
    msg.style.cssText = 'padding:10px;color:#888;font-size:12px;font-style:italic;';
    msg.textContent = 'File System Access API is not supported in this browser.';
    treeContainer.appendChild(msg);
    return () => {
      /* nothing to clean up */
    };
  }

  // Show placeholder until a folder is opened
  const placeholder = document.createElement('div');
  placeholder.style.cssText = 'padding:8px 10px;color:#999;font-size:12px;font-style:italic;';
  placeholder.textContent = 'No folder open. Click "Open Folder…" to start.';
  treeContainer.appendChild(placeholder);

  // ── Open folder handler ──────────────────────────────────────────────────

  openBtn.addEventListener('click', () => {
    void (async () => {
      try {
        // Call showDirectoryPicker bound to window to avoid "Illegal invocation"
        // in strict FSA implementations that check the receiver.
        const dirHandle = await (
          window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }
        ).showDirectoryPicker.call(window);
        await renderTree(dirHandle);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('[WorkspacePanel] Failed to open directory:', err);
      }
    })();
  });

  // ── Tree renderer ────────────────────────────────────────────────────────

  async function renderTree(dirHandle: FileSystemDirectoryHandle): Promise<void> {
    treeContainer.innerHTML = '';

    // Show folder root label
    const rootLabel = document.createElement('div');
    rootLabel.style.cssText =
      'padding:4px 8px;font-weight:600;font-size:12px;color:#555;' +
      'border-bottom:1px solid #ddd;background:#ececec;';
    rootLabel.textContent = '📁 ' + dirHandle.name;
    treeContainer.appendChild(rootLabel);

    const nodes = await buildTreeNodes(dirHandle);
    const ul = buildTreeList(nodes, 0);
    treeContainer.appendChild(ul);
  }

  /** Recursively build a <ul> for tree nodes at a given indent depth. */
  function buildTreeList(nodes: TreeNode[], depth: number): HTMLUListElement {
    const ul = document.createElement('ul');
    ul.style.cssText =
      'list-style:none;margin:0;padding:0;padding-left:' + (depth > 0 ? '14px' : '0') + ';';

    for (const node of nodes) {
      const li = document.createElement('li');
      li.style.cssText = 'margin:0;padding:0;';

      const row = document.createElement('div');
      row.dataset.kind = node.kind;
      row.dataset.name = node.name;
      row.style.cssText =
        'display:flex;align-items:center;padding:3px 8px;cursor:pointer;' +
        'user-select:none;border-bottom:1px solid #e8e8e8;' +
        'color:' +
        (node.kind === 'directory' ? '#444' : '#222') +
        ';';

      // Icon
      const icon = document.createElement('span');
      icon.style.cssText = 'margin-right:5px;font-size:12px;flex-shrink:0;';
      icon.textContent = node.kind === 'directory' ? '▶' : '📄';

      // Name
      const nameSpan = document.createElement('span');
      nameSpan.textContent = node.name;
      nameSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      nameSpan.title = node.name;

      row.appendChild(icon);
      row.appendChild(nameSpan);

      // Hover effect
      row.addEventListener('mouseenter', () => {
        row.style.background = '#e8f0fe';
      });
      row.addEventListener('mouseleave', () => {
        row.style.background = 'transparent';
      });

      if (node.kind === 'directory') {
        let expanded = false;
        let childUl: HTMLUListElement | null = null;

        row.addEventListener('click', () => {
          void (async () => {
            if (!expanded) {
              icon.textContent = '▼';
              if (!childUl) {
                // Lazy-load children
                icon.textContent = '…';
                try {
                  const children = await buildTreeNodes(node.handle as FileSystemDirectoryHandle);
                  node.children = children;
                  childUl = buildTreeList(children, depth + 1);
                  li.appendChild(childUl);
                } catch {
                  icon.textContent = '▶';
                  return;
                }
              } else {
                childUl.style.display = '';
              }
              icon.textContent = '▼';
              expanded = true;
            } else {
              icon.textContent = '▶';
              if (childUl) childUl.style.display = 'none';
              expanded = false;
            }
          })();
        });
      } else {
        // File leaf: click to open
        row.addEventListener('click', () => {
          void openFile(node);
        });
      }

      li.appendChild(row);
      ul.appendChild(li);
    }

    return ul;
  }

  // ── File open from tree ──────────────────────────────────────────────────

  async function openFile(node: TreeNode): Promise<void> {
    try {
      const fileHandle = node.handle as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      const raw = await file.text();
      const { text, bom } = stripBom(raw);
      const eol = detectEol(text);
      const languageId = detectLanguage(node.name);

      // Check if this file is already open (same handle name match)
      const existing = store.list().find((d) => d.name === node.name && d.handle === fileHandle);
      if (existing) {
        store.setActive(existing.id);
        controller.showDoc(existing.id);
        return;
      }

      const doc = store.create({
        name: node.name,
        content: text,
        handle: fileHandle,
        eol,
        bom,
        languageId,
        dirty: false,
      });
      controller.showDoc(doc.id);
    } catch (err) {
      console.error('[WorkspacePanel] Failed to open file:', node.name, err);
    }
  }

  // No store subscriptions or other resources to tear down in this panel;
  // return a no-op cleanup to satisfy the PanelDef cleanup contract.
  return () => {
    /* nothing to clean up */
  };
}

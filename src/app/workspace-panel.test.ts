// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountWorkspacePanel, buildTreeNodes } from './workspace-panel';
import { DocumentStore } from '../services/document-store';
import type { EditorController } from '../editor/editor-controller';

// ── Mock helpers ───────────────────────────────────────────────────────────────

function makeController(): EditorController {
  return { showDoc: vi.fn() } as unknown as EditorController;
}

function makeEl(): HTMLDivElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

/** Build a mock FileSystemFileHandle. */
function mockFileHandle(name: string, content = ''): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    getFile: async () => new File([content], name),
  } as unknown as FileSystemFileHandle;
}

/** Build a mock FileSystemDirectoryHandle whose entries() iterates the given map. */
function mockDirHandle(
  name: string,
  entries: [string, FileSystemHandle][],
): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    entries: async function* () {
      for (const entry of entries) yield entry;
    },
    [Symbol.asyncIterator]: async function* () {
      for (const entry of entries) yield entry;
    },
  } as unknown as FileSystemDirectoryHandle;
}

// ── buildTreeNodes tests ───────────────────────────────────────────────────────

describe('buildTreeNodes', () => {
  it('returns sorted nodes — directories first then files', async () => {
    const dir = mockDirHandle('root', [
      ['zebra.ts', mockFileHandle('zebra.ts')],
      ['alpha/', mockDirHandle('alpha/', [])],
      ['readme.md', mockFileHandle('readme.md')],
      ['src/', mockDirHandle('src/', [])],
    ]);

    const nodes = await buildTreeNodes(dir);

    // Directories come before files.
    expect(nodes[0]!.kind).toBe('directory');
    expect(nodes[1]!.kind).toBe('directory');
    expect(nodes[2]!.kind).toBe('file');
    expect(nodes[3]!.kind).toBe('file');

    // Directories are alphabetical among themselves.
    expect(nodes[0]!.name).toBe('alpha/');
    expect(nodes[1]!.name).toBe('src/');

    // Files are alphabetical among themselves.
    expect(nodes[2]!.name).toBe('readme.md');
    expect(nodes[3]!.name).toBe('zebra.ts');
  });

  it('returns empty array for an empty directory', async () => {
    const dir = mockDirHandle('empty', []);
    const nodes = await buildTreeNodes(dir);
    expect(nodes).toHaveLength(0);
  });

  it('returns a single file node', async () => {
    const dir = mockDirHandle('root', [['index.js', mockFileHandle('index.js')]]);
    const nodes = await buildTreeNodes(dir);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.name).toBe('index.js');
    expect(nodes[0]!.kind).toBe('file');
  });
});

// ── mountWorkspacePanel tests ─────────────────────────────────────────────────

describe('mountWorkspacePanel (FSA not available)', () => {
  it('shows unsupported message when showDirectoryPicker is absent', () => {
    // Ensure showDirectoryPicker is not present.
    const w = window as unknown as Record<string, unknown>;
    const orig = w.showDirectoryPicker;
    delete w.showDirectoryPicker;

    const el = makeEl();
    const store = new DocumentStore();
    const controller = makeController();
    mountWorkspacePanel(el, store, controller);

    expect(el.textContent).toContain('not supported');

    // Restore.
    if (orig !== undefined) w.showDirectoryPicker = orig;
  });
});

describe('mountWorkspacePanel (FSA available)', () => {
  let el: HTMLDivElement;
  let store: DocumentStore;
  let controller: EditorController;

  beforeEach(() => {
    el = makeEl();
    store = new DocumentStore();
    controller = makeController();

    // Provide a mock showDirectoryPicker that resolves immediately with a dir.
    (window as unknown as Record<string, unknown>).showDirectoryPicker = async () =>
      mockDirHandle('myProject', [
        ['main.ts', mockFileHandle('main.ts', 'console.log(1);')],
        ['lib/', mockDirHandle('lib/', [['helper.ts', mockFileHandle('helper.ts', '')]])],
      ]);
  });

  it('renders toolbar with Open Folder button', () => {
    mountWorkspacePanel(el, store, controller);
    const btn = el.querySelector('#workspace-open-btn') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn!.disabled).toBe(false);
  });

  it('renders placeholder text before opening a folder', () => {
    mountWorkspacePanel(el, store, controller);
    expect(el.textContent).toContain('No folder open');
  });

  it('renders tree after clicking Open Folder', async () => {
    mountWorkspacePanel(el, store, controller);
    const btn = el.querySelector('#workspace-open-btn') as HTMLButtonElement;
    btn.click();

    // Wait deterministically for the async tree render to complete.
    const treeEl = el.querySelector('#workspace-tree');
    expect(treeEl).not.toBeNull();
    await vi.waitFor(() => {
      expect(treeEl!.textContent).toContain('myProject');
    });
    // File leaf should appear.
    expect(treeEl!.textContent).toContain('main.ts');
    // Subdirectory should appear.
    expect(treeEl!.textContent).toContain('lib/');
  });

  it('opens a file from the tree into DocumentStore on click', async () => {
    mountWorkspacePanel(el, store, controller);
    const btn = el.querySelector('#workspace-open-btn') as HTMLButtonElement;
    btn.click();

    // Wait deterministically for the async tree render.
    const treeEl = el.querySelector('#workspace-tree')!;
    await vi.waitFor(() => {
      expect(treeEl.textContent).toContain('main.ts');
    });

    // Find the file row for main.ts and click it.
    const fileRow = Array.from(treeEl.querySelectorAll('div[data-kind="file"]')).find(
      (d) => d.getAttribute('data-name') === 'main.ts',
    ) as HTMLElement | undefined;
    expect(fileRow).toBeDefined();
    fileRow!.click();

    // Wait deterministically for the async file-open to complete.
    await vi.waitFor(() => {
      const docs = store.list();
      expect(docs.find((d) => d.name === 'main.ts')).toBeDefined();
    });

    // A document should have been created in the store.
    const docs = store.list();
    const opened = docs.find((d) => d.name === 'main.ts');
    expect(opened).toBeDefined();
    expect(opened!.content).toContain('console.log(1);');
    expect(controller.showDoc).toHaveBeenCalledWith(opened!.id);
  });
});

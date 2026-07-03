// SPDX-License-Identifier: GPL-3.0-or-later
import type { DocumentStore, DocId } from '../services/document-store';
import { showContextMenu } from './context-menu';

export interface TabBarContextCallbacks {
  onSave: (id: DocId) => void;
  onSaveAs: (id: DocId) => void;
  onCloseAllExceptActive: () => void;
  onCloseAllToLeft: () => void;
  onCloseAllToRight: () => void;
  onReload: () => void;
}

export class TabBar {
  private overflowBtn: HTMLButtonElement | null = null;
  private dropdown: HTMLElement | null = null;

  // Bound references registered once so resize listener doesn't accumulate.
  private readonly _onResize: () => void;
  private readonly _onDocClick: (e: MouseEvent) => void;
  private readonly _onDocKeydown: (e: KeyboardEvent) => void;

  constructor(
    private root: HTMLElement,
    private store: DocumentStore,
    private onActivate: (id: DocId) => void,
    private onClose: (id: DocId) => void,
    private onNew: () => void,
    private contextCallbacks?: TabBarContextCallbacks,
  ) {
    this._onResize = () => this.updateOverflow();
    this._onDocClick = (e: MouseEvent) => {
      if (
        this.dropdown &&
        !this.dropdown.contains(e.target as Node) &&
        e.target !== this.overflowBtn
      ) {
        this.closeDropdown();
      }
    };
    this._onDocKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.closeDropdown();
    };

    window.addEventListener('resize', this._onResize);
    document.addEventListener('click', this._onDocClick);
    document.addEventListener('keydown', this._onDocKeydown);

    this.store.subscribe(() => this.render());
  }

  render(): void {
    this.closeDropdown();
    this.root.innerHTML = '';

    for (const doc of this.store.list()) {
      const tab = document.createElement('div');
      tab.className =
        'tab' + (doc.id === this.store.activeId ? ' active' : '') + (doc.dirty ? ' dirty' : '');
      tab.dataset.id = doc.id;
      // Disk-state indicator (faithful to NotepadNext tab disk icon): blue = in
      // sync with disk, red = unsaved edits, red+ring = changed externally.
      const disk = document.createElement('span');
      disk.className = 'tab-disk';
      if (doc.externallyChanged) {
        disk.classList.add('tab-disk--changed');
        disk.title = 'Changed on disk — right-click the tab → Reload';
      } else if (doc.dirty) {
        disk.classList.add('tab-disk--dirty');
        disk.title = 'Unsaved changes';
      } else {
        disk.classList.add('tab-disk--synced');
        disk.title = doc.handle ? 'Saved (in sync with disk)' : 'New file';
      }
      tab.appendChild(disk);
      tab.appendChild(document.createTextNode(doc.name));
      tab.addEventListener('click', () => this.onActivate(doc.id));

      tab.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Activate the tab before showing the context menu
        this.onActivate(doc.id);
        const cb = this.contextCallbacks;
        showContextMenu(
          [
            {
              label: 'Close',
              enabled: true,
              action: () => this.onClose(doc.id),
            },
            {
              label: 'Close All Except Active',
              enabled: cb !== undefined,
              action: cb ? () => cb.onCloseAllExceptActive() : undefined,
            },
            {
              label: 'Close All to Left',
              enabled: cb !== undefined,
              action: cb ? () => cb.onCloseAllToLeft() : undefined,
            },
            {
              label: 'Close All to Right',
              enabled: cb !== undefined,
              action: cb ? () => cb.onCloseAllToRight() : undefined,
            },
            { label: '', type: 'separator', enabled: false },
            {
              label: 'Save',
              enabled: cb !== undefined,
              action: cb ? () => cb.onSave(doc.id) : undefined,
            },
            {
              label: 'Save As',
              enabled: cb !== undefined,
              action: cb ? () => cb.onSaveAs(doc.id) : undefined,
            },
            {
              label: 'Rename',
              enabled: false,
            },
            { label: '', type: 'separator', enabled: false },
            {
              label: 'Reload',
              enabled: cb !== undefined,
              action: cb ? () => cb.onReload() : undefined,
            },
            { label: '', type: 'separator', enabled: false },
            {
              label: 'Copy Full Path',
              // Browsers deliberately hide absolute paths from File System Access
              // handles (security), so only the file name is available — copy that.
              enabled: true,
              title: 'Browsers expose only the file name, not the absolute path',
              action: () => void navigator.clipboard.writeText(doc.name),
            },
            {
              label: 'Copy File Name',
              enabled: true,
              action: () => void navigator.clipboard.writeText(doc.name),
            },
            {
              label: 'Copy File Directory',
              // No directory info is available: File System Access handles do not
              // expose a path. Kept disabled with an explanatory tooltip.
              enabled: false,
              title: 'Not available — browsers do not expose file system paths',
            },
          ],
          e.clientX,
          e.clientY,
        );
      });

      const close = document.createElement('button');
      close.className = 'tab-close';
      close.textContent = '×';
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onClose(doc.id);
      });
      tab.appendChild(close);
      this.root.appendChild(tab);
    }

    // New-tab button
    const add = document.createElement('button');
    add.id = 'tab-new';
    add.textContent = '+';
    add.addEventListener('click', () => this.onNew());
    this.root.appendChild(add);

    // Overflow chevron button (hidden by default; shown in updateOverflow)
    const chevron = document.createElement('button');
    chevron.id = 'tab-overflow';
    chevron.className = 'tab-overflow-btn';
    chevron.textContent = '»';
    chevron.setAttribute('aria-haspopup', 'menu');
    chevron.setAttribute('aria-label', 'Show hidden tabs');
    chevron.setAttribute('aria-expanded', 'false');
    chevron.style.display = 'none';
    chevron.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.dropdown) {
        this.closeDropdown();
      } else {
        this.openDropdown(chevron);
      }
    });
    this.root.appendChild(chevron);
    this.overflowBtn = chevron;

    // Ensure active tab is visible after render
    this.scrollActiveIntoView();

    // Detect overflow synchronously after layout
    this.updateOverflow();
  }

  /**
   * Recompute which tabs overflow the tab strip and show/hide the `>>` button.
   * Must be called after layout (offsets are available synchronously once appended).
   */
  updateOverflow(): void {
    if (!this.overflowBtn) return;

    const allTabs = Array.from(this.root.querySelectorAll<HTMLElement>('.tab'));
    if (allTabs.length === 0) {
      this.overflowBtn.style.display = 'none';
      return;
    }

    // Available width = strip width minus the new-tab button and overflow button.
    const addBtn = this.root.querySelector<HTMLElement>('#tab-new');
    const addWidth = addBtn ? addBtn.offsetWidth : 0;
    // Use the overflow button's own width for reservation, or a default of 28px
    // (it will be hidden initially so offsetWidth may be 0).
    const chevronWidth = 28;
    const availableWidth = this.root.clientWidth - addWidth - chevronWidth;

    const overflowedIds = new Set<string>();
    for (const tab of allTabs) {
      const rightEdge = tab.offsetLeft + tab.offsetWidth;
      if (rightEdge > availableWidth) {
        const id = tab.dataset.id;
        if (id) overflowedIds.add(id);
      }
    }

    if (overflowedIds.size > 0) {
      this.overflowBtn.style.display = '';
      this.overflowBtn.dataset.overflowIds = JSON.stringify([...overflowedIds]);
    } else {
      this.overflowBtn.style.display = 'none';
      this.overflowBtn.dataset.overflowIds = '';
      this.closeDropdown();
    }
  }

  private openDropdown(anchor: HTMLElement): void {
    this.closeDropdown();

    const overflowIds: string[] = JSON.parse(anchor.dataset.overflowIds || '[]');
    if (overflowIds.length === 0) return;

    const menu = document.createElement('ul');
    menu.className = 'tab-overflow-menu';
    menu.setAttribute('role', 'menu');

    const docs = this.store.list();
    for (const id of overflowIds) {
      const doc = docs.find((d) => d.id === id);
      if (!doc) continue;
      const li = document.createElement('li');
      li.className = 'tab-overflow-item' + (doc.id === this.store.activeId ? ' active' : '');
      li.setAttribute('role', 'menuitem');
      li.setAttribute('tabindex', '0');
      li.textContent = (doc.dirty ? '● ' : '') + doc.name;
      li.addEventListener('click', () => {
        this.closeDropdown();
        this.onActivate(doc.id);
        // After activation the store will re-render; ensure active tab visible
        requestAnimationFrame(() => this.scrollActiveIntoView());
      });
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          li.click();
        }
      });
      menu.appendChild(li);
    }

    // Position below the chevron button
    const rect = anchor.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.right = `${document.documentElement.clientWidth - rect.right}px`;
    menu.style.top = `${rect.bottom}px`;

    document.body.appendChild(menu);
    this.dropdown = menu;
    anchor.setAttribute('aria-expanded', 'true');

    // Focus first item for keyboard navigation
    const first = menu.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
  }

  private closeDropdown(): void {
    if (this.dropdown) {
      this.dropdown.remove();
      this.dropdown = null;
    }
    if (this.overflowBtn) {
      this.overflowBtn.setAttribute('aria-expanded', 'false');
    }
  }

  private scrollActiveIntoView(): void {
    const activeTab = this.root.querySelector<HTMLElement>('.tab.active');
    if (activeTab) {
      activeTab.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
  }

  /** Clean up global listeners (call when the TabBar is torn down). */
  dispose(): void {
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('click', this._onDocClick);
    document.removeEventListener('keydown', this._onDocKeydown);
    this.closeDropdown();
  }
}

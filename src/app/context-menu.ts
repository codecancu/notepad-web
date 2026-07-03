// SPDX-License-Identifier: GPL-3.0-or-later

export interface ContextMenuItem {
  label: string;
  action?: () => void;
  enabled: boolean;
  type?: 'separator';
  /** Optional tooltip (hover title) — e.g. to explain why an item is disabled. */
  title?: string;
}

/**
 * Show a floating context menu at (x, y), clamped to the viewport.
 * Returns a close() function that removes the menu.
 */
export function showContextMenu(items: ContextMenuItem[], x: number, y: number): () => void {
  const menu = document.createElement('ul');
  menu.className = 'context-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('tabindex', '-1');

  for (const it of items) {
    if (it.type === 'separator') {
      const sep = document.createElement('li');
      sep.className = 'context-menu-sep';
      sep.setAttribute('role', 'separator');
      menu.appendChild(sep);
      continue;
    }

    const li = document.createElement('li');
    li.className = 'context-menu-item' + (it.enabled ? '' : ' disabled');
    li.setAttribute('role', 'menuitem');
    li.textContent = it.label;
    if (it.title) li.title = it.title;

    if (it.enabled) {
      li.setAttribute('tabindex', '0');
      li.addEventListener('click', () => {
        close();
        it.action?.();
      });
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          li.click();
        }
      });
    } else {
      li.setAttribute('aria-disabled', 'true');
    }

    menu.appendChild(li);
  }

  // Initial position (will be clamped after appending so we know actual size)
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  document.body.appendChild(menu);

  // Clamp to viewport
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const rect = menu.getBoundingClientRect();
  if (rect.right > vw) {
    menu.style.left = `${Math.max(0, vw - rect.width)}px`;
  }
  if (rect.bottom > vh) {
    menu.style.top = `${Math.max(0, vh - rect.height)}px`;
  }

  const close = (): void => {
    if (menu.parentNode) {
      menu.parentNode.removeChild(menu);
    }
    document.removeEventListener('mousedown', onDocMousedown, true);
    document.removeEventListener('keydown', onDocKeydown, true);
  };

  const onDocMousedown = (e: MouseEvent): void => {
    if (!menu.contains(e.target as Node)) {
      close();
    }
  };

  const onDocKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };

  document.addEventListener('mousedown', onDocMousedown, true);
  document.addEventListener('keydown', onDocKeydown, true);

  // Focus the menu so keyboard events reach it
  menu.focus();

  return close;
}

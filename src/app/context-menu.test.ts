// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { showContextMenu } from './context-menu';

beforeEach(() => {
  // Reset body before each test
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('showContextMenu', () => {
  it('returns a menu element with role="menu"', () => {
    showContextMenu([{ label: 'Item A', enabled: true, action: vi.fn() }], 50, 50);
    const menu = document.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(menu?.tagName.toLowerCase()).toBe('ul');
  });

  it('disabled items do not fire callbacks when clicked', () => {
    const action = vi.fn();
    showContextMenu([{ label: 'Disabled Item', enabled: false, action }], 50, 50);
    const item = document.querySelector('.context-menu-item.disabled') as HTMLElement;
    expect(item).not.toBeNull();
    item.click();
    expect(action).not.toHaveBeenCalled();
  });

  it('clicking an enabled item fires the callback and removes the menu', () => {
    const action = vi.fn();
    showContextMenu([{ label: 'Enabled Item', enabled: true, action }], 50, 50);
    const item = document.querySelector('.context-menu-item:not(.disabled)') as HTMLElement;
    expect(item).not.toBeNull();
    item.click();
    expect(action).toHaveBeenCalledOnce();
    // Menu should be removed from DOM after click
    expect(document.querySelector('.context-menu')).toBeNull();
  });

  it('Escape key closes the menu', () => {
    showContextMenu([{ label: 'Item B', enabled: true, action: vi.fn() }], 50, 50);
    expect(document.querySelector('.context-menu')).not.toBeNull();

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    document.dispatchEvent(event);

    expect(document.querySelector('.context-menu')).toBeNull();
  });

  it('clicking outside closes the menu', () => {
    showContextMenu([{ label: 'Item C', enabled: true, action: vi.fn() }], 50, 50);
    expect(document.querySelector('.context-menu')).not.toBeNull();

    // Create an outside element and simulate mousedown on it
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    const event = new MouseEvent('mousedown', { bubbles: true });
    outside.dispatchEvent(event);

    expect(document.querySelector('.context-menu')).toBeNull();
  });

  it('renders separators with role="separator"', () => {
    showContextMenu(
      [
        { label: 'Item 1', enabled: true, action: vi.fn() },
        { label: '', type: 'separator', enabled: false },
        { label: 'Item 2', enabled: true, action: vi.fn() },
      ],
      50,
      50,
    );
    const separators = document.querySelectorAll('[role="separator"]');
    expect(separators).toHaveLength(1);
  });

  it('disabled items have aria-disabled="true"', () => {
    showContextMenu([{ label: 'No-op', enabled: false }], 50, 50);
    const item = document.querySelector('.context-menu-item.disabled');
    expect(item?.getAttribute('aria-disabled')).toBe('true');
  });

  it('close() function returned by showContextMenu removes the menu', () => {
    const close = showContextMenu([{ label: 'Item D', enabled: true, action: vi.fn() }], 50, 50);
    expect(document.querySelector('.context-menu')).not.toBeNull();
    close();
    expect(document.querySelector('.context-menu')).toBeNull();
  });
});

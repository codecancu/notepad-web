// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TabBar } from './tabbar';
import { DocumentStore } from '../services/document-store';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStore(): DocumentStore {
  return new DocumentStore();
}

function makeTabBar(
  store: DocumentStore,
  onActivate = vi.fn(),
  onClose = vi.fn(),
  onNew = vi.fn(),
): { bar: TabBar; root: HTMLDivElement } {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const bar = new TabBar(root, store, onActivate, onClose, onNew);
  return { bar, root };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TabBar — basic rendering', () => {
  let store: DocumentStore;
  let root: HTMLDivElement;
  let bar: TabBar;

  beforeEach(() => {
    store = makeStore();
    ({ bar, root } = makeTabBar(store));
  });

  afterEach(() => {
    bar.dispose();
    root.remove();
  });

  it('renders a tab for each document', () => {
    store.create({ name: 'a.txt' });
    store.create({ name: 'b.txt' });
    bar.render();
    expect(root.querySelectorAll('.tab')).toHaveLength(2);
  });

  it('marks the active tab', () => {
    store.create({ name: 'a.txt' });
    const b = store.create({ name: 'b.txt' });
    store.setActive(b.id);
    bar.render();
    const active = root.querySelector('.tab.active');
    expect(active?.textContent).toContain('b.txt');
  });

  it('shows dirty marker on dirty tab', () => {
    const doc = store.create({ name: 'dirty.txt' });
    store.update(doc.id, { dirty: true });
    bar.render();
    const tab = root.querySelector('.tab');
    expect(tab?.textContent).toContain('●');
  });

  it('calls onActivate when a tab is clicked', () => {
    const onActivate = vi.fn();
    bar.dispose();
    root.remove();
    const root2 = document.createElement('div');
    document.body.appendChild(root2);
    const bar2 = new TabBar(root2, store, onActivate, vi.fn(), vi.fn());
    const doc = store.create({ name: 'x.txt' });
    bar2.render();
    const tab = root2.querySelector<HTMLElement>('.tab')!;
    tab.click();
    expect(onActivate).toHaveBeenCalledWith(doc.id);
    bar2.dispose();
    root2.remove();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    bar.dispose();
    root.remove();
    const root2 = document.createElement('div');
    document.body.appendChild(root2);
    const bar2 = new TabBar(root2, store, vi.fn(), onClose, vi.fn());
    const doc = store.create({ name: 'y.txt' });
    bar2.render();
    const closeBtn = root2.querySelector<HTMLElement>('.tab-close')!;
    closeBtn.click();
    expect(onClose).toHaveBeenCalledWith(doc.id);
    bar2.dispose();
    root2.remove();
  });

  it('calls onNew when the new-tab button is clicked', () => {
    const onNew = vi.fn();
    bar.dispose();
    root.remove();
    const root2 = document.createElement('div');
    document.body.appendChild(root2);
    const bar2 = new TabBar(root2, store, vi.fn(), vi.fn(), onNew);
    store.create({ name: 'z.txt' });
    bar2.render();
    root2.querySelector<HTMLElement>('#tab-new')!.click();
    expect(onNew).toHaveBeenCalled();
    bar2.dispose();
    root2.remove();
  });
});

describe('TabBar — overflow button', () => {
  let store: DocumentStore;
  let root: HTMLDivElement;
  let bar: TabBar;

  beforeEach(() => {
    store = makeStore();
    ({ bar, root } = makeTabBar(store));
  });

  afterEach(() => {
    bar.dispose();
    root.remove();
  });

  it('overflow button is present in the DOM after render', () => {
    store.create({ name: 'a.txt' });
    bar.render();
    expect(root.querySelector('#tab-overflow')).not.toBeNull();
  });

  it('overflow button has correct aria attributes', () => {
    store.create({ name: 'a.txt' });
    bar.render();
    const btn = root.querySelector<HTMLButtonElement>('#tab-overflow')!;
    expect(btn.getAttribute('aria-haspopup')).toBe('menu');
    expect(btn.getAttribute('aria-label')).toBe('Show hidden tabs');
  });
});

describe('TabBar — overflow dropdown (unit)', () => {
  let store: DocumentStore;
  let root: HTMLDivElement;
  let bar: TabBar;

  beforeEach(() => {
    store = makeStore();
    ({ bar, root } = makeTabBar(store));
  });

  afterEach(() => {
    bar.dispose();
    root.remove();
    // Clean up any leftover dropdown appended to body
    document.querySelectorAll('.tab-overflow-menu').forEach((el) => el.remove());
  });

  it('opens dropdown when overflow button is clicked with overflowed ids set', () => {
    const doc1 = store.create({ name: 'a.txt' });
    const doc2 = store.create({ name: 'b.txt' });
    bar.render();

    // Manually simulate overflow by setting dataset.overflowIds and showing btn
    const btn = root.querySelector<HTMLButtonElement>('#tab-overflow')!;
    btn.dataset.overflowIds = JSON.stringify([doc1.id, doc2.id]);
    btn.style.display = '';

    btn.click();

    const menu = document.querySelector('.tab-overflow-menu');
    expect(menu).not.toBeNull();
    const items = Array.from(menu!.querySelectorAll('[role="menuitem"]'));
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain('a.txt');
    expect(items[1]?.textContent).toContain('b.txt');
  });

  it('shows dirty marker in dropdown for dirty tabs', () => {
    const doc1 = store.create({ name: 'dirty.txt' });
    store.update(doc1.id, { dirty: true });
    bar.render();

    const btn = root.querySelector<HTMLButtonElement>('#tab-overflow')!;
    btn.dataset.overflowIds = JSON.stringify([doc1.id]);
    btn.style.display = '';

    btn.click();

    const item = document.querySelector('[role="menuitem"]');
    expect(item?.textContent).toContain('●');
  });

  it('calls onActivate when a dropdown item is clicked', () => {
    const onActivate = vi.fn();
    bar.dispose();
    root.remove();
    const root2 = document.createElement('div');
    document.body.appendChild(root2);
    const bar2 = new TabBar(root2, store, onActivate, vi.fn(), vi.fn());

    const doc = store.create({ name: 'overflow.txt' });
    bar2.render();

    const btn = root2.querySelector<HTMLButtonElement>('#tab-overflow')!;
    btn.dataset.overflowIds = JSON.stringify([doc.id]);
    btn.style.display = '';
    btn.click();

    const item = document.querySelector<HTMLElement>('[role="menuitem"]')!;
    item.click();

    expect(onActivate).toHaveBeenCalledWith(doc.id);

    bar2.dispose();
    root2.remove();
    document.querySelectorAll('.tab-overflow-menu').forEach((el) => el.remove());
  });

  it('closes dropdown when Escape is pressed', () => {
    const doc = store.create({ name: 'a.txt' });
    bar.render();

    const btn = root.querySelector<HTMLButtonElement>('#tab-overflow')!;
    btn.dataset.overflowIds = JSON.stringify([doc.id]);
    btn.style.display = '';
    btn.click();

    expect(document.querySelector('.tab-overflow-menu')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.tab-overflow-menu')).toBeNull();
  });

  it('marks active tab in dropdown', () => {
    const doc1 = store.create({ name: 'a.txt' });
    const doc2 = store.create({ name: 'b.txt' });
    store.setActive(doc2.id);
    bar.render();

    const btn = root.querySelector<HTMLButtonElement>('#tab-overflow')!;
    btn.dataset.overflowIds = JSON.stringify([doc1.id, doc2.id]);
    btn.style.display = '';
    btn.click();

    const items = document.querySelectorAll('[role="menuitem"]');
    // doc2 is active, so its item should have class 'active'
    const activeItems = Array.from(items).filter((el) => el.classList.contains('active'));
    expect(activeItems).toHaveLength(1);
    expect(activeItems[0]?.textContent).toContain('b.txt');
  });

  it('dropdown aria-expanded toggles correctly', () => {
    const doc = store.create({ name: 'a.txt' });
    bar.render();

    const btn = root.querySelector<HTMLButtonElement>('#tab-overflow')!;
    btn.dataset.overflowIds = JSON.stringify([doc.id]);
    btn.style.display = '';

    expect(btn.getAttribute('aria-expanded')).toBe('false');
    btn.click();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    btn.click(); // toggle close
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });
});

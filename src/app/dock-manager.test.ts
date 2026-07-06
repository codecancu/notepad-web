// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for DockManager.
 *
 * dockview-core is mocked at the module level (vi.mock is hoisted by vitest,
 * so the factory must not reference variables declared in the test file body).
 * We keep a registry of created mock components inside the factory closure.
 */

// ── dockview-core mock ────────────────────────────────────────────────────────
// The factory is hoisted by vitest — all definitions must be self-contained.

vi.mock('dockview-core', () => {
  class MockDockviewComponent {
    _panels: Map<string, { id: string; component: string; title: string }> = new Map();
    _layoutChangeListeners: Array<() => void> = [];
    _removePanelListeners: Array<(panel: { id: string }) => void> = [];
    _activeGroupListeners: Array<(group: unknown) => void> = [];

    constructor() {
      /* no-op — container / opts ignored in tests */
    }

    addPanel(opts: { id: string; component: string; title: string }): void {
      this._panels.set(opts.id, opts);
    }

    // Stable group object per panel id so identity comparisons (=== activeGroup)
    // behave like the real dockview.
    _groups: Map<string, unknown> = new Map();

    getGroupPanel(id: string) {
      if (!this._panels.has(id)) return undefined;
      const panels = this._panels;
      if (!this._groups.has(id)) {
        this._groups.set(id, {
          element: document.createElement('div'),
          locked: false,
          setActive() {
            /* no-op in tests */
          },
        });
      }
      return {
        id,
        api: {
          close() {
            panels.delete(id);
          },
        },
        group: this._groups.get(id),
      };
    }

    get panels() {
      return Array.from(this._panels.values()).map((p) => ({
        id: p.id,
        component: p.component,
      }));
    }

    toJSON() {
      return { panels: Array.from(this._panels.values()) };
    }

    fromJSON(): void {
      /* restore: no-op in tests */
    }

    onDidLayoutChange(fn: () => void) {
      this._layoutChangeListeners.push(fn);
      return {
        dispose() {
          /* no-op */
        },
      };
    }

    onDidRemovePanel(fn: (panel: { id: string }) => void) {
      this._removePanelListeners.push(fn);
      return {
        dispose() {
          /* no-op */
        },
      };
    }

    onDidActiveGroupChange(fn: (group: unknown) => void) {
      this._activeGroupListeners.push(fn);
      return {
        dispose() {
          /* no-op */
        },
      };
    }

    /** Test helper: simulate dockview removing a panel natively. */
    simulateNativeRemove(id: string): void {
      this._panels.delete(id);
      for (const fn of this._removePanelListeners) {
        fn({ id });
      }
    }

    /** Test helper: simulate the focused group changing. */
    simulateActiveGroupChange(group: unknown): void {
      for (const fn of this._activeGroupListeners) {
        fn(group);
      }
    }

    layout(): void {
      /* no-op */
    }
  }

  return {
    DockviewComponent: MockDockviewComponent,
    themeLight: { name: 'light', className: 'dv-light' },
  };
});

// Suppress CSS import side-effect.
vi.mock('dockview-core/dist/styles/dockview.css', () => ({}));

// ── Import after mocks are in place ──────────────────────────────────────────
import { DockManager } from './dock-manager';
import type { DockStorage, PanelDef } from './dock-manager';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStorage(initial: Record<string, string> = {}): DockStorage {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get: async (key) => store.get(key) ?? null,
    set: async (key, val) => {
      store.set(key, val);
    },
  };
}

function makeEl(id?: string): HTMLElement {
  const el = document.createElement('div');
  if (id) el.id = id;
  return el;
}

// Retrieve the internal mock instance cast to its raw type.
type MockComp = {
  _panels: Map<string, { id: string; component: string; title: string }>;
  _layoutChangeListeners: Array<() => void>;
  _removePanelListeners: Array<(panel: { id: string }) => void>;
  panels: Array<{ id: string; component: string }>;
  simulateNativeRemove(id: string): void;
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DockManager', () => {
  let manager: DockManager;

  beforeEach(() => {
    manager = new DockManager();
  });

  it('initializes and places the editor panel by default', async () => {
    await manager.init(makeEl(), makeEl('editor'), makeEl('tabbar'));
    const comp = manager.component as unknown as MockComp;
    expect(comp.panels.some((p) => p.id === 'editor')).toBe(true);
  });

  it('registerPanel stores the definition without showing it', async () => {
    await manager.init(makeEl(), makeEl('editor'), makeEl('tabbar'));
    const def: PanelDef = {
      id: 'test-panel',
      title: 'Test',
      position: 'bottom',
      render: vi.fn(),
    };
    manager.registerPanel(def);
    expect(manager.isPanelVisible('test-panel')).toBe(false);
  });

  it('togglePanel makes a hidden panel visible', async () => {
    await manager.init(makeEl(), makeEl('editor'), makeEl('tabbar'));
    manager.registerPanel({ id: 'p1', title: 'P1', position: 'bottom', render: vi.fn() });

    expect(manager.isPanelVisible('p1')).toBe(false);
    manager.togglePanel('p1');
    expect(manager.isPanelVisible('p1')).toBe(true);
  });

  it('togglePanel hides a visible panel on second call', async () => {
    await manager.init(makeEl(), makeEl('editor'), makeEl('tabbar'));
    manager.registerPanel({ id: 'p1', title: 'P1', position: 'bottom', render: vi.fn() });

    manager.togglePanel('p1'); // show
    expect(manager.isPanelVisible('p1')).toBe(true);

    manager.togglePanel('p1'); // hide
    expect(manager.isPanelVisible('p1')).toBe(false);
  });

  it('togglePanel is idempotent across multiple show/hide cycles', async () => {
    await manager.init(makeEl(), makeEl('editor'), makeEl('tabbar'));
    manager.registerPanel({ id: 'p1', title: 'P1', position: 'right', render: vi.fn() });

    manager.togglePanel('p1'); // show
    manager.togglePanel('p1'); // hide
    manager.togglePanel('p1'); // show again
    expect(manager.isPanelVisible('p1')).toBe(true);
  });

  it('togglePanel emits a console.warn for unknown panel id', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* no-op */
    });
    await manager.init(makeEl(), makeEl('editor'), makeEl('tabbar'));
    manager.togglePanel('nonexistent');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('nonexistent'));
    warnSpy.mockRestore();
  });

  it('persists layout to storage when onDidLayoutChange fires', async () => {
    const storage = makeStorage();
    await manager.init(makeEl(), makeEl('editor'), makeEl('tabbar'), storage);

    // Trigger all registered layout-change listeners (simulate a structural change).
    const comp = manager.component as unknown as MockComp;
    comp._layoutChangeListeners.forEach((fn) => fn());

    // Allow async persist to complete.
    await new Promise((r) => setTimeout(r, 20));

    const saved = await storage.get('dock-layout-v1');
    expect(saved).toBeTruthy();
  });

  it('restores layout from storage on init', async () => {
    const storedLayout = JSON.stringify({
      panels: [{ id: 'editor', component: 'editor', title: 'Editor' }],
    });
    const storage = makeStorage({ 'dock-layout-v1': storedLayout });
    // Should not throw even though fromJSON is a no-op in the mock.
    await expect(
      manager.init(makeEl(), makeEl('editor'), makeEl('tabbar'), storage),
    ).resolves.toBeUndefined();
  });

  it('falls back to default layout when stored JSON is invalid', async () => {
    const storage = makeStorage({ 'dock-layout-v1': 'INVALID_JSON{{' });
    await manager.init(makeEl(), makeEl('editor'), makeEl('tabbar'), storage);
    const comp = manager.component as unknown as MockComp;
    // Default layout should have placed the editor panel.
    expect(comp.panels.some((p) => p.id === 'editor')).toBe(true);
  });

  it('_visiblePanels stays in sync when dockview natively removes a panel', async () => {
    await manager.init(makeEl(), makeEl('editor'), makeEl('tabbar'));
    manager.registerPanel({ id: 'p-native', title: 'P', position: 'bottom', render: vi.fn() });

    // Show the panel via togglePanel so _visiblePanels tracks it.
    manager.togglePanel('p-native');
    expect(manager.isPanelVisible('p-native')).toBe(true);

    // Simulate the user closing it via dockview's own close button (bypasses togglePanel).
    const comp = manager.component as unknown as MockComp;
    comp.simulateNativeRemove('p-native');

    // _visiblePanels must now reflect the removal.
    expect(manager.isPanelVisible('p-native')).toBe(false);
  });

  it('togglePanel correctly shows a panel after it was natively closed', async () => {
    await manager.init(makeEl(), makeEl('editor'), makeEl('tabbar'));
    manager.registerPanel({ id: 'p-reopen', title: 'P', position: 'right', render: vi.fn() });

    // Show then natively remove.
    manager.togglePanel('p-reopen');
    const comp = manager.component as unknown as MockComp;
    comp.simulateNativeRemove('p-reopen');
    expect(manager.isPanelVisible('p-reopen')).toBe(false);

    // A subsequent togglePanel should SHOW it (not attempt to close a ghost entry).
    manager.togglePanel('p-reopen');
    expect(manager.isPanelVisible('p-reopen')).toBe(true);
  });
});

describe('DockManager — split view', () => {
  let manager: DockManager;

  beforeEach(() => {
    manager = new DockManager();
  });

  it('is not split by default', async () => {
    await manager.init(makeEl(), makeEl('editor'), makeEl('tabbar'));
    expect(manager.isSplit()).toBe(false);
  });

  it('addSecondaryEditorGroup adds the editor2 group once a host is set', async () => {
    await manager.init(makeEl(), makeEl('editor'), makeEl('tabbar'));
    manager.setSecondaryEditorHost(makeEl('dock-editor-host-2'));
    manager.addSecondaryEditorGroup('right');
    expect(manager.isSplit()).toBe(true);
  });

  it('addSecondaryEditorGroup is a no-op without a host', async () => {
    await manager.init(makeEl(), makeEl('editor'), makeEl('tabbar'));
    manager.addSecondaryEditorGroup('right');
    expect(manager.isSplit()).toBe(false);
  });

  it('removeSecondaryEditorGroup collapses the split', async () => {
    await manager.init(makeEl(), makeEl('editor'), makeEl('tabbar'));
    manager.setSecondaryEditorHost(makeEl('dock-editor-host-2'));
    manager.addSecondaryEditorGroup('below');
    expect(manager.isSplit()).toBe(true);

    manager.removeSecondaryEditorGroup();
    expect(manager.isSplit()).toBe(false);
  });

  it('onEditorFocusChange fires 1 for the secondary group and 0 otherwise', async () => {
    await manager.init(makeEl(), makeEl('editor'), makeEl('tabbar'));
    manager.setSecondaryEditorHost(makeEl('dock-editor-host-2'));
    manager.addSecondaryEditorGroup('right');

    const seen: Array<0 | 1> = [];
    manager.onEditorFocusChange((v) => seen.push(v));

    const comp = manager.component as unknown as {
      getGroupPanel(id: string): { group: unknown } | undefined;
      simulateActiveGroupChange(group: unknown): void;
    };
    const secondaryGroup = comp.getGroupPanel('editor2')!.group;
    const primaryGroup = comp.getGroupPanel('editor')!.group;
    comp.simulateActiveGroupChange(secondaryGroup);
    comp.simulateActiveGroupChange(primaryGroup);
    expect(seen).toEqual([1, 0]);
  });
});

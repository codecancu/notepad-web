// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * DockManager — thin wrapper around dockview-core.
 *
 * Responsibilities:
 *  - Create and hold the DockviewComponent in the #dock container.
 *  - Register named panel definitions via registerPanel().
 *  - Expose togglePanel(id) to show/hide side/bottom panels.
 *  - Persist the dock layout via a provided storage adapter.
 *  - Mount the CM6 editor (+ TabBar) into the fixed CENTER panel.
 *
 * Design notes:
 *  - The CENTER panel ("editor") is always present and cannot be closed by the user.
 *  - Side panels (left/right/bottom) can be toggled by id.
 *  - dockview-core themeLight is used for a clean light chrome.
 *  - The editor group's native dockview tab strip is hidden via the
 *    `dock-editor-group` marker class (CSS: .dock-editor-group .dv-tabs-and-actions-container).
 *    Our custom #tabbar (with dirty markers + new-tab button) is the sole visible strip.
 */

import {
  DockviewComponent,
  type IDockviewPanel,
  type IContentRenderer,
  type DockviewComponentOptions,
  type CreateComponentOptions,
  themeLight,
} from 'dockview-core';
import 'dockview-core/dist/styles/dockview.css';

/** Storage adapter: persist/restore a JSON string keyed by name. */
export interface DockStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

/** Registration for a non-editor panel. */
export interface PanelDef {
  /** Unique panel id (matches the id used in togglePanel). */
  id: string;
  /** Human-readable title shown in the dockview tab. */
  title: string;
  /** Where to dock this panel when first shown. */
  position: 'left' | 'right' | 'bottom';
  /**
   * Called once to populate the panel's HTMLElement.
   * May return an optional cleanup function; if returned, it is called by
   * PanelRenderer.dispose() when dockview removes the panel.
   */
  render(el: HTMLElement): (() => void) | void;
}

const LAYOUT_STORAGE_KEY = 'dock-layout-v1';

// ── Renderer classes ──────────────────────────────────────────────────────────

/** Renderer for the fixed CENTER editor panel. */
class EditorRenderer implements IContentRenderer {
  readonly element: HTMLElement;

  constructor(editorHost: HTMLElement) {
    this.element = editorHost;
  }

  init(): void {
    /* element is already populated by caller */
  }

  dispose(): void {
    /* no-op — we never destroy the editor */
  }
}

/** Renderer for a registered side/bottom panel. */
class PanelRenderer implements IContentRenderer {
  readonly element: HTMLElement;
  private _initialized = false;
  /** Cleanup function returned by PanelDef.render(), if any. */
  private _disposer: (() => void) | null = null;

  constructor(private readonly _def: PanelDef) {
    this.element = document.createElement('div');
    this.element.style.cssText =
      'width:100%;height:100%;overflow:auto;padding:4px;box-sizing:border-box;';
  }

  init(): void {
    if (!this._initialized) {
      const cleanup = this._def.render(this.element);
      if (typeof cleanup === 'function') {
        this._disposer = cleanup;
      }
      this._initialized = true;
    }
  }

  dispose(): void {
    if (this._disposer) {
      this._disposer();
      this._disposer = null;
    }
  }
}

// ── DockManager ───────────────────────────────────────────────────────────────

export class DockManager {
  private _component: DockviewComponent | null = null;
  private _panelDefs = new Map<string, PanelDef>();
  private _panelRenderers = new Map<string, PanelRenderer>();
  private _storage: DockStorage | null = null;
  /** Which side panels are currently visible. */
  private _visiblePanels = new Set<string>();
  /** Stored resize handler so it can be removed on re-init. */
  private _resizeHandler: (() => void) | null = null;

  /**
   * Initialise the dock layout inside `container`.
   *
   * @param container  The #dock HTMLElement (must have a real CSS height).
   * @param editorEl   The existing #editor element to mount in the CENTER panel.
   * @param tabbarEl   The existing #tabbar element to mount above the editor.
   * @param storage    Optional persistence adapter for layout save/restore.
   */
  async init(
    container: HTMLElement,
    editorEl: HTMLElement,
    tabbarEl: HTMLElement,
    storage?: DockStorage,
  ): Promise<void> {
    this._storage = storage ?? null;

    // Guard against double-init: remove previous resize listener if present.
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }

    // Build a combined editor+tabbar wrapper.
    const editorHost = document.createElement('div');
    editorHost.id = 'dock-editor-host';
    editorHost.style.cssText =
      'display:flex;flex-direction:column;height:100%;width:100%;overflow:hidden;';

    const tabbarWrapper = document.createElement('div');
    tabbarWrapper.style.cssText = 'flex:0 0 auto;';
    tabbarWrapper.appendChild(tabbarEl);

    const editorWrapper = document.createElement('div');
    editorWrapper.style.cssText = 'flex:1 1 auto;overflow:hidden;position:relative;min-height:0;';
    editorWrapper.appendChild(editorEl);

    editorHost.appendChild(tabbarWrapper);
    editorHost.appendChild(editorWrapper);

    // Build a stable EditorRenderer instance to reuse across from/toJSON cycles.
    const editorRenderer = new EditorRenderer(editorHost);

    const opts: DockviewComponentOptions = {
      theme: themeLight,
      createComponent: (options: CreateComponentOptions): IContentRenderer => {
        if (options.name === 'editor') {
          return editorRenderer;
        }
        // Look up the registered panel definition.
        const def = this._panelDefs.get(options.name);
        if (def) {
          // Reuse the renderer if it already exists (for layout restore).
          let renderer = this._panelRenderers.get(options.name);
          if (!renderer) {
            renderer = new PanelRenderer(def);
            this._panelRenderers.set(options.name, renderer);
          }
          return renderer;
        }
        // Fallback: blank div for unknown panel names.
        return {
          element: document.createElement('div'),
          init(): void {
            /* empty */
          },
        };
      },
    };

    this._component = new DockviewComponent(container, opts);

    // Try to restore persisted layout.
    let restored = false;
    if (storage) {
      try {
        const raw = await storage.get(LAYOUT_STORAGE_KEY);
        if (raw) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const layout = JSON.parse(raw) as any;
          this._component.fromJSON(layout);
          // Re-mark visible panels from the restored layout.
          for (const panel of this._component.panels) {
            if (panel.id !== 'editor') {
              this._visiblePanels.add(panel.id);
            }
          }
          restored = true;
        }
      } catch {
        /* fall through to default layout on any parse/restore error */
      }
    }

    if (!restored) {
      this._buildDefaultLayout();
    }

    // Mark the editor group's DOM element so CSS can hide its native tab strip.
    // This suppresses the dockview header for the editor group only, leaving
    // side/bottom panel headers intact.
    this._markEditorGroup();

    // Keep _visiblePanels in sync when the user closes a panel via dockview's
    // own close button (native close bypasses togglePanel).
    this._component.onDidRemovePanel((panel: IDockviewPanel) => {
      this._visiblePanels.delete(panel.id);
    });

    // Persist layout on any structural change.
    this._component.onDidLayoutChange(() => {
      void this._persist();
    });

    // Re-layout on window resize.
    this._resizeHandler = () => {
      if (this._component && container.offsetWidth > 0) {
        this._component.layout(container.offsetWidth, container.offsetHeight);
      }
    };
    window.addEventListener('resize', this._resizeHandler);
  }

  /** Register a panel definition so it can be toggled later. */
  registerPanel(def: PanelDef): void {
    this._panelDefs.set(def.id, def);
  }

  /**
   * Toggle a panel by id.
   * If the panel is visible, it is removed.
   * If it is hidden, it is added at its registered position.
   */
  togglePanel(id: string): void {
    if (!this._component) return;

    if (this._visiblePanels.has(id)) {
      // Hide: find and remove the panel.
      const panel = this._component.getGroupPanel(id);
      if (panel) {
        panel.api.close();
      }
      this._visiblePanels.delete(id);
    } else {
      this._showPanel(id);
      this._visiblePanels.add(id);
    }
  }

  /** Returns true if the panel with the given id is currently visible. */
  isPanelVisible(id: string): boolean {
    return this._visiblePanels.has(id);
  }

  /** Expose the raw dockview component for testing. */
  get component(): DockviewComponent | null {
    return this._component;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private _showPanel(id: string): void {
    if (!this._component) return;
    const def = this._panelDefs.get(id);
    if (!def) {
      console.warn(`[DockManager] Unknown panel id: ${id}`);
      return;
    }

    // Find the editor panel's group to position relative to it.
    const editorPanel: IDockviewPanel | undefined = this._component.getGroupPanel('editor');
    const refGroup = editorPanel?.group;

    if (def.position === 'bottom') {
      this._component.addPanel({
        id,
        component: id,
        title: def.title,
        position: refGroup
          ? { referenceGroup: refGroup, direction: 'below' }
          : { direction: 'below' },
      });
    } else if (def.position === 'left') {
      this._component.addPanel({
        id,
        component: id,
        title: def.title,
        position: refGroup
          ? { referenceGroup: refGroup, direction: 'left' }
          : { direction: 'left' },
      });
    } else {
      this._component.addPanel({
        id,
        component: id,
        title: def.title,
        position: refGroup
          ? { referenceGroup: refGroup, direction: 'right' }
          : { direction: 'right' },
      });
    }
  }

  private _buildDefaultLayout(): void {
    if (!this._component) return;
    this._component.addPanel({
      id: 'editor',
      component: 'editor',
      title: 'Editor',
    });
  }

  /**
   * Add the `dock-editor-group` marker class to the editor group's root element
   * so that CSS can hide the dockview-native tab strip for that group only.
   * Also locks the group so it cannot be dragged or closed by the user.
   */
  private _markEditorGroup(): void {
    if (!this._component) return;
    const editorPanel: IDockviewPanel | undefined = this._component.getGroupPanel('editor');
    if (!editorPanel) return;
    const group = editorPanel.group;
    if (!group) return;
    // Add marker class to the group's root DOM element.
    group.element.classList.add('dock-editor-group');
    // Lock the group: prevents drag-out and close via native controls.
    group.locked = true;
  }

  private async _persist(): Promise<void> {
    if (!this._component || !this._storage) return;
    try {
      const json = this._component.toJSON();
      await this._storage.set(LAYOUT_STORAGE_KEY, JSON.stringify(json));
    } catch {
      /* storage errors are non-fatal */
    }
  }
}

/** Application-level singleton. */
export const dockManager = new DockManager();

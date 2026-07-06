// SPDX-License-Identifier: GPL-3.0-or-later
export type DocId = string;

export interface Doc {
  id: DocId;
  name: string;
  content: string;
  languageId: string;
  dirty: boolean;
  eol: 'lf' | 'crlf' | 'cr';
  bom: boolean;
  handle?: FileSystemFileHandle;
  cursor?: { lineNumber: number; column: number };
  scrollTop?: number;
  /** file.lastModified when we last read/wrote this doc's file — the baseline for external-change detection. */
  diskModified?: number;
  /** true when the on-disk file was modified by another program since we last synced. */
  externallyChanged?: boolean;
  /**
   * Which editor pane this document belongs to for split view.
   * 0 = primary (default), 1 = secondary. Undefined is treated as 0 so old
   * sessions (persisted before split view existed) restore into the primary pane.
   */
  view?: ViewId;
}

/** Editor pane index: 0 = primary, 1 = secondary. */
export type ViewId = 0 | 1;

export class DocumentStore {
  private docs = new Map<DocId, Doc>();
  private order: DocId[] = [];
  /**
   * Active document id PER view. Index 0 = primary pane, 1 = secondary pane.
   * The single-view accessors (activeId / active / setActive) operate on the
   * currently focused view so existing callers keep working unchanged.
   */
  private _activeId: [DocId | null, DocId | null] = [null, null];
  /** Which pane is currently focused (drives activeId / active()). */
  private _focusedView: ViewId = 0;
  /** Split orientation while a secondary pane exists; null when single-view. */
  private _splitOrientation: 'h' | 'v' | null = null;
  private listeners = new Set<() => void>();
  private untitledCounterSeed = 0;

  /** Persisted split orientation ('h' stacked / 'v' side-by-side), or null. */
  get splitOrientation(): 'h' | 'v' | null {
    return this._splitOrientation;
  }
  setSplitOrientation(o: 'h' | 'v' | null): void {
    this._splitOrientation = o;
  }

  /** Focused-view-aware: the active doc id of the currently focused pane. */
  get activeId(): DocId | null {
    return this._activeId[this._focusedView];
  }

  private _viewOf(id: DocId): ViewId {
    return (this.docs.get(id)?.view ?? 0) as ViewId;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  create(partial: Partial<Doc> = {}): Doc {
    const n = ++this.untitledCounterSeed;
    const doc: Doc = {
      id: crypto.randomUUID(),
      name: `untitled-${n}`,
      content: '',
      languageId: 'plaintext',
      dirty: false,
      eol: 'lf',
      bom: false,
      ...partial,
    };
    this.add(doc);
    return doc;
  }

  add(doc: Doc): void {
    // New docs without an explicit pane land in the currently focused view.
    // Session restore passes docs that already carry a `view` tag, so it is
    // preserved; docs from old sessions (no tag) default to the primary pane.
    const view: ViewId = (doc.view ?? this._focusedView) as ViewId;
    const stored: Doc = { ...doc, view };
    this.docs.set(stored.id, stored);
    this.order.push(stored.id);
    this._activeId[view] = stored.id;
    this.emit();
  }

  get(id: DocId): Doc | undefined {
    return this.docs.get(id);
  }

  list(): Doc[] {
    return this.order.map((id) => this.docs.get(id)!).filter(Boolean);
  }

  /** Docs belonging to a given pane, in tab order. */
  listForView(view: ViewId): Doc[] {
    return this.order
      .map((id) => this.docs.get(id)!)
      .filter((d) => d && ((d.view ?? 0) as ViewId) === view);
  }

  /** True if any document currently lives in the given pane. */
  hasView(view: ViewId): boolean {
    return this.order.some((id) => this._viewOf(id) === view);
  }

  update(id: DocId, patch: Partial<Doc>): void {
    const doc = this.docs.get(id);
    if (!doc) return;
    this.docs.set(id, { ...doc, ...patch });
    this.emit();
  }

  /**
   * Focused-view-aware: make `id` active in the pane it belongs to, and focus
   * that pane. Preserves single-view semantics for existing callers.
   */
  setActive(id: DocId): void {
    if (!this.docs.has(id)) return;
    const view = this._viewOf(id);
    this._activeId[view] = id;
    this._focusedView = view;
    this.emit();
  }

  active(): Doc | undefined {
    const id = this._activeId[this._focusedView];
    return id ? this.docs.get(id) : undefined;
  }

  /** The currently focused pane. */
  focusedView(): ViewId {
    return this._focusedView;
  }

  /** Set which pane is focused (drives activeId / active()). */
  setFocusedView(view: ViewId): void {
    this._focusedView = view;
    this.emit();
  }

  /** The active document of a specific pane (independent of focus). */
  activeForView(view: ViewId): Doc | undefined {
    const id = this._activeId[view];
    return id ? this.docs.get(id) : undefined;
  }

  /** Set the active document of a specific pane without changing focus. */
  setActiveForView(view: ViewId, id: DocId): void {
    if (!this.docs.has(id)) return;
    this._activeId[view] = id;
    this.emit();
  }

  /**
   * Move a document to another pane. Re-points the source pane's active tab to
   * a neighbor within that same pane, makes the doc active in (and focuses) the
   * target pane. No-op if the doc is already in `view`.
   */
  moveToView(id: DocId, view: ViewId): void {
    const doc = this.docs.get(id);
    if (!doc) return;
    const from = (doc.view ?? 0) as ViewId;
    if (from === view) return;
    // Re-point the source pane's active tab BEFORE reassigning, using a
    // neighbor within the source pane (next, else previous).
    if (this._activeId[from] === id) {
      const viewOrder = this.order.filter((d) => this._viewOf(d) === from);
      const vi = viewOrder.indexOf(id);
      this._activeId[from] = viewOrder[vi + 1] ?? viewOrder[vi - 1] ?? null;
    }
    this.docs.set(id, { ...doc, view });
    this._activeId[view] = id;
    this._focusedView = view;
    this.emit();
  }

  remove(id: DocId): void {
    const idx = this.order.indexOf(id);
    if (idx === -1) return;
    const view = this._viewOf(id);
    // Compute the same-pane neighbor before splicing.
    const viewOrder = this.order.filter((d) => this._viewOf(d) === view);
    const vi = viewOrder.indexOf(id);
    this.docs.delete(id);
    this.order.splice(idx, 1);
    if (this._activeId[view] === id) {
      this._activeId[view] = viewOrder[vi + 1] ?? viewOrder[vi - 1] ?? null;
    }
    this.emit();
  }
}

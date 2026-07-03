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
}

export class DocumentStore {
  private docs = new Map<DocId, Doc>();
  private order: DocId[] = [];
  private _activeId: DocId | null = null;
  private listeners = new Set<() => void>();
  private untitledCounterSeed = 0;

  get activeId(): DocId | null {
    return this._activeId;
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
    this.docs.set(doc.id, doc);
    this.order.push(doc.id);
    this._activeId = doc.id;
    this.emit();
  }

  get(id: DocId): Doc | undefined {
    return this.docs.get(id);
  }

  list(): Doc[] {
    return this.order.map((id) => this.docs.get(id)!).filter(Boolean);
  }

  update(id: DocId, patch: Partial<Doc>): void {
    const doc = this.docs.get(id);
    if (!doc) return;
    this.docs.set(id, { ...doc, ...patch });
    this.emit();
  }

  setActive(id: DocId): void {
    if (this.docs.has(id)) {
      this._activeId = id;
      this.emit();
    }
  }

  active(): Doc | undefined {
    return this._activeId ? this.docs.get(this._activeId) : undefined;
  }

  remove(id: DocId): void {
    const idx = this.order.indexOf(id);
    if (idx === -1) return;
    this.docs.delete(id);
    this.order.splice(idx, 1);
    if (this._activeId === id) {
      const neighbor = this.order[idx] ?? this.order[idx - 1] ?? null;
      this._activeId = neighbor;
    }
    this.emit();
  }
}

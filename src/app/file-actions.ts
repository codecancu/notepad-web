// SPDX-License-Identifier: GPL-3.0-or-later
import type { FileService } from '../services/file-service';
import type { DocumentStore, DocId } from '../services/document-store';
import type { EditorController } from '../editor/editor-controller';
import { classifySize, PERF_MAX_BYTES } from '../services/perf-guard';
import type { Doc } from '../services/document-store';

export class FileActions {
  private file: FileService;
  private store: DocumentStore;
  private controller: EditorController;
  private confirmFn: (m: string) => boolean;

  constructor(deps: {
    file: FileService;
    store: DocumentStore;
    controller: EditorController;
    confirmFn?: (m: string) => boolean;
  }) {
    this.file = deps.file;
    this.store = deps.store;
    this.controller = deps.controller;
    this.confirmFn = deps.confirmFn ?? ((m) => confirm(m));
  }

  async openFile(): Promise<void> {
    const res = await this.file.open();
    if (!res) return;
    const verdict = classifySize(res.size);
    if (verdict === 'reject') {
      alert(`File too large (> ${PERF_MAX_BYTES / 1_000_000} MB). Open it in a desktop editor.`);
      return;
    }
    if (verdict === 'warn' && !this.confirmFn('Large file (> 25 MB) may be slow. Open anyway?'))
      return;
    // Create the doc with 'plaintext' as the initial languageId.
    // EditorController.showDoc() will resolve the real language via luaRegistry
    // and write it back to the store as a non-dirty update so the StatusBar
    // and window.__activeLanguage reflect the registry-resolved language.
    const doc = this.store.create({
      name: res.name,
      content: res.content,
      languageId: 'plaintext',
      handle: res.handle,
      eol: res.eol,
      bom: res.bom,
      dirty: false,
    });
    this.controller.showDoc(doc.id);
    // Record the on-disk lastModified so we can later detect external changes.
    if (res.handle) {
      this.store.update(doc.id, { diskModified: await this._handleModified(res.handle) });
    }
  }

  async saveActive(): Promise<void> {
    const doc = this.store.active();
    if (!doc) return;
    await this._saveDoc(doc);
  }

  /**
   * Save All — iterates every open document and saves it.
   *
   * Docs with a file-system handle: saved in-place (saveTo).
   * Untitled/handle-less docs: a Save-As picker is shown sequentially so the
   * user can choose a location.  This matches Notepad++ behaviour where Save All
   * prompts for each untitled document in turn.
   */
  async saveAll(): Promise<void> {
    const docs = this.store.list();
    let consecutiveCancels = 0;
    for (const doc of docs) {
      const result = await this._saveDoc(doc);
      if (result === 'cancelled') {
        consecutiveCancels++;
        // After two Save-As pickers are cancelled back-to-back, stop spamming
        // the picker and ask the user whether to keep going or abort Save All.
        if (consecutiveCancels >= 2) {
          const keepGoing = this.confirmFn(
            'You cancelled saving 2 files in a row.\n\n' +
              'OK = continue saving the remaining files\n' +
              'Cancel = stop Save All',
          );
          if (!keepGoing) return;
          consecutiveCancels = 0;
        }
      } else {
        consecutiveCancels = 0;
      }
    }
  }

  /**
   * Save a Copy As — writes the active doc to a user-chosen path WITHOUT
   * updating the doc's handle or name.  The doc continues to be associated
   * with its previous location (or remains untitled).
   *
   * Faithful to Notepad++ "Save a Copy As…" semantics.
   */
  async saveCopyAs(): Promise<void> {
    const doc = this.store.active();
    if (!doc) return;
    // saveAs opens the picker and writes the file; we discard the returned handle
    // so the doc's own handle/name are unchanged.
    await this.file.saveAs(doc.name, doc.content, doc.eol, doc.bom);
  }

  /**
   * Reload the active document from its FileSystemFileHandle.
   * If the doc is dirty, asks the user to confirm discarding changes.
   * No-ops (with an alert) if the doc has no associated handle.
   *
   * Faithful to Notepad++ "Reload from Disk" semantics.
   */
  async reloadActive(): Promise<void> {
    const doc = this.store.active();
    if (!doc) return;
    if (!doc.handle) {
      alert('This document has no associated file on disk. Use File → Open to open a file first.');
      return;
    }
    if (
      doc.dirty &&
      !this.confirmFn(`Discard unsaved changes to "${doc.name}" and reload from disk?`)
    ) {
      return;
    }
    let res: { content: string; eol: 'lf' | 'crlf' | 'cr'; bom: boolean };
    try {
      res = await this._readHandle(doc.handle);
    } catch {
      alert(
        `Could not reload "${doc.name}": permission denied or file unavailable.\n` +
          'The file may have been moved, deleted, or its permission has expired.',
      );
      return;
    }
    this.store.update(doc.id, {
      content: res.content,
      eol: res.eol,
      bom: res.bom,
      dirty: false,
      externallyChanged: false,
      diskModified: await this._handleModified(doc.handle),
    });
    // Re-show the doc so CM6 picks up the new content.
    this.controller.showDoc(doc.id);
  }

  /**
   * Open a file directly from a FileSystemFileHandle handed to us by the OS via
   * the PWA File Handling API (launchQueue) — no picker. Creates a new document
   * tab seeded with the file's content and records its on-disk baseline.
   */
  async openFromHandle(handle: FileSystemFileHandle): Promise<void> {
    let res: { content: string; eol: 'lf' | 'crlf' | 'cr'; bom: boolean };
    try {
      res = await this._readHandle(handle);
    } catch {
      return;
    }
    const doc = this.store.create({
      name: handle.name,
      content: res.content,
      languageId: 'plaintext',
      handle,
      eol: res.eol,
      bom: res.bom,
      dirty: false,
    });
    this.controller.showDoc(doc.id);
    this.store.update(doc.id, { diskModified: await this._handleModified(handle) });
  }

  // ── Close-variant helpers ────────────────────────────────────────────────────

  /**
   * Close All Except Active — closes every doc except the currently active one.
   * Confirms for each dirty doc.  After the operation exactly one doc remains.
   */
  closeAllExceptActive(): void {
    const activeId = this.store.active()?.id;
    if (!activeId) return;
    const toClose = this.store
      .list()
      .map((d) => d.id)
      .filter((id) => id !== activeId);
    this._closeIds(toClose);
  }

  /**
   * Close All to the Left — closes every doc whose tab position is to the left
   * of the active doc in the current tab order.
   */
  closeAllToLeft(): void {
    const ids = this.store.list().map((d) => d.id);
    const activeId = this.store.active()?.id;
    if (!activeId) return;
    const activeIdx = ids.indexOf(activeId);
    if (activeIdx <= 0) return;
    this._closeIds(ids.slice(0, activeIdx));
  }

  /**
   * Close All to the Right — closes every doc whose tab position is to the right
   * of the active doc in the current tab order.
   */
  closeAllToRight(): void {
    const ids = this.store.list().map((d) => d.id);
    const activeId = this.store.active()?.id;
    if (!activeId) return;
    const activeIdx = ids.indexOf(activeId);
    if (activeIdx === -1 || activeIdx === ids.length - 1) return;
    this._closeIds(ids.slice(activeIdx + 1));
  }

  // ── Internal helpers ─────────────────────────────────────────────────────────

  /** Close a list of doc IDs in order, confirming for dirty docs. */
  private _closeIds(ids: DocId[]): void {
    for (const id of ids) {
      const doc = this.store.get(id);
      if (!doc) continue;
      if (doc.dirty && !this.confirmFn(`Discard unsaved changes to "${doc.name}"?`)) continue;
      this.store.remove(id);
      this.controller.closeDoc(id);
    }
    // Ensure at least one doc is open.
    if (!this.store.active()) {
      const d = this.store.create();
      this.controller.showDoc(d.id);
    }
  }

  /**
   * Internal: save a single doc (used by both saveActive and saveAll).
   * Returns 'saved' when written, or 'cancelled' when the user dismissed the
   * Save-As picker (saveAll uses this to detect consecutive cancels).
   */
  private async _saveDoc(doc: Doc): Promise<'saved' | 'cancelled'> {
    if (doc.handle) {
      if (await this.file.ensureWritable(doc.handle)) {
        await this.file.saveTo(doc.handle, doc.content, doc.eol, doc.bom);
        this.store.update(doc.id, {
          dirty: false,
          externallyChanged: false,
          diskModified: await this._handleModified(doc.handle),
        });
        return 'saved';
      }
      // Permission denied/revoked — fall through to saveAs so user can pick a new location.
    }
    const handle = await this.file.saveAs(doc.name, doc.content, doc.eol, doc.bom);
    if (!handle) return 'cancelled';
    this.store.update(doc.id, {
      handle,
      name: handle.name,
      dirty: false,
      externallyChanged: false,
      diskModified: await this._handleModified(handle),
    });
    return 'saved';
  }

  /** Read a handle's on-disk lastModified, or undefined if unavailable. */
  private async _handleModified(handle: FileSystemFileHandle): Promise<number | undefined> {
    try {
      return (await handle.getFile()).lastModified;
    } catch {
      return undefined;
    }
  }

  /**
   * Re-check every file-backed doc against its on-disk lastModified and mark any
   * whose file changed externally (externallyChanged=true) so its tab shows the
   * "changed on disk" indicator. Call when the editor window regains focus.
   * Faithful to NotepadNext's external-change detection.
   */
  async checkExternalChanges(): Promise<void> {
    for (const doc of this.store.list()) {
      if (!doc.handle || doc.diskModified === undefined || doc.externallyChanged) continue;
      const lm = await this._handleModified(doc.handle);
      if (lm !== undefined && lm > doc.diskModified) {
        this.store.update(doc.id, { externallyChanged: true });
      }
    }
  }

  /** Read content from a FileSystemFileHandle (for reload). */
  private async _readHandle(
    handle: FileSystemFileHandle,
  ): Promise<{ content: string; eol: 'lf' | 'crlf' | 'cr'; bom: boolean }> {
    const file = await handle.getFile();
    const raw = await file.text();
    // Inline BOM strip + EOL detect (mirrors FileService.readHandle).
    const bom = raw.startsWith('﻿');
    const content = bom ? raw.slice(1) : raw;
    const eol: 'lf' | 'crlf' | 'cr' = content.includes('\r\n')
      ? 'crlf'
      : content.includes('\r')
        ? 'cr'
        : 'lf';
    return { content, eol, bom };
  }
}

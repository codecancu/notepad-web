// SPDX-License-Identifier: GPL-3.0-or-later
import { stripBom, detectEol, applyEol } from './text-utils';

export interface OpenResult {
  name: string;
  content: string;
  handle?: FileSystemFileHandle;
  eol: 'lf' | 'crlf' | 'cr';
  bom: boolean;
  size: number;
}

export interface FileServiceDeps {
  showOpenFilePicker?: typeof window.showOpenFilePicker;
  showSaveFilePicker?: typeof window.showSaveFilePicker;
}

export class FileService {
  private showOpenFilePicker: typeof window.showOpenFilePicker | undefined;
  private showSaveFilePicker: typeof window.showSaveFilePicker | undefined;

  constructor(deps: FileServiceDeps = {}) {
    this.showOpenFilePicker = deps.showOpenFilePicker ?? window.showOpenFilePicker?.bind(window);
    this.showSaveFilePicker = deps.showSaveFilePicker ?? window.showSaveFilePicker?.bind(window);
  }

  isFsaSupported(): boolean {
    return typeof this.showOpenFilePicker === 'function';
  }

  private async readHandle(handle: FileSystemFileHandle): Promise<OpenResult> {
    const file = await handle.getFile();
    const raw = await file.text();
    const { text, bom } = stripBom(raw);
    return { name: handle.name, content: text, handle, eol: detectEol(text), bom, size: file.size };
  }

  async open(): Promise<OpenResult | null> {
    const showOpenFilePicker = this.showOpenFilePicker;
    if (!showOpenFilePicker) return null;
    try {
      const handles = await showOpenFilePicker();
      const handle = handles[0];
      if (!handle) return null;
      return await this.readHandle(handle);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null;
      throw err;
    }
  }

  async saveAs(
    name: string,
    content: string,
    eol: 'lf' | 'crlf' | 'cr',
    bom: boolean,
  ): Promise<FileSystemFileHandle | null> {
    const showSaveFilePicker = this.showSaveFilePicker;
    if (!showSaveFilePicker) return null;
    try {
      const handle = await showSaveFilePicker({ suggestedName: name });
      await this.saveTo(handle, content, eol, bom);
      return handle;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null;
      throw err;
    }
  }

  async ensureWritable(handle: FileSystemFileHandle): Promise<boolean> {
    if (typeof handle.queryPermission === 'function') {
      const q = await handle.queryPermission({ mode: 'readwrite' });
      if (q === 'granted') return true;
      if (typeof handle.requestPermission === 'function') {
        return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
      }
      return false;
    }
    return true;
  }

  async saveTo(
    handle: FileSystemFileHandle,
    content: string,
    eol: 'lf' | 'crlf' | 'cr',
    bom: boolean,
  ): Promise<void> {
    const body = (bom ? '﻿' : '') + applyEol(content, eol);
    const writable = await handle.createWritable();
    await writable.write(body);
    await writable.close();
  }
}

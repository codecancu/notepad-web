// SPDX-License-Identifier: GPL-3.0-or-later
import type { DocumentStore } from '../services/document-store';

export class StatusBar {
  private line = 1;
  private col = 1;
  constructor(
    private root: HTMLElement,
    private store: DocumentStore,
  ) {
    this.store.subscribe(() => this.render());
    this.render();
  }
  setCursor(line: number, col: number): void {
    this.line = line;
    this.col = col;
    this.render();
  }
  render(): void {
    const doc = this.store.active();
    const lang = doc?.languageId ?? 'plaintext';
    const eol = (doc?.eol ?? 'lf').toUpperCase();
    this.root.textContent = `${lang} · ${eol} · Ln ${this.line}, Col ${this.col}`;
  }
}

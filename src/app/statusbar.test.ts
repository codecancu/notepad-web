// SPDX-License-Identifier: GPL-3.0-or-later
import { DocumentStore } from '../services/document-store';
import { StatusBar } from './statusbar';

describe('StatusBar', () => {
  it('renders language, eol, and cursor for the active doc', () => {
    const root = document.createElement('div');
    const store = new DocumentStore();
    store.create({ name: 'a.ts', languageId: 'typescript', eol: 'lf' });
    const bar = new StatusBar(root, store);
    bar.setCursor(3, 7);
    expect(root.textContent).toContain('typescript');
    expect(root.textContent).toContain('LF');
    expect(root.textContent).toContain('Ln 3, Col 7');
  });
});

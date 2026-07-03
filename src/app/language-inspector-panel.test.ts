// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Unit tests for LanguageInspectorPanel.
 *
 * IMPORTANT: These tests must NOT boot Wasmoon (which fails under happy-dom).
 * All tests use a stubbed LuaRegistry that resolves immediately with fake LangDefs.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mountLanguageInspectorPanel, renderLangDef } from './language-inspector-panel';
import { DocumentStore } from '../services/document-store';
import type { LangDef, LuaRegistry } from '../services/lua-registry';
import { bgrToCss } from '../editor/color-utils';

// ── Stub registry ─────────────────────────────────────────────────────────────

const FAKE_LANG_DEF: LangDef = {
  name: 'FakeLang',
  lexer: 'fake_lexer',
  extensions: ['fk', 'fake'],
  singleLineComment: '//',
  keywords: {
    '0': 'if else while for',
    '1': 'int float string',
  },
  styles: {
    Default: { id: 0, fgColor: 0x000000, bgColor: 0xffffff },
    // BGR: 0xFF0000 = CSS blue (#0000ff); bgrToCss(0xFF0000) = '#0000ff'
    Keyword: { id: 1, fgColor: 0xff0000, bgColor: 0xffffff },
    Comment: { id: 2, fgColor: 0x008000, bgColor: 0xffffff },
  },
  properties: {},
};

function makeStubRegistry(langDef: LangDef | undefined = FAKE_LANG_DEF): LuaRegistry {
  return {
    ready: () => Promise.resolve(),
    // Use a function that captures `langDef` (including `undefined` when explicitly passed).
    getLanguage: () => langDef,
    listLanguages: () => ['FakeLang'],
    detectByExtension: () => null,
    detectByFirstLine: () => null,
    loadFailures: [],
  } as unknown as LuaRegistry;
}

/** Registry that always returns undefined — explicitly no language def. */
function makeEmptyRegistry(): LuaRegistry {
  return {
    ready: () => Promise.resolve(),
    getLanguage: () => undefined,
    listLanguages: () => [],
    detectByExtension: () => null,
    detectByFirstLine: () => null,
    loadFailures: [],
  } as unknown as LuaRegistry;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeEl(): HTMLDivElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

// ── Tests: renderLangDef (pure DOM helper) ─────────────────────────────────────

describe('renderLangDef', () => {
  it('shows "No language definition available" for undefined langDef', () => {
    const table = document.createElement('table');
    renderLangDef(undefined, table);
    expect(table.textContent).toContain('No language definition available');
  });

  it('renders lexer name', () => {
    const table = document.createElement('table');
    renderLangDef(FAKE_LANG_DEF, table);
    expect(table.textContent).toContain('fake_lexer');
  });

  it('renders extensions list', () => {
    const table = document.createElement('table');
    renderLangDef(FAKE_LANG_DEF, table);
    expect(table.textContent).toContain('fk, fake');
  });

  it('renders singleLineComment token', () => {
    const table = document.createElement('table');
    renderLangDef(FAKE_LANG_DEF, table);
    expect(table.textContent).toContain('//');
  });

  it('renders keyword sets by index', () => {
    const table = document.createElement('table');
    renderLangDef(FAKE_LANG_DEF, table);
    expect(table.textContent).toContain('if else while for');
    expect(table.textContent).toContain('int float string');
    expect(table.textContent).toContain('[0]');
    expect(table.textContent).toContain('[1]');
  });

  it('renders style names', () => {
    const table = document.createElement('table');
    renderLangDef(FAKE_LANG_DEF, table);
    expect(table.textContent).toContain('Default');
    expect(table.textContent).toContain('Keyword');
    expect(table.textContent).toContain('Comment');
  });

  it('renders colour swatches using bgrToCss', () => {
    const table = document.createElement('table');
    renderLangDef(FAKE_LANG_DEF, table);
    // Keyword: fgColor=0xFF0000 (BGR) → CSS '#0000ff'
    const keywordCss = bgrToCss(0xff0000);
    expect(keywordCss).toBe('#0000ff');
    // The swatch or the code label should contain the CSS colour.
    expect(table.innerHTML).toContain(keywordCss);
  });

  it('truncates very long keyword lists with ellipsis', () => {
    const longKw = 'word '.repeat(50); // > 200 chars
    const longDef: LangDef = {
      ...FAKE_LANG_DEF,
      keywords: { '0': longKw },
    };
    const table = document.createElement('table');
    renderLangDef(longDef, table);
    expect(table.textContent).toContain('…');
  });
});

// ── Tests: mountLanguageInspectorPanel ────────────────────────────────────────

describe('LanguageInspectorPanel (mounted)', () => {
  let store: DocumentStore;
  let el: HTMLDivElement;

  beforeEach(() => {
    store = new DocumentStore();
    el = makeEl();
  });

  it('renders the panel header', () => {
    const registry = makeStubRegistry();
    mountLanguageInspectorPanel(el, store, registry);
    expect(el.textContent).toContain('Language Inspector');
  });

  it('renders lang def after registry ready resolves', async () => {
    store.create({ name: 'test.fk', languageId: 'FakeLang' });
    const registry = makeStubRegistry();
    mountLanguageInspectorPanel(el, store, registry);
    // Give the async ready() a tick to resolve.
    await Promise.resolve();
    expect(el.textContent).toContain('fake_lexer');
    expect(el.textContent).toContain('fk, fake');
    expect(el.textContent).toContain('//');
  });

  it('shows "No language definition available" when getLanguage returns undefined', async () => {
    store.create({ name: 'test.txt', languageId: 'plaintext' });
    const registry = makeEmptyRegistry();
    mountLanguageInspectorPanel(el, store, registry);
    await Promise.resolve();
    expect(el.textContent).toContain('No language definition available');
  });

  it('renders colour swatches with bgrToCss in mounted panel', async () => {
    store.create({ name: 'test.fk', languageId: 'FakeLang' });
    const registry = makeStubRegistry();
    mountLanguageInspectorPanel(el, store, registry);
    await Promise.resolve();
    const keywordCss = bgrToCss(0xff0000); // '#0000ff'
    expect(el.innerHTML).toContain(keywordCss);
  });

  it('updates when active doc language changes (store subscription)', async () => {
    const doc = store.create({ name: 'a.fk', languageId: 'FakeLang' });

    const noLangDef: LangDef = {
      ...FAKE_LANG_DEF,
      name: 'OtherLang',
      lexer: 'other_lexer',
    };
    let callCount = 0;
    const registry: LuaRegistry = {
      ready: () => Promise.resolve(),
      getLanguage: () => {
        callCount++;
        return callCount <= 1 ? FAKE_LANG_DEF : noLangDef;
      },
      listLanguages: () => ['FakeLang', 'OtherLang'],
      detectByExtension: () => null,
      detectByFirstLine: () => null,
      loadFailures: [],
    } as unknown as LuaRegistry;

    mountLanguageInspectorPanel(el, store, registry);
    await Promise.resolve();

    // Update the language — triggers store subscription.
    store.update(doc.id, { languageId: 'OtherLang' });
    await Promise.resolve();
    await Promise.resolve(); // extra tick for the inner ready() chain

    expect(el.textContent).toContain('other_lexer');
  });

  it('disposer removes store subscription — no re-render after cleanup', async () => {
    store.create({ name: 'test.fk', languageId: 'FakeLang' });
    const registry = makeStubRegistry();
    const cleanup = mountLanguageInspectorPanel(el, store, registry);
    await Promise.resolve();

    expect(typeof cleanup).toBe('function');

    // Capture state after initial render.
    const textBefore = el.textContent ?? '';

    // Dispose — releases store subscription.
    cleanup();

    // Add a new doc that would change active language — should NOT trigger re-render.
    store.create({ name: 'ghost.other', languageId: 'OtherLang' });
    await Promise.resolve();
    await Promise.resolve();

    // The panel should not have changed (subscription released).
    expect(el.textContent).toBe(textBefore);
  });
});

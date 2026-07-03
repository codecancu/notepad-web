// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * LanguageInspector dock panel — read-only view of the active document's
 * LangDef from luaRegistry.
 *
 * Displays:
 *   - Lexer name
 *   - File extensions list
 *   - Single-line comment token
 *   - Keyword sets (by index)
 *   - Styles (name → colour swatch via bgrToCss)
 *
 * Updates when the active document or its languageId changes.
 * Awaits luaRegistry.ready() before reading LangDefs; shows "Loading…" until
 * the registry is ready.
 *
 * Returns a cleanup disposer that removes the store subscription.
 */

import type { DocumentStore } from '../services/document-store';
import type { LangDef, LuaRegistry } from '../services/lua-registry';
import { bgrToCss } from '../editor/color-utils';

/** Build a section heading row spanning both columns. */
function sectionRow(label: string, table: HTMLTableElement): void {
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 2;
  td.textContent = label;
  td.style.cssText =
    'padding:4px 4px 2px 4px;color:#333;font-weight:700;background:#e0e0e0;' +
    'border-top:1px solid #ccc;font-family:"Segoe UI",system-ui,sans-serif;font-size:11px;';
  tr.appendChild(td);
  table.appendChild(tr);
}

/** Build a key/value row. */
function dataRow(label: string, value: string, table: HTMLTableElement): void {
  const tr = document.createElement('tr');

  const tdL = document.createElement('td');
  tdL.textContent = label;
  tdL.style.cssText =
    'padding:2px 8px 2px 4px;color:#555;font-weight:600;white-space:nowrap;vertical-align:top;';

  const tdV = document.createElement('td');
  tdV.textContent = value;
  tdV.style.cssText = 'padding:2px 4px;color:#222;word-break:break-all;';

  tr.appendChild(tdL);
  tr.appendChild(tdV);
  table.appendChild(tr);
}

/** Build a style row with a colour swatch. */
function styleRow(name: string, fgColor: number, bgColor: number, table: HTMLTableElement): void {
  const tr = document.createElement('tr');

  const tdL = document.createElement('td');
  tdL.textContent = name;
  tdL.style.cssText =
    'padding:2px 8px 2px 4px;color:#555;white-space:nowrap;vertical-align:middle;';

  const tdV = document.createElement('td');
  tdV.style.cssText = 'padding:2px 4px;vertical-align:middle;';

  const fgCss = bgrToCss(fgColor);
  const bgCss = bgrToCss(bgColor);

  // Colour swatch: show foreground over background.
  const swatch = document.createElement('span');
  swatch.style.cssText =
    `display:inline-block;width:14px;height:14px;border:1px solid #aaa;` +
    `background:${fgCss};vertical-align:middle;margin-right:4px;border-radius:2px;`;
  swatch.title = `fg: ${fgCss}`;

  const fgLabel = document.createElement('code');
  fgLabel.textContent = fgCss;
  fgLabel.style.cssText = `color:${fgCss};background:${bgCss};padding:0 3px;border-radius:2px;`;

  tdV.appendChild(swatch);
  tdV.appendChild(fgLabel);

  tr.appendChild(tdL);
  tr.appendChild(tdV);
  table.appendChild(tr);
}

/**
 * Render a LangDef into the table.
 * Exported for unit testing.
 */
export function renderLangDef(langDef: LangDef | undefined, table: HTMLTableElement): void {
  table.innerHTML = '';

  if (!langDef) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 2;
    td.textContent = 'No language definition available.';
    td.style.cssText = 'padding:8px 4px;color:#888;font-style:italic;';
    tr.appendChild(td);
    table.appendChild(tr);
    return;
  }

  // ── General ─────────────────────────────────────────────────────────────────
  sectionRow('General', table);
  dataRow('Language', langDef.name, table);
  dataRow('Lexer', langDef.lexer ?? '(none)', table);
  dataRow(
    'Extensions',
    langDef.extensions.length > 0 ? langDef.extensions.join(', ') : '(none)',
    table,
  );
  dataRow('Comment', langDef.singleLineComment ?? '(none)', table);

  // ── Keywords ─────────────────────────────────────────────────────────────────
  const kwKeys = Object.keys(langDef.keywords);
  if (kwKeys.length > 0) {
    sectionRow('Keywords', table);
    for (const key of kwKeys.sort()) {
      const words = langDef.keywords[key] ?? '';
      // Truncate very long keyword lists for readability.
      const preview = words.length > 200 ? words.slice(0, 200) + '…' : words;
      dataRow(`Set [${key}]`, preview, table);
    }
  }

  // ── Styles ───────────────────────────────────────────────────────────────────
  const styleEntries = Object.entries(langDef.styles);
  if (styleEntries.length > 0) {
    sectionRow('Styles', table);
    for (const [styleName, styleDef] of styleEntries) {
      styleRow(styleName, styleDef.fgColor, styleDef.bgColor, table);
    }
  }
}

/**
 * Mount the LanguageInspector panel into `el`.
 * Called by DockManager via PanelDef.render.
 * Returns a cleanup disposer (removes the store subscription).
 *
 * @param registry - LuaRegistry instance (or stub for testing).
 */
export function mountLanguageInspectorPanel(
  el: HTMLElement,
  store: DocumentStore,
  registry: LuaRegistry,
): () => void {
  el.style.cssText =
    'display:flex;flex-direction:column;height:100%;width:100%;' +
    'background:#f5f5f5;overflow:hidden;font:12px "Consolas","Courier New",monospace;';

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.style.cssText =
    'flex:0 0 auto;display:flex;align-items:center;padding:3px 6px;' +
    'background:#e8e8e8;border-bottom:1px solid #ccc;';
  const titleEl = document.createElement('span');
  titleEl.textContent = 'Language Inspector';
  titleEl.style.cssText =
    'font-weight:600;font-size:12px;color:#333;font-family:"Segoe UI",system-ui,sans-serif;';
  toolbar.appendChild(titleEl);

  // Table container
  const tableWrap = document.createElement('div');
  tableWrap.style.cssText = 'flex:1 1 auto;overflow:auto;padding:6px 4px;';

  const table = document.createElement('table');
  table.id = 'language-inspector-table';
  table.style.cssText = 'border-collapse:collapse;width:100%;';
  tableWrap.appendChild(table);

  el.appendChild(toolbar);
  el.appendChild(tableWrap);

  // Show a "loading" state until the registry is ready.
  const loadingTr = document.createElement('tr');
  const loadingTd = document.createElement('td');
  loadingTd.textContent = 'Loading registry…';
  loadingTd.style.cssText = 'padding:8px 4px;color:#888;font-style:italic;';
  loadingTr.appendChild(loadingTd);
  table.appendChild(loadingTr);

  let disposed = false;

  /** Full re-render from current store state. */
  const render = (): void => {
    if (disposed) return;
    const doc = store.active();
    const langDef = doc ? registry.getLanguage(doc.languageId) : undefined;
    renderLangDef(langDef, table);
  };

  // Subscribe to store before registry ready so active-doc changes update panel.
  const unsubStore = store.subscribe(() => {
    // Only re-render after registry is ready (avoid pre-ready renders showing nothing).
    void registry
      .ready()
      .then(render)
      .catch(() => {
        /* graceful */
      });
  });

  // Wait for registry then render.
  void registry
    .ready()
    .then(render)
    .catch(() => {
      if (!disposed) {
        table.innerHTML = '';
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.textContent = 'Registry failed to load.';
        td.style.cssText = 'padding:8px 4px;color:#c00;';
        tr.appendChild(td);
        table.appendChild(tr);
      }
    });

  // Cleanup disposer
  return (): void => {
    disposed = true;
    unsubStore();
  };
}

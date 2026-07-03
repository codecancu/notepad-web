// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * DebugLog panel — captures console output and app log messages and
 * displays them in a scrollable text view inside a dockable panel.
 *
 * Usage:
 *   import { debugLog, mountDebugLogPanel } from './debug-log-panel';
 *   debugLog.append('App started');        // programmatic log
 *   const unsub = mountDebugLogPanel(el); // called by DockManager via PanelDef.render
 *   // unsub() releases the listener when the panel is disposed.
 */

/** Internal logger — collects messages before the DOM panel is mounted. */
class DebugLogger {
  private _lines: string[] = [];
  private _listeners: Array<(line: string) => void> = [];
  private _originalConsole: {
    log: typeof console.log;
    warn: typeof console.warn;
    error: typeof console.error;
    info: typeof console.info;
  } | null = null;

  /** Install console interceptors so all console.* output is also captured. */
  install(): void {
    if (this._originalConsole) return; // already installed

    const orig = {
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      info: console.info.bind(console),
    };
    this._originalConsole = orig;

    const record = (entry: string) => this._record(entry);
    const wrap =
      (level: string, fn: (...args: unknown[]) => void) =>
      (...args: unknown[]): void => {
        fn(...args);
        // Format the args into a readable string.
        const msg = args
          .map((a) => {
            if (typeof a === 'string') return a;
            try {
              return JSON.stringify(a);
            } catch {
              return String(a);
            }
          })
          .join(' ');
        record(`[${level}] ${msg}`);
      };

    console.log = wrap('log', orig.log);
    console.warn = wrap('warn', orig.warn);
    console.error = wrap('error', orig.error);
    console.info = wrap('info', orig.info);
  }

  /** Append a message explicitly (bypasses console interception). */
  append(msg: string): void {
    this._record(msg);
  }

  /** Subscribe to new log lines; returns an unsubscribe function. */
  subscribe(fn: (line: string) => void): () => void {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== fn);
    };
  }

  /** Return all buffered lines. */
  get lines(): readonly string[] {
    return this._lines;
  }

  private _record(line: string): void {
    const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
    const entry = `${ts}  ${line}`;
    this._lines.push(entry);
    // Keep a rolling buffer.
    if (this._lines.length > 2000) {
      this._lines.splice(0, this._lines.length - 2000);
    }
    for (const fn of this._listeners) {
      try {
        fn(entry);
      } catch {
        /* ignore listener errors */
      }
    }
  }
}

export const debugLog = new DebugLogger();

/**
 * Mount the DebugLog panel content into `el`.
 * Called by DockManager via PanelDef.render when the panel is first shown.
 *
 * Returns an unsubscribe function so PanelRenderer.dispose() can release the
 * internal debugLog listener — matching the cleanup contract of every other panel.
 */
export function mountDebugLogPanel(el: HTMLElement): () => void {
  el.style.cssText =
    'display:flex;flex-direction:column;height:100%;width:100%;background:#f8f8f8;' +
    'font:11px "Consolas","Courier New",monospace;color:#222;overflow:hidden;';

  // Toolbar row.
  const toolbar = document.createElement('div');
  toolbar.style.cssText =
    'flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:2px 6px;' +
    'background:#e8e8e8;border-bottom:1px solid #ccc;';

  const title = document.createElement('span');
  title.textContent = 'Debug Log';
  title.style.cssText = 'font-weight:bold;font-size:11px;flex:1;';

  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear';
  clearBtn.style.cssText =
    'font:11px inherit;padding:1px 6px;border:1px solid #aaa;background:#f0f0f0;' +
    'cursor:pointer;border-radius:2px;';

  toolbar.appendChild(title);
  toolbar.appendChild(clearBtn);

  // Log output area.
  const output = document.createElement('div');
  output.id = 'debug-log-output';
  output.style.cssText =
    'flex:1 1 auto;overflow:auto;padding:4px 8px;white-space:pre-wrap;' + 'word-break:break-all;';

  el.appendChild(toolbar);
  el.appendChild(output);

  // Populate with already-buffered lines.
  for (const line of debugLog.lines) {
    appendLine(output, line);
  }
  scrollToBottom(output);

  // Subscribe to new lines; the returned handle is passed back to the caller
  // so PanelRenderer.dispose() can release the listener when the panel is removed.
  const unsub = debugLog.subscribe((line) => {
    appendLine(output, line);
    scrollToBottom(output);
  });

  clearBtn.addEventListener('click', () => {
    output.innerHTML = '';
    // We don't clear the internal buffer — only the DOM view.
  });

  // Return the unsubscribe handle so PanelRenderer.dispose() can release the
  // listener, matching the cleanup contract of every other panel's render fn.
  return unsub;
}

function appendLine(container: HTMLElement, text: string): void {
  const div = document.createElement('div');
  div.textContent = text;
  div.style.cssText = 'padding:1px 0;border-bottom:1px solid #eee;';
  container.appendChild(div);
}

function scrollToBottom(container: HTMLElement): void {
  container.scrollTop = container.scrollHeight;
}

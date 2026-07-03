// SPDX-License-Identifier: GPL-3.0-or-later
import type { LuaConsoleEngine } from '../services/lua-console-engine';

export function mountLuaConsolePanel(el: HTMLElement, engine: LuaConsoleEngine): () => void {
  el.style.cssText =
    'display:flex;flex-direction:column;height:100%;width:100%;background:#f8f8f8;' +
    'font:12px "Consolas","Courier New",monospace;color:#222;overflow:hidden;';

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.style.cssText =
    'flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:2px 6px;' +
    'background:#e8e8e8;border-bottom:1px solid #ccc;';
  const title = document.createElement('span');
  title.textContent = 'Lua Console';
  title.style.cssText = 'font-weight:bold;font-size:11px;flex:1;';
  toolbar.appendChild(title);

  // Output area
  const output = document.createElement('div');
  output.id = 'lua-console-output';
  output.style.cssText =
    'flex:1 1 auto;overflow:auto;padding:4px 8px;white-space:pre-wrap;word-break:break-all;';

  // Input row
  const inputRow = document.createElement('div');
  inputRow.style.cssText =
    'flex:0 0 auto;display:flex;align-items:center;padding:4px 8px;' +
    'border-top:1px solid #ccc;background:#fff;';

  const prompt = document.createElement('span');
  prompt.textContent = '> ';
  prompt.style.cssText = 'color:#888;margin-right:4px;user-select:none;';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'lua-console-input';
  input.style.cssText = 'flex:1;border:none;outline:none;font:inherit;background:transparent;';
  input.placeholder = 'Enter Lua expression or statement…';

  inputRow.appendChild(prompt);
  inputRow.appendChild(input);

  el.appendChild(toolbar);
  el.appendChild(output);
  el.appendChild(inputRow);

  // State
  const history: string[] = [];
  let histIdx = -1;
  let accumulated = ''; // multi-line accumulation

  function appendOutput(text: string, isError = false): void {
    const div = document.createElement('div');
    div.style.cssText = 'padding:1px 0;border-bottom:1px solid #eee;';
    if (isError) {
      div.className = 'lua-console-error';
      div.style.color = '#c00';
    }
    div.textContent = text;
    output.appendChild(div);
    output.scrollTop = output.scrollHeight;
  }

  function pushHistory(cmd: string): void {
    // No consecutive dups
    if (history.length === 0 || history[history.length - 1] !== cmd) {
      history.push(cmd);
    }
    histIdx = -1;
  }

  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const line = input.value;
      const cmd = accumulated ? accumulated + '\n' + line : line;
      appendOutput('> ' + line);
      input.value = '';

      void engine.execute(cmd).then((result) => {
        if (result.incomplete) {
          // Accumulate more input
          accumulated = cmd;
          prompt.textContent = '>> ';
          return;
        }

        // Reset accumulation
        accumulated = '';
        prompt.textContent = '> ';

        if (line.trim()) pushHistory(line.trim());

        if (result.output) {
          appendOutput(result.output, !result.ok);
        } else if (!result.ok) {
          appendOutput('(error)', true);
        }
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      if (histIdx === -1) histIdx = history.length - 1;
      else if (histIdx > 0) histIdx--;
      input.value = history[histIdx] ?? '';
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdx === -1) return;
      histIdx++;
      if (histIdx >= history.length) {
        histIdx = -1;
        input.value = '';
      } else {
        input.value = history[histIdx] ?? '';
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      input.value = '';
      accumulated = '';
      prompt.textContent = '> ';
      histIdx = -1;
    }
  });

  // Return disposer (no subscriptions to clean up)
  return () => {
    /* nothing to dispose */
  };
}

// SPDX-License-Identifier: GPL-3.0-or-later
import { LuaFactory } from 'wasmoon';
import { resolveWasmUri } from './lua-registry';

export interface ExecResult {
  ok: boolean;
  output: string;
  /** True when statement ends with <eof> — console should accumulate more input */
  incomplete: boolean;
}

export class LuaConsoleEngine {
  // Lazy: engine is NOT created at construction time (avoids happy-dom issues)
  private _enginePromise: Promise<import('wasmoon').LuaEngine> | null = null;
  private _failed = false;
  private _failMessage = '';
  private _bridge: object | null = null;

  private _getEngine(): Promise<import('wasmoon').LuaEngine> {
    if (this._enginePromise) return this._enginePromise;
    this._enginePromise = (async () => {
      const factory = new LuaFactory(resolveWasmUri());
      return factory.createEngine();
    })();
    this._enginePromise.catch((err: unknown) => {
      this._failed = true;
      this._failMessage = String(err);
    });
    return this._enginePromise;
  }

  /**
   * Set an editor bridge object to expose as `editor` in the Lua environment.
   * Called from editor-page.ts after the EditorView is created.
   */
  setEditorBridge(bridge: object): void {
    this._bridge = bridge;
  }

  async execute(source: string): Promise<ExecResult> {
    if (this._failed) {
      return {
        ok: false,
        output: `Engine failed to initialize: ${this._failMessage}`,
        incomplete: false,
      };
    }
    let engine: import('wasmoon').LuaEngine;
    try {
      engine = await this._getEngine();
    } catch (err) {
      return { ok: false, output: `Engine init error: ${String(err)}`, incomplete: false };
    }

    const outputParts: string[] = [];
    // Override Lua print to capture output
    engine.global.set('print', (...args: unknown[]) => {
      outputParts.push(args.map(String).join('\t'));
    });

    // Expose the editor bridge if set
    if (this._bridge !== null) {
      engine.global.set('editor', this._bridge);
    }

    // Expression-first REPL: try `return (<source>)` first
    try {
      const result = await engine.doString(`return (${source})`);
      if (result !== undefined && result !== null) {
        outputParts.push(String(result));
      }
      return { ok: true, output: outputParts.join('\n'), incomplete: false };
    } catch {
      // If expression fails, try as statement
    }

    try {
      const stmtResult = await engine.doString(source);
      if (stmtResult !== undefined && stmtResult !== null) {
        outputParts.push(String(stmtResult));
      }
      return { ok: true, output: outputParts.join('\n'), incomplete: false };
    } catch (stmtErr) {
      const msg = String(stmtErr);
      // Check if incomplete (ends with <eof>)
      if (msg.includes('<eof>')) {
        return { ok: false, output: msg, incomplete: true };
      }
      return { ok: false, output: msg, incomplete: false };
    }
  }
}

/** Application-level singleton — created lazily on first console open. */
export const luaConsoleEngine = new LuaConsoleEngine();

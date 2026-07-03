// SPDX-License-Identifier: GPL-3.0-or-later
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { LuaConsoleEngine } from './lua-console-engine';

describe('LuaConsoleEngine', () => {
  it('evaluate expression return 1+1 → output contains "2"', async () => {
    const eng = new LuaConsoleEngine();
    const result = await eng.execute('return 1+1');
    expect(result.ok).toBe(true);
    expect(result.output).toContain('2');
  }, 60_000);

  it('print("hi") → output "hi"', async () => {
    const eng = new LuaConsoleEngine();
    const result = await eng.execute('print("hi")');
    expect(result.ok).toBe(true);
    expect(result.output).toContain('hi');
  }, 60_000);

  it('runtime error → ok:false + error text', async () => {
    const eng = new LuaConsoleEngine();
    const result = await eng.execute('error("boom")');
    expect(result.ok).toBe(false);
    expect(result.output).toContain('boom');
  }, 60_000);

  it('incomplete statement → incomplete:true', async () => {
    const eng = new LuaConsoleEngine();
    const result = await eng.execute('function f()');
    expect(result.incomplete).toBe(true);
  }, 60_000);
});

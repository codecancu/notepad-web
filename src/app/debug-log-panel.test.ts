// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach } from 'vitest';
import { debugLog, mountDebugLogPanel } from './debug-log-panel';

describe('mountDebugLogPanel', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('returns a function (unsubscribe / disposer)', () => {
    const el = document.createElement('div');
    const disposer = mountDebugLogPanel(el);
    expect(typeof disposer).toBe('function');
  });

  it('disposer stops the subscriber from receiving further appends', () => {
    const el = document.createElement('div');
    const disposer = mountDebugLogPanel(el);

    // Collect output lines rendered into the panel before dispose.
    const outputBefore = el.querySelectorAll('#debug-log-output div').length;

    // Trigger a new log line — the subscriber should add it to the DOM.
    debugLog.append('__test-before-dispose__');
    const outputAfterLog = el.querySelectorAll('#debug-log-output div').length;
    expect(outputAfterLog).toBeGreaterThan(outputBefore);

    // Dispose: the subscriber is removed.
    disposer();

    // After disposal, a new append must NOT add another div to the panel.
    const countBeforeAppend = el.querySelectorAll('#debug-log-output div').length;
    debugLog.append('__test-after-dispose__');
    const countAfterAppend = el.querySelectorAll('#debug-log-output div').length;
    expect(countAfterAppend).toBe(countBeforeAppend);
  });
});

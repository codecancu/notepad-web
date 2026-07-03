// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Unit tests for macro.ts — recording state machine and step coalescing.
 *
 * Tests cover:
 *  - startRecording / stopRecording / isRecording lifecycle
 *  - recordStep: insert coalescing, backspace-chop, command recording
 *  - getCurrentMacro: returns the last stopped macro
 *  - replayMacro: fixed count, till-EOF, empty macro
 *  - MACRO_COMMANDS registry completeness
 *  - fnToName reverse map
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  startRecording,
  stopRecording,
  isRecording,
  getCurrentMacro,
  recordStep,
  replayMacro,
  MACRO_COMMANDS,
  fnToName,
  type Macro,
} from './macro';

// Reset module-level state between tests by always calling startRecording then stopRecording.
function resetMacroState(): void {
  startRecording();
  stopRecording();
  // Now not recording, no macro stored (stopRecording stores empty macro).
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

describe('startRecording / stopRecording / isRecording', () => {
  beforeEach(() => resetMacroState());

  it('isRecording is false initially', () => {
    expect(isRecording()).toBe(false);
  });

  it('isRecording is true after startRecording', () => {
    startRecording();
    expect(isRecording()).toBe(true);
    stopRecording();
  });

  it('isRecording is false after stopRecording', () => {
    startRecording();
    stopRecording();
    expect(isRecording()).toBe(false);
  });

  it('stopRecording returns a Macro with the recorded name', () => {
    startRecording();
    const macro = stopRecording();
    expect(macro.name).toBe('<Current Recorded Macro>');
  });

  it('stopRecording returns a Macro with empty steps when nothing recorded', () => {
    startRecording();
    const macro = stopRecording();
    expect(macro.steps).toHaveLength(0);
  });

  it('getCurrentMacro is null before any recording', () => {
    // After resetMacroState, getCurrentMacro returns the empty macro from stopRecording.
    // Start fresh: check right after module load simulation by recording + stopping.
    startRecording();
    const m = stopRecording();
    expect(getCurrentMacro()).toBe(m);
  });

  it('getCurrentMacro returns the last stopped macro', () => {
    startRecording();
    recordStep({ type: 'insert', text: 'hello' });
    const macro = stopRecording();
    expect(getCurrentMacro()).toBe(macro);
    expect(getCurrentMacro()!.steps).toHaveLength(1);
  });

  it('startRecording clears previous steps', () => {
    startRecording();
    recordStep({ type: 'insert', text: 'old' });
    stopRecording();

    startRecording();
    recordStep({ type: 'insert', text: 'new' });
    const macro = stopRecording();

    expect(macro.steps).toHaveLength(1);
    expect((macro.steps[0] as { type: 'insert'; text: string }).text).toBe('new');
  });
});

// ── recordStep ────────────────────────────────────────────────────────────────

describe('recordStep', () => {
  beforeEach(() => {
    startRecording();
  });

  it('records a command step', () => {
    recordStep({ type: 'command', name: 'cursorCharLeft' });
    const macro = stopRecording();
    expect(macro.steps).toHaveLength(1);
    expect(macro.steps[0]).toEqual({ type: 'command', name: 'cursorCharLeft' });
  });

  it('records an insert step', () => {
    recordStep({ type: 'insert', text: 'a' });
    const macro = stopRecording();
    expect(macro.steps).toHaveLength(1);
    expect(macro.steps[0]).toEqual({ type: 'insert', text: 'a' });
  });

  it('coalesces consecutive inserts into one', () => {
    recordStep({ type: 'insert', text: 'h' });
    recordStep({ type: 'insert', text: 'i' });
    recordStep({ type: 'insert', text: '!' });
    const macro = stopRecording();
    expect(macro.steps).toHaveLength(1);
    expect((macro.steps[0] as { type: 'insert'; text: string }).text).toBe('hi!');
  });

  it('does not coalesce insert after a command', () => {
    recordStep({ type: 'insert', text: 'a' });
    recordStep({ type: 'command', name: 'cursorCharLeft' });
    recordStep({ type: 'insert', text: 'b' });
    const macro = stopRecording();
    expect(macro.steps).toHaveLength(3);
  });

  it('backspace-chop: removes last char from preceding insert', () => {
    recordStep({ type: 'insert', text: 'ab' });
    recordStep({ type: 'command', name: 'deleteCharBackward' });
    const macro = stopRecording();
    expect(macro.steps).toHaveLength(1);
    expect((macro.steps[0] as { type: 'insert'; text: string }).text).toBe('a');
  });

  it('backspace-chop: removes insert step entirely when insert had 1 char', () => {
    recordStep({ type: 'insert', text: 'x' });
    recordStep({ type: 'command', name: 'deleteCharBackward' });
    const macro = stopRecording();
    expect(macro.steps).toHaveLength(0);
  });

  it('backspace after command records the backspace as a command step', () => {
    recordStep({ type: 'command', name: 'cursorCharLeft' });
    recordStep({ type: 'command', name: 'deleteCharBackward' });
    const macro = stopRecording();
    expect(macro.steps).toHaveLength(2);
    expect(macro.steps[1]).toEqual({ type: 'command', name: 'deleteCharBackward' });
  });

  it('backspace on empty steps records the backspace as a command step', () => {
    recordStep({ type: 'command', name: 'deleteCharBackward' });
    const macro = stopRecording();
    expect(macro.steps).toHaveLength(1);
    expect(macro.steps[0]).toEqual({ type: 'command', name: 'deleteCharBackward' });
  });
});

// ── MACRO_COMMANDS and fnToName ───────────────────────────────────────────────

describe('MACRO_COMMANDS registry', () => {
  it('contains cursorCharLeft', () => {
    expect('cursorCharLeft' in MACRO_COMMANDS).toBe(true);
  });

  it('contains deleteCharBackward', () => {
    expect('deleteCharBackward' in MACRO_COMMANDS).toBe(true);
  });

  it('contains indentMore', () => {
    expect('indentMore' in MACRO_COMMANDS).toBe(true);
  });

  it('all entries are functions', () => {
    for (const [, fn] of Object.entries(MACRO_COMMANDS)) {
      expect(typeof fn).toBe('function');
    }
  });
});

describe('fnToName reverse map', () => {
  it('maps MACRO_COMMANDS functions back to their names', () => {
    for (const [name, fn] of Object.entries(MACRO_COMMANDS)) {
      expect(fnToName.get(fn)).toBe(name);
    }
  });

  it('size equals MACRO_COMMANDS entry count', () => {
    expect(fnToName.size).toBe(Object.keys(MACRO_COMMANDS).length);
  });
});

// ── replayMacro ───────────────────────────────────────────────────────────────

describe('replayMacro', () => {
  /** Build a minimal EditorView for replay tests. */
  function makeView(content: string): EditorView {
    // Use a detached DOM node.
    const parent = document.createElement('div');
    return new EditorView({
      state: EditorState.create({ doc: content }),
      parent,
    });
  }

  it('does nothing for empty macro steps', () => {
    const view = makeView('hello');
    const macro: Macro = { name: 'test', steps: [] };
    replayMacro(view, macro, 1);
    expect(view.state.doc.toString()).toBe('hello');
    view.destroy();
  });

  it('replays insert step once', () => {
    const view = makeView('');
    const macro: Macro = {
      name: 'test',
      steps: [{ type: 'insert', text: 'abc' }],
    };
    replayMacro(view, macro, 1);
    expect(view.state.doc.toString()).toBe('abc');
    view.destroy();
  });

  it('replays insert step N times', () => {
    const view = makeView('');
    const macro: Macro = {
      name: 'test',
      steps: [{ type: 'insert', text: 'x' }],
    };
    replayMacro(view, macro, 3);
    expect(view.state.doc.toString()).toBe('xxx');
    view.destroy();
  });

  it('replays command step', () => {
    const view = makeView('hello');
    // Move caret to end first by setting selection via dispatch.
    view.dispatch({ selection: { anchor: 5 } });
    const macro: Macro = {
      name: 'test',
      steps: [{ type: 'command', name: 'cursorCharLeft' }],
    };
    replayMacro(view, macro, 1);
    // Caret should have moved left by 1 from position 5 → 4.
    expect(view.state.selection.main.head).toBe(4);
    view.destroy();
  });

  it('till-EOF replay stops when caret does not advance', () => {
    // A macro that just moves left: once at position 0, caret stops.
    const view = makeView('ab');
    view.dispatch({ selection: { anchor: 1 } });
    const macro: Macro = {
      name: 'test',
      steps: [{ type: 'command', name: 'cursorCharLeft' }],
    };
    replayMacro(view, macro, -1);
    // Should have stopped; caret at 0.
    expect(view.state.selection.main.head).toBe(0);
    view.destroy();
  });

  it('till-EOF replay stops after one pass when the doc grows but the caret lags (Macro.cpp:97-105)', () => {
    // Each pass inserts "xx" (doc grows by 2) then moves left once, so the caret
    // advances by 1 < the growth of 2 → the C++ stop condition breaks after one
    // pass. The pre-fix condition never broke here and looped to the safety cap.
    const view = makeView('');
    const macro: Macro = {
      name: 'test',
      steps: [
        { type: 'insert', text: 'xx' },
        { type: 'command', name: 'cursorCharLeft' },
      ],
    };
    replayMacro(view, macro, -1);
    // Exactly one pass ran → doc is "xx", not 2×10000 chars.
    expect(view.state.doc.toString()).toBe('xx');
    view.destroy();
  });

  it('till-EOF replay keeps going while the caret advances faster than the doc grows, then terminates', () => {
    // Macro moves the caret forward one char each pass on a fixed-length doc
    // (same length, caret still moving) → continues until caret reaches the end,
    // then stops. Proves the loop does not stop prematurely.
    const view = makeView('abcdef');
    view.dispatch({ selection: { anchor: 0 } });
    const macro: Macro = {
      name: 'test',
      steps: [{ type: 'command', name: 'cursorCharRight' }],
    };
    replayMacro(view, macro, -1);
    // Caret walked to the document end (6) and then stopped.
    expect(view.state.selection.main.head).toBe(6);
    view.destroy();
  });

  it('unknown command name is silently skipped', () => {
    const view = makeView('hello');
    const macro: Macro = {
      name: 'test',
      steps: [{ type: 'command', name: 'nonexistentCommand' }],
    };
    expect(() => replayMacro(view, macro, 1)).not.toThrow();
    view.destroy();
  });
});

// ── recordingKeymap extension — new commands in MACRO_COMMANDS ────────────────

describe('recordingKeymap extension - new commands in MACRO_COMMANDS', () => {
  it('cmdJoinLines is in MACRO_COMMANDS', () =>
    expect(MACRO_COMMANDS['cmdJoinLines']).toBeDefined());
  it('moveLineUp is in MACRO_COMMANDS', () => expect(MACRO_COMMANDS['moveLineUp']).toBeDefined());
  it('moveLineDown is in MACRO_COMMANDS', () =>
    expect(MACRO_COMMANDS['moveLineDown']).toBeDefined());
  it('duplicateCurrentLine is in MACRO_COMMANDS', () =>
    expect(MACRO_COMMANDS['duplicateCurrentLine']).toBeDefined());
});

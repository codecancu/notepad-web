// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * macro.ts — Macro record/replay engine (P5.1).
 *
 * Architecture:
 *  - Module-level singleton state (survives tab switches via view.setState).
 *  - Two recording channels:
 *    1. Recording keymap (Prec.highest): intercepts key presses for named commands.
 *    2. updateListener: captures input.type / input.paste transactions.
 *  - recordStep() coalesces consecutive inserts and handles backspace-chop.
 *  - replayMacro() supports fixed-count and till-EOF replay.
 *
 * Single-undo deviation: CM6 does not provide a native begin/endUndoAction that
 * spans mixed userEvent types across multiple dispatches. Multiple Ctrl+Z presses
 * may be needed to fully undo a replay. This deviation is documented here, as with
 * the html-autoclose undo deviation.
 *
 * Keymap transparency: the recording keymap is registered at Prec.highest and is
 * ALWAYS present, but each wrapped command returns false when NOT recording, so it
 * falls through to the normal keymaps (closeBrackets' Backspace→deleteBracketPair,
 * the completion popup's arrow navigation, defaultKeymap) — editing behaves exactly
 * as before when idle. While recording, the wrapper does intercept these keys to
 * capture the command, so during-recording it shadows closeBrackets' pair-delete on
 * Backspace and the completion popup's arrow-key navigation (an accepted, narrow
 * deviation active only while a macro is being recorded).
 */

import { EditorView, keymap } from '@codemirror/view';
import { Prec, type Extension } from '@codemirror/state';
import {
  cursorCharLeft,
  cursorCharRight,
  cursorGroupLeft,
  cursorGroupRight,
  cursorLineUp,
  cursorLineDown,
  cursorLineBoundaryBackward,
  cursorLineBoundaryForward,
  cursorDocStart,
  cursorDocEnd,
  cursorPageUp,
  cursorPageDown,
  selectCharLeft,
  selectCharRight,
  selectGroupLeft,
  selectGroupRight,
  selectLineUp,
  selectLineDown,
  selectLineBoundaryBackward,
  selectLineBoundaryForward,
  selectDocStart,
  selectDocEnd,
  selectPageUp,
  selectPageDown,
  deleteCharBackward,
  deleteCharForward,
  deleteGroupBackward,
  deleteGroupForward,
  deleteToLineEnd,
  insertTab,
  indentMore,
  indentLess,
} from '@codemirror/commands';
import {
  cmdSortLinesAsc,
  cmdSortLinesAscCI,
  cmdSortLinesByLengthAsc,
  cmdSortLinesDesc,
  cmdSortLinesDescCI,
  cmdSortLinesByLengthDesc,
  cmdReverseLineOrder,
  cmdRemoveEmptyLines,
  cmdRemoveDuplicateLines,
  cmdRemoveConsecutiveDuplicateLines,
  cmdJoinLines,
  cmdSplitLines,
  cmdToUpperCase,
  cmdToLowerCase,
  cmdBase64Encode,
  cmdBase64Decode,
  cmdUrlEncode,
  cmdUrlDecode,
  moveLineUp,
  moveLineDown,
  duplicateCurrentLine,
} from './edit-commands';

// ── Types ─────────────────────────────────────────────────────────────────────

export type MacroStep = { type: 'command'; name: string } | { type: 'insert'; text: string };

export interface Macro {
  name: string;
  steps: MacroStep[];
}

// ── Command registry ──────────────────────────────────────────────────────────

export const MACRO_COMMANDS: Record<string, (v: EditorView) => boolean> = {
  // Cursor movement
  cursorCharLeft,
  cursorCharRight,
  cursorGroupLeft,
  cursorGroupRight,
  cursorLineUp,
  cursorLineDown,
  cursorLineBoundaryBackward,
  cursorLineBoundaryForward,
  cursorDocStart,
  cursorDocEnd,
  cursorPageUp,
  cursorPageDown,
  // Selection extend
  selectCharLeft,
  selectCharRight,
  selectGroupLeft,
  selectGroupRight,
  selectLineUp,
  selectLineDown,
  selectLineBoundaryBackward,
  selectLineBoundaryForward,
  selectDocStart,
  selectDocEnd,
  selectPageUp,
  selectPageDown,
  // Delete
  deleteCharBackward,
  deleteCharForward,
  deleteGroupBackward,
  deleteGroupForward,
  deleteToLineEnd,
  // Indent
  insertTab,
  indentMore,
  indentLess,
  // Sort
  cmdSortLinesAsc,
  cmdSortLinesAscCI,
  cmdSortLinesByLengthAsc,
  cmdSortLinesDesc,
  cmdSortLinesDescCI,
  cmdSortLinesByLengthDesc,
  // Line operations
  cmdReverseLineOrder,
  cmdRemoveEmptyLines,
  cmdRemoveDuplicateLines,
  cmdRemoveConsecutiveDuplicateLines,
  cmdJoinLines,
  cmdSplitLines,
  // Case
  cmdToUpperCase,
  cmdToLowerCase,
  // Encoding
  cmdBase64Encode,
  cmdBase64Decode,
  cmdUrlEncode,
  cmdUrlDecode,
  // Move/duplicate
  moveLineUp,
  moveLineDown,
  duplicateCurrentLine,
};

/** Reverse map: function reference → stable name. For Channel-1 menu capture. */
export const fnToName: Map<(v: EditorView) => boolean, string> = new Map(
  Object.entries(MACRO_COMMANDS).map(([name, fn]) => [fn, name]),
);

// ── Module-level recording state ──────────────────────────────────────────────

let _recording = false;
let _steps: MacroStep[] = [];
let _currentMacro: Macro | null = null;

// ── Public API ────────────────────────────────────────────────────────────────

export function startRecording(): void {
  _recording = true;
  _steps = [];
}

export function stopRecording(): Macro {
  _recording = false;
  _currentMacro = { name: '<Current Recorded Macro>', steps: _steps };
  _steps = [];
  return _currentMacro;
}

export function isRecording(): boolean {
  return _recording;
}

export function getCurrentMacro(): Macro | null {
  return _currentMacro;
}

/** Step sink with coalescing (faithful to Macro::addMacroStep). */
export function recordStep(step: MacroStep): void {
  const last = _steps[_steps.length - 1];

  if (step.type === 'insert') {
    if (last?.type === 'insert') {
      // Consecutive inserts → merge.
      last.text += step.text;
      return;
    }
  } else if (step.type === 'command' && step.name === 'deleteCharBackward') {
    if (last?.type === 'insert') {
      // Backspace-chop: remove last char from insert.
      if (last.text.length > 1) {
        last.text = last.text.slice(0, -1);
      } else {
        // Insert had only 1 char → remove the insert step entirely.
        _steps.pop();
      }
      return;
    }
  }

  _steps.push(step);
}

// ── Replay ────────────────────────────────────────────────────────────────────

/**
 * Execute one macro step.
 */
function executeStep(view: EditorView, step: MacroStep): void {
  if (step.type === 'command') {
    MACRO_COMMANDS[step.name]?.(view);
  } else {
    view.dispatch(view.state.replaceSelection(step.text));
  }
}

/**
 * Execute all steps of a macro once.
 */
function executePass(view: EditorView, macro: Macro): void {
  for (const step of macro.steps) {
    executeStep(view, step);
  }
}

/**
 * Replay a macro `times` times. Pass times=-1 for till-EOF replay.
 * Faithful to Macro::replay / Macro::replayTillEndOfFile.
 */
export function replayMacro(view: EditorView, macro: Macro, times: number): void {
  if (macro.steps.length === 0) return;

  if (times > 0) {
    for (let i = 0; i < times; i++) {
      executePass(view, macro);
    }
  } else if (times === -1) {
    // Till-EOF: stop when a pass makes no forward progress.
    const SAFETY_LIMIT = 10000;
    for (let pass = 0; pass < SAFETY_LIMIT; pass++) {
      const prevLength = view.state.doc.length;
      const prevCaret = view.state.selection.main.head;

      executePass(view, macro);

      const newLength = view.state.doc.length;
      const newCaret = view.state.selection.main.head;

      // Faithful to Macro::replayTillEndOfFile (Macro.cpp:87-115):
      if (newLength < prevLength) continue; // doc shrank → keep going
      if (newLength > prevLength) {
        // doc grew → keep going only while the caret advances faster than growth.
        const deltaLength = newLength - prevLength;
        const deltaPos = newCaret - prevCaret;
        if (deltaPos > deltaLength) continue;
        break;
      }
      // same length → keep going only while the caret is still moving.
      if (newCaret !== prevCaret) continue;
      break;
    }
  }
}

// ── Recording keymap wrapper ──────────────────────────────────────────────────

/**
 * Wrap a command function so that when recording, it records the step first
 * then calls the original. When not recording, it's transparent.
 */
function recordingWrap(name: string, fn: (v: EditorView) => boolean): (v: EditorView) => boolean {
  return (view: EditorView): boolean => {
    // Transparent when idle: return false so this Prec.highest keymap falls
    // through to closeBrackets/completion/defaultKeymap and does not shadow their
    // special handling of these keys (e.g. Backspace→deleteBracketPair). We only
    // intercept — and thus capture — the command while a macro is recording.
    if (!_recording) return false;
    recordStep({ type: 'command', name });
    return fn(view);
  };
}

// Recording keymap: Prec.highest so it intercepts before the normal keymap.
// Only covers commands that have standard cross-platform key bindings.
const recordingKeymap = [
  { key: 'ArrowLeft', run: recordingWrap('cursorCharLeft', cursorCharLeft) },
  { key: 'ArrowRight', run: recordingWrap('cursorCharRight', cursorCharRight) },
  { key: 'Mod-ArrowLeft', run: recordingWrap('cursorGroupLeft', cursorGroupLeft) },
  { key: 'Mod-ArrowRight', run: recordingWrap('cursorGroupRight', cursorGroupRight) },
  { key: 'ArrowUp', run: recordingWrap('cursorLineUp', cursorLineUp) },
  { key: 'ArrowDown', run: recordingWrap('cursorLineDown', cursorLineDown) },
  { key: 'Home', run: recordingWrap('cursorLineBoundaryBackward', cursorLineBoundaryBackward) },
  { key: 'End', run: recordingWrap('cursorLineBoundaryForward', cursorLineBoundaryForward) },
  { key: 'Mod-Home', run: recordingWrap('cursorDocStart', cursorDocStart) },
  { key: 'Mod-End', run: recordingWrap('cursorDocEnd', cursorDocEnd) },
  { key: 'PageUp', run: recordingWrap('cursorPageUp', cursorPageUp) },
  { key: 'PageDown', run: recordingWrap('cursorPageDown', cursorPageDown) },
  { key: 'Backspace', run: recordingWrap('deleteCharBackward', deleteCharBackward) },
  { key: 'Delete', run: recordingWrap('deleteCharForward', deleteCharForward) },
  { key: 'Mod-Backspace', run: recordingWrap('deleteGroupBackward', deleteGroupBackward) },
  { key: 'Mod-Delete', run: recordingWrap('deleteGroupForward', deleteGroupForward) },
  { key: 'Mod-]', run: recordingWrap('indentMore', indentMore) },
  { key: 'Mod-[', run: recordingWrap('indentLess', indentLess) },
  // P5.2: close the custom-key capture gap — four editKeymapCompartment commands
  // that have stable function identity and are in MACRO_COMMANDS. When NOT
  // recording, recordingWrap returns false so they fall through to the
  // editKeymapCompartment binding (transparent — no shadow when idle).
  { key: 'Ctrl-j', run: recordingWrap('cmdJoinLines', cmdJoinLines) },
  { key: 'Ctrl-Shift-ArrowUp', run: recordingWrap('moveLineUp', moveLineUp) },
  { key: 'Ctrl-Shift-ArrowDown', run: recordingWrap('moveLineDown', moveLineDown) },
  { key: 'Alt-ArrowDown', run: recordingWrap('duplicateCurrentLine', duplicateCurrentLine) },
];

// ── updateListener for Channel 2 (input.type / input.paste) ──────────────────

function recordingUpdateListener(update: import('@codemirror/view').ViewUpdate): void {
  if (!_recording) return;
  if (!update.docChanged) return;

  const isInput = update.transactions.some(
    (tr) => tr.isUserEvent('input.type') || tr.isUserEvent('input.paste'),
  );
  if (!isInput) return;

  // Extract inserted text from the transaction changes.
  let inserted = '';
  for (const tr of update.transactions) {
    if (!tr.isUserEvent('input.type') && !tr.isUserEvent('input.paste')) continue;
    tr.changes.iterChanges((_fA, _tA, _fB, _tB, ins) => {
      inserted += ins.toString();
    });
  }

  if (inserted.length > 0) {
    recordStep({ type: 'insert', text: inserted });
  }
}

// ── Extension ─────────────────────────────────────────────────────────────────

export const macroRecorderExtension: Extension = [
  Prec.highest(keymap.of(recordingKeymap)),
  EditorView.updateListener.of(recordingUpdateListener),
];

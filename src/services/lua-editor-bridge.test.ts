// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect, beforeEach } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { history } from '@codemirror/commands';
import { createEditorBridge } from './lua-editor-bridge';

function makeView(doc = ''): EditorView {
  return new EditorView({
    state: EditorState.create({ doc, extensions: [history()] }),
  });
}

describe('lua-editor-bridge', () => {
  let view: EditorView;
  let bridge: ReturnType<typeof createEditorBridge>;

  beforeEach(() => {
    view = makeView('hello world\nline two\nline three');
    bridge = createEditorBridge(() => view);
  });

  it('getText() returns the full document', () => {
    expect(bridge.getText()).toBe('hello world\nline two\nline three');
  });

  it('setText() replaces the document', () => {
    bridge.setText('new content');
    expect(bridge.getText()).toBe('new content');
  });

  it('getLength() returns document length', () => {
    expect(bridge.getLength()).toBe(view.state.doc.length);
  });

  it('replaceSel() replaces selection', () => {
    bridge.gotoPos(0);
    // select "hello"
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    bridge.replaceSel('bye');
    expect(bridge.getText()).toContain('bye world');
  });

  it('getCurrentPos() returns caret offset', () => {
    bridge.gotoPos(5);
    expect(bridge.getCurrentPos()).toBe(5);
  });

  it('getSelText() returns the selected text', () => {
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    expect(bridge.getSelText()).toBe('hello');
  });

  it('redo() re-applies an undone change', () => {
    bridge.setText('changed');
    expect(bridge.getText()).toBe('changed');
    bridge.undo();
    expect(bridge.getText()).toBe('hello world\nline two\nline three');
    bridge.redo();
    expect(bridge.getText()).toBe('changed');
  });

  it('gotoPos() moves caret', () => {
    bridge.gotoPos(6);
    expect(bridge.getCurrentPos()).toBe(6);
  });

  it('gotoPos() clamps out-of-range values (does not throw)', () => {
    expect(() => bridge.gotoPos(-100)).not.toThrow();
    expect(() => bridge.gotoPos(99999)).not.toThrow();
    // After clamping, pos should be in range
    bridge.gotoPos(99999);
    expect(bridge.getCurrentPos()).toBeLessThanOrEqual(view.state.doc.length);
  });

  it('gotoLine() moves caret to start of line (1-based)', () => {
    bridge.gotoLine(2);
    expect(bridge.getCurrentLine()).toBe(2);
  });

  it('getCurrentLine() returns 1-based line number', () => {
    bridge.gotoPos(0);
    expect(bridge.getCurrentLine()).toBe(1);
  });

  it('getLineCount() returns total lines', () => {
    expect(bridge.getLineCount()).toBe(3);
  });

  it('getLine(n) returns text of line n (1-based, no EOL)', () => {
    expect(bridge.getLine(1)).toBe('hello world');
    expect(bridge.getLine(2)).toBe('line two');
  });

  it('insertText() inserts at position', () => {
    bridge.insertText(0, 'PREFIX_');
    expect(bridge.getText().startsWith('PREFIX_')).toBe(true);
  });

  it('deleteRange() deletes chars', () => {
    bridge.deleteRange(0, 5); // delete "hello"
    expect(bridge.getText().startsWith(' world')).toBe(true);
  });

  it('selectAll() selects all text', () => {
    bridge.selectAll();
    const sel = view.state.selection.main;
    expect(sel.from).toBe(0);
    expect(sel.to).toBe(view.state.doc.length);
  });

  it('undo() works after setText()', () => {
    bridge.setText('changed');
    bridge.undo();
    expect(bridge.getText()).toBe('hello world\nline two\nline three');
  });
});

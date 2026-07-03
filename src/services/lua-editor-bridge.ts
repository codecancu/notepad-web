// SPDX-License-Identifier: GPL-3.0-or-later
import { EditorView } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import { undo, redo, selectAll } from '@codemirror/commands';

export function createEditorBridge(getView: () => EditorView) {
  const clamp = (pos: number, max: number) => Math.max(0, Math.min(pos, max));

  return {
    getText(): string {
      return getView().state.doc.toString();
    },
    setText(s: string): void {
      const view = getView();
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: s },
      });
    },
    getLength(): number {
      return getView().state.doc.length;
    },
    getSelText(): string {
      const view = getView();
      const sel = view.state.selection.main;
      return view.state.doc.sliceString(sel.from, sel.to);
    },
    replaceSel(s: string): void {
      const view = getView();
      const sel = view.state.selection.main;
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: s },
        selection: EditorSelection.cursor(sel.from + s.length),
      });
    },
    getCurrentPos(): number {
      return getView().state.selection.main.head;
    },
    gotoPos(p: number): void {
      const view = getView();
      const pos = clamp(p, view.state.doc.length);
      view.dispatch({ selection: EditorSelection.cursor(pos) });
    },
    gotoLine(n: number): void {
      const view = getView();
      const doc = view.state.doc;
      const lineNo = Math.max(1, Math.min(n, doc.lines));
      const line = doc.line(lineNo);
      view.dispatch({ selection: EditorSelection.cursor(line.from) });
    },
    getCurrentLine(): number {
      const view = getView();
      const pos = view.state.selection.main.head;
      return view.state.doc.lineAt(pos).number;
    },
    getLineCount(): number {
      return getView().state.doc.lines;
    },
    getLine(n: number): string {
      const view = getView();
      const doc = view.state.doc;
      const lineNo = Math.max(1, Math.min(n, doc.lines));
      const line = doc.line(lineNo);
      // Return text without EOL chars
      return line.text;
    },
    insertText(pos: number, s: string): void {
      const view = getView();
      const p = clamp(pos, view.state.doc.length);
      view.dispatch({ changes: { from: p, to: p, insert: s } });
    },
    deleteRange(pos: number, len: number): void {
      const view = getView();
      const docLen = view.state.doc.length;
      const from = clamp(pos, docLen);
      const to = clamp(pos + len, docLen);
      if (from < to) {
        view.dispatch({ changes: { from, to } });
      }
    },
    selectAll(): void {
      selectAll(getView());
    },
    undo(): void {
      undo(getView());
    },
    redo(): void {
      redo(getView());
    },
  };
}

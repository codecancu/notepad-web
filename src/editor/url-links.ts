// SPDX-License-Identifier: GPL-3.0-or-later
import { ViewPlugin, DecorationSet, Decoration, EditorView, ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

export const URL_REGEX =
  /\bhttps?:\/\/[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)/g;

export function findUrlRanges(lineText: string): { from: number; to: number }[] {
  const results: { from: number; to: number }[] = [];
  // Clone the single source-of-truth pattern so each call gets its own
  // lastIndex (URL_REGEX is `g`-flagged; sharing it would bleed state).
  const regex = new RegExp(URL_REGEX.source, URL_REGEX.flags);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(lineText)) !== null) {
    const from = match.index;
    let to = match.index + match[0].length;
    // bracket-trim
    const prevChar = from > 0 ? lineText[from - 1] : undefined;
    const lastChar = lineText[to - 1];
    const pairs: [string, string][] = [
      ['(', ')'],
      ['[', ']'],
      ['<', '>'],
      ['"', '"'],
    ];
    for (const [open, close] of pairs) {
      if (prevChar === open && lastChar === close) {
        to--;
        break;
      }
    }
    results.push({ from, to });
  }
  return results;
}

const urlMark = Decoration.mark({ class: 'cm-url' });

const urlPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    ranges: { from: number; to: number }[] = [];
    constructor(view: EditorView) {
      this.decorations = Decoration.none;
      this.build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.geometryChanged) this.build(u.view);
    }
    build(view: EditorView) {
      const builder = new RangeSetBuilder<Decoration>();
      const newRanges: { from: number; to: number }[] = [];
      for (const { from, to } of view.visibleRanges) {
        let pos = from;
        while (pos <= to) {
          const line = view.state.doc.lineAt(pos);
          const lineRanges = findUrlRanges(line.text);
          for (const r of lineRanges) {
            const absFrom = line.from + r.from;
            const absTo = line.from + r.to;
            builder.add(absFrom, absTo, urlMark);
            newRanges.push({ from: absFrom, to: absTo });
          }
          pos = line.to + 1;
        }
      }
      this.decorations = builder.finish();
      this.ranges = newRanges;
    }
  },
  { decorations: (v) => v.decorations },
);

export const urlLinksExtension = [
  urlPlugin,
  EditorView.domEventHandlers({
    mousedown(event, view) {
      if (!(event.ctrlKey || event.metaKey)) return false;
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos == null) return false;
      const plugin = view.plugin(urlPlugin);
      const hit = plugin?.ranges.find((r) => pos >= r.from && pos <= r.to);
      if (!hit) return false;
      const url = view.state.sliceDoc(hit.from, hit.to);
      if (!/^https?:\/\//.test(url)) return false;
      window.open(url, '_blank', 'noopener,noreferrer');
      return true;
    },
  }),
  EditorView.baseTheme({
    '.cm-url': {
      textDecoration: 'underline',
      textDecorationColor: '#0000ff',
      textDecorationStyle: 'solid',
      cursor: 'pointer',
    },
    '.cm-url:hover': {
      textDecorationStyle: 'dotted',
    },
  }),
];

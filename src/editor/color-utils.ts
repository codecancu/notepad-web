// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * BGR → CSS colour conversion for Scintilla colour integers.
 *
 * init.lua's `rgb()` byte-swaps a human-readable 0xRRGGBB literal into
 * Scintilla's 0xBBGGRR (BGR) wire format, so `StyleDef.fgColor`/`bgColor` as
 * read from the Lua registry are in **BGR** order — NOT RGB. To produce a CSS
 * `#rrggbb` string we must swap the bytes back with `bgrToCss`.
 *
 * Conversion (self-inverse for 24-bit values, same swap as init.lua rgb()):
 *   #rrggbb where r = bgr & 0xFF, g = (bgr >> 8) & 0xFF, b = (bgr >> 16) & 0xFF
 *
 * Example: cpp.lua `rgb(0x0000FF)` (CSS blue) is stored as fgColor 0xFF0000;
 *   bgrToCss(0xFF0000) → "#0000ff".
 */

/**
 * Convert a Scintilla BGR integer to a CSS `#rrggbb` hex string.
 *
 * @param bgr - A 24-bit BGR integer (e.g. 0xFF0000 → blue in Scintilla).
 * @returns CSS colour string, e.g. `"#0000ff"`.
 */
export function bgrToCss(bgr: number): string {
  // Byte-swap: extract B, G, R from BGR; emit as RGB.
  const b = (bgr >> 16) & 0xff;
  const g = (bgr >> 8) & 0xff;
  const r = bgr & 0xff;
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

/**
 * Convert an already-RGB integer (as stored in LangDef.fgColor / bgColor after
 * the Lua side already byte-swapped it) to a CSS `#rrggbb` hex string.
 */
export function rgbIntToCss(rgb: number): string {
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

function hex2(n: number): string {
  return n.toString(16).padStart(2, '0');
}

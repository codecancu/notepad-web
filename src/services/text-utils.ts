// SPDX-License-Identifier: GPL-3.0-or-later
export function stripBom(text: string): { text: string; bom: boolean } {
  if (text.charCodeAt(0) === 0xfeff) return { text: text.slice(1), bom: true };
  return { text, bom: false };
}

/**
 * Detect the dominant EOL style in text.
 * CRLF wins if present; bare CR is Macintosh; else LF (or no newlines).
 */
export function detectEol(text: string): 'lf' | 'crlf' | 'cr' {
  if (text.includes('\r\n')) return 'crlf';
  if (text.includes('\r')) return 'cr';
  return 'lf';
}

/**
 * Normalise all line endings in text to the target EOL.
 * First strips ALL bare-CR and CRLF to canonical LF, then applies the target.
 */
export function applyEol(text: string, eol: 'lf' | 'crlf' | 'cr'): string {
  // Normalise: CRLF → LF, then bare CR → LF.
  const lf = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (eol === 'crlf') return lf.replace(/\n/g, '\r\n');
  if (eol === 'cr') return lf.replace(/\n/g, '\r');
  return lf;
}

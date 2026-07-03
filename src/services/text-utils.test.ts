// SPDX-License-Identifier: GPL-3.0-or-later
import { stripBom, detectEol, applyEol } from './text-utils';

describe('text-utils', () => {
  it('strips a UTF-8 BOM and reports it', () => {
    expect(stripBom('﻿hello')).toEqual({ text: 'hello', bom: true });
    expect(stripBom('hello')).toEqual({ text: 'hello', bom: false });
  });

  describe('detectEol', () => {
    it('detects CRLF', () => {
      expect(detectEol('a\r\nb')).toBe('crlf');
    });
    it('detects bare CR (Macintosh)', () => {
      expect(detectEol('a\rb')).toBe('cr');
    });
    it('detects LF', () => {
      expect(detectEol('a\nb')).toBe('lf');
    });
    it('defaults to lf when no newlines', () => {
      expect(detectEol('no newline')).toBe('lf');
    });
    it('CRLF wins over bare CR in mixed text', () => {
      // If \r\n is present, report crlf even if bare \r also present.
      expect(detectEol('a\r\nb\rc')).toBe('crlf');
    });
  });

  describe('applyEol', () => {
    it('converts LF to CRLF', () => {
      expect(applyEol('a\nb\nc', 'crlf')).toBe('a\r\nb\r\nc');
    });
    it('converts CRLF to LF', () => {
      expect(applyEol('a\r\nb', 'lf')).toBe('a\nb');
    });
    it('converts bare CR to LF', () => {
      expect(applyEol('a\rb', 'lf')).toBe('a\nb');
    });
    it('converts LF to CR (Macintosh)', () => {
      expect(applyEol('a\nb', 'cr')).toBe('a\rb');
    });
    it('converts CRLF to CR (Macintosh)', () => {
      expect(applyEol('a\r\nb', 'cr')).toBe('a\rb');
    });
    it('normalizes mixed EOLs to target', () => {
      // Mixed CRLF + LF + bare CR → all become \r\n.
      expect(applyEol('a\r\nb\nc\rd', 'crlf')).toBe('a\r\nb\r\nc\r\nd');
    });
  });
});

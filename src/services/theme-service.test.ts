// SPDX-License-Identifier: GPL-3.0-or-later
import { ThemeService } from './theme-service';

describe('ThemeService', () => {
  it('maps system to OS preference', () => {
    expect(
      new ThemeService(
        () => 'system',
        () => true,
      ).effective(),
    ).toBe('dark');
    expect(
      new ThemeService(
        () => 'system',
        () => false,
      ).effective(),
    ).toBe('light');
  });
  it('honors explicit choice', () => {
    expect(
      new ThemeService(
        () => 'light',
        () => true,
      ).effective(),
    ).toBe('light');
  });
});

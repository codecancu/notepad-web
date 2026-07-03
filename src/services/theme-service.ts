// SPDX-License-Identifier: GPL-3.0-or-later
export class ThemeService {
  constructor(
    private getPref: () => 'light' | 'dark' | 'system',
    private matchDark: () => boolean = () =>
      typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches,
  ) {}

  effective(): 'light' | 'dark' {
    const pref = this.getPref();
    if (pref === 'system') return this.matchDark() ? 'dark' : 'light';
    return pref;
  }
}

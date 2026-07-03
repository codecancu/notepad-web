// SPDX-License-Identifier: GPL-3.0-or-later
import { SettingsService, DEFAULT_SETTINGS, type KeyValueStore } from './settings-service';

function memStore(): KeyValueStore {
  const m = new Map<string, unknown>();
  return { get: async (k) => m.get(k) as never, set: async (k, v) => void m.set(k, v) };
}

describe('SettingsService', () => {
  it('returns defaults when nothing stored', async () => {
    const svc = new SettingsService(memStore());
    expect(await svc.load()).toEqual(DEFAULT_SETTINGS);
  });
  it('merges and persists updates, notifies subscribers', async () => {
    const svc = new SettingsService(memStore());
    let seen: number | undefined;
    svc.subscribe((s) => (seen = s.fontSize));
    const next = await svc.update({ fontSize: 18 });
    expect(next.fontSize).toBe(18);
    expect(next.tabSize).toBe(DEFAULT_SETTINGS.tabSize);
    expect(seen).toBe(18);
  });
});

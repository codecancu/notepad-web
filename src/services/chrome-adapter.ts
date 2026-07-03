// SPDX-License-Identifier: GPL-3.0-or-later
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
}

export function createStorage(): KeyValueStore {
  const area = typeof chrome !== 'undefined' && chrome.storage?.local ? chrome.storage.local : null;
  if (area) {
    return {
      get: async <T>(key: string) => (await area.get(key))[key] as T | undefined,
      set: async <T>(key: string, value: T) => area.set({ [key]: value }),
    };
  }
  return {
    get: async <T>(key: string) => {
      const raw = localStorage.getItem(key);
      return raw == null ? undefined : (JSON.parse(raw) as T);
    },
    set: async <T>(key: string, value: T) => localStorage.setItem(key, JSON.stringify(value)),
  };
}

// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { RecentFilesService } from './recent-files-service';

function makeService(): RecentFilesService {
  return new RecentFilesService(new IDBFactory());
}

describe('RecentFilesService', () => {
  describe('list', () => {
    it('returns empty array when no files recorded', async () => {
      const svc = makeService();
      expect(await svc.list()).toEqual([]);
    });
  });

  describe('add', () => {
    it('adds a single entry', async () => {
      const svc = makeService();
      await svc.add('foo.txt');
      const list = await svc.list();
      expect(list).toHaveLength(1);
      expect(list[0]!.name).toBe('foo.txt');
    });

    it('prepends the newest entry (most-recent first)', async () => {
      const svc = makeService();
      await svc.add('first.txt');
      await svc.add('second.txt');
      const list = await svc.list();
      expect(list[0]!.name).toBe('second.txt');
      expect(list[1]!.name).toBe('first.txt');
    });

    it('deduplicates: moves existing name to front', async () => {
      const svc = makeService();
      await svc.add('a.txt');
      await svc.add('b.txt');
      await svc.add('c.txt');
      // Re-add 'a.txt' — it should move to the front.
      await svc.add('a.txt');
      const list = await svc.list();
      expect(list[0]!.name).toBe('a.txt');
      // 'a.txt' appears only once.
      expect(list.filter((e) => e.name === 'a.txt')).toHaveLength(1);
      expect(list).toHaveLength(3);
    });

    it('caps the list at 20 entries', async () => {
      const svc = makeService();
      for (let i = 0; i < 25; i++) {
        await svc.add(`file${i}.txt`);
      }
      const list = await svc.list();
      expect(list).toHaveLength(20);
      // Most-recent (file24) is at the front.
      expect(list[0]!.name).toBe('file24.txt');
      // Oldest (file0..file4) are dropped.
      expect(list.find((e) => e.name === 'file0.txt')).toBeUndefined();
    });

    it('adding the same name twice only keeps it once (dedup + move-to-front)', async () => {
      const svc = makeService();
      await svc.add('same.txt');
      await svc.add('other.txt');
      await svc.add('same.txt');
      const list = await svc.list();
      expect(list.filter((e) => e.name === 'same.txt')).toHaveLength(1);
      expect(list[0]!.name).toBe('same.txt');
    });
  });

  describe('clear', () => {
    it('clears the list', async () => {
      const svc = makeService();
      await svc.add('a.txt');
      await svc.add('b.txt');
      await svc.clear();
      expect(await svc.list()).toEqual([]);
    });

    it('clear on empty list is a no-op', async () => {
      const svc = makeService();
      await expect(svc.clear()).resolves.toBeUndefined();
      expect(await svc.list()).toEqual([]);
    });
  });
});

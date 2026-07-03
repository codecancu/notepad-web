// SPDX-License-Identifier: GPL-3.0-or-later
import 'fake-indexeddb/auto';
import { DocumentStore } from '../services/document-store';
import { PersistenceService } from '../services/persistence-service';
import { SessionSync } from './session-sync';

describe('SessionSync', () => {
  it('persists current docs after changes', async () => {
    const store = new DocumentStore();
    const persistence = new PersistenceService();
    // synchronous scheduler for deterministic test
    const sync = new SessionSync(store, persistence, 0, (fn) => fn());
    sync.attach();
    const doc = store.create({ name: 'a.ts', content: 'hi' });
    await sync.flush();
    const loaded = await persistence.loadSession();
    expect(loaded?.docs.find((d) => d.id === doc.id)?.content).toBe('hi');
  });
});

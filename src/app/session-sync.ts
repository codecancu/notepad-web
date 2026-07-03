// SPDX-License-Identifier: GPL-3.0-or-later
import type { DocumentStore } from '../services/document-store';
import type { PersistenceService } from '../services/persistence-service';

export class SessionSync {
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(
    private store: DocumentStore,
    private persistence: PersistenceService,
    private debounceMs = 500,
    private scheduler: (fn: () => void, ms: number) => void = (fn, ms) =>
      void (this.timer = setTimeout(fn, ms)),
  ) {}

  attach(): void {
    this.store.subscribe(() => this.scheduleSave());
  }

  private scheduleSave(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.scheduler(() => void this.save(), this.debounceMs);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.save();
  }

  private async save(): Promise<void> {
    await this.persistence.saveSession({
      docs: this.store.list(),
      activeId: this.store.activeId,
    });
  }
}

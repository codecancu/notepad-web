// SPDX-License-Identifier: GPL-3.0-or-later
import { searchResultsStore } from './search-results-store';
import type { SearchRun } from './search-engine';

const makeRun = (term: string, totalHits = 0): SearchRun => ({
  term,
  options: { matchCase: false, wholeWord: false, regexp: false },
  totalHits,
  fileCount: 0,
  files: [],
});

describe('searchResultsStore', () => {
  // Reset store state between tests
  beforeEach(() => {
    searchResultsStore.clear();
  });

  it('starts with empty runs()', () => {
    expect(searchResultsStore.runs()).toHaveLength(0);
  });

  it('addRun appends a run and runs() returns it', () => {
    const run = makeRun('hello', 3);
    searchResultsStore.addRun(run);
    expect(searchResultsStore.runs()).toHaveLength(1);
    expect(searchResultsStore.runs()[0]).toBe(run);
  });

  it('addRun appends multiple runs in order (most recent last)', () => {
    searchResultsStore.addRun(makeRun('first'));
    searchResultsStore.addRun(makeRun('second'));
    searchResultsStore.addRun(makeRun('third'));
    const runs = searchResultsStore.runs();
    expect(runs).toHaveLength(3);
    expect(runs[0]!.term).toBe('first');
    expect(runs[1]!.term).toBe('second');
    expect(runs[2]!.term).toBe('third');
  });

  it('clear() empties the runs list', () => {
    searchResultsStore.addRun(makeRun('test'));
    searchResultsStore.clear();
    expect(searchResultsStore.runs()).toHaveLength(0);
  });

  it('subscribe fires when addRun is called', () => {
    let calls = 0;
    const unsub = searchResultsStore.subscribe(() => calls++);
    searchResultsStore.addRun(makeRun('foo'));
    expect(calls).toBe(1);
    unsub();
  });

  it('subscribe fires when clear is called', () => {
    searchResultsStore.addRun(makeRun('bar'));
    let calls = 0;
    const unsub = searchResultsStore.subscribe(() => calls++);
    searchResultsStore.clear();
    expect(calls).toBe(1);
    unsub();
  });

  it('unsubscribe stops notifications', () => {
    let calls = 0;
    const unsub = searchResultsStore.subscribe(() => calls++);
    unsub();
    searchResultsStore.addRun(makeRun('ignored'));
    expect(calls).toBe(0);
  });

  it('multiple subscribers are all notified', () => {
    let calls1 = 0;
    let calls2 = 0;
    const unsub1 = searchResultsStore.subscribe(() => calls1++);
    const unsub2 = searchResultsStore.subscribe(() => calls2++);
    searchResultsStore.addRun(makeRun('multi'));
    expect(calls1).toBe(1);
    expect(calls2).toBe(1);
    unsub1();
    unsub2();
  });
});

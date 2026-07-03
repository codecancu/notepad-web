// SPDX-License-Identifier: GPL-3.0-or-later
import { classifySize, PERF_WARN_BYTES, PERF_MAX_BYTES } from './perf-guard';

describe('perf-guard', () => {
  it('classifies file sizes against the envelope', () => {
    expect(classifySize(1000)).toBe('ok');
    expect(classifySize(PERF_WARN_BYTES + 1)).toBe('warn');
    expect(classifySize(PERF_MAX_BYTES + 1)).toBe('reject');
  });
});

// SPDX-License-Identifier: GPL-3.0-or-later
export const PERF_WARN_BYTES = 25_000_000;
export const PERF_MAX_BYTES = 100_000_000;

export function classifySize(bytes: number): 'ok' | 'warn' | 'reject' {
  if (bytes > PERF_MAX_BYTES) return 'reject';
  if (bytes > PERF_WARN_BYTES) return 'warn';
  return 'ok';
}

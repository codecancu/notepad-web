// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checkManifestCompliance, checkNoRemoteCode } from './package.mjs';

// ---------------------------------------------------------------------------
// checkManifestCompliance — existing 5 tests (unchanged)
// ---------------------------------------------------------------------------

test('rejects non-minimal permissions', () => {
  const bad = { manifest_version: 3, permissions: ['storage', 'tabs'] };
  assert.throws(() => checkManifestCompliance(bad), /permissions/);
});

test('accepts a compliant manifest', () => {
  const ok = {
    manifest_version: 3,
    permissions: ['storage'],
    content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" },
  };
  assert.doesNotThrow(() => checkManifestCompliance(ok));
});

test('rejects manifest_version: 2', () => {
  const bad = { manifest_version: 2, permissions: ['storage'] };
  assert.throws(() => checkManifestCompliance(bad), /manifest_version/);
});

test('rejects manifest with host_permissions array present', () => {
  const bad = {
    manifest_version: 3,
    permissions: ['storage'],
    host_permissions: ['https://example.com/*'],
  };
  assert.throws(() => checkManifestCompliance(bad), /host_permissions/);
});

test('rejects CSP extension_pages containing a remote https:// URL', () => {
  const bad = {
    manifest_version: 3,
    permissions: ['storage'],
    content_security_policy: {
      extension_pages: "script-src 'self' https://cdn.example.com; object-src 'self'",
    },
  };
  assert.throws(() => checkManifestCompliance(bad), /remote/i);
});

// ---------------------------------------------------------------------------
// checkNoRemoteCode — new tests
// ---------------------------------------------------------------------------

/** Helper: create a temp dir with a fake bundle, run the check, then clean up. */
function withFakeBundle(content, fn) {
  const dir = mkdtempSync(join(resolve('..'), 'pkg-test-'));
  try {
    writeFileSync(join(dir, 'editor.js'), content, 'utf8');
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('checkNoRemoteCode passes for a clean bundle', () => {
  withFakeBundle('var x = chrome.runtime.getURL("glue.wasm");', (dir) => {
    assert.doesNotThrow(() => checkNoRemoteCode(dir));
  });
});

test('checkNoRemoteCode throws when bundle contains unpkg.com URL', () => {
  const cdn = 'https://unpkg.com/wasmoon@1.16.0/dist/glue.wasm';
  withFakeBundle(`var uri = "${cdn}";`, (dir) => {
    assert.throws(() => checkNoRemoteCode(dir), /Remote code.*CDN URL/is);
  });
});

test('checkNoRemoteCode throws when bundle contains jsdelivr CDN URL', () => {
  const cdn = 'https://cdn.jsdelivr.net/npm/some-lib@1.0.0/dist/index.js';
  withFakeBundle(`var uri = "${cdn}";`, (dir) => {
    assert.throws(() => checkNoRemoteCode(dir), /jsdelivr/i);
  });
});

test('checkNoRemoteCode throws when bundle contains a remote .wasm URL', () => {
  const cdn = 'https://example.com/assets/runtime.wasm';
  withFakeBundle(`customWasmUri = "${cdn}";`, (dir) => {
    assert.throws(() => checkNoRemoteCode(dir), /remote/i);
  });
});

test('checkNoRemoteCode throws when bundle contains cdnjs URL', () => {
  const cdn = 'https://cdnjs.cloudflare.com/ajax/libs/lib/1.0/lib.min.js';
  withFakeBundle(`var src = "${cdn}";`, (dir) => {
    assert.throws(() => checkNoRemoteCode(dir), /remote/i);
  });
});

test('checkNoRemoteCode ignores non-JS files in distDir', () => {
  const dir = mkdtempSync(join(resolve('..'), 'pkg-test-'));
  try {
    // A .wasm binary file — not a .js, should not be scanned
    writeFileSync(join(dir, 'glue.wasm'), Buffer.from([0x00, 0x61, 0x73, 0x6d]));
    // Clean JS bundle
    writeFileSync(join(dir, 'editor.js'), 'var x = 1;', 'utf8');
    assert.doesNotThrow(() => checkNoRemoteCode(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

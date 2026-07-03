// SPDX-License-Identifier: GPL-3.0-or-later
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

export function checkManifestCompliance(m) {
  if (m.manifest_version !== 3) throw new Error('manifest_version must be 3');
  const allowed = new Set(['storage', 'contextMenus', 'activeTab', 'scripting']);
  for (const p of m.permissions ?? []) {
    if (!allowed.has(p)) throw new Error(`disallowed permissions: ${p}`);
  }
  if (m.host_permissions?.length) throw new Error('no host_permissions allowed');
  const csp = m.content_security_policy?.extension_pages ?? '';
  if (!csp.includes("script-src 'self'")) throw new Error('CSP must restrict script-src to self');
  if (csp.includes('http://') || csp.includes('https://')) throw new Error('no remote code in CSP');
  return true;
}

/**
 * Scan all *.js files in distDir for CDN/remote URL literals that Web Store
 * scanners would flag.  Throws if any are found.
 *
 * Flagged patterns (case-insensitive):
 *   - unpkg.com
 *   - cdn.jsdelivr.net  / jsdelivr.com
 *   - cdnjs.cloudflare.com
 *   - cdn.skypack.dev
 *   - Any https?:// URL ending in .wasm or .js  (potential remote code load)
 *
 * @param {string} distDir  absolute path to the dist directory
 */
export function checkNoRemoteCode(distDir) {
  // Patterns that indicate a remote CDN or remote script/wasm load.
  const forbidden = [
    /unpkg\.com/i,
    /cdn\.jsdelivr\.net/i,
    /jsdelivr\.com\/npm/i,
    /cdnjs\.cloudflare\.com/i,
    /cdn\.skypack\.dev/i,
    /https?:\/\/[^\s'"]+\.wasm/i,
    /https?:\/\/[^\s'"]+\.js["']/i,
  ];

  const jsFiles = readdirSync(distDir).filter((f) => f.endsWith('.js'));
  const violations = [];

  for (const file of jsFiles) {
    const content = readFileSync(join(distDir, file), 'utf8');
    for (const pattern of forbidden) {
      if (pattern.test(content)) {
        violations.push(`${file}: matched ${pattern}`);
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `Remote code / CDN URL found in dist bundles:\n${violations.join('\n')}\n` +
        'All remote URL literals must be removed before packaging.',
    );
  }
  return true;
}

function main() {
  const distDir = resolve('dist');
  const distManifestPath = join(distDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(distManifestPath, 'utf8'));

  console.log('Checking manifest compliance...');
  checkManifestCompliance(manifest);
  console.log('Manifest compliance: PASS');

  console.log('Checking dist bundles for remote code / CDN URLs...');
  checkNoRemoteCode(distDir);
  console.log('No remote code in bundles: PASS');

  const out = `notepad-web-v${manifest.version}.zip`;
  execFileSync('zip', ['-r', `../${out}`, '.'], { cwd: 'dist', stdio: 'inherit' });
  console.log(`Packaged ${out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

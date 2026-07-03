// SPDX-License-Identifier: GPL-3.0-or-later
// Regenerates src/lua-data/lua-sources.ts from the .lua files in src/lua-data/.
// Usage: node scripts/gen-lua-sources.mjs
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const langDir = 'src/lua-data/languages';
const initPath = 'src/lua-data/init.lua';

const initSrc = readFileSync(initPath, 'utf8');
const langFiles = readdirSync(langDir)
  .filter((f) => f.endsWith('.lua'))
  .sort();

function escapeForTemplateLiteral(s) {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

let out = `// SPDX-License-Identifier: GPL-3.0-or-later
// AUTO-GENERATED — do not edit by hand. Run: node scripts/gen-lua-sources.mjs
// Sources: src/lua-data/init.lua + src/lua-data/languages/*.lua (NotepadNext GPL-3.0-or-later)

/** Map from module name (without .lua) to Lua source text. */
export const LUA_SOURCES: Record<string, string> = {\n`;

out += `  init: \`${escapeForTemplateLiteral(initSrc)}\`,\n`;

for (const f of langFiles) {
  const modName = f.replace(/\.lua$/, '');
  const src = readFileSync(join(langDir, f), 'utf8');
  out += `  ${JSON.stringify(modName)}: \`${escapeForTemplateLiteral(src)}\`,\n`;
}

out += `};\n`;

writeFileSync('src/lua-data/lua-sources.ts', out);
console.log(`Generated src/lua-data/lua-sources.ts with ${langFiles.length + 1} entries`);

/**
 * Packs dist/ into linkvault-extension-v<version>.zip for GitHub Releases.
 * Users unzip it and use "Load unpacked" in chrome://extensions.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = join(root, 'dist');
const { version } = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));

const files = {};
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files[relative(dist, path).split('\\').join('/')] = readFileSync(path);
  }
};
walk(dist);

const out = join(root, `linkvault-extension-v${version}.zip`);
writeFileSync(out, zipSync(files, { level: 9 }));
console.log(`Packed ${Object.keys(files).length} files into ${relative(process.cwd(), out)}`);

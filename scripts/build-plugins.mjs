// Builds every plugin in src/plugins/<id> into plugins/<id>: its manifest.json and one bundled
// server.mjs. The built folders are committed, so a plugin's GitHub folder is also its update source.

import { build } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src', 'plugins');
for (const id of readdirSync(src)) {
    const dir = path.join(src, id);
    if (!existsSync(path.join(dir, 'manifest.json'))) continue;
    const out = path.join(root, 'plugins', id);
    mkdirSync(out, { recursive: true });
    await build({
        entryPoints: [path.join(dir, 'index.ts')],
        outfile: path.join(out, 'server.mjs'),
        bundle: true,
        platform: 'node',
        format: 'esm',
        target: 'node20',
        legalComments: 'inline',
        logLevel: 'warning',
    });
    copyFileSync(path.join(dir, 'manifest.json'), path.join(out, 'manifest.json'));
    console.log(`plugins/${id}`);
}

// Builds the libraries that card interfaces expect to find as globals (酒馆助手 provides the same
// ones in its frames): Vue, zod (`z`) and YAML. The output is committed, like jQuery and lodash, so
// building Hearth needs no network. Run it after updating vue, zod or yaml in package.json:
//
//   node scripts/build-vendor.mjs
//
// Outputs:
//   src/web/public/vendor/{vue,zod,yaml}.min.js   loaded by message frames
//   src/plugins/tavern-helper/vendor/zod.json      zod's source as a JSON string, for the sandbox
//                                                  that checks MVU variables against a card's schema

import { build } from 'esbuild';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'src', 'web', 'public', 'vendor');
const plugin = path.join(root, 'src', 'plugins', 'tavern-helper', 'vendor');
mkdirSync(web, { recursive: true });
mkdirSync(plugin, { recursive: true });

copyFileSync(path.join(root, 'node_modules', 'vue', 'dist', 'vue.global.prod.js'), path.join(web, 'vue.min.js'));

/** Bundles a package into a script that defines one global variable. */
async function iife(pkg, globalName) {
    const out = await build({
        stdin: { contents: `export * from '${pkg}';`, resolveDir: root, loader: 'js' },
        bundle: true,
        format: 'iife',
        globalName,
        minify: true,
        target: 'es2020',
        platform: 'browser',
        legalComments: 'none',
        write: false,
        logLevel: 'warning',
    });
    return out.outputFiles[0].text;
}

const zod = await iife('zod', 'z');
writeFileSync(path.join(web, 'zod.min.js'), zod);
writeFileSync(path.join(plugin, 'zod.json'), JSON.stringify(zod));
writeFileSync(path.join(web, 'yaml.min.js'), await iife('yaml', 'YAML'));

for (const file of ['vue.min.js', 'zod.min.js', 'yaml.min.js']) console.log(`src/web/public/vendor/${file}`);
console.log('src/plugins/tavern-helper/vendor/zod.json');

// Builds the libraries card interfaces use. Globals that 酒馆助手 provides in its frames: Vue, zod
// (`z`) and YAML. Libraries cards load from a CDN (vue-router, pinia, klona…) get local copies
// that card frames use instead (src/web/card-libs.ts). Only libraries under open-source licenses are
// bundled; others (e.g. GSAP) stay on the CDN the card names. The output is committed, like jQuery and
// lodash, so building Hearth needs no network. Run it after updating one of them in package.json:
//
//   node scripts/build-vendor.mjs
//
// Outputs:
//   src/web/public/vendor/{vue,zod,yaml}.min.js   loaded by card frames
//   src/web/public/vendor/vue-router.min.js        for <script src="…vue-router.global…">
//   src/web/public/vendor/esm/*.js                 ES modules for `import … from '…/+esm'`; vue.js
//                                                  re-exports the frame's global Vue, so a card
//                                                  never ends up with two copies of Vue
//   src/plugins/tavern-helper/vendor/{zod,lodash}.json  zod's and lodash's source as JSON strings, for
//                                                  the sandbox that checks MVU variables against a
//                                                  card's schema

import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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

/** Bundles a package as an ES module; `vue` imports go to the frame's global Vue (esm/vue.js). */
async function esm(contents) {
    const out = await build({
        stdin: { contents, resolveDir: root, loader: 'js' },
        bundle: true,
        format: 'esm',
        minify: true,
        target: 'es2020',
        platform: 'browser',
        legalComments: 'none',
        define: { 'process.env.NODE_ENV': '"production"', __VUE_PROD_DEVTOOLS__: 'false' },
        plugins: [{ name: 'global-vue', setup(b) { b.onResolve({ filter: /^vue$/ }, () => ({ path: './vue.js', external: true })); } }],
        write: false,
        logLevel: 'warning',
    });
    return out.outputFiles[0].text;
}

const zod = await iife('zod', 'z');
writeFileSync(path.join(web, 'zod.min.js'), zod);
writeFileSync(path.join(plugin, 'zod.json'), JSON.stringify(zod));
writeFileSync(path.join(plugin, 'lodash.json'), JSON.stringify(readFileSync(path.join(root, 'node_modules', 'lodash', 'lodash.min.js'), 'utf8')));
writeFileSync(path.join(web, 'yaml.min.js'), await iife('yaml', 'YAML'));
copyFileSync(path.join(root, 'node_modules', 'vue-router', 'dist', 'vue-router.global.prod.js'), path.join(web, 'vue-router.min.js'));

const esmDir = path.join(web, 'esm');
mkdirSync(esmDir, { recursive: true });
const vueNames = Object.keys(createRequire(import.meta.url)(path.join(root, 'node_modules', 'vue'))).filter(n => /^[A-Za-z_$][\w$]*$/.test(n) && n !== 'default');
writeFileSync(path.join(esmDir, 'vue.js'), `const V = window.Vue;\nexport default V;\nexport const { ${vueNames.join(', ')} } = V;\n`);
writeFileSync(path.join(esmDir, 'pinia.js'), await esm(`export * from 'pinia';`));
writeFileSync(path.join(esmDir, 'vue-router.js'), await esm(`export * from 'vue-router';`));
writeFileSync(path.join(esmDir, 'klona.js'), await esm(`export * from 'klona';`));
writeFileSync(path.join(esmDir, 'zod.js'), `const z = window.z;\nexport default z;\nexport { z };\n`);

for (const file of ['vue.min.js', 'zod.min.js', 'yaml.min.js', 'vue-router.min.js']) console.log(`src/web/public/vendor/${file}`);
console.log('src/web/public/vendor/esm/{vue,pinia,vue-router,klona,zod}.js');
console.log('src/plugins/tavern-helper/vendor/{zod,lodash}.json');

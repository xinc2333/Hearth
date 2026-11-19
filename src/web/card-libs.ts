// Libraries that cards load from public CDNs (jsDelivr, unpkg, esm.sh) come from Hearth's own copies
// instead: they work without the internet and behind slow networks, the version does not change
// under the card, and every frame shares one Vue (an ES-module Vue re-exports the frame's global
// one, so pinia and the card's components see the same instance). Classic <script src> tags are
// pointed at the copy; ES-module imports go through an import map. Anything else a card loads from
// the internet is left as it is, inside its sandboxed frame.

const CDN_URL = /https?:\/\/(?:(?:testingcf|cdn|fastly|gcore)\.jsdelivr\.net\/npm\/|unpkg\.com\/|esm\.sh\/)(?:@[^@/'"`\s]+\/)?[^@/'"`\s]+(?:@[^/'"`\s]+)?(?:\/[^'"`\s)]*)?/gi;
const PARTS = /^https?:\/\/([^/]+)\/(?:npm\/)?(@[^@/]+\/[^@/]+|[^@/]+)(?:@[^/]+)?(\/.*)?$/i;

/** ES-module builds, by package. */
const MODULES: Record<string, string> = {
    vue: 'esm/vue.js',
    pinia: 'esm/pinia.js',
    'vue-router': 'esm/vue-router.js',
    klona: 'esm/klona.js',
    zod: 'esm/zod.js',
};

/** Classic builds that define a global, by package. */
const GLOBALS: Record<string, string> = {
    vue: 'vue.min.js',
    'vue-router': 'vue-router.min.js',
    jquery: 'jquery.min.js',
    lodash: 'lodash.min.js',
    yaml: 'yaml.min.js',
};

/** The local copy of a CDN library URL, as a path under /vendor/, or null. */
export function localLibrary(url: string): { path: string; module: boolean } | null {
    const m = url.trim().match(PARTS);
    if (!m) return null;
    const [, host, pkg, rest = ''] = m;
    const name = pkg.toLowerCase();
    const module = /^esm\.sh$/i.test(host) || /(?:^|\/)\+esm$|\.mjs$|esm-browser|\.esm\./i.test(rest);
    if (module) return MODULES[name] ? { path: MODULES[name], module } : null;
    // A bare package URL or a global build (vue.global.prod.js, jquery.min.js…).
    if (GLOBALS[name] && (!rest || rest === '/' || /\.js$/i.test(rest)) && !/\.(cjs|esm-bundler)\b/i.test(rest)) return { path: GLOBALS[name], module };
    return null;
}

/** CDN library URLs mentioned anywhere in the sources (markup, scripts, dynamic imports). */
export function libraryUrls(sources: string[]): string[] {
    const found = new Set<string>();
    for (const source of sources) {
        for (const m of source.matchAll(CDN_URL)) found.add(m[0].replace(/[.,;]+$/, ''));
    }
    return [...found];
}

/** An import map sending the module URLs found in `sources` to Hearth's copies ('' when none). */
export function importMap(sources: string[], origin: string): string {
    const imports: Record<string, string> = {};
    for (const url of libraryUrls(sources)) {
        const lib = localLibrary(url);
        if (lib?.module) imports[url] = `${origin}/vendor/${lib.path}`;
    }
    if (!Object.keys(imports).length) return '';
    return `<script type="importmap">${JSON.stringify({ imports }).replace(/</g, '\\u003c')}</script>`;
}

/** Points <script src="…"> tags that load a known library at Hearth's copy (import maps do not apply to src). */
export function localScripts(html: string, origin: string): string {
    return html.replace(/<script\b[^>]*>/gi, tag => tag.replace(/(\bsrc\s*=\s*)(["'])([^"']+)\2/i, (all, head: string, quote: string, url: string) => {
        const lib = localLibrary(url);
        const module = /\btype\s*=\s*["']?module\b/i.test(tag);
        return lib && lib.module === module ? `${head}${quote}${origin}/vendor/${lib.path}${quote}` : all;
    }));
}

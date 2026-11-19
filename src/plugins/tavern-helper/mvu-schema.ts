// MVU variable schemas. Cards built on MVU's zod template define the shape of their variables in a
// 酒馆助手 script that calls registerMvuSchema(schema) (imported from a remote util). In 酒馆, every
// variable update is then parsed with that schema: values are coerced and clamped, missing fields get
// their defaults. Hearth runs the card's script in the QuickJS sandbox with a bundled zod instead of
// the remote import, and parses the variables after each update the same way.

import type { CardScript, Character } from '../../core/types.ts';
import type { PluginApi } from '../../server/plugins.ts';
import zodSource from './vendor/zod.json' with { type: 'json' };

/** `import { registerMvuSchema } from '…/mvu_zod.js'` and the like: provided by Hearth. */
const SCHEMA_IMPORT = /^\s*import\s*\{[^}]*\bregisterMvuSchema\b[^}]*\}\s*from\s*['"][^'"]*['"];?[ \t]*$/m;
const ANY_IMPORT = /^\s*import\s[^;]*?from\s*['"][^'"]+['"]|^\s*import\s*['"][^'"]+['"]|\bimport\s*\(/m;

export function isSchemaScript(script: CardScript): boolean {
    return script.enabled && /\bregisterMvuSchema\s*\(/.test(script.content);
}

/** The card's schema script, ready to run (null when it has none, or needs other remote code). */
export function schemaScript(character: Character): string | null {
    const script = character.scripts.find(isSchemaScript);
    if (!script) return null;
    const code = script.content.replace(SCHEMA_IMPORT, '');
    return ANY_IMPORT.test(code) ? null : code;
}

export interface SchemaResult {
    ok: boolean;
    data?: Record<string, unknown>;
    error?: string;
}

/** Parses `stat` with the card's schema. */
export async function parseWithSchema(api: Pick<PluginApi, 'sandbox'>, code: string, stat: Record<string, unknown>): Promise<SchemaResult> {
    const program = [
        zodSource as string,
        'var registerMvuSchema = s => { globalThis.__schema = s; };',
        'var console = { log() {}, info() {}, warn() {}, error() {}, debug() {} };',
        `(() => {\n${code}\n})();`,
        `(() => {
            let schema = globalThis.__schema;
            if (typeof schema === 'function') schema = schema();
            if (!schema || typeof schema.safeParse !== 'function') return { ok: false, error: '脚本没有登记变量结构' };
            const r = schema.safeParse(JSON.parse(__host('stat', '[]')));
            if (r.success) return { ok: true, data: r.data };
            const issues = (r.error && r.error.issues) || [];
            return { ok: false, error: issues.slice(0, 3).map(i => (i.path || []).join('.') + '：' + i.message).join('；') || String(r.error) };
        })()`,
    ].join('\n');
    try {
        const out = await api.sandbox.run(program, name => (name === 'stat' ? stat : undefined), 8000) as SchemaResult;
        return out && typeof out === 'object' ? out : { ok: false, error: '变量结构没有返回结果' };
    } catch (error) {
        return { ok: false, error: (error as Error).message };
    }
}

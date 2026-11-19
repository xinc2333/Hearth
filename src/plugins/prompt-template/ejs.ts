// EJS prompt templates, compatible with the common ST-Prompt-Template API (getvar / setvar /
// incvar / decvar / getwi / getchar / print / variables / _). Templates run in the QuickJS sandbox.

import type { AssembleInput } from '../../core/assemble.ts';
import { getPath, setPath, stateAt } from '../../core/state.ts';
import { estimateTokens, MESSAGE_OVERHEAD } from '../../core/tokens.ts';
import type { LoreEntry, Lorebook } from '../../core/types.ts';
import type { HearthPlugin, PluginApi } from '../../server/plugins.ts';
import type { HostCall } from '../../server/sandbox.ts';

/** Compiles an EJS template into the body of an async function that returns the output. */
export function compileEjs(src: string): string {
    const tokens = src.split(/(<%%|%%>|<%_|<%=|<%-|<%#|<%|_%>|-%>|%>)/);
    let code = '';
    let text = '';
    let inner = '';
    let mode: '' | 'code' | 'out' | 'comment' = '';
    let trim: '' | 'newline' | 'slurp' = '';
    const flush = () => {
        if (text) code += `__append(${JSON.stringify(text)});\n`;
        text = '';
    };
    for (const tok of tokens) {
        if (!tok) continue;
        if (!mode) {
            if (tok === '<%%') { text += '<%'; continue; }
            if (tok === '%%>') { text += '%>'; continue; }
            if (tok.startsWith('<%')) {
                if (tok === '<%_') text = text.replace(/[ \t]*$/, '');
                flush();
                mode = tok === '<%=' || tok === '<%-' ? 'out' : tok === '<%#' ? 'comment' : 'code';
                inner = '';
                continue;
            }
            let t = tok;
            if (trim === 'newline') t = t.replace(/^\r?\n/, '');
            if (trim === 'slurp') t = t.replace(/^[ \t]*\r?\n?/, '');
            trim = '';
            text += t;
            continue;
        }
        if (tok === '%>' || tok === '-%>' || tok === '_%>') {
            if (mode === 'code') code += `${inner}\n`;
            else if (mode === 'out') code += `__append(${inner});\n`;
            mode = '';
            trim = tok === '-%>' ? 'newline' : tok === '_%>' ? 'slurp' : '';
            continue;
        }
        inner += tok === '%%>' ? '%>' : tok;
    }
    flush();
    return code;
}

const PRELUDE = `
const __call = (n, ...a) => { const r = __host(n, JSON.stringify(a)); return r === undefined ? undefined : JSON.parse(r); };
const variables = __call('variables') ?? {};
const __get = (o, p, d) => { const segs = Array.isArray(p) ? p : String(p).replace(/\\[(\\w+)\\]/g, '.$1').split('.').filter(Boolean); let c = o; for (const s of segs) { if (c == null) return d; c = c[s]; } return c === undefined ? d : c; };
const _ = { get: __get, has: (o, p) => __get(o, p) !== undefined, isEmpty: v => v == null || (typeof v === 'object' ? Object.keys(v).length === 0 : String(v).length === 0), isNil: v => v == null, clone: v => JSON.parse(JSON.stringify(v)), cloneDeep: v => JSON.parse(JSON.stringify(v)) };
const getvar = (path, opts) => __call('getvar', path, opts ?? {});
const getVar = getvar;
const setvar = (path, value, opts) => __call('setvar', path, value, opts ?? {});
const setVar = setvar;
const incvar = (path, n = 1, opts) => __call('incvar', path, n, opts ?? {});
const decvar = (path, n = 1, opts) => __call('incvar', path, -n, opts ?? {});
const getwi = async (book, title) => __call('getwi', title === undefined ? null : book, title === undefined ? book : title);
const getWorldInfo = getwi;
const getchar = async () => __call('getchar');
const getChara = getchar;
const console = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
`;

export interface EjsEnv {
    vars: { global: Record<string, unknown>; chat: Record<string, unknown>; message: Record<string, unknown> };
    books: Lorebook[];
    character: { name: string; description: string; personality: string; scenario: string };
    macros: (text: string) => string;
    /** The sandbox to run templates in (the plugin API's sandbox.run). */
    run: PluginApi['sandbox']['run'];
}

function hostFor(env: EjsEnv): HostCall {
    const merged = () => ({ ...env.vars.global, ...env.vars.chat, ...env.vars.message });
    return (name, args) => {
        switch (name) {
            case 'variables':
                return merged();
            case 'getvar': {
                const [path, opts] = args as [string, { defaults?: unknown; scope?: string }];
                const scope = opts?.scope === 'global' ? env.vars.global : opts?.scope === 'chat' ? env.vars.chat : opts?.scope === 'message' ? env.vars.message : merged();
                return getPath(scope, String(path), opts?.defaults);
            }
            case 'setvar': {
                const [path, value, opts] = args as [string, unknown, { scope?: string }];
                setPath(opts?.scope === 'global' ? env.vars.global : opts?.scope === 'message' ? env.vars.message : env.vars.chat, String(path), value);
                return value;
            }
            case 'incvar': {
                const [path, n] = args as [string, number];
                const next = Number(getPath(merged(), String(path), 0)) + Number(n);
                setPath(env.vars.chat, String(path), next);
                return next;
            }
            case 'getwi': {
                const [book, title] = args as [string | null, string | number];
                const books = book ? env.books.filter(b => b.name === book) : env.books;
                for (const b of books) {
                    const entry = b.entries.find(e => e.title === String(title) || e.id === String(title));
                    if (entry) return env.macros(entry.content);
                }
                return '';
            }
            case 'getchar':
                return env.character;
            default:
                return undefined;
        }
    };
}

/** One template as an async function body that returns its output. */
const templateFunction = (template: string) =>
    `async () => { let __out = ''; const __append = v => { __out += v === undefined || v === null ? '' : String(v); }; const print = (...a) => a.forEach(__append);\n${compileEjs(template)}\nreturn __out; }`;

export async function renderEjs(template: string, env: EjsEnv, depth = 0): Promise<string> {
    const code = `${PRELUDE}\n(${templateFunction(template)})()`;
    const output = String(await env.run(code, hostFor(env)) ?? '');
    // Included entries may contain templates of their own.
    if (depth < 3 && output.includes('<%')) {
        return renderEjs(output, env, depth + 1);
    }
    return output;
}

/**
 * Renders several templates in one sandbox run, sharing variables like one generation does; a template
 * that throws gives null. Falls back to one run per template when the batch itself cannot run.
 */
export async function renderEjsMany(templates: string[], env: EjsEnv): Promise<(string | null)[]> {
    const code = `${PRELUDE}\n(async () => { const outs = []; for (const f of [${templates.map(templateFunction).join(',\n')}]) { try { outs.push(await f()); } catch (e) { outs.push(null); } } return outs; })()`;
    try {
        const outs = await env.run(code, hostFor(env), 5000);
        if (Array.isArray(outs) && outs.length === templates.length) return outs.map(o => (o === null ? null : String(o)));
    } catch { /* a syntax error in one template stops the batch */ }
    return Promise.all(templates.map(t => renderEjs(t, env).catch(() => null)));
}

/**
 * ST-Prompt-Template runs an entry that starts with the @@preprocessing decorator (or has
 * [Preprocessing] in its name) before 酒馆 handles the worldbook, so activation and the token budget
 * see the template's output. Returns the template and the other decorators, or null.
 */
export function preprocessingTemplate(entry: LoreEntry): { template: string; decorators: string[] } | null {
    if (!entry.enabled || !entry.content.includes('<%')) return null;
    const lines = entry.content.split('\n');
    const decorators: string[] = [];
    let marked = /\[preprocessing\]/i.test(entry.title);
    let i = 0;
    for (; i < lines.length && lines[i].startsWith('@@') && !lines[i].startsWith('@@@'); i++) {
        if (lines[i].trim() === '@@preprocessing') marked = true;
        else decorators.push(lines[i]);
    }
    return marked ? { template: lines.slice(i).join('\n'), decorators } : null;
}

export const ejsPlugin: HearthPlugin = {
    setup(api) {
        // One set of template variables per assembly: what preprocessing sets, the prompt pass sees.
        const envs = new WeakMap<AssembleInput, EjsEnv>();
        const envFor = (input: AssembleInput): EjsEnv => {
            let env = envs.get(input);
            if (env) return env;
            const macroCtx = api.macros.context({ user: input.userName, char: input.character.name, seed: input.chatId });
            env = {
                vars: {
                    global: structuredClone(input.variables.global),
                    chat: structuredClone(input.variables.chat),
                    message: structuredClone(stateAt(input.messages) ?? {}),
                },
                books: input.lore.sources.map(s => s.book),
                character: {
                    name: input.character.name,
                    description: input.character.fields.description,
                    personality: input.character.fields.personality,
                    scenario: input.character.fields.scenario,
                },
                macros: text => api.macros.evaluate(text, macroCtx),
                run: api.sandbox.run,
            };
            envs.set(input, env);
            return env;
        };

        api.onBeforeAssemble(async ctx => {
            const input = ctx.input;
            const targets: { book: Lorebook; entry: LoreEntry; template: string; decorators: string[] }[] = [];
            for (const { book } of input.lore.sources) {
                for (const entry of book.entries) {
                    const t = preprocessingTemplate(entry);
                    if (t) targets.push({ book, entry, ...t });
                }
            }
            if (!targets.length) return;
            const outs = await renderEjsMany(targets.map(t => t.template), envFor(input));
            const rendered = new Map<LoreEntry, string>();
            targets.forEach((t, i) => {
                const out = outs[i];
                // A template that failed stays as it is; the prompt pass tries it again and reports it.
                if (out !== null) rendered.set(t.entry, [...t.decorators, out].join('\n'));
            });
            // The stored books are not touched: this assembly gets copies with the output.
            input.lore.sources = input.lore.sources.map(source => source.book.entries.some(e => rendered.has(e))
                ? { ...source, book: { ...source.book, entries: source.book.entries.map(e => (rendered.has(e) ? { ...e, content: rendered.get(e)! } : e)) } }
                : source);
        });

        api.onAfterAssemble(async (result, ctx) => {
            if (!result.parts.some(p => p.content.includes('<%'))) return;
            const env = envFor(ctx.input);
            let failed = false;
            for (const part of result.parts) {
                if (!part.content.includes('<%')) continue;
                try {
                    part.content = (await renderEjs(part.content, env)).replace(/\n{3,}/g, '\n\n').trim();
                } catch (error) {
                    failed = true;
                    result.warnings.push(`EJS 模板执行失败（${part.sources[0]}）：${(error as Error).message}。该段模板已省略。`);
                    part.content = part.content.replace(/<%[\s\S]*?%>/g, '').trim();
                }
                part.tokens = estimateTokens(part.content) + MESSAGE_OVERHEAD;
            }
            result.parts = result.parts.filter(p => p.content);
            result.messages = result.parts.map(p => ({ role: p.role, content: p.content, ...(p.name ? { name: p.name } : {}) }));
            result.tokens.total = result.parts.reduce((s, p) => s + p.tokens, 0);
            if (!failed) result.warnings = result.warnings.filter(w => !w.includes('<%'));
        });
    },
};

// EJS prompt templates, compatible with the common ST-Prompt-Template API (getvar / setvar /
// incvar / decvar / getwi / getchar / print / variables / _). Templates run in the QuickJS sandbox.

import { createMacroContext, evaluateMacros } from '../../core/macros.ts';
import { getPath, setPath, stateAt } from '../../core/state.ts';
import { estimateTokens, MESSAGE_OVERHEAD } from '../../core/tokens.ts';
import type { Lorebook } from '../../core/types.ts';
import type { HearthPlugin } from '../plugins.ts';
import { runSandboxed, type HostCall } from '../sandbox.ts';

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
}

export async function renderEjs(template: string, env: EjsEnv, depth = 0): Promise<string> {
    const merged = () => ({ ...env.vars.global, ...env.vars.chat, ...env.vars.message });
    const host: HostCall = (name, args) => {
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
    const code = `${PRELUDE}\n(async () => { let __out = ''; const __append = v => { __out += v === undefined || v === null ? '' : String(v); }; const print = (...a) => a.forEach(__append);\n${compileEjs(template)}\nreturn __out; })()`;
    const output = String(await runSandboxed(code, host) ?? '');
    // Included entries may contain templates of their own.
    if (depth < 3 && output.includes('<%')) {
        return renderEjs(output, env, depth + 1);
    }
    return output;
}

export const ejsPlugin: HearthPlugin = {
    id: 'builtin.ejs',
    name: 'EJS 提示词模板（兼容 ST-Prompt-Template）',
    setup(api) {
        api.onAfterAssemble(async (result, ctx) => {
            if (!result.parts.some(p => p.content.includes('<%'))) return;
            const input = ctx.input;
            const macroCtx = createMacroContext({ user: input.userName, char: input.character.name, seed: input.chatId });
            const env: EjsEnv = {
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
                macros: text => evaluateMacros(text, macroCtx),
            };
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

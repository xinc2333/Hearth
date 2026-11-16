// MagVarUpdate (MVU) compatible variable updates.
//
// The model ends its reply with an <UpdateVariable> block, either as a JSON-Patch-like array
// (<JSONPatch>[{ "op": "replace", "path": "/世界/地点", "value": "…" }]</JSONPatch>) or as
// legacy commands (_.set('世界.地点', '旧', '新');//原因). Updates apply to the previous state
// and the result is stored on the reply's swipe, so swipes and branches each keep their own state.

import { getPath, setPath, toPath, unsetPath } from '../../core/state.ts';

export interface MvuCommand {
    op: 'replace' | 'delta' | 'insert' | 'remove' | 'move';
    path: string[];
    value?: unknown;
    from?: string[];
    reason?: string;
}

export interface MvuResult {
    stat_data: Record<string, unknown>;
    /** Paths changed in this update, with old and new values. */
    delta_data: Record<string, { from: unknown; to: unknown }>;
    applied: number;
    errors: string[];
}

function stripRoot(path: string[]): string[] {
    return path[0] === 'stat_data' ? path.slice(1) : path;
}

/** Lenient JSON: allows trailing commas, single quotes and comments. */
function parseLooseJson(text: string): unknown {
    const cleaned = text
        .replace(/^```(?:json)?\s*|```\s*$/g, '')
        .replace(/\/\/[^\n"]*$/gm, '')
        .replace(/,\s*([}\]])/g, '$1')
        .trim();
    try {
        return JSON.parse(cleaned);
    } catch {
        return JSON.parse(cleaned.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_m, s) => JSON.stringify(s)));
    }
}

/** Splits a JS argument list on top-level commas. */
function splitArgs(src: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let quote: string | null = null;
    let cur = '';
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (quote) {
            cur += ch;
            if (ch === '\\') { cur += src[++i] ?? ''; continue; }
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === '"' || ch === '\'' || ch === '`') { quote = ch; cur += ch; continue; }
        if ('([{'.includes(ch)) depth++;
        if (')]}'.includes(ch)) depth--;
        if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
        cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
}

function parseLiteral(src: string): unknown {
    const s = src.trim();
    if (/^['"`]/.test(s)) {
        const body = s.slice(1, -1);
        return s[0] === '"' ? JSON.parse(s) : body.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n');
    }
    if (s === 'true' || s === 'false') return s === 'true';
    if (s === 'null' || s === 'undefined') return null;
    if (/^[-+]?\d+(\.\d+)?$/.test(s)) return Number(s);
    try {
        return parseLooseJson(s);
    } catch {
        return s;
    }
}

export function parseMvuCommands(text: string): MvuCommand[] {
    const blocks = [...text.matchAll(/<UpdateVariable>([\s\S]*?)<\/UpdateVariable>/gi)].map(m => m[1]);
    if (!blocks.length) {
        const open = text.match(/<UpdateVariable>([\s\S]*)$/i);
        if (open) blocks.push(open[1]);
    }
    const commands: MvuCommand[] = [];
    for (const block of blocks) {
        const patch = block.match(/<JSONPatch>([\s\S]*?)<\/JSONPatch>/i);
        if (patch) {
            try {
                const ops = parseLooseJson(patch[1]);
                for (const op of Array.isArray(ops) ? ops : [ops]) {
                    if (!op || typeof op !== 'object') continue;
                    const o = op as Record<string, unknown>;
                    const name = String(o.op ?? '').toLowerCase();
                    const kind = name === 'add' ? 'insert' : name === 'set' ? 'replace' : name;
                    if (!['replace', 'delta', 'insert', 'remove', 'move'].includes(kind)) continue;
                    commands.push({
                        op: kind as MvuCommand['op'],
                        path: stripRoot(toPath(String(o.path ?? o.to ?? ''))),
                        value: o.value,
                        from: o.from !== undefined ? stripRoot(toPath(String(o.from))) : undefined,
                    });
                }
            } catch {
                // Malformed patch; legacy commands below may still apply.
            }
        }
        for (const m of block.matchAll(/_\.(set|add|insert|assign|remove|delete|unset)\s*\(([\s\S]*?)\)\s*;?[ \t]*(?:\/\/([^\n]*))?/g)) {
            const args = splitArgs(m[2]).map(parseLiteral);
            const path = stripRoot(toPath(String(args[0] ?? '')));
            const reason = m[3]?.trim();
            switch (m[1]) {
                case 'set':
                    commands.push({ op: 'replace', path, value: args.length >= 3 ? args[2] : args[1], reason });
                    break;
                case 'add':
                    commands.push(typeof args[1] === 'number' && args.length === 2
                        ? { op: 'delta', path, value: args[1], reason }
                        : { op: 'insert', path: args.length >= 3 ? [...path, String(args[1])] : [...path, '-'], value: args.length >= 3 ? args[2] : args[1], reason });
                    break;
                case 'insert':
                case 'assign':
                    commands.push({ op: 'insert', path: args.length >= 3 ? [...path, String(args[1])] : [...path, '-'], value: args.length >= 3 ? args[2] : args[1], reason });
                    break;
                default:
                    commands.push({ op: 'remove', path: args.length >= 2 ? [...path, String(args[1])] : path, reason });
            }
        }
    }
    return commands.filter(c => c.path.length);
}

/** Values stored as [value, description] (legacy MVU) are updated in place. */
function isValueWithDescription(v: unknown): v is [unknown, string] {
    return Array.isArray(v) && v.length === 2 && typeof v[1] === 'string' && !Array.isArray(v[0]);
}

export function applyMvuCommands(state: Record<string, unknown>, commands: MvuCommand[]): MvuResult {
    const stat = structuredClone(state);
    const delta: MvuResult['delta_data'] = {};
    const errors: string[] = [];
    let applied = 0;
    const note = (path: string[], from: unknown, to: unknown) => {
        delta[path.join('.')] = { from, to };
        applied++;
    };
    for (const c of commands) {
        if (c.path.some(seg => seg.startsWith('_')) && c.op !== 'move') {
            errors.push(`只读字段不可修改：${c.path.join('.')}`);
            continue;
        }
        try {
            const current = getPath(stat, c.path);
            switch (c.op) {
                case 'replace': {
                    if (isValueWithDescription(current) && !Array.isArray(c.value)) {
                        setPath(stat, [...c.path, '0'], c.value);
                        note(c.path, current[0], c.value);
                    } else {
                        setPath(stat, c.path, c.value);
                        note(c.path, current, c.value);
                    }
                    break;
                }
                case 'delta': {
                    const target = isValueWithDescription(current) ? [...c.path, '0'] : c.path;
                    const base = Number(getPath(stat, target) ?? 0);
                    const add = Number(c.value);
                    if (!Number.isFinite(base) || !Number.isFinite(add)) throw new Error('不是数字');
                    setPath(stat, target, base + add);
                    note(c.path, base, base + add);
                    break;
                }
                case 'insert': {
                    const key = c.path[c.path.length - 1];
                    const parentPath = c.path.slice(0, -1);
                    const parent = getPath(stat, parentPath);
                    if (Array.isArray(parent)) {
                        const index = key === '-' ? parent.length : Number(key);
                        parent.splice(Number.isInteger(index) ? index : parent.length, 0, c.value);
                    } else {
                        setPath(stat, c.path, c.value);
                    }
                    note(c.path, undefined, c.value);
                    break;
                }
                case 'remove': {
                    if (unsetPath(stat, c.path)) note(c.path, current, undefined);
                    break;
                }
                case 'move': {
                    if (!c.from) break;
                    const value = getPath(stat, c.from);
                    unsetPath(stat, c.from);
                    setPath(stat, c.path, value);
                    note(c.path, undefined, value);
                    break;
                }
            }
        } catch (error) {
            errors.push(`${c.op} ${c.path.join('.')}：${(error as Error).message}`);
        }
    }
    return { stat_data: stat, delta_data: delta, applied, errors };
}

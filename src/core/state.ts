// Per-message state (MVU stat data, TavernHelper message variables) and lodash-style path helpers.

import type { ChatMessage } from './types.ts';

/** Splits "a.b[0].c" or "/a/b/0/c" into segments. */
export function toPath(path: string | (string | number)[]): string[] {
    if (Array.isArray(path)) return path.map(String);
    const p = path.trim();
    if (p.startsWith('/')) {
        return p.slice(1).split('/').map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'));
    }
    const out: string[] = [];
    for (const part of p.split('.')) {
        const m = part.match(/^([^[\]]*)((?:\[[^\]]*\])*)$/);
        if (!m) {
            out.push(part);
            continue;
        }
        if (m[1]) out.push(m[1]);
        for (const idx of m[2].matchAll(/\[([^\]]*)\]/g)) out.push(idx[1].replace(/^["']|["']$/g, ''));
    }
    return out.filter(s => s !== '');
}

export function getPath(obj: unknown, path: string | string[], fallback?: unknown): unknown {
    let cur = obj;
    for (const seg of toPath(path)) {
        if (cur === null || typeof cur !== 'object') return fallback;
        cur = (cur as Record<string, unknown>)[seg];
    }
    return cur === undefined ? fallback : cur;
}

export function setPath(obj: Record<string, unknown>, path: string | string[], value: unknown): void {
    const segs = toPath(path);
    let cur: Record<string, unknown> = obj;
    for (let i = 0; i < segs.length - 1; i++) {
        const next = cur[segs[i]];
        if (next === null || typeof next !== 'object') {
            cur[segs[i]] = /^\d+$/.test(segs[i + 1]) ? [] : {};
        }
        cur = cur[segs[i]] as Record<string, unknown>;
    }
    if (segs.length) cur[segs[segs.length - 1]] = value;
}

export function unsetPath(obj: Record<string, unknown>, path: string | string[]): boolean {
    const segs = toPath(path);
    const parent = getPath(obj, segs.slice(0, -1)) as Record<string, unknown> | unknown[] | undefined;
    const key = segs[segs.length - 1];
    if (Array.isArray(parent)) {
        const i = Number(key);
        if (Number.isInteger(i) && i >= 0 && i < parent.length) {
            parent.splice(i, 1);
            return true;
        }
        return false;
    }
    if (parent && typeof parent === 'object' && key in parent) {
        delete (parent as Record<string, unknown>)[key];
        return true;
    }
    return false;
}

export function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    for (const [k, v] of Object.entries(source)) {
        const cur = target[k];
        if (v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' && !Array.isArray(cur)) {
            deepMerge(cur as Record<string, unknown>, v as Record<string, unknown>);
        } else {
            target[k] = structuredClone(v);
        }
    }
    return target;
}

/** State of the message at `index` (or the nearest earlier message that has one). */
export function stateAt(messages: ChatMessage[], index = messages.length - 1): Record<string, unknown> | undefined {
    for (let i = Math.min(index, messages.length - 1); i >= 0; i--) {
        const m = messages[i];
        const state = m.swipes[m.activeSwipe]?.state;
        if (state) return state;
    }
    return undefined;
}

/** Small YAML emitter for showing variables to the model (TavernHelper format_*_variable). */
export function toYaml(value: unknown, indent = 0, quoted = false): string {
    const pad = '  '.repeat(indent);
    const scalar = (v: unknown): string => {
        if (v === null || v === undefined) return 'null';
        if (typeof v === 'string') {
            return quoted || v === '' || /^[\s\-?:,[\]{}#&*!|>'"%@`]|[:#]\s|\n|^(?:true|false|null|~|[-+]?\d)/i.test(v) ? JSON.stringify(v) : v;
        }
        return String(v);
    };
    if (Array.isArray(value)) {
        if (!value.length) return '[]';
        return value.map(v => (v && typeof v === 'object' && Object.keys(v).length)
            ? `${pad}-\n${toYaml(v, indent + 1, quoted)}`
            : `${pad}- ${v && typeof v === 'object' ? (Array.isArray(v) ? '[]' : '{}') : scalar(v)}`).join('\n');
    }
    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>);
        if (!entries.length) return '{}';
        return entries.map(([k, v]) => {
            const key = /^[\w一-鿿぀-ヿ-]+$/.test(k) ? k : JSON.stringify(k);
            if (v && typeof v === 'object' && (Array.isArray(v) ? v.length : Object.keys(v).length)) {
                return `${pad}${key}:\n${toYaml(v, indent + 1, quoted)}`;
            }
            return `${pad}${key}: ${v && typeof v === 'object' ? (Array.isArray(v) ? '[]' : '{}') : scalar(v)}`;
        }).join('\n');
    }
    return pad + scalar(value);
}

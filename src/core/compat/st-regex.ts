import type { RegexPlacement, RegexScript } from '../types.ts';
import { asBool, asString, asStringArray, isRecord, newId } from '../util.ts';

const PLACEMENTS: Record<number, RegexPlacement> = {
    1: 'user_input',
    2: 'ai_output',
    3: 'slash_command',
    5: 'world_info',
    6: 'reasoning',
};

function depth(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

export function fromStRegex(raw: unknown): RegexScript | null {
    if (!isRecord(raw)) {
        return null;
    }
    const placement = (Array.isArray(raw.placement) ? raw.placement : [])
        .map(p => PLACEMENTS[Number(p)])
        .filter((p): p is RegexPlacement => Boolean(p));
    const substitute = raw.substituteRegex === true || Number(raw.substituteRegex) === 1
        ? 'raw'
        : Number(raw.substituteRegex) === 2 ? 'escaped' : 'none';
    return {
        id: asString(raw.id) || newId('rx'),
        name: asString(raw.scriptName, '未命名正则'),
        enabled: !asBool(raw.disabled, false),
        find: asString(raw.findRegex),
        replace: asString(raw.replaceString),
        trim: asStringArray(raw.trimStrings),
        placement,
        displayOnly: asBool(raw.markdownOnly, false),
        promptOnly: asBool(raw.promptOnly, false),
        runOnEdit: asBool(raw.runOnEdit, false),
        substitute,
        minDepth: depth(raw.minDepth),
        maxDepth: depth(raw.maxDepth),
        extra: { st: raw },
    };
}

export function fromStRegexList(raw: unknown): RegexScript[] {
    return Array.isArray(raw) ? raw.map(fromStRegex).filter((x): x is RegexScript => x !== null) : [];
}

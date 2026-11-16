// Regex scripts, with SillyTavern semantics (placement, prompt/display-only, depth limits,
// trim strings, capture groups and macro substitution).

import type { RegexPlacement, RegexScript } from './types.ts';
import { regexFromString } from './util.ts';

export interface RegexOptions {
    /** Building the prompt (promptOnly scripts run, plain ones do not — they already ran on save). */
    isPrompt?: boolean;
    /** Rendering for display (displayOnly scripts run). */
    isDisplay?: boolean;
    isEdit?: boolean;
    depth?: number | null;
    macros: (text: string, transform?: (value: string) => string) => string;
}

const cache = new Map<string, RegExp | null>();

function getRegex(source: string): RegExp | null {
    if (!cache.has(source)) {
        if (cache.size > 1000) {
            cache.clear();
        }
        cache.set(source, regexFromString(source));
    }
    const regex = cache.get(source) ?? null;
    if (regex && (regex.global || regex.sticky)) {
        regex.lastIndex = 0;
    }
    return regex;
}

function sanitizeRegexMacro(value: string): string {
    return value.replaceAll(/[\n\r\t\v\f\0.^$*+?{}[\]\\/|()]/gs, s => {
        switch (s) {
            case '\n': return '\\n';
            case '\r': return '\\r';
            case '\t': return '\\t';
            case '\v': return '\\v';
            case '\f': return '\\f';
            case '\0': return '\\0';
            default: return '\\' + s;
        }
    });
}

export function runRegexScript(script: RegexScript, text: string, opts: RegexOptions): string {
    if (!script.enabled || !script.find || !text) {
        return text;
    }
    const source = script.substitute === 'raw'
        ? opts.macros(script.find)
        : script.substitute === 'escaped'
            ? opts.macros(script.find, sanitizeRegexMacro)
            : script.find;
    const regex = getRegex(source);
    if (!regex) {
        return text;
    }
    return text.replace(regex, (...args: unknown[]) => {
        const replaceString = script.replace.replace(/{{match}}/gi, '$0');
        const withGroups = replaceString.replaceAll(/\$(\d+)|\$<([^>]+)>/g, (_m, num: string | undefined, groupName: string | undefined) => {
            let match: unknown;
            if (num) {
                match = args[Number(num)];
            } else if (groupName) {
                const groups = args[args.length - 1];
                match = groups && typeof groups === 'object' ? (groups as Record<string, unknown>)[groupName] : undefined;
            }
            if (!match || typeof match !== 'string') {
                return '';
            }
            let filtered = match;
            for (const trim of script.trim) {
                filtered = filtered.replaceAll(opts.macros(trim), '');
            }
            return filtered;
        });
        return opts.macros(withGroups);
    });
}

/** Applies the given scripts (already in priority order: global, preset, character). */
export function applyRegex(scripts: RegexScript[], text: string, placement: RegexPlacement, opts: RegexOptions): string {
    if (typeof text !== 'string' || !text) {
        return text ?? '';
    }
    let result = text;
    for (const script of scripts) {
        const applies = (script.displayOnly && opts.isDisplay)
            || (script.promptOnly && opts.isPrompt)
            || (!script.displayOnly && !script.promptOnly && !opts.isDisplay && !opts.isPrompt);
        if (!applies) {
            continue;
        }
        if (opts.isEdit && !script.runOnEdit) {
            continue;
        }
        if (typeof opts.depth === 'number') {
            if (script.minDepth !== null && script.minDepth >= -1 && opts.depth < script.minDepth) {
                continue;
            }
            if (script.maxDepth !== null && script.maxDepth >= 0 && opts.depth > script.maxDepth) {
                continue;
            }
        }
        if (script.placement.includes(placement)) {
            result = runRegexScript(script, result, opts);
        }
    }
    return result;
}

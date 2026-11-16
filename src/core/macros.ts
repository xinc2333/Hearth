// Macro engine compatible with SillyTavern's {{macro}} syntax, including nesting
// ({{getvar::{{user}}_hp}}), "::" arguments and the legacy "name:arg" forms.
//
// Macros are looked up in a registry, so plugins can add their own with registerMacro().

import { getPath, toYaml } from './state.ts';
import { hashString } from './util.ts';

export interface MacroContext {
    user: string;
    char: string;
    persona: string;
    description: string;
    personality: string;
    scenario: string;
    mesExamples: string;
    mesExamplesRaw: string;
    charPrompt: string;
    charJailbreak: string;
    charDepthPrompt: string;
    creatorNotes: string;
    charVersion: string;
    firstMessage: string;
    model: string;
    original?: string;
    input: string;
    lastMessage: string;
    lastUserMessage: string;
    lastCharMessage: string;
    lastMessageId: number;
    chatVariables: Record<string, unknown>;
    globalVariables: Record<string, unknown>;
    /** Variables of the latest message that has any (MVU stat_data lives here). */
    messageVariables: Record<string, unknown>;
    outlets: Record<string, string>;
    now: Date;
    random: () => number;
    /** Stable seed for {{pick}} (ST uses the chat id). */
    seed: string;
    /** Extra named values, e.g. format-string parameters. */
    values?: Record<string, string>;
}

export type MacroHandler = (args: string[], ctx: MacroContext, raw: string) => string | undefined;

const registry = new Map<string, MacroHandler>();

export function registerMacro(names: string | string[], handler: MacroHandler): void {
    for (const name of Array.isArray(names) ? names : [names]) {
        registry.set(name.toLowerCase(), handler);
    }
}

export function unregisterMacro(names: string | string[]): void {
    for (const name of Array.isArray(names) ? names : [names]) {
        registry.delete(name.toLowerCase());
    }
}

export function listMacros(): string[] {
    return [...registry.keys()].sort();
}

const LEGACY_COLON = ['random', 'pick', 'roll', 'datetimeformat', 'time_utc', 'timediff', 'banned'];

function splitMacro(inner: string): { name: string; args: string[] } {
    const trimmed = inner.trim();
    if (trimmed.includes('::')) {
        const [name, ...args] = trimmed.split('::');
        return { name: name.trim(), args };
    }
    const colon = trimmed.indexOf(':');
    if (colon > 0) {
        const name = trimmed.slice(0, colon).trim();
        const lower = name.toLowerCase();
        if (LEGACY_COLON.includes(lower) || lower.startsWith('time_utc')) {
            return { name, args: [trimmed.slice(colon + 1)] };
        }
    }
    const space = trimmed.search(/\s/);
    if (space > 0) {
        return { name: trimmed.slice(0, space), args: [trimmed.slice(space + 1)] };
    }
    return { name: trimmed, args: [] };
}

let pickCounter = 0;

function runMacro(inner: string, ctx: MacroContext): string | undefined {
    const trimmed = inner.trim();
    if (trimmed.startsWith('//')) {
        return '';
    }
    const { name, args } = splitMacro(inner);
    const lower = name.toLowerCase();
    const handler = registry.get(lower);
    if (handler) {
        return handler(args, ctx, inner);
    }
    if (lower.startsWith('time_utc')) {
        return registry.get('time_utc')?.([lower.slice('time_utc'.length)], ctx, inner);
    }
    if (ctx.values && Object.hasOwn(ctx.values, name)) {
        return ctx.values[name];
    }
    return undefined;
}

/**
 * Evaluates macros in `text`. Unknown macros are left untouched. Nested macros are evaluated
 * innermost first, so arguments can themselves contain macros.
 */
export function evaluateMacros(text: string, ctx: MacroContext, options: { transform?: (value: string) => string } = {}): string {
    if (!text || (!text.includes('{{') && !text.includes('<'))) {
        return text ?? '';
    }
    pickCounter = 0;
    let input = text
        .replace(/(?:\r?\n)*{{trim}}(?:\r?\n)*/gi, '')
        .replace(/<USER>/gi, ctx.user)
        .replace(/<BOT>/gi, ctx.char)
        .replace(/<CHAR>/gi, ctx.char)
        .replace(/<CHARIFNOTGROUP>/gi, ctx.char)
        .replace(/<GROUP>/gi, ctx.char);
    if (!input.includes('{{')) {
        return input;
    }
    const stack: string[] = [''];
    let i = 0;
    while (i < input.length) {
        if (input.startsWith('{{', i)) {
            stack.push('');
            i += 2;
            continue;
        }
        if (input.startsWith('}}', i) && stack.length > 1) {
            const inner = stack.pop() as string;
            const result = runMacro(inner, ctx);
            stack[stack.length - 1] += result === undefined ? `{{${inner}}}` : options.transform ? options.transform(result) : result;
            i += 2;
            continue;
        }
        stack[stack.length - 1] += input[i];
        i++;
    }
    while (stack.length > 1) {
        const unclosed = stack.pop() as string;
        stack[stack.length - 1] += `{{${unclosed}`;
    }
    input = stack[0];
    return input;
}

// ---------------------------------------------------------------------------------------------
// Built-in macros
// ---------------------------------------------------------------------------------------------

function stringify(value: unknown): string {
    if (value === undefined || value === null) {
        return '';
    }
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    return String(value);
}

function numeric(value: unknown): number | null {
    if (typeof value === 'number') {
        return value;
    }
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
        return Number(value);
    }
    return null;
}

function addValue(current: unknown, add: string): unknown {
    const a = numeric(current);
    const b = numeric(add);
    if (Array.isArray(current)) {
        return [...current, add];
    }
    if (a !== null && b !== null) {
        return a + b;
    }
    return stringify(current) + add;
}

function variableMacros(prefix: '' | 'global', pick: (ctx: MacroContext) => Record<string, unknown>): void {
    const n = (s: string) => `${s.replace('var', `${prefix}var`)}`;
    registerMacro(n('setvar'), (args, ctx) => {
        pick(ctx)[args[0]?.trim() ?? ''] = args.slice(1).join('::');
        return '';
    });
    registerMacro(n('getvar'), (args, ctx) => stringify(pick(ctx)[args[0]?.trim() ?? '']));
    registerMacro(n('addvar'), (args, ctx) => {
        const key = args[0]?.trim() ?? '';
        pick(ctx)[key] = addValue(pick(ctx)[key], args.slice(1).join('::'));
        return '';
    });
    registerMacro(n('incvar'), (args, ctx) => {
        const key = args[0]?.trim() ?? '';
        const next = (numeric(pick(ctx)[key]) ?? 0) + 1;
        pick(ctx)[key] = next;
        return String(next);
    });
    registerMacro(n('decvar'), (args, ctx) => {
        const key = args[0]?.trim() ?? '';
        const next = (numeric(pick(ctx)[key]) ?? 0) - 1;
        pick(ctx)[key] = next;
        return String(next);
    });
    registerMacro(n('hasvar'), (args, ctx) => String(Object.hasOwn(pick(ctx), args[0]?.trim() ?? '')));
    registerMacro(n('deletevar'), (args, ctx) => {
        delete pick(ctx)[args[0]?.trim() ?? ''];
        return '';
    });
}

variableMacros('', ctx => ctx.chatVariables);

// TavernHelper variable macros: {{get_message_variable::stat_data.好感度}}, {{format_message_variable::stat_data}}…
for (const [scope, pick] of [
    ['message', (ctx: MacroContext) => ctx.messageVariables],
    ['chat', (ctx: MacroContext) => ctx.chatVariables],
    ['global', (ctx: MacroContext) => ctx.globalVariables],
] as const) {
    registerMacro(`get_${scope}_variable`, (args, ctx) => stringify(getPath(pick(ctx), args.join('::').trim())));
    registerMacro(`format_${scope}_variable`, (args, ctx) => {
        const value = getPath(pick(ctx), args.join('::').trim());
        return value && typeof value === 'object' ? toYaml(value) : stringify(value);
    });
}
variableMacros('global', ctx => ctx.globalVariables);

registerMacro(['user', 'notchar'], (_a, ctx) => ctx.user);
registerMacro(['char', 'charifnotgroup', 'group', 'groupnotmuted'], (_a, ctx) => ctx.char);
registerMacro('persona', (_a, ctx) => ctx.persona);
registerMacro(['description', 'chardescription'], (_a, ctx) => ctx.description);
registerMacro(['personality', 'charpersonality'], (_a, ctx) => ctx.personality);
registerMacro(['scenario', 'charscenario'], (_a, ctx) => ctx.scenario);
registerMacro('mesexamples', (_a, ctx) => ctx.mesExamples);
registerMacro('mesexamplesraw', (_a, ctx) => ctx.mesExamplesRaw);
registerMacro(['charprompt', 'systemprompt'], (_a, ctx) => ctx.charPrompt);
registerMacro(['charjailbreak', 'charinstruction'], (_a, ctx) => ctx.charJailbreak);
registerMacro('chardepthprompt', (_a, ctx) => ctx.charDepthPrompt);
registerMacro(['charcreatornotes', 'creatornotes'], (_a, ctx) => ctx.creatorNotes);
registerMacro(['charversion', 'version', 'char_version'], (_a, ctx) => ctx.charVersion);
registerMacro('charfirstmessage', (_a, ctx) => ctx.firstMessage);
registerMacro('model', (_a, ctx) => ctx.model);
registerMacro('original', (_a, ctx) => {
    const value = ctx.original ?? '';
    // ST only substitutes {{original}} once per prompt.
    ctx.original = '';
    return value;
});
registerMacro('input', (_a, ctx) => ctx.input);
registerMacro('lastmessage', (_a, ctx) => ctx.lastMessage);
registerMacro('lastusermessage', (_a, ctx) => ctx.lastUserMessage);
registerMacro('lastcharmessage', (_a, ctx) => ctx.lastCharMessage);
registerMacro('lastmessageid', (_a, ctx) => String(ctx.lastMessageId));
registerMacro('newline', () => '\n');
registerMacro('space', () => ' ');
registerMacro('noop', () => '');
registerMacro('banned', () => '');
registerMacro('trim', () => '');
registerMacro('outlet', (args, ctx) => ctx.outlets[args[0]?.trim() ?? ''] ?? '');
registerMacro('reverse', args => Array.from(args.join('::')).reverse().join(''));
registerMacro('idle_duration', () => 'just now');

function splitChoices(args: string[]): string[] {
    if (args.length > 1) {
        return args;
    }
    const list = args[0] ?? '';
    // Legacy comma list; "\," escapes a literal comma.
    return list.replace(/\\,/g, '##�COMMA�##').split(',').map(x => x.trim().replace(/##�COMMA�##/g, ','));
}

registerMacro('random', (args, ctx) => {
    const choices = splitChoices(args);
    if (!choices.length) {
        return '';
    }
    return choices[Math.floor(ctx.random() * choices.length)] ?? '';
});

registerMacro('pick', (args, ctx, raw) => {
    const choices = splitChoices(args);
    if (!choices.length) {
        return '';
    }
    const index = hashString(`${ctx.seed}:${raw}:${pickCounter++}`) % choices.length;
    return choices[index] ?? '';
});

registerMacro('roll', (args, ctx) => {
    let formula = (args[0] ?? '').trim().replace(/\s+/g, '');
    // "{{roll:20}}" means 1d20.
    if (/^\d+$/.test(formula)) {
        formula = `1d${formula}`;
    }
    const m = formula.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
    if (!m) {
        return '';
    }
    const count = Number(m[1] || 1);
    const sides = Number(m[2]);
    const mod = Number(m[3] || 0);
    if (!sides || count > 1000) {
        return '';
    }
    let total = mod;
    for (let i = 0; i < count; i++) {
        total += 1 + Math.floor(ctx.random() * sides);
    }
    return String(total);
});

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');

function formatTime(d: Date): string {
    const h = d.getHours() % 12 || 12;
    return `${h}:${pad(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

/** Subset of moment.js formatting used by {{datetimeformat}}. */
function formatDate(d: Date, format: string): string {
    const tokens: Record<string, () => string> = {
        YYYY: () => String(d.getFullYear()),
        YY: () => String(d.getFullYear()).slice(-2),
        MMMM: () => MONTHS[d.getMonth()],
        MMM: () => MONTHS[d.getMonth()].slice(0, 3),
        MM: () => pad(d.getMonth() + 1),
        M: () => String(d.getMonth() + 1),
        DD: () => pad(d.getDate()),
        D: () => String(d.getDate()),
        dddd: () => WEEKDAYS[d.getDay()],
        ddd: () => WEEKDAYS[d.getDay()].slice(0, 3),
        HH: () => pad(d.getHours()),
        H: () => String(d.getHours()),
        hh: () => pad(d.getHours() % 12 || 12),
        h: () => String(d.getHours() % 12 || 12),
        mm: () => pad(d.getMinutes()),
        m: () => String(d.getMinutes()),
        ss: () => pad(d.getSeconds()),
        s: () => String(d.getSeconds()),
        A: () => d.getHours() < 12 ? 'AM' : 'PM',
        a: () => d.getHours() < 12 ? 'am' : 'pm',
    };
    return format.replace(/\[([^\]]*)]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|m|ss|s|A|a/g, (tok, literal) => literal ?? tokens[tok]?.() ?? tok);
}

registerMacro('time', (_a, ctx) => formatTime(ctx.now));
registerMacro('date', (_a, ctx) => `${MONTHS[ctx.now.getMonth()]} ${ctx.now.getDate()}, ${ctx.now.getFullYear()}`);
registerMacro('weekday', (_a, ctx) => WEEKDAYS[ctx.now.getDay()]);
registerMacro('isotime', (_a, ctx) => `${pad(ctx.now.getHours())}:${pad(ctx.now.getMinutes())}`);
registerMacro('isodate', (_a, ctx) => `${ctx.now.getFullYear()}-${pad(ctx.now.getMonth() + 1)}-${pad(ctx.now.getDate())}`);
registerMacro('datetimeformat', (args, ctx) => formatDate(ctx.now, args.join('::').trim()));
registerMacro('time_utc', (args, ctx) => {
    const offset = Number((args[0] ?? '').replace(/^:/, '')) || 0;
    const utc = new Date(ctx.now.getTime() + ctx.now.getTimezoneOffset() * 60000 + offset * 3600000);
    return formatTime(utc);
});

export function createMacroContext(partial: Partial<MacroContext>): MacroContext {
    return {
        user: 'User',
        char: '',
        persona: '',
        description: '',
        personality: '',
        scenario: '',
        mesExamples: '',
        mesExamplesRaw: '',
        charPrompt: '',
        charJailbreak: '',
        charDepthPrompt: '',
        creatorNotes: '',
        charVersion: '',
        firstMessage: '',
        model: '',
        input: '',
        lastMessage: '',
        lastUserMessage: '',
        lastCharMessage: '',
        lastMessageId: 0,
        chatVariables: {},
        globalVariables: {},
        messageVariables: {},
        outlets: {},
        now: new Date(),
        random: Math.random,
        seed: '',
        ...partial,
    };
}

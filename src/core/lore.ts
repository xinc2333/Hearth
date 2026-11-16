// World-info (lorebook) activation engine, following SillyTavern's checkWorldInfo():
// keyword/secondary logic, scan depth, recursion (with delay levels), min activations,
// inclusion groups (override / weight / scoring), probability, budget, sticky/cooldown/delay,
// decorators, and the eight insertion positions.

import type { LoreEntry, LoreSettings, Lorebook, Role, TimedEffect, TimedLoreState } from './types.ts';
import { escapeRegex, hashString } from './util.ts';

export function newLoreEntry(book: Lorebook, fields: Pick<LoreEntry, 'title' | 'content' | 'keys'>): LoreEntry {
    const maxId = Math.max(-1, ...book.entries.map(entry => Number(entry.id)).filter(Number.isFinite));
    return {
        id: String(maxId + 1), ...fields, enabled: true, activation: 'keyword', secondaryKeys: [], logic: 'and_any',
        position: 'before_char', depth: 4, role: 'system', outlet: '', order: 100, probability: 100, useProbability: true, ignoreBudget: false,
        recursion: { exclude: false, prevent: false, delayUntil: 0 }, group: { names: '', override: false, weight: 100, scoring: null },
        timed: { sticky: null, cooldown: null, delay: null },
        match: { scanDepth: null, caseSensitive: null, wholeWords: null, personaDescription: false, characterDescription: false, characterPersonality: false, characterDepthPrompt: false, scenario: false, creatorNotes: false },
        filter: { characters: [], tags: [], exclude: false }, triggers: [], automationId: '',
    };
}

export type LoreScope = 'chat' | 'persona' | 'character' | 'global';

export interface LoreSource {
    book: Lorebook;
    scope: LoreScope;
}

export interface GlobalScanData {
    personaDescription: string;
    characterDescription: string;
    characterPersonality: string;
    characterDepthPrompt: string;
    scenario: string;
    creatorNotes: string;
    trigger: string;
}

export interface LoreScanInput {
    sources: LoreSource[];
    /** Chat messages to scan, newest first. */
    chat: string[];
    settings: LoreSettings;
    maxContext: number;
    global: GlobalScanData;
    /** Text of injections flagged for scanning (author's note, depth prompt…). */
    injected: string[];
    characterName: string;
    characterTags: string[];
    timed?: TimedLoreState;
    dryRun?: boolean;
    macros: (text: string) => string;
    regex: (content: string, depth: number | null) => string;
    countTokens: (text: string) => number;
    random: () => number;
}

export interface ActivatedEntry {
    bookId: string;
    bookName: string;
    entryId: string;
    title: string;
    position: LoreEntry['position'];
    order: number;
    reason: string;
    content: string;
}

export interface LoreScanResult {
    before: string;
    after: string;
    examples: { position: 'before' | 'after'; content: string }[];
    depth: { depth: number; role: Role; entries: string[] }[];
    anTop: string[];
    anBottom: string[];
    outlets: Record<string, string[]>;
    activated: ActivatedEntry[];
    timed: TimedLoreState;
    budget: { limit: number; overflowed: boolean };
}

interface ScanEntry {
    key: string;
    hash: string;
    bookId: string;
    bookName: string;
    entry: LoreEntry;
    content: string;
    decorators: string[];
    reason?: string;
}

const MAX_SCAN_DEPTH = 1000;
const KNOWN_DECORATORS = ['@@activate', '@@dont_activate'];

const ScanState = {
    None: 0,
    Initial: 1,
    Recursion: 2,
    MinActivations: 3,
} as const;
type ScanState = typeof ScanState[keyof typeof ScanState];

/** A key written as /pattern/flags is a regex (ST parseRegexFromString). */
export function parseKeyRegex(input: string): RegExp | null {
    const match = input.match(/^\/([\w\W]+?)\/([gimsuy]*)$/);
    if (!match) {
        return null;
    }
    let [, pattern, flags] = match;
    if (pattern.match(/(^|[^\\])\//)) {
        return null;
    }
    pattern = pattern.replace('\\/', '/');
    try {
        return new RegExp(pattern, flags);
    } catch {
        return null;
    }
}

export function parseDecorators(content: string): [string[], string] {
    if (!content.startsWith('@@')) {
        return [[], content];
    }
    const isKnown = (line: string) => {
        const data = line.startsWith('@@@') ? line.substring(1) : line;
        return KNOWN_DECORATORS.some(d => data.startsWith(d));
    };
    const lines = content.split('\n');
    const decorators: string[] = [];
    let fallbacked = false;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('@@')) {
            if (lines[i].startsWith('@@@') && !fallbacked) {
                continue;
            }
            if (isKnown(lines[i])) {
                decorators.push(lines[i].startsWith('@@@') ? lines[i].substring(1) : lines[i]);
                fallbacked = false;
            } else {
                fallbacked = true;
            }
        } else {
            return [decorators, lines.slice(i).join('\n')];
        }
    }
    return [decorators, content];
}

/** Entries in ST's scan order: chat, persona, then character/global by strategy; each by order desc. */
function collectEntries(input: LoreScanInput): ScanEntry[] {
    const byScope: Record<LoreScope, ScanEntry[]> = { chat: [], persona: [], character: [], global: [] };
    const globalIds = new Set(input.sources.filter(s => s.scope === 'global').map(s => s.book.id));
    const chatIds = new Set(input.sources.filter(s => s.scope === 'chat').map(s => s.book.id));
    const personaIds = new Set(input.sources.filter(s => s.scope === 'persona').map(s => s.book.id));
    const seen = new Set<string>();
    for (const { book, scope } of input.sources) {
        if (scope === 'chat' && globalIds.has(book.id)) continue;
        if (scope === 'persona' && (chatIds.has(book.id) || globalIds.has(book.id))) continue;
        if (scope === 'character' && (globalIds.has(book.id) || chatIds.has(book.id) || personaIds.has(book.id))) continue;
        if (seen.has(`${scope}:${book.id}`)) continue;
        seen.add(`${scope}:${book.id}`);
        // ST iterates entries in uid order (object key order).
        const numeric = book.entries.every(e => /^\d+$/.test(e.id));
        const entries = numeric ? [...book.entries].sort((a, b) => Number(a.id) - Number(b.id)) : book.entries;
        for (const entry of entries) {
            const [decorators, content] = parseDecorators(entry.content || '');
            byScope[scope].push({
                key: `${book.id}.${entry.id}`,
                hash: String(hashString(JSON.stringify(entry))),
                bookId: book.id,
                bookName: book.name,
                entry,
                content,
                decorators,
            });
        }
    }
    const sortFn = (a: ScanEntry, b: ScanEntry) => b.entry.order - a.entry.order;
    let rest: ScanEntry[];
    switch (input.settings.strategy) {
        case 'evenly':
            rest = [...byScope.global, ...byScope.character].sort(sortFn);
            break;
        case 'global_first':
            rest = [...byScope.global.sort(sortFn), ...byScope.character.sort(sortFn)];
            break;
        default:
            rest = [...byScope.character.sort(sortFn), ...byScope.global.sort(sortFn)];
    }
    return [...byScope.chat.sort(sortFn), ...byScope.persona.sort(sortFn), ...rest];
}

class ScanBuffer {
    private depthBuffer: string[] = [];
    private recurseBuffer: string[] = [];
    private injectBuffer: string[];
    private skew = 0;
    private global: GlobalScanData;
    private settings: LoreSettings;

    constructor(messages: string[], global: GlobalScanData, injected: string[], settings: LoreSettings) {
        this.global = global;
        this.settings = settings;
        for (let depth = 0; depth < Math.min(messages.length, MAX_SCAN_DEPTH); depth++) {
            if (messages[depth]) {
                this.depthBuffer[depth] = messages[depth].trim();
            }
        }
        this.injectBuffer = [...injected];
    }

    get(entry: LoreEntry, state: ScanState): string {
        let depth = entry.match.scanDepth ?? this.getDepth();
        if (depth <= 0) {
            return '';
        }
        depth = Math.min(depth, MAX_SCAN_DEPTH);
        const MATCHER = '\x01';
        const JOINER = '\n' + MATCHER;
        let result = MATCHER + this.depthBuffer.slice(0, depth).join(JOINER);
        const g = this.global;
        if (entry.match.personaDescription && g.personaDescription) result += JOINER + g.personaDescription;
        if (entry.match.characterDescription && g.characterDescription) result += JOINER + g.characterDescription;
        if (entry.match.characterPersonality && g.characterPersonality) result += JOINER + g.characterPersonality;
        if (entry.match.characterDepthPrompt && g.characterDepthPrompt) result += JOINER + g.characterDepthPrompt;
        if (entry.match.scenario && g.scenario) result += JOINER + g.scenario;
        if (entry.match.creatorNotes && g.creatorNotes) result += JOINER + g.creatorNotes;
        if (this.injectBuffer.length) result += JOINER + this.injectBuffer.join(JOINER);
        if (this.recurseBuffer.length && state !== ScanState.MinActivations) {
            result += JOINER + this.recurseBuffer.join(JOINER);
        }
        return result;
    }

    matchKeys(haystack: string, needle: string, entry: LoreEntry): boolean {
        const keyRegex = parseKeyRegex(needle);
        if (keyRegex) {
            return keyRegex.test(haystack);
        }
        const caseSensitive = entry.match.caseSensitive ?? this.settings.caseSensitive;
        const hay = caseSensitive ? haystack : haystack.toLowerCase();
        const key = caseSensitive ? needle : needle.toLowerCase();
        const wholeWords = entry.match.wholeWords ?? this.settings.matchWholeWords;
        if (wholeWords) {
            if (key.split(/\s+/).length > 1) {
                return hay.includes(key);
            }
            return new RegExp(`(?:^|\\W)(${escapeRegex(key)})(?:$|\\W)`).test(hay);
        }
        return hay.includes(key);
    }

    score(entry: LoreEntry, state: ScanState, macros: (s: string) => string): number {
        const text = this.get(entry, state);
        const primary = entry.keys.filter(k => this.matchKeys(text, macros(k).trim(), entry)).length;
        const secondary = entry.secondaryKeys.filter(k => this.matchKeys(text, macros(k).trim(), entry)).length;
        if (!entry.keys.length) {
            return 0;
        }
        if (entry.secondaryKeys.length) {
            if (entry.logic === 'and_any') return primary + secondary;
            if (entry.logic === 'and_all') return secondary === entry.secondaryKeys.length ? primary + secondary : primary;
        }
        return primary;
    }

    addRecurse(text: string) { this.recurseBuffer.push(text); }
    hasRecurse() { return this.recurseBuffer.length > 0; }
    advanceScan() { this.skew++; }
    getDepth() { return this.settings.scanDepth + this.skew; }
}

class TimedEffects {
    readonly state: TimedLoreState;
    private active: Record<'sticky' | 'cooldown' | 'delay', Set<string>> = { sticky: new Set(), cooldown: new Set(), delay: new Set() };
    private chatLength: number;
    private entries: ScanEntry[];
    private dryRun: boolean;

    constructor(chatLength: number, entries: ScanEntry[], state: TimedLoreState | undefined, dryRun: boolean) {
        this.chatLength = chatLength;
        this.entries = entries;
        this.dryRun = dryRun;
        this.state = structuredClone(state ?? { sticky: {}, cooldown: {} });
        this.state.sticky ??= {};
        this.state.cooldown ??= {};
    }

    private effect(type: 'sticky' | 'cooldown', e: ScanEntry, isProtected: boolean): TimedEffect {
        return { hash: e.hash, start: this.chatLength, end: this.chatLength + Number(e.entry.timed[type]), protected: isProtected };
    }

    private checkType(type: 'sticky' | 'cooldown') {
        for (const [key, value] of Object.entries(this.state[type])) {
            const entry = this.entries.find(x => x.hash === String(value.hash));
            if (this.chatLength <= Number(value.start) && !value.protected) {
                delete this.state[type][key];
                continue;
            }
            if (!entry) {
                if (this.chatLength >= Number(value.end)) {
                    delete this.state[type][key];
                }
                continue;
            }
            if (!entry.entry.timed[type]) {
                delete this.state[type][key];
                continue;
            }
            if (this.chatLength >= Number(value.end)) {
                delete this.state[type][key];
                if (type === 'sticky' && entry.entry.timed.cooldown) {
                    this.state.cooldown[entry.key] = this.effect('cooldown', entry, true);
                    this.active.cooldown.add(entry.hash);
                }
                continue;
            }
            this.active[type].add(entry.hash);
        }
    }

    check() {
        if (!this.dryRun) {
            this.checkType('sticky');
            this.checkType('cooldown');
        }
        for (const e of this.entries) {
            if (e.entry.timed.delay && this.chatLength < e.entry.timed.delay) {
                this.active.delay.add(e.hash);
            }
        }
    }

    isActive(type: 'sticky' | 'cooldown' | 'delay', e: ScanEntry): boolean {
        return this.active[type].has(e.hash);
    }

    setActivated(entries: ScanEntry[]) {
        if (this.dryRun) return;
        for (const e of entries) {
            for (const type of ['sticky', 'cooldown'] as const) {
                if (e.entry.timed[type] && !this.state[type][e.key]) {
                    this.state[type][e.key] = this.effect(type, e, false);
                }
            }
        }
    }
}

function groupNames(e: ScanEntry): string[] {
    return e.entry.group.names.split(/,\s*/).filter(Boolean);
}

function filterByInclusionGroups(
    newEntries: ScanEntry[],
    allActivated: Map<string, ScanEntry>,
    buffer: ScanBuffer,
    state: ScanState,
    timed: TimedEffects,
    input: LoreScanInput,
) {
    const grouped: Record<string, ScanEntry[]> = {};
    for (const item of newEntries) {
        for (const g of groupNames(item)) {
            (grouped[g] ??= []).push(item);
        }
    }
    if (!Object.keys(grouped).length) {
        return;
    }
    const removeEntry = (e: ScanEntry) => {
        const i = newEntries.indexOf(e);
        if (i >= 0) newEntries.splice(i, 1);
    };
    const removeAllBut = (group: ScanEntry[], chosen: ScanEntry | null) => {
        for (const e of group) {
            if (e !== chosen) removeEntry(e);
        }
    };
    const hasSticky = new Map<string, boolean>();
    for (const [key, group] of Object.entries(grouped)) {
        hasSticky.set(key, false);
        const sticky = group.filter(x => timed.isActive('sticky', x));
        if (sticky.length) {
            for (const e of group) {
                if (!sticky.includes(e)) removeEntry(e);
            }
            hasSticky.set(key, true);
        }
        group.filter(x => timed.isActive('cooldown', x)).forEach(removeEntry);
        group.filter(x => timed.isActive('delay', x)).forEach(removeEntry);
    }
    for (const [key, group] of Object.entries(grouped)) {
        if (!input.settings.useGroupScoring && !group.some(x => x.entry.group.scoring)) continue;
        if (hasSticky.get(key)) continue;
        const scores = group.map(e => buffer.score(e.entry, state, input.macros));
        const max = Math.max(...scores);
        for (let i = 0; i < group.length; i++) {
            const scored = group[i].entry.group.scoring ?? input.settings.useGroupScoring;
            if (scored && scores[i] < max) {
                removeEntry(group[i]);
                group.splice(i, 1);
                scores.splice(i, 1);
                i--;
            }
        }
    }
    for (const [key, group] of Object.entries(grouped)) {
        if (hasSticky.get(key)) continue;
        if ([...allActivated.values()].some(x => x.entry.group.names === key)) {
            removeAllBut(group, null);
            continue;
        }
        if (group.length <= 1) continue;
        const prios = group.filter(x => x.entry.group.override).sort((a, b) => b.entry.order - a.entry.order);
        if (prios.length) {
            removeAllBut(group, prios[0]);
            continue;
        }
        const total = group.reduce((sum, e) => sum + (e.entry.group.weight ?? 100), 0);
        const roll = input.random() * total;
        let cur = 0;
        let winner: ScanEntry | null = null;
        for (const e of group) {
            cur += e.entry.group.weight ?? 100;
            if (roll <= cur) {
                winner = e;
                break;
            }
        }
        if (winner) {
            removeAllBut(group, winner);
        }
    }
}

function matchesFilter(e: ScanEntry, input: LoreScanInput): boolean {
    const f = e.entry.filter;
    if (f.characters.length) {
        const included = f.characters.includes(input.characterName);
        if (f.exclude ? included : !included) return false;
    }
    if (f.tags.length) {
        const included = input.characterTags.some(t => f.tags.includes(t));
        if (f.exclude ? included : !included) return false;
    }
    return true;
}

export function scanLore(input: LoreScanInput): LoreScanResult {
    const settings = input.settings;
    const sorted = collectEntries(input);
    const buffer = new ScanBuffer(input.chat, input.global, input.injected, settings);
    const timed = new TimedEffects(input.chat.length, sorted, input.timed, Boolean(input.dryRun));
    timed.check();

    let budget = Math.round(settings.budgetPercent * input.maxContext / 100) || 1;
    if (settings.budgetCap > 0 && budget > settings.budgetCap) {
        budget = settings.budgetCap;
    }
    const empty: LoreScanResult = { before: '', after: '', examples: [], depth: [], anTop: [], anBottom: [], outlets: {}, activated: [], timed: timed.state, budget: { limit: budget, overflowed: false } };
    if (!sorted.length) {
        return empty;
    }

    const delayLevels = [...new Set(sorted.filter(e => e.entry.recursion.delayUntil).map(e => e.entry.recursion.delayUntil))].sort((a, b) => a - b);
    let currentDelayLevel = delayLevels.shift() ?? 0;

    let state: ScanState = ScanState.Initial;
    let overflowed = false;
    let count = 0;
    const allActivated = new Map<string, ScanEntry>();
    const failedProbability = new Set<ScanEntry>();
    let allActivatedText = '';

    while (state) {
        if (settings.maxRecursionSteps && settings.maxRecursionSteps <= count) {
            break;
        }
        count++;
        let nextState: ScanState = ScanState.None;
        const activatedNow = new Set<ScanEntry>();

        for (const e of sorted) {
            const entry = e.entry;
            if (failedProbability.has(e) || allActivated.has(e.key)) continue;
            if (!entry.enabled) continue;
            if (entry.triggers.length && !entry.triggers.includes(input.global.trigger)) continue;
            if (!matchesFilter(e, input)) continue;

            const isSticky = timed.isActive('sticky', e);
            const isCooldown = timed.isActive('cooldown', e);
            if (timed.isActive('delay', e)) continue;
            if (isCooldown && !isSticky) continue;
            if (state !== ScanState.Recursion && entry.recursion.delayUntil && !isSticky) continue;
            if (state === ScanState.Recursion && entry.recursion.delayUntil && entry.recursion.delayUntil > currentDelayLevel && !isSticky) continue;
            if (state === ScanState.Recursion && settings.recursive && entry.recursion.exclude && !isSticky) continue;

            if (e.decorators.includes('@@activate')) {
                e.reason = '@@activate 装饰器';
                activatedNow.add(e);
                continue;
            }
            if (e.decorators.includes('@@dont_activate')) continue;
            if (entry.activation === 'constant') {
                e.reason = '常驻（蓝灯）';
                activatedNow.add(e);
                continue;
            }
            if (isSticky) {
                e.reason = '黏性（sticky）仍在生效';
                activatedNow.add(e);
                continue;
            }
            if (!entry.keys.length) continue;

            const text = buffer.get(entry, state);
            const primary = entry.keys.find(key => {
                const k = input.macros(key);
                return k && buffer.matchKeys(text, k.trim(), entry);
            });
            if (!primary) continue;

            if (!entry.secondaryKeys.length) {
                e.reason = `关键词「${primary}」`;
                activatedNow.add(e);
                continue;
            }

            let hasAny = false;
            let hasAll = true;
            let matched = false;
            for (const key of entry.secondaryKeys) {
                const k = input.macros(key);
                const hit = Boolean(k) && buffer.matchKeys(text, k.trim(), entry);
                if (hit) hasAny = true; else hasAll = false;
                if (entry.logic === 'and_any' && hit) { matched = true; break; }
                if (entry.logic === 'not_all' && !hit) { matched = true; break; }
            }
            if (!matched && entry.logic === 'not_any' && !hasAny) matched = true;
            if (!matched && entry.logic === 'and_all' && hasAll) matched = true;
            if (!matched) continue;
            e.reason = `关键词「${primary}」+ 次要关键词（${entry.logic}）`;
            activatedNow.add(e);
        }

        let newEntries: ScanEntry[];
        if (activatedNow.size > 1) {
            const index = new Map(sorted.map((e, i) => [e, i]));
            newEntries = [...activatedNow].sort((a, b) => {
                const sa = timed.isActive('sticky', a) ? 1 : 0;
                const sb = timed.isActive('sticky', b) ? 1 : 0;
                return sb - sa || (index.get(a) ?? -1) - (index.get(b) ?? -1);
            });
        } else {
            newEntries = [...activatedNow];
        }

        let newContent = '';
        const textTokens = input.countTokens(allActivatedText);
        filterByInclusionGroups(newEntries, allActivated, buffer, state, timed, input);

        let ignoresBudget = newEntries.filter(e => e.entry.ignoreBudget).length;
        for (const e of newEntries) {
            ignoresBudget -= e.entry.ignoreBudget ? 1 : 0;
            if (overflowed && !e.entry.ignoreBudget) {
                if (ignoresBudget > 0) continue;
                break;
            }
            const needsRoll = e.entry.useProbability && e.entry.probability !== 100 && !timed.isActive('sticky', e);
            if (needsRoll && !(input.random() * 100 <= e.entry.probability)) {
                failedProbability.add(e);
                continue;
            }
            e.content = input.macros(e.content);
            newContent += `${e.content}\n`;
            if (!e.entry.ignoreBudget && textTokens + input.countTokens(newContent) >= budget) {
                overflowed = true;
                continue;
            }
            allActivated.set(e.key, e);
        }

        const successful = newEntries.filter(x => !failedProbability.has(x));
        const forRecursion = successful.filter(x => !x.entry.recursion.prevent);

        if (settings.recursive && !overflowed && forRecursion.length) {
            nextState = ScanState.Recursion;
        }
        if (settings.recursive && !overflowed && state === ScanState.MinActivations && buffer.hasRecurse()) {
            nextState = ScanState.Recursion;
        }
        const minNotMet = settings.minActivations > 0 && allActivated.size < settings.minActivations;
        if (!nextState && !overflowed && minNotMet) {
            const overMax = (settings.minActivationsDepthMax > 0 && buffer.getDepth() > settings.minActivationsDepthMax)
                || buffer.getDepth() > input.chat.length;
            if (!overMax) {
                nextState = ScanState.MinActivations;
                buffer.advanceScan();
            }
        }
        if (nextState === ScanState.None && delayLevels.length) {
            nextState = ScanState.Recursion;
            currentDelayLevel = delayLevels.shift() ?? currentDelayLevel;
        }

        state = nextState;
        if (state) {
            const text = forRecursion.map(x => x.content).join('\n');
            if (text) {
                buffer.addRecurse(text);
                allActivatedText = text + '\n' + allActivatedText;
            }
        }
    }

    const result: LoreScanResult = { ...empty, budget: { limit: budget, overflowed } };
    const depthGroups: LoreScanResult['depth'] = [];
    const before: string[] = [];
    const after: string[] = [];
    const activated = [...allActivated.values()].sort((a, b) => b.entry.order - a.entry.order);
    for (const e of activated) {
        const entry = e.entry;
        const regexDepth = entry.position === 'at_depth' ? (entry.depth ?? 4) : null;
        const content = input.regex(e.content, regexDepth);
        result.activated.push({
            bookId: e.bookId,
            bookName: e.bookName,
            entryId: entry.id,
            title: entry.title || entry.keys.join(', ') || entry.id,
            position: entry.position,
            order: entry.order,
            reason: e.reason ?? '',
            content,
        });
        if (!content) continue;
        switch (entry.position) {
            case 'before_char': before.unshift(content); break;
            case 'after_char': after.unshift(content); break;
            case 'em_top': result.examples.unshift({ position: 'before', content }); break;
            case 'em_bottom': result.examples.unshift({ position: 'after', content }); break;
            case 'an_top': result.anTop.unshift(content); break;
            case 'an_bottom': result.anBottom.unshift(content); break;
            case 'at_depth': {
                const d = entry.depth ?? 4;
                const existing = depthGroups.find(g => g.depth === d && g.role === entry.role);
                if (existing) existing.entries.unshift(content);
                else depthGroups.push({ depth: d, role: entry.role, entries: [content] });
                break;
            }
            case 'outlet':
                if (entry.outlet) (result.outlets[entry.outlet] ??= []).push(content);
                break;
        }
    }
    result.before = before.join('\n');
    result.after = after.join('\n');
    result.depth = depthGroups;
    timed.setActivated(activated);
    result.timed = timed.state;
    return result;
}

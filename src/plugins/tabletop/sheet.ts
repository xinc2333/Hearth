// 跑团 data: the card's character sheet (written by 数据化适配), the live state each reply carries, and
// their readable YAML form. Keys in YAML are Chinese so the model and the reader write the same thing.
// Pure module: the window imports it too.
//
// Attitudes are numbers and only ever go from another character to the protagonist: what the
// protagonist feels is the player's to decide. How other characters stand with each other is a few
// words (a bond) that events rewrite.

import YAML from 'yaml';

import type { Character, Chat, ChatMessage } from '../../core/types.ts';
import { clamp, CORE_ATTRIBUTES, PROTAGONIST, SKILL_LEVELS } from './rules.ts';
import type { WorldState } from './world/state.ts';
import type { TurnAsk, TurnPlan } from './world/turn.ts';
import type { Reaction } from './world/flow.ts';

export const PLUGIN_ID = 'tabletop';

export const AXES = [
    ['affection', '亲近'],
    ['resentment', '怨恨'],
    ['trust', '信任'],
    ['respect', '敬重'],
    ['fear', '畏惧'],
    ['attraction', '吸引'],
] as const;
export type Axis = typeof AXES[number][0];
export const AXIS_LABEL = Object.fromEntries(AXES) as Record<Axis, string>;

export const TRAITS = ['敏感', '记仇', '多疑'] as const;
export type Trait = typeof TRAITS[number];

export interface Status {
    name: string;
    /** Attribute multipliers while the status lasts, e.g. { 力量: 0.8 }. */
    effects: Record<string, number>;
    note?: string;
}

export interface CharacterSheet {
    aliases: string[];
    attributes: Record<string, number>;
    skills: Record<string, string>;
    traits: Record<Trait, number>;
    status: Status[];
    /** Where the numbers come from (quotes from the card). */
    basis?: string;
    description?: string;
    /** Created during play from the model's estimate, not from the card. */
    temporary?: boolean;
}

export interface Reason {
    turn: number;
    text: string;
    change: string;
}

export interface Relation {
    from: string;
    to: string;
    /** Lasting attitude. */
    base: Record<Axis, number>;
    /** Passing feeling on top of it; fades each turn. */
    mood: Record<Axis, number>;
    familiarity: number;
    reasons: Reason[];
}

/** How two other characters stand with each other, in words. */
export interface Bond {
    between: [string, string];
    text: string;
    /** What changed it, newest last. */
    reasons: Reason[];
}

export interface Sheet {
    custom: Record<string, { note?: string; anchor?: string }>;
    characters: Record<string, CharacterSheet>;
    /** Other characters' attitudes toward the protagonist (`to` is always 主角). */
    relations: Relation[];
    bonds: Bond[];
}

export interface LogEntry {
    turn: number;
    text: string;
}

export interface TabletopState extends Sheet {
    /** Settled turns so far. */
    turn: number;
    /** Recent changes, newest last. */
    log: LogEntry[];
}

export const emptyAxes = (): Record<Axis, number> => ({ affection: 0, resentment: 0, trust: 0, respect: 0, fear: 0, attraction: 0 });
export const emptySheet = (): Sheet => ({ custom: {}, characters: {}, relations: [], bonds: [] });

const pairKey = (a: string, b: string) => [a, b].sort().join('\u0000');
export const sameBond = (x: Bond, a: string, b: string) => pairKey(x.between[0], x.between[1]) === pairKey(a, b);

export function newCharacter(): CharacterSheet {
    return { aliases: [], attributes: {}, skills: {}, traits: { 敏感: 1, 记仇: 1, 多疑: 1 }, status: [] };
}

// ---------------------------------------------------------------------------------------------
// Reading the YAML form
// ---------------------------------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

function num(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
        const m = v.replace(/[,，\s]/g, '').match(/^[×x*]?(-?\d+(?:\.\d+)?)/i);
        if (m) return Number(m[1]);
    }
    return null;
}

const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : typeof v === 'string' && v.trim() ? v.split(/[、,，]/).map(s => s.trim()).filter(Boolean) : []);

function readStatus(v: unknown): Status[] {
    if (!Array.isArray(v)) return [];
    const out: Status[] = [];
    for (const item of v) {
        if (typeof item === 'string' && item.trim()) {
            out.push({ name: item.trim(), effects: {} });
            continue;
        }
        if (!isRecord(item)) continue;
        const name = str(item['名称'] ?? item.name);
        if (!name) continue;
        const effects: Record<string, number> = {};
        const raw = item['影响'] ?? item.effects;
        if (isRecord(raw)) {
            for (const [k, f] of Object.entries(raw)) {
                const n = num(f);
                if (n !== null && n > 0) effects[k.trim()] = clamp(n, 0.1, 5);
            }
        }
        const note = str(item['说明'] ?? item.note);
        out.push({ name, effects, ...(note ? { note } : {}) });
    }
    return out;
}

function readCharacter(v: unknown): CharacterSheet {
    const c = newCharacter();
    if (!isRecord(v)) return c;
    c.aliases = list(v['别名']);
    const attrs = v['属性'];
    if (isRecord(attrs)) {
        for (const [k, raw] of Object.entries(attrs)) {
            const n = num(raw);
            if (n !== null) c.attributes[k.trim()] = clamp(Math.round(n), 1, 9999);
        }
    }
    const skills = v['特长'];
    if (isRecord(skills)) {
        for (const [k, raw] of Object.entries(skills)) {
            const level = str(raw);
            if (level in SKILL_LEVELS) c.skills[k.trim()] = level;
        }
    }
    const traits = v['性格'];
    if (isRecord(traits)) {
        for (const t of TRAITS) {
            const n = num(traits[t]);
            if (n !== null) c.traits[t] = clamp(n, 0.5, 2);
        }
    }
    c.status = readStatus(v['状态']);
    const basis = v['依据'];
    if (typeof basis === 'string' && basis.trim()) c.basis = basis.trim();
    else if (isRecord(basis)) c.basis = Object.entries(basis).map(([k, t]) => `${k}：${str(t)}`).join('\n');
    const description = str(v['简介']);
    if (description) c.description = description;
    if (v['临时'] === true) c.temporary = true;
    return c;
}

function readRelation(v: unknown): Relation | null {
    if (!isRecord(v)) return null;
    const from = str(v['从']);
    const to = str(v['对']) || PROTAGONIST;
    if (!from || from === to) return null;
    // Only others' attitudes toward the protagonist are numbers.
    if (from === PROTAGONIST) return null;
    const base = emptyAxes();
    for (const [axis, label] of AXES) {
        const n = num(v[label]);
        if (n !== null) base[axis] = clamp(Math.round(n), 0, 100);
    }
    const familiarity = clamp(Math.round(num(v['熟悉']) ?? 0), 0, 100);
    const reasons = list(v['缘由']).slice(-5).map(text => ({ turn: 0, text, change: '' }));
    return { from, to, base, mood: emptyAxes(), familiarity, reasons };
}

function readBond(v: unknown): Bond | null {
    if (!isRecord(v)) return null;
    const between = list(v['之间']);
    const text = str(v['现状']);
    if (between.length !== 2 || between[0] === between[1] || !text) return null;
    const reasons = list(v['缘由']).slice(-5).map(t => ({ turn: 0, text: t, change: '' }));
    return { between: [between[0], between[1]], text, reasons };
}

export function upsertBond(list: Bond[], b: Bond) {
    const i = list.findIndex(x => sameBond(x, b.between[0], b.between[1]));
    if (i >= 0) list[i] = b;
    else list.push(b);
}

/** An older numeric attitude between two other characters, kept as words. */
function bondFrom(r: Relation): Bond {
    const top = AXES.map(([axis, label]) => [label, clamp(Math.round(r.base[axis] + r.mood[axis]), 0, 100)] as const)
        .filter(([, v]) => v >= 40).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([label]) => label);
    return { between: [r.from, r.to], text: `${r.from}对${r.to}${top.length ? `：${top.join('、')}` : '：平淡'}`, reasons: r.reasons };
}
/** Reads a sheet from its YAML object form. */
export function readSheet(v: unknown): Sheet {
    const sheet = emptySheet();
    if (!isRecord(v)) return sheet;
    const custom = v['自定义属性'];
    if (isRecord(custom)) {
        for (const [k, raw] of Object.entries(custom)) {
            const r = isRecord(raw) ? raw : {};
            sheet.custom[k.trim()] = { ...(str(r['说明']) ? { note: str(r['说明']) } : {}), ...(str(r['基准']) ? { anchor: str(r['基准']) } : {}) };
        }
    }
    const chars = v['角色'];
    if (isRecord(chars)) {
        for (const [name, raw] of Object.entries(chars)) sheet.characters[name.trim()] = readCharacter(raw);
    }
    const rels = v['态度'];
    if (Array.isArray(rels)) {
        for (const raw of rels) {
            const r = readRelation(raw);
            if (r) upsertRelation(sheet.relations, r);
        }
    }
    const bonds = v['关系'];
    if (Array.isArray(bonds)) {
        for (const raw of bonds) {
            const b = readBond(raw);
            if (b) upsertBond(sheet.bonds, b);
        }
    }
    return normalizeSheet(sheet);
}

/** What a patch actually wrote: per character its keys, per relation its keys. */
export interface SheetGiven {
    characters: Record<string, Set<string>>;
    relations: Map<string, Set<string>>;
}

function parseYamlObject(text: string): Record<string, unknown> {
    const body = text.replace(/^\s*```[a-z]*\s*\n/i, '').replace(/\n\s*```\s*$/, '');
    let data: unknown;
    try {
        data = YAML.parse(body);
    } catch (error) {
        throw new Error(`角色表不是有效的 YAML：${(error as Error).message.split('\n')[0]}`);
    }
    if (!isRecord(data)) throw new Error('角色表需要「角色」「态度」和「关系」这几部分');
    return data;
}

/** Parses YAML text (an optional code fence is ignored). */
export function parseSheetYaml(text: string): Sheet {
    return parseSheetPatch(text).sheet;
}

/** Parses YAML text and records which parts it wrote, for merging into an existing sheet. */
export function parseSheetPatch(text: string): { sheet: Sheet; given: SheetGiven } {
    const data = parseYamlObject(text);
    const sheet = readSheet(data);
    if (!Object.keys(sheet.characters).length && !sheet.relations.length && !sheet.bonds.length && !Object.keys(sheet.custom).length) throw new Error('角色表里没有角色，也没有态度');
    const given: SheetGiven = { characters: {}, relations: new Map() };
    if (isRecord(data['角色'])) {
        for (const [name, raw] of Object.entries(data['角色'])) given.characters[name.trim()] = new Set(isRecord(raw) ? Object.keys(raw) : []);
    }
    if (Array.isArray(data['态度'])) {
        for (const raw of data['态度']) {
            if (isRecord(raw)) given.relations.set(`${str(raw['从'])}→${str(raw['对']) || PROTAGONIST}`, new Set(Object.keys(raw)));
        }
    }
    return { sheet, given };
}

function upsertRelation(list: Relation[], r: Relation) {
    const i = list.findIndex(x => x.from === r.from && x.to === r.to);
    if (i >= 0) list[i] = r;
    else list.push(r);
}

/**
 * Merges a patch into a sheet. Without `given`, listed characters and relations replace the same
 * ones. With it, only what the patch wrote changes: attributes, skills and traits key by key, the
 * other parts of a character as a whole, and the attitude lines it named.
 */
export function mergeSheet(base: Sheet, patch: Sheet, given?: SheetGiven): Sheet {
    const next = structuredClone(base);
    Object.assign(next.custom, patch.custom);
    for (const [name, c] of Object.entries(patch.characters)) {
        const old = next.characters[name];
        const keys = given?.characters[name];
        if (!old || !keys) {
            next.characters[name] = c;
            continue;
        }
        if (keys.has('属性')) Object.assign(old.attributes, c.attributes);
        if (keys.has('特长')) Object.assign(old.skills, c.skills);
        if (keys.has('性格')) Object.assign(old.traits, c.traits);
        if (keys.has('状态')) old.status = c.status;
        if (keys.has('别名')) old.aliases = c.aliases;
        if (keys.has('依据')) old.basis = c.basis;
        if (keys.has('简介')) old.description = c.description;
        if (keys.has('临时')) old.temporary = c.temporary;
    }
    for (const r of patch.relations) {
        const old = next.relations.find(x => x.from === r.from && x.to === r.to);
        const keys = given?.relations.get(`${r.from}→${r.to}`);
        if (!old || !keys) {
            upsertRelation(next.relations, r);
            continue;
        }
        for (const [axis, label] of AXES) {
            if (keys.has(label)) {
                old.base[axis] = r.base[axis];
                old.mood[axis] = 0;
            }
        }
        if (keys.has('熟悉')) old.familiarity = r.familiarity;
        if (keys.has('缘由')) old.reasons = r.reasons;
    }
    for (const b of patch.bonds) upsertBond(next.bonds, b);
    return next;
}

export function removeCharacter(sheet: Sheet, name: string): Sheet {
    const next = structuredClone(sheet);
    const key = resolveName(next, name);
    if (!key) throw new Error(`角色表里没有「${name}」`);
    delete next.characters[key];
    next.relations = next.relations.filter(r => r.from !== key && r.to !== key);
    next.bonds = next.bonds.filter(b => !b.between.includes(key));
    return next;
}

// ---------------------------------------------------------------------------------------------
// Writing the YAML form
// ---------------------------------------------------------------------------------------------

export function relationValue(r: Relation, axis: Axis): number {
    return clamp(Math.round(r.base[axis] + r.mood[axis]), 0, 100);
}

function characterYaml(name: string, c: CharacterSheet): Record<string, unknown> {
    return {
        ...(c.aliases.length ? { 别名: c.aliases } : {}),
        属性: c.attributes,
        ...(Object.keys(c.skills).length ? { 特长: c.skills } : {}),
        // Traits shape a character's attitudes; the protagonist has none on record.
        ...(name === PROTAGONIST ? {} : { 性格: c.traits }),
        ...(c.status.length ? { 状态: c.status.map(s => ({ 名称: s.name, ...(Object.keys(s.effects).length ? { 影响: s.effects } : {}), ...(s.note ? { 说明: s.note } : {}) })) } : {}),
        ...(c.description ? { 简介: c.description } : {}),
        ...(c.basis ? { 依据: c.basis } : {}),
        ...(c.temporary ? { 临时: true } : {}),
    };
}

/** The YAML object form; relations show their current values (lasting attitude plus passing feeling). */
export function sheetYamlObject(sheet: Sheet): Record<string, unknown> {
    return {
        ...(Object.keys(sheet.custom).length ? { 自定义属性: Object.fromEntries(Object.entries(sheet.custom).map(([k, v]) => [k, { ...(v.note ? { 说明: v.note } : {}), ...(v.anchor ? { 基准: v.anchor } : {}) }])) } : {}),
        角色: Object.fromEntries(Object.entries(sheet.characters).map(([k, c]) => [k, characterYaml(k, c)])),
        态度: sheet.relations.map(r => ({
            从: r.from,
            对: r.to,
            ...Object.fromEntries(AXES.map(([axis, label]) => [label, relationValue(r, axis)])),
            熟悉: r.familiarity,
            ...(r.reasons.length ? { 缘由: r.reasons.map(x => x.text) } : {}),
        })),
        ...(sheet.bonds.length ? {
            关系: sheet.bonds.map(b => ({ 之间: b.between, 现状: b.text, ...(b.reasons.length ? { 缘由: b.reasons.map(x => x.text) } : {}) })),
        } : {}),
    };
}

export function sheetToYaml(sheet: Sheet): string {
    return YAML.stringify(sheetYamlObject(sheet), { lineWidth: 0 }).trimEnd();
}

// ---------------------------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------------------------

/** The sheet key a name refers to: exact name, alias, the user's name or 主角/我/你 for the protagonist. */
export function resolveName(sheet: Pick<Sheet, 'characters'>, name: string, userName = ''): string | null {
    const n = name.replace(/[（(].*?[)）]/g, '').trim();
    if (!n) return null;
    if (sheet.characters[n]) return n;
    if (n === PROTAGONIST || n === userName || /^(我|你|玩家|用户|\{\{user\}\})$/i.test(n)) return sheet.characters[PROTAGONIST] ? PROTAGONIST : null;
    for (const [key, c] of Object.entries(sheet.characters)) {
        if (c.aliases.includes(n)) return key;
    }
    const lower = n.toLowerCase();
    for (const key of Object.keys(sheet.characters)) {
        if (key.toLowerCase() === lower) return key;
    }
    return null;
}

/** The name to file a new character under (主角 for the user). */
export function canonicalName(name: string, userName = ''): string {
    const n = name.replace(/[（(].*?[)）]/g, '').trim();
    return n === userName || /^(我|你|玩家|用户)$/.test(n) ? PROTAGONIST : n;
}

// ---------------------------------------------------------------------------------------------
// Where the data lives
// ---------------------------------------------------------------------------------------------

/** The card's sheet (written by 数据化适配), if any. */
export function cardSheet(character: Pick<Character, 'extra'> | undefined | null): Sheet | null {
    const raw = (character?.extra?.hearth as { rpg?: Sheet } | undefined)?.rpg;
    if (!raw || typeof raw !== 'object' || !raw.characters) return null;
    return normalizeSheet(raw);
}

/** Fills missing parts of stored data (older or hand-edited copies). */
export function normalizeSheet<T extends Sheet>(raw: T): T {
    const out = structuredClone(raw);
    out.custom ??= {};
    out.characters ??= {};
    for (const c of Object.values(out.characters)) {
        c.aliases ??= [];
        c.attributes ??= {};
        c.skills ??= {};
        c.traits = Object.assign({ 敏感: 1, 记仇: 1, 多疑: 1 }, c.traits ?? {});
        c.status ??= [];
    }
    const relations = (out.relations ?? []).map(r => ({ ...r, base: { ...emptyAxes(), ...r.base }, mood: { ...emptyAxes(), ...r.mood }, familiarity: r.familiarity ?? 0, reasons: r.reasons ?? [] }));
    out.bonds = (out.bonds ?? []).map(b => ({ ...b, reasons: b.reasons ?? [] }));
    // Older data: the protagonist's own attitudes are dropped, attitudes between others become words.
    out.relations = [];
    for (const r of relations) {
        if (r.from === PROTAGONIST) continue;
        if (r.to === PROTAGONIST) out.relations.push(r);
        else if (!out.bonds.some(b => sameBond(b, r.from, r.to))) out.bonds.push(bondFrom(r));
    }
    return out;
}

export function stateFromSheet(sheet: Sheet): TabletopState {
    return { ...structuredClone(sheet), turn: 0, log: [] };
}

export interface SettleLine {
    line: string;
    ok: boolean;
    text: string;
    /** What changed, for the line under the reply. */
    kind?: 'attitude' | 'familiarity' | 'bond' | 'status' | 'new' | 'growth' | 'world';
    /** Whose it is (the character whose attitude, status or growth changed). */
    who?: string;
}

export interface SwipeData {
    state?: TabletopState;
    /** A 世界 chat's world after this reply version (docs/world.md). */
    world?: WorldState;
    /**
     * The settlement of this reply version: what the model reported (as it wrote it) and what came of
     * each item. `status` is pending while the settlement step runs, failed when it could not finish.
     */
    settle?: { raw: string; results: SettleLine[]; status?: 'pending' | 'failed'; error?: string; at?: number; present?: string[] };
}

export interface MessageData {
    ruling?: Ruling;
    /** A 世界 chat: this turn's plan and the world after it, before the settlement (shared by every version). */
    world?: { plan: TurnPlan; after: WorldState; reactions?: Reaction[] };
}

export interface CheckView {
    actor: string;
    action: string;
    reason: string;
    attribute: string;
    skill?: string;
    /** Difficulty, or the opponent's effective value. */
    against: { difficulty: number } | { opponent: string; attribute: string; value: number; steps: string[] };
    modifiers: { reason: string; factor: number }[];
    hidden: boolean;
    outcomes: Record<string, string>;
    value: number;
    steps: string[];
    chance: number;
    line: number;
    roll: number;
    tier: string;
    outcome: string;
}

export interface Ruling {
    /** The user message this ruling is for; a changed message is ruled again. */
    userText: string;
    checks: CheckView[];
    /** Characters created from the model's estimates while ruling. */
    added?: Record<string, CharacterSheet>;
    /** Why there was no ruling: 检定绝对通过 was on. */
    skipped?: 'pass';
    rounds?: number;
    think?: string;
    error?: string;
    /** A 世界 chat: how long the turn takes and where the protagonist goes. */
    ask?: TurnAsk;
}

export function swipeData(message: ChatMessage | undefined): SwipeData | undefined {
    const swipe = message?.swipes[message.activeSwipe];
    return swipe?.plugins?.[PLUGIN_ID] as SwipeData | undefined;
}

export function messageData(message: ChatMessage | undefined): MessageData | undefined {
    return message?.plugins?.[PLUGIN_ID] as MessageData | undefined;
}

/**
 * The state before message `index` (exclusive): the nearest earlier reply that carries one, else the
 * chat's own starting state, else the card's sheet. Null when there is no 跑团 data at all.
 */
export function stateBefore(chat: Pick<Chat, 'messages' | 'plugins'>, index: number, character?: Pick<Character, 'extra'> | null): TabletopState | null {
    for (let i = Math.min(index, chat.messages.length) - 1; i >= 0; i--) {
        const state = swipeData(chat.messages[i])?.state;
        if (state) return normalizeSheet(state);
    }
    const base = (chat.plugins?.[PLUGIN_ID] as { base?: TabletopState } | undefined)?.base;
    if (base) return normalizeSheet(base);
    const sheet = cardSheet(character);
    return sheet ? stateFromSheet(sheet) : null;
}

/** Where a hand edit of the current state goes: the last reply's active version, else the chat. */
export function stateTarget(chat: Pick<Chat, 'messages'>): string[] {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
        const m = chat.messages[i];
        if (m.role === 'assistant' && m.mode !== 'edit' && swipeData(m)?.state) {
            return ['messages', `@${m.id}`, 'swipes', `@${m.swipes[m.activeSwipe].id}`, 'plugins', PLUGIN_ID, 'state'];
        }
    }
    return ['plugins', PLUGIN_ID, 'base'];
}

/** Applies a hand-edited YAML to a state: changed relation values become lasting. */
export function applyYamlEdit(state: TabletopState, text: string): TabletopState {
    const edited = parseSheetYaml(text);
    const next: TabletopState = { ...structuredClone(state), custom: edited.custom, characters: edited.characters, relations: [], bonds: edited.bonds };
    for (const r of edited.relations) {
        const old = state.relations.find(x => x.from === r.from && x.to === r.to);
        if (!old) {
            next.relations.push(r);
            continue;
        }
        const rel = structuredClone(old);
        for (const [axis] of AXES) {
            if (r.base[axis] !== relationValue(old, axis)) {
                rel.base[axis] = r.base[axis];
                rel.mood[axis] = 0;
            }
        }
        rel.familiarity = r.familiarity;
        next.relations.push(rel);
    }
    return next;
}

export { CORE_ATTRIBUTES, PROTAGONIST };

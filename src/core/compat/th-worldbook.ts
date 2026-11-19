// 酒馆助手 (JS-Slash-Runner) worldbook entries ↔ Hearth lore entries. Card interfaces read and write
// worldbooks in 酒馆助手's shape (getWorldbook / replaceWorldbook); Hearth turns a written list into
// ops on the lorebook, field by field, so every change is in the history and can be undone. Fields
// that 酒馆助手 does not have (inclusion groups, match flags, filters…) are kept as they are.

import type { Op } from '../ops.ts';
import type { LoreActivation, LoreEntry, LoreLogic, LorePosition, Lorebook, Role } from '../types.ts';
import { hashString } from '../util.ts';
import { newLoreEntry } from '../lore.ts';

export interface ThWorldbookEntry {
    uid: number;
    name: string;
    enabled: boolean;
    strategy: {
        type: 'constant' | 'selective' | 'vectorized';
        keys: string[];
        keys_secondary: { logic: LoreLogic; keys: string[] };
        scan_depth: 'same_as_global' | number;
    };
    position: { type: string; role: Role; depth: number; order: number };
    content: string;
    probability: number;
    recursion: { prevent_incoming: boolean; prevent_outgoing: boolean; delay_until: number | null };
    effect: { sticky: number | null; cooldown: number | null; delay: number | null };
    extra?: Record<string, unknown>;
}

const POSITION_TO_TH: Record<LorePosition, string> = {
    before_char: 'before_character_definition',
    after_char: 'after_character_definition',
    em_top: 'before_example_messages',
    em_bottom: 'after_example_messages',
    an_top: 'before_author_note',
    an_bottom: 'after_author_note',
    at_depth: 'at_depth',
    outlet: 'outlet',
};
const POSITION_FROM_TH = Object.fromEntries(Object.entries(POSITION_TO_TH).map(([k, v]) => [v, k])) as Record<string, LorePosition>;

const ACTIVATION_TO_TH: Record<LoreActivation, ThWorldbookEntry['strategy']['type']> = { constant: 'constant', keyword: 'selective', vector: 'vectorized' };
const ACTIVATION_FROM_TH: Record<string, LoreActivation> = { constant: 'constant', selective: 'keyword', vectorized: 'vector' };
const LOGICS: LoreLogic[] = ['and_any', 'not_all', 'not_any', 'and_all'];
const ROLES: Role[] = ['system', 'user', 'assistant'];

/** 酒馆助手 entry ids are numbers. Hearth's are numeric strings; any other id gets a stable number. */
export function thUid(id: string): number {
    return /^\d+$/.test(id) ? Number(id) : 1_000_000_000 + (Math.abs(hashString(id)) % 1_000_000_000);
}

export function toThEntry(entry: LoreEntry): ThWorldbookEntry {
    return {
        uid: thUid(entry.id),
        name: entry.title,
        enabled: entry.enabled,
        strategy: {
            type: ACTIVATION_TO_TH[entry.activation] ?? 'selective',
            keys: [...entry.keys],
            keys_secondary: { logic: entry.logic, keys: [...entry.secondaryKeys] },
            scan_depth: entry.match.scanDepth ?? 'same_as_global',
        },
        position: { type: POSITION_TO_TH[entry.position] ?? 'before_character_definition', role: entry.role, depth: entry.depth, order: entry.order },
        content: entry.content,
        probability: entry.useProbability ? entry.probability : 100,
        recursion: { prevent_incoming: entry.recursion.exclude, prevent_outgoing: entry.recursion.prevent, delay_until: entry.recursion.delayUntil || null },
        effect: { ...entry.timed },
        extra: structuredClone((entry.extra?.th as Record<string, unknown> | undefined) ?? {}),
    };
}

export function toThWorldbook(book: Lorebook): ThWorldbookEntry[] {
    return book.entries.map(toThEntry);
}

const keyText = (k: unknown) => (k instanceof RegExp ? String(k) : String(k ?? ''));
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : fallback);
const nullableNum = (v: unknown, fallback: number | null) => (v === null ? null : v === undefined ? fallback : num(v, fallback ?? 0));

/** The entry a written 酒馆助手 entry describes, starting from the stored one (or new defaults). */
export function fromThEntry(raw: Partial<ThWorldbookEntry> & Record<string, unknown>, base: LoreEntry): LoreEntry {
    const entry = structuredClone(base);
    if (raw.name !== undefined) entry.title = String(raw.name);
    if (raw.content !== undefined) entry.content = String(raw.content);
    if (raw.enabled !== undefined) entry.enabled = Boolean(raw.enabled);
    const s = raw.strategy;
    if (s && typeof s === 'object') {
        if (s.type !== undefined) entry.activation = ACTIVATION_FROM_TH[s.type] ?? entry.activation;
        if (Array.isArray(s.keys)) entry.keys = s.keys.map(keyText).filter(Boolean);
        if (s.keys_secondary && typeof s.keys_secondary === 'object') {
            if (LOGICS.includes(s.keys_secondary.logic)) entry.logic = s.keys_secondary.logic;
            if (Array.isArray(s.keys_secondary.keys)) entry.secondaryKeys = s.keys_secondary.keys.map(keyText).filter(Boolean);
        }
        if (s.scan_depth !== undefined) entry.match.scanDepth = s.scan_depth === 'same_as_global' ? null : num(s.scan_depth, entry.match.scanDepth ?? 0);
    }
    const p = raw.position;
    if (p && typeof p === 'object') {
        if (p.type !== undefined && POSITION_FROM_TH[p.type]) entry.position = POSITION_FROM_TH[p.type];
        if (p.role !== undefined && ROLES.includes(p.role)) entry.role = p.role;
        if (p.depth !== undefined) entry.depth = num(p.depth, entry.depth);
        if (p.order !== undefined) entry.order = num(p.order, entry.order);
    }
    if (raw.probability !== undefined) {
        entry.probability = Math.max(0, Math.min(100, num(raw.probability, entry.probability)));
        if (entry.probability < 100) entry.useProbability = true;
    }
    const r = raw.recursion;
    if (r && typeof r === 'object') {
        if (r.prevent_incoming !== undefined) entry.recursion.exclude = Boolean(r.prevent_incoming);
        if (r.prevent_outgoing !== undefined) entry.recursion.prevent = Boolean(r.prevent_outgoing);
        if (r.delay_until !== undefined) entry.recursion.delayUntil = r.delay_until === null ? 0 : num(r.delay_until, 0);
    }
    const e = raw.effect;
    if (e && typeof e === 'object') {
        entry.timed = {
            sticky: nullableNum(e.sticky, entry.timed.sticky),
            cooldown: nullableNum(e.cooldown, entry.timed.cooldown),
            delay: nullableNum(e.delay, entry.timed.delay),
        };
    }
    if (raw.extra !== undefined) {
        const extra = { ...(entry.extra ?? {}) };
        if (raw.extra && typeof raw.extra === 'object' && Object.keys(raw.extra).length) extra.th = structuredClone(raw.extra);
        else delete extra.th;
        if (Object.keys(extra).length || entry.extra) entry.extra = extra;
    }
    return entry;
}

/** Top-level entry fields compared one by one; a change becomes one `set` op. */
const FIELDS = ['title', 'content', 'enabled', 'activation', 'keys', 'secondaryKeys', 'logic', 'position', 'depth', 'role', 'order',
    'probability', 'useProbability', 'recursion', 'timed', 'match', 'extra'] as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Ops that make `book` hold the written list: changed fields of existing entries (matched by uid),
 * new entries appended, entries left out removed. The stored order of kept entries does not change.
 */
export function worldbookOps(book: Lorebook, written: unknown[]): Op[] {
    const byUid = new Map(book.entries.map(e => [thUid(e.id), e]));
    const kept = new Set<string>();
    const ops: Op[] = [];
    const added: LoreEntry[] = [];
    for (const item of written) {
        if (!item || typeof item !== 'object') continue;
        const raw = item as Partial<ThWorldbookEntry> & Record<string, unknown>;
        const uid = raw.uid === undefined || raw.uid === null ? null : num(raw.uid, NaN);
        const existing = uid !== null && Number.isFinite(uid) ? byUid.get(uid) : undefined;
        if (existing && !kept.has(existing.id)) {
            kept.add(existing.id);
            const next = fromThEntry(raw, existing);
            for (const field of FIELDS) {
                if (!same(existing[field], next[field])) ops.push({ op: 'set', path: ['entries', `@${existing.id}`, field], value: next[field] });
            }
            continue;
        }
        const pool = { ...book, entries: [...book.entries, ...added] };
        const fresh = newLoreEntry(pool, { title: '', content: '', keys: [] });
        const taken = new Set(pool.entries.map(e => e.id));
        if (uid !== null && Number.isInteger(uid) && uid >= 0 && !taken.has(String(uid))) fresh.id = String(uid);
        const entry = fromThEntry(raw, fresh);
        added.push(entry);
    }
    for (const entry of book.entries) {
        if (!kept.has(entry.id)) ops.push({ op: 'unset', path: ['entries', `@${entry.id}`] });
    }
    for (const entry of added) ops.push({ op: 'insert', path: ['entries'], value: entry });
    return ops;
}

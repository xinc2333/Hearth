import type { CardScript, LoreEntry, LoreLogic, LorePosition, Lorebook, Role } from '../types.ts';
import { asBool, asNumber, asString, asStringArray, isRecord, newId } from '../util.ts';

const LOGIC: LoreLogic[] = ['and_any', 'not_all', 'not_any', 'and_all'];
const POSITIONS: LorePosition[] = ['before_char', 'after_char', 'an_top', 'an_bottom', 'at_depth', 'em_top', 'em_bottom', 'outlet'];
const ROLES: Role[] = ['system', 'user', 'assistant'];

export const DEFAULT_LORE_DEPTH = 4;
export const DEFAULT_GROUP_WEIGHT = 100;

function nullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function nullableBool(value: unknown): boolean | null {
    return value === null || value === undefined ? null : Boolean(value);
}

/** Maps an entry in SillyTavern's world-info file format to a LoreEntry. */
export function fromStWorldEntry(raw: Record<string, unknown>, fallbackId: string): LoreEntry {
    const selective = asBool(raw.selective, true);
    const secondary = asStringArray(raw.keysecondary);
    const filter = isRecord(raw.characterFilter) ? raw.characterFilter : {};
    const delayUntil = raw.delayUntilRecursion === true ? 1 : asNumber(raw.delayUntilRecursion, 0);
    const extra: Record<string, unknown> = { st: raw };
    if (!selective && secondary.length) {
        // ST ignores secondary keys on non-selective entries; keep them for export only.
        extra.inactiveSecondaryKeys = secondary;
    }
    return {
        id: raw.uid !== undefined && raw.uid !== null ? String(raw.uid) : fallbackId,
        title: asString(raw.comment),
        content: asString(raw.content),
        enabled: !asBool(raw.disable, false),
        activation: asBool(raw.constant, false) ? 'constant' : asBool(raw.vectorized, false) ? 'vector' : 'keyword',
        keys: asStringArray(raw.key),
        secondaryKeys: selective ? secondary : [],
        logic: LOGIC[asNumber(raw.selectiveLogic, 0)] ?? 'and_any',
        position: POSITIONS[asNumber(raw.position, 0)] ?? 'before_char',
        depth: asNumber(raw.depth, DEFAULT_LORE_DEPTH),
        role: ROLES[asNumber(raw.role, 0)] ?? 'system',
        outlet: asString(raw.outletName),
        order: asNumber(raw.order, 100),
        probability: asNumber(raw.probability, 100),
        useProbability: asBool(raw.useProbability, true),
        ignoreBudget: asBool(raw.ignoreBudget, false),
        recursion: {
            exclude: asBool(raw.excludeRecursion, false),
            prevent: asBool(raw.preventRecursion, false),
            delayUntil,
        },
        group: {
            names: asString(raw.group),
            override: asBool(raw.groupOverride, false),
            weight: asNumber(raw.groupWeight, DEFAULT_GROUP_WEIGHT),
            scoring: nullableBool(raw.useGroupScoring),
        },
        timed: {
            sticky: nullableNumber(raw.sticky),
            cooldown: nullableNumber(raw.cooldown),
            delay: nullableNumber(raw.delay),
        },
        match: {
            scanDepth: nullableNumber(raw.scanDepth),
            caseSensitive: nullableBool(raw.caseSensitive),
            wholeWords: nullableBool(raw.matchWholeWords),
            personaDescription: asBool(raw.matchPersonaDescription, false),
            characterDescription: asBool(raw.matchCharacterDescription, false),
            characterPersonality: asBool(raw.matchCharacterPersonality, false),
            characterDepthPrompt: asBool(raw.matchCharacterDepthPrompt, false),
            scenario: asBool(raw.matchScenario, false),
            creatorNotes: asBool(raw.matchCreatorNotes, false),
        },
        filter: {
            characters: asStringArray(filter.names),
            tags: asStringArray(filter.tags),
            exclude: asBool(filter.isExclude, false),
        },
        triggers: asStringArray(raw.triggers),
        automationId: asString(raw.automationId),
        extra,
    };
}

/** Converts a V2/V3 card `character_book` entry to ST's world-info format (ST convertCharacterBook). */
export function cardBookEntryToStWorld(entry: Record<string, unknown>, index: number): Record<string, unknown> {
    const ext = isRecord(entry.extensions) ? entry.extensions : {};
    return {
        uid: entry.id ?? index,
        key: asStringArray(entry.keys),
        keysecondary: asStringArray(entry.secondary_keys),
        comment: asString(entry.comment),
        content: asString(entry.content),
        constant: asBool(entry.constant, false),
        selective: asBool(entry.selective, false),
        order: asNumber(entry.insertion_order, 100),
        position: ext.position ?? (entry.position === 'before_char' ? 0 : 1),
        excludeRecursion: ext.exclude_recursion ?? false,
        preventRecursion: ext.prevent_recursion ?? false,
        delayUntilRecursion: ext.delay_until_recursion ?? false,
        disable: !asBool(entry.enabled, true),
        probability: ext.probability ?? 100,
        useProbability: ext.useProbability ?? true,
        depth: ext.depth ?? DEFAULT_LORE_DEPTH,
        selectiveLogic: ext.selectiveLogic ?? 0,
        outletName: ext.outlet_name ?? '',
        group: ext.group ?? '',
        groupOverride: ext.group_override ?? false,
        groupWeight: ext.group_weight ?? DEFAULT_GROUP_WEIGHT,
        scanDepth: ext.scan_depth ?? null,
        caseSensitive: ext.case_sensitive ?? null,
        matchWholeWords: ext.match_whole_words ?? null,
        useGroupScoring: ext.use_group_scoring ?? null,
        automationId: ext.automation_id ?? '',
        role: ext.role ?? 0,
        vectorized: ext.vectorized ?? false,
        sticky: ext.sticky ?? null,
        cooldown: ext.cooldown ?? null,
        delay: ext.delay ?? null,
        matchPersonaDescription: ext.match_persona_description ?? false,
        matchCharacterDescription: ext.match_character_description ?? false,
        matchCharacterPersonality: ext.match_character_personality ?? false,
        matchCharacterDepthPrompt: ext.match_character_depth_prompt ?? false,
        matchScenario: ext.match_scenario ?? false,
        matchCreatorNotes: ext.match_creator_notes ?? false,
        triggers: ext.triggers ?? [],
        ignoreBudget: ext.ignore_budget ?? false,
        characterFilter: ext.character_filter,
        extensions: ext,
    };
}

function toEntries(rawEntries: unknown): LoreEntry[] {
    const list = Array.isArray(rawEntries)
        ? rawEntries
        : isRecord(rawEntries) ? Object.values(rawEntries) : [];
    const entries = list
        .filter(isRecord)
        .map((raw, i) => fromStWorldEntry(raw, String(i)));
    // Keep ST's display order when present.
    return entries
        .map((entry, i) => ({ entry, key: asNumber((entry.extra?.st as Record<string, unknown>)?.displayIndex, i) }))
        .sort((a, b) => a.key - b.key)
        .map(x => x.entry);
}

/** Imports a SillyTavern world-info JSON file. */
export function importStLorebook(raw: Record<string, unknown>, name: string, file: string): Lorebook {
    const now = Date.now();
    const { entries, ...rest } = raw;
    return {
        id: newId('lb'),
        kind: 'lorebook',
        name: asString(raw.name) || name,
        description: asString(raw.description),
        createdAt: now,
        updatedAt: now,
        entries: toEntries(entries),
        source: { format: 'st-world', file, importedAt: now },
        extra: { st: rest },
    };
}

/** Imports a card-embedded `character_book`. */
export function importCardBook(book: Record<string, unknown>, characterName: string, file: string): Lorebook {
    const now = Date.now();
    const rawEntries = Array.isArray(book.entries) ? book.entries.filter(isRecord) : [];
    const { entries: _entries, ...rest } = book;
    return {
        id: newId('lb'),
        kind: 'lorebook',
        name: asString(book.name) || `${characterName} 的世界书`,
        description: asString(book.description),
        createdAt: now,
        updatedAt: now,
        entries: rawEntries.map((e, i) => fromStWorldEntry(cardBookEntryToStWorld(e, i), String(i))),
        source: { format: 'card-book', file, importedAt: now },
        extra: { st: rest },
    };
}

/** Normalizes TavernHelper-style script lists (several historical shapes). */
export function importScripts(raw: unknown): CardScript[] {
    const list = Array.isArray(raw) ? raw : [];
    return list.filter(isRecord).map((item, i) => {
        const value = isRecord(item.value) ? item.value : item;
        return {
            id: asString(value.id) || `script_${i}`,
            name: asString(value.name, `脚本 ${i + 1}`),
            enabled: asBool(value.enabled, true),
            type: asString(item.type, 'script'),
            content: asString(value.content),
            raw: item,
        };
    });
}

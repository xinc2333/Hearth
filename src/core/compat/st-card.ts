import type { Character, Lorebook, Role } from '../types.ts';
import { asNumber, asString, asStringArray, base64ToUtf8, isRecord, newId } from '../util.ts';
import { isPng, readTextChunks } from './png.ts';
import { importCardBook, importScripts } from './st-lorebook.ts';
import { fromStRegexList } from './st-regex.ts';

const ROLES: Record<string, Role> = { system: 'system', user: 'user', assistant: 'assistant' };

/** Extracts card JSON from a PNG (ccv3 preferred, then chara). */
export function readCardPng(bytes: Uint8Array): Record<string, unknown> {
    const texts = readTextChunks(bytes);
    const payload = texts.get('ccv3') ?? texts.get('chara');
    if (!payload) {
        throw new Error('这张图片里没有角色卡数据');
    }
    const json = JSON.parse(base64ToUtf8(payload));
    if (!isRecord(json)) {
        throw new Error('角色卡数据格式不正确');
    }
    return json;
}

export function looksLikeCard(json: Record<string, unknown>): boolean {
    const spec = asString(json.spec);
    if (spec.startsWith('chara_card')) {
        return true;
    }
    return typeof json.name === 'string' && ('first_mes' in json || 'description' in json || 'mes_example' in json);
}

export interface CardImport {
    character: Character;
    lorebook: Lorebook | null;
}

/** Converts a V1/V2/V3 card JSON into a Character (and its embedded lorebook, if any). */
export function importCard(json: Record<string, unknown>, file: string): CardImport {
    const data = isRecord(json.data) ? json.data : json;
    const ext = isRecord(data.extensions) ? data.extensions : {};
    const depth = isRecord(ext.depth_prompt) ? ext.depth_prompt : {};
    const name = asString(data.name) || asString(json.name) || '未命名角色';
    const now = Date.now();

    const helper = isRecord(ext.tavern_helper) ? ext.tavern_helper : null;
    const scripts = importScripts(helper?.scripts ?? ext.TavernHelper_scripts);

    const lorebook = isRecord(data.character_book) ? importCardBook(data.character_book, name, file) : null;

    const character: Character = {
        id: newId('ch'),
        kind: 'character',
        name,
        createdAt: now,
        updatedAt: now,
        fields: {
            description: asString(data.description),
            personality: asString(data.personality),
            scenario: asString(data.scenario),
            firstMessage: asString(data.first_mes),
            alternateGreetings: asStringArray(data.alternate_greetings),
            exampleDialogue: asString(data.mes_example),
            systemPrompt: asString(data.system_prompt),
            postHistoryInstructions: asString(data.post_history_instructions),
            depthPrompt: {
                text: asString(depth.prompt),
                depth: asNumber(depth.depth, 4),
                role: ROLES[asString(depth.role)] ?? 'system',
            },
            creatorNotes: asString(data.creator_notes) || asString(json.creatorcomment),
        },
        meta: {
            creator: asString(data.creator),
            version: asString(data.character_version),
            tags: asStringArray(data.tags ?? json.tags),
            nickname: asString(data.nickname) || undefined,
        },
        lorebookIds: lorebook ? [lorebook.id] : [],
        regex: fromStRegexList(ext.regex_scripts),
        scripts,
        source: { format: asString(json.spec, 'chara_card_v1'), file, importedAt: now },
        extra: { stCard: json },
    };
    return { character, lorebook };
}

export function importCardFile(bytes: Uint8Array, file: string): CardImport {
    if (isPng(bytes)) {
        return importCard(readCardPng(bytes), file);
    }
    const json = JSON.parse(new TextDecoder().decode(bytes));
    if (!isRecord(json) || !looksLikeCard(json)) {
        throw new Error('无法识别的角色卡');
    }
    return importCard(json, file);
}

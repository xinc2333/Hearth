import type { NamesBehavior, Preset, PromptEntry, PromptOrderItem, Role } from '../types.ts';
import { asBool, asNumber, asString, asStringArray, isRecord, newId } from '../util.ts';
import { importScripts } from './st-lorebook.ts';
import { fromStRegexList } from './st-regex.ts';

/** SillyTavern's built-in Chat Completion prompts (chatCompletionDefaultPrompts). */
export const ST_DEFAULT_PROMPTS: Record<string, unknown>[] = [
    { name: 'Main Prompt', system_prompt: true, role: 'system', content: 'Write {{char}}\'s next reply in a fictional chat between {{charIfNotGroup}} and {{user}}.', identifier: 'main' },
    { name: 'Auxiliary Prompt', system_prompt: true, role: 'system', content: '', identifier: 'nsfw' },
    { identifier: 'dialogueExamples', name: 'Chat Examples', system_prompt: true, marker: true },
    { name: 'Post-History Instructions', system_prompt: true, role: 'system', content: '', identifier: 'jailbreak' },
    { identifier: 'chatHistory', name: 'Chat History', system_prompt: true, marker: true },
    { identifier: 'worldInfoAfter', name: 'World Info (after)', system_prompt: true, marker: true },
    { identifier: 'worldInfoBefore', name: 'World Info (before)', system_prompt: true, marker: true },
    { identifier: 'enhanceDefinitions', role: 'system', name: 'Enhance Definitions', content: 'If you have more knowledge of {{char}}, add to the character\'s lore and personality to enhance them but keep the Character Sheet\'s definitions absolute.', system_prompt: true, marker: false },
    { identifier: 'charDescription', name: 'Char Description', system_prompt: true, marker: true },
    { identifier: 'charPersonality', name: 'Char Personality', system_prompt: true, marker: true },
    { identifier: 'scenario', name: 'Scenario', system_prompt: true, marker: true },
    { identifier: 'personaDescription', name: 'Persona Description', system_prompt: true, marker: true },
];

/** SillyTavern's default prompt order (promptManagerDefaultPromptOrder). */
export const ST_DEFAULT_ORDER: PromptOrderItem[] = [
    { id: 'main', enabled: true },
    { id: 'worldInfoBefore', enabled: true },
    { id: 'personaDescription', enabled: true },
    { id: 'charDescription', enabled: true },
    { id: 'charPersonality', enabled: true },
    { id: 'scenario', enabled: true },
    { id: 'enhanceDefinitions', enabled: false },
    { id: 'nsfw', enabled: true },
    { id: 'worldInfoAfter', enabled: true },
    { id: 'dialogueExamples', enabled: true },
    { id: 'chatHistory', enabled: true },
    { id: 'jailbreak', enabled: true },
];

const ROLES: Role[] = ['system', 'user', 'assistant'];
const NAMES: Record<string, NamesBehavior> = { '-1': 'none', '0': 'default', '1': 'completion', '2': 'content' };

export const DEFAULT_ST_PRESET_VALUES = {
    wi_format: '{0}',
    scenario_format: '{{scenario}}',
    personality_format: '{{personality}}',
    new_chat_prompt: '[Start a new Chat]',
    new_group_chat_prompt: '[Start a new group chat. Group members: {{group}}]',
    new_example_chat_prompt: '[Example Chat]',
    continue_nudge_prompt: '[Continue your last message without repeating its original content.]',
    group_nudge_prompt: '[Write the next reply only as {{char}}.]',
    impersonation_prompt: '[Write your next reply from the point of view of {{user}}, using the chat history so far as a guideline for the writing style of {{user}}. Don\'t write as {{char}} or system. Don\'t describe actions of {{char}}.]',
};

function fromStPrompt(raw: Record<string, unknown>): PromptEntry {
    const role = asString(raw.role);
    return {
        id: asString(raw.identifier) || newId('pr'),
        name: asString(raw.name) || asString(raw.identifier),
        role: (ROLES as string[]).includes(role) ? role as Role : 'system',
        content: asString(raw.content),
        marker: asBool(raw.marker, false),
        builtin: asBool(raw.system_prompt, false),
        injection: {
            mode: Number(raw.injection_position) === 1 ? 'in_chat' : 'relative',
            depth: asNumber(raw.injection_depth, 4),
            order: asNumber(raw.injection_order, 100),
        },
        triggers: asStringArray(raw.injection_trigger),
        forbidOverrides: asBool(raw.forbid_overrides, false),
        extra: { st: raw, hasRole: 'role' in raw, hasSystemPromptFlag: 'system_prompt' in raw },
    };
}

function pickOrder(raw: unknown): PromptOrderItem[] {
    if (!Array.isArray(raw) || !raw.length) {
        return structuredClone(ST_DEFAULT_ORDER);
    }
    const lists = raw.filter(isRecord);
    // ST's global prompt-order strategy uses the dummy character 100001.
    const chosen = lists.find(l => String(l.character_id) === '100001')
        ?? lists.find(l => String(l.character_id) === '100000')
        ?? lists[0];
    const order = Array.isArray(chosen?.order) ? chosen.order.filter(isRecord) : [];
    if (!order.length) {
        return structuredClone(ST_DEFAULT_ORDER);
    }
    return order.map(o => ({ id: asString(o.identifier), enabled: asBool(o.enabled, true) }));
}

export function looksLikePreset(json: Record<string, unknown>): boolean {
    return Array.isArray(json.prompts) || Array.isArray(json.prompt_order) || 'openai_max_context' in json || 'temp_openai' in json;
}

export function importStPreset(raw: Record<string, unknown>, name: string, file: string): Preset {
    const now = Date.now();
    const d = { ...DEFAULT_ST_PRESET_VALUES, ...raw } as Record<string, unknown>;
    const prompts = (Array.isArray(raw.prompts) && raw.prompts.length ? raw.prompts : ST_DEFAULT_PROMPTS)
        .filter(isRecord)
        .map(fromStPrompt);
    const ext = isRecord(raw.extensions) ? raw.extensions : {};
    const helper = isRecord(ext.tavern_helper) ? ext.tavern_helper : null;
    return {
        id: newId('ps'),
        kind: 'preset',
        name,
        createdAt: now,
        updatedAt: now,
        sampling: {
            temperature: asNumber(d.temperature ?? d.temp_openai, 1),
            topP: asNumber(d.top_p ?? d.top_p_openai, 1),
            topK: asNumber(d.top_k ?? d.top_k_openai, 0),
            minP: asNumber(d.min_p ?? d.min_p_openai, 0),
            topA: asNumber(d.top_a ?? d.top_a_openai, 0),
            frequencyPenalty: asNumber(d.frequency_penalty ?? d.freq_pen_openai, 0),
            presencePenalty: asNumber(d.presence_penalty ?? d.pres_pen_openai, 0),
            repetitionPenalty: asNumber(d.repetition_penalty ?? d.repetition_penalty_openai, 1),
            seed: asNumber(d.seed, -1),
            reasoningEffort: asString(d.reasoning_effort, 'auto'),
        },
        context: {
            maxContext: asNumber(d.openai_max_context, 4095),
            maxTokens: asNumber(d.openai_max_tokens, 300),
            stream: asBool(d.stream_openai, true),
        },
        prompts,
        order: pickOrder(raw.prompt_order),
        formats: {
            worldInfo: asString(d.wi_format),
            scenario: asString(d.scenario_format),
            personality: asString(d.personality_format),
            newChat: asString(d.new_chat_prompt),
            newGroupChat: asString(d.new_group_chat_prompt),
            newExampleChat: asString(d.new_example_chat_prompt),
            continueNudge: asString(d.continue_nudge_prompt),
            groupNudge: asString(d.group_nudge_prompt),
            impersonation: asString(d.impersonation_prompt),
            sendIfEmpty: asString(d.send_if_empty),
            assistantPrefill: asString(d.assistant_prefill),
            assistantImpersonation: asString(d.assistant_impersonation),
            continuePostfix: asString(d.continue_postfix, ' '),
        },
        behavior: {
            namesBehavior: NAMES[String(asNumber(d.names_behavior, 0))] ?? 'default',
            squashSystemMessages: asBool(d.squash_system_messages, false),
            continuePrefill: asBool(d.continue_prefill, false),
            showThoughts: asBool(d.show_thoughts, true),
        },
        regex: fromStRegexList(ext.regex_scripts),
        scripts: importScripts(helper?.scripts),
        source: { format: 'st-chat-completion-preset', file, importedAt: now },
        extra: { st: raw },
    };
}

/** A fresh preset equivalent to SillyTavern's defaults. */
export function defaultPreset(): Preset {
    const preset = importStPreset({ openai_max_context: 64000, openai_max_tokens: 4096, stream_openai: true }, '默认预设', '');
    delete preset.source;
    return preset;
}

// Chat Completion prompt assembly with SillyTavern semantics.
//
// assemble() is a pure function: given a snapshot (character, persona, preset, lorebooks, chat…)
// it returns the exact message list to send plus a trace of where every part came from.
// It mirrors ST's Generate() → prepareOpenAIMessages() pipeline step by step; comments name the
// ST function each block corresponds to so behaviour can be checked against the original.

import { createMacroContext, evaluateMacros, type MacroContext } from './macros.ts';
import { applyRegex } from './regex.ts';
import { scanLore, type LoreScanResult, type LoreSource } from './lore.ts';
import { estimateTokens, MESSAGE_OVERHEAD } from './tokens.ts';
import type {
    AuthorsNote, Character, ChatMessage, LoreSettings, PersonaPosition, Preset, PromptEntry,
    RegexPlacement, RegexScript, Role, TimedLoreState,
} from './types.ts';
import { stateAt } from './state.ts';
import { collapseNewlines, stringFormat } from './util.ts';

export type GenerationType = 'normal' | 'continue' | 'regenerate' | 'swipe' | 'impersonate' | 'quiet';

export type InjectionPosition = 'none' | 'in_prompt' | 'in_chat' | 'before_prompt';

/** An "extension prompt" in ST terms: text placed relative to the main prompt or inside the chat. */
export interface Injection {
    key: string;
    value: string;
    position: InjectionPosition;
    depth: number;
    role: Role;
    /** Whether world info scanning sees this text. */
    scan: boolean;
}

export interface AssembleInput {
    type: GenerationType;
    chatId: string;
    character: Character;
    userName: string;
    persona: { description: string; position: PersonaPosition; depth: number; role: Role };
    preset: Preset;
    lore: { sources: LoreSource[]; settings: LoreSettings };
    /** Messages to build from. For swipes/regeneration the target message is already excluded. */
    messages: ChatMessage[];
    authorsNote: AuthorsNote;
    variables: { chat: Record<string, unknown>; global: Record<string, unknown> };
    timedLore?: TimedLoreState;
    /** Global regex scripts (preset and character scripts come from their resources). */
    globalRegex: RegexScript[];
    options: {
        preferCharacterPrompt: boolean;
        preferCharacterJailbreak: boolean;
        pinExamples: boolean;
        collapseNewlines: boolean;
    };
    model: string;
    /** Extra injections contributed by plugins. */
    injections?: Injection[];
    quietPrompt?: string;
    dryRun?: boolean;
    now?: Date;
    random?: () => number;
    countTokens?: (text: string) => number;
}

export interface PromptPart {
    role: Role;
    content: string;
    name?: string;
    /** ST identifiers of the prompts that produced this message. */
    sources: string[];
    /** Chat message id, for chat history parts. */
    messageId?: string;
    tokens: number;
}

export interface AssembleResult {
    messages: { role: Role; content: string; name?: string }[];
    parts: PromptPart[];
    lore: LoreScanResult;
    tokens: { total: number; budget: number; maxContext: number; maxTokens: number };
    warnings: string[];
    variables: { chat: Record<string, unknown>; global: Record<string, unknown> };
    timedLore: TimedLoreState;
    /** Extra request fields set by plugins on behalf of the preset (e.g. tools, tool_choice). */
    request?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------------------------
// Internal message collections (ST Message / MessageCollection / ChatCompletion)
// ---------------------------------------------------------------------------------------------

class Msg {
    role: Role;
    content: string;
    identifier: string;
    name?: string;
    tokens = 0;
    sources: string[];
    messageId?: string;

    constructor(role: Role | undefined, content: string, identifier: string, count: (t: string) => number, sources?: string[]) {
        this.role = role ?? 'system';
        this.content = content ?? '';
        this.identifier = identifier;
        this.sources = sources ?? [identifier];
        if (this.content) {
            this.tokens = count(this.content) + MESSAGE_OVERHEAD;
        }
    }

    setName(name: string, count: (t: string) => number) {
        this.name = name;
        if (this.content) {
            this.tokens += count(name);
        }
    }
}

class Collection {
    identifier: string;
    items: (Msg | Collection)[] = [];

    constructor(identifier: string, ...items: (Msg | Collection)[]) {
        this.identifier = identifier;
        this.items.push(...items);
    }

    tokens(): number {
        let sum = 0;
        for (const item of this.items) {
            if (item) sum += item instanceof Msg ? item.tokens : item.tokens();
        }
        return sum;
    }

    flatten(): Msg[] {
        const out: Msg[] = [];
        for (const item of this.items) {
            if (!item) continue;
            if (item instanceof Msg) out.push(item);
            else out.push(...item.flatten());
        }
        return out;
    }
}

class BudgetExceeded extends Error {}

class Completion {
    root = new Collection('root');
    budget: number;

    constructor(maxContext: number, maxTokens: number) {
        this.budget = maxContext - maxTokens;
    }

    private cost(item: Msg | Collection | number): number {
        return typeof item === 'number' ? item : item instanceof Msg ? item.tokens : item.tokens();
    }

    canAfford(item: Msg | Collection | Msg[]): boolean {
        const cost = Array.isArray(item) ? item.reduce((s, m) => s + m.tokens, 0) : this.cost(item);
        return this.budget - cost >= 0;
    }

    reserve(item: Msg | Collection | number) { this.budget -= this.cost(item); }
    free(item: Msg | Collection | number) { this.budget += this.cost(item); }

    add(collection: Collection, position: number | null) {
        if (!this.canAfford(collection)) {
            throw new BudgetExceeded(collection.identifier);
        }
        if (position !== null && position !== -1) {
            this.root.items[position] = collection;
        } else {
            this.root.items.push(collection);
        }
        this.budget -= collection.tokens();
    }

    has(identifier: string): boolean {
        return this.root.items.some(item => item?.identifier === identifier);
    }

    insert(msg: Msg, identifier: string, where: 'start' | 'end' | number = 'end') {
        if (!this.canAfford(msg)) {
            throw new BudgetExceeded(msg.identifier);
        }
        const target = this.root.items.find(item => item?.identifier === identifier);
        if (!(target instanceof Collection) || !msg.content) {
            return;
        }
        if (where === 'start') target.items.unshift(msg);
        else if (where === 'end') target.items.push(msg);
        else target.items.splice(where, 0, msg);
        this.budget -= msg.tokens;
    }
}

/** ST Prompt, as collected from the preset (PromptCollection). */
interface CPrompt {
    identifier: string;
    role?: Role;
    content: string;
    name?: string;
    system_prompt?: boolean;
    /** Relative position for extension prompts ('start' / 'end'). */
    position?: 'start' | 'end';
    injection_position: 0 | 1;
    injection_depth: number;
    injection_order: number;
    forbid_overrides?: boolean;
    extension?: boolean;
}

class PromptCollection {
    collection: CPrompt[] = [];
    get(id: string) { return this.collection.find(p => p?.identifier === id); }
    index(id: string) { return this.collection.findIndex(p => p?.identifier === id); }
    has(id: string) { return this.index(id) !== -1; }
    add(p: CPrompt) { this.collection.push(p); }
}

const ROLE_NUM: Record<Role, number> = { system: 0, user: 1, assistant: 2 };
const POSITION_NUM: Record<InjectionPosition, number> = { none: -1, in_prompt: 0, in_chat: 1, before_prompt: 2 };

// ---------------------------------------------------------------------------------------------
// assemble()
// ---------------------------------------------------------------------------------------------

export function assemble(input: AssembleInput): AssembleResult {
    const count = input.countTokens ?? estimateTokens;
    const random = input.random ?? Math.random;
    const now = input.now ?? new Date();
    const warnings: string[] = [];
    const { character, preset, options } = input;
    const isContinue = input.type === 'continue';
    const userName = input.userName;
    const charName = character.name;
    const chatVars = structuredClone(input.variables.chat);
    const globalVars = structuredClone(input.variables.global);

    const visible = input.messages.filter(m => !m.hidden);
    const textOf = (m: ChatMessage) => m.swipes[m.activeSwipe]?.content ?? '';
    const lastUser = [...visible].reverse().find(m => m.role === 'user');
    const lastChar = [...visible].reverse().find(m => m.role === 'assistant');

    const ctx: MacroContext = createMacroContext({
        user: userName,
        char: charName,
        model: input.model,
        lastMessage: visible.length ? textOf(visible[visible.length - 1]) : '',
        lastUserMessage: lastUser ? textOf(lastUser) : '',
        lastCharMessage: lastChar ? textOf(lastChar) : '',
        lastMessageId: Math.max(0, input.messages.length - 1),
        chatVariables: chatVars,
        globalVariables: globalVars,
        messageVariables: structuredClone(stateAt(input.messages) ?? {}),
        now,
        random,
        seed: input.chatId,
    });
    const sub = (text: string, extra?: { original?: string; values?: Record<string, string> }) => {
        if (!text) return text ?? '';
        const saved = { original: ctx.original, values: ctx.values };
        if (extra?.original !== undefined) ctx.original = extra.original;
        if (extra?.values) ctx.values = { ...ctx.values, ...extra.values };
        const out = evaluateMacros(text, ctx);
        ctx.original = saved.original;
        ctx.values = saved.values;
        return out;
    };
    // ST baseChatReplace()
    const baseChatReplace = (text: string) => {
        if (!text) return text ?? '';
        let out = sub(text);
        if (options.collapseNewlines) out = collapseNewlines(out);
        return out.replace(/\r/g, '');
    };

    // ST getCharacterCardFields()
    const f = character.fields;
    const persona = baseChatReplace(input.persona.description.trim());
    const system = options.preferCharacterPrompt ? baseChatReplace(f.systemPrompt.trim()) : '';
    const jailbreak = options.preferCharacterJailbreak ? baseChatReplace(f.postHistoryInstructions.trim()) : '';
    const charDepthPrompt = baseChatReplace(f.depthPrompt.text.trim());
    const creatorNotes = baseChatReplace(f.creatorNotes.trim());
    const description = baseChatReplace(f.description.trim());
    const personality = baseChatReplace(f.personality.trim());
    const scenario = baseChatReplace(f.scenario.trim());
    const mesExamples = baseChatReplace(f.exampleDialogue.trim());
    Object.assign(ctx, {
        persona, description, personality, scenario, mesExamples, mesExamplesRaw: mesExamples,
        charPrompt: system, charJailbreak: jailbreak, charDepthPrompt, creatorNotes,
        charVersion: character.meta.version, firstMessage: baseChatReplace(f.firstMessage),
    });

    const regexScripts = [...input.globalRegex, ...preset.regex, ...character.regex];
    const regex = (text: string, placement: RegexPlacement, opts: { isPrompt?: boolean; depth?: number | null }) =>
        applyRegex(regexScripts, text, placement, { ...opts, macros: (t, transform) => evaluateMacros(t, ctx, { transform }) });

    // Extension prompts (ST setExtensionPrompt / extension_prompts)
    const injections = new Map<string, Injection>();
    const setInjection = (key: string, value: string, position: InjectionPosition, depth: number, scan: boolean, role: Role) => {
        injections.set(key, { key, value, position, depth, role, scan });
    };
    for (const inj of input.injections ?? []) {
        injections.set(inj.key, inj);
    }
    setInjection('DEPTH_PROMPT', charDepthPrompt, 'in_chat', f.depthPrompt.depth, input.authorsNote.scan, f.depthPrompt.role);

    // Core chat with prompt-time regex (ST Generate: coreChat)
    const coreChat = visible.map((m, index) => {
        const depth = visible.length - index - (isContinue ? 2 : 1);
        const placement: RegexPlacement = m.role === 'user' ? 'user_input' : 'ai_output';
        let mes = textOf(m);
        if (index === 0 && input.messages[0] === m) {
            // ST re-substitutes the first message so greetings follow name changes.
            mes = sub(mes);
        }
        return { message: m, name: m.name, mes: regex(mes, placement, { isPrompt: true, depth }) };
    });

    // Author's note (ST setFloatingPrompt)
    const an = input.authorsNote;
    let shouldWIAddPrompt = false;
    {
        let userCount = visible.filter(m => m.role === 'user').length;
        if (an.interval === 1) userCount = 1;
        if (userCount <= 0 || an.interval <= 0) {
            setInjection('2_floating_prompt', '', 'none', an.depth, an.scan, an.role);
        } else {
            const till = userCount >= an.interval ? userCount % an.interval : an.interval - userCount;
            shouldWIAddPrompt = till === 0;
            setInjection('2_floating_prompt', shouldWIAddPrompt ? an.content : '', an.position, an.depth, an.scan, an.role);
        }
    }
    if (input.quietPrompt) {
        setInjection('QUIET_PROMPT', input.quietPrompt, 'in_prompt', 0, true, 'system');
    }

    // World info (ST getWorldInfoPrompt / checkWorldInfo)
    const chatForWI = coreChat.map(x => input.lore.settings.includeNames ? `${x.name}: ${x.mes}` : x.mes).reverse();
    const scanned = [...injections.values()].filter(x => x.scan && x.value).map(x => sub(x.value));
    const lore = scanLore({
        sources: input.lore.sources,
        chat: chatForWI,
        settings: input.lore.settings,
        maxContext: preset.context.maxContext,
        global: {
            personaDescription: persona,
            characterDescription: description,
            characterPersonality: personality,
            characterDepthPrompt: charDepthPrompt,
            scenario,
            creatorNotes,
            trigger: ['normal', 'continue', 'impersonate', 'swipe', 'regenerate', 'quiet'].includes(input.type) ? input.type : 'normal',
        },
        injected: scanned,
        characterName: charName,
        characterTags: character.meta.tags,
        timed: input.timedLore,
        dryRun: input.dryRun,
        macros: sub,
        regex: (content, depth) => regex(content, 'world_info', { isPrompt: true, depth }),
        countTokens: count,
        random,
    });
    if (input.quietPrompt) {
        setInjection('QUIET_PROMPT', '', 'in_prompt', 0, true, 'system');
    }

    // Example dialogue (ST parseMesExamples + WI example entries)
    let examplesArray = parseMesExamples(mesExamples);
    for (const example of lore.examples) {
        if (!example.content) continue;
        const cleaned = parseMesExamples(baseChatReplace(example.content));
        if (example.position === 'before') examplesArray.unshift(...cleaned);
        else examplesArray.push(...cleaned);
    }

    // Depth WI and outlets
    for (const group of lore.depth) {
        setInjection(`customDepthWI_${group.depth}_${ROLE_NUM[group.role]}`, group.entries.join('\n'), 'in_chat', group.depth, false, group.role);
    }
    for (const [key, values] of Object.entries(lore.outlets)) {
        setInjection(`customWIOutlet_${key}`, values.join('\n'), 'none', 0, false, 'system');
        ctx.outlets[key] = values.join('\n');
    }

    // Author's note with WI top/bottom entries (end of ST checkWorldInfo)
    if (shouldWIAddPrompt) {
        const original = injections.get('2_floating_prompt')?.value ?? '';
        const withWI = `${lore.anTop.join('\n')}\n${original}\n${lore.anBottom.join('\n')}`.replace(/(^\n)|(\n$)/g, '');
        setInjection('2_floating_prompt', withWI, an.position, an.depth, an.scan, an.role);
    }

    // Persona description (ST addPersonaDescriptionExtensionPrompt)
    const rawPersona = input.persona.description;
    setInjection('PERSONA_DESCRIPTION', '', 'in_prompt', 0, false, 'system');
    if (rawPersona && input.persona.position !== 'none') {
        if ((input.persona.position === 'an_top' || input.persona.position === 'an_bottom') && shouldWIAddPrompt) {
            const original = injections.get('2_floating_prompt')?.value ?? '';
            const value = input.persona.position === 'an_top' ? `${rawPersona}\n${original}` : `${original}\n${rawPersona}`;
            setInjection('2_floating_prompt', value, an.position, an.depth, an.scan, an.role);
        }
        if (input.persona.position === 'at_depth') {
            setInjection('PERSONA_DESCRIPTION', rawPersona, 'in_chat', input.persona.depth, true, input.persona.role);
        }
    }

    // ST getExtensionPrompt()
    const getExtensionPrompt = (position: InjectionPosition, depth?: number, role?: Role, wrap = true, separator = '\n') => {
        const values = [...injections.keys()].sort()
            .map(k => injections.get(k) as Injection)
            .filter(x => POSITION_NUM[x.position] === POSITION_NUM[position] && x.value)
            .filter(x => depth === undefined || x.depth === undefined || x.depth === depth)
            .filter(x => role === undefined || x.role === undefined || x.role === role);
        let joined = values.map(x => x.value.trim()).join(separator);
        if (wrap && joined.length && !joined.startsWith(separator)) joined = separator + joined;
        if (wrap && joined.length && !joined.endsWith(separator)) joined = joined + separator;
        return joined.length ? sub(joined) : joined;
    };

    // ST setOpenAIMessages(): newest first
    const names = preset.behavior.namesBehavior;
    type ChatPrompt = { role: Role; content: string; name?: string; identifier?: string; injected?: boolean; messageId?: string; sources?: string[] };
    let messages: ChatPrompt[] = [];
    for (let i = coreChat.length - 1, j = 0; i >= 0; i--, j++) {
        const item = coreChat[j];
        const role: Role = item.message.role === 'user' ? 'user' : item.message.role === 'system' ? 'system' : 'assistant';
        let content = item.mes;
        if (names === 'content' && item.message.role !== 'system') {
            content = `${item.name}: ${content}`;
        }
        messages[i] = { role, content: content.replace(/\r/gm, ''), name: item.name, messageId: item.message.id };
    }

    // ST setOpenAIMessageExamples()
    const messageExamples = examplesArray.map(block => parseExampleIntoIndividual(block.replace(/<START>/i, '{Example Dialogue:}').replace(/\r/gm, ''), userName, charName));

    // ---------------------------------------------------------------------------------------
    // ST prepareOpenAIMessages()
    // ---------------------------------------------------------------------------------------
    const completion = new Completion(preset.context.maxContext, preset.context.maxTokens);
    const orderEntry = (id: string) => preset.order.find(o => o.id === id);
    const isDisabled = (id: string) => {
        const entry = orderEntry(id);
        return entry ? !entry.enabled : false;
    };
    const presetPrompt = (id: string) => preset.prompts.find(p => p.id === id);
    const toCPrompt = (p: PromptEntry): CPrompt => ({
        identifier: p.id,
        role: p.extra?.hasRole === false ? undefined : p.role,
        content: p.content,
        name: p.name,
        system_prompt: p.extra?.hasSystemPromptFlag === false ? undefined : p.builtin,
        injection_position: p.injection.mode === 'in_chat' ? 1 : 0,
        injection_depth: p.injection.depth,
        injection_order: p.injection.order,
        forbid_overrides: p.forbidOverrides,
    });
    const preparePrompt = (p: CPrompt, original?: string): CPrompt => ({
        ...p,
        content: original !== undefined ? sub(p.content ?? '', { original }) : sub(p.content ?? ''),
    });

    // ST preparePromptsForChatCompletion()
    const f2 = preset.formats;
    const scenarioText = scenario && f2.scenario ? sub(f2.scenario, { values: { scenario } }) : scenario || '';
    const personalityText = personality && f2.personality ? sub(f2.personality, { values: { personality } }) : personality || '';
    const formatWorldInfo = (value: string) => !value ? '' : !f2.worldInfo.trim() ? value : stringFormat(f2.worldInfo, value);
    const base = (identifier: string, content: string, role: Role = 'system'): CPrompt =>
        ({ identifier, role, content, injection_position: 0, injection_depth: 4, injection_order: 100 });
    const systemPrompts: CPrompt[] = [
        base('worldInfoBefore', formatWorldInfo(lore.before)),
        base('worldInfoAfter', formatWorldInfo(lore.after)),
        base('charDescription', description),
        base('charPersonality', personalityText),
        base('scenario', scenarioText),
        base('impersonate', f2.impersonation ? sub(f2.impersonation) : ''),
        base('quietPrompt', input.quietPrompt ?? ''),
        base('groupNudge', sub(f2.groupNudge)),
    ];
    const positionName = (p: InjectionPosition): 'start' | 'end' | undefined => p === 'before_prompt' ? 'start' : p === 'in_prompt' ? 'end' : undefined;
    const anInj = injections.get('2_floating_prompt');
    if (anInj?.value) {
        systemPrompts.push({ ...base('authorsNote', anInj.value, anInj.role), position: positionName(anInj.position) });
    }
    if (rawPersona && input.persona.position === 'in_prompt') {
        systemPrompts.push(base('personaDescription', rawPersona));
    }
    const known = ['1_memory', '2_floating_prompt', '3_vectors', '4_vectors_data_bank', 'chromadb', 'PERSONA_DESCRIPTION', 'QUIET_PROMPT', 'DEPTH_PROMPT'];
    for (const [key, inj] of injections) {
        if (known.includes(key) || !inj.value) continue;
        if (inj.position !== 'before_prompt' && inj.position !== 'in_prompt') continue;
        systemPrompts.push({ ...base(key.replace(/\W/g, '_'), inj.value, inj.role), position: positionName(inj.position), extension: true });
    }

    // ST PromptManager.getPromptCollection()
    const prompts = new PromptCollection();
    const generationType = input.type;
    for (const entry of preset.order) {
        const p = presetPrompt(entry.id);
        if (!p) continue;
        const allowed = entry.enabled && (!p.triggers.length || p.triggers.includes(generationType));
        if (allowed) {
            prompts.add(preparePrompt(toCPrompt(p)));
        } else if (entry.id === 'main') {
            prompts.add(preparePrompt({ ...toCPrompt(p), content: '' }));
        }
    }

    for (const sp of systemPrompts) {
        const cp = prompts.get(sp.identifier);
        if (cp) {
            sp.injection_position = cp.injection_position ?? sp.injection_position;
            sp.injection_depth = cp.injection_depth ?? sp.injection_depth;
            sp.injection_order = cp.injection_order ?? sp.injection_order;
            sp.role = cp.role ?? sp.role;
        }
        const prepared = preparePrompt(sp);
        const idx = prompts.index(sp.identifier);
        if (idx !== -1) prompts.collection[idx] = prepared;
        else prompts.add(prepared);
    }

    const overrides = (id: 'main' | 'jailbreak', override: string) => {
        const cp = prompts.get(id);
        if (override && cp && cp.forbid_overrides !== true && !isDisabled(id)) {
            const original = cp.content;
            prompts.collection[prompts.index(id)] = preparePrompt({ ...cp, content: override }, original);
        }
    };
    overrides('main', system);
    overrides('jailbreak', jailbreak);

    // ST populateChatCompletion()
    const mk = (p: CPrompt) => new Msg(p.role, p.content, p.identifier, count);
    try {
        const addToCompletion = (source: string) => {
            if (!prompts.has(source)) return;
            if (isDisabled(source) && source !== 'main') return;
            const p = prompts.get(source) as CPrompt;
            if (p.injection_position === 1) return;
            completion.add(new Collection(source, mk(p)), prompts.index(source));
        };

        completion.reserve(3);
        for (const id of ['worldInfoBefore', 'main', 'worldInfoAfter', 'charDescription', 'charPersonality', 'scenario', 'personaDescription']) {
            addToCompletion(id);
        }

        const control = new Collection('controlPrompts');
        if (input.type === 'impersonate' && prompts.get('impersonate')) control.items.push(mk(prompts.get('impersonate') as CPrompt));
        const quiet = prompts.get('quietPrompt');
        if (quiet?.content) control.items.push(mk(quiet));
        completion.reserve(control);

        const userRelative = prompts.collection.filter(p => p.system_prompt === false && p.injection_position !== 1).map(p => p.identifier);
        const absolute = prompts.collection.filter(p => p.injection_position === 1);
        for (const id of ['nsfw', 'jailbreak', ...userRelative]) {
            addToCompletion(id);
        }
        if (prompts.has('enhanceDefinitions')) addToCompletion('enhanceDefinitions');

        const injectToMain = (p: CPrompt, position: 'start' | 'end') => {
            if (completion.has('main')) {
                completion.insert(mk(p), 'main', position);
            } else {
                const mainIndex = absolute.findIndex(x => x.identifier === 'main');
                if (mainIndex >= 0) {
                    const main = absolute[mainIndex];
                    absolute.splice(position === 'end' ? mainIndex + 1 : mainIndex, 0, {
                        ...p, role: main.role, injection_position: main.injection_position,
                        injection_depth: main.injection_depth, injection_order: main.injection_order,
                    });
                }
            }
        };
        for (const key of ['summary', 'authorsNote', 'vectorsMemory', 'vectorsDataBank', 'smartContext']) {
            const p = prompts.get(key);
            if (p?.position) injectToMain(p, p.position);
        }
        for (const p of prompts.collection.filter(x => x.extension && x.position)) {
            injectToMain(p, p.position as 'start' | 'end');
        }

        if (isContinue && preset.behavior.continuePrefill && messages.length) {
            const last = messages.shift() as ChatPrompt;
            const continueMsg = new Msg(last.role, last.content, 'continuePrefill', count, ['continuePrefill', `chat:${last.messageId}`]);
            continueMsg.messageId = last.messageId;
            if (last.name && names === 'completion') continueMsg.setName(sanitizeName(last.name), count);
            control.items.push(continueMsg);
            completion.reserve(continueMsg);
        }

        // ST populationInjectionPrompts(): newest-first splice, then reverse to oldest-first.
        messages = populateInjections(absolute, messages, getExtensionPrompt, injections);

        const populateHistory = () => {
            if (!prompts.has('chatHistory')) return;
            completion.add(new Collection('chatHistory'), prompts.index('chatHistory'));
            const newChat = new Msg('system', sub(f2.newChat), 'newMainChat', count);
            completion.reserve(newChat);

            let continueCollection: Collection | null = null;
            if (isContinue && !preset.behavior.continuePrefill) {
                continueCollection = new Collection('continueNudge');
                const idx = messages.findLastIndex(x => !x.injected);
                let lastText = '';
                if (idx >= 0) {
                    const [cont] = messages.splice(idx, 1);
                    lastText = cont.content;
                    const m = new Msg(cont.role, sub(cont.content), `chat:${cont.messageId}`, count);
                    m.messageId = cont.messageId;
                    continueCollection.items.push(m);
                }
                continueCollection.items.push(new Msg('system', sub(f2.continueNudge, { values: { lastChatMessage: lastText.trim() } }), 'continueNudge', count));
                completion.reserve(continueCollection);
            }

            const last = messages[messages.length - 1];
            if (last && last.role === 'assistant' && f2.sendIfEmpty) {
                const empty = new Msg('user', f2.sendIfEmpty, 'emptyUserMessageReplacement', count);
                if (completion.canAfford(empty)) completion.insert(empty, 'chatHistory');
            }

            const pool = [...messages].reverse();
            for (let index = 0; index < pool.length; index++) {
                const cp = pool[index];
                const identifier = `chatHistory-${messages.length - index}`;
                const msg = new Msg(cp.role, sub(cp.content), identifier, count, cp.sources ?? (cp.messageId ? [`chat:${cp.messageId}`] : [identifier]));
                msg.messageId = cp.messageId;
                if (names === 'completion' && cp.name) msg.setName(sanitizeName(cp.name), count);
                if (completion.canAfford(msg)) completion.insert(msg, 'chatHistory', 'start');
                else break;
            }

            completion.free(newChat);
            completion.insert(newChat, 'chatHistory', 'start');
            if (continueCollection) {
                completion.free(continueCollection);
                completion.add(continueCollection, -1);
            }
        };

        const populateExamples = () => {
            if (!prompts.has('dialogueExamples')) return;
            completion.add(new Collection('dialogueExamples'), prompts.index('dialogueExamples'));
            if (!messageExamples.length) return;
            const newExampleChat = new Msg('system', sub(f2.newExampleChat), 'newChat', count);
            for (let di = 0; di < messageExamples.length; di++) {
                const dialogue = messageExamples[di];
                const msgs = dialogue.map((p, pi) => {
                    const m = new Msg('system', p.content || '', `dialogueExamples ${di}-${pi}`, count, ['dialogueExamples']);
                    m.setName(p.name, count);
                    return m;
                });
                if (!completion.canAfford([newExampleChat, ...msgs])) break;
                completion.insert(newExampleChat, 'dialogueExamples');
                for (const m of msgs) completion.insert(m, 'dialogueExamples');
            }
        };

        if (options.pinExamples) {
            populateExamples();
            populateHistory();
        } else {
            populateHistory();
            populateExamples();
        }

        completion.free(control);
        if (control.items.length) completion.add(control, null);
    } catch (error) {
        if (error instanceof BudgetExceeded) {
            warnings.push(`必需的提示词超出了上下文长度（${error.message}）。请调大上下文或关闭部分条目。`);
        } else {
            throw error;
        }
    }

    // ST ChatCompletion.squashSystemMessages()
    let flat = completion.root.flatten();
    if (preset.behavior.squashSystemMessages) {
        const exclude = ['newMainChat', 'newChat', 'groupNudge'];
        const shouldSquash = (m: Msg) => !exclude.includes(m.identifier) && m.role === 'system' && !m.name;
        const squashed: Msg[] = [];
        let lastMsg: Msg | null = null;
        for (const m of flat) {
            if (m.role === 'system' && !m.content) continue;
            if (shouldSquash(m) && lastMsg && shouldSquash(lastMsg)) {
                lastMsg.content += '\n' + m.content;
                lastMsg.tokens = count(lastMsg.content) + MESSAGE_OVERHEAD;
                lastMsg.sources.push(...m.sources);
            } else {
                squashed.push(m);
                lastMsg = m;
            }
        }
        flat = squashed;
    }

    const parts: PromptPart[] = flat.filter(m => m.content).map(m => ({
        role: m.role,
        content: m.content,
        ...(m.name ? { name: m.name } : {}),
        sources: m.sources,
        ...(m.messageId ? { messageId: m.messageId } : {}),
        tokens: m.tokens,
    }));
    for (const text of parts.map(p => p.content)) {
        const leftover = text.match(/<%[\s\S]*?%>|<<<\|[^>]*>>>/);
        if (leftover) {
            warnings.push(`提示词里有尚不支持的脚本语法：${leftover[0].slice(0, 40)}…（来自 EJS 或预设脚本）`);
            break;
        }
    }

    return {
        messages: parts.map(p => ({ role: p.role, content: p.content, ...(p.name ? { name: p.name } : {}) })),
        parts,
        lore,
        tokens: {
            total: parts.reduce((s, p) => s + p.tokens, 0),
            budget: preset.context.maxContext - preset.context.maxTokens,
            maxContext: preset.context.maxContext,
            maxTokens: preset.context.maxTokens,
        },
        warnings,
        variables: { chat: chatVars, global: globalVars },
        timedLore: lore.timed,
    };
}

// ---------------------------------------------------------------------------------------------
// Helpers mirroring ST functions
// ---------------------------------------------------------------------------------------------

type ChatPromptLike = { role: Role; content: string; injected?: boolean; sources?: string[]; name?: string; messageId?: string };

/** ST populationInjectionPrompts(). `messages` is newest-first; returns oldest-first. */
function populateInjections(
    absolute: CPrompt[],
    messages: ChatPromptLike[],
    getExtensionPrompt: (position: InjectionPosition, depth?: number, role?: Role, wrap?: boolean) => string,
    injections: Map<string, Injection>,
): ChatPromptLike[] {
    let inserted = 0;
    const depths = new Set<number>();
    for (const p of absolute) if (p.content) depths.add(p.injection_depth);
    for (const inj of injections.values()) if (inj.position === 'in_chat' && inj.value) depths.add(inj.depth);
    const ordered = [...depths].filter(d => Number.isFinite(d) && d >= 0 && d <= 10000).sort((a, b) => a - b);
    for (const depth of ordered) {
        const depthPrompts = absolute.filter(p => p.injection_depth === depth && p.content);
        const groups: Record<string, CPrompt[]> = { '100': [] };
        for (const p of depthPrompts) {
            (groups[String(p.injection_order ?? 100)] ??= []).push(p);
        }
        const roleMessages: ChatPromptLike[] = [];
        for (const order of Object.keys(groups).sort((a, b) => +b - +a)) {
            for (const role of ['system', 'user', 'assistant'] as Role[]) {
                // ST compares roles strictly: an in-chat prompt without a role is never placed.
                const rolePrompts = groups[order].filter(p => p.role === role);
                const text = rolePrompts.map(p => p.content).join('\n');
                const ext = order === '100' ? getExtensionPrompt('in_chat', depth, role, false) : '';
                const joint = [text, ext].filter(x => x).map(x => x.trim()).join('\n');
                if (joint) {
                    const extSources = order === '100'
                        ? [...injections.values()].filter(i => i.position === 'in_chat' && i.value && i.depth === depth && i.role === role).map(i => i.key)
                        : [];
                    roleMessages.push({ role, content: joint, injected: true, sources: [...rolePrompts.map(p => p.identifier), ...extSources] });
                }
            }
        }
        if (roleMessages.length) {
            messages.splice(depth + inserted, 0, ...roleMessages);
            inserted += roleMessages.length;
        }
    }
    return messages.reverse();
}

/** ST parseMesExamples() for chat completion. */
export function parseMesExamples(examples: string): string[] {
    if (!examples || examples === '<START>') {
        return [];
    }
    let text = examples;
    if (!text.startsWith('<START>')) {
        text = '<START>\n' + text.trim();
    }
    return text.split(/<START>/gi).slice(1).map(block => `<START>\n${block.trim()}\n`);
}

/** ST parseExampleIntoIndividual(). */
export function parseExampleIntoIndividual(block: string, userName: string, charName: string): { role: Role; content: string; name: string }[] {
    const result: { role: Role; content: string; name: string }[] = [];
    const lines = block.split('\n');
    let current: string[] = [];
    let inUser = false;
    let inBot = false;
    const add = (name: string, systemName: string) => {
        const parsed = current.join('\n').replace(name + ':', '').trim();
        result.push({ role: 'system', content: parsed, name: systemName });
        current = [];
    };
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith(userName + ':')) {
            inUser = true;
            if (inBot) add(charName, 'example_assistant');
            inBot = false;
        } else if (line.startsWith(charName + ':')) {
            inBot = true;
            if (inUser) add(userName, 'example_user');
            inUser = false;
        }
        current.push(line);
    }
    if (inUser) add(userName, 'example_user');
    else if (inBot) add(charName, 'example_assistant');
    return result;
}

/** OpenAI `name` must match ^[a-zA-Z0-9_-]{1,64}$ (ST PromptManager.sanitizeName). */
export function sanitizeName(name: string): string {
    if (/^[a-zA-Z0-9_-]{1,64}$/.test(name)) {
        return name;
    }
    return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'unknown';
}

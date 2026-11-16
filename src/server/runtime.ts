// Turn runner: resolves the snapshot for a chat, assembles the prompt, streams the reply and
// commits the result. Generation runs server-side, so closing the window does not stop it.

import { assemble, type AssembleInput, type AssembleResult, type GenerationType, type Injection } from '../core/assemble.ts';
import { defaultPreset } from '../core/compat/st-preset.ts';
import type { LoreSource } from '../core/lore.ts';
import { createMacroContext, evaluateMacros } from '../core/macros.ts';
import type { Op } from '../core/ops.ts';
import { applyRegex } from '../core/regex.ts';
import { estimateTokens, MESSAGE_OVERHEAD } from '../core/tokens.ts';
import type { Character, Chat, ChatMessage, Connection, Lorebook, Persona, Preset, RegexScript, Swipe } from '../core/types.ts';
import { newId } from '../core/util.ts';
import { isCatgodPreset } from './builtin/catgod.ts';
import { CARD_EDITOR_INSTRUCTION, CARD_EDITOR_TOOLS, editCard } from './card-editor.ts';
import type { PluginHost, ReceiveResult } from './plugins.ts';
import { streamChat } from './providers/openai.ts';
import type { Store } from './store.ts';

export type GenerateEvent =
    | { type: 'job'; jobId: string; messageId: string; swipeId: string; prefix: string }
    | { type: 'prompt'; parts: AssembleResult['parts']; warnings: string[]; tokens: AssembleResult['tokens']; lore: AssembleResult['lore']['activated']; tools: string[] }
    | { type: 'text'; text: string }
    | { type: 'reasoning'; text: string }
    | { type: 'card-edit'; reason: string }
    | { type: 'finalizing' }
    | { type: 'done'; message: ChatMessage }
    | { type: 'error'; error: string; message?: ChatMessage };

interface Job {
    id: string;
    chatId: string;
    controller: AbortController;
}

interface GenerationRequest {
    type: GenerationType;
    text?: string;
    source?: 'card';
}

export interface PromptSnapshot {
    at: number;
    type: GenerationType;
    model: string;
    parts: AssembleResult['parts'];
    warnings: string[];
    tokens: AssembleResult['tokens'];
    lore: AssembleResult['lore']['activated'];
    /** Tools the preset attached to the request (e.g. its reply tool). */
    tools: string[];
}

/** Names of tools in request extras, for the prompt trace. */
function toolNames(extra?: Record<string, unknown>): string[] {
    const tools = Array.isArray(extra?.tools) ? extra.tools as { function?: { name?: string } }[] : [];
    return tools.map(t => t.function?.name ?? '').filter(Boolean);
}

export class Runtime {
    private store: Store;
    private plugins: PluginHost;
    private jobs = new Map<string, Job>();
    private lastPrompts = new Map<string, PromptSnapshot>();

    constructor(store: Store, plugins: PluginHost) {
        this.store = store;
        this.plugins = plugins;
    }

    // ------------------------------------------------------------------------------------------
    // Snapshot resolution
    // ------------------------------------------------------------------------------------------

    persona(chat?: Chat): { name: string; persona?: Persona } {
        const persona = this.store.get<Persona>('persona', chat?.personaId ?? this.store.settings.personaId);
        return { name: persona?.name || this.store.settings.userName || 'User', persona };
    }

    /** The preset is global: every chat uses the one selected in settings. */
    preset(_chat?: Chat): Preset {
        return this.store.get<Preset>('preset', this.store.settings.presetId)
            ?? this.store.list<Preset>('preset')[0]
            ?? defaultPreset();
    }

    connection(): { conn: Connection; key?: string } | null {
        const s = this.store.settings;
        const conn = s.connections.find(c => c.id === s.connectionId) ?? s.connections[0];
        return conn ? { conn, key: this.store.getSecret(`conn:${conn.id}`) } : null;
    }

    regexScripts(chat: Chat): RegexScript[] {
        const character = this.store.get<Character>('character', chat.characterId);
        return [...this.preset(chat).regex, ...(character?.regex ?? [])];
    }

    private loreSources(chat: Chat, character: Character, persona?: Persona): LoreSource[] {
        const sources: LoreSource[] = [];
        const add = (id: string | undefined, scope: LoreSource['scope']) => {
            const book = this.store.get<Lorebook>('lorebook', id);
            if (book) sources.push({ book, scope });
        };
        add(chat.lorebookId, 'chat');
        add(persona?.lorebookId, 'persona');
        character.lorebookIds.forEach(id => add(id, 'character'));
        this.store.settings.lore.globalLorebookIds.forEach(id => add(id, 'global'));
        return sources;
    }

    buildInput(chat: Chat, type: GenerationType, messages: ChatMessage[]): AssembleInput {
        const character = this.store.require<Character>('character', chat.characterId);
        const { name: userName, persona } = this.persona(chat);
        const s = this.store.settings;
        return {
            type,
            chatId: chat.id,
            character,
            userName,
            persona: {
                description: persona?.description ?? '',
                position: persona?.position ?? 'in_prompt',
                depth: persona?.depth ?? 2,
                role: persona?.role ?? 'system',
            },
            preset: this.preset(chat),
            lore: { sources: this.loreSources(chat, character, persona), settings: s.lore },
            messages,
            authorsNote: chat.authorsNote,
            variables: { chat: chat.variables ?? {}, global: s.globalVariables ?? {} },
            timedLore: chat.runtime?.timedLore,
            globalRegex: [],
            options: {
                preferCharacterPrompt: s.preferCharacterPrompt,
                preferCharacterJailbreak: s.preferCharacterJailbreak,
                pinExamples: s.pinExamples,
                collapseNewlines: s.collapseNewlines,
            },
            model: this.connection()?.conn.model ?? '',
            injections: [],
        };
    }

    private async runAssemble(chat: Chat, input: AssembleInput): Promise<AssembleResult> {
        const character = input.character;
        const ctx = { chat, character, input, injections: input.injections as Injection[] };
        for (const fn of this.plugins.before) await fn(ctx);
        const result = assemble(input);
        for (const fn of this.plugins.after) await fn(result, ctx);
        return result;
    }

    /** Assembles without side effects, e.g. for the inspector. `pending` is an unsent user message. */
    async preview(chatId: string, pending?: string): Promise<AssembleResult> {
        const chat = this.store.require<Chat>('chat', chatId);
        const messages = [...chat.messages];
        if (pending?.trim()) {
            messages.push(this.userMessage(chat, pending));
        }
        const input = this.buildInput(chat, 'normal', messages);
        input.dryRun = true;
        return this.runAssemble(chat, input);
    }

    lastPrompt(chatId: string): PromptSnapshot | undefined {
        return this.lastPrompts.get(chatId);
    }

    /** Non-streaming helper completion for plugins. */
    async complete(req: { messages: { role: 'system' | 'user' | 'assistant'; content: string }[]; maxTokens?: number; temperature?: number; signal?: AbortSignal }): Promise<string> {
        const link = this.connection();
        if (!link) throw new Error('还没有配置模型连接');
        const base = this.preset();
        const preset = {
            ...base,
            sampling: { ...base.sampling, temperature: req.temperature ?? 0.3 },
            context: { ...base.context, maxTokens: req.maxTokens ?? 1500, stream: true },
        };
        let text = '';
        const controller = new AbortController();
        req.signal?.addEventListener('abort', () => controller.abort());
        const timer = setTimeout(() => controller.abort(), 120000);
        try {
            for await (const ev of streamChat(link.conn, link.key, { messages: req.messages, preset, names: { user: 'User', char: 'Assistant' } }, controller.signal)) {
                if (ev.type === 'text') text += ev.text;
            }
        } finally {
            clearTimeout(timer);
        }
        return text;
    }

    // ------------------------------------------------------------------------------------------
    // Chats
    // ------------------------------------------------------------------------------------------

    private macroText(text: string, chat: Chat, character: Character): string {
        const ctx = createMacroContext({ user: this.persona(chat).name, char: character.name, seed: chat.id });
        return evaluateMacros(text, ctx);
    }

    private userMessage(chat: Chat, text: string): ChatMessage {
        const content = applyRegex(this.regexScripts(chat), text, 'user_input', {
            macros: t => this.macroText(t, chat, this.store.require<Character>('character', chat.characterId)),
        });
        const now = Date.now();
        return {
            id: newId('m'),
            role: 'user',
            name: this.persona(chat).name,
            swipes: [{ id: newId('s'), content, createdAt: now }],
            activeSwipe: 0,
            hidden: false,
            createdAt: now,
        };
    }

    async createChat(characterId: string): Promise<Chat> {
        const character = this.store.require<Character>('character', characterId);
        const now = Date.now();
        const chat: Chat = {
            id: newId('chat'),
            kind: 'chat',
            name: `${character.name} · ${new Date(now).toLocaleString('zh-CN', { hour12: false })}`,
            createdAt: now,
            updatedAt: now,
            characterId,
            messages: [],
            variables: {},
            authorsNote: { content: '', interval: 1, position: 'in_chat', depth: 4, role: 'system', scan: false },
            runtime: {},
        };
        const greetings = [character.fields.firstMessage, ...character.fields.alternateGreetings].filter(g => g.trim());
        if (greetings.length) {
            const scripts = [...this.preset(chat).regex, ...character.regex];
            chat.messages.push({
                id: newId('m'),
                role: 'assistant',
                name: character.name,
                swipes: greetings.map(g => ({
                    id: newId('s'),
                    content: applyRegex(scripts, this.macroText(g, chat, character), 'ai_output', { macros: t => this.macroText(t, chat, character) }),
                    createdAt: now,
                })),
                activeSwipe: 0,
                hidden: false,
                createdAt: now,
            });
        }
        for (const fn of this.plugins.create) {
            await fn({ chat, character });
        }
        return this.store.create(chat);
    }

    async branchChat(chatId: string, messageId: string, swipeId: string): Promise<Chat> {
        if (this.isBusy(chatId)) {
            throw Object.assign(new Error('请等当前回复生成结束后再创建分支'), { status: 409 });
        }
        const source = this.store.require<Chat>('chat', chatId);
        const index = source.messages.findIndex(message => message.id === messageId && message.role === 'assistant');
        const anchor = source.messages[index];
        const swipe = anchor?.swipes.find(candidate => candidate.id === swipeId);
        if (!swipe) {
            throw Object.assign(new Error('找不到要创建分支的回复版本'), { status: 404 });
        }

        const messages = source.messages.slice(0, index);
        messages.push({ ...anchor, swipes: [swipe], activeSwipe: 0 });
        const atCurrentReply = index === source.messages.length - 1 && anchor.swipes[anchor.activeSwipe] === swipe;
        const chatState = atCurrentReply ? source : swipe.chatState;
        const now = Date.now();
        return this.store.create(structuredClone({
            ...source,
            id: newId('chat'),
            name: `${source.name} · 分支 #${index + 1}`,
            messages,
            variables: chatState?.variables ?? source.variables,
            runtime: chatState?.runtime ?? {},
            createdAt: now,
            updatedAt: now,
        }));
    }

    // ------------------------------------------------------------------------------------------
    // Generation
    // ------------------------------------------------------------------------------------------

    abort(jobId: string): boolean {
        const job = this.jobs.get(jobId);
        job?.controller.abort();
        return Boolean(job);
    }

    /** Resolves when no generation is running (or after `timeoutMs`). */
    async idle(timeoutMs: number): Promise<void> {
        const until = Date.now() + timeoutMs;
        while (this.jobs.size && Date.now() < until) {
            await new Promise(r => setTimeout(r, 300));
        }
    }

    isBusy(chatId: string): string | undefined {
        return [...this.jobs.values()].find(j => j.chatId === chatId)?.id;
    }

    async generate(chatId: string, req: GenerationRequest, emit: (e: GenerateEvent) => void): Promise<void> {
        if (this.isBusy(chatId)) {
            throw Object.assign(new Error('这个对话正在生成中'), { status: 409 });
        }
        const job: Job = { id: newId('job'), chatId, controller: new AbortController() };
        this.jobs.set(job.id, job);
        try {
            await this.runGeneration(job, req, emit);
        } finally {
            this.jobs.delete(job.id);
        }
    }

    private async runGeneration(job: Job, req: GenerationRequest, emit: (e: GenerateEvent) => void) {
        const { chatId } = job;
        const link = this.connection();
        if (!link || !link.conn.baseUrl || !link.conn.model) {
            throw Object.assign(new Error('还没有配置模型连接：请先在「设置 → 模型连接」里填写接口地址和模型'), { status: 400 });
        }
        let chat = this.store.require<Chat>('chat', chatId);
        const character = this.store.require<Character>('character', chat.characterId);
        const type = req.type;

        if (type === 'normal' && req.text?.trim()) {
            const message = this.userMessage(chat, req.text);
            chat = (await this.store.apply({ target: { kind: 'chat', id: chat.id }, ops: [{ op: 'insert', path: ['messages'], value: message }], author: 'user', journal: false })).resource as Chat;
        }

        const last = chat.messages[chat.messages.length - 1];
        const reuseLast = (type === 'swipe' || type === 'regenerate' || type === 'continue') && last?.role === 'assistant';
        if ((type === 'swipe' || type === 'regenerate' || type === 'continue') && !reuseLast) {
            throw Object.assign(new Error('最后一条不是角色的回复'), { status: 400 });
        }
        const context = type === 'swipe' || type === 'regenerate' ? chat.messages.slice(0, -1) : chat.messages;

        const initialChat = chat;
        const input = this.buildInput(initialChat, type, context);
        const result = await this.runAssemble(initialChat, input);
        const editing = type === 'normal' && req.source !== 'card' && Boolean(req.text?.trim())
            && chat.catgod?.mode === 'chat' && chat.catgod.editCard === true && isCatgodPreset(input.preset);
        if (editing) {
            const tokens = estimateTokens(CARD_EDITOR_INSTRUCTION) + MESSAGE_OVERHEAD;
            const instruction = { role: 'system' as const, content: CARD_EDITOR_INSTRUCTION };
            result.parts.unshift({ ...instruction, sources: ['cardEditor'], tokens });
            result.messages.unshift(instruction);
            result.tokens.total += tokens;
        }
        const snapshot: PromptSnapshot = {
            at: Date.now(), type, model: link.conn.model,
            parts: result.parts, warnings: result.warnings, tokens: result.tokens, lore: result.lore.activated,
            tools: editing ? toolNames({ tools: CARD_EDITOR_TOOLS }) : toolNames(result.request),
        };
        this.lastPrompts.set(chat.id, snapshot);

        // Target swipe
        const now = Date.now();
        let messageId: string;
        let swipeId: string;
        let prefix = '';
        const ops: Op[] = [];
        if (type === 'normal' || !reuseLast) {
            messageId = newId('m');
            swipeId = newId('s');
            ops.push({ op: 'insert', path: ['messages'], value: {
                id: messageId, role: 'assistant', name: character.name,
                swipes: [{ id: swipeId, content: '', createdAt: now, model: link.conn.model }],
                activeSwipe: 0, hidden: false, createdAt: now,
            } satisfies ChatMessage });
        } else if (type === 'swipe') {
            messageId = last.id;
            swipeId = newId('s');
            ops.push({ op: 'insert', path: ['messages', `@${last.id}`, 'swipes'], value: { id: swipeId, content: '', createdAt: now, model: link.conn.model } satisfies Swipe });
            ops.push({ op: 'set', path: ['messages', `@${last.id}`, 'activeSwipe'], value: last.swipes.length });
        } else {
            messageId = last.id;
            const swipe = last.swipes[last.activeSwipe];
            swipeId = swipe.id;
            if (type === 'continue') {
                prefix = swipe.content;
            } else {
                ops.push({ op: 'set', path: ['messages', `@${last.id}`, 'swipes', `@${swipe.id}`], value: { id: swipe.id, content: '', createdAt: now, model: link.conn.model } satisfies Swipe });
            }
        }
        // Macro side effects ({{setvar}}) and world-info timers persist like in ST.
        ops.push({ op: 'set', path: ['variables'], value: result.variables.chat });
        ops.push({ op: 'set', path: ['runtime', 'timedLore'], value: result.timedLore });
        chat = (await this.store.apply({ target: { kind: 'chat', id: chat.id }, ops, author: 'system', journal: false })).resource as Chat;
        if (JSON.stringify(result.variables.global) !== JSON.stringify(this.store.settings.globalVariables)) {
            await this.store.saveSettings({ globalVariables: result.variables.global });
        }

        emit({ type: 'job', jobId: job.id, messageId, swipeId, prefix });
        emit({ type: 'prompt', parts: result.parts, warnings: result.warnings, tokens: result.tokens, lore: result.lore.activated, tools: snapshot.tools });

        const live = () => {
            const current = this.store.require<Chat>('chat', chatId);
            const message = current.messages.find(m => m.id === messageId) as ChatMessage;
            return { current, message, swipe: message.swipes.find(s => s.id === swipeId) as Swipe };
        };

        let text = '';
        let reasoning = '';
        let finish: Swipe['finish'] = 'stop';
        let error: string | undefined;
        const modelRequest = {
            messages: result.messages,
            preset: input.preset,
            names: { user: input.userName, char: character.name },
        };
        const run = async (extra?: Record<string, unknown>) => {
            const stream = streamChat(link.conn, link.key, { ...modelRequest, extra }, job.controller.signal);
            let lastFlush = Date.now();
            for await (const ev of stream) {
                if (ev.type === 'text') {
                    text += ev.text;
                    emit({ type: 'text', text: ev.text });
                } else if (ev.type === 'reasoning') {
                    reasoning += ev.text;
                    emit({ type: 'reasoning', text: ev.text });
                } else if (ev.type === 'done') {
                    finish = ev.finish;
                }
                if (Date.now() - lastFlush > 1000) {
                    lastFlush = Date.now();
                    const { swipe } = live();
                    swipe.content = prefix + text;
                    if (reasoning) swipe.reasoning = reasoning;
                }
            }
        };
        try {
            if (editing) {
                const reply = await editCard(this.store, character.id, link.conn, link.key, modelRequest, job.controller.signal,
                    reason => emit({ type: 'card-edit', reason }));
                text = reply.text;
                finish = reply.finish;
                if (text) emit({ type: 'text', text });
            } else {
                try {
                    await run(result.request);
                } catch (e) {
                    // Some endpoints reject preset reply tools; retry once with the plain request.
                    if (!result.request || text || job.controller.signal.aborted) throw e;
                    console.warn('[runtime] 接口不接受预设附带的工具，改用普通请求重试：', (e as Error).message);
                    await run(undefined);
                }
            }
        } catch (e) {
            if (job.controller.signal.aborted) {
                finish = 'aborted';
            } else {
                finish = 'error';
                error = (e as Error).message;
            }
        }

        // Commit: AI-output regex, plugin post-processing, then one change set for the swipe.
        if (this.plugins.receive.length) emit({ type: 'finalizing' });
        const { current, message, swipe } = live();
        let content = prefix + text;
        if (finish !== 'error' || text) {
            content = applyRegex(this.regexScripts(current), content, 'ai_output', { macros: t => this.macroText(t, current, character) });
        }
        const extraOps: NonNullable<ReceiveResult['ops']>[] = [];
        for (const fn of this.plugins.receive) {
            const out = await fn({ chat: current, initialChat, parts: result.parts, character, preset: input.preset, message, swipe, text: content, finish: finish ?? 'stop' });
            if (out?.text !== undefined) content = out.text;
            if (out?.ops) extraOps.push(out.ops);
        }
        const latestChat = this.store.require<Chat>('chat', chatId);
        const finalSwipe: Swipe = {
            ...swipe,
            content,
            ...(reasoning ? { reasoning } : {}),
            finish,
            ...(error ? { error } : {}),
            model: link.conn.model,
            chatState: { variables: latestChat.variables, runtime: latestChat.runtime },
        };
        const commitOps = extraOps.flatMap(ops => typeof ops === 'function' ? ops(latestChat) : ops);
        const committed = await this.store.apply({
            target: { kind: 'chat', id: chatId },
            ops: [{ op: 'set', path: ['messages', `@${messageId}`, 'swipes', `@${swipeId}`], value: finalSwipe }, ...commitOps],
            author: 'system',
            journal: false,
        });
        const finalMessage = (committed.resource as Chat).messages.find(m => m.id === messageId) as ChatMessage;
        if (error) {
            emit({ type: 'error', error, message: finalMessage });
        } else {
            emit({ type: 'done', message: finalMessage });
        }
    }
}

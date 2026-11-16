// Turn runner: resolves the snapshot for a chat, assembles the prompt, streams the reply and
// commits the result. Generation runs server-side, so closing the window does not stop it.

import { assemble, type AssembleInput, type AssembleResult, type GenerationType, type Injection } from '../core/assemble.ts';
import { defaultPreset } from '../core/compat/st-preset.ts';
import type { LoreSource } from '../core/lore.ts';
import { createMacroContext, evaluateMacros } from '../core/macros.ts';
import type { Op } from '../core/ops.ts';
import { applyRegex } from '../core/regex.ts';
import type { Character, Chat, ChatMessage, ChatMode, Connection, Lorebook, Persona, Preset, RegexScript, Swipe } from '../core/types.ts';
import { newId } from '../core/util.ts';
import { applyCardEdits, buildEditPrompt, type EditPrompt } from './card-edit.ts';
import type { PluginHost } from './plugins.ts';
import { buildBody, streamChat } from './providers/openai.ts';
import { estimateTokens, MESSAGE_OVERHEAD } from '../core/tokens.ts';
import type { Store } from './store.ts';

export type GenerateEvent =
    | { type: 'job'; jobId: string; messageId: string; swipeId: string; prefix: string }
    | { type: 'prompt'; parts: AssembleResult['parts']; warnings: string[]; tokens: AssembleResult['tokens']; lore: AssembleResult['lore']['activated']; tools: string[]; sent?: AssembleResult['parts'] }
    | { type: 'text'; text: string }
    | { type: 'reasoning'; text: string }
    | { type: 'finalizing' }
    | { type: 'done'; message: ChatMessage }
    | { type: 'error'; error: string; message?: ChatMessage };

interface Job {
    id: string;
    chatId: string;
    controller: AbortController;
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
    /** What was actually sent, when a plugin's request hook rewrote the assembled messages. */
    sent?: AssembleResult['parts'];
}

/** The final request's messages as trace parts. */
function sentParts(messages: unknown): AssembleResult['parts'] {
    if (!Array.isArray(messages)) return [];
    return messages.map((m: Record<string, unknown>) => {
        const text = typeof m.content === 'string' ? m.content : m.content == null ? '' : JSON.stringify(m.content);
        const calls = Array.isArray(m.tool_calls) ? (m.tool_calls as { function?: { name?: string; arguments?: string } }[]).map(c => `→ ${c.function?.name ?? ''} ${c.function?.arguments ?? ''}`).join('\n') : '';
        const content = [text, calls].filter(Boolean).join('\n');
        const role = m.role === 'user' || m.role === 'assistant' ? m.role : 'system';
        return { role, content, sources: [m.role === 'tool' ? 'sentTool' : 'sent'], tokens: estimateTokens(content) + MESSAGE_OVERHEAD } as AssembleResult['parts'][number];
    });
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
            // 编辑 conversations are about the card, not part of the story.
            messages: messages.filter(m => m.mode !== 'edit'),
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
    /** The request the next message would send, in the chat's current mode. */
    async preview(chatId: string, pending?: string): Promise<Omit<PromptSnapshot, 'at' | 'type' | 'model'>> {
        const chat = this.store.require<Chat>('chat', chatId);
        const mode = chat.mode ?? 'story';
        const messages = [...chat.messages];
        if (pending?.trim()) {
            messages.push(this.userMessage(chat, pending, mode));
        }
        if (mode === 'edit') {
            const prompt = this.editPrompt(chat, messages);
            return { parts: prompt.parts, warnings: [], tokens: this.editTokens(prompt), lore: [], tools: [] };
        }
        const input = this.buildInput(chat, 'normal', messages);
        input.dryRun = true;
        const result = await this.runAssemble(chat, input);
        return { parts: result.parts, warnings: result.warnings, tokens: result.tokens, lore: result.lore.activated, tools: toolNames(result.request) };
    }

    private editPrompt(chat: Chat, messages: ChatMessage[]): EditPrompt {
        const character = this.store.require<Character>('character', chat.characterId);
        const preset = this.preset(chat);
        return buildEditPrompt({
            store: this.store,
            character,
            books: character.lorebookIds.map(id => this.store.get<Lorebook>('lorebook', id)).filter((b): b is Lorebook => Boolean(b)),
            messages,
            userName: this.persona(chat).name,
            maxContext: preset.context.maxContext,
            maxTokens: preset.context.maxTokens,
        });
    }

    private editTokens(prompt: EditPrompt): PromptSnapshot['tokens'] {
        const { maxContext, maxTokens } = this.preset().context;
        return { total: prompt.tokens, budget: maxContext - maxTokens, maxContext, maxTokens };
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

    private userMessage(chat: Chat, text: string, mode: ChatMode = 'story'): ChatMessage {
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
            ...(mode === 'story' ? {} : { mode }),
        };
    }

    /**
     * A new chat holding the messages up to the given reply version (only that version of it). It
     * starts with the chat variables as they were after that reply; later edits in either chat do
     * not affect the other. Cards and lorebooks stay shared.
     */
    async branchChat(chatId: string, messageId: string, swipeId: string): Promise<Chat> {
        if (this.isBusy(chatId)) {
            throw Object.assign(new Error('请等当前回复生成结束后再创建分支'), { status: 409 });
        }
        const source = this.store.require<Chat>('chat', chatId);
        const index = source.messages.findIndex(m => m.id === messageId && m.role === 'assistant');
        const anchor = source.messages[index];
        const swipe = anchor?.swipes.find(s => s.id === swipeId);
        if (!anchor || !swipe) {
            throw Object.assign(new Error('找不到要创建分支的回复版本'), { status: 404 });
        }
        const atEnd = index === source.messages.length - 1 && anchor.swipes[anchor.activeSwipe] === swipe;
        const chatState = atEnd ? { variables: source.variables, runtime: source.runtime } : swipe.chatState;
        const now = Date.now();
        return this.store.create(structuredClone({
            ...source,
            id: newId('chat'),
            name: `${source.name} · 分支 #${index + 1}`,
            messages: [...source.messages.slice(0, index), { ...anchor, swipes: [swipe], activeSwipe: 0 }],
            variables: chatState?.variables ?? source.variables,
            runtime: chatState?.runtime ?? {},
            branch: { chatId: source.id, messageId, swipeId, index: index + 1 },
            createdAt: now,
            updatedAt: now,
        }));
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

    async generate(chatId: string, req: { type: GenerationType; text?: string }, emit: (e: GenerateEvent) => void): Promise<void> {
        if (this.isBusy(chatId)) {
            throw Object.assign(new Error('这个对话正在生成中'), { status: 409 });
        }
        const link = this.connection();
        if (!link || !link.conn.baseUrl || !link.conn.model) {
            throw Object.assign(new Error('还没有配置模型连接：请先在「设置 → 模型连接」里填写接口地址和模型'), { status: 400 });
        }
        let chat = this.store.require<Chat>('chat', chatId);
        const character = this.store.require<Character>('character', chat.characterId);
        const type = req.type;
        const tail = chat.messages[chat.messages.length - 1];
        // A new message goes to the chat's current mode; redoing or continuing a reply keeps its mode.
        const mode: ChatMode = type === 'normal' ? chat.mode ?? 'story' : tail?.mode ?? 'story';
        if (mode === 'edit' && type === 'normal' && !req.text?.trim()) {
            throw Object.assign(new Error('编辑模式下，请写下想怎么改角色卡或世界书'), { status: 400 });
        }

        if (type === 'normal' && req.text?.trim()) {
            const message = this.userMessage(chat, req.text, mode);
            chat = (await this.store.apply({ target: { kind: 'chat', id: chat.id }, ops: [{ op: 'insert', path: ['messages'], value: message }], author: 'user', journal: false })).resource as Chat;
        }

        const last = chat.messages[chat.messages.length - 1];
        const reuseLast = (type === 'swipe' || type === 'regenerate' || type === 'continue') && last?.role === 'assistant';
        if ((type === 'swipe' || type === 'regenerate' || type === 'continue') && !reuseLast) {
            throw Object.assign(new Error('最后一条不是角色的回复'), { status: 400 });
        }
        const context = type === 'swipe' || type === 'regenerate' ? chat.messages.slice(0, -1) : chat.messages;

        const input = this.buildInput(chat, type, context);
        // 编辑 mode sends the card as a document instead of the role-play prompt.
        const edit = mode === 'edit' ? this.editPrompt(chat, context) : null;
        const result: Pick<AssembleResult, 'messages' | 'parts' | 'warnings' | 'tokens' | 'request'> & Partial<AssembleResult> = edit
            ? { messages: edit.messages, parts: edit.parts, warnings: [], tokens: this.editTokens(edit) }
            : await this.runAssemble(chat, input);
        const snapshot: PromptSnapshot = {
            at: Date.now(), type, model: link.conn.model,
            parts: result.parts, warnings: result.warnings, tokens: result.tokens, lore: result.lore?.activated ?? [], tools: toolNames(result.request),
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
                ...(mode === 'story' ? {} : { mode }),
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
        if (result.variables) ops.push({ op: 'set', path: ['variables'], value: result.variables.chat });
        if (result.timedLore) ops.push({ op: 'set', path: ['runtime', 'timedLore'], value: result.timedLore });
        chat = (await this.store.apply({ target: { kind: 'chat', id: chat.id }, ops, author: 'system', journal: false })).resource as Chat;
        if (result.variables && JSON.stringify(result.variables.global) !== JSON.stringify(this.store.settings.globalVariables)) {
            await this.store.saveSettings({ globalVariables: result.variables.global });
        }

        const job: Job = { id: newId('job'), chatId: chat.id, controller: new AbortController() };
        this.jobs.set(job.id, job);
        emit({ type: 'job', jobId: job.id, messageId, swipeId, prefix });
        emit({ type: 'prompt', parts: result.parts, warnings: result.warnings, tokens: result.tokens, lore: snapshot.lore, tools: snapshot.tools });

        const live = () => {
            const current = this.store.require<Chat>('chat', chatId);
            const message = current.messages.find(m => m.id === messageId) as ChatMessage;
            return { current, message, swipe: message.swipes.find(s => s.id === swipeId) as Swipe };
        };

        let text = '';
        let reasoning = '';
        let finish: Swipe['finish'] = 'stop';
        let error: string | undefined;
        let usedTools = Boolean(result.request?.tools);
        const run = async (extra?: Record<string, unknown>, plain = false) => {
            const request = { messages: result.messages, preset: input.preset, names: { user: input.userName, char: character.name }, extra };
            // Plugins see the final body (a preset's own request script rewrites it here). 编辑 requests are Hearth's own.
            let body: Record<string, unknown> | undefined;
            if (!edit && this.plugins.request.length) {
                body = buildBody(link.conn, request, input.preset.context.stream);
                const before = JSON.stringify(body);
                const ctx = { chat: this.store.require<Chat>('chat', chatId), character, preset: input.preset, warn: (t: string) => { snapshot.warnings.push(t); } };
                for (const fn of this.plugins.request) {
                    try {
                        body = (await fn(body, ctx)) ?? body;
                    } catch (e) {
                        snapshot.warnings.push(`插件处理请求时出错，已跳过：${(e as Error).message}`);
                    }
                }
                if (plain) {
                    delete body.tools;
                    delete body.tool_choice;
                    delete body.toolConfig;
                }
                usedTools ||= Boolean(body.tools);
                if (JSON.stringify(body) !== before) {
                    snapshot.sent = sentParts(body.messages);
                    snapshot.tools = toolNames(body);
                    emit({ type: 'prompt', parts: result.parts, warnings: snapshot.warnings, tokens: result.tokens, lore: snapshot.lore, tools: snapshot.tools, sent: snapshot.sent });
                }
            }
            const stream = streamChat(link.conn, link.key, request, job.controller.signal, body);
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
            try {
                await run(result.request);
            } catch (e) {
                // Some endpoints reject tools; retry once with the plain request.
                if (!usedTools || text || job.controller.signal.aborted) throw e;
                console.warn('[runtime] 接口不接受预设附带的工具，改用普通请求重试：', (e as Error).message);
                await run(undefined, true);
            }
        } catch (e) {
            if (job.controller.signal.aborted) {
                finish = 'aborted';
            } else {
                finish = 'error';
                error = (e as Error).message;
            }
        } finally {
            this.jobs.delete(job.id);
        }

        // Commit: AI-output regex, plugin post-processing, then one change set for the swipe.
        // 编辑 replies skip both (they are not story text) and apply their edit block instead.
        if (edit || this.plugins.receive.length) emit({ type: 'finalizing' });
        const { current, message, swipe } = live();
        let content = prefix + text;
        const extraOps: Op[] = [];
        let edits = swipe.edits;
        if (edit) {
            if (finish === 'aborted' || finish === 'error') {
                if (content.includes('<card_edit>') && !edits) edits = { results: [], changes: [], note: finish === 'aborted' ? '已中止，修改没有执行' : '生成出错，修改没有执行' };
            } else if (!edits?.changes.length) {
                try {
                    edits = await applyCardEdits(this.store, character.id, content, edit, finish);
                } catch (e) {
                    edits = { results: [], changes: [], note: `修改没有执行：${(e as Error).message}` };
                }
            }
        } else {
            if (finish !== 'error' || text) {
                content = applyRegex(this.regexScripts(current), content, 'ai_output', { macros: t => this.macroText(t, current, character) });
            }
            for (const fn of this.plugins.receive) {
                const out = await fn({ chat: current, character, preset: input.preset, message, swipe, text: content, finish: finish ?? 'stop' });
                if (out?.text !== undefined) content = out.text;
                if (out?.ops) extraOps.push(...out.ops);
            }
        }
        const latest = this.store.require<Chat>('chat', chatId);
        const finalSwipe: Swipe = {
            ...swipe,
            content,
            ...(reasoning ? { reasoning } : {}),
            finish,
            ...(error ? { error } : {}),
            model: link.conn.model,
            chatState: structuredClone({ variables: latest.variables, runtime: latest.runtime }),
            ...(edits ? { edits } : {}),
        };
        const committed = await this.store.apply({
            target: { kind: 'chat', id: chatId },
            ops: [{ op: 'set', path: ['messages', `@${messageId}`, 'swipes', `@${swipeId}`], value: finalSwipe }, ...extraOps],
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

// Plugin host. A plugin is an ES module in ./plugins/<name>/index.mjs (or ./plugins/<name>.mjs)
// exporting `default { id, setup(api) }`. Built-in features use the same hooks.
//
// Extension points:
//   - macros:          api.registerMacro(name, handler)
//   - prompt:          api.onBeforeAssemble(ctx => ctx.injections.push({...}))  (ST extension prompts)
//   - result:          api.onAfterAssemble((result, ctx) => …)                 (inspect / adjust messages)
//   - model output:    api.onAfterReceive(ctx => ({ text, ops }))              (e.g. MVU variable updates)
//   - new chats:       api.onChatCreate(ctx => { ctx.chat.… })                  (e.g. initial variables)
//   - data:            api.store.get / list / apply                            (same change channel as the UI)

import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { AssembleInput, AssembleResult, Injection } from '../core/assemble.ts';
import { registerMacro, type MacroHandler } from '../core/macros.ts';
import type { Op } from '../core/ops.ts';
import type { Character, Chat, ChatMessage, Preset, Swipe } from '../core/types.ts';
import type { Store } from './store.ts';

export interface AssembleContext {
    chat: Chat;
    character: Character;
    input: AssembleInput;
    injections: Injection[];
}

export interface ReceiveContext {
    chat: Chat;
    /** Chat snapshot used to assemble the request. */
    initialChat: Chat;
    parts: AssembleResult['parts'];
    character: Character;
    preset: Preset;
    message: ChatMessage;
    swipe: Swipe;
    text: string;
    /** How the generation ended. */
    finish: NonNullable<Swipe['finish']>;
}

export interface ReceiveResult {
    /** Replacement text for the swipe. */
    text?: string;
    /** Extra chat ops, optionally resolved against the latest chat at commit time. */
    ops?: Op[] | ((chat: Chat) => Op[]);
}

export interface ChatCreateContext {
    /** The new chat, not yet saved; mutate it directly. */
    chat: Chat;
    character: Character;
}

export interface CompleteRequest {
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
    maxTokens?: number;
    temperature?: number;
    signal?: AbortSignal;
}

export interface PluginApi {
    registerMacro: (names: string | string[], handler: MacroHandler) => void;
    onBeforeAssemble: (fn: (ctx: AssembleContext) => void | Promise<void>) => void;
    onAfterAssemble: (fn: (result: AssembleResult, ctx: AssembleContext) => void | Promise<void>) => void;
    onAfterReceive: (fn: (ctx: ReceiveContext) => ReceiveResult | void | Promise<ReceiveResult | void>) => void;
    onChatCreate: (fn: (ctx: ChatCreateContext) => void | Promise<void>) => void;
    /** One-off completion with the active model connection (no streaming to the UI). */
    complete: (req: CompleteRequest) => Promise<string>;
    store: Pick<Store, 'get' | 'list' | 'apply'>;
    log: (...args: unknown[]) => void;
}

export interface HearthPlugin {
    id: string;
    name?: string;
    setup: (api: PluginApi) => void | Promise<void>;
}

export class PluginHost {
    before: ((ctx: AssembleContext) => void | Promise<void>)[] = [];
    after: ((result: AssembleResult, ctx: AssembleContext) => void | Promise<void>)[] = [];
    receive: ((ctx: ReceiveContext) => ReceiveResult | void | Promise<ReceiveResult | void>)[] = [];
    create: ((ctx: ChatCreateContext) => void | Promise<void>)[] = [];
    loaded: { id: string; name: string; error?: string }[] = [];
    completer: ((req: CompleteRequest) => Promise<string>) | null = null;
    private store: Store;

    constructor(store: Store) {
        this.store = store;
    }

    async use(plugin: HearthPlugin) {
        const api: PluginApi = {
            registerMacro,
            onBeforeAssemble: fn => { this.before.push(fn); },
            onAfterAssemble: fn => { this.after.push(fn); },
            onAfterReceive: fn => { this.receive.push(fn); },
            onChatCreate: fn => { this.create.push(fn); },
            complete: req => {
                if (!this.completer) throw new Error('模型连接尚未就绪');
                return this.completer(req);
            },
            store: this.store,
            log: (...args) => console.log(`[plugin:${plugin.id}]`, ...args),
        };
        try {
            await plugin.setup(api);
            this.loaded.push({ id: plugin.id, name: plugin.name ?? plugin.id });
        } catch (error) {
            this.loaded.push({ id: plugin.id, name: plugin.name ?? plugin.id, error: (error as Error).message });
            console.error(`[plugins] ${plugin.id} 初始化失败:`, error);
        }
    }

    async loadDirectory(dir: string) {
        if (!existsSync(dir)) return;
        for (const name of readdirSync(dir)) {
            const full = path.join(dir, name);
            const entry = statSync(full).isDirectory() ? path.join(full, 'index.mjs') : full;
            if (!entry.endsWith('.mjs') || !existsSync(entry)) continue;
            try {
                const mod = await import(pathToFileURL(entry).href);
                const plugin = (mod.default ?? mod) as HearthPlugin;
                if (plugin?.id && typeof plugin.setup === 'function') {
                    await this.use(plugin);
                }
            } catch (error) {
                this.loaded.push({ id: name, name, error: (error as Error).message });
                console.error(`[plugins] 无法加载 ${name}:`, error);
            }
        }
    }
}

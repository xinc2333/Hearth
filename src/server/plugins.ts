// Plugin host. A plugin is a folder with a manifest.json and an ES module (manifest `main`, by
// default server.mjs) exporting `default { setup(api) }`. Built-in plugins ship in <app>/plugins;
// installed plugins and downloaded updates live in <data>/plugins. Hooks and macros are recorded per
// plugin, so a plugin can be switched off, replaced by an update or removed while Hearth runs.
//
// Extension points:
//   - macros:          api.registerMacro(name, handler)
//   - prompt:          api.onBeforeAssemble(ctx => ctx.injections.push({...}))  (ST extension prompts)
//   - result:          api.onAfterAssemble((result, ctx) => …)                 (inspect / adjust messages)
//   - model output:    api.onAfterReceive(ctx => ({ text, ops }))              (e.g. MVU variable updates)
//   - new chats:       api.onChatCreate(ctx => { ctx.chat.… })                  (e.g. initial variables)
//   - data:            api.store.get / list / apply                            (same change channel as the UI)
//   - services:        api.macros, api.sandbox, api.complete, api.config

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { AssembleInput, AssembleResult, Injection } from '../core/assemble.ts';
import { createMacroContext, evaluateMacros, registerMacro, unregisterMacro, type MacroHandler } from '../core/macros.ts';
import type { Op } from '../core/ops.ts';
import type { Character, Chat, ChatMessage, Preset, Swipe } from '../core/types.ts';
import { runSandboxed } from './sandbox.ts';
import type { Store } from './store.ts';

export interface AssembleContext {
    chat: Chat;
    character: Character;
    input: AssembleInput;
    injections: Injection[];
}

export interface ReceiveContext {
    chat: Chat;
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
    /** Extra ops on the chat (paths relative to the chat resource). */
    ops?: Op[];
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

type BeforeHook = (ctx: AssembleContext) => void | Promise<void>;
type AfterHook = (result: AssembleResult, ctx: AssembleContext) => void | Promise<void>;
type ReceiveHook = (ctx: ReceiveContext) => ReceiveResult | void | Promise<ReceiveResult | void>;
type CreateHook = (ctx: ChatCreateContext) => void | Promise<void>;

export interface PluginApi {
    /** The plugin's id from its manifest. */
    id: string;
    registerMacro: (names: string | string[], handler: MacroHandler) => void;
    onBeforeAssemble: (fn: BeforeHook) => void;
    onAfterAssemble: (fn: AfterHook) => void;
    onAfterReceive: (fn: ReceiveHook) => void;
    onChatCreate: (fn: CreateHook) => void;
    /** One-off completion with the active model connection (no streaming to the UI). */
    complete: (req: CompleteRequest) => Promise<string>;
    store: Pick<Store, 'get' | 'list' | 'apply'>;
    /** Macro evaluation with every registered macro, including other plugins'. */
    macros: { context: typeof createMacroContext; evaluate: typeof evaluateMacros };
    /** Runs untrusted code (card or preset scripts) in the QuickJS sandbox. */
    sandbox: { run: typeof runSandboxed };
    /** This plugin's own settings. */
    config: () => Record<string, unknown>;
    log: (...args: unknown[]) => void;
}

export interface HearthPlugin {
    /** Taken from the manifest when the plugin is loaded from a folder. */
    id?: string;
    name?: string;
    setup: (api: PluginApi) => void | Promise<void>;
}

export interface PluginManifest {
    id: string;
    name: string;
    description?: string;
    version: string;
    /** Hearth versions the plugin works with, e.g. ">=0.3.0". */
    hearth?: string;
    /** Entry module, relative to the plugin folder. */
    main?: string;
    /** Every file of the plugin, relative to its folder; downloaded together when updating. */
    files?: string[];
    /** Plugins with a lower order run first. */
    order?: number;
    /** The SillyTavern extension this plugin is compatible with. */
    compat?: { name: string; url: string };
    /** Where updates come from: a GitHub link to the plugin's folder. */
    repository?: string;
}

export interface PluginInfo {
    manifest: PluginManifest;
    /** Folder the plugin was loaded from; absent for plugins passed to use() directly. */
    dir?: string;
    source: 'builtin' | 'installed';
    /** Set when the plugin failed to load or set up; its hooks are not active. */
    error?: string;
}

const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** Compares dotted versions numerically: 1.10.0 > 1.9.3. */
export function compareVersions(a: string, b: string): number {
    const pa = a.split(/[.+-]/).map(n => Number.parseInt(n, 10) || 0);
    const pb = b.split(/[.+-]/).map(n => Number.parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (d) return Math.sign(d);
    }
    return 0;
}

/** Supports the range forms plugins need: "", "*", ">=x.y.z", "<x.y.z" and space-separated combinations. */
export function satisfies(version: string, range: string | undefined): boolean {
    for (const part of (range ?? '').trim().split(/\s+/).filter(p => p && p !== '*')) {
        const m = part.match(/^(>=|<=|>|<|=)?(\d+(?:\.\d+){0,2})$/);
        if (!m) return false;
        const d = compareVersions(version, m[2]);
        const op = m[1] ?? '=';
        if ((op === '>=' && d < 0) || (op === '>' && d <= 0) || (op === '<=' && d > 0) || (op === '<' && d >= 0) || (op === '=' && d !== 0)) return false;
    }
    return true;
}

export function readManifest(dir: string): PluginManifest {
    const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as PluginManifest;
    if (!manifest || typeof manifest.id !== 'string' || !ID.test(manifest.id)) throw new Error('manifest.json 缺少有效的 id');
    if (typeof manifest.version !== 'string' || !/^\d+(\.\d+){0,2}/.test(manifest.version)) throw new Error('manifest.json 缺少有效的 version');
    manifest.name ||= manifest.id;
    return manifest;
}

export class PluginHost {
    readonly plugins = new Map<string, PluginInfo>();
    completer: ((req: CompleteRequest) => Promise<string>) | null = null;
    private hooks = {
        before: [] as { plugin: string; fn: BeforeHook }[],
        after: [] as { plugin: string; fn: AfterHook }[],
        receive: [] as { plugin: string; fn: ReceiveHook }[],
        create: [] as { plugin: string; fn: CreateHook }[],
    };
    private macros = new Map<string, { names: string | string[]; handler: MacroHandler }[]>();
    private store: Store;
    private hearthVersion: string;

    constructor(store: Store, hearthVersion = '0.0.0') {
        this.store = store;
        this.hearthVersion = hearthVersion;
    }

    get before() { return this.active(this.hooks.before); }
    get after() { return this.active(this.hooks.after); }
    get receive() { return this.active(this.hooks.receive); }
    get create() { return this.active(this.hooks.create); }

    /** Switched on in settings and loaded without errors. */
    enabled(id: string): boolean {
        const info = this.plugins.get(id);
        return Boolean(info && !info.error && this.store.settings?.plugins?.[id]?.enabled !== false);
    }

    /** Hooks of enabled plugins, in plugin order (then registration order). */
    private active<F>(list: { plugin: string; fn: F }[]): F[] {
        const order = (id: string) => this.plugins.get(id)?.manifest.order ?? 100;
        return list
            .map((h, i) => ({ h, i }))
            .filter(({ h }) => this.enabled(h.plugin))
            .sort((a, b) => order(a.h.plugin) - order(b.h.plugin) || a.i - b.i)
            .map(({ h }) => h.fn);
    }

    private api(id: string): PluginApi {
        return {
            id,
            registerMacro: (names, handler) => {
                const list = this.macros.get(id) ?? [];
                list.push({ names, handler });
                this.macros.set(id, list);
                if (this.store.settings?.plugins?.[id]?.enabled !== false) registerMacro(names, handler);
            },
            onBeforeAssemble: fn => { this.hooks.before.push({ plugin: id, fn }); },
            onAfterAssemble: fn => { this.hooks.after.push({ plugin: id, fn }); },
            onAfterReceive: fn => { this.hooks.receive.push({ plugin: id, fn }); },
            onChatCreate: fn => { this.hooks.create.push({ plugin: id, fn }); },
            complete: req => {
                if (!this.completer) throw new Error('模型连接尚未就绪');
                return this.completer(req);
            },
            store: this.store,
            macros: { context: createMacroContext, evaluate: evaluateMacros },
            sandbox: { run: runSandboxed },
            config: () => this.store.settings?.plugins?.[id]?.config ?? {},
            log: (...args) => console.log(`[plugin:${id}]`, ...args),
        };
    }

    /** Registers a plugin object. Folder plugins come through loadFolder(); tests call this directly. */
    async use(plugin: HearthPlugin, manifest?: PluginManifest, dir?: string, source: PluginInfo['source'] = 'builtin') {
        const meta: PluginManifest = manifest ?? { id: plugin.id ?? 'plugin', name: plugin.name ?? plugin.id ?? 'plugin', version: '0.0.0' };
        this.unload(meta.id);
        const info: PluginInfo = { manifest: meta, dir, source };
        this.plugins.set(meta.id, info);
        try {
            await plugin.setup(this.api(meta.id));
        } catch (error) {
            this.unload(meta.id);
            info.error = (error as Error).message;
            this.plugins.set(meta.id, info);
            console.error(`[plugins] ${meta.id} 初始化失败:`, error);
        }
        return info;
    }

    /** Removes a plugin's hooks and macros. */
    unload(id: string) {
        for (const list of Object.values(this.hooks)) {
            for (let i = list.length - 1; i >= 0; i--) if (list[i].plugin === id) list.splice(i, 1);
        }
        for (const { names } of this.macros.get(id) ?? []) unregisterMacro(names);
        this.macros.delete(id);
        this.plugins.delete(id);
    }

    /** Applies a changed on/off switch to the plugin's macros (hooks check the switch on every call). */
    syncEnabled(id: string) {
        const on = this.store.settings?.plugins?.[id]?.enabled !== false;
        for (const { names, handler } of this.macros.get(id) ?? []) {
            if (on) registerMacro(names, handler);
            else unregisterMacro(names);
        }
    }

    /** Loads the plugin in `dir`. Returns its info; errors are recorded on it rather than thrown. */
    async loadFolder(dir: string, source: PluginInfo['source']): Promise<PluginInfo> {
        let manifest: PluginManifest;
        try {
            manifest = readManifest(dir);
        } catch (error) {
            const id = path.basename(dir);
            const info: PluginInfo = { manifest: { id, name: id, version: '0.0.0' }, dir, source, error: (error as Error).message };
            this.plugins.set(id, info);
            return info;
        }
        if (!satisfies(this.hearthVersion, manifest.hearth)) {
            const info: PluginInfo = { manifest, dir, source, error: `需要 Hearth ${manifest.hearth}，当前是 ${this.hearthVersion}` };
            this.unload(manifest.id);
            this.plugins.set(manifest.id, info);
            return info;
        }
        const entry = path.join(dir, manifest.main ?? 'server.mjs');
        try {
            // The query makes a replaced file load fresh instead of from the module cache.
            const mod = await import(`${pathToFileURL(entry).href}?v=${Math.round(statSync(entry).mtimeMs)}`);
            const plugin = (mod.default ?? mod) as HearthPlugin;
            if (typeof plugin?.setup !== 'function') throw new Error('插件没有导出 setup()');
            return await this.use(plugin, manifest, dir, source);
        } catch (error) {
            this.unload(manifest.id);
            const info: PluginInfo = { manifest, dir, source, error: (error as Error).message };
            this.plugins.set(manifest.id, info);
            console.error(`[plugins] 无法加载 ${manifest.id}:`, error);
            return info;
        }
    }

    /** Candidate folders for every plugin id: built-in and installed copies. */
    static scan(dirs: { dir: string; source: PluginInfo['source'] }[]) {
        const found = new Map<string, { dir: string; source: PluginInfo['source']; manifest?: PluginManifest }[]>();
        for (const { dir, source } of dirs) {
            if (!existsSync(dir)) continue;
            for (const name of readdirSync(dir)) {
                const full = path.join(dir, name);
                if (name.startsWith('.') || !statSync(full).isDirectory() || !existsSync(path.join(full, 'manifest.json'))) continue;
                let manifest: PluginManifest | undefined;
                try { manifest = readManifest(full); } catch { /* reported when loaded */ }
                const id = manifest?.id ?? name;
                found.set(id, [...(found.get(id) ?? []), { dir: full, source, manifest }]);
            }
        }
        return found;
    }

    /**
     * Loads every plugin. When a plugin exists both built in and installed (a downloaded update),
     * the newer compatible copy wins; if it fails to load, the other copy is used.
     */
    async loadAll(builtinDir: string, installedDir: string) {
        const found = PluginHost.scan([{ dir: builtinDir, source: 'builtin' }, { dir: installedDir, source: 'installed' }]);
        const order = (id: string) => found.get(id)?.[0]?.manifest?.order ?? 100;
        for (const id of [...found.keys()].sort((a, b) => order(a) - order(b))) {
            const copies = found.get(id)!
                .filter(c => !c.manifest || satisfies(this.hearthVersion, c.manifest.hearth))
                .sort((a, b) => compareVersions(b.manifest?.version ?? '0', a.manifest?.version ?? '0'));
            const candidates = copies.length ? copies : found.get(id)!;
            for (const [i, copy] of candidates.entries()) {
                const info = await this.loadFolder(copy.dir, copy.source);
                if (!info.error || i === candidates.length - 1) break;
                console.warn(`[plugins] ${id} ${info.manifest.version} 加载失败，改用另一份`);
            }
        }
    }

    list() {
        return [...this.plugins.values()]
            .sort((a, b) => (a.manifest.order ?? 100) - (b.manifest.order ?? 100))
            .map(info => ({
                id: info.manifest.id,
                name: info.manifest.name,
                description: info.manifest.description ?? '',
                version: info.manifest.version,
                source: info.source,
                compat: info.manifest.compat,
                repository: info.manifest.repository,
                enabled: this.store.settings?.plugins?.[info.manifest.id]?.enabled !== false,
                autoUpdate: this.store.settings?.plugins?.[info.manifest.id]?.autoUpdate !== false,
                error: info.error,
            }));
    }
}

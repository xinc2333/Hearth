import path from 'node:path';

import { importCardFile, looksLikeCard } from '../core/compat/st-card.ts';
import { importStLorebook } from '../core/compat/st-lorebook.ts';
import { defaultPreset, looksLikePreset, importStPreset } from '../core/compat/st-preset.ts';
import { isPng } from '../core/compat/png.ts';
import type { Op } from '../core/ops.ts';
import type { AnyResource, Character, Chat, Connection, Lorebook, Persona, Preset, ResourceKind } from '../core/types.ts';
import { isRecord, newId } from '../core/util.ts';
import { serveFile, startSse, type Router } from './http.ts';
import type { PluginUpdater } from './plugin-updates.ts';
import type { PluginHost } from './plugins.ts';
import { listModels, streamChat } from './providers/openai.ts';
import type { Runtime } from './runtime.ts';
import type { Store } from './store.ts';

const KINDS: ResourceKind[] = ['character', 'lorebook', 'preset', 'persona', 'chat'];

function kindParam(value: string): ResourceKind {
    if (!(KINDS as string[]).includes(value)) {
        throw Object.assign(new Error(`未知类型 ${value}`), { status: 400 });
    }
    return value as ResourceKind;
}

function summary(store: Store, res: AnyResource) {
    const base = { id: res.id, kind: res.kind, name: res.name, updatedAt: res.updatedAt };
    switch (res.kind) {
        case 'character':
            return { ...base, avatar: res.avatar, tags: res.meta.tags, creator: res.meta.creator, lorebookIds: res.lorebookIds, scripts: res.scripts.length };
        case 'chat': {
            const texts = res.messages.filter(m => m.mode !== 'edit').map(m => m.swipes[m.activeSwipe]?.content ?? '');
            const last = [...texts].reverse().find(t => t.trim()) ?? '';
            const preview = last.replace(/<(think|thinking|think_nya)[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
            return { ...base, characterId: res.characterId, messages: res.messages.length, preview, branch: res.branch };
        }
        case 'lorebook':
            return { ...base, entries: res.entries.length, createdFor: (res.extra?.hearth as { createdFor?: string } | undefined)?.createdFor };
        case 'preset':
            return { ...base, prompts: res.prompts.length, scripts: res.scripts.length };
        case 'persona':
            return { ...base, description: res.description };
    }
}

function publicSettings(store: Store) {
    const s = store.settings;
    return {
        ...s,
        connections: s.connections.map(c => ({ ...c, hasKey: Boolean(store.getSecret(`conn:${c.id}`)) })),
    };
}

export function registerApi(router: Router, store: Store, runtime: Runtime, plugins: PluginHost, updater?: PluginUpdater, app?: { cardOrigin: () => Promise<string | null> }) {
    const pluginList = () => plugins.list().map(p => ({ ...p, update: updater?.status.get(p.id) ?? null }));
    router.get('/api/bootstrap', async () => ({
        settings: publicSettings(store),
        cardOrigin: (await app?.cardOrigin()) ?? null,
        resources: Object.fromEntries(KINDS.map(k => [k, store.list(k).map(r => summary(store, r)).sort((a, b) => b.updatedAt - a.updatedAt)])),
        plugins: pluginList(),
    }));

    router.get('/api/resources/:kind/:id', req => store.require(kindParam(req.params.kind), req.params.id));

    router.delete('/api/resources/:kind/:id', async req => {
        const kind = kindParam(req.params.kind);
        if (kind === 'character') {
            for (const chat of store.list<Chat>('chat').filter(c => c.characterId === req.params.id)) {
                await store.remove('chat', chat.id);
            }
        }
        await store.remove(kind, req.params.id);
        if (kind === 'preset' && store.settings.presetId === req.params.id) {
            const next = store.list<Preset>('preset').sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? await store.create(defaultPreset(), 'system');
            await store.saveSettings({ presetId: next.id });
        }
        return { ok: true };
    });

    router.post('/api/resources/persona', async req => {
        const body = await req.json<Partial<Persona>>();
        const now = Date.now();
        const persona: Persona = {
            id: newId('pe'), kind: 'persona', name: body.name || '新的用户角色', description: body.description ?? '',
            position: 'in_prompt', depth: 2, role: 'system', createdAt: now, updatedAt: now,
        };
        return store.create(persona);
    });

    router.post('/api/resources/lorebook', async req => {
        const body = await req.json<Partial<Lorebook>>();
        const now = Date.now();
        return store.create<Lorebook>({ id: newId('lb'), kind: 'lorebook', name: body.name || '新的世界书', description: '', entries: [], createdAt: now, updatedAt: now });
    });

    // The single mutation endpoint: every edit from the UI is a change set.
    router.post('/api/changes', async req => {
        const body = await req.json<{ target: { kind: string; id: string }; ops: Op[]; reason?: string }>();
        const result = await store.apply({ target: { kind: kindParam(body.target.kind), id: body.target.id }, ops: body.ops, author: 'user', reason: body.reason });
        return result;
    });

    router.post('/api/changes/:id/revert', async req => store.revert(req.params.id));

    router.get('/api/history', req => {
        const kind = req.query.get('kind');
        const id = req.query.get('id');
        return store.history(kind && id ? { kind, id } : undefined, Number(req.query.get('limit') ?? 100));
    });

    router.post('/api/import', async req => {
        const filename = path.basename(req.query.get('filename') || 'import');
        const bytes = new Uint8Array(await req.body());
        const stamp = `${Date.now()}_${filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')}`;
        await store.saveBinary('imports', stamp, bytes);
        const created: { kind: ResourceKind; id: string; name: string }[] = [];
        const ext = path.extname(filename).toLowerCase();
        if (ext === '.charx') {
            throw Object.assign(new Error('暂不支持 .charx，请先在酒馆里导出为 PNG 或 JSON'), { status: 400 });
        }
        if (isPng(bytes)) {
            const { character, lorebook } = importCardFile(bytes, filename);
            character.avatar = `${character.id}.png`;
            await store.saveBinary('avatars', character.avatar, bytes);
            if (lorebook) created.push(await store.create(lorebook));
            created.push(await store.create(character));
        } else {
            let json: unknown;
            try {
                json = JSON.parse(new TextDecoder().decode(bytes));
            } catch {
                throw Object.assign(new Error('无法识别的文件：既不是 PNG 角色卡，也不是 JSON'), { status: 400 });
            }
            if (!isRecord(json)) {
                throw Object.assign(new Error('JSON 内容格式不正确'), { status: 400 });
            }
            const base = path.basename(filename, ext);
            if (looksLikeCard(json)) {
                const { character, lorebook } = importCardFile(bytes, filename);
                if (lorebook) created.push(await store.create(lorebook));
                created.push(await store.create(character));
            } else if ('entries' in json && !('prompts' in json)) {
                created.push(await store.create(importStLorebook(json, base, filename)));
            } else if (looksLikePreset(json)) {
                created.push(await store.create(importStPreset(json, base, filename)));
            } else {
                throw Object.assign(new Error('没认出这是角色卡、世界书还是预设'), { status: 400 });
            }
        }
        return { created: created.map(r => ({ kind: r.kind, id: r.id, name: r.name })) };
    });

    router.get('/api/avatars/:file', (req, res) => {
        if (!serveFile(res, store.binaryPath('avatars', req.params.file))) {
            res.writeHead(404).end();
        }
    });

    router.post('/api/chats', async req => {
        const body = await req.json<{ characterId: string }>();
        return runtime.createChat(body.characterId);
    });

    router.post('/api/chats/:id/messages/:messageId/swipes/:swipeId/branch', req =>
        runtime.branchChat(req.params.id, req.params.messageId, req.params.swipeId));

    router.get('/api/chats/:id/context', req => {
        const chat = store.require<Chat>('chat', req.params.id);
        const character = store.require<Character>('character', chat.characterId);
        return {
            userName: runtime.persona(chat).name,
            charName: character.name,
            regex: runtime.regexScripts(chat),
            preset: { id: runtime.preset(chat).id, name: runtime.preset(chat).name },
            controls: runtime.controls(chat),
            editTasks: plugins.editTasks.map(t => ({ id: t.id, label: t.label, hint: t.hint ?? '', request: t.request })),
            busy: runtime.isBusy(chat.id) ?? null,
        };
    });

    // A switch next to the message box changed (Hearth's own, or a plugin's).
    router.post('/api/chats/:id/controls', async req => {
        const body = await req.json<{ id: string; value: unknown }>();
        const chat = store.require<Chat>('chat', req.params.id);
        const ops = await runtime.changeControl(chat, String(body.id), body.value);
        const next = ops.length ? (await store.apply({ target: { kind: 'chat', id: chat.id }, ops, author: 'user', journal: false })).resource as Chat : chat;
        return { chat: next, controls: runtime.controls(next) };
    });

    // A plugin's button in the window (e.g. 跑团's「重新结算」).
    router.post('/api/chats/:id/actions/:plugin/:action', async req => {
        const payload = await req.json<Record<string, unknown>>().catch(() => ({}));
        const chat = store.require<Chat>('chat', req.params.id);
        const character = store.require<Character>('character', chat.characterId);
        const run = plugins.action(req.params.plugin, req.params.action);
        if (!run) throw Object.assign(new Error('没有这个操作，或者插件没有开启'), { status: 404 });
        const out = await run({ chat, character, preset: runtime.preset(chat), payload: payload ?? {} });
        const next = out?.ops?.length ? (await store.apply({ target: { kind: 'chat', id: chat.id }, ops: out.ops, author: `plugin:${req.params.plugin}`, journal: false })).resource as Chat : chat;
        return { chat: next };
    });

    router.post('/api/chats/:id/generate', async (req, res) => {
        const body = await req.json<{ type?: string; text?: string; injections?: unknown[]; answers?: unknown[] }>();
        const type = (['normal', 'swipe', 'regenerate', 'continue'].includes(body.type ?? '') ? body.type : 'normal') as 'normal';
        const stream: { send: ((data: unknown) => void) | null } = { send: null };
        const window = {
            injections: Array.isArray(body.injections) ? body.injections as never[] : undefined,
            answers: Array.isArray(body.answers) ? body.answers.map(String) : undefined,
        };
        await runtime.generate(req.params.id, { type, text: body.text, ...window }, event => {
            // Open the stream lazily so validation errors still return as JSON.
            stream.send ??= startSse(res);
            stream.send(event);
        });
        if (stream.send) res.end();
    });

    router.post('/api/chats/:id/preview', async req => {
        const body = await req.json<{ text?: string }>();
        return runtime.preview(req.params.id, body.text);
    });

    router.get('/api/chats/:id/last-prompt', req => runtime.lastPrompt(req.params.id) ?? null);

    router.post('/api/jobs/:id/abort', req => ({ ok: runtime.abort(req.params.id) }));

    router.post('/api/jobs/:id/answers/:ask', async req => {
        const body = await req.json<{ value?: unknown }>();
        return { ok: runtime.answer(req.params.id, req.params.ask, body.value ?? null) };
    });

    // A card interface's own request to the model (酒馆助手 generate / generateRaw).
    router.post('/api/chats/:id/card-generate', async req => {
        const body = await req.json<{ raw?: boolean; config?: Record<string, unknown> }>();
        return { text: await runtime.cardGenerate(req.params.id, body.raw === true, body.config ?? {}) };
    });

    // Plugins --------------------------------------------------------------------------------
    router.get('/api/plugins', () => pluginList());

    router.put('/api/plugins/:id', async req => {
        const id = req.params.id;
        if (!plugins.plugins.has(id)) throw Object.assign(new Error('没有这个插件'), { status: 404 });
        const body = await req.json<{ enabled?: boolean; autoUpdate?: boolean }>();
        const current = store.settings.plugins?.[id] ?? {};
        const next = { ...current };
        if (typeof body.enabled === 'boolean') next.enabled = body.enabled;
        if (typeof body.autoUpdate === 'boolean') next.autoUpdate = body.autoUpdate;
        await store.saveSettings({ plugins: { ...store.settings.plugins, [id]: next } });
        plugins.syncEnabled(id);
        return pluginList();
    });

    router.post('/api/plugins/:id/update', async req => {
        if (!updater) throw Object.assign(new Error('更新不可用'), { status: 400 });
        const body = await req.json<{ apply?: boolean }>().catch(() => ({} as { apply?: boolean }));
        await updater.update(req.params.id, body.apply !== false);
        return pluginList();
    });

    router.post('/api/plugins/install', async req => {
        if (!updater) throw Object.assign(new Error('安装不可用'), { status: 400 });
        const body = await req.json<{ url?: string }>();
        try {
            const manifest = await updater.install(String(body.url ?? ''));
            return { installed: { id: manifest.id, name: manifest.name, version: manifest.version }, plugins: pluginList() };
        } catch (error) {
            throw Object.assign(error as Error, { status: 400 });
        }
    });

    router.delete('/api/plugins/:id', async req => {
        if (!updater) throw Object.assign(new Error('删除不可用'), { status: 400 });
        const info = plugins.plugins.get(req.params.id);
        if (!info) throw Object.assign(new Error('没有这个插件'), { status: 404 });
        if (info.source === 'builtin') throw Object.assign(new Error('内置插件不能删除，可以关闭'), { status: 400 });
        await updater.remove(req.params.id);
        return pluginList();
    });

    router.put('/api/settings', async req => {
        const patch = await req.json<Record<string, unknown>>();
        delete patch.connections;
        delete patch.plugins;
        await store.saveSettings(patch);
        return publicSettings(store);
    });

    router.post('/api/connections', async req => {
        const body = await req.json<{ connection: Partial<Connection>; key?: string | null; activate?: boolean }>();
        const list = [...store.settings.connections];
        // What Hearth learns about the endpoint is not the page's to set.
        const { sendNames: _names, models: _models, modelsAt: _at, hasKey: _key, ...incoming } = body.connection;
        const id = incoming.id || newId('conn');
        const existing = list.find(c => c.id === id);
        const baseUrl = (incoming.baseUrl ?? existing?.baseUrl ?? '').trim();
        const next: Connection = {
            provider: 'openai-compatible',
            sendNames: true,
            ...existing,
            ...incoming,
            id,
            name: incoming.name || existing?.name || incoming.model || '模型连接',
            baseUrl,
            model: (incoming.model ?? existing?.model ?? '').trim(),
        } as Connection;
        if (existing && existing.baseUrl !== baseUrl) {
            // Another endpoint: learn again.
            next.sendNames = true;
            delete next.models;
            delete next.modelsAt;
        }
        if (existing) list[list.indexOf(existing)] = next;
        else list.push(next);
        if (body.key !== undefined) await store.setSecret(`conn:${id}`, body.key);
        await store.saveSettings({ connections: list, ...(body.activate || !store.settings.connectionId ? { connectionId: id } : {}) });
        return publicSettings(store);
    });

    router.delete('/api/connections/:id', async req => {
        const list = store.settings.connections.filter(c => c.id !== req.params.id);
        await store.setSecret(`conn:${req.params.id}`, null);
        await store.saveSettings({ connections: list, connectionId: store.settings.connectionId === req.params.id ? list[0]?.id : store.settings.connectionId });
        return publicSettings(store);
    });

    /** Keeps a fetched model list on its connection (only while the address is the same). */
    const cacheModels = async (id: string | undefined, baseUrl: string, models: string[]) => {
        const list = store.settings.connections;
        if (!list.some(c => c.id === id && c.baseUrl === baseUrl)) return;
        await store.saveSettings({ connections: list.map(c => (c.id === id ? { ...c, models, modelsAt: Date.now() } : c)) });
    };

    router.post('/api/connections/:id/models', async req => {
        const conn = store.settings.connections.find(c => c.id === req.params.id);
        if (!conn) throw Object.assign(new Error('找不到这个连接'), { status: 404 });
        const models = await listModels(conn, store.getSecret(`conn:${conn.id}`));
        await cacheModels(conn.id, conn.baseUrl, models);
        return { models };
    });

    // The model picker asks with what the form holds, so a connection does not have to be saved first.
    // Without a key in the request, the saved key of `connectionId` is used.
    router.post('/api/models', async req => {
        const body = await req.json<{ connectionId?: string; baseUrl?: string; key?: string }>();
        const saved = store.settings.connections.find(c => c.id === body.connectionId);
        const baseUrl = (body.baseUrl ?? saved?.baseUrl ?? '').trim();
        const key = body.key || (saved ? store.getSecret(`conn:${saved.id}`) : undefined);
        const models = await listModels({ baseUrl, extraHeaders: saved?.extraHeaders }, key);
        await cacheModels(saved?.id, baseUrl, models);
        return { models };
    });

    router.post('/api/connections/:id/test', async req => {
        const conn = store.settings.connections.find(c => c.id === req.params.id);
        if (!conn) throw Object.assign(new Error('找不到这个连接'), { status: 404 });
        const preset = runtime.preset();
        const started = Date.now();
        let text = '';
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 60000);
        try {
            for await (const ev of streamChat(conn, store.getSecret(`conn:${conn.id}`), {
                messages: [{ role: 'user', content: '用一句话打个招呼。' }],
                preset: { ...preset, context: { ...preset.context, maxTokens: 60, stream: true } },
                names: { user: 'User', char: 'Assistant' },
            }, controller.signal)) {
                if (ev.type === 'text') text += ev.text;
            }
        } finally {
            clearTimeout(timer);
        }
        return { ok: true, text, ms: Date.now() - started };
    });
}

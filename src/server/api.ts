import path from 'node:path';

import { importCardFile, looksLikeCard } from '../core/compat/st-card.ts';
import { importStLorebook } from '../core/compat/st-lorebook.ts';
import { defaultPreset, looksLikePreset, importStPreset } from '../core/compat/st-preset.ts';
import { isPng } from '../core/compat/png.ts';
import type { Op } from '../core/ops.ts';
import type { AnyResource, Character, Chat, Connection, Lorebook, Persona, Preset, ResourceKind } from '../core/types.ts';
import { isRecord, newId } from '../core/util.ts';
import { isCatgodPreset } from './builtin/catgod.ts';
import { serveFile, startSse, type Router } from './http.ts';
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
            const texts = res.messages.map(m => m.swipes[m.activeSwipe]?.content ?? '');
            const last = [...texts].reverse().find(t => t.trim()) ?? '';
            const preview = last.replace(/<(think|thinking|think_nya)[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
            return { ...base, characterId: res.characterId, messages: res.messages.length, preview };
        }
        case 'lorebook':
            return { ...base, entries: res.entries.length };
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

export function registerApi(router: Router, store: Store, runtime: Runtime, plugins: PluginHost) {
    router.get('/api/bootstrap', () => ({
        settings: publicSettings(store),
        resources: Object.fromEntries(KINDS.map(k => [k, store.list(k).map(r => summary(store, r)).sort((a, b) => b.updatedAt - a.updatedAt)])),
        plugins: plugins.loaded,
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
        const preset = runtime.preset(chat);
        return {
            userName: runtime.persona(chat).name,
            charName: character.name,
            regex: runtime.regexScripts(chat),
            preset: { id: preset.id, name: preset.name, catgod: isCatgodPreset(preset) },
            busy: runtime.isBusy(chat.id) ?? null,
        };
    });

    router.post('/api/chats/:id/generate', async (req, res) => {
        const body = await req.json<{ type?: string; text?: string; source?: 'card' }>();
        const type = (['normal', 'swipe', 'regenerate', 'continue'].includes(body.type ?? '') ? body.type : 'normal') as 'normal';
        const stream: { send: ((data: unknown) => void) | null } = { send: null };
        await runtime.generate(req.params.id, { type, text: body.text, source: body.source }, event => {
            // Open the stream lazily so validation errors still return as JSON.
            stream.send ??= startSse(res);
            stream.send(event);
        });
        if (stream.send) res.end();
    });

    router.post('/api/chats/:id/preview', async req => {
        const body = await req.json<{ text?: string }>();
        const result = await runtime.preview(req.params.id, body.text);
        const tools = Array.isArray(result.request?.tools) ? (result.request.tools as { function?: { name?: string } }[]).map(t => t.function?.name ?? '').filter(Boolean) : [];
        return { parts: result.parts, warnings: result.warnings, tokens: result.tokens, lore: result.lore.activated, tools };
    });

    router.get('/api/chats/:id/last-prompt', req => runtime.lastPrompt(req.params.id) ?? null);

    router.post('/api/jobs/:id/abort', req => ({ ok: runtime.abort(req.params.id) }));

    router.put('/api/settings', async req => {
        const patch = await req.json<Record<string, unknown>>();
        delete patch.connections;
        await store.saveSettings(patch);
        return publicSettings(store);
    });

    router.post('/api/connections', async req => {
        const body = await req.json<{ connection: Partial<Connection>; key?: string | null; activate?: boolean }>();
        const list = [...store.settings.connections];
        const incoming = body.connection;
        const id = incoming.id || newId('conn');
        const existing = list.find(c => c.id === id);
        const next: Connection = {
            provider: 'openai-compatible',
            sendNames: true,
            ...existing,
            ...incoming,
            id,
            name: incoming.name || existing?.name || incoming.model || '模型连接',
            baseUrl: (incoming.baseUrl ?? existing?.baseUrl ?? '').trim(),
            model: (incoming.model ?? existing?.model ?? '').trim(),
        } as Connection;
        delete next.hasKey;
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

    router.post('/api/connections/:id/models', async req => {
        const conn = store.settings.connections.find(c => c.id === req.params.id);
        if (!conn) throw Object.assign(new Error('找不到这个连接'), { status: 404 });
        return { models: await listModels(conn, store.getSecret(`conn:${conn.id}`)) };
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

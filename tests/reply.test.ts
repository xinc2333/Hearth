// Hearth's reply switches (剧场 / 聊天, deep thinking, the note) with a plain preset that declares
// them through entry markers.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { importCard } from '../src/core/compat/st-card.ts';
import { importStPreset } from '../src/core/compat/st-preset.ts';
import { entryAllowed, presetFeatures, replyOptions, stripConditions } from '../src/core/reply.ts';
import type { Chat, Preset } from '../src/core/types.ts';
import { PluginHost } from '../src/server/plugins.ts';
import { Runtime } from '../src/server/runtime.ts';
import { Store } from '../src/server/store.ts';

test('entry conditions: 聊天, 剧场, deep thinking and the note', () => {
    const on = { mode: 'chat' as const, deepThink: true, note: '多写环境' };
    const off = replyOptions(undefined);
    assert.deepEqual(off, { mode: 'theater', deepThink: false, note: '' });
    assert.equal(entryAllowed('<<<|hearth|when:chat>>>\n聊天说明', on), true);
    assert.equal(entryAllowed('<<<|hearth|when:chat>>>\n聊天说明', off), false);
    assert.equal(entryAllowed('<<<|hearth|when:theater>>>剧场说明', off), true);
    assert.equal(entryAllowed('<<<|hearth|when:chat,deepthink>>>两样都要', { ...on, deepThink: false }), false);
    assert.equal(entryAllowed('<<<|hearth|when:!deepthink>>>不深入时', off), true);
    assert.equal(entryAllowed('<<<|hearth|when:note>>>纸条：{{hearth_note}}', off), false);
    assert.equal(entryAllowed('普通条目', off), true);
    assert.equal(stripConditions('<<<|hearth|when:chat>>>\n聊天说明'), '聊天说明');
});

test('a plain preset declares the switches with markers; replies honour them', async t => {
    const dir = await mkdtemp(path.join(tmpdir(), 'hearth-reply-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const bodies: { messages: { role: string; content: string }[] }[] = [];
    const server = createServer(async (req, res) => {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        bodies.push(JSON.parse(raw));
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: '好的。' } }] })}\n\ndata: [DONE]\n\n`);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise<void>(resolve => server.close(() => resolve())));

    const store = new Store(dir);
    store.load();
    const preset = importStPreset({ openai_max_context: 64000, openai_max_tokens: 4096, stream_openai: true }, '默认', '') as Preset;
    const add = (id: string, content: string) => {
        preset.prompts.push({ ...preset.prompts.find(p => p.id === 'main')!, id, name: id, content, builtin: false });
        preset.order.push({ id, enabled: true });
    };
    const bare = await store.create({ ...structuredClone(preset), id: 'bare' });
    add('chat', '<<<|hearth|when:chat>>>\n暂停剧情，以作者身份和用户聊天。');
    add('theater', '<<<|hearth|when:theater>>>\n继续写剧情。');
    add('deep', '<<<|hearth|when:deepthink>>>\n先深入思考。');
    add('note', '<<<|hearth|when:note>>>\n用户的场外指示：{{hearth_note}}');
    assert.deepEqual(presetFeatures(preset), { chat: true, deepThink: true, note: true });
    const full = await store.create(preset);
    await store.saveSettings({
        presetId: bare.id,
        connections: [{ id: 'c', name: 'mock', provider: 'openai-compatible', baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, model: 'm', sendNames: true }],
        connectionId: 'c',
    });
    const runtime = new Runtime(store, new PluginHost(store, '0.6.0'));
    const character = await store.create(importCard({ name: '简', first_mes: '你好。' }, 'c.json').character);
    const chat = await runtime.createChat(character.id);
    assert.deepEqual(runtime.controls(chat), [], 'a preset that declares nothing gets no switches');

    await store.saveSettings({ presetId: full.id });
    assert.deepEqual(runtime.controls(chat).map(c => c.id), ['mode', 'deepThink', 'note']);
    const set = async (id: string, value: unknown) => {
        const ops = await runtime.changeControl(store.require<Chat>('chat', chat.id), id, value);
        await store.apply({ target: { kind: 'chat', id: chat.id }, ops, author: 'user', journal: false });
    };
    const sent = () => bodies.at(-1)!.messages.map(m => m.content).join('\n');

    await runtime.generate(chat.id, { type: 'normal', text: '我推门进去' }, () => {});
    assert.ok(sent().includes('继续写剧情。') && !sent().includes('暂停剧情') && !sent().includes('先深入思考') && !sent().includes('场外指示'));
    assert.ok(!sent().includes('<<<|hearth'), 'markers never go out');

    await set('mode', 'chat');
    await set('deepThink', true);
    await set('note', '多写环境');
    await runtime.generate(chat.id, { type: 'normal', text: '这段写得怎么样' }, () => {});
    assert.ok(sent().includes('暂停剧情') && !sent().includes('继续写剧情。'));
    assert.ok(sent().includes('先深入思考。'));
    assert.ok(sent().includes('用户的场外指示：多写环境'));
    // After the reply: the note was delivered, and 聊天 goes back to 剧场; deep thinking stays on.
    assert.deepEqual(replyOptions(store.require<Chat>('chat', chat.id)), { mode: 'theater', deepThink: true, note: '' });
});

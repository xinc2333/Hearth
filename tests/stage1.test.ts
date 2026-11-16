// The preset's own Stage 1 script (SPreset FinalRequestProcessing) running in the sandbox, driven by
// the 小猫之神 console switches.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { importCard } from '../src/core/compat/st-card.ts';
import { importStPreset } from '../src/core/compat/st-preset.ts';
import type { Chat } from '../src/core/types.ts';
import { buildBody } from '../src/server/providers/openai.ts';
import plugin from '../src/plugins/tavern-helper/index.ts';
import { consoleEnabled, oracleState } from '../src/plugins/tavern-helper/console.ts';
import { PluginHost } from '../src/server/plugins.ts';
import { Runtime } from '../src/server/runtime.ts';
import { Store } from '../src/server/store.ts';
import { MEOWSSIAH } from './fixtures.ts';

test('Meowssiah: its own request script shapes the request, and the console switches change it', { skip: !existsSync(MEOWSSIAH) }, async t => {
    const dir = await mkdtemp(path.join(tmpdir(), 'hearth-stage1-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const store = new Store(dir);
    store.load();
    const preset = await store.create(importStPreset(JSON.parse(readFileSync(MEOWSSIAH, 'utf8')), 'Meowssiah', 'm.json'));
    await store.saveSettings({ presetId: preset.id });
    assert.ok(consoleEnabled(preset));
    const host = new PluginHost(store, '0.3.0');
    await host.use(plugin, { id: 'tavern-helper', name: '酒馆助手', version: '1.0.0' });
    const runtime = new Runtime(store, host);
    const character = await store.create(importCard({ name: '简珣祎', first_mes: '秋深矣，不知邻人作何事？' }, 'c.json').character);
    let chat = await runtime.createChat(character.id);
    await store.apply({ target: { kind: 'chat', id: chat.id }, author: 'user', ops: [{ op: 'insert', path: ['messages'], value: { id: 'u1', role: 'user', name: '我', swipes: [{ id: 's', content: '你好', createdAt: 1 }], activeSwipe: 0, hidden: false, createdAt: 1 } }] });

    const request = async () => {
        chat = store.require<Chat>('chat', chat.id);
        const input = runtime.buildInput(chat, 'normal', chat.messages);
        const result = await (runtime as unknown as { runAssemble: (c: Chat, i: typeof input) => Promise<{ messages: never[] }> }).runAssemble(chat, input);
        let body = buildBody({ id: 'c', name: 'm', provider: 'openai-compatible', baseUrl: 'x', model: 'gemini-3.8-flash', sendNames: true }, { messages: result.messages, preset, names: { user: '我', char: character.name } }, true);
        const warnings: string[] = [];
        const started = Date.now();
        for (const fn of host.request) body = (await fn(body, { chat, character, preset, warn: w => warnings.push(w) })) ?? body;
        return { body: body as { messages: { role: string; content: unknown }[]; tools?: { function: { name: string; parameters: { properties: Record<string, { description: string }> } } }[]; tool_choice?: unknown }, warnings, ms: Date.now() - started };
    };
    const change = async (id: string, value: unknown) => {
        const ops = await host.changeControl(`tavern-helper:${id}`, value, { chat: store.require<Chat>('chat', chat.id), character, preset });
        await store.apply({ target: { kind: 'chat', id: chat.id }, ops, author: 'user', journal: false });
    };

    const theater = await request();
    assert.deepEqual(theater.warnings, []);
    assert.ok(theater.ms < 5000, `Stage 1 took ${theater.ms} ms`);
    assert.equal(theater.body.tool_choice, 'required');
    const reply = theater.body.tools?.find(x => x.function.name === 'soliumbra_reply');
    assert.ok(reply, 'the preset binds its reply tool');
    const sent = JSON.stringify(theater.body.messages);
    assert.ok(!/catgodml|run_tool_replacement|<\|sep\|>/.test(sent), 'the preset strips its own markers');
    assert.ok(sent.includes('你好'));

    await change('mode', 'chat');
    await change('deepThink', true);
    await change('note', '这一轮多写环境描写');
    const chatMode = await request();
    const think = chatMode.body.tools?.find(x => x.function.name === 'soliumbra_reply')!.function.parameters.properties.think_nya.description;
    assert.match(think!, /本体的身份/, 'chat mode uses the preset\'s own chat-mode wording');
    assert.match(think!, /深度/, 'deep thinking uses the preset\'s own wording');
    assert.ok(JSON.stringify(chatMode.body.messages).includes('这一轮多写环境描写'), 'the note goes into the request');
    assert.notEqual(JSON.stringify(chatMode.body.tools), JSON.stringify(theater.body.tools));

    // After a successful reply the note is delivered and 聊天 returns to 剧场, like the console.
    for (const fn of host.receive) {
        const out = await fn({ chat: store.require<Chat>('chat', chat.id), character, preset, message: chat.messages[0], swipe: chat.messages[0].swipes[0], text: '喵', finish: 'stop' });
        if (out?.ops) await store.apply({ target: { kind: 'chat', id: chat.id }, ops: out.ops, author: 'system', journal: false });
    }
    const after = oracleState(store.require<Chat>('chat', chat.id), 'tavern-helper');
    assert.equal(after.note.text, '');
    assert.equal(after.mode, 'theater');
    assert.equal(after.deepThink, true, 'deep thinking stays on');
});

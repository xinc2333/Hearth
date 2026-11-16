import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { assemble } from '../src/core/assemble.ts';
import { importCard, importCardFile } from '../src/core/compat/st-card.ts';
import { importStPreset } from '../src/core/compat/st-preset.ts';
import { normalizeModelOutput, unescapeLiteral } from '../src/core/output.ts';
import { DEFAULT_LORE_SETTINGS, type Chat } from '../src/core/types.ts';
import { catgodAdapter, cleanCatgodText, isCatgodPreset } from '../src/server/builtin/catgod.ts';
import { PluginHost } from '../src/server/plugins.ts';
import { Runtime } from '../src/server/runtime.ts';
import { Store } from '../src/server/store.ts';

import { MEOWSSIAH as MEOW, SERAPHINA } from './fixtures.ts';

test('unescapes literal \\n in prose but leaves code blocks and clean text alone', () => {
    assert.equal(unescapeLiteral('她笑了。\\n\\n“你好。”\\n'), '她笑了。\n\n“你好。”\n');
    assert.equal(unescapeLiteral('normal text\nwith real newlines'), 'normal text\nwith real newlines');
    assert.equal(unescapeLiteral('a\\nb ```\ncode \\n stays\n```'), 'a\nb ```\ncode \\n stays\n```');
});

test('formats reply-tool JSON into tagged text, including truncated streams', () => {
    const json = JSON.stringify({ think_nya: '想一想 <x>', game_content: '<game>\n正文第一段\n\n第二段\n</game>', options: '1. 走\n2. 留' });
    const out = normalizeModelOutput(json);
    assert.ok(out.startsWith('<think_nya>\n想一想 &lt;x&gt;\n</think_nya><!--</think>-->'));
    assert.ok(out.includes('<game>\n正文第一段\n\n第二段\n</game>'));
    assert.ok(out.includes('<options>\n1. 走\n2. 留\n</options>'));
    const partial = '{"think_nya": "嗯\\n好", "game_content": "她转过身\\n说';
    const p = normalizeModelOutput(partial);
    assert.ok(p.includes('嗯\n好') && p.includes('<game>\n她转过身\n说\n</game>'));
    assert.ok(!p.includes('\\n'));
    assert.equal(normalizeModelOutput('```json\n{"content": "只有正文"}\n```'), '只有正文');
    // Pseudo tool-call tokens printed as text, with raw newlines inside the JSON string.
    const wrapped = '<|tool_call|>reply\n<|tool_call|>{"content": "<game>\n她笑了\n</game>"}</|tool_call|>';
    assert.equal(normalizeModelOutput(wrapped), '<game>\n她笑了\n</game>');
    const inline = '<think_nya>\n想想\n</think_nya>\n<|tool_call|>{"content": "<game>正文</game>"}</|tool_call|>';
    // Shape produced by the provider for real tool calls.
    const streamed = '\n<|tool_call|>soliumbra_reply\n{"think_nya":"嗯","game_content":"\\u003cgame\\u003e\\n正文\\n\\u003c/game\\u003e"}';
    assert.equal(normalizeModelOutput(streamed), '<think_nya>\n嗯\n</think_nya><!--</think>-->\n<game>\n正文\n</game>');
    assert.equal(normalizeModelOutput(inline), '<think_nya>\n想想\n</think_nya>\n<game>正文</game>');
});

test('strips SPreset control markers and leaves the preset text as written', () => {
    const cleaned = cleanCatgodText('<|sep|><|merge|>小猫之神会使用reply工具回复，先思考~<run_tool_replacement>\n<<<|catgodml|enableMenu>>>');
    assert.equal(cleaned, '小猫之神会使用reply工具回复，先思考~');
    assert.equal(cleanCatgodText('<<<|catgodml|menu:角色控制:😸活人感加强>>>\n要有活人感'), '要有活人感');
    assert.equal(cleanCatgodText('<<<|catgodml|setLastMessage:你好>>>'), '');
    assert.equal(cleanCatgodText('普通文本\n\n不变'), '普通文本\n\n不变');
});

test('Catgod settings reach the provider and a preview does not consume the one-shot note', async t => {
    const dir = await mkdtemp(path.join(tmpdir(), 'hearth-catgod-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const store = new Store(dir);
    store.load();
    const preset = await store.create(importStPreset({
        stream_openai: false,
        prompts: [
            { identifier: 'main', role: 'system', content: '<run_tool_replacement>\n<<<|catgodml|registerPart:story_body:剧场正文>>>\n继续故事。' },
            { identifier: 'chatHistory', marker: true, system_prompt: true },
            { identifier: 'SPresetSettings', content: JSON.stringify({ ToolBindings: { reply: { enabled: true, resolvedName: 'soliumbra_reply' } } }) },
        ],
    }, 'Meowssiah test', 'test.json'));
    await store.saveSettings({ presetId: preset.id, connections: [{ id: 'test', name: 'Test', provider: 'openai-compatible', baseUrl: 'http://localhost/v1', model: 'test', sendNames: true }] });
    const character = await store.create(importCard({ name: '测试角色', first_mes: '你好。' }, 'test.json').character);
    const host = new PluginHost(store);
    await host.use(catgodAdapter);
    const runtime = new Runtime(store, host);
    const chat = await runtime.createChat(character.id);
    const note = { id: 'note', text: '这一轮聊聊雨天。' };
    const target = { kind: 'chat' as const, id: chat.id };
    await store.apply({ target, author: 'user', ops: [{ op: 'set', path: ['catgod'], value: { mode: 'chat', deepThink: true, note } }] });

    const requests: { messages: { content: string }[]; tools: { function: { parameters: { properties: Record<string, { description: string }> } } }[] }[] = [];
    t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
        requests.push(JSON.parse(String(init.body)));
        return Response.json({ choices: [{ message: { tool_calls: [{ function: { name: 'soliumbra_reply', arguments: '{"game_content":"我们来聊雨天。"}' } }] } }] });
    });

    const preview = await runtime.preview(chat.id, '你好');
    assert.ok(preview.messages.some(message => message.content.includes(note.text)));
    assert.deepEqual(store.require<Chat>('chat', chat.id).catgod?.note, note);
    await runtime.generate(chat.id, { type: 'normal', text: '你好' }, () => {});

    const messageText = requests[0].messages.map(message => message.content).join('\n');
    assert.match(messageText, /暂停推进剧场剧情/);
    assert.match(messageText, /回复前仔细推演/);
    assert.ok(messageText.includes(note.text));
    const chatProperties = requests[0].tools[0].function.parameters.properties;
    assert.deepEqual(Object.keys(chatProperties), ['think_nya', 'game_content']);
    assert.match(chatProperties.think_nya.description, /回复前仔细推演/);
    const updated = store.require<Chat>('chat', chat.id);
    assert.equal(updated.catgod?.note, undefined);
    assert.equal(updated.messages.at(-1)?.swipes[0].content, '我们来聊雨天。');

    await store.apply({ target, author: 'user', ops: [{ op: 'set', path: ['catgod'], value: { mode: 'theater', deepThink: false } }] });
    await runtime.generate(chat.id, { type: 'normal', text: '继续' }, () => {});
    const theaterText = requests[1].messages.map(message => message.content).join('\n');
    assert.doesNotMatch(theaterText, /暂停推进剧场剧情|回复前仔细推演|这一轮聊聊雨天/);
    assert.deepEqual(Object.keys(requests[1].tools[0].function.parameters.properties), ['think_nya', 'story_body']);

    const replacement = { id: 'replacement', text: '下一轮谈谈雪。' };
    await store.apply({ target, author: 'user', ops: [{ op: 'set', path: ['catgod', 'note'], value: note }] });
    await host.use({ id: 'replace-note', setup: api => api.onAfterReceive(async () => {
        await store.apply({ target, author: 'user', ops: [{ op: 'set', path: ['catgod', 'note'], value: replacement }] });
    }) });
    await runtime.generate(chat.id, { type: 'normal', text: '下一轮' }, () => {});
    assert.deepEqual(store.require<Chat>('chat', chat.id).catgod?.note, replacement);
});

test('Meowssiah prompt has no control markers after the adapter runs', { skip: !existsSync(MEOW) || !existsSync(SERAPHINA) }, async () => {
    const preset = importStPreset(JSON.parse(readFileSync(MEOW, 'utf8')), 'Meowssiah', 'Meowssiah-2.1.6.json');
    assert.ok(isCatgodPreset(preset));
    const { character } = importCardFile(new Uint8Array(readFileSync(SERAPHINA)), 'x.png');
    const msg = (id: string, role: 'user' | 'assistant', name: string, content: string) => ({ id, role, name, swipes: [{ id: `${id}s`, content, createdAt: 0 }], activeSwipe: 0, hidden: false, createdAt: 0 });
    const input = {
        type: 'normal' as const, chatId: 'c', character, userName: 'Alex',
        persona: { description: '', position: 'in_prompt' as const, depth: 2, role: 'system' as const }, preset,
        lore: { sources: [], settings: DEFAULT_LORE_SETTINGS },
        messages: [msg('a', 'assistant', 'Seraphina', character.fields.firstMessage), msg('b', 'user', 'Alex', '你好')],
        authorsNote: { content: '', interval: 1, position: 'in_chat' as const, depth: 4, role: 'system' as const, scan: false },
        variables: { chat: {}, global: {} }, globalRegex: [],
        options: { preferCharacterPrompt: true, preferCharacterJailbreak: true, pinExamples: false, collapseNewlines: false },
        model: 'x', injections: [],
    };
    const result = assemble(input);
    const host = new PluginHost({ get: () => undefined, list: () => [], apply: async () => ({}) } as never);
    await host.use(catgodAdapter);
    for (const fn of host.after) await fn(result, { chat: {} as never, character, input, injections: [] });
    const all = result.messages.map(m => m.content).join('\n');
    assert.ok(!/catgodml|<\|sep\|>|<\|merge\|>|run_tool_replacement/.test(all));
    // Nothing is added: every part still comes from the preset, card or chat.
    assert.ok(!result.parts.some(p => p.sources.includes('builtin.catgod')));
    assert.equal(result.messages[result.messages.length - 1].content.includes('【输出方式】'), false);
    assert.deepEqual(result.warnings, []);
    assert.ok(result.messages.some(m => m.content === '你好'));
    // The preset binds a reply tool and its init entry carries <run_tool_replacement>: the request
    // carries that tool, as the preset's own Stage 1 script would send it.
    const tools = (result.request?.tools ?? []) as { function: { name: string; parameters: { required: string[] } } }[];
    assert.equal(tools[0]?.function.name, 'soliumbra_reply');
    assert.deepEqual(tools[0]?.function.parameters.required, ['think_nya', 'game_content']);
    assert.equal(result.request?.tool_choice, 'required');
});

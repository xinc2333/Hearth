import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { importCard } from '../src/core/compat/st-card.ts';
import { defaultPreset } from '../src/core/compat/st-preset.ts';
import { newLoreEntry } from '../src/core/lore.ts';
import { estimateTokens } from '../src/core/tokens.ts';
import type { Character, Chat, Lorebook } from '../src/core/types.ts';
import { catgodAdapter } from '../src/server/builtin/catgod.ts';
import { editCard } from '../src/server/card-editor.ts';
import { PluginHost } from '../src/server/plugins.ts';
import { Runtime } from '../src/server/runtime.ts';
import { Store } from '../src/server/store.ts';

const call = (id: string, name: string, args: Record<string, unknown> = {}) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });

test('the chat editor executes scoped tool calls, records AI changes and can undo them', async t => {
    const dir = await mkdtemp(path.join(tmpdir(), 'hearth-card-editor-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const store = new Store(dir);
    store.load();
    const preset = defaultPreset();
    preset.prompts[0].content += '\n<<<|catgodml|enableMenu>>>';
    await store.create(preset);
    await store.saveSettings({ presetId: preset.id, connections: [{ id: 'test', name: 'Test', provider: 'openai-compatible', baseUrl: 'http://localhost/v1', model: 'test', sendNames: false }] });
    const book = (id: string): Lorebook => ({ id, kind: 'lorebook', name: id, description: '', entries: [], createdAt: 0, updatedAt: 0 });
    const owned = book('owned');
    owned.entries.push(newLoreEntry(owned, { title: '旧钟楼', content: '钟楼开放参观。', keys: ['钟楼'] }));
    for (let i = 1; i < 17; i++) owned.entries.push(newLoreEntry(owned, { title: `地点 ${i}`, content: `地点 ${i} 的设定。`, keys: [`地点 ${i}`] }));
    await store.create(owned);
    await store.create(book('shared'));
    await store.create(book('unbound'));
    const character = importCard({ name: '向导', description: '她住在旧城。' }, 'test.json').character;
    character.lorebookIds = [owned.id, 'shared'];
    await store.create(character);
    const other = importCard({ name: '其他角色' }, 'other.json').character;
    other.lorebookIds = ['shared'];
    await store.create(other);
    const host = new PluginHost(store);
    await host.use(catgodAdapter);
    const runtime = new Runtime(store, host);
    const chat = await runtime.createChat(character.id);
    const target = { kind: 'chat' as const, id: chat.id };

    const newEntry = { bookId: 'owned', title: '守卫', content: '守卫驻守钟楼。', keys: ['守卫', '钟楼'] };
    const entryEdits = owned.entries.slice(1).map(entry => ({ entryId: entry.id, content: `新设定 ${entry.id}。` }));
    const rounds = [
        [call('read', 'read_character'), call('search', 'search_worldbooks', { query: '钟楼' })],
        [call('page0', 'read_worldbook_entries', { bookId: 'owned' }),
            call('shared', 'create_worldbook_entry', { ...newEntry, bookId: 'shared' }),
            call('unbound', 'create_worldbook_entry', { ...newEntry, bookId: 'unbound' })],
        [call('character', 'edit_character', { edits: [{ field: 'description', find: '旧城', replacement: '新城' }, { field: 'scenario', replacement: '雨天。' }] }),
            call('page0-edit', 'edit_worldbook_entries', { bookId: 'owned', edits: [{ entryId: '0', find: '开放参观', content: '禁止进入', title: '封锁的钟楼', keys: ['钟楼', '封锁'] }, ...entryEdits] }),
            call('guard', 'create_worldbook_entry', newEntry)],
    ];
    const toolResults: Record<string, unknown> = {};
    let editorTurns = 0;
    let exhaustBudget = false;
    let saveBeforeLimit: number | undefined;
    t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        if (!body.tools?.some((tool: { function: { name: string } }) => tool.function.name === 'edit_character')) {
            return Response.json({ choices: [{ message: { content: '普通回复。' } }] });
        }
        assert.equal(body.stream, false);
        assert.equal(body.tool_choice, 'auto');
        for (const message of body.messages.filter((message: { role: string }) => message.role === 'tool')) {
            assert.ok(body.messages.some((prior: { tool_calls?: { id: string }[] }) => prior.tool_calls?.some(call => call.id === message.tool_call_id)));
            toolResults[message.tool_call_id] = JSON.parse(message.content);
        }
        const turn = editorTurns++;
        const calls = turn === saveBeforeLimit
            ? [call('partial-read', 'read_character'), call('partial-edit', 'edit_character', { edits: [{ field: 'name', replacement: '新向导' }] })]
            : exhaustBudget ? [call(`repeat-${turn}`, 'edit_character', { edits: [{ field: 'invalid', replacement: '不能保存' }] })]
                : rounds[turn];
        return Response.json({ choices: [{ message: calls
            ? { role: 'assistant', content: null, tool_calls: calls } : { role: 'assistant', content: '已保存角色卡和世界书。' } }] });
    });

    await store.apply({ target, author: 'user', ops: [{ op: 'set', path: ['catgod', 'mode'], value: 'chat' }] });
    await runtime.generate(chat.id, { type: 'normal', text: '默认关闭。' }, () => {});
    await store.apply({ target, author: 'user', ops: [{ op: 'set', path: ['catgod', 'editCard'], value: true }] });
    await runtime.preview(chat.id, '预览。');
    await runtime.generate(chat.id, { type: 'regenerate' }, () => {});
    await runtime.generate(chat.id, { type: 'normal', text: '卡片消息。', source: 'card' }, () => {});
    assert.equal(editorTurns, 0);

    const edits: string[] = [];
    await runtime.generate(chat.id, { type: 'normal', text: '改掉住处，关闭钟楼并新增守卫。' }, event => {
        if (event.type === 'card-edit') edits.push(event.reason);
    });
    assert.equal(editorTurns, 4);
    assert.deepEqual((toolResults.page0 as { entries: { id: string }[] }).entries.map(entry => entry.id), owned.entries.map(entry => entry.id));
    assert.equal((toolResults.page0 as { nextOffset: number | null }).nextOffset, null);
    assert.deepEqual(toolResults.shared, { error: '这是共享世界书，只能读取。' });
    assert.deepEqual(toolResults.unbound, { error: '找不到当前角色绑定的这本世界书。' });
    assert.equal(store.require<Character>('character', character.id).fields.description, '她住在新城。');
    assert.equal(store.require<Character>('character', character.id).fields.scenario, '雨天。');
    const updated = store.require<Lorebook>('lorebook', 'owned');
    assert.equal(updated.entries[0].content, '钟楼禁止进入。');
    assert.equal(updated.entries[0].title, '封锁的钟楼');
    assert.deepEqual(updated.entries[0].keys, ['钟楼', '封锁']);
    assert.deepEqual(updated.entries.slice(1, 17).map(entry => entry.content), owned.entries.slice(1).map(entry => `新设定 ${entry.id}。`));
    assert.deepEqual(updated.entries[17].keys, ['守卫', '钟楼']);
    assert.equal(updated.entries[17].activation, 'keyword');
    assert.equal(store.require<Lorebook>('lorebook', 'shared').entries.length, 0);
    assert.equal(store.require<Lorebook>('lorebook', 'unbound').entries.length, 0);
    assert.equal(store.require<Chat>('chat', chat.id).messages.at(-1)?.swipes[0].content, '已保存角色卡和世界书。');
    const changes = store.history().filter(change => change.author === 'ai');
    assert.equal(edits.length, 3);
    assert.equal(changes.length, 3);
    for (const change of changes) await store.revert(change.id);
    assert.equal(store.require<Character>('character', character.id).fields.description, '她住在旧城。');
    assert.deepEqual(store.require<Lorebook>('lorebook', 'owned').entries, owned.entries);

    exhaustBudget = true;
    await runtime.generate(chat.id, { type: 'normal', text: '再改一轮。' }, () => {});
    const partial = store.require<Chat>('chat', chat.id).messages.at(-1)?.swipes[0];
    assert.equal(partial?.finish, 'length');
    assert.match(partial?.content ?? '', /本轮没有保存改动/);
    assert.match(partial?.content ?? '', /请先读取或重新读取角色卡/);

    saveBeforeLimit = editorTurns;
    await runtime.generate(chat.id, { type: 'normal', text: '继续。' }, () => {});
    const progress = store.require<Chat>('chat', chat.id).messages.at(-1)?.swipes[0];
    assert.equal(progress?.finish, 'length');
    assert.match(progress?.content ?? '', /本轮已保存 1 批修改/);
    assert.match(progress?.content ?? '', /字段 invalid 不可编辑/);
    assert.equal(store.require<Character>('character', character.id).name, '新向导');
});

test('the editor budgets long pages and writes against the cumulative request', async t => {
    const dir = await mkdtemp(path.join(tmpdir(), 'hearth-editor-budget-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const store = new Store(dir);
    store.load();
    const book: Lorebook = { id: 'long-book', kind: 'lorebook', name: '路线', description: '', entries: [], createdAt: 0, updatedAt: 0 };
    for (const title of ['甲', '乙', '丙']) {
        book.entries.push(newLoreEntry(book, { title, content: '岔路。'.repeat(550), keys: [title] }));
    }
    await store.create(book);
    const character = importCard({ name: '向导' }, 'guide.json').character;
    character.lorebookIds = [book.id];
    await store.create(character);
    const preset = defaultPreset();
    preset.context = { ...preset.context, maxContext: 9800, maxTokens: 1800 };
    const entryIds = book.entries.map(entry => entry.id);
    const selection = { bookId: book.id, entryIds };
    const rounds = [
        [call('read-first', 'read_worldbook_entries', selection)],
        [call('unread', 'edit_worldbook_entries', { bookId: book.id, edits: [{ entryId: entryIds[1], title: '未读' }] }),
            call('oversized', 'edit_worldbook_entries', { bookId: book.id, edits: [{ entryId: entryIds[0], content: '改'.repeat(2050) }] }),
            call('save-first', 'edit_worldbook_entries', { bookId: book.id, edits: [{ entryId: entryIds[0], title: '已改甲' }] })],
        [call('read-next', 'read_worldbook_entries', { ...selection, offset: 1 })],
        [call('save-second', 'edit_worldbook_entries', { bookId: book.id, edits: [{ entryId: entryIds[1], title: '已改乙' }] })],
    ];
    const outputCaps: number[] = [];
    const results = new Map<string, any>();
    t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        assert.ok(estimateTokens(String(init.body)) + body.max_tokens <= preset.context.maxContext);
        for (const message of body.messages.filter((message: { role: string }) => message.role === 'tool')) {
            results.set(message.tool_call_id, JSON.parse(message.content));
        }
        const calls = rounds[outputCaps.length];
        assert.ok(calls, 'no additional request once the context budget is exhausted');
        outputCaps.push(body.max_tokens);
        return Response.json({ choices: [{ message: { role: 'assistant', content: null, tool_calls: calls,
            ...(outputCaps.length === 4 ? { reasoning_content: '路'.repeat(1700) } : {}) } }] });
    });
    const result = await editCard(store, character.id, {
        id: 'test', name: 'Test', provider: 'openai-compatible', baseUrl: 'http://localhost/v1', model: 'test', sendNames: false,
    }, undefined, { messages: [{ role: 'user', content: '请更新路线标题。' }], preset, names: { char: '向导', user: '访客' } },
    new AbortController().signal, () => {});

    assert.equal(results.get('read-first').nextOffset, 1);
    assert.deepEqual(results.get('read-first').entries.map((entry: { id: string }) => entry.id), [entryIds[0]]);
    assert.equal(results.get('read-next').nextOffset, 2);
    assert.deepEqual(results.get('read-next').entries.map((entry: { id: string }) => entry.id), [entryIds[1]]);
    assert.match(results.get('unread').error, /请先读取条目/);
    assert.match(results.get('oversized').error, /未保存/);
    assert.ok(outputCaps.at(-1)! < outputCaps[0]);
    assert.match(result.text, /用完可用上下文/);
    assert.match(result.text, /已保存 2 批/);
    assert.deepEqual(store.require<Lorebook>('lorebook', book.id).entries.map(entry => entry.title), ['已改甲', '已改乙', '丙']);
    for (const change of store.history().filter(change => change.author === 'ai')) await store.revert(change.id);
    assert.deepEqual(store.require<Lorebook>('lorebook', book.id).entries, book.entries);
});

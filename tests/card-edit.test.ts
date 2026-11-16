import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { extractCardEdit, parseCardEdits } from '../src/core/card-edit.ts';
import { importCard, importCardFile } from '../src/core/compat/st-card.ts';
import { findSection, flatten, outline, replaceOnce, replaceSection, sectionText } from '../src/core/doc.ts';
import { newLoreEntry } from '../src/core/lore.ts';
import type { Character, Chat, ChatMessage, Lorebook } from '../src/core/types.ts';
import { applyCardEdits, buildEditPrompt } from '../src/server/card-edit.ts';
import { PluginHost } from '../src/server/plugins.ts';
import { Runtime } from '../src/server/runtime.ts';
import { Store } from '../src/server/store.ts';
import { MVU_CARD } from './fixtures.ts';

const ENTRY = `<Xunyi>
角色档案:
  基本信息:
    姓名: 简珣祎
    年龄: 接近30岁
  外貌: |
    黑色长发: 及腰
    眼睛: 橙红色
  性格:
    - 沉稳
    - 浪漫

# 备注
内容仅供参考
</Xunyi>`;

test('outline: tags, nested keys, block scalars and headings', () => {
    const paths = flatten(outline(ENTRY)).map(h => h.path.join('/'));
    assert.deepEqual(paths, ['Xunyi', 'Xunyi/角色档案', 'Xunyi/角色档案/基本信息', 'Xunyi/角色档案/基本信息/姓名', 'Xunyi/角色档案/基本信息/年龄',
        'Xunyi/角色档案/外貌', 'Xunyi/角色档案/性格', 'Xunyi/备注']);
    const found = findSection(ENTRY, ['基本信息']);
    assert.ok('section' in found);
    assert.equal(sectionText(ENTRY, found.section), '  基本信息:\n    姓名: 简珣祎\n    年龄: 接近30岁');
    assert.ok('error' in findSection(ENTRY, ['身高']));
    assert.ok('section' in findSection(ENTRY, ['角色档案', '年龄']), 'levels in between may be skipped');
});

test('replacing a section changes only its lines and keeps the indentation', () => {
    const age = findSection(ENTRY, ['Xunyi', '角色档案', '基本信息', '年龄']);
    assert.ok('section' in age);
    const next = replaceSection(ENTRY, age.section, '年龄: 二十八岁');
    assert.deepEqual(next.split('\n').filter((l, i) => l !== ENTRY.split('\n')[i]), ['    年龄: 二十八岁']);
    // A value without its heading line keeps the heading.
    const short = replaceSection(ENTRY, age.section, '二十八岁');
    assert.match(short, /\n {4}年龄: 二十八岁\n/);
    const looks = findSection(ENTRY, ['外貌']);
    assert.ok('section' in looks);
    const rewritten = replaceSection(ENTRY, looks.section, '外貌: |\n  黑色长发: 齐肩\n  眼睛: 橙红色');
    assert.match(rewritten, /\n {2}外貌: \|\n {4}黑色长发: 齐肩\n {4}眼睛: 橙红色\n {2}性格:/);
});

test('find-and-replace needs a unique match and tolerates spacing', () => {
    assert.deepEqual(replaceOnce('甲乙丙', '乙', '丁'), { text: '甲丁丙' });
    assert.ok('error' in replaceOnce('乙乙', '乙', '丁'));
    assert.deepEqual(replaceOnce('他说：  你好\n世界', '他说： 你好 世界', '再见'), { text: '再见' });
});

test('the user card: every section can be found and rewritten without touching other text', { skip: !existsSync(MVU_CARD) }, () => {
    const { lorebook } = importCardFile(new Uint8Array(readFileSync(MVU_CARD)), 'card.png');
    assert.ok(lorebook);
    let sections = 0;
    for (const entry of lorebook.entries) {
        for (const { section } of flatten(outline(entry.content))) {
            sections++;
            const same = replaceSection(entry.content, section, sectionText(entry.content, section));
            assert.equal(same, entry.content, `${entry.title} › ${section.name}`);
        }
    }
    assert.ok(sections > 300, `found ${sections} sections`);
});

test('edit blocks: headers, find/replace pairs and the prose around them', () => {
    const reply = `我把年龄改得具体一些。

<card_edit>
【改写】世界书#3 › 基本信息 › 年龄
年龄: 二十八岁
【替换】角色卡 › 开场白
<<<<<<< 原文
秋深矣
=======
秋意正浓
>>>>>>> 新文
【删除】世界书#9
</card_edit>`;
    const { prose, block, complete } = extractCardEdit(reply);
    assert.equal(prose, '我把年龄改得具体一些。');
    assert.ok(complete);
    const ops = parseCardEdits(block!);
    assert.deepEqual(ops.map(o => [o.action, o.target]), [['改写', '世界书#3 › 基本信息 › 年龄'], ['替换', '角色卡 › 开场白'], ['删除', '世界书#9']]);
    assert.deepEqual(ops[1].pairs, [{ find: '秋深矣', replace: '秋意正浓' }]);
    assert.equal(extractCardEdit('改一下\n<card_edit>\n【改写】角色卡 › 描述\n半').complete, false);
});

async function setup() {
    const dir = await mkdtemp(path.join(tmpdir(), 'hearth-edit-'));
    const store = new Store(dir);
    store.load();
    const imported = importCard({ name: '简珣祎', first_mes: '秋深矣，不知邻人作何事？', description: '旧物店店主。' }, 'x.json').character;
    const own: Lorebook = { id: 'book_own', kind: 'lorebook', name: '白玫旧物', createdAt: 1, updatedAt: 1, entries: [] } as unknown as Lorebook;
    own.entries.push({ ...newLoreEntry(own, { title: '唯一之人', content: ENTRY, keys: [] }), activation: 'constant' });
    own.entries.push(newLoreEntry(own, { title: '[initvar]变量初始化', content: '好感度: 0', keys: [] }));
    own.entries.push(newLoreEntry(own, { title: '旧书', content: '一本旧书。', keys: ['旧书'] }));
    const shared: Lorebook = { id: 'book_shared', kind: 'lorebook', name: '澜景市', createdAt: 1, updatedAt: 1, entries: [] } as unknown as Lorebook;
    shared.entries.push(newLoreEntry(shared, { title: '城市', content: '江南城市。', keys: ['澜景'] }));
    await store.create(own);
    await store.create(shared);
    const character = await store.create({ ...imported, lorebookIds: [own.id, shared.id] });
    await store.create({ ...importCard({ name: '路人' }, 'y.json').character, lorebookIds: [shared.id] });
    return { dir, store, character };
}

test('applying edits: sections, fields, new entries, settings, and what is refused', async t => {
    const { dir, store, character } = await setup();
    t.after(() => rm(dir, { recursive: true, force: true }));
    const books = character.lorebookIds.map(id => store.require<Lorebook>('lorebook', id));
    const prompt = buildEditPrompt({ store, character, books, messages: [], userName: '我', maxContext: 64000, maxTokens: 4000 });
    assert.ok(prompt.shown.has('lore:book_own:0'));
    assert.ok(!prompt.shown.has('lore:book_own:1'), '[initvar] entries are read-only and not shown');
    assert.match(prompt.messages[1].content, /世界书#1「\[initvar\]变量初始化」.*只读（变量初始化）/);
    assert.match(prompt.messages[1].content, /和其他角色共用，只读/);

    const reply = `好的。
<card_edit>
【改写】世界书#0 › 年龄
年龄: 二十八岁
【替换】角色卡 › 开场白
<<<<<<< 原文
秋深矣
=======
秋意正浓
>>>>>>> 新文
【新增】世界书「白玫旧物」
标题：青石巷书摊｜关键词：书摊、青石巷｜触发：关键词
巷口有个旧书摊。
【设置】世界书#2
关键词：旧书、古籍
【改写】世界书#1
好感度: 100
【改写】世界书#0 › 身高
身高: 170
【改写】世界书「澜景市」#0
改掉城市
</card_edit>`;
    const edits = await applyCardEdits(store, character.id, reply, prompt, 'stop');
    assert.ok(edits);
    assert.deepEqual(edits.results.map(r => r.ok), [true, true, true, true, false, false, false]);
    assert.match(edits.results[4].reason!, /只读（变量初始化）/);
    assert.match(edits.results[5].reason!, /找不到段落/);
    assert.match(edits.results[6].reason!, /只读（共用世界书）/);
    assert.equal(edits.changes.length, 2, 'one change for the card, one for the lorebook');

    const book = store.require<Lorebook>('lorebook', 'book_own');
    assert.match(book.entries[0].content, /\n {4}年龄: 二十八岁\n/);
    assert.equal(book.entries[0].content.replace('二十八岁', '接近30岁'), ENTRY, 'nothing else in the entry changed');
    assert.deepEqual(book.entries[2].keys, ['旧书', '古籍']);
    assert.equal(book.entries[3].title, '青石巷书摊');
    assert.deepEqual(book.entries[3].keys, ['书摊', '青石巷']);
    assert.equal(store.require<Character>('character', character.id).fields.firstMessage, '秋意正浓，不知邻人作何事？');
    assert.equal(store.require<Lorebook>('lorebook', 'book_shared').entries[0].content, '江南城市。');

    // Undo restores both resources.
    for (const id of [...edits.changes].reverse()) await store.revert(id);
    assert.equal(store.require<Lorebook>('lorebook', 'book_own').entries[0].content, ENTRY);
    assert.equal(store.require<Lorebook>('lorebook', 'book_own').entries.length, 3);
    assert.equal(store.require<Character>('character', character.id).fields.firstMessage, '秋深矣，不知邻人作何事？');

    // Text changed by the user after the request was built is not overwritten.
    await store.apply({ target: { kind: 'lorebook', id: 'book_own' }, ops: [{ op: 'set', path: ['entries', '@0', 'content'], value: `${ENTRY}\n` }], author: 'user' });
    const late = await applyCardEdits(store, character.id, '<card_edit>\n【改写】世界书#0 › 年龄\n年龄: 1\n</card_edit>', prompt, 'stop');
    assert.match(late!.results[0].reason!, /被改过/);
    assert.equal((await applyCardEdits(store, character.id, '<card_edit>\n【改写】角色卡 › 描述\n半', prompt, 'length'))!.note?.includes('截断'), true);
});

test('编辑 mode end to end: the edit conversation stays out of the story prompt', async t => {
    const { dir, store, character } = await setup();
    t.after(() => rm(dir, { recursive: true, force: true }));
    const bodies: { messages: { role: string; content: string }[] }[] = [];
    const reply = (text: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
    const server = createServer(async (req, res) => {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        bodies.push(body);
        const editing = body.messages[0].content.includes('角色卡编辑助手');
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end(reply(editing ? '改好了。\n<card_edit>\n【改写】世界书#0 › 年龄\n年龄: 二十八岁\n</card_edit>' : '她点了点头。'));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
    const port = (server.address() as { port: number }).port;
    await store.saveSettings({ connections: [{ id: 'c', name: 'mock', provider: 'openai-compatible', baseUrl: `http://127.0.0.1:${port}/v1`, model: 'mock', sendNames: true }], connectionId: 'c' });
    const runtime = new Runtime(store, new PluginHost(store));
    const chat = await runtime.createChat(character.id);
    const events: string[] = [];
    await store.apply({ target: { kind: 'chat', id: chat.id }, ops: [{ op: 'set', path: ['mode'], value: 'edit' }], author: 'user' });
    await runtime.generate(chat.id, { type: 'normal', text: '把年龄改成二十八岁' }, e => events.push(e.type));
    assert.ok(events.includes('done'));
    let current = store.require<Chat>('chat', chat.id);
    const editReply = current.messages[current.messages.length - 1] as ChatMessage;
    assert.equal(editReply.mode, 'edit');
    assert.equal(editReply.swipes[0].edits?.results[0].ok, true);
    assert.match(store.require<Lorebook>('lorebook', 'book_own').entries[0].content, /年龄: 二十八岁/);

    await store.apply({ target: { kind: 'chat', id: chat.id }, ops: [{ op: 'set', path: ['mode'], value: 'story' }], author: 'user' });
    await runtime.generate(chat.id, { type: 'normal', text: '你好' }, () => {});
    const story = bodies[bodies.length - 1].messages.map(m => m.content).join('\n');
    assert.ok(!story.includes('把年龄改成二十八岁') && !story.includes('改好了'), 'edit messages are not story history');
    assert.ok(story.includes('你好'));
    current = store.require<Chat>('chat', chat.id);
    assert.equal(current.messages[current.messages.length - 1].mode, undefined);
});

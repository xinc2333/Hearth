// 跑团: dice, attitudes, settlement, the card sheet, and full turns through a plain preset and
// through the Meowssiah preset (a tool conversation built by its own request script).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { importCard } from '../src/core/compat/st-card.ts';
import { importStPreset } from '../src/core/compat/st-preset.ts';
import type { Character, Chat, Preset } from '../src/core/types.ts';
import { applyCardEdits, buildEditPrompt } from '../src/server/card-edit.ts';
import { PluginHost } from '../src/server/plugins.ts';
import { Runtime } from '../src/server/runtime.ts';
import { Store } from '../src/server/store.ts';
import tavernHelper from '../src/plugins/tavern-helper/index.ts';
import tabletop, { takeEntries } from '../src/plugins/tabletop/index.ts';
import { adaptTask } from '../src/plugins/tabletop/adapt.ts';
import { changeAxis, decay, describe } from '../src/plugins/tabletop/attitude.ts';
import { TABLETOP_ENTRIES } from '../src/plugins/tabletop/entries.ts';
import { effectiveValue, resolveChecks } from '../src/plugins/tabletop/ruling.ts';
import { DEFAULT_RULES, successChance, successLine, tierOf } from '../src/plugins/tabletop/rules.ts';
import { applySettleArgs, applySettlement, extractSettlement } from '../src/plugins/tabletop/settle.ts';
import { cardSheet, emptyAxes, normalizeSheet, parseSheetYaml, relationValue, sheetToYaml, stateFromSheet, type Relation, type Sheet, type SwipeData, type TabletopState } from '../src/plugins/tabletop/sheet.ts';
import { MEOWSSIAH } from './fixtures.ts';

const SHEET_YAML = `
角色:
  主角:
    属性: { 力量: 100, 敏捷: 120, 体质: 100, 感知: 110, 智力: 120, 意志: 100, 魅力: 105, 口才: 125 }
    特长: { 开锁: 精通 }
  林晚:
    别名: [晚晚]
    属性: { 力量: 70, 敏捷: 135, 感知: 140, 意志: 150 }
    特长: { 剑术: 熟练 }
    性格: { 敏感: 1.3, 记仇: 1.8, 多疑: 1.5 }
    状态:
      - { 名称: 旧伤未愈, 影响: { 体质: 0.8 } }
    依据: 设定写她「自幼习剑」
态度:
  - { 从: 林晚, 对: 主角, 亲近: 60, 怨恨: 55, 信任: 25, 敬重: 40, 畏惧: 0, 吸引: 45, 熟悉: 85, 缘由: [三年前主角不告而别] }
`;

const seq = (...values: number[]) => {
    let i = 0;
    return () => values[i++ % values.length];
};

test('跑团 dice: success chance, the d100 tiers and effective values', () => {
    const pct = (a: number, d: number) => Math.round(successChance(a, d) * 100);
    assert.deepEqual([pct(50, 100), pct(100, 150), pct(75, 100), pct(100, 100), pct(150, 100), pct(200, 100), pct(300, 100)], [11, 23, 30, 50, 77, 89, 96]);
    assert.equal(pct(10000, 1), 99, 'never certain');
    assert.equal(pct(1, 10000), 1, 'never hopeless');
    const tiers = (line: number, rolls: number[]) => rolls.map(r => tierOf(r, line));
    assert.deepEqual(tiers(80, [1, 8, 9, 80, 81, 98, 99, 100]), ['critical', 'critical', 'success', 'success', 'failure', 'failure', 'fumble', 'fumble']);
    assert.deepEqual(tiers(23, [2, 3, 23, 24, 92, 93]), ['critical', 'success', 'success', 'failure', 'failure', 'fumble']);
    assert.equal(successLine(0.804), 80);

    const sheet = parseSheetYaml(SHEET_YAML);
    const me = sheet.characters['主角'];
    assert.deepEqual(effectiveValue(me, '敏捷', '开锁', null), { value: 240, steps: ['敏捷120', '开锁·精通×2'] });
    assert.equal(effectiveValue(me, '力量', '剑术', null).value, 50, 'an untrained skill halves the attribute');
    assert.equal(effectiveValue(sheet.characters['林晚'], '体质', '', null).value, 80, 'unlisted attribute counts as 100, the status applies');

    // Checks: the attribute comes from the sheet, an estimated stranger is registered, outcomes follow the roll.
    const state = stateFromSheet(sheet);
    const added = {};
    const outcomes = { critical: '锁应声而开', success: '锁开了', failure: '锁芯卡住了', fumble: '发卡断在锁孔里' };
    const checks = resolveChecks({
        checks: [
            { actor: '我', action: '撬锁', attribute: '敏捷', skill: '开锁', difficulty: 150, modifiers: [{ reason: '只有一根发卡', factor: 0.8 }], outcomes },
            { actor: '守卫甲', actor_value: 130, action: '察觉动静', attribute: '感知', opponent: { name: '主角', attribute: '敏捷' }, hidden: true, outcomes },
        ],
        done: true,
    }, state, '阿尘', DEFAULT_RULES, added, seq(0.995, 0.05));
    assert.equal(checks[0].actor, '主角');
    assert.equal(Math.round(checks[0].value), 192);
    assert.equal(checks[0].line, Math.round(successChance(192, 150) * 100));
    assert.equal(checks[0].roll, 100);
    assert.equal(checks[0].tier, 'fumble');
    assert.equal(checks[0].outcome, '发卡断在锁孔里');
    assert.equal(checks[1].actor, '守卫甲');
    assert.ok('opponent' in checks[1].against && checks[1].against.value === 120);
    assert.equal(checks[1].hidden, true);
    assert.equal(checks[1].roll, 6);
    assert.deepEqual(Object.keys(added), ['守卫甲']);
    assert.equal(state.characters['守卫甲'].attributes['感知'], 130);
});

test('跑团 attitudes: lasting part and passing feeling, traits, limits and words', () => {
    const rel = (familiarity: number, start = 0): Relation => ({ from: 'a', to: 'b', base: { ...emptyAxes(), affection: start }, mood: emptyAxes(), familiarity, reasons: [] });
    const plain = { 敏感: 1, 记仇: 1, 多疑: 1 };
    const stranger = rel(0);
    changeAxis(stranger, 'affection', 10, plain);
    assert.equal(stranger.base.affection, 8, 'a stranger keeps 80% as the lasting impression');
    assert.equal(Math.round(stranger.mood.affection), 2);
    const old = rel(100);
    changeAxis(old, 'affection', 10, plain);
    assert.equal(Math.round(old.base.affection), 2, 'an old friend keeps 20%');
    assert.equal(Math.round(old.mood.affection), 8);
    const high = rel(0, 80);
    assert.equal(Math.round(changeAxis(high, 'affection', 10, plain)), 6, 'slower near the top');
    assert.equal(Math.round(changeAxis({ ...rel(0), base: { ...emptyAxes(), trust: 10 } }, 'trust', -10, plain)), -5, 'but still moves near the bottom');
    assert.equal(Math.round(changeAxis(rel(0), 'affection', 100, plain)), 30, 'capped per turn');
    assert.equal(Math.round(changeAxis(rel(0), 'affection', 10, { ...plain, 敏感: 2 })), 20);
    assert.equal(Math.round(changeAxis(rel(0), 'trust', 10, { ...plain, 多疑: 2 })), 5, 'trust is slow to build for the suspicious');
    assert.equal(Math.round(changeAxis(rel(0, 0), 'trust', -10, { ...plain, 多疑: 2 })), 0, 'cannot go below zero');

    const state: TabletopState = { ...stateFromSheet(parseSheetYaml(SHEET_YAML)) };
    const r = state.relations[0];
    r.mood.resentment = 20;
    r.mood.affection = 20;
    decay(state);
    assert.equal(r.mood.affection, 17);
    assert.ok(Math.abs(r.mood.resentment - 20 * (1 - 0.15 / 1.8)) < 1e-9, 'a grudge fades slower');
    assert.equal(describe({ ...r, base: { ...r.base, affection: 70, resentment: 60 }, mood: emptyAxes() }), '爱恨交织，喜欢但不信任');
    assert.equal(describe({ ...r, base: { ...emptyAxes(), trust: 75, respect: 45 }, mood: emptyAxes() }), '信任，看得起');
    assert.equal(describe(rel(0)), '陌生');
});

test('跑团 settlement: the hidden block is applied line by line and taken out of the reply', () => {
    const reply = '<game>她别过脸。</game>\n<结算>\n态度｜晚晚→我｜亲近+10 怨恨-4｜你替她挡了一刀\n状态｜主角｜+左臂刀伤｜力量×0.8｜被划了一刀\n新角色｜守卫甲｜受过训练｜力量160 感知130｜后门守卫\n属性｜主角｜口才+50｜练习\n胡说八道\n</结算>';
    const { text, raw } = extractSettlement(reply);
    assert.equal(text, '<game>她别过脸。</game>');
    const state = stateFromSheet(parseSheetYaml(SHEET_YAML));
    const before = relationValue(state.relations[0], 'affection');
    const results = applySettlement(state, raw!, '阿尘');
    assert.deepEqual(results.map(r => r.ok), [true, true, true, true, false]);
    const rel = state.relations.find(r => r.from === '林晚' && r.to === '主角')!;
    assert.ok(relationValue(rel, 'affection') > before, 'aliases and 我 resolve to the sheet names');
    assert.equal(rel.reasons.at(-1)?.text, '你替她挡了一刀');
    assert.deepEqual(state.characters['主角'].status.map(s => [s.name, s.effects]), [['左臂刀伤', { 力量: 0.8 }]]);
    assert.equal(state.characters['守卫甲'].attributes['力量'], 160);
    assert.equal(state.characters['主角'].attributes['口才'], 135, 'attribute growth is capped per turn');
    assert.equal(state.log.length, 4);
    assert.equal(extractSettlement('没有结算').raw, null);

    // Only others' attitudes toward the protagonist are numbers; others stand with each other in words.
    const more = applySettlement(state, '态度｜主角→林晚｜亲近+5｜我喜欢她\n态度｜林晚→守卫甲｜怨恨+5｜他拦路\n关系｜林晚与守卫甲｜结了仇｜他拦住了她', '阿尘');
    assert.deepEqual(more.map(r => r.ok), [false, false, true]);
    assert.match(more[0].text, /玩家决定/);
    assert.deepEqual(state.bonds.map(b => [b.between, b.text]), [[['林晚', '守卫甲'], '结了仇']]);
    assert.equal(state.relations.length, 1);
});

test('跑团 settlement tool: every character on scene, bonds in words, statuses, newcomers and growth', () => {
    const state = stateFromSheet(parseSheetYaml(SHEET_YAML));
    state.turn = 3;
    const rel = () => state.relations.find(r => r.from === '林晚')!;
    const before = { affection: relationValue(rel(), 'affection'), trust: relationValue(rel(), 'trust'), familiarity: rel().familiarity };
    const results = applySettleArgs(state, {
        present: ['林晚', '守卫甲'],
        attitudes: [
            { who: '晚晚', affection: 10, trust: '+6', familiarity: 5, reason: '你替她挡了一刀' },
            { who: '守卫甲', fear: 12, reason: '被主角打退' },
            { who: '主角', affection: 30, reason: '心动了' },
            { who: '沈掌柜', affection: 0, reason: '没有变化' },
        ],
        bonds: [{ between: ['林晚', '守卫甲'], now: '互相提防', reason: '守卫甲认出了她' }],
        status: [{ who: '我', change: 'add', name: '左臂刀伤', effects: '力量×0.8', note: '被划了一刀' }, { who: '林晚', change: 'remove', name: '旧伤未愈' }],
        new_characters: [{ name: '守卫甲', attributes: '力量160 感知130', note: '后门守卫' }],
        growth: [{ who: '主角', item: '开锁', change: '大师', reason: '一夜之间开了七把锁' }, { who: '主角', item: '口才', change: '+50', reason: '练习' }],
    }, '阿尘');
    const failed = results.filter(r => !r.ok);
    assert.deepEqual(failed.map(r => r.line), ['态度 主角'], 'the protagonist\'s own feelings are not recorded');
    assert.ok(relationValue(rel(), 'affection') > before.affection && relationValue(rel(), 'trust') > before.trust);
    assert.equal(rel().familiarity, before.familiarity + 5);
    assert.equal(rel().reasons.at(-1)?.text, '你替她挡了一刀');
    const guard = state.relations.find(r => r.from === '守卫甲');
    assert.ok(guard && relationValue(guard, 'fear') > 0, 'a newcomer is registered before its attitude');
    assert.equal(state.characters['守卫甲'].attributes['力量'], 160);
    assert.ok(!state.relations.some(r => r.from === '沈掌柜'), 'no change, nothing recorded');
    assert.deepEqual(state.bonds[0].between, ['林晚', '守卫甲']);
    assert.equal(state.characters['主角'].status[0].effects['力量'], 0.8);
    assert.equal(state.characters['林晚'].status.length, 0);
    assert.equal(state.characters['主角'].skills['开锁'], '大师');
    assert.equal(state.characters['主角'].attributes['口才'], 135);
    const attitudeLines = results.filter(r => r.ok && r.kind === 'attitude').map(r => r.who);
    assert.deepEqual(attitudeLines, ['林晚', '守卫甲']);
    assert.ok(results.some(r => r.kind === 'status' && r.who === '主角'));
});

test('跑团 older sheets: the protagonist\'s own attitudes go, attitudes between others become words', () => {
    const old = parseSheetYaml(`${SHEET_YAML}
  - { 从: 林晚, 对: 沈掌柜, 亲近: 10, 怨恨: 70, 信任: 5 }
`);
    assert.equal(old.relations.length, 1);
    assert.equal(old.bonds.length, 1);
    assert.match(old.bonds[0].text, /怨恨/);
    const legacy = normalizeSheet({ custom: {}, characters: {}, relations: [{ from: '主角', to: '林晚', base: emptyAxes(), mood: emptyAxes(), familiarity: 0, reasons: [] }] } as unknown as Sheet);
    assert.deepEqual([legacy.relations.length, legacy.bonds.length], [0, 0]);
});

test('跑团 sheet: YAML round trip, and 数据化适配 writes it through the 编辑 block', async t => {
    const sheet = parseSheetYaml(`\`\`\`yaml${SHEET_YAML}\`\`\``);
    assert.deepEqual(Object.keys(sheet.characters), ['主角', '林晚']);
    assert.deepEqual(parseSheetYaml(sheetToYaml(sheet)), sheet);
    assert.throws(() => parseSheetYaml('角色: ['), /YAML/);

    const dir = await mkdtemp(path.join(tmpdir(), 'hearth-tabletop-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const store = new Store(dir);
    store.load();
    const character = await store.create(importCard({ name: '林晚', description: '自幼习剑。' }, 'c.json').character);
    const ctx = { character, messages: [], userName: '阿尘' };
    assert.equal(adaptTask.instruction(ctx), '', 'nothing is added until the task is used');
    const asked = { ...ctx, messages: [{ id: 'u', role: 'user' as const, name: '阿尘', mode: 'edit' as const, swipes: [{ id: 's', content: adaptTask.request, createdAt: 0 }], activeSwipe: 0, hidden: false, createdAt: 0 }] };
    const prompt = buildEditPrompt({ store, character, books: [], messages: asked.messages, userName: '阿尘', maxContext: 100000, maxTokens: 4000, extras: [adaptTask.instruction(asked)] });
    assert.ok(prompt.messages.some(m => m.content.includes('跑团角色表') && m.content.includes('普通成年男性')));

    const tasks = { list: [adaptTask], ctx: asked };
    const edits = await applyCardEdits(store, character.id, `好的。\n<card_edit>\n【改写】跑团角色表\n${SHEET_YAML}\n</card_edit>`, prompt, 'stop', tasks);
    assert.equal(edits?.results[0].ok, true, edits?.results[0].reason);
    assert.match(edits!.results[0].label, /主角、林晚/);
    let saved = cardSheet(store.require<Character>('character', character.id));
    assert.equal(saved?.characters['林晚'].attributes['意志'], 150);

    // A later edit replaces only what it lists; deleting removes the character and its attitudes.
    await applyCardEdits(store, character.id, '<card_edit>\n【改写】跑团角色表\n角色:\n  林晚:\n    属性: { 力量: 80 }\n</card_edit>', prompt, 'stop', tasks);
    saved = cardSheet(store.require<Character>('character', character.id));
    assert.equal(saved?.characters['林晚'].attributes['力量'], 80);
    assert.equal(saved?.characters['主角'].attributes['口才'], 125);
    assert.deepEqual(saved?.characters['林晚'].aliases, ['晚晚'], 'parts the patch did not write stay');
    assert.equal(saved?.characters['林晚'].attributes['意志'], 150);
    await applyCardEdits(store, character.id, '<card_edit>\n【改写】跑团角色表\n态度:\n  - { 从: 林晚, 对: 主角, 怨恨: 70 }\n</card_edit>', prompt, 'stop', tasks);
    saved = cardSheet(store.require<Character>('character', character.id));
    assert.deepEqual([saved!.relations[0].base.resentment, saved!.relations[0].base.affection, saved!.relations[0].familiarity], [70, 60, 85]);
    const removed = await applyCardEdits(store, character.id, '<card_edit>\n【删除】跑团角色表 › 晚晚\n</card_edit>', prompt, 'stop', tasks);
    saved = cardSheet(store.require<Character>('character', character.id));
    assert.deepEqual(Object.keys(saved!.characters), ['主角']);
    assert.equal(saved!.relations.length, 0);
    const bad = await applyCardEdits(store, character.id, '<card_edit>\n【改写】跑团角色表\n角色: [\n</card_edit>', prompt, 'stop', tasks);
    assert.equal(bad?.results[0].ok, false);

    // Undo goes through the usual change channel.
    for (const id of [...removed!.changes].reverse()) await store.revert(id);
    assert.ok(cardSheet(store.require<Character>('character', character.id))?.characters['林晚']);
});

test('跑团 entries are taken out of the ordinary prompt', () => {
    const entry = (kind: string) => TABLETOP_ENTRIES.find(e => e.kind === kind)!.content;
    const { rest, found } = takeEntries(`前文\n${entry('ruling')}\n${entry('pass')}\n<<<|hearth|settle-lead>>>\n<think>记账了</think>`);
    assert.equal(rest, '前文');
    assert.match(found.ruling!, /^【DM 裁定】/);
    assert.match(found.pass!, /绝对通过/);
    assert.equal(found['settle-lead'], '<think>记账了</think>');
    assert.equal(found.narrate, undefined);
    assert.ok(TABLETOP_ENTRIES.every(e => !/\p{Extended_Pictographic}/u.test(e.name + e.content)), 'no emoji');
});

/** A mock endpoint: 裁定 and 结算 answer through their tools, the reply streams as text. */
async function mockModel(t: { after: (fn: () => unknown) => void }, reply: string) {
    const bodies: Record<string, any>[] = [];
    const calls = { ruling: 0, settle: 0 };
    const server = createServer(async (req, res) => {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        bodies.push(body);
        const forced = body.tool_choice?.function?.name;
        const answer = (name: string, args: unknown) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: `call_${bodies.length}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] }));
        };
        if (forced === 'hearth_check') {
            calls.ruling++;
            const round = body.messages.filter((m: { role: string; name?: string }) => m.role === 'tool' && m.name === 'hearth_check').length;
            return answer('hearth_check', round === 0
                ? { think: '要撬锁', checks: [{ actor: '主角', action: '撬开后门的锁', reason: '锁很旧', attribute: '敏捷', skill: '开锁', difficulty: 150, outcomes: { critical: '锁应声而开', success: '锁开了', failure: '锁芯卡住', fumble: '发卡断了' } }], done: false }
                : { checks: [{ actor: '林晚', action: '察觉主角的动静', attribute: '感知', opponent: { name: '主角', attribute: '敏捷' }, hidden: true, outcomes: { critical: '她早就看见了', success: '她听见了', failure: '她没注意', fumble: '她睡着了' } }], done: true });
        }
        if (forced === 'hearth_settle') {
            calls.settle++;
            return answer('hearth_settle', {
                present: ['林晚'],
                attitudes: [{ who: '林晚', affection: 10, familiarity: 3, reason: '你回来了' }],
                status: [{ who: '主角', change: 'add', name: '手上的划伤', effects: '敏捷×0.9' }],
            });
        }
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: reply } }] })}\n\ndata: [DONE]\n\n`);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
    return { bodies, calls, url: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1` };
}

async function tabletopRuntime(dir: string, base: Preset, url: string) {
    const store = new Store(dir);
    store.load();
    for (const e of TABLETOP_ENTRIES) {
        const id = `hearth-tabletop-${e.kind}`;
        base.prompts.push({ ...(base.prompts.find(p => !p.marker && p.content) ?? base.prompts[0]), id, name: e.name, role: 'system', content: e.content, marker: false, builtin: false });
        base.order.push({ id, enabled: true });
    }
    const preset = await store.create(base);
    await store.saveSettings({
        presetId: preset.id,
        userName: '阿尘',
        connections: [{ id: 'c', name: 'mock', provider: 'openai-compatible', baseUrl: url, model: 'gemini-3.8-flash', sendNames: true }],
        connectionId: 'c',
    });
    const host = new PluginHost(store, '0.6.0');
    await host.use(tavernHelper, { id: 'tavern-helper', name: '酒馆助手', version: '1.1.0', order: 20 });
    await host.use(tabletop, { id: 'tabletop', name: '跑团', version: '1.1.0', order: 30 });
    const runtime = new Runtime(store, host);
    host.sender = (body, signal) => runtime.send(body, signal);
    const card = importCard({ name: '林晚', first_mes: '雨夜，后门紧锁。' }, 'c.json').character;
    card.extra = { hearth: { rpg: parseSheetYaml(SHEET_YAML) } };
    const character = await store.create(card);
    const chat = await runtime.createChat(character.id);
    return { store, host, runtime, preset, character, chat };
}

const lastSwipe = (chat: Chat) => {
    const m = chat.messages.at(-1)!;
    return m.swipes[m.activeSwipe].plugins?.tabletop as SwipeData;
};

test('跑团 with a plain preset: ruling, reply and settlement as three steps', async t => {
    const dir = await mkdtemp(path.join(tmpdir(), 'hearth-tabletop-plain-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const mock = await mockModel(t, '后门的锁咔哒一声。林晚回过头。');
    const { store, runtime, chat } = await tabletopRuntime(dir, importStPreset({ openai_max_context: 64000, openai_max_tokens: 4096, stream_openai: true }, '默认', '') as Preset, mock.url);

    const events: { type: string; plugin?: string }[] = [];
    await runtime.generate(chat.id, { type: 'normal', text: '我用发卡去撬后门的锁' }, e => events.push(e as never));
    assert.deepEqual(mock.calls, { ruling: 2, settle: 1 });
    const [first, , narration, settle] = mock.bodies;
    const base = narration.messages.length - 1;
    assert.deepEqual(first.messages.slice(0, base), narration.messages.slice(0, base), 'every step keeps the preset\'s request and adds to its end');
    assert.match(first.messages.at(-1).content, /【DM 裁定】/);
    assert.match(first.messages.at(-1).content, /主角（阿尘）：力量100/);
    assert.equal(first.messages.at(-1).role, 'system');
    assert.deepEqual(first.tools.map((x: any) => x.function.name), ['hearth_check', 'hearth_settle']);
    assert.equal(narration.tools, undefined, 'a plain reply request gets no tools');
    assert.match(narration.messages.at(-1).content, /【本轮检定结果】[\s\S]*【写作要求】/);
    assert.ok(!JSON.stringify(narration.messages).includes('【结算】'), 'the reply step carries no bookkeeping');
    assert.deepEqual(settle.messages.slice(0, base + 1), narration.messages);
    assert.deepEqual(settle.messages.at(-2), { role: 'assistant', content: '后门的锁咔哒一声。林晚回过头。' });
    assert.match(settle.messages.at(-1).content, /【结算】/);
    assert.equal(settle.tool_choice.function.name, 'hearth_settle');
    assert.ok(events.findIndex(e => e.type === 'done') < events.findIndex(e => e.type === 'update'), 'the reply is shown before it is settled');

    const data = lastSwipe(store.require<Chat>('chat', chat.id));
    assert.equal(data.settle?.status, undefined);
    assert.deepEqual(data.settle?.present, ['林晚']);
    const rel = data.state!.relations.find(r => r.from === '林晚')!;
    assert.ok(relationValue(rel, 'affection') > 60);
    assert.equal(rel.familiarity, 88);
    assert.equal(data.state!.characters['主角'].status[0].name, '手上的划伤');
    assert.deepEqual(data.settle!.results.map(r => [r.kind, r.who]), [['attitude', '林晚'], ['status', '主角']]);
    assert.equal(runtime.lastPrompt(chat.id)?.stages?.length, 3, 'two ruling rounds and the settlement are in the prompt trace');
});

test('跑团 with Meowssiah: the steps continue its tool conversation, with the same tools', { skip: !existsSync(MEOWSSIAH) }, async t => {
    const dir = await mkdtemp(path.join(tmpdir(), 'hearth-tabletop-turn-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const mock = await mockModel(t, '<game>后门的锁咔哒一声。林晚回过头。</game>');
    const imported = importStPreset(JSON.parse(readFileSync(MEOWSSIAH, 'utf8')), 'Meowssiah', 'm.json') as Preset;
    const { store, runtime, chat } = await tabletopRuntime(dir, imported, mock.url);
    const control = () => runtime.controls(store.require<Chat>('chat', chat.id)).find(c => c.id === 'tabletop:pass');
    assert.ok(control(), 'the 检定绝对通过 switch appears for a card with a sheet');

    await runtime.generate(chat.id, { type: 'normal', text: '我用发卡去撬后门的锁' }, () => {});
    assert.deepEqual(mock.calls, { ruling: 2, settle: 1 });
    const [first, second, narration, settle] = mock.bodies;
    const base = narration.messages.length - 2;
    assert.deepEqual(first.messages.slice(0, base), narration.messages.slice(0, base), 'every step keeps the preset\'s request as it is');
    assert.equal(narration.messages[base - 1].tool_call_id, 'call_sync_final', 'the steps come after the preset\'s own last sync');
    const names = (b: any) => b.tools.map((x: any) => x.function.name);
    assert.deepEqual(names(first), names(narration));
    assert.deepEqual(names(settle), names(narration), 'all three steps declare the same tools');
    assert.ok(names(first).includes('soliumbra_reply'));
    assert.equal(first.toolConfig.functionCallingConfig.allowedFunctionNames[0], 'hearth_check');
    assert.equal(narration.tool_choice.function.name, 'soliumbra_reply', 'the reply still goes through the preset\'s reply tool');
    assert.equal(first.messages.at(-2).tool_calls[0].function.name, 'context');
    assert.match(first.messages.at(-1).content, /【DM 裁定】/);
    assert.match(second.messages.at(-1).content, /掷骰结果/);
    assert.match(narration.messages.at(-1).content, /【本轮检定结果】[\s\S]*暗骰[\s\S]*【写作要求】/);
    const sentBefore = JSON.stringify(narration.messages.slice(0, base));
    assert.ok(!sentBefore.includes('<<<|hearth') && !sentBefore.includes('【DM 裁定】') && !sentBefore.includes('【写作要求】'), 'the 跑团 entries never go out as ordinary entries');
    assert.deepEqual(settle.messages.slice(0, narration.messages.length), narration.messages);
    const replyCall = settle.messages[narration.messages.length].tool_calls[0];
    assert.equal(replyCall.function.name, 'soliumbra_reply');
    assert.equal(JSON.parse(replyCall.function.arguments).game_content, '<game>后门的锁咔哒一声。林晚回过头。</game>');
    assert.match(settle.messages.at(-1).content, /【结算】/);
    assert.equal(settle.toolConfig.functionCallingConfig.allowedFunctionNames[0], 'hearth_settle');

    let current = store.require<Chat>('chat', chat.id);
    let reply = current.messages.at(-1)!;
    const ruling = (reply.plugins?.tabletop as { ruling: { checks: { roll: number }[] } }).ruling;
    assert.equal(ruling.checks.length, 2);
    assert.equal(lastSwipe(current).state?.turn, 1);
    assert.ok(relationValue(lastSwipe(current).state!.relations[0], 'affection') > 60);

    // Another version of the reply keeps the dice and is settled on its own.
    await runtime.generate(chat.id, { type: 'swipe' }, () => {});
    assert.deepEqual(mock.calls, { ruling: 2, settle: 2 });
    const again = mock.bodies.at(-2)!.messages.at(-1).content as string;
    assert.ok(again.includes(`掷出 ${ruling.checks[0].roll}`));
    current = store.require<Chat>('chat', chat.id);
    reply = current.messages.at(-1)!;
    assert.equal(reply.swipes.length, 2);
    assert.equal((reply.swipes[1].plugins?.tabletop as SwipeData).state?.turn, 1, 'each version settles from the same starting point');

    // A changed message is ruled again.
    const user = current.messages.at(-2)!;
    await store.apply({ target: { kind: 'chat', id: chat.id }, ops: [{ op: 'set', path: ['messages', `@${user.id}`, 'swipes', `@${user.swipes[0].id}`, 'content'], value: '我直接踹门' }], author: 'user' });
    await runtime.generate(chat.id, { type: 'regenerate' }, () => {});
    assert.equal(mock.calls.ruling, 4);

    // 检定绝对通过: no ruling, the switch turns itself off after the reply; the reply is still settled.
    await store.apply({ target: { kind: 'chat', id: chat.id }, ops: await runtime.changeControl(store.require<Chat>('chat', chat.id), 'tabletop:pass', true), author: 'user' });
    assert.equal(control()?.value, true);
    const settled = mock.calls.settle;
    await runtime.generate(chat.id, { type: 'normal', text: '我推门进去' }, () => {});
    assert.equal(mock.calls.ruling, 4);
    assert.equal(mock.calls.settle, settled + 1);
    assert.match(mock.bodies.at(-2)!.messages.at(-1).content, /检定绝对通过/);
    assert.equal(control()?.value, false);
    assert.equal(lastSwipe(store.require<Chat>('chat', chat.id)).state?.turn, 2);

    // 聊天 talks with the AI outside the story: no 跑团, and the next reply is back in 剧场.
    await store.apply({ target: { kind: 'chat', id: chat.id }, ops: await runtime.changeControl(store.require<Chat>('chat', chat.id), 'mode', 'chat'), author: 'user' });
    assert.equal(control(), undefined, 'no 检定绝对通过 in 聊天');
    const count = mock.bodies.length;
    await runtime.generate(chat.id, { type: 'normal', text: '你好' }, () => {});
    assert.equal(mock.bodies.length, count + 1);
    assert.ok(!JSON.stringify(mock.bodies.at(-1)!.messages.slice(-3)).includes('hearth_'));
    assert.equal(store.require<Chat>('chat', chat.id).reply?.mode, 'theater');
});

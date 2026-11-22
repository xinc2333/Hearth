// 世界: routes, the clock and the body, commitments, scenes, and whole turns of a world chat
// through a plain preset with a mock model (docs/world.md).
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { importCard } from '../src/core/compat/st-card.ts';
import { importStPreset } from '../src/core/compat/st-preset.ts';
import type { Chat, Preset } from '../src/core/types.ts';
import { PluginHost } from '../src/server/plugins.ts';
import { Runtime } from '../src/server/runtime.ts';
import { Store } from '../src/server/store.ts';
import tabletop from '../src/plugins/tabletop/index.ts';
import { TABLETOP_ENTRIES } from '../src/plugins/tabletop/entries.ts';
import type { MessageData, SwipeData } from '../src/plugins/tabletop/sheet.ts';
import { applySetup } from '../src/plugins/tabletop/world/apply.ts';
import { lanjiang } from '../src/plugins/tabletop/world/city/index.ts';
import { WORLD_ENTRIES } from '../src/plugins/tabletop/world/entries.ts';
import { bestTrip, trip } from '../src/plugins/tabletop/world/route.ts';
import { staffOf, updateScene } from '../src/plugins/tabletop/world/scene.ts';
import { advanceBody, bodyWords, fmtNow, parseTime, weatherOn, type WorldState } from '../src/plugins/tabletop/world/state.ts';
import { playTurn } from '../src/plugins/tabletop/world/turn.ts';
import { applyAct, applyDay, applyProfile, deliverDue, takeNotices, timeAt } from '../src/plugins/tabletop/world/minds.ts';

const city = lanjiang();
const place = (name: string) => city.places.find(p => p.name === name)!;
const station = (name: string) => city.stations.get(name)!.at;

const SETUP = {
    attributes: { 力量: 95, 敏捷: 110, 体质: 100, 感知: 120, 智力: 125, 意志: 105, 魅力: 110, 口才: 115 },
    skills: { 平面设计: '熟练' },
    job: { title: '平面设计', employer: '星衡广告', place: '望江嘴金融城', income: 14000, payday: 10, days: '工作日', from: '09:00', to: '18:00', norms: '迟到扣 50，无故旷工扣三天工资。' },
    home: { place: '共和新村', rent: 3800, rent_day: 1, norms: '晚几天会催。' },
    balance: 6000,
    living: '普通',
    habit: '地铁',
    people: [
        { name: '王经理', role: '上司', gender: '男', age: 41, about: '严格但讲道理', attitude: { trust: 45, familiarity: 40 } },
        { name: '李想', role: '同事', gender: '女', age: 27, about: '爱聊天', attitude: { affection: 40, familiarity: 50 } },
        { name: '陈阿姨', role: '房东', gender: '女', age: 63, about: '精明', lives: '共和新村' },
        { name: '妈妈', role: '妈妈', gender: '女', age: 55, about: '在老家', lives: '江西省' },
    ],
};
const FORM = { name: '林舟', gender: '男', age: 26, job: '上班族' as const, jobText: '广告公司的设计', district: '安华区', about: '刚来澜江两年', start: '2026-03-02 07:30' };

const freshWorld = (): WorldState => applySetup(SETUP, FORM, city, 42).world;

test('世界 routes: the metro across town, walking nearby, taxis when the metro sleeps', () => {
    const when = { minute: 8 * 60 + 10, workday: true };
    const far = bestTrip(city, station('徐坊'), station('科学城'), when);
    assert.equal(far.mode, 'metro');
    assert.ok(far.minutes > 15 && far.minutes < 60, `${far.minutes} 分钟`);
    assert.ok(far.legs.some(l => l.includes('号线')));
    assert.ok(far.cost >= 3 && far.cost <= 8);
    assert.equal(bestTrip(city, place('桂里').at, place('江滩').at, when).mode, 'walk');
    const night = { minute: 23 * 60 + 40, workday: false };
    assert.equal(trip(city, station('徐坊'), station('科学城'), 'metro', night).ok, false);
    assert.equal(bestTrip(city, station('徐坊'), station('科学城'), night).mode, 'taxi');
    // Taxis at night cost more.
    assert.ok(trip(city, station('徐坊'), station('科学城'), 'taxi', night).cost > trip(city, station('徐坊'), station('科学城'), 'taxi', { minute: 14 * 60, workday: true }).cost);
});

test('世界 clock, weather and body', () => {
    const world = freshWorld();
    assert.equal(fmtNow(world), '第 1 天 · 3 月 2 日 星期一 07:30');
    assert.deepEqual(weatherOn(42, '2026-03-02'), weatherOn(42, '2026-03-02'), 'the same day has the same weather');
    const summer = weatherOn(7, '2026-07-20');
    assert.ok(summer.high > 25);
    const tired = advanceBody({ full: 70, energy: 40, health: 100, awakeSince: 0 }, 8 * 60, '日常', 480);
    assert.deepEqual(bodyWords(tired), ['饿了', '极度疲惫']);
    const slept = advanceBody(tired, 8 * 60, '睡觉', 800);
    assert.ok(slept.energy > 90);
});

test('世界 opening: the life written by the model becomes the world and the sheet', () => {
    const { world, state } = applySetup(SETUP, FORM, city, 42);
    assert.equal(world.at, place('共和新村').id);
    assert.equal(world.me.job.place, place('望江嘴金融城').id);
    assert.equal(world.balance, 6000);
    assert.deepEqual(world.commitments.map(c => c.name), ['劳动合同', '租房合同']);
    assert.deepEqual(world.commitments[0].reps, { 星衡广告: '王经理' });
    assert.equal(state.characters['主角'].attributes['智力'], 125);
    assert.ok(state.relations.find(r => r.from === '王经理')!.base.trust === 45);
    assert.equal(world.people['王经理'].work, world.me.job.place);
    assert.equal(world.people['妈妈'].home, undefined, 'someone outside the city has no home on the map');
    assert.ok(world.phone.contacts.includes('李想'));
});

test('世界 turns: travel, missing work, payday and rent', () => {
    const world = freshWorld();
    const plan = playTurn(world, city, { minutes: 20, move: { to: '衡梧路', by: '地铁' } });
    assert.equal(world.at, place('衡梧路').id);
    assert.ok(plan.move && plan.move.trip.minutes > 0);
    assert.ok(world.balance < 6000, 'the fare is paid');
    assert.equal(world.now, plan.to);
    // Staying at the café through nine o'clock: work notices.
    const late = playTurn(world, city, { until: '2026-03-02 12:00' });
    const lapse = late.events.find(e => e.kind === 'lapse')!;
    assert.match(lapse.text, /劳动合同.*望江嘴金融城.*王经理会察觉/);
    assert.equal(playTurn(world, city, { until: '2026-03-02 13:00' }).events.filter(e => e.kind === 'lapse').length, 0, 'raised once');
    // Keeping to the routine until payday: no lapses, the salary comes, rent is not due yet.
    const balance = world.balance;
    const week = playTurn(world, city, { until: '2026-03-10 20:00', routine: true });
    assert.equal(week.events.filter(e => e.kind === 'lapse').length, 0);
    assert.ok(week.events.some(e => /收到星衡广告按劳动合同付的 14000 元/.test(e.text)));
    assert.ok(world.balance > balance + 14000 - 8 * 70 - 1);
    // Rent on the 1st of April.
    const month = playTurn(world, city, { until: '2026-04-01 10:00', routine: true });
    assert.ok(month.events.some(e => /按租房合同付给陈阿姨 3800 元/.test(e.text)));
});

test('世界 scenes: staff stay the same, visitors come and go, home has no strangers', () => {
    const world = freshWorld();
    const cafe = place('衡梧路');
    const at = parseTime('2026-03-02 15:00')!;
    const first = updateScene(world, cafe, at);
    assert.ok(first.scene.people.length > 0 && first.scene.people.length <= 8);
    assert.deepEqual(staffOf(world, cafe).map(s => s.id), first.scene.people.filter(p => p.role === 'staff').map(p => p.id));
    world.scene = first.scene;
    const later = updateScene(world, cafe, at + 600);
    assert.ok(later.scene.people.every(p => p.role === 'staff' || p.leaveAt > at + 600));
    const home = updateScene(world, place('共和新村'), at);
    assert.equal(home.scene.people.length, 0);
});

test('世界 minds: the boss notices, writes, docks pay; a 重要人物 plans to get in touch', () => {
    const world = freshWorld();
    playTurn(world, city, { minutes: 20, move: { to: '衡梧路', by: '地铁' } });
    const plan = playTurn(world, city, { until: '2026-03-02 12:00' });
    const due = takeNotices(world, plan.to);
    assert.deepEqual([...due.keys()], ['王经理'], 'the boss is the one who notices');
    assert.match(due.get('王经理')![0].what, /09:00 应该在望江嘴金融城/);
    const act = applyAct(world, city, '王经理', {
        actions: [
            { do: 'message', at: '09:20', to: '主角', text: '人呢？今天怎么没来？' },
            { do: 'pay', amount: -300, text: '无故旷工' },
            { do: 'message', at: '13:00', to: '主角', text: '下午还来吗' },
        ],
        feelings: { trust: -6, reason: '无故没来上班' },
    }, due.get('王经理')![0].at, plan.to);
    assert.ok(act.events.some(e => e.text === '09:20 王经理发来消息：人呢？今天怎么没来？'));
    assert.equal((act.feelings as any).trust, -6);
    assert.ok(world.phone.messages.some(m => m.from === '王经理' && !m.read));
    assert.equal(world.pending.filter(p => p.kind === 'deliver').length, 1, 'the 13:00 message waits for its time');
    assert.equal(deliverDue(world, timeAt('13:05', world.now)).length, 1);
    // Payday takes the deduction off.
    const pay = playTurn(world, city, { until: '2026-03-10 20:00', routine: true });
    assert.ok(pay.events.some(e => /14000|13700/.test(e.text) && /扣了 300 元/.test(e.text)));
    // A 重要人物 decides to write tomorrow at lunch.
    world.people['李想'] = { ...world.people['李想'], kind: 'important', mood: 50, stress: 30 };
    const lines = applyDay(world, city, '李想', { day: ['加班到九点'], recent: '项目忙', mood: -5, contact: { at: '2026-03-11 12:30', how: '消息', text: '明天中午一起吃饭吗？' } }, timeAt('2026-03-10 23:59', world.now));
    assert.match(lines[0], /李想打算在 03-11 12:30 发消息给主角/);
    const next = playTurn(world, city, { until: '2026-03-11 13:00', routine: true });
    assert.ok(next.events.some(e => e.text === '12:30 李想发来消息：明天中午一起吃饭吗？'));
});

test('世界 profiles: someone from the scene becomes a 重要人物 with a week of their own', () => {
    const world = freshWorld();
    playTurn(world, city, { minutes: 20, move: { to: '衡梧路' } });
    const made = applyProfile(world, city, {
        name: '许棠', profile: '（完整档案）', summary: '衡梧路咖啡馆的咖啡师', role: '咖啡师', gender: '女', age: 25,
        home: '鹿鸣路洋房', work: '衡梧路', routine: [{ days: '工作日', from: '08:00', to: '17:00', place: '衡梧路', doing: '上班' }],
        attributes: { 魅力: 130 }, knows: ['主角早上来点过一杯拿铁'],
    }, 's-xyz');
    assert.equal(made!.name, '许棠');
    assert.equal(world.people['许棠'].kind, 'important');
    assert.equal(world.people['许棠'].routine![0].place, place('衡梧路').id);
    assert.deepEqual(world.knowledge['许棠'].map(k => k.text), ['主角早上来点过一杯拿铁']);
    // Kept as written when the user brought the profile.
    assert.equal(applyProfile(world, city, { name: '阿青', profile: 'x', summary: 'y', routine: [] }, '阿青', '用户写的档案')!.profile.profile, '用户写的档案');
});

// ---------------------------------------------------------------------------------------------
// Whole turns with a mock model
// ---------------------------------------------------------------------------------------------

async function mockModel(t: { after: (fn: () => unknown) => void }, rulings: unknown[], settles: unknown[]) {
    const bodies: Record<string, any>[] = [];
    const calls: string[] = [];
    const server = createServer(async (req, res) => {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        bodies.push(body);
        const forced = body.tool_choice?.function?.name as string | undefined;
        calls.push(forced ?? 'reply');
        const answer = (name: string, args: unknown) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: `call_${bodies.length}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] }));
        };
        const last = String(body.messages.at(-1)?.content ?? '');
        if (forced === 'hearth_setup') return answer(forced, SETUP);
        if (forced === 'hearth_check') return answer(forced, rulings.shift() ?? { checks: [], done: true });
        if (forced === 'hearth_scene') {
            const ids = [...last.matchAll(/^- ([sb]-[0-9a-z-]+)：/gm)].map(m => m[1]);
            return answer(forced, { crowd: '下午的咖啡馆，人不多', people: ids.map((id, i) => ({ id, looks: i ? `第 ${i} 个客人，穿灰色卫衣` : '扎马尾的店员', doing: '在忙', where: i ? '靠窗' : '吧台后面' })) });
        }
        if (forced === 'hearth_act') return answer(forced, { think: '要问问', actions: [{ do: 'message', at: '09:20', to: '主角', text: '人呢？' }], feelings: { trust: -5, reason: '没来上班' } });
        if (forced === 'hearth_profile') return answer(forced, { name: '许棠', profile: '许棠的完整档案', summary: '咖啡师', role: '咖啡师', gender: '女', age: 25, home: '鹿鸣路洋房', work: '衡梧路', routine: [{ days: '工作日', from: '08:00', to: '17:00', place: '衡梧路', doing: '上班' }] });
        if (forced === 'hearth_day') return answer(forced, { day: ['上班'], recent: '还好', contact: { at: '2026-03-03 12:30', how: '消息', text: '今天还来喝咖啡吗？' } });
        if (forced === 'hearth_settle') {
            const next = settles.shift() as Record<string, any> | undefined;
            const firstId = /^- ([sb]-[0-9a-z-]+)｜/m.exec(last)?.[1];
            const id = (v: string) => (v === 'FIRST' ? firstId : v);
            const world = next?.world ? { ...next.world, met: next.world.met?.map((m: any) => ({ ...m, id: id(m.id) })) } : undefined;
            const attitudes = (next?.attitudes ?? []).map((a: any) => ({ ...a, who: id(a.who) }));
            return answer(forced, { present: (next?.present ?? []).map(id), ...next, attitudes, ...(world ? { world } : {}) });
        }
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: '（正文）' } }] })}\n\ndata: [DONE]\n\n`);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
    return { bodies, calls, url: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1` };
}

async function worldRuntime(dir: string, url: string) {
    const store = new Store(dir);
    store.load();
    const base = importStPreset({ openai_max_context: 64000, openai_max_tokens: 4096, stream_openai: true }, '默认', '') as Preset;
    for (const e of [...TABLETOP_ENTRIES, ...WORLD_ENTRIES]) {
        const id = `hearth-${e.kind}`;
        base.prompts.push({ ...(base.prompts.find(p => !p.marker && p.content) ?? base.prompts[0]), id, name: e.name, role: 'system', content: e.content, marker: false, builtin: false });
        base.order.push({ id, enabled: true });
    }
    const preset = await store.create(base);
    await store.saveSettings({
        presetId: preset.id,
        userName: '林舟',
        connections: [{ id: 'c', name: 'mock', provider: 'openai-compatible', baseUrl: url, model: 'gemini-3.8-flash', sendNames: true }],
        connectionId: 'c',
    });
    const host = new PluginHost(store, '0.9.0');
    await host.use(tabletop, { id: 'tabletop', name: '跑团', version: '1.3.0', order: 30 });
    const runtime = new Runtime(store, host);
    host.sender = (body, signal) => runtime.send(body, signal);
    const character = await store.create(importCard({ name: '澜江市', description: '澜江市是中国东部沿海的特大城市。' }, 'lanjiang.json').character);
    let chat = await runtime.createChat(character.id);
    chat = (await store.apply({ target: { kind: 'chat', id: chat.id }, ops: [{ op: 'set', path: ['plugins', 'tabletop', 'world', 'setup'], value: FORM }], author: 'user', journal: false })).resource as Chat;
    return { store, runtime, chat, host };
}

const swipeOf = (chat: Chat) => {
    const m = chat.messages.at(-1)!;
    return m.swipes[m.activeSwipe].plugins?.tabletop as SwipeData;
};

test('世界 chat: opening, going out, the scene, settling the world', async t => {
    const dir = await mkdtemp(path.join(tmpdir(), 'hearth-world-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const mock = await mockModel(t,
        [
            { think: '出门', checks: [], done: true, time: { minutes: 30, activity: '日常' }, move: { to: '衡梧路', by: '地铁' } },
            { checks: [], done: true, time: { until: '2026-03-03 07:00', activity: '日常' } },
        ],
        [
            { world: { ate: '' } },
            { present: ['FIRST'], attitudes: [{ who: 'FIRST', familiarity: 2, reason: '点了一杯拿铁' }], world: { ate: '点心', money: [{ amount: -32, reason: '一杯拿铁' }], met: [{ id: 'FIRST', name: '扎马尾的店员' }], commitments: [{ with: '王经理', what: '下午交方案', at: '2026-03-02 15:00', place: '望江嘴金融城' }] } },
        ]);
    const { store, runtime, chat, host } = await worldRuntime(dir, mock.url);

    // The opening: the setup step, then the first reply (no ruling, nobody at home to describe).
    await runtime.generate(chat.id, { type: 'normal' }, () => {});
    assert.deepEqual(mock.calls, ['hearth_setup', 'reply', 'hearth_settle']);
    const setup = mock.bodies[0];
    assert.match(setup.messages.at(-1).content, /【开局】[\s\S]*【开局设定】[\s\S]*林舟[\s\S]*【澜江市可选的地方】/);
    assert.deepEqual(setup.tools.map((x: any) => x.function.name), ['hearth_check', 'hearth_settle', 'hearth_scene', 'hearth_setup', 'hearth_act', 'hearth_day', 'hearth_profile']);
    const opening = mock.bodies[1].messages.at(-1).content as string;
    assert.match(opening, /【世界数据】[\s\S]*时间：第 1 天 · 3 月 2 日 星期一 07:3/);
    assert.match(opening, new RegExp(`主角在：${city.districts.find(d => d.id === place('共和新村').district)!.name} 共和新村`));
    assert.match(opening, /【开场】/);
    let current = store.require<Chat>('chat', chat.id);
    assert.ok((current.plugins?.tabletop as any).world.base.commitments.length === 2);
    let data = swipeOf(current);
    assert.ok(data.world, 'the reply version carries the world');
    assert.equal(data.state!.characters['主角'].attributes['智力'], 125);

    // Going to a café by metro: ruling with time and movement, the scene, the reply, the settlement.
    await runtime.generate(chat.id, { type: 'normal', text: '我出门去衡梧路那家咖啡馆坐坐' }, () => {});
    assert.deepEqual(mock.calls.slice(3), ['hearth_check', 'hearth_scene', 'reply', 'hearth_settle']);
    const ruling = mock.bodies[3];
    assert.ok(ruling.tools.find((x: any) => x.function.name === 'hearth_check').function.parameters.properties.move);
    assert.match(ruling.messages.at(-1).content, /【这一轮的时间和去向】[\s\S]*【世界数据】/);
    const narration = mock.bodies[5].messages.at(-1).content as string;
    assert.match(narration, /【这一轮】从 07:3\d 写到/);
    assert.match(narration, /路上：.*号线/);
    assert.match(narration, /【这里的人】下午的咖啡馆，人不多。主角看得到的人：\n- s-/);
    assert.match(narration, /扎马尾的店员/);
    current = store.require<Chat>('chat', chat.id);
    const turn = (current.messages.at(-1)!.plugins?.tabletop as MessageData).world!;
    assert.equal(turn.after.at, place('衡梧路').id);
    data = swipeOf(current);
    const world = data.world!;
    assert.equal(data.settle?.status, undefined);
    assert.ok(world.ledger.some(l => l.reason === '一杯拿铁' && l.amount === -32));
    assert.ok(world.ledger.some(l => /地铁去衡梧路/.test(l.reason)));
    assert.equal(world.scene!.people[0].name, '扎马尾的店员');
    assert.ok(data.state!.characters['扎马尾的店员'], 'the barista is on the sheet now');
    assert.ok(data.state!.relations.some(r => r.from === '扎马尾的店员'), 'numbers in the settlement became her name');
    assert.ok(!Object.keys(data.state!.characters).some(n => /^[sb]-/.test(n)));
    assert.ok(world.commitments.some(c => c.name === '下午交方案' && c.expectations.length === 2));
    assert.ok(data.settle!.results.some(r => r.kind === 'world' && /一杯拿铁/.test(r.text)));

    // Swiping keeps the turn: no new ruling or scene, a new reply and settlement.
    await runtime.generate(chat.id, { type: 'swipe' }, () => {});
    assert.deepEqual(mock.calls.slice(7), ['reply', 'hearth_settle']);

    // The barista becomes a 重要人物, straight from the scene.
    current = store.require<Chat>('chat', chat.id);
    const barista = swipeOf(current).world!.scene!.people.find(p => p.role === 'staff')!;
    const promote = host.action('tabletop', 'world-promote')!;
    const out = await promote({ chat: current, character: store.require('character', current.characterId), preset: runtime.preset(current), payload: { sceneId: barista.id } });
    assert.equal(mock.calls.at(-1), 'hearth_profile');
    current = (await store.apply({ target: { kind: 'chat', id: chat.id }, ops: out!.ops!, author: 'plugin:tabletop', journal: false })).resource as Chat;
    assert.equal((current.plugins?.tabletop as any).world.important['许棠'].profile, '许棠的完整档案');
    assert.equal(swipeOf(current).world!.people['许棠'].kind, 'important');
    assert.ok(swipeOf(current).state!.characters['许棠']);

    // Sitting through nine: the boss notices and writes; the night passes and 许棠 lives her day.
    await runtime.generate(chat.id, { type: 'normal', text: '在咖啡馆一直坐到第二天早上' }, () => {});
    const act = mock.bodies[mock.calls.lastIndexOf('hearth_act')];
    assert.match(act.messages.at(-1).content, /【人物反应】[\s\S]*【王经理】[\s\S]*【王经理刚察觉到的事】/);
    const lateNarration = mock.bodies[mock.calls.lastIndexOf('reply')].messages.at(-1).content as string;
    assert.match(lateNarration, /王经理发来消息：人呢？/);
    assert.ok(mock.calls.includes('hearth_day'), 'the 重要人物 lived through the night');
    current = store.require<Chat>('chat', chat.id);
    const night = swipeOf(current).world!;
    assert.ok(night.pending.some(p => p.who === '许棠' && p.kind === 'deliver'), '许棠 will write tomorrow');
    assert.ok(swipeOf(current).state!.relations.find(r => r.from === '王经理')!.reasons.some(r => r.text === '没来上班'));
});

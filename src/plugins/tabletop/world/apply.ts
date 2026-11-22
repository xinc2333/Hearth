// Turning the model's answers into world data: the opening (hearth_setup), the scene (hearth_scene)
// and the world part of the settlement (hearth_settle). The model proposes; the program checks
// names against the map, keeps money from appearing from nowhere and records what changed.

import { hash } from './city/everyday.ts';
import { districtAt, type City, type Place } from './city/index.ts';
import { emptyAxes, newCharacter, type SettleLine, type TabletopState } from '../sheet.ts';
import { CORE_ATTRIBUTES, PROTAGONIST } from '../rules.ts';
import { registerPlace, extendTurn, modeOf } from './turn.ts';
import type { SceneArgs, SettleWorld } from './tools.ts';
import {
    addMessage, BODY_STATUS_NAMES, bodyStatuses, dateKey, findPlace, forecast, newId, parseTime, pay, placeById, clock,
    type Commitment, type Living, type PersonWorld, type Protagonist, type WorldState,
} from './state.ts';

export interface SetupForm {
    name: string;
    gender?: string;
    age?: number;
    job: Protagonist['job']['kind'];
    jobText?: string;
    /** District id or name; empty to let the model choose. */
    district?: string;
    about?: string;
    /** Start time, e.g. 2026-03-02 07:30. */
    start?: string;
}

export const DEFAULT_START = '2026-03-02 07:30';

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : undefined);
const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** A place the model named: on the map, or new near the place it says, or near the district's centre. */
function resolvePlace(world: WorldState, city: City, name: string, near: string, district: string | undefined, about: string): Place {
    const known = name ? findPlace(world, city, name) : undefined;
    if (known) return known;
    const anchor = (near && findPlace(world, city, near))
        || (district ? city.places.filter(p => p.landmark && p.district === district)[0] : undefined)
        || city.places[0];
    return registerPlace(world, city, name || '住处', anchor, about);
}

/** Places on the map the opening may choose from, so the model picks real ones. */
export function setupChoices(city: City, form: SetupForm): string {
    const district = city.districts.find(d => d.id === form.district || d.name === form.district);
    const inDistrict = (p: Place) => !district || p.district === district.id;
    const homes = city.places.filter(p => p.kind === 'residence' && inDistrict(p)).slice(0, 14).map(p => `${p.name}（${p.about}）`);
    const workKinds: Place['kind'][] = form.job === '学生' ? ['school'] : ['office', 'industry', 'shop', 'food', 'cafe', 'hospital', 'hotel', 'mall'];
    const works = city.places.filter(p => workKinds.includes(p.kind) && (p.landmark || inDistrict(p))).slice(0, 18).map(p => `${p.name}（${city.districts.find(d => d.id === p.district)?.name}，${p.about}）`);
    return [
        `住处可以选：${homes.join('；')}。也可以写新的小区名，并在 near 写附近的已知地点。`,
        `工作或上学的地方可以选：${works.join('；')}。也可以写新的单位名，并在 near 写附近的已知地点。`,
        `各区：${city.districts.map(d => `${d.name}（${d.about}）`).join('；')}`,
    ].join('\n');
}

/** The opening: the protagonist's life in 澜江市 as data. Returns the world and the 跑团 sheet to start from. */
export function applySetup(raw: unknown, form: SetupForm, city: City, seed: number): { world: WorldState; state: TabletopState; lines: string[] } {
    const args = isRecord(raw) ? raw : {};
    const start = parseTime(form.start || DEFAULT_START) ?? parseTime(DEFAULT_START)!;
    const district = city.districts.find(d => d.id === form.district || d.name === form.district)?.id;
    const living = (['节俭', '普通', '宽裕'].includes(str(args.living)) ? str(args.living) : '普通') as Living;
    const world: WorldState = {
        version: 1, seed, start, now: start, at: '',
        body: { full: 70, energy: 95, health: 100, awakeSince: start - 30 },
        balance: 0, ledger: [],
        me: { name: form.name || PROTAGONIST, job: { kind: form.job, title: form.jobText || form.job }, home: '', living, ...(modeOf(str(args.habit)) ? { habit: modeOf(str(args.habit)) } : {}) },
        commitments: [], people: {}, places: [], weather: [], scene: null, staff: {},
        phone: { contacts: [], messages: [] }, events: [], noted: [],
    };
    world.weather = forecast(world);
    const lines: string[] = [];

    // Home.
    const homeArgs = isRecord(args.home) ? args.home : {};
    const home = resolvePlace(world, city, str(homeArgs.place), str(homeArgs.near), district, '主角住的地方');
    world.me.home = home.id;
    world.at = home.id;
    lines.push(`住在${city.districts.find(d => d.id === home.district)?.name ?? ''} ${home.name}`);

    // The 跑团 sheet: the protagonist and the people around them.
    const state: TabletopState = { custom: {}, characters: {}, relations: [], bonds: [], turn: 0, log: [] };
    const me = newCharacter();
    const attrs = isRecord(args.attributes) ? args.attributes : {};
    for (const a of CORE_ATTRIBUTES) me.attributes[a] = clamp(Math.round(num(attrs[a]) ?? 100), 20, 400);
    const skills = isRecord(args.skills) ? args.skills : {};
    for (const [k, v] of Object.entries(skills)) if (str(v)) me.skills[k] = str(v);
    me.description = form.about || '';
    state.characters[PROTAGONIST] = me;

    const people = Array.isArray(args.people) ? args.people.filter(isRecord) : [];
    for (const p of people) {
        const name = str(p.name);
        if (!name || name === PROTAGONIST || state.characters[name]) continue;
        const c = newCharacter();
        const pa = isRecord(p.attributes) ? p.attributes : {};
        for (const a of CORE_ATTRIBUTES) c.attributes[a] = clamp(Math.round(num(pa[a]) ?? 100), 20, 400);
        const traits = isRecord(p.traits) ? p.traits : {};
        for (const t of ['敏感', '记仇', '多疑'] as const) if (num(traits[t]) !== undefined) c.traits[t] = clamp(num(traits[t])!, 0.5, 2);
        c.description = `${str(p.role)}，${str(p.gender)}，${num(p.age) ?? ''} 岁。${str(p.about)}`;
        state.characters[name] = c;
        const att = isRecord(p.attitude) ? p.attitude : {};
        const base = emptyAxes();
        for (const k of Object.keys(base) as (keyof typeof base)[]) base[k] = clamp(num(att[k]) ?? (k === 'trust' || k === 'affection' ? 40 : 0), 0, 100);
        state.relations.push({ from: name, to: PROTAGONIST, base, mood: emptyAxes(), familiarity: clamp(num(att.familiarity) ?? 50, 0, 100), reasons: [{ turn: 0, text: '开局时的关系', change: '' }] });
        const lives = str(p.lives);
        const livesHere = lives && !/^[^·]*?(省|市)$/.test(lives) ? findPlace(world, city, lives) : undefined;
        const person: PersonWorld = { kind: 'related', role: str(p.role), brief: str(p.about), ...(livesHere ? { home: livesHere.id } : {}) };
        world.people[name] = person;
        world.phone.contacts.push(name);
    }
    const byRole = (re: RegExp) => Object.entries(world.people).filter(([, p]) => re.test(p.role ?? '')).map(([n]) => n);

    // Work or school, and the commitment that comes with it.
    const job = isRecord(args.job) ? args.job : {};
    if (form.job !== '无业' && str(job.employer || job.place)) {
        const place = resolvePlace(world, city, str(job.place) || str(job.employer), str(job.near), district, str(job.employer));
        world.me.job.place = place.id;
        world.me.job.title = str(job.title) || world.me.job.title;
        const employer = str(job.employer) || place.name;
        const days = str(job.days) || '工作日';
        const from = /\d{1,2}:\d{2}/.test(str(job.from)) ? str(job.from) : form.job === '学生' ? '08:00' : '09:00';
        const to = /\d{1,2}:\d{2}/.test(str(job.to)) ? str(job.to) : form.job === '学生' ? '16:30' : '18:00';
        const income = Math.max(0, Math.round(num(job.income) ?? 0));
        const payday = clamp(Math.round(num(job.payday) ?? 10), 1, 28);
        const boss = byRole(/上司|经理|主管|老板|辅导员|班主任|导师/)[0];
        const family = byRole(/妈|爸|父|母|家/)[0];
        for (const n of byRole(/上司|经理|主管|老板|同事|辅导员|同学|老师/)) world.people[n] = { ...world.people[n], work: place.id, shift: `${days} ${from}–${to}` };
        const commitment: Commitment = {
            id: newId('c', seed), name: form.job === '学生' ? '学籍' : form.job === '自由职业' ? '合作约定' : '劳动合同',
            parties: [PROTAGONIST, employer], ...(boss ? { reps: { [employer]: boss } } : {}),
            expectations: form.job === '自由职业' ? [] : [{ kind: 'presence', who: PROTAGONIST, place: place.id, days, from, to }],
            norms: str(job.norms) || (form.job === '学生' ? '缺课会被辅导员找，缺得多了要处分。' : '迟到和缺勤按公司制度处理，具体看上司的态度。'),
            since: start, record: [],
        };
        if (income && form.job === '学生' && family) {
            commitment.expectations.push({ kind: 'payment', who: family, to: PROTAGONIST, amount: income, day: payday });
            commitment.parties.push(family);
        } else if (income && form.job !== '学生') {
            commitment.expectations.push({ kind: 'payment', who: employer, to: PROTAGONIST, amount: income, day: payday });
        }
        if (commitment.expectations.length) world.commitments.push(commitment);
        lines.push(`${employer} · ${world.me.job.title}${form.job === '自由职业' ? '' : `（${days} ${from}–${to}）`}${income ? `，每月 ${income} 元` : ''}`);
    }
    // Rent.
    const rent = Math.max(0, Math.round(num(homeArgs.rent) ?? 0));
    const landlord = byRole(/房东/)[0];
    if (rent && landlord) {
        world.commitments.push({
            id: newId('c', seed), name: '租房合同', parties: [PROTAGONIST, landlord],
            expectations: [{ kind: 'payment', who: PROTAGONIST, to: landlord, amount: rent, day: clamp(Math.round(num(homeArgs.rent_day) ?? 1), 1, 28) }],
            norms: str(homeArgs.norms) || '房租晚交几天一般会催，拖久了会要求搬走。',
            since: start, record: [],
        });
        lines.push(`房租每月 ${rent} 元`);
    }
    world.balance = Math.max(0, Math.round(num(args.balance) ?? 3000));
    world.ledger.push({ at: start, amount: world.balance, reason: '开局时的积蓄', balance: world.balance });
    lines.push(`余额 ${world.balance} 元，生活${living}`);
    return { world, state, lines };
}

/** The scene step's descriptions, onto the scene's people. */
export function applyScene(world: WorldState, args: SceneArgs) {
    if (!world.scene) return;
    if (args.crowd) world.scene.crowd = args.crowd;
    for (const p of world.scene.people) {
        const d = args.people.find(x => x.id === p.id);
        if (!d) continue;
        p.looks = d.looks;
        if (d.doing) p.doing = d.doing;
        if (d.where) p.where = d.where;
        // Staff look the same next time.
        if (p.role === 'staff') {
            const kept = world.staff[world.scene.place]?.find(s => s.id === p.id);
            if (kept) Object.assign(kept, { looks: p.looks });
        }
    }
}

/** The body's statuses on the protagonist's 跑团 sheet (困倦 and the like), replacing the old ones. */
export function syncBody(state: TabletopState, world: WorldState) {
    const me = state.characters[PROTAGONIST];
    if (!me) return;
    me.status = me.status.filter(s => !BODY_STATUS_NAMES.includes(s.name));
    for (const s of bodyStatuses(world.body)) {
        me.status.push({ name: s.name, effects: Object.fromEntries(CORE_ATTRIBUTES.map(a => [a, s.factor])), note: '身体' });
    }
}

const line = (text: string, ok = true): SettleLine => ({ line: text, ok, text, kind: 'world' });

/** The world part of the settlement. Changes `world` (and `state` for people met) and says what came of each item. */
export function applySettleWorld(world: WorldState, state: TabletopState, city: City, sw: SettleWorld): SettleLine[] {
    const out: SettleLine[] = [];
    if (sw.extraMinutes > 0) {
        extendTurn(world, city, sw.extraMinutes);
        out.push(line(`时间多过了 ${Math.round(sw.extraMinutes)} 分钟，现在 ${clock(world.now)}`));
    }
    if (sw.ate) world.body = { ...world.body, full: Math.min(100, world.body.full + (sw.ate === '正餐' ? 55 : 20)) };
    for (const m of sw.money) {
        const ok = pay(world, m.amount, m.reason);
        out.push(line(ok ? `${m.amount > 0 ? '+' : ''}${m.amount} 元（${m.reason}）` : `钱不够：${m.reason}（${m.amount} 元）`, ok));
    }
    for (const m of sw.moves) {
        const place = findPlace(world, city, m.to) ?? registerPlace(world, city, m.to, placeById(world, city, world.at));
        world.people[m.who] = { ...(world.people[m.who] ?? { kind: 'bystander' }), at: place.id, seenAt: world.now };
    }
    for (const c of sw.commitments) {
        const at = c.at ? parseTime(c.at) : null;
        const place = c.place ? findPlace(world, city, c.place) ?? registerPlace(world, city, c.place, placeById(world, city, world.at)) : undefined;
        const end = at ? at + 120 : null;
        const hhmm = (t: number) => clock(t);
        const commitment: Commitment = {
            id: newId('c', world.seed), name: c.what, parties: [PROTAGONIST, c.with],
            expectations: at && place ? [
                { kind: 'presence', who: PROTAGONIST, place: place.id, days: dateKey(at), from: hhmm(at), to: hhmm(end!) },
                { kind: 'presence', who: c.with, place: place.id, days: dateKey(at), from: hhmm(at), to: hhmm(end!) },
            ] : [],
            norms: '约好的事没做到，对方会失望或生气，看两人的关系和对方的性格。',
            since: world.now, record: [],
        };
        world.commitments.push(commitment);
        out.push(line(`新约定：${c.what}（和${c.with}${at ? `，${dateKey(at)} ${hhmm(at)}` : ''}${place ? `，${place.name}` : ''}）`));
    }
    for (const name of sw.done) {
        const c = world.commitments.find(x => !x.ended && (x.name === name || x.name.includes(name) || name.includes(x.name)));
        if (!c) continue;
        c.record.push({ at: world.now, text: '完成' });
        if (!c.expectations.some(e => e.kind === 'presence' && !/^\d{4}-/.test(e.days)) && !c.expectations.some(e => e.kind === 'payment')) c.ended = world.now;
        out.push(line(`约定完成：${c.name}`));
    }
    for (const m of sw.messages) addMessage(world, { at: world.now, from: PROTAGONIST, to: m.to, text: m.text, read: true });
    for (const n of sw.contacts) if (!world.phone.contacts.includes(n)) {
        world.phone.contacts.push(n);
        out.push(line(`存了${n}的联系方式`));
    }
    for (const m of sw.met) {
        const p = world.scene?.people.find(x => x.id === m.id);
        if (!p) continue;
        p.name = m.name;
        world.people[m.name] = { ...(world.people[m.name] ?? { kind: 'bystander' }), brief: p.looks ?? world.people[m.name]?.brief, at: world.scene!.place, seenAt: world.now };
        if (!state.characters[m.name]) {
            const c = newCharacter();
            c.description = [p.looks, p.role === 'staff' ? `这里的${p.purpose}` : ''].filter(Boolean).join('，');
            c.temporary = true;
            state.characters[m.name] = c;
        }
    }
    for (const p of sw.places) {
        if (findPlace(world, city, p.name)) continue;
        const near = p.near ? findPlace(world, city, p.near) : placeById(world, city, world.at);
        const place = registerPlace(world, city, p.name, near, p.about ?? '');
        out.push(line(`地图上加了${place.name}（${city.districts.find(d => d.id === (districtAt(city, place.at)?.id ?? ''))?.name ?? ''}）`));
    }
    return out;
}

export const worldSeed = (chatId: string) => hash(chatId);

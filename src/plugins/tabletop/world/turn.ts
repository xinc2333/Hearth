// One turn of world time (docs/world.md §2): the ruling says how long the turn takes and where the
// protagonist goes; the program moves them, runs the clock over that span (body, money, the day's
// weather, commitments) and works out who is at the place they end up. Nothing here asks the model.

import { hash, rng } from './city/everyday.ts';
import { districtAt, type City, type Place } from './city/index.ts';
import { bestTrip, MODE_LABEL, trip, type Mode, type Trip } from './route.ts';
import { deliverDue, followRoutines, timeAt } from './minds.ts';
import { updateScene } from './scene.ts';
import {
    addEvent, advanceBody, clock, DAILY_COST, dateKey, dayMatches, fmtWeather, forecast, isWorkday, midnight, minutesOf, moment, note,
    parseTime, pay, placeById, findPlace, type Activity, type Bystander, type Commitment, type Expectation, type WorldEvent, type WorldState,
} from './state.ts';

/** What the ruling says about this turn's time and movement (the hearth_check tool's world part). */
export interface TurnAsk {
    minutes?: number;
    /** An explicit end, e.g. 2026-03-03 07:00 (sleeping, skipping time). */
    until?: string;
    activity?: Activity;
    /** The protagonist keeps to their usual routine while time is skipped. */
    routine?: boolean;
    /** `leave`: when the protagonist sets off (HH:MM); until then they stay where they are. */
    move?: { to: string; by?: string; with?: string[]; leave?: string };
}

export interface TurnPlan {
    from: number;
    to: number;
    /** Where the protagonist went, and how. */
    move?: { from: string; to: string; trip: Pick<Trip, 'mode' | 'minutes' | 'cost' | 'legs'>; with: string[]; newPlace?: boolean };
    /** What happened during the turn, in order. */
    events: WorldEvent[];
    /** People in the scene who still need describing. */
    fresh: string[];
    /** Time was skipped (longer than a normal turn). */
    skipped: boolean;
}

/** Longest ordinary turn; longer spans need an explicit end (sleep, skipping time). */
export const MAX_TURN = 180;
/** Longest skip. */
export const MAX_SKIP = 30 * 1440;

const MODES: Record<string, Mode> = { 步行: 'walk', 走路: 'walk', 骑车: 'bike', 单车: 'bike', 地铁: 'metro', 公交: 'bus', 打车: 'taxi', 出租车: 'taxi', 网约车: 'taxi', 开车: 'drive' };

export function modeOf(by: string | undefined): Mode | undefined {
    if (!by) return undefined;
    const hit = Object.entries(MODES).find(([word]) => by.includes(word));
    return hit?.[1];
}

/** A place the story names that the map does not have: put it near where it is said to be. */
export function registerPlace(world: WorldState, city: City, name: string, near: Place | undefined, about = ''): Place {
    const rand = rng(hash(`${world.seed}|${name}`));
    const base = near?.at ?? placeById(world, city, world.at)?.at ?? [0, 0];
    const a = rand() * Math.PI * 2;
    const d = 0.08 + rand() * 0.25;
    const at: [number, number] = [Math.round((base[0] + Math.cos(a) * d) * 1000) / 1000, Math.round((base[1] + Math.sin(a) * d) * 1000) / 1000];
    const kind: Place['kind'] = /咖啡/.test(name) ? 'cafe' : /酒吧|酒馆/.test(name) ? 'bar' : /餐|面|饭|馆|烧烤|火锅/.test(name) ? 'food'
        : /超市|便利|店/.test(name) ? 'shop' : /公园/.test(name) ? 'park' : /医院|诊所/.test(name) ? 'hospital' : /小区|公寓|新村|家|住处|花园|苑/.test(name) ? 'residence'
            : /公司|大厦|中心|广告|传媒|科技|集团|事务所|工作室|设计/.test(name) ? 'office' : 'sight';
    const place: Place = {
        id: `x${(hash(`${world.seed}|${name}|${world.places.length}`) % 1e8).toString(36)}`,
        name, kind, at,
        district: districtAt(city, at)?.id ?? near?.district ?? '',
        hours: kind === 'bar' ? '19:00–02:00' : kind === 'residence' || kind === 'park' ? '全天' : '09:00–22:00',
        about, landmark: false,
    };
    world.places.push(place);
    return place;
}

/** Where the protagonist is at a moment of the turn: null while travelling. */
type Where = (t: number) => string | null;

/** Where the protagonist should be at `t` by their commitments (used while keeping to the routine). */
function expectedPlace(world: WorldState, t: number): string | null {
    for (const c of world.commitments) {
        if (c.ended) continue;
        for (const e of c.expectations) {
            if (e.kind !== 'presence' || e.who !== '主角' || !dayMatches(e.days, t)) continue;
            const m = moment(t).minute;
            if (m >= minutesOf(e.from) && m < minutesOf(e.to)) return e.place;
        }
    }
    return null;
}

const counterpart = (c: Commitment, who: string) => c.parties.filter(p => p !== who).map(p => c.reps?.[p] ?? p);

/** Commitments due in (from, to]: presence the protagonist misses, payments, deadlines. */
function runCommitments(world: WorldState, city: City, from: number, to: number, where: Where): WorldEvent[] {
    const out: WorldEvent[] = [];
    for (let day = midnight(from); day <= to; day += 1440) {
        for (const c of world.commitments) {
            if (c.ended) continue;
            c.expectations.forEach((e: Expectation, i) => {
                if (e.kind === 'presence' && e.who === '主角') {
                    const t = day + minutesOf(e.from);
                    if (t <= from || t > to || !dayMatches(e.days, t)) return;
                    const at = where(t + 1);
                    if (at === e.place || !note(world, `${c.id}|${i}|${dateKey(t)}`)) return;
                    const place = placeById(world, city, e.place)?.name ?? e.place;
                    const who = counterpart(c, '主角');
                    // The people on the other side who are there notice a little later.
                    for (const w of who) if (world.people[w]) world.pending.push({ at: t + 15, who: w, kind: 'notice', what: `按${c.name}，主角 ${e.from} 应该在${place}（${e.days} ${e.from}–${e.to}），到 ${clock(t + 15)} 还没来` });
                    out.push({ at: t, kind: 'lapse', seen: true, text: `${clock(t)} ${c.name}：主角这时应该在${place}（${e.days} ${e.from}–${e.to}），但不在。${who.length ? `${who.join('、')}会察觉，怎么反应主角现在还不知道。` : ''}` });
                } else if (e.kind === 'payment') {
                    if (moment(day).d !== e.day) return;
                    const t = day + 9 * 60;
                    if (t <= from || t > to || !note(world, `${c.id}|${i}|${dateKey(t)}`)) return;
                    if (e.who === '主角') {
                        if (pay(world, -e.amount, `${c.name}`, t)) out.push({ at: t, kind: 'money', seen: true, text: `${clock(t)} 按${c.name}付给${counterpart(c, '主角').join('、')} ${e.amount} 元` });
                        else {
                            out.push({ at: t, kind: 'lapse', seen: true, text: `${clock(t)} ${c.name}：该付 ${e.amount} 元，余额不够，没付上。${counterpart(c, '主角').join('、')}会察觉。` });
                            for (const w of counterpart(c, '主角')) if (world.people[w]) world.pending.push({ at: t + 60, who: w, kind: 'notice', what: `按${c.name}今天该收到主角 ${e.amount} 元，没收到` });
                        }
                    } else if (e.to === '主角') {
                        // Deductions the other side decided since the last payment come off.
                        const last = c.record.filter(r => r.text.startsWith('已付')).at(-1)?.at ?? c.since;
                        const off = c.record.filter(r => r.at > last && r.text.startsWith('扣款')).reduce((s, r) => s + Number(/扣款 (\d+)/.exec(r.text)?.[1] ?? 0), 0);
                        const amount = Math.max(0, e.amount - off);
                        pay(world, amount, `${c.name}（${e.who}）`, t);
                        c.record.push({ at: t, text: `已付 ${amount} 元${off ? `（扣了 ${off} 元）` : ''}` });
                        out.push({ at: t, kind: 'money', seen: true, text: `${clock(t)} 收到${e.who}按${c.name}付的 ${amount} 元${off ? `（扣了 ${off} 元）` : ''}` });
                    }
                } else if (e.kind === 'deadline' && e.who === '主角') {
                    if (e.by <= from || e.by > to || c.record.some(r => r.text.startsWith('完成')) || !note(world, `${c.id}|${i}`)) return;
                    for (const w of counterpart(c, '主角')) if (world.people[w]) world.pending.push({ at: e.by + 10, who: w, kind: 'notice', what: `主角答应在 ${clock(e.by)} 前${e.what}，没做到` });
                    out.push({ at: e.by, kind: 'lapse', seen: false, text: `${clock(e.by)} ${c.name}：说好在这之前做完「${e.what}」，没做完。${counterpart(c, '主角').join('、')}会察觉。` });
                }
            });
        }
    }
    return out;
}

/** Every midnight in (from, to]: the day's living costs and the new forecast. */
function runDays(world: WorldState, from: number, to: number): WorldEvent[] {
    const out: WorldEvent[] = [];
    for (let day = midnight(from) + 1440; day <= to; day += 1440) {
        const cost = DAILY_COST[world.me.living];
        if (!pay(world, -cost, '日常开销（吃饭和日用）', day)) {
            out.push({ at: day, kind: 'money', seen: true, text: `${dateKey(day)} 钱不够这一天的日常开销了` });
        }
    }
    return out;
}

/**
 * Runs the world over this turn. Returns the plan (for the narration and the record) and changes
 * `world` in place: the clock, the protagonist's place, body, money, commitments and the scene.
 */
export function playTurn(world: WorldState, city: City, ask: TurnAsk): TurnPlan {
    const from = world.now;
    const events: WorldEvent[] = [];
    const startPlace = world.at;
    let move: TurnPlan['move'];
    let travel = 0;
    // Setting off later: stay where they are until then.
    const leave = ask.move?.leave ? Math.min(from + MAX_TURN * 4, timeAt(ask.move.leave, from)) : from;
    // Movement first: the trip's time and fare.
    if (ask.move?.to) {
        const here = placeById(world, city, world.at);
        let dest = findPlace(world, city, ask.move.to);
        let newPlace = false;
        if (!dest) {
            dest = registerPlace(world, city, ask.move.to.replace(/^.*[·・]\s*/, ''), here);
            newPlace = true;
        }
        if (dest.id !== world.at && here) {
            const when = { minute: moment(leave).minute, workday: isWorkday(leave) };
            const asked = modeOf(ask.move.by);
            let t = asked ? trip(city, here.at, dest.at, asked, when) : bestTrip(city, here.at, dest.at, when, world.me.habit);
            if (!t.ok) t = bestTrip(city, here.at, dest.at, when);
            if (t.cost && !pay(world, -t.cost, `${MODE_LABEL[t.mode]}去${dest.name}`, leave)) {
                events.push({ at: leave, kind: 'money', seen: true, text: `钱不够${MODE_LABEL[t.mode]}，只能走过去` });
                t = trip(city, here.at, dest.at, 'walk', when);
            }
            travel = t.minutes;
            move = { from: world.at, to: dest.id, trip: { mode: t.mode, minutes: t.minutes, cost: t.cost, legs: t.legs }, with: ask.move.with ?? [], newPlace };
            events.push({ at: leave + travel, kind: 'move', seen: true, text: `${clock(leave)} 出发，${clock(leave + travel)} 到了${dest.name}（${t.legs.join('，')}${t.cost ? `，花了 ${t.cost} 元` : ''}）` });
        }
    }
    // How long the turn lasts.
    const until = ask.until ? parseTime(ask.until) : null;
    const arrive = leave + travel;
    let to = until && until > from ? Math.min(until, from + MAX_SKIP) : arrive + Math.max(1, Math.min(MAX_TURN, Math.round(ask.minutes ?? 10)));
    to = Math.max(to, arrive + 1);
    const skipped = to - from > MAX_TURN + (arrive - from);
    const dest = move?.to ?? world.at;
    const origin = world.at;
    const where: Where = t => (ask.routine && skipped ? expectedPlace(world, t) ?? world.me.home : t < leave ? origin : t < arrive ? null : dest);

    events.push(...runDays(world, from, to));
    events.push(...runCommitments(world, city, from, to, where));
    events.push(...deliverDue(world, to));
    followRoutines(world, to);
    // The body: sleep when asked, the usual day when keeping to the routine.
    const before = world.body;
    if (ask.routine && skipped) {
        world.body = { ...world.body, full: 65, energy: moment(to).hh < 12 ? 90 : 55, awakeSince: midnight(to) + 7 * 60 };
    } else {
        world.body = advanceBody(world.body, to - from, ask.activity ?? '日常', to);
    }
    // Signals when the body crosses a line, once.
    if (before.full >= 30 && world.body.full < 30) events.push({ at: to, kind: 'body', seen: true, text: '主角饿了' });
    if (before.energy >= 30 && world.body.energy < 30) events.push({ at: to, kind: 'body', seen: true, text: '主角困了' });
    world.now = to;
    world.at = ask.routine && skipped ? where(to) ?? dest : dest;
    world.weather = forecast(world);
    if (move?.with.length) for (const name of move.with) if (world.people[name]) world.people[name] = { ...world.people[name], at: world.at, seenAt: to };
    events.sort((a, b) => a.at - b.at);
    for (const e of events) addEvent(world, e);
    // Who is here now.
    const place = placeById(world, city, world.at);
    let fresh: Bystander[] = [];
    if (place) {
        const next = updateScene(world, place, to);
        world.scene = next.scene;
        fresh = next.fresh;
    }
    if (startPlace !== world.at && skipped) events.push({ at: to, kind: 'note', seen: true, text: `跳过了一段时间，现在是 ${dateKey(to)} ${clock(to)}，${fmtWeather(world.weather[0])}` });
    return { from, to, move, events, fresh: fresh.map(p => p.id), skipped };
}

/** Moves on the clock after the narration ran longer than planned (the settlement's extra minutes). */
export function extendTurn(world: WorldState, city: City, minutes: number): WorldEvent[] {
    const from = world.now;
    const to = from + Math.max(0, Math.min(12 * 60, Math.round(minutes)));
    if (to === from) return [];
    const events = [...runDays(world, from, to), ...runCommitments(world, city, from, to, () => world.at), ...deliverDue(world, to)];
    followRoutines(world, to);
    world.body = advanceBody(world.body, to - from, '日常', to);
    world.now = to;
    world.weather = forecast(world);
    for (const e of events) addEvent(world, e);
    return events;
}

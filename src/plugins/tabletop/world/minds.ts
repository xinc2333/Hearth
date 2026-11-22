// 心智 and 认知 (docs/world.md §1, §7–§9): what people notice, what they know, and what they decide.
// The program decides who notices what and carries out what they do (a message needs a phone, money
// moves between accounts); the model decides, one person per request, what that person does.

import { hash, rng } from './city/everyday.ts';
import type { City } from './city/index.ts';
import { describe, findRelation } from '../attitude.ts';
import { AXES, AXIS_LABEL, relationValue, type TabletopState } from '../sheet.ts';
import { PROTAGONIST } from '../rules.ts';
import { registerPlace } from './turn.ts';
import { parseJson } from './tools.ts';
import {
    addMessage, clock, dateKey, findPlace, fmtNow, learn, minutesOf, newId, parseTime, pay, placeById, routinePlace,
    type Commitment, type Pair, type Pending, type PersonWorld, type Slot, type WorldEvent, type WorldState,
} from './state.ts';

export const ACT_TOOL_NAME = 'hearth_act';
export const DAY_TOOL_NAME = 'hearth_day';
export const PROFILE_TOOL_NAME = 'hearth_profile';

/** At most this many 重要人物. */
export const MAX_IMPORTANT = 8;

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^\s*[+-]?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : undefined);
const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const list = (v: unknown) => (Array.isArray(v) ? v : []);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** People who decide for themselves: everyone the world tracks except passers-by. */
export const hasMind = (world: WorldState, who: string) => ['related', 'important'].includes(world.people[who]?.kind ?? '');

/** A time the model wrote, HH:MM or a full date and time, as minutes no earlier than `after`. */
export function timeAt(text: string, after: number): number {
    const full = parseTime(text);
    if (full) return Math.max(full, after);
    const m = /(\d{1,2}):(\d{2})/.exec(text);
    if (!m) return after;
    const t = Math.floor(after / 1440) * 1440 + minutesOf(`${m[1]}:${m[2]}`);
    // A moment just past means now; one long past means the same time tomorrow.
    if (t < after) return after - t < 60 ? after : t + 1440;
    return t;
}

// ---------------------------------------------------------------------------------------------
// Noticing and delivering
// ---------------------------------------------------------------------------------------------

/** Takes the notices due by `to`, grouped by who notices them. */
export function takeNotices(world: WorldState, to: number): Map<string, Pending[]> {
    const due = new Map<string, Pending[]>();
    world.pending = world.pending.filter(p => {
        if (p.kind !== 'notice' || p.at > to) return true;
        if (!hasMind(world, p.who)) return false;
        (due.get(p.who) ?? due.set(p.who, []).get(p.who)!).push(p);
        return false;
    });
    return due;
}

/** Hands over the messages and calls due by `to`. Returns what the protagonist sees. */
export function deliverDue(world: WorldState, to: number): WorldEvent[] {
    const out: WorldEvent[] = [];
    world.pending = world.pending.filter(p => {
        if (p.kind !== 'deliver' || p.at > to || !p.message) return true;
        const { to: target, text, call } = p.message;
        addMessage(world, { at: p.at, from: p.who, to: target, text: call ? `（打来电话）${text}` : text, read: target !== PROTAGONIST });
        if (target === PROTAGONIST) {
            out.push({ at: p.at, kind: 'message', seen: true, text: call ? `${clock(p.at)} ${p.who}打来电话（${text}）` : `${clock(p.at)} ${p.who}发来消息：${text}` });
            if (world.people[p.who]) world.people[p.who].lastContact = p.at;
        } else {
            // Another character gets it: they know, and may answer.
            learn(world, target, `${p.who}${call ? '打电话说' : '发消息说'}：${text}`, '听说', p.at);
            world.pending.push({ at: p.at + 10, who: target, kind: 'notice', what: `${p.who}${call ? '打来电话' : '发来消息'}：「${text}」` });
        }
        return false;
    });
    return out;
}

/** Moves everyone with a routine to where their week puts them at `t` (unless the story put them elsewhere just now). */
export function followRoutines(world: WorldState, t: number) {
    for (const [name, p] of Object.entries(world.people)) {
        if (p.kind === 'bystander') continue;
        if (p.seenAt && t - p.seenAt < 120) continue;
        const slot = routinePlace(p, t);
        if (slot) p.at = slot.place;
    }
    // Commitments with a place and time move the people in them there.
    for (const c of world.commitments) {
        if (c.ended) continue;
        for (const e of c.expectations) {
            if (e.kind !== 'presence' || e.who === PROTAGONIST || !world.people[e.who] || !/^\d{4}-/.test(e.days) || e.days !== dateKey(t)) continue;
            const m = t % 1440;
            if (m >= minutesOf(e.from) && m < minutesOf(e.to)) world.people[e.who].at = e.place;
        }
    }
}

/** Known people at a place right now (for the scene). */
export function knownHere(world: WorldState, place: string): string[] {
    return Object.entries(world.people).filter(([, p]) => p.kind !== 'bystander' && p.at === place).map(([n]) => n);
}

// ---------------------------------------------------------------------------------------------
// What a person brings to a request
// ---------------------------------------------------------------------------------------------

export interface ImportantProfile {
    profile: string;
    summary: string;
    since: number;
}

function attitudeLine(state: TabletopState, who: string): string {
    const rel = findRelation(state, who, PROTAGONIST);
    if (!rel) return '对主角还没有什么看法';
    const values = AXES.map(([axis, label]) => `${label}${Math.round(relationValue(rel, axis))}`).join(' ');
    const why = rel.reasons.slice(-3).map(r => r.text).join('；');
    return `${describe(rel)}（${values} 熟悉${Math.round(rel.familiarity)}）${why ? `，最近：${why}` : ''}`;
}

/** Everything about one person, from their side: for their reaction or their day. */
export function personText(world: WorldState, city: City, state: TabletopState, who: string, profile?: ImportantProfile, full = false): string {
    const p = world.people[who] ?? ({ kind: 'related' } as PersonWorld);
    const sheet = state.characters[who];
    const place = placeById(world, city, p.at);
    const lines = [
        `【${who}】${p.role ? `${p.role}。` : ''}${profile ? (full ? `\n${profile.profile}` : profile.summary) : p.brief ?? sheet?.description ?? ''}`,
        sheet ? `性格系数：敏感 ${sheet.traits.敏感} 记仇 ${sheet.traits.记仇} 多疑 ${sheet.traits.多疑}` : '',
        p.mood !== undefined ? `心情 ${Math.round(p.mood)}（平常 50）　压力 ${Math.round(p.stress ?? 30)}${p.recent ? `　近况：${p.recent}` : ''}` : '',
        `现在：${fmtNow(world)}，${place ? `在${place.name}` : '在哪不清楚'}`,
        `对主角：${attitudeLine(state, who)}`,
    ];
    const pairs = world.pairs.filter(x => x.from === who);
    if (pairs.length) lines.push(`对其他人：${pairs.map(x => `${x.to}（亲近${x.axes.affection ?? 0} 信任${x.axes.trust ?? 0} 怨恨${x.axes.resentment ?? 0}）`).join('、')}`);
    const commitments = world.commitments.filter(c => !c.ended && (c.parties.includes(who) || Object.values(c.reps ?? {}).includes(who)));
    if (commitments.length) {
        lines.push('相关的约定：');
        for (const c of commitments) lines.push(`- ${c.name}（${c.parties.join('、')}）：${describeExpectations(world, city, c)}。惯例：${c.norms}${c.record.length ? `。记录：${c.record.slice(-4).map(r => `${dateKey(r.at)} ${r.text}`).join('；')}` : ''}`);
    }
    const known = world.knowledge[who] ?? [];
    if (world.memory[who]) lines.push(`以前的事：${world.memory[who]}`);
    lines.push(known.length ? `${who}知道的事（只有这些；聊天记录里${who}不在场的部分，${who}不知道）：` : `${who}对主角最近的事一无所知（聊天记录里${who}不在场的部分，${who}不知道）。`);
    for (const k of known.slice(-15)) lines.push(`- ${dateKey(k.at).slice(5)} ${clock(k.at)} ${k.text}（${k.source}）`);
    return lines.filter(Boolean).join('\n');
}

function describeExpectations(world: WorldState, city: City, c: Commitment): string {
    return c.expectations.map(e => {
        if (e.kind === 'presence') return `${e.who === PROTAGONIST ? '主角' : e.who} ${e.days} ${e.from}–${e.to} 在${placeById(world, city, e.place)?.name ?? e.place}`;
        if (e.kind === 'payment') return `${e.who === PROTAGONIST ? '主角' : e.who}每月 ${e.day} 日付 ${e.amount} 元给${e.to === PROTAGONIST ? '主角' : e.to}`;
        return `${e.who === PROTAGONIST ? '主角' : e.who}在 ${dateKey(e.by)} ${clock(e.by)} 前${e.what}`;
    }).join('；') || '没有具体的时间';
}

// ---------------------------------------------------------------------------------------------
// Reacting (hearth_act)
// ---------------------------------------------------------------------------------------------

const axisProps = Object.fromEntries([...AXES.map(([axis, label]) => [axis, { type: 'number', description: `${label}的变化` }]), ['familiarity', { type: 'number', description: '熟悉的变化' }]]);

export function actTool() {
    return {
        type: 'function',
        function: {
            name: ACT_TOOL_NAME,
            description: '人物反应：替这个人决定，他察觉到这些事以后会怎么想、做什么。',
            parameters: {
                type: 'object',
                properties: {
                    think: { type: 'string', description: '他怎么看这件事，一两句' },
                    actions: {
                        type: 'array',
                        description: '他要做的事，按时间先后；什么都不做就留空',
                        items: {
                            type: 'object',
                            properties: {
                                do: { type: 'string', enum: ['message', 'call', 'move', 'pay', 'commit', 'end', 'tell', 'wait', 'note'], description: 'message 发消息，call 打电话，move 去别处，pay 收钱付钱或扣钱，commit 和人约定或修改约定，end 解除约定，tell 告诉别人，wait 过一阵再看，note 记一笔（例如记旷工）' },
                                at: { type: 'string', description: '什么时候做，HH:MM 或 2026-03-02 10:00；不早于他察觉的时间' },
                                to: { type: 'string', description: '对谁（message、call、tell、pay），或去哪（move）' },
                                text: { type: 'string', description: '消息或电话的原话（用他自己的口吻）；tell 时写告诉了什么；note 时写记下的事' },
                                amount: { type: 'number', description: 'pay：给对方钱写正数，扣对方的钱写负数' },
                                what: { type: 'string', description: 'commit：约了什么；end：解除哪个约定（写约定的名字）' },
                                place: { type: 'string', description: 'commit：在哪' },
                                time: { type: 'string', description: 'commit：什么时候，2026-03-06 19:00' },
                            },
                            required: ['do'],
                        },
                    },
                    feelings: { type: 'object', properties: { ...axisProps, reason: { type: 'string' } }, description: '这件事让他对主角的态度怎样变了（没变就不写）' },
                    learned: { type: 'array', items: { type: 'string' }, description: '他新知道或推测出的事' },
                },
                required: ['actions'],
            },
        },
    };
}

export interface ActResult {
    events: WorldEvent[];
    /** Attitude changes toward the protagonist, for the 跑团 sheet. */
    feelings?: Record<string, unknown>;
}

/** Carries out what the person decided. Messages to the protagonist inside the turn are seen now; later ones wait. */
export function applyAct(world: WorldState, city: City, who: string, raw: unknown, after: number, turnEnd: number): ActResult {
    const args = isRecord(raw) ? raw : {};
    const events: WorldEvent[] = [];
    for (const a of list(args.actions).filter(isRecord)) {
        const kind = str(a.do);
        const at = timeAt(str(a.at), after);
        const to = str(a.to);
        const text = str(a.text);
        if ((kind === 'message' || kind === 'call') && to && text) {
            world.pending.push({ at, who, kind: 'deliver', what: text, message: { to: to === '主角' || to === world.me.name ? PROTAGONIST : to, text, call: kind === 'call' } });
        } else if (kind === 'move' && to) {
            const place = findPlace(world, city, to) ?? registerPlace(world, city, to, placeById(world, city, world.people[who]?.at));
            world.people[who] = { ...(world.people[who] ?? { kind: 'related' }), at: place.id, seenAt: at };
            events.push({ at, kind: 'note', seen: false, text: `${clock(at)} ${who}去了${place.name}` });
        } else if (kind === 'pay') {
            const amount = num(a.amount) ?? 0;
            if (!amount) continue;
            const c = world.commitments.find(x => !x.ended && (x.parties.includes(who) || Object.values(x.reps ?? {}).includes(who)) && x.expectations.some(e => e.kind === 'payment'));
            if (amount < 0 && c) {
                // A deduction comes off the next payment to the protagonist.
                c.record.push({ at, text: `扣款 ${-amount} 元：${text || str(a.what)}` });
                events.push({ at, kind: 'money', seen: false, text: `${clock(at)} ${who}决定扣主角 ${-amount} 元（${text || c.name}）` });
            } else if (amount > 0 && (to === '主角' || !to)) {
                pay(world, amount, `${who}转来`, at);
                events.push({ at, kind: 'money', seen: true, text: `${clock(at)} 收到${who}转来的 ${amount} 元` });
            }
        } else if (kind === 'commit' && str(a.what)) {
            const time = str(a.time) ? parseTime(str(a.time)) : null;
            const place = str(a.place) ? findPlace(world, city, str(a.place)) ?? registerPlace(world, city, str(a.place), placeById(world, city, world.people[who]?.at)) : undefined;
            const other = to || PROTAGONIST;
            if (other !== PROTAGONIST && !world.people[other]) world.people[other] = { kind: 'related', brief: `${who}找来的人`, seenAt: at };
            world.commitments.push({
                id: newId('c', world.seed), name: str(a.what), parties: [who, other],
                expectations: time && place ? [other, who].map(w => ({ kind: 'presence' as const, who: w, place: place.id, days: dateKey(time), from: clock(time), to: clock(time + 120) })) : [],
                norms: '约好的事没做到，对方会失望或生气。', since: at, record: [],
            });
            events.push({ at, kind: 'note', seen: other === PROTAGONIST, text: `${clock(at)} ${who}和${other === PROTAGONIST ? '主角' : other}约定：${str(a.what)}` });
        } else if (kind === 'end' && str(a.what)) {
            const c = world.commitments.find(x => !x.ended && x.parties.includes(PROTAGONIST) && (x.name.includes(str(a.what)) || str(a.what).includes(x.name)) && (x.parties.includes(who) || Object.values(x.reps ?? {}).includes(who)));
            if (c) {
                c.ended = at;
                c.record.push({ at, text: `${who}解除：${text}` });
                events.push({ at, kind: 'note', seen: false, text: `${clock(at)} ${who}解除了${c.name}` });
            }
        } else if (kind === 'tell' && to && text) {
            learn(world, to, `${who}说：${text}`, '听说', at);
            if (hasMind(world, to)) world.pending.push({ at: at + 5, who: to, kind: 'notice', what: `${who}告诉你：${text}` });
        } else if (kind === 'wait') {
            world.pending.push({ at: Math.max(at, after + 30), who, kind: 'notice', what: text || '再看看主角那边的情况' });
        } else if (kind === 'note' && text) {
            const c = world.commitments.find(x => !x.ended && (x.parties.includes(who) || Object.values(x.reps ?? {}).includes(who)) && x.parties.includes(PROTAGONIST));
            if (c) c.record.push({ at, text });
        }
    }
    for (const l of list(args.learned).map(str).filter(Boolean)) learn(world, who, l, '推测', after);
    const delivered = deliverDue(world, turnEnd);
    events.push(...delivered);
    const feelings = isRecord(args.feelings) ? args.feelings : undefined;
    return { events, ...(feelings ? { feelings: { who, ...feelings, reason: str(feelings.reason) || '察觉到的事' } } : {}) };
}

export function actText(world: WorldState, city: City, state: TabletopState, who: string, notices: Pending[], profile?: ImportantProfile): string {
    return [
        personText(world, city, state, who, profile),
        '',
        `【${who}刚察觉到的事】`,
        ...notices.map(n => `- ${clock(n.at)} ${n.what}`),
    ].join('\n');
}

// ---------------------------------------------------------------------------------------------
// The day of a 重要人物 (hearth_day)
// ---------------------------------------------------------------------------------------------

/** How eventful a day is: mostly ordinary, sometimes something, rarely something big. */
export function dayDice(world: WorldState, who: string, date: string): '平常的一天' | '有点事的一天' | '有大事的一天' {
    const r = rng(hash(`${world.seed}|${who}|${date}`))();
    return r < 0.8 ? '平常的一天' : r < 0.97 ? '有点事的一天' : '有大事的一天';
}

export function dayTool() {
    return {
        type: 'function',
        function: {
            name: DAY_TOOL_NAME,
            description: '每日推演：替这个重要人物过完这一天，安排明天。',
            parameters: {
                type: 'object',
                properties: {
                    day: { type: 'array', items: { type: 'string' }, description: '这一天发生的几件事，平常的一天就写平常的事' },
                    recent: { type: 'string', description: '他最近怎么样，一句话' },
                    mood: { type: 'number', description: '心情的变化（-30～30）' },
                    stress: { type: 'number', description: '压力的变化（-30～30）' },
                    learned: { type: 'array', items: { type: 'string' }, description: '新知道或推测出的事' },
                    memory: { type: 'string', description: '把他记得的重要旧事归成一段话（可选，替换原来的长期记忆）' },
                    others: {
                        type: 'array',
                        description: '这一天里和其他重要人物之间发生的事让态度变了才写',
                        items: { type: 'object', properties: { to: { type: 'string' }, ...axisProps, reason: { type: 'string' } }, required: ['to', 'reason'] },
                    },
                    tomorrow: {
                        type: 'object',
                        properties: {
                            routine: {
                                type: 'array', description: '明天和平时不一样的安排（没有就不写）',
                                items: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, place: { type: 'string' }, doing: { type: 'string' } }, required: ['from', 'to', 'place', 'doing'] },
                            },
                            commitments: {
                                type: 'array', description: '约了谁做什么',
                                items: { type: 'object', properties: { with: { type: 'string' }, what: { type: 'string' }, time: { type: 'string' }, place: { type: 'string' } }, required: ['with', 'what'] },
                            },
                        },
                    },
                    contact: {
                        type: 'object',
                        description: '要不要联系主角：他自己想联系才写，不想就不写',
                        properties: {
                            at: { type: 'string', description: '什么时候，2026-03-03 12:30' },
                            how: { type: 'string', enum: ['消息', '电话'] },
                            text: { type: 'string', description: '他说的原话' },
                            why: { type: 'string' },
                        },
                        required: ['at', 'how', 'text'],
                    },
                },
                required: ['day', 'recent'],
            },
        },
    };
}

export function dayText(world: WorldState, city: City, state: TabletopState, who: string, profile: ImportantProfile, date: string, events: string[]): string {
    const p = world.people[who];
    const since = p?.lastContact ? `距上次和主角联系 ${Math.max(0, Math.round((world.now - p.lastContact) / 1440))} 天` : '还没和主角联系过';
    const unanswered = world.phone.messages.filter(m => m.from === who && m.to === PROTAGONIST).slice(-1)[0];
    const replied = unanswered && world.phone.messages.some(m => m.from === PROTAGONIST && m.to === who && m.at > unanswered.at);
    return [
        personText(world, city, state, who, profile, true),
        '',
        `【${date} 这一天】${dayDice(world, who, date)}。${since}${unanswered && !replied ? `；他上一条发给主角的消息主角还没回` : ''}。`,
        p?.routine?.length ? `他平时的安排：${p.routine.map(s => `${s.days} ${s.from}–${s.to} ${placeById(world, city, s.place)?.name ?? s.place}（${s.doing}）`).join('；')}` : '',
        events.length ? `这一天他察觉到的事：\n${events.map(e => `- ${e}`).join('\n')}` : '',
    ].filter(Boolean).join('\n');
}

/** Applies a day: mood, what they learned, plans for tomorrow and a message to the protagonist on its way. */
export function applyDay(world: WorldState, city: City, who: string, raw: unknown, dayEnd: number): string[] {
    const args = isRecord(raw) ? raw : {};
    const p = world.people[who];
    if (!p) return [];
    const out: string[] = [];
    p.mood = clamp(Math.round((p.mood ?? 50) + (50 - (p.mood ?? 50)) * 0.5 + (num(args.mood) ?? 0)), 0, 100);
    p.stress = clamp(Math.round((p.stress ?? 30) + (num(args.stress) ?? 0)), 0, 100);
    if (str(args.recent)) p.recent = str(args.recent);
    for (const d of list(args.day).map(str).filter(Boolean)) learn(world, who, `（自己的事）${d}`, '亲眼', dayEnd);
    for (const l of list(args.learned).map(str).filter(Boolean)) learn(world, who, l, '推测', dayEnd);
    if (str(args.memory)) world.memory[who] = str(args.memory);
    for (const o of list(args.others).filter(isRecord)) {
        const to = str(o.to);
        if (!to || world.people[to]?.kind !== 'important') continue;
        changePair(world, who, to, o, str(o.reason), dayEnd);
    }
    const tomorrow = isRecord(args.tomorrow) ? args.tomorrow : {};
    const date = dateKey(dayEnd + 60);
    for (const r of list(tomorrow.routine).filter(isRecord)) {
        const place = findPlace(world, city, str(r.place)) ?? registerPlace(world, city, str(r.place), placeById(world, city, p.home));
        (p.routine ??= []).unshift({ days: date, from: str(r.from), to: str(r.to), place: place.id, doing: str(r.doing) });
    }
    if (p.routine) p.routine = p.routine.filter(s => !/^\d{4}-/.test(s.days) || s.days >= dateKey(world.now)).slice(0, 16);
    for (const c of list(tomorrow.commitments).filter(isRecord)) {
        const time = str(c.time) ? parseTime(str(c.time)) : null;
        const place = str(c.place) ? findPlace(world, city, str(c.place)) ?? registerPlace(world, city, str(c.place), placeById(world, city, p.at)) : undefined;
        const other = str(c.with) === '主角' || str(c.with) === world.me.name ? PROTAGONIST : str(c.with);
        if (!other) continue;
        world.commitments.push({
            id: newId('c', world.seed), name: str(c.what), parties: [who, other],
            expectations: time && place ? [who, other].map(w => ({ kind: 'presence' as const, who: w, place: place.id, days: dateKey(time), from: clock(time), to: clock(time + 120) })) : [],
            norms: '约好的事没做到，对方会失望。', since: dayEnd, record: [],
        });
        if (other !== PROTAGONIST && hasMind(world, other)) world.pending.push({ at: dayEnd, who: other, kind: 'notice', what: `${who}约你：${str(c.what)}${time ? `（${dateKey(time)} ${clock(time)}）` : ''}` });
    }
    const contact = isRecord(args.contact) ? args.contact : null;
    if (contact && str(contact.text)) {
        const at = timeAt(str(contact.at), dayEnd);
        world.pending.push({ at, who, kind: 'deliver', what: str(contact.text), message: { to: PROTAGONIST, text: str(contact.text), call: str(contact.how) === '电话' } });
        out.push(`${who}打算在 ${dateKey(at).slice(5)} ${clock(at)} ${str(contact.how) === '电话' ? '打电话给' : '发消息给'}主角`);
    }
    return out;
}

export function changePair(world: WorldState, from: string, to: string, changes: Record<string, unknown>, reason: string, at: number) {
    let pair = world.pairs.find(x => x.from === from && x.to === to);
    if (!pair) {
        pair = { from, to, axes: Object.fromEntries(AXES.map(([a]) => [a, 0])), familiarity: 10, reasons: [] } as Pair;
        world.pairs.push(pair);
    }
    for (const [axis] of AXES) {
        const d = num(changes[axis]);
        if (d) pair.axes[axis] = clamp(Math.round((pair.axes[axis] ?? 0) + clamp(d, -30, 30)), 0, 100);
    }
    const f = num(changes.familiarity);
    if (f) pair.familiarity = clamp(Math.round(pair.familiarity + f), 0, 100);
    pair.reasons.push({ at, text: reason });
    if (pair.reasons.length > 5) pair.reasons.splice(0, pair.reasons.length - 5);
}

// ---------------------------------------------------------------------------------------------
// Becoming a 重要人物 (hearth_profile)
// ---------------------------------------------------------------------------------------------

export function profileTool() {
    const slot = { type: 'object', properties: { days: { type: 'string', description: '工作日、周末、每天、星期六…' }, from: { type: 'string' }, to: { type: 'string' }, place: { type: 'string', description: '地图上的地点名，或新地点的名字' }, doing: { type: 'string' } }, required: ['days', 'from', 'to', 'place', 'doing'] };
    return {
        type: 'function',
        function: {
            name: PROFILE_TOOL_NAME,
            description: '人物档案：按模板写出这个人的完整档案，以及他在澜江市的生活。',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: '他的名字（剧情里还不知道名字时，给他起一个合适的）' },
                    profile: { type: 'string', description: '按模板的完整档案，2000～3000 字' },
                    summary: { type: 'string', description: '摘要，150～250 字' },
                    gender: { type: 'string', enum: ['男', '女'] },
                    age: { type: 'number' },
                    role: { type: 'string', description: '一个词：他是谁（咖啡师、邻居、同事…）' },
                    attributes: { type: 'object', description: '属性（按参照表，普通成年男性 100），已有的不用写' },
                    traits: { type: 'object', properties: { 敏感: { type: 'number' }, 记仇: { type: 'number' }, 多疑: { type: 'number' } } },
                    home: { type: 'string', description: '住在哪：地图上的地点名，或新地点的名字' },
                    work: { type: 'string', description: '在哪工作或上学（没有就不写）' },
                    routine: { type: 'array', items: slot, description: '每周的作息，四到八段' },
                    economy: { type: 'string', enum: ['拮据', '紧张', '普通', '宽裕', '富有'] },
                    income: { type: 'number', description: '每月收入，元' },
                    knows: { type: 'array', items: { type: 'string' }, description: '他已经知道的、和主角有关的事（从剧情里他在场的部分整理）' },
                    others: {
                        type: 'array', description: '他和其他重要人物的关系（认识的才写）',
                        items: { type: 'object', properties: { to: { type: 'string' }, ...axisProps, reason: { type: 'string' } }, required: ['to', 'reason'] },
                    },
                },
                required: ['name', 'profile', 'summary', 'routine'],
            },
        },
    };
}

export interface ProfileResult {
    name: string;
    profile: ImportantProfile;
    /** Attributes and traits for the 跑团 sheet. */
    attributes: Record<string, number>;
    traits: Record<string, number>;
    description: string;
}

/** Applies a new profile to the world. `keepProfile` is text the user brought, kept as it is. */
export function applyProfile(world: WorldState, city: City, raw: unknown, fallbackName: string, keepProfile?: string): ProfileResult | null {
    const args = isRecord(raw) ? raw : (parseJson(String(raw ?? '')) as Record<string, unknown> | null);
    if (!args) return null;
    const name = str(args.name) || fallbackName;
    if (!name) return null;
    const before = world.people[fallbackName] ?? world.people[name];
    const near = placeById(world, city, before?.at ?? world.at);
    const place = (text: string) => (text ? findPlace(world, city, text) ?? registerPlace(world, city, text, near) : undefined);
    // A home is somewhere people live: a street or a shop named as home becomes a flat near it.
    const homeFound = place(str(args.home));
    const home = homeFound && homeFound.kind !== 'residence' ? registerPlace(world, city, `${homeFound.name}一带的住处`, homeFound) : homeFound;
    const work = place(str(args.work));
    const routine: Slot[] = list(args.routine).filter(isRecord).map(s => ({ days: str(s.days) || '每天', from: str(s.from), to: str(s.to), place: place(str(s.place))?.id ?? home?.id ?? '', doing: str(s.doing) })).filter(s => s.from && s.to && s.place);
    const person: PersonWorld = {
        ...(before ?? {}),
        kind: 'important',
        role: str(args.role) || before?.role,
        brief: str(args.summary) || before?.brief,
        ...(home ? { home: home.id } : {}),
        ...(work ? { work: work.id } : {}),
        routine,
        economy: str(args.economy) || '普通',
        ...(num(args.income) ? { income: num(args.income) } : {}),
        mood: before?.mood ?? 55,
        stress: before?.stress ?? 30,
    };
    if (fallbackName && fallbackName !== name) delete world.people[fallbackName];
    world.people[name] = person;
    for (const k of list(args.knows).map(str).filter(Boolean)) learn(world, name, k, '亲眼');
    for (const o of list(args.others).filter(isRecord)) {
        const to = str(o.to);
        if (to && world.people[to]?.kind === 'important' && to !== name) changePair(world, name, to, o, str(o.reason) || '认识', world.now);
    }
    const attributes = isRecord(args.attributes) ? Object.fromEntries(Object.entries(args.attributes).map(([k, v]) => [k, num(v)]).filter(([, v]) => v !== undefined)) as Record<string, number> : {};
    const traits = isRecord(args.traits) ? Object.fromEntries(Object.entries(args.traits).map(([k, v]) => [k, num(v)]).filter(([, v]) => v !== undefined)) as Record<string, number> : {};
    return {
        name,
        profile: { profile: keepProfile?.trim() || str(args.profile), summary: str(args.summary), since: world.now },
        attributes, traits,
        description: [str(args.role), str(args.gender), num(args.age) ? `${num(args.age)} 岁` : ''].filter(Boolean).join('，'),
    };
}

export { AXIS_LABEL };

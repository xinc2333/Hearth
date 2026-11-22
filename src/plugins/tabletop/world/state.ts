// The live state of a 世界 chat (docs/world.md): the clock and weather, where the protagonist is,
// their body and money, commitments, the people the world keeps track of, the current scene, the
// phone and what happened. One copy is kept on every reply version, next to the 跑团 state.

import { hash, rng } from './city/everyday.ts';
import type { City, Place, Point } from './city/index.ts';
import type { Mode } from './route.ts';

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export interface DayWeather {
    date: string;
    sky: string;
    low: number;
    high: number;
}

export interface Body {
    /** 0–100: how fed. Falls every hour, a meal brings it back. */
    full: number;
    /** 0–100: falls while awake, comes back with sleep. */
    energy: number;
    /** 0–100. */
    health: number;
    /** Minute the protagonist last woke up. */
    awakeSince: number;
}

export interface LedgerEntry {
    at: number;
    amount: number;
    reason: string;
    balance: number;
}

/** Something one side of a commitment expects of someone (docs/world.md §8). */
export type Expectation =
    | { kind: 'presence'; who: string; place: string; days: string; from: string; to: string }
    | { kind: 'payment'; who: string; to: string; amount: number; day: number }
    | { kind: 'deadline'; who: string; what: string; by: number };

export interface Commitment {
    id: string;
    name: string;
    parties: string[];
    /** Who acts for an organisation, e.g. { 星衡广告: 王经理 }. */
    reps?: Record<string, string>;
    expectations: Expectation[];
    /** How this kind of commitment is usually handled when it falls through (for the people who decide). */
    norms: string;
    since: number;
    ended?: number;
    record: { at: number; text: string }[];
}

/** What the world keeps about a character of the 跑团 sheet (keyed by the same name). */
export interface PersonWorld {
    kind: 'related' | 'bystander' | 'important';
    /** 上司、房东、妈妈… */
    role?: string;
    /** A line about them: who they are, or how they looked when met. */
    brief?: string;
    /** Place id where they are, or were last seen. */
    at?: string;
    seenAt?: number;
    home?: string;
    work?: string;
    /** Working hours when they have a job, e.g. 工作日 09:00–18:00. */
    shift?: string;
    // 重要人物 only (docs/world.md §9).
    /** 0–100, usual 50. */
    mood?: number;
    /** 0–100. */
    stress?: number;
    /** A line about how they have been lately. */
    recent?: string;
    /** Their week: where they are when, e.g. 工作日 09:00–18:00 在公司. */
    routine?: Slot[];
    /** 拮据、紧张、普通、宽裕、富有. */
    economy?: string;
    income?: number;
    /** When they last heard from or saw the protagonist. */
    lastContact?: number;
}

/** A part of someone's week. */
export interface Slot {
    days: string;
    from: string;
    to: string;
    place: string;
    doing: string;
}

/** Something a person will notice at a time, or a message on its way (docs/world.md §1, 察觉). */
export interface Pending {
    at: number;
    who: string;
    kind: 'notice' | 'deliver';
    /** What they notice, in a sentence. */
    what: string;
    /** For deliveries: the message or call to hand over. */
    message?: { to: string; text: string; call?: boolean };
}

/** Something a person knows, and how they came to know it. */
export interface Knowledge {
    at: number;
    text: string;
    source: '亲眼' | '听说' | '推测';
}

/** How one 重要人物 feels about another (directed). */
export interface Pair {
    from: string;
    to: string;
    axes: Record<string, number>;
    familiarity: number;
    reasons: { at: number; text: string }[];
}

/** Someone in the current scene who is not a known character. */
export interface Bystander {
    id: string;
    role: 'staff' | 'visitor';
    gender: '男' | '女';
    age: number;
    /** Why they are here: 附近上班的人、店员… (not shown to the protagonist as such). */
    purpose: string;
    leaveAt: number;
    /** Written by the scene step: only what the protagonist can see. */
    looks?: string;
    doing?: string;
    where?: string;
    /** Name in the 跑团 sheet once the protagonist has dealt with them. */
    name?: string;
}

export interface Scene {
    place: string;
    since: number;
    /** The crowd in a sentence (written by the scene step). */
    crowd?: string;
    people: Bystander[];
}

export interface PhoneMessage {
    at: number;
    from: string;
    to: string;
    text: string;
    read: boolean;
}

export interface WorldEvent {
    at: number;
    text: string;
    kind: 'move' | 'lapse' | 'money' | 'body' | 'message' | 'scene' | 'note';
    /** The protagonist knows about it. */
    seen: boolean;
}

export type Living = '节俭' | '普通' | '宽裕';

export interface Protagonist {
    name: string;
    job: { kind: '上班族' | '学生' | '自由职业' | '无业'; title: string; place?: string };
    home: string;
    living: Living;
    habit?: Mode;
}

/** A place the story added to the map. */
export type ExtraPlace = Place;

export interface WorldState {
    version: 1;
    seed: number;
    /** Minutes since 1970-01-01 00:00, read as city time. */
    start: number;
    now: number;
    /** Place id where the protagonist is. */
    at: string;
    body: Body;
    balance: number;
    ledger: LedgerEntry[];
    me: Protagonist;
    commitments: Commitment[];
    people: Record<string, PersonWorld>;
    places: ExtraPlace[];
    weather: DayWeather[];
    scene: Scene | null;
    /** The staff of places visited, so the same people are there next time. */
    staff: Record<string, Bystander[]>;
    phone: { contacts: string[]; messages: PhoneMessage[] };
    events: WorldEvent[];
    /** Lapses already raised, so each is raised once. */
    noted: string[];
    /** Things people will notice, and messages on their way. */
    pending: Pending[];
    /** What each person with a mind knows (latest 40), and the older part as a paragraph. */
    knowledge: Record<string, Knowledge[]>;
    memory: Record<string, string>;
    /** Attitudes between 重要人物. */
    pairs: Pair[];
}

/** Fills in what older saved worlds do not have yet. */
export function normalizeWorld(world: WorldState): WorldState {
    world.pending ??= [];
    world.knowledge ??= {};
    world.memory ??= {};
    world.pairs ??= [];
    return world;
}

/** Adds what a person learned, keeping the latest 40. */
export function learn(world: WorldState, who: string, text: string, source: Knowledge['source'], at = world.now) {
    if (!who || !text || who === '主角') return;
    const list = (world.knowledge[who] ??= []);
    if (list.some(k => k.text === text)) return;
    list.push({ at, text, source });
    if (list.length > 40) list.splice(0, list.length - 40);
}

/** Where someone with a routine is at `t`: the slot that covers it, else home at night. */
export function routinePlace(person: PersonWorld, t: number): { place: string; doing: string } | null {
    const m = moment(t).minute;
    for (const s of person.routine ?? []) {
        if (!dayMatches(s.days, t)) continue;
        const a = minutesOf(s.from);
        const b = minutesOf(s.to) || 1440;
        if (a <= b ? m >= a && m < b : m >= a || m < b) return { place: s.place, doing: s.doing };
    }
    if (person.work && person.shift) {
        const [days, hours] = person.shift.split(' ');
        const [a, b] = (hours ?? '').split(/[–-]/).map(minutesOf);
        if (days && dayMatches(days, t) && m >= a && m < b) return { place: person.work, doing: '上班' };
    }
    if (person.home && (m >= 22 * 60 || m < 7 * 60)) return { place: person.home, doing: '在家' };
    return null;
}

export const LIMITS = { ledger: 100, messages: 100, events: 100, noted: 300 } as const;

// ---------------------------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------------------------

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const pad = (n: number) => String(n).padStart(2, '0');

export interface Moment {
    y: number;
    m: number;
    d: number;
    weekday: number;
    hh: number;
    mm: number;
    /** Minutes after midnight. */
    minute: number;
}

export function moment(t: number): Moment {
    const date = new Date(t * 60000);
    const hh = date.getUTCHours();
    const mm = date.getUTCMinutes();
    return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate(), weekday: date.getUTCDay(), hh, mm, minute: hh * 60 + mm };
}

/** "2026-03-02 07:30" → minutes. Null when it does not parse. */
export function parseTime(text: string): number | null {
    const m = /(\d{4})-(\d{1,2})-(\d{1,2})[ T]+(\d{1,2}):(\d{2})/.exec(text);
    if (!m) return null;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000;
}

export const dateKey = (t: number) => {
    const x = moment(t);
    return `${x.y}-${pad(x.m)}-${pad(x.d)}`;
};
export const clock = (t: number) => {
    const x = moment(t);
    return `${pad(x.hh)}:${pad(x.mm)}`;
};
export const stamp = (t: number) => `${dateKey(t)} ${clock(t)}`;
export const isWorkday = (t: number) => {
    const w = moment(t).weekday;
    return w >= 1 && w <= 5;
};
export const dayNumber = (world: Pick<WorldState, 'start' | 'now'>) => Math.floor(world.now / 1440) - Math.floor(world.start / 1440) + 1;
export const midnight = (t: number) => Math.floor(t / 1440) * 1440;

/** 第 3 天 · 3 月 4 日 星期三 08:15 */
export function fmtNow(world: Pick<WorldState, 'start' | 'now'>): string {
    const x = moment(world.now);
    return `第 ${dayNumber(world)} 天 · ${x.m} 月 ${x.d} 日 ${WEEKDAYS[x.weekday]} ${pad(x.hh)}:${pad(x.mm)}`;
}

/** 3 月 4 日 星期三 */
export function fmtDay(t: number): string {
    const x = moment(t);
    return `${x.m} 月 ${x.d} 日 ${WEEKDAYS[x.weekday]}`;
}

/** Whether a day matches a schedule word: 每天、工作日、周末、星期一…, or a date. */
export function dayMatches(days: string, t: number): boolean {
    const x = moment(t);
    if (/^\d{4}-\d{2}-\d{2}$/.test(days)) return days === dateKey(t);
    if (days.includes('每天')) return true;
    if (days.includes('工作日')) return x.weekday >= 1 && x.weekday <= 5;
    if (days.includes('周末')) return x.weekday === 0 || x.weekday === 6;
    return days.includes(WEEKDAYS[x.weekday]) || days.includes(WEEKDAYS[x.weekday].replace('星期', '周'));
}

export const minutesOf = (hhmm: string) => {
    const m = /(\d{1,2}):(\d{2})/.exec(hhmm);
    return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};

// ---------------------------------------------------------------------------------------------
// Weather: the city's climate month by month, drawn once a day from the world's seed.
// ---------------------------------------------------------------------------------------------

/** [average low, average high, chance of rain] for each month. */
const CLIMATE: [number, number, number][] = [
    [1, 8, 0.3], [3, 10, 0.33], [6, 14, 0.4], [11, 20, 0.4], [16, 25, 0.38], [20, 28, 0.5],
    [25, 32, 0.4], [25, 32, 0.38], [21, 28, 0.33], [16, 23, 0.25], [10, 17, 0.27], [3, 10, 0.25],
];

export function weatherOn(seed: number, date: string): DayWeather {
    const rand = rng(hash(`${seed}|${date}`));
    const month = Number(date.slice(5, 7));
    const [low, high, wet] = CLIMATE[month - 1];
    const shift = Math.round((rand() - 0.5) * 6);
    let sky: string;
    const r = rand();
    if (month >= 7 && month <= 9 && r < 0.02) sky = '台风';
    else if (r < wet) sky = month >= 6 && month <= 9 && rand() < 0.35 ? '雷阵雨' : rand() < 0.7 ? '小雨' : '大雨';
    else if ((month <= 2 || month === 12) && rand() < 0.08) sky = '雾';
    else sky = pickSky(rand());
    const wetCool = sky.includes('雨') || sky === '台风' ? -2 : 0;
    return { date, sky, low: low + shift + wetCool, high: high + shift + wetCool * 1.5 };
}

const pickSky = (r: number) => (r < 0.4 ? '晴' : r < 0.75 ? '多云' : '阴');

/** Today's weather and the next two days. */
export function forecast(world: Pick<WorldState, 'seed' | 'now'>): DayWeather[] {
    return [0, 1, 2].map(i => weatherOn(world.seed, dateKey(world.now + i * 1440)));
}

export const fmtWeather = (w: DayWeather) => `${w.sky} ${Math.round(w.low)}～${Math.round(w.high)}°C`;

// ---------------------------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------------------------

export function allPlaces(world: Pick<WorldState, 'places'>, city: City): Place[] {
    return [...city.places, ...world.places];
}

export function placeById(world: Pick<WorldState, 'places'>, city: City, id: string | undefined): Place | undefined {
    if (!id) return undefined;
    return city.places.find(p => p.id === id) ?? world.places.find(p => p.id === id);
}

/** A place by name, as the model writes it: 家、公司 and a station name work too. */
export function findPlace(world: Pick<WorldState, 'places' | 'me'>, city: City, name: string): Place | undefined {
    const n = name.trim().replace(/站$/, '');
    if (!n) return undefined;
    if (/^(家|回家|住处|家里)$/.test(n)) return placeById(world, city, world.me.home);
    if (/^(公司|单位|上班的地方|学校|办公室)$/.test(n)) return placeById(world, city, world.me.job.place);
    const places = allPlaces(world, city);
    const exact = places.find(p => p.name === n);
    if (exact) return exact;
    // "梧桐路 · 十一月咖啡屋" or "十一月咖啡屋（梧桐路）": the last named part that matches.
    const parts = n.split(/[·・\s（）()，,]+/).filter(Boolean).reverse();
    for (const part of parts) {
        const hit = places.find(p => p.name === part);
        if (hit) return hit;
    }
    const contained = places.filter(p => n.includes(p.name) || p.name.includes(n)).sort((a, b) => b.name.length - a.name.length);
    if (contained.length) return contained[0];
    const station = city.stations.get(n);
    if (station) return places.filter(p => p.landmark).sort((a, b) => dist(a.at, station.at) - dist(b.at, station.at))[0];
    return undefined;
}

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Places near a point, nearest first. */
export function nearby(world: Pick<WorldState, 'places'>, city: City, at: Point, count: number, except?: string): { place: Place; km: number }[] {
    return allPlaces(world, city)
        .filter(p => p.id !== except)
        .map(place => ({ place, km: dist(place.at, at) }))
        .sort((a, b) => a.km - b.km)
        .slice(0, count);
}

// ---------------------------------------------------------------------------------------------
// Money and body
// ---------------------------------------------------------------------------------------------

/** Adds a payment (negative) or income to the protagonist's account. False when the money is not there. */
export function pay(world: WorldState, amount: number, reason: string, at = world.now): boolean {
    const value = Math.round(amount * 100) / 100;
    if (!value) return true;
    if (value < 0 && world.balance + value < 0) return false;
    world.balance = Math.round((world.balance + value) * 100) / 100;
    world.ledger.push({ at, amount: value, reason, balance: world.balance });
    if (world.ledger.length > LIMITS.ledger) world.ledger.splice(0, world.ledger.length - LIMITS.ledger);
    return true;
}

export const DAILY_COST: Record<Living, number> = { 节俭: 40, 普通: 70, 宽裕: 150 };

export type Activity = '日常' | '睡觉' | '体力活';

/** The body over `minutes`: hunger grows, energy falls while awake and comes back with sleep. */
export function advanceBody(body: Body, minutes: number, activity: Activity, end: number): Body {
    const h = minutes / 60;
    const next = { ...body };
    next.full = Math.max(0, body.full - 6 * h * (activity === '睡觉' ? 0.5 : activity === '体力活' ? 1.5 : 1));
    if (activity === '睡觉') {
        next.energy = Math.min(100, body.energy + 12 * h);
        next.awakeSince = end;
    } else {
        next.energy = Math.max(0, body.energy - 5 * h * (activity === '体力活' ? 1.6 : 1));
    }
    next.full = Math.round(next.full);
    next.energy = Math.round(next.energy);
    return next;
}

/** How the body feels, in words, for the model and the status line. */
export function bodyWords(body: Body): string[] {
    const out: string[] = [];
    if (body.full < 10) out.push('饿得发慌');
    else if (body.full < 30) out.push('饿了');
    if (body.energy < 10) out.push('极度疲惫');
    else if (body.energy < 30) out.push('困倦');
    if (body.health < 30) out.push('病得厉害');
    else if (body.health < 60) out.push('不太舒服');
    return out;
}

/** The 跑团 statuses the body causes, with their effect on every attribute. */
export function bodyStatuses(body: Body): { name: string; factor: number }[] {
    const out: { name: string; factor: number }[] = [];
    if (body.energy < 10) out.push({ name: '极度疲惫', factor: 0.7 });
    else if (body.energy < 30) out.push({ name: '困倦', factor: 0.9 });
    if (body.full < 10) out.push({ name: '饿得发慌', factor: 0.9 });
    return out;
}

export const BODY_STATUS_NAMES = ['极度疲惫', '困倦', '饿得发慌'];

// ---------------------------------------------------------------------------------------------
// Bookkeeping
// ---------------------------------------------------------------------------------------------

export function addEvent(world: WorldState, event: WorldEvent) {
    world.events.push(event);
    if (world.events.length > LIMITS.events) world.events.splice(0, world.events.length - LIMITS.events);
}

export function addMessage(world: WorldState, message: PhoneMessage) {
    world.phone.messages.push(message);
    if (world.phone.messages.length > LIMITS.messages) world.phone.messages.splice(0, world.phone.messages.length - LIMITS.messages);
}

export function note(world: WorldState, key: string): boolean {
    if (world.noted.includes(key)) return false;
    world.noted.push(key);
    if (world.noted.length > LIMITS.noted) world.noted.splice(0, world.noted.length - LIMITS.noted);
    return true;
}

let counter = 0;
export const newId = (prefix: string, seed: number) => `${prefix}${(hash(`${seed}|${Date.now()}|${counter++}`) % 1e9).toString(36)}`;

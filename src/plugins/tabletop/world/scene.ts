// Who is at a place right now (docs/world.md §6, 场景): the place's own staff, the same people every
// visit, and people coming and going, worked out from the kind of place, the hour, the day and the
// weather. The program only decides who they are; the scene step writes what they look like.

import { hash, rng } from './city/everyday.ts';
import type { City, Place } from './city/index.ts';
import { isWorkday, minutesOf, moment, type Bystander, type DayWeather, type Scene, type WorldState } from './state.ts';

/** Most people a scene describes; a busy place only gets the closest, most noticeable ones. */
export const MAX_DESCRIBED = 8;

type Kind = Place['kind'];

/** How many people the place holds when busy. */
const CAPACITY: Partial<Record<Kind, number>> = {
    cafe: 25, bar: 40, food: 30, shop: 6, market: 60, mall: 300, park: 80, sight: 150, fun: 300, station: 400, airport: 800,
    office: 12, residence: 4, school: 30, hospital: 60, police: 8, government: 15, gym: 25, hotel: 12, industry: 10,
};

/** How busy the place is at each hour, 0–1 (index = hour). */
function busyness(kind: Kind, hour: number, workday: boolean): number {
    const h = hour;
    const between = (a: number, b: number) => (a <= b ? h >= a && h < b : h >= a || h < b);
    switch (kind) {
        case 'cafe': return between(8, 11) ? 0.6 : between(14, 18) ? 0.8 : between(11, 14) ? 0.5 : between(18, 21) ? 0.4 : 0.1;
        case 'food': return between(11, 13) || between(17, 20) ? 0.9 : between(6, 9) ? 0.4 : between(21, 2) ? 0.3 : 0.15;
        case 'bar': return between(21, 1) ? 0.9 : between(19, 21) ? 0.5 : between(1, 3) ? 0.3 : 0.05;
        case 'market': return between(6, 9) ? 0.9 : between(9, 12) ? 0.5 : between(16, 18) ? 0.5 : 0.1;
        case 'mall': return (between(14, 21) ? 0.8 : between(10, 14) ? 0.5 : 0.1) * (workday ? 0.7 : 1.2);
        case 'park': return between(6, 8) || between(16, 19) ? 0.7 : between(8, 16) ? 0.35 : 0.1;
        case 'sight':
        case 'fun': return (between(10, 17) ? 0.7 : between(17, 21) ? 0.4 : 0.1) * (workday ? 0.6 : 1.3);
        case 'station':
        case 'airport': return workday && (between(7, 9) || between(17, 19)) ? 1 : between(6, 23) ? 0.5 : 0.1;
        case 'office': return workday && between(9, 18) ? 0.9 : 0.1;
        case 'school': return workday && between(7, 17) ? 0.9 : 0.05;
        case 'gym': return between(18, 22) ? 0.9 : between(7, 9) ? 0.5 : 0.25;
        case 'hospital': return between(8, 12) ? 0.9 : between(12, 17) ? 0.6 : 0.2;
        default: return between(7, 22) ? 0.4 : 0.1;
    }
}

/** Why people come, with an age range, a share of women and how long they stay (minutes). */
type Visitor = [purpose: string, minAge: number, maxAge: number, women: number, stay: [number, number], weight: number];

const VISITORS: Partial<Record<Kind, Visitor[]>> = {
    cafe: [['附近上班的人', 24, 42, 0.5, [20, 60], 3], ['学生', 18, 24, 0.55, [60, 180], 2], ['带电脑办公的自由职业者', 24, 38, 0.5, [90, 240], 1.5], ['约会的年轻人', 20, 32, 0.5, [40, 100], 1], ['闲坐的中年人', 40, 60, 0.4, [30, 90], 0.7], ['退休的老人', 60, 75, 0.5, [30, 90], 0.5]],
    bar: [['下班后喝一杯的上班族', 25, 40, 0.4, [60, 150], 3], ['朋友聚会', 22, 35, 0.5, [90, 200], 2], ['独自喝酒的人', 25, 50, 0.3, [40, 120], 1], ['约会的人', 23, 35, 0.5, [60, 150], 1]],
    food: [['附近上班的人', 22, 45, 0.45, [25, 50], 3], ['一家人', 30, 50, 0.5, [40, 80], 1.5], ['学生', 16, 23, 0.5, [20, 40], 1], ['外卖骑手', 22, 40, 0.1, [5, 10], 0.7], ['附近的老住户', 55, 75, 0.5, [30, 60], 1]],
    market: [['买菜的老人', 58, 78, 0.65, [15, 40], 3], ['买菜的主妇和主夫', 30, 55, 0.6, [15, 30], 2], ['饭店来进货的人', 30, 50, 0.3, [10, 20], 0.7]],
    shop: [['路过买东西的人', 18, 60, 0.5, [3, 10], 3], ['学生', 12, 20, 0.5, [3, 8], 1]],
    mall: [['逛街的年轻人', 18, 32, 0.6, [60, 180], 3], ['带孩子的家长', 28, 42, 0.6, [60, 150], 1.5], ['情侣', 20, 32, 0.5, [60, 180], 1.5], ['中年夫妇', 40, 60, 0.5, [60, 120], 1]],
    park: [['晨练和散步的老人', 58, 78, 0.5, [40, 120], 3], ['跑步的人', 22, 45, 0.45, [30, 60], 1.5], ['带孩子的家长', 28, 40, 0.65, [40, 90], 1.5], ['坐着发呆的年轻人', 20, 32, 0.5, [20, 60], 1]],
    sight: [['游客', 20, 60, 0.55, [40, 120], 3], ['拍照的年轻人', 18, 30, 0.65, [30, 90], 2], ['本地的老人', 60, 78, 0.5, [30, 90], 1]],
    fun: [['游客', 18, 50, 0.55, [90, 240], 3], ['带孩子的家长', 28, 42, 0.6, [120, 300], 2]],
    station: [['赶车的人', 18, 65, 0.5, [5, 20], 4], ['出差的上班族', 25, 50, 0.35, [10, 30], 2], ['拖着行李的旅客', 20, 70, 0.5, [15, 40], 2]],
    airport: [['拖着行李的旅客', 20, 70, 0.5, [30, 90], 4], ['出差的上班族', 25, 50, 0.35, [30, 90], 2]],
    office: [['来办事的访客', 25, 50, 0.45, [10, 40], 2], ['这里上班的人', 23, 45, 0.5, [5, 20], 3]],
    residence: [['这里的住户', 20, 75, 0.5, [5, 30], 3], ['送快递的人', 22, 40, 0.1, [3, 8], 1]],
    school: [['学生', 7, 18, 0.5, [20, 60], 4], ['老师', 25, 55, 0.6, [10, 40], 1], ['接孩子的家长', 30, 65, 0.6, [10, 30], 1.5]],
    hospital: [['看病的人', 20, 80, 0.5, [40, 120], 3], ['陪家人看病的人', 25, 60, 0.55, [40, 120], 2]],
    police: [['来办事的人', 20, 70, 0.5, [15, 45], 1]],
    government: [['来办事的人', 25, 65, 0.5, [20, 60], 1]],
    gym: [['健身的上班族', 22, 40, 0.45, [60, 100], 3], ['大学生', 18, 23, 0.4, [60, 100], 1]],
    hotel: [['住店的客人', 25, 60, 0.45, [10, 30], 3], ['来见客人的人', 25, 50, 0.5, [10, 30], 1]],
    industry: [['上班的工人', 20, 55, 0.25, [30, 120], 3]],
};

const OUTDOORS: Kind[] = ['mall', 'sight', 'park', 'market', 'fun', 'residence', 'office', 'school'];
const PASSERS_BY: Visitor[] = [['路过的人', 18, 70, 0.5, [2, 8], 3], ['赶着上班的人', 22, 45, 0.5, [1, 5], 2], ['遛弯的老人', 60, 78, 0.5, [5, 20], 1]];

/** The people who work at a kind of place: [role, minAge, maxAge, share of women]. */
const STAFF: Partial<Record<Kind, [string, number, number, number][]>> = {
    cafe: [['咖啡师', 20, 32, 0.6], ['店员', 18, 28, 0.6]],
    bar: [['调酒师', 24, 38, 0.3], ['服务生', 20, 28, 0.5]],
    food: [['老板', 35, 60, 0.4], ['服务员', 18, 45, 0.6]],
    shop: [['店员', 18, 50, 0.6]],
    market: [['卖菜的摊主', 35, 65, 0.5], ['卖肉的摊主', 35, 60, 0.2], ['卖水产的摊主', 30, 60, 0.4]],
    office: [['前台', 22, 32, 0.8], ['保安', 30, 60, 0.05]],
    residence: [['门卫', 45, 65, 0.1]],
    school: [['门卫', 45, 65, 0.1]],
    hospital: [['护士', 22, 45, 0.9], ['导诊台的工作人员', 25, 50, 0.7]],
    police: [['值班民警', 25, 50, 0.25]],
    gym: [['教练', 22, 35, 0.3], ['前台', 20, 28, 0.6]],
    hotel: [['前台', 20, 32, 0.7]],
    mall: [['商场保安', 30, 55, 0.1]],
    station: [['车站工作人员', 25, 50, 0.4]],
};

/** Whether a place is open at a minute of the day, from its hours text. */
export function isOpen(place: Pick<Place, 'hours'>, t: number): boolean {
    const hours = place.hours;
    if (!hours || hours.includes('全天')) return true;
    if (hours.includes('工作日') && !isWorkday(t)) return false;
    const m = /(\d{1,2}:\d{2})\s*[–~～-]\s*(\d{1,2}:\d{2})/.exec(hours);
    if (!m) return true;
    const minute = moment(t).minute;
    const open = minutesOf(m[1]);
    const close = minutesOf(m[2]) === 0 ? 1440 : minutesOf(m[2]);
    return open <= close ? minute >= open && minute < close : minute >= open || minute < close;
}

function weatherFactor(kind: Kind, weather: DayWeather | undefined): number {
    if (!weather) return 1;
    const wet = /雨|台风/.test(weather.sky);
    if (!wet) return 1;
    if (kind === 'park' || kind === 'sight' || kind === 'fun') return weather.sky === '小雨' ? 0.5 : 0.2;
    if (kind === 'mall' || kind === 'cafe') return 1.15;
    return 0.9;
}

const ageAt = (rand: () => number, min: number, max: number) => Math.round(min + rand() * (max - min));

/** How old someone looks, as the protagonist would put it. */
export function ageWords(age: number): string {
    if (age < 7) return '小孩';
    if (age < 13) return '小学生模样';
    if (age < 18) return '十几岁';
    if (age < 23) return '二十出头';
    if (age < 28) return '二十五六岁';
    if (age < 34) return '三十岁上下';
    if (age < 40) return '三十多岁';
    if (age < 50) return '四十多岁';
    if (age < 60) return '五十多岁';
    if (age < 70) return '六十多岁';
    return '七十多岁';
}

/** The place's staff, made once (the same people on every visit). */
export function staffOf(world: WorldState, place: Place): Bystander[] {
    const known = world.staff[place.id];
    if (known) return known;
    const rand = rng(hash(`${world.seed}|staff|${place.id}`));
    const roles = STAFF[place.kind] ?? [];
    const people = roles.map(([role, min, max, women], i): Bystander => ({
        id: `s-${hash(place.id).toString(36)}-${i}`,
        role: 'staff',
        gender: rand() < women ? '女' : '男',
        age: ageAt(rand, min, max),
        purpose: role,
        leaveAt: Number.MAX_SAFE_INTEGER,
    }));
    world.staff[place.id] = people;
    return people;
}

/**
 * The scene at `place` at `now`: keeps whoever is still here, lets visitors whose time is up go, and
 * brings in new ones to match how busy the place is. Returns the people who were not described yet.
 */
export function updateScene(world: WorldState, place: Place, now: number): { scene: Scene; fresh: Bystander[] } {
    const same = world.scene?.place === place.id;
    // At home there are no strangers: only the people the story put there.
    if (place.id === world.me.home) {
        const people = same ? world.scene!.people.filter(p => p.name) : [];
        return { scene: { place: place.id, since: same ? world.scene!.since : now, crowd: '家里', people }, fresh: [] };
    }
    const kept = same ? world.scene!.people.filter(p => p.name || (p.role === 'staff' ? isOpen(place, now) : p.leaveAt > now)) : [];
    const rand = rng(hash(`${world.seed}|${place.id}|${Math.floor(now / 15)}`));
    const open = isOpen(place, now);
    const staff = open ? staffOf(world, place).filter(s => !kept.some(k => k.id === s.id)) : [];
    const m = moment(now);
    // A street, a square or a shopping street outside opening hours still has people walking by.
    const street = !open && OUTDOORS.includes(place.kind) && m.hh >= 6 && m.hh < 23;
    const busy = open ? busyness(place.kind, m.hh, isWorkday(now)) * weatherFactor(place.kind, world.weather[0]) : street ? 0.03 * weatherFactor('park', world.weather[0]) : 0;
    const target = street ? Math.round(3 + rand() * 4) : Math.round((CAPACITY[place.kind] ?? 6) * busy * (0.8 + rand() * 0.4));
    const visitors = kept.filter(p => p.role === 'visitor');
    const room = Math.max(0, Math.min(target, MAX_DESCRIBED - staff.length - kept.filter(p => p.role === 'staff').length) - visitors.length);
    const types = street ? PASSERS_BY : VISITORS[place.kind] ?? PASSERS_BY;
    const total = types.reduce((s, t) => s + t[5], 0);
    const added: Bystander[] = [];
    for (let i = 0; i < room; i++) {
        let r = rand() * total;
        const type = types.find(t => (r -= t[5]) <= 0) ?? types[0];
        const [purpose, min, max, women, [s0, s1]] = type;
        // Someone already sitting here when the protagonist walks in has been here a while.
        const stay = Math.round(s0 + rand() * (s1 - s0));
        added.push({
            id: `b-${hash(`${world.seed}|${place.id}|${now}|${i}`).toString(36)}`,
            role: 'visitor',
            gender: rand() < women ? '女' : '男',
            age: ageAt(rand, min, max),
            purpose,
            leaveAt: now + Math.max(5, Math.round(same ? stay : stay * (0.3 + rand() * 0.7))),
        });
    }
    const people = [...kept, ...staff, ...added];
    const scene: Scene = { place: place.id, since: same ? world.scene!.since : now, crowd: same && !added.length && !staff.length ? world.scene!.crowd : undefined, people };
    return { scene, fresh: people.filter(p => !p.looks) };
}

/** How full the place is, in words, from how many people are there. */
export function crowdWord(place: Place, now: number, weather: DayWeather | undefined): string {
    const busy = isOpen(place, now) ? busyness(place.kind, moment(now).hh, isWorkday(now)) * weatherFactor(place.kind, weather) : 0;
    const n = (CAPACITY[place.kind] ?? 6) * busy;
    if (!isOpen(place, now)) return '没有营业';
    return n < 2 ? '冷冷清清' : n < 8 ? '人不多' : n < 25 ? '有一些人' : n < 80 ? '挺热闹' : '人很多';
}

export type { City };

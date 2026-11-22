// How long it takes to get from one place in 澜江市 to another, and what it costs (docs/world.md §6).
// Speeds are real; the city is smaller than Shanghai, so trips are shorter. The metro is routed over
// the station graph with waiting and transfer times; other ways of travelling go by distance.

import type { City, Point } from './city/index.ts';
import { distance } from './city/geo.ts';

export type Mode = 'walk' | 'bike' | 'metro' | 'bus' | 'taxi' | 'drive';

export const MODE_LABEL: Record<Mode, string> = { walk: '步行', bike: '骑车', metro: '地铁', bus: '公交', taxi: '打车', drive: '开车' };

/** When the trip starts: minutes after midnight, and whether it is a working day (for rush hours). */
export interface When {
    minute: number;
    workday: boolean;
}

export interface Trip {
    mode: Mode;
    minutes: number;
    /** Yuan. */
    cost: number;
    /** Straight-line distance, km. */
    distance: number;
    /** What the trip is, step by step, e.g. 「1 号线 梧桐路 → 市民广场（2 站）」. */
    legs: string[];
    /** False when the mode is not possible now (the metro at night); `why` says why. */
    ok: boolean;
    why?: string;
}

const WALK_KMH = 4.5;
const DETOUR = 1.3;
const ROAD = 1.4;
const TRANSFER = 5;

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`;
const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function isRush(when: When): boolean {
    const m = when.minute % 1440;
    return when.workday && ((m >= 420 && m < 570) || (m >= 1020 && m < 1170));
}

const isNight = (when: When) => when.minute % 1440 >= 1380 || when.minute % 1440 < 300;

function walkMinutes(km: number): number {
    return (km * DETOUR * 60) / WALK_KMH;
}

function carSpeed(when: When): number {
    return isRush(when) ? 18 : isNight(when) ? 40 : 28;
}

export function taxiFare(roadKm: number, when: When): number {
    const base = 14 + Math.max(0, roadKm - 3) * 2.5;
    return Math.round(base * (isNight(when) ? 1.3 : 1));
}

export function metroFare(rideKm: number): number {
    return Math.min(8, 3 + Math.ceil(Math.max(0, rideKm - 3) / 5));
}

interface Edge {
    to: string;
    line: string;
    minutes: number;
    km: number;
}

const graphs = new WeakMap<City, Map<string, Edge[]>>();

function graph(city: City): Map<string, Edge[]> {
    const known = graphs.get(city);
    if (known) return known;
    const g = new Map<string, Edge[]>();
    const add = (a: string, b: string, line: string, speed: number) => {
        const km = distance(city.stations.get(a)!.at, city.stations.get(b)!.at);
        const minutes = (km / speed) * 60 + 0.5;
        (g.get(a) ?? g.set(a, []).get(a)!).push({ to: b, line, minutes, km });
        (g.get(b) ?? g.set(b, []).get(b)!).push({ to: a, line, minutes, km });
    };
    for (const l of city.lines) {
        for (let i = 1; i < l.stations.length; i++) add(l.stations[i - 1], l.stations[i], l.id, l.speed);
        if (l.loop) add(l.stations[l.stations.length - 1], l.stations[0], l.id, l.speed);
    }
    graphs.set(city, g);
    return g;
}

/** Stations within walking reach of a point, nearest first. */
function nearStations(city: City, at: Point, max = 4): { name: string; km: number }[] {
    const all = [...city.stations.values()].map(s => ({ name: s.name, km: distance(s.at, at) })).sort((a, b) => a.km - b.km);
    const close = all.filter(s => s.km <= 2.5).slice(0, max);
    return close.length ? close : all.slice(0, 1);
}

function metroTrip(city: City, from: Point, to: Point, when: When): Trip {
    const km = distance(from, to);
    const start = when.minute % 1440;
    const open = minutesOf(city.metroHours.first);
    const last = minutesOf(city.metroHours.last);
    if (start < open || start > last) {
        return { mode: 'metro', minutes: 0, cost: 0, distance: km, legs: [], ok: false, why: `地铁 ${city.metroHours.first}～${city.metroHours.last} 运营` };
    }
    if (nearStations(city, from)[0].km > 2.5 || nearStations(city, to)[0].km > 2.5) {
        return { mode: 'metro', minutes: 0, cost: 0, distance: km, legs: [], ok: false, why: '附近没有地铁站' };
    }
    const g = graph(city);
    const lines = new Map(city.lines.map(l => [l.id, l]));
    const wait = (line: string) => {
        const [rush, other] = lines.get(line)!.interval;
        return (isRush(when) ? rush : other) / 2;
    };
    const exits = new Map(nearStations(city, to).map(s => [s.name, s.km]));
    // Dijkstra over (station, line): boarding costs a wait, changing lines also a transfer walk.
    type Node = { key: string; station: string; line: string; minutes: number; km: number; prev?: Node };
    const best = new Map<string, number>();
    const queue: Node[] = [];
    for (const s of nearStations(city, from)) {
        for (const e of g.get(s.name) ?? []) {
            const key = `${s.name}|${e.line}`;
            const minutes = walkMinutes(s.km) + wait(e.line);
            if ((best.get(key) ?? Infinity) <= minutes) continue;
            best.set(key, minutes);
            queue.push({ key, station: s.name, line: e.line, minutes, km: 0 });
        }
    }
    let done: { node: Node; total: number } | null = null;
    while (queue.length) {
        queue.sort((a, b) => a.minutes - b.minutes);
        const node = queue.shift()!;
        if (node.minutes > (best.get(node.key) ?? Infinity)) continue;
        if (done && node.minutes >= done.total) break;
        const exit = exits.get(node.station);
        if (exit !== undefined) {
            const total = node.minutes + walkMinutes(exit);
            if (!done || total < done.total) done = { node, total };
        }
        for (const e of g.get(node.station) ?? []) {
            const change = e.line !== node.line;
            const minutes = node.minutes + e.minutes + (change ? TRANSFER + wait(e.line) : 0);
            const key = `${e.to}|${e.line}`;
            if (minutes >= (best.get(key) ?? Infinity)) continue;
            best.set(key, minutes);
            queue.push({ key, station: e.to, line: e.line, minutes, km: node.km + e.km, prev: node });
        }
    }
    if (!done) return { mode: 'metro', minutes: 0, cost: 0, distance: km, legs: [], ok: false, why: '附近没有能到的地铁' };
    // Read the path back into legs: one per line ridden.
    const path: Node[] = [];
    for (let n: Node | undefined = done.node; n; n = n.prev) path.unshift(n);
    const legs: string[] = [];
    const first = path[0];
    const walkIn = Math.round(walkMinutes(nearStations(city, from).find(s => s.name === first.station)?.km ?? 0));
    if (walkIn > 0) legs.push(`步行 ${walkIn} 分钟到 ${first.station}站`);
    // Group the path by line: a new group starts where the line changes (at the previous station).
    const segments: { line: string; from: string; to: string; stops: number }[] = [];
    let cur = { line: first.line, from: first.station, to: first.station, stops: 0 };
    for (let i = 1; i < path.length; i++) {
        const n = path[i];
        if (n.line === cur.line) {
            cur.to = n.station;
            cur.stops++;
        } else {
            segments.push(cur);
            cur = { line: n.line, from: path[i - 1].station, to: n.station, stops: 1 };
        }
    }
    segments.push(cur);
    // Walking to a station near the destination and getting out again is just walking.
    if (!segments.some(s => s.stops > 0)) return { ...trip(city, from, to, 'walk', when), legs: [`步行 ${Math.round(walkMinutes(km))} 分钟（地铁不顺路）`] };
    segments.filter(s => s.stops > 0).forEach((s, i) => legs.push(`${i ? '换乘 ' : ''}${lines.get(s.line)!.name} ${s.from} → ${s.to}（${s.stops} 站）`));
    const walkOut = Math.round(walkMinutes(exits.get(done.node.station) ?? 0));
    if (walkOut > 0) legs.push(`出站步行 ${walkOut} 分钟`);
    return { mode: 'metro', minutes: Math.max(1, Math.round(done.total)), cost: metroFare(done.node.km), distance: km, legs, ok: true };
}

/** One way of getting from `from` to `to`, starting at `when`. */
export function trip(city: City, from: Point, to: Point, mode: Mode, when: When): Trip {
    const km = distance(from, to);
    const road = km * ROAD;
    switch (mode) {
        case 'walk': {
            const minutes = Math.max(1, Math.round(walkMinutes(km)));
            return { mode, minutes, cost: 0, distance: km, legs: [`步行 ${minutes} 分钟`], ok: true };
        }
        case 'bike': {
            const minutes = Math.max(2, Math.round((km * DETOUR * 60) / 12 + 3));
            return { mode, minutes, cost: Math.ceil(minutes / 30) * 1.5, distance: km, legs: [`骑共享单车 ${minutes} 分钟`], ok: true };
        }
        case 'taxi': {
            const minutes = Math.max(3, Math.round(5 + (road / carSpeed(when)) * 60));
            return { mode, minutes, cost: taxiFare(road, when), distance: km, legs: [`打车 ${minutes} 分钟（含等车）`], ok: true };
        }
        case 'drive': {
            const minutes = Math.max(2, Math.round((road / carSpeed(when)) * 60 + 5));
            return { mode, minutes, cost: Math.round(road * 0.7), distance: km, legs: [`开车 ${minutes} 分钟（含停车）`], ok: true };
        }
        case 'bus': {
            const night = isNight(when);
            const minutes = Math.round(((road / carSpeed(when)) * 60) * 1.8 + (night ? 20 : 8));
            return { mode, minutes, cost: 2, distance: km, legs: [`${night ? '夜班车' : '公交'} ${minutes} 分钟（含等车）`], ok: true };
        }
        case 'metro':
            return metroTrip(city, from, to, when);
    }
}

/**
 * The way most people would go: walk when it is close, the metro while it runs (unless a taxi
 * saves a lot of time), a taxi at night. `prefer` is the protagonist's habit, used when possible.
 */
export function bestTrip(city: City, from: Point, to: Point, when: When, prefer?: Mode): Trip {
    if (prefer) {
        const t = trip(city, from, to, prefer, when);
        if (t.ok) return t;
    }
    const km = distance(from, to);
    if (km <= 1) return trip(city, from, to, 'walk', when);
    const metro = trip(city, from, to, 'metro', when);
    const taxi = trip(city, from, to, 'taxi', when);
    if (!metro.ok) return km <= 2 ? trip(city, from, to, 'walk', when) : taxi;
    if (km <= 1.8) {
        const walk = trip(city, from, to, 'walk', when);
        if (walk.minutes <= metro.minutes + 5) return walk;
    }
    return metro.minutes <= taxi.minutes + 15 ? metro : taxi;
}

export { hhmm };

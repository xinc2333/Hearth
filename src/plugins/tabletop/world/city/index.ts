// 澜江市 in map coordinates: everything from shape.ts, transit.ts and places.ts projected to
// kilometres around 市民广场 (see geo.ts), with each place's district worked out from where it is.

import { area, centroid, inside, project, type LonLat, type Point } from './geo.ts';
import { LANDMARKS, type PlaceKind } from './places.ts';
import { COAST, DISTRICTS, HILLS, LAKES, MAINLAND, RIVERS, SEAS } from './shape.ts';
import { LINES, METRO_HOURS, ROADS } from './transit.ts';

export { SCALE, distance, inside, type Point } from './geo.ts';
export { KIND_LABEL, type PlaceKind } from './places.ts';

export interface District {
    id: string;
    name: string;
    model: string;
    population: number;
    about: string;
    outline: Point[][];
    /** Where its name goes on the map: the centre of its largest piece. */
    label: Point;
    /** Land area, km². */
    area: number;
}

export interface Station {
    name: string;
    at: Point;
    /** Ids of the lines that stop here. */
    lines: string[];
}

export interface Line {
    id: string;
    name: string;
    color: string;
    loop: boolean;
    speed: number;
    interval: [number, number];
    stations: string[];
}

export interface Place {
    id: string;
    name: string;
    kind: PlaceKind;
    at: Point;
    district: string;
    hours: string;
    about: string;
}

export interface City {
    name: string;
    districts: District[];
    mainland: Point[];
    coast: Point[][];
    lakes: { name: string; outline: Point[] }[];
    rivers: { name: string; width: [number, number][]; course: Point[] }[];
    hills: { name: string; at: Point; r: number; height: number }[];
    seas: { name: string; at: Point }[];
    roads: { name: string; kind: 'ring' | 'elevated' | 'bridge'; loop: boolean; course: Point[] }[];
    lines: Line[];
    stations: Map<string, Station>;
    metroHours: { first: string; last: string };
    places: Place[];
    /** Bounds of the land, [minX, minY, maxX, maxY]. */
    bounds: [number, number, number, number];
}

const projectAll = (points: readonly LonLat[]) => points.map(project);
/** A degree of latitude in map kilometres. */
const kmPerDegree = (() => {
    const [, y0] = project([0, 0]);
    const [, y1] = project([0, 1]);
    return Math.abs(y0 - y1);
})();

/** The district a point lies in, if any. */
export function districtAt(city: Pick<City, 'districts'>, point: Point): District | undefined {
    return city.districts.find(d => d.outline.some(part => inside(point, part)));
}

let built: City | null = null;

/** The city, built once. */
export function lanjiang(): City {
    if (built) return built;
    const districts: District[] = DISTRICTS.map(d => {
        const outline = d.outline.map(projectAll);
        const largest = outline.reduce((a, b) => (area(b) > area(a) ? b : a));
        return {
            id: d.id, name: d.name, model: d.model, population: d.population, about: d.about, outline,
            label: centroid(largest),
            area: Math.round(outline.reduce((s, p) => s + area(p), 0)),
        };
    });
    const stations = new Map<string, Station>();
    const lines: Line[] = LINES.map(l => {
        for (const [name, at] of l.stations) {
            const known = stations.get(name);
            if (known) known.lines.includes(l.id) || known.lines.push(l.id);
            else stations.set(name, { name, at: project(at), lines: [l.id] });
        }
        return { id: l.id, name: l.name, color: l.color, loop: Boolean(l.loop), speed: l.speed, interval: l.interval, stations: l.stations.map(([n]) => n) };
    });
    const city: Omit<City, 'places' | 'bounds'> = {
        name: '澜江市',
        districts,
        mainland: projectAll(MAINLAND),
        coast: COAST.map(projectAll),
        lakes: LAKES.map(l => ({ name: l.name, outline: projectAll(l.outline) })),
        rivers: RIVERS.map(r => ({ name: r.name, width: r.width, course: projectAll(r.course) })),
        hills: HILLS.map(h => ({ name: h.name, at: project(h.at), r: h.r * kmPerDegree, height: h.height })),
        seas: SEAS.map(s => ({ name: s.name, at: project(s.at) })),
        roads: ROADS.map(r => ({ name: r.name, kind: r.kind, loop: Boolean(r.loop), course: projectAll(r.course) })),
        lines,
        stations,
        metroHours: METRO_HOURS,
    };
    const places: Place[] = LANDMARKS.map((p, i) => {
        const at = project(p.at);
        return { id: `p${i + 1}`, name: p.name, kind: p.kind, at, district: districtAt(city, at)?.id ?? '', hours: p.hours, about: p.about };
    });
    const all = [...city.mainland, ...districts.flatMap(d => d.outline.flat())];
    const bounds: City['bounds'] = [
        Math.min(...all.map(p => p[0])), Math.min(...all.map(p => p[1])),
        Math.max(...all.map(p => p[0])), Math.max(...all.map(p => p[1])),
    ];
    built = { ...city, places, bounds };
    return built;
}

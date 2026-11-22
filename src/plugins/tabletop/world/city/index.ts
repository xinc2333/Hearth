// 澜江市 in map coordinates: everything from shape.ts, detail.ts, transit.ts and places.ts projected
// to kilometres around 市民广场 (see geo.ts), each place's district worked out from where it is, and
// the everyday places generated around stations, landmarks and towns (everyday.ts).

import { AIRPORTS, CANALS, GREENS, INDUSTRY, RESERVOIRS, SHOALS, TOWNS, URBAN, type Blob } from './detail.ts';
import { everydayPlaces, hash, type Anchor } from './everyday.ts';
import { area, blobOutline, centroid, distance, distanceToLine, inside, project, type LonLat, type Point } from './geo.ts';
import { LANDMARKS, type PlaceKind } from './places.ts';
import { COAST, DISTRICTS, HILLS, LAKES, MAINLAND, RIVERS, SEAS } from './shape.ts';
import { CROSSINGS, LINES, METRO_HOURS, RAILS, ROADS, type RoadShape } from './transit.ts';

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
    /** A landmark written by hand, rather than an everyday place. */
    landmark: boolean;
}

export interface Area {
    name: string;
    outline: Point[];
}

export interface City {
    name: string;
    districts: District[];
    mainland: Point[];
    /** Islands, including the offshore port. */
    islands: Point[][];
    coast: Point[][];
    lakes: Area[];
    rivers: { name: string; width: [number, number][]; course: Point[]; minor: boolean }[];
    hills: { name: string; at: Point; r: number; height: number }[];
    seas: { name: string; at: Point }[];
    urban: Area[];
    industry: Area[];
    greens: Area[];
    shoals: Area[];
    airports: { name: string; area: Point[]; runways: [Point, Point][] }[];
    towns: { name: string; at: Point }[];
    roads: { name: string; kind: RoadShape['kind']; loop: boolean; course: Point[] }[];
    rails: { name: string; course: Point[] }[];
    crossings: { name: string; kind: 'bridge' | 'tunnel'; at: Point }[];
    lines: Line[];
    stations: Map<string, Station>;
    metroHours: { first: string; last: string };
    places: Place[];
    /** Bounds of the land, [minX, minY, maxX, maxY]. */
    bounds: [number, number, number, number];
}

const projectAll = (points: readonly LonLat[]) => points.map(project);
/** A degree of latitude in map kilometres. */
const kmPerDegree = Math.abs(project([0, 0])[1] - project([0, 1])[1]);

const areas = (blobs: Blob[]): Area[] => blobs.map(b => ({ name: b.name, outline: projectAll(blobOutline(b, hash(b.name) % 7)) }));

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
    const mainland = projectAll(MAINLAND);
    const rivers = [
        ...RIVERS.map(r => ({ name: r.name, width: r.width, course: projectAll(r.course), minor: false })),
        ...CANALS.map(([name, width, course]) => ({ name, width: [[0, width]] as [number, number][], course: projectAll(course), minor: true })),
    ];
    const lakes = [...LAKES.map(l => ({ name: l.name, outline: projectAll(l.outline) })), ...areas(RESERVOIRS)];
    const airports = AIRPORTS.map(a => ({ name: a.name, area: projectAll(a.area), runways: a.runways.map(([p, q]) => [project(p), project(q)] as [Point, Point]) }));
    const urban = areas(URBAN);
    const base = { districts };
    const landmarks: Place[] = LANDMARKS.map((p, i) => {
        const at = project(p.at);
        return { id: `p${i + 1}`, name: p.name, kind: p.kind, at, district: districtAt(base, at)?.id ?? '', hours: p.hours, about: p.about, landmark: true };
    });
    const towns = TOWNS.map(([name, at]) => ({ name, at: project(at) }));

    // Everyday places, around stations, landmarks (not airports or industry) and towns.
    const centre = urban[0].outline;
    const density = (at: Point): Anchor['density'] => (inside(at, centre) ? (distance(at, [0, 0]) < 6 ? 3 : 2) : urban.some(u => inside(at, u.outline)) ? 2 : 1);
    const anchors: Anchor[] = [];
    const named = new Set<string>();
    const addAnchor = (name: string, at: Point) => {
        if (named.has(name)) return;
        const district = districtAt(base, at)?.id;
        if (!district) return;
        named.add(name);
        anchors.push({ name, at, district, density: density(at) });
    };
    for (const s of stations.values()) addAnchor(s.name, s.at);
    for (const p of landmarks) if (p.kind !== 'airport' && p.kind !== 'industry') addAnchor(p.name, p.at);
    for (const t of towns) addAnchor(t.name, t.at);
    const taken: Point[] = landmarks.map(p => p.at);
    const free = (at: Point) => {
        if (!districtAt(base, at)) return false;
        if (lakes.some(l => inside(at, l.outline))) return false;
        if (airports.some(a => inside(at, a.area))) return false;
        for (const r of rivers) {
            const half = (Math.max(...r.width.map(w => w[1])) / 1000) * 0.25;
            if (distanceToLine(at, r.course) < half + 0.06) return false;
        }
        if (taken.some(p => distance(p, at) < 0.09)) return false;
        taken.push(at);
        return true;
    };
    const everyday: Place[] = everydayPlaces(anchors, free, [...landmarks.map(p => p.name), ...stations.keys(), ...towns.map(t => t.name)]).map(p => ({ ...p, district: districtAt(base, p.at)!.id, landmark: false }));

    // The map's bounds leave out the offshore port, which would shrink everything else.
    const all = [...mainland, ...districts.filter(d => d.id === 'cangzhou').flatMap(d => d.outline.flat())];
    built = {
        name: '澜江市',
        districts,
        mainland,
        islands: districts.flatMap(d => (d.id === 'cangzhou' ? d.outline : d.outline.slice(1))),
        coast: COAST.map(projectAll),
        lakes,
        rivers,
        hills: HILLS.map(h => ({ name: h.name, at: project(h.at), r: h.r * kmPerDegree, height: h.height })),
        seas: SEAS.map(s => ({ name: s.name, at: project(s.at) })),
        urban,
        industry: areas(INDUSTRY),
        greens: areas(GREENS),
        shoals: areas(SHOALS),
        airports,
        towns,
        roads: ROADS.map(r => ({ name: r.name, kind: r.kind, loop: Boolean(r.loop), course: projectAll(r.course) })),
        rails: RAILS.map(([name, course]) => ({ name, course: projectAll(course) })),
        crossings: CROSSINGS.map(([name, kind, at]) => ({ name, kind, at: project(at) })),
        lines,
        stations,
        metroHours: METRO_HOURS,
        places: [...landmarks, ...everyday],
        bounds: [
            Math.min(...all.map(p => p[0])), Math.min(...all.map(p => p[1])),
            Math.max(...all.map(p => p[0])), Math.max(...all.map(p => p[1])),
        ],
    };
    return built;
}

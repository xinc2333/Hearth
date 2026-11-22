// Draws the 澜江市 map as an SVG document. The window's 「地图」 page and the tests use the same
// drawing; the coordinates are map kilometres (see city/geo.ts), so the SVG viewBox is in km too.
// What is drawn depends on how much of the city is in view: the whole city shows districts, big
// roads and the metro; zooming in adds streets, station and landmark names, then everyday places.

import { SCALE } from './city/geo.ts';
import type { Area, City, Place, Point } from './city/index.ts';

export interface MapMarker {
    at: Point;
    label: string;
    kind: 'self' | 'person' | 'appointment';
}

export interface MapOptions {
    /** Which part of the map to show, [minX, minY, maxX, maxY] in km; the whole city by default. */
    view?: [number, number, number, number];
    /** Output width in pixels (the height follows the view). */
    width?: number;
    markers?: MapMarker[];
}

const C = {
    sea: '#c6dcea',
    shoal: '#e4dcc4',
    land: '#e8edd9',
    urban: '#f3eee5',
    industry: '#e4e0e4',
    green: '#c9e0b2',
    hill: '#b7d39c',
    water: '#a5cbe3',
    coast: '#93b8cf',
    border: '#a99a86',
    airport: '#dedce4',
    runway: '#aeacb8',
    fast: '#f6cf86',
    fastEdge: '#d6a75a',
    elevated: '#fadfab',
    elevatedEdge: '#dcb67c',
    street: '#ffffff',
    streetEdge: '#dbd1c2',
    rail: '#8b8680',
    text: '#43392f',
    muted: '#7a6d5f',
    district: '#8c7e6e',
    park: '#4f7d3a',
    seaText: '#5f8aa3',
    self: '#c2410c',
    person: '#1f6f8b',
    appointment: '#7a4fb0',
} as const;

/** Icon colours of places, by what they are for. */
const KIND_COLOR: Record<Place['kind'], string> = {
    food: '#d9822b', cafe: '#b8743a', bar: '#a8487a', shop: '#8b62b8', market: '#8b62b8', mall: '#8b62b8',
    residence: '#9a8f82', office: '#7b7f8e', industry: '#7b7f8e', hotel: '#5a77b5',
    school: '#3f7fb3', hospital: '#c0453b', police: '#3a5a9a', government: '#3a5a9a',
    park: '#4f8a3a', sight: '#3f8f7a', fun: '#3f8f7a', gym: '#3f8f7a', station: '#4a4a4a', airport: '#4a4a4a',
};

const FONT = "'Noto Sans CJK SC', 'Microsoft YaHei', 'PingFang SC', sans-serif";

const f = (n: number) => (Math.round(n * 1000) / 1000).toString();
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const line = (points: readonly Point[], close = false) => `M${points.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}${close ? 'Z' : ''}`;
const polyPath = (parts: readonly (readonly Point[])[]) => parts.map(p => line(p, true)).join('');

/** Width in metres at a course index, from [index, metres] control points. */
function widthAt(points: [number, number][], i: number): number {
    for (let k = 1; k < points.length; k++) {
        const [i0, w0] = points[k - 1];
        const [i1, w1] = points[k];
        if (i <= i1) return w0 + ((w1 - w0) * (i - i0)) / (i1 - i0 || 1);
    }
    return points[points.length - 1][1];
}

/** A river as a filled band along its course; never thinner than `min` km on each bank so it stays visible. */
function riverBand(course: readonly Point[], widths: [number, number][], min: number): string {
    const left: Point[] = [];
    const right: Point[] = [];
    course.forEach((p, i) => {
        const prev = course[Math.max(0, i - 1)];
        const next = course[Math.min(course.length - 1, i + 1)];
        const dx = next[0] - prev[0];
        const dy = next[1] - prev[1];
        const len = Math.hypot(dx, dy) || 1;
        // Metres at Shanghai's size, scaled like every other distance; half on each bank.
        const half = Math.max(min, ((widthAt(widths, i) / 1000) * SCALE) / 2);
        left.push([p[0] - (dy / len) * half, p[1] + (dx / len) * half]);
        right.push([p[0] + (dy / len) * half, p[1] - (dx / len) * half]);
    });
    return polyPath([[...left, ...right.reverse()]]);
}

/**
 * Text drawn at pixel size and scaled into the map: renderers lay out glyphs badly at the tiny
 * font sizes map kilometres would need. The halo is a stroked copy under the text.
 */
function text(x: number, y: number, u: number, size: number, content: string, color: string, attrs: string, halo?: { width: number; color: string }): string {
    const open = `<text transform="translate(${f(x)} ${f(y)}) scale(${f(u)})" font-size="${size}" ${attrs}`;
    const body = esc(content);
    const under = halo ? `${open} fill="none" stroke="${halo.color}" stroke-width="${halo.width}" stroke-linejoin="round">${body}</text>` : '';
    return `${under}${open} fill="${color}">${body}</text>`;
}

/** Places labels without overlap: each label tries a few spots around its point and is dropped when none is free. */
class Labels {
    private boxes: [number, number, number, number][] = [];
    private u: number;
    constructor(u: number) {
        this.u = u;
    }

    block(x: number, y: number, r: number) {
        this.boxes.push([x - r, y - r, x + r, y + r]);
    }

    place(label: string, x: number, y: number, size: number, color: string, gap: number, attrs = ''): string {
        const u = this.u;
        const w = label.length * size * u * 1.02;
        const h = size * u * 1.15;
        const g = gap * u;
        const spots: [number, number, 'start' | 'end' | 'middle'][] = [
            [x + g, y + h * 0.35, 'start'], [x - g, y + h * 0.35, 'end'], [x, y - g, 'middle'], [x, y + g + h * 0.8, 'middle'],
        ];
        for (const [tx, ty, anchor] of spots) {
            const left = anchor === 'start' ? tx : anchor === 'end' ? tx - w : tx - w / 2;
            const box: [number, number, number, number] = [left, ty - h * 0.85, left + w, ty + h * 0.15];
            if (this.boxes.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
            this.boxes.push(box);
            return text(tx, ty, u, size, label, color, `text-anchor="${anchor}"${attrs}`, { width: 3, color: C.urban });
        }
        return '';
    }
}

/** Old inner-city districts have small, irregular blocks. */
const SMALL_BLOCKS = new Set(['zhongcheng', 'bei-an', 'anhua']);

/**
 * Side streets when zoomed in: a grid of small streets over the built-up land of each district,
 * turned a little differently in every district so the city looks pieced together, as real ones do.
 * Parks and water are drawn over it.
 */
function streetGrid(city: City, u: number): string[] {
    const out: string[] = [];
    const urban = polyPath(city.urban.map(a => a.outline));
    city.districts.forEach((d, i) => {
        if (d.id === 'cangzhou') return;
        const [bw, bh] = SMALL_BLOCKS.has(d.id) ? [0.11, 0.14] : [0.19, 0.24];
        const turn = ((i * 37) % 31) - 15;
        out.push(`<clipPath id="clip-${d.id}"><path d="${polyPath(d.outline)}"/></clipPath>`);
        out.push(`<pattern id="grid-${d.id}" patternUnits="userSpaceOnUse" width="${f(bw)}" height="${f(bh)}" patternTransform="rotate(${turn})"><path d="M0 ${f(bh / 2)}H${f(bw)}M${f(bw / 2)} 0V${f(bh)}" stroke="${C.street}" stroke-width="${f(1.8 * u)}"/></pattern>`);
        out.push(`<path d="${urban}" fill="url(#grid-${d.id})" clip-path="url(#clip-${d.id})"/>`);
    });
    return out;
}

/** How much detail to draw: 0 the whole city, 1 part of the city, 2 a few streets. */
export function detailLevel(viewWidth: number): 0 | 1 | 2 {
    return viewWidth > 30 ? 0 : viewWidth > 8 ? 1 : 2;
}

export function mapSvg(city: City, opts: MapOptions = {}): string {
    const pad = 1.5;
    const [x0, y0, x1, y1] = opts.view ?? [city.bounds[0] - pad, city.bounds[1] - pad, city.bounds[2] + pad, city.bounds[3] + pad];
    const w = x1 - x0;
    const h = y1 - y0;
    const width = opts.width ?? 1200;
    const height = Math.round((width * h) / w);
    // Sizes below are in screen pixels; `u` turns them into km so they look the same at any zoom.
    const u = w / width;
    const level = detailLevel(w);
    const seen = (p: Point, margin = 0) => p[0] >= x0 - margin && p[0] <= x1 + margin && p[1] >= y0 - margin && p[1] <= y1 + margin;
    const out: string[] = [];
    const fill = (areas: Area[], color: string, extra = '') => {
        if (areas.length) out.push(`<path d="${polyPath(areas.map(a => a.outline))}" fill="${color}"${extra}/>`);
    };

    out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(x0)} ${f(y0)} ${f(w)} ${f(h)}" width="${width}" height="${height}" font-family="${FONT}">`);
    out.push(`<rect x="${f(x0)}" y="${f(y0)}" width="${f(w)}" height="${f(h)}" fill="${C.sea}"/>`);
    fill(city.shoals, C.shoal, ' opacity="0.85"');
    // Land: countryside first, then the built-up areas, industry and green spaces on top.
    out.push(`<path d="${polyPath([city.mainland, ...city.islands])}" fill="${C.land}" stroke="${C.coast}" stroke-width="${f(1.2 * u)}" stroke-linejoin="round"/>`);
    fill(city.urban, C.urban);
    fill(city.industry, C.industry);
    if (level === 2) out.push(...streetGrid(city, u));
    for (const hill of city.hills) out.push(`<circle cx="${f(hill.at[0])}" cy="${f(hill.at[1])}" r="${f(hill.r)}" fill="${C.hill}"/>`);
    fill(city.greens, C.green);
    for (const a of city.airports) {
        out.push(`<path d="${polyPath([a.area])}" fill="${C.airport}"/>`);
        for (const [p, q] of a.runways) out.push(`<path d="${line([p, q])}" stroke="${C.runway}" stroke-width="${f(Math.max(0.03, 2 * u))}"/>`);
    }
    // Water.
    fill(city.lakes, C.water);
    for (const r of city.rivers) out.push(`<path d="${riverBand(r.course, r.width, (r.minor ? 0.6 : 1.2) * u)}" fill="${C.water}"/>`);
    // District borders (the islands of 沧洲区 and the offshore port need none).
    out.push(`<path d="${polyPath(city.districts.filter(d => d.id !== 'cangzhou').map(d => d.outline[0]))}" fill="none" stroke="${C.border}" stroke-width="${f(0.9 * u)}" stroke-dasharray="${f(5 * u)} ${f(3 * u)}" stroke-linejoin="round" opacity="0.8"/>`);
    // Railways: grey with white dashes.
    for (const r of city.rails) {
        const d = line(r.course);
        out.push(`<path d="${d}" fill="none" stroke="${C.rail}" stroke-width="${f(2.6 * u)}" stroke-linejoin="round"/>`);
        out.push(`<path d="${d}" fill="none" stroke="#fff" stroke-width="${f(1.2 * u)}" stroke-dasharray="${f(5 * u)} ${f(5 * u)}"/>`);
    }
    // Roads: every casing first, then every fill, smaller roads under bigger ones.
    const roadStyle = {
        arterial: { edge: C.streetEdge, fill: C.street, width: 2.6 },
        elevated: { edge: C.elevatedEdge, fill: C.elevated, width: 3.2 },
        expressway: { edge: C.fastEdge, fill: C.fast, width: 3.4 },
        bridge: { edge: C.fastEdge, fill: C.fast, width: 3 },
        ring: { edge: C.fastEdge, fill: C.fast, width: 3.6 },
    } as const;
    const roads = city.roads.filter(r => level > 0 || r.kind !== 'arterial');
    const scale = level === 0 ? 0.7 : 1;
    for (const pass of ['edge', 'fill'] as const) {
        for (const kind of ['arterial', 'elevated', 'expressway', 'bridge', 'ring'] as const) {
            const s = roadStyle[kind];
            for (const r of roads.filter(x => x.kind === kind)) {
                out.push(`<path d="${line(r.course, r.loop)}" fill="none" stroke="${pass === 'edge' ? s.edge : s.fill}" stroke-width="${f((pass === 'edge' ? s.width + 1.4 : s.width) * scale * u)}" stroke-linejoin="round" stroke-linecap="round"/>`);
            }
        }
    }
    // Metro lines and stations.
    const lineWidth = level === 0 ? 2.2 : level === 1 ? 3 : 4;
    for (const l of city.lines) {
        const course = l.stations.map(n => city.stations.get(n)!.at);
        out.push(`<path d="${line(course, l.loop)}" fill="none" stroke="${l.color}" stroke-width="${f(lineWidth * u)}" stroke-linejoin="round" stroke-linecap="round"${l.id === 'JS' ? ` stroke-dasharray="${f(7 * u)} ${f(3 * u)}"` : ''}/>`);
    }
    const stations = [...city.stations.values()].sort((a, b) => b.lines.length - a.lines.length);
    for (const s of stations) {
        const transfer = s.lines.length > 1;
        if (level === 0 && !transfer) continue;
        const color = transfer ? C.text : city.lines.find(l => l.id === s.lines[0])!.color;
        const r = (transfer ? 3.6 : 2.6) * (level === 2 ? 1.25 : 1);
        out.push(`<circle cx="${f(s.at[0])}" cy="${f(s.at[1])}" r="${f(r * u)}" fill="#fff" stroke="${color}" stroke-width="${f(1.4 * u)}"/>`);
    }
    // Place icons: landmarks when part of the city is in view, everything when zoomed in to a few streets.
    const places = level === 0 ? [] : city.places.filter(p => (level === 2 || p.landmark) && seen(p.at, 0.5) && !city.stations.has(p.name));
    for (const p of places) {
        const r = (p.landmark ? 2.8 : 2.2) * u;
        out.push(`<circle cx="${f(p.at[0])}" cy="${f(p.at[1])}" r="${f(r)}" fill="${KIND_COLOR[p.kind]}" stroke="#fff" stroke-width="${f(0.9 * u)}"/>`);
    }
    if (level === 0) for (const t of city.towns) out.push(`<circle cx="${f(t.at[0])}" cy="${f(t.at[1])}" r="${f(1.6 * u)}" fill="${C.muted}"/>`);

    // Labels: district and sea names under everything else, then the rest without overlap, most important first.
    for (const d of city.districts) {
        out.push(text(d.label[0], d.label[1], u, level === 0 ? 15 : 20, d.name, C.district, 'text-anchor="middle" dominant-baseline="middle" letter-spacing="3" opacity="0.55"'));
    }
    for (const sea of city.seas) out.push(text(sea.at[0], sea.at[1], u, 14, sea.name, C.seaText, 'text-anchor="middle" letter-spacing="4"'));
    const labels = new Labels(u);
    for (const m of opts.markers ?? []) labels.block(m.at[0], m.at[1], 9 * u);
    const named: string[] = [];
    if (level > 0) {
        for (const s of stations) {
            if (!seen(s.at) || (level === 1 && s.lines.length < 2)) continue;
            named.push(labels.place(s.name, s.at[0], s.at[1], s.lines.length > 1 ? 12 : 11, C.text, 6, ' font-weight="500"'));
        }
        for (const p of places.filter(x => x.landmark)) named.push(labels.place(p.name, p.at[0], p.at[1], 11, C.muted, 5));
        for (const t of city.towns) if (seen(t.at)) named.push(labels.place(t.name, t.at[0], t.at[1], 11, C.muted, 4));
        const landmarkNames = new Set(city.places.filter(p => p.landmark).map(p => p.name));
        for (const g of city.greens) {
            if (landmarkNames.has(g.name)) continue;
            const [cx, cy] = g.outline.reduce(([sx, sy], [x, y]) => [sx + x / g.outline.length, sy + y / g.outline.length], [0, 0]);
            if (seen([cx, cy])) named.push(labels.place(g.name, cx, cy, 10.5, C.park, 0));
        }
        for (const c of city.crossings) if (seen(c.at)) named.push(labels.place(c.name, c.at[0], c.at[1], 10, C.muted, 5));
        for (const p of places.filter(x => !x.landmark)) named.push(labels.place(p.name, p.at[0], p.at[1], 10, C.muted, 4));
    }
    out.push(...named.filter(Boolean));

    // People and appointments on top.
    for (const m of opts.markers ?? []) {
        const color = C[m.kind];
        const [x, y] = m.at;
        out.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(7 * u)}" fill="${color}" stroke="#fff" stroke-width="${f(2.2 * u)}"/>`);
        out.push(text(x, y - 11 * u, u, 12.5, m.label, color, 'text-anchor="middle" font-weight="bold"', { width: 3.5, color: '#fff' }));
    }
    // Scale bar.
    const bar = w > 30 ? 5 : w > 8 ? 1 : w > 3 ? 0.5 : 0.2;
    const bx = x0 + 20 * u;
    const by = y1 - 20 * u;
    out.push(`<path d="M${f(bx)} ${f(by)}h${f(bar)}" stroke="${C.text}" stroke-width="${f(2 * u)}"/>`);
    out.push(text(bx + bar / 2, by - 6 * u, u, 11, bar >= 1 ? `${bar} km` : `${Math.round(bar * 1000)} m`, C.text, 'text-anchor="middle"'));
    out.push('</svg>');
    return out.join('\n');
}

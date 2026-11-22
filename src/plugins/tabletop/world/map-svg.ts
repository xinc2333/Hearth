// Draws the 澜江市 map as an SVG document. The window's 「地图」 page and the tests use the same
// drawing; the coordinates are map kilometres (see city/geo.ts), so the SVG viewBox is in km too.

import { SCALE } from './city/geo.ts';
import type { City, Place, Point } from './city/index.ts';

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
    /** Show station names (best when zoomed in). */
    stationNames?: boolean;
    /** Show landmark names. */
    placeNames?: boolean;
}

const COLORS = {
    sea: '#cfe3ee',
    land: '#f4efe6',
    water: '#a9cde3',
    border: '#b9ab98',
    coast: '#8fb4c9',
    ring: '#ffffff',
    ringEdge: '#d9cfc0',
    elevated: '#e8c98f',
    hill: '#c9d8b4',
    text: '#4a4036',
    muted: '#7d7062',
    self: '#c2410c',
    person: '#1f6f8b',
    appointment: '#7a4fb0',
} as const;

const FONT = "'Noto Sans CJK SC', 'Microsoft YaHei', 'PingFang SC', sans-serif";

const f = (n: number) => (Math.round(n * 1000) / 1000).toString();
const pts = (points: readonly Point[]) => points.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const line = (points: readonly Point[], close = false) => `M${points.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}${close ? 'Z' : ''}`;

function polyPath(parts: readonly (readonly Point[])[]): string {
    return parts.map(p => line(p, true)).join('');
}

/** Width in metres at a course index, from [index, metres] control points. */
function widthAt(points: [number, number][], i: number): number {
    for (let k = 1; k < points.length; k++) {
        const [i0, w0] = points[k - 1];
        const [i1, w1] = points[k];
        if (i <= i1) return w0 + ((w1 - w0) * (i - i0)) / (i1 - i0 || 1);
    }
    return points[points.length - 1][1];
}

/** A river as a filled band that follows its course with the given widths. */
function riverBand(course: readonly Point[], widths: [number, number][]): string {
    const left: Point[] = [];
    const right: Point[] = [];
    course.forEach((p, i) => {
        const prev = course[Math.max(0, i - 1)];
        const next = course[Math.min(course.length - 1, i + 1)];
        const dx = next[0] - prev[0];
        const dy = next[1] - prev[1];
        const len = Math.hypot(dx, dy) || 1;
        // Metres at Shanghai's size, scaled like every other distance; half on each bank.
        const half = (widthAt(widths, i) / 1000) * SCALE / 2;
        left.push([p[0] - (dy / len) * half, p[1] + (dx / len) * half]);
        right.push([p[0] + (dy / len) * half, p[1] - (dx / len) * half]);
    });
    return polyPath([[...left, ...right.reverse()]]);
}

const PLACE_SHAPE: Partial<Record<Place['kind'], 'square' | 'diamond' | 'triangle'>> = {
    office: 'square', industry: 'square', government: 'square', school: 'diamond', hospital: 'diamond', police: 'diamond',
    station: 'triangle', airport: 'triangle',
};

function placeMark(p: Place, r: number, stroke: number): string {
    const [x, y] = p.at;
    const shape = PLACE_SHAPE[p.kind];
    const style = `fill="#fff" stroke="${COLORS.muted}" stroke-width="${f(stroke)}"`;
    if (shape === 'square') return `<rect x="${f(x - r)}" y="${f(y - r)}" width="${f(2 * r)}" height="${f(2 * r)}" ${style}/>`;
    if (shape === 'diamond') return `<polygon points="${pts([[x, y - r * 1.3], [x + r * 1.3, y], [x, y + r * 1.3], [x - r * 1.3, y]])}" ${style}/>`;
    if (shape === 'triangle') return `<polygon points="${pts([[x, y - r * 1.3], [x + r * 1.2, y + r], [x - r * 1.2, y + r]])}" ${style}/>`;
    return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" ${style}/>`;
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

    /** Keeps an area free (e.g. a marker) so later labels avoid it. */
    block(x: number, y: number, r: number) {
        this.boxes.push([x - r, y - r, x + r, y + r]);
    }

    /** Text with a halo at the first free spot around (x, y), or nothing. */
    place(label: string, x: number, y: number, size: number, color: string, gap: number): string {
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
            return text(tx, ty, u, size, label, color, `text-anchor="${anchor}"`, { width: 3, color: COLORS.land });
        }
        return '';
    }
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
    const out: string[] = [];
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(x0)} ${f(y0)} ${f(w)} ${f(h)}" width="${width}" height="${height}" font-family="${FONT}">`);
    out.push(`<rect x="${f(x0)}" y="${f(y0)}" width="${f(w)}" height="${f(h)}" fill="${COLORS.sea}"/>`);
    // Land: the mainland and the islands.
    const islands = city.districts.filter(d => d.id === 'cangzhou').flatMap(d => d.outline);
    out.push(`<path d="${polyPath([city.mainland, ...islands])}" fill="${COLORS.land}" stroke="${COLORS.coast}" stroke-width="${f(1.2 * u)}" stroke-linejoin="round"/>`);
    for (const hill of city.hills) out.push(`<circle cx="${f(hill.at[0])}" cy="${f(hill.at[1])}" r="${f(hill.r)}" fill="${COLORS.hill}"/>`);
    for (const lake of city.lakes) out.push(`<path d="${polyPath([lake.outline])}" fill="${COLORS.water}"/>`);
    for (const river of city.rivers) out.push(`<path d="${riverBand(river.course, river.width)}" fill="${COLORS.water}"/>`);
    // District borders.
    out.push(`<path d="${polyPath(city.districts.filter(d => d.id !== 'cangzhou').flatMap(d => d.outline))}" fill="none" stroke="${COLORS.border}" stroke-width="${f(0.8 * u)}" stroke-dasharray="${f(4 * u)} ${f(3 * u)}" stroke-linejoin="round"/>`);
    // Roads under the metro.
    for (const road of city.roads) {
        const d = line(road.course, road.loop);
        const color = road.kind === 'ring' ? COLORS.ring : COLORS.elevated;
        out.push(`<path d="${d}" fill="none" stroke="${COLORS.ringEdge}" stroke-width="${f(4 * u)}" stroke-linejoin="round" stroke-linecap="round"/>`);
        out.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${f(2.4 * u)}" stroke-linejoin="round" stroke-linecap="round"${road.kind === 'bridge' ? ` stroke-dasharray="${f(5 * u)} ${f(3 * u)}"` : ''}/>`);
    }
    // Area names.
    for (const d of city.districts) {
        out.push(text(d.label[0], d.label[1], u, 15, d.name, COLORS.muted, 'text-anchor="middle" dominant-baseline="middle" letter-spacing="2" opacity="0.8"'));
    }
    for (const sea of city.seas) {
        out.push(text(sea.at[0], sea.at[1], u, 14, sea.name, '#6f95ab', 'text-anchor="middle" letter-spacing="3"'));
    }
    // Metro lines and stations.
    for (const l of city.lines) {
        const course = l.stations.map(n => city.stations.get(n)!.at);
        out.push(`<path d="${line(course, l.loop)}" fill="none" stroke="${l.color}" stroke-width="${f(3 * u)}" stroke-linejoin="round" stroke-linecap="round"${l.id === 'JS' ? ` stroke-dasharray="${f(6 * u)} ${f(3 * u)}"` : ''}/>`);
    }
    const stations = [...city.stations.values()].sort((a, b) => b.lines.length - a.lines.length);
    for (const s of stations) {
        const transfer = s.lines.length > 1;
        const color = transfer ? COLORS.text : city.lines.find(l => l.id === s.lines[0])!.color;
        out.push(`<circle cx="${f(s.at[0])}" cy="${f(s.at[1])}" r="${f((transfer ? 3.6 : 2.4) * u)}" fill="#fff" stroke="${color}" stroke-width="${f(1.3 * u)}"/>`);
    }
    // Labels, most important first; markers keep their spot free.
    const labels = new Labels(u);
    for (const m of opts.markers ?? []) labels.block(m.at[0], m.at[1], 8 * u);
    const named: string[] = [];
    if (opts.stationNames) {
        for (const s of stations) named.push(labels.place(s.name, s.at[0], s.at[1], s.lines.length > 1 ? 12 : 11, COLORS.text, 5));
    }
    if (opts.placeNames) {
        for (const p of city.places) {
            if (city.stations.has(p.name)) continue;
            out.push(placeMark(p, 2.2 * u, 0.9 * u));
            named.push(labels.place(p.name, p.at[0], p.at[1], 10.5, COLORS.muted, 4));
        }
    }
    out.push(...named.filter(Boolean));
    // People and appointments on top.
    for (const m of opts.markers ?? []) {
        const color = COLORS[m.kind];
        const [x, y] = m.at;
        out.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(6 * u)}" fill="${color}" stroke="#fff" stroke-width="${f(2 * u)}"/>`);
        out.push(text(x, y - 10 * u, u, 12, m.label, color, 'text-anchor="middle" font-weight="bold"', { width: 3.5, color: '#fff' }));
    }
    // Scale bar.
    const bar = w > 30 ? 5 : w > 8 ? 1 : 0.5;
    const bx = x0 + 20 * u;
    const by = y1 - 20 * u;
    out.push(`<path d="M${f(bx)} ${f(by)}h${f(bar)}" stroke="${COLORS.text}" stroke-width="${f(2 * u)}"/>`);
    out.push(text(bx + bar / 2, by - 6 * u, u, 11, bar >= 1 ? `${bar} km` : `${bar * 1000} m`, COLORS.text, 'text-anchor="middle"'));
    out.push('</svg>');
    return out.join('\n');
}

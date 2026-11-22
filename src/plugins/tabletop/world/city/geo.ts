// Map coordinates for 澜江市. The city follows Shanghai's layout scaled down (docs/world.md §4):
// geography is written in longitude/latitude at Shanghai's own size, and projected to kilometres
// around 市民广场 with every distance multiplied by SCALE. Change SCALE to make the city bigger or
// smaller; nothing else depends on the number.

/** [longitude, latitude] at Shanghai's size. */
export type LonLat = readonly [number, number];
/** [east, south] in kilometres from 市民广场, already scaled. */
export type Point = readonly [number, number];

/** Linear scale of 澜江市 against Shanghai: 0.5 halves every distance (a quarter of the area). */
export const SCALE = 0.5;

/** 市民广场, the centre of the map. */
export const ORIGIN: LonLat = [121.475, 31.232];

const KM_PER_LAT = 110.57;
const KM_PER_LON = 111.32 * Math.cos((ORIGIN[1] * Math.PI) / 180);

export function project([lon, lat]: LonLat): Point {
    return [round((lon - ORIGIN[0]) * KM_PER_LON * SCALE), round((ORIGIN[1] - lat) * KM_PER_LAT * SCALE)];
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function distance(a: Point, b: Point): number {
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Ray casting: whether the point lies inside the polygon. */
export function inside(point: Point, polygon: readonly Point[]): boolean {
    const [x, y] = point;
    let hit = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
}

/** Signed area (positive when the points run clockwise on screen, y pointing down). */
export function area(polygon: readonly Point[]): number {
    let sum = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) sum += (polygon[j][0] + polygon[i][0]) * (polygon[j][1] - polygon[i][1]);
    return Math.abs(sum / 2);
}

/** Centre of mass of a polygon, for labels. */
export function centroid(polygon: readonly Point[]): Point {
    let a = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const f = polygon[j][0] * polygon[i][1] - polygon[i][0] * polygon[j][1];
        a += f;
        cx += (polygon[j][0] + polygon[i][0]) * f;
        cy += (polygon[j][1] + polygon[i][1]) * f;
    }
    a /= 2;
    return a ? [round(cx / (6 * a)), round(cy / (6 * a))] : polygon[0];
}

/** Shortest distance from a point to a polyline. */
export function distanceToLine(p: Point, line: readonly Point[]): number {
    let best = Infinity;
    for (let i = 1; i < line.length; i++) {
        const [ax, ay] = line[i - 1];
        const [bx, by] = line[i];
        const dx = bx - ax;
        const dy = by - ay;
        const t = dx || dy ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy))) : 0;
        best = Math.min(best, Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy)));
    }
    return best;
}

/** A blob from detail.ts as a polygon: an explicit outline, or a slightly irregular ellipse. */
export function blobOutline(blob: { at?: LonLat; r?: number; stretch?: number; outline?: readonly LonLat[] }, seed = 0): LonLat[] {
    if (blob.outline) return [...blob.outline];
    const [lon, lat] = blob.at!;
    const r = blob.r!;
    const k = Math.cos((lat * Math.PI) / 180);
    const n = 18;
    return Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        // A gentle wobble so parks and towns do not look like perfect circles.
        const wobble = 1 + 0.12 * Math.sin(3 * a + seed) + 0.06 * Math.cos(5 * a + seed * 1.7);
        return [
            Math.round((lon + ((r * (blob.stretch ?? 1) * wobble * Math.cos(a)) / k)) * 100000) / 100000,
            Math.round((lat + r * wobble * Math.sin(a)) * 100000) / 100000,
        ] as LonLat;
    });
}

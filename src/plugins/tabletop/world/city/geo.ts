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

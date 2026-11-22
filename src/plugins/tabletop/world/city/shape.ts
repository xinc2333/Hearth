// The land, water and districts of 澜江市, at Shanghai's size in longitude/latitude (see geo.ts).
// Districts share their borders through named vertices, so neighbouring districts never overlap or
// leave a gap, and the river 澜江 is itself the border wherever it separates two districts.

import { PORT_ISLAND } from './detail.ts';
import type { LonLat } from './geo.ts';

/** Shared vertices. R: 澜江 from 云湖 to the sea; C: 青溪 from the west to 澜江; O: the coast and the outer border; others: district borders. */
const V = {
    // 澜江 (Huangpu): out of 云湖, east past 西山 and 新庄, north through the centre, into 沧江口.
    R0: [120.985, 31.075], R1: [121.05, 31.02], R2: [121.12, 30.99], R3: [121.2, 30.97], R4: [121.28, 30.98],
    R5: [121.35, 30.99], R6: [121.4, 30.995], R7: [121.45, 31.01], R8: [121.48, 31.02], R9: [121.495, 31.05],
    R10: [121.49, 31.08], R11: [121.48, 31.1], R12: [121.47, 31.12], R13: [121.465, 31.15], R14: [121.47, 31.17],
    R15: [121.478, 31.199], R16: [121.497, 31.214], R17: [121.497, 31.225], R18: [121.492, 31.236], R19: [121.489, 31.244],
    R20: [121.505, 31.249], R20b: [121.513, 31.251], R21: [121.52, 31.252], R22: [121.537, 31.258], R23: [121.565, 31.275],
    R24: [121.567, 31.29], R25: [121.555, 31.31], R26: [121.54, 31.34], R27: [121.52, 31.37], R28: [121.505, 31.39],
    // 青溪 (Suzhou Creek): from the western border east to 江滩.
    C0: [121.1, 31.265], C1: [121.2, 31.25], C2: [121.27, 31.24], Z26: [121.333, 31.228], C4: [121.37, 31.218],
    C5: [121.4, 31.228], C6: [121.42, 31.232], C7: [121.435, 31.245], C8: [121.45, 31.246], C9: [121.465, 31.247],
    C9b: [121.475, 31.2465],
    // Coast and outer border, clockwise from the north-west.
    O1: [121.3, 31.505], O2: [121.37, 31.5], O3: [121.43, 31.46], O4: [121.47, 31.42], O5: [121.56, 31.375],
    O6: [121.61, 31.36], O7: [121.67, 31.345], O8: [121.73, 31.31], O9: [121.79, 31.26], O10: [121.83, 31.21],
    O11: [121.85, 31.16], O12: [121.865, 31.1], O13: [121.89, 31.04], O14: [121.93, 30.97], O15: [121.975, 30.905],
    O16: [121.95, 30.865], O17: [121.86, 30.855], O18: [121.76, 30.86], O19: [121.65, 30.845], O20: [121.55, 30.83],
    O21: [121.47, 30.81], O22: [121.42, 30.77], O23: [121.36, 30.72], O24: [121.3, 30.7], O25: [121.22, 30.695],
    O26: [121.13, 30.74], O27: [121.05, 30.8], O28: [120.98, 30.87], O29: [120.92, 30.93], O30: [120.87, 31],
    O31: [120.86, 31.06], O32: [120.89, 31.13], O33: [120.95, 31.18], O34: [121.03, 31.22], O36: [121.12, 31.34],
    O37: [121.14, 31.41], O38: [121.2, 31.46], O39: [121.25, 31.49],
    // District borders.
    Z1: [121.462, 31.197], Z2: [121.455, 31.205], Z3: [121.458, 31.22], Z4: [121.462, 31.233], Z5: [121.44, 31.215],
    Z6: [121.428, 31.222], Z7: [121.44, 31.27], Z8: [121.445, 31.3], Z9: [121.465, 31.31], Z10: [121.473, 31.28],
    Z11: [121.47, 31.255], Z12: [121.48, 31.325], Z13: [121.5, 31.315], Z14: [121.505, 31.28], Z15: [121.512, 31.26],
    Z16: [121.52, 31.335], Z18: [121.42, 31.19], Z19: [121.432, 31.205], Z20: [121.44, 31.12], Z21: [121.42, 31.14],
    Z22: [121.41, 31.17], Z23: [121.42, 31.305], Z24: [121.38, 31.3], Z25: [121.36, 31.27], Z27: [121.325, 31.205],
    Z28: [121.35, 31.18], Z29: [121.39, 31.175], Z30: [121.32, 31.285], Z31: [121.31, 31.36], Z32: [121.29, 31.43],
    Z33: [121.27, 31.2], Z34: [121.27, 31.16], Z35: [121.18, 31.12], Z36: [121.12, 31.06],
    S1: [121.36, 30.94], S2: [121.22, 30.9], S3: [121.06, 30.9],
    Z39: [121.33, 31.05], Z40: [121.31, 31.12], J1: [121.56, 31], J2: [121.65, 30.94], J3: [121.72, 30.89],
} as const satisfies Record<string, LonLat>;

type VertexId = keyof typeof V;
const path = (ids: string) => ids.trim().split(/\s+/).map(id => V[id as VertexId] ?? fail(id));
const fail = (id: string): never => { throw new Error(`unknown vertex ${id}`); };

export interface DistrictShape {
    id: string;
    name: string;
    /** The Shanghai district it is modelled on. */
    model: string;
    /** Resident population in units of 10,000 (already scaled with the area). */
    population: number;
    /** What the district is like, one line. */
    about: string;
    outline: LonLat[][];
}

export const DISTRICTS: DistrictShape[] = [
    {
        id: 'zhongcheng', name: '中城区', model: '黄浦', population: 17,
        about: '澜江西岸的城市中心：江滩的老建筑群、市民广场、长街步行街、老城厢和城隍庙、石库门街区。',
        outline: [path('C9 C9b R19 R18 R17 R16 R15 Z1 Z2 Z3 Z4')],
    },
    {
        id: 'anhua', name: '安华区', model: '静安', population: 25,
        about: '中城区西北：高档商场和写字楼、安华寺、老洋房，北边是老城北的居住区和普速火车站澜江站。',
        outline: [path('Z4 Z3 Z5 Z6 C7 Z7 Z8 Z9 Z10 Z11 C9b C9')],
    },
    {
        id: 'wutong', name: '梧桐区', model: '徐汇', population: 28,
        about: '中城区西南：梧桐树下的老洋房街区、徐坊商圈、大医院和大学，江边是艺术区。',
        outline: [path('R15 R14 R13 R12 Z20 Z21 Z22 Z18 Z19 Z5 Z3 Z2 Z1')],
    },
    {
        id: 'xiqiao', name: '西桥区', model: '长宁、普陀', population: 48,
        about: '西部城区：外企办公区和外籍人士聚居的新北、动物园、成片的居住区，青溪边是老厂房。',
        outline: [path('Z5 Z19 Z18 Z22 Z29 Z28 Z27 Z26 Z25 Z24 Z23 Z8 Z7 C7 Z6')],
    },
    {
        id: 'bei-an', name: '北岸区', model: '虹口', population: 19,
        about: '青溪以北、澜江西岸：老社区和弄堂、文化公园和足球场、江边的老码头区。',
        outline: [path('C9b Z11 Z10 Z9 Z12 Z13 Z14 Z15 R20b R20 R19')],
    },
    {
        id: 'donglin', name: '东林区', model: '杨浦', population: 31,
        about: '东北部城区：澜江大学等几所高校、五岔口商圈，江边的老工业区改成了公园。',
        outline: [path('R20b Z15 Z14 Z13 Z16 R25 R24 R23 R22 R21')],
    },
    {
        id: 'jiangdong', name: '江东区', model: '浦东', population: 145,
        about: '澜江东岸一直到东海：望江嘴金融城正对江滩，还有中央公园、科学城、港区、乐园、东部机场、临海新城，以及海上的远洋港。',
        outline: [path(`R8 R9 R10 R11 R12 R13 R14 R15 R16 R17 R18 R19 R20 R20b R21 R22 R23 R24 R25 R26 R27 R28
            O5 O6 O7 O8 O9 O10 O11 O12 O13 O14 O15 O16 O17 O18 J3 J2 J1`), PORT_ISLAND],
    },
    {
        id: 'xinzhuang', name: '新庄区', model: '闵行', population: 67,
        about: '西南近郊：成片的居住区、大学城和高新区，北边是西站枢纽（高铁站和西郊机场）。',
        outline: [path('C2 Z26 Z27 Z28 Z29 Z22 Z21 Z20 R12 R11 R10 R9 R8 R7 R6 R5 Z39 Z40 Z34 Z33')],
    },
    {
        id: 'jiangkou', name: '江口区', model: '宝山', population: 56,
        about: '北部，沧江口南岸：钢铁厂、邮轮码头、炮台湿地公园，往南是大片的居住区。',
        outline: [path('O1 O2 O3 O4 R28 R27 R26 R25 Z16 Z13 Z12 Z9 Z8 Z23 Z24 Z25 Z30 Z31 Z32')],
    },
    {
        id: 'jiahe', name: '嘉禾区', model: '嘉定', population: 46,
        about: '西北：汽车城和赛车场，嘉禾老城有孔庙和老街，南芗古镇在东南边。',
        outline: [path('C0 O36 O37 O38 O39 O1 Z32 Z31 Z30 Z25 Z26 C2 C1')],
    },
    {
        id: 'qinghu', name: '青湖区', model: '青浦', population: 32,
        about: '西部：云湖和水乡古镇，东边挨着西站枢纽的是会展中心。',
        outline: [path('C0 C1 C2 Z33 Z34 Z35 Z36 S3 O28 O29 O30 O31 O32 O33 O34')],
    },
    {
        id: 'xishan', name: '西山区', model: '松江', population: 48,
        about: '西南，澜江上游两岸：西山是全市唯一的一片小山，有大学城和西山老城。',
        outline: [path('Z34 Z40 Z39 R5 S1 S2 S3 Z36 Z35')],
    },
    {
        id: 'nanhai', name: '南海区', model: '金山、奉贤', population: 49,
        about: '南部，沿南湾：海桥新城、金滩海滩、化工区，大片农田和小镇。',
        outline: [path('R5 R6 R7 R8 J1 J2 J3 O18 O19 O20 O21 O22 O23 O24 O25 O26 O27 O28 S3 S2 S1')],
    },
    {
        id: 'cangzhou', name: '沧洲区', model: '崇明', population: 16,
        about: '沧江口的三座岛：沧洲岛的农田、湿地和森林公园，以及长兴、横沙两座小岛。',
        outline: [
            // 沧洲岛 (Chongming), 长兴岛, 横沙岛.
            [[121.2, 31.8], [121.35, 31.76], [121.5, 31.71], [121.65, 31.66], [121.8, 31.6], [121.93, 31.55], [121.98, 31.5],
                [121.92, 31.47], [121.78, 31.48], [121.62, 31.52], [121.48, 31.57], [121.35, 31.62], [121.25, 31.68], [121.2, 31.74]],
            [[121.55, 31.425], [121.68, 31.42], [121.8, 31.39], [121.84, 31.365], [121.78, 31.355], [121.65, 31.375], [121.57, 31.4]],
            [[121.82, 31.34], [121.88, 31.345], [121.9, 31.32], [121.86, 31.3], [121.81, 31.31]],
        ],
    },
];

/** The mainland: the coast and the borders with the neighbouring provinces. */
export const MAINLAND: LonLat[] = path(`O1 O2 O3 O4 R28 O5 O6 O7 O8 O9 O10 O11 O12 O13 O14 O15 O16 O17 O18 O19 O20
    O21 O22 O23 O24 O25 O26 O27 O28 O29 O30 O31 O32 O33 O34 C0 O36 O37 O38 O39`);

/** Coast segments (the rest of the mainland outline is a land border). */
export const COAST: LonLat[][] = [path('O1 O2 O3 O4 R28 O5 O6 O7 O8 O9 O10 O11 O12 O13 O14 O15 O16 O17 O18 O19 O20 O21 O22 O23 O24 O25')];

export interface WaterShape {
    name: string;
    model: string;
    outline: LonLat[];
}

export const LAKES: WaterShape[] = [
    {
        name: '云湖', model: '淀山湖',
        outline: [[120.915, 31.16], [120.94, 31.17], [120.965, 31.165], [120.985, 31.15], [120.995, 31.13], [121, 31.11], [120.99, 31.09],
            [120.985, 31.075], [120.97, 31.07], [120.95, 31.068], [120.935, 31.08], [120.92, 31.1], [120.905, 31.12], [120.905, 31.145]],
    },
    { name: '月湖', model: '月湖（西山）', outline: circle([121.205, 31.028], 0.006) },
    { name: '临海湖', model: '滴水湖', outline: circle([121.925, 30.905], 0.013) },
];

export interface RiverShape {
    name: string;
    model: string;
    /** Width in metres at Shanghai's size: [index into the course, metres], in order; linear in between. */
    width: [number, number][];
    course: LonLat[];
}

export const RIVERS: RiverShape[] = [
    {
        name: '澜江', model: '黄浦江', width: [[0, 150], [8, 250], [15, 350], [19, 400], [29, 700]],
        course: path('R0 R1 R2 R3 R4 R5 R6 R7 R8 R9 R10 R11 R12 R13 R14 R15 R16 R17 R18 R19 R20 R20b R21 R22 R23 R24 R25 R26 R27 R28'),
    },
    { name: '青溪', model: '苏州河', width: [[0, 60], [11, 80]], course: path('C0 C1 C2 Z26 C4 C5 C6 C7 C8 C9 C9b R19') },
];

/** 西山: a handful of small hills, centre and radius in degrees, height in metres. */
export const HILLS: { name: string; at: LonLat; r: number; height: number }[] = [
    { name: '西山', at: [121.19, 31.1], r: 0.012, height: 99 },
    { name: '天马山', at: [121.155, 31.075], r: 0.008, height: 98 },
    { name: '凤凰山', at: [121.215, 31.115], r: 0.006, height: 49 },
    { name: '辰山', at: [121.18, 31.08], r: 0.005, height: 71 },
];

/** Sea areas, for labels. */
export const SEAS: { name: string; at: LonLat }[] = [
    { name: '东海', at: [122.0, 31.15] },
    { name: '沧江口', at: [121.62, 31.46] },
    { name: '南湾', at: [121.45, 30.74] },
];

function circle([lon, lat]: LonLat, r: number): LonLat[] {
    const k = Math.cos((lat * Math.PI) / 180);
    return Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        return [Math.round((lon + (r * Math.cos(a)) / k) * 10000) / 10000, Math.round((lat + r * Math.sin(a)) * 10000) / 10000] as LonLat;
    });
}

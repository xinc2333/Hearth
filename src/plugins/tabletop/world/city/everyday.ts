// Everyday places of 澜江市: homes, small restaurants, cafés, shops and the like around every
// station, landmark and town. They are made by a seeded generator, so every build gets the same
// places with the same names and ids. Once a version with saved worlds is out, keep the generator
// stable (or freeze its output): saved worlds refer to these places by id.

import type { Point } from './geo.ts';
import type { PlaceKind } from './places.ts';

export interface Anchor {
    name: string;
    at: Point;
    district: string;
    /** How built-up the area is: 3 the city centre, 2 the rest of the city, 1 a suburban town. */
    density: 1 | 2 | 3;
}

export interface EverydayPlace {
    id: string;
    name: string;
    kind: PlaceKind;
    at: Point;
    hours: string;
    about: string;
}

/** Small, fast, seeded random numbers (mulberry32). */
export function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function hash(text: string): number {
    let h = 2166136261;
    for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619);
    return h >>> 0;
}

const pick = <T>(rand: () => number, list: readonly T[]): T => list[Math.floor(rand() * list.length)];

/** Old inner-city districts, where homes are 弄堂 and 老公房 rather than new towers. */
const OLD_TOWN = new Set(['zhongcheng', 'bei-an', 'anhua']);

const NAME_WORDS = ['梧桐', '枫林', '春江', '绿洲', '锦绣', '阳光', '康乐', '安居', '永和', '长乐', '兴业', '明珠', '静园', '清河', '银杏',
    '香樟', '海棠', '玉兰', '桃源', '紫薇', '新华', '和平', '东方', '滨江', '江南', '世纪', '天和', '丽水', '云景', '碧云', '翠湖', '白鹭',
    '明月', '晨曦', '星河', '嘉禾', '金桂', '凤凰', '泰和', '瑞金', '宝华', '顺昌', '德安', '庆余', '同乐', '怡和', '春申', '延年'];
const OLD_HOME = ['里', '坊', '新村', '弄'];
const NEW_HOME = ['花园', '家园', '苑', '公寓', '名邸', '华庭', '新城', '雅苑'];
const CAFES = ['拾光', '转角', '慢半拍', '一隅', '旧时光', '青柠', '白鲸', '黑猫', '灯塔', '山丘', '南风', '北窗', '木马', '十一月', '半岛',
    '雾岛', '漫游', '小满', '落日', '方糖', '纸飞机', '晴天', '树下', '小院', '橘子', '猫头鹰', '回声', '鹿角', '远山', '春分', '白露', '向日葵',
    '老唱片', '飞鸟', '迷途', '月台', '海盐', '松果', '暖阳', '雨巷'];
const CAFE_SUFFIX = ['咖啡', '咖啡馆', '咖啡屋', '咖啡店'];
const FOOD_OWNERS = ['老王', '阿英', '小杨', '老马', '阿娟', '福记', '荣记', '同福', '四季', '江边', '巷口', '街角', '弄口', '老街', '阿三',
    '胖子', '蔡记', '老陈', '大碗', '小李'];
const FOOD_TYPES: [string, string][] = [
    ['面馆', '10:00–21:30'], ['小馄饨', '06:00–20:00'], ['本帮菜', '11:00–21:30'], ['生煎', '06:30–19:00'], ['烧烤', '17:00–02:00'],
    ['火锅', '11:00–23:00'], ['川菜馆', '11:00–22:00'], ['粤菜馆', '11:00–21:30'], ['日料', '11:30–22:30'], ['西餐厅', '11:00–22:30'],
    ['牛肉面', '07:00–21:00'], ['麻辣烫', '10:00–23:00'], ['饺子馆', '10:00–21:00'], ['小龙虾', '16:00–02:00'], ['茶餐厅', '07:00–22:00'],
    ['早餐店', '05:30–10:30'],
];
const BARS = ['夜航', '回声', '雾港', '月光', '老船', '蓝调', '小酌', '微醺', '后巷', '灯火', '十字路', '码头', '深蓝', '野狐', '旧船票',
    '午夜', '霓虹', '石库', '浮生', '醉月', '黑胶', '天台', '慢摇', '琥珀', '灰鹦鹉', '北极星', '红砖', '水手'];
const BAR_SUFFIX = ['酒吧', '酒馆', '小酒馆'];
const SHOPS: [string, string, string][] = [
    ['便利店', '全天', '二十四小时便利店，关东煮和饭团都有。'],
    ['水果店', '08:00–22:00', '街边的水果店，老板娘会帮你挑。'],
    ['花店', '09:00–21:00', '小小的花店，门口摆满了鲜花。'],
    ['书店', '10:00–21:00', '一家独立书店，楼上可以坐着看书。'],
    ['药店', '08:00–22:00', '连锁药店，夜里有值班窗口。'],
    ['超市', '07:30–22:00', '社区超市，傍晚买菜的人多。'],
    ['理发店', '09:00–21:00', '小理发店，师傅手艺不错。'],
];
/** Chains: the same brand in many places, told apart by the branch. */
const GYMS = ['燃动健身', '铁馆健身', '轻氧健身', '力行健身', '跃动健身'];
const HOTELS = ['江悦酒店', '澜庭酒店', '栖云酒店', '悦居酒店', '漫居酒店', '山水酒店'];

const homeAbout = (rand: () => number, district: string, density: number) =>
    OLD_TOWN.has(district)
        ? pick(rand, ['石库门弄堂，几户人家合用一个灶披间。', '八十年代的老公房，六层，没有电梯。', '老弄堂翻修过，邻居大多是老住户。'])
        : density >= 2
            ? pick(rand, ['二十多层的高层小区，物业还算尽责。', '九十年代的老公房小区，绿化很好。', '新建的电梯房，年轻租客多。', '中档小区，楼下有快递柜和便利店。'])
            : pick(rand, ['郊区的多层小区，房租便宜，离地铁有点远。', '镇上的老小区，楼下就是菜场。', '新建的大社区，周围还在施工。']);

/** Kinds to make around an anchor, by how built-up the area is. */
function plan(density: number): PlaceKind[] {
    if (density === 3) return ['residence', 'residence', 'food', 'food', 'cafe', 'bar', 'shop', 'office'];
    if (density === 2) return ['residence', 'residence', 'food', 'cafe', 'shop', 'market'];
    return ['residence', 'food', 'shop', 'market'];
}

/**
 * Places around each anchor. `free(point)` says whether a spot is usable (on land, in a district,
 * not in the water and not on top of another place). Names in `reserved` (landmarks, stations, towns)
 * are not given out again.
 */
export function everydayPlaces(anchors: Anchor[], free: (at: Point) => boolean, reserved: Iterable<string> = []): EverydayPlace[] {
    const out: EverydayPlace[] = [];
    const used = new Set<string>(reserved);
    /** A name nobody has yet: draws again a few times, then names it after the area. */
    const unique = (draw: () => string, area: string) => {
        let n = draw();
        for (let i = 0; used.has(n) && i < 8; i++) n = draw();
        if (used.has(n)) n = `${area}${n}`;
        for (let i = 2; used.has(n); i++) n = `${n}${i}`;
        used.add(n);
        return n;
    };
    const branch = (brand: string, area: string) => {
        const n = `${brand}（${area}店）`;
        used.add(n);
        return n;
    };
    for (const anchor of anchors) {
        const rand = rng(hash(anchor.name));
        const kinds = plan(anchor.density);
        // Every few built-up anchors get a police station, a community clinic, a school, a gym or a hotel.
        const roll = hash(anchor.name) % 12;
        if (anchor.density >= 2 && roll < 3) kinds.push('police');
        if (anchor.density >= 2 && roll >= 3 && roll < 6) kinds.push('hospital');
        if (roll % 3 === 0) kinds.push('school');
        if (anchor.density >= 2 && roll % 4 === 1) kinds.push('gym');
        if (anchor.density === 3 && roll % 3 === 2) kinds.push('hotel');
        const radius = anchor.density === 3 ? 0.45 : anchor.density === 2 ? 0.7 : 0.9;
        kinds.forEach((kind, i) => {
            let at: Point | null = null;
            for (let tries = 0; tries < 12 && !at; tries++) {
                const a = rand() * Math.PI * 2;
                const d = radius * (0.25 + 0.75 * Math.sqrt(rand()));
                const p: Point = [Math.round((anchor.at[0] + Math.cos(a) * d) * 1000) / 1000, Math.round((anchor.at[1] + Math.sin(a) * d) * 1000) / 1000];
                if (free(p)) at = p;
            }
            if (!at) return;
            const id = `e-${hash(anchor.name).toString(36)}-${i}`;
            const short = anchor.name.replace(/（.*$/, '').slice(0, 4);
            let name = '';
            let hours = '全天';
            let about: string;
            switch (kind) {
                case 'residence': {
                    const old = OLD_TOWN.has(anchor.district) && rand() < 0.7;
                    name = unique(() => `${pick(rand, NAME_WORDS)}${pick(rand, old ? OLD_HOME : NEW_HOME)}`, short);
                    about = homeAbout(rand, anchor.district, anchor.density);
                    break;
                }
                case 'food': {
                    const [type, h] = pick(rand, FOOD_TYPES);
                    name = unique(() => `${pick(rand, FOOD_OWNERS)}${type}`, short);
                    hours = h;
                    about = pick(rand, ['开了十几年的老店，熟客多。', '门面不大，饭点要排队。', '新开的店，装修干净，年轻人多。', '附近上班的人中午常来。']);
                    break;
                }
                case 'cafe':
                    name = unique(() => `${pick(rand, CAFES)}${pick(rand, CAFE_SUFFIX)}`, short);
                    hours = pick(rand, ['08:00–21:00', '07:30–20:00', '09:00–22:00']);
                    about = pick(rand, ['安静的小咖啡馆，常有人带电脑来办公。', '临街的咖啡馆，有几张靠窗的位子。', '老房子改的咖啡馆，有个小院子。', '连锁风格的咖啡馆，人来人往。']);
                    break;
                case 'bar':
                    name = unique(() => `${pick(rand, BARS)}${pick(rand, BAR_SUFFIX)}`, short);
                    hours = pick(rand, ['19:00–02:00', '18:00–01:00', '20:00–03:00']);
                    about = pick(rand, ['小酒吧，周末有驻唱。', '精酿酒吧，门口常站着抽烟聊天的人。', '灯光很暗的鸡尾酒吧，调酒师话不多。']);
                    break;
                case 'shop': {
                    const [type, h, text] = pick(rand, SHOPS);
                    name = unique(() => `${short}${type}`, '');
                    hours = h;
                    about = text;
                    break;
                }
                case 'market':
                    name = unique(() => `${short}菜市场`, '');
                    hours = '06:00–18:00';
                    about = '社区的菜市场，早上最热闹，下午有的摊位就收了。';
                    break;
                case 'school': {
                    const level = rand() < 0.5 ? '小学' : '中学';
                    name = unique(() => `${short}${level}`, '');
                    hours = '工作日 07:30–17:00';
                    about = level === '小学' ? '社区小学，放学时门口挤满接孩子的家长。' : '区里的中学，晚自习到九点。';
                    break;
                }
                case 'office':
                    name = unique(() => `${pick(rand, NAME_WORDS)}${pick(rand, ['大厦', '中心', '广场'])}`, short);
                    about = pick(rand, ['二三十层的写字楼，楼里有不少小公司。', '老牌写字楼，电梯早高峰要排队。', '新的甲级写字楼，大公司的办公室在高层。']);
                    break;
                case 'hotel':
                    name = branch(pick(rand, HOTELS), short);
                    about = pick(rand, ['商务酒店，房间不大但干净。', '老牌酒店，大堂很气派。', '经济型酒店，前台二十四小时有人。']);
                    break;
                case 'gym':
                    name = branch(pick(rand, GYMS), short);
                    hours = '07:00–23:00';
                    about = '健身房，晚上下班后人最多。';
                    break;
                case 'police':
                    name = unique(() => `${short}派出所`, '');
                    about = '派出所，报警、办证都可以来，值班室夜里也有人。';
                    break;
                case 'hospital':
                    name = unique(() => `${short}社区卫生服务中心`, '');
                    hours = '08:00–17:00';
                    about = '社区医院，看个感冒、配药不用去大医院排队。';
                    break;
                default:
                    return;
            }
            out.push({ id, name, kind, at, hours, about });
        });
    }
    return out;
}

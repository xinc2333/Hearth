// The tools of a 世界 chat (docs/world.md §14): the world parts added to 跑团's hearth_check and
// hearth_settle, and the scene and setup tools. Every request of a world chat declares the same tools.

import { CORE_ATTRIBUTES } from '../rules.ts';
import type { TurnAsk } from './turn.ts';

export const SCENE_TOOL_NAME = 'hearth_scene';
export const SETUP_TOOL_NAME = 'hearth_setup';
/** Every world tool (names written out: minds.ts defines the other three). */
export const WORLD_TOOLS = [SCENE_TOOL_NAME, SETUP_TOOL_NAME, 'hearth_act', 'hearth_day', 'hearth_profile'];

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : undefined);
const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const list = (v: unknown) => (Array.isArray(v) ? v : []);

/** The world part of hearth_check: how long this turn takes and where the protagonist goes. */
export const CHECK_WORLD_PROPERTIES = {
    time: {
        type: 'object',
        description: '这一轮会过去多久（不含路上的时间，路程由 Hearth 计算）',
        properties: {
            minutes: { type: 'number', description: '在目的地或原地做这些事要多少分钟，最多 180' },
            until: { type: 'string', description: '只在睡觉或跳过时间时写：明确的结束时刻，格式 2026-03-03 07:00' },
            activity: { type: 'string', enum: ['日常', '睡觉', '体力活'], description: '这段时间主要在做什么' },
            routine: { type: 'boolean', description: '跳过时间时，主角照常按作息过（上班、回家）' },
        },
    },
    move: {
        type: 'object',
        description: '主角这一轮要去别的地方时写；不动就不写',
        properties: {
            to: { type: 'string', description: '去哪：地图上的地点名，或者「家」「公司」；地图上没有的地方写一个具体的名字' },
            by: { type: 'string', description: '怎么去：步行、骑车、地铁、公交、打车、开车；不写就按主角的习惯' },
            with: { type: 'array', items: { type: 'string' }, description: '一起去的角色' },
        },
        required: ['to'],
    },
};

export function parseTurnAsk(args: Record<string, unknown> | null | undefined): TurnAsk | undefined {
    if (!args) return undefined;
    const time = isRecord(args.time) ? args.time : {};
    const move = isRecord(args.move) ? args.move : null;
    const ask: TurnAsk = {};
    const minutes = num(time.minutes);
    if (minutes !== undefined) ask.minutes = minutes;
    if (str(time.until)) ask.until = str(time.until);
    if (['日常', '睡觉', '体力活'].includes(str(time.activity))) ask.activity = str(time.activity) as TurnAsk['activity'];
    if (time.routine === true) ask.routine = true;
    if (move && str(move.to)) ask.move = { to: str(move.to), ...(str(move.by) ? { by: str(move.by) } : {}), with: list(move.with).map(str).filter(Boolean) };
    return Object.keys(ask).length ? ask : undefined;
}

/** The world part of hearth_settle. */
export const SETTLE_WORLD_PROPERTY = {
    world: {
        type: 'object',
        description: '世界的记账：这段回复里主角这边发生的事',
        properties: {
            extra_minutes: { type: 'number', description: '正文比计划的时间段多写了多少分钟（例如睡着了、聊过了头）；没有写 0' },
            ate: { type: 'string', enum: ['正餐', '点心'], description: '主角这段时间吃了东西才写' },
            money: {
                type: 'array',
                description: '额外的收支（三餐日用每天已经按生活水平扣过，车费 Hearth 已经算过，都不要再写）',
                items: { type: 'object', properties: { amount: { type: 'number', description: '花钱写负数，收入写正数' }, reason: { type: 'string' } }, required: ['amount', 'reason'] },
            },
            moves: {
                type: 'array',
                description: '在场的角色离开或去了别处',
                items: { type: 'object', properties: { who: { type: 'string' }, to: { type: 'string' } }, required: ['who', 'to'] },
            },
            commitments: {
                type: 'array',
                description: '这段回复里新答应、约好的事，例如约了时间地点见面、答应周五前还钱',
                items: {
                    type: 'object',
                    properties: {
                        with: { type: 'string', description: '和谁' },
                        what: { type: 'string', description: '约了什么' },
                        at: { type: 'string', description: '什么时候，格式 2026-03-06 19:00；没有具体时间不写' },
                        place: { type: 'string', description: '在哪，地点名；没有就不写' },
                    },
                    required: ['with', 'what'],
                },
            },
            done: { type: 'array', items: { type: 'string' }, description: '这段回复里完成了的约定（写约定的名字）' },
            messages: {
                type: 'array',
                description: '主角用手机发出的消息',
                items: { type: 'object', properties: { to: { type: 'string' }, text: { type: 'string' } }, required: ['to', 'text'] },
            },
            contacts: { type: 'array', items: { type: 'string' }, description: '和主角交换了联系方式的人' },
            read: { type: 'boolean', description: '主角看了手机上没看的消息' },
            witnessed: {
                type: 'array',
                description: '在场的认识的人亲眼看到的、和主角有关的事（他们以后会记得）',
                items: { type: 'object', properties: { who: { type: 'array', items: { type: 'string' } }, what: { type: 'string' } }, required: ['who', 'what'] },
            },
            told: {
                type: 'array',
                description: '主角当面告诉了谁什么（对方会记得）',
                items: { type: 'object', properties: { to: { type: 'string' }, what: { type: 'string' } }, required: ['to', 'what'] },
            },
            met: {
                type: 'array',
                description: '这一幕的场景人物里，和主角打过交道的人（说过话、有过来往）：编号和称呼，知道名字就写名字',
                items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } }, required: ['id', 'name'] },
            },
            places: {
                type: 'array',
                description: '正文里出现、地图上还没有的地点',
                items: { type: 'object', properties: { name: { type: 'string' }, near: { type: 'string', description: '在哪个已知地点附近' }, about: { type: 'string' } }, required: ['name'] },
            },
        },
    },
};

export interface SettleWorld {
    extraMinutes: number;
    ate?: '正餐' | '点心';
    money: { amount: number; reason: string }[];
    moves: { who: string; to: string }[];
    commitments: { with: string; what: string; at?: string; place?: string }[];
    done: string[];
    messages: { to: string; text: string }[];
    contacts: string[];
    read: boolean;
    witnessed: { who: string[]; what: string }[];
    told: { to: string; what: string }[];
    met: { id: string; name: string }[];
    places: { name: string; near?: string; about?: string }[];
}

export function parseSettleWorld(raw: unknown): SettleWorld | null {
    if (!isRecord(raw)) return null;
    const ate = str(raw.ate);
    return {
        extraMinutes: Math.max(0, num(raw.extra_minutes) ?? 0),
        ...(ate === '正餐' || ate === '点心' ? { ate } : {}),
        money: list(raw.money).filter(isRecord).map(m => ({ amount: num(m.amount) ?? 0, reason: str(m.reason) })).filter(m => m.amount && m.reason),
        moves: list(raw.moves).filter(isRecord).map(m => ({ who: str(m.who), to: str(m.to) })).filter(m => m.who && m.to),
        commitments: list(raw.commitments).filter(isRecord).map(c => ({ with: str(c.with), what: str(c.what), ...(str(c.at) ? { at: str(c.at) } : {}), ...(str(c.place) ? { place: str(c.place) } : {}) })).filter(c => c.with && c.what),
        done: list(raw.done).map(str).filter(Boolean),
        messages: list(raw.messages).filter(isRecord).map(m => ({ to: str(m.to), text: str(m.text) })).filter(m => m.to && m.text),
        contacts: list(raw.contacts).map(str).filter(Boolean),
        read: raw.read === true,
        witnessed: list(raw.witnessed).filter(isRecord).map(w => ({ who: list(w.who).map(str).filter(Boolean), what: str(w.what) })).filter(w => w.who.length && w.what),
        told: list(raw.told).filter(isRecord).map(t => ({ to: str(t.to), what: str(t.what) })).filter(t => t.to && t.what),
        met: list(raw.met).filter(isRecord).map(m => ({ id: str(m.id), name: str(m.name) })).filter(m => m.id && m.name),
        places: list(raw.places).filter(isRecord).map(p => ({ name: str(p.name), ...(str(p.near) ? { near: str(p.near) } : {}), ...(str(p.about) ? { about: str(p.about) } : {}) })).filter(p => p.name),
    };
}

export function sceneTool() {
    return {
        type: 'function',
        function: {
            name: SCENE_TOOL_NAME,
            description: '场景：按主角的视角，写出这里此刻的人看起来是什么样。只写看得到的。',
            parameters: {
                type: 'object',
                properties: {
                    crowd: { type: 'string', description: '这里整体的样子和人流，一句话' },
                    people: {
                        type: 'array',
                        description: '给出的每个编号各写一项',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', description: '给出的编号' },
                                looks: { type: 'string', description: '看起来的样子：大概的年纪、性别、身材、穿着、显眼的特征，一句话' },
                                doing: { type: 'string', description: '在做什么' },
                                where: { type: 'string', description: '在这里的哪个位置' },
                            },
                            required: ['id', 'looks', 'doing'],
                        },
                    },
                },
                required: ['people'],
            },
        },
    };
}

export interface SceneArgs {
    crowd: string;
    people: { id: string; looks: string; doing: string; where: string }[];
}

export function parseSceneArgs(text: string): SceneArgs | null {
    const raw = parseJson(text);
    if (!isRecord(raw)) return null;
    const people = list(raw.people).filter(isRecord).map(p => ({ id: str(p.id), looks: str(p.looks), doing: str(p.doing), where: str(p.where) })).filter(p => p.id && p.looks);
    return { crowd: str(raw.crowd), people };
}

const attributeProps = Object.fromEntries(CORE_ATTRIBUTES.map(a => [a, { type: 'number' }]));

export function setupTool() {
    const person = {
        type: 'object',
        properties: {
            name: { type: 'string' },
            role: { type: 'string', description: '和主角的关系：上司、同事、房东、妈妈、辅导员…' },
            gender: { type: 'string', enum: ['男', '女'] },
            age: { type: 'number' },
            about: { type: 'string', description: '一两句：他是什么样的人' },
            attributes: { type: 'object', properties: attributeProps, description: '按参照表估计，普通成年男性 100' },
            traits: { type: 'object', properties: { 敏感: { type: 'number' }, 记仇: { type: 'number' }, 多疑: { type: 'number' } }, description: '0.5～2，默认 1' },
            attitude: {
                type: 'object',
                description: '他对主角现在的态度，0～100',
                properties: { affection: { type: 'number' }, resentment: { type: 'number' }, trust: { type: 'number' }, respect: { type: 'number' }, fear: { type: 'number' }, attraction: { type: 'number' }, familiarity: { type: 'number' } },
            },
            lives: { type: 'string', description: '住在哪：地图上的地点名；不在澜江市就写城市名' },
        },
        required: ['name', 'role', 'gender', 'age', 'about'],
    };
    return {
        type: 'function',
        function: {
            name: SETUP_TOOL_NAME,
            description: '开局：按玩家写的设定，把主角在澜江市的生活落成数据。',
            parameters: {
                type: 'object',
                properties: {
                    think: { type: 'string', description: '简短的思路' },
                    attributes: { type: 'object', properties: attributeProps, description: '主角的属性，按参照表，普通成年男性 100' },
                    skills: { type: 'object', description: '主角的特长：名字 → 入门、熟练、精通、大师' },
                    job: {
                        type: 'object',
                        properties: {
                            title: { type: 'string', description: '具体做什么，例如「广告公司的设计」' },
                            employer: { type: 'string', description: '单位或学校的名字（无业时不写）' },
                            place: { type: 'string', description: '单位在哪：地图上的地点名；新单位写名字并在 near 写附近的已知地点' },
                            near: { type: 'string' },
                            income: { type: 'number', description: '每月收入（工资或家里给的生活费），元' },
                            payday: { type: 'number', description: '每月几号到账' },
                            days: { type: 'string', description: '上班或上课的日子，例如「工作日」' },
                            from: { type: 'string', description: '几点开始，例如 09:00' },
                            to: { type: 'string', description: '几点结束，例如 18:00' },
                            norms: { type: 'string', description: '这家单位或学校的惯例：考勤、迟到、请假、加班怎么处理（一两句，像现实里的单位）' },
                        },
                    },
                    home: {
                        type: 'object',
                        properties: {
                            place: { type: 'string', description: '住在哪个小区：地图上的地点名，或新的名字并在 near 写附近的已知地点' },
                            near: { type: 'string' },
                            rent: { type: 'number', description: '每月房租，元；自己的房子写 0' },
                            rent_day: { type: 'number', description: '每月几号交房租' },
                            norms: { type: 'string', description: '房东对交租的习惯做法（一两句）' },
                        },
                        required: ['place'],
                    },
                    balance: { type: 'number', description: '现在手上的钱（手机和银行卡合计），元' },
                    living: { type: 'string', enum: ['节俭', '普通', '宽裕'], description: '日常花钱的水平' },
                    habit: { type: 'string', enum: ['步行', '骑车', '地铁', '公交', '打车', '开车'], description: '平时怎么出行' },
                    people: { type: 'array', items: person, description: '身边的人：上司和两位同事（或辅导员和同学）、房东（租房时）、一两位家人' },
                },
                required: ['attributes', 'home', 'balance', 'living', 'people'],
            },
        },
    };
}

export function parseJson(text: string): unknown {
    const t = text.trim();
    if (!t) return null;
    try {
        return JSON.parse(t);
    } catch {
        const m = /\{[\s\S]*\}/.exec(t);
        if (!m) return null;
        try {
            return JSON.parse(m[0]);
        } catch {
            return null;
        }
    }
}

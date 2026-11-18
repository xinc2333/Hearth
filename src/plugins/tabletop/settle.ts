// 结算: what a reply changed. After the reply is shown, the settlement step asks the model to go over
// it and report through the hearth_settle tool: every character on scene and their attitude toward
// the protagonist, how other characters now stand with each other, statuses, new characters and
// (rarely) growth. Hearth applies it by the rules. See docs/tabletop.md §5.
//
// Older presets ask for a hidden <结算> block at the end of the reply instead, one change per line;
// that block is still read:
//   态度｜林晚→主角｜亲近+8 怨恨-3｜你替她挡了一刀
//   熟悉｜守卫甲→主角｜+10｜正面交过手
//   关系｜林晚与守卫甲｜结了仇｜他出卖了她
//   状态｜主角｜+左臂刀伤｜力量×0.8｜被守卫划了一刀
//   状态｜主角｜-醉意｜酒醒了
//   新角色｜守卫甲｜受过训练｜力量160 敏捷120 感知130｜后门守卫，三十来岁
//   属性｜主角｜口才+5｜长期练习
//   特长｜主角｜开锁｜精通｜跟老锁匠学了半年

import { applyAttitude, changeFamiliarity } from './attitude.ts';
import { clamp, fmt, PROTAGONIST, SKILL_LEVELS } from './rules.ts';
import { AXES, canonicalName, newCharacter, resolveName, sameBond, upsertBond, type Axis, type SettleLine, type TabletopState } from './sheet.ts';

export const SETTLE_TOOL_NAME = 'hearth_settle';
const BLOCK = /<结算>([\s\S]*?)(?:<\/结算>|$)/;
const MAX_ATTRIBUTE_CHANGE = 10;
const KEEP_LOG = 60;

export type SettleResult = SettleLine;

// ---------------------------------------------------------------------------------------------
// The tool
// ---------------------------------------------------------------------------------------------

export function settleTool() {
    const axis = (label: string) => ({ type: 'number', description: `${label}的变化：日常 0～2，留下印象 3～8，明显的好意或冒犯 8～15，重大事件 15～30，可正可负；没变写 0` });
    return {
        type: 'function',
        function: {
            name: SETTLE_TOOL_NAME,
            description: '跑团结算：记下刚才这段回复里发生的事造成的变化。Hearth 按规则执行，实际变化可能比写的小。',
            parameters: {
                type: 'object',
                properties: {
                    think: { type: 'string', description: '简短回顾：这段回复里发生了哪些事，分别影响了谁' },
                    present: { type: 'array', items: { type: 'string' }, description: '这段回复里在场的角色，不含主角' },
                    attitudes: {
                        type: 'array',
                        description: '在场的每个角色各写一项：这段回复里的事让他对主角的态度怎样变了。没有变化也写一项，各条线写 0，reason 写「没有变化」。只写角色对主角的态度；主角自己的感情由玩家决定，不写',
                        items: {
                            type: 'object',
                            properties: {
                                who: { type: 'string', description: '角色名' },
                                ...Object.fromEntries(AXES.map(([key, label]) => [key, axis(label)])),
                                familiarity: { type: 'number', description: '熟悉的变化：共同经历、更了解主角了；没变写 0' },
                                reason: { type: 'string', description: '是哪件事，一句话' },
                            },
                            required: ['who', 'reason'],
                        },
                    },
                    bonds: {
                        type: 'array',
                        description: '角色之间（不含主角）的关系因为这段回复有了变化时写，例如结仇、和好、起了疑心。没有变化就不写',
                        items: {
                            type: 'object',
                            properties: {
                                between: { type: 'array', items: { type: 'string' }, description: '两个角色的名字' },
                                now: { type: 'string', description: '现在的关系，几个字，例如「表面客气，暗中提防」' },
                                reason: { type: 'string', description: '是哪件事' },
                            },
                            required: ['between', 'now', 'reason'],
                        },
                    },
                    status: {
                        type: 'array',
                        description: '受伤、醉酒、疲惫等临时状态：新出现的加上，好了的去掉（主角和其他角色都算）',
                        items: {
                            type: 'object',
                            properties: {
                                who: { type: 'string' },
                                change: { type: 'string', enum: ['add', 'remove'], description: 'add 加上，remove 去掉' },
                                name: { type: 'string', description: '状态名，例如「左臂刀伤」' },
                                effects: { type: 'string', description: '加上时对属性的影响，例如「力量×0.8 敏捷×0.9」；没有就不写' },
                                note: { type: 'string', description: '一句话说明' },
                            },
                            required: ['who', 'change', 'name'],
                        },
                    },
                    new_characters: {
                        type: 'array',
                        description: '这段回复里新登场、以后还会出现、跑团数据里还没有的角色',
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                attributes: { type: 'string', description: '估计的属性，例如「力量160 敏捷120 感知130」（普通成年男性为 100）' },
                                note: { type: 'string', description: '一句话简介' },
                            },
                            required: ['name'],
                        },
                    },
                    growth: {
                        type: 'array',
                        description: '很少发生：长期的成长或衰退。属性写「+5」这样的变化（每次最多 ±10），特长写新的档位',
                        items: {
                            type: 'object',
                            properties: {
                                who: { type: 'string' },
                                item: { type: 'string', description: '属性名或特长名' },
                                change: { type: 'string', description: `属性写「+5」「-3」；特长写档位：${Object.keys(SKILL_LEVELS).join('、')}` },
                                reason: { type: 'string' },
                            },
                            required: ['who', 'item', 'change'],
                        },
                    },
                },
                required: ['present', 'attitudes'],
            },
        },
    };
}

export interface SettleArgs {
    think?: string;
    present?: unknown[];
    attitudes?: unknown[];
    bonds?: unknown[];
    status?: unknown[];
    new_characters?: unknown[];
    growth?: unknown[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const num = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && /^\s*[+＋\-－−]?\s*\d+(\.\d+)?\s*$/.test(v)) return Number(v.replace(/[＋\s]/g, '').replace(/[－−]/g, '-'));
    return 0;
};
const items = (v: unknown) => (Array.isArray(v) ? v.filter(isRecord) : []);

/** Lenient JSON: the arguments may arrive wrapped in prose, a code fence or a <hearth_settle> tag. */
export function parseSettleArgs(text: string): SettleArgs | null {
    const tries = [text, text.match(/<hearth_settle>([\s\S]*?)<\/hearth_settle>/i)?.[1], text.match(/\{[\s\S]*\}/)?.[0]];
    for (const t of tries) {
        if (!t) continue;
        try {
            const v = JSON.parse(t.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
            if (isRecord(v) && (Array.isArray(v.attitudes) || Array.isArray(v.present))) return v as SettleArgs;
        } catch {
            // next form
        }
    }
    return null;
}

// ---------------------------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------------------------

/** "力量160 敏捷120" or "力量×0.8" → { 力量: 160, 敏捷: 120 } */
function attributePairs(text: string, multiplier = false): Record<string, number> {
    const out: Record<string, number> = {};
    const re = multiplier ? /([^\s\d×x*:：,，、]+)\s*[×x*]\s*(\d+(?:\.\d+)?)/g : /([^\s\d:：,，、+\-]+)\s*[:：]?\s*(\d+(?:\.\d+)?)/g;
    for (const m of text.matchAll(re)) out[m[1]] = Number(m[2]);
    return out;
}

/** The operations both forms share; each returns the line to show, or throws with the reason. */
class Settler {
    results: SettleResult[] = [];
    private state: TabletopState;
    private userName: string;

    constructor(state: TabletopState, userName: string) {
        this.state = state;
        this.userName = userName;
    }

    private log(text: string) {
        this.state.log.push({ turn: this.state.turn, text });
        if (this.state.log.length > KEEP_LOG) this.state.log.splice(0, this.state.log.length - KEEP_LOG);
    }

    /** Records one outcome; `null` text means nothing changed (nothing is shown or logged). */
    run(line: string, fn: () => Omit<SettleResult, 'line' | 'ok'> | null) {
        try {
            const out = fn();
            if (!out) return;
            this.results.push({ line, ok: true, ...out });
            this.log(out.text);
        } catch (error) {
            this.results.push({ line, ok: false, text: (error as Error).message });
        }
    }

    isProtagonist(name: string): boolean {
        return resolveName(this.state, name, this.userName) === PROTAGONIST || canonicalName(name, this.userName) === PROTAGONIST;
    }

    /** The sheet key for a name; unknown names are registered as temporary characters when `create`. */
    who(name: string, create = false): string {
        const key = resolveName(this.state, name, this.userName);
        if (key) return key;
        const fresh = canonicalName(name, this.userName);
        if (!fresh) throw new Error('缺少角色名');
        if (!create) throw new Error(`跑团数据里没有「${name}」`);
        this.state.characters[fresh] = { ...newCharacter(), temporary: true };
        return fresh;
    }

    attitude(name: string, changes: Partial<Record<Axis | 'familiarity', number>>, reason: string) {
        if (!Object.values(changes).some(Boolean)) return null;
        const from = this.who(name, true);
        if (from === PROTAGONIST) throw new Error('主角自己的感情由玩家决定，不记录');
        const { familiarity = 0, ...axes } = changes;
        const moving = Object.fromEntries(Object.entries(axes).filter(([, v]) => v)) as Partial<Record<Axis, number>>;
        const parts: string[] = [];
        if (Object.keys(moving).length) {
            const change = applyAttitude(this.state, from, PROTAGONIST, moving, reason);
            if (change) parts.push(change);
        }
        if (familiarity) {
            const real = changeFamiliarity(this.state, from, PROTAGONIST, familiarity);
            if (real) parts.push(`熟悉${real > 0 ? '+' : ''}${real}`);
        }
        if (!parts.length) return null;
        return { kind: 'attitude' as const, who: from, text: `${from}→${PROTAGONIST}：${parts.join(' ')}${reason ? `（${reason}）` : ''}` };
    }

    bond(a: string, b: string, now: string, reason: string) {
        const x = this.who(a, true);
        const y = this.who(b, true);
        if (x === PROTAGONIST || y === PROTAGONIST) throw new Error('和主角有关的写在态度里');
        if (x === y || !now) throw new Error('需要两个不同的角色和现在的关系');
        const old = this.state.bonds.find(v => sameBond(v, x, y));
        if (old?.text === now) return null;
        const bond = old ?? { between: [x, y] as [string, string], text: now, reasons: [] };
        bond.text = now;
        bond.reasons.push({ turn: this.state.turn, text: reason, change: now });
        if (bond.reasons.length > 5) bond.reasons.splice(0, bond.reasons.length - 5);
        upsertBond(this.state.bonds, bond);
        return { kind: 'bond' as const, who: x, text: `${x}与${y}：${now}${reason ? `（${reason}）` : ''}` };
    }

    addStatus(name: string, label: string, effectsText: string, note: string) {
        const key = this.who(name);
        const c = this.state.characters[key];
        const effects = attributePairs(effectsText, true);
        for (const k of Object.keys(effects)) effects[k] = clamp(effects[k], 0.1, 5);
        const existed = c.status.some(s => s.name === label);
        c.status = [...c.status.filter(s => s.name !== label), { name: label, effects, ...(note ? { note } : {}) }];
        return { kind: 'status' as const, who: key, text: `${key}：${existed ? '状态更新' : '新状态'}「${label}」${Object.keys(effects).length ? `（${Object.entries(effects).map(([k, f]) => `${k}×${fmt(f)}`).join(' ')}）` : ''}` };
    }

    removeStatus(name: string, label: string) {
        const key = this.who(name);
        const c = this.state.characters[key];
        const before = c.status.length;
        c.status = c.status.filter(s => s.name !== label);
        if (c.status.length === before) throw new Error(`${key}没有「${label}」这个状态`);
        return { kind: 'status' as const, who: key, text: `${key}：「${label}」解除` };
    }

    newCharacter(name: string, attributesText: string, note: string) {
        const fresh = canonicalName(name, this.userName);
        if (!fresh) throw new Error('新角色需要名字');
        const key = resolveName(this.state, fresh, this.userName) ?? fresh;
        if (key === PROTAGONIST) throw new Error('主角已经有角色表了');
        const existing = this.state.characters[key];
        if (existing && !existing.temporary) return null;
        const c = existing ?? newCharacter();
        for (const [k, v] of Object.entries(attributePairs(attributesText))) c.attributes[k] = clamp(Math.round(v), 1, 9999);
        if (note) c.description = note;
        delete c.temporary;
        this.state.characters[key] = c;
        return { kind: 'new' as const, who: key, text: `${key}：${existing ? '正式建档' : '新登场'}` };
    }

    growth(name: string, item: string, change: string, reason: string) {
        const key = this.who(name);
        const c = this.state.characters[key];
        if (change.trim() in SKILL_LEVELS) {
            if (c.skills[item] === change.trim()) return null;
            c.skills[item] = change.trim();
            return { kind: 'growth' as const, who: key, text: `${key}：${item}·${change.trim()}${reason ? `（${reason}）` : ''}` };
        }
        const m = change.match(/^\s*([+＋\-－−])\s*(\d+(?:\.\d+)?)/);
        if (!m) throw new Error('属性写「+5」这样的变化，特长写档位');
        const delta = clamp(Number(`${/[+＋]/.test(m[1]) ? '' : '-'}${m[2]}`), -MAX_ATTRIBUTE_CHANGE, MAX_ATTRIBUTE_CHANGE);
        if (!delta) return null;
        const before = c.attributes[item] ?? 100;
        c.attributes[item] = clamp(Math.round(before + delta), 1, 9999);
        return { kind: 'growth' as const, who: key, text: `${key}：${item} ${before} → ${c.attributes[item]}${reason ? `（${reason}）` : ''}` };
    }
}

/**
 * Applies the settlement tool's arguments to `state` (already advanced one turn). Items it cannot
 * read are skipped and reported; nothing the model writes can push values past the rules' limits.
 */
export function applySettleArgs(state: TabletopState, args: SettleArgs, userName: string): SettleResult[] {
    const s = new Settler(state, userName);
    for (const it of items(args.new_characters)) {
        s.run(`新角色 ${str(it.name)}`, () => s.newCharacter(str(it.name), str(it.attributes), str(it.note)));
    }
    for (const it of items(args.attitudes)) {
        const changes = Object.fromEntries([...AXES.map(([k]) => k), 'familiarity'].map(k => [k, num(it[k])])) as Partial<Record<Axis | 'familiarity', number>>;
        s.run(`态度 ${str(it.who)}`, () => s.attitude(str(it.who), changes, str(it.reason)));
    }
    for (const it of items(args.bonds)) {
        const between = Array.isArray(it.between) ? it.between.map(str).filter(Boolean) : str(it.between).split(/[与和、,，\s]+/).filter(Boolean);
        s.run(`关系 ${between.join('与')}`, () => {
            if (between.length !== 2) throw new Error('关系需要写两个角色');
            return s.bond(between[0], between[1], str(it.now), str(it.reason));
        });
    }
    for (const it of items(args.status)) {
        const remove = /^(remove|del|delete|去掉|解除|-)$/i.test(str(it.change));
        s.run(`状态 ${str(it.who)} ${str(it.name)}`, () => (remove ? s.removeStatus(str(it.who), str(it.name)) : s.addStatus(str(it.who), str(it.name), str(it.effects), str(it.note))));
    }
    for (const it of items(args.growth)) {
        s.run(`成长 ${str(it.who)} ${str(it.item)}`, () => s.growth(str(it.who), str(it.item), str(it.change), str(it.reason)));
    }
    return s.results;
}

// ---------------------------------------------------------------------------------------------
// The older in-reply block
// ---------------------------------------------------------------------------------------------

/** The reply without its settlement block, and the block's lines. */
export function extractSettlement(text: string): { text: string; raw: string | null } {
    const m = text.match(BLOCK);
    if (!m) return { text, raw: null };
    const cleaned = (text.slice(0, m.index) + text.slice((m.index ?? 0) + m[0].length)).replace(/```\s*```/g, '').replace(/\n{3,}/g, '\n\n').trim();
    return { text: cleaned, raw: m[1].trim() };
}

const AXIS_BY_LABEL: Record<string, Axis> = Object.fromEntries(AXES.map(([k, l]) => [l, k]));

/** "亲近+8 怨恨-3" → { affection: 8, resentment: -3 } */
function axisChanges(text: string): Partial<Record<Axis, number>> {
    const out: Partial<Record<Axis, number>> = {};
    for (const m of text.matchAll(/(亲近|怨恨|信任|敬重|畏惧|吸引)\s*([+＋\-－−]\s*\d+(?:\.\d+)?)/g)) {
        out[AXIS_BY_LABEL[m[1]]] = Number(m[2].replace(/[＋\s]/g, '+').replace(/[－−]/g, '-'));
    }
    return out;
}

function pair(text: string, joiner = /\s*(?:→|->|＞|>|对)\s*/): [string, string] | null {
    const m = text.split(joiner).map(s => s.trim()).filter(Boolean);
    return m.length === 2 ? [m[0], m[1]] : null;
}

/** Applies an older <结算> block to `state` (already advanced one turn), line by line. */
export function applySettlement(state: TabletopState, raw: string, userName: string): SettleResult[] {
    const s = new Settler(state, userName);
    for (const rawLine of raw.split('\n')) {
        const line = rawLine.replace(/^\s*[-*·•\d.、]+\s*/, '').trim();
        if (!line) continue;
        const cells = line.split(/\s*[｜|]\s*/).map(c => c.trim());
        const kind = cells[0];
        s.run(line, () => {
            if (kind === '态度' || kind === '熟悉') {
                const p = pair(cells[1] ?? '');
                if (!p) throw new Error(`看不懂这一行（需要「${kind}｜A→主角｜…｜缘由」）`);
                if (s.isProtagonist(p[0])) throw new Error('主角自己的感情由玩家决定，不记录');
                const to = s.who(p[1], true);
                if (to !== PROTAGONIST) throw new Error('只记录别人对主角的态度；角色之间写「关系」');
                if (kind === '态度') {
                    const changes = axisChanges(cells[2] ?? '');
                    if (!Object.keys(changes).length) throw new Error('看不懂这一行（需要「态度｜A→主角｜亲近+8｜缘由」）');
                    return s.attitude(p[0], changes, cells[3] ?? '');
                }
                const delta = num(cells[2]);
                if (!delta) throw new Error('看不懂这一行（需要「熟悉｜A→主角｜+10｜缘由」）');
                return s.attitude(p[0], { familiarity: delta }, cells[3] ?? '');
            }
            if (kind === '关系') {
                const p = pair(cells[1] ?? '', /\s*(?:与|和|、|→|->)\s*/);
                if (!p) throw new Error('看不懂这一行（需要「关系｜A与B｜现在的关系｜缘由」）');
                return s.bond(p[0], p[1], cells[2] ?? '', cells[3] ?? '');
            }
            if (kind === '状态') {
                const what = cells[2] ?? '';
                if (!/^[+\-＋－]/.test(what)) throw new Error('状态需要写「+名称」或「-名称」');
                const label = what.slice(1).trim();
                if (/^[+＋]/.test(what)) {
                    const hasEffects = Object.keys(attributePairs(cells[3] ?? '', true)).length > 0;
                    return s.addStatus(cells[1] ?? '', label, hasEffects ? cells[3] ?? '' : '', (hasEffects ? cells[4] : cells[3]) ?? '');
                }
                return s.removeStatus(cells[1] ?? '', label);
            }
            if (kind === '新角色') {
                return s.newCharacter(cells[1] ?? '', cells.slice(2).join(' '), cells.slice(2).filter(c => !/\d/.test(c)).join('；'));
            }
            if (kind === '属性') {
                const m = (cells[2] ?? '').match(/^(.+?)\s*([+\-＋－−]\s*\d+)/);
                if (!m) throw new Error('需要「属性｜角色｜口才+5｜理由」');
                return s.growth(cells[1] ?? '', m[1].trim(), m[2], cells[3] ?? '');
            }
            if (kind === '特长') {
                if (!((cells[3] ?? '') in SKILL_LEVELS)) throw new Error('需要「特长｜角色｜特长名｜未学/入门/熟练/精通/大师」');
                return s.growth(cells[1] ?? '', cells[2] ?? '', cells[3] ?? '', cells[4] ?? '');
            }
            throw new Error(`不认识「${kind}」这一类变化`);
        });
    }
    return s.results;
}


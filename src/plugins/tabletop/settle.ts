// Step 2's hidden <结算> block: one change per line, applied by the rules. See docs/tabletop.md §5.
//
//   态度｜林晚→主角｜亲近+8 怨恨-3｜你替她挡了一刀
//   熟悉｜守卫甲→主角｜+10｜正面交过手
//   状态｜主角｜+左臂刀伤｜力量×0.8｜被守卫划了一刀
//   状态｜主角｜-醉意｜酒醒了
//   新角色｜守卫甲｜受过训练｜力量160 敏捷120 感知130｜后门守卫，三十来岁
//   属性｜主角｜口才+5｜长期练习
//   特长｜主角｜开锁｜精通｜跟老锁匠学了半年

import { applyAttitude, changeFamiliarity } from './attitude.ts';
import { clamp, fmt, SKILL_LEVELS } from './rules.ts';
import { AXES, canonicalName, newCharacter, resolveName, type Axis, type TabletopState } from './sheet.ts';

const BLOCK = /<结算>([\s\S]*?)(?:<\/结算>|$)/;
const MAX_ATTRIBUTE_CHANGE = 10;
const KEEP_LOG = 60;

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

function pair(text: string): [string, string] | null {
    const m = text.split(/\s*(?:→|->|＞|>|对)\s*/).map(s => s.trim()).filter(Boolean);
    return m.length === 2 ? [m[0], m[1]] : null;
}

/** "力量160 敏捷120" or "力量×0.8" → { 力量: 160, 敏捷: 120 } */
function attributePairs(text: string, multiplier = false): Record<string, number> {
    const out: Record<string, number> = {};
    const re = multiplier ? /([^\s\d×x*:：,，、]+)\s*[×x*]\s*(\d+(?:\.\d+)?)/g : /([^\s\d:：,，、+\-]+)\s*[:：]?\s*(\d+(?:\.\d+)?)/g;
    for (const m of text.matchAll(re)) out[m[1]] = Number(m[2]);
    return out;
}

export interface SettleResult {
    line: string;
    ok: boolean;
    text: string;
}

/**
 * Applies a settlement block to `state` (already advanced one turn). Unreadable lines are skipped
 * and reported; nothing the model writes can push values past the rules' limits.
 */
export function applySettlement(state: TabletopState, raw: string, userName: string): SettleResult[] {
    const results: SettleResult[] = [];
    const log = (text: string) => {
        state.log.push({ turn: state.turn, text });
        if (state.log.length > KEEP_LOG) state.log.splice(0, state.log.length - KEEP_LOG);
    };
    const who = (name: string, create = false) => {
        const key = resolveName(state, name, userName);
        if (key || !create) return key;
        const fresh = canonicalName(name, userName);
        state.characters[fresh] = { ...newCharacter(), temporary: true };
        return fresh;
    };
    for (const rawLine of raw.split('\n')) {
        const line = rawLine.replace(/^\s*[-*·•\d.、]+\s*/, '').trim();
        if (!line) continue;
        const cells = line.split(/\s*[｜|]\s*/).map(s => s.trim());
        const kind = cells[0];
        const fail = (why: string) => results.push({ line, ok: false, text: why });
        const done = (text: string) => {
            results.push({ line, ok: true, text });
            log(text);
        };
        try {
            if (kind === '态度') {
                const p = pair(cells[1] ?? '');
                const changes = axisChanges(cells[2] ?? '');
                if (!p || !Object.keys(changes).length) { fail('看不懂这一行（需要「态度｜A→B｜亲近+8｜缘由」）'); continue; }
                const from = who(p[0], true)!;
                const to = who(p[1], true)!;
                const change = applyAttitude(state, from, to, changes, cells[3] ?? '');
                done(`${from}→${to}：${change || '没有变化'}${cells[3] ? `（${cells[3]}）` : ''}`);
            } else if (kind === '熟悉') {
                const p = pair(cells[1] ?? '');
                const delta = Number((cells[2] ?? '').replace(/[＋\s]/g, '').replace(/[－−]/g, '-'));
                if (!p || !Number.isFinite(delta)) { fail('看不懂这一行（需要「熟悉｜A→B｜+10｜缘由」）'); continue; }
                const from = who(p[0], true)!;
                const to = who(p[1], true)!;
                const real = changeFamiliarity(state, from, to, delta);
                done(`${from}→${to}：熟悉${real >= 0 ? '+' : ''}${real}`);
            } else if (kind === '状态') {
                const name = who(cells[1] ?? '');
                const what = cells[2] ?? '';
                if (!name || !/^[+\-＋－]/.test(what)) { fail(name ? '状态需要写「+名称」或「-名称」' : `没有「${cells[1]}」这个角色`); continue; }
                const c = state.characters[name];
                const label = what.slice(1).trim();
                if (/^[+＋]/.test(what)) {
                    const effects = attributePairs(cells[3] ?? '', true);
                    for (const k of Object.keys(effects)) effects[k] = clamp(effects[k], 0.1, 5);
                    const note = (Object.keys(effects).length ? cells[4] : cells[3]) ?? '';
                    c.status = [...c.status.filter(s => s.name !== label), { name: label, effects, ...(note ? { note } : {}) }];
                    done(`${name}：新状态「${label}」${Object.keys(effects).length ? `（${Object.entries(effects).map(([k, f]) => `${k}×${fmt(f)}`).join(' ')}）` : ''}`);
                } else {
                    const before = c.status.length;
                    c.status = c.status.filter(s => s.name !== label);
                    if (c.status.length === before) { fail(`${name}没有「${label}」这个状态`); continue; }
                    done(`${name}：「${label}」解除`);
                }
            } else if (kind === '新角色') {
                const name = canonicalName(cells[1] ?? '', userName);
                if (!name) { fail('新角色需要名字'); continue; }
                const attrs = attributePairs(cells.slice(2).join(' '));
                const key = resolveName(state, name, userName) ?? name;
                const existing = state.characters[key];
                const c = existing ?? newCharacter();
                for (const [k, v] of Object.entries(attrs)) c.attributes[k] = clamp(Math.round(v), 1, 9999);
                const description = cells.slice(2).filter(s => !/\d/.test(s)).join('；');
                if (description) c.description = description;
                delete c.temporary;
                state.characters[key] = c;
                done(`${key}：${existing ? '正式建档' : '新登场'}`);
            } else if (kind === '属性') {
                const name = who(cells[1] ?? '');
                const m = (cells[2] ?? '').match(/^(.+?)\s*([+\-＋－−]\s*\d+)/);
                if (!name || !m) { fail(name ? '需要「属性｜角色｜口才+5｜理由」' : `没有「${cells[1]}」这个角色`); continue; }
                const attr = m[1].trim();
                const delta = clamp(Number(m[2].replace(/[＋\s]/g, '').replace(/[－−]/g, '-')), -MAX_ATTRIBUTE_CHANGE, MAX_ATTRIBUTE_CHANGE);
                const c = state.characters[name];
                const before = c.attributes[attr] ?? 100;
                c.attributes[attr] = clamp(before + delta, 1, 9999);
                done(`${name}：${attr} ${before} → ${c.attributes[attr]}${cells[3] ? `（${cells[3]}）` : ''}`);
            } else if (kind === '特长') {
                const name = who(cells[1] ?? '');
                const skill = cells[2] ?? '';
                const level = cells[3] ?? '';
                if (!name || !skill || !(level in SKILL_LEVELS)) { fail('需要「特长｜角色｜特长名｜未学/入门/熟练/精通/大师」'); continue; }
                state.characters[name].skills[skill] = level;
                done(`${name}：${skill}·${level}`);
            } else {
                fail(`不认识「${kind}」这一类变化`);
            }
        } catch (error) {
            fail((error as Error).message);
        }
    }
    return results;
}

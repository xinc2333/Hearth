// What the model is shown: the 跑团 data and this turn's checks, written as plain text.

import { describe } from './attitude.ts';
import { ATTRIBUTE_NOTES, CORE_ATTRIBUTES, fmt, PROTAGONIST, TIER_LABEL, type Tier } from './rules.ts';
import { AXES, relationValue, type CheckView, type Ruling, type TabletopState } from './sheet.ts';

function characterLine(name: string, state: TabletopState, userName: string): string {
    const c = state.characters[name];
    const label = name === PROTAGONIST && userName ? `${PROTAGONIST}（${userName}）` : name;
    const order = [...CORE_ATTRIBUTES, ...Object.keys(c.attributes).filter(k => !(CORE_ATTRIBUTES as readonly string[]).includes(k))];
    const attrs = order.filter(k => c.attributes[k] !== undefined).map(k => `${k}${c.attributes[k]}`).join(' ');
    const parts = [`${label}：${attrs || '（属性未登记，按普通人估计）'}`];
    const skills = Object.entries(c.skills).map(([k, v]) => `${k}·${v}`);
    if (skills.length) parts.push(`特长：${skills.join('、')}`);
    const traits = name === PROTAGONIST ? [] : Object.entries(c.traits).filter(([, v]) => v !== 1).map(([k, v]) => `${k}${fmt(v)}`);
    if (traits.length) parts.push(`性格：${traits.join(' ')}`);
    if (c.status.length) parts.push(`状态：${c.status.map(s => `${s.name}${Object.keys(s.effects).length ? `（${Object.entries(s.effects).map(([k, f]) => `${k}×${fmt(f)}`).join(' ')}）` : ''}`).join('、')}`);
    if (c.description) parts.push(c.description);
    if (c.temporary) parts.push('临时登记');
    return parts.join('｜');
}

/**
 * The 跑团 data block: characters, their attitudes toward the protagonist, and how others stand with
 * each other. With a scene, only the characters on it are written out; the rest are named with their
 * attitude in words.
 */
export function stateText(state: TabletopState, userName: string, scene?: ReadonlySet<string>): string {
    const on = (name: string) => !scene || name === PROTAGONIST || scene.has(name);
    const lines = ['【跑团数据】（属性以普通成年男性 = 100 为基准，按倍数理解；下面的数值是本轮的事实依据）'];
    const custom = Object.entries(state.custom);
    if (custom.length) lines.push(`本卡属性：${custom.map(([k, v]) => `${k}（${[v.note, v.anchor].filter(Boolean).join('；')}）`).join('、')}`);
    const names = Object.keys(state.characters).sort((a, b) => (a === PROTAGONIST ? -1 : b === PROTAGONIST ? 1 : 0));
    for (const name of names.filter(on)) lines.push(characterLine(name, state, userName));
    const relations = state.relations.filter(r => on(r.from));
    if (relations.length) {
        lines.push('', '【对主角的态度】（六条线各自 0～100，互不抵消；主角自己的感情由玩家决定，这里不记）');
        for (const r of relations) {
            const values = AXES.map(([axis, label]) => `${label}${relationValue(r, axis)}`).join(' ');
            const recent = r.reasons.slice(-3).map(x => (x.change ? `${x.text}（${x.change}）` : x.text)).filter(Boolean);
            lines.push(`${r.from}：${describe(r)}（${values}｜熟悉${r.familiarity}）${recent.length ? `｜最近：${recent.join('；')}` : ''}`);
        }
    }
    const bonds = state.bonds.filter(b => on(b.between[0]) && on(b.between[1]));
    if (bonds.length) {
        lines.push('', '【角色之间】');
        for (const b of bonds) {
            const last = b.reasons.at(-1)?.text;
            lines.push(`${b.between[0]}与${b.between[1]}：${b.text}${last ? `（${last}）` : ''}`);
        }
    }
    const away = names.filter(name => !on(name));
    if (away.length) {
        lines.push('', '【其他已登记的角色】（这一幕不在场，只列名字和对主角的态度）');
        lines.push(away.map(name => {
            const r = state.relations.find(x => x.from === name);
            return r ? `${name}（${describe(r)}）` : name;
        }).join('、'));
    }
    return lines.join('\n');
}

export function attributeGuide(): string {
    return CORE_ATTRIBUTES.map(a => `${a}（${ATTRIBUTE_NOTES[a]}）`).join('、');
}

function against(c: CheckView): string {
    return 'difficulty' in c.against ? `难度 ${Math.round(c.against.difficulty)}` : `${c.against.opponent}的${c.against.attribute} ${Math.round(c.against.value)}`;
}

/** One check as the ruling step's tool result reports it. */
export function checkResultLine(c: CheckView, i: number): string {
    return `${i + 1}. ${c.actor} ${c.action}：成功率 ${c.line}%，掷出 ${c.roll} → ${TIER_LABEL[c.tier as Tier] ?? c.tier}。采用的结果：${c.outcome}`;
}

/** This turn's checks for the narration step: the outcome first, the numbers after as the grounds. */
export function rulingText(ruling: Ruling): string {
    if (ruling.skipped === 'pass') return '';
    if (!ruling.checks.length) return '【本轮检定】本轮没有需要掷骰的事。';
    const lines = ['【本轮检定结果】以下结果已经发生，正文必须与之一致。'];
    ruling.checks.forEach((c, i) => {
        const tier = TIER_LABEL[c.tier as Tier] ?? c.tier;
        const grounds = `${c.hidden ? '暗骰' : '明骰'}｜${c.steps.join(' × ')} = ${Math.round(c.value)} 对 ${against(c)}｜成功率 ${c.line}%｜掷出 ${c.roll}`;
        lines.push(`${i + 1}. ${c.actor} ${c.action} → ${tier}：${c.outcome}（${grounds}）`);
        if (c.hidden) lines.push('   （暗骰：主角并不知道这个结果，只能通过主角看得到、听得到的表现体现出来。）');
    });
    return lines.join('\n');
}

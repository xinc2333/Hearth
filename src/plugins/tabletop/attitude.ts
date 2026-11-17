// Attitudes: six independent lines per direction, each a lasting part plus a passing feeling.
// See docs/tabletop.md §4.

import { clamp, DEFAULT_RULES, fmt, type Rules } from './rules.ts';
import { AXES, AXIS_LABEL, emptyAxes, relationValue, type Axis, type CharacterSheet, type Relation, type TabletopState } from './sheet.ts';

export const MAX_TURN_CHANGE = 30;
const KEEP_REASONS = 5;

const traitOf = (state: TabletopState, name: string) => state.characters[name]?.traits ?? { 敏感: 1, 记仇: 1, 多疑: 1 };

export function findRelation(state: TabletopState, from: string, to: string, create = false): Relation | null {
    let r = state.relations.find(x => x.from === from && x.to === to) ?? null;
    if (!r && create) {
        r = { from, to, base: emptyAxes(), mood: emptyAxes(), familiarity: 0, reasons: [] };
        state.relations.push(r);
    }
    return r;
}

/** One turn passes: passing feelings fade toward the lasting attitude (resentment slower for grudge-holders). */
export function decay(state: TabletopState, rules: Rules = DEFAULT_RULES) {
    for (const r of state.relations) {
        const traits = traitOf(state, r.from);
        for (const [axis] of AXES) {
            const rate = axis === 'resentment' ? rules.moodDecay / traits.记仇 : rules.moodDecay;
            const next = r.mood[axis] * (1 - clamp(rate, 0, 1));
            r.mood[axis] = Math.abs(next) < 0.5 ? 0 : next;
        }
    }
}

/**
 * Applies a change the model proposed to one line. Returns the change actually made: scaled by the
 * character's traits, capped per turn, slowed near either end, split between the lasting attitude
 * (more for strangers) and the passing feeling.
 */
export function changeAxis(rel: Relation, axis: Axis, proposed: number, traits: CharacterSheet['traits']): number {
    let delta = proposed * traits.敏感;
    if (axis === 'trust') delta = delta > 0 ? delta / traits.多疑 : delta * traits.多疑;
    delta = clamp(delta, -MAX_TURN_CHANGE, MAX_TURN_CHANGE);
    const now = relationValue(rel, axis);
    if (delta > 0 && now > 50) delta *= (100 - now) / 50;
    if (delta < 0 && now < 50) delta *= now / 50;
    const settle = 0.2 + 0.6 * (1 - rel.familiarity / 100);
    rel.base[axis] = clamp(rel.base[axis] + delta * settle, 0, 100);
    rel.mood[axis] += delta * (1 - settle);
    // Keep the shown value within 0–100.
    const total = rel.base[axis] + rel.mood[axis];
    if (total > 100) rel.mood[axis] -= total - 100;
    if (total < 0) rel.mood[axis] -= total;
    return relationValue(rel, axis) - now;
}

export function addReason(rel: Relation, turn: number, text: string, change: string) {
    if (!text && !change) return;
    rel.reasons.push({ turn, text, change });
    if (rel.reasons.length > KEEP_REASONS) rel.reasons.splice(0, rel.reasons.length - KEEP_REASONS);
}

export function applyAttitude(state: TabletopState, from: string, to: string, changes: Partial<Record<Axis, number>>, reason: string): string {
    const rel = findRelation(state, from, to, true)!;
    const traits = traitOf(state, from);
    const done: string[] = [];
    for (const [axis, proposed] of Object.entries(changes) as [Axis, number][]) {
        if (!proposed) continue;
        const real = changeAxis(rel, axis, proposed, traits);
        done.push(`${AXIS_LABEL[axis]}${real >= 0 ? '+' : ''}${fmt(Math.round(real))}`);
    }
    const change = done.join(' ');
    addReason(rel, state.turn, reason, change);
    return change;
}

export function changeFamiliarity(state: TabletopState, from: string, to: string, delta: number) {
    const rel = findRelation(state, from, to, true)!;
    const before = rel.familiarity;
    rel.familiarity = clamp(Math.round(rel.familiarity + clamp(delta, -MAX_TURN_CHANGE, MAX_TURN_CHANGE)), 0, 100);
    return rel.familiarity - before;
}

/** Words for a relation from its values; the combinations come first, then the strongest lines. */
export function describe(rel: Relation): string {
    const v = Object.fromEntries(AXES.map(([axis]) => [axis, relationValue(rel, axis)])) as Record<Axis, number>;
    const words: string[] = [];
    if (v.affection >= 60 && v.resentment >= 50) words.push('爱恨交织');
    if (v.fear >= 60 && v.affection >= 50) words.push('又怕又离不开');
    if (v.attraction >= 60 && v.resentment >= 50) words.push('恨，却又被吸引');
    if (v.affection >= 60 && v.trust < 30) words.push('喜欢但不信任');
    if (v.respect >= 60 && v.affection < 30) words.push('敬而远之');
    if (words.length) return words.join('，');
    const strong = AXES.map(([axis]) => axis).filter(a => v[a] >= 40).sort((a, b) => v[b] - v[a]).slice(0, 2);
    const single: Record<Axis, [string, string]> = {
        affection: ['有好感', '亲近'],
        resentment: ['有怨气', '怨恨'],
        trust: ['信得过', '信任'],
        respect: ['看得起', '敬重'],
        fear: ['有些怕', '畏惧'],
        attraction: ['被吸引', '倾心'],
    };
    if (strong.length) return strong.map(a => single[a][v[a] >= 70 ? 1 : 0]).join('，');
    if (rel.familiarity < 20) return '陌生';
    return v.trust < 15 && rel.familiarity >= 40 ? '不信任' : '平淡';
}

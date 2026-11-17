// 跑团 rules: attributes, reference levels, skill levels, difficulty, success chance and roll tiers.
// Pure functions; the numbers are documented in docs/tabletop.md.

export const PROTAGONIST = '主角';

export const CORE_ATTRIBUTES = ['力量', '敏捷', '体质', '感知', '智力', '意志', '魅力', '口才'] as const;

export const ATTRIBUTE_NOTES: Record<string, string> = {
    力量: '搬、举、打、角力',
    敏捷: '速度、灵巧、平衡、手上功夫、潜行',
    体质: '耐力、扛伤、抗病、酒量',
    感知: '察觉、观察、直觉',
    智力: '知识、推理、学习',
    意志: '定力、抗压、抵抗诱惑和恐吓',
    魅力: '外貌和气质带来的吸引力、第一印象',
    口才: '说服、谈判、欺骗、表演',
};

/** Reference levels: 100 is an ordinary adult man; values read as multiples. */
export const LEVELS: [number, string][] = [
    [30, '幼童'],
    [50, '孩子、病弱、年迈'],
    [100, '普通成年男性'],
    [150, '受过训练'],
    [200, '行业顶尖'],
    [300, '人类极限'],
];

/** A rough word for a value, for showing NPCs without numbers. */
export function levelWord(value: number): string {
    if (value > 320) return '超出人类';
    if (value >= 250) return '人类极限';
    if (value >= 180) return '行业顶尖';
    if (value >= 130) return '受过训练';
    if (value >= 80) return '普通';
    if (value >= 45) return '偏弱';
    return '很弱';
}

export const SKILL_LEVELS: Record<string, number> = { 未学: 0.5, 入门: 1, 熟练: 1.5, 精通: 2, 大师: 3 };

export const DIFFICULTIES: [string, number][] = [['简单', 50], ['普通', 100], ['困难', 150], ['很难', 200], ['极难', 300]];

export function difficultyWord(value: number): string {
    let best = DIFFICULTIES[0];
    for (const d of DIFFICULTIES) if (Math.abs(Math.log(d[1] / value)) < Math.abs(Math.log(best[1] / value))) best = d;
    return Math.abs(best[1] - value) / best[1] < 0.08 ? best[0] : `难度 ${Math.round(value)}`;
}

export type Tier = 'critical' | 'success' | 'failure' | 'fumble';
export const TIERS: Tier[] = ['critical', 'success', 'failure', 'fumble'];
export const TIER_LABEL: Record<Tier, string> = { critical: '大成功', success: '成功', failure: '失败', fumble: '大失败' };

export interface Rules {
    /** The exponent in the success formula: higher means skill matters more than luck. */
    exponent: number;
    /** Ruling round trips per turn. */
    maxRounds: number;
    /** Share of a passing mood that fades each turn. */
    moodDecay: number;
}

export const DEFAULT_RULES: Rules = { exponent: 3, maxRounds: 5, moodDecay: 0.15 };

export function rulesFrom(config: Record<string, unknown>): Rules {
    const num = (v: unknown, min: number, max: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
    return {
        exponent: num(config.exponent, 1, 8, DEFAULT_RULES.exponent),
        maxRounds: Math.round(num(config.maxRounds, 1, 10, DEFAULT_RULES.maxRounds)),
        moodDecay: num(config.moodDecay, 0, 1, DEFAULT_RULES.moodDecay),
    };
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** value³ / (value³ + difficulty³), kept within 1%–99%. */
export function successChance(value: number, difficulty: number, exponent = DEFAULT_RULES.exponent): number {
    const a = Math.max(value, 0.01) ** exponent;
    const d = Math.max(difficulty, 0.01) ** exponent;
    return clamp(a / (a + d), 0.01, 0.99);
}

/** The success line on a d100: rolls at or below it succeed. */
export function successLine(chance: number): number {
    return clamp(Math.round(chance * 100), 1, 99);
}

/** Critical: the lowest tenth of the success range; fumble: the highest tenth of the failure range. */
export function tierOf(roll: number, line: number): Tier {
    const critical = Math.max(1, Math.round(line / 10));
    const fumbleAbove = 100 - Math.max(1, Math.round((100 - line) / 10));
    if (roll <= critical) return 'critical';
    if (roll <= line) return 'success';
    if (roll > fumbleAbove) return 'fumble';
    return 'failure';
}

export function rollD100(random: () => number = Math.random): number {
    return Math.min(100, Math.floor(random() * 100) + 1);
}

export interface Modifier {
    reason: string;
    factor: number;
}

/** Each situational factor within ×0.25–×4, their product within ×0.1–×10. */
export function clampModifiers(list: Modifier[]): { list: Modifier[]; product: number } {
    const clean = list
        .filter(m => m && typeof m.factor === 'number' && Number.isFinite(m.factor) && m.factor > 0)
        .map(m => ({ reason: String(m.reason ?? '').trim() || '环境', factor: clamp(m.factor, 0.25, 4) }));
    const product = clamp(clean.reduce((p, m) => p * m.factor, 1), 0.1, 10);
    return { list: clean, product };
}

export const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));

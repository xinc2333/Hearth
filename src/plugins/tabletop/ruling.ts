// Step 1 (裁定): the model lists this turn's uncertain actions through the hearth_check tool, with an
// outcome for each result tier; Hearth rolls and hands back the outcome that came up. Checks that
// depend on an earlier result can follow in another round (done: false).

import { clampModifiers, CORE_ATTRIBUTES, DIFFICULTIES, fmt, PROTAGONIST, rollD100, SKILL_LEVELS, successChance, successLine, TIER_LABEL, TIERS, tierOf, type Rules, type Tier } from './rules.ts';
import { canonicalName, newCharacter, resolveName, type CharacterSheet, type CheckView, type Ruling, type TabletopState } from './sheet.ts';
import { checkResultLine } from './text.ts';
import { CHECK_WORLD_PROPERTIES, parseTurnAsk } from './world/tools.ts';

export const CHECK_TOOL_NAME = 'hearth_check';

const OUTCOME_KEYS: Record<Tier, string> = { critical: 'critical', success: 'success', failure: 'failure', fumble: 'fumble' };

/** The ruling tool; a 世界 chat adds how long the turn takes and where the protagonist goes. */
export function checkTool(world = false) {
    const outcome = (label: string) => ({ type: 'string', description: `${label}时确定会发生的事（一两句）：只写一种情形，不写「或者」「也许」` });
    return {
        type: 'function',
        function: {
            name: CHECK_TOOL_NAME,
            description: '跑团 DM 的检定工具：提交本轮结果说不准、需要掷骰的事，Hearth 掷骰后返回掷中的结果。没有需要检定的事时，checks 留空、done 填 true。',
            parameters: {
                type: 'object',
                properties: {
                    think: { type: 'string', description: '裁定前的简短判断：这一轮发生了什么，哪些事结果说不准' },
                    checks: {
                        type: 'array',
                        description: '本次提交的检定；互不依赖的检定一次提交',
                        items: {
                            type: 'object',
                            properties: {
                                actor: { type: 'string', description: `谁来做：「${PROTAGONIST}」或角色名` },
                                actor_value: { type: 'number', description: '只在这个角色还不在跑团数据里时填写：你估计的有效值（属性×特长）' },
                                action: { type: 'string', description: '要做的事，例如「撬开后门的锁」' },
                                reason: { type: 'string', description: '为什么结果说不准' },
                                attribute: { type: 'string', description: `用哪项属性：${CORE_ATTRIBUTES.join('、')}，或本卡自定义的属性` },
                                skill: { type: 'string', description: '涉及的特长（可选）' },
                                difficulty: { type: 'number', description: `难度（和 opponent 二选一）：${DIFFICULTIES.map(([w, v]) => `${w} ${v}`).join('、')}，可以给中间值；含义是属性多高才有五成把握` },
                                opponent: {
                                    type: 'object',
                                    description: '对抗的对手（和 difficulty 二选一）',
                                    properties: {
                                        name: { type: 'string' },
                                        attribute: { type: 'string' },
                                        skill: { type: 'string' },
                                        value: { type: 'number', description: '只在对手还不在跑团数据里时填写：估计的有效值' },
                                    },
                                    required: ['name', 'attribute'],
                                },
                                modifiers: {
                                    type: 'array',
                                    description: '环境加成，每项写理由和倍率，例如 只有一根发卡 ×0.8、对方信任你 ×1.3',
                                    items: { type: 'object', properties: { reason: { type: 'string' }, factor: { type: 'number' } }, required: ['reason', 'factor'] },
                                },
                                hidden: { type: 'boolean', description: '暗骰：主角察觉不到这个检定（例如守卫有没有注意到主角）' },
                                outcomes: {
                                    type: 'object',
                                    description: '先写好四种结果各自会发生什么，每种是一件确定的事；掷骰后只采用掷中的那一种，原样当作事实',
                                    properties: { critical: outcome('大成功'), success: outcome('成功'), failure: outcome('失败'), fumble: outcome('大失败') },
                                    required: ['critical', 'success', 'failure', 'fumble'],
                                },
                            },
                            required: ['actor', 'action', 'attribute', 'outcomes'],
                        },
                    },
                    done: { type: 'boolean', description: 'true：本轮裁定结束；false：还有要看这次结果才能决定的检定' },
                    ...(world ? CHECK_WORLD_PROPERTIES : {}),
                },
                required: ['checks', 'done'],
            },
        },
    };
}

export interface CheckArgs {
    think?: string;
    checks?: unknown[];
    done?: boolean;
}

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : null);

/** Lenient JSON: the arguments may arrive wrapped in prose or a code fence. */
export function parseArgs(text: string): CheckArgs | null {
    const tries = [text, text.match(/<hearth_check>([\s\S]*?)<\/hearth_check>/i)?.[1], text.match(/\{[\s\S]*\}/)?.[0]];
    for (const t of tries) {
        if (!t) continue;
        try {
            const v = JSON.parse(t.trim());
            if (isRecord(v)) return v as CheckArgs;
        } catch {
            // next form
        }
    }
    return null;
}

/** Effective value: attribute × skill level × status effects × situational factors, with the steps shown. */
export function effectiveValue(c: CharacterSheet | undefined, attribute: string, skill: string, estimate: number | null): { value: number; steps: string[] } {
    const steps: string[] = [];
    let value: number;
    const base = c?.attributes[attribute];
    if (base !== undefined) {
        value = base;
        steps.push(`${attribute}${base}`);
        if (skill) {
            const level = c?.skills[skill];
            const factor = level ? SKILL_LEVELS[level] : SKILL_LEVELS.未学;
            value *= factor;
            steps.push(`${skill}·${level ?? '未学'}×${fmt(factor)}`);
        }
    } else if (estimate !== null && estimate > 0) {
        value = estimate;
        steps.push(`${attribute}（估计）${fmt(estimate)}`);
    } else {
        value = 100;
        steps.push(`${attribute}（未登记，按普通人）100`);
    }
    for (const s of c?.status ?? []) {
        const f = s.effects[attribute];
        if (f && f !== 1) {
            value *= f;
            steps.push(`${s.name}×${fmt(f)}`);
        }
    }
    return { value, steps };
}

/** The sheet entry for a name, registering an estimated stranger when the model gave a value. */
function characterFor(state: TabletopState, added: Record<string, CharacterSheet>, name: string, attribute: string, estimate: number | null, userName: string): { key: string; sheet?: CharacterSheet } {
    const key = resolveName(state, name, userName);
    if (key) return { key, sheet: state.characters[key] };
    const fresh = canonicalName(name, userName) || '无名';
    if (estimate !== null && estimate > 0) {
        const sheet = state.characters[fresh] ?? newCharacter();
        sheet.temporary = true;
        sheet.attributes[attribute] ??= Math.round(estimate);
        state.characters[fresh] = sheet;
        added[fresh] = sheet;
        return { key: fresh, sheet };
    }
    return { key: fresh };
}

/** Rolls the checks of one tool call. Unknown characters with an estimate are added to `state`. */
export function resolveChecks(args: CheckArgs, state: TabletopState, userName: string, rules: Rules, added: Record<string, CharacterSheet>, random: () => number = Math.random): CheckView[] {
    const out: CheckView[] = [];
    for (const raw of Array.isArray(args.checks) ? args.checks : []) {
        if (!isRecord(raw)) continue;
        const attribute = str(raw.attribute) || '敏捷';
        const action = str(raw.action) || '行动';
        const skill = str(raw.skill);
        const actor = characterFor(state, added, str(raw.actor) || PROTAGONIST, attribute, num(raw.actor_value), userName);
        const me = actor.sheet ? effectiveValue(actor.sheet, attribute, skill, null) : effectiveValue(undefined, attribute, '', num(raw.actor_value));
        const mods = clampModifiers(Array.isArray(raw.modifiers) ? raw.modifiers.filter(isRecord).map(m => ({ reason: str(m.reason), factor: num(m.factor) ?? NaN })) : []);
        const value = me.value * mods.product;
        const steps = [...me.steps, ...mods.list.map(m => `${m.reason}×${fmt(m.factor)}`)];

        let target: CheckView['against'];
        let difficulty: number;
        const opp = isRecord(raw.opponent) ? raw.opponent : null;
        if (opp && str(opp.name)) {
            const oppAttr = str(opp.attribute) || attribute;
            const who = characterFor(state, added, str(opp.name), oppAttr, num(opp.value), userName);
            const them = who.sheet ? effectiveValue(who.sheet, oppAttr, str(opp.skill), null) : effectiveValue(undefined, oppAttr, '', num(opp.value));
            difficulty = them.value;
            target = { opponent: who.key, attribute: oppAttr, value: them.value, steps: them.steps };
        } else {
            difficulty = Math.max(1, num(raw.difficulty) ?? 100);
            target = { difficulty };
        }
        const chance = successChance(value, difficulty, rules.exponent);
        const line = successLine(chance);
        const roll = rollD100(random);
        const tier = tierOf(roll, line);
        const outcomes: Record<string, string> = {};
        const given = isRecord(raw.outcomes) ? raw.outcomes : {};
        for (const t of TIERS) outcomes[t] = str(given[OUTCOME_KEYS[t]]) || str(given[TIER_LABEL[t]]);
        // A missing outcome falls back to the nearest one the model did write.
        const outcome = outcomes[tier] || (tier === 'critical' ? outcomes.success : tier === 'fumble' ? outcomes.failure : '') || TIER_LABEL[tier];
        out.push({
            actor: actor.key, action, reason: str(raw.reason), attribute, ...(skill ? { skill } : {}),
            against: target, modifiers: mods.list, hidden: raw.hidden === true, outcomes,
            value, steps, chance, line, roll, tier, outcome,
        });
    }
    return out;
}

export interface RulingDeps {
    /** The first ruling request: the preset's request with the ruling turn appended and the tool forced. */
    body: Record<string, unknown>;
    send: (body: Record<string, unknown>) => Promise<{ text: string; toolCalls: { id?: string; function?: { name?: string; arguments?: string }; [k: string]: unknown }[] }>;
    state: TabletopState;
    userName: string;
    userText: string;
    rules: Rules;
    onRound?: (round: number, body: Record<string, unknown>, checks: CheckView[]) => void;
    random?: () => number;
}

/** Runs the ruling round trips. Errors become an empty ruling with the reason, so the turn goes on. */
export async function runRuling(deps: RulingDeps): Promise<Ruling> {
    const checks: CheckView[] = [];
    const added: Record<string, CharacterSheet> = {};
    const thinks: string[] = [];
    let ask: Ruling['ask'];
    let body = deps.body;
    let rounds = 0;
    for (let round = 1; round <= deps.rules.maxRounds; round++) {
        rounds = round;
        const res = await deps.send(body);
        const call = res.toolCalls.find(c => c.function?.name === CHECK_TOOL_NAME)
            ?? res.toolCalls.find(c => /"checks"/.test(c.function?.arguments ?? ''));
        const args = call ? parseArgs(call.function?.arguments ?? '') : parseArgs(res.text);
        if (!args) {
            if (round === 1) throw new Error(res.toolCalls.length ? `模型调用了 ${res.toolCalls.map(c => c.function?.name).join('、')}，没有调用掷骰工具` : '模型没有调用掷骰工具');
            break;
        }
        if (str(args.think)) thinks.push(str(args.think));
        ask ??= parseTurnAsk(args as Record<string, unknown>);
        const results = resolveChecks(args, deps.state, deps.userName, deps.rules, added, deps.random);
        checks.push(...results);
        deps.onRound?.(round, body, [...checks]);
        if (args.done !== false || !results.length || round === deps.rules.maxRounds) break;
        // Hand the results back as the tool's answer and let the model add the checks that depended on them.
        const id = call?.id ?? `call_hearth_check_${round}`;
        const messages = [...(body.messages as unknown[])];
        messages.push(
            call ? { role: 'assistant', content: res.text || null, tool_calls: [{ ...call, id, type: 'function' }], ...('thoughtSignature' in call ? { thoughtSignature: call.thoughtSignature } : {}) } : { role: 'assistant', content: res.text },
            call
                ? { role: 'tool', tool_call_id: id, name: CHECK_TOOL_NAME, content: `掷骰结果：\n${results.map((c, i) => checkResultLine(c, checks.length - results.length + i)).join('\n')}\n\n还有要看这些结果才能决定的检定，就继续调用 ${CHECK_TOOL_NAME}；没有了就让 checks 留空、done 填 true。` }
                : { role: 'user', content: `掷骰结果：\n${results.map((c, i) => checkResultLine(c, i)).join('\n')}` },
        );
        body = { ...body, messages };
    }
    return {
        userText: deps.userText,
        checks,
        rounds,
        ...(Object.keys(added).length ? { added } : {}),
        ...(thinks.length ? { think: thinks.join('\n') } : {}),
        ...(ask ? { ask } : {}),
    };
}

// The 世界 steps inside 跑团's turn (docs/world.md §2): the opening, the turn's time and the scene.
// index.ts calls these; each step goes out as the preset's request with the step appended.

import type { Chat } from '../../../core/types.ts';
import { appendStep, forceTool } from '../shape.ts';
import { PLUGIN_ID, swipeData, type TabletopState } from '../sheet.ts';
import { applyScene, applySetup, setupChoices, worldSeed, type SetupForm } from './apply.ts';
import { lanjiang, type City } from './city/index.ts';
import { WORLD_ENTRIES, type WorldEntry } from './entries.ts';
import { parseJson, parseSceneArgs, SCENE_TOOL_NAME, SETUP_TOOL_NAME } from './tools.ts';
import { sceneText, setupText } from './text.ts';
import { ACT_TOOL_NAME, actText, applyAct, applyDay, applyProfile, DAY_TOOL_NAME, dayText, PROFILE_TOOL_NAME, takeNotices, type ImportantProfile, type ProfileResult } from './minds.ts';
import { addEvent, dateKey, fmtNow, learn, normalizeWorld, placeById, type WorldState } from './state.ts';
import type { TurnPlan } from './turn.ts';

/** What a 世界 chat keeps on the chat itself: the opening form, and the world it started from. */
export interface ChatWorld {
    setup?: SetupForm;
    base?: WorldState;
    /** 重要人物 profiles, by name (docs/world.md §9). */
    important?: Record<string, ImportantProfile>;
    /** Profiles of people no longer 重要人物, kept for when they are again. */
    archived?: Record<string, ImportantProfile>;
    /** Promotions waiting for the next turn (asked while no request was at hand). */
    queue?: { name: string; base: string; sceneId?: string }[];
}

export const city = (): City => lanjiang();

export function chatWorld(chat: Pick<Chat, 'plugins'>): ChatWorld | null {
    const data = (chat.plugins?.[PLUGIN_ID] as { world?: ChatWorld } | undefined)?.world;
    return data && (data.setup || data.base) ? data : null;
}

/** The world before message `index`: the nearest earlier reply that carries one, else the starting world. */
export function worldBefore(chat: Pick<Chat, 'messages' | 'plugins'>, index: number): WorldState | null {
    for (let i = Math.min(index, chat.messages.length) - 1; i >= 0; i--) {
        const world = swipeData(chat.messages[i])?.world;
        if (world) return normalizeWorld(structuredClone(world));
    }
    const base = chatWorld(chat)?.base;
    return base ? normalizeWorld(structuredClone(base)) : null;
}

export type StepTexts = Partial<Record<string, string>> & { role?: 'system' | 'user' | 'assistant' };

/** A world entry's text from the preset, or the generic one when the preset lacks it. */
export function entry(texts: StepTexts, kind: WorldEntry['kind']): string {
    return texts[kind] ?? WORLD_ENTRIES.find(e => e.kind === kind)!.content.replace(/^<<<[^\n]*>>>\n/, '');
}

type Send = (body: Record<string, unknown>) => Promise<{ text: string; toolCalls: { function?: { name?: string; arguments?: string } }[] }>;

/** The opening: asks for the protagonist's life as data and builds the world and sheet from it. */
export async function runSetup(body: Record<string, unknown>, texts: StepTexts, form: SetupForm, chatId: string, send: Send, trace?: (label: string, body: Record<string, unknown>) => void): Promise<{ world: WorldState; state: TabletopState; lines: string[] }> {
    const c = city();
    const content = [entry(texts, 'world-setup'), setupText(form, setupChoices(c, form))].join('\n\n');
    const request = forceTool(appendStep(body, { content, lead: texts['world-setup-lead'], role: texts.role }, 'world_setup'), SETUP_TOOL_NAME, true);
    trace?.('世界开局', request);
    const res = await send(request);
    const call = res.toolCalls.find(x => x.function?.name === SETUP_TOOL_NAME) ?? res.toolCalls.find(x => /"home"/.test(x.function?.arguments ?? ''));
    const args = parseJson(call?.function?.arguments ?? res.text);
    if (!args) throw new Error('模型没有调用开局工具');
    return applySetup(args, form, c, worldSeed(chatId));
}

/** The scene: asks how the people at the place look, as the protagonist sees them. Fails quietly. */
export async function runScene(body: Record<string, unknown>, texts: StepTexts, world: WorldState, fresh: string[], send: Send, trace?: (label: string, body: Record<string, unknown>) => void): Promise<string | null> {
    if (!fresh.length) return null;
    const c = city();
    const content = [entry(texts, 'world-scene'), sceneText(world, c, fresh)].join('\n\n');
    const request = forceTool(appendStep(body, { content, lead: texts['world-scene-lead'], role: texts.role }, 'world_scene'), SCENE_TOOL_NAME, true);
    trace?.('世界场景', request);
    try {
        const res = await send(request);
        const call = res.toolCalls.find(x => x.function?.name === SCENE_TOOL_NAME) ?? res.toolCalls.find(x => /"people"/.test(x.function?.arguments ?? ''));
        const args = parseSceneArgs(call?.function?.arguments ?? res.text);
        if (!args) return '模型没有调用场景工具';
        applyScene(world, args);
        return null;
    } catch (error) {
        return (error as Error).message;
    }
}

// ---------------------------------------------------------------------------------------------
// Minds: reactions in the turn, the days of 重要人物, and new profiles (docs/world.md §1, §9)
// ---------------------------------------------------------------------------------------------

export interface Reaction {
    who: string;
    /** Attitude change toward the protagonist, applied to the 跑团 sheet with the reply. */
    feelings?: Record<string, unknown>;
    think?: string;
}

/** Each step goes out as the preset's request with one person's step appended. */
async function ask(body: Record<string, unknown>, texts: StepTexts, kind: 'world-act' | 'world-day' | 'world-profile', content: string, tool: string, label: string, send: Send, trace?: (label: string, body: Record<string, unknown>) => void): Promise<unknown> {
    const request = forceTool(appendStep(body, { content: [entry(texts, kind), content].join('\n\n'), lead: texts[`${kind}-lead`], role: texts.role }, kind.replace('-', '_')), tool, true);
    trace?.(label, request);
    const res = await send(request);
    const call = res.toolCalls.find(x => x.function?.name === tool) ?? res.toolCalls[0];
    return parseJson(call?.function?.arguments ?? res.text);
}

/**
 * Everyone who noticed something during the turn decides what to do, one request each, at the same
 * time. What they do can make others notice things; that gets a second round, later ones wait.
 */
export async function runReactions(body: Record<string, unknown>, texts: StepTexts, world: WorldState, state: TabletopState, important: Record<string, ImportantProfile>, plan: TurnPlan, send: Send, trace?: (label: string, body: Record<string, unknown>) => void, warn?: (text: string) => void): Promise<Reaction[]> {
    const c = city();
    const out: Reaction[] = [];
    for (let round = 0; round < 2; round++) {
        const due = takeNotices(world, plan.to);
        if (!due.size) break;
        const answers = await Promise.all([...due].slice(0, 6).map(async ([who, notices]) => {
            try {
                const args = await ask(body, texts, 'world-act', actText(world, c, state, who, notices, important[who]), ACT_TOOL_NAME, `世界 · ${who}的反应`, send, trace);
                return { who, notices, args };
            } catch (error) {
                warn?.(`${who}的反应没有完成：${(error as Error).message}`);
                return { who, notices, args: null };
            }
        }));
        for (const { who, notices, args } of answers) {
            for (const n of notices) learn(world, who, n.what, '亲眼', n.at);
            if (!args) continue;
            const after = Math.max(...notices.map(n => n.at));
            const result = applyAct(world, c, who, args, after, plan.to);
            for (const e of result.events) addEvent(world, e);
            plan.events.push(...result.events);
            out.push({ who, ...(result.feelings ? { feelings: result.feelings } : {}), ...(typeof (args as { think?: unknown }).think === 'string' ? { think: (args as { think: string }).think } : {}) });
        }
    }
    plan.events.sort((a, b) => a.at - b.at);
    return out;
}

/** The days that passed in this turn, for each 重要人物 not with the protagonist. Changes `world`. */
export async function runDays(body: Record<string, unknown>, texts: StepTexts, world: WorldState, state: TabletopState, important: Record<string, ImportantProfile>, from: number, to: number, present: Set<string>, send: Send, trace?: (label: string, body: Record<string, unknown>) => void): Promise<string[]> {
    const c = city();
    const days: number[] = [];
    for (let d = Math.floor(from / 1440) * 1440 + 1440; d <= to; d += 1440) days.push(d);
    if (!days.length) return [];
    const names = Object.keys(important).filter(n => world.people[n]?.kind === 'important' && !present.has(n));
    const lines: string[] = [];
    await Promise.all(names.map(async who => {
        // A skip of several days is one request per person, covering them all.
        const span = days.length > 1 ? `${dateKey(days[0] - 1440)} 到 ${dateKey(days.at(-1)! - 1440)}` : dateKey(days[0] - 1440);
        const seen = (world.knowledge[who] ?? []).filter(k => k.at >= from && k.at <= to).map(k => k.text);
        try {
            const args = await ask(body, texts, 'world-day', dayText(world, c, state, who, important[who], span, seen), DAY_TOOL_NAME, `世界 · ${who}的一天`, send, trace);
            lines.push(...applyDay(world, c, who, args, days.at(-1)!));
        } catch (error) {
            lines.push(`${who}的这一天没有推演：${(error as Error).message}`);
        }
    }));
    return lines;
}

/** A new 重要人物's profile. `base` is text the user brought (kept as it is), or what the story showed. */
export async function runProfile(body: Record<string, unknown>, texts: StepTexts, world: WorldState, state: TabletopState, who: string, base: string, send: Send, trace?: (label: string, body: Record<string, unknown>) => void): Promise<ProfileResult | null> {
    const c = city();
    const others = Object.entries(world.people).filter(([n, p]) => p.kind === 'important' && n !== who).map(([n, p]) => `${n}（${p.role ?? ''}）`);
    const content = [
        `【要写档案的人】${who}`,
        base,
        world.knowledge[who]?.length ? `他已经知道的事：\n${world.knowledge[who].slice(-15).map(k => `- ${k.text}`).join('\n')}` : '',
        others.length ? `其他重要人物：${others.join('、')}` : '',
        `【澜江市】${fmtNow(world)}。主角住在${placeById(world, c, world.me.home)?.name ?? ''}，在${placeById(world, c, world.at)?.name ?? ''}。`,
        `可以选的地点：${c.places.filter(p => p.landmark).slice(0, 40).map(p => p.name).join('、')}，以及各区的小区、店铺；也可以写新地点的名字。`,
    ].filter(Boolean).join('\n\n');
    const args = await ask(body, texts, 'world-profile', content, PROFILE_TOOL_NAME, `世界 · ${who}的档案`, send, trace);
    return args ? applyProfile(world, c, args, who, /^【原有档案】/.test(base) ? base.replace(/^【原有档案】\n?/, '') : undefined) : null;
}

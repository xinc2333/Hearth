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
import type { WorldState } from './state.ts';

/** What a 世界 chat keeps on the chat itself: the opening form, and the world it started from. */
export interface ChatWorld {
    setup?: SetupForm;
    base?: WorldState;
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
        if (world) return structuredClone(world);
    }
    const base = chatWorld(chat)?.base;
    return base ? structuredClone(base) : null;
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

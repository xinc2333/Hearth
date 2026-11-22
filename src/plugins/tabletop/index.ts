// 跑团: dice checks, attributes and attitudes. See docs/tabletop.md.
//
// Each story turn, for a card with a 跑团 sheet and a preset with the 跑团 entries:
//   1. 裁定 — the preset's request plus the ruling step goes out with hearth_check forced; the model
//      lists the uncertain actions and an outcome for each result tier; Hearth rolls.
//   2. 叙述 — the preset's request plus this turn's outcomes goes out as the reply request.
//   3. 结算 — once the reply is shown, the same request plus the reply and the settlement step goes
//      out in the background with hearth_settle forced; Hearth applies what changed to the state the
//      reply version carries. The next reply waits for it.
// The ruling belongs to the reply message, so other versions of the reply keep the same dice.
// Presets whose 叙述 entry still asks for a <结算> block in the reply are settled from that block.

import type { Op } from '../../core/ops.ts';
import { replyOptions } from '../../core/reply.ts';
import type { Character, Chat, ChatMessage, Preset } from '../../core/types.ts';
import type { HearthPlugin, PluginApi } from '../../server/plugins.ts';
import { adaptTask } from './adapt.ts';
import { decay } from './attitude.ts';
import { rulesFrom } from './rules.ts';
import { runRuling } from './ruling.ts';
import { sceneOf } from './scene.ts';
import { applySettleArgs, applySettlement, extractSettlement, parseSettleArgs, SETTLE_TOOL_NAME } from './settle.ts';
import { appendReply, appendStep, forceTool, replyForHistory, replyTools } from './shape.ts';
import { CHECK_TOOL_NAME } from './ruling.ts';
import { messageData, newCharacter, PLUGIN_ID, renameCharacter, stateBefore, type MessageData, type Ruling, type SwipeData, type TabletopState } from './sheet.ts';
import { rulingText, stateText } from './text.ts';
import { addNewcomers, applySettleWorld, renameSceneIds, syncBody } from './world/apply.ts';
import { chatWorld, city, entry, runDays, runProfile, runReactions, runScene, runSetup, worldBefore } from './world/flow.ts';
import { MAX_IMPORTANT } from './world/minds.ts';
import { normalizeWorld, placeById, renamePerson } from './world/state.ts';
import type { WorldState } from './world/state.ts';
import { parseSettleWorld } from './world/tools.ts';
import { worldText } from './world/text.ts';
import { playTurn, type TurnPlan } from './world/turn.ts';

type StepKind = 'ruling' | 'narrate' | 'pass' | 'settle' | 'world-ruling' | 'world-scene' | 'world-narrate' | 'world-settle' | 'world-setup' | 'world-opening' | 'world-act' | 'world-day' | 'world-profile';
type EntryKind = StepKind | `${StepKind}-lead`;
type Entries = Partial<Record<EntryKind, string>> & { role?: 'system' | 'user' | 'assistant' };
const MARKER = /<<<\|\s*hearth\s*\|\s*(ruling|narrate|pass|settle|world-ruling|world-scene|world-narrate|world-settle|world-setup|world-opening|world-act|world-day|world-profile)(-lead)?\s*>>>/gi;

/** Splits the 跑团 entries' text out of a message: what stays, and the text of each entry kind. */
export function takeEntries(content: string): { rest: string; found: Partial<Record<EntryKind, string>> } {
    const found: Partial<Record<EntryKind, string>> = {};
    const marks = [...content.matchAll(MARKER)];
    if (!marks.length) return { rest: content, found };
    const rest = content.slice(0, marks[0].index).trimEnd();
    marks.forEach((m, i) => {
        const end = i + 1 < marks.length ? marks[i + 1].index : content.length;
        const kind = `${m[1].toLowerCase()}${m[2] ? '-lead' : ''}` as EntryKind;
        const text = content.slice((m.index ?? 0) + m[0].length, end).trim();
        if (text) found[kind] = found[kind] ? `${found[kind]}\n\n${text}` : text;
    });
    return { rest, found };
}

const enabledEntries = (preset: Preset) => {
    const on = new Set(preset.order.filter(o => o.enabled).map(o => o.id));
    return preset.prompts.filter(p => on.has(p.id));
};

/** The preset carries an enabled 跑团 裁定 entry. */
export function presetReady(preset: Preset): boolean {
    return enabledEntries(preset).some(p => /<<<\|\s*hearth\s*\|\s*ruling\s*>>>/i.test(p.content));
}

const passOn = (chat: Chat) => (chat.plugins?.[PLUGIN_ID] as { pass?: boolean } | undefined)?.pass === true;

function lastUserText(messages: ChatMessage[], before: number): string {
    for (let i = before - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.role === 'user' && m.mode !== 'edit' && !m.hidden) return m.swipes[m.activeSwipe]?.content ?? '';
    }
    return '';
}

function withAdded(state: TabletopState, ruling: Ruling | undefined): TabletopState {
    const next = structuredClone(state);
    for (const [name, sheet] of Object.entries(ruling?.added ?? {})) next.characters[name] ??= structuredClone(sheet);
    return next;
}

/** How much of a passing feeling fades each hour of world time (about half a day). */
const WORLD_MOOD_DECAY = 0.03;
const DEFAULT_PASS = '【本轮检定】这一轮开启了「检定绝对通过」：不掷骰，主角的行动全部顺利完成。';
const SETTLE_RETRIES = 2;

/** What the settlement step needs from the reply request, kept for the chat's latest reply. */
interface SettleSource {
    messageId: string;
    swipeId: string;
    body: Record<string, unknown>;
    texts: Entries;
    userName: string;
    /** A 世界 chat: the requests declare the world's tools. */
    world?: boolean;
}

const swipePath = (messageId: string, swipeId: string) => ['messages', `@${messageId}`, 'swipes', `@${swipeId}`, 'plugins', PLUGIN_ID];

/** Step 3: asks for the settlement of a written reply and applies it to `state` (the reply's state, already advanced). */
async function settle(api: PluginApi, source: SettleSource, state: TabletopState, ruling: Ruling, reply: string, scene: Set<string>, opts: { signal?: AbortSignal; trace?: (label: string, body: Record<string, unknown>) => void; world?: { after: WorldState; plan: TurnPlan } } = {}): Promise<SwipeData> {
    const texts = source.texts;
    const world = opts.world;
    const content = [
        texts.settle ?? '', world ? entry(texts, 'world-settle') : '', ruling.checks.length ? rulingText(ruling) : '', stateText(state, source.userName, scene),
        world ? worldText(world.after, city(), 'settle', world.plan) : '',
    ].filter(Boolean).join('\n\n');
    const history = replyForHistory(reply);
    // Without the reply request (Hearth restarted since), the step goes out on its own.
    const body = forceTool(Array.isArray(source.body.messages) && source.body.messages.length
        ? appendStep(appendReply(source.body, history), { content, lead: texts['settle-lead'], role: texts.role }, 'settle')
        : { messages: [{ role: 'system', content }, { role: 'user', content: `【刚才的回复】\n${history}` }] }, SETTLE_TOOL_NAME, Boolean(world));
    let lastError = '';
    for (let attempt = 1; attempt <= SETTLE_RETRIES; attempt++) {
        if (opts.signal?.aborted) break;
        try {
            opts.trace?.(attempt > 1 ? `跑团结算（重试）` : '跑团结算', body);
            const res = await api.send(body, opts.signal);
            const call = res.toolCalls.find(c => c.function?.name === SETTLE_TOOL_NAME) ?? res.toolCalls.find(c => /"attitudes"/.test(c.function?.arguments ?? ''));
            const args = parseSettleArgs(call?.function?.arguments ?? res.text);
            if (!args) throw new Error(res.toolCalls.length ? `模型调用了 ${res.toolCalls.map(c => c.function?.name).join('、')}，没有调用结算工具` : '模型没有调用结算工具');
            const next = structuredClone(state);
            const sw = world ? parseSettleWorld(args.world ?? {}) : null;
            if (world) renameSceneIds(args as Record<string, unknown>, world.after, sw);
            const results = applySettleArgs(next, args, source.userName);
            const present = Array.isArray(args.present) ? args.present.map(String).filter(Boolean) : [];
            let nextWorld: WorldState | undefined;
            if (world) {
                nextWorld = structuredClone(world.after);
                if (sw) {
                    addNewcomers(sw, nextWorld, next, present);
                    results.push(...applySettleWorld(nextWorld, next, city(), sw, world.plan.from));
                }
                syncBody(next, nextWorld);
            }
            return { state: next, ...(nextWorld ? { world: nextWorld } : {}), settle: { raw: JSON.stringify(args), results, present } };
        } catch (error) {
            lastError = (error as Error).message;
            api.log(`结算失败（第 ${attempt} 次）：`, lastError);
        }
    }
    return { state, ...(world ? { world: world.after } : {}), settle: { raw: '', results: [], status: 'failed', error: lastError || '已中止' } };
}

/** A new 重要人物 on the 跑团 sheet: the character (made if missing), with the attributes and traits the profile gave. */
function promoteOnSheet(state: TabletopState, made: { name: string; attributes: Record<string, number>; traits: Record<string, number>; description: string }) {
    const c = state.characters[made.name] ?? newCharacter();
    for (const [k, v] of Object.entries(made.attributes)) if (!c.attributes[k]) c.attributes[k] = Math.round(v);
    for (const t of ['敏感', '记仇', '多疑'] as const) if (made.traits[t]) c.traits[t] = Math.max(0.5, Math.min(2, made.traits[t]));
    c.description = made.description || c.description;
    delete c.temporary;
    state.characters[made.name] = c;
}

/**
 * A new 重要人物 takes over what was kept under the name they had until now (often a description
 * such as 「穿风衣的女生」: attitudes, what they know, the scene), then gets their sheet.
 */
function adopt(world: WorldState, state: TabletopState, made: { name: string; attributes: Record<string, number>; traits: Record<string, number>; description: string }, was: string, sceneId?: string) {
    renamePerson(world, was, made.name);
    renameCharacter(state, was, made.name);
    promoteOnSheet(state, made);
    const person = sceneId ? world.scene?.people.find(p => p.id === sceneId) : undefined;
    if (person) person.name = made.name;
}

/** The latest reply version's state and world, or the chat's starting ones, and where they are kept. */
function currentData(chat: Chat): { state: TabletopState | null; world: WorldState | null; path: string[] | null } {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
        const m = chat.messages[i];
        const swipe = m.swipes[m.activeSwipe];
        const data = swipe?.plugins?.[PLUGIN_ID] as SwipeData | undefined;
        if (data?.world) return { state: data.state ?? null, world: normalizeWorld(structuredClone(data.world)), path: ['messages', `@${m.id}`, 'swipes', `@${swipe.id}`, 'plugins', PLUGIN_ID] };
    }
    const w = chatWorld(chat);
    return { state: (chat.plugins?.[PLUGIN_ID] as { base?: TabletopState } | undefined)?.base ?? null, world: w?.base ? normalizeWorld(structuredClone(w.base)) : null, path: null };
}

const plugin: HearthPlugin = {
    setup(api) {
        const rules = () => rulesFrom(api.config());
        // The 跑团 entries of the latest assembly, per chat (they never go out as ordinary entries).
        const entries = new Map<string, Entries>();
        // The latest reply request per chat, for its settlement (and a retry of it).
        const sources = new Map<string, SettleSource>();

        api.onAfterAssemble((result, ctx) => {
            const found: Entries = {};
            let changed = false;
            for (const part of result.parts) {
                if (!/<<<\|\s*hearth\s*\|/i.test(part.content)) continue;
                const out = takeEntries(part.content);
                for (const [k, v] of Object.entries(out.found) as [EntryKind, string][]) found[k] = found[k] ? `${found[k]}\n\n${v}` : v;
                if (out.found.ruling || out.found.settle) found.role ??= part.role;
                part.content = out.rest;
                changed = true;
            }
            if (!changed) {
                entries.delete(ctx.chat.id);
                return;
            }
            entries.set(ctx.chat.id, found);
            result.parts = result.parts.filter(p => p.content.trim());
            result.messages = result.parts.map(p => ({ role: p.role, content: p.content, ...(p.name ? { name: p.name } : {}) }));
            result.tokens.total = result.parts.reduce((s, p) => s + p.tokens, 0);
        });

        api.onRequest(async (body, ctx) => {
            if (!ctx.messageId || !ctx.swipeId || !ctx.send) return;
            const texts = entries.get(ctx.chat.id);
            if (!texts?.ruling || !texts.narrate) return;
            // 聊天 talks with the AI outside the story: no 跑团.
            if (replyOptions(ctx.chat).mode === 'chat') return;
            const chat = ctx.chat;
            const index = chat.messages.findIndex(m => m.id === ctx.messageId);
            if (index < 0) return;
            const userName = ctx.userName ?? '';
            const userText = lastUserText(chat.messages, index);
            const role = texts.role;
            const stored = messageData(chat.messages[index]);

            // A 世界 chat: the world before this turn, or the opening that makes it (docs/world.md §3).
            const hasWorld = Boolean(chatWorld(chat));
            let world = hasWorld ? worldBefore(chat, index) : null;
            let before = stateBefore(chat, index, ctx.character);
            let opening = false;
            if (hasWorld && !world) {
                const form = chatWorld(chat)!.setup;
                if (!form) return;
                ctx.progress?.({ phase: 'world-setup' });
                const made = await runSetup(body, texts, form, chat.id, ctx.send, ctx.trace).catch((error: Error) => {
                    throw new Error(`开局没有完成：${error.message}`);
                });
                world = made.world;
                before = made.state;
                await api.store.apply({
                    target: { kind: 'chat', id: chat.id },
                    ops: [
                        { op: 'set', path: ['plugins', PLUGIN_ID, 'world', 'base'], value: made.world },
                        { op: 'set', path: ['plugins', PLUGIN_ID, 'base'], value: made.state },
                    ],
                    author: `plugin:${api.id}`,
                    journal: false,
                });
                opening = true;
            }
            if (!before) return;
            // Promotions asked for while no request was at hand are done now, before the turn.
            const queue = chatWorld(chat)?.queue ?? [];
            if (world && queue.length) {
                const important = { ...(chatWorld(chat)?.important ?? {}) };
                for (const q of queue) {
                    const made = await runProfile(body, texts, world, before, q.name, q.base, ctx.send, ctx.trace).catch(() => null);
                    if (made) {
                        important[made.name] = made.profile;
                        adopt(world, before, made, q.name, q.sceneId);
                    }
                }
                await api.store.apply({
                    target: { kind: 'chat', id: chat.id },
                    ops: [{ op: 'set', path: ['plugins', PLUGIN_ID, 'world', 'important'], value: important }, { op: 'set', path: ['plugins', PLUGIN_ID, 'world', 'queue'], value: [] }],
                    author: `plugin:${api.id}`,
                    journal: false,
                });
            }
            const scene = (state: TabletopState, ruling?: Ruling) => sceneOf({ chat, index, state, characterName: ctx.character.name, userName, texts: [userText], ruling });

            let ruling = stored?.ruling;
            let turn = stored?.world;
            if (!ruling || ruling.userText !== userText || (world && !turn)) {
                if (opening) {
                    ruling = { userText, checks: [] };
                } else if (passOn(chat)) {
                    ruling = { userText, checks: [], skipped: 'pass' };
                } else {
                    ctx.progress?.({ phase: 'ruling', checks: [] });
                    const working = structuredClone(before);
                    const content = [
                        texts.ruling, world ? entry(texts, 'world-ruling') : '', stateText(working, userName, scene(working)),
                        world ? worldText(world, city(), 'ruling') : '',
                        `【这一轮的用户输入】\n${userText || '（没有写新的行动，让剧情自然推进）'}`,
                    ].filter(Boolean).join('\n\n');
                    try {
                        ruling = await runRuling({
                            body: forceTool(appendStep(body, { content, lead: texts['ruling-lead'], role }, 'ruling'), CHECK_TOOL_NAME, Boolean(world)),
                            send: ctx.send,
                            state: working,
                            userName,
                            userText,
                            rules: rules(),
                            onRound: (round, sent, checks) => {
                                ctx.trace?.(`跑团裁定 · 第 ${round} 次`, sent);
                                ctx.progress?.({ phase: 'ruling', round, checks });
                            },
                        });
                    } catch (error) {
                        if (ctx.signal?.aborted) throw error;
                        ctx.warn?.(`跑团裁定没有完成，这一轮按没有检定继续：${(error as Error).message}`);
                        ruling = { userText, checks: [], error: (error as Error).message };
                    }
                }
                // The world runs over this turn's time; whoever is at the place gets described; whoever
                // noticed something decides what to do.
                if (world) {
                    const after = structuredClone(world);
                    const plan = playTurn(after, city(), opening ? { minutes: 5 } : ruling.ask ?? { minutes: 10 });
                    if (plan.fresh.length) ctx.progress?.({ phase: 'world-scene' });
                    const problem = await runScene(body, texts, after, plan.fresh, ctx.send, ctx.trace);
                    if (problem && !ctx.signal?.aborted) ctx.warn?.(`场景里的人没有描写出来，这一轮照常继续：${problem}`);
                    const important = chatWorld(chat)?.important ?? {};
                    const reactions = await runReactions(body, texts, after, withAdded(before, ruling), important, plan, ctx.send, ctx.trace, ctx.warn);
                    turn = { plan, after, ...(reactions.length ? { reactions } : {}) };
                }
                const data: MessageData = { ruling, ...(turn ? { world: turn } : {}) };
                await api.store.apply({
                    target: { kind: 'chat', id: chat.id },
                    ops: [{ op: 'set', path: ['messages', `@${ctx.messageId}`, 'plugins', PLUGIN_ID], value: data }],
                    author: `plugin:${api.id}`,
                    journal: false,
                });
            }
            ctx.progress?.({ phase: 'narrating', checks: ruling.checks, skipped: ruling.skipped });
            const pass = ruling.skipped === 'pass';
            const state = withAdded(before, ruling);
            if (turn) syncBody(state, turn.after);
            // 重要人物 here bring their whole profile to the narration.
            const here = turn ? Object.entries(chatWorld(chat)?.important ?? {}).filter(([n]) => turn!.after.people[n]?.at === turn!.after.at) : [];
            const content = [
                opening ? '' : pass ? texts.pass || DEFAULT_PASS : rulingText(ruling),
                stateText(state, userName, scene(state, ruling)),
                turn ? worldText(turn.after, city(), 'narrate', turn.plan) : '',
                ...here.map(([n, p]) => `【重要人物：${n}】\n${p.profile}`),
                texts.narrate,
                turn ? entry(texts, 'world-narrate') : '',
                opening ? entry(texts, 'world-opening') : '',
            ].filter(Boolean).join('\n\n');
            const lead = pass ? texts['pass-lead'] ?? texts['narrate-lead'] : texts['narrate-lead'];
            const reply = replyTools(appendStep(body, { content, lead, role }, pass ? 'pass' : 'results'), Boolean(turn));
            if (texts.settle) sources.set(chat.id, { messageId: ctx.messageId, swipeId: ctx.swipeId, body: reply, texts, userName, world: Boolean(turn) });
            return reply;
        });

        api.onAfterReceive(ctx => {
            const stored = messageData(ctx.message);
            const ruling = stored?.ruling;
            if (!ruling) return;
            const turn = stored?.world;
            // Older presets ask for the settlement inside the reply.
            const { text, raw } = extractSettlement(ctx.text);
            if (ctx.finish === 'error' || ctx.finish === 'aborted') return raw === null ? undefined : { text };
            const index = ctx.chat.messages.findIndex(m => m.id === ctx.message.id);
            const before = stateBefore(ctx.chat, index, ctx.character);
            if (!before) return raw === null ? undefined : { text };
            const userName = ctx.chat.messages.findLast(m => m.role === 'user')?.name ?? '';
            const state = withAdded(before, ruling);
            state.turn += 1;
            // In a 世界 chat passing feelings fade with the hours that went by, not with each turn.
            decay(state, turn ? { ...rules(), moodDecay: 1 - Math.pow(1 - WORLD_MOOD_DECAY, (turn.plan.to - turn.plan.from) / 60) } : rules());
            const world = turn ? structuredClone(turn.after) : undefined;
            if (world) syncBody(state, world);
            // What people felt when they reacted this turn.
            const feelings = (turn?.reactions ?? []).map(r => r.feelings).filter(Boolean) as unknown[];
            if (feelings.length) applySettleArgs(state, { attitudes: feelings }, userName);
            const ops: Op[] = [];
            if (ruling.skipped === 'pass' && passOn(ctx.chat)) ops.push({ op: 'set', path: ['plugins', PLUGIN_ID, 'pass'], value: false });
            const path = swipePath(ctx.message.id, ctx.swipe.id);
            const source = sources.get(ctx.chat.id);
            if (raw !== null || !source || source.messageId !== ctx.message.id || source.swipeId !== ctx.swipe.id) {
                const results = raw ? applySettlement(state, raw, userName) : [];
                const data: SwipeData = { state, ...(world ? { world } : {}), ...(raw ? { settle: { raw, results } } : {}) };
                return { text, ops: [{ op: 'set', path, value: data }, ...ops] };
            }
            // Step 3 runs once the reply is saved; until then the reply shows that it is being settled.
            const pending: SwipeData = { state, ...(world ? { world } : {}), settle: { raw: '', results: [], status: 'pending', at: Date.now() } };
            return {
                text,
                ops: [{ op: 'set', path, value: pending }, ...ops],
                background: async ({ signal, trace }) => {
                    const scene = sceneOf({ chat: ctx.chat, index, state, characterName: ctx.character?.name, userName, texts: [lastUserText(ctx.chat.messages, index), text], ruling });
                    const data = await settle(api, source, state, ruling, text, scene, { signal, trace, ...(world && turn ? { world: { after: world, plan: turn.plan } } : {}) });
                    // The 重要人物 who were not here live through the days that passed.
                    if (data.world && turn && data.state) {
                        const important = chatWorld(ctx.chat)?.important ?? {};
                        if (Object.keys(important).length && Math.floor(data.world.now / 1440) > Math.floor(turn.plan.from / 1440)) {
                            const present = new Set([...(data.settle?.present ?? []), ...Object.entries(data.world.people).filter(([, p]) => p.at === data.world!.at).map(([n]) => n)]);
                            const dayBody = appendReply(source.body, replyForHistory(text));
                            await runDays(dayBody, source.texts, data.world, data.state, important, turn.plan.from, data.world.now, present, b => api.send(b, signal), trace).catch(error => api.log('每日推演没有完成：', (error as Error).message));
                        }
                    }
                    return { ops: [{ op: 'set', path, value: data }] };
                },
            };
        });

        // 「重新结算」 for a reply whose settlement failed.
        api.registerAction('settle', async ({ chat, character, payload }) => {
            const messageId = String(payload.messageId ?? '');
            const swipeId = String(payload.swipeId ?? '');
            const message = chat.messages.find(m => m.id === messageId);
            const swipe = message?.swipes.find(s => s.id === swipeId);
            const stored = messageData(message);
            const ruling = stored?.ruling;
            if (!message || !swipe || !ruling) throw Object.assign(new Error('找不到这条回复的跑团数据'), { status: 404 });
            const turn = stored?.world;
            const index = chat.messages.indexOf(message);
            const kept = (swipe.plugins?.[PLUGIN_ID] as SwipeData | undefined)?.state;
            const before = stateBefore(chat, index, character);
            if (!kept && !before) throw Object.assign(new Error('这张卡还没有跑团数据'), { status: 400 });
            const state = kept ? structuredClone(kept) : withAdded(before!, ruling);
            if (!kept) {
                state.turn += 1;
                decay(state, rules());
            }
            const known = sources.get(chat.id);
            const userName = chat.messages.findLast(m => m.role === 'user')?.name ?? '';
            // After a restart the reply request is gone: settle from the reply and the data alone.
            const source: SettleSource = known && known.messageId === messageId && known.swipeId === swipeId
                ? known
                : { messageId, swipeId, userName, texts: { ...(entries.get(chat.id) ?? {}), settle: entries.get(chat.id)?.settle ?? '' }, body: { messages: [] }, world: Boolean(turn) };
            if (!source.texts.settle) throw Object.assign(new Error('当前预设里没有跑团的结算条目'), { status: 400 });
            const scene = sceneOf({ chat, index, state, characterName: character?.name, userName, texts: [lastUserText(chat.messages, index), swipe.content], ruling });
            const data = await settle(api, source, state, ruling, swipe.content, scene, turn ? { world: { after: structuredClone(turn.after), plan: turn.plan } } : {});
            if (data.settle?.status === 'failed') throw Object.assign(new Error(`结算没有完成：${data.settle.error}`), { status: 502 });
            return { ops: [{ op: 'set', path: swipePath(messageId, swipeId), value: data }] };
        });

        api.registerControls({
            list: ({ chat, character, preset }) => {
                if (!presetReady(preset) || !stateBefore(chat, chat.messages.length, character)) return [];
                if (replyOptions(chat).mode === 'chat') return [];
                return [{ id: 'pass', type: 'toggle', label: '检定绝对通过', value: passOn(chat), hint: '这一轮不掷骰，主角的行动全部顺利；发出后自动关掉' }];
            },
            change: (id, value) => (id === 'pass' ? [{ op: 'set', path: ['plugins', PLUGIN_ID, 'pass'], value: value === true }] : []),
        });

        // 「设为重要人物」: from the scene, someone met, text the user wrote, or a character card (docs/world.md §9).
        api.registerAction('world-promote', async ({ chat, payload }) => {
            const cw = chatWorld(chat);
            const { state, world, path } = currentData(chat);
            if (!cw || !state || !world) throw Object.assign(new Error('这个对话还没有开始世界'), { status: 400 });
            const important = { ...(cw.important ?? {}) };
            if (Object.keys(important).length >= MAX_IMPORTANT) throw Object.assign(new Error(`重要人物最多 ${MAX_IMPORTANT} 位，先取消一位`), { status: 400 });
            let name = String(payload.name ?? '').trim();
            let base = '';
            const sceneId = String(payload.sceneId ?? '');
            const person = sceneId ? world.scene?.people.find(p => p.id === sceneId) : undefined;
            if (person) {
                name = person.name ?? name;
                base = `【场景里看到的样子】${person.looks ?? ''}；${person.doing ?? ''}；${person.where ?? ''}（在${placeById(world, city(), world.scene!.place)?.name ?? ''}${person.role === 'staff' ? `，是这里的${person.purpose}` : ''}）`;
            } else if (String(payload.text ?? '').trim()) {
                base = `【原有档案】\n${String(payload.text).trim()}`;
            } else if (payload.characterId) {
                const card = api.store.get<Character>('character', String(payload.characterId));
                if (!card) throw Object.assign(new Error('找不到这张角色卡'), { status: 404 });
                name ||= card.name;
                base = `【原有档案】\n${[card.fields.description, card.fields.personality, card.fields.scenario].filter(s => s.trim()).join('\n\n')}`;
            } else if (name) {
                const p = world.people[name];
                base = `【剧情里的他】${[p?.role, p?.brief, state.characters[name]?.description].filter(Boolean).join('；')}`;
            }
            if (!base) throw Object.assign(new Error('不知道要把谁设为重要人物'), { status: 400 });
            if (name && important[name]) throw Object.assign(new Error(`${name}已经是重要人物了`), { status: 400 });
            if (name && cw.archived?.[name]) {
                // Back again: the old profile still holds.
                important[name] = cw.archived[name];
                world.people[name] = { ...(world.people[name] ?? {}), kind: 'important' };
                return { ops: [{ op: 'set', path: ['plugins', PLUGIN_ID, 'world', 'important'], value: important }, ...(path ? [{ op: 'set' as const, path: [...path, 'world'], value: world }] : [])] };
            }
            const source = sources.get(chat.id);
            const last = chat.messages.at(-1);
            const was = name || '新的重要人物';
            if (!source?.body || !Array.isArray(source.body.messages) || !last) {
                // No request at hand (Hearth restarted): done before the next turn.
                return { ops: [{ op: 'set', path: ['plugins', PLUGIN_ID, 'world', 'queue'], value: [...(cw.queue ?? []), { name: was, base, ...(person ? { sceneId: person.id } : {}) }] }] };
            }
            const body = appendReply(source.body, replyForHistory(last.swipes[last.activeSwipe]?.content ?? ''));
            const next = structuredClone(state);
            const made = await runProfile(body, source.texts, world, next, was, base, b => api.send(b));
            if (!made) throw Object.assign(new Error('模型没有写出档案'), { status: 502 });
            important[made.name] = made.profile;
            adopt(world, next, made, was, person?.id);
            const ops: Op[] = [{ op: 'set', path: ['plugins', PLUGIN_ID, 'world', 'important'], value: important }];
            if (path) ops.push({ op: 'set', path: [...path, 'world'], value: world }, { op: 'set', path: [...path, 'state'], value: next });
            else ops.push({ op: 'set', path: ['plugins', PLUGIN_ID, 'world', 'base'], value: world }, { op: 'set', path: ['plugins', PLUGIN_ID, 'base'], value: next });
            return { ops };
        });

        // 「取消重要人物」: the profile is kept for later; the person stops living their own days.
        api.registerAction('world-demote', async ({ chat, payload }) => {
            const cw = chatWorld(chat);
            const name = String(payload.name ?? '');
            const { world, path } = currentData(chat);
            if (!cw?.important?.[name] || !world) throw Object.assign(new Error('这个人不是重要人物'), { status: 400 });
            const important = { ...cw.important };
            const archived = { ...(cw.archived ?? {}), [name]: important[name] };
            delete important[name];
            const related = world.commitments.some(c => !c.ended && c.parties.includes(name)) || world.phone.contacts.includes(name);
            if (world.people[name]) world.people[name] = { ...world.people[name], kind: related ? 'related' : 'bystander' };
            const ops: Op[] = [
                { op: 'set', path: ['plugins', PLUGIN_ID, 'world', 'important'], value: important },
                { op: 'set', path: ['plugins', PLUGIN_ID, 'world', 'archived'], value: archived },
                path ? { op: 'set', path: [...path, 'world'], value: world } : { op: 'set', path: ['plugins', PLUGIN_ID, 'world', 'base'], value: world },
            ];
            return { ops };
        });

        api.registerEditTask(adaptTask);
    },
};

export default plugin;

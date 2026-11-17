// 跑团: dice checks, attributes and attitudes. See docs/tabletop.md.
//
// Each story turn, for a card with a 跑团 sheet and a preset with the 🎲 entries:
//   1. 裁定 — the preset's request plus the ruling turn goes out with hearth_check forced; the model
//      lists the uncertain actions and an outcome for each result tier; Hearth rolls.
//   2. 叙述与结算 — the preset's request plus this turn's outcomes goes out as the reply request;
//      the model writes the reply and a hidden <结算> block, which Hearth applies to the state the
//      reply version carries.
// The ruling belongs to the reply message, so other versions of the reply keep the same dice.

import type { Op } from '../../core/ops.ts';
import type { Chat, ChatMessage, Preset } from '../../core/types.ts';
import type { HearthPlugin } from '../../server/plugins.ts';
import { adaptTask } from './adapt.ts';
import { decay } from './attitude.ts';
import { isCatgodRequest, isChatMode, narrationRequest, rulingRequest } from './catgod.ts';
import { rulesFrom } from './rules.ts';
import { runRuling } from './ruling.ts';
import { applySettlement, extractSettlement } from './settle.ts';
import { messageData, PLUGIN_ID, stateBefore, type Ruling, type SwipeData, type TabletopState } from './sheet.ts';
import { rulingText, stateText } from './text.ts';

type EntryKind = 'ruling' | 'narrate' | 'pass';
const MARKER = /<<<\|\s*hearth\s*\|\s*(ruling|narrate|pass)\s*>>>/gi;

/** Splits the 🎲 entries' text out of a message: what stays, and the text of each entry kind. */
export function takeEntries(content: string): { rest: string; found: Partial<Record<EntryKind, string>> } {
    const found: Partial<Record<EntryKind, string>> = {};
    const marks = [...content.matchAll(MARKER)];
    if (!marks.length) return { rest: content, found };
    const rest = content.slice(0, marks[0].index).trimEnd();
    marks.forEach((m, i) => {
        const end = i + 1 < marks.length ? marks[i + 1].index : content.length;
        const kind = m[1].toLowerCase() as EntryKind;
        const text = content.slice((m.index ?? 0) + m[0].length, end).trim();
        if (text) found[kind] = found[kind] ? `${found[kind]}\n\n${text}` : text;
    });
    return { rest, found };
}

/** The preset carries an enabled 🎲 裁定 entry. */
export function presetReady(preset: Preset): boolean {
    const enabled = new Set(preset.order.filter(o => o.enabled).map(o => o.id));
    return preset.prompts.some(p => enabled.has(p.id) && /<<<\|\s*hearth\s*\|\s*ruling\s*>>>/i.test(p.content));
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

const DEFAULT_PASS = '【本轮检定】本轮开启了「检定绝对通过」：没有掷骰，主角这一轮的行动全部顺利完成。';

const plugin: HearthPlugin = {
    setup(api) {
        const rules = () => rulesFrom(api.config());
        // The 🎲 entries of the latest assembly, per chat (they never go out as ordinary entries).
        const entries = new Map<string, Partial<Record<EntryKind, string>>>();

        api.onAfterAssemble((result, ctx) => {
            const found: Partial<Record<EntryKind, string>> = {};
            let changed = false;
            for (const part of result.parts) {
                if (!/<<<\|\s*hearth\s*\|/i.test(part.content)) continue;
                const out = takeEntries(part.content);
                for (const [k, v] of Object.entries(out.found) as [EntryKind, string][]) found[k] = found[k] ? `${found[k]}\n\n${v}` : v;
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
            if (!ctx.messageId || !ctx.send) return;
            const texts = entries.get(ctx.chat.id);
            if (!texts?.ruling || !texts.narrate) return;
            if (!isCatgodRequest(body) || isChatMode(body)) return;
            const chat = ctx.chat;
            const index = chat.messages.findIndex(m => m.id === ctx.messageId);
            if (index < 0) return;
            const before = stateBefore(chat, index, ctx.character);
            if (!before) return;
            const userName = ctx.userName ?? '';
            const userText = lastUserText(chat.messages, index);

            let ruling = messageData(chat.messages[index])?.ruling;
            if (!ruling || ruling.userText !== userText) {
                if (passOn(chat)) {
                    ruling = { userText, checks: [], skipped: 'pass' };
                } else {
                    ctx.progress?.({ phase: 'ruling', checks: [] });
                    const working = structuredClone(before);
                    const content = [texts.ruling, stateText(working, userName), `【人类这一轮的行动】\n${userText || '（没有写新的行动，让剧情自然推进）'}`].join('\n\n');
                    try {
                        ruling = await runRuling({
                            body: rulingRequest(body, content),
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
                await api.store.apply({
                    target: { kind: 'chat', id: chat.id },
                    ops: [{ op: 'set', path: ['messages', `@${ctx.messageId}`, 'plugins', PLUGIN_ID], value: { ruling } }],
                    author: `plugin:${api.id}`,
                    journal: false,
                });
            }
            ctx.progress?.({ phase: 'narrating', checks: ruling.checks, skipped: ruling.skipped });
            const pass = ruling.skipped === 'pass';
            const state = withAdded(before, ruling);
            const content = [pass ? texts.pass || DEFAULT_PASS : rulingText(ruling), stateText(state, userName), texts.narrate].filter(Boolean).join('\n\n');
            return narrationRequest(body, content, pass);
        });

        api.onAfterReceive(ctx => {
            const ruling = messageData(ctx.message)?.ruling;
            if (!ruling) return;
            const { text, raw } = extractSettlement(ctx.text);
            if (ctx.finish === 'error' || ctx.finish === 'aborted') return raw === null ? undefined : { text };
            const index = ctx.chat.messages.findIndex(m => m.id === ctx.message.id);
            const before = stateBefore(ctx.chat, index, ctx.character);
            if (!before) return raw === null ? undefined : { text };
            const userName = ctx.chat.messages.findLast(m => m.role === 'user')?.name ?? '';
            const state = withAdded(before, ruling);
            state.turn += 1;
            decay(state, rules());
            const results = raw ? applySettlement(state, raw, userName) : [];
            const data: SwipeData = { state, ...(raw ? { settle: { raw, results } } : {}) };
            const ops: Op[] = [{ op: 'set', path: ['messages', `@${ctx.message.id}`, 'swipes', `@${ctx.swipe.id}`, 'plugins', PLUGIN_ID], value: data }];
            if (ruling.skipped === 'pass' && passOn(ctx.chat)) ops.push({ op: 'set', path: ['plugins', PLUGIN_ID, 'pass'], value: false });
            return { text, ops };
        });

        api.registerControls({
            list: ({ chat, character, preset }) => {
                if (!presetReady(preset) || !stateBefore(chat, chat.messages.length, character)) return [];
                return [{ id: 'pass', type: 'toggle', label: '检定绝对通过', value: passOn(chat), hint: '这一轮不掷骰，主角的行动全部顺利；发出后自动关掉' }];
            },
            change: (id, value) => (id === 'pass' ? [{ op: 'set', path: ['plugins', PLUGIN_ID, 'pass'], value: value === true }] : []),
        });

        api.registerEditTask(adaptTask);
    },
};

export default plugin;

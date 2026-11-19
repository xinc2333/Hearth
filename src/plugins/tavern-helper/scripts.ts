// A card's 酒馆助手 background scripts. In 酒馆 they run in a hidden page for the whole chat and react
// to events; many of them exist only to work around 酒馆 itself (loading MVU from a CDN, reviving a
// status bar, guarding variables against MVU's clean-ups). Hearth runs only the ones that are card
// logic, in the QuickJS sandbox, once per event:
//
//   - not run: scripts that load remote code, touch the page, or write variables (Hearth keeps
//     variables on the timeline itself; MVU and the card's interface write them), and the variable
//     schema (see mvu-schema.ts);
//   - run: event handlers that read the chat and rewrite messages, e.g. trimming a long reference
//     block from old user messages once the reply that used it has arrived.
//
// Events: MESSAGE_RECEIVED and GENERATION_ENDED after each story reply. Timers run on a virtual clock
// right after the handlers, so debounced work happens at once. Message writes become chat ops.

import type { Op } from '../../core/ops.ts';
import { stateAt } from '../../core/state.ts';
import type { CardScript, Character, Chat } from '../../core/types.ts';
import type { PluginApi } from '../../server/plugins.ts';
import { isSchemaScript } from './mvu-schema.ts';

const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

// `$(() => …)` only waits for the page to load, a common way to start a script; any other `$(…)` is page access.
const READY = /\$\(\s*(?:async\s*)?(?:\(\s*\)\s*=>|function\b)/g;

/** Why a script is not run in the background; null when it is. */
export function skipReason(script: CardScript): string | null {
    if (!script.enabled) return '已关闭';
    if (isSchemaScript(script)) return '变量结构，由 MVU 处理';
    const code = withoutComments(script.content);
    if (/^\s*import\s|\bimport\s*\(/m.test(code)) return '加载外部代码';
    if (/\b(?:replaceVariables|updateVariablesWith|insertOrAssignVariables|insertVariables|deleteVariable|replaceMvuData|setMvuVariable)\s*\(/.test(code)) return '直接改变量';
    if (/\b(?:document|frameElement|localStorage)\b|window\.parent|\$\(|\bjQuery\b/.test(code.replace(READY, ''))) return '操作页面';
    if (!/\bevent(?:On|Once|MakeFirst|MakeLast)\s*\(/.test(code)) return '没有处理的事件';
    return null;
}

export function backgroundScripts(character: Character): CardScript[] {
    return character.scripts.filter(s => skipReason(s) === null);
}

interface ThMessage {
    message_id: number;
    name: string;
    role: string;
    is_hidden: boolean;
    message: string;
    data: Record<string, unknown>;
    extra: Record<string, unknown>;
}

/**
 * 酒馆助手's message range: a number or "a-b"; negative numbers count from the end (-1 is the last
 * message); both ends are clamped to the chat; anything else is no range at all.
 */
export function messageRange(range: unknown, last: number): [number, number] | null {
    if (last < 0) return null;
    const clamp = (n: number) => Math.min(last, Math.max(0, n < 0 ? last + n + 1 : n));
    const s = String(range ?? '').trim().replace(/\{\{lastMessageId\}\}/g, String(last));
    if (/^-?\d+$/.test(s)) return [clamp(Number(s)), clamp(Number(s))];
    const m = s.match(/^(-?\d+)\s*-\s*(-?\d+)$/);
    if (!m) return null;
    const a = clamp(Number(m[1])), b = clamp(Number(m[2]));
    return [Math.min(a, b), Math.max(a, b)];
}

/** 酒馆助手's getChatMessages over a Hearth chat. */
export function chatMessages(chat: Chat, range: unknown, opts: { role?: string; hide_state?: string } = {}): ThMessage[] {
    const r = messageRange(range, chat.messages.length - 1);
    if (!r) return [];
    const out: ThMessage[] = [];
    for (let i = r[0]; i <= r[1]; i++) {
        const m = chat.messages[i];
        if (opts.role && opts.role !== 'all' && m.role !== opts.role) continue;
        if (opts.hide_state === 'hidden' && !m.hidden) continue;
        if (opts.hide_state === 'unhidden' && m.hidden) continue;
        const swipe = m.swipes[m.activeSwipe] ?? m.swipes[0];
        out.push({ message_id: i, name: m.name, role: m.role, is_hidden: m.hidden, message: swipe?.content ?? '', data: structuredClone(swipe?.state ?? {}), extra: {} });
    }
    return out;
}

const PRELUDE = `
const __call = (n, ...a) => { const r = __host(n, JSON.stringify(a)); return r === undefined ? undefined : JSON.parse(r); };
const __L = {};
const __errors = [];
const __note = e => __errors.push(String((e && e.message) || e));
const eventRemoveListener = (e, f) => { __L[e] = (__L[e] || []).filter(x => x !== f); };
const eventOn = (e, f) => { (__L[e] = __L[e] || []).push(f); return { stop: () => eventRemoveListener(e, f) }; };
const eventMakeLast = eventOn;
const eventMakeFirst = (e, f) => { (__L[e] = __L[e] || []).unshift(f); return { stop: () => eventRemoveListener(e, f) }; };
const eventOnce = (e, f) => { const w = (...a) => { eventRemoveListener(e, w); return f(...a); }; return eventOn(e, w); };
const eventEmit = async (e, ...a) => { for (const f of (__L[e] || []).slice()) { try { await f(...a); } catch (err) { __note(err); } } };
const eventClearEvent = e => { delete __L[e]; };
const tavern_events = { APP_READY: 'app_ready', MESSAGE_RECEIVED: 'message_received', MESSAGE_SENT: 'message_sent', MESSAGE_UPDATED: 'message_updated',
  MESSAGE_EDITED: 'message_edited', MESSAGE_DELETED: 'message_deleted', MESSAGE_SWIPED: 'message_swiped', CHAT_CHANGED: 'chat_id_changed',
  GENERATION_STARTED: 'generation_started', GENERATION_ENDED: 'generation_ended', GENERATION_STOPPED: 'generation_stopped',
  CHARACTER_MESSAGE_RENDERED: 'character_message_rendered', USER_MESSAGE_RENDERED: 'user_message_rendered' };
const iframe_events = {};
let __now = 0, __tid = 0;
const __timers = [];
const setTimeout = (f, ms, ...a) => { const id = ++__tid; __timers.push({ id, at: __now + Math.max(0, Number(ms) || 0), f, a }); return id; };
const clearTimeout = id => { const i = __timers.findIndex(t => t.id === id); if (i >= 0) __timers.splice(i, 1); };
const setInterval = setTimeout;
const clearInterval = clearTimeout;
const getChatMessages = (range, opts) => __call('messages', range, opts || {});
const setChatMessages = async list => { __call('write', list || []); };
const getLastMessageId = () => __call('last');
const getCurrentMessageId = getLastMessageId;
const getVariables = (opts) => __call('vars', opts || {});
const getAllVariables = () => __call('vars', { type: 'all' });
const substitudeMacros = s => __call('macros', String(s));
const errorCatched = f => (...a) => { try { const r = f(...a); if (r && r.catch) r.catch(__note); return r; } catch (err) { __note(err); } };
const waitGlobalInitialized = async () => {};
const __ready = [];
const $ = f => { if (typeof f === 'function') __ready.push(f); else throw new Error('后台脚本不能操作页面'); };
const toastr = { success() {}, info() {}, warning() {}, error() {}, clear() {} };
const console = { log() {}, info() {}, warn() {}, error() {}, debug() {} };
const SillyTavern = { getContext: () => ({ name1: __call('names')[0], name2: __call('names')[1] }) };
`;

function program(script: string, events: [string, unknown[]][]): string {
    return `${PRELUDE}
(async () => {
  try { await (async () => {\n${script}\n})(); } catch (err) { __note(err); }
  for (const f of __ready) { try { await f(); } catch (err) { __note(err); } }
  for (const [e, a] of ${JSON.stringify(events)}) await eventEmit(e, ...a);
  for (let n = 0; n < 200 && __timers.length; n++) {
    __timers.sort((x, y) => x.at - y.at);
    const t = __timers.shift();
    __now = t.at;
    try { await t.f(...t.a); } catch (err) { __note(err); }
  }
  return __errors;
})()`;
}

export interface ScriptRun {
    ops: Op[];
    errors: string[];
}

/** Runs the scripts for the events, one after another; each sees what the ones before it wrote. */
export async function runBackgroundScripts(api: Pick<PluginApi, 'sandbox' | 'macros'>, chat: Chat, scripts: CardScript[], events: [string, unknown[]][], names: [string, string]): Promise<ScriptRun> {
    const current = structuredClone(chat);
    const ops: Op[] = [];
    const errors: string[] = [];
    const macroCtx = api.macros.context({ user: names[0], char: names[1], seed: chat.id });
    for (const script of scripts) {
        const host = (name: string, args: unknown[]): unknown => {
            switch (name) {
                case 'messages': return chatMessages(current, args[0], (args[1] ?? {}) as Record<string, string>);
                case 'last': return current.messages.length - 1;
                case 'names': return names;
                case 'macros': return api.macros.evaluate(String(args[0]), macroCtx);
                case 'vars': {
                    const type = (args[0] as { type?: string })?.type ?? 'chat';
                    const message = stateAt(current.messages) ?? {};
                    if (type === 'message') return message;
                    if (type === 'all') return { ...current.variables, ...message };
                    return type === 'chat' ? current.variables ?? {} : {};
                }
                case 'write': {
                    for (const item of (args[0] as Record<string, unknown>[]) ?? []) {
                        const last = current.messages.length - 1;
                        const id = Number(item?.message_id);
                        const m = current.messages[id < 0 ? last + 1 + id : id];
                        if (!m) continue;
                        const swipe = m.swipes[m.activeSwipe] ?? m.swipes[0];
                        if (typeof item.message === 'string' && swipe && item.message !== swipe.content) {
                            swipe.content = item.message;
                            ops.push({ op: 'set', path: ['messages', `@${m.id}`, 'swipes', `@${swipe.id}`, 'content'], value: item.message });
                        }
                        if (typeof item.is_hidden === 'boolean' && item.is_hidden !== m.hidden) {
                            m.hidden = item.is_hidden;
                            ops.push({ op: 'set', path: ['messages', `@${m.id}`, 'hidden'], value: item.is_hidden });
                        }
                    }
                    return null;
                }
                default: return undefined;
            }
        };
        try {
            const out = await api.sandbox.run(program(script.content, events), host, 5000);
            if (Array.isArray(out)) errors.push(...out.map(e => `${script.name}：${e}`));
        } catch (error) {
            errors.push(`${script.name}：${(error as Error).message}`);
        }
    }
    return { ops, errors };
}

/** Runs the card's background scripts after each story reply. */
export function setupScripts(api: PluginApi) {
    api.onAfterReceive(({ chat, character, message }) => {
        if (message.mode === 'edit') return;
        const scripts = backgroundScripts(character);
        if (!scripts.length) return;
        return {
            background: async () => {
                const saved = api.store.get<Chat>('chat', chat.id) ?? chat;
                const index = saved.messages.findIndex(m => m.id === message.id);
                const user = [...saved.messages].reverse().find(m => m.role === 'user')?.name ?? 'User';
                const events: [string, unknown[]][] = [['message_received', [index, 'normal']], ['generation_ended', [index]]];
                const run = await runBackgroundScripts(api, saved, scripts, events, [user, character.name]);
                if (run.errors.length) api.log('角色卡后台脚本出错：', run.errors.join('；'));
                return { ops: run.ops };
            },
        };
    });
}

// The window's side of card frames (see card-frame.ts): the chat snapshot a frame reads from, and the
// calls it makes. Every write becomes a change set (author: the user, reason 角色卡界面), so it shows
// in the history and can be undone, and message variables stay on the reply they belong to.
//
// A card only reaches its own worldbooks: the ones bound to its character or the chat, and the ones
// its interface created. Global worldbooks are readable. Any other worldbook does not exist for it.

import { toThWorldbook, worldbookOps } from '../core/compat/th-worldbook.ts';
import type { Op } from '../core/ops.ts';
import type { Character, Chat, ChatMessage, Lorebook, Role } from '../core/types.ts';
import { newId } from '../core/util.ts';
import { applyMvuCommands, parseMvuCommands } from '../plugins/tavern-helper/mvu-commands.ts';
import { api, type Bootstrap, type ChatContext, type Summary } from './api.ts';
import type { FrameMessage, FrameSnapshot } from './card-frame.ts';
import { getState, refresh, runGeneration, setState, toast } from './state.ts';

const REASON = '角色卡界面';

/** Card UIs talk to the app through slash commands (TavernHelper triggerSlash): /setinput, /send, /trigger. */
export function runCardCommand(command: string) {
    const chatId = getState().activeChatId;
    if (!chatId) return;
    for (const part of command.split(/\|(?=\s*\/)/)) {
        const m = part.trim().match(/^\/(\w+)\s*([\s\S]*)$/);
        if (!m) continue;
        const [, name, arg] = m;
        if (name === 'setinput') setInput(arg);
        else if (name === 'send') void runGeneration(chatId, 'normal', arg);
        else if (name === 'trigger') void runGeneration(chatId, 'normal');
    }
}

function setInput(text: string) {
    window.dispatchEvent(new CustomEvent('hearth:setinput', { detail: text }));
}

// --- snapshot ---------------------------------------------------------------------------------

type Base = Omit<FrameSnapshot, 'messageId'>;
const bases = new WeakMap<Chat, WeakMap<object, Base>>();

function message(m: ChatMessage): FrameMessage {
    const swipe = m.swipes[m.activeSwipe] ?? m.swipes[0];
    const many = m.swipes.length > 1;
    return {
        name: m.name,
        role: m.role,
        is_hidden: m.hidden,
        message: swipe?.content ?? '',
        data: swipe?.state ?? null,
        swipe_id: m.activeSwipe,
        swipes: many ? m.swipes.map(s => s.content) : [swipe?.content ?? ''],
        swipes_data: many ? m.swipes.map(s => s.state ?? {}) : [swipe?.state ?? {}],
    };
}

/** The worldbooks a chat's card may write, and the ones it may only read. */
function cardBooks(chat: Chat, boot: Bootstrap | null): { write: Summary[]; read: Summary[] } {
    const books = boot?.resources.lorebook ?? [];
    const bound = new Set([...(boot?.resources.character.find(c => c.id === chat.characterId)?.lorebookIds ?? []), chat.lorebookId].filter(Boolean));
    const write = books.filter(b => bound.has(b.id) || b.createdFor === chat.characterId);
    const global = new Set(boot?.settings.lore.globalLorebookIds ?? []);
    return { write, read: [...write, ...books.filter(b => global.has(b.id) && !write.includes(b))] };
}

function bookNames(chat: Chat, boot: Bootstrap | null): FrameSnapshot['books'] {
    const books = boot?.resources.lorebook ?? [];
    const name = (id: string | undefined) => books.find(b => b.id === id)?.name ?? null;
    const character = boot?.resources.character.find(c => c.id === chat.characterId);
    const ids = character?.lorebookIds ?? [];
    return {
        all: [...new Set(cardBooks(chat, boot).read.map(b => b.name))],
        global: (boot?.settings.lore.globalLorebookIds ?? []).map(name).filter((n): n is string => Boolean(n)),
        primary: name(ids[0]),
        additional: ids.slice(1).map(name).filter((n): n is string => Boolean(n)),
        chat: name(chat.lorebookId),
    };
}

/** The chat as a frame sees it; built once per chat version and shared by its frames. */
export function frameSnapshot(chat: Chat, index: number, context: ChatContext | undefined, boot: Bootstrap | null): FrameSnapshot {
    let perBoot = bases.get(chat);
    if (!perBoot) bases.set(chat, perBoot = new WeakMap());
    const key = boot ?? bases;
    let base = perBoot.get(key);
    if (!base || base.user !== (context?.userName ?? '') || base.char !== (context?.charName ?? '')) {
        base = {
            chatId: chat.id,
            characterId: chat.characterId,
            lastMessageId: chat.messages.length - 1,
            user: context?.userName ?? '',
            char: context?.charName ?? '',
            vars: { chat: chat.variables ?? {}, global: boot?.settings.globalVariables ?? {} },
            messages: chat.messages.map(message),
            books: bookNames(chat, boot),
        };
        perBoot.set(key, base);
    }
    return { ...base, messageId: index };
}

// --- localStorage of card frames ----------------------------------------------------------------

const storageKey = (characterId: string) => `hearth.card.${characterId}`;

export function cardStorage(characterId: string): Record<string, string> {
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey(characterId)) ?? '{}');
        return saved && typeof saved === 'object' ? saved : {};
    } catch {
        return {};
    }
}

function saveCardStorage(characterId: string, key: string, value: string | null) {
    const data = cardStorage(characterId);
    if (value === null) delete data[key];
    else data[key] = value;
    try { localStorage.setItem(storageKey(characterId), JSON.stringify(data)); } catch { /* full: the frame keeps its own copy */ }
}

// --- calls ------------------------------------------------------------------------------------

export interface FrameScope {
    chatId: string;
    index: number;
}

function currentChat(chatId: string): Chat {
    const chat = getState().chats[chatId];
    if (!chat) throw new Error('对话已关闭');
    return chat;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});

async function writeChat(chatId: string, ops: Op[]) {
    if (!ops.length) return;
    const { resource } = await api.change<Chat>('chat', chatId, ops, REASON);
    setState(s => ({ chats: { ...s.chats, [chatId]: resource } }));
}

function messageAt(chat: Chat, index: unknown): ChatMessage {
    const m = chat.messages[Number(index)];
    if (!m) throw new Error(`第 ${Number(index) + 1} 楼不存在`);
    return m;
}

/** One of the card's worldbooks by name (see cardBooks); `write` leaves out the read-only ones. */
function findBook(chat: Chat, name: string, mode: 'read' | 'write'): string | null {
    return cardBooks(chat, getState().boot)[mode].find(b => b.name === name)?.id ?? null;
}

async function requireBook(chat: Chat, name: string, mode: 'read' | 'write'): Promise<Lorebook> {
    const id = findBook(chat, name, mode);
    if (!id) throw new Error(findBook(chat, name, 'read') ? `世界书「${name}」只能读取` : `没有名为「${name}」的世界书`);
    return api.get<Lorebook>('lorebook', id);
}

async function replaceBook(book: Lorebook, entries: unknown[]): Promise<Lorebook> {
    const ops = worldbookOps(book, Array.isArray(entries) ? entries : []);
    if (!ops.length) return book;
    const { resource } = await api.change<Lorebook>('lorebook', book.id, ops, REASON);
    return resource;
}

function newMessage(raw: Record<string, unknown>, chat: Chat): ChatMessage {
    const role = (['user', 'assistant', 'system'].includes(String(raw.role)) ? raw.role : 'assistant') as Role;
    const context = getState().contexts[chat.id];
    const now = Date.now();
    return {
        id: newId('m'),
        role,
        name: typeof raw.name === 'string' ? raw.name : role === 'user' ? context?.userName ?? 'User' : context?.charName ?? '',
        swipes: [{ id: newId('s'), content: String(raw.message ?? ''), createdAt: now, ...(raw.data && typeof raw.data === 'object' ? { state: raw.data as Record<string, unknown> } : {}) }],
        activeSwipe: 0,
        hidden: raw.is_hidden === true,
        createdAt: now,
    };
}

/** Carries out a frame's call. Writes resolve after the app state holds the result. */
export async function handleFrameCall(scope: FrameScope, method: string, args: unknown[]): Promise<unknown> {
    const chat = currentChat(scope.chatId);
    switch (method) {
        case 'replaceVariables': {
            const [vars, opts] = args as [Record<string, unknown>, { type: string; message_id?: number }];
            // Writing what is already there changes nothing and leaves no history entry.
            if (opts.type === 'message') {
                const m = messageAt(chat, opts.message_id);
                const swipe = m.swipes[m.activeSwipe] ?? m.swipes[0];
                if (!same(swipe.state, vars)) await writeChat(chat.id, [{ op: 'set', path: ['messages', `@${m.id}`, 'swipes', `@${swipe.id}`, 'state'], value: vars }]);
            } else if (opts.type === 'chat') {
                if (!same(chat.variables, vars)) await writeChat(chat.id, [{ op: 'set', path: ['variables'], value: vars }]);
            } else if (!same(getState().boot?.settings.globalVariables, vars)) {
                await api.saveSettings({ globalVariables: vars });
                await refresh();
            }
            return null;
        }
        case 'setChatMessages': {
            const [list] = args as [Record<string, unknown>[]];
            const ops: Op[] = [];
            for (const item of list) {
                const m = messageAt(chat, item.message_id);
                const swipe = m.swipes[m.activeSwipe] ?? m.swipes[0];
                const at = ['messages', `@${m.id}`];
                if (typeof item.message === 'string' && item.message !== swipe.content) ops.push({ op: 'set', path: [...at, 'swipes', `@${swipe.id}`, 'content'], value: item.message });
                if (item.data && typeof item.data === 'object' && !same(swipe.state, item.data)) ops.push({ op: 'set', path: [...at, 'swipes', `@${swipe.id}`, 'state'], value: item.data });
                if (typeof item.name === 'string' && item.name !== m.name) ops.push({ op: 'set', path: [...at, 'name'], value: item.name });
                if (typeof item.is_hidden === 'boolean' && item.is_hidden !== m.hidden) ops.push({ op: 'set', path: [...at, 'hidden'], value: item.is_hidden });
            }
            await writeChat(chat.id, ops);
            return null;
        }
        case 'createChatMessages': {
            const [list, at] = args as [Record<string, unknown>[], number | null];
            const ops: Op[] = list.map((raw, i) => ({ op: 'insert', path: ['messages'], value: newMessage(raw, chat), ...(at === null ? {} : { index: at + i }) }));
            await writeChat(chat.id, ops);
            return null;
        }
        case 'deleteChatMessages': {
            const [ids] = args as [number[]];
            await writeChat(chat.id, ids.map(i => chat.messages[i]).filter(Boolean).map(m => ({ op: 'unset', path: ['messages', `@${m.id}`] })));
            return null;
        }
        case 'getWorldbook':
            return toThWorldbook(await requireBook(chat, String(args[0]), 'read'));
        case 'replaceWorldbook':
            return toThWorldbook(await replaceBook(await requireBook(chat, String(args[0]), 'write'), args[1] as unknown[]));
        case 'createWorldbook': {
            const [name, entries] = args as [string, unknown[]];
            if (findBook(chat, name, 'write')) {
                await replaceBook(await requireBook(chat, name, 'write'), entries);
                return false;
            }
            // Marked as the card's own, so its interface can use it after unbinding it too.
            const book = await api.create<Lorebook>('lorebook', { name });
            const ops: Op[] = [{ op: 'set', path: ['extra'], value: { ...(book.extra ?? {}), hearth: { createdFor: chat.characterId } } }, ...worldbookOps(book, entries ?? [])];
            await api.change<Lorebook>('lorebook', book.id, ops, REASON);
            await refresh();
            return true;
        }
        case 'deleteWorldbook': {
            const id = findBook(chat, String(args[0]), 'write');
            if (!id) return false;
            await api.remove('lorebook', id);
            await refresh();
            return true;
        }
        case 'rebindCharWorldbooks': {
            const [books] = args as [{ primary?: string | null; additional?: string[] }];
            const names = [books.primary, ...(books.additional ?? [])].filter((n): n is string => Boolean(n));
            const ids = [...new Set(names.map(n => findBook(chat, n, 'write')).filter((id): id is string => Boolean(id)))];
            await api.change<Character>('character', chat.characterId, [{ op: 'set', path: ['lorebookIds'], value: ids }], REASON);
            await refresh();
            return null;
        }
        case 'mvuParse': {
            const [text, old] = args as [string, Record<string, unknown>];
            const result = applyMvuCommands((old.stat_data as Record<string, unknown>) ?? {}, parseMvuCommands(text));
            return { ...old, stat_data: result.stat_data, delta_data: result.delta_data };
        }
        case 'slash':
            runCardCommand(String(args[0]));
            return '';
        case 'toast': {
            const [type, text, title] = args as [string, string, string];
            const message = title ? `${title}：${text}` : text;
            if (message.trim()) toast(message, type === 'error' ? 'error' : type === 'success' ? 'success' : 'info');
            return null;
        }
        case 'input':
            setInput(String(args[0] ?? ''));
            return null;
        case 'send': {
            const text = String(args[0] ?? '');
            setInput('');
            void runGeneration(chat.id, 'normal', text);
            return null;
        }
        case 'storage':
            saveCardStorage(chat.characterId, String(args[0]), args[1] === null ? null : String(args[1]));
            return null;
        default:
            throw new Error(`Hearth 暂不支持 ${method}`);
    }
}

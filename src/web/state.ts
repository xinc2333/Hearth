// Minimal app state: one observable object, updated immutably, read with useAppState().

import { useSyncExternalStore } from 'react';

import type { Op } from '../core/ops.ts';
import type { Chat, ChatMessage, ResourceKind } from '../core/types.ts';
import { api, generate, type Bootstrap, type ChatContext, type PromptSnapshot } from './api.ts';

export interface Streaming {
    chatId: string;
    jobId?: string;
    messageId?: string;
    swipeId?: string;
    /** Existing text being continued. */
    prefix: string;
    /** The reply is complete and being post-processed (e.g. variable updates). */
    finalizing?: boolean;
    text: string;
    reasoning: string;
}

export interface Toast {
    id: number;
    text: string;
    tone: 'info' | 'error' | 'success';
}

export interface AppState {
    boot: Bootstrap | null;
    activeChatId: string | null;
    chats: Record<string, Chat>;
    contexts: Record<string, ChatContext>;
    prompts: Record<string, PromptSnapshot>;
    streaming: Streaming | null;
    inspector: null | 'prompt' | 'state' | 'character' | 'lore' | 'preset' | 'history';
    settingsOpen: boolean;
    settingsSection: string | null;
    toasts: Toast[];
}

let state: AppState = {
    boot: null,
    activeChatId: null,
    chats: {},
    contexts: {},
    prompts: {},
    streaming: null,
    inspector: null,
    settingsOpen: false,
    settingsSection: null,
    toasts: [],
};

const listeners = new Set<() => void>();

export function getState() {
    return state;
}

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
    state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
    listeners.forEach(l => l());
}

export function useAppState<T>(select: (s: AppState) => T): T {
    return useSyncExternalStore(cb => {
        listeners.add(cb);
        return () => listeners.delete(cb);
    }, () => select(state));
}

let toastSeq = 0;
export function toast(text: string, tone: Toast['tone'] = 'info') {
    const id = ++toastSeq;
    setState(s => ({ toasts: [...s.toasts, { id, text, tone }] }));
    setTimeout(() => setState(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), tone === 'error' ? 7000 : 3500);
}

export function reportError(error: unknown) {
    toast((error as Error).message ?? String(error), 'error');
}

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------

export async function refresh() {
    const boot = await api.bootstrap();
    setState({ boot });
    return boot;
}

export async function openChat(chatId: string) {
    setState({ activeChatId: chatId });
    try { localStorage.setItem('hearth.chat', chatId); } catch { /* ignore */ }
    const [chat, context, prompt] = await Promise.all([api.get<Chat>('chat', chatId), api.context(chatId), api.lastPrompt(chatId)]);
    setState(s => ({
        chats: { ...s.chats, [chatId]: chat },
        contexts: { ...s.contexts, [chatId]: context },
        prompts: prompt ? { ...s.prompts, [chatId]: prompt } : s.prompts,
    }));
}

export async function reloadContext(chatId: string) {
    const context = await api.context(chatId);
    setState(s => ({ contexts: { ...s.contexts, [chatId]: context } }));
}

export async function newChat(characterId: string) {
    const chat = await api.createChat(characterId);
    await refresh();
    await openChat(chat.id);
}

/** Applies ops to a chat through the change channel and stores the result. */
export async function changeChat(chatId: string, ops: Op[], reason?: string) {
    const { resource } = await api.change<Chat>('chat', chatId, ops, reason);
    setState(s => ({ chats: { ...s.chats, [chatId]: resource } }));
    return resource;
}

export async function change<T>(kind: ResourceKind, id: string, ops: Op[], reason?: string) {
    const { resource } = await api.change<T>(kind, id, ops, reason);
    if (kind === 'chat') {
        setState(s => ({ chats: { ...s.chats, [id]: resource as Chat } }));
    }
    return resource;
}

export async function runGeneration(chatId: string, type: 'normal' | 'swipe' | 'regenerate' | 'continue', text?: string) {
    if (getState().streaming) return;
    setState({ streaming: { chatId, prefix: '', text: '', reasoning: '' } });
    // Once the reply is final, late callbacks (a queued frame, the early chat fetch) must not
    // bring the "generating" state back.
    let finished = false;
    let frame = 0;
    let pending: Streaming = { chatId, prefix: '', text: '', reasoning: '' };
    const flush = () => {
        frame = 0;
        if (!finished) setState({ streaming: { ...pending } });
    };
    const finish = (message?: ChatMessage) => {
        if (finished) return;
        finished = true;
        if (frame) cancelAnimationFrame(frame);
        setState(s => {
            const chat = s.chats[chatId];
            if (!message || !chat) return { streaming: null };
            const exists = chat.messages.some(m => m.id === message.id);
            const messages = exists ? chat.messages.map(m => (m.id === message.id ? message : m)) : [...chat.messages, message];
            return { streaming: null, chats: { ...s.chats, [chatId]: { ...chat, messages } } };
        });
    };
    try {
        await generate(chatId, { type, text }, event => {
            switch (event.type) {
                case 'job':
                    pending = { ...pending, jobId: event.jobId, messageId: event.messageId, swipeId: event.swipeId, prefix: event.prefix };
                    // Fetch the chat so the user message and placeholder appear immediately.
                    void api.get<Chat>('chat', chatId).then(chat => {
                        if (!finished) setState(s => ({ chats: { ...s.chats, [chatId]: chat } }));
                    });
                    flush();
                    break;
                case 'prompt': {
                    const { type: _t, ...snapshot } = event;
                    setState(s => ({ prompts: { ...s.prompts, [chatId]: { ...snapshot, at: Date.now() } } }));
                    if (snapshot.warnings.length) toast(snapshot.warnings[0], 'info');
                    break;
                }
                case 'text':
                case 'reasoning':
                    if (event.type === 'text') pending.text += event.text;
                    else pending.reasoning += event.text;
                    if (!frame) frame = requestAnimationFrame(flush);
                    break;
                case 'finalizing':
                    pending = { ...pending, finalizing: true };
                    flush();
                    break;
                case 'done':
                    finish(event.message);
                    break;
                case 'error':
                    toast(event.error, 'error');
                    finish(event.message);
                    break;
            }
        });
    } catch (error) {
        reportError(error);
    } finally {
        finish();
        const chat = await api.get<Chat>('chat', chatId).catch(() => null);
        if (chat) setState(s => ({ chats: { ...s.chats, [chatId]: chat } }));
        void refresh();
    }
}

export async function stopGeneration() {
    const jobId = getState().streaming?.jobId;
    if (jobId) await api.abort(jobId);
}

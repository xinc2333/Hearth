// Minimal app state: one observable object, updated immutably, read with useAppState().

import { useMemo, useSyncExternalStore } from 'react';

import type { Op } from '../core/ops.ts';
import type { Chat, ChatMessage, ReadingSettings, ResourceKind } from '../core/types.ts';
import { api, generate, type Bootstrap, type ChatContext, type PromptSnapshot, type VersionInfo } from './api.ts';

export type GenerationKind = 'normal' | 'swipe' | 'regenerate' | 'continue';
export type InspectorTab = 'prompt' | 'state' | 'tabletop' | 'character' | 'lore' | 'history';
const INSPECTOR_TABS: InspectorTab[] = ['prompt', 'state', 'tabletop', 'character', 'lore', 'history'];

export interface Streaming {
    chatId: string;
    kind: GenerationKind;
    jobId?: string;
    messageId?: string;
    swipeId?: string;
    /** Existing text being continued. */
    prefix: string;
    /** The reply is complete and being post-processed (e.g. variable updates). */
    finalizing?: boolean;
    text: string;
    reasoning: string;
    /** Plugin progress while the reply is being prepared (e.g. 跑团's ruling), keyed by plugin id. */
    progress?: Record<string, unknown>;
}

export interface Toast {
    id: number;
    text: string;
    tone: 'info' | 'error' | 'success';
    action?: { label: string; run: () => void };
}

export interface ConfirmRequest {
    title: string;
    body?: string;
    confirm?: string;
    danger?: boolean;
    resolve: (ok: boolean) => void;
}

export interface AppState {
    boot: Bootstrap | null;
    activeChatId: string | null;
    chats: Record<string, Chat>;
    contexts: Record<string, ChatContext>;
    prompts: Record<string, PromptSnapshot>;
    streaming: Streaming | null;
    inspector: null | InspectorTab;
    sidebarOpen: boolean;
    paletteOpen: boolean;
    settingsOpen: boolean;
    settingsSection: string | null;
    confirm: ConfirmRequest | null;
    toasts: Toast[];
    /** From /api/version: Hearth's version and, in the desktop app, its update. */
    version: VersionInfo | null;
}

/** Interface preferences that belong to this window (layout, last panel), kept in localStorage. */
export function loadPref<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(`hearth.${key}`);
        return raw === null ? fallback : JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

export function savePref(key: string, value: unknown) {
    try { localStorage.setItem(`hearth.${key}`, JSON.stringify(value)); } catch { /* ignore */ }
}

let state: AppState = {
    boot: null,
    activeChatId: null,
    chats: {},
    contexts: {},
    prompts: {},
    streaming: null,
    inspector: null,
    sidebarOpen: loadPref('sidebar', window.innerWidth >= 820),
    paletteOpen: false,
    settingsOpen: false,
    settingsSection: null,
    confirm: null,
    toasts: [],
    version: null,
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
export function toast(text: string, tone: Toast['tone'] = 'info', action?: Toast['action']) {
    const id = ++toastSeq;
    const dismiss = () => setState(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
    setState(s => ({ toasts: [...s.toasts, { id, text, tone, action: action && { label: action.label, run: () => { dismiss(); action.run(); } } }] }));
    setTimeout(dismiss, tone === 'error' || action ? 7000 : 3500);
}

/** Asks before something that cannot be undone from the history panel. */
export function confirmAction(request: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
    return new Promise(resolve => setState({
        confirm: { ...request, resolve: ok => { setState({ confirm: null }); resolve(ok); } },
    }));
}

export function toggleSidebar() {
    setState(s => ({ sidebarOpen: !s.sidebarOpen }));
    savePref('sidebar', getState().sidebarOpen);
}

/** Opens a panel; without a tab, toggles the one used last. */
export function toggleInspector(tab?: InspectorTab) {
    const current = getState().inspector;
    // The tab used last may be gone (the 预设 tab moved to Settings).
    const last = loadPref<InspectorTab>('inspector', 'prompt');
    const next = tab ? (current === tab ? null : tab) : current ? null : INSPECTOR_TABS.includes(last) ? last : 'prompt';
    if (next) savePref('inspector', next);
    setState({ inspector: next });
}

// ---------------------------------------------------------------------------------------------
// Reading preferences
// ---------------------------------------------------------------------------------------------

export const DEFAULT_READING: ReadingSettings = {
    font: 'sans',
    customFont: '',
    size: 17,
    lineHeight: 1.85,
    width: 740,
    indent: false,
    justify: false,
    quotes: true,
    follow: false,
};

export function useReading(): ReadingSettings {
    const saved = useAppState(s => s.boot?.settings.reading);
    return useMemo(() => ({ ...DEFAULT_READING, ...saved }), [saved]);
}

let readingTimer = 0;
export function setReading(patch: Partial<ReadingSettings>) {
    const boot = state.boot;
    if (!boot) return;
    const reading = { ...DEFAULT_READING, ...boot.settings.reading, ...patch };
    setState({ boot: { ...boot, settings: { ...boot.settings, reading } } });
    // Sliders fire continuously; save once they settle.
    window.clearTimeout(readingTimer);
    readingTimer = window.setTimeout(() => void api.saveSettings({ reading }).catch(reportError), 400);
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

export async function branchChat(chatId: string, messageId: string, swipeId: string) {
    const chat = await api.branchChat(chatId, messageId, swipeId);
    await refresh();
    await openChat(chat.id);
    toast(`已从第 ${chat.branch?.index ?? ''} 条创建分支，原对话保持不变`, 'success', { label: '回到原对话', run: () => void openChat(chatId).catch(reportError) });
}

export async function setControl(chatId: string, id: string, value: unknown) {
    const { chat, controls } = await api.setControl(chatId, id, value);
    setState(s => ({
        chats: { ...s.chats, [chatId]: chat },
        contexts: s.contexts[chatId] ? { ...s.contexts, [chatId]: { ...s.contexts[chatId], controls } } : s.contexts,
    }));
}

export async function deleteChat(chatId: string) {
    await api.remove('chat', chatId);
    if (getState().activeChatId === chatId) {
        setState({ activeChatId: null, inspector: null });
        try { localStorage.removeItem('hearth.chat'); } catch { /* ignore */ }
    }
    await refresh();
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

export async function runGeneration(chatId: string, type: GenerationKind, text?: string) {
    if (getState().streaming) return;
    setState({ streaming: { chatId, kind: type, prefix: '', text: '', reasoning: '' } });
    // Once the reply is final, late callbacks (a queued frame, the early chat fetch) must not
    // bring the "generating" state back.
    let finished = false;
    let frame = 0;
    let pending: Streaming = { chatId, kind: type, prefix: '', text: '', reasoning: '' };
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
                case 'progress':
                    pending = { ...pending, progress: { ...pending.progress, [event.plugin]: event.data } };
                    flush();
                    break;
                case 'done':
                    finish(event.message);
                    // The switches may change with the reply (a note delivered, 聊天 back to 剧场).
                    void reloadContext(chatId).catch(() => {});
                    break;
                case 'update': {
                    const message = event.message;
                    setState(s => {
                        const chat = s.chats[chatId];
                        if (!chat) return {};
                        return { chats: { ...s.chats, [chatId]: { ...chat, messages: chat.messages.map(m => (m.id === message.id ? message : m)) } } };
                    });
                    break;
                }
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
        // A newer reply may have started while background work kept this stream open.
        if (chat && getState().streaming?.chatId !== chatId) setState(s => ({ chats: { ...s.chats, [chatId]: chat } }));
        void refresh();
        // Plugins may change their switches after a reply (a note delivered, a mode returned).
        void reloadContext(chatId).catch(() => {});
    }
}

/** Runs a plugin's action for a chat (e.g. 跑团's「重新结算」) and stores the changed chat. */
export async function pluginAction(chatId: string, plugin: string, id: string, payload: Record<string, unknown>) {
    const { chat } = await api.action(chatId, plugin, id, payload);
    setState(s => ({ chats: { ...s.chats, [chatId]: chat } }));
    return chat;
}

export async function stopGeneration() {
    const jobId = getState().streaming?.jobId;
    if (jobId) await api.abort(jobId);
}

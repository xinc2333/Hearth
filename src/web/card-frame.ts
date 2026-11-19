// The inside of a card frame: HTML that a card puts in a message (status bars, 开局 panels, other
// "frontend card" interfaces) runs in a sandboxed iframe with no access to the window or the local
// API. It gets the globals 酒馆助手 gives its frames, so cards written for it run unchanged:
//
//   - libraries: jQuery, lodash, Vue, zod (`z`), YAML, toastr;
//   - variables: getVariables / replaceVariables / updateVariablesWith …, Mvu;
//   - messages: getChatMessages / setChatMessages / createChatMessages / deleteChatMessages;
//   - worldbooks: getWorldbook / replaceWorldbook / updateWorldbookWith / createWorldbookEntries …;
//   - events, triggerSlash, a localStorage kept per character, and a stand-in `window.parent` whose
//     `#send_textarea` / `#send_but` are Hearth's message box.
//
// Reads are synchronous, from a snapshot of the chat the window sends; writes are calls the window
// carries out as change sets (see card-host.ts). Both go through a MessagePort the frame creates
// itself, so they keep working after a card rewrites its document with document.open/write (which
// drops every listener on the window). The height reporter re-attaches to the new document as well.

import { importMap, localScripts } from './card-libs.ts';

/** What the window sends the frame: the chat as 酒馆助手 shows it. */
export interface FrameSnapshot {
    chatId: string;
    characterId: string;
    messageId: number;
    lastMessageId: number;
    user: string;
    char: string;
    vars: { chat: Record<string, unknown>; global: Record<string, unknown> };
    messages: FrameMessage[];
    books: { all: string[]; global: string[]; primary: string | null; additional: string[]; chat: string | null };
}

export interface FrameMessage {
    name: string;
    role: 'system' | 'user' | 'assistant';
    is_hidden: boolean;
    message: string;
    /** The active version's own variables (null when it has none). */
    data: Record<string, unknown> | null;
    swipe_id: number;
    swipes: string[];
    swipes_data: Record<string, unknown>[];
}

export interface FrameInit {
    id: string;
    /** localStorage saved for this character's frames. */
    storage: Record<string, string>;
    /**
     * 'message': HTML in a message, sized to its content. 'page': the card's own page (its 酒馆助手
     * scripts, card-page.ts); what a script puts on 酒馆's page appears here.
     */
    mode?: 'message' | 'page';
    /** The chat when the frame was made: 酒馆助手's frames can read it from their first line. */
    snapshot?: FrameSnapshot;
    /** The page's script buttons as the card's scripts declare them (酒馆助手 shows them in 酒馆's toolbar). */
    buttons?: { name: string; visible: boolean }[];
}

/** Messages from the frame to the window (on the port; `ready` and `h` on postMessage). */
export interface FrameCall {
    seq?: number;
    method: string;
    args: unknown[];
}

// Runs inside the frame. It is inserted with toString(), so it must not use anything from outside.
function frameRuntime(init: FrameInit) {
    const ID = init.id;
    const PAGE = init.mode === 'page';
    const realParent = window.parent;
    const w = window as any;
    const clone = <T>(v: T): T => (v === undefined || v === null ? v : structuredClone(v));

    // --- the port ----------------------------------------------------------------------------
    const channel = new MessageChannel();
    const port = channel.port1;
    let seq = 0;
    const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
    const call = (method: string, ...args: unknown[]): Promise<any> => new Promise((resolve, reject) => {
        const n = ++seq;
        pending.set(n, { resolve, reject });
        port.postMessage({ seq: n, method, args });
    });
    const notify = (method: string, ...args: unknown[]) => port.postMessage({ method, args });

    let S: FrameSnapshot = init.snapshot ?? {
        chatId: '', characterId: '', messageId: 0, lastMessageId: -1, user: '', char: '',
        vars: { chat: {}, global: {} }, messages: [], books: { all: [], global: [], primary: null, additional: [], chat: null },
    };
    let ready = false;
    let resolveReady: () => void = () => {};
    const readyP = new Promise<void>(r => { resolveReady = r; });
    if (init.snapshot) resolveReady();

    // --- events ------------------------------------------------------------------------------
    const L: Record<string, Function[]> = {};
    const emit = (e: string, ...a: unknown[]) => (L[e] || []).slice().forEach(f => { try { f(...a); } catch (err) { console.error(err); } });
    // 酒馆 awaits each handler in turn (a handler may inject prompts or call the model first).
    const emitAsync = async (e: string, ...a: unknown[]) => {
        for (const f of (L[e] || []).slice()) {
            try { await f(...a); } catch (err) { console.error(err); }
        }
    };
    const mvuEvents = {
        VARIABLE_INITIALIZED: 'mag_variable_initialized', VARIABLE_UPDATE_STARTED: 'mag_variable_update_started',
        SINGLE_VARIABLE_UPDATED: 'mag_variable_updated', VARIABLE_UPDATE_ENDED: 'mag_variable_update_ended',
        COMMAND_PARSED: 'mag_command_parsed', BEFORE_MESSAGE_UPDATE: 'mag_before_message_update',
    };
    const tavernEvents = {
        APP_READY: 'app_ready', MESSAGE_RECEIVED: 'message_received', MESSAGE_SENT: 'message_sent', MESSAGE_UPDATED: 'message_updated',
        MESSAGE_EDITED: 'message_edited', MESSAGE_DELETED: 'message_deleted', MESSAGE_SWIPED: 'message_swiped', CHAT_CHANGED: 'chat_id_changed',
        GENERATION_STARTED: 'generation_started', GENERATION_ENDED: 'generation_ended', GENERATION_STOPPED: 'generation_stopped',
        CHARACTER_MESSAGE_RENDERED: 'character_message_rendered', USER_MESSAGE_RENDERED: 'user_message_rendered',
        WORLDINFO_UPDATED: 'worldinfo_updated', SETTINGS_UPDATED: 'settings_updated', CHAT_CREATED: 'chat_created',
        GENERATION_AFTER_COMMANDS: 'GENERATION_AFTER_COMMANDS', CHAT_COMPLETION_PROMPT_READY: 'chat_completion_prompt_ready',
        CHAT_COMPLETION_SETTINGS_READY: 'chat_completion_settings_ready', STREAM_TOKEN_RECEIVED: 'stream_token_received',
    };
    const iframeEvents = { MESSAGE_IFRAME_RENDER_STARTED: 'message_iframe_render_started', MESSAGE_IFRAME_RENDER_ENDED: 'message_iframe_render_ended' };
    const eventOn = (e: string, f: Function) => { (L[e] = L[e] || []).push(f); return { stop: () => eventRemoveListener(e, f) }; };
    const eventRemoveListener = (e: string, f: Function) => { L[e] = (L[e] || []).filter(x => x !== f); };
    const eventOnce = (e: string, f: Function) => { const wrap = (...a: unknown[]) => { eventRemoveListener(e, wrap); f(...a); }; return eventOn(e, wrap); };

    // --- variables ---------------------------------------------------------------------------
    const resolveId = (id: unknown): number => {
        if (id === undefined || id === null) return S.messageId;
        if (id === 'latest') return S.lastMessageId;
        const n = Number(id);
        return n < 0 ? S.lastMessageId + 1 + n : n;
    };
    // A message without variables of its own has the ones before it (Hearth keeps state on the timeline).
    const varsAt = (snap: FrameSnapshot, i: number) => {
        for (let k = Math.min(i, snap.messages.length - 1); k >= 0; k--) {
            const d = snap.messages[k]?.data;
            if (d) return d;
        }
        return {};
    };
    const messageVars = (i: number) => varsAt(S, i);
    const local: Record<string, Record<string, unknown>> = {};
    type VarOpts = { type?: string; message_id?: unknown };
    const getVariables = (o: VarOpts = {}) => {
        const type = o.type ?? 'chat';
        if (type === 'message') return clone(messageVars(resolveId(o.message_id)));
        if (type === 'chat') return clone(S.vars.chat);
        if (type === 'global') return clone(S.vars.global);
        return clone(local[type] ?? {});
    };
    // What this frame wrote to its own message: when it comes back in a snapshot, it is not news.
    const ownWrites = new Set<string>();
    const replaceVariables = async (vars: Record<string, unknown>, o: VarOpts = {}) => {
        const type = o.type ?? 'chat';
        if (type === 'message' && resolveId(o.message_id) === S.messageId) ownWrites.add(JSON.stringify(vars ?? {}));
        if (type === 'message' || type === 'chat' || type === 'global') {
            await call('replaceVariables', clone(vars ?? {}), { type, message_id: type === 'message' ? resolveId(o.message_id) : undefined });
        } else {
            local[type] = clone(vars ?? {});
        }
    };
    const updateVariablesWith = async (fn: Function, o: VarOpts = {}) => {
        const cur = getVariables(o);
        const next = (await fn(cur)) ?? cur;
        await replaceVariables(next, o);
        return next;
    };
    const lodash = () => w._;
    const insertOrAssignVariables = (vars: object, o?: VarOpts) => updateVariablesWith((v: object) => lodash().merge(v, vars), o);
    const insertVariables = (vars: object, o?: VarOpts) => updateVariablesWith((v: object) => lodash().defaultsDeep(v, vars), o);
    const deleteVariable = async (path: string, o?: VarOpts) => {
        let occurred = false;
        const variables = await updateVariablesWith((v: object) => { occurred = lodash().has(v, path); lodash().unset(v, path); return v; }, o);
        return { variables, delete_occurred: occurred };
    };
    const getAllVariables = () => lodash().merge({}, S.vars.global, S.vars.chat, messageVars(S.messageId));

    // --- messages ----------------------------------------------------------------------------
    // Negative numbers count from the end; both ends are clamped to the chat; anything else is no range.
    const range = (r: unknown): [number, number] | null => {
        const last = S.lastMessageId;
        if (last < 0) return null;
        const clamp = (n: number) => Math.min(last, Math.max(0, n < 0 ? last + n + 1 : n));
        const s = String(r ?? '').trim().replace(/\{\{lastMessageId\}\}/g, String(last));
        if (/^-?\d+$/.test(s)) return [clamp(Number(s)), clamp(Number(s))];
        const m = s.match(/^(-?\d+)\s*-\s*(-?\d+)$/);
        if (!m) return null;
        const a = clamp(Number(m[1])), b = clamp(Number(m[2]));
        return [Math.min(a, b), Math.max(a, b)];
    };
    const getChatMessages = (r: unknown, o: { role?: string; hide_state?: string; include_swipes?: boolean } = {}) => {
        const span = range(r);
        const out: unknown[] = [];
        if (!span) return out;
        for (let i = span[0]; i <= span[1]; i++) {
            const m = S.messages[i];
            if (!m) continue;
            if (o.role && o.role !== 'all' && m.role !== o.role) continue;
            if (o.hide_state === 'hidden' && !m.is_hidden) continue;
            if (o.hide_state === 'unhidden' && m.is_hidden) continue;
            const base = { message_id: i, name: m.name, role: m.role, is_hidden: m.is_hidden, extra: {} };
            out.push(o.include_swipes
                ? { ...base, swipe_id: m.swipe_id, swipes: [...m.swipes], swipes_data: clone(m.swipes_data) }
                : { ...base, message: m.message, data: clone(m.data ?? {}) });
        }
        return out;
    };
    const withIds = (list: any[]) => (Array.isArray(list) ? list : []).map(m => ({ ...m, message_id: resolveId(m?.message_id) }));
    const setChatMessages = async (list: any[]) => { await call('setChatMessages', clone(withIds(list))); };
    const createChatMessages = async (list: any[], o: { insert_at?: unknown } = {}) => {
        await call('createChatMessages', clone(list ?? []), o.insert_at === undefined || o.insert_at === 'end' ? null : resolveId(o.insert_at));
    };
    const deleteChatMessages = async (ids: unknown[]) => { await call('deleteChatMessages', (ids ?? []).map(resolveId)); };

    // --- worldbooks --------------------------------------------------------------------------
    const getWorldbook = (name: string): Promise<any[]> => call('getWorldbook', String(name));
    const replaceWorldbook = (name: string, entries: any[]): Promise<any[]> => call('replaceWorldbook', String(name), clone(entries ?? []));
    const updateWorldbookWith = async (name: string, fn: Function) => {
        const cur = await getWorldbook(name);
        return replaceWorldbook(name, (await fn(cur)) ?? cur);
    };
    const createWorldbookEntries = async (name: string, entries: any[]) => {
        const cur = await getWorldbook(name);
        const before = new Set(cur.map(e => e.uid));
        const worldbook = await replaceWorldbook(name, [...cur, ...(entries ?? []).map(e => { const { uid: _uid, ...rest } = e ?? {}; return rest; })]);
        return { worldbook, new_entries: worldbook.filter(e => !before.has(e.uid)) };
    };
    const deleteWorldbookEntries = async (name: string, pred: Function) => {
        const cur = await getWorldbook(name);
        const keep: any[] = [], deleted: any[] = [];
        for (const e of cur) (pred(e) ? deleted : keep).push(e);
        const worldbook = deleted.length ? await replaceWorldbook(name, keep) : cur;
        return { worldbook, deleted_entries: deleted };
    };
    const createWorldbook = (name: string, entries: any[] = []): Promise<boolean> => call('createWorldbook', String(name), clone(entries));
    const createOrReplaceWorldbook = async (name: string, entries: any[] = []) => {
        if (S.books.all.includes(String(name))) { await replaceWorldbook(name, entries); return false; }
        return createWorldbook(name, entries);
    };
    const charBooks = () => ({ primary: S.books.primary, additional: [...S.books.additional] });

    // --- the message box (window.parent's #send_textarea / #send_but) --------------------------
    // A message frame's window.parent is a stand-in document holding the two; on the card's page,
    // window.parent is the page itself (what scripts put on 酒馆's page lands here) and the two are
    // hidden in it.
    const stub = document.implementation.createHTMLDocument('');
    stub.body.innerHTML = '<textarea id="send_textarea"></textarea><div id="send_but"></div><div id="chat"></div>';
    const box = stub.getElementById('send_textarea') as HTMLTextAreaElement;
    const sendButton = stub.getElementById('send_but') as HTMLElement;
    if (PAGE) {
        const place = () => {
            const holder = document.createElement('div');
            holder.hidden = true;
            holder.append(box, sendButton);
            document.body.append(holder);
        };
        if (document.body) place(); else document.addEventListener('DOMContentLoaded', place, { once: true });
    }
    // jQuery's trigger('input') calls oninput directly; a real event reaches the listener. Sending the
    // same text twice is harmless. A click (jQuery or not) always ends in one native click event.
    box.oninput = () => notify('input', box.value);
    box.addEventListener('input', () => notify('input', box.value));
    sendButton.addEventListener('click', () => { const text = box.value; box.value = ''; notify('send', text); });
    const stubJq = () => (w.jQuery ? (PAGE ? w.jQuery : (sel: unknown, ctx?: unknown) => w.jQuery(sel, ctx ?? stub)) : undefined);
    const shared: Record<string | symbol, unknown> = {};
    const facade: any = new Proxy(shared, {
        get(_t, k) {
            switch (k) {
                case 'postMessage': return (...a: [unknown, string, Transferable[]?]) => realParent.postMessage(...a);
                case 'document': return PAGE ? document : stub;
                case '$': case 'jQuery': return stubJq();
                case 'window': case 'self': case 'parent': case 'frames': return facade;
                case 'top': return window.top;
                case 'innerWidth': return window.innerWidth;
                case 'innerHeight': return window.innerHeight;
                case 'length': return 0;
                case 'closed': return false;
                default: {
                    if (k in shared) return shared[k];
                    // Anything else of 酒馆's page (addEventListener, matchMedia, location…) is this frame's own.
                    const v = w[k];
                    return typeof v === 'function' && !/^[A-Z]/.test(String(k)) ? v.bind(window) : v;
                }
            }
        },
        set(_t, k, v) { shared[k] = v; return true; },
    });
    // On the card's page, 酒馆's page is the page itself.
    try { Object.defineProperty(window, 'parent', { configurable: true, get: () => (PAGE ? window : facade) }); } catch { /* keep the real one */ }

    // Scripts a card adds while it runs get the same window.top → window.parent as its own code
    // (frameDocument): e.g. a status bar whose inline scripts call the card's other script.
    const fixTop = (v: unknown) => (typeof v === 'string' ? v.replace(/\bwindow\.top\b/g, 'window.parent') : v);
    try {
        const text = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'text')!;
        Object.defineProperty(HTMLScriptElement.prototype, 'text', { ...text, set(v: unknown) { text.set!.call(this, fixTop(v)); } });
        const content = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')!;
        Object.defineProperty(Node.prototype, 'textContent', { ...content, set(v: unknown) { content.set!.call(this, this instanceof HTMLScriptElement ? fixTop(v) : v); } });
    } catch { /* leave them as they are */ }

    // Card code sees an ordinary browser, as with 酒馆 in one: some cards stop when they find Electron.
    try {
        const ua = navigator.userAgent.replace(/\s(?:Electron|hearth|Hearth)\/[^\s]+/g, '');
        Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => ua });
    } catch { /* ignore */ }

    // --- storage -----------------------------------------------------------------------------
    const makeStorage = (data: Map<string, string>, persist: boolean) => ({
        getItem: (k: unknown) => (data.has(String(k)) ? data.get(String(k))! : null),
        setItem: (k: unknown, v: unknown) => { data.set(String(k), String(v)); if (persist) notify('storage', String(k), String(v)); },
        removeItem: (k: unknown) => { data.delete(String(k)); if (persist) notify('storage', String(k), null); },
        clear: () => { for (const k of data.keys()) if (persist) notify('storage', k, null); data.clear(); },
        key: (i: number) => Array.from(data.keys())[i] ?? null,
        get length() { return data.size; },
    });
    const ls = makeStorage(new Map(Object.entries(init.storage || {})), true);
    const ss = makeStorage(new Map(), false);
    try { Object.defineProperty(window, 'localStorage', { configurable: true, get: () => ls }); } catch { /* ignore */ }
    try { Object.defineProperty(window, 'sessionStorage', { configurable: true, get: () => ss }); } catch { /* ignore */ }

    // --- toastr ------------------------------------------------------------------------------
    const toast = (type: string) => (message: unknown, title?: unknown) => { notify('toast', type, String(message ?? ''), title ? String(title) : ''); return {}; };
    const toastr = { success: toast('success'), info: toast('info'), warning: toast('warning'), error: toast('error'), clear() {}, remove() {}, options: {} };

    // --- prompts and the model ---------------------------------------------------------------
    // injectPrompts: sent with the next replies (once: with the next one only), like an extension's prompts.
    const injected = new Map<string, Record<string, unknown> & { once?: boolean }>();
    const injectPrompts = (prompts: Record<string, unknown>[], o: { once?: boolean } = {}) => {
        for (const p of Array.isArray(prompts) ? prompts : []) {
            if (p && typeof p.id === 'string') injected.set(p.id, { ...JSON.parse(JSON.stringify(p)), once: o.once === true });
        }
    };
    const uninjectPrompts = (ids: string[]) => { for (const id of Array.isArray(ids) ? ids : []) injected.delete(String(id)); };
    // generate / generateRaw go through the user's model connection; the text comes back.
    const generateWith = (raw: boolean) => async (config: Record<string, unknown> = {}) => {
        const result = await call('generate', raw, JSON.parse(JSON.stringify(config ?? {})));
        return String(result ?? '');
    };

    // --- script buttons ----------------------------------------------------------------------
    // Shown at the top of the panel's 界面 tab; a click is the event getButtonEvent(name) names.
    let buttons: { name: string; visible: boolean }[] = clone(init.buttons ?? []);
    const showButtons = () => realParent.postMessage({ hearthFrame: ID, buttons: buttons.filter(b => b.visible !== false).map(b => b.name) }, '*');
    const setButtons = (list: unknown) => {
        buttons = (Array.isArray(list) ? list : []).filter(b => b && typeof b.name === 'string').map(b => ({ name: String(b.name), visible: b.visible !== false }));
        showButtons();
    };
    const buttonEvent = (name: unknown) => `button:${String(name)}`;

    // --- the globals -------------------------------------------------------------------------
    const api: Record<string, unknown> = {
        injectPrompts, uninjectPrompts,
        getButtonEvent: buttonEvent,
        eventOnButton: (name: unknown, f: Function) => eventOn(buttonEvent(name), f),
        getScriptButtons: () => clone(buttons),
        replaceScriptButtons: (_a: unknown, b?: unknown) => setButtons(b === undefined ? _a : b),
        appendInexistentScriptButtons: (_a: unknown, b?: unknown) => {
            const add = (Array.isArray(b === undefined ? _a : b) ? (b === undefined ? _a : b) : []) as { name: string; visible?: boolean }[];
            setButtons([...buttons, ...add.filter(x => x && !buttons.some(y => y.name === x.name))]);
        },
        updateScriptButtonsWith: async (_a: unknown, f?: Function) => {
            const fn = (typeof _a === 'function' ? _a : f) as Function;
            setButtons(await fn(clone(buttons)));
            return clone(buttons);
        },
        generate: generateWith(false), generateRaw: generateWith(true),
        stopGenerationById: () => false, stopAllGeneration: () => false,
        getVariables, replaceVariables, updateVariablesWith, insertOrAssignVariables, insertVariables, deleteVariable, getAllVariables,
        getChatMessages, setChatMessages, createChatMessages, deleteChatMessages,
        getCurrentMessageId: () => S.messageId, getLastMessageId: () => S.lastMessageId, getMessageId: () => S.messageId,
        getIframeName: () => `TH-message--${S.messageId}--${ID}`, getScriptId: () => '',
        getWorldbookNames: () => [...S.books.all], getGlobalWorldbookNames: () => [...S.books.global],
        getCharWorldbookNames: charBooks, getCharLorebooks: charBooks, getChatWorldbookName: () => S.books.chat,
        getWorldbook, replaceWorldbook, updateWorldbookWith, createWorldbookEntries, deleteWorldbookEntries,
        createWorldbook, createOrReplaceWorldbook, deleteWorldbook: (name: string): Promise<boolean> => call('deleteWorldbook', String(name)),
        rebindCharWorldbooks: (_char: unknown, books: { primary?: string | null; additional?: string[] }) => call('rebindCharWorldbooks', clone(books ?? {})),
        triggerSlash: async (command: unknown) => { await call('slash', String(command ?? '')); return ''; },
        substitudeMacros: (s: unknown) => String(s ?? '').replace(/{{user}}/gi, S.user).replace(/{{char}}/gi, S.char),
        errorCatched: (f: Function) => (...a: unknown[]) => {
            try { const r = f(...a); if (r && typeof r.catch === 'function') r.catch((err: unknown) => console.error(err)); return r; } catch (err) { console.error(err); }
        },
        eventOn, eventRemoveListener,
        eventOnce,
        eventMakeFirst: (e: string, f: Function) => { (L[e] = L[e] || []).unshift(f); return { stop: () => eventRemoveListener(e, f) }; },
        eventMakeLast: eventOn,
        eventEmit: async (e: string, ...a: unknown[]) => emitAsync(e, ...a),
        eventClearEvent: (e: string) => { delete L[e]; },
        eventClearAll: () => { for (const k of Object.keys(L)) delete L[k]; },
        // initializeGlobal shares an object with the card's other scripts; waitGlobalInitialized waits for it.
        initializeGlobal: (name: unknown, value: unknown) => {
            w[String(name)] = value;
            emit(`global:${String(name)}`, value);
        },
        waitGlobalInitialized: async (name?: string) => {
            await readyP;
            if (!name || w[name] !== undefined) return name ? w[name] : undefined;
            return new Promise(resolve => { eventOnce(`global:${name}`, resolve); });
        },
        reloadIframe: () => {},
    };
    api.substituteMacros = api.substitudeMacros;
    const Mvu = {
        events: mvuEvents,
        getMvuData: (o: VarOpts = {}) => getVariables({ ...o, type: 'message' }),
        getCurrentMvuData: () => getVariables({ type: 'message' }),
        replaceMvuData: (data: Record<string, unknown>, o: VarOpts = {}) => replaceVariables(data, { ...o, type: 'message' }),
        parseMessage: (message: string, old: Record<string, unknown>) => call('mvuParse', String(message ?? ''), clone(old ?? {})),
        getMvuVariable: (d: any, p: unknown, o: { default_value?: unknown } = {}) => {
            const v = lodash().get(d && d.stat_data !== undefined ? d.stat_data : d, p);
            return v === undefined ? o.default_value : v;
        },
        setMvuVariable: async (d: any, p: unknown, value: unknown) => { lodash().set(d && d.stat_data !== undefined ? d.stat_data : d, p, value); return true; },
    };
    const context = () => ({
        name1: S.user, name2: S.char, chatId: S.chatId, characterId: S.characterId,
        chat: S.messages.map((m, i) => ({ name: m.name, is_user: m.role === 'user', is_system: m.is_hidden, mes: m.message, swipe_id: m.swipe_id, swipes: m.swipes, variables: [m.data ?? {}], message_id: i })),
        chatMetadata: { variables: clone(S.vars.chat) },
        getCurrentChatId: () => S.chatId,
        saveChat: async () => {}, saveChatDebounced: () => {}, saveMetadata: async () => {},
        eventSource: { on: eventOn, once: api.eventOnce, emit: api.eventEmit, removeListener: eventRemoveListener },
        eventTypes: tavernEvents,
    });
    const SillyTavern: any = { getContext: context };
    Object.assign(w, api, {
        Mvu, toastr, tavern_events: tavernEvents, iframe_events: iframeEvents, SillyTavern,
        TavernHelper: { ...api, Mvu },
    });

    port.onmessage = (e: MessageEvent) => {
        const d = e.data;
        if (d?.snapshot) {
            const before = S;
            S = d.snapshot;
            Object.assign(SillyTavern, context());
            if (!ready) {
                ready = true;
                resolveReady();
                emit(mvuEvents.VARIABLE_INITIALIZED, getVariables({ type: 'message' }));
                return;
            }
            // A user message arriving is news; a reply is announced by the window when it is finished
            // (its empty placeholder appears first), and so are generation start and end.
            if (S.lastMessageId > before.lastMessageId && S.messages[S.lastMessageId]?.role === 'user') {
                emit(tavernEvents.MESSAGE_SENT, S.lastMessageId);
                emit(tavernEvents.USER_MESSAGE_RENDERED, S.lastMessageId);
            } else if (S.lastMessageId < before.lastMessageId) {
                emit(tavernEvents.MESSAGE_DELETED, S.lastMessageId + 1);
            } else if (S.lastMessageId === before.lastMessageId && S.lastMessageId >= 0 && S.messages[S.lastMessageId]?.swipe_id !== before.messages[S.lastMessageId]?.swipe_id) {
                emit(tavernEvents.MESSAGE_SWIPED, S.lastMessageId);
            }
            // Changes this frame wrote itself are not announced back to it (MVU does not either).
            const now = JSON.stringify(varsAt(S, S.messageId));
            if (now !== JSON.stringify(varsAt(before, before.messageId))) {
                if (d.self || ownWrites.has(now)) {
                    ownWrites.delete(now);
                } else {
                    const vars = getVariables({ type: 'message' });
                    emit(mvuEvents.VARIABLE_UPDATE_STARTED, vars);
                    emit(mvuEvents.VARIABLE_UPDATE_ENDED, vars);
                }
            }
            return;
        }
        // The window tells of a generation's steps, or asks before one.
        if (d?.event) {
            void emitAsync(String(d.event), ...(Array.isArray(d.args) ? d.args : []));
            return;
        }
        if (d?.ask) {
            void (async () => {
                let value: unknown = null;
                if (d.kind === 'beforeGeneration') {
                    await emitAsync(tavernEvents.GENERATION_STARTED, d.payload?.type ?? 'normal', {}, false);
                    await emitAsync(tavernEvents.GENERATION_AFTER_COMMANDS, d.payload?.type ?? 'normal', {}, false);
                    const injections = [...injected.values()];
                    for (const [id, p] of injected) if (p.once) injected.delete(id);
                    value = { injections, answers: (L[tavernEvents.CHAT_COMPLETION_PROMPT_READY] || []).length ? ['chat_completion_prompt_ready'] : [] };
                } else if (d.kind === 'chat_completion_prompt_ready') {
                    const data = { chat: Array.isArray(d.payload?.messages) ? d.payload.messages : [], dryRun: false };
                    await emitAsync(tavernEvents.CHAT_COMPLETION_PROMPT_READY, data);
                    value = { messages: data.chat };
                }
                port.postMessage({ answer: d.ask, value: value === null ? null : JSON.parse(JSON.stringify(value)) });
            })();
            return;
        }
        if (d?.seq) {
            const p = pending.get(d.seq);
            if (!p) return;
            pending.delete(d.seq);
            if (d.error) p.reject(new Error(d.error));
            else p.resolve(d.result);
        }
    };
    realParent.postMessage({ hearthFrame: ID, ready: true }, '*', [channel.port2]);

    // The card's page fills its panel and scrolls itself; only message frames follow their content.
    if (PAGE) {
        const style = document.createElement('style');
        style.textContent = 'html,body{margin:0;min-height:100%;background:transparent}';
        (document.head || document.documentElement).prepend(style);
        if (buttons.length) setTimeout(showButtons, 0);
        // Tell the window once the scripts have put something visible on the page.
        let shown = false;
        const check = () => {
            if (shown || !document.body) return;
            for (const el of Array.from(document.body.children)) {
                if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || (el as HTMLElement).hidden) continue;
                const r = el.getBoundingClientRect();
                if (r.width > 8 && r.height > 8) {
                    shown = true;
                    realParent.postMessage({ hearthFrame: ID, ui: true }, '*');
                    return;
                }
            }
        };
        new MutationObserver(check).observe(document, { subtree: true, childList: true, attributes: true });
        [500, 2000, 5000].forEach(t => setTimeout(check, t));
        return;
    }

    // --- height ------------------------------------------------------------------------------
    // The frame is sized to its content: the root never scrolls, and html/body take their natural
    // height so viewport-relative sizing (height:100%, 100vh) cannot feed back into the measurement.
    const BASE = 'html{overflow:hidden!important;height:auto!important;min-height:0!important}body{height:auto!important;min-height:0!important}'
        + '*{scrollbar-width:thin;scrollbar-color:rgba(128,128,128,.4) transparent}*::-webkit-scrollbar{width:6px;height:6px}'
        + '*::-webkit-scrollbar-thumb{background:rgba(128,128,128,.4);border-radius:6px}*::-webkit-scrollbar-track{background:transparent}';
    const px = (v: string) => parseFloat(v) || 0;
    // The html element's own box, or the bottom of an absolutely positioned top-level element if that
    // reaches further. Fixed overlays such as lightboxes are ignored.
    const measure = () => {
        let h = document.documentElement ? document.documentElement.getBoundingClientRect().height : 0;
        const b = document.body;
        if (b) {
            for (const el of Array.from(b.children)) {
                const cs = getComputedStyle(el);
                if (cs.position !== 'absolute' || cs.display === 'none') continue;
                h = Math.max(h, el.getBoundingClientRect().bottom + scrollY + px(cs.marginBottom));
            }
        }
        return Math.ceil(h);
    };
    let lastH = -1;
    const report = () => {
        const h = measure();
        if (h !== lastH) { lastH = h; realParent.postMessage({ hearthFrame: ID, h }, '*'); }
    };
    const ro = new ResizeObserver(report);
    let root: Element | null = null;
    let body: Element | null = null;
    const attach = () => {
        const html = document.documentElement;
        if (html && html !== root) {
            root = html;
            ro.observe(html);
            if (!document.getElementById('hearth-base') && (document.head || html)) {
                const style = document.createElement('style');
                style.id = 'hearth-base';
                style.textContent = BASE;
                const baseTag = document.createElement('base');
                baseTag.target = '_blank';
                (document.head || html).prepend(style, baseTag);
            }
        }
        if (document.body && document.body !== body) { body = document.body; ro.observe(body); }
        report();
    };
    new MutationObserver(attach).observe(document, { subtree: true, childList: true, attributes: true });
    [100, 400, 1200, 3000].forEach(t => setTimeout(attach, t));
}

/** Wraps a card-provided HTML document with the 酒馆助手 globals and the libraries it expects. */
export function frameDocument(source: string, init: FrameInit, origin: string): string {
    const libs = ['jquery', 'lodash', 'vue', 'zod', 'yaml'].map(n => `<script src="${origin}/vendor/${n}.min.js"></script>`).join('');
    const runtime = `<script>(${frameRuntime.toString()})(${JSON.stringify(init).replace(/</g, '\\u003c')});</script>`;
    // The import map comes first: it must be in place before any module loads.
    const head = importMap([source], origin) + runtime + libs;
    // In 酒馆 window.top and window.parent are both 酒馆's page; here they are the stand-in (or the
    // card's own page). window.top cannot be replaced, so the card's code is pointed at window.parent.
    const html = localScripts(source, origin).replace(/\bwindow\.top\b/g, 'window.parent');
    if (/<head(?:\s[^>]*)?>/i.test(html)) return html.replace(/<head(?:\s[^>]*)?>/i, m => m + head);
    // Nothing may come before a doctype, or the page renders in quirks mode.
    const doctype = html.match(/^\s*<!doctype[^>]*>/i)?.[0] ?? '';
    return doctype + head + html.slice(doctype.length);
}

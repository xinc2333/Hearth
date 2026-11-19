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

    let S: FrameSnapshot = {
        chatId: '', characterId: '', messageId: 0, lastMessageId: -1, user: '', char: '',
        vars: { chat: {}, global: {} }, messages: [], books: { all: [], global: [], primary: null, additional: [], chat: null },
    };
    let ready = false;
    let resolveReady: () => void = () => {};
    const readyP = new Promise<void>(r => { resolveReady = r; });

    // --- events ------------------------------------------------------------------------------
    const L: Record<string, Function[]> = {};
    const emit = (e: string, ...a: unknown[]) => (L[e] || []).slice().forEach(f => { try { f(...a); } catch (err) { console.error(err); } });
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
        WORLDINFO_UPDATED: 'worldinfo_updated', SETTINGS_UPDATED: 'settings_updated',
    };
    const iframeEvents = { MESSAGE_IFRAME_RENDER_STARTED: 'message_iframe_render_started', MESSAGE_IFRAME_RENDER_ENDED: 'message_iframe_render_ended' };
    const eventOn = (e: string, f: Function) => { (L[e] = L[e] || []).push(f); return { stop: () => eventRemoveListener(e, f) }; };
    const eventRemoveListener = (e: string, f: Function) => { L[e] = (L[e] || []).filter(x => x !== f); };

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
    const stub = document.implementation.createHTMLDocument('');
    stub.body.innerHTML = '<textarea id="send_textarea"></textarea><div id="send_but"></div><div id="chat"></div>';
    const box = stub.getElementById('send_textarea') as HTMLTextAreaElement;
    const sendButton = stub.getElementById('send_but') as HTMLElement;
    // jQuery's trigger('input') calls oninput directly; a real event reaches the listener. Sending the
    // same text twice is harmless. A click (jQuery or not) always ends in one native click event.
    box.oninput = () => notify('input', box.value);
    box.addEventListener('input', () => notify('input', box.value));
    sendButton.addEventListener('click', () => { const text = box.value; box.value = ''; notify('send', text); });
    const stubJq = () => (w.jQuery ? (sel: unknown, ctx?: unknown) => w.jQuery(sel, ctx ?? stub) : undefined);
    const shared: Record<string | symbol, unknown> = {};
    const facade: any = new Proxy(shared, {
        get(_t, k) {
            switch (k) {
                case 'postMessage': return (...a: [unknown, string, Transferable[]?]) => realParent.postMessage(...a);
                case 'document': return stub;
                case '$': case 'jQuery': return stubJq();
                case 'window': case 'self': case 'parent': case 'frames': return facade;
                case 'top': return window.top;
                case 'innerWidth': return window.innerWidth;
                case 'innerHeight': return window.innerHeight;
                case 'length': return 0;
                case 'closed': return false;
                default:
                    if (k in shared) return shared[k];
                    return ['SillyTavern', 'TavernHelper', 'toastr', 'Mvu', '_', 'z', 'YAML', 'Vue'].includes(String(k)) ? w[k] : undefined;
            }
        },
        set(_t, k, v) { shared[k] = v; return true; },
    });
    try { Object.defineProperty(window, 'parent', { configurable: true, get: () => facade }); } catch { /* keep the real one */ }

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

    // --- the globals -------------------------------------------------------------------------
    const api: Record<string, unknown> = {
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
        eventOnce: (e: string, f: Function) => { const wrap = (...a: unknown[]) => { eventRemoveListener(e, wrap); f(...a); }; return eventOn(e, wrap); },
        eventMakeFirst: (e: string, f: Function) => { (L[e] = L[e] || []).unshift(f); return { stop: () => eventRemoveListener(e, f) }; },
        eventMakeLast: eventOn,
        eventEmit: async (e: string, ...a: unknown[]) => emit(e, ...a),
        eventClearEvent: (e: string) => { delete L[e]; },
        eventClearAll: () => { for (const k of Object.keys(L)) delete L[k]; },
        waitGlobalInitialized: async (name?: string) => { await readyP; return name ? w[name] : undefined; },
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
            if (S.lastMessageId > before.lastMessageId) {
                emit(S.messages[S.lastMessageId]?.role === 'user' ? tavernEvents.MESSAGE_SENT : tavernEvents.MESSAGE_RECEIVED, S.lastMessageId);
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
        if (d?.seq) {
            const p = pending.get(d.seq);
            if (!p) return;
            pending.delete(d.seq);
            if (d.error) p.reject(new Error(d.error));
            else p.resolve(d.result);
        }
    };
    realParent.postMessage({ hearthFrame: ID, ready: true }, '*', [channel.port2]);

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
export function frameDocument(html: string, init: FrameInit, origin: string): string {
    const libs = ['jquery', 'lodash', 'vue', 'zod', 'yaml'].map(n => `<script src="${origin}/vendor/${n}.min.js"></script>`).join('');
    const runtime = `<script>(${frameRuntime.toString()})(${JSON.stringify(init).replace(/</g, '\\u003c')});</script>`;
    const head = runtime + libs;
    if (/<head(?:\s[^>]*)?>/i.test(html)) return html.replace(/<head(?:\s[^>]*)?>/i, m => m + head);
    // Nothing may come before a doctype, or the page renders in quirks mode.
    const doctype = html.match(/^\s*<!doctype[^>]*>/i)?.[0] ?? '';
    return doctype + head + html.slice(doctype.length);
}

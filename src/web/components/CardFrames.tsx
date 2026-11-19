// Card frames in the window: HTML in a message (SandboxFrame) and the card's own page (CardPage),
// which runs the card's 酒馆助手 scripts. Both speak to the window over the port the frame creates
// (card-frame.ts); calls are carried out by card-host.ts, and card-page.ts keeps them registered so
// a generation can tell them its steps and ask the page before it starts.

import { useEffect, useMemo, useRef, useState } from 'react';

import type { CardScript, Character } from '../../core/types.ts';
import { api } from '../api.ts';
import { cardStorage, frameSnapshot, handleFrameCall, type FrameScope } from '../card-host.ts';
import { frameDocument } from '../card-frame.ts';
import { frameAnswer, registerFrame } from '../card-page.ts';
import { pageScripts } from '../card-scripts.ts';
import { getState, reportError, setState, toggleInspector, useAppState } from '../state.ts';

const tavernHelperOn = (s: ReturnType<typeof getState>) => s.boot?.plugins.some(p => p.id === 'tavern-helper' && p.enabled && !p.error) ?? false;

/**
 * A card frame: Hearth's card origin (a second local port) serves an empty page, and once it says
 * it is there, the card's document is written into it. The frame is allowed its own origin, which
 * is not Hearth's, so the card's code has a whole page (nested frames, modules, storage) but no way
 * into Hearth's window or API.
 */
const SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-forms allow-modals';

function CardIframe({ id, doc, frameRef, className, style, scrolling }: {
    id: string; doc: string; frameRef: React.RefObject<HTMLIFrameElement | null>; className: string; style?: React.CSSProperties; scrolling?: string;
}) {
    const origin = useAppState(s => s.boot?.cardOrigin ?? null);
    // A new document is a new page: the frame is made again.
    const generation = useMemo(() => Math.random().toString(36).slice(2), [doc]);
    useEffect(() => {
        const onMessage = (e: MessageEvent) => {
            if (e.data?.hearthBoot !== id || e.origin !== origin || e.source !== frameRef.current?.contentWindow) return;
            frameRef.current?.contentWindow?.postMessage({ hearthDoc: doc }, origin!);
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [id, doc, origin]);
    if (!origin) return null;
    return <iframe key={generation} ref={frameRef} className={className} aria-label="角色卡界面" sandbox={SANDBOX} scrolling={scrolling} src={`${origin}/frame#${id}`} style={style} />;
}

/** Where the libraries for card frames are served (the card origin). */
const cardOrigin = () => getState().boot?.cardOrigin ?? window.location.origin;

/** Connects a frame's port: snapshots in, calls out, answers to the window's questions. */
function useCardPort(id: string, ref: React.RefObject<HTMLIFrameElement | null>, scope: FrameScope, page: boolean, onSignal: (data: Record<string, unknown>) => void) {
    const port = useRef<MessagePort | null>(null);
    const chat = useAppState(s => s.chats[scope.chatId]);
    const context = useAppState(s => s.contexts[scope.chatId]);
    const boot = useAppState(s => s.boot);
    const index = scope.index < 0 && chat ? chat.messages.length - 1 : scope.index;
    const snapshot = useMemo(() => (chat ? frameSnapshot(chat, index, context, boot) : null), [chat, index, context, boot]);
    const latest = useRef(snapshot);
    latest.current = snapshot;
    const signal = useRef(onSignal);
    signal.current = onSignal;
    useEffect(() => {
        let unregister = () => {};
        const onMessage = (e: MessageEvent) => {
            if (e.data?.hearthFrame !== id || e.source !== ref.current?.contentWindow) return;
            signal.current(e.data);
            if (!e.data.ready || !e.ports[0]) return;
            unregister();
            port.current?.close();
            const p = port.current = e.ports[0];
            unregister = registerFrame(scope.chatId, p, page);
            p.onmessage = async (ev: MessageEvent) => {
                if (frameAnswer(ev.data)) return;
                const { seq, method, args } = ev.data ?? {};
                if (typeof method !== 'string') return;
                const callScope = { ...scope, index: scope.index < 0 ? (getState().chats[scope.chatId]?.messages.length ?? 0) - 1 : scope.index };
                try {
                    const result = await handleFrameCall(callScope, method, Array.isArray(args) ? args : []);
                    if (!seq) return;
                    // The frame reads its own write right after the call resolves.
                    const s = getState();
                    const next = s.chats[scope.chatId];
                    if (next) p.postMessage({ snapshot: frameSnapshot(next, callScope.index, s.contexts[scope.chatId], s.boot), self: true });
                    p.postMessage({ seq, result });
                } catch (error) {
                    if (seq) p.postMessage({ seq, error: (error as Error).message || String(error) });
                    else reportError(error);
                }
            };
            if (latest.current) p.postMessage({ snapshot: latest.current });
        };
        window.addEventListener('message', onMessage);
        return () => {
            window.removeEventListener('message', onMessage);
            unregister();
        };
    }, [id, scope, page]);
    // The chat changed (new reply, another frame wrote variables…): send the new snapshot.
    useEffect(() => {
        if (snapshot) port.current?.postMessage({ snapshot });
    }, [snapshot]);
    useEffect(() => () => port.current?.close(), []);
    return chat;
}

// Heights the card panels settled at, so a panel shown again (chat reopened, earlier messages
// loaded) starts at its real size instead of jumping there.
const frameHeights = new Map<string, number>();

/** A card's HTML interface in a message, sized to its content. */
export function SandboxFrame({ html, scope }: { html: string; scope: FrameScope }) {
    const id = useMemo(() => Math.random().toString(36).slice(2), []);
    const ref = useRef<HTMLIFrameElement>(null);
    const [height, setHeight] = useState(() => frameHeights.get(html) ?? 120);
    const chat = useCardPort(id, ref, scope, false, data => {
        if (typeof data.h !== 'number') return;
        const h = Math.min(Math.max(data.h, 24), 2400);
        frameHeights.set(html, h);
        setHeight(h);
    });
    const characterId = chat?.characterId ?? '';
    const doc = useMemo(() => frameDocument(html, { id, storage: cardStorage(characterId), snapshot: initialSnapshot(scope) }, cardOrigin()), [html, id, characterId]);
    // aria-label names the frame for screen readers without the tooltip `title` shows over the panel.
    return <CardIframe id={id} doc={doc} frameRef={ref} className="card-frame" scrolling="no" style={{ height }} />;
}

// --- the card's page ------------------------------------------------------------------------------

/** The chat as it is now, for a frame being made (later changes arrive over the port). */
function initialSnapshot(scope: FrameScope) {
    const s = getState();
    const chat = s.chats[scope.chatId];
    return chat ? frameSnapshot(chat, scope.index < 0 ? chat.messages.length - 1 : scope.index, s.contexts[scope.chatId], s.boot) : undefined;
}

/** The page: each script as its own module, with getScriptId answering for that script. */
function pageDocument(scripts: CardScript[], id: string, characterId: string, chatId: string): string {
    const safe = (code: string) => code.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
    const modules = scripts.map(s => {
        const own = /\b(?:const|let|var|function|class)\s+getScriptId\b/.test(s.content) ? '' : `const getScriptId = () => ${JSON.stringify(s.id)};\n`;
        return `<script type="module" data-script="${s.id.replace(/"/g, '')}">\n${own}${safe(s.content)}\n</script>`;
    }).join('\n');
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>\n${modules}\n</body></html>`;
    return frameDocument(html, { id, storage: cardStorage(characterId), mode: 'page', snapshot: initialSnapshot({ chatId, index: -1 }), buttons: scriptButtons(scripts) }, cardOrigin());
}

/** The buttons each script declares (酒馆助手's script settings), when the script shows them. */
function scriptButtons(scripts: CardScript[]): { name: string; visible: boolean }[] {
    return scripts.flatMap(s => {
        const button = (s.raw as { button?: { enabled?: boolean; buttons?: { name?: unknown; visible?: unknown }[] } } | null)?.button;
        if (!button?.enabled || !Array.isArray(button.buttons)) return [];
        return button.buttons.filter(b => typeof b?.name === 'string').map(b => ({ name: String(b.name), visible: b.visible !== false }));
    });
}

/** Where the 界面 tab wants the page shown (null while it is not visible). */
let slot: HTMLElement | null = null;
const slotListeners = new Set<() => void>();
export function setCardSlot(el: HTMLElement | null) {
    slot = el;
    for (const f of slotListeners) f();
}

/** Chats whose page already opened the panel this session (it opens itself once, when it shows something). */
const opened = new Set<string>();

/**
 * The active chat's card page. It stays mounted while the chat is open, so its scripts keep running;
 * it is laid over the panel's 界面 tab when that is visible and kept out of view otherwise.
 */
export function CardPage() {
    const chatId = useAppState(s => s.activeChatId);
    const characterId = useAppState(s => (s.activeChatId ? s.chats[s.activeChatId]?.characterId : undefined));
    const on = useAppState(tavernHelperOn);
    const [character, setCharacter] = useState<Character | null>(null);
    useEffect(() => {
        setCharacter(null);
        if (!characterId || !on) return;
        let live = true;
        void api.get<Character>('character', characterId).then(c => { if (live) setCharacter(c); }).catch(() => {});
        return () => { live = false; };
    }, [characterId, on]);
    const scripts = useMemo(() => (character ? pageScripts(character) : []), [character]);
    const active = Boolean(chatId && character && character.id === characterId && scripts.length);
    useEffect(() => {
        setState({ cardPage: active ? chatId : null, cardButtons: [] });
    }, [active, chatId]);
    if (!active || !chatId || !character) return null;
    return <PageFrame key={`${chatId}:${character.id}:${character.updatedAt}`} chatId={chatId} character={character} scripts={scripts} />;
}

function PageFrame({ chatId, character, scripts }: { chatId: string; character: Character; scripts: CardScript[] }) {
    const id = useMemo(() => Math.random().toString(36).slice(2), []);
    const ref = useRef<HTMLIFrameElement>(null);
    const scope = useMemo<FrameScope>(() => ({ chatId, index: -1 }), [chatId]);
    const doc = useMemo(() => pageDocument(scripts, id, character.id, chatId), [scripts, id, character.id, chatId]);
    const [rect, setRect] = useState<DOMRect | null>(null);
    useCardPort(id, ref, scope, true, data => {
        if (Array.isArray(data.buttons)) setState({ cardButtons: data.buttons.map(String) });
        // The page shows something: open the panel on it once, if the panel is closed.
        if (data.ui && !opened.has(chatId) && !getState().inspector) {
            opened.add(chatId);
            toggleInspector('card');
        }
    });
    useEffect(() => {
        const update = () => setRect(slot ? slot.getBoundingClientRect() : null);
        const ro = new ResizeObserver(update);
        const listen = () => { ro.disconnect(); if (slot) ro.observe(slot); update(); };
        slotListeners.add(listen);
        listen();
        window.addEventListener('resize', update);
        return () => { slotListeners.delete(listen); ro.disconnect(); window.removeEventListener('resize', update); };
    }, []);
    const style: React.CSSProperties = rect
        ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
        : { left: -10000, top: 0, width: 420, height: 720, visibility: 'hidden' };
    return (
        <div className="card-page-host" style={style}>
            <CardIframe id={id} doc={doc} frameRef={ref} className="card-page" />
        </div>
    );
}

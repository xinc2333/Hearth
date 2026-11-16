import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { Chat, ChatMessage, RegexScript } from '../../core/types.ts';
import { api, type ChatContext } from '../api.ts';
import { Icon } from '../icons.tsx';
import { normalizeModelOutput } from '../../core/output.ts';
import { stateAt } from '../../core/state.ts';
import { countChars, displayText, frameDocument, renderSegments, type FrameVars } from '../render.ts';
import {
    changeChat, getState, openChat, reportError, runGeneration, setState, stopGeneration, toast, toggleInspector, toggleSidebar,
    useAppState, useReading, type Streaming,
} from '../state.ts';
import { AutoTextarea, Avatar, Button, clockTime, Empty, IconButton, isModalOpen } from './common.tsx';
import { ReadingControls } from './Reading.tsx';
import { pickImportFiles } from './Sidebar.tsx';

/** Messages rendered at first; earlier ones load on demand so long chats open quickly. */
const PAGE = 30;
/** Space kept above a message that is scrolled to the top of the view. */
const TOP_GAP = 20;

/** Card UIs talk to the app through slash commands (TavernHelper triggerSlash): /setinput, /send, /trigger. */
function runCardCommand(command: string) {
    const chatId = getState().activeChatId;
    if (!chatId) return;
    for (const part of command.split(/\|(?=\s*\/)/)) {
        const m = part.trim().match(/^\/(\w+)\s*([\s\S]*)$/);
        if (!m) continue;
        const [, name, arg] = m;
        if (name === 'setinput') window.dispatchEvent(new CustomEvent('hearth:setinput', { detail: arg }));
        else if (name === 'send') void runGeneration(chatId, 'normal', arg);
        else if (name === 'trigger') void runGeneration(chatId, 'normal');
    }
}

// Heights the card panels settled at, so a panel shown again (chat reopened, earlier messages
// loaded) starts at its real size instead of jumping there.
const frameHeights = new Map<string, number>();

function SandboxFrame({ html, vars }: { html: string; vars: FrameVars }) {
    const id = useMemo(() => Math.random().toString(36).slice(2), []);
    const ref = useRef<HTMLIFrameElement>(null);
    const [height, setHeight] = useState(() => frameHeights.get(html) ?? 120);
    const doc = useMemo(() => frameDocument(html, id, window.location.origin), [html, id]);
    const varsJson = JSON.stringify(vars);
    const post = () => ref.current?.contentWindow?.postMessage({ hearthVars: JSON.parse(varsJson) }, '*');
    useEffect(() => {
        const onMessage = (e: MessageEvent) => {
            if (e.data?.hearthFrame !== id) return;
            if (typeof e.data.h === 'number') {
                const h = Math.min(Math.max(e.data.h, 24), 2400);
                frameHeights.set(html, h);
                setHeight(h);
            }
            if (e.data.ready) post();
            if (typeof e.data.slash === 'string') runCardCommand(e.data.slash);
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [id, varsJson, html]);
    // Variables changed (new swipe, edited state): push them so the panel refreshes in place.
    useEffect(post, [varsJson]);
    return <iframe ref={ref} className="card-frame" title="角色卡界面" sandbox="allow-scripts allow-popups" scrolling="no" srcDoc={doc} style={{ height }} />;
}

const Rendered = memo(function Rendered({ text, vars }: { text: string; vars: FrameVars }) {
    // Message HTML (status bars and other card interfaces) belongs to the 酒馆助手 plugin.
    const frames = useAppState(s => s.boot?.plugins.some(p => p.id === 'tavern-helper' && p.enabled && !p.error) ?? false);
    const segments = useMemo(() => renderSegments(text, frames), [text, frames]);
    return (
        <>
            {segments.map((s, i) => s.type === 'frame'
                ? <SandboxFrame key={i} html={s.html} vars={vars} />
                : <div key={i} className="prose" dangerouslySetInnerHTML={{ __html: s.html }} />)}
        </>
    );
});

/** The model's thinking: a short live window while it thinks, folded away once the reply starts. */
function Reasoning({ text, live }: { text: string; live: boolean }) {
    const [choice, setChoice] = useState<boolean | null>(null);
    const body = useRef<HTMLDivElement>(null);
    const open = choice ?? live;
    useEffect(() => {
        if (live && body.current) body.current.scrollTop = body.current.scrollHeight;
    }, [text, live, open]);
    return (
        <div className={`reasoning${open ? ' open' : ''}${live ? ' live' : ''}`}>
            <button type="button" className="reasoning-head" aria-expanded={open} onClick={() => setChoice(!open)}>
                <Icon name="spark" size={13} />
                <span>{live ? '正在思考' : '思考过程'}</span>
                <span className="reasoning-count">{text.length.toLocaleString()} 字</span>
                <Icon name="chevron" size={13} className="reasoning-chev" />
            </button>
            {open && <div className="reasoning-body" ref={body}>{text}</div>}
        </div>
    );
}

async function switchSwipe(chat: Chat, message: ChatMessage, next: number) {
    if (next < 0) return;
    if (next >= message.swipes.length) {
        void runGeneration(chat.id, 'swipe');
        return;
    }
    await changeChat(chat.id, [{ op: 'set', path: ['messages', `@${message.id}`, 'activeSwipe'], value: next }]).catch(reportError);
}

const MessageView = memo(function MessageView({ chat, message, index, isLast, context, live, busy, avatar, globalVars }: {
    chat: Chat; message: ChatMessage; index: number; isLast: boolean; context?: ChatContext; live: Streaming | null; busy: boolean; avatar?: string;
    globalVars?: Record<string, unknown>;
}) {
    const [editing, setEditing] = useState<string | null>(null);
    const swipe = message.swipes[message.activeSwipe] ?? message.swipes[0];
    const raw = live ? live.prefix + live.text : swipe?.content ?? '';
    const reasoning = live ? live.reasoning : swipe?.reasoning;
    const depth = chat.messages.length - 1 - index;
    const regex: RegexScript[] = context?.regex ?? [];
    const isUser = message.role === 'user';
    const text = useMemo(() => displayText(isUser ? raw : normalizeModelOutput(raw), {
        regex, user: context?.userName ?? '', char: context?.charName ?? '',
        placement: isUser ? 'user_input' : 'ai_output', depth,
    }), [raw, regex, context?.userName, context?.charName, isUser, depth]);
    const chars = useMemo(() => (live ? 0 : countChars(text)), [text, live]);
    const vars = useMemo<FrameVars>(() => ({
        message: stateAt(chat.messages, index) ?? {},
        chat: chat.variables ?? {},
        global: globalVars ?? {},
        messageId: index,
        lastMessageId: chat.messages.length - 1,
        user: context?.userName ?? '',
        char: context?.charName ?? '',
    }), [chat.messages, chat.variables, index, globalVars, context?.userName, context?.charName]);

    const saveEdit = async () => {
        if (editing === null) return;
        try {
            if (editing !== swipe.content) {
                await changeChat(chat.id, [{ op: 'set', path: ['messages', `@${message.id}`, 'swipes', `@${swipe.id}`, 'content'], value: editing }], '编辑消息');
            }
            setEditing(null);
        } catch (error) {
            reportError(error);
        }
    };
    const remove = async () => {
        try {
            const { resource, change } = await api.change<Chat>('chat', chat.id, [{ op: 'unset', path: ['messages', `@${message.id}`] }], '删除消息');
            setState(s => ({ chats: { ...s.chats, [chat.id]: resource } }));
            toast('已删除这条消息', 'info', { label: '撤销', run: () => void api.revert(change.id).then(() => openChat(chat.id)).catch(reportError) });
        } catch (error) {
            reportError(error);
        }
    };
    const lastSwipe = message.activeSwipe === message.swipes.length - 1;
    const thinking = Boolean(live && !live.text);

    return (
        <article data-mid={message.id} className={`msg ${isUser ? 'msg-user' : 'msg-char'}${message.hidden ? ' msg-hidden' : ''}${live ? ' live' : ''}`}>
            {!isUser && (
                <header className="msg-head">
                    <Avatar src={avatar} name={message.name} size={26} />
                    <span className="msg-name">{message.name}</span>
                    {message.hidden && <span className="tag">不发送</span>}
                    <span className="msg-meta">#{index + 1} · {clockTime(swipe?.createdAt ?? message.createdAt)}{swipe?.model ? ` · ${swipe.model}` : ''}</span>
                </header>
            )}
            {reasoning && <Reasoning text={reasoning} live={thinking} />}
            <div className="msg-body">
                {editing !== null ? (
                    <div className="msg-edit">
                        <AutoTextarea value={editing} onChange={e => setEditing(e.target.value)} minRows={3} maxHeight={Math.round(window.innerHeight * 0.6)} autoFocus spellCheck={false}
                            onKeyDown={e => {
                                if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); }
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void saveEdit();
                            }} />
                        <div className="msg-edit-bar">
                            <span className="muted small">Ctrl+Enter 保存 · Esc 取消</span>
                            <span className="grow" />
                            <Button variant="ghost" onClick={() => setEditing(null)}>取消</Button>
                            <Button variant="primary" onClick={() => void saveEdit()}>保存</Button>
                        </div>
                    </div>
                ) : live && !raw ? (
                    !reasoning && <div className="typing" aria-label="正在等待回复"><span /><span /><span /></div>
                ) : (
                    <Rendered text={text} vars={vars} />
                )}
            </div>
            {live?.finalizing && <div className="msg-note delayed">回复已完成，正在整理（例如更新变量）…</div>}
            {swipe?.finish === 'error' && !live && <div className="msg-error">生成失败：{swipe.error}</div>}
            {swipe?.finish === 'aborted' && !live && <div className="msg-note">已中止</div>}
            {swipe?.finish === 'length' && !live && <div className="msg-note">达到长度上限，可以点「继续写」</div>}
            {editing === null && !live && (
                <div className={`msg-actions${isLast ? ' sticky' : ''}`}>
                    {!isUser && (message.swipes.length > 1 || isLast) && (
                        <span className="swipes">
                            <IconButton icon="left" label="上一个版本（←）" size={14} disabled={busy || message.activeSwipe === 0} onClick={() => void switchSwipe(chat, message, message.activeSwipe - 1)} />
                            <span className="swipe-count">{message.activeSwipe + 1} / {message.swipes.length}</span>
                            <IconButton icon="right" label={lastSwipe && isLast ? '生成新版本（→）' : '下一个版本（→）'} size={14}
                                disabled={busy || (lastSwipe && !isLast)} onClick={() => void switchSwipe(chat, message, message.activeSwipe + 1)} />
                        </span>
                    )}
                    <IconButton icon="copy" label="复制" size={14} onClick={() => { void navigator.clipboard.writeText(swipe.content); toast('已复制'); }} />
                    <IconButton icon="edit" label="编辑" size={14} disabled={busy} onClick={() => setEditing(swipe.content)} />
                    {!isUser && isLast && <IconButton icon="refresh" label="重新生成" size={14} disabled={busy} onClick={() => void runGeneration(chat.id, 'regenerate')} />}
                    {!isUser && isLast && <IconButton icon="forward" label="继续写" size={14} disabled={busy} onClick={() => void runGeneration(chat.id, 'continue')} />}
                    <IconButton icon="trash" label="删除" size={14} tone="danger" disabled={busy} onClick={() => void remove()} />
                    {isUser
                        ? <span className="msg-stat">#{index + 1} · {clockTime(message.createdAt)}</span>
                        : chars > 0 && <span className="msg-stat">{chars.toLocaleString()} 字</span>}
                </div>
            )}
        </article>
    );
});

function Composer({ chatId }: { chatId: string }) {
    const streaming = useAppState(s => s.streaming);
    const [text, setText] = useState(() => { try { return localStorage.getItem(`hearth.draft.${chatId}`) ?? ''; } catch { return ''; } });
    useEffect(() => {
        try { localStorage.setItem(`hearth.draft.${chatId}`, text); } catch { /* ignore */ }
    }, [chatId, text]);
    useEffect(() => {
        const onSet = (e: Event) => setText(String((e as CustomEvent).detail ?? ''));
        window.addEventListener('hearth:setinput', onSet);
        return () => window.removeEventListener('hearth:setinput', onSet);
    }, []);
    const busy = streaming?.chatId === chatId;
    const written = busy ? streaming.text.length : 0;
    const send = () => {
        if (busy) return;
        const value = text;
        setText('');
        void runGeneration(chatId, 'normal', value);
    };
    return (
        <div className="composer">
            <AutoTextarea
                value={text}
                minRows={1}
                maxHeight={Math.round(window.innerHeight * 0.4)}
                placeholder="写下你的行动或对话…"
                data-composer=""
                autoFocus
                onChange={e => setText(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        send();
                    }
                }}
            />
            <div className="composer-bar">
                <span className="composer-hint">
                    {busy
                        ? <><span className="pulse" />{streaming.finalizing ? '正在整理回复…' : written ? `正在生成 · ${written.toLocaleString()} 字` : '正在等待回复…'}<kbd>Esc</kbd>停止</>
                        : text ? <><kbd>Enter</kbd>发送<kbd>Shift</kbd>+<kbd>Enter</kbd>换行</> : <>留空发送，让角色继续说</>}
                </span>
                {busy
                    ? <button className="send-btn stop" onClick={() => void stopGeneration()} title="停止（Esc）" aria-label="停止"><Icon name="stop" size={15} /></button>
                    : <button className="send-btn" onClick={send} title="发送（Enter）" aria-label="发送"><Icon name="send" size={16} /></button>}
            </div>
        </div>
    );
}

function ReadingPopover({ onClose }: { onClose: () => void }) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!ref.current?.contains(target) && !target.closest('[data-reading-toggle]')) onClose();
        };
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        window.addEventListener('mousedown', onDown);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('mousedown', onDown);
            window.removeEventListener('keydown', onKey);
        };
    }, [onClose]);
    return (
        <div className="popover reading-popover" ref={ref} role="dialog" aria-label="阅读设置">
            <div className="popover-title">阅读设置</div>
            <ReadingControls />
        </div>
    );
}

function Welcome() {
    const sidebarOpen = useAppState(s => s.sidebarOpen);
    return (
        <main className="chat-view">
            {!sidebarOpen && (
                <header className="chat-head bare">
                    <IconButton icon="sidebar" label="显示侧栏（Ctrl+B）" onClick={toggleSidebar} />
                </header>
            )}
            <div className="welcome">
                <div className="welcome-mark" aria-hidden="true" />
                <h1>欢迎来到 Hearth</h1>
                <p>把酒馆的角色卡（PNG / JSON）、世界书或预设拖进窗口就能导入，然后在左侧选一个角色开始对话。</p>
                <div className="welcome-steps">
                    <div><b>1</b>在「设置 → 模型连接」填写接口地址、密钥和模型</div>
                    <div><b>2</b>导入角色卡；常用的酒馆预设在「设置 → 预设」里导入和开关</div>
                    <div><b>3</b>选择角色开始聊天；按 <kbd>Ctrl</kbd>+<kbd>K</kbd> 可以快速找到任何角色、对话和功能</div>
                </div>
                <div className="row-center">
                    <Button variant="primary" icon="upload" onClick={pickImportFiles}>导入文件</Button>
                    <Button icon="settings" onClick={() => setState({ settingsOpen: true })}>模型连接</Button>
                </div>
            </div>
        </main>
    );
}

export function ChatView() {
    const activeChatId = useAppState(s => s.activeChatId);
    const chat = useAppState(s => (s.activeChatId ? s.chats[s.activeChatId] : undefined));
    const context = useAppState(s => (s.activeChatId ? s.contexts[s.activeChatId] : undefined));
    const streaming = useAppState(s => s.streaming);
    const inspector = useAppState(s => s.inspector);
    const sidebarOpen = useAppState(s => s.sidebarOpen);
    const boot = useAppState(s => s.boot);
    const reading = useReading();
    const [readingOpen, setReadingOpen] = useState(false);
    const [limit, setLimit] = useState(PAGE);
    const [away, setAway] = useState(false);

    const scroller = useRef<HTMLDivElement>(null);
    const inner = useRef<HTMLDivElement>(null);
    const spacer = useRef<HTMLDivElement>(null);
    // Pinned to the end: layout changes (a card panel finishing its render, streamed text) keep it there.
    const stick = useRef(true);
    // A message held at the top of the view while its reply is written below it.
    const anchor = useRef<string | null>(null);
    const anchoredJob = useRef<string | undefined>(undefined);
    // The anchored message stays at the top until the reader scrolls on their own.
    const pinned = useRef(false);
    const heightBefore = useRef<number | null>(null);
    // The job during which the reader took over scrolling.
    const released = useRef<string | undefined>(undefined);
    const lastInput = useRef(0);
    const release = () => {
        pinned.current = false;
        released.current = anchoredJob.current;
        lastInput.current = performance.now();
    };

    const character = boot?.resources.character.find(c => c.id === chat?.characterId);
    const live = streaming && chat && streaming.chatId === chat.id ? streaming : null;
    // The reader asked to follow this reply ("back to latest") although following is off by default.
    const chasing = useRef(false);
    const holding = useRef(false);
    holding.current = Boolean(live && !reading.follow && !chasing.current);

    const layout = useCallback(() => {
        const el = scroller.current;
        const body = inner.current;
        const pad = spacer.current;
        if (!el || !body || !pad) return;
        const end = body.offsetTop + body.offsetHeight;
        const target = anchor.current ? body.querySelector<HTMLElement>(`[data-mid="${anchor.current}"]`) : null;
        // Room below the content so the anchored message can sit at the top even when the reply is short.
        pad.style.height = `${target ? Math.max(0, el.clientHeight - (end - target.offsetTop) - TOP_GAP) : 0}px`;
        if (stick.current) el.scrollTop = el.scrollHeight;
        // Content that shrinks (the thinking window folding away) makes the browser clamp the scroll
        // position before the room below is restored; put the anchored message back.
        else if (pinned.current && target && Math.abs(el.scrollTop - (target.offsetTop - TOP_GAP)) > 1) el.scrollTop = target.offsetTop - TOP_GAP;
        setAway(end - el.scrollTop - el.clientHeight > 160);
    }, []);

    useLayoutEffect(() => {
        anchor.current = null;
        pinned.current = false;
        stick.current = true;
        setLimit(PAGE);
        setReadingOpen(false);
        layout();
    }, [activeChatId, Boolean(chat), layout]);

    useEffect(() => {
        const el = scroller.current;
        const body = inner.current;
        if (!el || !body) return;
        const observer = new ResizeObserver(layout);
        observer.observe(el);
        observer.observe(body);
        return () => observer.disconnect();
    }, [activeChatId, Boolean(chat), layout]);

    // When a reply starts, bring the message being answered to the top and let the reply grow under
    // it, so it can be read from its first line while it is still being written.
    useLayoutEffect(() => {
        if (!live?.messageId || !live.jobId || anchoredJob.current === live.jobId) return;
        const el = scroller.current;
        const node = inner.current?.querySelector<HTMLElement>(`[data-mid="${live.messageId}"]`);
        if (!el || !node) return;
        anchoredJob.current = live.jobId;
        chasing.current = false;
        pinned.current = false;
        if (reading.follow) {
            anchor.current = null;
            stick.current = true;
            layout();
            return;
        }
        stick.current = false;
        if (live.kind === 'continue') return;
        const previous = node.previousElementSibling as HTMLElement | null;
        const target = live.kind === 'normal' && previous?.classList.contains('msg-user') ? previous : node;
        anchor.current = target.dataset.mid ?? null;
        layout();
        el.scrollTo({ top: target.offsetTop - TOP_GAP, behavior: 'smooth' });
        // Let the smooth scroll arrive before holding the position against layout changes.
        const job = live.jobId;
        window.setTimeout(() => {
            if (anchoredJob.current === job && released.current !== job) pinned.current = true;
        }, 450);
    }, [live?.messageId, live?.jobId, live?.kind, chat?.messages, reading.follow, layout]);

    // Earlier messages were added above: keep what the reader was looking at in place.
    useLayoutEffect(() => {
        const el = scroller.current;
        if (el && heightBefore.current !== null) el.scrollTop += el.scrollHeight - heightBefore.current;
        heightBefore.current = null;
    }, [limit]);

    useEffect(() => {
        document.title = character ? `${character.name} · Hearth` : 'Hearth';
    }, [character?.name]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const state = getState();
            if (isModalOpen() || state.paletteOpen || !state.activeChatId) return;
            const current = state.chats[state.activeChatId];
            if (e.key === 'Escape' && state.streaming?.chatId === state.activeChatId && !e.defaultPrevented) {
                void stopGeneration();
                return;
            }
            if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || state.streaming || !current) return;
            // Like SillyTavern: arrows switch versions unless you are typing something.
            const target = e.target as HTMLElement;
            const field = target.closest?.('input, textarea, select, [contenteditable]') as HTMLTextAreaElement | null;
            if (field && !(field.hasAttribute('data-composer') && !field.value)) return;
            const last = current.messages[current.messages.length - 1];
            if (!last || last.role !== 'assistant') return;
            e.preventDefault();
            void switchSwipe(current, last, last.activeSwipe + (e.key === 'ArrowLeft' ? -1 : 1));
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const closeReading = useCallback(() => setReadingOpen(false), []);

    if (!activeChatId || !chat) return <Welcome />;

    const start = Math.max(0, chat.messages.length - limit);
    const globalVars = boot?.settings.globalVariables;

    return (
        <main className="chat-view">
            <header className="chat-head">
                {!sidebarOpen && <IconButton icon="sidebar" label="显示侧栏（Ctrl+B）" onClick={toggleSidebar} />}
                <button className="chat-ident" title="查看和编辑角色卡" onClick={() => toggleInspector('character')}>
                    <Avatar src={character?.avatar} name={character?.name ?? '?'} size={28} />
                    <span className="chat-title-name">{character?.name}</span>
                </button>
                <button className="chat-chip" title="当前预设，点击管理" onClick={() => setState({ settingsOpen: true, settingsSection: 'preset' })}>
                    <Icon name="sliders" size={13} />
                    <span>{context?.preset.name ?? '预设'}</span>
                </button>
                <span className="grow" />
                <span className="chat-count">{chat.messages.length} 条消息</span>
                <button className={`head-btn${readingOpen ? ' active' : ''}`} data-reading-toggle="" title="阅读设置：字体、字号、行距、栏宽" aria-label="阅读设置" onClick={() => setReadingOpen(!readingOpen)}>
                    <span className="aa" aria-hidden="true">Aa</span>
                </button>
                <button className={`head-btn${inspector ? ' active' : ''}`} title="面板：提示词、变量、角色卡、世界书（Ctrl+I）" onClick={() => toggleInspector()}>
                    <Icon name="panel" size={16} />
                    <span>面板</span>
                </button>
            </header>
            {readingOpen && <ReadingPopover onClose={closeReading} />}
            <div className="messages" ref={scroller} onWheel={release} onTouchMove={release} onPointerDown={release} onPointerMove={e => e.buttons && release()} onKeyDown={release} onScroll={e => {
                const el = e.currentTarget;
                const body = inner.current;
                if (!body) return;
                const below = body.offsetTop + body.offsetHeight - el.scrollTop - el.clientHeight;
                // Only the reader scrolling away unpins the view from the end. A scroll event can also
                // arrive after the content has grown (a card panel finishing its render), and that
                // must not count as leaving.
                if (below < 48) stick.current = !holding.current;
                else if (performance.now() - lastInput.current < 1200) stick.current = false;
                setAway(below > 160);
            }}>
                <div className="messages-inner" ref={inner}>
                    {start > 0 && (
                        <button className="load-earlier" onClick={() => {
                            heightBefore.current = scroller.current?.scrollHeight ?? null;
                            stick.current = false;
                            setLimit(limit + PAGE);
                        }}>显示更早的 {Math.min(PAGE, start)} 条（还有 {start} 条）</button>
                    )}
                    {!chat.messages.length && <Empty title="开始对话吧">这个角色没有开场白，发一句话开始。</Empty>}
                    {chat.messages.slice(start).map((m, i) => {
                        const index = start + i;
                        const swipe = m.swipes[m.activeSwipe] ?? m.swipes[0];
                        return (
                            <MessageView key={m.id} chat={chat} message={m} index={index} isLast={index === chat.messages.length - 1} context={context}
                                live={live && live.messageId === m.id && live.swipeId === swipe?.id ? live : null} busy={Boolean(streaming)}
                                avatar={character?.avatar} globalVars={globalVars} />
                        );
                    })}
                </div>
                <div ref={spacer} aria-hidden="true" />
            </div>
            <div className="composer-wrap">
                {away && (
                    <button className={`jump${live ? ' live' : ''}`} onClick={() => {
                        const el = scroller.current;
                        if (!el) return;
                        anchor.current = null;
                        release();
                        chasing.current = true;
                        holding.current = false;
                        // A reply still being written keeps moving, so go straight to it and stay there.
                        if (live) stick.current = true;
                        el.scrollTo({ top: el.scrollHeight, behavior: live ? 'auto' : 'smooth' });
                    }}>
                        {live && <span className="pulse" />}
                        <Icon name="down" size={14} />
                        <span>{live ? '正在生成，回到最新' : '回到最新'}</span>
                    </button>
                )}
                <Composer key={chat.id} chatId={chat.id} />
            </div>
        </main>
    );
}

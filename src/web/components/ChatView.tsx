import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { Chat, ChatMessage, RegexScript } from '../../core/types.ts';
import type { ChatContext } from '../api.ts';
import { Icon } from '../icons.tsx';
import { normalizeModelOutput } from '../../core/output.ts';
import { stateAt } from '../../core/state.ts';
import { displayText, frameDocument, renderSegments, type FrameVars } from '../render.ts';
import { changeChat, getState, reportError, runGeneration, setState, stopGeneration, toast, useAppState, type Streaming } from '../state.ts';
import { AutoTextarea, Avatar, Button, Empty, IconButton } from './common.tsx';
import { importFiles } from './Sidebar.tsx';

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

function SandboxFrame({ html, vars }: { html: string; vars: FrameVars }) {
    const id = useMemo(() => Math.random().toString(36).slice(2), []);
    const ref = useRef<HTMLIFrameElement>(null);
    const [height, setHeight] = useState(120);
    const doc = useMemo(() => frameDocument(html, id, window.location.origin), [html, id]);
    const varsJson = JSON.stringify(vars);
    const post = () => ref.current?.contentWindow?.postMessage({ hearthVars: JSON.parse(varsJson) }, '*');
    useEffect(() => {
        const onMessage = (e: MessageEvent) => {
            if (e.data?.hearthFrame !== id) return;
            if (typeof e.data.h === 'number') setHeight(Math.min(Math.max(e.data.h, 24), 2400));
            if (e.data.ready) post();
            if (typeof e.data.slash === 'string') runCardCommand(e.data.slash);
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [id, varsJson]);
    // Variables changed (new swipe, edited state): push them so the panel refreshes in place.
    useEffect(post, [varsJson]);
    return <iframe ref={ref} className="card-frame" title="角色卡界面" sandbox="allow-scripts allow-popups" scrolling="no" srcDoc={doc} style={{ height }} />;
}

const Rendered = memo(function Rendered({ text, vars }: { text: string; vars: FrameVars }) {
    const segments = useMemo(() => renderSegments(text), [text]);
    return (
        <>
            {segments.map((s, i) => s.type === 'frame'
                ? <SandboxFrame key={i} html={s.html} vars={vars} />
                : <div key={i} className="prose" dangerouslySetInnerHTML={{ __html: s.html }} />)}
        </>
    );
});

function MessageView({ chat, message, index, isLast, context, streaming, avatar }: {
    chat: Chat; message: ChatMessage; index: number; isLast: boolean; context?: ChatContext; streaming: Streaming | null; avatar?: string;
}) {
    const [editing, setEditing] = useState<string | null>(null);
    const swipe = message.swipes[message.activeSwipe] ?? message.swipes[0];
    const live = streaming && streaming.messageId === message.id && streaming.swipeId === swipe?.id ? streaming : null;
    const raw = live ? live.prefix + live.text : swipe?.content ?? '';
    const reasoning = live ? live.reasoning : swipe?.reasoning;
    const depth = chat.messages.length - 1 - index;
    const regex: RegexScript[] = context?.regex ?? [];
    const text = useMemo(() => displayText(message.role === 'user' ? raw : normalizeModelOutput(raw), {
        regex, user: context?.userName ?? '', char: context?.charName ?? '',
        placement: message.role === 'user' ? 'user_input' : 'ai_output', depth,
    }), [raw, regex, context?.userName, context?.charName, message.role, depth]);
    const busy = Boolean(streaming);
    const isUser = message.role === 'user';
    const globalVars = useAppState(s => s.boot?.settings.globalVariables);
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
            await changeChat(chat.id, [{ op: 'set', path: ['messages', `@${message.id}`, 'swipes', `@${swipe.id}`, 'content'], value: editing }], '编辑消息');
            setEditing(null);
        } catch (error) {
            reportError(error);
        }
    };
    const remove = async () => {
        try {
            await changeChat(chat.id, [{ op: 'unset', path: ['messages', `@${message.id}`] }], '删除消息');
        } catch (error) {
            reportError(error);
        }
    };
    const setSwipe = async (next: number) => {
        if (next >= message.swipes.length) {
            void runGeneration(chat.id, 'swipe');
            return;
        }
        await changeChat(chat.id, [{ op: 'set', path: ['messages', `@${message.id}`, 'activeSwipe'], value: Math.max(0, next) }]).catch(reportError);
    };

    return (
        <article className={`msg ${isUser ? 'msg-user' : 'msg-char'}${message.hidden ? ' msg-hidden' : ''}`}>
            {!isUser && <Avatar src={avatar} name={message.name} size={30} />}
            <div className="msg-main">
                {!isUser && <div className="msg-name">{message.name}{message.hidden && <span className="tag">不发送</span>}</div>}
                {reasoning && (
                    <details className="reasoning" open={Boolean(live && !live.text)}>
                        <summary>{live && !live.text ? '思考中…' : '思考过程'}</summary>
                        <div className="reasoning-body">{reasoning}</div>
                    </details>
                )}
                <div className="msg-body">
                    {editing !== null ? (
                        <div className="msg-edit">
                            <AutoTextarea value={editing} onChange={e => setEditing(e.target.value)} minRows={4} autoFocus
                                onKeyDown={e => {
                                    if (e.key === 'Escape') setEditing(null);
                                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void saveEdit();
                                }} />
                            <div className="row-end">
                                <Button variant="ghost" onClick={() => setEditing(null)}>取消</Button>
                                <Button variant="primary" onClick={() => void saveEdit()}>保存</Button>
                            </div>
                        </div>
                    ) : live && !raw ? (
                        <div className="typing"><span /><span /><span /></div>
                    ) : (
                        <Rendered text={text} vars={vars} />
                    )}
                    {live?.finalizing && <div className="msg-note delayed">回复已完成，正在整理（例如更新变量）…</div>}
                    {swipe?.finish === 'error' && !live && <div className="msg-error">生成失败：{swipe.error}</div>}
                    {swipe?.finish === 'aborted' && !live && <div className="msg-note">已中止</div>}
                    {swipe?.finish === 'length' && !live && <div className="msg-note">达到长度上限，可以点「继续」</div>}
                </div>
                {editing === null && !live && (
                    <div className={`msg-actions${isLast ? ' sticky' : ''}`}>
                        {!isUser && message.swipes.length > 1 || (!isUser && isLast) ? (
                            <span className="swipes">
                                <IconButton icon="left" label="上一个版本" size={14} disabled={busy || message.activeSwipe === 0} onClick={() => void setSwipe(message.activeSwipe - 1)} />
                                <span className="swipe-count">{message.activeSwipe + 1}/{message.swipes.length}</span>
                                <IconButton icon="right" label={message.activeSwipe === message.swipes.length - 1 && isLast ? '生成新版本' : '下一个版本'} size={14}
                                    disabled={busy || (message.activeSwipe === message.swipes.length - 1 && !isLast)} onClick={() => void setSwipe(message.activeSwipe + 1)} />
                            </span>
                        ) : null}
                        <IconButton icon="copy" label="复制" size={14} onClick={() => { void navigator.clipboard.writeText(swipe.content); toast('已复制'); }} />
                        <IconButton icon="edit" label="编辑" size={14} disabled={busy} onClick={() => setEditing(swipe.content)} />
                        {!isUser && isLast && <IconButton icon="refresh" label="重新生成" size={14} disabled={busy} onClick={() => void runGeneration(chat.id, 'regenerate')} />}
                        {!isUser && isLast && <IconButton icon="forward" label="继续写" size={14} disabled={busy} onClick={() => void runGeneration(chat.id, 'continue')} />}
                        <IconButton icon="trash" label="删除" size={14} tone="danger" disabled={busy} onClick={() => void remove()} />
                    </div>
                )}
            </div>
        </article>
    );
}

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
                maxHeight={260}
                placeholder="输入消息，Enter 发送，Shift+Enter 换行；留空直接发送会让角色继续说"
                onChange={e => setText(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        send();
                    }
                }}
            />
            {busy
                ? <button className="send-btn stop" onClick={() => void stopGeneration()} aria-label="停止"><Icon name="stop" size={16} /></button>
                : <button className="send-btn" onClick={send} aria-label="发送"><Icon name="send" size={16} /></button>}
        </div>
    );
}

export function ChatView() {
    const activeChatId = useAppState(s => s.activeChatId);
    const chat = useAppState(s => (s.activeChatId ? s.chats[s.activeChatId] : undefined));
    const context = useAppState(s => (s.activeChatId ? s.contexts[s.activeChatId] : undefined));
    const streaming = useAppState(s => s.streaming);
    const inspector = useAppState(s => s.inspector);
    const boot = useAppState(s => s.boot);
    const scroller = useRef<HTMLDivElement>(null);
    const stick = useRef(true);
    const character = boot?.resources.character.find(c => c.id === chat?.characterId);

    useLayoutEffect(() => {
        const el = scroller.current;
        if (el && stick.current) el.scrollTop = el.scrollHeight;
    }, [chat?.messages, streaming?.text, streaming?.reasoning, activeChatId]);

    if (!activeChatId || !chat) {
        return (
            <main className="chat-view">
                <div className="welcome">
                    <div className="welcome-mark" aria-hidden="true" />
                    <h1>欢迎来到 Hearth</h1>
                    <p>把酒馆的角色卡（PNG / JSON）、世界书或预设拖进窗口就能导入，然后在左侧选一个角色开始对话。</p>
                    <div className="welcome-steps">
                        <div><b>1</b>在「设置 → 模型连接」填写接口地址、密钥和模型</div>
                        <div><b>2</b>导入角色卡；常用的酒馆预设在「设置 → 预设」里导入和开关</div>
                        <div><b>3</b>选择角色开始聊天，右上角可以看到每次发给模型的完整提示词</div>
                    </div>
                    <div className="row-center">
                        <Button variant="primary" icon="upload" onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.multiple = true;
                            input.accept = '.png,.json';
                            input.onchange = () => input.files && void importFiles(input.files);
                            input.click();
                        }}>导入文件</Button>
                        <Button icon="settings" onClick={() => setState({ settingsOpen: true })}>模型连接</Button>
                    </div>
                </div>
            </main>
        );
    }

    const tab = (name: NonNullable<typeof inspector>) => setState({ inspector: inspector === name ? null : name });

    return (
        <main className="chat-view">
            <header className="chat-head">
                <Avatar src={character?.avatar} name={character?.name ?? '?'} size={28} />
                <div className="chat-title">
                    <span className="chat-title-name">{character?.name}</span>
                    <button className="chat-title-sub preset-link" title="管理预设" onClick={() => setState({ settingsOpen: true, settingsSection: 'preset' })}>
                        预设：{context?.preset.name ?? ''}
                    </button>
                </div>
                <span className="grow" />
                <IconButton icon="layers" label="提示词追踪" active={inspector === 'prompt'} onClick={() => tab('prompt')} />
                <IconButton icon="braces" label="变量" active={inspector === 'state'} onClick={() => tab('state')} />
                <IconButton icon="user" label="角色卡" active={inspector === 'character'} onClick={() => tab('character')} />
                <IconButton icon="book" label="世界书" active={inspector === 'lore'} onClick={() => tab('lore')} />
                <IconButton icon="sliders" label="预设" active={inspector === 'preset'} onClick={() => tab('preset')} />
                <IconButton icon="history" label="修改历史" active={inspector === 'history'} onClick={() => tab('history')} />
            </header>
            <div className="messages" ref={scroller} onScroll={e => {
                const el = e.currentTarget;
                stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}>
                <div className="messages-inner">
                    {!chat.messages.length && <Empty title="开始对话吧">这个角色没有开场白，发一句话开始。</Empty>}
                    {chat.messages.map((m, i) => (
                        <MessageView key={m.id} chat={chat} message={m} index={i} isLast={i === chat.messages.length - 1}
                            context={context} streaming={streaming?.chatId === chat.id ? streaming : null} avatar={character?.avatar} />
                    ))}
                </div>
            </div>
            <div className="composer-wrap">
                <Composer key={chat.id} chatId={chat.id} />
            </div>
        </main>
    );
}

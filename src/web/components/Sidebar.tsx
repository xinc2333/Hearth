import { useMemo, useRef, useState } from 'react';

import { api, type Summary } from '../api.ts';
import { Icon } from '../icons.tsx';
import { newChat, openChat, refresh, reportError, setState, toast, useAppState } from '../state.ts';
import { Avatar, IconButton, timeAgo } from './common.tsx';

const KIND_LABEL: Record<string, string> = { character: '角色卡', lorebook: '世界书', preset: '预设', persona: '用户角色', chat: '对话' };

export async function importFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
        try {
            const { created } = await api.importFile(file);
            toast(`已导入 ${created.map(c => `${KIND_LABEL[c.kind]}「${c.name}」`).join('、')}`, 'success');
        } catch (error) {
            toast(`${file.name}：${(error as Error).message}`, 'error');
        }
    }
    await refresh();
}

export function Sidebar() {
    const boot = useAppState(s => s.boot);
    const activeChatId = useAppState(s => s.activeChatId);
    const [query, setQuery] = useState('');
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const fileRef = useRef<HTMLInputElement>(null);

    const chatsByCharacter = useMemo(() => {
        const map: Record<string, Summary[]> = {};
        for (const chat of boot?.resources.chat ?? []) {
            (map[chat.characterId ?? ''] ??= []).push(chat);
        }
        return map;
    }, [boot]);

    const activeCharacterId = boot?.resources.chat.find(c => c.id === activeChatId)?.characterId;
    const characters = (boot?.resources.character ?? [])
        .filter(c => !query || c.name.toLowerCase().includes(query.toLowerCase()) || c.tags?.some(t => t.includes(query)))
        .sort((a, b) => {
            const la = chatsByCharacter[a.id]?.[0]?.updatedAt ?? a.updatedAt;
            const lb = chatsByCharacter[b.id]?.[0]?.updatedAt ?? b.updatedAt;
            return lb - la;
        });
    const connection = boot?.settings.connections.find(c => c.id === boot.settings.connectionId);

    const openCharacter = (c: Summary) => {
        const chats = chatsByCharacter[c.id];
        setExpanded(e => ({ ...e, [c.id]: true }));
        if (chats?.length) void openChat(chats[0].id).catch(reportError);
        else void newChat(c.id).catch(reportError);
    };

    return (
        <aside className="sidebar">
            <div className="brand">
                <span className="brand-mark" aria-hidden="true" />
                <span className="brand-name">Hearth</span>
                <span className="grow" />
                <button className="import-btn" title="导入角色卡、世界书或预设（也可以直接把文件拖进窗口）" onClick={() => fileRef.current?.click()}>
                    <Icon name="upload" size={14} /> 导入
                </button>
                <input ref={fileRef} type="file" accept=".png,.json,.charx" multiple hidden onChange={e => {
                    if (e.target.files?.length) void importFiles(e.target.files);
                    e.target.value = '';
                }} />
            </div>

            <div className="search">
                <Icon name="search" size={14} />
                <input placeholder="搜索角色" value={query} onChange={e => setQuery(e.target.value)} />
            </div>

            <nav className="char-list" aria-label="角色">
                {!characters.length && (
                    <div className="sidebar-empty">
                        <p>还没有角色</p>
                        <button className="link" onClick={() => fileRef.current?.click()}>导入一张角色卡</button>
                    </div>
                )}
                {characters.map(c => {
                    const chats = chatsByCharacter[c.id] ?? [];
                    const isOpen = expanded[c.id] ?? c.id === activeCharacterId;
                    return (
                        <div key={c.id} className={`char-group${c.id === activeCharacterId ? ' current' : ''}`}>
                            <div className="char-row" role="button" tabIndex={0} onClick={() => openCharacter(c)} onKeyDown={e => e.key === 'Enter' && openCharacter(c)}>
                                <Avatar src={c.avatar} name={c.name} size={28} />
                                <span className="char-name">{c.name}</span>
                                {chats.length > 0 && (
                                    <button className="chev" aria-label={isOpen ? '收起' : '展开'} onClick={e => { e.stopPropagation(); setExpanded(x => ({ ...x, [c.id]: !isOpen })); }}>
                                        <Icon name={isOpen ? 'left' : 'right'} size={13} className={isOpen ? 'rot-down' : ''} />
                                    </button>
                                )}
                            </div>
                            {isOpen && (
                                <div className="chat-list">
                                    {chats.map(chat => (
                                        <button key={chat.id} className={`chat-row${chat.id === activeChatId ? ' active' : ''}`} onClick={() => void openChat(chat.id).catch(reportError)}>
                                            <span className="chat-preview">{chat.preview?.replace(/[*_#>`]/g, '').trim() || '（空）'}</span>
                                            <span className="chat-meta">{timeAgo(chat.updatedAt)} · {chat.messages} 条</span>
                                        </button>
                                    ))}
                                    <button className="chat-row new" onClick={() => void newChat(c.id).catch(reportError)}>
                                        <Icon name="plus" size={13} /> 新对话
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>

            <footer className="sidebar-foot">
                <button className="conn-pill" onClick={() => setState({ settingsOpen: true })} title="模型连接">
                    <span className={`status-dot${connection?.hasKey || connection?.baseUrl ? ' ok' : ''}`} />
                    <span className="conn-text">{connection ? connection.model || connection.name : '未连接模型'}</span>
                </button>
                <IconButton icon="settings" label="设置" onClick={() => setState({ settingsOpen: true })} />
            </footer>
        </aside>
    );
}

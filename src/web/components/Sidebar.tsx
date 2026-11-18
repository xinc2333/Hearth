import { useMemo, useState } from 'react';

import { api, type Summary } from '../api.ts';
import { Icon } from '../icons.tsx';
import { confirmAction, deleteChat, getState, newChat, openChat, refresh, reportError, setState, toast, toggleSidebar, useAppState } from '../state.ts';
import { Avatar, IconButton, timeAgo } from './common.tsx';
import { setGlobalPreset } from './PresetManager.tsx';

const KIND_LABEL: Record<string, string> = { character: '角色卡', lorebook: '世界书', preset: '预设', persona: '用户角色', chat: '对话' };

export async function importFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
        try {
            const { created } = await api.importFile(file);
            // Presets are managed in Settings only; one dropped on the window is taken in like there.
            const preset = created.find(c => c.kind === 'preset');
            if (preset) await setGlobalPreset(preset.id);
            toast(`已导入 ${created.map(c => `${KIND_LABEL[c.kind]}「${c.name}」`).join('、')}${preset ? '，并设为当前预设' : ''}`, 'success');
        } catch (error) {
            toast(`${file.name}：${(error as Error).message}`, 'error');
        }
    }
    await refresh();
}

/** Opens the system file picker for cards and lorebooks (a preset is taken too). */
export function pickImportFiles() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.png,.json,.charx';
    input.onchange = () => input.files?.length && void importFiles(input.files);
    input.click();
}

/** Opens a character's most recent chat, or starts one. */
export function openCharacter(characterId: string) {
    const chats = (getState().boot?.resources.chat ?? []).filter(c => c.characterId === characterId);
    if (chats.length) void openChat(chats[0].id).catch(reportError);
    else void newChat(characterId).catch(reportError);
}

export const chatPreview = (chat: Summary) => chat.preview?.replace(/[*_#>`]/g, '').trim() || '（还没有内容）';

export function Sidebar() {
    const boot = useAppState(s => s.boot);
    const activeChatId = useAppState(s => s.activeChatId);
    const open = useAppState(s => s.sidebarOpen);
    const [query, setQuery] = useState('');
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const chatsByCharacter = useMemo(() => {
        const map: Record<string, Summary[]> = {};
        for (const chat of boot?.resources.chat ?? []) {
            (map[chat.characterId ?? ''] ??= []).push(chat);
        }
        return map;
    }, [boot]);

    if (!open) return null;

    const activeCharacterId = boot?.resources.chat.find(c => c.id === activeChatId)?.characterId;
    const characters = (boot?.resources.character ?? [])
        .filter(c => !query || c.name.toLowerCase().includes(query.toLowerCase()) || c.tags?.some(t => t.includes(query)))
        .sort((a, b) => {
            const la = chatsByCharacter[a.id]?.[0]?.updatedAt ?? a.updatedAt;
            const lb = chatsByCharacter[b.id]?.[0]?.updatedAt ?? b.updatedAt;
            return lb - la;
        });
    const connection = boot?.settings.connections.find(c => c.id === boot.settings.connectionId);

    const removeChat = async (chat: Summary) => {
        const ok = await confirmAction({
            title: '删除这段对话？',
            body: `「${chatPreview(chat).slice(0, 40)}」共 ${chat.messages} 条消息，删除后无法恢复。`,
            confirm: '删除',
            danger: true,
        });
        if (ok) await deleteChat(chat.id).catch(reportError);
    };

    return (
        <>
            <div className="sidebar-scrim" onClick={toggleSidebar} />
            <aside className="sidebar">
                <div className="brand">
                    <span className="brand-mark" aria-hidden="true" />
                    <span className="brand-name">Hearth</span>
                    <span className="grow" />
                    <IconButton icon="upload" label="导入角色卡或世界书（也可以把文件拖进窗口）" onClick={pickImportFiles} />
                    <IconButton icon="sidebar" label="收起侧栏（Ctrl+B）" onClick={toggleSidebar} />
                </div>

                <div className="sidebar-tools">
                    <div className="search">
                        <Icon name="search" size={14} />
                        <input placeholder="搜索角色" value={query} onChange={e => setQuery(e.target.value)} />
                    </div>
                    <button className="kbd-btn" title="快速查找角色、对话和功能" onClick={() => setState({ paletteOpen: true })}><kbd>Ctrl</kbd><kbd>K</kbd></button>
                </div>

                <nav className="char-list" aria-label="角色">
                    {!characters.length && (
                        <div className="sidebar-empty">
                            <p>{query ? '没有找到这个角色' : '还没有角色'}</p>
                            {!query && <button className="link" onClick={pickImportFiles}>导入一张角色卡</button>}
                        </div>
                    )}
                    {characters.map(c => {
                        const chats = chatsByCharacter[c.id] ?? [];
                        const isOpen = expanded[c.id] ?? c.id === activeCharacterId;
                        return (
                            <div key={c.id} className={`char-group${c.id === activeCharacterId ? ' current' : ''}`}>
                                <div className="char-row" role="button" tabIndex={0}
                                    onClick={() => { setExpanded(e => ({ ...e, [c.id]: true })); openCharacter(c.id); }}
                                    onKeyDown={e => e.key === 'Enter' && openCharacter(c.id)}>
                                    <Avatar src={c.avatar} name={c.name} size={30} />
                                    <span className="char-name">{c.name}</span>
                                    {chats.length > 0 && (
                                        <button className={`chev${isOpen ? ' open' : ''}`} aria-label={isOpen ? '收起对话列表' : '展开对话列表'} onClick={e => { e.stopPropagation(); setExpanded(x => ({ ...x, [c.id]: !isOpen })); }}>
                                            <Icon name="chevron" size={13} />
                                        </button>
                                    )}
                                </div>
                                {isOpen && (
                                    <div className="chat-list">
                                        {chats.map(chat => (
                                            <div key={chat.id} className={`chat-row${chat.id === activeChatId ? ' active' : ''}`}>
                                                <button className="chat-open" onClick={() => void openChat(chat.id).catch(reportError)}>
                                                    <span className="chat-preview">{chatPreview(chat)}</span>
                                                    <span className="chat-meta">{chat.branch ? `分支自第 ${chat.branch.index} 条 · ` : ''}{timeAgo(chat.updatedAt)} · {chat.messages} 条</span>
                                                </button>
                                                <IconButton icon="trash" label="删除这段对话" size={13} tone="danger" onClick={() => void removeChat(chat)} />
                                            </div>
                                        ))}
                                        <button className="chat-new" onClick={() => void newChat(c.id).catch(reportError)}>
                                            <Icon name="plus" size={13} /> 新对话
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </nav>

                <footer className="sidebar-foot">
                    <button className="conn-pill" onClick={() => setState({ settingsOpen: true, settingsSection: 'connection' })} title="模型连接">
                        <span className={`status-dot${connection?.hasKey || connection?.baseUrl ? ' ok' : ''}`} />
                        <span className="conn-text">{connection ? connection.model || connection.name : '未连接模型'}</span>
                    </button>
                    <IconButton icon="settings" label="设置" onClick={() => setState({ settingsOpen: true })} />
                </footer>
            </aside>
        </>
    );
}

import { useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../api.ts';
import { Icon } from '../icons.tsx';
import {
    getState, newChat, openChat, refresh, reportError, setState, toggleInspector, toggleSidebar, useAppState, type InspectorTab,
} from '../state.ts';
import { Avatar, timeAgo } from './common.tsx';
import { chatPreview, openCharacter, pickImportFiles } from './Sidebar.tsx';

interface Command {
    id: string;
    group: string;
    label: string;
    detail?: string;
    /** Extra words the search matches. */
    keywords?: string;
    icon?: string;
    avatar?: { src?: string; name: string };
    shortcut?: string;
    run: () => void;
}

const PANELS: [InspectorTab, string, string][] = [
    ['prompt', '提示词追踪', 'layers'],
    ['state', '变量', 'braces'],
    ['character', '角色卡', 'user'],
    ['lore', '世界书', 'book'],
    ['history', '修改历史', 'history'],
];

/** Ctrl+K: one place to reach every character, chat and function from the keyboard. */
export function CommandPalette() {
    const open = useAppState(s => s.paletteOpen);
    const boot = useAppState(s => s.boot);
    const activeChatId = useAppState(s => s.activeChatId);
    const [query, setQuery] = useState('');
    const [index, setIndex] = useState(0);
    const list = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (open) {
            setQuery('');
            setIndex(0);
        }
    }, [open]);

    const commands = useMemo<Command[]>(() => {
        if (!open || !boot) return [];
        const characters = boot.resources.character;
        const chats = boot.resources.chat;
        const current = chats.find(c => c.id === activeChatId);
        const settings = (section: string) => () => setState({ settingsOpen: true, settingsSection: section });
        const theme = (value: 'system' | 'light' | 'dark') => () => void api.saveSettings({ theme: value }).then(refresh).catch(reportError);
        const out: Command[] = [];
        if (current?.characterId) {
            const id = current.characterId;
            out.push({ id: 'new-chat', group: '当前对话', label: '开始新对话', detail: characters.find(c => c.id === id)?.name, icon: 'plus', run: () => void newChat(id).catch(reportError) });
            for (const [tab, label, icon] of PANELS) {
                out.push({ id: `panel-${tab}`, group: '当前对话', label: `打开${label}`, keywords: '面板 panel', icon, run: () => getState().inspector !== tab && toggleInspector(tab) });
            }
        }
        for (const c of characters) {
            out.push({ id: `char-${c.id}`, group: '角色', label: c.name, detail: c.tags?.slice(0, 3).join(' · '), keywords: c.creator, avatar: { src: c.avatar, name: c.name }, run: () => openCharacter(c.id) });
        }
        for (const chat of chats.slice(0, 30)) {
            const owner = characters.find(c => c.id === chat.characterId);
            out.push({
                id: `chat-${chat.id}`, group: '对话', label: chatPreview(chat), detail: `${owner?.name ?? ''} · ${timeAgo(chat.updatedAt)}`, icon: 'chat',
                run: () => void openChat(chat.id).catch(reportError),
            });
        }
        out.push(
            { id: 'import', group: '功能', label: '导入角色卡或世界书', keywords: 'import 文件', icon: 'upload', run: pickImportFiles },
            { id: 'sidebar', group: '功能', label: '显示或收起侧栏', icon: 'sidebar', shortcut: 'Ctrl B', run: toggleSidebar },
            { id: 'set-conn', group: '功能', label: '设置：模型连接', keywords: 'api 密钥 接口', icon: 'settings', run: settings('connection') },
            { id: 'set-preset', group: '功能', label: '设置：预设', keywords: '导入预设', icon: 'settings', run: settings('preset') },
            { id: 'set-persona', group: '功能', label: '设置：用户角色', keywords: 'persona 我的名字', icon: 'settings', run: settings('persona') },
            { id: 'set-lore', group: '功能', label: '设置：世界书', icon: 'settings', run: settings('lore') },
            { id: 'set-look', group: '功能', label: '设置：阅读与外观', keywords: '字体 字号 主题 行距', icon: 'settings', run: settings('appearance') },
            { id: 'theme-light', group: '功能', label: '主题：浅色', icon: 'sun', run: theme('light') },
            { id: 'theme-dark', group: '功能', label: '主题：深色', icon: 'sun', run: theme('dark') },
            { id: 'theme-system', group: '功能', label: '主题：跟随系统', icon: 'sun', run: theme('system') },
        );
        return out;
    }, [open, boot, activeChatId]);

    const shown = useMemo(() => {
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        if (!words.length) return commands.filter(c => c.group !== '对话' || commands.length < 40).slice(0, 60);
        return commands.filter(c => {
            const hay = `${c.label} ${c.detail ?? ''} ${c.keywords ?? ''} ${c.group}`.toLowerCase();
            return words.every(w => hay.includes(w));
        }).slice(0, 60);
    }, [commands, query]);

    useEffect(() => {
        list.current?.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' });
    }, [index, shown]);

    if (!open) return null;
    const close = () => setState({ paletteOpen: false });
    const run = (command?: Command) => {
        if (!command) return;
        close();
        command.run();
    };
    const active = Math.min(index, shown.length - 1);

    return (
        <div className="palette-backdrop" onMouseDown={e => e.target === e.currentTarget && close()}>
            <div className="palette" role="dialog" aria-label="快速查找">
                <div className="palette-input">
                    <Icon name="search" size={16} />
                    <input autoFocus value={query} placeholder="查找角色、对话或功能…" spellCheck={false}
                        onChange={e => { setQuery(e.target.value); setIndex(0); }}
                        onKeyDown={e => {
                            if (e.nativeEvent.isComposing) return;
                            if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(Math.min(active + 1, shown.length - 1)); }
                            else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(Math.max(active - 1, 0)); }
                            else if (e.key === 'Enter') { e.preventDefault(); run(shown[active]); }
                            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
                        }} />
                    <kbd>Esc</kbd>
                </div>
                <div className="palette-list" ref={list}>
                    {!shown.length && <div className="palette-empty">没有找到「{query}」</div>}
                    {shown.map((c, i) => (
                        <div key={c.id}>
                            {(i === 0 || shown[i - 1].group !== c.group) && <div className="palette-group">{c.group}</div>}
                            <button className={`palette-item${i === active ? ' active' : ''}`} onMouseMove={() => i !== active && setIndex(i)} onClick={() => run(c)}>
                                {c.avatar ? <Avatar src={c.avatar.src} name={c.avatar.name} size={22} /> : <span className="palette-icon"><Icon name={c.icon ?? 'dot'} size={15} /></span>}
                                <span className="palette-label">{c.label}</span>
                                {c.detail && <span className="palette-detail">{c.detail}</span>}
                                {c.shortcut && <span className="palette-keys">{c.shortcut.split(' ').map(k => <kbd key={k}>{k}</kbd>)}</span>}
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

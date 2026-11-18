import { useEffect, useState } from 'react';

import { releaseUrl, type VersionInfo } from './api.ts';
import { Boundary } from './components/Boundary.tsx';
import { ChatView } from './components/ChatView.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import { Button, Modal } from './components/common.tsx';
import { Inspector } from './components/Inspector.tsx';
import { applyReading } from './components/Reading.tsx';
import { SettingsDialog } from './components/Settings.tsx';
import { importFiles, Sidebar } from './components/Sidebar.tsx';
import { getState, openChat, refresh, reportError, savePref, setState, toast, toggleInspector, toggleSidebar, useAppState, useReading } from './state.ts';

function Toasts() {
    const toasts = useAppState(s => s.toasts);
    return (
        <div className="toasts" role="status">
            {toasts.map(t => (
                <div key={t.id} className={`toast ${t.tone}`}>
                    <span>{t.text}</span>
                    {t.action && <button onClick={t.action.run}>{t.action.label}</button>}
                </div>
            ))}
        </div>
    );
}

function ConfirmDialog() {
    const request = useAppState(s => s.confirm);
    if (!request) return null;
    return (
        <Modal title={request.title} size="small" onClose={() => request.resolve(false)}>
            {request.body && <p className="confirm-body">{request.body}</p>}
            <div className="row-end">
                <Button variant="ghost" onClick={() => request.resolve(false)}>取消</Button>
                <Button variant={request.danger ? 'danger-solid' : 'primary'} autoFocus onClick={() => request.resolve(true)}>{request.confirm ?? '确定'}</Button>
            </div>
        </Modal>
    );
}

export function App() {
    const theme = useAppState(s => s.boot?.settings.theme ?? 'system');
    const inspector = useAppState(s => s.inspector);
    const sidebarOpen = useAppState(s => s.sidebarOpen);
    const hasChat = useAppState(s => Boolean(s.activeChatId && s.chats[s.activeChatId]));
    const ready = useAppState(s => Boolean(s.boot));
    const reading = useReading();
    const [dragging, setDragging] = useState(false);
    const [outdated, setOutdated] = useState(false);
    const update = useAppState(s => s.version?.update);
    const version = useAppState(s => s.version?.version);
    const waiting = update?.state === 'ready' || update?.state === 'installing';

    // The page always loads the newest files, but the background service keeps running the code it
    // started with. Tell the user when that service is older than what is installed. The desktop app
    // also reports its own update here: downloaded in the background, then installed by restarting
    // on its own while nobody is using Hearth. Once it is downloaded, follow closely so the notice
    // before the restart shows in time.
    useEffect(() => {
        const check = () => void fetch('/api/version')
            .then(r => (r.ok ? r.json() : null))
            .then((v: VersionInfo | null) => {
                setOutdated(!v || (Boolean(v.latest) && v.latest !== v.build));
                if (v) setState({ version: v });
            })
            .catch(() => {});
        check();
        const timer = setInterval(check, waiting ? 2_000 : 60_000);
        window.addEventListener('focus', check);
        return () => {
            clearInterval(timer);
            window.removeEventListener('focus', check);
        };
    }, [waiting]);

    // After an update, say once that Hearth was updated.
    useEffect(() => {
        if (!version) return;
        let seen: string | null = null;
        try {
            seen = localStorage.getItem('hearth.version');
            localStorage.setItem('hearth.version', version);
        } catch { /* ignore */ }
        if (seen && seen !== version) toast(`Hearth 已更新到 ${version}`, 'success', { label: '更新了什么', run: () => window.open(releaseUrl(version), '_blank', 'noreferrer') });
    }, [version]);

    useEffect(() => {
        void refresh().then(boot => {
            let last: string | null = null;
            try { last = localStorage.getItem('hearth.chat'); } catch { /* ignore */ }
            if (last && boot.resources.chat.some(c => c.id === last)) void openChat(last).catch(reportError);
            if (!boot.settings.connections.length) setState({ settingsOpen: true });
        }).catch(reportError);
    }, []);

    // The stylesheet only knows "light" and "dark"; "follow the system" is resolved here.
    useEffect(() => {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const apply = () => {
            document.documentElement.setAttribute('data-theme', theme === 'system' ? (media.matches ? 'dark' : 'light') : theme);
            savePref('theme', theme);
        };
        apply();
        media.addEventListener('change', apply);
        return () => media.removeEventListener('change', apply);
    }, [theme]);

    useEffect(() => applyReading(reading), [reading]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
            const key = e.key.toLowerCase();
            if (key === 'k') {
                e.preventDefault();
                setState(s => ({ paletteOpen: !s.paletteOpen }));
            } else if (key === 'b') {
                e.preventDefault();
                toggleSidebar();
            } else if (key === 'i' && getState().activeChatId) {
                e.preventDefault();
                toggleInspector();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    useEffect(() => {
        let depth = 0;
        const enter = (e: DragEvent) => {
            if (!e.dataTransfer?.types.includes('Files')) return;
            depth++;
            setDragging(true);
        };
        const leave = () => {
            depth = Math.max(0, depth - 1);
            if (!depth) setDragging(false);
        };
        const over = (e: DragEvent) => e.preventDefault();
        const drop = (e: DragEvent) => {
            e.preventDefault();
            depth = 0;
            setDragging(false);
            if (e.dataTransfer?.files.length) void importFiles(e.dataTransfer.files);
        };
        window.addEventListener('dragenter', enter);
        window.addEventListener('dragleave', leave);
        window.addEventListener('dragover', over);
        window.addEventListener('drop', drop);
        return () => {
            window.removeEventListener('dragenter', enter);
            window.removeEventListener('dragleave', leave);
            window.removeEventListener('dragover', over);
            window.removeEventListener('drop', drop);
        };
    }, []);

    return (
        <div className={`app${inspector && hasChat ? ' with-inspector' : ''}${sidebarOpen ? '' : ' no-sidebar'}`}>
            {ready ? (
                <>
                    <Boundary label="侧边栏"><Sidebar /></Boundary>
                    <Boundary label="对话"><ChatView /></Boundary>
                    <Boundary label="检查器"><Inspector /></Boundary>
                    <Boundary label="设置"><SettingsDialog /></Boundary>
                    <CommandPalette />
                    <ConfirmDialog />
                </>
            ) : <div className="boot">正在启动…</div>}
            {dragging && <div className="drop-overlay"><div>松开即可导入角色卡或世界书</div></div>}
            {outdated && (
                <div className="update-banner" role="alert">
                    Hearth 已经更新，但后台还在运行旧版本。请关闭黑色的命令行窗口，再重新双击 Start.bat。
                </div>
            )}
            {update?.state === 'installing' && (
                <div className="update-banner" role="status">正在重启 Hearth，完成更新到 {update.version}…</div>
            )}
            <Toasts />
        </div>
    );
}

import { useEffect, useState } from 'react';

import { Boundary } from './components/Boundary.tsx';
import { ChatView } from './components/ChatView.tsx';
import { Inspector } from './components/Inspector.tsx';
import { SettingsDialog } from './components/Settings.tsx';
import { importFiles, Sidebar } from './components/Sidebar.tsx';
import { openChat, refresh, reportError, setState, useAppState } from './state.ts';

function Toasts() {
    const toasts = useAppState(s => s.toasts);
    return (
        <div className="toasts" role="status">
            {toasts.map(t => <div key={t.id} className={`toast ${t.tone}`}>{t.text}</div>)}
        </div>
    );
}

export function App() {
    const theme = useAppState(s => s.boot?.settings.theme ?? 'system');
    const inspector = useAppState(s => s.inspector);
    const ready = useAppState(s => Boolean(s.boot));
    const [dragging, setDragging] = useState(false);
    const [outdated, setOutdated] = useState(false);

    // The page always loads the newest files, but the background service keeps running the code it
    // started with. Tell the user when that service is older than what is installed.
    useEffect(() => {
        const check = () => void fetch('/api/version')
            .then(r => (r.ok ? r.json() : null))
            .then((v: { build?: string; latest?: string } | null) => setOutdated(!v || (Boolean(v.latest) && v.latest !== v.build)))
            .catch(() => {});
        check();
        window.addEventListener('focus', check);
        return () => window.removeEventListener('focus', check);
    }, []);

    useEffect(() => {
        void refresh().then(boot => {
            let last: string | null = null;
            try { last = localStorage.getItem('hearth.chat'); } catch { /* ignore */ }
            if (last && boot.resources.chat.some(c => c.id === last)) void openChat(last).catch(reportError);
            if (!boot.settings.connections.length) setState({ settingsOpen: true });
        }).catch(reportError);
    }, []);

    useEffect(() => {
        if (theme === 'system') document.documentElement.removeAttribute('data-theme');
        else document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

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
        <div className={`app${inspector ? ' with-inspector' : ''}`}>
            {ready ? (
                <>
                    <Boundary label="侧边栏"><Sidebar /></Boundary>
                    <Boundary label="对话"><ChatView /></Boundary>
                    <Boundary label="检查器"><Inspector /></Boundary>
                    <Boundary label="设置"><SettingsDialog /></Boundary>
                </>
            ) : <div className="boot">正在启动…</div>}
            {dragging && <div className="drop-overlay"><div>松开即可导入角色卡、世界书或预设</div></div>}
            {outdated && (
                <div className="update-banner" role="alert">
                    Hearth 已经更新，但后台还在运行旧版本。请关闭黑色的命令行窗口，再重新双击 Start.bat。
                </div>
            )}
            <Toasts />
        </div>
    );
}

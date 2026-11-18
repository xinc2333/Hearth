// The desktop app: runs Hearth's server inside Electron and shows the page in Hearth's own window.
// No console window, no Node.js to install; updates come from GitHub Releases (updates.ts).

import { app, BrowserWindow, dialog, Menu, nativeTheme, net, screen, session, shell } from 'electron';
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { format } from 'node:util';

import { createHearth, listen, type Hearth } from '../server/app.ts';
import { copyData, findOldData } from './migrate.ts';
import { AppUpdates } from './updates.ts';

const APP_ID = 'io.github.xinc2333.hearth';
const DEFAULT_PORT = 8730;

app.setName('Hearth');
app.setPath('userData', path.join(app.getPath('appData'), 'Hearth'));
const userDir = app.getPath('userData');

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}
const dataDir = path.resolve(arg('data') ?? path.join(userDir, 'data'));

// ---------------------------------------------------------------------------------------------
// Log file: there is no console window, so everything the server prints goes to logs/hearth.log.
// ---------------------------------------------------------------------------------------------

const logDir = path.join(userDir, 'logs');
const logFile = path.join(logDir, 'hearth.log');
mkdirSync(logDir, { recursive: true });
try {
    if (statSync(logFile).size > 2 * 1024 * 1024) renameSync(logFile, path.join(logDir, 'hearth.old.log'));
} catch {
    // No log yet.
}
const logStream = createWriteStream(logFile, { flags: 'a' });
for (const level of ['log', 'info', 'warn', 'error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
        logStream.write(`${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${format(...args)}\n`);
        original(...args);
    };
}
const log = { info: console.info, warn: console.warn, error: console.error };
process.on('uncaughtException', error => console.error('未处理的错误：', error));
process.on('unhandledRejection', error => console.error('未处理的错误：', error));

// ---------------------------------------------------------------------------------------------
// Network: model requests go through Chromium's network stack, so the system proxy (and PAC
// scripts) apply like in a browser. HTTPS_PROXY / HTTP_PROXY still work as an override.
// ---------------------------------------------------------------------------------------------

async function useChromiumNetwork() {
    const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
    if (proxy) {
        await session.defaultSession.setProxy({ proxyRules: proxy.replace(/\/+$/, ''), proxyBypassRules: '<local>' });
        console.log(`使用代理：${proxy}`);
    }
    const nodeFetch = globalThis.fetch;
    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : null;
        // Requests to Hearth itself, and anything unusual, keep Node's own fetch.
        if (!url || !/^https?:/i.test(url) || /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\//i.test(url)) {
            return nodeFetch(input, init);
        }
        return net.fetch(url, init);
    }) as typeof fetch;
}

// ---------------------------------------------------------------------------------------------
// Window state (size, position, maximized) and the port, remembered between runs.
// ---------------------------------------------------------------------------------------------

interface WindowState {
    width: number;
    height: number;
    x?: number;
    y?: number;
    maximized?: boolean;
    port?: number;
}

const stateFile = path.join(userDir, 'window.json');

function loadState(): WindowState {
    const fallback: WindowState = { width: 1280, height: 860 };
    try {
        const saved = JSON.parse(readFileSync(stateFile, 'utf8')) as WindowState;
        const state = { ...fallback, ...saved };
        // Forget the position when it is no longer on any screen (a monitor was unplugged).
        if (state.x !== undefined && state.y !== undefined) {
            const visible = screen.getAllDisplays().some(({ workArea: a }) =>
                state.x! + 100 > a.x && state.x! < a.x + a.width - 100 && state.y! >= a.y - 10 && state.y! < a.y + a.height - 60);
            if (!visible) {
                delete state.x;
                delete state.y;
            }
        }
        return state;
    } catch {
        return fallback;
    }
}

function saveState(state: WindowState) {
    try {
        writeFileSync(stateFile, JSON.stringify(state));
    } catch (error) {
        console.warn('保存窗口位置失败：', error);
    }
}

// ---------------------------------------------------------------------------------------------
// First run: offer to bring over the data of the unzipped Hearth (Start.bat).
// ---------------------------------------------------------------------------------------------

async function prepareData() {
    if (existsSync(dataDir)) return;
    for (;;) {
        const { response } = await dialog.showMessageBox({
            type: 'question',
            title: 'Hearth',
            message: '欢迎使用 Hearth',
            detail: '如果你之前用过解压版的 Hearth（双击 Start.bat 启动的那种），可以把原来的对话、角色卡、预设和设置导入进来，原来的文件不会被改动。\n\n导入前请先关闭旧版 Hearth 的黑色窗口。',
            buttons: ['导入旧版数据…', '全新开始'],
            defaultId: 0,
            cancelId: 1,
            noLink: true,
        });
        if (response !== 0) return;
        const picked = await dialog.showOpenDialog({ title: '选择旧版 Hearth 所在的文件夹', properties: ['openDirectory'] });
        if (picked.canceled || !picked.filePaths[0]) continue;
        const found = findOldData(picked.filePaths[0]);
        if (!found) {
            await dialog.showMessageBox({
                type: 'warning',
                title: 'Hearth',
                message: '这个文件夹里没有找到 Hearth 的数据',
                detail: '请选择解压版 Hearth 所在的文件夹，也就是放着 Start.bat 和 data 文件夹的那个。',
                buttons: ['重新选择'],
            });
            continue;
        }
        try {
            copyData(found, dataDir);
            console.log(`已从 ${found} 导入数据`);
            await dialog.showMessageBox({
                type: 'info',
                title: 'Hearth',
                message: '导入完成',
                detail: `已经从「${found}」复制了全部数据。原来的文件没有改动，确认新版一切正常后，可以自己删掉旧版的文件夹。`,
                buttons: ['开始使用'],
            });
            return;
        } catch (error) {
            rmSync(dataDir, { recursive: true, force: true });
            console.error('导入数据失败：', error);
            dialog.showErrorBox('导入失败', `${error instanceof Error ? error.message : String(error)}\n\n可以重新选择，或者选「全新开始」。`);
        }
    }
}

// ---------------------------------------------------------------------------------------------
// The window.
// ---------------------------------------------------------------------------------------------

const SPLASH = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;height:100%;display:grid;place-items:center;font:14px system-ui,"Microsoft YaHei UI",sans-serif;
background:#fbfaf8;color:#8a8580}@media(prefers-color-scheme:dark){html,body{background:#181716;color:#8f8a84}}</style>
<p>Hearth 正在启动…</p>`;

let win: BrowserWindow | null = null;
let hearth: Hearth | null = null;
let baseUrl = '';

function isLocal(url: string): boolean {
    return Boolean(baseUrl) && (url === baseUrl || url.startsWith(`${baseUrl}/`));
}

function createWindow(state: WindowState) {
    const window = new BrowserWindow({
        width: state.width,
        height: state.height,
        x: state.x,
        y: state.y,
        minWidth: 640,
        minHeight: 480,
        title: 'Hearth',
        show: false,
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#181716' : '#fbfaf8',
        webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false },
    });
    if (state.maximized) window.maximize();
    window.once('ready-to-show', () => window.show());
    void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(SPLASH)}`);

    // Links to other sites open in the browser; Hearth's own pages may open in a new window.
    window.webContents.setWindowOpenHandler(({ url }) => {
        if (isLocal(url)) return { action: 'allow' };
        if (/^https?:/i.test(url)) void shell.openExternal(url);
        return { action: 'deny' };
    });
    window.webContents.on('will-navigate', (event, url) => {
        if (isLocal(url)) return;
        event.preventDefault();
        if (/^https?:/i.test(url)) void shell.openExternal(url);
    });

    // There is no menu bar, so the usual browser keys are wired up here.
    window.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return;
        const ctrl = input.control || input.meta;
        const key = input.key.toLowerCase();
        const contents = window.webContents;
        if (key === 'f12' || (ctrl && input.shift && key === 'i')) contents.toggleDevTools();
        else if (key === 'f5' || (ctrl && !input.shift && key === 'r')) contents.reload();
        else if (ctrl && (key === '=' || key === '+')) contents.setZoomLevel(Math.min(contents.getZoomLevel() + 0.5, 5));
        else if (ctrl && key === '-') contents.setZoomLevel(Math.max(contents.getZoomLevel() - 0.5, -3));
        else if (ctrl && key === '0') contents.setZoomLevel(0);
        else return;
        event.preventDefault();
    });

    let confirmed = false;
    window.on('close', event => {
        saveState({ ...window.getNormalBounds(), maximized: window.isMaximized(), port: state.port });
        if (confirmed || !hearth || !hearth.runtime.running()) return;
        event.preventDefault();
        void dialog.showMessageBox(window, {
            type: 'warning',
            title: 'Hearth',
            message: '还有回复正在生成',
            detail: '现在关闭的话，这条回复会停在当前位置。',
            buttons: ['关闭', '继续等待'],
            defaultId: 1,
            cancelId: 1,
            noLink: true,
        }).then(({ response }) => {
            if (response !== 0) return;
            confirmed = true;
            window.close();
        });
    });
    window.on('closed', () => {
        if (win === window) win = null;
    });
    return window;
}

async function startServer(state: WindowState, updates: AppUpdates): Promise<string> {
    hearth = await createHearth({ root: app.getAppPath(), dataDir, desktop: updates });
    let port: number;
    try {
        port = await listen(hearth.server, state.port ?? DEFAULT_PORT, '127.0.0.1');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error;
        // Another program has the port: take any free one and remember it, so the page's own
        // settings (stored per address) stay put next time.
        port = await listen(hearth.server, 0, '127.0.0.1');
    }
    state.port = port;
    const list = hearth.plugins.list();
    console.log(`Hearth ${hearth.version} 已启动：http://127.0.0.1:${port}`);
    console.log(`数据目录：${dataDir}`);
    if (list.length) console.log(`插件：${list.map(p => `${p.name} ${p.version}${p.error ? '（加载失败）' : p.enabled ? '' : '（已关闭）'}`).join('、')}`);
    return `http://127.0.0.1:${port}`;
}

// ---------------------------------------------------------------------------------------------
// Start and quit.
// ---------------------------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
    // Hearth is already open: that instance shows its window (second-instance below).
    app.quit();
} else {
    app.setAppUserModelId(APP_ID);
    Menu.setApplicationMenu(null);

    app.on('second-instance', () => {
        if (!win) return;
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
    });

    app.on('window-all-closed', () => app.quit());

    // Write every pending save before the process ends (closing, or restarting for an update).
    let stopped = false;
    app.on('before-quit', event => {
        if (stopped || !hearth) return;
        event.preventDefault();
        const running = hearth;
        void running.stop(0)
            .catch(error => console.error('保存数据失败：', error))
            .finally(() => {
                stopped = true;
                running.server.close();
                app.quit();
            });
    });

    void app.whenReady().then(async () => {
        try {
            console.log(`Hearth 桌面版 ${app.getVersion()}（Electron ${process.versions.electron}）`);
            await useChromiumNetwork();
            await prepareData();
            const state = loadState();
            win = createWindow(state);
            const updates = new AppUpdates(log, app.isPackaged);
            baseUrl = await startServer(state, updates);
            saveState({ ...state, port: state.port });
            await win?.loadURL(baseUrl);
            updates.start();
        } catch (error) {
            console.error('启动失败：', error);
            dialog.showErrorBox('Hearth 启动失败', `${error instanceof Error ? error.message : String(error)}\n\n详细记录在：${logFile}`);
            app.exit(1);
        }
    });
}

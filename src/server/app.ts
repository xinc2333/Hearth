// Builds a Hearth instance: the store, plugins, runtime and the HTTP server, without listening.
// The command line (main.ts) and the desktop app (src/desktop) both start Hearth through here.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defaultPreset } from '../core/compat/st-preset.ts';
import { registerApi } from './api.ts';
import { Router, serveFile } from './http.ts';
import { PluginUpdater } from './plugin-updates.ts';
import { PluginHost } from './plugins.ts';
import { Runtime } from './runtime.ts';
import { Store } from './store.ts';

/** The app's own update state, as the desktop app reports it to the page. */
export interface AppUpdateStatus {
    /** `installing`: Hearth is about to restart to install `version`. */
    state: 'idle' | 'checking' | 'latest' | 'downloading' | 'ready' | 'installing' | 'error';
    /** The new version (downloading or ready). */
    version?: string;
    /** Download progress, 0–100. */
    percent?: number;
    /** Bytes downloaded so far and in all (only the changed parts, when the update is differential). */
    transferred?: number;
    total?: number;
    bytesPerSecond?: number;
    error?: string;
    checkedAt?: number;
}

/** What the desktop app adds on top of the plain server. */
export interface DesktopShell {
    updateStatus(): AppUpdateStatus;
    checkForUpdates(): void;
    /** Quits, installs the downloaded update and starts the new version. */
    installUpdate(): void;
}

export interface HearthOptions {
    /** The folder with package.json, dist/web and plugins/. */
    root: string;
    dataDir: string;
    desktop?: DesktopShell;
    /** Called by POST /api/shutdown (a newer Hearth taking over the port). Absent: the request is refused. */
    onShutdown?: () => Promise<void>;
}

export interface Hearth {
    version: string;
    build: string;
    server: Server;
    store: Store;
    runtime: Runtime;
    plugins: PluginHost;
    /** Waits for running replies (up to `timeoutMs`) and writes every pending save. */
    stop(timeoutMs?: number): Promise<void>;
}

export function findRoot(from: string): string {
    let dir = path.dirname(from);
    for (let i = 0; i < 5; i++) {
        if (existsSync(path.join(dir, 'package.json'))) return dir;
        dir = path.dirname(dir);
    }
    return process.cwd();
}

// Identifies the server code: the bundle's own size and modification time. A running instance whose
// build differs from the file on disk is outdated (Hearth was updated while it kept running).
const selfFile = fileURLToPath(import.meta.url);
export function currentBuild(): string {
    try {
        const s = statSync(selfFile);
        return `${Math.round(s.mtimeMs)}-${s.size}`;
    } catch {
        return 'unknown';
    }
}

export async function createHearth(options: HearthOptions): Promise<Hearth> {
    const { root, dataDir, desktop } = options;
    const build = currentBuild();
    const webDir = path.join(root, 'dist', 'web');
    let version = '0.0.0';
    try {
        version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version ?? version;
    } catch {
        // Running without package.json (unusual); keep the placeholder.
    }

    const store = new Store(dataDir);
    store.load();
    if (!store.list('preset').length) {
        const preset = await store.create(defaultPreset(), 'system');
        await store.saveSettings({ presetId: preset.id });
    }

    // Built-in plugins ship with Hearth; installed plugins and downloaded updates live with the data,
    // so updating Hearth never removes them.
    const builtinPlugins = path.join(root, 'plugins');
    const installedPlugins = path.join(dataDir, 'plugins');
    const plugins = new PluginHost(store, version);
    await plugins.loadAll(builtinPlugins, installedPlugins);
    const runtime = new Runtime(store, plugins);
    plugins.completer = req => runtime.complete(req);
    plugins.sender = (body, signal) => runtime.send(body, signal);
    const updater = new PluginUpdater(plugins, installedPlugins, version, () => runtime.idle(120000));
    updater.setBuiltinDir(builtinPlugins);
    updater.schedule(id => store.settings.plugins?.[id]?.autoUpdate !== false);

    const router = new Router();
    registerApi(router, store, runtime, plugins, updater);
    router.get('/api/version', () => ({
        app: 'hearth',
        version,
        build,
        latest: currentBuild(),
        desktop: Boolean(desktop),
        update: desktop?.updateStatus() ?? null,
    }));
    router.post('/api/app-update/check', () => {
        if (!desktop) throw Object.assign(new Error('只有桌面版 Hearth 能自动更新'), { status: 400 });
        desktop.checkForUpdates();
        return desktop.updateStatus();
    });
    router.post('/api/app-update/install', () => {
        const state = desktop?.updateStatus().state;
        if (!desktop || (state !== 'ready' && state !== 'installing')) throw Object.assign(new Error('新版本还没有下载好'), { status: 409 });
        desktop.installUpdate();
        return { ok: true };
    });
    // Lets a newly started Hearth replace this instance (Start.bat after an update).
    router.post('/api/shutdown', async (_req, res) => {
        if (!options.onShutdown) {
            res.writeHead(409, { 'Content-Type': 'application/json' }).end('{"error":"desktop"}');
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
        await options.onShutdown();
    });

    const server = createServer(async (req, res) => {
        // Only same-machine pages may call the API.
        const origin = req.headers.origin;
        if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) {
            res.writeHead(403).end();
            return;
        }
        if (req.url?.startsWith('/api/')) {
            if (!(await router.handle(req, res))) {
                res.writeHead(404, { 'Content-Type': 'application/json' }).end('{"error":"not found"}');
            }
            return;
        }
        const url = new URL(req.url ?? '/', 'http://localhost');
        const file = path.join(webDir, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
        if (file.startsWith(webDir) && url.pathname !== '/' && serveFile(res, file, url.pathname.startsWith('/assets/'))) {
            return;
        }
        if (!serveFile(res, path.join(webDir, 'index.html'))) {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('界面还没有构建：请运行 npm run build');
        }
    });

    return {
        version,
        build,
        server,
        store,
        runtime,
        plugins,
        async stop(timeoutMs = 120000) {
            await runtime.idle(timeoutMs);
            await store.flushAll();
        },
    };
}

/** Listens on `port`; resolves with the port in use, or rejects (EADDRINUSE and other errors). */
export function listen(server: Server, port: number, host: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const onError = (error: Error) => {
            server.off('listening', onListening);
            reject(error);
        };
        const onListening = () => {
            server.off('error', onError);
            const address = server.address();
            resolve(typeof address === 'object' && address ? address.port : port);
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
    });
}

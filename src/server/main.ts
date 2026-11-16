import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defaultPreset } from '../core/compat/st-preset.ts';
import { registerApi } from './api.ts';
import { Router, serveFile } from './http.ts';
import { PluginUpdater } from './plugin-updates.ts';
import { PluginHost } from './plugins.ts';
import { Runtime } from './runtime.ts';
import { Store } from './store.ts';

function findRoot(): string {
    let dir = path.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 5; i++) {
        if (existsSync(path.join(dir, 'package.json'))) return dir;
        dir = path.dirname(dir);
    }
    return process.cwd();
}

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

// Identifies the server code: the bundle's own size and modification time. A running instance whose
// build differs from the file on disk is outdated (Hearth was updated while it kept running).
const selfFile = fileURLToPath(import.meta.url);
function currentBuild(): string {
    try {
        const s = statSync(selfFile);
        return `${Math.round(s.mtimeMs)}-${s.size}`;
    } catch {
        return 'unknown';
    }
}
const BUILD = currentBuild();

function portFree(port: number, host: string): Promise<boolean> {
    return new Promise(resolve => {
        const probe = createNetServer();
        probe.once('error', () => resolve(false));
        probe.listen(port, host, () => probe.close(() => resolve(true)));
    });
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function openWindow(url: string) {
    if (process.platform === 'win32') {
        // Edge "app" mode gives a chromeless desktop window; fall back to the default browser.
        const edge = spawn('cmd', ['/c', 'start', '""', 'msedge', `--app=${url}`], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true });
        edge.on('exit', code => {
            if (code) spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref();
        });
        edge.unref();
    } else {
        const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
        spawn(cmd, [url], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
    }
}

async function main() {
    const root = findRoot();
    const dataDir = path.resolve(arg('data') ?? path.join(root, 'data'));
    const port = Number(arg('port') ?? process.env.HEARTH_PORT ?? 8730);
    const host = arg('host') ?? '127.0.0.1';
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
    const updater = new PluginUpdater(plugins, installedPlugins, version, () => runtime.idle(120000));
    updater.setBuiltinDir(builtinPlugins);
    updater.schedule(id => store.settings.plugins?.[id]?.autoUpdate !== false);

    const router = new Router();
    registerApi(router, store, runtime, plugins, updater);
    router.get('/api/version', () => ({ app: 'hearth', version, build: BUILD, latest: currentBuild() }));
    // Lets a newly started Hearth replace this instance (Start.bat after an update).
    router.post('/api/shutdown', async (_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
        console.log('新版本 Hearth 正在接管，本窗口即将退出。');
        await runtime.idle(120000);
        await store.flushAll();
        process.exit(0);
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

    server.listen(port, host, () => {
        const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`;
        console.log(`Hearth ${version} 已启动：${url}`);
        console.log(`数据目录：${dataDir}`);
        const list = plugins.list();
        if (list.length) console.log(`插件：${list.map(p => `${p.name} ${p.version}${p.error ? '（加载失败）' : p.enabled ? '' : '（已关闭）'}`).join('、')}`);
        if (process.argv.includes('--open')) openWindow(url);
    });
    server.on('error', async (error: NodeJS.ErrnoException) => {
        if (error.code !== 'EADDRINUSE') throw error;
        const url = `http://127.0.0.1:${port}`;
        const running = await fetch(`${url}/api/version`).then(r => (r.ok ? r.json() : null)).catch(() => null) as { app?: string; build?: string } | null;
        if (running?.app === 'hearth' && running.build === BUILD) {
            console.log('Hearth 已经在运行，直接打开窗口。');
            if (process.argv.includes('--open')) openWindow(url);
            setTimeout(() => process.exit(0), 1500);
            return;
        }
        if (running?.app === 'hearth') {
            console.log('发现正在运行的旧版本 Hearth，正在替换为新版本（如果它正在生成回复，会等生成结束）…');
            await fetch(`${url}/api/shutdown`, { method: 'POST' }).catch(() => null);
            for (let i = 0; i < 300 && !(await portFree(port, host)); i++) await sleep(500);
            server.listen(port, host);
            return;
        }
        console.log(`端口 ${port} 已被占用。`);
        console.log('如果之前打开过 Hearth，请先关闭那个黑色的命令行窗口，再重新双击 Start.bat。');
        process.exitCode = 1;
    });
}

void main();

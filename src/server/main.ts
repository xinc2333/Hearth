// Command-line start: `node dist/server.mjs [--open] [--data <dir>] [--port <n>] [--host <h>]`.
// Start.bat uses this when running Hearth from its source folder; the desktop app is src/desktop.

import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createHearth, findRoot, listen } from './app.ts';

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

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
    const root = findRoot(fileURLToPath(import.meta.url));
    const dataDir = path.resolve(arg('data') ?? path.join(root, 'data'));
    const port = Number(arg('port') ?? process.env.HEARTH_PORT ?? 8730);
    const host = arg('host') ?? '127.0.0.1';
    const open = process.argv.includes('--open');

    const hearth = await createHearth({
        root,
        dataDir,
        onShutdown: async () => {
            console.log('新版本 Hearth 正在接管，本窗口即将退出。');
            await hearth.stop();
            process.exit(0);
        },
    });
    const started = () => {
        const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`;
        console.log(`Hearth ${hearth.version} 已启动：${url}`);
        console.log(`数据目录：${dataDir}`);
        const list = hearth.plugins.list();
        if (list.length) console.log(`插件：${list.map(p => `${p.name} ${p.version}${p.error ? '（加载失败）' : p.enabled ? '' : '（已关闭）'}`).join('、')}`);
        if (open) openWindow(url);
    };

    try {
        await listen(hearth.server, port, host);
        started();
        return;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error;
    }
    const url = `http://127.0.0.1:${port}`;
    const running = await fetch(`${url}/api/version`).then(r => (r.ok ? r.json() : null)).catch(() => null) as { app?: string; build?: string; desktop?: boolean } | null;
    if (running?.app === 'hearth' && running.desktop) {
        console.log(`Hearth 桌面版正在使用端口 ${port}。如果要同时运行这一份，请在 Start.local.bat 里用 HEARTH_PORT 换一个端口。`);
        process.exitCode = 1;
        return;
    }
    if (running?.app === 'hearth' && running.build === hearth.build) {
        console.log('Hearth 已经在运行，直接打开窗口。');
        if (open) openWindow(url);
        setTimeout(() => process.exit(0), 1500);
        return;
    }
    if (running?.app === 'hearth') {
        console.log('发现正在运行的旧版本 Hearth，正在替换为新版本（如果它正在生成回复，会等生成结束）…');
        await fetch(`${url}/api/shutdown`, { method: 'POST' }).catch(() => null);
        for (let i = 0; i < 300 && !(await portFree(port, host)); i++) await sleep(500);
        await listen(hearth.server, port, host);
        started();
        return;
    }
    console.log(`端口 ${port} 已被占用。`);
    console.log('如果之前打开过 Hearth，请先关闭那个黑色的命令行窗口，再重新双击 Start.bat。');
    process.exitCode = 1;
}

void main();

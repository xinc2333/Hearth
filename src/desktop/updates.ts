// Updating Hearth itself: electron-updater reads the newest GitHub Release (latest.yml and the
// installer) and downloads it in the background. Hearth then restarts on its own to install it, as
// soon as that interrupts nobody (restart.ts); quitting before that installs it as well.

import electronUpdater from 'electron-updater';

import type { AppUpdateStatus, DesktopShell } from '../server/app.ts';
import { AutoRestart } from './restart.ts';

export interface Logger {
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
    debug?(...args: unknown[]): void;
}

const FIRST_CHECK_MS = 15_000;
const EVERY_MS = 6 * 3600_000;

function friendly(error: unknown): string {
    const text = error instanceof Error ? error.message : String(error);
    if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|net::ERR_|socket hang up|timeout/i.test(text)) {
        return '连不上 GitHub，请检查网络或代理';
    }
    if (/\b404\b|Cannot find latest\.yml|No published versions/i.test(text)) return '还没有找到可用的更新信息';
    return text.split('\n')[0].slice(0, 200);
}

export class AppUpdates implements DesktopShell {
    private status: AppUpdateStatus = { state: 'idle' };
    private started = false;
    private readonly testFeed = process.env.HEARTH_UPDATE_URL;
    private downloadStarted: number | null = null;
    private readonly log: Logger;
    private readonly packaged: boolean;
    private readonly enabled: boolean;

    /** `packaged`: an installed Hearth. Running from source only updates with a test feed. */
    constructor(log: Logger, packaged: boolean) {
        this.log = log;
        this.packaged = packaged;
        this.enabled = packaged || Boolean(this.testFeed);
    }

    /** Whether restarting now would interrupt nobody (see restart.ts). Unset: wait until Hearth quits. */
    canRestart: (() => Promise<boolean>) | null = null;
    /** Called right before Hearth quits to install the update. */
    beforeInstall: (() => void) | null = null;
    private autoRestart: AutoRestart | null = null;

    updateStatus(): AppUpdateStatus {
        return this.status;
    }

    private set(status: AppUpdateStatus) {
        this.status = status;
    }

    /** Hooks up electron-updater and schedules the checks. Call once the app is ready. */
    start() {
        if (this.started || !this.enabled) return;
        this.started = true;
        const updater = electronUpdater.autoUpdater;
        updater.logger = this.log;
        updater.autoDownload = true;
        updater.autoInstallOnAppQuit = true;
        updater.allowPrerelease = false;
        // For testing an update without publishing it: serve latest.yml and the installer from a folder.
        if (this.testFeed) {
            updater.setFeedURL({ provider: 'generic', url: this.testFeed });
            if (!this.packaged) updater.forceDevUpdateConfig = true;
        }
        updater.on('update-available', info => {
            this.set({ state: 'downloading', version: info.version, percent: 0 });
        });
        updater.on('download-progress', progress => {
            this.downloadStarted ??= Date.now();
            this.set({
                ...this.status,
                state: 'downloading',
                percent: Math.floor(progress.percent),
                transferred: progress.transferred,
                total: progress.total,
                bytesPerSecond: progress.bytesPerSecond,
            });
        });
        updater.on('update-not-available', () => {
            this.set({ state: 'latest', checkedAt: Date.now() });
        });
        updater.on('update-downloaded', info => {
            const { total, transferred } = this.status;
            const seconds = this.downloadStarted ? (Date.now() - this.downloadStarted) / 1000 : 0;
            const size = total ?? transferred;
            if (size && seconds) this.log.info(`下载更新 ${info.version}：${(size / 1048576).toFixed(1)} MB，用时 ${Math.round(seconds)} 秒，平均 ${(size / 1048576 / seconds).toFixed(2)} MB/s`);
            this.downloadStarted = null;
            this.set({ state: 'ready', version: info.version, checkedAt: Date.now() });
            this.log.info(`新版本 ${info.version} 已下载好，空闲时自动重启安装`);
            this.scheduleRestart();
        });
        updater.on('error', error => {
            this.log.warn('检查更新失败：', error);
            if (this.status.state !== 'ready' && this.status.state !== 'installing') this.set({ state: 'error', error: friendly(error), checkedAt: Date.now() });
        });
        setTimeout(() => this.checkForUpdates(), FIRST_CHECK_MS).unref();
        setInterval(() => this.checkForUpdates(), EVERY_MS).unref();
    }

    checkForUpdates() {
        if (!this.enabled) {
            this.set({ state: 'error', error: '从源码运行时不会自动更新', checkedAt: Date.now() });
            return;
        }
        if (!this.started || ['checking', 'downloading', 'ready', 'installing'].includes(this.status.state)) return;
        this.set({ state: 'checking' });
        electronUpdater.autoUpdater.checkForUpdates().catch(error => {
            // The 'error' event usually reports it as well; make sure the state does not stay "checking".
            if (this.status.state === 'checking') this.set({ state: 'error', error: friendly(error), checkedAt: Date.now() });
        });
    }

    private scheduleRestart() {
        const canRestart = this.canRestart;
        if (!canRestart || this.autoRestart) return;
        this.autoRestart = new AutoRestart({
            canRestart,
            announce: soon => {
                if (this.status.state === 'ready' || this.status.state === 'installing') this.set({ ...this.status, state: soon ? 'installing' : 'ready' });
            },
            restart: () => {
                this.log.info(`Hearth 空闲，重启安装 ${this.status.version}`);
                this.installUpdate();
            },
        });
        this.autoRestart.start();
    }

    installUpdate() {
        if (this.status.state !== 'ready' && this.status.state !== 'installing') return;
        this.autoRestart?.stop();
        this.set({ ...this.status, state: 'installing' });
        try {
            this.beforeInstall?.();
        } catch (error) {
            this.log.warn('记录窗口状态失败：', error);
        }
        // Silent install, then start the new version.
        setImmediate(() => electronUpdater.autoUpdater.quitAndInstall(true, true));
    }
}

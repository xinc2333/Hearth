// Updating Hearth itself: electron-updater reads the newest GitHub Release (latest.yml and the
// installer), downloads it in the background and installs it on restart or when Hearth closes.

import electronUpdater from 'electron-updater';

import type { AppUpdateStatus, DesktopShell } from '../server/app.ts';

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
    private readonly log: Logger;
    private readonly packaged: boolean;
    private readonly enabled: boolean;

    /** `packaged`: an installed Hearth. Running from source only updates with a test feed. */
    constructor(log: Logger, packaged: boolean) {
        this.log = log;
        this.packaged = packaged;
        this.enabled = packaged || Boolean(this.testFeed);
    }

    updateStatus(): AppUpdateStatus {
        return this.status;
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
            this.status = { state: 'downloading', version: info.version, percent: 0 };
        });
        updater.on('download-progress', progress => {
            this.status = { ...this.status, state: 'downloading', percent: Math.floor(progress.percent) };
        });
        updater.on('update-not-available', () => {
            this.status = { state: 'latest', checkedAt: Date.now() };
        });
        updater.on('update-downloaded', info => {
            this.status = { state: 'ready', version: info.version, checkedAt: Date.now() };
            this.log.info(`新版本 ${info.version} 已下载好，关闭 Hearth 时安装`);
        });
        updater.on('error', error => {
            this.log.warn('检查更新失败：', error);
            if (this.status.state !== 'ready') this.status = { state: 'error', error: friendly(error), checkedAt: Date.now() };
        });
        setTimeout(() => this.checkForUpdates(), FIRST_CHECK_MS).unref();
        setInterval(() => this.checkForUpdates(), EVERY_MS).unref();
    }

    checkForUpdates() {
        if (!this.enabled) {
            this.status = { state: 'error', error: '从源码运行时不会自动更新', checkedAt: Date.now() };
            return;
        }
        if (!this.started || ['checking', 'downloading', 'ready'].includes(this.status.state)) return;
        this.status = { state: 'checking' };
        electronUpdater.autoUpdater.checkForUpdates().catch(error => {
            // The 'error' event usually reports it as well; make sure the state does not stay "checking".
            if (this.status.state === 'checking') this.status = { state: 'error', error: friendly(error), checkedAt: Date.now() };
        });
    }

    installUpdate() {
        if (this.status.state !== 'ready') return;
        // Silent install, then start the new version.
        setImmediate(() => electronUpdater.autoUpdater.quitAndInstall(true, true));
    }
}

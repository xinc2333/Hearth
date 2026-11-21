// Installing and updating plugins from a link. A plugin folder on GitHub (or any web folder holding a
// manifest.json) is the unit: the manifest lists the plugin's files, which are downloaded next to it.
// Updates go to <data>/plugins/<id>; the copy they replace is kept in <data>/plugins/.previous/<id>
// and restored automatically if the new version fails to load.

import { existsSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { compareVersions, PluginHost, readManifest, satisfies, type PluginManifest } from './plugins.ts';

export interface UpdateStatus {
    checkedAt?: number;
    /** Newest version seen at the source. */
    latest?: string;
    error?: string;
    /** Version replaced by the last update, and when. */
    updatedFrom?: string;
    updatedAt?: number;
}

/**
 * Turns a plugin link into a function that resolves files in that folder. Accepted:
 *   https://github.com/owner/repo                        (repository root, default branch)
 *   https://github.com/owner/repo/tree/<branch>/<folder>
 *   https://raw.githubusercontent.com/owner/repo/<branch>/<folder>[/manifest.json]
 *   any https:// link to a folder or its manifest.json
 */
export function resolveSource(link: string): ((file: string) => string) | null {
    let url: URL;
    try {
        url = new URL(link.trim());
    } catch {
        return null;
    }
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && /^(127\.0\.0\.1|localhost)$/.test(url.hostname))) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    let base: string;
    if (url.hostname === 'github.com' && parts.length >= 2) {
        const [owner, repo, kind, ref, ...folder] = parts;
        const branch = kind === 'tree' || kind === 'blob' ? ref : 'HEAD';
        const dir = kind === 'tree' || kind === 'blob' ? folder.filter(p => p !== 'manifest.json') : [];
        base = `https://raw.githubusercontent.com/${owner}/${repo.replace(/\.git$/, '')}/${branch}/${dir.map(encodeURIComponent).join('/')}`;
    } else {
        base = `${url.origin}${url.pathname.replace(/\/manifest\.json$/, '')}`;
    }
    base = base.replace(/\/+$/, '');
    return file => `${base}/${file.split('/').map(encodeURIComponent).join('/')}`;
}

function safeFile(file: string): boolean {
    return typeof file === 'string' && Boolean(file) && !file.startsWith('/') && !file.includes('\\') && !file.split('/').some(p => p === '..' || p === '' || p === '.');
}

async function fetchText(url: string): Promise<string> {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) {
        throw new Error(res.status === 404 ? `找不到 ${url}（链接不对，或者仓库不是公开的）` : `下载失败（${res.status}）：${url}`);
    }
    return res.text();
}

export async function fetchManifest(link: string): Promise<{ manifest: PluginManifest; file: (name: string) => string }> {
    const file = resolveSource(link);
    if (!file) throw new Error('无法识别这个链接：请填写插件所在的 GitHub 文件夹链接');
    let manifest: PluginManifest;
    try {
        manifest = JSON.parse(await fetchText(file('manifest.json')));
    } catch (error) {
        if (error instanceof SyntaxError) throw new Error('链接里的 manifest.json 不是有效的 JSON');
        throw error;
    }
    if (!manifest?.id || !manifest.version) throw new Error('manifest.json 缺少 id 或 version');
    return { manifest, file };
}

export class PluginUpdater {
    readonly status = new Map<string, UpdateStatus>();
    private host: PluginHost;
    private dir: string;
    private hearthVersion: string;
    private waitIdle: () => Promise<void>;

    constructor(host: PluginHost, installedDir: string, hearthVersion: string, waitIdle: () => Promise<void>) {
        this.host = host;
        this.dir = installedDir;
        this.hearthVersion = hearthVersion;
        this.waitIdle = waitIdle;
    }

    /** Downloads a plugin into a staging folder and returns it. */
    private async download(manifest: PluginManifest, file: (name: string) => string): Promise<string> {
        const files = [...new Set(['manifest.json', manifest.main ?? 'server.mjs', ...(manifest.files ?? [])])];
        const bad = files.find(f => !safeFile(f));
        if (bad) throw new Error(`manifest.json 里的文件路径不安全：${bad}`);
        const staging = path.join(this.dir, '.staging', `${manifest.id}-${Date.now()}`);
        await mkdir(staging, { recursive: true });
        try {
            for (const name of files) {
                const target = path.join(staging, ...name.split('/'));
                await mkdir(path.dirname(target), { recursive: true });
                await writeFile(target, await fetchText(file(name)));
            }
            readManifest(staging);
            return staging;
        } catch (error) {
            await rm(staging, { recursive: true, force: true });
            throw error;
        }
    }

    /**
     * Puts a downloaded copy in place and loads it. If it does not load, the copy it replaced comes
     * back. Waits until no reply is being generated, so a hook never changes mid-generation.
     */
    private async activate(id: string, staging: string): Promise<{ ok: boolean; error?: string }> {
        await this.waitIdle();
        const target = path.join(this.dir, id);
        const previous = path.join(this.dir, '.previous', id);
        await rm(previous, { recursive: true, force: true });
        if (existsSync(target)) {
            await mkdir(path.dirname(previous), { recursive: true });
            await rename(target, previous);
        }
        await rename(staging, target);
        const info = await this.host.loadFolder(target, 'installed');
        if (!info.error) return { ok: true };
        await rm(target, { recursive: true, force: true });
        if (existsSync(previous)) {
            await rename(previous, target);
            await this.host.loadFolder(target, 'installed');
        } else {
            await this.reloadBuiltin(id);
        }
        return { ok: false, error: info.error };
    }

    private builtinDir: string | null = null;
    setBuiltinDir(dir: string) {
        this.builtinDir = dir;
    }

    private async reloadBuiltin(id: string) {
        if (!this.builtinDir) return;
        const found = PluginHost.scan([{ dir: this.builtinDir, source: 'builtin' }]).get(id);
        if (found?.[0]) await this.host.loadFolder(found[0].dir, 'builtin');
    }

    /** Checks one plugin's source; installs the newer version unless `apply` is false. */
    async update(id: string, apply = true): Promise<UpdateStatus> {
        const info = this.host.plugins.get(id);
        const status: UpdateStatus = { ...this.status.get(id), checkedAt: Date.now(), error: undefined };
        this.status.set(id, status);
        if (!info?.manifest.repository) {
            status.error = '这个插件没有提供更新地址';
            return status;
        }
        try {
            const { manifest, file } = await fetchManifest(info.manifest.repository);
            if (manifest.id !== id) throw new Error(`更新地址里的插件是 ${manifest.id}，不是 ${id}`);
            status.latest = manifest.version;
            if (!apply || compareVersions(manifest.version, info.manifest.version) <= 0) return status;
            if (!satisfies(this.hearthVersion, manifest.hearth)) {
                status.error = `新版本 ${manifest.version} 需要 Hearth ${manifest.hearth}，请先更新 Hearth`;
                return status;
            }
            const from = info.manifest.version;
            const result = await this.activate(id, await this.download(manifest, file));
            if (!result.ok) throw new Error(`新版本 ${manifest.version} 无法加载（${result.error}），已退回 ${from}`);
            Object.assign(status, { updatedFrom: from, updatedAt: Date.now() });
            console.log(`[plugins] ${id} 已从 ${from} 更新到 ${manifest.version}`);
        } catch (error) {
            status.error = (error as Error).message;
        }
        return status;
    }

    /** Installs a plugin from a link (or updates it, if a plugin with the same id exists). */
    async install(link: string): Promise<PluginManifest> {
        const { manifest, file } = await fetchManifest(link);
        if (!satisfies(this.hearthVersion, manifest.hearth)) throw new Error(`这个插件需要 Hearth ${manifest.hearth}，当前是 ${this.hearthVersion}`);
        const existing = this.host.plugins.get(manifest.id);
        if (existing && !existing.error && compareVersions(manifest.version, existing.manifest.version) < 0) {
            throw new Error(`已经装有更新的版本 ${existing.manifest.version}`);
        }
        const staging = await this.download(manifest, file);
        // Remember where it came from, so it can update itself later.
        const saved = readManifest(staging);
        if (!saved.repository) await writeFile(path.join(staging, 'manifest.json'), JSON.stringify({ ...saved, repository: link }, null, 2));
        const result = await this.activate(manifest.id, staging);
        if (!result.ok) throw new Error(`插件无法加载：${result.error}`);
        return manifest;
    }

    /** Removes an installed plugin or a downloaded update; a built-in copy, if any, takes over. */
    async remove(id: string) {
        await this.waitIdle();
        this.host.unload(id);
        await rm(path.join(this.dir, id), { recursive: true, force: true });
        await rm(path.join(this.dir, '.previous', id), { recursive: true, force: true });
        this.status.delete(id);
        await this.reloadBuiltin(id);
    }

    /** Updates every plugin whose automatic updates are on. */
    async updateAll(isAuto: (id: string) => boolean) {
        for (const info of [...this.host.plugins.values()]) {
            if (info.manifest.repository && isAuto(info.manifest.id)) await this.update(info.manifest.id);
        }
    }

    /** Checks every plugin that has a source: updates those whose automatic updates are on, only looks for the rest. */
    async checkAll(isAuto: (id: string) => boolean) {
        for (const info of [...this.host.plugins.values()]) {
            if (info.manifest.repository) await this.update(info.manifest.id, isAuto(info.manifest.id));
        }
    }

    /** Checks shortly after start, then every few hours. */
    schedule(isAuto: (id: string) => boolean, everyMs = 6 * 3600_000) {
        const run = () => void this.updateAll(isAuto).catch(error => console.warn('[plugins] 自动更新失败：', error));
        setTimeout(run, 20_000).unref();
        setInterval(run, everyMs).unref();
    }
}

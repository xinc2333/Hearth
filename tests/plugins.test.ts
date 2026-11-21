import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { evaluateMacros, createMacroContext } from '../src/core/macros.ts';
import { resolveSource, PluginUpdater } from '../src/server/plugin-updates.ts';
import { compareVersions, PluginHost, satisfies } from '../src/server/plugins.ts';

const work = mkdtempSync(path.join(tmpdir(), 'hearth-plugins-'));
after(() => rmSync(work, { recursive: true, force: true }));

function fakeStore() {
    return { settings: { plugins: {} as Record<string, { enabled?: boolean }> }, get: () => undefined, list: () => [], apply: async () => ({}) };
}

/** Writes a plugin folder whose macro `{{probe}}` returns `label`. */
function writePlugin(dir: string, version: string, label: string, opts: { broken?: boolean; hearth?: string; repository?: string } = {}) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
        id: 'probe', name: '探针', version, hearth: opts.hearth ?? '>=0.3.0', main: 'server.mjs', files: ['server.mjs'], repository: opts.repository,
    }));
    writeFileSync(path.join(dir, 'server.mjs'), opts.broken
        ? 'export default { setup() { throw new Error("坏了"); } };'
        : `export default { setup(api) { api.registerMacro('probe', () => ${JSON.stringify(label)}); api.onBeforeAssemble(() => {}); } };`);
}

const probe = () => evaluateMacros('{{probe}}', createMacroContext({ user: 'u', char: 'c' }));

test('versions: numeric comparison and simple ranges', () => {
    assert.equal(compareVersions('1.10.0', '1.9.3'), 1);
    assert.equal(compareVersions('0.3.0-dev', '0.3.0'), 0);
    assert.ok(satisfies('0.3.0', '>=0.3.0'));
    assert.ok(!satisfies('0.2.0', '>=0.3.0'));
    assert.ok(satisfies('1.2.0', '>=1.0.0 <2.0.0'));
    assert.ok(satisfies('9.9.9', undefined));
});

test('plugin links: GitHub folders, raw files and plain web folders', () => {
    assert.equal(resolveSource('https://github.com/a/b')!('manifest.json'), 'https://raw.githubusercontent.com/a/b/HEAD/manifest.json');
    assert.equal(resolveSource('https://github.com/a/b/tree/main/plugins/x')!('server.mjs'), 'https://raw.githubusercontent.com/a/b/main/plugins/x/server.mjs');
    assert.equal(resolveSource('https://raw.githubusercontent.com/a/b/dev/p/manifest.json')!('server.mjs'), 'https://raw.githubusercontent.com/a/b/dev/p/server.mjs');
    assert.equal(resolveSource('http://example.com/p'), null);
    assert.equal(resolveSource('not a link'), null);
});

test('host: newest compatible copy wins, switches gate hooks and macros', async () => {
    const builtin = path.join(work, 'h1', 'builtin');
    const installed = path.join(work, 'h1', 'installed');
    writePlugin(path.join(builtin, 'probe'), '1.0.0', 'builtin');
    writePlugin(path.join(installed, 'probe'), '1.1.0', 'installed');
    const store = fakeStore();
    const host = new PluginHost(store as never, '0.3.0');
    await host.loadAll(builtin, installed);
    assert.equal(host.plugins.get('probe')?.manifest.version, '1.1.0');
    assert.equal(probe(), 'installed');
    assert.equal(host.before.length, 1);

    store.settings.plugins.probe = { enabled: false };
    host.syncEnabled('probe');
    assert.equal(host.before.length, 0);
    assert.equal(probe(), '{{probe}}', 'a switched-off plugin leaves its macros as written');
    store.settings.plugins.probe = { enabled: true };
    host.syncEnabled('probe');
    assert.equal(probe(), 'installed');
    host.unload('probe');
});

test('host: a broken or incompatible update falls back to the built-in copy', async () => {
    const builtin = path.join(work, 'h2', 'builtin');
    const installed = path.join(work, 'h2', 'installed');
    writePlugin(path.join(builtin, 'probe'), '1.0.0', 'builtin');
    writePlugin(path.join(installed, 'probe'), '2.0.0', 'new', { broken: true });
    const host = new PluginHost(fakeStore() as never, '0.3.0');
    await host.loadAll(builtin, installed);
    assert.equal(host.plugins.get('probe')?.manifest.version, '1.0.0');
    assert.equal(host.plugins.get('probe')?.error, undefined);
    assert.equal(probe(), 'builtin');

    writePlugin(path.join(installed, 'probe'), '3.0.0', 'future', { hearth: '>=9.0.0' });
    await host.loadAll(builtin, installed);
    assert.equal(host.plugins.get('probe')?.manifest.version, '1.0.0');
    host.unload('probe');
});

test('updater: installs from a link, updates, rolls back a broken version, removes', async () => {
    const remote = path.join(work, 'remote');
    let server: Server | undefined;
    const port: number = await new Promise(resolve => {
        server = createServer((req, res) => {
            try {
                const file = path.join(remote, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname));
                res.end(readFileSync(file));
            } catch {
                res.writeHead(404).end();
            }
        }).listen(0, '127.0.0.1', () => resolve((server!.address() as { port: number }).port));
    });
    try {
        const link = `http://127.0.0.1:${port}/probe`;
        const builtin = path.join(work, 'h3', 'builtin');
        const installed = path.join(work, 'h3', 'installed');
        writePlugin(path.join(builtin, 'probe'), '1.0.0', 'builtin', { repository: link });
        const host = new PluginHost(fakeStore() as never, '0.3.0');
        await host.loadAll(builtin, installed);
        const updater = new PluginUpdater(host, installed, '0.3.0', async () => {});
        updater.setBuiltinDir(builtin);

        writePlugin(path.join(remote, 'probe'), '1.1.0', 'v1.1', { repository: link });
        assert.equal((await updater.update('probe', false)).latest, '1.1.0');
        assert.equal(probe(), 'builtin', 'checking alone does not install');
        await updater.checkAll(() => false);
        assert.equal(probe(), 'builtin', 'checking every plugin installs nothing whose automatic updates are off');
        await updater.checkAll(() => true);
        const ok = updater.status.get('probe')!;
        assert.equal(ok.error, undefined);
        assert.equal(ok.updatedFrom, '1.0.0');
        assert.equal(host.plugins.get('probe')?.manifest.version, '1.1.0');
        assert.equal(probe(), 'v1.1');

        writePlugin(path.join(remote, 'probe'), '1.2.0', 'v1.2', { broken: true, repository: link });
        const bad = await updater.update('probe');
        assert.match(bad.error ?? '', /无法加载.*已退回 1\.1\.0/);
        assert.equal(host.plugins.get('probe')?.manifest.version, '1.1.0');
        assert.equal(probe(), 'v1.1');

        await updater.remove('probe');
        assert.equal(host.plugins.get('probe')?.manifest.version, '1.0.0');
        assert.equal(host.plugins.get('probe')?.source, 'builtin');
        assert.equal(probe(), 'builtin');

        await assert.rejects(updater.install(`http://127.0.0.1:${port}/missing`), /找不到/);
        host.unload('probe');
    } finally {
        server?.close();
    }
});

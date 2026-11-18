// The desktop app's pieces that run without Electron: importing old data, and the shared server.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { copyData, findOldData } from '../src/desktop/migrate.ts';
import { createHearth, listen, type AppUpdateStatus } from '../src/server/app.ts';

function oldHearth(dir: string) {
    const data = path.join(dir, 'data');
    mkdirSync(path.join(data, 'chats'), { recursive: true });
    mkdirSync(path.join(data, 'plugins', '.staging', 'tabletop-1'), { recursive: true });
    mkdirSync(path.join(data, 'plugins', 'tabletop'), { recursive: true });
    writeFileSync(path.join(dir, 'Start.bat'), '@echo off');
    writeFileSync(path.join(data, 'settings.json'), '{"theme":"dark"}');
    writeFileSync(path.join(data, 'secrets.json'), '{}');
    writeFileSync(path.join(data, 'chats', 'c1.json'), '{"id":"c1"}');
    writeFileSync(path.join(data, 'plugins', 'tabletop', 'manifest.json'), '{}');
    writeFileSync(path.join(data, 'plugins', '.staging', 'tabletop-1', 'manifest.json'), '{}');
    return data;
}

test('desktop: old data is found from the Hearth folder, the data folder or the folder around it', async t => {
    const dir = await mkdtemp(path.join(tmpdir(), 'hearth-migrate-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const root = path.join(dir, 'Hearth-v0.4.0-windows');
    const data = oldHearth(root);

    assert.equal(findOldData(root), data);
    assert.equal(findOldData(data), data);
    assert.equal(findOldData(dir), data);
    mkdirSync(path.join(dir, 'empty'));
    assert.equal(findOldData(path.join(dir, 'empty')), null);
    assert.equal(findOldData(path.join(dir, 'missing')), null);
});

test('desktop: importing copies everything but unfinished plugin downloads, and never overwrites', async t => {
    const dir = await mkdtemp(path.join(tmpdir(), 'hearth-migrate-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const data = oldHearth(path.join(dir, 'old'));
    const target = path.join(dir, 'new', 'data');

    copyData(data, target);
    assert.equal(readFileSync(path.join(target, 'settings.json'), 'utf8'), '{"theme":"dark"}');
    assert.ok(existsSync(path.join(target, 'secrets.json')));
    assert.ok(existsSync(path.join(target, 'chats', 'c1.json')));
    assert.ok(existsSync(path.join(target, 'plugins', 'tabletop', 'manifest.json')));
    assert.ok(!existsSync(path.join(target, 'plugins', '.staging')));
    // The old folder is untouched.
    assert.ok(existsSync(path.join(data, 'plugins', '.staging', 'tabletop-1', 'manifest.json')));

    assert.throws(() => copyData(data, target), /已经存在/);
});

test('desktop: the server reports the app update and only the desktop app may install it', async t => {
    const dir = await mkdtemp(path.join(tmpdir(), 'hearth-desktop-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const root = path.resolve(import.meta.dirname, '..');

    let status: AppUpdateStatus = { state: 'idle' };
    let installed = 0;
    const desktop = await createHearth({
        root,
        dataDir: path.join(dir, 'desktop'),
        desktop: {
            updateStatus: () => status,
            checkForUpdates: () => { status = { state: 'checking' }; },
            installUpdate: () => { installed++; },
        },
    });
    const plain = await createHearth({ root, dataDir: path.join(dir, 'plain') });
    const desktopPort = await listen(desktop.server, 0, '127.0.0.1');
    const plainPort = await listen(plain.server, 0, '127.0.0.1');
    t.after(() => {
        desktop.server.close();
        plain.server.close();
    });
    const call = (port: number, method: string, url: string) =>
        fetch(`http://127.0.0.1:${port}${url}`, { method }).then(async r => ({ status: r.status, body: await r.json() as any }));

    const v = await call(desktopPort, 'GET', '/api/version');
    assert.equal(v.body.desktop, true);
    assert.deepEqual(v.body.update, { state: 'idle' });
    assert.equal((await call(plainPort, 'GET', '/api/version')).body.desktop, false);

    assert.equal((await call(desktopPort, 'POST', '/api/app-update/check')).body.state, 'checking');
    assert.equal((await call(desktopPort, 'POST', '/api/app-update/install')).status, 409);
    status = { state: 'ready', version: '9.9.9' };
    assert.equal((await call(desktopPort, 'POST', '/api/app-update/install')).status, 200);
    assert.equal(installed, 1);

    assert.equal((await call(plainPort, 'POST', '/api/app-update/check')).status, 400);
    assert.equal((await call(plainPort, 'POST', '/api/app-update/install')).status, 409);
    // Without a shutdown handler (the desktop app), another Hearth cannot take over the port.
    assert.equal((await call(desktopPort, 'POST', '/api/shutdown')).status, 409);
});

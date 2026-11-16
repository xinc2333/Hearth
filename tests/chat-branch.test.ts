// Ported from PR #1 (chat branches).
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { importCard } from '../src/core/compat/st-card.ts';
import { stateAt } from '../src/core/state.ts';
import type { Chat, ChatMessage } from '../src/core/types.ts';
import { registerApi } from '../src/server/api.ts';
import { Router } from '../src/server/http.ts';
import { PluginHost } from '../src/server/plugins.ts';
import { Runtime } from '../src/server/runtime.ts';
import { Store } from '../src/server/store.ts';

test('branching uses the selected reply version and preserves an independent timeline', async t => {
    const dir = await mkdtemp(path.join(tmpdir(), 'hearth-branch-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const store = new Store(dir);
    store.load();
    const plugins = new PluginHost(store);
    const runtime = new Runtime(store, plugins);
    const character = await store.create(importCard({ name: '向导' }, 'guide.json').character);
    const chat = await runtime.createChat(character.id);
    const target = { kind: 'chat' as const, id: chat.id };
    const user: ChatMessage = {
        id: 'user', role: 'user', name: '访客', activeSwipe: 0, hidden: false, createdAt: 1,
        swipes: [{ id: 'question', content: '往哪走？', createdAt: 1 }],
    };
    const reply: ChatMessage = {
        id: 'reply', role: 'assistant', name: '向导', activeSwipe: 1, hidden: false, createdAt: 2,
        swipes: [
            { id: 'north', content: '往北。', createdAt: 2, state: { direction: 'north' },
                chatState: { variables: { turn: 1 }, runtime: { timedLore: { sticky: {}, cooldown: {} } } } },
            { id: 'south', content: '往南。', createdAt: 3, state: { direction: 'south' } },
        ],
    };
    await store.apply({ target, author: 'user', ops: [
        { op: 'set', path: ['messages'], value: [user, reply, { ...user, id: 'later' }] },
        { op: 'set', path: ['variables'], value: { turn: 2 } },
    ] });

    const router = new Router();
    registerApi(router, store, runtime, plugins);
    const server = createServer((req, res) => void router.handle(req, res));
    t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const fork = (messageId: string, swipeId: string) => fetch(
        `http://127.0.0.1:${address.port}/api/chats/${chat.id}/messages/${messageId}/swipes/${swipeId}/branch`,
        { method: 'POST' },
    );
    assert.equal((await fork('user', 'question')).status, 404);
    assert.equal((await fork('reply', 'unknown')).status, 404);

    const response = await fork('reply', 'north');
    assert.equal(response.status, 200);
    const branch = await response.json() as Chat;
    assert.notEqual(branch.id, chat.id);
    assert.equal(branch.characterId, chat.characterId);
    assert.deepEqual(branch.branch, { chatId: chat.id, messageId: 'reply', swipeId: 'north', index: 2 });
    assert.deepEqual(branch.messages.map(m => m.id), ['user', 'reply']);
    assert.deepEqual(branch.messages[1].swipes.map(s => s.id), ['north']);
    assert.equal(branch.messages[1].activeSwipe, 0);
    assert.deepEqual(stateAt(branch.messages), { direction: 'north' });
    assert.deepEqual(branch.variables, { turn: 1 });
    assert.deepEqual(branch.runtime, reply.swipes[0].chatState?.runtime);

    const branchTarget = { kind: 'chat' as const, id: branch.id };
    await store.apply({ target: branchTarget, author: 'user', ops: [
        { op: 'set', path: ['messages', '@reply', 'swipes', '@north', 'content'], value: '继续往北。' },
    ] });
    const original = store.require<Chat>('chat', chat.id);
    assert.equal(original.messages.length, 3);
    assert.equal(original.messages[1].activeSwipe, 1);
    assert.equal(original.messages[1].swipes[0].content, '往北。');

    const legacy = await (await fork('reply', 'south')).json() as Chat;
    assert.deepEqual(legacy.variables, { turn: 2 });
    assert.deepEqual(legacy.runtime, {});
});

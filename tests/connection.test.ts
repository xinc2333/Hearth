// Model connections: Hearth works out by itself what an endpoint accepts, and keeps its model list.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { defaultPreset } from '../src/core/compat/st-preset.ts';
import type { Connection } from '../src/core/types.ts';
import { registerApi } from '../src/server/api.ts';
import { Router } from '../src/server/http.ts';
import { PluginHost } from '../src/server/plugins.ts';
import { GeminiThoughts, buildBody, listModels, sendChat, streamChat, type ChatRequest } from '../src/server/providers/openai.ts';
import { Runtime } from '../src/server/runtime.ts';
import { Store } from '../src/server/store.ts';

const readBody = (req: IncomingMessage) => new Promise<any>(resolve => {
    let text = '';
    req.on('data', c => { text += c; });
    req.on('end', () => resolve(text ? JSON.parse(text) : null));
});

/** An endpoint that refuses `name` on messages, like some relays and compatible APIs. */
async function strictEndpoint(t: { after: (fn: () => unknown) => void }) {
    const seen: any[] = [];
    const server = createServer(async (req, res) => {
        if (req.url?.endsWith('/models')) {
            res.writeHead(req.headers.authorization === 'Bearer good' ? 200 : 401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(req.headers.authorization === 'Bearer good'
                ? { data: [{ id: 'zeta' }, { id: 'alpha' }, { id: 'alpha' }] }
                : { error: { message: 'bad key' } }));
            return;
        }
        const body = await readBody(req);
        seen.push(body);
        if (body.messages.some((m: any) => 'name' in m)) {
            res.writeHead(400, { 'Content-Type': 'application/json' }).end('{"error":{"message":"Unknown name \\"name\\" at messages[1]"}}');
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }));
    });
    t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    return { url: `http://127.0.0.1:${address.port}/v1`, seen };
}

test('connection: an endpoint that rejects `name` gets the names in the text instead, and Hearth remembers', async t => {
    const endpoint = await strictEndpoint(t);
    const conn: Connection = { id: 'c', name: 'strict', provider: 'openai-compatible', baseUrl: endpoint.url, model: 'm', sendNames: true };
    const preset = defaultPreset();
    const req = {
        preset: { ...preset, context: { ...preset.context, stream: false } },
        names: { user: '旅人', char: '向导' },
        messages: [
            { role: 'system' as const, content: '开始' },
            { role: 'system' as const, content: '你好。', name: 'example_user' },
            { role: 'system' as const, content: '欢迎。', name: 'example_assistant' },
            { role: 'user' as const, content: '往哪走？' },
        ],
    };
    let learned = 0;
    const read = async (c: Connection) => {
        let text = '';
        for await (const ev of streamChat(c, 'k', req, new AbortController().signal, undefined, { onNamesRejected: () => { learned++; } })) {
            if (ev.type === 'text') text += ev.text;
        }
        return text;
    };

    assert.equal(await read(conn), 'ok');
    assert.equal(learned, 1);
    assert.equal(endpoint.seen.length, 2, 'one refused request, then the retry');
    assert.deepEqual(endpoint.seen[1].messages.map((m: any) => m.content), ['开始', '旅人: 你好。', '向导: 欢迎。', '往哪走？']);

    // Once known, the names are left out straight away.
    assert.equal(await read({ ...conn, sendNames: false }), 'ok');
    assert.equal(endpoint.seen.length, 3);
    assert.equal(learned, 1);
});

test('connection: what Hearth learned stays when the form is saved, resets with a new address; model lists are kept', async t => {
    const dir = await mkdtemp(path.join(tmpdir(), 'hearth-conn-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const endpoint = await strictEndpoint(t);
    const store = new Store(dir);
    store.load();
    const plugins = new PluginHost(store);
    const runtime = new Runtime(store, plugins);
    const router = new Router();
    registerApi(router, store, runtime, plugins);
    const server = createServer((req, res) => void router.handle(req, res));
    t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const call = async (url: string, body: unknown) => {
        const r = await fetch(`http://127.0.0.1:${address.port}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        return { status: r.status, body: await r.json() as any };
    };

    // Listing works before the connection is saved, with what the form holds.
    assert.equal((await call('/api/models', { baseUrl: endpoint.url, key: 'bad' })).status, 400);
    assert.deepEqual((await call('/api/models', { baseUrl: endpoint.url, key: 'good' })).body.models, ['alpha', 'zeta']);

    const saved = await call('/api/connections', { connection: { name: 'strict', baseUrl: endpoint.url, model: 'alpha' }, key: 'good', activate: true });
    const id = saved.body.connections[0].id as string;
    // With the saved key, and the list is kept on the connection.
    assert.deepEqual((await call('/api/models', { connectionId: id, baseUrl: endpoint.url })).body.models, ['alpha', 'zeta']);
    assert.deepEqual(store.settings.connections[0].models, ['alpha', 'zeta']);

    // A refused `name` turns sendNames off for this connection.
    runtime.providerHooks(store.settings.connections[0]).onNamesRejected?.();
    await new Promise(r => setTimeout(r, 50));
    assert.equal(store.settings.connections[0].sendNames, false);

    // Saving the form (which still says sendNames: true) does not undo it.
    await call('/api/connections', { connection: { ...saved.body.connections[0], model: 'zeta', sendNames: true } });
    assert.equal(store.settings.connections[0].sendNames, false);
    assert.equal(store.settings.connections[0].model, 'zeta');
    assert.deepEqual(store.settings.connections[0].models, ['alpha', 'zeta']);

    // Another address: learn again, and the old list is dropped.
    await call('/api/connections', { connection: { id, baseUrl: `${endpoint.url}/` } });
    assert.equal(store.settings.connections[0].sendNames, true);
    assert.equal(store.settings.connections[0].models, undefined);
});

test('connection: Gemini accepts its address in any common form and omits frequency_penalty', async t => {
    const base = 'https://generativelanguage.googleapis.com/v1beta/openai';
    const conn: Connection = { id: 'google', name: 'Gemini', provider: 'openai-compatible', baseUrl: `${base}/v1/`, model: 'models/gemini-test', sendNames: true };
    const req: ChatRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        preset: defaultPreset(),
        names: { user: 'User', char: 'Assistant' },
    };
    const fetchMock = t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
        assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer test-key');
        if (url.endsWith('/models')) return Response.json({ data: [{ id: conn.model }] });
        return Response.json({ choices: [{ message: { content: 'Hello' } }] });
    });
    const signal = new AbortController().signal;

    assert.deepEqual(await listModels(conn, 'test-key'), [conn.model]);
    const reply = [];
    for await (const ev of streamChat(conn, 'test-key', req, signal)) reply.push(ev);
    assert.deepEqual(reply[0], { type: 'text', text: 'Hello' });

    // The bare host or the native API path works too.
    assert.deepEqual(await listModels({ ...conn, baseUrl: 'https://generativelanguage.googleapis.com' }, 'test-key'), [conn.model]);
    assert.deepEqual(await listModels({ ...conn, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/' }, 'test-key'), [conn.model]);

    const prepared = { ...buildBody(conn, req, true), frequency_penalty: 0.5 };
    await sendChat({ ...conn, baseUrl: `${base}/chat/completions` }, 'test-key', prepared, signal);
    await sendChat({ ...conn, baseUrl: 'https://api.openai.com/v1' }, 'test-key', prepared, signal);

    assert.equal(fetchMock.mock.calls[0].arguments[0], `${base}/models`);
    assert.equal(fetchMock.mock.calls[2].arguments[0], `${base}/models`);
    assert.equal(fetchMock.mock.calls[3].arguments[0], `${base}/models`);
    const [streamed, gemini, openai] = [1, 4, 5].map(i => fetchMock.mock.calls[i]).map(call => {
        const [url, init] = call.arguments;
        assert.ok(typeof init?.body === 'string');
        return { url, body: JSON.parse(init.body) };
    });
    assert.equal(streamed.url, `${base}/chat/completions`);
    assert.equal(streamed.body.stream, true);
    assert.equal('frequency_penalty' in streamed.body, false);
    assert.equal(gemini.url, streamed.url);
    assert.equal(gemini.body.stream, false);
    assert.equal('frequency_penalty' in gemini.body, false);
    assert.equal(openai.body.frequency_penalty, 0.5);
});

test('connection: Gemini signs preset tool history and replays model signatures unchanged', async t => {
    const conn: Connection = {
        id: 'google', name: 'Gemini', provider: 'openai-compatible',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'models/gemini-4-hydrogen', sendNames: true,
    };
    const tool = { name: 'context', arguments: '{}' };
    const synthetic = { id: 'context-1', type: 'function', function: tool };
    const signed = {
        id: 'context-2', type: 'function', function: tool,
        extra_content: { google: { thought_signature: 'signature-from-google' } },
    };
    const fetchMock = t.mock.method(globalThis, 'fetch', async (_url: string, _init: RequestInit) =>
        Response.json({ choices: [{ message: { tool_calls: [signed] } }] }));
    const req: ChatRequest = {
        messages: [{ role: 'user', content: 'Hello' }], preset: defaultPreset(), names: { user: 'User', char: 'Assistant' },
    };
    const signal = new AbortController().signal;
    const { toolCalls } = await sendChat(conn, undefined, buildBody(conn, req, false), signal);
    const body = {
        ...buildBody(conn, req, true),
        messages: [...req.messages,
            { role: 'assistant', tool_calls: [synthetic, ...toolCalls] },
            { role: 'tool', tool_call_id: synthetic.id, content: '{}' },
            { role: 'tool', tool_call_id: signed.id, content: '{}' },
        ],
        tool_choice: 'required',
        toolConfig: { functionCallingConfig: { mode: 'ANY' } },
    };

    for await (const _ of streamChat(conn, undefined, req, signal, body)) { /* read the reply */ }
    await sendChat({ ...conn, baseUrl: 'https://api.openai.com/v1' }, undefined, body, signal);

    const [gemini, openai] = fetchMock.mock.calls.slice(1).map(call => JSON.parse(String(call.arguments[1]?.body)));
    assert.deepEqual(gemini.messages[1].tool_calls, [
        { ...synthetic, extra_content: { google: { thought_signature: 'skip_thought_signature_validator' } } }, signed,
    ]);
    assert.deepEqual(gemini.messages.slice(2), body.messages.slice(2));
    assert.equal(gemini.tool_choice, 'required');
    assert.equal('toolConfig' in gemini, false);
    assert.deepEqual(openai.messages, body.messages);
    assert.deepEqual(openai.toolConfig, body.toolConfig);
});

test('connection: Gemini receives every system message (it keeps only the last one it is sent)', async t => {
    const conn: Connection = { id: 'g', name: 'Gemini', provider: 'openai-compatible', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'models/gemini-3.8-flash', sendNames: true };
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ choices: [{ message: { content: 'ok' } }] }));
    const body = {
        model: conn.model,
        messages: [
            { role: 'system', content: '说明' },
            { role: 'system', content: '卡片全文' },
            { role: 'system', name: 'example_user', content: '你好' },
            { role: 'user', content: '开始' },
            { role: 'assistant', content: '好的' },
            { role: 'system', content: '深度注入' },
            { role: 'user', content: '继续' },
        ],
    };
    await sendChat(conn, 'k', body, new AbortController().signal, { user: '小明', char: '小红' });
    const sent = JSON.parse(String(fetchMock.mock.calls[0].arguments[1]?.body)).messages;
    assert.deepEqual(sent, [
        { role: 'system', content: '说明\n\n卡片全文\n\n小明: 你好' },
        { role: 'user', content: '开始' },
        { role: 'assistant', content: '好的' },
        { role: 'user', content: '深度注入' },
        { role: 'user', content: '继续' },
    ]);
    // Other endpoints get the messages as they are.
    await sendChat({ ...conn, baseUrl: 'https://api.openai.com/v1' }, 'k', body, new AbortController().signal);
    assert.equal(JSON.parse(String(fetchMock.mock.calls[1].arguments[1]?.body)).messages.length, 7);
});

test('connection: Gemini thought summaries become the reasoning, also when tags are split across chunks', async t => {
    const split = (chunks: string[]) => {
        const g = new GeminiThoughts();
        let reasoning = '', text = '';
        for (const c of [...chunks.map(c => g.push(c)), g.flush()]) { reasoning += c.reasoning; text += c.text; }
        return { reasoning, text };
    };
    assert.deepEqual(split(['<thought>想一想', '</thought>答案']), { reasoning: '想一想', text: '答案' });
    assert.deepEqual(split(['<tho', 'ught>想', '一想</tho', 'ught>\n答案']), { reasoning: '想一想', text: '答案' });
    assert.deepEqual(split(['直接回答，<thought> 不是开头']), { reasoning: '', text: '直接回答，<thought> 不是开头' });
    assert.deepEqual(split(['<']), { reasoning: '', text: '<' });

    // The request asks for thoughts when the preset shows them, and drops the penalties Gemini rejects.
    const conn: Connection = { id: 'g', name: 'Gemini', provider: 'openai-compatible', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'models/gemini-3.8-flash', sendNames: true };
    const preset = defaultPreset();
    preset.sampling.presencePenalty = 0.4;
    const req: ChatRequest = { messages: [{ role: 'user', content: '你好' }], preset, names: { user: 'U', char: 'C' } };
    assert.deepEqual(buildBody(conn, req, true).extra_body, { google: { thinking_config: { include_thoughts: true } } });
    assert.equal(buildBody({ ...conn, baseUrl: 'https://api.b.ai/v1' }, req, true).extra_body, undefined);
    preset.behavior.showThoughts = false;
    assert.equal(buildBody(conn, req, true).extra_body, undefined);
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ choices: [{ message: { content: '<thought>先想</thought>好的' } }] }));
    const out = await sendChat(conn, 'k', buildBody(conn, req, false), new AbortController().signal);
    assert.deepEqual([out.reasoning, out.text], ['先想', '好的']);
    assert.equal('presence_penalty' in JSON.parse(String(fetchMock.mock.calls[0].arguments[1]?.body)), false);
});

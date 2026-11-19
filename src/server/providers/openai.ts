// OpenAI-compatible Chat Completions provider (OpenAI, DeepSeek, OpenRouter, Gemini/Claude
// OpenAI-compatible endpoints, most relay services). Streams text and reasoning deltas.

import type { Connection, Preset, Role } from '../../core/types.ts';

export type StreamEvent =
    | { type: 'text'; text: string }
    | { type: 'reasoning'; text: string }
    | { type: 'done'; finish: 'stop' | 'length'; usage?: unknown };

export interface ChatRequest {
    messages: { role: Role; content: string; name?: string }[];
    preset: Preset;
    names: { user: string; char: string };
    /** Extra request fields contributed by the preset (e.g. its reply tool and tool_choice). */
    extra?: Record<string, unknown>;
}

const geminiBase = 'https://generativelanguage.googleapis.com/v1beta/openai';

function normalizeBase(url: string) {
    const base = url.trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
    // Google's own endpoint, whatever was pasted (the host, /v1beta, /v1beta/openai/v1…): Hearth
    // talks to its OpenAI-compatible address.
    try {
        if (new URL(base).hostname.toLowerCase() === 'generativelanguage.googleapis.com') return geminiBase;
    } catch { /* not a URL yet */ }
    return base;
}

/** Reports what Hearth learned about an endpoint while talking to it. */
export interface ProviderHooks {
    /** The endpoint refused messages with a `name` field; the request went through without them. */
    onNamesRejected?: () => void;
}

/** Tool and function results carry `name` as part of their own format; only chat messages count. */
function namedMessage(m: unknown): m is { role: string; name: string; content?: unknown } {
    const r = (m as { role?: unknown })?.role;
    return typeof (m as { name?: unknown })?.name === 'string' && r !== 'tool' && r !== 'function';
}

/** Prefixes example-dialogue names into content for endpoints that reject `name` (ST xAI converter). */
function stripNames<T>(messages: T[], names?: ChatRequest['names']): T[] {
    return messages.map(m => {
        if (!namedMessage(m)) return m;
        const { name, ...rest } = m as { role: string; name: string; content?: unknown };
        const content = rest.content;
        if (typeof content === 'string' && rest.role === 'system' && names) {
            const speaker = name === 'example_user' ? names.user : name === 'example_assistant' ? names.char : '';
            if (speaker && !content.startsWith(`${speaker}: `)) rest.content = `${speaker}: ${content}`;
        }
        return rest as T;
    });
}

function hasNames(body: Record<string, unknown>): boolean {
    return Array.isArray(body.messages) && body.messages.some(namedMessage);
}

function withoutNames(body: Record<string, unknown>, names?: ChatRequest['names']): Record<string, unknown> {
    return { ...body, messages: stripNames(body.messages as unknown[], names) };
}

type GeminiToolCall = { extra_content?: { google?: { thought_signature?: string } } };

function geminiToolMessages(messages: unknown) {
    if (!Array.isArray(messages)) return messages;
    return messages.map(message => {
        if (message?.role !== 'assistant' || !Array.isArray(message.tool_calls)) return message;
        const toolCalls = (message.tool_calls as GeminiToolCall[]).map(call => {
            const google = call?.extra_content?.google;
            if (!call || google?.thought_signature) return call;
            // Presets can construct tool history locally, where no model signature exists.
            return {
                ...call,
                extra_content: {
                    ...call.extra_content,
                    google: { ...google, thought_signature: 'skip_thought_signature_validator' },
                },
            };
        });
        return { ...message, tool_calls: toolCalls };
    });
}

/**
 * Posts to /chat/completions. SillyTavern sends example dialogue with OpenAI `name` fields, and
 * so does Hearth; some endpoints reject them. Then the request is sent once more with the names
 * written into the text, and the connection remembers it (`onNamesRejected`), so the user never
 * has to know about it.
 */
async function postChat(conn: Connection, key: string | undefined, body: Record<string, unknown>, signal: AbortSignal, names?: ChatRequest['names'], hooks?: ProviderHooks): Promise<Response> {
    const base = normalizeBase(conn.baseUrl);
    if (base.toLowerCase() === geminiBase) {
        // Use Chat Completions' tool_choice instead of the native Gemini toolConfig field.
        const { frequency_penalty: _frequency, toolConfig: _toolConfig, ...compatibleBody } = body;
        body = compatibleBody;
        if (/^(?:models\/)?gemini-[34](?:[.-]|$)/i.test(String(body.model ?? ''))) {
            body.messages = geminiToolMessages(body.messages);
        }
    }
    const send = (b: Record<string, unknown>) => fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: headers(conn, key),
        body: JSON.stringify(b),
        signal,
    });
    const named = hasNames(body);
    if (named && conn.sendNames === false) return send(withoutNames(body, names));
    const res = await send(body);
    if (res.ok || !named || (res.status !== 400 && res.status !== 422)) return res;
    const retry = await send(withoutNames(body, names));
    if (!retry.ok) {
        // Something else is wrong: report the original answer.
        void retry.body?.cancel().catch(() => {});
        return res;
    }
    void res.body?.cancel().catch(() => {});
    console.log(`接口 ${base} 不接受消息的 name 字段，以后改为把名字写进内容里`);
    hooks?.onNamesRejected?.();
    return retry;
}

export function buildBody(conn: Connection, req: ChatRequest, stream: boolean): Record<string, unknown> {
    const s = req.preset.sampling;
    const body: Record<string, unknown> = {
        model: conn.model,
        messages: conn.sendNames !== false ? req.messages : stripNames(req.messages, req.names),
        stream,
        temperature: s.temperature,
        top_p: s.topP,
        max_tokens: req.preset.context.maxTokens,
        frequency_penalty: s.frequencyPenalty,
        presence_penalty: s.presencePenalty,
    };
    if (s.seed >= 0) body.seed = s.seed;
    if (stream) body.stream_options = { include_usage: true };
    return { ...body, ...(req.extra ?? {}), ...(conn.extraBody ?? {}) };
}

function headers(conn: Pick<Connection, 'extraHeaders'>, key: string | undefined): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
        ...(conn.extraHeaders ?? {}),
    };
}

async function errorText(res: Response): Promise<string> {
    const text = await res.text().catch(() => '');
    try {
        const json = JSON.parse(text);
        const payload = Array.isArray(json) ? json[0] : json;
        const err = payload?.error ?? payload?.detail ?? payload;
        return typeof err === 'string' ? err : err?.message ?? JSON.stringify(err ?? json).slice(0, 500);
    } catch {
        return text.slice(0, 500) || res.statusText;
    }
}

/** `prepared`: the final request body (after plugins' request hooks); built from `req` when absent. */
export async function* streamChat(conn: Connection, key: string | undefined, req: ChatRequest, signal: AbortSignal, prepared?: Record<string, unknown>, hooks?: ProviderHooks): AsyncGenerator<StreamEvent> {
    const stream = prepared ? prepared.stream !== false : req.preset.context.stream;
    const res = await postChat(conn, key, prepared ?? buildBody(conn, req, stream), signal, req.names, hooks);
    if (!res.ok) {
        throw new Error(`接口返回 ${res.status}：${await errorText(res)}`);
    }
    const type = res.headers.get('content-type') ?? '';
    if (!stream || !type.includes('event-stream') || !res.body) {
        const json = await res.json() as Record<string, any>;
        if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
        const choice = json.choices?.[0] ?? {};
        const reasoning = choice.message?.reasoning_content ?? choice.message?.reasoning;
        if (reasoning) yield { type: 'reasoning', text: String(reasoning) };
        yield { type: 'text', text: String(choice.message?.content ?? choice.text ?? '') };
        for (const call of choice.message?.tool_calls ?? []) {
            yield { type: 'text', text: `\n<|tool_call|>${call.function?.name ?? ''}\n${call.function?.arguments ?? ''}` };
        }
        yield { type: 'done', finish: choice.finish_reason === 'length' ? 'length' : 'stop', usage: json.usage };
        return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finish: 'stop' | 'length' = 'stop';
    let usage: unknown;
    const seenCalls = new Set<number>();
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (data === '[DONE]') {
                yield { type: 'done', finish, usage };
                return;
            }
            let json: Record<string, any>;
            try {
                json = JSON.parse(data);
            } catch {
                continue;
            }
            if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
            if (json.usage) usage = json.usage;
            const choice = json.choices?.[0];
            if (!choice) continue;
            const delta = choice.delta ?? {};
            const reasoning = delta.reasoning_content ?? delta.reasoning;
            if (reasoning) yield { type: 'reasoning', text: String(reasoning) };
            if (delta.content) yield { type: 'text', text: String(delta.content) };
            // Tool-call replies (presets that answer through a reply tool) stream as text in the
            // "<|tool_call|>name\n{json}" shape; normalizeModelOutput turns the JSON into tagged text.
            for (const call of delta.tool_calls ?? []) {
                const index = Number(call.index ?? 0);
                if (!seenCalls.has(index)) {
                    seenCalls.add(index);
                    yield { type: 'text', text: `\n<|tool_call|>${call.function?.name ?? ''}\n` };
                }
                if (call.function?.arguments) yield { type: 'text', text: String(call.function.arguments) };
            }
            if (choice.finish_reason === 'length') finish = 'length';
        }
    }
    yield { type: 'done', finish, usage };
}

export interface SendResult {
    text: string;
    reasoning: string;
    /** Tool calls exactly as the endpoint returned them (provider extras such as thought signatures included). */
    toolCalls: { id?: string; type?: string; function?: { name?: string; arguments?: string }; [key: string]: unknown }[];
    finish: 'stop' | 'length';
}

/** One non-streaming request with a prepared body; tool calls come back as structured data. */
export async function sendChat(conn: Connection, key: string | undefined, body: Record<string, unknown>, signal: AbortSignal, names?: ChatRequest['names'], hooks?: ProviderHooks): Promise<SendResult> {
    const { stream_options: _drop, ...rest } = body;
    const res = await postChat(conn, key, { ...rest, stream: false }, signal, names, hooks);
    if (!res.ok) {
        throw new Error(`接口返回 ${res.status}：${await errorText(res)}`);
    }
    const json = await res.json() as Record<string, any>;
    if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
    const message = json.choices?.[0]?.message ?? {};
    return {
        text: String(message.content ?? json.choices?.[0]?.text ?? ''),
        reasoning: String(message.reasoning_content ?? message.reasoning ?? ''),
        toolCalls: Array.isArray(message.tool_calls) ? message.tool_calls : [],
        finish: json.choices?.[0]?.finish_reason === 'length' ? 'length' : 'stop',
    };
}

export async function listModels(conn: Pick<Connection, 'baseUrl' | 'extraHeaders'>, key: string | undefined): Promise<string[]> {
    if (!conn.baseUrl.trim()) throw Object.assign(new Error('先填写接口地址'), { status: 400 });
    const res = await fetch(`${normalizeBase(conn.baseUrl)}/models`, { headers: headers(conn, key), signal: AbortSignal.timeout(30_000) }).catch(error => {
        console.warn('获取模型列表失败：', error instanceof Error ? error.message : error);
        throw Object.assign(new Error('连不上这个地址，检查一下接口地址、网络或代理'), { status: 400 });
    });
    if (!res.ok) {
        const reason = res.status === 401 || res.status === 403 ? 'API 密钥不对，或者没有权限' : res.status === 404 ? '这个地址没有模型列表，检查一下接口地址（一般以 /v1 结尾）' : await errorText(res);
        throw Object.assign(new Error(`${reason}（${res.status}）`), { status: 400 });
    }
    const json = await res.json().catch(() => null) as { data?: { id: string }[]; models?: { name?: string; id?: string }[] } | null;
    const list = json?.data?.map(m => m.id) ?? json?.models?.map(m => m.id ?? m.name ?? '') ?? [];
    return [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

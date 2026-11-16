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

function normalizeBase(url: string) {
    return url.trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
}

/** Prefixes example-dialogue names into content for endpoints that reject `name` (ST xAI converter). */
function stripNames(messages: ChatRequest['messages'], names: ChatRequest['names']) {
    return messages.map(m => {
        if (!m.name) return { role: m.role, content: m.content };
        let content = m.content;
        if (m.role === 'system' && m.name === 'example_user' && !content.startsWith(`${names.user}: `)) {
            content = `${names.user}: ${content}`;
        } else if (m.role === 'system' && m.name === 'example_assistant' && !content.startsWith(`${names.char}: `)) {
            content = `${names.char}: ${content}`;
        }
        return { role: m.role, content };
    });
}

export function buildBody(conn: Connection, req: ChatRequest, stream: boolean): Record<string, unknown> {
    const s = req.preset.sampling;
    const body: Record<string, unknown> = {
        model: conn.model,
        messages: conn.sendNames ? req.messages : stripNames(req.messages, req.names),
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

function headers(conn: Connection, key: string | undefined): Record<string, string> {
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
        const err = json.error ?? json.detail ?? json;
        return typeof err === 'string' ? err : err.message ?? JSON.stringify(err).slice(0, 500);
    } catch {
        return text.slice(0, 500) || res.statusText;
    }
}

/** `prepared`: the final request body (after plugins' request hooks); built from `req` when absent. */
export async function* streamChat(conn: Connection, key: string | undefined, req: ChatRequest, signal: AbortSignal, prepared?: Record<string, unknown>): AsyncGenerator<StreamEvent> {
    const stream = prepared ? prepared.stream !== false : req.preset.context.stream;
    const res = await fetch(`${normalizeBase(conn.baseUrl)}/chat/completions`, {
        method: 'POST',
        headers: headers(conn, key),
        body: JSON.stringify(prepared ?? buildBody(conn, req, stream)),
        signal,
    });
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

export async function listModels(conn: Connection, key: string | undefined): Promise<string[]> {
    const res = await fetch(`${normalizeBase(conn.baseUrl)}/models`, { headers: headers(conn, key) });
    if (!res.ok) {
        throw new Error(`获取模型列表失败（${res.status}）：${await errorText(res)}`);
    }
    const json = await res.json() as { data?: { id: string }[]; models?: { name?: string; id?: string }[] };
    const list = json.data?.map(m => m.id) ?? json.models?.map(m => m.id ?? m.name ?? '') ?? [];
    return list.filter(Boolean).sort();
}

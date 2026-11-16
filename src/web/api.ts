import type { Op } from '../core/ops.ts';
import type { Chat, Connection, ResourceKind, Settings } from '../core/types.ts';

export interface Summary {
    id: string;
    kind: ResourceKind;
    name: string;
    updatedAt: number;
    avatar?: string;
    tags?: string[];
    creator?: string;
    characterId?: string;
    messages?: number;
    preview?: string;
    entries?: number;
    prompts?: number;
    scripts?: number;
    description?: string;
    lorebookIds?: string[];
}

export interface Bootstrap {
    settings: Settings & { connections: (Connection & { hasKey: boolean })[] };
    resources: Record<ResourceKind, Summary[]>;
    plugins: { id: string; name: string; error?: string }[];
}

export class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

async function request<T>(method: string, url: string, body?: unknown, raw?: BodyInit): Promise<T> {
    const res = await fetch(url, {
        method,
        headers: raw ? undefined : body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
        throw new ApiError(data?.error ?? res.statusText, res.status);
    }
    return data as T;
}

export const api = {
    bootstrap: () => request<Bootstrap>('GET', '/api/bootstrap'),
    get: <T>(kind: ResourceKind, id: string) => request<T>('GET', `/api/resources/${kind}/${id}`),
    remove: (kind: ResourceKind, id: string) => request('DELETE', `/api/resources/${kind}/${id}`),
    create: <T>(kind: 'persona' | 'lorebook', body: Record<string, unknown>) => request<T>('POST', `/api/resources/${kind}`, body),
    change: <T>(kind: ResourceKind, id: string, ops: Op[], reason?: string) =>
        request<{ resource: T; change: { id: string } }>('POST', '/api/changes', { target: { kind, id }, ops, reason }),
    revert: (changeId: string) => request('POST', `/api/changes/${changeId}/revert`),
    history: (kind?: string, id?: string) => request<any[]>('GET', `/api/history?${kind && id ? `kind=${kind}&id=${id}&` : ''}limit=100`),
    importFile: (file: File) => request<{ created: { kind: ResourceKind; id: string; name: string }[] }>('POST', `/api/import?filename=${encodeURIComponent(file.name)}`, undefined, file),
    createChat: (characterId: string) => request<Chat>('POST', '/api/chats', { characterId }),
    branchChat: (chatId: string, messageId: string, swipeId: string) =>
        request<Chat>('POST', `/api/chats/${chatId}/messages/${messageId}/swipes/${swipeId}/branch`),
    context: (chatId: string) => request<ChatContext>('GET', `/api/chats/${chatId}/context`),
    preview: (chatId: string, text?: string) => request<PromptSnapshot>('POST', `/api/chats/${chatId}/preview`, { text }),
    lastPrompt: (chatId: string) => request<PromptSnapshot | null>('GET', `/api/chats/${chatId}/last-prompt`),
    abort: (jobId: string) => request('POST', `/api/jobs/${jobId}/abort`),
    saveSettings: (patch: Partial<Record<keyof Settings, unknown>>) => request<Bootstrap['settings']>('PUT', '/api/settings', patch),
    saveConnection: (connection: Partial<Connection>, key?: string | null, activate?: boolean) =>
        request<Bootstrap['settings']>('POST', '/api/connections', { connection, key, activate }),
    deleteConnection: (id: string) => request<Bootstrap['settings']>('DELETE', `/api/connections/${id}`),
    models: (id: string) => request<{ models: string[] }>('POST', `/api/connections/${id}/models`),
    testConnection: (id: string) => request<{ text: string; ms: number }>('POST', `/api/connections/${id}/test`),
};

export interface ChatContext {
    userName: string;
    charName: string;
    regex: import('../core/types.ts').RegexScript[];
    preset: { id: string; name: string; catgod: boolean };
    busy: string | null;
}

export interface PromptPartView {
    role: 'system' | 'user' | 'assistant';
    content: string;
    name?: string;
    sources: string[];
    messageId?: string;
    tokens: number;
}

export interface PromptSnapshot {
    at?: number;
    model?: string;
    parts: PromptPartView[];
    warnings: string[];
    tokens: { total: number; budget: number; maxContext: number; maxTokens: number };
    lore: { bookId: string; bookName: string; entryId: string; title: string; position: string; reason: string; content: string }[];
    tools?: string[];
}

export type GenerateEvent =
    | { type: 'job'; jobId: string; messageId: string; swipeId: string; prefix: string }
    | ({ type: 'prompt' } & PromptSnapshot)
    | { type: 'text'; text: string }
    | { type: 'reasoning'; text: string }
    | { type: 'card-edit'; reason: string }
    | { type: 'finalizing' }
    | { type: 'done'; message: import('../core/types.ts').ChatMessage }
    | { type: 'error'; error: string; message?: import('../core/types.ts').ChatMessage };

/** Starts a generation and calls `onEvent` for each server-sent event. */
export async function generate(chatId: string, body: { type: string; text?: string; source?: 'card' }, onEvent: (e: GenerateEvent) => void): Promise<void> {
    const res = await fetch(`/api/chats/${chatId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new ApiError(data.error ?? res.statusText, res.status);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
            const chunk = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            for (const line of chunk.split('\n')) {
                if (line.startsWith('data: ')) onEvent(JSON.parse(line.slice(6)));
            }
        }
    }
}

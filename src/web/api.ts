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
    branch?: { chatId: string; index: number };
}

export interface PluginView {
    id: string;
    name: string;
    description: string;
    version: string;
    source: 'builtin' | 'installed';
    compat?: { name: string; url: string };
    repository?: string;
    enabled: boolean;
    autoUpdate: boolean;
    error?: string;
    update: { checkedAt?: number; latest?: string; error?: string; updatedFrom?: string; updatedAt?: number } | null;
}

export interface Bootstrap {
    settings: Settings & { connections: (Connection & { hasKey: boolean })[] };
    resources: Record<ResourceKind, Summary[]>;
    plugins: PluginView[];
}

/** Hearth's own update (desktop app only). */
export interface AppUpdateStatus {
    state: 'idle' | 'checking' | 'latest' | 'downloading' | 'ready' | 'error';
    version?: string;
    percent?: number;
    transferred?: number;
    total?: number;
    bytesPerSecond?: number;
    error?: string;
    checkedAt?: number;
}

export interface VersionInfo {
    app: string;
    version: string;
    build: string;
    latest: string;
    desktop?: boolean;
    update?: AppUpdateStatus | null;
}

export const RELEASES_URL = 'https://github.com/xinc2333/Hearth/releases';
export const releaseUrl = (version: string) => `${RELEASES_URL}/tag/v${version}`;

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
    version: () => request<VersionInfo>('GET', '/api/version'),
    checkAppUpdate: () => request<AppUpdateStatus>('POST', '/api/app-update/check'),
    installAppUpdate: () => request('POST', '/api/app-update/install'),
    get: <T>(kind: ResourceKind, id: string) => request<T>('GET', `/api/resources/${kind}/${id}`),
    remove: (kind: ResourceKind, id: string) => request('DELETE', `/api/resources/${kind}/${id}`),
    create: <T>(kind: 'persona' | 'lorebook', body: Record<string, unknown>) => request<T>('POST', `/api/resources/${kind}`, body),
    change: <T>(kind: ResourceKind, id: string, ops: Op[], reason?: string) =>
        request<{ resource: T; change: { id: string } }>('POST', '/api/changes', { target: { kind, id }, ops, reason }),
    revert: (changeId: string) => request('POST', `/api/changes/${changeId}/revert`),
    history: (kind?: string, id?: string) => request<any[]>('GET', `/api/history?${kind && id ? `kind=${kind}&id=${id}&` : ''}limit=100`),
    importFile: (file: File) => request<{ created: { kind: ResourceKind; id: string; name: string }[] }>('POST', `/api/import?filename=${encodeURIComponent(file.name)}`, undefined, file),
    createChat: (characterId: string) => request<Chat>('POST', '/api/chats', { characterId }),
    setControl: (chatId: string, id: string, value: unknown) => request<{ chat: Chat; controls: ChatControl[] }>('POST', `/api/chats/${chatId}/controls`, { id, value }),
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
    /** Lists models with what the form holds; without `key`, the saved key of `connectionId` is used. */
    listModels: (body: { connectionId?: string; baseUrl: string; key?: string }) => request<{ models: string[] }>('POST', '/api/models', body),
    testConnection: (id: string) => request<{ text: string; ms: number }>('POST', `/api/connections/${id}/test`),
    plugins: () => request<PluginView[]>('GET', '/api/plugins'),
    setPlugin: (id: string, patch: { enabled?: boolean; autoUpdate?: boolean }) => request<PluginView[]>('PUT', `/api/plugins/${id}`, patch),
    updatePlugin: (id: string, apply = true) => request<PluginView[]>('POST', `/api/plugins/${id}/update`, { apply }),
    installPlugin: (url: string) => request<{ installed: { id: string; name: string; version: string }; plugins: PluginView[] }>('POST', '/api/plugins/install', { url }),
    removePlugin: (id: string) => request<PluginView[]>('DELETE', `/api/plugins/${id}`),
};

export interface ChatContext {
    userName: string;
    charName: string;
    regex: import('../core/types.ts').RegexScript[];
    preset: { id: string; name: string };
    /** Switches plugins show in the composer (e.g. a preset's reply mode). */
    controls: ChatControl[];
    /** Buttons plugins add to 编辑 mode (e.g. 数据化适配). */
    editTasks?: { id: string; label: string; hint: string; request: string }[];
    busy: string | null;
}

export interface ChatControl {
    id: string;
    type: 'mode' | 'toggle' | 'note';
    label: string;
    value: unknown;
    options?: [string, string][];
    hint?: string;
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
    /** The request actually sent, when a plugin (e.g. the preset's own script) rewrote it. */
    sent?: PromptPartView[];
    /** Extra requests plugins sent before the reply (e.g. 跑团's ruling step). */
    stages?: { label: string; parts: PromptPartView[]; tools: string[] }[];
}

export type GenerateEvent =
    | { type: 'job'; jobId: string; messageId: string; swipeId: string; prefix: string }
    | ({ type: 'prompt' } & PromptSnapshot)
    | { type: 'text'; text: string }
    | { type: 'reasoning'; text: string }
    | { type: 'finalizing' }
    | { type: 'progress'; plugin: string; data: unknown }
    | { type: 'done'; message: import('../core/types.ts').ChatMessage }
    | { type: 'error'; error: string; message?: import('../core/types.ts').ChatMessage };

/** Starts a generation and calls `onEvent` for each server-sent event. */
export async function generate(chatId: string, body: { type: string; text?: string }, onEvent: (e: GenerateEvent) => void): Promise<void> {
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

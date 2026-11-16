import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

export interface Req {
    raw: IncomingMessage;
    params: Record<string, string>;
    query: URLSearchParams;
    body: () => Promise<Buffer>;
    json: <T = any>() => Promise<T>;
}

export type Handler = (req: Req, res: ServerResponse) => unknown | Promise<unknown>;

interface Route {
    method: string;
    pattern: RegExp;
    keys: string[];
    handler: Handler;
}

const MAX_BODY = 200 * 1024 * 1024;

export class Router {
    private routes: Route[] = [];

    on(method: string, pathPattern: string, handler: Handler) {
        const keys: string[] = [];
        const pattern = new RegExp('^' + pathPattern.replace(/:(\w+)/g, (_m, k) => {
            keys.push(k);
            return '([^/]+)';
        }) + '$');
        this.routes.push({ method, pattern, keys, handler });
    }

    get(p: string, h: Handler) { this.on('GET', p, h); }
    post(p: string, h: Handler) { this.on('POST', p, h); }
    put(p: string, h: Handler) { this.on('PUT', p, h); }
    delete(p: string, h: Handler) { this.on('DELETE', p, h); }

    async handle(raw: IncomingMessage, res: ServerResponse): Promise<boolean> {
        const url = new URL(raw.url ?? '/', 'http://localhost');
        for (const route of this.routes) {
            if (route.method !== raw.method) continue;
            const m = url.pathname.match(route.pattern);
            if (!m) continue;
            const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
            let cached: Buffer | null = null;
            const body = async () => {
                if (cached) return cached;
                const chunks: Buffer[] = [];
                let size = 0;
                for await (const chunk of raw) {
                    size += chunk.length;
                    if (size > MAX_BODY) throw Object.assign(new Error('文件太大'), { status: 413 });
                    chunks.push(chunk);
                }
                cached = Buffer.concat(chunks);
                return cached;
            };
            const req: Req = {
                raw, params, query: url.searchParams, body,
                json: async () => {
                    const buf = await body();
                    return buf.length ? JSON.parse(buf.toString('utf8')) : {};
                },
            };
            try {
                const out = await route.handler(req, res);
                if (!res.headersSent && !res.writableEnded) {
                    sendJson(res, out === undefined ? { ok: true } : out);
                }
            } catch (error) {
                const status = (error as { status?: number }).status ?? 500;
                if (status >= 500) console.error(error);
                if (!res.headersSent) {
                    sendJson(res, { error: (error as Error).message }, status);
                } else if (!res.writableEnded) {
                    res.end();
                }
            }
            return true;
        }
        return false;
    }
}

export function sendJson(res: ServerResponse, data: unknown, status = 200) {
    const body = JSON.stringify(data);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
}

export function startSse(res: ServerResponse) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    return (data: unknown) => {
        if (!res.writableEnded && !res.destroyed) {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        }
    };
}

const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
    '.woff2': 'font/woff2',
};

export function serveFile(res: ServerResponse, file: string, cache = false) {
    if (!existsSync(file) || !statSync(file).isFile()) {
        return false;
    }
    res.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': cache ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    createReadStream(file).pipe(res);
    return true;
}

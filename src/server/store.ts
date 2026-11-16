// File-backed resource store. Every resource is one JSON file; every change is a ChangeSet that is
// applied atomically, written to disk, appended to the journal and broadcast to listeners.

import { EventEmitter } from 'node:events';
import { promises as fs, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { applyOps, type Author, type ChangeSet, type Op } from '../core/ops.ts';
import { DEFAULT_SETTINGS, type AnyResource, type ResourceKind, type Settings } from '../core/types.ts';
import { newId } from '../core/util.ts';

const KIND_DIRS: Record<ResourceKind, string> = {
    character: 'characters',
    lorebook: 'lorebooks',
    preset: 'presets',
    persona: 'personas',
    chat: 'chats',
};

export interface ChangeEvent {
    kind: ResourceKind;
    id: string;
    change?: ChangeSet;
    removed?: boolean;
}

async function writeAtomic(file: string, data: string | Uint8Array) {
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, data);
    // On Windows, antivirus or indexing can briefly lock the target; retry a few times.
    for (let attempt = 0; ; attempt++) {
        try {
            await fs.rename(tmp, file);
            return;
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (attempt >= 5 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw error;
            await new Promise(r => setTimeout(r, 50 * (attempt + 1)));
        }
    }
}

export class Store extends EventEmitter {
    readonly dir: string;
    private resources = new Map<ResourceKind, Map<string, AnyResource>>();
    private pendingSaves = new Map<string, NodeJS.Timeout>();
    /** Writes to the same file run one after another, so an older version never lands last. */
    private writes = new Map<string, Promise<void>>();
    settings: Settings = structuredClone(DEFAULT_SETTINGS);
    private secrets: Record<string, string> = {};
    private journal: ChangeSet[] = [];

    constructor(dir: string) {
        super();
        this.dir = dir;
    }

    load() {
        for (const sub of [...Object.values(KIND_DIRS), 'avatars', 'imports']) {
            mkdirSync(path.join(this.dir, sub), { recursive: true });
        }
        for (const [kind, sub] of Object.entries(KIND_DIRS) as [ResourceKind, string][]) {
            const map = new Map<string, AnyResource>();
            for (const file of readdirSync(path.join(this.dir, sub))) {
                if (!file.endsWith('.json')) continue;
                try {
                    const res = JSON.parse(readFileSync(path.join(this.dir, sub, file), 'utf8')) as AnyResource;
                    map.set(res.id, res);
                } catch (error) {
                    console.warn(`[store] 跳过无法读取的文件 ${sub}/${file}:`, (error as Error).message);
                }
            }
            this.resources.set(kind, map);
        }
        const settingsFile = path.join(this.dir, 'settings.json');
        if (existsSync(settingsFile)) {
            const saved = JSON.parse(readFileSync(settingsFile, 'utf8'));
            this.settings = { ...structuredClone(DEFAULT_SETTINGS), ...saved, lore: { ...DEFAULT_SETTINGS.lore, ...saved.lore } };
        }
        const secretsFile = path.join(this.dir, 'secrets.json');
        if (existsSync(secretsFile)) {
            this.secrets = JSON.parse(readFileSync(secretsFile, 'utf8'));
        }
        const journalFile = path.join(this.dir, 'journal.jsonl');
        if (existsSync(journalFile)) {
            const lines = readFileSync(journalFile, 'utf8').split('\n').filter(Boolean).slice(-2000);
            this.journal = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
        }
    }

    private file(kind: ResourceKind, id: string) {
        return path.join(this.dir, KIND_DIRS[kind], `${id}.json`);
    }

    list<T extends AnyResource>(kind: ResourceKind): T[] {
        return [...(this.resources.get(kind)?.values() ?? [])] as T[];
    }

    get<T extends AnyResource>(kind: ResourceKind, id: string | undefined): T | undefined {
        return id ? this.resources.get(kind)?.get(id) as T | undefined : undefined;
    }

    require<T extends AnyResource>(kind: ResourceKind, id: string | undefined): T {
        const res = this.get<T>(kind, id);
        if (!res) {
            throw Object.assign(new Error(`找不到 ${kind}：${id}`), { status: 404 });
        }
        return res;
    }

    private async persist(res: AnyResource) {
        const file = this.file(res.kind, res.id);
        const data = JSON.stringify(res, null, 1);
        const write = (this.writes.get(file) ?? Promise.resolve()).catch(() => {}).then(() => writeAtomic(file, data));
        this.writes.set(file, write);
        try {
            await write;
        } finally {
            if (this.writes.get(file) === write) this.writes.delete(file);
        }
    }

    /** Debounced save for high-frequency updates (streaming). */
    private schedule(res: AnyResource, delay = 1500) {
        const key = `${res.kind}:${res.id}`;
        clearTimeout(this.pendingSaves.get(key));
        this.pendingSaves.set(key, setTimeout(() => {
            this.pendingSaves.delete(key);
            const current = this.get(res.kind, res.id);
            if (current) void this.persist(current);
        }, delay));
    }

    /** Writes every pending debounced save (before exiting). */
    async flushAll() {
        const keys = [...this.pendingSaves.keys()];
        for (const key of keys) {
            const [kind, id] = key.split(':') as [ResourceKind, string];
            await this.flush(kind, id);
        }
    }

    async flush(kind: ResourceKind, id: string) {
        const key = `${kind}:${id}`;
        clearTimeout(this.pendingSaves.get(key));
        this.pendingSaves.delete(key);
        const current = this.get(kind, id);
        if (current) await this.persist(current);
    }

    async create<T extends AnyResource>(res: T, author: Author = 'user'): Promise<T> {
        this.resources.get(res.kind)?.set(res.id, res);
        await this.persist(res);
        await this.record({
            id: newId('cs'), target: { kind: res.kind, id: res.id }, ops: [], author,
            reason: `创建「${res.name}」`, createdAt: Date.now(), status: 'applied',
        });
        this.emit('change', { kind: res.kind, id: res.id } satisfies ChangeEvent);
        return res;
    }

    async remove(kind: ResourceKind, id: string) {
        const res = this.require(kind, id);
        this.resources.get(kind)?.delete(id);
        await fs.rm(this.file(kind, id), { force: true });
        await this.record({
            id: newId('cs'), target: { kind, id }, ops: [], author: 'user',
            reason: `删除「${res.name}」`, createdAt: Date.now(), status: 'applied',
        });
        this.emit('change', { kind, id, removed: true } satisfies ChangeEvent);
    }

    /**
     * Applies a change set. This is the only way resources change: UI edits, AI proposals that were
     * approved, script/plugin updates all come through here.
     */
    async apply(input: { target: { kind: ResourceKind; id: string }; ops: Op[]; author: Author; reason?: string; journal?: boolean; debounce?: boolean }): Promise<{ resource: AnyResource; change: ChangeSet }> {
        const current = this.require(input.target.kind, input.target.id);
        const { doc, inverse } = applyOps(current, input.ops);
        doc.id = current.id;
        doc.kind = current.kind;
        doc.updatedAt = Date.now();
        this.resources.get(doc.kind)?.set(doc.id, doc);
        const change: ChangeSet = {
            id: newId('cs'),
            target: input.target,
            ops: input.ops,
            author: input.author,
            reason: input.reason,
            createdAt: Date.now(),
            status: 'applied',
            inverse,
        };
        if (input.debounce) {
            this.schedule(doc);
        } else {
            await this.persist(doc);
        }
        if (input.journal !== false) {
            await this.record(change);
        }
        this.emit('change', { kind: doc.kind, id: doc.id, change } satisfies ChangeEvent);
        return { resource: doc, change };
    }

    async revert(changeId: string, author: Author = 'user') {
        const change = this.journal.find(c => c.id === changeId);
        if (!change?.inverse?.length) {
            throw Object.assign(new Error('这条修改无法撤销'), { status: 400 });
        }
        const result = await this.apply({
            target: change.target as { kind: ResourceKind; id: string },
            ops: change.inverse,
            author,
            reason: `撤销：${change.reason ?? change.id}`,
        });
        change.status = 'reverted';
        return result;
    }

    history(target?: { kind: string; id: string }, limit = 100): ChangeSet[] {
        const items = target ? this.journal.filter(c => c.target.kind === target.kind && c.target.id === target.id) : this.journal;
        return items.slice(-limit).reverse();
    }

    private async record(change: ChangeSet) {
        this.journal.push(change);
        if (this.journal.length > 4000) this.journal.splice(0, 2000);
        await fs.appendFile(path.join(this.dir, 'journal.jsonl'), JSON.stringify(change) + '\n');
    }

    async saveSettings(patch: Partial<Settings>) {
        this.settings = { ...this.settings, ...patch, lore: { ...this.settings.lore, ...(patch.lore ?? {}) } };
        await writeAtomic(path.join(this.dir, 'settings.json'), JSON.stringify(this.settings, null, 1));
        this.emit('settings', this.settings);
    }

    getSecret(key: string): string | undefined {
        return this.secrets[key];
    }

    async setSecret(key: string, value: string | null) {
        if (value) this.secrets[key] = value;
        else delete this.secrets[key];
        await writeAtomic(path.join(this.dir, 'secrets.json'), JSON.stringify(this.secrets, null, 1));
    }

    async saveBinary(sub: 'avatars' | 'imports', name: string, data: Uint8Array): Promise<string> {
        const file = path.join(this.dir, sub, name);
        await writeAtomic(file, data);
        return file;
    }

    binaryPath(sub: 'avatars' | 'imports', name: string): string {
        return path.join(this.dir, sub, path.basename(name));
    }
}

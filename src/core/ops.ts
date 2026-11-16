// Operations and change sets: the single mutation channel for every resource.
//
// A path is a list of segments. A string segment starting with "@" selects the array element whose
// `id` equals the rest of the segment ("entries/@12/content"); numbers index arrays; other strings
// are object keys. Addressing array items by id keeps AI proposals valid even if the list is
// reordered between proposal and approval.

export type PathSegment = string | number;
export type Path = PathSegment[];

export type Op =
    | { op: 'set'; path: Path; value: unknown }
    | { op: 'unset'; path: Path }
    | { op: 'insert'; path: Path; value: unknown; index?: number }
    | { op: 'move'; path: Path; index: number }
    | { op: 'edit'; path: Path; find: string; replace: string };

export type Author = 'user' | 'ai' | 'script' | 'system' | `plugin:${string}`;

export type ChangeStatus = 'proposed' | 'applied' | 'rejected' | 'reverted';

export interface ChangeSet {
    id: string;
    target: { kind: string; id: string };
    ops: Op[];
    author: Author;
    reason?: string;
    createdAt: number;
    status: ChangeStatus;
    /** Ops that undo this change set; filled in when applied. */
    inverse?: Op[];
}

export class OpError extends Error {}

export function parsePath(path: string | Path): Path {
    if (Array.isArray(path)) {
        return path;
    }
    return path.split('/').filter(Boolean).map(seg => /^\d+$/.test(seg) ? Number(seg) : seg);
}

export function formatPath(path: Path): string {
    return path.map(String).join('/');
}

type Container = Record<string, unknown> | unknown[];

function resolveIndex(arr: unknown[], seg: PathSegment): number {
    if (typeof seg === 'number') {
        return seg;
    }
    if (seg.startsWith('@')) {
        const id = seg.slice(1);
        return arr.findIndex(item => item !== null && typeof item === 'object' && String((item as { id?: unknown }).id) === id);
    }
    if (/^\d+$/.test(seg)) {
        return Number(seg);
    }
    return -1;
}

function child(container: unknown, seg: PathSegment): unknown {
    if (Array.isArray(container)) {
        const index = resolveIndex(container, seg);
        return index >= 0 ? container[index] : undefined;
    }
    if (container !== null && typeof container === 'object') {
        return (container as Record<string, unknown>)[String(seg)];
    }
    return undefined;
}

export function getAt(doc: unknown, path: Path): unknown {
    let cur = doc;
    for (const seg of path) {
        cur = child(cur, seg);
        if (cur === undefined) {
            return undefined;
        }
    }
    return cur;
}

function parentOf(doc: unknown, path: Path, create: boolean): { parent: Container; key: PathSegment; created: Path | null } {
    if (!path.length) {
        throw new OpError('Empty path');
    }
    let cur = doc;
    let created: Path | null = null;
    for (let i = 0; i < path.length - 1; i++) {
        let next = child(cur, path[i]);
        if (next === undefined || next === null) {
            if (!create || Array.isArray(cur)) {
                throw new OpError(`Path not found: ${formatPath(path.slice(0, i + 1))}`);
            }
            next = typeof path[i + 1] === 'number' ? [] : {};
            (cur as Record<string, unknown>)[String(path[i])] = next;
            created ??= path.slice(0, i + 1);
        }
        if (typeof next !== 'object') {
            throw new OpError(`Not a container: ${formatPath(path.slice(0, i + 1))}`);
        }
        cur = next;
    }
    return { parent: cur as Container, key: path[path.length - 1], created };
}

/** Path to an array item that stays valid after other inserts/removals. */
function stablePath(arrayPath: Path, arr: unknown[], index: number): Path {
    const item = arr[index] as { id?: unknown } | undefined;
    if (item && typeof item === 'object' && item.id !== undefined && item.id !== null) {
        return [...arrayPath, `@${String(item.id)}`];
    }
    return [...arrayPath, index];
}

function applyOne(doc: unknown, op: Op): Op[] {
    switch (op.op) {
        case 'set': {
            const { parent, key, created } = parentOf(doc, op.path, true);
            if (created) {
                // Undo removes the containers this op had to create.
                const k = String(key);
                (parent as Record<string, unknown>)[k] = structuredClone(op.value);
                return [{ op: 'unset', path: created }];
            }
            if (Array.isArray(parent)) {
                const index = resolveIndex(parent, key);
                if (index < 0 || index >= parent.length) {
                    throw new OpError(`Array item not found: ${formatPath(op.path)}`);
                }
                const old = parent[index];
                parent[index] = structuredClone(op.value);
                return [{ op: 'set', path: op.path, value: old }];
            }
            const k = String(key);
            const existed = Object.hasOwn(parent, k);
            const old = parent[k];
            parent[k] = structuredClone(op.value);
            return [existed ? { op: 'set', path: op.path, value: old } : { op: 'unset', path: op.path }];
        }
        case 'unset': {
            const { parent, key } = parentOf(doc, op.path, false);
            if (Array.isArray(parent)) {
                const index = resolveIndex(parent, key);
                if (index < 0 || index >= parent.length) {
                    throw new OpError(`Array item not found: ${formatPath(op.path)}`);
                }
                const [old] = parent.splice(index, 1);
                return [{ op: 'insert', path: op.path.slice(0, -1), value: old, index }];
            }
            const k = String(key);
            if (!Object.hasOwn(parent, k)) {
                return [];
            }
            const old = parent[k];
            delete parent[k];
            return [{ op: 'set', path: op.path, value: old }];
        }
        case 'insert': {
            const arr = getAt(doc, op.path);
            if (!Array.isArray(arr)) {
                throw new OpError(`Not an array: ${formatPath(op.path)}`);
            }
            const index = op.index === undefined || op.index < 0 || op.index > arr.length ? arr.length : op.index;
            arr.splice(index, 0, structuredClone(op.value));
            return [{ op: 'unset', path: stablePath(op.path, arr, index) }];
        }
        case 'move': {
            const { parent, key } = parentOf(doc, op.path, false);
            if (!Array.isArray(parent)) {
                throw new OpError(`Not an array item: ${formatPath(op.path)}`);
            }
            const from = resolveIndex(parent, key);
            if (from < 0 || from >= parent.length) {
                throw new OpError(`Array item not found: ${formatPath(op.path)}`);
            }
            const to = Math.max(0, Math.min(parent.length - 1, op.index));
            const [item] = parent.splice(from, 1);
            parent.splice(to, 0, item);
            return [{ op: 'move', path: stablePath(op.path.slice(0, -1), parent, to), index: from }];
        }
        case 'edit': {
            const current = getAt(doc, op.path);
            if (typeof current !== 'string') {
                throw new OpError(`Not a text field: ${formatPath(op.path)}`);
            }
            const first = current.indexOf(op.find);
            if (first < 0) {
                throw new OpError(`Text to replace was not found in ${formatPath(op.path)}`);
            }
            if (current.indexOf(op.find, first + 1) >= 0) {
                throw new OpError(`Text to replace occurs more than once in ${formatPath(op.path)}`);
            }
            const next = current.slice(0, first) + op.replace + current.slice(first + op.find.length);
            const { parent, key } = parentOf(doc, op.path, false);
            if (Array.isArray(parent)) {
                parent[resolveIndex(parent, key)] = next;
            } else {
                parent[String(key)] = next;
            }
            return [{ op: 'set', path: op.path, value: current }];
        }
    }
}

/**
 * Applies ops to a copy of `doc`. Either all ops apply or an OpError is thrown and nothing changes.
 * Returns the new document and the ops that undo the change.
 */
export function applyOps<T>(doc: T, ops: Op[]): { doc: T; inverse: Op[] } {
    const next = structuredClone(doc);
    const inverse: Op[] = [];
    for (const op of ops) {
        inverse.unshift(...applyOne(next, op));
    }
    return { doc: next, inverse };
}

/** A short human-readable description of an op, for diff/approval UIs. */
export function describeOp(op: Op): string {
    const where = formatPath(op.path);
    switch (op.op) {
        case 'set':
            return `设置 ${where}`;
        case 'unset':
            return `删除 ${where}`;
        case 'insert':
            return `在 ${where} 中新增一项`;
        case 'move':
            return `移动 ${where} 到第 ${op.index + 1} 位`;
        case 'edit':
            return `修改 ${where} 中的一段文字`;
    }
}

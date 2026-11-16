export function newId(prefix: string): string {
    const bytes = new Uint8Array(4);
    globalThis.crypto.getRandomValues(bytes);
    const rand = Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').slice(0, 6);
    return `${prefix}_${Date.now().toString(36)}${rand}`;
}

/** Deterministic 53-bit string hash (cyrb53). */
export function hashString(str: string, seed = 0): number {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** ST stringFormat: replaces {0}, {1}… with arguments. */
export function stringFormat(format: string, ...args: string[]): string {
    return format.replace(/{(\d+)}/g, (match, n) => args[Number(n)] ?? match);
}

export function collapseNewlines(text: string): string {
    return text.replaceAll(/\n+/g, '\n');
}

export function escapeRegex(text: string): string {
    return text.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}

export function base64ToUtf8(b64: string): string {
    const bin = atob(b64.replace(/\s+/g, ''));
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

export function utf8ToBase64(text: string): string {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
}

/** ST regexFromString: accepts "/pattern/flags" or a bare pattern. */
export function regexFromString(input: string): RegExp | null {
    try {
        const m = input.match(/(\/?)(.+)\1([a-z]*)/is);
        if (!m) {
            return null;
        }
        if (m[3] && !/^(?!.*?(.).*?\1)[gmixXsuUAJ]+$/.test(m[3])) {
            return new RegExp(input);
        }
        return new RegExp(m[2], m[3]);
    } catch {
        return null;
    }
}

export function asString(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : value === undefined || value === null ? fallback : String(value);
}

export function asNumber(value: unknown, fallback: number): number {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
}

export function asBool(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : value === undefined || value === null ? fallback : Boolean(value);
}

export function asStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter(v => v !== null && v !== undefined).map(v => String(v)) : [];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

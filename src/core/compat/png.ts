// Minimal PNG chunk reader/writer for character card metadata (tEXt / iTXt).

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export interface PngChunk {
    type: string;
    data: Uint8Array;
}

let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
    if (!crcTable) {
        crcTable = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            }
            crcTable[n] = c >>> 0;
        }
    }
    let crc = 0xffffffff;
    for (const b of bytes) {
        crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

export function isPng(bytes: Uint8Array): boolean {
    return bytes.length > 8 && SIGNATURE.every((b, i) => bytes[i] === b);
}

export function readChunks(bytes: Uint8Array): PngChunk[] {
    if (!isPng(bytes)) {
        throw new Error('不是 PNG 文件');
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const chunks: PngChunk[] = [];
    let offset = 8;
    while (offset + 8 <= bytes.length) {
        const length = view.getUint32(offset);
        const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
        const data = bytes.subarray(offset + 8, offset + 8 + length);
        chunks.push({ type, data });
        offset += 12 + length;
        if (type === 'IEND') {
            break;
        }
    }
    return chunks;
}

export function writeChunks(chunks: PngChunk[]): Uint8Array {
    const total = 8 + chunks.reduce((sum, c) => sum + 12 + c.data.length, 0);
    const out = new Uint8Array(total);
    const view = new DataView(out.buffer);
    out.set(SIGNATURE, 0);
    let offset = 8;
    for (const chunk of chunks) {
        view.setUint32(offset, chunk.data.length);
        const typeBytes = Uint8Array.from(chunk.type, c => c.charCodeAt(0));
        out.set(typeBytes, offset + 4);
        out.set(chunk.data, offset + 8);
        const crcInput = new Uint8Array(4 + chunk.data.length);
        crcInput.set(typeBytes, 0);
        crcInput.set(chunk.data, 4);
        view.setUint32(offset + 8 + chunk.data.length, crc32(crcInput));
        offset += 12 + chunk.data.length;
    }
    return out;
}

/** Returns all text chunks as keyword → text. */
export function readTextChunks(bytes: Uint8Array): Map<string, string> {
    const result = new Map<string, string>();
    for (const chunk of readChunks(bytes)) {
        if (chunk.type === 'tEXt') {
            const zero = chunk.data.indexOf(0);
            if (zero < 0) {
                continue;
            }
            const keyword = String.fromCharCode(...chunk.data.subarray(0, zero));
            const text = Array.from(chunk.data.subarray(zero + 1), b => String.fromCharCode(b)).join('');
            result.set(keyword.toLowerCase(), text);
        } else if (chunk.type === 'iTXt') {
            const zero = chunk.data.indexOf(0);
            if (zero < 0 || chunk.data[zero + 1] !== 0) {
                // Compressed iTXt is not used by card tools.
                continue;
            }
            const keyword = String.fromCharCode(...chunk.data.subarray(0, zero));
            let p = zero + 3;
            p = chunk.data.indexOf(0, p) + 1;
            p = chunk.data.indexOf(0, p) + 1;
            result.set(keyword.toLowerCase(), new TextDecoder().decode(chunk.data.subarray(p)));
        }
    }
    return result;
}

/** Replaces card metadata chunks with the given keyword → latin1 text map. */
export function writeTextChunks(bytes: Uint8Array, texts: Record<string, string>): Uint8Array {
    const keys = Object.keys(texts).map(k => k.toLowerCase());
    const chunks = readChunks(bytes).filter(chunk => {
        if (chunk.type !== 'tEXt') {
            return true;
        }
        const zero = chunk.data.indexOf(0);
        const keyword = String.fromCharCode(...chunk.data.subarray(0, Math.max(zero, 0))).toLowerCase();
        return !keys.includes(keyword);
    });
    const iend = chunks.findIndex(c => c.type === 'IEND');
    const added = Object.entries(texts).map(([keyword, text]) => ({
        type: 'tEXt',
        data: Uint8Array.from(`${keyword}\0${text}`, c => c.charCodeAt(0) & 0xff),
    }));
    chunks.splice(iend < 0 ? chunks.length : iend, 0, ...added);
    return writeChunks(chunks);
}

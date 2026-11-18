// Normalizes model output into readable text.
//
// Some presets (e.g. Meowssiah with SPreset) expect the model to answer through a tool call whose
// JSON arguments hold the reply parts; without that runtime the model may print the JSON itself, or
// prose full of literal "\n" escapes. This turns both back into the tagged text the preset's display
// regex expects. Port of SPreset's toolCallFormatter rules.

const TAGS: Record<string, string> = {
    think_nya: 'think_nya',
    game_content: 'game',
    game: 'game',
    options: 'options',
    summary: 'summary',
    comment: 'comment',
};

const PRIORITY = ['think_nya', 'game_content', 'game', 'story_body', 'extra', 'options', 'summary', 'comment'];

function unescapeJson(str: string): string {
    return str
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
}

/** Extracts "key": "value" pairs from possibly truncated JSON (streaming). */
function parsePartialArgs(raw: string): Record<string, string> {
    const result: Record<string, string> = {};
    const re = /"([a-zA-Z0-9_]+)"\s*:\s*"((?:\\.|[^"\\])*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw)) !== null) {
        result[m[1]] = unescapeJson(m[2]);
    }
    return result;
}

function wrapTag(value: string, tag: string | null): string {
    const trimmed = value.trim();
    if (!trimmed || !tag) return trimmed;
    if (new RegExp(`<${tag}[\\s>]`, 'i').test(trimmed) && new RegExp(`</${tag}[\\s>]`, 'i').test(trimmed)) return trimmed;
    if (tag === 'comment' && /^<details[\s>]/i.test(trimmed)) return trimmed;
    if (tag === 'game' && /^<([a-zA-Z0-9_-]+)>[\s\S]*<\/\1>$/.test(trimmed)) return trimmed;
    return `<${tag}>\n${trimmed}\n</${tag}>`;
}

/** Formats reply-tool arguments as tagged text (SPreset toolCallFormatter). */
export function formatReplyArgs(args: Record<string, unknown>): string {
    if (typeof args.content === 'string' && Object.keys(args).length === 1) {
        return args.content;
    }
    const extra = Object.keys(args).filter(k => !PRIORITY.includes(k) && k !== 'nya_oath');
    const parts: string[] = [];
    for (const key of [...PRIORITY, ...extra]) {
        if (!(key in args)) continue;
        let value = String(args[key] ?? '').trim();
        if (!value) continue;
        // 2.1.7: placeholders for folded history thinking (pg models) are never shown.
        if (/^\[?\s*REDACTED\b/i.test(value)) continue;
        if (key === 'think_nya') {
            // 2.1.7: MVU-style calls the model only mentions while thinking (_.set(…)) must not run.
            value = value.replace(/`{3,}/g, '').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/_\.(?=(?:set|insert|assign|remove|unset|delete|add)\s*\()/g, '_\u200c.');
        }
        let wrapped = wrapTag(value, TAGS[key] ?? null);
        if (key === 'think_nya' && wrapped && !wrapped.includes('<!--</think>-->')) {
            wrapped += '<!--</think>-->';
        }
        parts.push(wrapped);
    }
    return parts.filter(Boolean).join('\n');
}

const REPLY_KEYS = /"(?:think_nya|game_content|game|story_body|options|summary|comment|content)"\s*:/;

/** Escapes raw control characters inside JSON strings (models often emit real newlines there). */
function repairJson(body: string): string {
    let out = '';
    let inString = false;
    let escaped = false;
    for (const ch of body) {
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inString = false;
            else if (ch === '\n') { out += '\\n'; continue; }
            else if (ch === '\r') { out += '\\r'; continue; }
            else if (ch === '\t') { out += '\\t'; continue; }
        } else if (ch === '"') {
            inString = true;
        }
        out += ch;
    }
    return out;
}

// Pseudo tool-call wrappers models print as text: <|tool_call|>, <｜tool▁call▁begin｜>, <tool_call>, fn names.
const WRAPPER_START = /^(?:\s*(?:<[|｜][^>\n]{0,48}[|｜]>|<\/?tool_call>|[a-z_]{2,40}(?=\s*(?:\(|\n|<[|｜]|\{))\s*\(?))+\s*(?=\{)/i;
const WRAPPER_END = /\)?\s*(?:<\/?[|｜]?[^>\n]{0,48}[|｜]?>|<\/tool_call>)*\s*$/;

/** If the whole reply is (possibly fenced, wrapped or truncated) reply-tool JSON, format it. */
function fromReplyJson(text: string): string | null {
    let body = text.trim();
    const fence = body.match(/^```(?:json)?\s*\n?([\s\S]*?)(?:\n?```)?$/);
    if (fence && fence[1].trim().startsWith('{')) body = fence[1].trim();
    body = body.replace(WRAPPER_START, '');
    if (!body.startsWith('{') || !REPLY_KEYS.test(body.slice(0, 400))) {
        return null;
    }
    const lastBrace = body.lastIndexOf('}');
    if (lastBrace > 0) {
        body = body.slice(0, lastBrace + 1) + body.slice(lastBrace + 1).replace(WRAPPER_END, '');
    }
    let args: Record<string, unknown> | null = null;
    try {
        const parsed = JSON.parse(repairJson(body));
        if (parsed && typeof parsed === 'object') {
            args = (parsed.arguments && typeof parsed.arguments === 'object') ? parsed.arguments : parsed;
        }
    } catch {
        args = parsePartialArgs(body);
    }
    if (!args || !Object.keys(args).length) return null;
    return formatReplyArgs(args);
}

/** Replaces literal \n, \t and \" escapes outside code blocks when the text is evidently escaped. */
export function unescapeLiteral(text: string): string {
    if (!/\\[nrt"]/.test(text)) return text;
    const segments = text.split(/(```[\s\S]*?```)/g);
    const literalNewlines = segments.filter((_, i) => i % 2 === 0).join('').match(/(?<!\\)\\n/g)?.length ?? 0;
    if (literalNewlines === 0) return text;
    return segments.map((seg, i) => i % 2 === 1 ? seg : seg
        .replace(/(?<!\\)\\r\\n/g, '\n')
        .replace(/(?<!\\)\\n/g, '\n')
        .replace(/(?<!\\)\\t/g, '\t')
        .replace(/(?<!\\)\\"/g, '"'),
    ).join('');
}

const INLINE_CALL = /(?:<[|｜][^>\n]{0,48}[|｜]>\s*(?:[a-z_]{2,40}\s*)?)+(?=\{)/i;

export function normalizeModelOutput(text: string): string {
    if (!text) return text;
    let formatted = fromReplyJson(text);
    if (formatted === null) {
        // Prose first (e.g. thinking), then a pseudo tool call carrying the reply.
        const m = text.match(INLINE_CALL);
        if (m && m.index) {
            const tail = fromReplyJson(text.slice(m.index));
            if (tail !== null) formatted = `${text.slice(0, m.index).trimEnd()}\n${tail}`;
        }
    }
    return unescapeLiteral(formatted ?? text);
}

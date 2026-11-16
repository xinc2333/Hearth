// Structure of card text. Card fields and lorebook entries are free text, but most are written as
// an outline: a wrapping <tag>…</tag>, "key: value" lines nested by indentation (YAML-like, rarely
// valid YAML), # headings or 【heading】 lines. This module finds that outline without changing the
// text, so a part can be addressed by its own headings ("角色档案 › 基本信息 › 年龄") and replaced
// while every other line stays byte-for-byte the same.

export interface Section {
    /** Heading as written, without markers: "Xunyi" for <Xunyi>, "年龄" for "年龄: …". */
    name: string;
    kind: 'tag' | 'heading' | 'key';
    /** First line (the heading line) and the line after the last one, 0-based. */
    start: number;
    end: number;
    /** Column of the heading line. */
    indent: number;
    children: Section[];
}

const TAG_OPEN = /^(\s*)<([A-Za-z_一-鿿][\w一-鿿.-]*)(?:\s[^>]*)?>\s*$/;
const TAG_CLOSE = /^\s*<\/([A-Za-z_一-鿿][\w一-鿿.-]*)>\s*$/;
const MD_HEADING = /^(\s*)(#{1,6})\s+(.+?)\s*#*\s*$/;
const BRACKET_HEADING = /^(\s*)【([^】\n]{1,40})】\s*$/;
// "key: value" or "- key: value". The key may not start with characters that begin other syntax.
const KEY = /^(\s*)(?:-\s+)?([^\s:：#<>{}[\]"'`|@*\-][^:：\n]{0,60}?)\s*[:：](?:\s+(.*))?$/;
const BLOCK_SCALAR = /^[|>][+-]?\d*\s*$/;

/** Normalized heading for matching: no markers, spaces or case. */
export function normalizeName(name: string): string {
    return name.replace(/[<>/【】#\s:：「」『』"'`*]/g, '').toLowerCase();
}

/**
 * Finds the outline of a text. Opaque regions (code fences, EJS blocks, block scalars) never
 * produce headings. Text that has no outline returns [].
 */
export function outline(text: string): Section[] {
    const lines = text.split('\n');
    const root: Section = { name: '', kind: 'tag', start: 0, end: lines.length, indent: -1, children: [] };
    // rank: tags 0 (closed only by their closing tag), headings 1–7, keys 10 + column.
    const stack: { node: Section; rank: number; tag?: string; block?: number }[] = [{ node: root, rank: -1 }];
    let fence = false;
    let ejs = false;
    const close = (line: number, until: (entry: (typeof stack)[number]) => boolean) => {
        while (stack.length > 1 && !until(stack[stack.length - 1])) stack.pop()!.node.end = line;
    };
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (/^(```|~~~)/.test(trimmed)) { fence = !fence; continue; }
        if (fence) continue;
        if (ejs) { if (trimmed.includes('%>')) ejs = false; continue; }
        if (trimmed.startsWith('<%')) { ejs = !trimmed.includes('%>'); continue; }
        if (!trimmed) continue;
        const column = line.length - line.trimStart().length;
        // Inside a "key: |" block scalar, deeper lines are text.
        const top = stack[stack.length - 1];
        if (top.block !== undefined && column > top.block) continue;
        if (top.block !== undefined) top.block = undefined;

        const closing = trimmed.match(TAG_CLOSE);
        if (closing) {
            const at = stack.findLastIndex(e => e.tag === closing[1]);
            if (at > 0) {
                while (stack.length > at + 1) stack.pop()!.node.end = i;
                stack.pop()!.node.end = i + 1;
            }
            continue;
        }
        let found: { name: string; kind: Section['kind']; rank: number; tag?: string; block?: boolean } | null = null;
        const tag = line.match(TAG_OPEN);
        const md = !tag && line.match(MD_HEADING);
        const bracket = !tag && !md && line.match(BRACKET_HEADING);
        const key = !tag && !md && !bracket && line.match(KEY);
        if (tag && text.includes(`</${tag[2]}>`)) found = { name: tag[2], kind: 'tag', rank: 0, tag: tag[2] };
        else if (md) found = { name: md[3], kind: 'heading', rank: md[2].length };
        else if (bracket) found = { name: bracket[2].trim(), kind: 'heading', rank: 7 };
        else if (key && !/^https?$/i.test(key[2])) found = { name: key[2].trim(), kind: 'key', rank: 10 + column, block: BLOCK_SCALAR.test(key[3] ?? '') };
        if (!found) continue;
        // Close finer sections; tags stay open until their closing tag.
        close(i, e => e.rank === -1 || e.tag !== undefined || e.rank < found!.rank);
        const node: Section = { name: found.name, kind: found.kind, start: i, end: lines.length, indent: column, children: [] };
        stack[stack.length - 1].node.children.push(node);
        stack.push({ node, rank: found.rank, tag: found.tag, block: found.block ? column : undefined });
    }
    close(lines.length, e => e.rank === -1);
    // A section ends at its last non-blank line, so replacing it keeps the blank lines around it.
    const trim = (s: Section) => {
        while (s.end > s.start + 1 && !lines[s.end - 1].trim()) s.end--;
        s.children.forEach(trim);
    };
    root.children.forEach(trim);
    return root.children;
}

/** Every section with its full heading path. */
export function flatten(sections: Section[], parents: string[] = []): { path: string[]; section: Section }[] {
    return sections.flatMap(s => [{ path: [...parents, s.name], section: s }, ...flatten(s.children, [...parents, s.name])]);
}

export type FindResult = { section: Section } | { error: string };

/**
 * Finds the section a heading path points to. The path may leave out leading levels (the wrapping
 * tag, or more) and may skip levels in between, as long as the match is unique. "名字#2" picks the
 * second of several sections with the same heading.
 */
export function findSection(text: string, path: string[]): FindResult {
    const all = flatten(outline(text));
    const want = path.map(p => {
        const m = p.match(/^(.*?)#(\d+)$/);
        return { name: normalizeName(m ? m[1] : p), nth: m ? Number(m[2]) : 0 };
    }).filter(w => w.name);
    if (!want.length) return { error: '没有指明段落' };
    const last = want[want.length - 1];
    const norm = (p: string[]) => p.map(normalizeName);
    const endsWith = (p: string[]) => {
        const n = norm(p);
        return want.every((w, i) => n[n.length - want.length + i] === w.name);
    };
    const inOrder = (p: string[]) => {
        const n = norm(p);
        if (n[n.length - 1] !== last.name) return false;
        let at = 0;
        for (const w of want.slice(0, -1)) {
            at = n.indexOf(w.name, at);
            if (at < 0 || at >= n.length - 1) return false;
            at++;
        }
        return true;
    };
    for (const test of [(p: string[]) => norm(p).join('/') === want.map(w => w.name).join('/'), endsWith, inOrder]) {
        const hits = all.filter(h => test(h.path));
        if (!hits.length) continue;
        if (last.nth) {
            const hit = hits[last.nth - 1];
            return hit ? { section: hit.section } : { error: `「${path.join(' › ')}」只有 ${hits.length} 处` };
        }
        if (hits.length === 1) return { section: hits[0].section };
        return { error: `「${path.join(' › ')}」有 ${hits.length} 处，请写出更完整的路径，或在最后加 #序号` };
    }
    return { error: `找不到段落「${path.join(' › ')}」` };
}

/**
 * Moves a block so its first line starts at `column`, shifting every line by the same amount (never
 * below column 0). Relative indentation is kept, and a block that already sits at `column` — such as
 * a section written back unchanged — is left exactly as it is.
 */
function reindent(body: string, column: number): string[] {
    const lines = body.replace(/^\n+|\s+$/g, '').split('\n');
    const first = lines.find(l => l.trim()) ?? '';
    const shift = column - (first.length - first.trimStart().length);
    return lines.map(l => {
        if (!l.trim() || !shift) return l;
        const indent = l.length - l.trimStart().length;
        return ' '.repeat(Math.max(0, indent + shift)) + l.trimStart();
    });
}

/** Text of a section (its heading line through its last line). */
export function sectionText(text: string, section: Section): string {
    return text.split('\n').slice(section.start, section.end).join('\n');
}

/**
 * Replaces a section with `body`. The body is moved to the section's indentation. When the body
 * leaves out the section's own heading line, the heading is kept and the body becomes its content.
 */
export function replaceSection(text: string, section: Section, body: string): string {
    const lines = text.split('\n');
    const heading = lines[section.start];
    let next = reindent(body, section.indent);
    const first = next.find(l => l.trim())?.trim() ?? '';
    const headed = section.kind === 'tag'
        ? first.startsWith(`<${section.name}`)
        : normalizeName(first.replace(/^-\s+/, '').split(/[:：]/)[0]) === normalizeName(section.name)
            || (section.kind === 'heading' && normalizeName(first) === normalizeName(section.name));
    if (!headed) {
        if (section.kind === 'key' && next.filter(l => l.trim()).length === 1) {
            // A one-line value for "key: value".
            const prefix = heading.match(/^(\s*(?:-\s+)?[^:：]+[:：])/)?.[1] ?? `${' '.repeat(section.indent)}${section.name}:`;
            next = [`${prefix} ${first}`];
        } else if (section.kind === 'tag') {
            next = [heading, ...reindent(body, section.indent), ...lines.slice(section.end - 1, section.end)];
        } else {
            const head = section.kind === 'key' ? heading.replace(/([:：])\s*.*$/, '$1') : heading;
            next = [head, ...reindent(body, section.indent + 2)];
        }
    }
    return [...lines.slice(0, section.start), ...next, ...lines.slice(section.end)].join('\n');
}

export function insertAfterSection(text: string, section: Section, body: string): string {
    const lines = text.split('\n');
    return [...lines.slice(0, section.end), ...reindent(body, section.indent), ...lines.slice(section.end)].join('\n');
}

export function removeSection(text: string, section: Section): string {
    const lines = text.split('\n');
    return [...lines.slice(0, section.start), ...lines.slice(section.end)].join('\n');
}

/**
 * Replaces `find` with `replacement` where it occurs exactly once. Falls back to matching with line
 * endings and runs of spaces ignored, since models rarely reproduce whitespace exactly.
 */
export function replaceOnce(text: string, find: string, replacement: string): { text: string } | { error: string } {
    const exact = find.replace(/\r\n/g, '\n');
    if (!exact.trim()) return { error: '原文是空的' };
    const count = text.split(exact).length - 1;
    if (count === 1) return { text: text.replace(exact, () => replacement) };
    if (count > 1) return { error: `原文出现了 ${count} 次，请多写几个字让它唯一` };
    const pattern = exact.trim().split(/\s+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
    const matches = [...text.matchAll(new RegExp(pattern, 'g'))];
    if (matches.length === 1) {
        const m = matches[0];
        return { text: text.slice(0, m.index) + replacement.trim() + text.slice(m.index + m[0].length) };
    }
    return { error: matches.length ? `原文出现了 ${matches.length} 次，请多写几个字让它唯一` : '没有找到要替换的原文' };
}

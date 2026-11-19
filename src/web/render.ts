// Message rendering: display-only regex → markdown → sanitized HTML. Full HTML documents in code
// blocks (status panels, "frontend cards") are split out and rendered in sandboxed iframes
// (card-frame.ts, card-host.ts).

import DOMPurify from 'dompurify';
import { Marked } from 'marked';

import { createMacroContext, evaluateMacros } from '../core/macros.ts';
import { applyRegex } from '../core/regex.ts';
import type { RegexPlacement, RegexScript } from '../core/types.ts';

const marked = new Marked({ gfm: true, breaks: true });

/** `styled`: the HTML has markup the card styled itself; its message box contains it (styles.css .card-html). */
export type Segment = { type: 'html'; html: string; styled?: boolean } | { type: 'frame'; html: string };

export function displayText(text: string, opts: { regex: RegexScript[]; user: string; char: string; placement: RegexPlacement; depth: number }): string {
    if (!opts.regex.length) return text;
    const ctx = createMacroContext({ user: opts.user, char: opts.char });
    return applyRegex(opts.regex, text, opts.placement, {
        isDisplay: true,
        depth: opts.depth,
        macros: (t, transform) => evaluateMacros(t, ctx, { transform }),
    });
}

const FENCE = /```[^\n`]*\n([\s\S]*?)```/g;
const isDocument = (code: string) => /<(?:!doctype|html|body)[\s>]/i.test(code);

const CODE = /(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g;

/**
 * CommonMark only opens or closes emphasis next to spaces or punctuation in a way that fails for
 * Chinese (`*她笑了。*然后` stays literal). Outside code, turn the unambiguous cases into tags first.
 */
function cjkEmphasis(markdown: string): string {
    if (!markdown.includes('*')) return markdown;
    return markdown.split(CODE).map((part, i) => (i % 2 ? part : part
        .replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, '<strong>$1</strong>')
        .replace(/(?<![\\*\w/])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?![*/])/g, '<em>$1</em>'))).join('');
}

// A quotation may run to the end of its paragraph without closing (speech continuing in the next
// paragraph); straight quotes must close, they are too easily something else.
const QUOTED = /“[^”\n]*(?:”|$)|「[^」\n]*(?:」|$)|『[^』\n]*(?:』|$)|"[^"\n]+"/g;
const BLOCKS = 'p, li, td, th, h1, h2, h3, h4, h5, h6, blockquote, summary, div';
/** Markup a card wrote itself (regex 美化 panels): Hearth's typesetting leaves it as it is. */
const CARD_MARKUP = '[class], [style]';

/**
 * A card's <style>, limited to its message: rules go inside `@scope` (whose root is the message),
 * while @keyframes, @font-face and @import stay outside, where they work. Comments are dropped.
 */
export function scopeCss(css: string): string {
    const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const outside: string[] = [];
    let inside = '';
    let i = 0;
    while (i < src.length) {
        const at = src.slice(i).match(/^\s*@(-webkit-)?(keyframes|font-face|import|property)\b/i);
        // A top-level block: up to its matching brace (or the semicolon of an @import).
        let depth = 0, j = i, end = -1;
        for (; j < src.length; j++) {
            const ch = src[j];
            if (ch === '{') depth++;
            else if (ch === '}') { depth--; if (depth <= 0) { end = j + 1; break; } }
            else if (ch === ';' && depth === 0 && at?.[2]?.toLowerCase() === 'import') { end = j + 1; break; }
        }
        if (end < 0) end = src.length;
        const block = src.slice(i, end);
        if (at) outside.push(block.trim());
        else inside += block;
        i = end;
    }
    const imports = outside.filter(b => /^@import/i.test(b));
    const rest = outside.filter(b => !/^@import/i.test(b));
    return [...imports, ...rest, inside.trim() ? `@scope {\n${inside.trim()}\n}` : ''].filter(Boolean).join('\n');
}

/** Wraps quoted dialogue in spans. Quotes are matched per paragraph, so they may contain bold or italics. */
function markQuotes(root: DocumentFragment) {
    const groups = new Map<Node, Text[]>();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        const parent = node.parentElement;
        if (parent?.closest('code, pre, a') || parent?.closest(CARD_MARKUP)) continue;
        const block = parent?.closest(BLOCKS) ?? node;
        const list = groups.get(block);
        if (list) list.push(node);
        else groups.set(block, [node]);
    }
    for (const nodes of groups.values()) {
        const full = nodes.map(n => n.data).join('');
        if (!/["“「『]/.test(full)) continue;
        const ranges = Array.from(full.matchAll(QUOTED), m => [m.index, m.index + m[0].length]);
        let offset = 0;
        for (const node of nodes) {
            const start = offset;
            const end = offset += node.data.length;
            const cuts = ranges.filter(([a, b]) => a < end && b > start).map(([a, b]) => [Math.max(a, start) - start, Math.min(b, end) - start]);
            if (!cuts.length) continue;
            const frag = document.createDocumentFragment();
            let pos = 0;
            for (const [a, b] of cuts) {
                if (a > pos) frag.append(node.data.slice(pos, a));
                const q = document.createElement('span');
                q.className = 'quote';
                q.textContent = node.data.slice(a, b);
                frag.append(q);
                pos = b;
            }
            if (pos < node.data.length) frag.append(node.data.slice(pos));
            node.replaceWith(frag);
        }
    }
}

/** Typesetting passes over the sanitized HTML: real paragraphs, scrollable tables, marked dialogue. */
function typeset(html: string): string {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const root = tpl.content;

    // Models separate paragraphs with single newlines, which markdown renders as <br> inside one
    // <p>. Split them so every paragraph gets the same spacing and indent.
    // A card's own <style> works for its whole message: moved to the top and scoped to the message.
    const styles = Array.from(root.querySelectorAll('style'));
    for (const style of styles) style.textContent = scopeCss(style.textContent ?? '');
    root.prepend(...styles);

    for (const p of Array.from(root.querySelectorAll('p'))) {
        if (!p.querySelector(':scope > br') || p.closest(CARD_MARKUP)) continue;
        const parts: HTMLParagraphElement[] = [];
        let current = document.createElement('p');
        for (const node of Array.from(p.childNodes)) {
            if (node.nodeName === 'BR') {
                if (current.childNodes.length) parts.push(current);
                current = document.createElement('p');
            } else if (current.childNodes.length || node.nodeType !== Node.TEXT_NODE || node.textContent?.trim()) {
                current.append(node);
            }
        }
        if (current.childNodes.length) parts.push(current);
        p.replaceWith(...parts);
    }
    // Hand-typed indents (full-width spaces) would double up with the reading indent.
    for (const p of Array.from(root.querySelectorAll('p'))) {
        if (p.closest(CARD_MARKUP)) continue;
        const first = p.firstChild;
        if (first?.nodeType === Node.TEXT_NODE) first.textContent = (first.textContent ?? '').replace(/^[\s\u3000]+/, '');
    }
    for (const table of Array.from(root.querySelectorAll('table'))) {
        if (table.closest(CARD_MARKUP)) continue;
        const wrap = document.createElement('div');
        wrap.className = 'table-wrap';
        table.replaceWith(wrap);
        wrap.append(table);
    }

    markQuotes(root);
    return tpl.innerHTML;
}

const BLOCK_TAGS = 'div|details|section|article|aside|header|footer|nav|figure|table|center|style|svg|ul|ol|dl|blockquote';
const BLOCK_OPEN = new RegExp(`^[ \\t]*<(${BLOCK_TAGS})\\b[^>]*>`, 'gim');

/**
 * HTML blocks a card writes (regex 美化 panels) are kept whole, up to their matching closing tag,
 * like 酒馆's markdown renderer does. Markdown would end them at the first blank line and turn the
 * indented lines after it into code. Returns the text with placeholders and the blocks.
 */
export function protectHtmlBlocks(markdown: string): { text: string; blocks: string[] } {
    const blocks: string[] = [];
    let text = '';
    let last = 0;
    BLOCK_OPEN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = BLOCK_OPEN.exec(markdown))) {
        const tag = m[1].toLowerCase();
        const tags = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, 'gi');
        tags.lastIndex = m.index;
        let depth = 0;
        let end = -1;
        let t: RegExpExecArray | null;
        while ((t = tags.exec(markdown))) {
            if (t[2]) continue;
            depth += t[1] ? -1 : 1;
            if (depth === 0) { end = t.index + t[0].length; break; }
        }
        if (end < 0) continue;
        text += `${markdown.slice(last, m.index)}\n\n<!--hearth-block-${blocks.length}-->\n\n`;
        blocks.push(markdown.slice(m.index, end));
        last = end;
        BLOCK_OPEN.lastIndex = end;
    }
    return { text: text + markdown.slice(last), blocks };
}

function toHtml(markdown: string): string {
    const { text, blocks } = protectHtmlBlocks(markdown);
    const raw = (marked.parse(cjkEmphasis(text), { async: false }) as string)
        .replace(/<!--hearth-block-(\d+)-->/g, (_m, i: string) => blocks[Number(i)] ?? '');
    // Cards style their panels (酒馆 shows <style> and style attributes in messages too); scripts,
    // frames and forms stay out. FORCE_BODY keeps a leading <style>.
    const clean = DOMPurify.sanitize(raw, {
        ADD_TAGS: ['details', 'summary', 'style'],
        FORBID_TAGS: ['script', 'iframe', 'frame', 'form', 'object', 'embed', 'link', 'meta', 'base'],
        FORBID_ATTR: ['autofocus'],
        FORCE_BODY: true,
    });
    return typeset(clean);
}

/** Readable characters in a message: what the reader sees, without code blocks, tags or spaces. */
export function countChars(text: string): number {
    return text.replace(/```[\s\S]*?(?:```|$)/g, '').replace(/<[^>]+>/g, '').replace(/[\s*_#>`~-]+/g, '').length;
}

/** `frames`: render HTML documents in sandboxed frames (the 酒馆助手 plugin is on); otherwise they stay code. */
export function renderSegments(text: string, frames = true): Segment[] {
    const segments: Segment[] = [];
    let last = 0;
    for (const m of text.matchAll(FENCE)) {
        if (!frames || !isDocument(m[1])) continue;
        const before = text.slice(last, m.index);
        if (before.trim()) segments.push(htmlSegment(before));
        segments.push({ type: 'frame', html: m[1] });
        last = (m.index ?? 0) + m[0].length;
    }
    const rest = text.slice(last);
    if (rest.trim() || !segments.length) segments.push(htmlSegment(rest));
    return segments;
}

function htmlSegment(markdown: string): Segment {
    const html = toHtml(markdown);
    return { type: 'html', html, styled: /<style[\s>]|\sstyle="|\sclass="(?!quote"|table-wrap"|language-)/.test(html) };
}

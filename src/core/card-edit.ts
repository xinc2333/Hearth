// The edit block an AI reply ends with in 编辑 mode. Like MVU's <UpdateVariable>, the model writes
// its changes in one fixed-format block and Hearth applies them. Content is plain text between
// header lines, never JSON, so long Chinese prose needs no escaping:
//
//   <card_edit>
//   【改写】世界书#3 › 角色档案 › 基本信息 › 年龄
//   年龄: 接近30岁
//   【替换】角色卡 › 开场白
//   <<<<<<< 原文
//   秋深矣
//   =======
//   秋意正浓
//   >>>>>>> 新文
//   【新增】世界书「薰香与古董店」
//   标题：青石巷书摊｜关键词：书摊、青石巷｜触发：关键词
//   …
//   【删除】世界书#12
//   【设置】世界书#4
//   关键词：白玫、旧物店
//   </card_edit>

export type CardEditAction = '改写' | '替换' | '新增' | '删除' | '设置';

export interface CardEditOp {
    action: CardEditAction;
    /** The address as written after the header. */
    target: string;
    body: string;
    /** For 替换: original / replacement pairs. */
    pairs?: { find: string; replace: string }[];
}

const OPEN = /<card_edit>/i;
const CLOSE = /<\/card_edit>/i;
const HEADER = /^\s*【(改写|替换|新增|删除|设置)】\s*(.*?)\s*$/;

/** Splits a reply into the prose shown to the reader and the edit block. */
export function extractCardEdit(text: string): { prose: string; block: string | null; complete: boolean } {
    const open = text.search(OPEN);
    if (open < 0) return { prose: text, block: null, complete: false };
    const rest = text.slice(open).replace(OPEN, '');
    const close = rest.search(CLOSE);
    const block = close < 0 ? rest : rest.slice(0, close);
    const after = close < 0 ? '' : rest.slice(close).replace(CLOSE, '');
    // The block may sit in a code fence; drop the fence with it.
    const before = text.slice(0, open).replace(/```[^\n`]*\n?\s*$/, '');
    const tail = after.replace(/^\s*```/, '').trim();
    return { prose: before.trimEnd() + (tail ? `\n\n${tail}` : ''), block, complete: close >= 0 };
}

function parsePairs(body: string): { find: string; replace: string }[] {
    const pairs: { find: string; replace: string }[] = [];
    const re = /^<{5,}[^\n]*\n([\s\S]*?)\n?^={5,}\s*\n([\s\S]*?)\n?^>{5,}[^\n]*$/gm;
    for (const m of body.matchAll(re)) pairs.push({ find: m[1], replace: m[2] });
    return pairs;
}

export function parseCardEdits(block: string): CardEditOp[] {
    const ops: CardEditOp[] = [];
    let current: { action: CardEditAction; target: string; lines: string[] } | null = null;
    const flush = () => {
        if (!current) return;
        const body = current.lines.join('\n').replace(/^\n+|\s+$/g, '');
        ops.push({ action: current.action, target: current.target, body, ...(current.action === '替换' ? { pairs: parsePairs(body) } : {}) });
    };
    for (const line of block.split('\n')) {
        const m = line.match(HEADER);
        if (m) {
            flush();
            current = { action: m[1] as CardEditAction, target: m[2], lines: [] };
        } else if (current) {
            current.lines.push(line);
        }
    }
    flush();
    return ops;
}

/** "标题：…｜关键词：…" lines at the top of a 新增 / 设置 body, and the content after them. */
export function parseFields(body: string): { fields: Record<string, string>; content: string } {
    const fields: Record<string, string> = {};
    const lines = body.split('\n');
    let i = 0;
    for (; i < lines.length; i++) {
        const parts = lines[i].split(/[｜|]/).map(p => p.trim()).filter(Boolean);
        const pairs = parts.map(p => p.match(/^(标题|关键词|次要关键词|触发|启用|位置|深度|顺序|概率)\s*[:：]\s*(.*)$/));
        if (!parts.length || pairs.some(p => !p)) break;
        for (const p of pairs) fields[p![1]] = p![2].trim();
    }
    return { fields, content: lines.slice(i).join('\n').replace(/^\n+|\s+$/g, '') };
}

/**
 * Why an entry is read-only to the AI, or null. Entries that drive variables or templates can break
 * the card when changed, so they stay read-only unless the user unlocks them.
 */
export function protectedReason(entry: { title: string; content: string; extra?: Record<string, unknown> }, ignoreUnlock = false): string | null {
    if (!ignoreUnlock && (entry.extra?.hearth as { aiEditable?: boolean } | undefined)?.aiEditable) return null;
    if (/\[initvar\]/i.test(entry.title)) return '变量初始化';
    if (/\[mvu_update\]/i.test(entry.title)) return '变量规则';
    if (entry.content.includes('<%')) return '模板代码';
    if (/{{\s*(?:format_\w+_variable|getvar|setvar|getglobalvar|setglobalvar)\b/i.test(entry.content)) return '变量显示';
    return null;
}

export const splitList = (value: string) => value.split(/[,，、;；\s]+/).map(v => v.trim()).filter(Boolean);

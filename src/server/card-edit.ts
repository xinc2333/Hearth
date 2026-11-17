// 编辑 mode: the AI talks about the current card and changes it in one ordinary reply that ends with
// a <card_edit> block (see core/card-edit.ts). This file builds that request — the card as an
// addressable document — and applies the block through the change channel, so every reply's edits
// are one undoable change per card or lorebook.

import { extractCardEdit, parseCardEdits, parseFields, protectedReason, splitList } from '../core/card-edit.ts';

export { protectedReason };
import { newLoreEntry } from '../core/lore.ts';
import { findSection, insertAfterSection, removeSection, replaceOnce, replaceSection, sectionText } from '../core/doc.ts';
import { applyOps, type Op } from '../core/ops.ts';
import { estimateTokens, MESSAGE_OVERHEAD } from '../core/tokens.ts';
import type { CardEditResult, CardEdits, Character, CharacterFields, Chat, ChatMessage, LoreEntry, LorePosition, Lorebook, Persona } from '../core/types.ts';
import type { EditTask, EditTaskContext } from './plugins.ts';
import type { Store } from './store.ts';

type TextField = Exclude<keyof CharacterFields, 'alternateGreetings' | 'depthPrompt'>;

const FIELDS: { key: TextField | 'name' | 'depthPrompt'; label: string }[] = [
    { key: 'name', label: '名字' },
    { key: 'description', label: '描述' },
    { key: 'personality', label: '性格' },
    { key: 'scenario', label: '场景' },
    { key: 'firstMessage', label: '开场白' },
    { key: 'exampleDialogue', label: '示例对话' },
    { key: 'systemPrompt', label: '主提示词' },
    { key: 'postHistoryInstructions', label: '后置指令' },
    { key: 'creatorNotes', label: '作者备注' },
    { key: 'depthPrompt', label: '角色备注' },
];

const POSITIONS: Record<string, LorePosition> = {
    角色前: 'before_char', 角色定义之前: 'before_char', 角色后: 'after_char', 角色定义之后: 'after_char',
    作者注释前: 'an_top', 作者注释后: 'an_bottom', 示例前: 'em_top', 示例后: 'em_bottom', 聊天中: 'at_depth', 深度: 'at_depth',
};
const POSITION_LABEL: Record<LorePosition, string> = {
    before_char: '角色前', after_char: '角色后', an_top: '作者注释前', an_bottom: '作者注释后', at_depth: '聊天中', em_top: '示例前', em_bottom: '示例后', outlet: '出口',
};

export const EDIT_INSTRUCTION = `你是角色卡编辑助手，和用户一起修改当前角色卡和它的世界书。

先用简短的话回答用户，或说明你打算怎么改。需要修改时，在回复最后附上一个修改块；只是讨论、不需要修改时不要写修改块。

修改块的格式：
<card_edit>
【改写】地址
（这一段修改后的完整内容，连同它自己的标题行）
【替换】地址
<<<<<<< 原文
（要替换的原文：和资料里的文字完全一致，并且在这一处只出现一次）
=======
（替换后的文字）
>>>>>>> 新文
【新增】世界书「书名」
标题：条目标题｜关键词：词一、词二｜触发：关键词
（条目内容）
【新增】地址 之后
（插在这一段后面的内容）
【删除】地址
【设置】世界书#编号
关键词：词一、词二
触发：常驻
</card_edit>

地址的写法：
- 角色卡字段：「角色卡 › 描述」。字段有：名字、描述、性格、场景、开场白、备选开场白1（2、3…）、示例对话、主提示词、后置指令、作者备注、角色备注。
- 世界书条目：「世界书#编号」，编号见目录。
- 字段或条目里的一段：在后面接上这一段的标题路径，用 › 分隔，例如「世界书#3 › 角色档案 › 基本信息 › 年龄」。标题就是原文里的标签名、「键:」或标题行。
- 【设置】可以改：标题、关键词、次要关键词、触发（常驻 / 关键词）、启用（是 / 否）、位置（角色前、角色后、聊天中…）、深度、顺序、概率。

规则：
- 只改用户要求的地方，其他内容保持原样；沿用原文的写法和格式（标签、缩进、「键: 值」）。
- 只修改下面给出了全文的部分。标着「只读」的不要修改。
- 有标题的段落优先用【改写】；没有结构的文字用【替换】。
- 新增条目前，先看目录里有没有同类条目，有就改那一条。
- 修改块里不要写解释，解释写在修改块前面。`;

export interface EditPrompt {
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
    parts: { role: 'system' | 'user' | 'assistant'; content: string; sources: string[]; tokens: number; messageId?: string }[];
    /** Texts shown in full, keyed like snapshot; only these may be rewritten. */
    shown: Set<string>;
    /** Each shown text as it was when the request was built. */
    snapshot: Map<string, string>;
    tokens: number;
}

const fieldKey = (key: string) => `char:${key}`;
const entryKey = (book: Lorebook, entry: LoreEntry) => `lore:${book.id}:${entry.id}`;

function fieldText(character: Character, key: string): string {
    if (key === 'name') return character.name;
    if (key === 'depthPrompt') return character.fields.depthPrompt.text;
    const greeting = key.match(/^alternateGreetings\.(\d+)$/);
    if (greeting) return character.fields.alternateGreetings[Number(greeting[1])] ?? '';
    return String(character.fields[key as TextField] ?? '');
}

/** A lorebook only this character uses. Shared and global books are read-only. */
export function exclusiveBook(store: Pick<Store, 'list' | 'settings'>, characterId: string, bookId: string): boolean {
    return !store.settings.lore.globalLorebookIds.includes(bookId)
        && !store.list<Character>('character').some(c => c.id !== characterId && c.lorebookIds.includes(bookId))
        && !store.list<Persona>('persona').some(p => p.lorebookId === bookId)
        && !store.list<Chat>('chat').some(c => c.characterId !== characterId && c.lorebookId === bookId);
}

function clip(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Story text for context: no code blocks, edit blocks or variable updates. */
function storyText(text: string): string {
    return text
        .replace(/```[\s\S]*?```/g, '')
        .replace(/<UpdateVariable>[\s\S]*?<\/UpdateVariable>/gi, '')
        .replace(/<(think|thinking|think_nya)>[\s\S]*?<\/\1>/gi, '')
        .replace(/<[^>\n]{1,60}>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function resultSummary(edits: CardEdits | undefined): string {
    if (!edits) return '';
    if (edits.note) return `（${edits.note}）`;
    const lines = edits.results.map(r => `${r.ok ? '✓' : '✗'} ${r.action} ${r.label}${r.ok ? '' : `：${r.reason}`}`);
    return lines.length ? `（修改结果${edits.reverted ? '，用户已撤销' : ''}：\n${lines.join('\n')}）` : '';
}

export function buildEditPrompt(args: {
    store: Pick<Store, 'list' | 'settings'>;
    character: Character;
    books: Lorebook[];
    messages: ChatMessage[];
    userName: string;
    maxContext: number;
    maxTokens: number;
    /** Sections added by plugins' 编辑 tasks. */
    extras?: string[];
}): EditPrompt {
    const { store, character, books, userName } = args;
    const shown = new Set<string>();
    const snapshot = new Map<string, string>();
    // Room for the card itself: what is left after the reply, instructions and conversation.
    const budget = Math.max(6000, Math.min(60000, Math.floor(args.maxContext * 0.6) - args.maxTokens - 6000));
    const edits = args.messages.filter(m => m.mode === 'edit');
    const story = args.messages.filter(m => m.mode !== 'edit' && !m.hidden);
    const request = [...edits].reverse().find(m => m.role === 'user')?.swipes[0]?.content ?? '';
    const recentEdits = edits.slice(-6).map(m => m.swipes[m.activeSwipe]?.content ?? '').join('\n');

    // Candidates for full text, with a relevance score. Small cards are shown whole.
    type Candidate = { key: string; address: string; head: string; text: string; tokens: number; score: number };
    const candidates: Candidate[] = [];
    const fields = [
        ...FIELDS.map(f => ({ key: f.key as string, label: f.label })),
        ...character.fields.alternateGreetings.map((_, i) => ({ key: `alternateGreetings.${i}`, label: `备选开场白${i + 1}` })),
    ];
    for (const f of fields) {
        const text = fieldText(character, f.key);
        if (!text.trim()) continue;
        const mentioned = request.includes(f.label) || recentEdits.includes(`角色卡 › ${f.label}`);
        candidates.push({ key: fieldKey(f.key), address: `角色卡 › ${f.label}`, head: `角色卡 › ${f.label}`, text, tokens: estimateTokens(text), score: (mentioned ? 100 : 0) + (f.key === 'name' ? 50 : 10) });
    }
    const directory: string[] = [];
    directory.push(`【角色卡「${character.name}」】`);
    for (const f of fields) {
        const text = fieldText(character, f.key);
        if (text.trim()) directory.push(`- 角色卡 › ${f.label}（${text.length} 字）`);
    }
    const empty = fields.filter(f => !fieldText(character, f.key).trim()).map(f => f.label);
    if (empty.length) directory.push(`（空字段：${empty.join('、')}）`);

    const readonly = new Map<string, string>();
    for (const book of books) {
        const own = exclusiveBook(store, character.id, book.id);
        directory.push('', `【世界书「${book.name}」】${own ? '' : '（和其他角色共用，只读）'}`);
        for (const entry of book.entries) {
            const why = !own ? '共用世界书' : protectedReason(entry);
            const trigger = entry.activation === 'constant' ? '常驻' : `关键词：${entry.keys.slice(0, 6).join('、') || '无'}`;
            directory.push(`- 世界书#${entry.id}「${entry.title || '未命名'}」${trigger} · ${POSITION_LABEL[entry.position] ?? entry.position} · ${entry.content.length} 字${entry.enabled ? '' : ' · 已停用'}${why ? ` · 只读（${why}）` : ''}`);
            if (why) {
                readonly.set(entryKey(book, entry), why);
                continue;
            }
            const words = [entry.title, ...entry.keys].filter(w => w && w.length >= 2);
            const mentioned = new RegExp(`#${entry.id}(?!\\d)`).test(request + recentEdits) || words.some(w => request.includes(w));
            candidates.push({
                key: entryKey(book, entry),
                address: `世界书#${entry.id}`,
                head: `世界书#${entry.id}「${entry.title || '未命名'}」 ${trigger}`,
                text: entry.content,
                tokens: estimateTokens(entry.content),
                score: (mentioned ? 100 : 0) + (entry.enabled ? 5 : 0),
            });
        }
    }

    const total = candidates.reduce((s, c) => s + c.tokens, 0);
    const chosen = total <= budget ? candidates : [];
    if (total > budget) {
        let used = 0;
        for (const c of [...candidates].sort((a, b) => b.score - a.score)) {
            if (used + c.tokens > budget) continue;
            chosen.push(c);
            used += c.tokens;
        }
    }
    const omitted = candidates.filter(c => !chosen.includes(c));
    const order = new Map(candidates.map((c, i) => [c.key, i]));
    chosen.sort((a, b) => order.get(a.key)! - order.get(b.key)!);
    for (const c of chosen) {
        shown.add(c.key);
        snapshot.set(c.key, c.text);
    }
    const document = [
        '# 卡片目录',
        ...directory,
        omitted.length ? `\n（以下内容太长，这次没有给出全文，不能修改：${omitted.map(c => c.address).join('、')}。需要时请用户指明要改哪一条。）` : '',
        '',
        '# 全文',
        ...chosen.map(c => `────── ${c.head} ──────\n${c.text}\n────── 以上是 ${c.address} ──────`),
    ].join('\n');

    const parts: EditPrompt['parts'] = [];
    const add = (role: 'system' | 'user' | 'assistant', content: string, source: string, messageId?: string) => {
        if (content.trim()) parts.push({ role, content, sources: [source], tokens: estimateTokens(content) + MESSAGE_OVERHEAD, ...(messageId ? { messageId } : {}) });
    };
    add('system', `${EDIT_INSTRUCTION}\n\n用户在故事里的名字是「${userName}」，角色是「${character.name}」。`, 'cardEditor');
    add('system', document, 'cardDocument');
    for (const extra of args.extras ?? []) add('system', extra, 'editTask');
    const recent: string[] = [];
    let storyTokens = 0;
    for (const m of [...story].reverse()) {
        const text = clip(storyText(m.swipes[m.activeSwipe]?.content ?? ''), 800);
        if (!text) continue;
        storyTokens += estimateTokens(text);
        if (storyTokens > 4000 || recent.length >= 8) break;
        recent.unshift(`${m.role === 'user' ? userName : m.name}：${text}`);
    }
    if (recent.length) add('system', `# 最近的剧情（供参考）\n${recent.join('\n\n')}`, 'storyContext');
    for (const m of edits.slice(-8)) {
        const swipe = m.swipes[m.activeSwipe];
        if (!swipe?.content.trim()) continue;
        if (m.role === 'user') add('user', swipe.content, `chat:${m.id}`, m.id);
        else add('assistant', [extractCardEdit(swipe.content).prose, resultSummary(swipe.edits)].filter(Boolean).join('\n\n'), `chat:${m.id}`, m.id);
    }
    for (const [key, why] of readonly) snapshot.set(`readonly:${key}`, why);
    return {
        messages: parts.map(p => ({ role: p.role, content: p.content })),
        parts,
        shown,
        snapshot,
        tokens: parts.reduce((s, p) => s + p.tokens, 0),
    };
}

// ---------------------------------------------------------------------------------------------
// Applying an edit block
// ---------------------------------------------------------------------------------------------

type Target =
    | { kind: 'field'; key: string; label: string; path: string[] }
    | { kind: 'entry'; book: Lorebook; entry: LoreEntry; path: string[] }
    | { kind: 'book'; book: Lorebook }
    | { kind: 'greetings' }
    | { error: string };

function parseTarget(address: string, character: Character, books: Lorebook[]): Target {
    const tokens = address.replace(/\s+(之后|之前|后面|里面)\s*$/, '').split(/\s*[›»]\s*|\s+>\s+/).map(t => t.trim()).filter(Boolean);
    const head = tokens.shift() ?? '';
    const path = tokens;
    if (/^角色卡/.test(head)) {
        const inline = head.replace(/^角色卡\s*/, '');
        const label = inline || path.shift() || '';
        if (/^备选开场白$/.test(label)) return { kind: 'greetings' };
        const greeting = label.match(/^备选开场白\s*(\d+)$/);
        if (greeting) {
            const i = Number(greeting[1]) - 1;
            if (i < 0 || i >= character.fields.alternateGreetings.length) return { error: `没有${label}` };
            return { kind: 'field', key: `alternateGreetings.${i}`, label, path };
        }
        const field = FIELDS.find(f => f.label === label);
        return field ? { kind: 'field', key: field.key, label: field.label, path } : { error: `角色卡没有「${label}」这个字段` };
    }
    const named = head.match(/「([^」]+)」/)?.[1];
    const id = head.match(/#\s*([\w-]+)/)?.[1];
    const book = named ? books.find(b => b.name === named) : undefined;
    if (id !== undefined) {
        for (const b of book ? [book] : books) {
            const entry = b.entries.find(e => e.id === id);
            if (entry) return { kind: 'entry', book: b, entry, path };
        }
        return { error: `找不到世界书#${id}` };
    }
    if (/^世界书/.test(head)) {
        if (book) return { kind: 'book', book };
        if (!named && books.length === 1) return { kind: 'book', book: books[0] };
        return { error: named ? `没有名为「${named}」的世界书` : '请写明是哪本世界书，例如 世界书「书名」' };
    }
    return { error: `看不懂这个地址：${address}` };
}

const yes = (v: string) => /^(是|开|启用|true|yes|1)$/i.test(v.trim());

/** The task an address belongs to (its address, optionally followed by › path), and that path. */
function taskTarget(target: string, tasks: EditTask[]): { task: EditTask; path: string[] } | null {
    const clean = target.replace(/^[「『"]|[」』"]$/g, '').trim();
    for (const task of tasks) {
        if (clean !== task.address && !clean.startsWith(task.address)) continue;
        const rest = clean.slice(task.address.length);
        if (rest && !/^\s*[›»>]/.test(rest)) continue;
        return { task, path: rest.split(/[›»>]/).map(p => p.trim()).filter(Boolean) };
    }
    return null;
}

export async function applyCardEdits(store: Store, characterId: string, text: string, prompt: Pick<EditPrompt, 'shown' | 'snapshot'>, finish: string, tasks?: { list: EditTask[]; ctx: EditTaskContext }): Promise<CardEdits | undefined> {
    const { block, complete } = extractCardEdit(text);
    if (block === null) return undefined;
    if (!complete) {
        return { results: [], changes: [], note: finish === 'length' ? '回复被截断，修改没有执行。可以点「继续写」让它写完' : '修改块没有写完整，没有执行' };
    }
    const ops = parseCardEdits(block);
    const character = structuredClone(store.require<Character>('character', characterId));
    const books = character.lorebookIds.map(id => store.get<Lorebook>('lorebook', id)).filter((b): b is Lorebook => Boolean(b)).map(b => structuredClone(b));
    const original = { character: structuredClone(character), books: structuredClone(books) };
    const results: CardEditResult[] = [];
    const created = new Set<string>();
    let working = character;
    const taskOps: Op[] = [];

    const getText = (t: Extract<Target, { kind: 'field' | 'entry' }>) => (t.kind === 'field' ? fieldText(character, t.key) : t.entry.content);
    const setText = (t: Extract<Target, { kind: 'field' | 'entry' }>, value: string) => {
        if (t.kind === 'entry') { t.entry.content = value; return; }
        if (t.key === 'name') character.name = value;
        else if (t.key === 'depthPrompt') character.fields.depthPrompt = { ...character.fields.depthPrompt, text: value };
        else if (t.key.startsWith('alternateGreetings.')) character.fields.alternateGreetings[Number(t.key.split('.')[1])] = value;
        else (character.fields as unknown as Record<string, string>)[t.key] = value;
    };
    const keyOf = (t: Extract<Target, { kind: 'field' | 'entry' }>) => (t.kind === 'field' ? fieldKey(t.key) : entryKey(t.book, t.entry));
    const labelOf = (t: Target, path: string[] = []) => {
        const base = 'error' in t ? '' : t.kind === 'field' ? `角色卡 › ${t.label}` : t.kind === 'entry' ? `世界书「${t.entry.title || `#${t.entry.id}`}」` : t.kind === 'book' ? `世界书「${t.book.name}」` : '角色卡 › 备选开场白';
        return [base, ...path].filter(Boolean).join(' › ');
    };
    /** Why this text may not be changed, or null. */
    const blocked = (t: Extract<Target, { kind: 'field' | 'entry' }>, needShown: boolean): string | null => {
        const key = keyOf(t);
        if (t.kind === 'entry') {
            const readonly = prompt.snapshot.get(`readonly:${key}`) ?? (!exclusiveBook(store, characterId, t.book.id) ? '共用世界书' : protectedReason(t.entry));
            if (readonly) return `只读（${readonly}）`;
            if (created.has(key)) return null;
        }
        if (needShown && !prompt.shown.has(key)) return '这一处没有给出全文，没有修改';
        const before = prompt.snapshot.get(key);
        const current = t.kind === 'field'
            ? fieldText(original.character, t.key)
            : original.books.find(b => b.id === t.book.id)?.entries.find(e => e.id === t.entry.id)?.content;
        if (before !== undefined && current !== undefined && before !== current) return '发出请求后这里被改过，没有覆盖';
        return null;
    };

    for (const op of ops) {
        const owned = tasks ? taskTarget(op.target, tasks.list) : null;
        if (owned) {
            const result: CardEditResult = { action: op.action, target: op.target, label: owned.task.address, ok: false };
            results.push(result);
            try {
                const out = await owned.task.apply({ action: op.action, path: owned.path, body: op.body }, { ...tasks!.ctx, character: working });
                working = applyOps(working, out.ops).doc;
                taskOps.push(...out.ops);
                Object.assign(result, { ok: true, label: out.label ?? owned.task.address, before: out.before, after: out.after });
            } catch (error) {
                result.reason = (error as Error).message;
            }
            continue;
        }
        const target = parseTarget(op.target, character, books);
        const result: CardEditResult = { action: op.action, target: op.target, label: labelOf(target, 'error' in target ? [] : (target as { path?: string[] }).path), ok: false };
        results.push(result);
        if ('error' in target) {
            result.reason = target.error;
            continue;
        }
        try {
            if (op.action === '新增' && (target.kind === 'book' || target.kind === 'greetings')) {
                if (target.kind === 'greetings') {
                    character.fields.alternateGreetings.push(op.body);
                    Object.assign(result, { ok: true, label: `角色卡 › 备选开场白${character.fields.alternateGreetings.length}`, after: op.body });
                    continue;
                }
                if (!exclusiveBook(store, characterId, target.book.id)) throw new Error('只读（共用世界书）');
                const { fields, content } = parseFields(op.body);
                const title = fields['标题']?.trim();
                if (!title || !content) throw new Error('新条目需要标题和内容');
                const keys = splitList(fields['关键词'] ?? '');
                const constant = /常驻/.test(fields['触发'] ?? '') || (!keys.length && !fields['触发']);
                const entry = newLoreEntry(target.book, { title, content, keys });
                entry.activation = constant ? 'constant' : 'keyword';
                applySettings(entry, fields);
                target.book.entries.push(entry);
                created.add(entryKey(target.book, entry));
                Object.assign(result, { ok: true, label: `世界书「${title}」（新条目 #${entry.id}）`, after: content });
                continue;
            }
            if (target.kind !== 'field' && target.kind !== 'entry') throw new Error(`「${op.action}」不能用在这个地址上`);
            if (op.action === '设置') {
                if (target.kind !== 'entry') throw new Error('【设置】只能用在世界书条目上');
                const why = blocked(target, false);
                if (why && !why.startsWith('这一处')) throw new Error(why);
                const { fields } = parseFields(op.body);
                if (!Object.keys(fields).length) throw new Error('没有看懂要设置什么');
                const before = describeSettings(target.entry);
                applySettings(target.entry, fields);
                Object.assign(result, { ok: true, before, after: describeSettings(target.entry) });
                continue;
            }
            if (op.action === '删除' && !target.path.length) {
                if (target.kind === 'field') {
                    if (!target.key.startsWith('alternateGreetings.')) throw new Error('角色卡字段不能删除，可以改写成空');
                    const i = Number(target.key.split('.')[1]);
                    result.before = character.fields.alternateGreetings[i];
                    character.fields.alternateGreetings.splice(i, 1);
                } else {
                    const why = blocked(target, false);
                    if (why && !why.startsWith('这一处')) throw new Error(why);
                    result.before = target.entry.content;
                    target.book.entries = target.book.entries.filter(e => e !== target.entry);
                }
                result.ok = true;
                continue;
            }
            const why = blocked(target, true);
            if (why) throw new Error(why);
            const before = getText(target);
            let next = before;
            const section = target.path.length ? findSection(before, target.path) : null;
            if (section && 'error' in section) throw new Error(section.error);
            const where = section?.section;
            if (op.action === '改写') {
                next = where ? replaceSection(before, where, op.body) : op.body;
            } else if (op.action === '替换') {
                if (!op.pairs?.length) throw new Error('没有看懂原文和新文（需要 <<<<<<< 原文 / ======= / >>>>>>> 新文）');
                const scope = where ? sectionText(before, where) : before;
                let replaced = scope;
                for (const pair of op.pairs) {
                    const out = replaceOnce(replaced, pair.find, pair.replace);
                    if ('error' in out) throw new Error(out.error);
                    replaced = out.text;
                }
                next = where ? before.split('\n').slice(0, where.start).concat(replaced.split('\n'), before.split('\n').slice(where.end)).join('\n') : replaced;
            } else if (op.action === '新增') {
                if (!where) throw new Error('请写明插在哪一段后面，例如「世界书#3 › 角色档案 之后」');
                next = insertAfterSection(before, where, op.body);
            } else if (op.action === '删除') {
                next = removeSection(before, where!);
            }
            if (next === before) throw new Error('内容没有变化');
            setText(target, next);
            Object.assign(result, { ok: true, before, after: next });
        } catch (error) {
            result.ok = false;
            result.reason = (error as Error).message;
        }
    }

    // One change set per resource that changed.
    const changes: string[] = [];
    const applied = results.filter(r => r.ok);
    const reason = (what: string) => `AI 编辑${what}：${applied.map(r => `${r.action}${r.label.replace(/^(角色卡|世界书)/, '')}`).slice(0, 3).join('；')}${applied.length > 3 ? ` 等 ${applied.length} 处` : ''}`;
    const charOps: Op[] = [];
    if (character.name !== original.character.name) charOps.push({ op: 'set', path: ['name'], value: character.name });
    for (const key of Object.keys(character.fields) as (keyof CharacterFields)[]) {
        if (JSON.stringify(character.fields[key]) !== JSON.stringify(original.character.fields[key])) charOps.push({ op: 'set', path: ['fields', key], value: character.fields[key] });
    }
    charOps.push(...taskOps);
    if (charOps.length) changes.push((await store.apply({ target: { kind: 'character', id: characterId }, ops: charOps, author: 'ai', reason: reason('角色卡') })).change.id);
    for (const book of books) {
        const before = original.books.find(b => b.id === book.id)!;
        const bookOps: Op[] = [];
        for (const entry of before.entries) {
            const now = book.entries.find(e => e.id === entry.id);
            if (!now) { bookOps.push({ op: 'unset', path: ['entries', `@${entry.id}`] }); continue; }
            for (const prop of Object.keys(now) as (keyof LoreEntry)[]) {
                if (JSON.stringify(now[prop]) !== JSON.stringify(entry[prop])) bookOps.push({ op: 'set', path: ['entries', `@${entry.id}`, prop], value: now[prop] });
            }
        }
        for (const entry of book.entries) {
            if (!before.entries.some(e => e.id === entry.id)) bookOps.push({ op: 'insert', path: ['entries'], value: entry });
        }
        if (bookOps.length) changes.push((await store.apply({ target: { kind: 'lorebook', id: book.id }, ops: bookOps, author: 'ai', reason: reason(`世界书「${book.name}」`) })).change.id);
    }
    return { results, changes };
}

function describeSettings(entry: LoreEntry): string {
    return [
        `标题：${entry.title}`,
        `触发：${entry.activation === 'constant' ? '常驻' : '关键词'}`,
        `关键词：${entry.keys.join('、') || '无'}`,
        entry.secondaryKeys.length ? `次要关键词：${entry.secondaryKeys.join('、')}` : '',
        `启用：${entry.enabled ? '是' : '否'}`,
        `位置：${POSITION_LABEL[entry.position] ?? entry.position}${entry.position === 'at_depth' ? `（深度 ${entry.depth}）` : ''}`,
        `顺序：${entry.order}`,
        entry.probability !== 100 ? `概率：${entry.probability}` : '',
    ].filter(Boolean).join('\n');
}

function applySettings(entry: LoreEntry, fields: Record<string, string>) {
    if (fields['标题']) entry.title = fields['标题'];
    if (fields['关键词'] !== undefined) entry.keys = splitList(fields['关键词']);
    if (fields['次要关键词'] !== undefined) entry.secondaryKeys = splitList(fields['次要关键词']);
    if (fields['触发']) entry.activation = /常驻/.test(fields['触发']) ? 'constant' : 'keyword';
    if (fields['启用']) entry.enabled = yes(fields['启用']);
    if (fields['位置']) {
        const position = Object.entries(POSITIONS).find(([label]) => fields['位置'].includes(label))?.[1];
        if (!position) throw new Error(`不认识的位置「${fields['位置']}」`);
        entry.position = position;
    }
    const num = (name: string) => {
        if (fields[name] === undefined) return undefined;
        const n = Number(fields[name].replace(/[^\d.-]/g, ''));
        if (!Number.isFinite(n)) throw new Error(`${name}需要是数字`);
        return n;
    };
    entry.depth = num('深度') ?? entry.depth;
    entry.order = num('顺序') ?? entry.order;
    entry.probability = num('概率') ?? entry.probability;
}

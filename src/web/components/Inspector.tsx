import { useEffect, useMemo, useState } from 'react';

import { protectedReason } from '../../core/card-edit.ts';
import { newLoreEntry } from '../../core/lore.ts';
import { describeOp, type Op } from '../../core/ops.ts';
import { stateAt, toYaml } from '../../core/state.ts';
import { estimateTokens } from '../../core/tokens.ts';
import type { Character, CharacterFields, Chat, LoreEntry, LoreLogic, LorePosition, Lorebook, Preset } from '../../core/types.ts';
import { api, type PromptPartView, type PromptSnapshot } from '../api.ts';
import { Icon } from '../icons.tsx';
import { change, confirmAction, loadPref, openChat, refresh, reportError, savePref, setState, toast, toggleInspector, useAppState, type InspectorTab } from '../state.ts';
import { sourceLabel } from '../labels.ts';
import { PresetManager } from './PresetManager.tsx';
import { Button, Empty, Field, IconButton, LongText, Segmented, Toggle, timeAgo } from './common.tsx';

// ---------------------------------------------------------------------------------------------
// Prompt trace
// ---------------------------------------------------------------------------------------------

function PartCard({ part, preset }: { part: PromptPartView; preset: Preset | null }) {
    const [open, setOpen] = useState(false);
    const labels = [...new Set(part.sources.map(s => sourceLabel(s, preset)))];
    return (
        <div className={`part role-${part.role}${open ? ' open' : ''}`}>
            <button className="part-head" onClick={() => setOpen(!open)}>
                <span className={`role-chip ${part.role}`}>{part.role === 'system' ? '系统' : part.role === 'user' ? '用户' : '助手'}</span>
                <span className="part-label" title={labels.join('、')}>{labels.slice(0, 3).join(' · ')}{labels.length > 3 ? ` 等 ${labels.length} 项` : ''}</span>
                <span className="part-tokens">{part.tokens}</span>
            </button>
            <pre className="part-body">{open ? part.content : part.content.slice(0, 220) + (part.content.length > 220 ? '…' : '')}</pre>
        </div>
    );
}

function PromptTab({ chatId, preset }: { chatId: string; preset: Preset | null }) {
    const snapshot = useAppState(s => s.prompts[chatId]);
    const [preview, setPreview] = useState<PromptSnapshot | null>(null);
    const [loading, setLoading] = useState(false);
    const shown = preview ?? snapshot;
    const [view, setView] = useState<'assembled' | 'sent'>('sent');
    const runPreview = async () => {
        setLoading(true);
        try {
            setPreview(await api.preview(chatId));
        } catch (error) {
            reportError(error);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => setPreview(null), [snapshot?.at]);
    return (
        <div className="tab-body">
            <div className="tab-toolbar">
                <span className="muted">{preview ? '预览：下一次请求' : snapshot ? `上次请求 · ${timeAgo(snapshot.at ?? Date.now())}` : '还没有请求记录'}</span>
                <span className="grow" />
                <Button variant="ghost" icon="refresh" onClick={() => void runPreview()} disabled={loading}>{loading ? '组装中…' : '预览下一次'}</Button>
            </div>
            {!shown && <Empty title="发一条消息后，这里会显示完整提示词">每一段都会标出来源：预设条目、角色卡字段、世界书、聊天记录。</Empty>}
            {shown && (
                <>
                    <div className="meter">
                        <div className="meter-row"><span>总计约 {shown.tokens.total.toLocaleString()} tokens</span><span className="muted">可用 {shown.tokens.budget.toLocaleString()}</span></div>
                        <div className="meter-bar"><span style={{ width: `${Math.min(100, shown.tokens.total / Math.max(1, shown.tokens.budget) * 100)}%` }} /></div>
                        <div className="muted small">{shown.parts.length} 条消息{snapshot?.model && !preview ? ` · ${snapshot.model}` : ''} · token 数为估算</div>
                    </div>
                    {shown.tools && shown.tools.length > 0 && <div className="notice small">本次请求附带了预设定义的工具：{shown.tools.join('、')}，模型通过它返回回复。</div>}
                    {shown.warnings.map((w, i) => <div key={i} className="warn">{w}</div>)}
                    {shown.lore.length > 0 && (
                        <details className="lore-hits" open>
                            <summary>触发的世界书条目（{shown.lore.length}）</summary>
                            <ul>
                                {shown.lore.map(l => (
                                    <li key={`${l.bookId}.${l.entryId}`}>
                                        <span className="lore-title">{l.title}</span>
                                        <span className="muted small">{l.bookName} · {l.reason}</span>
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}
                    {shown.sent && (
                        <div className="notice small">
                            <span>预设自己的请求脚本改写了这次请求{view === 'sent' ? '，下面是实际发给模型的内容' : '，下面是改写前的组装结果'}。</span>
                            <Segmented label="查看" value={view} options={[['assembled', '组装结果'], ['sent', '实际发送']] as const} onChange={setView} />
                        </div>
                    )}
                    <div className="parts">
                        {(view === 'sent' && shown.sent ? shown.sent : shown.parts).map((p, i) => <PartCard key={`${view}${i}`} part={p} preset={preset} />)}
                    </div>
                </>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------------------------
// Variables (MVU stat data and chat variables)
// ---------------------------------------------------------------------------------------------

function StateTab({ chat }: { chat: Chat }) {
    const state = stateAt(chat.messages);
    const lastWithState = [...chat.messages].reverse().find(m => m.swipes[m.activeSwipe]?.state);
    const delta = (lastWithState?.swipes[lastWithState.activeSwipe]?.state?.delta_data ?? {}) as Record<string, { from: unknown; to: unknown }>;
    const show = (v: unknown) => v === undefined ? '（无）' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    const chatVars = chat.variables ?? {};
    return (
        <div className="tab-body">
            {!state && !Object.keys(chatVars).length && <Empty title="这个对话还没有变量">使用 MVU 的角色卡会在开局初始化变量，之后每次回复自动更新。</Empty>}
            {Object.keys(delta).length > 0 && (
                <div className="meter">
                    <div className="meter-row"><span>最近一轮的变化</span><span className="muted">{Object.keys(delta).length} 项{lastWithState?.swipes[lastWithState.activeSwipe]?.state?.source === 'fallback' ? ' · 模型漏写，已自动补全' : ''}</span></div>
                    <ul className="delta-list">
                        {Object.entries(delta).map(([path, d]) => (
                            <li key={path}><span className="delta-path">{path}</span><span className="delta-from">{show(d.from)}</span><span className="muted">→</span><span className="delta-to">{show(d.to)}</span></li>
                        ))}
                    </ul>
                </div>
            )}
            {state?.stat_data !== undefined && (
                <Field label="当前状态（stat_data）">
                    <pre className="state-view">{toYaml(state.stat_data)}</pre>
                </Field>
            )}
            {Object.keys(chatVars).length > 0 && (
                <Field label="对话变量">
                    <pre className="state-view">{toYaml(chatVars)}</pre>
                </Field>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------------------------
// Character card
// ---------------------------------------------------------------------------------------------

const FIELD_META: { key: keyof CharacterFields; label: string; hint?: string; rows?: number }[] = [
    { key: 'description', label: '描述', hint: '角色的设定、外貌、背景', rows: 8 },
    { key: 'personality', label: '性格', rows: 3 },
    { key: 'scenario', label: '场景', rows: 3 },
    { key: 'firstMessage', label: '开场白', rows: 6 },
    { key: 'exampleDialogue', label: '示例对话', hint: '用 <START> 分隔多段', rows: 6 },
    { key: 'systemPrompt', label: '主提示词覆盖', hint: '非空时替换预设的主提示词，可用 {{original}} 引用原文', rows: 3 },
    { key: 'postHistoryInstructions', label: '后置指令覆盖', hint: '非空时替换预设的后置指令', rows: 3 },
    { key: 'creatorNotes', label: '作者备注', hint: '不会发送给模型', rows: 3 },
];

function CharacterTab({ characterId }: { characterId: string }) {
    const [character, setCharacter] = useState<Character | null>(null);
    const [draft, setDraft] = useState<Character | null>(null);
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        void api.get<Character>('character', characterId).then(c => { setCharacter(c); setDraft(structuredClone(c)); }).catch(reportError);
    }, [characterId]);
    if (!character || !draft) return <div className="tab-body muted">加载中…</div>;

    const ops: Op[] = [];
    if (draft.name !== character.name) ops.push({ op: 'set', path: ['name'], value: draft.name });
    for (const { key } of FIELD_META) {
        if (draft.fields[key] !== character.fields[key]) ops.push({ op: 'set', path: ['fields', key], value: draft.fields[key] });
    }
    if (JSON.stringify(draft.fields.alternateGreetings) !== JSON.stringify(character.fields.alternateGreetings)) {
        ops.push({ op: 'set', path: ['fields', 'alternateGreetings'], value: draft.fields.alternateGreetings });
    }
    if (JSON.stringify(draft.fields.depthPrompt) !== JSON.stringify(character.fields.depthPrompt)) {
        ops.push({ op: 'set', path: ['fields', 'depthPrompt'], value: draft.fields.depthPrompt });
    }
    const setField = (key: keyof CharacterFields, value: unknown) => setDraft({ ...draft, fields: { ...draft.fields, [key]: value } });
    const total = FIELD_META.filter(f => f.key !== 'creatorNotes' && f.key !== 'firstMessage').reduce((sum, f) => sum + estimateTokens(String(draft.fields[f.key])), 0);

    const save = async () => {
        setSaving(true);
        try {
            const next = await change<Character>('character', character.id, ops, '编辑角色卡');
            setCharacter(next);
            setDraft(structuredClone(next));
            toast('角色卡已保存，可在「修改历史」里撤销', 'success');
            void refresh();
        } catch (error) {
            reportError(error);
        } finally {
            setSaving(false);
        }
    };
    const remove = async () => {
        if (!await confirmAction({ title: `删除角色「${character.name}」？`, body: '它的所有对话也会一起删除，无法恢复。', confirm: '删除', danger: true })) return;
        await api.remove('character', character.id).catch(reportError);
        setState({ activeChatId: null, inspector: null });
        void refresh();
    };

    return (
        <div className="tab-body">
            <div className="tab-toolbar sticky-bar">
                <span className="muted">常驻约 {total.toLocaleString()} tokens{character.scripts.length ? ` · 含 ${character.scripts.length} 个卡片脚本（暂未运行）` : ''}</span>
                <span className="grow" />
                {ops.length > 0 && <Button variant="ghost" onClick={() => setDraft(structuredClone(character))}>还原</Button>}
                <Button variant="primary" icon="check" disabled={!ops.length || saving} onClick={() => void save()}>{ops.length ? `保存 ${ops.length} 处修改` : '已保存'}</Button>
            </div>
            <Field label="名字">
                <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            {FIELD_META.map(f => (
                <Field key={f.key} label={f.label} hint={<>{f.hint && <span>{f.hint}</span>}<span className="tok">{estimateTokens(String(draft.fields[f.key]))}</span></>}>
                    <LongText label={f.label} minRows={String(character.fields[f.key]) ? f.rows : 2} value={String(draft.fields[f.key])} onChange={v => setField(f.key, v)} />
                </Field>
            ))}
            <Field label="备选开场白" hint={<span>新对话时可左右切换</span>}>
                <div className="stack">
                    {draft.fields.alternateGreetings.map((g, i) => (
                        <div key={i} className="greeting">
                            <LongText label={`备选开场白 ${i + 1}`} minRows={3} value={g} onChange={v => setField('alternateGreetings', draft.fields.alternateGreetings.map((x, j) => j === i ? v : x))} />
                            <IconButton icon="trash" label="删除这条" tone="danger" onClick={() => setField('alternateGreetings', draft.fields.alternateGreetings.filter((_, j) => j !== i))} />
                        </div>
                    ))}
                    <Button variant="ghost" icon="plus" onClick={() => setField('alternateGreetings', [...draft.fields.alternateGreetings, ''])}>添加</Button>
                </div>
            </Field>
            <Field label="角色备注（深度注入）" hint={<span>插入到聊天记录中倒数第 N 条的位置</span>}>
                <LongText label="角色备注（深度注入）" minRows={2} value={draft.fields.depthPrompt.text} onChange={v => setField('depthPrompt', { ...draft.fields.depthPrompt, text: v })} />
                <div className="inline-fields">
                    <label>深度 <input type="number" min={0} value={draft.fields.depthPrompt.depth} onChange={e => setField('depthPrompt', { ...draft.fields.depthPrompt, depth: Number(e.target.value) })} /></label>
                    <label>角色 <select value={draft.fields.depthPrompt.role} onChange={e => setField('depthPrompt', { ...draft.fields.depthPrompt, role: e.target.value })}>
                        <option value="system">系统</option><option value="user">用户</option><option value="assistant">助手</option>
                    </select></label>
                </div>
            </Field>
            <div className="danger-zone">
                <Button variant="danger" icon="trash" onClick={() => void remove()}>删除这个角色</Button>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------------------------
// Lorebook
// ---------------------------------------------------------------------------------------------

const POSITIONS: { value: LorePosition; label: string }[] = [
    { value: 'before_char', label: '角色定义之前' },
    { value: 'after_char', label: '角色定义之后' },
    { value: 'an_top', label: '作者注释之前' },
    { value: 'an_bottom', label: '作者注释之后' },
    { value: 'at_depth', label: '聊天中（按深度）' },
    { value: 'em_top', label: '示例对话之前' },
    { value: 'em_bottom', label: '示例对话之后' },
    { value: 'outlet', label: '出口（宏引用）' },
];
const LOGICS: { value: LoreLogic; label: string }[] = [
    { value: 'and_any', label: '且包含任一' },
    { value: 'and_all', label: '且包含全部' },
    { value: 'not_any', label: '且不含任何' },
    { value: 'not_all', label: '且不全包含' },
];

function EntryEditor({ entry, onSave, onDelete, onClose }: { entry: LoreEntry; onSave: (ops: Op[]) => Promise<void>; onDelete: () => void; onClose: () => void }) {
    const [d, setD] = useState(entry);
    useEffect(() => setD(entry), [entry]);
    const ops: Op[] = [];
    const base = ['entries', `@${entry.id}`];
    (['title', 'content', 'enabled', 'activation', 'logic', 'position', 'depth', 'order', 'probability'] as const).forEach(k => {
        if (d[k] !== entry[k]) ops.push({ op: 'set', path: [...base, k], value: d[k] });
    });
    if (d.keys.join('\n') !== entry.keys.join('\n')) ops.push({ op: 'set', path: [...base, 'keys'], value: d.keys });
    if (d.secondaryKeys.join('\n') !== entry.secondaryKeys.join('\n')) ops.push({ op: 'set', path: [...base, 'secondaryKeys'], value: d.secondaryKeys });
    const unlocked = (e: LoreEntry) => Boolean((e.extra?.hearth as { aiEditable?: boolean } | undefined)?.aiEditable);
    if (unlocked(d) !== unlocked(entry)) ops.push({ op: 'set', path: [...base, 'extra', 'hearth', 'aiEditable'], value: unlocked(d) });
    const locked = protectedReason(d, true);
    const splitKeys = (v: string) => v.split(/[,，]/).map(x => x.trim()).filter(Boolean);
    return (
        <div className="entry-editor">
            <div className="tab-toolbar">
                <IconButton icon="left" label="返回列表" onClick={onClose} />
                <span className="grow" />
                <IconButton icon="trash" label="删除条目" tone="danger" onClick={onDelete} />
                <Button variant="primary" icon="check" disabled={!ops.length} onClick={() => void onSave(ops)}>保存</Button>
            </div>
            <Field label="标题"><input value={d.title} onChange={e => setD({ ...d, title: e.target.value })} /></Field>
            <div className="inline-fields">
                <label>启用 <Toggle checked={d.enabled} onChange={v => setD({ ...d, enabled: v })} /></label>
                <label>常驻 <Toggle checked={d.activation === 'constant'} onChange={v => setD({ ...d, activation: v ? 'constant' : 'keyword' })} /></label>
                {locked && (
                    <label title={`这是「${locked}」条目，改坏了会影响变量或模板，所以默认不让 AI 修改`}>
                        允许 AI 修改 <Toggle checked={unlocked(d)} onChange={v => setD({ ...d, extra: { ...d.extra, hearth: { ...(d.extra?.hearth as object), aiEditable: v } } })} />
                    </label>
                )}
            </div>
            <Field label="关键词" hint={<span>逗号分隔；/正则/ 也可以</span>}>
                <input value={d.keys.join(', ')} onChange={e => setD({ ...d, keys: splitKeys(e.target.value) })} />
            </Field>
            <Field label="次要关键词">
                <div className="inline-fields">
                    <select value={d.logic} onChange={e => setD({ ...d, logic: e.target.value as LoreLogic })}>
                        {LOGICS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                    <input className="grow" value={d.secondaryKeys.join(', ')} onChange={e => setD({ ...d, secondaryKeys: splitKeys(e.target.value) })} />
                </div>
            </Field>
            <div className="inline-fields">
                <label>位置 <select value={d.position} onChange={e => setD({ ...d, position: e.target.value as LorePosition })}>
                    {POSITIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select></label>
                {d.position === 'at_depth' && <label>深度 <input type="number" min={0} value={d.depth} onChange={e => setD({ ...d, depth: Number(e.target.value) })} /></label>}
                <label>顺序 <input type="number" value={d.order} onChange={e => setD({ ...d, order: Number(e.target.value) })} /></label>
                <label>概率 <input type="number" min={0} max={100} value={d.probability} onChange={e => setD({ ...d, probability: Number(e.target.value) })} /></label>
            </div>
            <Field label="内容" hint={<span className="tok">{estimateTokens(d.content)}</span>}>
                <LongText label={d.title || '条目内容'} minRows={10} value={d.content} onChange={v => setD({ ...d, content: v })} />
            </Field>
        </div>
    );
}

function LoreTab({ characterId }: { characterId: string }) {
    const boot = useAppState(s => s.boot);
    const [character, setCharacter] = useState<Character | null>(null);
    const [bookId, setBookId] = useState<string | null>(null);
    const [book, setBook] = useState<Lorebook | null>(null);
    const [entryId, setEntryId] = useState<string | null>(null);
    const [filter, setFilter] = useState('');
    useEffect(() => {
        void api.get<Character>('character', characterId).then(c => {
            setCharacter(c);
            setBookId(id => id ?? c.lorebookIds[0] ?? null);
        }).catch(reportError);
    }, [characterId]);
    useEffect(() => {
        setEntryId(null);
        if (bookId) void api.get<Lorebook>('lorebook', bookId).then(setBook).catch(reportError);
        else setBook(null);
    }, [bookId]);

    const allBooks = boot?.resources.lorebook ?? [];
    const linked = character?.lorebookIds ?? [];
    const link = async (id: string, on: boolean) => {
        if (!character) return;
        const next = on ? [...linked, id] : linked.filter(x => x !== id);
        const updated = await change<Character>('character', character.id, [{ op: 'set', path: ['lorebookIds'], value: next }], on ? '绑定世界书' : '解绑世界书');
        setCharacter(updated);
        if (on) setBookId(id);
    };
    const apply = async (ops: Op[], reason: string) => {
        if (!book) return;
        const next = await change<Lorebook>('lorebook', book.id, ops, reason);
        setBook(next);
    };
    const addEntry = async () => {
        if (!book) return;
        const entry = newLoreEntry(book, { title: '新条目', content: '', keys: [] });
        await apply([{ op: 'insert', path: ['entries'], value: entry }], '新增世界书条目');
        setEntryId(entry.id);
    };

    const entry = book?.entries.find(e => e.id === entryId);
    const entries = useMemo(() => (book?.entries ?? []).filter(e => !filter || e.title.includes(filter) || e.keys.some(k => k.includes(filter)) || e.content.includes(filter)), [book, filter]);

    return (
        <div className="tab-body">
            <div className="book-picker">
                {linked.map(id => {
                    const b = allBooks.find(x => x.id === id);
                    return b ? <button key={id} className={`chip${id === bookId ? ' active' : ''}`} onClick={() => setBookId(id)}>{b.name}</button> : null;
                })}
                <select className="chip-select" value="" onChange={e => e.target.value && void link(e.target.value, true).catch(reportError)}>
                    <option value="">＋ 绑定世界书</option>
                    {allBooks.filter(b => !linked.includes(b.id)).map(b => <option key={b.id} value={b.id}>{b.name}（{b.entries} 条）</option>)}
                </select>
            </div>
            {!book && <Empty title="这个角色还没有绑定世界书">导入的世界书可以在上面绑定；角色卡自带的世界书会自动绑定。</Empty>}
            {book && entry && (
                <EntryEditor entry={entry} onClose={() => setEntryId(null)}
                    onSave={ops => apply(ops, `编辑条目「${entry.title || entry.id}」`).then(() => toast('已保存', 'success')).catch(reportError)}
                    onDelete={() => void apply([{ op: 'unset', path: ['entries', `@${entry.id}`] }], '删除世界书条目').then(() => { setEntryId(null); toast('条目已删除，可在「历史」里撤销'); }).catch(reportError)} />
            )}
            {book && !entry && (
                <>
                    <div className="tab-toolbar">
                        <div className="search small"><Icon name="search" size={13} /><input placeholder="筛选条目" value={filter} onChange={e => setFilter(e.target.value)} /></div>
                        <span className="grow" />
                        <IconButton icon="plus" label="新增条目" onClick={() => void addEntry().catch(reportError)} />
                        {bookId && <IconButton icon="x" label="解绑这本世界书" onClick={() => void link(bookId, false).then(() => setBookId(null)).catch(reportError)} />}
                    </div>
                    <div className="entries">
                        {entries.map(e => (
                            <div key={e.id} className={`entry${e.enabled ? '' : ' off'}`}>
                                <Toggle checked={e.enabled} label="启用" onChange={v => void apply([{ op: 'set', path: ['entries', `@${e.id}`, 'enabled'], value: v }], v ? '启用条目' : '停用条目').catch(reportError)} />
                                <button className="entry-main" onClick={() => setEntryId(e.id)}>
                                    <span className="entry-title">{e.activation === 'constant' && <span className="dot-const" title="常驻" />}{e.title || e.keys.join(', ') || `#${e.id}`}</span>
                                    <span className="muted small">{e.activation === 'constant' ? '常驻' : e.keys.slice(0, 4).join(' / ') || '无关键词'} · {POSITIONS.find(p => p.value === e.position)?.label}</span>
                                </button>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------------------------
// Preset
// ---------------------------------------------------------------------------------------------

function PresetTab() {
    return (
        <div className="tab-body">
            <PresetManager compact />
        </div>
    );
}

// ---------------------------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------------------------

function HistoryTab({ chatId }: { chatId: string }) {
    const [items, setItems] = useState<any[] | null>(null);
    const load = () => void api.history().then(list => setItems(list.filter(c => c.ops.length > 0 || c.reason))).catch(reportError);
    useEffect(load, []);
    const kindLabel: Record<string, string> = { character: '角色卡', lorebook: '世界书', preset: '预设', persona: '用户角色', chat: '对话' };
    const authorLabel: Record<string, string> = { user: '你', ai: 'AI', script: '脚本', system: '系统' };
    return (
        <div className="tab-body">
            <div className="tab-toolbar"><span className="muted">所有修改都会记录在这里，可以逐条撤销</span><span className="grow" /><IconButton icon="refresh" label="刷新" onClick={load} /></div>
            {!items?.length && <Empty title="还没有修改记录" />}
            <ol className="history">
                {items?.map(c => (
                    <li key={c.id} className={c.status === 'reverted' ? 'reverted' : ''}>
                        <div className="history-head">
                            <span className="history-reason">{c.reason || '修改'}</span>
                            <span className="muted small">{authorLabel[c.author] ?? c.author} · {kindLabel[c.target.kind] ?? c.target.kind} · {timeAgo(c.createdAt)}</span>
                        </div>
                        {c.ops.length > 0 && <div className="muted small">{(c.ops as Op[]).slice(0, 3).map(describeOp).join('；')}{c.ops.length > 3 ? ` 等 ${c.ops.length} 项` : ''}</div>}
                        {c.inverse?.length > 0 && c.status === 'applied' && (
                            <Button variant="ghost" icon="undo" onClick={() => void api.revert(c.id).then(async () => {
                                toast('已撤销', 'success');
                                load();
                                if (c.target.kind === 'chat') await openChat(chatId);
                                void refresh();
                            }).catch(reportError)}>撤销</Button>
                        )}
                    </li>
                ))}
            </ol>
        </div>
    );
}

// ---------------------------------------------------------------------------------------------

const TABS: [InspectorTab, string][] = [['prompt', '提示词'], ['state', '变量'], ['character', '角色卡'], ['lore', '世界书'], ['preset', '预设'], ['history', '历史']];
const DEFAULT_WIDTH = 420;

/** Drag the panel's left edge to resize it (double-click resets); wide is better for editing long text. */
function useInspectorWidth() {
    const [width, setWidth] = useState(() => loadPref('inspectorWidth', DEFAULT_WIDTH));
    useEffect(() => {
        document.documentElement.style.setProperty('--inspector-w', `${width}px`);
    }, [width]);
    const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        const handle = e.currentTarget;
        handle.setPointerCapture(e.pointerId);
        handle.classList.add('dragging');
        let latest = width;
        const move = (ev: PointerEvent) => {
            const sidebar = document.querySelector('.sidebar')?.getBoundingClientRect().width ?? 0;
            latest = Math.round(Math.max(340, Math.min(window.innerWidth - ev.clientX, window.innerWidth - sidebar - 420)));
            setWidth(latest);
        };
        const up = () => {
            handle.classList.remove('dragging');
            handle.removeEventListener('pointermove', move);
            handle.removeEventListener('pointerup', up);
            savePref('inspectorWidth', latest);
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', up);
    };
    const reset = () => {
        setWidth(DEFAULT_WIDTH);
        savePref('inspectorWidth', DEFAULT_WIDTH);
    };
    return { startDrag, reset };
}

export function Inspector() {
    const tab = useAppState(s => s.inspector);
    const chatId = useAppState(s => s.activeChatId);
    const chat = useAppState(s => (s.activeChatId ? s.chats[s.activeChatId] : undefined));
    const context = useAppState(s => (s.activeChatId ? s.contexts[s.activeChatId] : undefined));
    const [preset, setPreset] = useState<Preset | null>(null);
    const { startDrag, reset } = useInspectorWidth();
    useEffect(() => {
        if (context?.preset.id) void api.get<Preset>('preset', context.preset.id).then(setPreset).catch(() => setPreset(null));
    }, [context?.preset.id]);
    if (!tab || !chatId || !chat) return null;
    return (
        <aside className="inspector">
            <div className="inspector-resize" title="拖动调整宽度，双击恢复" onPointerDown={startDrag} onDoubleClick={reset} />
            <header className="inspector-head">
                <div className="tabs" role="tablist">
                    {TABS.map(([id, label]) => (
                        <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => tab !== id && toggleInspector(id)}>{label}</button>
                    ))}
                </div>
                <IconButton icon="x" label="关闭面板（Ctrl+I）" onClick={() => setState({ inspector: null })} />
            </header>
            {tab === 'prompt' && <PromptTab chatId={chatId} preset={preset} />}
            {tab === 'state' && <StateTab chat={chat} />}
            {tab === 'character' && <CharacterTab key={chat.characterId} characterId={chat.characterId} />}
            {tab === 'lore' && <LoreTab key={chat.characterId} characterId={chat.characterId} />}
            {tab === 'preset' && <PresetTab />}
            {tab === 'history' && <HistoryTab chatId={chatId} />}
        </aside>
    );
}

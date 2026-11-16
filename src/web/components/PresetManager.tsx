import { useEffect, useMemo, useRef, useState } from 'react';

import type { Op } from '../../core/ops.ts';
import { estimateTokens } from '../../core/tokens.ts';
import type { Preset, PromptEntry, Role } from '../../core/types.ts';
import { api } from '../api.ts';
import { Icon } from '../icons.tsx';
import { sourceLabel } from '../labels.ts';
import { change, confirmAction, refresh, reloadContext, reportError, getState, toast, useAppState } from '../state.ts';
import { Button, Empty, IconButton, LongText, Toggle } from './common.tsx';

/** Menu markers used by SPreset-style presets: <<<|catgodml|radio:分组:名称>>> (radio = one per group). */
function menuTag(content: string): { kind: 'menu' | 'radio'; group: string } | null {
    // Examples inside {{// comments}} (tutorial entries) are not real markers.
    const m = content.replace(/{{\/\/[\s\S]*?}}/g, '').match(/<<<\|\s*catgodml\s*\|\s*(menu|radio)\s*:\s*([^:>]+?)\s*:[^>]*>>>/i);
    return m ? { kind: m[1].toLowerCase() as 'menu' | 'radio', group: m[2] } : null;
}

const isSeparator = (p: PromptEntry) => !p.marker && /^\s*[-—=─]{2,}.*[-—=─]{2,}\s*$/.test(p.name);

export async function setGlobalPreset(id: string) {
    await api.saveSettings({ presetId: id });
    await refresh();
    const chatId = getState().activeChatId;
    if (chatId) await reloadContext(chatId);
}

function EntryEditor({ entry, onSave }: { entry: PromptEntry; onSave: (ops: Op[]) => Promise<void> }) {
    const [content, setContent] = useState(entry.content);
    const [role, setRole] = useState<Role>(entry.role);
    const [mode, setMode] = useState(entry.injection.mode);
    const [depth, setDepth] = useState(entry.injection.depth);
    const base = ['prompts', `@${entry.id}`];
    const ops: Op[] = [];
    if (content !== entry.content) ops.push({ op: 'set', path: [...base, 'content'], value: content });
    if (role !== entry.role) ops.push({ op: 'set', path: [...base, 'role'], value: role });
    if (mode !== entry.injection.mode) ops.push({ op: 'set', path: [...base, 'injection', 'mode'], value: mode });
    if (depth !== entry.injection.depth) ops.push({ op: 'set', path: [...base, 'injection', 'depth'], value: depth });
    if (entry.marker) {
        return <div className="entry-detail muted small">这是内置位置，内容由角色卡、世界书或聊天记录自动填入，只能开关。</div>;
    }
    return (
        <div className="entry-detail">
            <LongText label={entry.name || '条目内容'} minRows={4} value={content} onChange={setContent} />
            <div className="inline-fields">
                <label>角色 <select value={role} onChange={e => setRole(e.target.value as Role)}>
                    <option value="system">系统</option><option value="user">用户</option><option value="assistant">助手</option>
                </select></label>
                <label>位置 <select value={mode} onChange={e => setMode(e.target.value as PromptEntry['injection']['mode'])}>
                    <option value="relative">按顺序</option><option value="in_chat">插入聊天记录</option>
                </select></label>
                {mode === 'in_chat' && <label>深度 <input type="number" min={0} value={depth} onChange={e => setDepth(Number(e.target.value))} /></label>}
                <span className="grow" />
                <span className="muted small">{estimateTokens(content)} tokens</span>
            </div>
            {ops.length > 0 && (
                <div className="row-end">
                    <Button variant="ghost" onClick={() => { setContent(entry.content); setRole(entry.role); setMode(entry.injection.mode); setDepth(entry.injection.depth); }}>还原</Button>
                    <Button variant="primary" onClick={() => void onSave(ops)}>保存</Button>
                </div>
            )}
        </div>
    );
}

/**
 * Global preset management: import, choose the active preset, toggle and edit entries.
 * `compact` is the inspector variant (always edits the active preset).
 */
export function PresetManager({ compact }: { compact?: boolean }) {
    const boot = useAppState(s => s.boot);
    const presets = boot?.resources.preset ?? [];
    const activeId = boot?.settings.presetId ?? presets[0]?.id;
    const [selectedId, setSelectedId] = useState<string | undefined>(activeId);
    const [preset, setPreset] = useState<Preset | null>(null);
    const [openId, setOpenId] = useState<string | null>(null);
    const [filter, setFilter] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);
    const viewId = compact ? activeId : selectedId ?? activeId;

    useEffect(() => {
        if (compact) setSelectedId(activeId);
    }, [compact, activeId]);
    useEffect(() => {
        setOpenId(null);
        if (viewId) void api.get<Preset>('preset', viewId).then(setPreset).catch(reportError);
        else setPreset(null);
    }, [viewId]);

    const apply = async (ops: Op[], reason: string) => {
        if (!preset || !ops.length) return;
        setPreset(await change<Preset>('preset', preset.id, ops, reason));
    };

    const importPreset = async (files: FileList) => {
        for (const file of Array.from(files)) {
            try {
                const { created } = await api.importFile(file);
                const imported = created.find(c => c.kind === 'preset');
                if (!imported) {
                    toast(`${file.name} 不是预设文件（识别为 ${created.map(c => c.name).join('、')}）`, 'info');
                    continue;
                }
                await setGlobalPreset(imported.id);
                setSelectedId(imported.id);
                toast(`已导入预设「${imported.name}」，并设为当前预设`, 'success');
            } catch (error) {
                toast(`${file.name}：${(error as Error).message}`, 'error');
            }
        }
        await refresh();
    };

    const remove = async () => {
        if (!preset || !await confirmAction({ title: `删除预设「${preset.name}」？`, body: '删除后无法恢复，需要重新导入。', confirm: '删除', danger: true })) return;
        try {
            await api.remove('preset', preset.id);
            await refresh();
            const next = getState().boot?.settings.presetId;
            setSelectedId(next);
            const chatId = getState().activeChatId;
            if (chatId) await reloadContext(chatId);
            toast('已删除', 'success');
        } catch (error) {
            reportError(error);
        }
    };

    const rows = useMemo(() => {
        if (!preset) return [];
        return preset.order
            .map(o => ({ order: o, prompt: preset.prompts.find(p => p.id === o.id) }))
            .filter((r): r is { order: typeof r.order; prompt: PromptEntry } => Boolean(r.prompt));
    }, [preset]);
    const enabledCount = rows.filter(r => r.order.enabled).length;
    const visible = filter ? rows.filter(r => r.prompt.name.includes(filter) || r.prompt.content.includes(filter)) : rows;

    const toggle = (id: string, on: boolean) => {
        const row = rows.find(r => r.order.id === id);
        if (!row) return;
        const ops: Op[] = [{ op: 'set', path: ['order', `@${id}`, 'enabled'], value: on }];
        const tag = menuTag(row.prompt.content);
        if (on && tag?.kind === 'radio') {
            // Radio groups allow one active entry, like the preset's own menu.
            for (const other of rows) {
                if (other.order.id === id || !other.order.enabled) continue;
                const t = menuTag(other.prompt.content);
                if (t?.kind === 'radio' && t.group === tag.group) {
                    ops.push({ op: 'set', path: ['order', `@${other.order.id}`, 'enabled'], value: false });
                }
            }
        }
        void apply(ops, `${on ? '启用' : '停用'}「${row.prompt.name}」`).catch(reportError);
    };

    const num = (path: string[], value: string) => {
        const n = Number(value);
        if (Number.isFinite(n)) void apply([{ op: 'set', path, value: n }], '调整预设参数').catch(reportError);
    };

    return (
        <div className="preset-manager">
            <input ref={fileRef} type="file" accept=".json" multiple hidden onChange={e => {
                if (e.target.files?.length) void importPreset(e.target.files);
                e.target.value = '';
            }} />
            <div className="preset-bar">
                <select className="grow" value={viewId ?? ''} onChange={e => {
                    if (compact) void setGlobalPreset(e.target.value).catch(reportError);
                    else setSelectedId(e.target.value);
                }}>
                    {presets.map(p => <option key={p.id} value={p.id}>{p.name}{p.id === activeId ? '（当前）' : ''}</option>)}
                </select>
                <Button icon="upload" onClick={() => fileRef.current?.click()}>导入预设</Button>
            </div>
            <p className="muted small">预设对所有角色和对话统一生效。支持酒馆导出的 Chat Completion 预设（.json）。</p>

            {!compact && preset && preset.id !== activeId && (
                <div className="notice">
                    <span>正在查看「{preset.name}」，它不是当前使用的预设。</span>
                    <Button variant="primary" onClick={() => void setGlobalPreset(preset.id).then(() => toast(`已切换到「${preset.name}」`, 'success')).catch(reportError)}>设为当前预设</Button>
                </div>
            )}

            {!preset && <Empty title="还没有预设">点「导入预设」选择酒馆导出的预设文件。</Empty>}
            {preset && (
                <>
                    <div className={`grid-fields${compact ? "" : " four"}`}>
                        <label>温度<input type="number" step={0.05} defaultValue={preset.sampling.temperature} key={`t${preset.id}${preset.updatedAt}`} onBlur={e => num(['sampling', 'temperature'], e.target.value)} /></label>
                        <label>Top P<input type="number" step={0.01} defaultValue={preset.sampling.topP} key={`p${preset.id}${preset.updatedAt}`} onBlur={e => num(['sampling', 'topP'], e.target.value)} /></label>
                        <label>上下文长度<input type="number" defaultValue={preset.context.maxContext} key={`c${preset.id}${preset.updatedAt}`} onBlur={e => num(['context', 'maxContext'], e.target.value)} /></label>
                        <label>回复长度<input type="number" defaultValue={preset.context.maxTokens} key={`m${preset.id}${preset.updatedAt}`} onBlur={e => num(['context', 'maxTokens'], e.target.value)} /></label>
                    </div>
                    <label className="check-row">
                        <Toggle checked={preset.context.stream} onChange={v => void apply([{ op: 'set', path: ['context', 'stream'], value: v }], v ? '开启流式输出' : '关闭流式输出').catch(reportError)} />
                        <span>流式输出（边生成边显示）</span>
                    </label>
                    {preset.scripts.length > 0 && <div className="warn">这个预设带有 {preset.scripts.length} 个酒馆助手脚本（{preset.scripts.map(s => s.name).join('、')}），目前只保存不运行。</div>}

                    <div className="entries-head">
                        <span className="section-title">条目 <span className="muted">已启用 {enabledCount} / {rows.length}</span></span>
                        <span className="grow" />
                        <div className="search small"><Icon name="search" size={13} /><input placeholder="筛选条目" value={filter} onChange={e => setFilter(e.target.value)} /></div>
                    </div>
                    <div className="prompt-order">
                        {visible.map(({ order, prompt }) => {
                            const open = openId === prompt.id;
                            const tag = menuTag(prompt.content);
                            if (isSeparator(prompt) && !filter) {
                                return (
                                    <div key={order.id} className={`order-group${order.enabled ? '' : ' off'}`}>
                                        <span>{prompt.name.replace(/^[\s\-—=─]+|[\s\-—=─]+$/g, '')}</span>
                                        <Toggle checked={order.enabled} label="启用" onChange={v => toggle(order.id, v)} />
                                    </div>
                                );
                            }
                            return (
                                <div key={order.id} className={`order-item${order.enabled ? '' : ' off'}${open ? ' open' : ''}`}>
                                    <div className="order-row">
                                        <Toggle checked={order.enabled} label="启用" onChange={v => toggle(order.id, v)} />
                                        <button className="order-name" onClick={() => setOpenId(open ? null : prompt.id)} title={prompt.name}>
                                            {prompt.marker ? <span className="tag">{sourceLabel(prompt.id, preset)}</span> : prompt.name || prompt.id}
                                        </button>
                                        {tag && <span className={`tag subtle${tag.kind === 'radio' ? ' radio' : ''}`} title={tag.kind === 'radio' ? '同组只能开一个，打开会自动关掉其他' : '同组可以同时开多个'}>{tag.group}{tag.kind === 'radio' ? ' · 单选' : ''}</span>}
                                        {prompt.injection.mode === 'in_chat' && <span className="tag subtle">深度 {prompt.injection.depth}</span>}
                                        {!prompt.marker && <span className="muted small tok-count">{estimateTokens(prompt.content)}</span>}
                                        <IconButton icon={open ? 'chevron' : 'edit'} label={open ? '收起' : '查看 / 编辑'} size={14} onClick={() => setOpenId(open ? null : prompt.id)} />
                                    </div>
                                    {open && (
                                        <EntryEditor key={prompt.id + preset.updatedAt} entry={prompt}
                                            onSave={ops => apply(ops, `编辑「${prompt.name}」`).then(() => toast('已保存', 'success')).catch(reportError)} />
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {!compact && (
                        <div className="danger-zone">
                            <Button variant="danger" icon="trash" onClick={() => void remove()}>删除这个预设</Button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

import { useEffect, useState } from 'react';

import type { Connection, LoreSettings, Persona } from '../../core/types.ts';
import { api, RELEASES_URL, type AppUpdateStatus, type PluginView } from '../api.ts';
import { change, confirmAction, refresh, reportError, setState, toast, useAppState } from '../state.ts';
import { Button, Field, LongText, Modal, Segmented, Toggle, timeAgo } from './common.tsx';
import { PresetManager } from './PresetManager.tsx';
import { ReadingControls } from './Reading.tsx';

type Section = 'connection' | 'preset' | 'persona' | 'lore' | 'plugins' | 'appearance';

function ConnectionSection() {
    const settings = useAppState(s => s.boot?.settings);
    const connections = settings?.connections ?? [];
    const [selected, setSelected] = useState<string | null>(settings?.connectionId ?? connections[0]?.id ?? null);
    const current = connections.find(c => c.id === selected);
    const [form, setForm] = useState<Partial<Connection>>({});
    const [key, setKey] = useState('');
    const [models, setModels] = useState<string[]>([]);
    const [busy, setBusy] = useState('');
    useEffect(() => {
        setForm(current ? { ...current } : { name: '', baseUrl: '', model: '', sendNames: true });
        setKey('');
        setModels([]);
    }, [selected, current?.id]);

    const save = async (activate = false) => {
        setBusy('save');
        try {
            const next = await api.saveConnection({ ...form, id: current?.id }, key ? key : undefined, activate || !settings?.connectionId);
            await refresh();
            const id = current?.id ?? next.connections[next.connections.length - 1]?.id;
            setSelected(id ?? null);
            setKey('');
            toast('连接已保存', 'success');
            return id;
        } catch (error) {
            reportError(error);
        } finally {
            setBusy('');
        }
    };
    const fetchModels = async () => {
        const id = current?.id ?? await save();
        if (!id) return;
        setBusy('models');
        try {
            setModels((await api.models(id)).models);
        } catch (error) {
            reportError(error);
        } finally {
            setBusy('');
        }
    };
    const test = async () => {
        const id = await save();
        if (!id) return;
        setBusy('test');
        try {
            const r = await api.testConnection(id);
            toast(`连接成功（${(r.ms / 1000).toFixed(1)} 秒）：${r.text.slice(0, 60)}`, 'success');
        } catch (error) {
            reportError(error);
        } finally {
            setBusy('');
        }
    };

    return (
        <div className="settings-section">
            <div className="chip-row">
                {connections.map(c => (
                    <button key={c.id} className={`chip${c.id === selected ? ' active' : ''}`} onClick={() => setSelected(c.id)}>
                        {c.id === settings?.connectionId && <span className="status-dot ok" />}{c.name}
                    </button>
                ))}
                <button className={`chip${!selected ? ' active' : ''}`} onClick={() => setSelected(null)}>＋ 新连接</button>
            </div>
            <p className="muted small">支持所有 OpenAI 兼容接口：OpenAI、DeepSeek、OpenRouter、各类中转，以及 Gemini / Claude 的兼容地址。</p>
            <Field label="名称"><input value={form.name ?? ''} placeholder="比如：我的中转" onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="接口地址" hint={<span>一般以 /v1 结尾</span>}>
                <input value={form.baseUrl ?? ''} placeholder="https://api.example.com/v1" onChange={e => setForm({ ...form, baseUrl: e.target.value })} />
            </Field>
            <Field label="API 密钥" hint={current?.hasKey ? <span>已保存，留空则不修改</span> : undefined}>
                <input type="password" value={key} placeholder={current?.hasKey ? '••••••••' : 'sk-…'} onChange={e => setKey(e.target.value)} autoComplete="off" />
            </Field>
            <Field label="模型">
                <div className="inline-fields">
                    <input className="grow" list="model-list" value={form.model ?? ''} placeholder="模型名" onChange={e => setForm({ ...form, model: e.target.value })} />
                    <datalist id="model-list">{models.map(m => <option key={m} value={m} />)}</datalist>
                    <Button variant="ghost" onClick={() => void fetchModels()} disabled={busy !== ''}>{busy === 'models' ? '获取中…' : '获取模型列表'}</Button>
                </div>
                {models.length > 0 && <span className="muted small">已获取 {models.length} 个模型，点输入框可选择</span>}
            </Field>
            <label className="check-row">
                <Toggle checked={form.sendNames ?? true} onChange={v => setForm({ ...form, sendNames: v })} />
                <span>发送 name 字段（和酒馆一致；如果接口报错可以关掉，名字会改写进内容里）</span>
            </label>
            <div className="row-end">
                {current && <Button variant="danger" onClick={() => void api.deleteConnection(current.id).then(refresh).then(() => setSelected(null)).catch(reportError)}>删除</Button>}
                <span className="grow" />
                <Button variant="ghost" onClick={() => void test()} disabled={busy !== ''}>{busy === 'test' ? '测试中…' : '测试连接'}</Button>
                {current && current.id !== settings?.connectionId && <Button onClick={() => void save(true)}>设为当前</Button>}
                <Button variant="primary" onClick={() => void save()} disabled={busy !== ''}>保存</Button>
            </div>
        </div>
    );
}

function PersonaSection() {
    const boot = useAppState(s => s.boot);
    const personas = boot?.resources.persona ?? [];
    const settings = boot?.settings;
    const [selected, setSelected] = useState<string | null>(settings?.personaId ?? null);
    const [persona, setPersona] = useState<Persona | null>(null);
    useEffect(() => {
        if (selected) void api.get<Persona>('persona', selected).then(setPersona).catch(reportError);
        else setPersona(null);
    }, [selected]);
    const [userName, setUserName] = useState(settings?.userName ?? 'User');

    const create = async () => {
        const p = await api.create<Persona>('persona', { name: settings?.userName || '我' });
        await api.saveSettings({ personaId: p.id });
        await refresh();
        setSelected(p.id);
    };
    const savePersona = async () => {
        if (!persona) return;
        await change<Persona>('persona', persona.id, [
            { op: 'set', path: ['name'], value: persona.name },
            { op: 'set', path: ['description'], value: persona.description },
            { op: 'set', path: ['position'], value: persona.position },
        ], '编辑用户角色');
        await refresh();
        toast('已保存', 'success');
    };

    return (
        <div className="settings-section">
            <p className="muted small">用户角色就是「你」在故事里的身份，对应酒馆的 Persona，会以 {'{{user}}'} 出现在提示词里。</p>
            <div className="chip-row">
                <button className={`chip${!selected ? ' active' : ''}`} onClick={() => { setSelected(null); void api.saveSettings({ personaId: null }).then(refresh); }}>仅名字</button>
                {personas.map(p => (
                    <button key={p.id} className={`chip${p.id === selected ? ' active' : ''}`} onClick={() => { setSelected(p.id); void api.saveSettings({ personaId: p.id }).then(refresh); }}>{p.name}</button>
                ))}
                <button className="chip" onClick={() => void create().catch(reportError)}>＋ 新建</button>
            </div>
            {!persona && (
                <Field label="你的名字">
                    <div className="inline-fields">
                        <input className="grow" value={userName} onChange={e => setUserName(e.target.value)} />
                        <Button onClick={() => void api.saveSettings({ userName }).then(refresh).then(() => toast('已保存', 'success')).catch(reportError)}>保存</Button>
                    </div>
                </Field>
            )}
            {persona && (
                <>
                    <Field label="名字"><input value={persona.name} onChange={e => setPersona({ ...persona, name: e.target.value })} /></Field>
                    <Field label="描述"><LongText label="用户角色描述" minRows={5} value={persona.description} onChange={v => setPersona({ ...persona, description: v })} /></Field>
                    <Field label="放在哪里">
                        <select value={persona.position} onChange={e => setPersona({ ...persona, position: e.target.value as Persona['position'] })}>
                            <option value="in_prompt">预设里的「用户角色」位置</option>
                            <option value="an_top">作者注释之前</option>
                            <option value="an_bottom">作者注释之后</option>
                            <option value="at_depth">聊天中（按深度）</option>
                            <option value="none">不发送</option>
                        </select>
                    </Field>
                    <div className="row-end">
                        <Button variant="danger" onClick={() => void api.remove('persona', persona.id).then(() => api.saveSettings({ personaId: null })).then(refresh).then(() => setSelected(null)).catch(reportError)}>删除</Button>
                        <span className="grow" />
                        <Button variant="primary" onClick={() => void savePersona().catch(reportError)}>保存</Button>
                    </div>
                </>
            )}
        </div>
    );
}

function LoreSection() {
    const settings = useAppState(s => s.boot?.settings);
    const books = useAppState(s => s.boot?.resources.lorebook ?? []);
    if (!settings) return null;
    const lore = settings.lore;
    const save = (patch: Partial<LoreSettings>) => void api.saveSettings({ lore: { ...lore, ...patch } }).then(refresh).catch(reportError);
    return (
        <div className="settings-section">
            <p className="muted small">与酒馆的世界书全局设置对应。</p>
            <div className="grid-fields">
                <label>扫描深度<input type="number" min={0} defaultValue={lore.scanDepth} onBlur={e => save({ scanDepth: Number(e.target.value) })} /></label>
                <label>预算（上下文 %）<input type="number" min={1} max={100} defaultValue={lore.budgetPercent} onBlur={e => save({ budgetPercent: Number(e.target.value) })} /></label>
                <label>预算上限（0 = 不限）<input type="number" min={0} defaultValue={lore.budgetCap} onBlur={e => save({ budgetCap: Number(e.target.value) })} /></label>
                <label>最少激活条数<input type="number" min={0} defaultValue={lore.minActivations} onBlur={e => save({ minActivations: Number(e.target.value) })} /></label>
            </div>
            {([
                ['recursive', '递归扫描（条目内容可以触发其他条目）'],
                ['includeNames', '扫描时包含说话人名字'],
                ['caseSensitive', '区分大小写'],
                ['matchWholeWords', '整词匹配'],
                ['useGroupScoring', '分组评分'],
            ] as [keyof LoreSettings, string][]).map(([k, label]) => (
                <label key={k} className="check-row"><Toggle checked={Boolean(lore[k])} onChange={v => save({ [k]: v })} /><span>{label}</span></label>
            ))}
            <Field label="全局世界书" hint={<span>对所有角色生效</span>}>
                <div className="chip-row">
                    {books.map(b => {
                        const on = lore.globalLorebookIds.includes(b.id);
                        return <button key={b.id} className={`chip${on ? ' active' : ''}`} onClick={() => save({ globalLorebookIds: on ? lore.globalLorebookIds.filter(x => x !== b.id) : [...lore.globalLorebookIds, b.id] })}>{b.name}</button>;
                    })}
                    {!books.length && <span className="muted small">还没有导入世界书</span>}
                </div>
            </Field>
        </div>
    );
}

const SHORTCUTS: [string, string][] = [
    ['Ctrl K', '快速查找角色、对话和功能'],
    ['Ctrl B', '显示或收起侧栏'],
    ['Ctrl I', '打开或关闭面板'],
    ['← →', '切换最后一条回复的版本（输入框为空时）；在最后一个版本按 → 会生成新版本'],
    ['Esc', '停止生成；关闭弹窗'],
    ['Enter', '发送；Shift + Enter 换行'],
    ['Ctrl Enter', '保存正在编辑的消息'],
    ['Ctrl =', '放大界面；Ctrl + - 缩小，Ctrl + 0 恢复'],
    ['F5', '重新载入界面'],
];

function updateText(p: PluginView): { text: string; tone?: 'error' | 'new' } | null {
    const u = p.update;
    if (u?.error) return { text: u.error, tone: 'error' };
    if (u?.updatedFrom && u.updatedAt) return { text: `已从 ${u.updatedFrom} 自动更新到 ${p.version}（${timeAgo(u.updatedAt)}）` };
    if (u?.latest && u.latest !== p.version) return { text: `有新版本 ${u.latest}`, tone: 'new' };
    if (u?.checkedAt) return { text: `已是最新（${timeAgo(u.checkedAt)}检查）` };
    return null;
}

function PluginsSection() {
    const plugins = useAppState(s => s.boot?.plugins ?? []);
    const [busy, setBusy] = useState('');
    const [link, setLink] = useState('');
    const run = async (key: string, action: () => Promise<unknown>, done?: string) => {
        setBusy(key);
        try {
            await action();
            await refresh();
            if (done) toast(done, 'success');
        } catch (error) {
            reportError(error);
        } finally {
            setBusy('');
        }
    };
    const install = async () => {
        const ok = await confirmAction({
            title: '安装这个插件？',
            body: '插件能访问你电脑上的文件和网络。只安装你信任的来源。安装后会按它提供的地址自动更新。',
            confirm: '安装',
        });
        if (!ok) return;
        await run('install', async () => {
            const { installed } = await api.installPlugin(link);
            setLink('');
            toast(`已安装「${installed.name}」${installed.version}`, 'success');
        });
    };
    const remove = async (p: PluginView) => {
        const ok = await confirmAction({ title: `删除「${p.name}」？`, body: '如果 Hearth 自带这个插件，会恢复为自带的版本。插件的设置会保留。', confirm: '删除', danger: true });
        if (ok) await run(`rm:${p.id}`, () => api.removePlugin(p.id), '已删除');
    };
    return (
        <div className="settings-section">
            <p className="muted small">插件在提示词组装和回复处理的各个环节加入功能。关闭插件后，卡片和预设里对应的内容会原样保存、不再处理。</p>
            <div className="plugin-list">
                {plugins.map(p => {
                    const status = updateText(p);
                    return (
                        <div key={p.id} className={`plugin${p.enabled && !p.error ? '' : ' off'}`}>
                            <div className="plugin-head">
                                <span className="plugin-name">{p.name}</span>
                                <span className="tag subtle">{p.version}</span>
                                <span className="tag subtle">{p.source === 'builtin' ? '内置' : '已下载'}</span>
                                <span className="grow" />
                                <Toggle checked={p.enabled} label={`启用${p.name}`} onChange={v => void run(`on:${p.id}`, () => api.setPlugin(p.id, { enabled: v }), v ? `已开启「${p.name}」` : `已关闭「${p.name}」`)} />
                            </div>
                            {p.description && <p className="plugin-desc">{p.description}</p>}
                            {p.error && <div className="msg-error">加载失败：{p.error}</div>}
                            <div className="plugin-meta">
                                {p.compat && <span>兼容 <a href={p.compat.url} target="_blank" rel="noreferrer">{p.compat.name}</a></span>}
                                {p.repository && <a href={p.repository} target="_blank" rel="noreferrer">更新来源</a>}
                                {status && <span className={status.tone === 'error' ? 'plugin-error' : status.tone === 'new' ? 'plugin-new' : ''}>{status.text}</span>}
                            </div>
                            <div className="plugin-actions">
                                {p.repository && (
                                    <label className="check-row small">
                                        <Toggle checked={p.autoUpdate} label="自动更新" onChange={v => void run(`au:${p.id}`, () => api.setPlugin(p.id, { autoUpdate: v }))} />
                                        <span>自动更新</span>
                                    </label>
                                )}
                                <span className="grow" />
                                {p.repository && <Button variant="ghost" disabled={busy !== ''} onClick={() => void run(`up:${p.id}`, () => api.updatePlugin(p.id))}>{busy === `up:${p.id}` ? '检查中…' : '检查更新'}</Button>}
                                {p.source === 'installed' && <Button variant="danger" disabled={busy !== ''} onClick={() => void remove(p)}>删除</Button>}
                            </div>
                        </div>
                    );
                })}
                {!plugins.length && <p className="muted small">没有插件。</p>}
            </div>
            <Field label="安装插件" hint={<span>填写插件所在的 GitHub 文件夹链接</span>}>
                <div className="inline-fields">
                    <input className="grow" value={link} placeholder="https://github.com/作者/仓库/tree/main/插件文件夹" spellCheck={false} onChange={e => setLink(e.target.value)} />
                    <Button variant="primary" disabled={!link.trim() || busy !== ''} onClick={() => void install()}>{busy === 'install' ? '安装中…' : '安装'}</Button>
                </div>
            </Field>
        </div>
    );
}

function appUpdateText(u: AppUpdateStatus | null | undefined): string {
    switch (u?.state) {
        case 'checking': return '正在检查更新…';
        case 'latest': return '已是最新版';
        case 'downloading': return `正在下载 ${u.version ?? '新版本'}（${u.percent ?? 0}%）`;
        case 'ready': return `${u.version} 已经下载好，关闭 Hearth 时会自动安装`;
        case 'error': return `检查更新失败：${u.error ?? '未知原因'}`;
        default: return '';
    }
}

function VersionField() {
    const info = useAppState(s => s.version);
    const update = info?.update;
    const busy = update?.state === 'checking' || update?.state === 'downloading';
    // While checking or downloading, follow the progress more closely than the app's minute timer.
    useEffect(() => {
        if (!busy) return;
        const timer = setInterval(() => void api.version().then(v => setState({ version: v })).catch(() => {}), 1000);
        return () => clearInterval(timer);
    }, [busy]);
    const check = () => void api.checkAppUpdate().then(u => setState(s => ({ version: s.version && { ...s.version, update: u } }))).catch(reportError);
    const status = appUpdateText(update);
    return (
        <Field label="版本">
            <div className="version-row">
                <span className="muted small">Hearth {info?.version || '未知'}{status && ` · ${status}`}</span>
                {info?.desktop && (update?.state === 'ready'
                    ? <Button variant="primary" onClick={() => void api.installAppUpdate().catch(reportError)}>重启更新</Button>
                    : <Button variant="ghost" disabled={busy} onClick={check}>{update?.state === 'downloading' ? '下载中…' : busy ? '检查中…' : '检查更新'}</Button>)}
                <a className="small" href={RELEASES_URL} target="_blank" rel="noreferrer">更新记录</a>
            </div>
        </Field>
    );
}

function AppearanceSection() {
    const settings = useAppState(s => s.boot?.settings);
    if (!settings) return null;
    return (
        <div className="settings-section">
            <div className="field">
                <span className="field-label">主题</span>
                <Segmented label="主题" value={settings.theme} options={[['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']] as const}
                    onChange={v => void api.saveSettings({ theme: v }).then(refresh).catch(reportError)} />
            </div>
            <div className="field">
                <span className="field-label">阅读<span className="field-hint">消息正文的排版；聊天窗口右上角的「Aa」也能随时调整</span></span>
                <div className="reading-card"><ReadingControls /></div>
            </div>
            <div className="field">
                <span className="field-label">快捷键</span>
                <dl className="shortcuts">
                    {SHORTCUTS.map(([keys, text]) => <div key={text}><dt>{keys.split(' ').map(k => <kbd key={k}>{k}</kbd>)}</dt><dd>{text}</dd></div>)}
                </dl>
            </div>
            <VersionField />
        </div>
    );
}

export function SettingsDialog() {
    const open = useAppState(s => s.settingsOpen);
    const requested = useAppState(s => s.settingsSection) as Section | null;
    const [section, setSection] = useState<Section>('connection');
    useEffect(() => {
        if (open && requested) setSection(requested);
    }, [open, requested]);
    if (!open) return null;
    const items: [Section, string][] = [['connection', '模型连接'], ['preset', '预设'], ['persona', '用户角色'], ['lore', '世界书'], ['plugins', '插件'], ['appearance', '阅读与外观']];
    return (
        <Modal title="设置" onClose={() => setState({ settingsOpen: false, settingsSection: null })} size="wide">
            <div className="settings">
                <nav className="settings-nav">
                    {items.map(([k, label]) => <button key={k} className={section === k ? 'active' : ''} onClick={() => setSection(k)}>{label}</button>)}
                </nav>
                <div className="settings-content">
                    {section === 'connection' && <ConnectionSection />}
                    {section === 'preset' && <PresetManager />}
                    {section === 'persona' && <PersonaSection />}
                    {section === 'lore' && <LoreSection />}
                    {section === 'plugins' && <PluginsSection />}
                    {section === 'appearance' && <AppearanceSection />}
                </div>
            </div>
        </Modal>
    );
}

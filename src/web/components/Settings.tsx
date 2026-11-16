import { useEffect, useState } from 'react';

import type { Connection, LoreSettings, Persona } from '../../core/types.ts';
import { api } from '../api.ts';
import { change, refresh, reportError, setState, toast, useAppState } from '../state.ts';
import { AutoTextarea, Button, Field, Modal, Toggle } from './common.tsx';
import { PresetManager } from './PresetManager.tsx';

type Section = 'connection' | 'preset' | 'persona' | 'lore' | 'appearance';

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
                    <Field label="描述"><AutoTextarea minRows={5} value={persona.description} onChange={e => setPersona({ ...persona, description: e.target.value })} /></Field>
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

function AppearanceSection() {
    const settings = useAppState(s => s.boot?.settings);
    const plugins = useAppState(s => s.boot?.plugins ?? []);
    const [version, setVersion] = useState('');
    useEffect(() => {
        void fetch('/api/version').then(r => r.json()).then((v: { version?: string }) => setVersion(v.version ?? '')).catch(() => {});
    }, []);
    if (!settings) return null;
    return (
        <div className="settings-section">
            <Field label="主题">
                <div className="chip-row">
                    {([['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']] as const).map(([v, label]) => (
                        <button key={v} className={`chip${settings.theme === v ? ' active' : ''}`} onClick={() => void api.saveSettings({ theme: v }).then(refresh).catch(reportError)}>{label}</button>
                    ))}
                </div>
            </Field>
            <Field label="版本">
                <span className="muted small">Hearth {version || '未知'} · 更新记录见安装目录里的 CHANGELOG.md</span>
            </Field>
            <Field label="插件">
                {plugins.length ? <ul className="plain">{plugins.map(p => <li key={p.id}>{p.name}{p.error && <span className="msg-error"> 加载失败：{p.error}</span>}</li>)}</ul>
                    : <span className="muted small">没有安装插件。把插件放到 Hearth 目录下的 plugins 文件夹后重启即可。</span>}
            </Field>
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
    const items: [Section, string][] = [['connection', '模型连接'], ['preset', '预设'], ['persona', '用户角色'], ['lore', '世界书'], ['appearance', '外观与关于']];
    return (
        <Modal title="设置" onClose={() => setState({ settingsOpen: false, settingsSection: null })} wide>
            <div className="settings">
                <nav className="settings-nav">
                    {items.map(([k, label]) => <button key={k} className={section === k ? 'active' : ''} onClick={() => setSection(k)}>{label}</button>)}
                </nav>
                <div className="settings-content">
                    {section === 'connection' && <ConnectionSection />}
                    {section === 'preset' && <PresetManager />}
                    {section === 'persona' && <PersonaSection />}
                    {section === 'lore' && <LoreSection />}
                    {section === 'appearance' && <AppearanceSection />}
                </div>
            </div>
        </Modal>
    );
}

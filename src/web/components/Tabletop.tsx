// 跑团 in the window: the check bar above a reply, and the 跑团 tab of the inspector. The data comes
// from the 跑团 plugin (message / swipe plugin data); see docs/tabletop.md.

import { useEffect, useState } from 'react';

import type { Character, Chat, ChatMessage, Preset, PromptEntry } from '../../core/types.ts';
import { TABLETOP_ENTRIES } from '../../plugins/tabletop/entries.ts';
import { describe } from '../../plugins/tabletop/attitude.ts';
import { CORE_ATTRIBUTES, difficultyWord, fmt, levelWord, PROTAGONIST, TIER_LABEL, type Tier } from '../../plugins/tabletop/rules.ts';
import {
    applyYamlEdit, AXES, cardSheet, messageData, relationValue, sheetToYaml, stateBefore, stateFromSheet, stateTarget, swipeData,
    type CheckView, type TabletopState,
} from '../../plugins/tabletop/sheet.ts';
import { api } from '../api.ts';
import { change, changeChat, refresh, reportError, toast } from '../state.ts';
import { AutoTextarea, Button, Empty, Field } from './common.tsx';

/** Live 跑团 progress while a reply is being prepared. */
export interface TabletopProgress {
    phase: 'ruling' | 'narrating';
    round?: number;
    checks: CheckView[];
    skipped?: 'pass';
}

function against(c: CheckView): string {
    return 'difficulty' in c.against ? difficultyWord(c.against.difficulty) : `对抗 ${c.against.opponent}`;
}

function CheckChip({ check }: { check: CheckView }) {
    const [open, setOpen] = useState(false);
    const tier = check.tier as Tier;
    return (
        <div className={`check tier-${tier}${open ? ' open' : ''}`}>
            <button type="button" className="check-head" onClick={() => setOpen(!open)} aria-expanded={open}>
                <span className="check-die" aria-hidden>🎲</span>
                {check.actor !== PROTAGONIST && <span className="check-actor">{check.actor}</span>}
                <span className="check-action">{check.action}</span>
                <span className="check-meta">{against(check)} · {check.line}% · 掷出 {check.roll}</span>
                <span className="check-tier">{TIER_LABEL[tier] ?? check.tier}</span>
            </button>
            {open && (
                <div className="check-body">
                    <p className="check-outcome">{check.outcome}</p>
                    {check.reason && <p><span className="muted">为什么说不准：</span>{check.reason}</p>}
                    <p><span className="muted">有效值：</span>{check.steps.join(' × ')} = {Math.round(check.value)}</p>
                    {'opponent' in check.against && <p><span className="muted">对方：</span>{check.against.steps.join(' × ')} = {Math.round(check.against.value)}</p>}
                    <p className="muted small">成功线 {check.line}：掷出 ≤ {Math.max(1, Math.round(check.line / 10))} 大成功，≤ {check.line} 成功，&gt; {100 - Math.max(1, Math.round((100 - check.line) / 10))} 大失败</p>
                </div>
            )}
        </div>
    );
}

/** The checks of a reply: open rolls shown, hidden rolls folded behind a count. */
export function CheckBar({ message, live }: { message: ChatMessage; live?: TabletopProgress | null }) {
    const [reveal, setReveal] = useState(false);
    const ruling = messageData(message)?.ruling;
    const checks = live?.checks ?? ruling?.checks ?? [];
    const judging = live ? live.phase === 'ruling' : false;
    const skipped = live?.skipped ?? ruling?.skipped;
    if (!live && !ruling) return null;
    const open = checks.filter(c => !c.hidden);
    const hidden = checks.filter(c => c.hidden);
    const settled = swipeData(message)?.settle?.results.filter(r => r.ok && r.text.startsWith(`${PROTAGONIST}：`)) ?? [];
    return (
        <div className="checks">
            {judging && <div className="check-status"><span className="pulse" />{live?.round && live.round > 1 ? `正在裁定（第 ${live.round} 次）…` : '正在裁定…'}</div>}
            {skipped === 'pass' && <div className="check-status">🎲 本轮检定绝对通过</div>}
            {ruling?.error && !live && <div className="check-status muted">🎲 裁定没有完成，这一轮按没有检定写</div>}
            {open.map((c, i) => <CheckChip key={i} check={c} />)}
            {(reveal ? hidden : []).map((c, i) => <CheckChip key={`h${i}`} check={c} />)}
            {hidden.length > 0 && (
                <button type="button" className="check-hidden" onClick={() => setReveal(!reveal)} title="主角察觉不到的检定">
                    {reveal ? '收起暗骰' : `暗骰 ×${hidden.length}`}
                </button>
            )}
            {!live && !checks.length && !skipped && !ruling?.error && <div className="check-status muted">🎲 这一轮没有需要掷骰的事</div>}
            {settled.length > 0 && <div className="check-status muted">{settled.map(r => r.text.slice(PROTAGONIST.length + 1)).join('；')}</div>}
        </div>
    );
}

/** Hides the settlement block while the reply is still streaming. */
export function hideSettlement(text: string): string {
    return text.replace(/<结算>[\s\S]*?(?:<\/结算>|$)/g, '');
}

// ---------------------------------------------------------------------------------------------
// Inspector tab
// ---------------------------------------------------------------------------------------------

function Attributes({ attrs, exact }: { attrs: Record<string, number>; exact: boolean }) {
    const order = [...CORE_ATTRIBUTES, ...Object.keys(attrs).filter(k => !(CORE_ATTRIBUTES as readonly string[]).includes(k))].filter(k => attrs[k] !== undefined);
    if (!order.length) return <p className="muted small">还没有登记属性</p>;
    return (
        <div className={`tt-attrs${exact ? '' : ' words'}`}>
            {order.map(k => (
                <div key={k} className="tt-attr">
                    <span className="tt-attr-name">{k}</span>
                    <span className="tt-attr-value">{exact ? attrs[k] : levelWord(attrs[k])}</span>
                </div>
            ))}
        </div>
    );
}

function CharacterCard({ name, state, exact, userName }: { name: string; state: TabletopState; exact: boolean; userName: string }) {
    const c = state.characters[name];
    const skills = Object.entries(c.skills);
    return (
        <div className="tt-card">
            <div className="tt-card-head">
                <span className="tt-name">{name === PROTAGONIST ? `${PROTAGONIST}${userName ? `（${userName}）` : ''}` : name}</span>
                {c.temporary && <span className="tag subtle">临时登记</span>}
                {c.aliases.length > 0 && <span className="muted small">又名 {c.aliases.join('、')}</span>}
            </div>
            <Attributes attrs={c.attributes} exact={exact} />
            {skills.length > 0 && <p className="small"><span className="muted">特长：</span>{skills.map(([k, v]) => `${k}·${v}`).join('、')}</p>}
            {c.status.length > 0 && <p className="small"><span className="muted">状态：</span>{c.status.map(s => `${s.name}${exact && Object.keys(s.effects).length ? `（${Object.entries(s.effects).map(([k, f]) => `${k}×${fmt(f)}`).join(' ')}）` : ''}`).join('、')}</p>}
            {exact && Object.values(c.traits).some(v => v !== 1) && <p className="small"><span className="muted">性格：</span>{Object.entries(c.traits).map(([k, v]) => `${k} ${fmt(v)}`).join('　')}</p>}
            {exact && c.description && <p className="small muted">{c.description}</p>}
        </div>
    );
}

function RelationCard({ state, index }: { state: TabletopState; index: number }) {
    const r = state.relations[index];
    return (
        <div className="tt-card">
            <div className="tt-card-head">
                <span className="tt-name">{r.from} → {r.to}</span>
                <span className="tt-words">{describe(r)}</span>
                <span className="muted small">熟悉 {r.familiarity}</span>
            </div>
            <div className="tt-axes">
                {AXES.map(([axis, label]) => {
                    const v = relationValue(r, axis);
                    const mood = Math.round(r.mood[axis]);
                    return (
                        <div key={axis} className={`tt-axis axis-${axis}`} title={mood ? `其中一时的情绪 ${mood > 0 ? '+' : ''}${mood}` : undefined}>
                            <span className="tt-axis-name">{label}</span>
                            <span className="tt-bar"><span style={{ width: `${v}%` }} /></span>
                            <span className="tt-axis-value">{v}{mood ? <sup>{mood > 0 ? '+' : ''}{mood}</sup> : null}</span>
                        </div>
                    );
                })}
            </div>
            {r.reasons.length > 0 && (
                <ul className="tt-reasons">
                    {r.reasons.slice().reverse().map((x, i) => <li key={i}>{x.text}{x.change ? <span className="muted">（{x.change}）</span> : null}</li>)}
                </ul>
            )}
        </div>
    );
}

const MARKER = /<<<\|\s*hearth\s*\|\s*ruling\s*>>>/i;

/** The preset has the 🎲 entries switched on. */
function presetReady(preset: Preset): boolean {
    const on = new Set(preset.order.filter(o => o.enabled).map(o => o.id));
    return preset.prompts.some(p => on.has(p.id) && MARKER.test(p.content));
}

/** Offers to add the three 🎲 entries to the current preset (at the end, switched on). */
function PresetNotice({ presetId }: { presetId: string }) {
    const [preset, setPreset] = useState<Preset | null>(null);
    const load = () => void api.get<Preset>('preset', presetId).then(setPreset).catch(() => setPreset(null));
    useEffect(load, [presetId]);
    if (!preset || presetReady(preset)) return null;
    const add = async () => {
        const template = preset.prompts.find(p => !p.marker);
        const ops = TABLETOP_ENTRIES.flatMap((e, i) => {
            const id = `hearth-tabletop-${['ruling', 'narrate', 'pass'][i]}`;
            const exists = preset.prompts.some(p => p.id === id);
            const entry: PromptEntry = {
                id, name: e.name, role: 'system', content: e.content, marker: false, builtin: false,
                injection: template?.injection ?? { mode: 'relative', depth: 4, order: 100 }, triggers: [], forbidOverrides: false,
            };
            return [
                exists ? { op: 'set' as const, path: ['prompts', `@${id}`], value: entry } : { op: 'insert' as const, path: ['prompts'], value: entry },
                preset.order.some(o => o.id === id) ? { op: 'set' as const, path: ['order', `@${id}`, 'enabled'], value: true } : { op: 'insert' as const, path: ['order'], value: { id, enabled: true } },
            ];
        });
        await change('preset', preset.id, ops, '加上跑团的 🎲 条目');
        await refresh();
        load();
        toast('已把三条 🎲 条目加到当前预设末尾，可以在预设里查看和修改', 'success');
    };
    return (
        <div className="notice small tt-notice">
            <span>当前预设「{preset.name}」里没有跑团的「🎲」条目，跑团不会启动。第一版适配小猫之神预设。</span>
            <Button variant="primary" onClick={() => void add().catch(reportError)}>加到当前预设</Button>
        </div>
    );
}

export function TabletopTab({ chat, userName, presetId }: { chat: Chat; userName: string; presetId?: string }) {
    const [character, setCharacter] = useState<Character | null>(null);
    const [reveal, setReveal] = useState(false);
    const [editing, setEditing] = useState<string | null>(null);
    useEffect(() => {
        void api.get<Character>('character', chat.characterId).then(setCharacter).catch(() => setCharacter(null));
    }, [chat.characterId]);
    const state = stateBefore(chat, chat.messages.length, character);
    const fromCard = cardSheet(character);
    if (!state) {
        return (
            <div className="tab-body">
                {presetId && <PresetNotice presetId={presetId} />}
                <Empty title="这张卡还没有跑团数据">切换到「编辑」模式，点「数据化适配」，让 AI 通读卡片，建立角色表和初始态度。</Empty>
            </div>
        );
    }
    const save = async (next: TabletopState, note: string) => {
        await changeChat(chat.id, [{ op: 'set', path: stateTarget(chat), value: next }], note);
        toast('已保存跑团数据，可以在「历史」里撤销', 'success');
    };
    const others = Object.keys(state.characters).filter(n => n !== PROTAGONIST);
    const own = state.relations.map((r, i) => ({ r, i })).filter(({ r }) => r.from === PROTAGONIST);
    const theirs = state.relations.map((r, i) => ({ r, i })).filter(({ r }) => r.from !== PROTAGONIST);
    const log = reveal ? state.log : state.log.filter(l => l.text.startsWith(`${PROTAGONIST}：`));
    return (
        <div className="tab-body tt">
            {presetId && <PresetNotice presetId={presetId} />}
            <div className="tab-toolbar">
                <span className="muted">第 {state.turn} 轮{state.turn === 0 ? ' · 来自卡片' : ''}</span>
                <span className="grow" />
                <Button variant="ghost" onClick={() => setReveal(!reveal)}>{reveal ? '藏起来' : '揭开'}</Button>
                <Button variant="ghost" onClick={() => setEditing(editing === null ? sheetToYaml(state) : null)}>{editing === null ? '编辑数值' : '取消编辑'}</Button>
            </div>
            {!reveal && <p className="muted small">按主角的视角：NPC 只显示大致水平，他们心里的态度默认藏着。点「揭开」查看全部数值。</p>}
            {editing !== null ? (
                <Field label="跑团数据（YAML）" hint="态度改过的线会成为长期态度；保存后从这一轮开始生效">
                    <AutoTextarea className="mono" value={editing} minRows={12} maxHeight={Math.round(window.innerHeight * 0.65)} spellCheck={false} onChange={e => setEditing(e.target.value)} />
                    <div className="row-end">
                        {fromCard && <Button variant="ghost" onClick={() => void save({ ...stateFromSheet(fromCard), turn: state.turn, log: state.log }, '从卡片重新载入跑团数据').then(() => setEditing(null)).catch(reportError)}>从卡片重新载入</Button>}
                        <span className="grow" />
                        <Button variant="primary" onClick={() => {
                            try {
                                const next = applyYamlEdit(state, editing);
                                void save(next, '手动修改跑团数据').then(() => setEditing(null)).catch(reportError);
                            } catch (error) {
                                reportError(error);
                            }
                        }}>保存</Button>
                    </div>
                </Field>
            ) : (
                <>
                    {state.characters[PROTAGONIST] && <CharacterCard name={PROTAGONIST} state={state} exact userName={userName} />}
                    {own.length > 0 && <Field label="主角的态度">{own.map(({ i }) => <RelationCard key={i} state={state} index={i} />)}</Field>}
                    {others.length > 0 && <Field label="其他角色">{others.map(n => <CharacterCard key={n} name={n} state={state} exact={reveal} userName={userName} />)}</Field>}
                    {reveal && theirs.length > 0 && <Field label="他们的态度">{theirs.map(({ i }) => <RelationCard key={i} state={state} index={i} />)}</Field>}
                    {!reveal && theirs.length > 0 && <p className="muted small">还有 {theirs.length} 份其他角色的态度，点「揭开」查看。</p>}
                    {log.length > 0 && (
                        <Field label="变化记录">
                            <ul className="tt-log">{log.slice().reverse().slice(0, 40).map((l, i) => <li key={i}><span className="muted">第 {l.turn} 轮</span> {l.text}</li>)}</ul>
                        </Field>
                    )}
                </>
            )}
        </div>
    );
}

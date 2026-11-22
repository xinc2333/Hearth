// 世界 in the window (docs/world.md §12): the 「新建世界」 entry, the opening form, the status line
// above the composer, what happened on the way above each reply, and the 「这里」「地图」「手机」 tabs.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Chat, ChatMessage, Persona, Preset, PromptEntry } from '../../core/types.ts';
import { TABLETOP_ENTRIES } from '../../plugins/tabletop/entries.ts';
import { messageData, swipeData } from '../../plugins/tabletop/sheet.ts';
import { DEFAULT_START, type SetupForm } from '../../plugins/tabletop/world/apply.ts';
import { worldCardJson, WORLD_CARD_NAME, WORLD_TAG } from '../../plugins/tabletop/world/card.ts';
import { KIND_LABEL, lanjiang, type Point } from '../../plugins/tabletop/world/city/index.ts';
import { WORLD_ENTRIES } from '../../plugins/tabletop/world/entries.ts';
import { mapSvg, type MapMarker } from '../../plugins/tabletop/world/map-svg.ts';
import { ageWords } from '../../plugins/tabletop/world/scene.ts';
import {
    bodyWords, clock, dateKey, dayMatches, fmtDay, fmtNow, fmtWeather, minutesOf, nearby, placeById, type WorldState,
} from '../../plugins/tabletop/world/state.ts';
import { api, type Summary } from '../api.ts';
import { change, changeChat, getState, newChat, pluginAction, refresh, reportError, runGeneration, toast, toggleInspector, useAppState } from '../state.ts';
import { describe, findRelation } from '../../plugins/tabletop/attitude.ts';
import { MAX_IMPORTANT, type ImportantProfile } from '../../plugins/tabletop/world/minds.ts';
import type { TabletopState } from '../../plugins/tabletop/sheet.ts';
import { Button, Field } from './common.tsx';
import { Icon } from '../icons.tsx';

const city = () => lanjiang();

export const isWorldCard = (c: Pick<Summary, 'name' | 'tags'> | undefined) => Boolean(c && c.name === WORLD_CARD_NAME && c.tags?.includes(WORLD_TAG));

/** What the chat keeps about its world: the opening form and the starting world. */
const chatWorld = (chat: Chat) => (chat.plugins?.tabletop as { world?: { setup?: SetupForm; base?: WorldState; important?: Record<string, ImportantProfile>; queue?: unknown[] } } | undefined)?.world;

/** The latest 跑团 state of the chat. */
function currentState(chat: Chat): TabletopState | null {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
        const s = swipeData(chat.messages[i])?.state;
        if (s) return s;
    }
    return (chat.plugins?.tabletop as { base?: TabletopState } | undefined)?.base ?? null;
}

/** 「设为重要人物」 for someone in the scene, someone known, text or a card. */
function promote(chat: Chat, payload: Record<string, unknown>, done?: () => void) {
    toast('正在写档案…');
    void pluginAction(chat.id, 'tabletop', 'world-promote', payload)
        .then(next => {
            const queued = ((next.plugins?.tabletop as { world?: { queue?: unknown[] } } | undefined)?.world?.queue ?? []).length;
            toast(queued ? '下一轮开始前补全档案' : '已设为重要人物', 'success');
            done?.();
        })
        .catch(reportError);
}

export const isWorldChat = (chat: Chat | undefined) => Boolean(chat && chatWorld(chat));

/** The world as it stands now: the latest reply that carries one, else the starting world. */
export function currentWorld(chat: Chat): WorldState | null {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
        const w = swipeData(chat.messages[i])?.world;
        if (w) return w;
    }
    return chatWorld(chat)?.base ?? null;
}

// ---------------------------------------------------------------------------------------------
// Starting a world
// ---------------------------------------------------------------------------------------------

/** Opens a new 澜江市 chat, adding the card first if it is not there yet. */
export async function newWorld() {
    let card = getState().boot?.resources.character.find(isWorldCard);
    if (!card) {
        const file = new File([JSON.stringify(worldCardJson())], `${WORLD_CARD_NAME}.json`, { type: 'application/json' });
        await api.importFile(file);
        await refresh();
        card = getState().boot?.resources.character.find(isWorldCard);
    }
    if (!card) throw new Error('没能添加「澜江市」');
    await newChat(card.id);
}

const marker = (kind: string) => new RegExp(`<<<\\|\\s*hearth\\s*\\|\\s*${kind}\\s*>>>`, 'i');

/** Adds the 跑团 and 世界 entries the preset is missing (at the end, switched on). Says whether it changed anything. */
async function ensureEntries(presetId: string): Promise<boolean> {
    const preset = await api.get<Preset>('preset', presetId);
    const template = preset.prompts.find(p => !p.marker);
    const wanted = [
        ...TABLETOP_ENTRIES.map(e => ({ id: `hearth-tabletop-${e.kind}`, kind: e.kind as string, name: e.name, content: e.content })),
        ...WORLD_ENTRIES.map(e => ({ id: `hearth-${e.kind}`, kind: e.kind as string, name: e.name, content: e.content })),
    ];
    const ops = wanted.flatMap(e => {
        if (preset.prompts.some(p => marker(e.kind).test(p.content))) return [];
        const entry: PromptEntry = {
            id: e.id, name: e.name, role: 'system', content: e.content, marker: false, builtin: false,
            injection: template?.injection ?? { mode: 'relative', depth: 4, order: 100 }, triggers: [], forbidOverrides: false,
        };
        return [
            { op: 'insert' as const, path: ['prompts'], value: entry },
            preset.order.some(o => o.id === e.id) ? { op: 'set' as const, path: ['order', `@${e.id}`, 'enabled'], value: true } : { op: 'insert' as const, path: ['order'], value: { id: e.id, enabled: true } },
        ];
    });
    if (!ops.length) return false;
    await change('preset', preset.id, ops, '加上跑团和世界的条目');
    return true;
}

const JOBS: SetupForm['job'][] = ['上班族', '学生', '自由职业', '无业'];

/** The opening form, shown in a new 澜江市 chat before anything happens. */
export function WorldSetup({ chat }: { chat: Chat }) {
    const context = useAppState(s => s.contexts[chat.id]);
    const [form, setForm] = useState<SetupForm>(() => chatWorld(chat)?.setup ?? { name: context?.userName || '', gender: '男', age: 26, job: '上班族', jobText: '', district: '', about: '', start: DEFAULT_START });
    const [busy, setBusy] = useState(false);
    const set = (patch: Partial<SetupForm>) => setForm(f => ({ ...f, ...patch }));
    const start = async () => {
        if (!form.name.trim()) return toast('先给主角起个名字', 'error');
        setBusy(true);
        try {
            const presetId = context?.preset.id;
            const added = presetId ? await ensureEntries(presetId) : false;
            const description = [`${form.gender ?? ''}，${form.age ?? ''} 岁`, form.jobText || form.job, form.about].filter(Boolean).join('。');
            // A second try (the first opening failed) keeps the same 用户角色.
            const personaId = chat.personaId && chatWorld(chat)?.setup
                ? (await change('persona', chat.personaId, [{ op: 'set', path: ['name'], value: form.name.trim() }, { op: 'set', path: ['description'], value: description }], '世界开局'), chat.personaId)
                : (await api.create<Persona>('persona', { name: form.name.trim(), description })).id;
            await changeChat(chat.id, [
                { op: 'set', path: ['personaId'], value: personaId },
                { op: 'set', path: ['plugins', 'tabletop', 'world', 'setup'], value: { ...form, name: form.name.trim() } },
            ], '世界开局');
            if (added) toast('已把跑团和世界的条目加到当前预设末尾，可以在预设里查看和修改', 'success');
            await runGeneration(chat.id, 'normal');
        } catch (error) {
            reportError(error);
        } finally {
            setBusy(false);
        }
    };
    return (
        <div className="world-setup">
            <h2>开始在澜江市的生活</h2>
            <p className="muted small">设定好主角，模型会把他的工作、住处、收入和身边的人落成数据，然后从{form.start?.slice(11) || '早上'}开始写起。生成的数值之后都可以在「跑团」页里改。</p>
            <div className="world-setup-grid">
                <Field label="名字"><input value={form.name} onChange={e => set({ name: e.target.value })} placeholder="主角的名字" /></Field>
                <Field label="性别">
                    <select value={form.gender} onChange={e => set({ gender: e.target.value })}><option>男</option><option>女</option></select>
                </Field>
                <Field label="年龄"><input type="number" min={16} max={80} value={form.age ?? ''} onChange={e => set({ age: Number(e.target.value) || undefined })} /></Field>
                <Field label="职业">
                    <select value={form.job} onChange={e => set({ job: e.target.value as SetupForm['job'] })}>{JOBS.map(j => <option key={j}>{j}</option>)}</select>
                </Field>
                <Field label="具体做什么" hint="可以不写"><input value={form.jobText} onChange={e => set({ jobText: e.target.value })} placeholder={form.job === '学生' ? '例如「澜江大学大三，学新闻」' : '例如「广告公司的设计」'} /></Field>
                <Field label="住在哪个区" hint="不选就按职业和收入挑">
                    <select value={form.district} onChange={e => set({ district: e.target.value })}>
                        <option value="">交给模型挑</option>
                        {city().districts.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                    </select>
                </Field>
                <Field label="开始的时间"><input value={form.start} onChange={e => set({ start: e.target.value })} placeholder={DEFAULT_START} /></Field>
            </div>
            <Field label="关于主角" hint="外貌、性格、经历，随便写，可以不写">
                <textarea rows={4} value={form.about} onChange={e => set({ about: e.target.value })} />
            </Field>
            <p className="muted small">当前预设里还没有跑团和世界的条目时，开始后会顺带加上。</p>
            <Button variant="primary" disabled={busy} onClick={() => void start()}>{busy ? '正在开局…' : '开始'}</Button>
        </div>
    );
}

// ---------------------------------------------------------------------------------------------
// In the chat
// ---------------------------------------------------------------------------------------------

/** The line above the composer: day and time, weather, where, money and how the body feels. */
export function WorldBar({ chat }: { chat: Chat }) {
    const world = currentWorld(chat);
    if (!world) return null;
    const place = placeById(world, city(), world.at);
    const district = place ? city().districts.find(d => d.id === place.district)?.name : '';
    const feel = bodyWords(world.body);
    return (
        <button type="button" className="world-bar" onClick={() => toggleInspector('here')} title="查看这里">
            <span>{fmtNow(world)}</span>
            <span className="sep">·</span>
            <span>{world.weather[0] ? fmtWeather(world.weather[0]) : ''}</span>
            <span className="sep">·</span>
            <Icon name="pin" size={13} />
            <span className="grow-text">{district} {place?.name}</span>
            <span className="sep">·</span>
            <span>余额 {world.balance.toLocaleString('zh-CN')} 元</span>
            {feel.length > 0 && <span className="world-feel">{feel.join('、')}</span>}
        </button>
    );
}

/** Above a reply: the trip there and what happened during the turn. */
export function WorldTurn({ message }: { message: ChatMessage }) {
    const turn = messageData(message)?.world;
    if (!turn) return null;
    const { plan, after } = turn;
    const place = placeById(after, city(), plan.move?.to ?? after.at);
    const events = plan.events.filter(e => e.kind !== 'move');
    const people = after.scene?.people.length ?? 0;
    return (
        <div className="world-turn">
            {plan.move && place && (
                <span className="world-chip" title={plan.move.trip.legs.join('\n')}>
                    <Icon name="pin" size={12} />到达 {place.name} · {plan.move.trip.minutes} 分钟{plan.move.trip.cost ? ` · ${plan.move.trip.cost} 元` : ''}
                </span>
            )}
            {plan.skipped && <span className="world-chip">跳到 {dateKey(plan.to)} {clock(plan.to)}</span>}
            {plan.move && <span className="world-chip muted">{people ? `这里有 ${people} 个人` : '这里没有别人'}</span>}
            {events.map((e, i) => <span key={i} className={`world-chip${e.kind === 'lapse' ? ' lapse' : ''}`}>{e.text}</span>)}
        </div>
    );
}

// ---------------------------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------------------------

/** 「这里」: the place, who is here as the protagonist sees them, and what is nearby. */
export function HereTab({ chat }: { chat: Chat }) {
    const world = currentWorld(chat);
    if (!world) return <div className="empty-tab muted small">世界还没有开始。</div>;
    const c = city();
    const place = placeById(world, c, world.at);
    if (!place) return null;
    const district = c.districts.find(d => d.id === place.district);
    const people = world.scene?.people ?? [];
    const known = Object.entries(world.people).filter(([, p]) => p.kind !== 'bystander' && p.at === place.id).map(([n]) => n);
    return (
        <div className="world-tab">
            <section>
                <h3>{place.name}</h3>
                <div className="muted small">{district?.name} · {KIND_LABEL[place.kind]} · {place.hours}</div>
                <p>{place.about}</p>
                <div className="muted small">{fmtNow(world)} · {world.weather[0] ? fmtWeather(world.weather[0]) : ''}</div>
            </section>
            <section>
                <h4>这里的人</h4>
                {world.scene?.crowd && <p className="muted small">{world.scene.crowd}</p>}
                {!people.length && <p className="muted small">没有别人。</p>}
                <ul className="here-people">
                    {people.map(p => (
                        <li key={p.id}>
                            <div className="here-who">
                                {p.name ?? `${ageWords(p.age)}的${p.gender === '女' ? '女性' : '男性'}`}
                                {p.role === 'staff' && <span className="muted small">　这里的{p.purpose}</span>}
                            </div>
                            {p.looks && <div className="muted small">{p.looks}</div>}
                            {(p.doing || p.where) && <div className="small">{[p.where, p.doing].filter(Boolean).join('，')}</div>}
                            {!(p.name && chatWorld(chat)?.important?.[p.name]) && (
                                <button type="button" className="link small" onClick={() => promote(chat, { sceneId: p.id })}>设为重要人物</button>
                            )}
                        </li>
                    ))}
                </ul>
                {known.length > 0 && <p className="small">认识的人：{known.join('、')}</p>}
            </section>
            <section>
                <h4>附近</h4>
                <ul className="here-near">
                    {nearby(world, c, place.at, 8, place.id).map(({ place: p, km }) => (
                        <li key={p.id}><span>{p.name}</span><span className="muted small">{KIND_LABEL[p.kind]} · {km < 1 ? `${Math.round(km * 100) * 10} 米` : `${km.toFixed(1)} 公里`}</span></li>
                    ))}
                </ul>
            </section>
        </div>
    );
}

type View = [number, number, number, number];

/** 「地图」: the city map, draggable and zoomable, with the protagonist and today's appointments on it. */
export function MapTab({ chat }: { chat: Chat }) {
    const world = currentWorld(chat);
    const c = city();
    const here = world ? placeById(world, c, world.at) : undefined;
    const box = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(480);
    const centre: Point = here?.at ?? [0, 0];
    const [view, setView] = useState<View>(() => [centre[0] - 6, centre[1] - 6, centre[0] + 6, centre[1] + 6]);
    useEffect(() => {
        const el = box.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setWidth(Math.max(240, Math.round(el.clientWidth))));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const markers = useMemo<MapMarker[]>(() => {
        if (!world) return [];
        const out: MapMarker[] = [];
        for (const cm of world.commitments) {
            if (cm.ended) continue;
            for (const e of cm.expectations) {
                if (e.kind !== 'presence' || e.who !== '主角' || !/^\d{4}-/.test(e.days) || e.days < dateKey(world.now)) continue;
                const p = placeById(world, c, e.place);
                if (p) out.push({ at: p.at, label: `${cm.name} ${e.from}`, kind: 'appointment' });
            }
        }
        for (const name of Object.keys(chatWorld(chat)?.important ?? {})) {
            const p = placeById(world, c, world.people[name]?.at);
            if (p) out.push({ at: p.at, label: name, kind: 'person' });
        }
        if (here) out.push({ at: here.at, label: '你', kind: 'self' });
        return out;
    }, [world, here, c]);
    // The view keeps the box's shape.
    const aspect = (box.current?.clientHeight || width) / width;
    const w = view[2] - view[0];
    const shaped: View = [view[0], (view[1] + view[3]) / 2 - (w * aspect) / 2, view[2], (view[1] + view[3]) / 2 + (w * aspect) / 2];
    const svg = useMemo(() => mapSvg(c, { view: shaped, width, markers }), [c, shaped[0], shaped[1], shaped[2], shaped[3], width, markers]);
    const drag = useRef<{ x: number; y: number; view: View } | null>(null);
    const zoom = (factor: number, at?: Point) => setView(v => {
        const [cx, cy] = at ?? [(v[0] + v[2]) / 2, (v[1] + v[3]) / 2];
        const nw = Math.min(70, Math.max(1.2, (v[2] - v[0]) * factor));
        const nh = Math.min(70, Math.max(1.2, (v[3] - v[1]) * factor));
        const fx = (cx - v[0]) / (v[2] - v[0]);
        const fy = (cy - v[1]) / (v[3] - v[1]);
        return [cx - nw * fx, cy - nh * fy, cx - nw * fx + nw, cy - nh * fy + nh];
    });
    if (!world) return <div className="empty-tab muted small">世界还没有开始。</div>;
    return (
        <div className="world-map-tab">
            <div className="world-map-tools">
                <Button onClick={() => setView([c.bounds[0] - 1, c.bounds[1] - 1, c.bounds[2] + 1, c.bounds[3] + 1])}>全城</Button>
                <Button onClick={() => here && setView([here.at[0] - 2, here.at[1] - 2, here.at[0] + 2, here.at[1] + 2])}>回到我</Button>
                <span className="grow" />
                <Button onClick={() => zoom(0.6)}>放大</Button>
                <Button onClick={() => zoom(1 / 0.6)}>缩小</Button>
            </div>
            <div
                ref={box}
                className="world-map"
                onPointerDown={e => {
                    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                    drag.current = { x: e.clientX, y: e.clientY, view };
                }}
                onPointerMove={e => {
                    const d = drag.current;
                    if (!d) return;
                    const k = (d.view[2] - d.view[0]) / width;
                    const dx = (e.clientX - d.x) * k;
                    const dy = (e.clientY - d.y) * k;
                    setView([d.view[0] - dx, d.view[1] - dy, d.view[2] - dx, d.view[3] - dy]);
                }}
                onPointerUp={() => { drag.current = null; }}
                onWheel={e => {
                    const rect = box.current!.getBoundingClientRect();
                    const at: Point = [shaped[0] + ((e.clientX - rect.left) / rect.width) * (shaped[2] - shaped[0]), shaped[1] + ((e.clientY - rect.top) / rect.height) * (shaped[3] - shaped[1])];
                    zoom(e.deltaY > 0 ? 1.25 : 0.8, at);
                }}
                dangerouslySetInnerHTML={{ __html: svg }}
            />
        </div>
    );
}

/** 「手机」: contacts, messages, the agenda, money and the forecast. */
export function PhoneTab({ chat }: { chat: Chat }) {
    const world = currentWorld(chat);
    if (!world) return <div className="empty-tab muted small">世界还没有开始。</div>;
    const c = city();
    const agenda: string[] = [];
    for (let i = 0; i < 7; i++) {
        const day = Math.floor(world.now / 1440) * 1440 + i * 1440;
        for (const cm of world.commitments) {
            if (cm.ended) continue;
            for (const e of cm.expectations) {
                if (e.kind === 'presence' && e.who === '主角' && dayMatches(e.days, day) && day + minutesOf(e.to) > world.now) {
                    agenda.push(`${fmtDay(day)} ${e.from}–${e.to} ${placeById(world, c, e.place)?.name ?? ''}（${cm.name}）`);
                }
            }
        }
    }
    const messages = [...world.phone.messages].reverse().slice(0, 30);
    const ledger = [...world.ledger].reverse().slice(0, 30);
    return (
        <div className="world-tab">
            <section>
                <h4>日程</h4>
                {!agenda.length && <p className="muted small">这周没有安排。</p>}
                <ul className="phone-list">{agenda.slice(0, 12).map((a, i) => <li key={i}>{a}</li>)}</ul>
            </section>
            <section>
                <h4>天气</h4>
                <ul className="phone-list">{world.weather.map(w => <li key={w.date}>{w.date.slice(5).replace('-', ' 月 ')} 日 · {fmtWeather(w)}</li>)}</ul>
            </section>
            <section>
                <h4>消息</h4>
                {!messages.length && <p className="muted small">还没有消息。</p>}
                <ul className="phone-list">{messages.map((m, i) => <li key={i}><span className="muted small">{dateKey(m.at).slice(5)} {clock(m.at)}</span> {m.from === '主角' ? `发给${m.to}` : m.from}：{m.text}</li>)}</ul>
            </section>
            <section>
                <h4>联系人</h4>
                <p className="small">{world.phone.contacts.join('、') || '还没有'}</p>
            </section>
            <section>
                <h4>账单 · 余额 {world.balance.toLocaleString('zh-CN')} 元</h4>
                <ul className="phone-list">{ledger.map((l, i) => <li key={i}><span className="muted small">{dateKey(l.at).slice(5)} {clock(l.at)}</span> {l.reason} <span className={l.amount < 0 ? 'neg' : 'pos'}>{l.amount > 0 ? '+' : ''}{l.amount}</span></li>)}</ul>
            </section>
        </div>
    );
}

/** 「人物」: the 重要人物 and the people around the protagonist. */
export function PeopleTab({ chat }: { chat: Chat }) {
    const world = currentWorld(chat);
    const state = currentState(chat);
    const cards = useAppState(s => s.boot?.resources.character ?? []);
    const [text, setText] = useState('');
    const [cardId, setCardId] = useState('');
    const [open, setOpen] = useState<string | null>(null);
    if (!world) return <div className="empty-tab muted small">世界还没有开始。</div>;
    const c = city();
    const important = chatWorld(chat)?.important ?? {};
    const names = Object.keys(important);
    const others = Object.entries(world.people).filter(([n, p]) => !important[n] && p.kind !== 'bystander');
    const met = Object.entries(world.people).filter(([n, p]) => !important[n] && p.kind === 'bystander');
    const feel = (n: string) => {
        const rel = state ? findRelation(state, n, '主角') : null;
        return rel ? describe(rel) : '';
    };
    return (
        <div className="world-tab">
            <section>
                <h4>重要人物 · {names.length}/{MAX_IMPORTANT}</h4>
                {!names.length && <p className="muted small">还没有重要人物。可以在「这里」页或下面把遇到的人设为重要人物。</p>}
                <ul className="people-list">
                    {names.map(n => {
                        const p = world.people[n];
                        return (
                            <li key={n}>
                                <div className="people-head">
                                    <strong>{n}</strong>
                                    <span className="muted small">{p?.role}</span>
                                    <span className="grow" />
                                    <button type="button" className="link small" onClick={() => void pluginAction(chat.id, 'tabletop', 'world-demote', { name: n }).then(() => toast(`已取消，${n}的档案留着`, 'success')).catch(reportError)}>取消重要人物</button>
                                </div>
                                <div className="small">{important[n].summary}</div>
                                <div className="muted small">
                                    在{placeById(world, c, p?.at)?.name ?? '不知道的地方'}
                                    {p?.mood !== undefined && ` · 心情 ${Math.round(p.mood)} · 压力 ${Math.round(p.stress ?? 0)}`}
                                    {feel(n) && ` · 对你：${feel(n)}`}
                                </div>
                                {p?.recent && <div className="muted small">近况：{p.recent}</div>}
                                <button type="button" className="link small" onClick={() => setOpen(open === n ? null : n)}>{open === n ? '收起档案' : '查看档案'}</button>
                                {open === n && <pre className="people-profile">{important[n].profile}</pre>}
                            </li>
                        );
                    })}
                </ul>
            </section>
            {others.length > 0 && (
                <section>
                    <h4>身边的人</h4>
                    <ul className="people-list">
                        {others.map(([n, p]) => (
                            <li key={n}>
                                <div className="people-head"><strong>{n}</strong><span className="muted small">{p.role}</span><span className="grow" />
                                    <button type="button" className="link small" onClick={() => promote(chat, { name: n })}>设为重要人物</button></div>
                                {p.brief && <div className="muted small">{p.brief}</div>}
                                {feel(n) && <div className="muted small">对你：{feel(n)}</div>}
                            </li>
                        ))}
                    </ul>
                </section>
            )}
            {met.length > 0 && (
                <section>
                    <h4>打过交道的人</h4>
                    <ul className="people-list">
                        {met.map(([n, p]) => (
                            <li key={n}>
                                <div className="people-head"><strong>{n}</strong><span className="grow" />
                                    <button type="button" className="link small" onClick={() => promote(chat, { name: n })}>设为重要人物</button></div>
                                {p.brief && <div className="muted small">{p.brief}</div>}
                            </li>
                        ))}
                    </ul>
                </section>
            )}
            <section>
                <h4>新建重要人物</h4>
                <p className="muted small">写一段介绍，或者贴进已有的人物档案（原样保留），也可以从角色卡里选一个角色。模型会补上他在澜江市的住处、工作和作息。</p>
                <textarea rows={4} value={text} onChange={e => setText(e.target.value)} placeholder="例如：住在楼下的女大学生，学摄影，常在楼道里遇到" />
                <div className="people-new">
                    <select value={cardId} onChange={e => setCardId(e.target.value)}>
                        <option value="">或者选一张角色卡</option>
                        {cards.filter(x => !isWorldCard(x)).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                    <Button variant="primary" disabled={!text.trim() && !cardId} onClick={() => promote(chat, cardId && !text.trim() ? { characterId: cardId } : { text }, () => { setText(''); setCardId(''); })}>设为重要人物</Button>
                </div>
            </section>
        </div>
    );
}

export function NewWorldButton() {
    const [busy, setBusy] = useState(false);
    return (
        <button type="button" className="new-world" disabled={busy} onClick={() => {
            setBusy(true);
            void newWorld().catch(reportError).finally(() => setBusy(false));
        }}>
            <Icon name="globe" size={15} />
            <span>{busy ? '正在准备…' : '新建世界：澜江市'}</span>
        </button>
    );
}


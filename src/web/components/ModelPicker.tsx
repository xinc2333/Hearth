// Choosing a model: one click shows the endpoint's whole list with a search box on top. The list is
// fetched by itself (and kept with the connection); a name that is not listed can be typed in.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { Icon } from '../icons.tsx';

const STALE_MS = 24 * 3600_000;

export function ModelPicker({ value, onPick, load, cached, cachedAt }: {
    value: string;
    onPick: (model: string) => void;
    /** Asks the endpoint for its models. */
    load: () => Promise<string[]>;
    /** The list kept from last time, shown at once. */
    cached?: string[];
    cachedAt?: number;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [models, setModels] = useState<string[] | null>(cached?.length ? cached : null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [active, setActive] = useState(0);
    const root = useRef<HTMLDivElement>(null);
    const list = useRef<HTMLDivElement>(null);
    const search = useRef<HTMLInputElement>(null);

    const fetchList = async (quiet = false) => {
        if (!quiet) setLoading(true);
        setError('');
        try {
            setModels(await load());
        } catch (e) {
            // A quiet refresh keeps the list it has.
            if (!quiet) setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (!root.current?.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const shown = useMemo(
        () => (models ?? []).filter(m => words.every(w => m.toLowerCase().includes(w))),
        [models, words.join(' ')],
    );
    const typed = query.trim();
    const custom = typed && !(models ?? []).includes(typed) ? typed : '';
    // Typed names that are not listed come last, so Enter after a search picks a real match.
    const options = custom ? [...shown, custom] : shown;

    // Opening starts on the current model; typing starts from the top.
    useEffect(() => {
        if (!open) return;
        setActive(typed ? 0 : Math.max(0, options.indexOf(value)));
    }, [open, typed, models]);
    useEffect(() => {
        list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
    }, [active, open, models]);

    const show = () => {
        setOpen(true);
        setQuery('');
        if (!models) void fetchList();
        else if (!cachedAt || Date.now() - cachedAt > STALE_MS) void fetchList(true);
        requestAnimationFrame(() => search.current?.focus());
    };
    const pick = (model: string) => {
        setOpen(false);
        if (model && model !== value) onPick(model);
    };
    const onKey = (e: KeyboardEvent) => {
        if (e.key === 'ArrowDown') setActive(a => Math.min(a + 1, options.length - 1));
        else if (e.key === 'ArrowUp') setActive(a => Math.max(a - 1, 0));
        else if (e.key === 'Enter') pick(options[active] ?? typed);
        else if (e.key === 'Escape') setOpen(false);
        else return;
        e.preventDefault();
    };

    return (
        <div className={`model-picker${open ? ' open' : ''}`} ref={root} data-own-escape={open ? '' : undefined}>
            <button type="button" className="model-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => (open ? setOpen(false) : show())}>
                <span className={value ? 'model-value' : 'model-value muted'}>{value || '选择模型'}</span>
                <Icon name="chevron" size={15} />
            </button>
            {open && (
                <div className="model-panel">
                    <div className="model-search">
                        <Icon name="search" size={15} />
                        <input ref={search} value={query} placeholder="搜索，或者直接输入模型名" spellCheck={false} autoComplete="off"
                            onChange={e => setQuery(e.target.value)} onKeyDown={onKey} />
                    </div>
                    <div className="model-list" role="listbox" ref={list}>
                        {options.map((m, i) => (
                            <button type="button" key={i === shown.length ? `custom:${m}` : m} role="option" aria-selected={m === value}
                                className={`model-option${m === value ? ' current' : ''}`} data-active={i === active}
                                onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => pick(m)} title={m}>
                                {i === shown.length ? <span>使用「{m}」</span> : <span className="model-name">{m}</span>}
                                {m === value && <Icon name="check" size={15} />}
                            </button>
                        ))}
                        {loading && <div className="model-note">正在获取模型列表…</div>}
                        {!loading && error && <div className="model-note error">没能获取模型列表：{error}<br />可以直接在上面输入模型名。</div>}
                        {!loading && !error && models && !models.length && !custom && <div className="model-note">这个接口没有列出模型，可以直接在上面输入模型名。</div>}
                        {!loading && !error && Boolean(models?.length) && !options.length && <div className="model-note">没有匹配的模型</div>}
                    </div>
                    <div className="model-foot">
                        <span>{models ? `共 ${models.length} 个模型` : ''}</span>
                        <button type="button" disabled={loading} onMouseDown={e => e.preventDefault()} onClick={() => void fetchList()}>
                            <Icon name="refresh" size={13} />刷新列表
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

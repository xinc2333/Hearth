import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { estimateTokens } from '../../core/tokens.ts';
import { Icon } from '../icons.tsx';

export function Avatar({ src, name, size = 32 }: { src?: string; name: string; size?: number }) {
    const initial = Array.from(name.trim())[0] ?? '?';
    return src
        ? <img className="avatar" src={`/api/avatars/${src}`} alt="" width={size} height={size} style={{ width: size, height: size }} />
        : <span className="avatar avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.42 }}>{initial}</span>;
}

export function IconButton({ icon, label, onClick, active, disabled, size = 16, tone }: {
    icon: string; label: string; onClick?: (e: React.MouseEvent) => void; active?: boolean; disabled?: boolean; size?: number; tone?: 'danger';
}) {
    return (
        <button type="button" className={`icon-btn${active ? ' active' : ''}${tone ? ` ${tone}` : ''}`} title={label} aria-label={label} onClick={onClick} disabled={disabled}>
            <Icon name={icon} size={size} />
        </button>
    );
}

export function Button({ children, onClick, variant = 'default', disabled, icon, type = 'button', autoFocus }: {
    children: ReactNode; onClick?: () => void; variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'danger-solid'; disabled?: boolean; icon?: string;
    type?: 'button' | 'submit'; autoFocus?: boolean;
}) {
    return (
        <button type={type} className={`btn btn-${variant}`} onClick={onClick} disabled={disabled} autoFocus={autoFocus}>
            {icon && <Icon name={icon} size={15} />}
            {children}
        </button>
    );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
    return (
        <label className="field">
            <span className="field-label">{label}{hint && <span className="field-hint">{hint}</span>}</span>
            {children}
        </label>
    );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
    return (
        <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`toggle${checked ? ' on' : ''}`} onClick={() => onChange(!checked)}>
            <span />
        </button>
    );
}

export function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number; maxHeight?: number }) {
    const { minRows = 3, maxHeight = 520, ...rest } = props;
    const ref = useRef<HTMLTextAreaElement>(null);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight + 2, maxHeight)}px`;
    }, [props.value, maxHeight]);
    return <textarea ref={ref} rows={minRows} {...rest} />;
}

// Only the topmost dialog reacts to Escape.
const modalStack: object[] = [];

export function Modal({ title, onClose, children, size = 'default', actions }: {
    title: string; onClose: () => void; children: ReactNode; size?: 'default' | 'wide' | 'editor' | 'small'; actions?: ReactNode;
}) {
    const close = useRef(onClose);
    close.current = onClose;
    useEffect(() => {
        const token = {};
        modalStack.push(token);
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || modalStack[modalStack.length - 1] !== token) return;
            // A dropdown inside the dialog closes itself first.
            if ((e.target as Element | null)?.closest?.('[data-own-escape]')) return;
            e.stopPropagation();
            close.current();
        };
        window.addEventListener('keydown', onKey, true);
        return () => {
            modalStack.splice(modalStack.indexOf(token), 1);
            window.removeEventListener('keydown', onKey, true);
        };
    }, []);
    return createPortal(
        <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
            <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-label={title}>
                <header className="modal-head">
                    <h2>{title}</h2>
                    {actions}
                    <IconButton icon="x" label="关闭（Esc）" onClick={onClose} />
                </header>
                <div className="modal-body">{children}</div>
            </div>
        </div>,
        document.body,
    );
}

export const isModalOpen = () => modalStack.length > 0;

/** A text field for long content: grows with the text and can open in a full-size editor. */
export function LongText({ value, onChange, label, minRows = 3, placeholder }: {
    value: string; onChange: (value: string) => void; label: string; minRows?: number; placeholder?: string;
}) {
    const [big, setBig] = useState(false);
    return (
        <div className="longtext">
            <AutoTextarea minRows={minRows} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
            <button type="button" className="longtext-expand" title="放大编辑" aria-label={`放大编辑${label}`} onClick={e => { e.preventDefault(); setBig(true); }}>
                <Icon name="expand" size={13} />
            </button>
            {big && (
                <Modal title={label} size="editor" onClose={() => setBig(false)}
                    actions={<><span className="muted small editor-count">{value.length.toLocaleString()} 字 · 约 {estimateTokens(value).toLocaleString()} tokens</span><Button variant="primary" onClick={() => setBig(false)}>完成</Button></>}>
                    <textarea className="editor-area" value={value} placeholder={placeholder ?? '在这里输入…'} autoFocus spellCheck={false} onChange={e => onChange(e.target.value)} />
                </Modal>
            )}
        </div>
    );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label?: string }) {
    return (
        <div className="segmented" role="radiogroup" aria-label={label}>
            {options.map(([v, text]) => (
                <button key={v} type="button" role="radio" aria-checked={v === value} className={v === value ? 'active' : ''} onClick={() => onChange(v)}>{text}</button>
            ))}
        </div>
    );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
    return (
        <div className="empty">
            <p className="empty-title">{title}</p>
            {children && <div className="empty-body">{children}</div>}
        </div>
    );
}

export function clockTime(ts: number): string {
    const d = new Date(ts);
    const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    return d.toDateString() === new Date().toDateString() ? time : `${d.getMonth() + 1}月${d.getDate()}日 ${time}`;
}

export function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60_000) return '刚刚';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
    if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
    return new Date(ts).toLocaleDateString('zh-CN');
}

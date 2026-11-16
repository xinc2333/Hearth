import { useEffect, useRef, type ReactNode } from 'react';

import { Icon } from '../icons.tsx';

export function Avatar({ src, name, size = 32 }: { src?: string; name: string; size?: number }) {
    const initial = Array.from(name.trim())[0] ?? '?';
    return src
        ? <img className="avatar" src={`/api/avatars/${src}`} alt="" width={size} height={size} style={{ width: size, height: size }} />
        : <span className="avatar avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.42 }}>{initial}</span>;
}

export function IconButton({ icon, label, onClick, active, disabled, size = 16, tone }: {
    icon: string; label: string; onClick?: () => void; active?: boolean; disabled?: boolean; size?: number; tone?: 'danger';
}) {
    return (
        <button type="button" className={`icon-btn${active ? ' active' : ''}${tone ? ` ${tone}` : ''}`} title={label} aria-label={label} onClick={onClick} disabled={disabled}>
            <Icon name={icon} size={size} />
        </button>
    );
}

export function Button({ children, onClick, variant = 'default', disabled, icon, type = 'button' }: {
    children: ReactNode; onClick?: () => void; variant?: 'default' | 'primary' | 'ghost' | 'danger'; disabled?: boolean; icon?: string; type?: 'button' | 'submit';
}) {
    return (
        <button type={type} className={`btn btn-${variant}`} onClick={onClick} disabled={disabled}>
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
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight + 2, maxHeight)}px`;
    }, [props.value, maxHeight]);
    return <textarea ref={ref} rows={minRows} {...rest} />;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    return (
        <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
            <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-label={title}>
                <header className="modal-head">
                    <h2>{title}</h2>
                    <IconButton icon="x" label="关闭" onClick={onClose} />
                </header>
                <div className="modal-body">{children}</div>
            </div>
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

export function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 60_000) return '刚刚';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
    if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
    return new Date(ts).toLocaleDateString('zh-CN');
}

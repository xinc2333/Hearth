import { useMemo, useState } from 'react';

import type { CardEditResult, CardEdits, Chat, ChatMessage } from '../../core/types.ts';
import { api } from '../api.ts';
import { Icon } from '../icons.tsx';
import { changeChat, refresh, reportError, toast } from '../state.ts';
import { Button, Modal } from './common.tsx';

/** Line diff (longest common subsequence); fine for card texts of a few hundred lines. */
function diffLines(before: string, after: string): { type: 'same' | 'del' | 'add'; text: string }[] {
    const a = before.split('\n');
    const b = after.split('\n');
    // Trim the common head and tail first; the table is only needed for the changed middle.
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    let end = 0;
    while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
    const x = a.slice(start, a.length - end);
    const y = b.slice(start, b.length - end);
    const table = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
    for (let i = x.length - 1; i >= 0; i--) {
        for (let j = y.length - 1; j >= 0; j--) table[i][j] = x[i] === y[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
    const middle: { type: 'same' | 'del' | 'add'; text: string }[] = [];
    let i = 0;
    let j = 0;
    while (i < x.length || j < y.length) {
        if (i < x.length && j < y.length && x[i] === y[j]) { middle.push({ type: 'same', text: x[i] }); i++; j++; }
        // Removed lines come before the lines that replace them.
        else if (i < x.length && (j >= y.length || table[i + 1][j] >= table[i][j + 1])) { middle.push({ type: 'del', text: x[i] }); i++; }
        else { middle.push({ type: 'add', text: y[j] }); j++; }
    }
    return [...a.slice(0, start).map(text => ({ type: 'same' as const, text })), ...middle, ...a.slice(a.length - end).map(text => ({ type: 'same' as const, text }))];
}

function DiffView({ result, onClose }: { result: CardEditResult; onClose: () => void }) {
    const lines = useMemo(() => diffLines(result.before ?? '', result.after ?? ''), [result]);
    // Long unchanged stretches fold to a few lines of context.
    const shown = lines.filter((l, i) => l.type !== 'same' || lines.slice(Math.max(0, i - 3), i + 4).some(n => n.type !== 'same'));
    const hidden = lines.length - shown.length;
    return (
        <Modal title={`${result.action} · ${result.label}`} size="wide" onClose={onClose}>
            {hidden > 0 && <p className="muted small">只显示改动附近的内容，另有 {hidden} 行没有变化。</p>}
            <pre className="diff">
                {shown.map((l, i) => {
                    const gap = i > 0 && lines.indexOf(l) - lines.indexOf(shown[i - 1]) > 1;
                    return (
                        <span key={i}>
                            {gap && <span className="diff-gap">⋯</span>}
                            <span className={`diff-line ${l.type}`}>{l.type === 'add' ? '+ ' : l.type === 'del' ? '- ' : '  '}{l.text || ' '}</span>
                        </span>
                    );
                })}
            </pre>
        </Modal>
    );
}

/** What a 编辑 reply changed: one row per change, a diff for each and one undo for all. */
export function EditResults({ chat, message, edits }: { chat: Chat; message: ChatMessage; edits: CardEdits }) {
    const [open, setOpen] = useState<CardEditResult | null>(null);
    const [busy, setBusy] = useState(false);
    const swipe = message.swipes[message.activeSwipe];
    const applied = edits.results.filter(r => r.ok).length;
    const undo = async () => {
        setBusy(true);
        try {
            for (const id of [...edits.changes].reverse()) await api.revert(id);
            await changeChat(chat.id, [{ op: 'set', path: ['messages', `@${message.id}`, 'swipes', `@${swipe.id}`, 'edits', 'reverted'], value: true }], '撤销 AI 编辑');
            await refresh();
            toast('已撤销这次的修改', 'success');
        } catch (error) {
            reportError(error);
        } finally {
            setBusy(false);
        }
    };
    if (edits.note && !edits.results.length) return <div className="edit-card"><div className="edit-card-head">修改没有执行</div><div className="muted small">{edits.note}</div></div>;
    return (
        <div className={`edit-card${edits.reverted ? ' reverted' : ''}`}>
            <div className="edit-card-head">
                <span>{edits.reverted ? `已撤销 ${applied} 处修改` : `已保存 ${applied} 处修改`}{applied < edits.results.length ? `，${edits.results.length - applied} 处没有执行` : ''}</span>
                <span className="grow" />
                {applied > 0 && !edits.reverted && <Button variant="ghost" disabled={busy} onClick={() => void undo()}>{busy ? '撤销中…' : '撤销'}</Button>}
            </div>
            <ul className="edit-list">
                {edits.results.map((r, i) => (
                    <li key={i} className={r.ok ? 'ok' : 'failed'}>
                        <span className="edit-mark" aria-hidden="true"><Icon name={r.ok ? (r.action === '新增' ? 'plus' : r.action === '删除' ? 'minus' : 'edit') : 'alert'} size={13} /></span>
                        <span className="edit-label">{r.action} {r.label}{!r.ok && <span className="edit-reason">：{r.reason}</span>}</span>
                        {r.ok && (r.before !== undefined || r.after !== undefined) && <button className="link small" onClick={() => setOpen(r)}>查看改动</button>}
                    </li>
                ))}
            </ul>
            {open && <DiffView result={open} onClose={() => setOpen(null)} />}
        </div>
    );
}

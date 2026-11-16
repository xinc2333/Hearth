import type { ReadingSettings } from '../../core/types.ts';
import { DEFAULT_READING, setReading, useReading } from '../state.ts';
import { Segmented, Toggle } from './common.tsx';

// Latin first, then the Chinese faces Windows ships (or common installed ones), ending in a generic.
const FONT_STACKS: Record<Exclude<ReadingSettings['font'], 'custom'>, string> = {
    sans: 'var(--font)',
    serif: 'Cambria, "Source Han Serif SC", "Noto Serif CJK SC", "Noto Serif SC", "Songti SC", STSong, SimSun, serif',
    kai: 'Cambria, "LXGW WenKai", "LXGW WenKai GB", KaiTi, "Kaiti SC", STKaiti, serif',
};

/** Publishes the reading preferences as CSS variables; message text and its editor read them. */
export function applyReading(r: ReadingSettings) {
    const root = document.documentElement;
    const custom = r.customFont.trim().replace(/[;{}<>]/g, '');
    root.style.setProperty('--read-font', r.font === 'custom' ? (custom ? `${custom}, var(--font)` : 'var(--font)') : FONT_STACKS[r.font]);
    root.style.setProperty('--read-size', `${r.size}px`);
    root.style.setProperty('--read-lh', String(r.lineHeight));
    root.style.setProperty('--read-width', `${r.width}px`);
    root.classList.toggle('read-indent', r.indent);
    root.classList.toggle('read-justify', r.justify);
    root.classList.toggle('read-quotes', r.quotes);
}

function Slider({ label, value, min, max, step, format, onChange }: {
    label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void;
}) {
    return (
        <label className="slider">
            <span className="slider-label">{label}</span>
            <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}
                style={{ '--fill': `${(value - min) / (max - min) * 100}%` } as React.CSSProperties} />
            <span className="slider-value">{format(value)}</span>
        </label>
    );
}

const FONT_OPTIONS = [['sans', '黑体'], ['serif', '宋体'], ['kai', '楷体'], ['custom', '自定义']] as const;

/** Typeface, size and layout of message text. Changes apply immediately. */
export function ReadingControls() {
    const r = useReading();
    const changed = (Object.keys(DEFAULT_READING) as (keyof ReadingSettings)[]).some(k => k !== 'customFont' && r[k] !== DEFAULT_READING[k]);
    return (
        <div className="reading-controls">
            <div className="reading-row">
                <span className="slider-label">字体</span>
                <Segmented label="字体" value={r.font} options={FONT_OPTIONS} onChange={font => setReading({ font })} />
            </div>
            {r.font === 'custom' && (
                <input className="reading-font-input" value={r.customFont} placeholder="电脑上已安装的字体名，例如：霞鹜文楷" spellCheck={false}
                    onChange={e => setReading({ customFont: e.target.value })} />
            )}
            <Slider label="字号" value={r.size} min={14} max={24} step={0.5} format={v => `${v}`} onChange={size => setReading({ size })} />
            <Slider label="行距" value={r.lineHeight} min={1.5} max={2.4} step={0.05} format={v => v.toFixed(2)} onChange={lineHeight => setReading({ lineHeight })} />
            <Slider label="栏宽" value={r.width} min={560} max={1100} step={20} format={v => `${Math.round(v / r.size)} 字`} onChange={width => setReading({ width })} />
            <div className="reading-toggles">
                <label className="check-row"><Toggle checked={r.indent} onChange={indent => setReading({ indent })} /><span>段首缩进两字</span></label>
                <label className="check-row"><Toggle checked={r.justify} onChange={justify => setReading({ justify })} /><span>两端对齐</span></label>
                <label className="check-row"><Toggle checked={r.quotes} onChange={quotes => setReading({ quotes })} /><span>对话用颜色标出</span></label>
                <label className="check-row"><Toggle checked={r.follow} onChange={follow => setReading({ follow })} /><span>生成时自动滚到最新文字</span></label>
            </div>
            <p className="muted small reading-note">{r.follow ? '回复生成时，画面会一直跟着最新的文字走。' : '回复生成时，画面停在回复开头，方便从头读起。'}</p>
            {changed && <button type="button" className="link small" onClick={() => setReading({ ...DEFAULT_READING, customFont: r.customFont })}>恢复默认</button>}
        </div>
    );
}

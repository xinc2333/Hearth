// The 小猫之神 console (Cat Oracle) of Meowssiah-style presets. In SillyTavern it is a 酒馆助手 script
// that draws its menu into the page; the preset's Stage 1 reads its state from
// chatMetadata.catgod_oracle.oracleState. Hearth draws the same switches in the composer and keeps that state in
// the same shape, so the preset's own script decides what each switch does.
//
// State (documented by the console script):
//   { schema: 1, mode: 'theater' | 'chat', chat: { autoReturn }, deepThink, note: { text, autoClear }, rev, updatedAt }

import type { Op } from '../../core/ops.ts';
import type { Chat, Preset } from '../../core/types.ts';
import type { PluginApi } from '../../server/plugins.ts';
import { stage1Script } from './stage1.ts';

export interface OracleState {
    schema: 1;
    mode: 'theater' | 'chat';
    chat: { autoReturn: boolean };
    deepThink: boolean;
    rebuildCache: boolean;
    note: { text: string; autoClear: boolean };
    rev: number;
    updatedAt: number;
}

/** The console appears only for presets that ask for it and can act on it. */
export function consoleEnabled(preset: Preset): boolean {
    return preset.prompts.some(p => p.content.includes('<<<|catgodml|enableMenu>>>')) && Boolean(stage1Script(preset));
}

export function oracleState(chat: Chat, pluginId: string): OracleState {
    const meta = chat.plugins?.[pluginId]?.chatMetadata as { catgod_oracle?: { oracleState?: Partial<OracleState> } } | undefined;
    const raw = meta?.catgod_oracle?.oracleState ?? {};
    return {
        schema: 1,
        mode: raw.mode === 'chat' ? 'chat' : 'theater',
        chat: { autoReturn: raw.chat?.autoReturn !== false },
        deepThink: raw.deepThink === true,
        rebuildCache: raw.rebuildCache === true,
        note: { text: typeof raw.note?.text === 'string' ? raw.note.text : '', autoClear: raw.note?.autoClear !== false },
        rev: Number.isFinite(raw.rev) ? Number(raw.rev) : 0,
        updatedAt: Number.isFinite(raw.updatedAt) ? Number(raw.updatedAt) : 0,
    };
}

function save(pluginId: string, state: OracleState, patch: Partial<OracleState>): Op[] {
    const next = { ...state, ...patch, rev: state.rev + 1, updatedAt: Date.now() };
    // Only the state itself: the preset keeps its own data (such as its cache ledger) next to it.
    return [{ op: 'set', path: ['plugins', pluginId, 'chatMetadata', 'catgod_oracle', 'oracleState'], value: next }];
}

export function setupConsole(api: PluginApi) {
    // What each chat's last request carried, so a note typed during generation is not cleared.
    const sent = new Map<string, { mode: OracleState['mode']; note: string }>();

    api.registerControls({
        list: ({ chat, preset }) => {
            if (!consoleEnabled(preset)) return [];
            const s = oracleState(chat, api.id);
            return [
                { id: 'mode', type: 'mode', label: '回复模式', value: s.mode, options: [['theater', '剧场'], ['chat', '聊天']], hint: '聊天：暂停剧情，和小猫之神本体直接聊天' },
                { id: 'deepThink', type: 'toggle', label: '深度思考', value: s.deepThink, hint: '按预设登记的思考步骤，回复前先深入推演' },
                { id: 'note', type: 'note', label: '纸条', value: s.note.text, hint: s.note.autoClear ? '随下一条回复送达，送达后自动清空' : '每次回复都会带上' },
            ];
        },
        change: (id, value, { chat }) => {
            const s = oracleState(chat, api.id);
            if (id === 'mode') return save(api.id, s, { mode: value === 'chat' ? 'chat' : 'theater' });
            if (id === 'deepThink') return save(api.id, s, { deepThink: value === true });
            if (id === 'note') return save(api.id, s, { note: { ...s.note, text: String(value ?? '').trim() } });
            return [];
        },
    });

    api.onRequest((_body, { chat, preset }) => {
        if (!consoleEnabled(preset)) return;
        const s = oracleState(chat, api.id);
        sent.set(chat.id, { mode: s.mode, note: s.note.text });
    });

    // After a successful reply, like the console: a delivered note is cleared, and a 聊天 reply
    // returns to 剧场 when "auto return" is on.
    api.onAfterReceive(({ chat, preset, text, finish }) => {
        const was = sent.get(chat.id);
        sent.delete(chat.id);
        if (!was || !consoleEnabled(preset) || !text.trim() || (finish !== 'stop' && finish !== 'length')) return;
        const s = oracleState(chat, api.id);
        const patch: Partial<OracleState> = {};
        if (was.note && s.note.autoClear && s.note.text === was.note) patch.note = { ...s.note, text: '' };
        if (was.mode === 'chat' && s.mode === 'chat' && s.chat.autoReturn) patch.mode = 'theater';
        return Object.keys(patch).length ? { ops: save(api.id, s, patch) } : undefined;
    });
}

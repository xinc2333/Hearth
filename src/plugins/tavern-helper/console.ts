// The console of SPreset presets with a control menu. In SillyTavern it is a 酒馆助手 script that draws
// a menu (reply mode, deep thinking, notes) into the page, and the preset's request script reads its
// state from chatMetadata.catgod_oracle.oracleState. In Hearth these are Hearth's own composer
// switches: this plugin declares that such a preset supports them, and before the preset's script
// runs it writes Hearth's switches into that state, so the script decides what each switch does.
//
// State (documented by the console script):
//   { schema: 1, mode: 'theater' | 'chat', chat: { autoReturn }, deepThink, note: { text, autoClear }, rev, updatedAt }

import { replyOptions } from '../../core/reply.ts';
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

type Meta = { catgod_oracle?: { oracleState?: Partial<OracleState> } & Record<string, unknown> } & Record<string, unknown>;

/** The chat metadata the preset's script gets: its own data, with the console state taken from Hearth's switches. */
export function withOracleState(meta: Record<string, unknown>, chat: Pick<Chat, 'reply'>): Record<string, unknown> {
    const m = structuredClone(meta) as Meta;
    const old = m.catgod_oracle?.oracleState ?? {};
    const r = replyOptions(chat);
    const same = old.mode === r.mode && old.deepThink === r.deepThink && (old.note?.text ?? '') === r.note;
    const state: OracleState = {
        schema: 1,
        mode: r.mode,
        // Hearth returns to 剧场 after a 聊天 reply itself.
        chat: { autoReturn: true },
        deepThink: r.deepThink,
        // Only the console's own button sets it, and the console clears it after one reply.
        rebuildCache: false,
        note: { text: r.note, autoClear: true },
        rev: (Number.isFinite(old.rev) ? Number(old.rev) : 0) + (same ? 0 : 1),
        // Newer than anything the script may have kept in localStorage.
        updatedAt: same && Number.isFinite(old.updatedAt) ? Number(old.updatedAt) : Date.now(),
    };
    m.catgod_oracle = { ...(m.catgod_oracle ?? {}), oracleState: state };
    return m;
}

export function setupConsole(api: PluginApi) {
    api.registerFeatures(preset => (consoleEnabled(preset) ? { chat: true, deepThink: true, note: true } : {}));
}

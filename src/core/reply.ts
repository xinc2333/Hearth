// How the next story reply is asked for: 剧场 or 聊天, deep thinking, and the note. These are Hearth's
// own switches, shown in the composer for every preset that supports them. A preset declares its
// support with markers in its entries (the markers are removed before sending):
//
//   <<<|hearth|when:chat>>>        the entry is sent only in 聊天
//   <<<|hearth|when:theater>>>     only in 剧场
//   <<<|hearth|when:deepthink>>>   only while deep thinking is on
//   <<<|hearth|when:note>>>        only while the note has text
//   <<<|hearth|when:chat,deepthink>>>  all of them at once
//   {{hearth_note}}                the note's text (also {{hearth_mode}}: theater / chat, {{hearth_deepthink}}: true / false)
//
// Presets that bring their own request script (such as SPreset ones) handle these switches in that
// script; the plugin that runs it declares the support instead.

import type { Chat, Preset, ReplyMode, ReplyOptions } from './types.ts';

export interface ReplyFeatures {
    /** The preset can answer in 聊天 mode. */
    chat: boolean;
    deepThink: boolean;
    note: boolean;
}

export const NO_FEATURES: ReplyFeatures = { chat: false, deepThink: false, note: false };

export function replyOptions(chat: Pick<Chat, 'reply'> | undefined): ReplyOptions {
    const r = chat?.reply ?? {};
    return {
        mode: r.mode === 'chat' ? 'chat' : 'theater',
        deepThink: r.deepThink === true,
        note: typeof r.note === 'string' ? r.note : '',
    };
}

const WHEN = /<<<\|\s*hearth\s*\|\s*when\s*:\s*([^>]*?)\s*>>>[ \t]*(?:\r?\n)?/gi;
const NOTE_MACRO = /{{\s*hearth_note\s*}}/i;

/** The conditions an entry carries, e.g. ['chat', 'deepthink']. */
export function entryConditions(content: string): string[] {
    const out: string[] = [];
    for (const m of content.matchAll(WHEN)) {
        for (const c of m[1].split(/[,，\s]+/)) if (c) out.push(c.toLowerCase());
    }
    return out;
}

function holds(condition: string, reply: ReplyOptions): boolean {
    const negated = condition.startsWith('!');
    const name = negated ? condition.slice(1) : condition;
    const value = name === 'chat' ? reply.mode === 'chat'
        : name === 'theater' ? reply.mode === 'theater'
            : name === 'deepthink' ? reply.deepThink
                : name === 'note' ? Boolean(reply.note.trim())
                    : true;
    return negated ? !value : value;
}

/** Whether an entry goes out with these options. Entries without conditions always do. */
export function entryAllowed(content: string, reply: ReplyOptions): boolean {
    if (!content.includes('<<<')) return true;
    return entryConditions(content).every(c => holds(c, reply));
}

export function stripConditions(content: string): string {
    return content.includes('<<<') ? content.replace(WHEN, '') : content;
}

/** What the preset's own entries declare (enabled entries only). */
export function presetFeatures(preset: Preset): ReplyFeatures {
    const enabled = new Set(preset.order.filter(o => o.enabled).map(o => o.id));
    const out = { ...NO_FEATURES };
    for (const p of preset.prompts) {
        if (!enabled.has(p.id)) continue;
        const conditions = entryConditions(p.content).map(c => c.replace(/^!/, ''));
        if (conditions.includes('chat')) out.chat = true;
        if (conditions.includes('deepthink')) out.deepThink = true;
        if (conditions.includes('note') || NOTE_MACRO.test(p.content)) out.note = true;
    }
    return out;
}

export function mergeFeatures(...list: Partial<ReplyFeatures>[]): ReplyFeatures {
    const out = { ...NO_FEATURES };
    for (const f of list) {
        if (f.chat) out.chat = true;
        if (f.deepThink) out.deepThink = true;
        if (f.note) out.note = true;
    }
    return out;
}

export const MODE_LABEL: Record<ReplyMode, string> = { theater: '剧场', chat: '聊天' };

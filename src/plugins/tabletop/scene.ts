// Who is on scene. Only their full data goes to the model; everyone else stays in the sheet and is
// listed by name with their attitude in words, so the 跑团 data grows with the scene, not with every
// character the story has met. See docs/tabletop.md §8.

import type { Chat, ChatMessage } from '../../core/types.ts';
import { PROTAGONIST } from './rules.ts';
import { resolveName, swipeData, type Ruling, type TabletopState } from './sheet.ts';

/** Replies whose recorded cast still counts as on scene. */
export const RECENT_SCENES = 3;
/** Shorter names and aliases are not looked for in text: a single character matches too much. */
const MIN_NAME_LENGTH = 2;

const isStory = (m: ChatMessage) => m.mode !== 'edit' && !m.hidden;
const textOf = (m: ChatMessage | undefined) => m?.swipes[m.activeSwipe]?.content ?? '';

/** Sheet characters whose name or alias appears in the text. */
export function mentioned(state: Pick<TabletopState, 'characters'>, text: string): string[] {
    if (!text) return [];
    return Object.entries(state.characters)
        .filter(([name, c]) => [name, ...c.aliases].some(n => n.length >= MIN_NAME_LENGTH && text.includes(n)))
        .map(([name]) => name);
}

export interface SceneInput {
    chat: Pick<Chat, 'messages'>;
    /** The reply being written or settled; only what comes before it counts. */
    index: number;
    state: TabletopState;
    /** The card's own character, usually the one the story is about. */
    characterName?: string;
    userName: string;
    /** This turn's text: the user's message, and for the settlement the reply just written. */
    texts: string[];
    ruling?: Ruling;
}

/**
 * The sheet characters on scene: the protagonist and the card's own character, who was on scene in
 * the last few settled replies, who this turn's text or the previous reply names, and who this
 * turn's checks involve.
 */
export function sceneOf(input: SceneInput): Set<string> {
    const { state, userName } = input;
    const scene = new Set<string>();
    const add = (name: string | undefined) => {
        const key = name ? resolveName(state, name, userName) : null;
        if (key) scene.add(key);
    };
    add(PROTAGONIST);
    add(input.characterName);
    const before = input.chat.messages.slice(0, Math.max(0, input.index)).filter(isStory);
    const replies = before.filter(m => m.role === 'assistant');
    for (const m of replies.slice(-RECENT_SCENES)) {
        for (const name of swipeData(m)?.settle?.present ?? []) add(name);
    }
    for (const text of [textOf(replies.at(-1)), ...input.texts]) {
        for (const name of mentioned(state, text)) scene.add(name);
    }
    for (const c of input.ruling?.checks ?? []) {
        add(c.actor);
        if ('opponent' in c.against) add(c.against.opponent);
    }
    for (const name of Object.keys(input.ruling?.added ?? {})) add(name);
    return scene;
}

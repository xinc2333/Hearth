// MagVarUpdate (MVU) compatibility: variables are initialized from [initvar] lorebook entries when a
// chat starts, updated from each reply's <UpdateVariable> block, and stored on the reply's swipe.
// Status-bar cards then read them in the browser through the TavernHelper shim.

import YAML from 'yaml';

import { replyOptions } from '../../core/reply.ts';
import { deepMerge, stateAt, toYaml } from '../../core/state.ts';
import type { Character, Lorebook } from '../../core/types.ts';
import type { PluginApi } from '../../server/plugins.ts';
import { applyMvuCommands, parseMvuCommands } from './mvu-commands.ts';

const PLACEHOLDER = '<StatusPlaceHolderImpl/>';

function books(api: PluginApi, character: Character): Lorebook[] {
    return character.lorebookIds.map(id => api.store.get<Lorebook>('lorebook', id)).filter((b): b is Lorebook => Boolean(b));
}

/** Initial variables: every [initvar] entry (enabled or not), parsed as YAML/JSON and merged. */
export function initialVariables(list: Lorebook[]): Record<string, unknown> | null {
    let found = false;
    const result: Record<string, unknown> = {};
    for (const book of list) {
        for (const entry of book.entries) {
            if (!/\[initvar\]/i.test(entry.title)) continue;
            try {
                const parsed = YAML.parse(entry.content.replace(/^\s*---\s*\n/, ''));
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    deepMerge(result, parsed as Record<string, unknown>);
                    found = true;
                }
            } catch (error) {
                console.warn(`[mvu] 无法解析初始化条目「${entry.title}」:`, (error as Error).message);
            }
        }
    }
    return found ? result : null;
}

export function isMvuCard(character: Character, list: Lorebook[]): boolean {
    return character.scripts.some(s => /MagVarUpdate|registerMvuSchema|mvu/i.test(s.content))
        || list.some(b => b.entries.some(e => /\[initvar\]|\[mvu_update\]/i.test(e.title)));
}

/**
 * When the model forgets the <UpdateVariable> block, ask for it in a short follow-up request using the
 * card's own [mvu_update] format and rules (like MVU's "extra model parsing").
 */
async function requestUpdate(api: PluginApi, list: Lorebook[], stat: Record<string, unknown>, reply: string, userName: string, charName: string, lastUser: string): Promise<string | null> {
    const rules = list.flatMap(b => b.entries).filter(e => /\[mvu_update\]/i.test(e.title)).map(e => e.content.trim());
    if (!rules.length) return null;
    const ctx = api.macros.context({ user: userName, char: charName });
    const system = [
        '你负责维护一个角色扮演游戏的变量。根据【最新回复】里发生的剧情，按照下面的规则判断哪些变量需要变化，',
        '并且只输出一个 <UpdateVariable> 块（严格遵守输出格式），不要输出任何其他内容。没有变量需要变化时，输出空的 JSONPatch 数组 []。',
        '',
        api.macros.evaluate(rules.join('\n\n'), ctx),
    ].join('\n');
    const user = `【当前变量】\n${toYaml(stat)}\n\n【上一条用户消息】\n${lastUser}\n\n【最新回复】\n${reply.replace(PLACEHOLDER, '').trim()}`;
    const out = await api.complete({ messages: [{ role: 'system', content: system }, { role: 'user', content: user }], maxTokens: 1500, temperature: 0.2 });
    const block = out.match(/<UpdateVariable>[\s\S]*?<\/UpdateVariable>/i)?.[0];
    return block ?? null;
}

function usesPlaceholder(character: Character): boolean {
    return character.regex.some(r => r.find.includes('StatusPlaceHolderImpl'));
}

/** Native MagVarUpdate: what a card's MVU script does in SillyTavern. */
export function setupMvu(api: PluginApi) {
    {
        api.onChatCreate(({ chat, character }) => {
            const list = books(api, character);
            if (!isMvuCard(character, list)) return;
            const init = initialVariables(list) ?? {};
            for (const message of chat.messages) {
                for (const swipe of message.swipes) {
                    const result = applyMvuCommands(init, parseMvuCommands(swipe.content));
                    swipe.state = { stat_data: result.stat_data };
                }
            }
        });

        api.onAfterReceive(async ({ chat, character, message, swipe, text, finish }) => {
            const list = books(api, character);
            if (!isMvuCard(character, list)) return;
            const index = chat.messages.findIndex(m => m.id === message.id);
            const previous = stateAt(chat.messages, index - 1)?.stat_data as Record<string, unknown> | undefined;
            const base = previous ?? initialVariables(list) ?? {};
            let body = text.replace(PLACEHOLDER, '').trimEnd();
            let commands = parseMvuCommands(body);
            let source = 'reply';
            // 聊天 talks with the AI outside the story: nothing to ask for when it writes no update.
            if (!commands.length && body && (finish === 'stop' || finish === 'length') && replyOptions(chat).mode !== 'chat') {
                try {
                    const lastUser = [...chat.messages.slice(0, index)].reverse().find(m => m.role === 'user');
                    const block = await requestUpdate(api, list, base, body, lastUser?.name ?? 'User', character.name, lastUser?.swipes[lastUser.activeSwipe]?.content ?? '');
                    if (block) {
                        body = `${body}\n\n${block}`;
                        commands = parseMvuCommands(block);
                        source = 'fallback';
                    }
                } catch (error) {
                    api.log('补全变量更新失败：', (error as Error).message);
                }
            }
            const result = applyMvuCommands(base, commands);
            if (result.errors.length) {
                api.log('部分变量更新未生效：', result.errors.join('；'));
            }
            const out = usesPlaceholder(character) || text.includes(PLACEHOLDER) ? `${body}\n\n${PLACEHOLDER}` : body;
            return {
                text: out,
                ops: [{
                    op: 'set',
                    path: ['messages', `@${message.id}`, 'swipes', `@${swipe.id}`, 'state'],
                    value: { stat_data: result.stat_data, delta_data: result.delta_data, source },
                }],
            };
        });
    }
}

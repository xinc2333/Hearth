// A card interface's hook on the final prompt (酒馆助手 CHAT_COMPLETION_PROMPT_READY): before the
// request is sent, the messages go to the chat's card page, its handlers may change them, and the
// changed messages are sent. Runs before the SPreset request script, as the event comes before
// 酒馆's request settings. The window offers this only when the card page has such a handler, so
// other chats do not wait for it. What changed shows in the prompt trace as the request sent.

import type { PluginApi } from '../../server/plugins.ts';

export function setupCardHooks(api: PluginApi) {
    api.onRequest(async (body, ctx) => {
        if (!ctx.askWindow || !Array.isArray(body.messages)) return;
        const answer = await ctx.askWindow('chat_completion_prompt_ready', { messages: body.messages }) as { messages?: unknown } | null;
        const messages = answer?.messages;
        if (!Array.isArray(messages) || !messages.every(m => m && typeof m === 'object' && typeof (m as { role?: unknown }).role === 'string')) return;
        return { ...body, messages };
    });
}

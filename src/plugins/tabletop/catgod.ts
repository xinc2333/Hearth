// 小猫之神 (Meowssiah / SPreset) adapter. The preset's own request script runs once per turn and
// builds the whole request as a tool conversation that ends with a `context` sync. Both 跑团 steps
// keep that request as it is (jailbreak included) and only append one more `context` turn:
//   - ruling: the turn carries the ruling instructions and the 跑团 data, and the forced tool
//     becomes hearth_check instead of the reply tool;
//   - narration: the turn carries this turn's results, the data and the narration instructions;
//     the reply tool stays forced, so the model writes the reply as usual.

import { CHECK_TOOL_NAME, checkTool } from './ruling.ts';

const SIG = 'skip_thought_signature_validator';
const REPLY_TOOL = 'soliumbra_reply';

type Message = Record<string, unknown>;

const messagesOf = (body: Record<string, unknown>) => (Array.isArray(body.messages) ? body.messages as Message[] : []);

/** The preset's final sync payload (the last `context` tool result), if this is its request. */
function syncPayload(body: Record<string, unknown>): Record<string, unknown> | null {
    const sync = messagesOf(body).findLast(m => m.role === 'tool' && m.tool_call_id === 'call_sync_final');
    if (!sync || typeof sync.content !== 'string') return null;
    try {
        return JSON.parse(sync.content) as Record<string, unknown>;
    } catch {
        return {};
    }
}

/** The request comes from the 小猫之神 request script (its reply tool and final sync are there). */
export function isCatgodRequest(body: Record<string, unknown>): boolean {
    const tools = Array.isArray(body.tools) ? body.tools as { function?: { name?: string } }[] : [];
    return tools.some(t => t.function?.name === REPLY_TOOL) && syncPayload(body) !== null;
}

/** 聊天 mode: the user is talking to 小猫之神 itself, outside the story. */
export function isChatMode(body: Record<string, unknown>): boolean {
    return syncPayload(body)?.mode === 'chat';
}

function contextTurn(id: string, query: string, think: string, content: string): Message[] {
    return [
        { role: 'assistant', content: think, thoughtSignature: SIG },
        {
            role: 'assistant',
            thoughtSignature: SIG,
            tool_calls: [{ id, type: 'function', function: { name: 'context', arguments: JSON.stringify({ query }) }, signature: SIG, extra_content: { google: { thoughtSignature: SIG } } }],
        },
        { role: 'tool', tool_call_id: id, name: 'context', content },
    ];
}

const RULING_THINK = '<think>等一下喵！本喵是这场游戏的 DM，动笔写正文之前要先当裁判：人类这一轮的行动里，哪些事的结果说不准、得掷骰子决定。本喵先调 `context` 读一下跑团规则和角色数值，然后调用 `hearth_check` 提交检定喵！</think>';
const NARRATE_THINK = '<think>骰子掷完啦喵！本喵先调 `context` 看看这一轮的检定结果和跑团数据，正文要照着结果写，然后再调用 `soliumbra_reply` 写出完整回复喵！</think>';
const PASS_THINK = '<think>这一轮人类开了「检定绝对通过」喵！本喵先调 `context` 看一下跑团数据，然后调用 `soliumbra_reply` 写正文喵！</think>';

/** The ruling request: the preset's request plus the ruling turn, with hearth_check forced. */
export function rulingRequest(body: Record<string, unknown>, content: string): Record<string, unknown> {
    const tools = Array.isArray(body.tools) ? body.tools as unknown[] : [];
    return {
        ...body,
        messages: [...messagesOf(body), ...contextTurn('call_hearth_dm_rules', 'dm_check', RULING_THINK, content)],
        // The preset's tools stay declared (its history calls them); only the forced one changes.
        tools: [...tools, checkTool()],
        tool_choice: { type: 'function', function: { name: CHECK_TOOL_NAME } },
        toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [CHECK_TOOL_NAME] } },
    };
}

/** The narration request: the preset's request plus this turn's results. */
export function narrationRequest(body: Record<string, unknown>, content: string, pass: boolean): Record<string, unknown> {
    return {
        ...body,
        messages: [...messagesOf(body), ...contextTurn('call_hearth_dm_results', 'dm_results', pass ? PASS_THINK : NARRATE_THINK, content)],
    };
}

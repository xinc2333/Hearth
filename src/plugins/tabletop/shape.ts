// How a 跑团 step goes onto the preset's finished request. Every step keeps that request as it is
// (jailbreak and all) and only adds to its end, so the steps share as much of the request as possible:
//   - a plain request: the step's text becomes one more message at the end (in the entry's role);
//   - a tool conversation (the request ends with a tool result, as presets with their own request
//     script build it): the step continues it the same way: an optional lead line in the preset's
//     own voice (the `*-lead` entry), one more call to the same tool, and the step's text as its result.
// The three steps declare the same tools, so an endpoint that caches can reuse what they share.

import { CHECK_TOOL_NAME, checkTool } from './ruling.ts';
import { SETTLE_TOOL_NAME, settleTool } from './settle.ts';
import { actTool, dayTool, profileTool } from './world/minds.ts';
import { sceneTool, setupTool, WORLD_TOOLS } from './world/tools.ts';

type Message = Record<string, unknown>;
type ToolCall = { id?: string; type?: string; function?: { name?: string; arguments?: string }; [k: string]: unknown };
type Tool = { type?: string; function?: { name?: string; parameters?: { properties?: Record<string, unknown>; required?: string[] } } };

export interface StepText {
    content: string;
    /** A line in the preset's own voice right before the step (tool conversations only). */
    lead?: string;
    /** Role of the added message in a plain request. */
    role?: 'system' | 'user' | 'assistant';
}

const OURS = [CHECK_TOOL_NAME, SETTLE_TOOL_NAME, ...WORLD_TOOLS];
const messagesOf = (body: Record<string, unknown>) => (Array.isArray(body.messages) ? body.messages as Message[] : []);
const toolsOf = (body: Record<string, unknown>) => (Array.isArray(body.tools) ? body.tools as Tool[] : []);

/** The last assistant message that called a tool, and that call. */
function lastCall(body: Record<string, unknown>): { message: Message; call: ToolCall } | null {
    const messages = messagesOf(body);
    for (let i = messages.length - 1; i >= 0; i--) {
        const calls = messages[i].tool_calls;
        if (messages[i].role === 'assistant' && Array.isArray(calls) && calls.length) return { message: messages[i], call: calls[calls.length - 1] as ToolCall };
    }
    return null;
}

/** The request is a tool conversation that ends with a tool's result. */
export function isToolConversation(body: Record<string, unknown>): boolean {
    return messagesOf(body).at(-1)?.role === 'tool' && lastCall(body) !== null;
}

/** Provider extras the conversation's calls carry (e.g. thought signatures), copied onto ours. */
function extras(message: Message, call: ToolCall) {
    const fromMessage = 'thoughtSignature' in message ? { thoughtSignature: message.thoughtSignature } : {};
    const fromCall = Object.fromEntries(Object.entries(call).filter(([k]) => !['id', 'type', 'function', 'index'].includes(k)));
    return { message: fromMessage, call: fromCall };
}

/** Arguments shaped like the conversation's own call, e.g. {"query":"sync"} → {"query":"hearth_ruling"}. */
function argsLike(call: ToolCall, label: string): string {
    try {
        const args = JSON.parse(call.function?.arguments ?? '{}') as Record<string, unknown>;
        const key = 'query' in args ? 'query' : Object.keys(args).find(k => typeof args[k] === 'string');
        return JSON.stringify(key ? { [key]: label } : {});
    } catch {
        return '{}';
    }
}

/** Adds one step to the end of the request. */
export function appendStep(body: Record<string, unknown>, step: StepText, label: string): Record<string, unknown> {
    const messages = [...messagesOf(body)];
    const prev = lastCall(body);
    if (isToolConversation(body) && prev) {
        const result = messages[messages.length - 1];
        const name = String(result.name ?? prev.call.function?.name ?? 'context');
        const x = extras(prev.message, prev.call);
        const id = `call_hearth_${label}`;
        if (step.lead?.trim()) messages.push({ role: 'assistant', content: step.lead.trim(), ...x.message });
        messages.push({ role: 'assistant', ...x.message, tool_calls: [{ id, type: 'function', function: { name, arguments: argsLike(prev.call, `hearth_${label}`) }, ...x.call }] });
        messages.push({ role: 'tool', tool_call_id: id, name, content: step.content });
    } else {
        messages.push({ role: step.role ?? 'system', content: step.content });
    }
    return { ...body, messages };
}

/** The tool the request makes the model answer with (the preset's reply tool), if it names one. */
export function replyTool(body: Record<string, unknown>): string | null {
    const choice = body.tool_choice as { function?: { name?: string } } | string | undefined;
    if (choice && typeof choice === 'object' && choice.function?.name) return choice.function.name;
    if (choice !== 'required') return null;
    const allowed = (body.toolConfig as { functionCallingConfig?: { allowedFunctionNames?: unknown } } | undefined)?.functionCallingConfig?.allowedFunctionNames;
    if (Array.isArray(allowed) && allowed.length === 1 && typeof allowed[0] === 'string') return allowed[0];
    const names = toolsOf(body).map(t => t.function?.name).filter((n): n is string => Boolean(n) && !OURS.includes(n!));
    return names.length === 1 ? names[0] : null;
}

/** The written reply, as one more turn of the conversation (through the reply tool when there is one). */
export function appendReply(body: Record<string, unknown>, text: string): Record<string, unknown> {
    const messages = [...messagesOf(body)];
    const tool = replyTool(body);
    const prev = lastCall(body);
    if (tool && prev && isToolConversation(body)) {
        const params = toolsOf(body).find(t => t.function?.name === tool)?.function?.parameters;
        const keys = [...(params?.required ?? []), ...Object.keys(params?.properties ?? {})].filter(k => !/think/i.test(k));
        const field = keys.includes('game_content') ? 'game_content' : keys[0] ?? 'content';
        const x = extras(prev.message, prev.call);
        const id = 'call_hearth_reply';
        messages.push({ role: 'assistant', ...x.message, tool_calls: [{ id, type: 'function', function: { name: tool, arguments: JSON.stringify({ [field]: text }) }, ...x.call }] });
        messages.push({ role: 'tool', tool_call_id: id, name: tool, content: JSON.stringify({ ok: true }) });
    } else {
        messages.push({ role: 'assistant', content: text });
    }
    return { ...body, messages };
}

/** The reply's text without its thinking, as the conversation would carry it. */
export function replyForHistory(text: string): string {
    return text
        .replace(/<(think_nya|report_nya|think|thinking)~?>[\s\S]*?<\/\1~?>/gi, '')
        .replace(/<!--\s*<\/think>\s*-->/g, '')
        .trim();
}

/** The request's own tools plus ours; a 世界 chat declares the world's tools too. */
function withOurTools(body: Record<string, unknown>, world: boolean): Tool[] {
    const ours = [checkTool(world), settleTool(world), ...(world ? [sceneTool(), setupTool(), actTool(), dayTool(), profileTool()] : [])] as Tool[];
    return [...toolsOf(body).filter(t => !OURS.includes(t.function?.name ?? '')), ...ours];
}

/** A step that answers through one of 跑团's tools: the request's tools plus ours, that one forced. */
export function forceTool(body: Record<string, unknown>, name: string, world = false): Record<string, unknown> {
    return {
        ...body,
        tools: withOurTools(body, world),
        tool_choice: { type: 'function', function: { name } },
        toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [name] } },
    };
}

/**
 * The reply step keeps answering through the preset's reply tool. When that tool can be named, ours
 * are declared too (and the reply tool is named as the forced one), so all three steps send the same
 * tools; otherwise the request's tools stay as they are.
 */
export function replyTools(body: Record<string, unknown>, world = false): Record<string, unknown> {
    const tool = replyTool(body);
    if (!tool || !isToolConversation(body)) return body;
    return {
        ...body,
        tools: withOurTools(body, world),
        tool_choice: { type: 'function', function: { name: tool } },
        toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [tool] } },
    };
}

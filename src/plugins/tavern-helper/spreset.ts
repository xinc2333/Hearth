// SPreset support (part of the 酒馆助手 plugin) for presets driven by the SPreset / "Cat Oracle"
// runtime (e.g. Meowssiah). In SillyTavern a 酒馆助手 script in the preset loads that runtime.
//
// Those presets mark their entries with control macros (<<<|catgodml|…>>>, <|sep|>, <|merge|>,
// <run_tool_replacement>) that their own runtime strips before sending, and they expect the model to
// answer through a reply tool defined in the preset's own SPreset configuration (ToolBindings plus
// the "Stage 1" request script). Hearth does not run that remote runtime; it reproduces what the
// preset's configuration asks for and adds nothing of its own:
//   - control markers are removed; the preset's text is otherwise sent as written;
//   - when an enabled entry carries <run_tool_replacement> and the preset binds a reply tool, the
//     request carries that tool (with the parameter descriptions from the preset's Stage 1 script)
//     and tool_choice "required", exactly as the preset would send it;
//   - the tool-call reply is turned back into tagged text with the preset's toolCallFormatter rules.

import { normalizeModelOutput } from '../../core/output.ts';
import { estimateTokens, MESSAGE_OVERHEAD } from '../../core/tokens.ts';
import type { Preset } from '../../core/types.ts';
import type { Op } from '../../core/ops.ts';
import { stateAt } from '../../core/state.ts';
import type { PluginApi } from '../../server/plugins.ts';
import { withOracleState } from './console.ts';
import { runStage1, stage1Script } from './stage1.ts';

const CONTROL = /<<<\|\s*catgodml\s*\|[\s\S]*?>>>|<\|(?:sep|merge)\|>|<run_tool_replacement>/;

// Text from the preset's Stage 1 script (Meowssiah 2.1.7, theater mode), used only when that script fails.
const TOOL_DESCRIPTION = '小猫之神 SoliUmbra 的神域剧场正式输出通道（先在 think_nya 中完成软萌思考，再输出正式回复内容喵）。';
const THINK_DESCRIPTION = '小猫之神在<think_nya>中的详细软萌思考（全程保持可爱的“喵~”语气，严格遵循最新同步状态中的思考深度与步骤要求进行构思推演喵）。';
const GAME_DESCRIPTION = '完整的正式回复内容（100%自由动态格式：严格按照当前生效的创作细则与格式要求输出所有正文与动态格式块喵）。';
const OPTIONAL_PARTS = new Set(['extra']);

/** The reply tool bound in the preset's SPreset configuration, if enabled. */
/** The preset's SPreset configuration: its SPresetSettings entry, else the copy in the preset's extensions. */
export function spresetConfig(preset: Preset): Record<string, any> | null {
    const raw = preset.prompts.find(p => p.id === 'SPresetSettings')?.content;
    if (raw) {
        try {
            return JSON.parse(raw);
        } catch {
            // Fall through to the extensions copy.
        }
    }
    const st = (preset.extra?.st as Record<string, any> | undefined)?.extensions?.SPreset;
    return st && typeof st === 'object' ? st : null;
}

function boundReplyTool(preset: Preset): string | null {
    const config = spresetConfig(preset) as { ToolBindings?: Record<string, { enabled?: boolean; resolvedName?: string; form?: { name?: string } }> } | null;
    const binding = Object.values(config?.ToolBindings ?? {}).find(b => b?.enabled);
    return binding ? binding.resolvedName ?? binding.form?.name ?? null : null;
}

/** Builds the reply tool like the preset's Stage 1 script does (registerPart fields or game_content). */
export function replyToolRequest(name: string, texts: string[], model: string): Record<string, unknown> {
    const parts: { name: string; description: string }[] = [];
    // Like the preset's script (2.1.7): any model id containing "pg" answers with tool_choice auto.
    let autoTool = /pg/i.test(model);
    for (const text of texts) {
        for (const m of text.matchAll(/<<<\|\s*catgodml\s*\|\s*([\s\S]*?)>>>/g)) {
            const directive = m[1].trim();
            if (/^autotool$/i.test(directive)) autoTool = true;
            const part = directive.match(/^registerPart\s*:\s*([^:]+?)\s*:\s*([\s\S]*)$/i);
            if (part && !parts.some(p => p.name === part[1])) parts.push({ name: part[1], description: part[2].trim() });
        }
    }
    const properties: Record<string, { type: 'string'; description: string }> = { think_nya: { type: 'string', description: THINK_DESCRIPTION } };
    if (parts.length) {
        for (const p of parts) properties[p.name] = { type: 'string', description: p.description || `${p.name} content` };
    } else {
        properties.game_content = { type: 'string', description: GAME_DESCRIPTION };
    }
    return {
        tools: [{
            type: 'function',
            function: {
                name,
                description: TOOL_DESCRIPTION,
                parameters: { type: 'object', properties, required: Object.keys(properties).filter(k => !OPTIONAL_PARTS.has(k)) },
            },
        }],
        tool_choice: autoTool ? 'auto' : 'required',
    };
}

export function isCatgodPreset(preset: Preset): boolean {
    return preset.prompts.some(p => p.id === 'SPresetSettings' || p.content.includes('catgodml|enableMenu'));
}

/** Removes control markers (and the line break right after each); other text is left untouched. */
export function cleanCatgodText(text: string): string {
    if (!CONTROL.test(text)) {
        return text;
    }
    return text.replace(new RegExp(`(?:${CONTROL.source})[ \\t]*(?:\\r?\\n)?`, 'g'), '').trim();
}

/** Strips control markers and attaches the bound reply tool: Hearth's own version of what Stage 1 does. */
function nativeRequest(body: Record<string, unknown>, preset: Preset, model: string): Record<string, unknown> {
    const messages = (body.messages as { role: string; content: unknown }[]).map(m => (typeof m.content === 'string' && CONTROL.test(m.content) ? { ...m, content: cleanCatgodText(m.content) } : m)).filter(m => m.content !== '');
    const texts = (body.messages as { role: string; content: unknown }[]).filter(m => m.role === 'system' && typeof m.content === 'string').map(m => m.content as string);
    const tool = boundReplyTool(preset);
    return { ...body, messages, ...(tool && texts.some(t => t.includes('<run_tool_replacement>')) ? replyToolRequest(tool, texts, model) : {}) };
}

/** Values Stage 1 keeps on `window` between requests, per chat; like SillyTavern they last until restart. */
const windowStates = new Map<string, Record<string, unknown>>();

/** What the preset's SPreset runtime does in SillyTavern, for the parts its configuration declares. */
export function setupSpreset(api: PluginApi) {
    api.onAfterAssemble((result, ctx) => {
        if (!isCatgodPreset(ctx.input.preset)) return;
        result.warnings = result.warnings.filter(w => !w.includes('catgodml') && !w.includes('<|'));
        // With its own request script, the preset gets the messages as written (markers included),
        // exactly as SillyTavern hands them to it.
        if (stage1Script(ctx.input.preset)) return;
        const texts = result.parts.filter(p => !p.messageId).map(p => p.content);
        const tool = boundReplyTool(ctx.input.preset);
        if (tool && texts.some(t => t.includes('<run_tool_replacement>'))) {
            result.request = { ...(result.request ?? {}), ...replyToolRequest(tool, texts, ctx.input.model) };
        }
        const parts = result.parts
            .map(p => (CONTROL.test(p.content) ? { ...p, content: cleanCatgodText(p.content) } : p))
            .filter(p => p.content);
        for (const p of parts) {
            p.tokens = estimateTokens(p.content) + MESSAGE_OVERHEAD;
        }
        result.parts = parts;
        result.messages = parts.map(p => ({ role: p.role, content: p.content, ...(p.name ? { name: p.name } : {}) }));
        result.tokens.total = parts.reduce((s, p) => s + p.tokens, 0);
    });

    api.onRequest(async (body, ctx) => {
        const script = stage1Script(ctx.preset);
        if (!script) return;
        const chat = ctx.chat;
        const own = (chat.plugins?.[api.id] ?? {}) as { chatMetadata?: Record<string, unknown>; localStorage?: Record<string, string> };
        const story = chat.messages.filter(m => m.mode !== 'edit');
        // The reply being written is not part of the chat yet, as in SillyTavern.
        const last = story[story.length - 1];
        const history = last?.role === 'assistant' && !last.swipes[last.activeSwipe]?.content ? story.slice(0, -1) : story;
        // Hearth's reply switches reach the script as its console state.
        const chatMetadata = withOracleState(own.chatMetadata ?? {}, chat);
        try {
            const out = await runStage1(api, script, {
                request: body,
                chatId: chat.id,
                names: { user: history.findLast(m => m.role === 'user')?.name ?? 'User', char: ctx.character.name },
                chat: history.map(m => ({ name: m.name, is_user: m.role === 'user', is_system: m.hidden, mes: m.swipes[m.activeSwipe]?.content ?? '', extra: {} })),
                chatMetadata,
                vars: { chat: chat.variables ?? {}, message: stateAt(history) ?? {}, global: api.store.settings?.globalVariables ?? {}, preset: {} },
                windowState: windowStates.get(chat.id) ?? {},
                localStorage: own.localStorage ?? {},
            });
            windowStates.set(chat.id, out.windowState ?? {});
            const ops: Op[] = [];
            if (JSON.stringify(out.chatMetadata) !== JSON.stringify(own.chatMetadata ?? {})) ops.push({ op: 'set', path: ['plugins', api.id, 'chatMetadata'], value: out.chatMetadata });
            if (JSON.stringify(out.localStorage) !== JSON.stringify(own.localStorage ?? {})) ops.push({ op: 'set', path: ['plugins', api.id, 'localStorage'], value: out.localStorage });
            if (JSON.stringify(out.vars.chat) !== JSON.stringify(chat.variables ?? {})) ops.push({ op: 'set', path: ['variables'], value: out.vars.chat });
            if (ops.length) await api.store.apply({ target: { kind: 'chat', id: chat.id }, ops, author: 'script', journal: false });
            return out.request;
        } catch (error) {
            api.log('预设的请求脚本运行失败，改用内置适配：', (error as Error).message);
            ctx.warn?.(`预设的请求脚本（SPreset）运行失败，这次改用 Hearth 的内置适配：${(error as Error).message}`);
            return nativeRequest(body, ctx.preset, String(body.model ?? ''));
        }
    });

    api.onAfterReceive(ctx => {
        if (!isCatgodPreset(ctx.preset)) return;
        return { text: normalizeModelOutput(ctx.text) };
    });
}

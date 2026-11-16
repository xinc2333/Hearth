// Built-in adapter for presets driven by the SPreset / "Cat Oracle" runtime (e.g. Meowssiah).
//
// Those presets mark their entries with control macros (<<<|catgodml|…>>>, <|sep|>, <|merge|>,
// <run_tool_replacement>) that their own runtime strips before sending, and they expect the model to
// answer through a reply tool defined in the preset's own SPreset configuration (ToolBindings plus
// the "Stage 1" request script). Hearth implements the following behavior locally:
//   - control markers are removed and the chat's mode, deep thinking and one-shot note are applied;
//   - when an enabled entry carries <run_tool_replacement> and the preset binds a reply tool, the
//     request carries that tool (with the parameter descriptions from the preset's Stage 1 script)
//     and tool_choice "required", exactly as the preset would send it;
//   - the tool-call reply is turned back into tagged text with the preset's toolCallFormatter rules.

import { normalizeModelOutput } from '../../core/output.ts';
import { estimateTokens, MESSAGE_OVERHEAD } from '../../core/tokens.ts';
import type { CatgodOptions, Preset } from '../../core/types.ts';
import type { HearthPlugin } from '../plugins.ts';

const CONTROL = /<<<\|\s*catgodml\s*\|[\s\S]*?>>>|<\|(?:sep|merge)\|>|<run_tool_replacement>/;

// Text from the preset's Stage 1 script (theater mode, deep thinking off).
const TOOL_DESCRIPTION = '小猫之神 SoliUmbra 的神域剧场正式输出通道（先在 think_nya 中完成软萌思考，再输出正式回复内容喵）。';
const THINK_DESCRIPTION = '小猫之神在<think_nya>中的详细软萌思考（全程保持可爱的“喵~”语气，围绕人物神态、互动张力、动态格式要求与剧情走向进行构思喵）。';
const GAME_DESCRIPTION = '完整的正式回复内容（100%自由动态格式：严格按照当前生效的创作细则与格式要求输出所有正文与动态格式块喵）。';
const CHAT_DESCRIPTION = '本轮暂停推进剧场剧情。以小猫之神 SoliUmbra 本体的口吻在场外直接与玩家交流，回答问题或讨论剧情；回复正文不使用 <game>、<options>、<summary> 等剧场标签。';
const DEEP_THINK_DESCRIPTION = '回复前仔细推演多个可能的方向，核对人物动机、前情和当前约束，再选定贴合本轮请求的回复。';
const NOTE_SOURCE = 'catgodNote';
const OPTIONAL_PARTS = new Set(['extra']);

/** The reply tool bound in the preset's SPreset configuration, if enabled. */
function boundReplyTool(preset: Preset): string | null {
    const raw = preset.prompts.find(p => p.id === 'SPresetSettings')?.content;
    if (!raw) return null;
    try {
        const config = JSON.parse(raw) as { ToolBindings?: Record<string, { enabled?: boolean; resolvedName?: string; form?: { name?: string } }> };
        const binding = Object.values(config.ToolBindings ?? {}).find(b => b?.enabled);
        return binding ? binding.resolvedName ?? binding.form?.name ?? null : null;
    } catch {
        return null;
    }
}

/** Builds the reply tool like the preset's Stage 1 script does (registerPart fields or game_content). */
export function replyToolRequest(name: string, texts: string[], model: string, options: CatgodOptions = {}): Record<string, unknown> {
    const parts: { name: string; description: string }[] = [];
    let autoTool = /^pg-/i.test(model);
    for (const text of texts) {
        for (const m of text.matchAll(/<<<\|\s*catgodml\s*\|\s*([\s\S]*?)>>>/g)) {
            const directive = m[1].trim();
            if (/^autotool$/i.test(directive)) autoTool = true;
            const part = directive.match(/^registerPart\s*:\s*([^:]+?)\s*:\s*([\s\S]*)$/i);
            if (part && !parts.some(p => p.name === part[1])) parts.push({ name: part[1], description: part[2].trim() });
        }
    }
    const chatMode = options.mode === 'chat';
    const think = chatMode ? '简要考虑玩家的问题、意图和当前上下文。' : THINK_DESCRIPTION;
    const properties: Record<string, { type: 'string'; description: string }> = {
        think_nya: { type: 'string', description: options.deepThink ? `${think}\n${DEEP_THINK_DESCRIPTION}` : think },
    };
    if (parts.length && !chatMode) {
        for (const p of parts) properties[p.name] = { type: 'string', description: p.description || `${p.name} content` };
    } else {
        properties.game_content = { type: 'string', description: chatMode ? CHAT_DESCRIPTION : GAME_DESCRIPTION };
    }
    return {
        tools: [{
            type: 'function',
            function: {
                name,
                description: chatMode ? '小猫之神 SoliUmbra 的场外聊天回复。' : TOOL_DESCRIPTION,
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

export const catgodAdapter: HearthPlugin = {
    id: 'builtin.catgod',
    name: '猫神预设适配（Meowssiah / SPreset）',
    setup(api) {
        api.onBeforeAssemble(({ chat, input, injections }) => {
            const options = chat.catgod;
            if (!options || !isCatgodPreset(input.preset)) return;
            const add = (key: string, value: string) => injections.push({ key, value, position: 'in_chat', depth: 0, role: 'system', scan: false });
            if (options.mode === 'chat') add('catgodMode', CHAT_DESCRIPTION);
            if (options.deepThink) add('catgodDeepThink', DEEP_THINK_DESCRIPTION);
            if (options.note) add(NOTE_SOURCE, `【本轮临时纸条】\n${options.note.text}`);
        });

        api.onAfterAssemble((result, ctx) => {
            if (!isCatgodPreset(ctx.input.preset)) return;
            const texts = result.parts.filter(p => !p.messageId).map(p => p.content);
            const tool = boundReplyTool(ctx.input.preset);
            if (tool && texts.some(t => t.includes('<run_tool_replacement>'))) {
                result.request = { ...(result.request ?? {}), ...replyToolRequest(tool, texts, ctx.input.model, ctx.chat.catgod) };
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
            result.warnings = result.warnings.filter(w => !w.includes('catgodml') && !w.includes('<|'));
        });

        api.onAfterReceive(ctx => {
            if (!isCatgodPreset(ctx.preset)) return;
            const options = ctx.initialChat.catgod;
            const note = options?.note;
            const text = normalizeModelOutput(ctx.text, options?.mode !== 'chat');
            if (note && (ctx.finish === 'stop' || ctx.finish === 'length') && text.trim()
                && ctx.parts.some(part => part.sources.includes(NOTE_SOURCE))) {
                return {
                    text,
                    ops: chat => note.id === chat.catgod?.note?.id ? [{ op: 'unset', path: ['catgod', 'note'] }] : [],
                };
            }
            return { text };
        });
    },
};

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { assemble } from '../src/core/assemble.ts';
import { importCardFile } from '../src/core/compat/st-card.ts';
import { importStPreset } from '../src/core/compat/st-preset.ts';
import { normalizeModelOutput, unescapeLiteral } from '../src/core/output.ts';
import { DEFAULT_LORE_SETTINGS } from '../src/core/types.ts';
import { cleanCatgodText, isCatgodPreset, setupSpreset } from '../src/plugins/tavern-helper/spreset.ts';
import { PluginHost } from '../src/server/plugins.ts';

import { MEOWSSIAH as MEOW, SERAPHINA } from './fixtures.ts';

test('unescapes literal \\n in prose but leaves code blocks and clean text alone', () => {
    assert.equal(unescapeLiteral('她笑了。\\n\\n“你好。”\\n'), '她笑了。\n\n“你好。”\n');
    assert.equal(unescapeLiteral('normal text\nwith real newlines'), 'normal text\nwith real newlines');
    assert.equal(unescapeLiteral('a\\nb ```\ncode \\n stays\n```'), 'a\nb ```\ncode \\n stays\n```');
});

test('formats reply-tool JSON into tagged text, including truncated streams', () => {
    const json = JSON.stringify({ think_nya: '想一想 <x>', game_content: '<game>\n正文第一段\n\n第二段\n</game>', options: '1. 走\n2. 留' });
    const out = normalizeModelOutput(json);
    assert.ok(out.startsWith('<think_nya>\n想一想 &lt;x&gt;\n</think_nya><!--</think>-->'));
    assert.ok(out.includes('<game>\n正文第一段\n\n第二段\n</game>'));
    assert.ok(out.includes('<options>\n1. 走\n2. 留\n</options>'));
    const partial = '{"think_nya": "嗯\\n好", "game_content": "她转过身\\n说';
    const p = normalizeModelOutput(partial);
    assert.ok(p.includes('嗯\n好') && p.includes('<game>\n她转过身\n说\n</game>'));
    assert.ok(!p.includes('\\n'));
    assert.equal(normalizeModelOutput('```json\n{"content": "只有正文"}\n```'), '只有正文');
    // Pseudo tool-call tokens printed as text, with raw newlines inside the JSON string.
    const wrapped = '<|tool_call|>reply\n<|tool_call|>{"content": "<game>\n她笑了\n</game>"}</|tool_call|>';
    assert.equal(normalizeModelOutput(wrapped), '<game>\n她笑了\n</game>');
    const inline = '<think_nya>\n想想\n</think_nya>\n<|tool_call|>{"content": "<game>正文</game>"}</|tool_call|>';
    // Shape produced by the provider for real tool calls.
    const streamed = '\n<|tool_call|>soliumbra_reply\n{"think_nya":"嗯","game_content":"\\u003cgame\\u003e\\n正文\\n\\u003c/game\\u003e"}';
    assert.equal(normalizeModelOutput(streamed), '<think_nya>\n嗯\n</think_nya><!--</think>-->\n<game>\n正文\n</game>');
    assert.equal(normalizeModelOutput(inline), '<think_nya>\n想想\n</think_nya>\n<game>正文</game>');
});

test('strips SPreset control markers and leaves the preset text as written', () => {
    const cleaned = cleanCatgodText('<|sep|><|merge|>小猫之神会使用reply工具回复，先思考~<run_tool_replacement>\n<<<|catgodml|enableMenu>>>');
    assert.equal(cleaned, '小猫之神会使用reply工具回复，先思考~');
    assert.equal(cleanCatgodText('<<<|catgodml|menu:角色控制:😸活人感加强>>>\n要有活人感'), '要有活人感');
    assert.equal(cleanCatgodText('<<<|catgodml|setLastMessage:你好>>>'), '');
    assert.equal(cleanCatgodText('普通文本\n\n不变'), '普通文本\n\n不变');
});

test('Meowssiah prompt has no control markers after the adapter runs', { skip: !existsSync(MEOW) || !existsSync(SERAPHINA) }, async () => {
    const preset = importStPreset(JSON.parse(readFileSync(MEOW, 'utf8')), 'Meowssiah', 'Meowssiah-2.1.6.json');
    assert.ok(isCatgodPreset(preset));
    const { character } = importCardFile(new Uint8Array(readFileSync(SERAPHINA)), 'x.png');
    const msg = (id: string, role: 'user' | 'assistant', name: string, content: string) => ({ id, role, name, swipes: [{ id: `${id}s`, content, createdAt: 0 }], activeSwipe: 0, hidden: false, createdAt: 0 });
    const input = {
        type: 'normal' as const, chatId: 'c', character, userName: 'Alex',
        persona: { description: '', position: 'in_prompt' as const, depth: 2, role: 'system' as const }, preset,
        lore: { sources: [], settings: DEFAULT_LORE_SETTINGS },
        messages: [msg('a', 'assistant', 'Seraphina', character.fields.firstMessage), msg('b', 'user', 'Alex', '你好')],
        authorsNote: { content: '', interval: 1, position: 'in_chat' as const, depth: 4, role: 'system' as const, scan: false },
        variables: { chat: {}, global: {} }, globalRegex: [],
        options: { preferCharacterPrompt: true, preferCharacterJailbreak: true, pinExamples: false, collapseNewlines: false },
        model: 'x', injections: [],
    };
    const result = assemble(input);
    const host = new PluginHost({ get: () => undefined, list: () => [], apply: async () => ({}) } as never);
    await host.use({ id: 'tavern-helper', setup: setupSpreset });
    for (const fn of host.after) await fn(result, { chat: {} as never, character, input, injections: [] });
    const all = result.messages.map(m => m.content).join('\n');
    assert.ok(!/catgodml|<\|sep\|>|<\|merge\|>|run_tool_replacement/.test(all));
    // Nothing is added: every part still comes from the preset, card or chat.
    assert.ok(!result.parts.some(p => p.sources.includes('builtin.catgod')));
    assert.equal(result.messages[result.messages.length - 1].content.includes('【输出方式】'), false);
    assert.deepEqual(result.warnings, []);
    assert.ok(result.messages.some(m => m.content === '你好'));
    // The preset binds a reply tool and its init entry carries <run_tool_replacement>: the request
    // carries that tool, as the preset's own Stage 1 script would send it.
    const tools = (result.request?.tools ?? []) as { function: { name: string; parameters: { required: string[] } } }[];
    assert.equal(tools[0]?.function.name, 'soliumbra_reply');
    assert.deepEqual(tools[0]?.function.parameters.required, ['think_nya', 'game_content']);
    assert.equal(result.request?.tool_choice, 'required');
});

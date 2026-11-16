import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { assemble } from '../src/core/assemble.ts';
import { importCardFile } from '../src/core/compat/st-card.ts';
import { defaultPreset } from '../src/core/compat/st-preset.ts';
import { applyMvuCommands, parseMvuCommands } from '../src/core/mvu.ts';
import { DEFAULT_LORE_SETTINGS, type ChatMessage } from '../src/core/types.ts';
import { compileEjs, ejsPlugin, renderEjs } from '../src/server/builtin/ejs.ts';
import { initialVariables, isMvuCard } from '../src/server/builtin/mvu.ts';
import { PluginHost } from '../src/server/plugins.ts';

import { MVU_CARD as CARD } from './fixtures.ts';

test('parses JSONPatch and legacy MVU commands', () => {
    const text = `正文……
<UpdateVariable>
<Analysis>time passed: 10 min</Analysis>
<JSONPatch>
[
  { "op": "replace", "path": "/世界/地点", "value": "白玫旧物—二层" },
  { "op": "delta", "path": "/好感度", "value": 5 },
  { "op": "insert", "path": "/背包/-", "value": "旧书" },
  { "op": "remove", "path": "/待办事项/内容" },
]
</JSONPatch>
_.set('诗.出处', '松尾芭蕉', '泰戈尔');//换一位诗人
</UpdateVariable>`;
    const cmds = parseMvuCommands(text);
    assert.equal(cmds.length, 5);
    const result = applyMvuCommands({ 世界: { 地点: '一层' }, 好感度: 10, 背包: [], 待办事项: { 内容: 'x' }, 诗: { 出处: '松尾芭蕉' } }, cmds);
    assert.deepEqual(result.stat_data, { 世界: { 地点: '白玫旧物—二层' }, 好感度: 15, 背包: ['旧书'], 待办事项: {}, 诗: { 出处: '泰戈尔' } });
    assert.equal(result.delta_data['好感度'].to, 15);
    assert.deepEqual(result.errors, []);
});

test('EJS whitespace slurping and output tags behave like ejs', async () => {
    const env = { vars: { global: {}, chat: {}, message: {} }, books: [], character: { name: '', description: '', personality: '', scenario: '' }, macros: (t: string) => t };
    assert.equal(await renderEjs('a\n  <%_ if (true) { _%>\nyes <%= 1 + 1 %>\n<%_ } _%>\nb', env), 'a\nyes 2\nb');
    assert.equal(await renderEjs('<%# comment %>x<%- "<b>" -%>\ny', env), 'x<b>y');
    assert.ok(compileEjs('<%% literal %%>').includes('<%'));
});

test('the user card: MVU init vars, macros and chapter controller', { skip: !existsSync(CARD) }, async () => {
    const { character, lorebook } = importCardFile(new Uint8Array(readFileSync(CARD)), '1.png');
    assert.ok(lorebook);
    assert.ok(isMvuCard(character, [lorebook]));
    const init = initialVariables([lorebook]);
    assert.equal((init as any)?.世界?.地点, '白玫旧物—一层');
    assert.equal((init as any)?.故事阶段, 'A');

    const greeting: ChatMessage = {
        id: 'm0', role: 'assistant', name: character.name, hidden: false, createdAt: 0, activeSwipe: 0,
        swipes: [{ id: 's0', content: character.fields.firstMessage, createdAt: 0, state: { stat_data: init } }],
    };
    const user: ChatMessage = { id: 'm1', role: 'user', name: 'Alex', hidden: false, createdAt: 0, activeSwipe: 0, swipes: [{ id: 's1', content: '我想在这里工作。', createdAt: 0 }] };
    const input = {
        type: 'normal' as const, chatId: 'c', character, userName: 'Alex',
        persona: { description: '', position: 'in_prompt' as const, depth: 2, role: 'system' as const }, preset: defaultPreset(),
        lore: { sources: [{ book: lorebook, scope: 'character' as const }], settings: { ...DEFAULT_LORE_SETTINGS } },
        messages: [greeting, user],
        authorsNote: { content: '', interval: 1, position: 'in_chat' as const, depth: 4, role: 'system' as const, scan: false },
        variables: { chat: {}, global: {} }, globalRegex: [],
        options: { preferCharacterPrompt: true, preferCharacterJailbreak: true, pinExamples: false, collapseNewlines: false },
        model: 'x', injections: [],
    };
    const result = assemble(input);
    const all = () => result.messages.map(m => m.content).join('\n');
    // {{format_message_variable::stat_data}} shows the current variables as YAML.
    assert.ok(all().includes('地点: 白玫旧物—一层'));
    // The status-bar placeholder is hidden from the model by the card's prompt-only regex.
    assert.ok(!all().includes('StatusPlaceHolderImpl'));

    const host = new PluginHost({ get: () => undefined, list: () => [], apply: async () => ({}) } as never);
    await host.use(ejsPlugin);
    for (const fn of host.after) await fn(result, { chat: {} as never, character, input, injections: [] });
    const chapterA = lorebook.entries.find(e => e.title === '今日似旧')!.content.slice(0, 30);
    assert.ok(all().includes(chapterA.replace(/{{user}}/g, 'Alex')), 'stage A pulls in 今日似旧');
    assert.ok(!all().includes('<%'));
    assert.ok(!result.warnings.some(w => w.includes('EJS')), result.warnings.join('; '));

    // Stage B pulls in the next chapter.
    const env = {
        vars: { global: {}, chat: {}, message: { stat_data: { ...(init as object), 故事阶段: 'B' } } },
        books: [lorebook],
        character: { name: character.name, description: '', personality: '', scenario: '' },
        macros: (t: string) => t,
    };
    const controller = lorebook.entries.find(e => e.title === '章节控制器')!.content;
    const out = await renderEjs(controller, env);
    assert.ok(out.includes(lorebook.entries.find(e => e.title === '不明心')!.content.slice(0, 30)));
});

test('sandboxed templates cannot reach Node', async () => {
    const env = { vars: { global: {}, chat: {}, message: {} }, books: [], character: { name: '', description: '', personality: '', scenario: '' }, macros: (t: string) => t };
    const out = await renderEjs('<%= typeof process %>/<%= typeof require %>/<%= typeof fetch %>', env);
    assert.equal(out, 'undefined/undefined/undefined');
    await assert.rejects(renderEjs('<% while (true) {} %>', env));
});

test('MVU asks for the update when the model forgets it', { skip: !existsSync(CARD) }, async () => {
    const { mvuPlugin } = await import('../src/server/builtin/mvu.ts');
    const { character, lorebook } = importCardFile(new Uint8Array(readFileSync(CARD)), '1.png');
    const init = initialVariables([lorebook!])!;
    let asked = '';
    const host = new PluginHost({ get: (_k: string, id: string) => (id === lorebook!.id ? lorebook : undefined), list: () => [], apply: async () => ({}) } as never);
    host.completer = async req => {
        asked = req.messages[0].content;
        return '好的\n<UpdateVariable><JSONPatch>[{"op":"replace","path":"/世界/时间/时间","value":"14:00"}]</JSONPatch></UpdateVariable>';
    };
    await host.use(mvuPlugin);
    const reply: ChatMessage = { id: 'm2', role: 'assistant', name: character.name, hidden: false, createdAt: 0, activeSwipe: 0, swipes: [{ id: 's2', content: '', createdAt: 0 }] };
    const chat = { messages: [{ id: 'm0', role: 'assistant', name: '', hidden: false, createdAt: 0, activeSwipe: 0, swipes: [{ id: 's0', content: '', createdAt: 0, state: { stat_data: init } }] }, reply] };
    const out = await host.receive[0]({ chat: chat as never, character, preset: {} as never, message: reply, swipe: reply.swipes[0], text: '她点了点头。', finish: 'stop' });
    assert.ok(asked.includes('变量更新规则'));
    assert.ok(out && out.text?.includes('<UpdateVariable>') && out.text.endsWith('<StatusPlaceHolderImpl/>'));
    const state = (out!.ops![0] as { value: { stat_data: any; source: string } }).value;
    assert.equal(state.stat_data.世界.时间.时间, '14:00');
    assert.equal(state.source, 'fallback');
});

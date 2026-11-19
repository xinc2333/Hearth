// Frontend cards: worldbooks written in 酒馆助手's shape, MVU variable schemas, EJS entries marked
// @@preprocessing, and the card's background scripts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { assemble, type AssembleInput } from '../src/core/assemble.ts';
import { importCardFile } from '../src/core/compat/st-card.ts';
import { defaultPreset } from '../src/core/compat/st-preset.ts';
import { thUid, toThWorldbook, worldbookOps } from '../src/core/compat/th-worldbook.ts';
import { newLoreEntry } from '../src/core/lore.ts';
import { applyOps } from '../src/core/ops.ts';
import { DEFAULT_LORE_SETTINGS, type Character, type ChatMessage, type Lorebook } from '../src/core/types.ts';
import { ejsPlugin } from '../src/plugins/prompt-template/ejs.ts';
import { PluginHost } from '../src/server/plugins.ts';
import { initialVariables } from '../src/plugins/tavern-helper/mvu.ts';
import { parseWithSchema, schemaScript } from '../src/plugins/tavern-helper/mvu-schema.ts';
import { runBackgroundScripts, skipReason } from '../src/plugins/tavern-helper/scripts.ts';
import { createMacroContext, evaluateMacros } from '../src/core/macros.ts';
import { runSandboxed } from '../src/server/sandbox.ts';

import { FRONTEND_CARD } from './fixtures.ts';

const sandbox = { sandbox: { run: runSandboxed } };

function book(): Lorebook {
    const b: Lorebook = { id: 'lb', kind: 'lorebook', name: '书', description: '', createdAt: 0, updatedAt: 0, entries: [] };
    const a = newLoreEntry(b, { title: '甲', content: '甲的内容', keys: ['甲'] });
    b.entries.push(a);
    const c = newLoreEntry(b, { title: '乙', content: '乙的内容', keys: [] });
    c.activation = 'constant';
    c.group.names = '分组';
    b.entries.push(c);
    return b;
}

test('worldbook writes in 酒馆助手 shape become field-level ops', () => {
    const b = book();
    const th = toThWorldbook(b);
    assert.equal(th[0].uid, 0);
    assert.equal(th[1].strategy.type, 'constant');
    assert.equal(th[1].position.type, 'before_character_definition');

    // Unchanged list: nothing to do.
    assert.deepEqual(worldbookOps(b, structuredClone(th)), []);

    // Turn 乙 off and rewrite it, drop 甲, add a new entry with extra data.
    const written = [
        { ...th[1], enabled: false, content: '新内容' },
        { name: '丙', content: '丙', enabled: true, strategy: { type: 'constant', keys: [], keys_secondary: { logic: 'and_any', keys: [] }, scan_depth: 'same_as_global' },
            position: { type: 'at_depth', role: 'system', depth: 2, order: 50 }, extra: { mod: 'x' } },
    ];
    const ops = worldbookOps(b, written);
    const { doc, inverse } = applyOps(b, ops);
    assert.deepEqual(doc.entries.map(e => e.title), ['乙', '丙']);
    assert.equal(doc.entries[0].enabled, false);
    assert.equal(doc.entries[0].content, '新内容');
    assert.equal(doc.entries[0].group.names, '分组', 'fields 酒馆助手 does not have are kept');
    assert.equal(doc.entries[1].id, '2');
    assert.equal(doc.entries[1].position, 'at_depth');
    assert.equal(doc.entries[1].depth, 2);
    assert.deepEqual(toThWorldbook(doc)[1].extra, { mod: 'x' });
    // The change can be undone.
    assert.deepEqual(applyOps(doc, inverse).doc.entries, b.entries);
    assert.ok(thUid('abc') > 1_000_000_000);
});

test('MVU schema scripts run in the sandbox with a bundled zod', async () => {
    const card = {
        scripts: [{
            id: 's', name: '变量结构', enabled: true, type: 'script', raw: {},
            content: `import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';
export const Schema = z.object({
  好感度: z.coerce.number().transform(v => Math.min(100, Math.max(0, v))).prefault(0),
  地点: z.string().prefault('家'),
  背包: z.array(z.string()).prefault([]),
});
registerMvuSchema(Schema);`.replace('export const', 'const'),
        }],
    } as never;
    const code = schemaScript(card);
    assert.ok(code && !code.includes('import'));
    const out = await parseWithSchema(sandbox, code, { 好感度: '150' });
    assert.deepEqual(out, { ok: true, data: { 好感度: 100, 地点: '家', 背包: [] } });
    const bad = await parseWithSchema(sandbox, code, { 背包: 'x' });
    assert.equal(bad.ok, false);
    assert.match(bad.error ?? '', /背包/);

    // Other remote code is not fetched: such a script is not run.
    const remote = { scripts: [{ ...(card as { scripts: object[] }).scripts[0], content: `import x from 'https://example.com/a.js';\nregisterMvuSchema(x);` }] } as never;
    assert.equal(schemaScript(remote), null);
});

test('the frontend card: its schema fills in the variables', { skip: !existsSync(FRONTEND_CARD) }, async () => {
    const { character, lorebook } = importCardFile(new Uint8Array(readFileSync(FRONTEND_CARD)), 'card.png');
    assert.ok(lorebook);
    const code = schemaScript(character);
    assert.ok(code);
    const init = initialVariables([lorebook]) ?? {};
    const started = Date.now();
    const out = await parseWithSchema(sandbox, code, init);
    const ms = Date.now() - started;
    assert.equal(out.ok, true, out.error);
    assert.ok(Object.keys(out.data ?? {}).length >= Object.keys(init).length);
    assert.ok(ms < 5000, `schema took ${ms} ms`);
});

function inputFor(character: Character, books: Lorebook[], messages: ChatMessage[], budgetPercent = DEFAULT_LORE_SETTINGS.budgetPercent): AssembleInput {
    return {
        type: 'normal', chatId: 'c', character, userName: 'Alex',
        persona: { description: '', position: 'in_prompt', depth: 2, role: 'system' }, preset: defaultPreset(),
        lore: { sources: books.map(book => ({ book, scope: 'character' as const })), settings: { ...DEFAULT_LORE_SETTINGS, budgetPercent } },
        messages,
        authorsNote: { content: '', interval: 1, position: 'in_chat', depth: 4, role: 'system', scan: false },
        variables: { chat: {}, global: {} }, globalRegex: [],
        options: { preferCharacterPrompt: true, preferCharacterJailbreak: true, pinExamples: false, collapseNewlines: false },
        model: 'x', injections: [],
    };
}

async function assembleWithTemplates(input: AssembleInput) {
    const host = new PluginHost({ get: () => undefined, list: () => [], apply: async () => ({}) } as never);
    await host.use({ id: 'prompt-template', ...ejsPlugin });
    const ctx = { chat: {} as never, character: input.character, input, injections: [] };
    for (const fn of host.before) await fn(ctx);
    const result = assemble(input);
    for (const fn of host.after) await fn(result, ctx);
    return result;
}

const message = (role: ChatMessage['role'], content: string, state?: Record<string, unknown>): ChatMessage => ({
    id: `m${Math.random()}`, role, name: role, hidden: false, createdAt: 0, activeSwipe: 0,
    swipes: [{ id: 's', content, createdAt: 0, ...(state ? { state } : {}) }],
});

test('@@preprocessing entries are rendered before activation and the budget', async () => {
    const b = book();
    b.entries = [];
    const big = newLoreEntry(b, { title: '控制器', content: `@@preprocessing\n<%_ /* ${'很长的代码注释'.repeat(3000)} */ _%>阶段：<%= getvar('stat_data.阶段') %>`, keys: [] });
    big.activation = 'constant';
    b.entries.push(big);
    const character = importCardFile(new TextEncoder().encode(JSON.stringify({ name: '甲', first_mes: '你好' })), 'a.json').character;
    const input = inputFor(character, [b], [message('assistant', '你好', { stat_data: { 阶段: '二' } }), message('user', '嗯')], 5);
    const result = await assembleWithTemplates(input);
    const text = result.messages.map(m => m.content).join('\n');
    assert.ok(text.includes('阶段：二'), text);
    assert.equal(result.lore.activated.length, 1);
    assert.equal(b.entries[0].content.startsWith('@@preprocessing'), true, 'the stored entry is unchanged');
});

test('the frontend card: its controllers render first, so every constant entry fits the budget', { skip: !existsSync(FRONTEND_CARD) }, async () => {
    const { character, lorebook } = importCardFile(new Uint8Array(readFileSync(FRONTEND_CARD)), 'card.png');
    assert.ok(lorebook);
    const init = (await parseWithSchema(sandbox, schemaScript(character)!, initialVariables([lorebook]) ?? {})).data;
    const input = inputFor(character, [lorebook], [message('assistant', '开场白', { stat_data: init }), message('user', '我睁开眼睛。')]);
    // The budget is a share of the preset's context, as in 酒馆; 200k is a common context size today.
    input.preset = { ...input.preset, context: { ...input.preset.context, maxContext: 200_000 } };
    const result = await assembleWithTemplates(input);
    const constant = lorebook.entries.filter(e => e.enabled && e.activation === 'constant').map(e => e.title);
    const activated = new Set(result.lore.activated.map(a => a.title));
    assert.deepEqual(constant.filter(t => !activated.has(t)), [], 'every constant entry is sent');
    assert.ok(!result.messages.some(m => m.content.includes('<%')));
    assert.ok(!result.warnings.some(w => w.includes('EJS')), result.warnings.join('; '));
});

test('background scripts: card logic runs on events, with timers on a virtual clock', async () => {
    const script = {
        id: 'x', name: '清理', enabled: true, type: 'script', raw: {},
        content: `const debounce = (fn, ms) => { let t = null; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; };
const clean = () => {
  const list = getChatMessages('0-{{lastMessageId}}');
  for (const m of list) if (m.role === 'user' && m.message.includes('[参考]')) setChatMessages([{ message_id: m.message_id, message: m.message.replace(/\\[参考\\][\\s\\S]*?\\[\\/参考\\]/, '（已清理）') }]);
};
eventOn(tavern_events.MESSAGE_RECEIVED, debounce(clean, 2000));`,
    };
    assert.equal(skipReason(script), null);
    assert.equal(skipReason({ ...script, content: 'eventOn("x", () => document.querySelector("#a"))' }), '操作页面');
    assert.equal(skipReason({ ...script, content: 'eventOn("x", () => replaceVariables({}))' }), '直接改变量');
    assert.equal(skipReason({ ...script, content: "await import('https://cdn/x.js');" }), '加载外部代码');
    const chat = {
        id: 'c', messages: [message('user', '开始[参考]很长的大纲[/参考]'), message('assistant', '正文')], variables: {},
    } as unknown as import('../src/core/types.ts').Chat;
    const api = { sandbox: { run: runSandboxed }, macros: { context: createMacroContext, evaluate: evaluateMacros } };
    const run = await runBackgroundScripts(api, chat, [script], [['message_received', [1, 'normal']]], ['甲', '乙']);
    assert.deepEqual(run.errors, []);
    const { doc } = applyOps(chat, run.ops);
    assert.equal(doc.messages[0].swipes[0].content, '开始（已清理）');
});

test('the frontend card: only its reference cleanup runs in the background, as in 酒馆', { skip: !existsSync(FRONTEND_CARD) }, async () => {
    const { character } = importCardFile(new Uint8Array(readFileSync(FRONTEND_CARD)), 'card.png');
    const reasons = Object.fromEntries(character.scripts.map(s => [s.name, skipReason(s)]));
    assert.deepEqual(reasons, { 变量保险: '直接改变量', 状态栏保活: '操作页面', MVUbeta: '加载外部代码', '变量结构.js': '变量结构，由 MVU 处理', 剧情参考清理: null });
    const cleanup = character.scripts.find(s => s.name === '剧情参考清理')!;
    const payload = '（开场白指令）\n\n下面是目标阶段的剧情介绍供参考：\n[剧情参考]大纲[/剧情参考]\n';
    const chat = {
        id: 'c', variables: {},
        messages: [message('assistant', '开局'), message('user', payload), message('assistant', '第一段正文')],
    } as unknown as import('../src/core/types.ts').Chat;
    const api = { sandbox: { run: runSandboxed }, macros: { context: createMacroContext, evaluate: evaluateMacros } };
    const run = await runBackgroundScripts(api, chat, [cleanup], [['message_received', [2, 'normal']], ['generation_ended', [2]]], ['甲', character.name]);
    assert.deepEqual(run.errors, []);
    // It reads getChatMessages(-500): in 酒馆助手 that is one message, clamped to the first, so it
    // finds nothing to clean. Hearth reads it the same way.
    assert.deepEqual(run.ops, []);
});

test('message ranges follow 酒馆助手: negative from the end, clamped, ranges in either order', async () => {
    const { messageRange } = await import('../src/plugins/tavern-helper/scripts.ts');
    assert.deepEqual(messageRange(-1, 9), [9, 9]);
    assert.deepEqual(messageRange(-500, 9), [0, 0]);
    assert.deepEqual(messageRange('5-2', 9), [2, 5]);
    assert.deepEqual(messageRange('0-{{lastMessageId}}', 9), [0, 9]);
    assert.deepEqual(messageRange('3-99', 9), [3, 9]);
    assert.equal(messageRange('x', 9), null);
    assert.equal(messageRange(0, -1), null);
});

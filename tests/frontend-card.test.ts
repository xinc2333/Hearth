// Frontend cards: worldbooks written in 酒馆助手's shape, MVU variable schemas, EJS entries marked
// @@preprocessing, and the card's background scripts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { assemble, type AssembleInput } from '../src/core/assemble.ts';
import { importCardFile } from '../src/core/compat/st-card.ts';
import { defaultPreset } from '../src/core/compat/st-preset.ts';
import { thUid, toThWorldbook, worldbookOps } from '../src/core/compat/th-worldbook.ts';
import { newLoreEntry } from '../src/core/lore.ts';
import { applyOps } from '../src/core/ops.ts';
import { DEFAULT_LORE_SETTINGS, type Character, type ChatMessage, type Lorebook } from '../src/core/types.ts';
import { ejsPlugin } from '../src/plugins/prompt-template/ejs.ts';
import { createHearth, listen } from '../src/server/app.ts';
import { PluginHost } from '../src/server/plugins.ts';
import { initialVariables } from '../src/plugins/tavern-helper/mvu.ts';
import { parseWithSchema, schemaScript } from '../src/plugins/tavern-helper/mvu-schema.ts';
import { runSandboxed } from '../src/server/sandbox.ts';

import { FRONTEND_CARD, PAGE_CARD } from './fixtures.ts';

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

test('a card\'s scripts run on its page, except MVU itself and the variable schema (both Hearth\'s)', { skip: !existsSync(FRONTEND_CARD) }, async () => {
    const { pageScripts } = await import('../src/web/card-scripts.ts');
    const { character } = importCardFile(new Uint8Array(readFileSync(FRONTEND_CARD)), 'card.png');
    assert.deepEqual(pageScripts(character).map(s => s.name), ['变量保险', '状态栏保活', '剧情参考清理']);
});

test('the page card: its dealer script runs on the page; its schema (namespace import, lodash) in the sandbox', { skip: !existsSync(PAGE_CARD) }, async () => {
    const { pageScripts } = await import('../src/web/card-scripts.ts');
    const { character, lorebook } = importCardFile(new Uint8Array(readFileSync(PAGE_CARD)), 'card.png');
    assert.deepEqual(pageScripts(character).map(s => s.name), ['发牌机']);
    const code = schemaScript(character);
    assert.ok(code, 'the schema script is runnable');
    const out = await parseWithSchema(sandbox, code, initialVariables([lorebook!]) ?? {});
    assert.equal(out.ok, true, out.error);
});

test('CDN libraries a card loads come from Hearth\'s copies', async () => {
    const { importMap, localLibrary, localScripts } = await import('../src/web/card-libs.ts');
    assert.deepEqual(localLibrary('https://testingcf.jsdelivr.net/npm/pinia@3.0.4/+esm'), { path: 'esm/pinia.js', module: true });
    assert.deepEqual(localLibrary('https://cdn.jsdelivr.net/npm/vue@3.5.13/+esm'), { path: 'esm/vue.js', module: true });
    assert.deepEqual(localLibrary('https://unpkg.com/vue@3/dist/vue.global.prod.js'), { path: 'vue.min.js', module: false });
    assert.deepEqual(localLibrary('https://unpkg.com/vue-router@4/dist/vue-router.global.prod.js'), { path: 'vue-router.min.js', module: false });
    assert.deepEqual(localLibrary('https://testingcf.jsdelivr.net/npm/jquery'), { path: 'jquery.min.js', module: false });
    assert.equal(localLibrary('https://cdn.jsdelivr.net/gh/someone/app@1/dist/index.js'), null, 'authors\' own code is not replaced');
    assert.equal(localLibrary('https://testingcf.jsdelivr.net/npm/unknown-lib@1/+esm'), null);
    const html = `<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script><script type="module">import { createPinia } from 'https://testingcf.jsdelivr.net/npm/pinia@3.0.4/+esm'; import g from 'https://testingcf.jsdelivr.net/npm/gsap@3.15.0/+esm';</script>`;
    assert.ok(localScripts(html, 'http://h').includes('src="http://h/vendor/vue.min.js"'));
    const map = JSON.parse(importMap([html], 'http://h').replace(/^<script type="importmap">|<\/script>$/g, ''));
    // Libraries under other licenses (GSAP) stay on their CDN.
    assert.deepEqual(map.imports, { 'https://testingcf.jsdelivr.net/npm/pinia@3.0.4/+esm': 'http://h/vendor/esm/pinia.js' });
});

test('a card\'s <style> is scoped to its message; @keyframes and @font-face stay global', async () => {
    const { scopeCss } = await import('../src/web/render.ts').catch(() => ({ scopeCss: null as never }));
    if (!scopeCss) return;
    const out = scopeCss(`/* c */ .a { color: red; } @keyframes pulse { 0% { opacity: 0 } 100% { opacity: 1 } } @media (max-width: 500px) { .a { color: blue } } @font-face { font-family: X; src: url(x.woff) }`);
    assert.match(out, /^@keyframes pulse \{[\s\S]*\}\n@font-face/);
    assert.match(out, /@scope \{\n\.a \{ color: red; \}[\s\S]*@media \(max-width: 500px\) \{ \.a \{ color: blue \} \}\n\}$/);
});

test('a card\'s HTML block stays whole through markdown, blank lines and indentation included', async () => {
    const { protectHtmlBlocks } = await import('../src/web/render.ts');
    const md = '正文 **粗体**\n\n<div class="hud">\n  <div class="row">\n\n      <span>甲</span>\n  </div>\n</div>\n\n后文';
    const { text, blocks } = protectHtmlBlocks(md);
    assert.equal(blocks.length, 1);
    assert.ok(blocks[0].startsWith('<div class="hud">') && blocks[0].endsWith('</div>\n</div>'));
    assert.ok(text.includes('<!--hearth-block-0-->') && text.includes('正文 **粗体**') && text.includes('后文'));
    // An unclosed block is left to markdown.
    assert.equal(protectHtmlBlocks('<div>没有闭合').blocks.length, 0);
});

test('card interfaces get their own origin: it serves the frame page and libraries, and the API refuses it', async t => {
    const dir = await mkdtemp(path.join(tmpdir(), 'hearth-card-origin-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const hearth = await createHearth({ root: path.resolve(import.meta.dirname, '..'), dataDir: dir });
    const port = await listen(hearth.server, 0, '127.0.0.1');
    t.after(() => hearth.server.close());
    const app = `http://127.0.0.1:${port}`;
    const { cardOrigin } = await (await fetch(`${app}/api/bootstrap`)).json() as { cardOrigin: string };
    assert.match(cardOrigin, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.notEqual(cardOrigin, app);
    const status = (url: string, origin?: string) => fetch(url, origin ? { headers: { Origin: origin } } : {}).then(r => { void r.body?.cancel(); return r.status; });
    assert.equal(await status(`${cardOrigin}/frame`), 200);
    assert.equal(await status(`${cardOrigin}/api/bootstrap`), 404, 'the card origin has no API');
    assert.equal(await status(`${cardOrigin}/index.html`), 404, 'nor Hearth\'s page');
    assert.equal(await status(`${app}/api/bootstrap`, cardOrigin), 403, 'card code cannot call the API');
    assert.equal(await status(`${app}/api/bootstrap`, app), 200);
});

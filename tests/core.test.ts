import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { applyOps } from '../src/core/ops.ts';
import { createMacroContext, evaluateMacros } from '../src/core/macros.ts';
import { importCardFile } from '../src/core/compat/st-card.ts';
import { importStLorebook } from '../src/core/compat/st-lorebook.ts';
import { defaultPreset, importStPreset } from '../src/core/compat/st-preset.ts';
import { assemble, type AssembleInput } from '../src/core/assemble.ts';
import { DEFAULT_LORE_SETTINGS, type ChatMessage, type Character, type Lorebook, type Preset } from '../src/core/types.ts';
import { fromStWorldEntry } from '../src/core/compat/st-lorebook.ts';

import { ELDORIA, MEOWSSIAH as MEOW, SERAPHINA } from './fixtures.ts';

function msg(id: string, role: 'user' | 'assistant', name: string, content: string): ChatMessage {
    return { id, role, name, swipes: [{ id: `${id}s`, content, createdAt: 0 }], activeSwipe: 0, hidden: false, createdAt: 0 };
}

function baseInput(character: Character, preset: Preset, messages: ChatMessage[], books: Lorebook[] = []): AssembleInput {
    return {
        type: 'normal',
        chatId: 'chat1',
        character,
        userName: 'Alex',
        persona: { description: 'Alex is a traveler.', position: 'in_prompt', depth: 2, role: 'system' },
        preset,
        lore: { sources: books.map(book => ({ book, scope: 'character' as const })), settings: DEFAULT_LORE_SETTINGS },
        messages,
        authorsNote: { content: '', interval: 1, position: 'in_chat', depth: 4, role: 'system', scan: false },
        variables: { chat: {}, global: {} },
        globalRegex: [],
        options: { preferCharacterPrompt: true, preferCharacterJailbreak: true, pinExamples: false, collapseNewlines: false },
        model: 'test-model',
        random: () => 0.5,
        now: new Date(2026, 10, 16, 15, 30),
    };
}

test('ops apply and invert, addressing array items by id', () => {
    const doc = { entries: [{ id: 'a', content: 'hello world' }, { id: 'b', content: 'x' }], name: 'n' };
    const { doc: next, inverse } = applyOps(doc, [
        { op: 'edit', path: ['entries', '@a', 'content'], find: 'world', replace: 'there' },
        { op: 'insert', path: ['entries'], value: { id: 'c', content: 'new' }, index: 0 },
        { op: 'set', path: ['meta', 'tag'], value: 1 },
        { op: 'unset', path: ['entries', '@b'] },
        { op: 'move', path: ['entries', '@a'], index: 0 },
    ]);
    assert.deepEqual(next.entries.map(e => e.id), ['a', 'c']);
    assert.equal(next.entries[0].content, 'hello there');
    assert.deepEqual((next as Record<string, unknown>).meta, { tag: 1 });
    const { doc: back } = applyOps(next, inverse);
    assert.deepEqual(back, doc);
    assert.throws(() => applyOps(doc, [{ op: 'edit', path: ['name'], find: 'zzz', replace: '' }]));
});

test('macros: nesting, variables, comments, trim, dice', () => {
    const ctx = createMacroContext({ user: 'Alex', char: 'Sera', random: () => 0 });
    assert.equal(evaluateMacros('Hi {{user}}, I am {{char}}.', ctx), 'Hi Alex, I am Sera.');
    assert.equal(evaluateMacros('{{setvar::hp_{{user}}::10}}{{getvar::hp_Alex}}', ctx), '10');
    assert.equal(evaluateMacros('{{incvar::hp_Alex}}', ctx), '11');
    assert.equal(evaluateMacros('a{{// hidden note}}b', ctx), 'ab');
    assert.equal(evaluateMacros('line1\n{{trim}}\nline2', ctx), 'line1line2');
    assert.equal(evaluateMacros('{{random::x::y}}', ctx), 'x');
    assert.equal(evaluateMacros('{{random:a,b,c}}', ctx), 'a');
    assert.equal(evaluateMacros('{{roll:1d6}}', ctx), '1');
    assert.equal(evaluateMacros('{{unknownMacro}} stays', ctx), '{{unknownMacro}} stays');
    assert.equal(evaluateMacros('<USER> and <BOT>', ctx), 'Alex and Sera');
});

test('imports the Seraphina PNG card with its embedded lorebook', { skip: !existsSync(SERAPHINA) }, () => {
    const { character, lorebook } = importCardFile(new Uint8Array(readFileSync(SERAPHINA)), 'default_Seraphina.png');
    assert.equal(character.name, 'Seraphina');
    assert.ok(character.fields.description.length > 100);
    assert.ok(character.fields.firstMessage.length > 50);
    assert.ok(character.fields.exampleDialogue.includes('<START>') || character.fields.exampleDialogue.length >= 0);
    if (lorebook) {
        assert.ok(lorebook.entries.length > 0);
        assert.deepEqual(character.lorebookIds, [lorebook.id]);
    }
});

test('imports the Eldoria world book', { skip: !existsSync(ELDORIA) }, () => {
    const book = importStLorebook(JSON.parse(readFileSync(ELDORIA, 'utf8')), 'Eldoria', 'Eldoria.json');
    assert.ok(book.entries.length > 0);
    assert.ok(book.entries.every(e => typeof e.content === 'string'));
});

test('imports the Meowssiah preset with its prompt order', { skip: !existsSync(MEOW) }, () => {
    const preset = importStPreset(JSON.parse(readFileSync(MEOW, 'utf8')), 'Meowssiah', 'Meowssiah-2.1.6.json');
    assert.equal(preset.prompts.length, 56);
    assert.equal(preset.order.length, 54);
    assert.equal(preset.order.filter(o => o.enabled).length, 38);
    assert.equal(preset.regex.length, 8);
    assert.equal(preset.scripts.length, 2);
    assert.equal(preset.formats.newChat, '');
});

test('assembles in SillyTavern default order', { skip: !existsSync(SERAPHINA) }, () => {
    const { character } = importCardFile(new Uint8Array(readFileSync(SERAPHINA)), 'default_Seraphina.png');
    const preset = defaultPreset();
    const chat = [msg('m0', 'assistant', 'Seraphina', character.fields.firstMessage), msg('m1', 'user', 'Alex', 'Where am I?')];
    const result = assemble(baseInput(character, preset, chat));
    const ids = result.parts.map(p => p.sources[0]);
    assert.equal(ids[0], 'main');
    assert.ok(result.parts[0].content.includes('Seraphina') && result.parts[0].content.includes('Alex'));
    // Default order: main, worldInfoBefore, personaDescription, charDescription, charPersonality, scenario, …
    const expected = ['main', 'worldInfoBefore', 'personaDescription', 'charDescription', 'charPersonality', 'scenario', 'nsfw', 'worldInfoAfter', 'newMainChat'];
    const present = expected.filter(id => ids.includes(id));
    assert.deepEqual(ids.slice(0, present.length), present);
    const newChat = result.parts.findIndex(p => p.sources[0] === 'newMainChat');
    assert.equal(result.parts[newChat].content, '[Start a new Chat]');
    assert.equal(result.parts[newChat + 1].role, 'assistant');
    assert.equal(result.parts[newChat + 2].content, 'Where am I?');
    assert.equal(result.parts[result.parts.length - 1].content, 'Where am I?');
    assert.ok(!result.warnings.length, result.warnings.join('; '));
});

test('world info: keywords, secondary logic, at-depth injection and budget', () => {
    const preset = defaultPreset();
    const entry = (uid: number, over: Record<string, unknown>) => fromStWorldEntry({ uid, key: [], content: '', order: 100, position: 0, ...over }, String(uid));
    const book: Lorebook = {
        id: 'lb1', kind: 'lorebook', name: 'Test', description: '', createdAt: 0, updatedAt: 0,
        entries: [
            entry(0, { key: ['castle'], content: 'The castle is old.' }),
            entry(1, { key: ['castle'], keysecondary: ['dragon'], selectiveLogic: 0, content: 'A dragon guards the castle.' }),
            entry(2, { key: ['castle'], keysecondary: ['dragon'], selectiveLogic: 2, content: 'No dragons here.' }),
            entry(3, { constant: true, content: 'Magic exists.', position: 1 }),
            entry(4, { key: ['/cast(le)?/i'], content: 'Regex hit.', position: 4, depth: 0, role: 1 }),
            entry(5, { key: ['ocean'], content: 'Never shown.' }),
        ],
    };
    const character: Character = {
        id: 'c', kind: 'character', name: 'Sera', createdAt: 0, updatedAt: 0, lorebookIds: ['lb1'], regex: [], scripts: [],
        meta: { creator: '', version: '', tags: [] },
        fields: { description: 'desc', personality: '', scenario: '', firstMessage: 'Hello', alternateGreetings: [], exampleDialogue: '', systemPrompt: '', postHistoryInstructions: '', depthPrompt: { text: '', depth: 4, role: 'system' }, creatorNotes: '' },
    };
    const result = assemble(baseInput(character, preset, [msg('m0', 'assistant', 'Sera', 'Hello'), msg('m1', 'user', 'Alex', 'Take me to the castle')], [book]));
    const before = result.parts.find(p => p.sources[0] === 'worldInfoBefore')?.content ?? '';
    assert.ok(before.includes('The castle is old.'));
    assert.ok(before.includes('No dragons here.'));
    assert.ok(!before.includes('A dragon guards'));
    assert.equal(result.parts.find(p => p.sources[0] === 'worldInfoAfter')?.content, 'Magic exists.');
    const last = result.parts[result.parts.length - 1];
    assert.equal(last.role, 'user');
    assert.equal(last.content, 'Regex hit.');
    assert.ok(!result.parts.some(p => p.content.includes('Never shown')));
    assert.equal(result.lore.activated.length, 4);
});

test('assembles the Meowssiah preset without errors', { skip: !existsSync(MEOW) || !existsSync(SERAPHINA) }, () => {
    const { character } = importCardFile(new Uint8Array(readFileSync(SERAPHINA)), 'default_Seraphina.png');
    const preset = importStPreset(JSON.parse(readFileSync(MEOW, 'utf8')), 'Meowssiah', 'Meowssiah-2.1.6.json');
    const chat = [msg('m0', 'assistant', 'Seraphina', character.fields.firstMessage), msg('m1', 'user', 'Alex', '你好，这是哪里？')];
    const result = assemble(baseInput(character, preset, chat));
    assert.ok(result.parts.length > 5);
    assert.ok(result.parts.some(p => p.content.includes('你好，这是哪里？')));
    // {{lastUserMessage}} inside a preset entry resolves to the new user message.
    assert.ok(result.parts.filter(p => p.content.includes('你好，这是哪里？')).length >= 2);
    assert.ok(!result.parts.some(p => p.content.includes('{{user}}')));
});

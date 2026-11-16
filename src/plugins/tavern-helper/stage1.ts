// Runs a preset's own SPreset request script ("Stage 1", `extensions.SPreset.FinalRequestProcessing`)
// in the QuickJS sandbox. In SillyTavern it runs in the page with full access; here it gets a small
// SillyTavern-shaped environment built from the chat — context, chat metadata, 酒馆助手 variables,
// localStorage — and its changes to those are handed back. It has no network or page access.

import type { Preset } from '../../core/types.ts';
import type { PluginApi } from '../../server/plugins.ts';
import { spresetConfig } from './spreset.ts';

export interface Stage1Input {
    request: Record<string, unknown>;
    chatId: string;
    names: { user: string; char: string };
    /** The chat in SillyTavern's message shape. */
    chat: { name: string; is_user: boolean; is_system: boolean; mes: string; extra: Record<string, unknown> }[];
    chatMetadata: Record<string, unknown>;
    vars: { chat: Record<string, unknown>; message: Record<string, unknown>; global: Record<string, unknown>; preset: Record<string, unknown> };
    /** Values the script keeps on `window` between requests (in SillyTavern they live as long as the page). */
    windowState: Record<string, unknown>;
    localStorage: Record<string, string>;
}

export type Stage1Output = Pick<Stage1Input, 'request' | 'chatMetadata' | 'vars' | 'windowState' | 'localStorage'>;

export function stage1Script(preset: Preset): string | null {
    const frp = spresetConfig(preset)?.FinalRequestProcessing;
    return frp?.enabled && typeof frp.script === 'string' && frp.script.trim() ? frp.script : null;
}

// The environment, evaluated inside the sandbox. `__in` is the Stage1Input as JSON.
const PRELUDE = `
const __clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const __merge = (a, b) => { const out = __clone(a ?? {}); for (const [k, v] of Object.entries(b ?? {})) out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]) ? __merge(out[k], v) : __clone(v); return out; };
const __store = Object.assign({}, __in.localStorage);
const localStorage = {
  getItem: k => (Object.prototype.hasOwnProperty.call(__store, k) ? __store[k] : null),
  setItem: (k, v) => { __store[k] = String(v); },
  removeItem: k => { delete __store[k]; },
  clear: () => { for (const k of Object.keys(__store)) delete __store[k]; },
  key: i => Object.keys(__store)[i] ?? null,
  get length() { return Object.keys(__store).length; },
};
const __vars = { chat: __in.vars.chat ?? {}, message: __in.vars.message ?? {}, global: __in.vars.global ?? {}, preset: __in.vars.preset ?? {}, character: {}, script: {}, extension: {} };
const __type = o => (o && typeof o.type === 'string' && __vars[o.type] ? o.type : 'chat');
const getVariables = (o = {}) => __clone(__vars[__type(o)]);
const replaceVariables = (v, o = {}) => { __vars[__type(o)] = __clone(v ?? {}); };
const insertOrAssignVariables = (v, o = {}) => { const t = __type(o); __vars[t] = __merge(__vars[t], v); return __clone(__vars[t]); };
const insertVariables = insertOrAssignVariables;
const deleteVariable = (path, o = {}) => { const t = __type(o); const segs = String(path).split('.'); let c = __vars[t]; for (const s of segs.slice(0, -1)) { if (c == null) return { variables: __clone(__vars[t]), delete_occurred: false }; c = c[s]; } const had = c != null && Object.prototype.hasOwnProperty.call(c, segs[segs.length - 1]); if (had) delete c[segs[segs.length - 1]]; return { variables: __clone(__vars[t]), delete_occurred: had }; };
const updateVariablesWith = (fn, o = {}) => { const t = __type(o); const r = fn(__clone(__vars[t])); const apply = v => { if (v && typeof v === 'object') __vars[t] = __clone(v); return __clone(__vars[t]); }; return r && typeof r.then === 'function' ? r.then(apply) : apply(r); };
const __noop = () => {};
const eventSource = { on: __noop, once: __noop, makeFirst: __noop, makeLast: __noop, removeListener: __noop, emit: async () => {} };
const __ctx = {
  chat: __in.chat, chatMetadata: __in.chatMetadata ?? {}, chatId: __in.chatId, getCurrentChatId: () => __in.chatId,
  name1: __in.names.user, name2: __in.names.char, characterId: 0, characters: [], groupId: null,
  extensionSettings: {}, extensionPrompts: {}, chatCompletionSettings: {}, powerUserSettings: {},
  eventSource, eventTypes: {}, event_types: {},
  saveMetadataDebounced: __noop, saveMetadata: async () => {}, saveSettingsDebounced: __noop,
};
const SillyTavern = Object.assign({ getContext: () => __ctx }, __ctx);
const __window = Object.assign({}, __in.windowState, {
  localStorage, SillyTavern, eventSource,
  getVariables, replaceVariables, insertOrAssignVariables, insertVariables, deleteVariable, updateVariablesWith,
  CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
  Event: class Event { constructor(type) { this.type = type; } },
  dispatchEvent: () => true, addEventListener: __noop, removeEventListener: __noop,
  setTimeout: (f) => { Promise.resolve().then(f); return 0; }, clearTimeout: __noop,
  console: { log: __noop, warn: __noop, error: __noop, info: __noop, debug: __noop },
});
__window.window = __window; __window.top = __window; __window.parent = __window; __window.self = __window; __window.globalThis = __window;
const window = __window, top = __window, parent = __window, self = __window;
const TavernHelper = { getVariables, replaceVariables, insertOrAssignVariables, insertVariables, deleteVariable, updateVariablesWith };
const console = __window.console;
const setTimeout = __window.setTimeout, clearTimeout = __noop;
const structuredClone = __clone;
const __windowKeys = new Set(Object.keys(__window));
`;

const EPILOGUE = `
.then(out => {
  const state = {};
  for (const [k, v] of Object.entries(__window)) {
    if (__windowKeys.has(k) && !Object.prototype.hasOwnProperty.call(__in.windowState, k)) continue;
    if (k.startsWith('__') || Object.prototype.hasOwnProperty.call(__in.windowState, k)) { try { state[k] = __clone(v); } catch {} }
  }
  return { request: out && typeof out === 'object' ? out : __in.request, chatMetadata: __ctx.chatMetadata, vars: { chat: __vars.chat, message: __vars.message, global: __vars.global, preset: __vars.preset }, windowState: state, localStorage: __store };
})`;

export async function runStage1(api: PluginApi, script: string, input: Stage1Input, timeoutMs = 8000): Promise<Stage1Output> {
    const code = `(() => { const __in = ${JSON.stringify(input)};\n${PRELUDE}\nreturn Promise.resolve((${script})({ request: __clone(__in.request) }))${EPILOGUE}; })()`;
    const out = await api.sandbox.run(code, () => undefined, timeoutMs) as Stage1Output | null;
    if (!out || typeof out !== 'object' || !out.request) throw new Error('预设的请求脚本没有返回请求');
    return out;
}

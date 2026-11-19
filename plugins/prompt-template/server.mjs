// src/core/state.ts
function toPath(path) {
  if (Array.isArray(path)) return path.map(String);
  const p = path.trim();
  if (p.startsWith("/")) {
    return p.slice(1).split("/").map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  }
  const out = [];
  for (const part of p.split(".")) {
    const m = part.match(/^([^[\]]*)((?:\[[^\]]*\])*)$/);
    if (!m) {
      out.push(part);
      continue;
    }
    if (m[1]) out.push(m[1]);
    for (const idx of m[2].matchAll(/\[([^\]]*)\]/g)) out.push(idx[1].replace(/^["']|["']$/g, ""));
  }
  return out.filter((s) => s !== "");
}
function getPath(obj, path, fallback) {
  let cur = obj;
  for (const seg of toPath(path)) {
    if (cur === null || typeof cur !== "object") return fallback;
    cur = cur[seg];
  }
  return cur === void 0 ? fallback : cur;
}
function setPath(obj, path, value) {
  const segs = toPath(path);
  let cur = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    const next = cur[segs[i]];
    if (next === null || typeof next !== "object") {
      cur[segs[i]] = /^\d+$/.test(segs[i + 1]) ? [] : {};
    }
    cur = cur[segs[i]];
  }
  if (segs.length) cur[segs[segs.length - 1]] = value;
}
function stateAt(messages, index = messages.length - 1) {
  for (let i = Math.min(index, messages.length - 1); i >= 0; i--) {
    const m = messages[i];
    const state = m.swipes[m.activeSwipe]?.state;
    if (state) return state;
  }
  return void 0;
}

// src/core/tokens.ts
var CJK = /[　-〿぀-ヿ㐀-䶿一-鿿가-힯豈-﫿＀-￯]/g;
function estimateTokens(text) {
  if (!text) {
    return 0;
  }
  const cjk = text.match(CJK)?.length ?? 0;
  const rest = text.length - cjk;
  return Math.ceil(cjk + rest / 3.6);
}
var MESSAGE_OVERHEAD = 4;

// src/plugins/prompt-template/ejs.ts
function compileEjs(src) {
  const tokens = src.split(/(<%%|%%>|<%_|<%=|<%-|<%#|<%|_%>|-%>|%>)/);
  let code = "";
  let text = "";
  let inner = "";
  let mode = "";
  let trim = "";
  const flush = () => {
    if (text) code += `__append(${JSON.stringify(text)});
`;
    text = "";
  };
  for (const tok of tokens) {
    if (!tok) continue;
    if (!mode) {
      if (tok === "<%%") {
        text += "<%";
        continue;
      }
      if (tok === "%%>") {
        text += "%>";
        continue;
      }
      if (tok.startsWith("<%")) {
        if (tok === "<%_") text = text.replace(/[ \t]*$/, "");
        flush();
        mode = tok === "<%=" || tok === "<%-" ? "out" : tok === "<%#" ? "comment" : "code";
        inner = "";
        continue;
      }
      let t = tok;
      if (trim === "newline") t = t.replace(/^\r?\n/, "");
      if (trim === "slurp") t = t.replace(/^[ \t]*\r?\n?/, "");
      trim = "";
      text += t;
      continue;
    }
    if (tok === "%>" || tok === "-%>" || tok === "_%>") {
      if (mode === "code") code += `${inner}
`;
      else if (mode === "out") code += `__append(${inner});
`;
      mode = "";
      trim = tok === "-%>" ? "newline" : tok === "_%>" ? "slurp" : "";
      continue;
    }
    inner += tok === "%%>" ? "%>" : tok;
  }
  flush();
  return code;
}
var PRELUDE = `
const __call = (n, ...a) => { const r = __host(n, JSON.stringify(a)); return r === undefined ? undefined : JSON.parse(r); };
const variables = __call('variables') ?? {};
const __get = (o, p, d) => { const segs = Array.isArray(p) ? p : String(p).replace(/\\[(\\w+)\\]/g, '.$1').split('.').filter(Boolean); let c = o; for (const s of segs) { if (c == null) return d; c = c[s]; } return c === undefined ? d : c; };
const _ = { get: __get, has: (o, p) => __get(o, p) !== undefined, isEmpty: v => v == null || (typeof v === 'object' ? Object.keys(v).length === 0 : String(v).length === 0), isNil: v => v == null, clone: v => JSON.parse(JSON.stringify(v)), cloneDeep: v => JSON.parse(JSON.stringify(v)) };
const getvar = (path, opts) => __call('getvar', path, opts ?? {});
const getVar = getvar;
const setvar = (path, value, opts) => __call('setvar', path, value, opts ?? {});
const setVar = setvar;
const incvar = (path, n = 1, opts) => __call('incvar', path, n, opts ?? {});
const decvar = (path, n = 1, opts) => __call('incvar', path, -n, opts ?? {});
const getwi = async (book, title) => __call('getwi', title === undefined ? null : book, title === undefined ? book : title);
const getWorldInfo = getwi;
const getchar = async () => __call('getchar');
const getChara = getchar;
const console = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
`;
function hostFor(env) {
  const merged = () => ({ ...env.vars.global, ...env.vars.chat, ...env.vars.message });
  return (name, args) => {
    switch (name) {
      case "variables":
        return merged();
      case "getvar": {
        const [path, opts] = args;
        const scope = opts?.scope === "global" ? env.vars.global : opts?.scope === "chat" ? env.vars.chat : opts?.scope === "message" ? env.vars.message : merged();
        return getPath(scope, String(path), opts?.defaults);
      }
      case "setvar": {
        const [path, value, opts] = args;
        setPath(opts?.scope === "global" ? env.vars.global : opts?.scope === "message" ? env.vars.message : env.vars.chat, String(path), value);
        return value;
      }
      case "incvar": {
        const [path, n] = args;
        const next = Number(getPath(merged(), String(path), 0)) + Number(n);
        setPath(env.vars.chat, String(path), next);
        return next;
      }
      case "getwi": {
        const [book, title] = args;
        const books = book ? env.books.filter((b) => b.name === book) : env.books;
        for (const b of books) {
          const entry = b.entries.find((e) => e.title === String(title) || e.id === String(title));
          if (entry) return env.macros(entry.content);
        }
        return "";
      }
      case "getchar":
        return env.character;
      default:
        return void 0;
    }
  };
}
var templateFunction = (template) => `async () => { let __out = ''; const __append = v => { __out += v === undefined || v === null ? '' : String(v); }; const print = (...a) => a.forEach(__append);
${compileEjs(template)}
return __out; }`;
async function renderEjs(template, env, depth = 0) {
  const code = `${PRELUDE}
(${templateFunction(template)})()`;
  const output = String(await env.run(code, hostFor(env)) ?? "");
  if (depth < 3 && output.includes("<%")) {
    return renderEjs(output, env, depth + 1);
  }
  return output;
}
async function renderEjsMany(templates, env) {
  const code = `${PRELUDE}
(async () => { const outs = []; for (const f of [${templates.map(templateFunction).join(",\n")}]) { try { outs.push(await f()); } catch (e) { outs.push(null); } } return outs; })()`;
  try {
    const outs = await env.run(code, hostFor(env), 5e3);
    if (Array.isArray(outs) && outs.length === templates.length) return outs.map((o) => o === null ? null : String(o));
  } catch {
  }
  return Promise.all(templates.map((t) => renderEjs(t, env).catch(() => null)));
}
function preprocessingTemplate(entry) {
  if (!entry.enabled || !entry.content.includes("<%")) return null;
  const lines = entry.content.split("\n");
  const decorators = [];
  let marked = /\[preprocessing\]/i.test(entry.title);
  let i = 0;
  for (; i < lines.length && lines[i].startsWith("@@") && !lines[i].startsWith("@@@"); i++) {
    if (lines[i].trim() === "@@preprocessing") marked = true;
    else decorators.push(lines[i]);
  }
  return marked ? { template: lines.slice(i).join("\n"), decorators } : null;
}
var ejsPlugin = {
  setup(api) {
    const envs = /* @__PURE__ */ new WeakMap();
    const envFor = (input) => {
      let env = envs.get(input);
      if (env) return env;
      const macroCtx = api.macros.context({ user: input.userName, char: input.character.name, seed: input.chatId });
      env = {
        vars: {
          global: structuredClone(input.variables.global),
          chat: structuredClone(input.variables.chat),
          message: structuredClone(stateAt(input.messages) ?? {})
        },
        books: input.lore.sources.map((s) => s.book),
        character: {
          name: input.character.name,
          description: input.character.fields.description,
          personality: input.character.fields.personality,
          scenario: input.character.fields.scenario
        },
        macros: (text) => api.macros.evaluate(text, macroCtx),
        run: api.sandbox.run
      };
      envs.set(input, env);
      return env;
    };
    api.onBeforeAssemble(async (ctx) => {
      const input = ctx.input;
      const targets = [];
      for (const { book } of input.lore.sources) {
        for (const entry of book.entries) {
          const t = preprocessingTemplate(entry);
          if (t) targets.push({ book, entry, ...t });
        }
      }
      if (!targets.length) return;
      const outs = await renderEjsMany(targets.map((t) => t.template), envFor(input));
      const rendered = /* @__PURE__ */ new Map();
      targets.forEach((t, i) => {
        const out = outs[i];
        if (out !== null) rendered.set(t.entry, [...t.decorators, out].join("\n"));
      });
      input.lore.sources = input.lore.sources.map((source) => source.book.entries.some((e) => rendered.has(e)) ? { ...source, book: { ...source.book, entries: source.book.entries.map((e) => rendered.has(e) ? { ...e, content: rendered.get(e) } : e) } } : source);
    });
    api.onAfterAssemble(async (result, ctx) => {
      if (!result.parts.some((p) => p.content.includes("<%"))) return;
      const env = envFor(ctx.input);
      let failed = false;
      for (const part of result.parts) {
        if (!part.content.includes("<%")) continue;
        try {
          part.content = (await renderEjs(part.content, env)).replace(/\n{3,}/g, "\n\n").trim();
        } catch (error) {
          failed = true;
          result.warnings.push(`EJS \u6A21\u677F\u6267\u884C\u5931\u8D25\uFF08${part.sources[0]}\uFF09\uFF1A${error.message}\u3002\u8BE5\u6BB5\u6A21\u677F\u5DF2\u7701\u7565\u3002`);
          part.content = part.content.replace(/<%[\s\S]*?%>/g, "").trim();
        }
        part.tokens = estimateTokens(part.content) + MESSAGE_OVERHEAD;
      }
      result.parts = result.parts.filter((p) => p.content);
      result.messages = result.parts.map((p) => ({ role: p.role, content: p.content, ...p.name ? { name: p.name } : {} }));
      result.tokens.total = result.parts.reduce((s, p) => s + p.tokens, 0);
      if (!failed) result.warnings = result.warnings.filter((w) => !w.includes("<%"));
    });
  }
};

// src/plugins/prompt-template/index.ts
var index_default = ejsPlugin;
export {
  index_default as default
};

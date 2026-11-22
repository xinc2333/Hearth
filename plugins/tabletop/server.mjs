var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "node_modules/yaml/dist/nodes/identity.js"(exports) {
    "use strict";
    var ALIAS = Symbol.for("yaml.alias");
    var DOC = Symbol.for("yaml.document");
    var MAP = Symbol.for("yaml.map");
    var PAIR = Symbol.for("yaml.pair");
    var SCALAR = Symbol.for("yaml.scalar");
    var SEQ = Symbol.for("yaml.seq");
    var NODE_TYPE = Symbol.for("yaml.node.type");
    var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
    var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
    var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
    var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
    var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
    var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
    function isCollection(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
    exports.ALIAS = ALIAS;
    exports.DOC = DOC;
    exports.MAP = MAP;
    exports.NODE_TYPE = NODE_TYPE;
    exports.PAIR = PAIR;
    exports.SCALAR = SCALAR;
    exports.SEQ = SEQ;
    exports.hasAnchor = hasAnchor;
    exports.isAlias = isAlias;
    exports.isCollection = isCollection;
    exports.isDocument = isDocument;
    exports.isMap = isMap;
    exports.isNode = isNode;
    exports.isPair = isPair;
    exports.isScalar = isScalar;
    exports.isSeq = isSeq;
  }
});

// node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "node_modules/yaml/dist/visit.js"(exports) {
    "use strict";
    var identity = require_identity();
    var BREAK = Symbol("break visit");
    var SKIP = Symbol("skip children");
    var REMOVE = Symbol("remove node");
    function visit(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        visit_(null, node, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    function visit_(key, node, visitor, path2) {
      const ctrl = callVisitor(key, node, visitor, path2);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path2, ctrl);
        return visit_(key, ctrl, visitor, path2);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path2 = Object.freeze(path2.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = visit_(i, node.items[i], visitor, path2);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path2 = Object.freeze(path2.concat(node));
          const ck = visit_("key", node.key, visitor, path2);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = visit_("value", node.value, visitor, path2);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key, node, visitor, path2) {
      const ctrl = await callVisitor(key, node, visitor, path2);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path2, ctrl);
        return visitAsync_(key, ctrl, visitor, path2);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path2 = Object.freeze(path2.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = await visitAsync_(i, node.items[i], visitor, path2);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path2 = Object.freeze(path2.concat(node));
          const ck = await visitAsync_("key", node.key, visitor, path2);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = await visitAsync_("value", node.value, visitor, path2);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
          Alias: visitor.Node,
          Map: visitor.Node,
          Scalar: visitor.Node,
          Seq: visitor.Node
        }, visitor.Value && {
          Map: visitor.Value,
          Scalar: visitor.Value,
          Seq: visitor.Value
        }, visitor.Collection && {
          Map: visitor.Collection,
          Seq: visitor.Collection
        }, visitor);
      }
      return visitor;
    }
    function callVisitor(key, node, visitor, path2) {
      if (typeof visitor === "function")
        return visitor(key, node, path2);
      if (identity.isMap(node))
        return visitor.Map?.(key, node, path2);
      if (identity.isSeq(node))
        return visitor.Seq?.(key, node, path2);
      if (identity.isPair(node))
        return visitor.Pair?.(key, node, path2);
      if (identity.isScalar(node))
        return visitor.Scalar?.(key, node, path2);
      if (identity.isAlias(node))
        return visitor.Alias?.(key, node, path2);
      return void 0;
    }
    function replaceNode(key, path2, node) {
      const parent = path2[path2.length - 1];
      if (identity.isCollection(parent)) {
        parent.items[key] = node;
      } else if (identity.isPair(parent)) {
        if (key === "key")
          parent.key = node;
        else
          parent.value = node;
      } else if (identity.isDocument(parent)) {
        parent.contents = node;
      } else {
        const pt = identity.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports.visit = visit;
    exports.visitAsync = visitAsync;
  }
});

// node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "node_modules/yaml/dist/doc/directives.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    var escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy = new _Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = true;
            break;
          case "1.2":
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line2, onError) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line2.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2) {
              onError(0, "%TAG directive should contain exactly two parts");
              if (parts.length < 2)
                return false;
            }
            const [handle, prefix] = parts;
            this.tags[handle] = prefix;
            return true;
          }
          case "%YAML": {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError(0, "%YAML directive should contain exactly one part");
              return false;
            }
            const [version] = parts;
            if (version === "1.1" || version === "1.2") {
              this.yaml.version = version;
              return true;
            } else {
              const isValid = /^\d+\.\d+$/.test(version);
              onError(6, `Unsupported YAML version ${version}`, isValid);
              return false;
            }
          }
          default:
            onError(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === "!")
          return "!";
        if (source[0] !== "!") {
          onError(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === "<") {
          const verbatim = source.slice(2, -1);
          if (verbatim === "!" || verbatim === "!!") {
            onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== ">")
            onError("Verbatim tags must end with a >");
          return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
          onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError(String(error));
            return null;
          }
        }
        if (handle === "!")
          return source;
        onError(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
          if (tag.startsWith(prefix))
            return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === "!" ? tag : `!<${tag}>`;
      }
      toString(doc) {
        const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node) => {
            if (identity.isNode(node) && node.tag)
              tags[node.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (const [handle, prefix] of tagEntries) {
          if (handle === "!!" && prefix === "tag:yaml.org,2002:")
            continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
            lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join("\n");
      }
    };
    Directives.defaultYaml = { explicit: false, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports.Directives = Directives;
  }
});

// node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "node_modules/yaml/dist/doc/anchors.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node) {
          if (node.anchor)
            anchors.add(node.anchor);
        }
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          if (!prevAnchors)
            prevAnchors = anchorNames(doc);
          const anchor = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor);
          return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error("Failed to resolve repeated object (this should not happen)");
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects
      };
    }
    exports.anchorIsValid = anchorIsValid;
    exports.anchorNames = anchorNames;
    exports.createNodeAnchors = createNodeAnchors;
    exports.findNewAnchor = findNewAnchor;
  }
});

// node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "node_modules/yaml/dist/doc/applyReviver.js"(exports) {
    "use strict";
    function applyReviver(reviver, obj, key, val) {
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (let i = 0, len = val.length; i < len; ++i) {
            const v0 = val[i];
            const v1 = applyReviver(reviver, val, String(i), v0);
            if (v1 === void 0)
              delete val[i];
            else if (v1 !== v0)
              val[i] = v1;
          }
        } else if (val instanceof Map) {
          for (const k of Array.from(val.keys())) {
            const v0 = val.get(k);
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              val.delete(k);
            else if (v1 !== v0)
              val.set(k, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0)
              val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              delete val[k];
            else if (v1 !== v0)
              val[k] = v1;
          }
        }
      }
      return reviver.call(obj, key, val);
    }
    exports.applyReviver = applyReviver;
  }
});

// node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "node_modules/yaml/dist/nodes/toJS.js"(exports) {
    "use strict";
    var identity = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
      if (value && typeof value.toJSON === "function") {
        if (!ctx || !identity.hasAnchor(value))
          return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data);
        ctx.onCreate = (res2) => {
          data.res = res2;
          delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
          ctx.onCreate(res);
        return res;
      }
      if (typeof value === "bigint" && !ctx?.keep)
        return Number(value);
      return value;
    }
    exports.toJS = toJS;
  }
});

// node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "node_modules/yaml/dist/nodes/Node.js"(exports) {
    "use strict";
    var applyReviver = require_applyReviver();
    var identity = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
          throw new TypeError("A document argument is required");
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
    };
    exports.NodeBase = NodeBase;
  }
});

// node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "node_modules/yaml/dist/nodes/Alias.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var visit = require_visit();
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc) {
        let found = void 0;
        visit.visit(doc, {
          Node: (_key, node) => {
            if (node === this)
              return visit.visit.BREAK;
            if (node.anchor === this.source)
              found = node;
          }
        });
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        const { anchors: anchors2, doc, maxAliasCount } = ctx;
        const source = this.resolve(doc);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        let data = anchors2.get(source);
        if (!data) {
          toJS.toJS(source, null, ctx);
          data = anchors2.get(source);
        }
        if (!data || data.res === void 0) {
          const msg = "This should not happen: Alias anchor was not resolved?";
          throw new ReferenceError(msg);
        }
        if (maxAliasCount >= 0) {
          data.count += 1;
          if (data.aliasCount === 0)
            data.aliasCount = getAliasCount(doc, source, anchors2);
          if (data.count * data.aliasCount > maxAliasCount) {
            const msg = "Excessive alias count indicates a resource exhaustion attack";
            throw new ReferenceError(msg);
          }
        }
        return data.res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
          const c = getAliasCount(doc, item, anchors2);
          if (c > count)
            count = c;
        }
        return count;
      } else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors2);
        const vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports.Alias = Alias;
  }
});

// node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "node_modules/yaml/dist/nodes/Scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
    var Scalar = class extends Node.NodeBase {
      constructor(value) {
        super(identity.SCALAR);
        this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar.PLAIN = "PLAIN";
    Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports.Scalar = Scalar;
    exports.isScalarValue = isScalarValue;
  }
});

// node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "node_modules/yaml/dist/doc/createNode.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t) => t.tag === tagName);
        const tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value) && !t.format);
    }
    function createNode(value, tagName, ctx) {
      if (identity.isDocument(value))
        value = value.contents;
      if (identity.isNode(value))
        return value;
      if (identity.isPair(value)) {
        const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
      }
      if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
        value = value.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value && typeof value === "object") {
        ref = sourceObjects.get(value);
        if (ref) {
          if (!ref.anchor)
            ref.anchor = onAnchor(value);
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value, ref);
        }
      }
      if (tagName?.startsWith("!!"))
        tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value, tagName, schema.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON === "function") {
          value = value.toJSON();
        }
        if (!value || typeof value !== "object") {
          const node2 = new Scalar.Scalar(value);
          if (ref)
            ref.node = node2;
          return node2;
        }
        tagObj = value instanceof Map ? schema[identity.MAP] : Symbol.iterator in Object(value) ? schema[identity.SEQ] : schema[identity.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
      if (tagName)
        node.tag = tagName;
      else if (!tagObj.default)
        node.tag = tagObj.tag;
      if (ref)
        ref.node = node;
      return node;
    }
    exports.createNode = createNode;
  }
});

// node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "node_modules/yaml/dist/nodes/Collection.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var identity = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema, path2, value) {
      let v = value;
      for (let i = path2.length - 1; i >= 0; --i) {
        const k = path2[i];
        if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
          const a = [];
          a[k] = v;
          v = a;
        } else {
          v = /* @__PURE__ */ new Map([[k, v]]);
        }
      }
      return createNode.createNode(v, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path2) => path2 == null || typeof path2 === "object" && !!path2[Symbol.iterator]().next().done;
    var Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type);
        Object.defineProperty(this, "schema", {
          value: schema,
          configurable: true,
          enumerable: false,
          writable: true
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
          copy.schema = schema;
        copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path2, value) {
        if (isEmptyPath(path2))
          this.add(value);
        else {
          const [key, ...rest] = path2;
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.addIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path2) {
        const [key, ...rest] = path2;
        if (rest.length === 0)
          return this.delete(key);
        const node = this.get(key, true);
        if (identity.isCollection(node))
          return node.deleteIn(rest);
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path2, keepScalar) {
        const [key, ...rest] = path2;
        const node = this.get(key, true);
        if (rest.length === 0)
          return !keepScalar && identity.isScalar(node) ? node.value : node;
        else
          return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity.isPair(node))
            return false;
          const n = node.value;
          return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path2) {
        const [key, ...rest] = path2;
        if (rest.length === 0)
          return this.has(key);
        const node = this.get(key, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path2, value) {
        const [key, ...rest] = path2;
        if (rest.length === 0) {
          this.set(key, value);
        } else {
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.setIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
    };
    exports.Collection = Collection;
    exports.collectionFromPath = collectionFromPath;
    exports.isEmptyPath = isEmptyPath;
  }
});

// node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyComment.js"(exports) {
    "use strict";
    var stringifyComment = (str7) => str7.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent) {
      if (/^\n+$/.test(comment))
        return comment.substring(1);
      return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
    }
    var lineComment = (str7, indent, comment) => str7.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str7.endsWith(" ") ? "" : " ") + comment;
    exports.indentComment = indentComment;
    exports.lineComment = lineComment;
    exports.stringifyComment = stringifyComment;
  }
});

// node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "node_modules/yaml/dist/stringify/foldFlowLines.js"(exports) {
    "use strict";
    var FOLD_FLOW = "flow";
    var FOLD_BLOCK = "block";
    var FOLD_QUOTED = "quoted";
    function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text;
      if (lineWidth < minContentWidth)
        minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
      if (text.length <= endStep)
        return text;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent.length;
      if (typeof indentAtStart === "number") {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
          folds.push(0);
        else
          end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text, i, indent.length);
        if (i !== -1)
          end = i + endStep;
      }
      for (let ch; ch = text[i += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          escStart = i;
          switch (text[i + 1]) {
            case "x":
              i += 3;
              break;
            case "u":
              i += 5;
              break;
            case "U":
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === "\n") {
          if (mode === FOLD_BLOCK)
            i = consumeMoreIndentedLines(text, i, indent.length);
          end = i + indent.length + endStep;
          split = void 0;
        } else {
          if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
            const next = text[i + 1];
            if (next && next !== " " && next !== "\n" && next !== "	")
              split = i;
          }
          if (i >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === " " || prev === "	") {
                prev = ch;
                ch = text[i += 1];
                overflow = true;
              }
              const j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j])
                return text;
              folds.push(j);
              escapedFolds[j] = true;
              end = j + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow)
        onOverflow();
      if (folds.length === 0)
        return text;
      if (onFold)
        onFold();
      let res = text.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        const fold = folds[i2];
        const end2 = folds[i2 + 1] || text.length;
        if (fold === 0)
          res = `
${indent}${text.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold])
            res += `${text[fold]}\\`;
          res += `
${indent}${text.slice(fold + 1, end2)}`;
        }
      }
      return res;
    }
    function consumeMoreIndentedLines(text, i, indent) {
      let end = i;
      let start = i + 1;
      let ch = text[start];
      while (ch === " " || ch === "	") {
        if (i < start + indent) {
          ch = text[++i];
        } else {
          do {
            ch = text[++i];
          } while (ch && ch !== "\n");
          end = i;
          start = i + 1;
          ch = text[start];
        }
      }
      return end;
    }
    exports.FOLD_BLOCK = FOLD_BLOCK;
    exports.FOLD_FLOW = FOLD_FLOW;
    exports.FOLD_QUOTED = FOLD_QUOTED;
    exports.foldFlowLines = foldFlowLines;
  }
});

// node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyString.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    });
    var containsDocumentMarker = (str7) => /^(%|---|\.\.\.)/m.test(str7);
    function lineLengthOverLimit(str7, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return false;
      const limit = lineWidth - indentLength;
      const strLen = str7.length;
      if (strLen <= limit)
        return false;
      for (let i = 0, start = 0; i < strLen; ++i) {
        if (str7[i] === "\n") {
          if (i - start > limit)
            return true;
          start = i + 1;
          if (strLen - start <= limit)
            return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value, ctx) {
      const json = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      let str7 = "";
      let start = 0;
      for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
          str7 += json.slice(start, i) + "\\ ";
          i += 1;
          start = i;
          ch = "\\";
        }
        if (ch === "\\")
          switch (json[i + 1]) {
            case "u":
              {
                str7 += json.slice(start, i);
                const code = json.substr(i + 2, 4);
                switch (code) {
                  case "0000":
                    str7 += "\\0";
                    break;
                  case "0007":
                    str7 += "\\a";
                    break;
                  case "000b":
                    str7 += "\\v";
                    break;
                  case "001b":
                    str7 += "\\e";
                    break;
                  case "0085":
                    str7 += "\\N";
                    break;
                  case "00a0":
                    str7 += "\\_";
                    break;
                  case "2028":
                    str7 += "\\L";
                    break;
                  case "2029":
                    str7 += "\\P";
                    break;
                  default:
                    if (code.substr(0, 2) === "00")
                      str7 += "\\x" + code.substr(2);
                    else
                      str7 += json.substr(i, 6);
                }
                i += 5;
                start = i + 1;
              }
              break;
            case "n":
              if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
                i += 1;
              } else {
                str7 += json.slice(start, i) + "\n\n";
                while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                  str7 += "\n";
                  i += 2;
                }
                str7 += indent;
                if (json[i + 2] === " ")
                  str7 += "\\";
                i += 1;
                start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      }
      str7 = start ? str7 + json.slice(start) : json;
      return implicitKey ? str7 : foldFlowLines.foldFlowLines(str7, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
      return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false)
        qs = doubleQuotedString;
      else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
          qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
          qs = doubleQuotedString;
        else
          qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value) || /^\s*$/.test(value)) {
        return quotedString(value, ctx);
      }
      const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
      const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
      if (!value)
        return literal ? "|\n" : ">\n";
      let chomp;
      let endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== "\n" && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart);
      const endNlPos = end.indexOf("\n");
      if (endNlPos === -1) {
        chomp = "-";
      } else if (value === end || endNlPos !== end.length - 1) {
        chomp = "+";
        if (onChompKeep)
          onChompKeep();
      } else {
        chomp = "";
      }
      if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === "\n")
          end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === " ")
          startWithSpace = true;
        else if (ch === "\n")
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
      }
      const indentSize = indent ? "2" : "1";
      let header = (startWithSpace ? indentSize : "") + chomp;
      if (comment) {
        header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
        if (onComment)
          onComment();
      }
      if (!literal) {
        const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header}
${indent}${body}`;
      }
      value = value.replace(/\n+/g, `$&${indent}`);
      return `|${header}
${indent}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value } = item;
      const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
        return quotedString(value, ctx);
      }
      if (!value || /^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value)) {
        if (indent === "") {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent === indentStep) {
          return quotedString(value, ctx);
        }
      }
      const str7 = value.replace(/\n+/g, `$&
${indent}`);
      if (actualString) {
        const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str7);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str7 : foldFlowLines.foldFlowLines(str7, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
          type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res = _stringify(type);
      if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = implicitKey && defaultKeyType || defaultStringType;
        res = _stringify(t);
        if (res === null)
          throw new Error(`Unsupported default string type ${t}`);
      }
      return res;
    }
    exports.stringifyString = stringifyString;
  }
});

// node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "node_modules/yaml/dist/stringify/stringify.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var identity = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: false,
        singleQuote: null,
        trueStr: "true",
        verifyAliasOrder: true
      }, doc.schema.toStringOptions, options);
      let inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = false;
          break;
        case "flow":
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0)
          return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj;
      if (identity.isScalar(item)) {
        obj = item.value;
        let match = tags.filter((t) => t.identify?.(obj));
        if (match.length > 1) {
          const testMatch = match.filter((t) => t.test);
          if (testMatch.length > 0)
            match = testMatch;
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else {
        obj = item;
        tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
      }
      if (!tagObj) {
        const name = obj?.constructor?.name ?? typeof obj;
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      const props = [];
      const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
      if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
      }
      const tag = node.tag ? node.tag : tagObj.default ? null : tagObj.tag;
      if (tag)
        props.push(doc.directives.tagString(tag));
      return props.join(" ");
    }
    function stringify(item, ctx, onComment, onChompKeep) {
      if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases)
            ctx.resolvedAliases.add(item);
          else
            ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
      if (!tagObj)
        tagObj = getTagObject(ctx.doc.schema.tags, node);
      const props = stringifyProps(node, tagObj, ctx);
      if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str7 = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
      if (!props)
        return str7;
      return identity.isScalar(node) || str7[0] === "{" || str7[0] === "[" ? `${props} ${str7}` : `${props}
${ctx.indent}${str7}`;
    }
    exports.createStringifyContext = createStringifyContext;
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyPair.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
      const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
      let keyComment = identity.isNode(key) && key.comment || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error("With simple keys, key nodes cannot have comments");
        }
        if (identity.isCollection(key) || !identity.isNode(key) && typeof key === "object") {
          const msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity.isCollection(key) || (identity.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str7 = stringify.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
      if (!explicitKey && !ctx.inFlow && str7.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null) {
          if (keyCommentDone && onComment)
            onComment();
          return str7 === "" ? "?" : explicitKey ? `? ${str7}` : str7;
        }
      } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
        str7 = `? ${str7}`;
        if (keyComment && !keyCommentDone) {
          str7 += stringifyComment.lineComment(str7, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep)
          onChompKeep();
        return str7;
      }
      if (keyCommentDone)
        keyComment = null;
      if (explicitKey) {
        if (keyComment)
          str7 += stringifyComment.lineComment(str7, ctx.indent, commentString(keyComment));
        str7 = `? ${str7}
${indent}:`;
      } else {
        str7 = `${str7}:`;
        if (keyComment)
          str7 += stringifyComment.lineComment(str7, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === "object")
          value = doc.createNode(value);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str7.length + 1;
      chompKeep = false;
      if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
      let ws = " ";
      if (keyComment || vsb || vcb) {
        ws = vsb ? "\n" : "";
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === "" && !ctx.inFlow) {
          if (ws === "\n")
            ws = "\n\n";
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf("\n");
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
              sp0 = valueStr.indexOf(" ", sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0)
              hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === "" || valueStr[0] === "\n") {
        ws = "";
      }
      str7 += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment)
          onComment();
      } else if (valueComment && !valueCommentDone) {
        str7 += stringifyComment.lineComment(str7, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str7;
    }
    exports.stringifyPair = stringifyPair;
  }
});

// node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "node_modules/yaml/dist/log.js"(exports) {
    "use strict";
    function debug(logLevel, ...messages) {
      if (logLevel === "debug")
        console.log(...messages);
    }
    function warn(logLevel, warning) {
      if (logLevel === "debug" || logLevel === "warn") {
        if (typeof process !== "undefined" && process.emitWarning)
          process.emitWarning(warning);
        else
          console.warn(warning);
      }
    }
    exports.debug = debug;
    exports.warn = warn;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = "<<";
    var merge = {
      identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    };
    var isMergeKey = (ctx, key) => (merge.identify(key) || identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map, value) {
      value = ctx && identity.isAlias(value) ? value.resolve(ctx.doc) : value;
      if (identity.isSeq(value))
        for (const it of value.items)
          mergeValue(ctx, map, it);
      else if (Array.isArray(value))
        for (const it of value)
          mergeValue(ctx, map, it);
      else
        mergeValue(ctx, map, value);
    }
    function mergeValue(ctx, map, value) {
      const source = ctx && identity.isAlias(value) ? value.resolve(ctx.doc) : value;
      if (!identity.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key, value2] of srcMap) {
        if (map instanceof Map) {
          if (!map.has(key))
            map.set(key, value2);
        } else if (map instanceof Set) {
          map.add(key);
        } else if (!Object.prototype.hasOwnProperty.call(map, key)) {
          Object.defineProperty(map, key, {
            value: value2,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return map;
    }
    exports.addMergeToJSMap = addMergeToJSMap;
    exports.isMergeKey = isMergeKey;
    exports.merge = merge;
  }
});

// node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports) {
    "use strict";
    var log = require_log();
    var merge = require_merge();
    var stringify = require_stringify();
    var identity = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map, { key, value }) {
      if (identity.isNode(key) && key.addToJSMap)
        key.addToJSMap(ctx, map, value);
      else if (merge.isMergeKey(ctx, key))
        merge.addMergeToJSMap(ctx, map, value);
      else {
        const jsKey = toJS.toJS(key, "", ctx);
        if (map instanceof Map) {
          map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        } else if (map instanceof Set) {
          map.add(jsKey);
        } else {
          const stringKey = stringifyKey(key, jsKey, ctx);
          const jsValue = toJS.toJS(value, stringKey, ctx);
          if (stringKey in map)
            Object.defineProperty(map, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          else
            map[stringKey] = jsValue;
        }
      }
      return map;
    }
    function stringifyKey(key, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey !== "object")
        return String(jsKey);
      if (identity.isNode(key) && ctx?.doc) {
        const strCtx = stringify.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node of ctx.anchors.keys())
          strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40)
            jsonStr = jsonStr.substring(0, 36) + '..."';
          log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports.addPairToJSMap = addPairToJSMap;
  }
});

// node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "node_modules/yaml/dist/nodes/Pair.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity = require_identity();
    function createPair(key, value, ctx) {
      const k = createNode.createNode(key, void 0, ctx);
      const v = createNode.createNode(value, void 0, ctx);
      return new Pair(k, v);
    }
    var Pair = class _Pair {
      constructor(key, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key;
        this.value = value;
      }
      clone(schema) {
        let { key, value } = this;
        if (identity.isNode(key))
          key = key.clone(schema);
        if (identity.isNode(value))
          value = value.clone(schema);
        return new _Pair(key, value);
      }
      toJSON(_, ctx) {
        const pair2 = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair2, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports.Pair = Pair;
    exports.createPair = createPair;
  }
});

// node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyCollection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      const flow = ctx.inFlow ?? collection.flow;
      const stringify2 = flow ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify2(collection, ctx, options);
    }
    function stringifyBlockCollection({ comment, items: items2 }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      const { indent, options: { commentString } } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines = [];
      for (let i = 0; i < items2.length; ++i) {
        const item = items2[i];
        let comment2 = null;
        if (identity.isNode(item)) {
          if (!chompKeep && item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
          if (item.comment)
            comment2 = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str8 = stringify.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
        if (comment2)
          str8 += stringifyComment.lineComment(str8, itemIndent, commentString(comment2));
        if (chompKeep && comment2)
          chompKeep = false;
        lines.push(blockItemPrefix + str8);
      }
      let str7;
      if (lines.length === 0) {
        str7 = flowChars.start + flowChars.end;
      } else {
        str7 = lines[0];
        for (let i = 1; i < lines.length; ++i) {
          const line2 = lines[i];
          str7 += line2 ? `
${indent}${line2}` : "\n";
        }
      }
      if (comment) {
        str7 += "\n" + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment)
          onComment();
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str7;
    }
    function stringifyFlowCollection({ items: items2 }, ctx, { flowChars, itemIndent }) {
      const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines = [];
      for (let i = 0; i < items2.length; ++i) {
        const item = items2[i];
        let comment = null;
        if (identity.isNode(item)) {
          if (item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, false);
          if (item.comment)
            comment = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, false);
            if (ik.comment)
              reqNewline = true;
          }
          const iv = identity.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment)
              comment = iv.comment;
            if (iv.commentBefore)
              reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment)
          reqNewline = true;
        let str7 = stringify.stringify(item, itemCtx, () => comment = null);
        if (i < items2.length - 1)
          str7 += ",";
        if (comment)
          str7 += stringifyComment.lineComment(str7, itemIndent, commentString(comment));
        if (!reqNewline && (lines.length > linesAtValue || str7.includes("\n")))
          reqNewline = true;
        lines.push(str7);
        linesAtValue = lines.length;
      }
      const { start, end } = flowChars;
      if (lines.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len = lines.reduce((sum, line2) => sum + line2.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str7 = start;
          for (const line2 of lines)
            str7 += line2 ? `
${indentStep}${indent}${line2}` : "\n";
          return `${str7}
${indent}${end}`;
        } else {
          return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep)
        comment = comment.replace(/^\n+/, "");
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart());
      }
    }
    exports.stringifyCollection = stringifyCollection;
  }
});

// node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLMap.js"(exports) {
    "use strict";
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items2, key) {
      const k = identity.isScalar(key) ? key.value : key;
      for (const it of items2) {
        if (identity.isPair(it)) {
          if (it.key === key || it.key === k)
            return it;
          if (identity.isScalar(it.key) && it.key.value === k)
            return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema);
        const add = (key, value) => {
          if (typeof replacer === "function")
            value = replacer.call(obj, key, value);
          else if (Array.isArray(replacer) && !replacer.includes(key))
            return;
          if (value !== void 0 || keepUndefined)
            map.items.push(Pair.createPair(key, value, ctx));
        };
        if (obj instanceof Map) {
          for (const [key, value] of obj)
            add(key, value);
        } else if (obj && typeof obj === "object") {
          for (const key of Object.keys(obj))
            add(key, obj[key]);
        }
        if (typeof schema.sortMapEntries === "function") {
          map.items.sort(schema.sortMapEntries);
        }
        return map;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair2, overwrite) {
        let _pair;
        if (identity.isPair(pair2))
          _pair = pair2;
        else if (!pair2 || typeof pair2 !== "object" || !("key" in pair2)) {
          _pair = new Pair.Pair(pair2, pair2?.value);
        } else
          _pair = new Pair.Pair(pair2.key, pair2.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
            prev.value.value = _pair.value;
          else
            prev.value = _pair.value;
        } else if (sortEntries) {
          const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i === -1)
            this.items.push(_pair);
          else
            this.items.splice(i, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key) {
        const it = findPair(this.items, key);
        if (!it)
          return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const it = findPair(this.items, key);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key) {
        return !!findPair(this.items, key);
      }
      set(key, value) {
        this.add(new Pair.Pair(key, value), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_, ctx, Type) {
        const map = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
          ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports.YAMLMap = YAMLMap;
    exports.findPair = findPair;
  }
});

// node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "node_modules/yaml/dist/schema/common/map.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLMap = require_YAMLMap();
    var map = {
      collection: "map",
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map2, onError) {
        if (!identity.isMap(map2))
          onError("Expected a mapping for this tag");
        return map2;
      },
      createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
    };
    exports.map = map;
  }
});

// node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLSeq.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return void 0;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key) {
        const idx = asItemIndex(key);
        return typeof idx === "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key, value) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          throw new Error(`Expected a valid index, not ${key}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
          prev.value = value;
        else
          this.items[idx] = value;
      }
      toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate)
          ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items)
          seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        });
      }
      static from(schema, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
          let i = 0;
          for (let it of obj) {
            if (typeof replacer === "function") {
              const key = obj instanceof Set ? it : String(i++);
              it = replacer.call(obj, key, it);
            }
            seq.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key) {
      let idx = identity.isScalar(key) ? key.value : key;
      if (idx && typeof idx === "string")
        idx = Number(idx);
      return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports.YAMLSeq = YAMLSeq;
  }
});

// node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "node_modules/yaml/dist/schema/common/seq.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq = {
      collection: "seq",
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq2, onError) {
        if (!identity.isSeq(seq2))
          onError("Expected a sequence for this tag");
        return seq2;
      },
      createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
    };
    exports.seq = seq;
  }
});

// node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "node_modules/yaml/dist/schema/common/string.js"(exports) {
    "use strict";
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str7) => str7,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports.string = string;
  }
});

// node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "node_modules/yaml/dist/schema/common/null.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports.nullTag = nullTag;
  }
});

// node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "node_modules/yaml/dist/schema/core/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str7) => new Scalar.Scalar(str7[0] === "t" || str7[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports.boolTag = boolTag;
  }
});

// node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyNumber.js"(exports) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag, value }) {
      if (typeof value === "bigint")
        return String(value);
      const num7 = typeof value === "number" ? value : Number(value);
      if (!isFinite(num7))
        return isNaN(num7) ? ".nan" : num7 < 0 ? "-.inf" : ".inf";
      let n = JSON.stringify(value);
      if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^\d/.test(n)) {
        let i = n.indexOf(".");
        if (i < 0) {
          i = n.length;
          n += ".";
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0)
          n += "0";
      }
      return n;
    }
    exports.stringifyNumber = stringifyNumber;
  }
});

// node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "node_modules/yaml/dist/schema/core/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str7) => str7.slice(-3).toLowerCase() === "nan" ? NaN : str7[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str7) => parseFloat(str7),
      stringify(node) {
        const num7 = Number(node.value);
        return isFinite(num7) ? num7.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str7) {
        const node = new Scalar.Scalar(parseFloat(str7));
        const dot = str7.indexOf(".");
        if (dot !== -1 && str7[str7.length - 1] === "0")
          node.minFractionDigits = str7.length - dot - 1;
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "node_modules/yaml/dist/schema/core/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    var intResolve = (str7, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str7) : parseInt(str7.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
      return stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str7, _onError, opt) => intResolve(str7, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, "0o")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str7, _onError, opt) => intResolve(str7, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str7, _onError, opt) => intResolve(str7, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "node_modules/yaml/dist/schema/core/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "node_modules/yaml/dist/schema/json/schema.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var map = require_map();
    var seq = require_seq();
    function intIdentify(value) {
      return typeof value === "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value);
    var jsonScalars = [
      {
        identify: (value) => typeof value === "string",
        default: true,
        tag: "tag:yaml.org,2002:str",
        resolve: (str7) => str7,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value === "boolean",
        default: true,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str7) => str7 === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: true,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str7, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str7) : parseInt(str7, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value === "number",
        default: true,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str7) => parseFloat(str7),
        stringify: stringifyJSON
      }
    ];
    var jsonError = {
      default: true,
      tag: "",
      test: /^/,
      resolve(str7, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str7)}`);
        return str7;
      }
    };
    var schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof Buffer === "function") {
          return Buffer.from(src, "base64");
        } else if (typeof atob === "function") {
          const str7 = atob(src.replace(/[\n\r]/g, ""));
          const buffer = new Uint8Array(str7.length);
          for (let i = 0; i < str7.length; ++i)
            buffer[i] = str7.charCodeAt(i);
          return buffer;
        } else {
          onError("This environment does not support reading binary tags; either Buffer or atob is required");
          return src;
        }
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        const buf = value;
        let str7;
        if (typeof Buffer === "function") {
          str7 = buf instanceof Buffer ? buf.toString("base64") : Buffer.from(buf.buffer).toString("base64");
        } else if (typeof btoa === "function") {
          let s = "";
          for (let i = 0; i < buf.length; ++i)
            s += String.fromCharCode(buf[i]);
          str7 = btoa(s);
        } else {
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        }
        if (!type)
          type = Scalar.Scalar.BLOCK_LITERAL;
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n = Math.ceil(str7.length / lineWidth);
          const lines = new Array(n);
          for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
            lines[i] = str7.substr(o, lineWidth);
          }
          str7 = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str7 }, ctx, onComment, onChompKeep);
      }
    };
    exports.binary = binary;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq, onError) {
      if (identity.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
          let item = seq.items[i];
          if (identity.isPair(item))
            continue;
          else if (identity.isMap(item)) {
            if (item.items.length > 1)
              onError("Each pair must have its own sequence indicator");
            const pair2 = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair2.key.commentBefore = pair2.key.commentBefore ? `${item.commentBefore}
${pair2.key.commentBefore}` : item.commentBefore;
            if (item.comment) {
              const cn = pair2.value ?? pair2.key;
              cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
            }
            item = pair2;
          }
          seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
      } else
        onError("Expected a sequence for this tag");
      return seq;
    }
    function createPairs(schema, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === "function")
            it = replacer.call(iterable, String(i++), it);
          let key, value;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key = it[0];
              value = it[1];
            } else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys = Object.keys(it);
            if (keys.length === 1) {
              key = keys[0];
              value = it[key];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
            }
          } else {
            key = it;
          }
          pairs2.items.push(Pair.createPair(key, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: false,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports.createPairs = createPairs;
    exports.pairs = pairs;
    exports.resolvePairs = resolvePairs;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports) {
    "use strict";
    var identity = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_, ctx) {
        if (!ctx)
          return super.toJSON(_);
        const map = /* @__PURE__ */ new Map();
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const pair2 of this.items) {
          let key, value;
          if (identity.isPair(pair2)) {
            key = toJS.toJS(pair2.key, "", ctx);
            value = toJS.toJS(pair2.value, key, ctx);
          } else {
            key = toJS.toJS(pair2, "", ctx);
          }
          if (map.has(key))
            throw new Error("Ordered maps must not include duplicate keys");
          map.set(key, value);
        }
        return map;
      }
      static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key } of pairs$1.items) {
          if (identity.isScalar(key)) {
            if (seenKeys.includes(key.value)) {
              onError(`Ordered maps must not include duplicate keys: ${key.value}`);
            } else {
              seenKeys.push(key.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
    };
    exports.YAMLOMap = YAMLOMap;
    exports.omap = omap;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      const boolObj = value ? trueTag : falseTag;
      if (source && boolObj.test.test(source))
        return source;
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === true,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify
    };
    var falseTag = {
      identify: (value) => value === false,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify
    };
    exports.falseTag = falseTag;
    exports.trueTag = trueTag;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str7) => str7.slice(-3).toLowerCase() === "nan" ? NaN : str7[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str7) => parseFloat(str7.replace(/_/g, "")),
      stringify(node) {
        const num7 = Number(node.value);
        return isFinite(num7) ? num7.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str7) {
        const node = new Scalar.Scalar(parseFloat(str7.replace(/_/g, "")));
        const dot = str7.indexOf(".");
        if (dot !== -1) {
          const f = str7.substring(dot + 1).replace(/_/g, "");
          if (f[f.length - 1] === "0")
            node.minFractionDigits = f.length;
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    function intResolve(str7, offset, radix, { intAsBigInt }) {
      const sign = str7[0];
      if (sign === "-" || sign === "+")
        offset += 1;
      str7 = str7.substring(offset).replace(/_/g, "");
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str7 = `0b${str7}`;
            break;
          case 8:
            str7 = `0o${str7}`;
            break;
          case 16:
            str7 = `0x${str7}`;
            break;
        }
        const n2 = BigInt(str7);
        return sign === "-" ? BigInt(-1) * n2 : n2;
      }
      const n = parseInt(str7, radix);
      return sign === "-" ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value)) {
        const str7 = value.toString(radix);
        return value < 0 ? "-" + prefix + str7.substr(1) : prefix + str7;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str7, _onError, opt) => intResolve(str7, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, "0b")
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str7, _onError, opt) => intResolve(str7, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, "0")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str7, _onError, opt) => intResolve(str7, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str7, _onError, opt) => intResolve(str7, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intBin = intBin;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema) {
        super(schema);
        this.tag = _YAMLSet.tag;
      }
      add(key) {
        let pair2;
        if (identity.isPair(key))
          pair2 = key;
        else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
          pair2 = new Pair.Pair(key.key, null);
        else
          pair2 = new Pair.Pair(key, null);
        const prev = YAMLMap.findPair(this.items, pair2.key);
        if (!prev)
          this.items.push(pair2);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key, keepPair) {
        const pair2 = YAMLMap.findPair(this.items, key);
        return !keepPair && identity.isPair(pair2) ? identity.isScalar(pair2.key) ? pair2.key.value : pair2.key : pair2;
      }
      set(key, value) {
        if (typeof value !== "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key);
        if (prev && !value) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value) {
          this.items.push(new Pair.Pair(key));
        }
      }
      toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
          throw new Error("Set items must all have null values");
      }
      static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable) {
            if (typeof replacer === "function")
              value = replacer.call(iterable, value, value);
            set2.items.push(Pair.createPair(value, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map, onError) {
        if (identity.isMap(map)) {
          if (map.hasAllNullValues(true))
            return Object.assign(new YAMLSet(), map);
          else
            onError("Set items must all have null values");
        } else
          onError("Expected a mapping for this tag");
        return map;
      }
    };
    exports.YAMLSet = YAMLSet;
    exports.set = set;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str7, asBigInt) {
      const sign = str7[0];
      const parts = sign === "-" || sign === "+" ? str7.substring(1) : str7;
      const num7 = (n) => asBigInt ? BigInt(n) : Number(n);
      const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num7(60) + num7(p), num7(0));
      return sign === "-" ? num7(-1) * res : res;
    }
    function stringifySexagesimal(node) {
      let { value } = node;
      let num7 = (n) => n;
      if (typeof value === "bigint")
        num7 = (n) => BigInt(n);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
      let sign = "";
      if (value < 0) {
        sign = "-";
        value *= num7(-1);
      }
      const _60 = num7(60);
      const parts = [value % _60];
      if (value < 60) {
        parts.unshift(0);
      } else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60);
        if (value >= 60) {
          value = (value - parts[0]) / _60;
          parts.unshift(value);
        }
      }
      return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value === "bigint" || Number.isInteger(value),
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str7, _onError, { intAsBigInt }) => parseSexagesimal(str7, intAsBigInt),
      stringify: stringifySexagesimal
    };
    var floatTime = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str7) => parseSexagesimal(str7, false),
      stringify: stringifySexagesimal
    };
    var timestamp = {
      identify: (value) => value instanceof Date,
      default: true,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str7) {
        const match = str7.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30)
            d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value.toISOString().replace(/(T00:00:00)?\.000Z$/, "")
    };
    exports.floatTime = floatTime;
    exports.intTime = intTime;
    exports.timestamp = timestamp;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var binary = require_binary();
    var bool = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "node_modules/yaml/dist/schema/tags.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = require_schema();
    var schema$1 = require_schema2();
    var binary = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ["core", schema.schema],
      ["failsafe", [map.map, seq.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]);
    var tagsByName = {
      binary: binary.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    };
    var coreKnownTags = {
      "tag:yaml.org,2002:binary": binary.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags))
          tags = [];
        else {
          const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag of customTags)
          tags = tags.concat(tag);
      } else if (typeof customTags === "function") {
        tags = customTags(tags.slice());
      }
      if (addMergeTag)
        tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag) => {
        const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
        if (!tagObj) {
          const tagName = JSON.stringify(tag);
          const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags2.includes(tagObj))
          tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports.coreKnownTags = coreKnownTags;
    exports.getTags = getTags;
  }
});

// node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "node_modules/yaml/dist/schema/Schema.js"(exports) {
    "use strict";
    var identity = require_identity();
    var map = require_map();
    var seq = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
        this.name = typeof schema === "string" && schema || "core";
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
      }
    };
    exports.Schema = Schema;
  }
});

// node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyDocument.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      const lines = [];
      let hasDirectives = options.directives === true;
      if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
          lines.push(dir);
          hasDirectives = true;
        } else if (doc.directives.docStart)
          hasDirectives = true;
      }
      if (hasDirectives)
        lines.push("---");
      const ctx = stringify.createStringifyContext(doc, options);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines.length !== 1)
          lines.unshift("");
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives)
            lines.push("");
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
        let body = stringify.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        if (contentComment)
          body += stringifyComment.lineComment(body, "", commentString(contentComment));
        if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
          lines[lines.length - 1] = `--- ${body}`;
        } else
          lines.push(body);
      } else {
        lines.push(stringify.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes("\n")) {
            lines.push("...");
            lines.push(stringifyComment.indentComment(cs, ""));
          } else {
            lines.push(`... ${cs}`);
          }
        } else {
          lines.push("...");
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep)
          dc = dc.replace(/^\n+/, "");
        if (dc) {
          if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
            lines.push("");
          lines.push(stringifyComment.indentComment(commentString(dc), ""));
        }
      }
      return lines.join("\n") + "\n";
    }
    exports.stringifyDocument = stringifyDocument;
  }
});

// node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "node_modules/yaml/dist/doc/Document.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode = require_createNode();
    var directives = require_directives();
    var Document = class _Document {
      constructor(value, replacer, options) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === "function" || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const opt = Object.assign({
          intAsBigInt: false,
          keepSourceTokens: false,
          logLevel: "warn",
          prettyErrors: true,
          strict: true,
          stringKeys: false,
          uniqueKeys: true,
          version: "1.2"
        }, options);
        this.options = opt;
        let { version } = opt;
        if (options?._directives) {
          this.directives = options._directives.atDocument();
          if (this.directives.yaml.explicit)
            version = this.directives.yaml.version;
        } else
          this.directives = new directives.Directives({ version });
        this.setSchema(version, options);
        this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy = Object.create(_Document.prototype, {
          [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
          copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** Adds a value to the document. */
      add(value) {
        if (assertCollection(this.contents))
          this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path2, value) {
        if (assertCollection(this.contents))
          this.contents.addIn(path2, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          const prev = anchors.anchorNames(this);
          node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias.Alias(node.anchor);
      }
      createNode(value, replacer, options) {
        let _replacer = void 0;
        if (typeof replacer === "function") {
          value = replacer.call({ "": value }, "", value);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0)
            replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        };
        const node = createNode.createNode(value, tag, ctx);
        if (flow && identity.isCollection(node))
          node.flow = true;
        setAnchors();
        return node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key, value, options = {}) {
        const k = this.createNode(key, null, options);
        const v = this.createNode(value, null, options);
        return new Pair.Pair(k, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        return assertCollection(this.contents) ? this.contents.delete(key) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path2) {
        if (Collection.isEmptyPath(path2)) {
          if (this.contents == null)
            return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path2) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key, keepScalar) {
        return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path2, keepScalar) {
        if (Collection.isEmptyPath(path2))
          return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity.isCollection(this.contents) ? this.contents.getIn(path2, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key) {
        return identity.isCollection(this.contents) ? this.contents.has(key) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path2) {
        if (Collection.isEmptyPath(path2))
          return this.contents !== void 0;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path2) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key, value) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key], value);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key, value);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path2, value) {
        if (Collection.isEmptyPath(path2)) {
          this.contents = value;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path2), value);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path2, value);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version, options = {}) {
        if (typeof version === "number")
          version = String(version);
        let opt;
        switch (version) {
          case "1.1":
            if (this.directives)
              this.directives.yaml.version = "1.1";
            else
              this.directives = new directives.Directives({ version: "1.1" });
            opt = { resolveKnownTags: false, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            if (this.directives)
              this.directives.yaml.version = version;
            else
              this.directives = new directives.Directives({ version });
            opt = { resolveKnownTags: true, schema: "core" };
            break;
          case null:
            if (this.directives)
              delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object)
          this.schema = options.schema;
        else if (opt)
          this.schema = new Schema.Schema(Object.assign(opt, options));
        else
          throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          const s = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity.isCollection(contents))
        return true;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports.Document = Document;
  }
});

// node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  "node_modules/yaml/dist/errors.js"(exports) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLParseError", pos, code, message);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLWarning", pos, code, message);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line: line2, col } = error.linePos[0];
      error.message += ` at line ${line2}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line2 - 1], lc.lineStarts[line2]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "\u2026" + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + "\u2026";
      if (line2 > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line2 - 2], lc.lineStarts[line2 - 1]);
        if (prev.length > 80)
          prev = prev.substring(0, 79) + "\u2026\n";
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end && end.line === line2 && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer}
`;
      }
    };
    exports.YAMLError = YAMLError;
    exports.YAMLParseError = YAMLParseError;
    exports.YAMLWarning = YAMLWarning;
    exports.prettifyError = prettifyError;
  }
});

// node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "node_modules/yaml/dist/compose/resolve-props.js"(exports) {
    "use strict";
    function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = "";
      let commentSep = "";
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor = null;
      let tag = null;
      let newlineAfterProp = null;
      let comma = null;
      let found = null;
      let start = null;
      for (const token of tokens) {
        if (reqSpace) {
          if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
            onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token.type !== "comment" && token.type !== "newline") {
            onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
          }
          tab = null;
        }
        switch (token.type) {
          case "space":
            if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
              tab = token;
            }
            hasSpace = true;
            break;
          case "comment": {
            if (!hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = token.source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += commentSep + cb;
            commentSep = "";
            atNewline = false;
            break;
          }
          case "newline":
            if (atNewline) {
              if (comment)
                comment += token.source;
              else
                spaceBefore = true;
            } else
              commentSep += token.source;
            atNewline = true;
            hasNewline = true;
            if (anchor || tag)
              newlineAfterProp = token;
            hasSpace = true;
            break;
          case "anchor":
            if (anchor)
              onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
            if (token.source.endsWith(":"))
              onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
            anchor = token;
            if (start === null)
              start = token.offset;
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case "tag": {
            if (tag)
              onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
            tag = token;
            if (start === null)
              start = token.offset;
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor || tag)
              onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
            if (found)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
            found = token;
            atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
            hasSpace = false;
            break;
          case "comma":
            if (flow) {
              if (comma)
                onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
              comma = token;
              atNewline = false;
              hasSpace = false;
              break;
            }
          // else fallthrough
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last = tokens[tokens.length - 1];
      const end = last ? last.offset + last.source.length : offset;
      if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
        onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      }
      if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports.resolveProps = resolveProps;
  }
});

// node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "node_modules/yaml/dist/compose/util-contains-newline.js"(exports) {
    "use strict";
    function containsNewline(key) {
      if (!key)
        return null;
      switch (key.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key.source.includes("\n"))
            return true;
          if (key.end) {
            for (const st of key.end)
              if (st.type === "newline")
                return true;
          }
          return false;
        case "flow-collection":
          for (const it of key.items) {
            for (const st of it.start)
              if (st.type === "newline")
                return true;
            if (it.sep) {
              for (const st of it.sep)
                if (st.type === "newline")
                  return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports.containsNewline = containsNewline;
  }
});

// node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent, fc, onError) {
      if (fc?.type === "flow-collection") {
        const end = fc.end[0];
        if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
          const msg = "Flow end indicator should be more indented than parent";
          onError(end, "BAD_INDENT", msg, true);
        }
      }
    }
    exports.flowIndentCheck = flowIndentCheck;
  }
});

// node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "node_modules/yaml/dist/compose/util-map-includes.js"(exports) {
    "use strict";
    var identity = require_identity();
    function mapIncludes(ctx, items2, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false)
        return false;
      const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
      return items2.some((pair2) => isEqual(pair2.key, search));
    }
    exports.mapIncludes = mapIncludes;
  }
});

// node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-map.js"(exports) {
    "use strict";
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
      const map = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key, sep, value } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key ?? sep?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key) {
            if (key.type === "block-seq")
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
            else if ("indent" in key && key.indent !== bm.indent)
              onError(offset, "BAD_INDENT", startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map.comment)
                map.comment += "\n" + keyProps.comment;
              else
                map.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
            onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError(offset, "BAD_INDENT", startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        const valueProps = resolveProps.resolveProps(sep ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key || key.type === "block-scalar"
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value?.type === "block-map" && !valueProps.hasNewline)
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep, null, valueProps, onError);
          if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
          offset = valueNode.range[2];
          const pair2 = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair2.srcToken = collItem;
          map.items.push(pair2);
        } else {
          if (implicitKey)
            onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
          if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair2 = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens)
            pair2.srcToken = collItem;
          map.items.push(pair2);
        }
      }
      if (commentEnd && commentEnd < offset)
        onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
      map.range = [bm.offset, offset, commentEnd ?? offset];
      return map;
    }
    exports.resolveBlockMap = resolveBlockMap;
  }
});

// node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-seq.js"(exports) {
    "use strict";
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: true
        });
        if (!props.found) {
          if (props.anchor || props.tag || value) {
            if (value && value.type === "block-seq")
              onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
            else
              onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
          } else {
            commentEnd = props.end;
            if (props.comment)
              seq.comment = props.comment;
            continue;
          }
        }
        const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node.range[2];
        seq.items.push(node);
      }
      seq.range = [bs.offset, offset, commentEnd ?? offset];
      return seq;
    }
    exports.resolveBlockSeq = resolveBlockSeq;
  }
});

// node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "node_modules/yaml/dist/compose/resolve-end.js"(exports) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = "";
      if (end) {
        let hasSpace = false;
        let sep = "";
        for (const token of end) {
          const { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = true;
              break;
            case "comment": {
              if (reqSpace && !hasSpace)
                onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              const cb = source.substring(1) || " ";
              if (!comment)
                comment = cb;
              else
                comment += sep + cb;
              sep = "";
              break;
            }
            case "newline":
              if (comment)
                sep += source;
              hasSpace = true;
              break;
            default:
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports.resolveEnd = resolveEnd;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = "Block collections are not allowed within flow collections";
    var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
      const isMap = fc.start.source === "{";
      const fcName = isMap ? "flow map" : "flow sequence";
      const NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key, sep, value } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key ?? sep?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep && !value) {
            if (i === 0 && props.comma)
              onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
            else if (i < fc.items.length - 1)
              onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment)
                coll.comment += "\n" + props.comment;
              else
                coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key))
            onError(
              key,
              // checked by containsNewline()
              "MULTILINE_IMPLICIT_KEY",
              "Implicit keys of flow sequence pairs need to be on a single line"
            );
        }
        if (i === 0) {
          if (props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma)
            onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = "";
            loop: for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity.isPair(prev))
                prev = prev.value ?? prev.key;
              if (prev.comment)
                prev.comment += "\n" + prevItemComment;
              else
                prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap && !sep && !props.found) {
          const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep, null, props, onError);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          if (isBlock(key))
            onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
          });
          if (valueProps.found) {
            if (!isMap && !props.found && ctx.options.strict) {
              if (sep)
                for (const st of sep) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else if (value) {
            if ("source" in value && value.source && value.source[0] === ":")
              onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
            else
              onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep, null, valueProps, onError) : null;
          if (valueNode) {
            if (isBlock(value))
              onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair2 = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair2.srcToken = collItem;
          if (isMap) {
            const map = coll;
            if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
              onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
            map.items.push(pair2);
          } else {
            const map = new YAMLMap.YAMLMap(ctx.schema);
            map.flow = true;
            map.items.push(pair2);
            const endRange = (valueNode ?? keyNode).range;
            map.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap ? "}" : "]";
      const [ce, ...ee] = fc.end;
      let cePos = offset;
      if (ce && ce.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
        if (ce && ce.source.length !== 1)
          ee.unshift(ce);
      }
      if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
          if (coll.comment)
            coll.comment += "\n" + end.comment;
          else
            coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports.resolveFlowCollection = resolveFlowCollection;
  }
});

// node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "node_modules/yaml/dist/compose/compose-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError, tagName, tag) {
      const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
      const Coll = coll.constructor;
      if (tagName === "!" || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName)
        coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token, props, onError) {
      const tagToken = props.tag;
      const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
      if (token.type === "block-seq") {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message = "Missing newline after block sequence props";
          onError(lastProp, "MISSING_CHAR", message);
        }
      }
      const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
      let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt && kt.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag = kt;
        } else {
          if (kt?.collection) {
            onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection}`, true);
          } else {
            onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token, onError, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
      const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
      const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
      node.range = coll.range;
      node.tag = tagName;
      if (tag?.format)
        node.format = tag.format;
      return node;
    }
    exports.composeCollection = composeCollection;
  }
});

// node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar, onError) {
      const start = scalar.offset;
      const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
      if (!header)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines = scalar.source ? splitLines(scalar.source) : [];
      let chompStart = lines.length;
      for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === "" || content === "\r")
          chompStart = i;
        else
          break;
      }
      if (chompStart === 0) {
        const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
        let end2 = start + header.length;
        if (scalar.source)
          end2 += scalar.source.length;
        return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar.indent + header.indent;
      let offset = scalar.offset + header.length;
      let contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        const [indent, content] = lines[i];
        if (content === "" || content === "\r") {
          if (header.indent === 0 && indent.length > trimIndent)
            trimIndent = indent.length;
        } else {
          if (indent.length < trimIndent) {
            const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
            onError(offset + indent.length, "MISSING_CHAR", message);
          }
          if (header.indent === 0)
            trimIndent = indent.length;
          contentStart = i;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message = "Block scalar values in collections must be indented";
            onError(offset, "BAD_INDENT", message);
          }
          break;
        }
        offset += indent.length + content.length + 1;
      }
      for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent)
          chompStart = i + 1;
      }
      let value = "";
      let sep = "";
      let prevMoreIndented = false;
      for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + "\n";
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === "\r";
        if (crlf)
          content = content.slice(0, -1);
        if (content && indent.length < trimIndent) {
          const src = header.indent ? "explicit indentation indicator" : "first line";
          const message = `Block scalar lines must not be less indented than their ${src}`;
          onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
          indent = "";
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value += sep + indent.slice(trimIndent) + content;
          sep = "\n";
        } else if (indent.length > trimIndent || content[0] === "	") {
          if (sep === " ")
            sep = "\n";
          else if (!prevMoreIndented && sep === "\n")
            sep = "\n\n";
          value += sep + indent.slice(trimIndent) + content;
          sep = "\n";
          prevMoreIndented = true;
        } else if (content === "") {
          if (sep === "\n")
            value += "\n";
          else
            sep = "\n";
        } else {
          value += sep + content;
          sep = " ";
          prevMoreIndented = false;
        }
      }
      switch (header.chomp) {
        case "-":
          break;
        case "+":
          for (let i = chompStart; i < lines.length; ++i)
            value += "\n" + lines[i][0].slice(trimIndent);
          if (value[value.length - 1] !== "\n")
            value += "\n";
          break;
        default:
          value += "\n";
      }
      const end = start + header.length + scalar.source.length;
      return { value, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== "block-scalar-header") {
        onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent = 0;
      let chomp = "";
      let error = -1;
      for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          const n = Number(ch);
          if (!indent && n)
            indent = n;
          else if (error === -1)
            error = offset + i;
        }
      }
      if (error !== -1)
        onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = "";
      let length = source.length;
      for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
          case "space":
            hasSpace = true;
          // fallthrough
          case "newline":
            length += token.source.length;
            break;
          case "comment":
            if (strict && !hasSpace) {
              const message = "Comments must be separated from other tokens by white space characters";
              onError(token, "MISSING_CHAR", message);
            }
            length += token.source.length;
            comment = token.source.substring(1);
            break;
          case "error":
            onError(token, "UNEXPECTED_TOKEN", token.message);
            length += token.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            const message = `Unexpected token in block scalar header: ${token.type}`;
            onError(token, "UNEXPECTED_TOKEN", message);
            const ts = token.source;
            if (ts && typeof ts === "string")
              length += ts.length;
          }
        }
      }
      return { mode, indent, chomp, comment, length };
    }
    function splitLines(source) {
      const split = source.split(/\n( *)/);
      const first = split[0];
      const m = first.match(/^( *)/);
      const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
      const lines = [line0];
      for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
      return lines;
    }
    exports.resolveBlockScalar = resolveBlockScalar;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar, strict, onError) {
      const { offset, type, source, end } = scalar;
      let _type;
      let value;
      const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
      switch (type) {
        case "scalar":
          _type = Scalar.Scalar.PLAIN;
          value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
          return {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError) {
      let badChar = "";
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar)
        onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
      return foldLines(source);
    }
    function singleQuotedValue(source, onError) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
      return foldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function foldLines(source) {
      let first, line2;
      try {
        first = new RegExp("(.*?)(?<![ 	])[ 	]*\r?\n", "sy");
        line2 = new RegExp("[ 	]*(.*?)(?:(?<![ 	])[ 	]*)?\r?\n", "sy");
      } catch {
        first = /(.*?)[ \t]*\r?\n/sy;
        line2 = /[ \t]*(.*?)[ \t]*\r?\n/sy;
      }
      let match = first.exec(source);
      if (!match)
        return source;
      let res = match[1];
      let sep = " ";
      let pos = first.lastIndex;
      line2.lastIndex = pos;
      while (match = line2.exec(source)) {
        if (match[1] === "") {
          if (sep === "\n")
            res += sep;
          else
            sep = "\n";
        } else {
          res += sep + match[1];
          sep = " ";
        }
        pos = line2.lastIndex;
      }
      const last = /[ \t]*(.*)/sy;
      last.lastIndex = pos;
      match = last.exec(source);
      return res + sep + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError) {
      let res = "";
      for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === "\r" && source[i + 1] === "\n")
          continue;
        if (ch === "\n") {
          const { fold, offset } = foldNewline(source, i);
          res += fold;
          i = offset;
        } else if (ch === "\\") {
          let next = source[++i];
          const cc = escapeCodes[next];
          if (cc)
            res += cc;
          else if (next === "\n") {
            next = source[i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "\r" && source[i + 1] === "\n") {
            next = source[++i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "x" || next === "u" || next === "U") {
            const length = { x: 2, u: 4, U: 8 }[next];
            res += parseCharCode(source, i + 1, length, onError);
            i += length;
          } else {
            const raw = source.substr(i - 1, 2);
            onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
            res += raw;
          }
        } else if (ch === " " || ch === "	") {
          const wsStart = i;
          let next = source[i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
          if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
            res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        } else {
          res += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
      return res;
    }
    function foldNewline(source, offset) {
      let fold = "";
      let ch = source[offset + 1];
      while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        if (ch === "\r" && source[offset + 2] !== "\n")
          break;
        if (ch === "\n")
          fold += "\n";
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold)
        fold = " ";
      return { fold, offset };
    }
    var escapeCodes = {
      "0": "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: "\n",
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "\x85",
      // Unicode next line
      _: "\xA0",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length, onError) {
      const cc = source.substr(offset, length);
      const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
      const code = ok ? parseInt(cc, 16) : NaN;
      if (isNaN(code)) {
        const raw = source.substr(offset - 2, length + 2);
        onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        return raw;
      }
      return String.fromCodePoint(code);
    }
    exports.resolveFlowScalar = resolveFlowScalar;
  }
});

// node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "node_modules/yaml/dist/compose/compose-scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError) {
      const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
      const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      let tag;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
      } else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
      else if (token.type === "scalar")
        tag = findScalarTagByTest(ctx, value, token, onError);
      else
        tag = ctx.schema[identity.SCALAR];
      let scalar;
      try {
        const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
        scalar = new Scalar.Scalar(value);
      }
      scalar.range = range;
      scalar.source = value;
      if (type)
        scalar.type = type;
      if (tagName)
        scalar.tag = tagName;
      if (tag.format)
        scalar.format = tag.format;
      if (comment)
        scalar.comment = comment;
      return scalar;
    }
    function findScalarTagByName(schema, value, tagName, tagToken, onError) {
      if (tagName === "!")
        return schema[identity.SCALAR];
      const matchWithTest = [];
      for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
          if (tag.default && tag.test)
            matchWithTest.push(tag);
          else
            return tag;
        }
      }
      for (const tag of matchWithTest)
        if (tag.test?.test(value))
          return tag;
      const kt = schema.knownTags[tagName];
      if (kt && !kt.collection) {
        schema.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
      return schema[identity.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
      const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity.SCALAR];
      if (schema.compat) {
        const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity.SCALAR];
        if (tag.tag !== compat.tag) {
          const ts = directives.tagString(tag.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token, "TAG_RESOLVE_FAILED", msg, true);
        }
      }
      return tag;
    }
    exports.composeScalar = composeScalar;
  }
});

// node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        if (pos === null)
          pos = before.length;
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          st = before[++i];
          while (st?.type === "space") {
            offset += st.source.length;
            st = before[++i];
          }
          break;
        }
      }
      return offset;
    }
    exports.emptyScalarPosition = emptyScalarPosition;
  }
});

// node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "node_modules/yaml/dist/compose/compose-node.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor, tag } = props;
      let node;
      let isSrcToken = true;
      switch (token.type) {
        case "alias":
          node = composeAlias(ctx, token, onError);
          if (anchor || tag)
            onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node = composeScalar.composeScalar(ctx, token, tag, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          node = composeCollection.composeCollection(CN, ctx, token, props, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        default: {
          const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError(token, "UNEXPECTED_TOKEN", message);
          node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError);
          isSrcToken = false;
        }
      }
      if (anchor && node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
        const msg = "With stringKeys, all keys must be strings";
        onError(tag ?? token, "NON_STRING_KEY", msg);
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        if (token.type === "scalar" && token.source === "")
          node.comment = comment;
        else
          node.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
      return node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
      const token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      };
      const node = composeScalar.composeScalar(ctx, token, tag, onError);
      if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === "")
          onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        node.comment = comment;
        node.range[2] = end;
      }
      return node;
    }
    function composeAlias({ options }, { offset, source, end }, onError) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === "")
        onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
      if (alias.source.endsWith(":"))
        onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment)
        alias.comment = re.comment;
      return alias;
    }
    exports.composeEmptyNode = composeEmptyNode;
    exports.composeNode = composeNode;
  }
});

// node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "node_modules/yaml/dist/compose/compose-doc.js"(exports) {
    "use strict";
    var Document = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value, end }, onError) {
      const opts = Object.assign({ _directives: directives }, options);
      const doc = new Document.Document(void 0, opts);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      };
      const props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
          onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
      }
      doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
      if (re.comment)
        doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports.composeDoc = composeDoc;
  }
});

// node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "node_modules/yaml/dist/compose/composer.js"(exports) {
    "use strict";
    var directives = require_directives();
    var Document = require_Document();
    var errors = require_errors();
    var identity = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "";
      let atComment = false;
      let afterEmptyLine = false;
      for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
            atComment = true;
            afterEmptyLine = false;
            break;
          case "%":
            if (prelude[i + 1]?.[0] !== "#")
              i += 1;
            atComment = false;
            break;
          default:
            if (!atComment)
              afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
          const pos = getErrorPos(source);
          if (warning)
            this.warnings.push(new errors.YAMLWarning(pos, code, message));
          else
            this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        this.directives = new directives.Directives({ version: options.version || "1.2" });
        this.options = options;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity.isPair(it))
              it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          Array.prototype.push.apply(doc.errors, this.errors);
          Array.prototype.push.apply(doc.warnings, this.warnings);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        if (process.env.LOG_STREAM)
          console.dir(token, { depth: null });
        switch (token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message, warning) => {
              const pos = getErrorPos(token);
              pos[0] += offset;
              this.onError(pos, "BAD_DIRECTIVE", message, warning);
            });
            this.prelude.push(token.source);
            this.atDirectives = true;
            break;
          case "document": {
            const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
            this.decorate(doc, false);
            if (this.doc)
              yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
            const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            if (this.atDirectives || !this.doc)
              this.errors.push(error);
            else
              this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              const msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document.Document(void 0, opts);
          if (this.atDirectives)
            this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports.Composer = Composer;
  }
});

// node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "node_modules/yaml/dist/parse/cst-scalar.js"(exports) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = true, onError) {
      if (token) {
        const _onError = (pos, code, message) => {
          const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError)
            onError(offset, code, message);
          else
            throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context) {
      const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      const end = context.end ?? [
        { type: "newline", offset: -1, indent, source: "\n" }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          const he = source.indexOf("\n");
          const head = source.substring(0, he);
          const body = source.substring(he + 1) + "\n";
          const props = [
            { type: "block-scalar-header", offset, indent, source: head }
          ];
          if (!addEndtoBlockProps(props, end))
            props.push({ type: "newline", offset: -1, indent, source: "\n" });
          return { type: "block-scalar", offset, indent, props, source: body };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent, source, end };
        default:
          return { type: "scalar", offset, indent, source, end };
      }
    }
    function setScalarValue(token, value, context = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
      let indent = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent === "number")
        indent += 2;
      if (!type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            const header = token.props[0];
            if (header.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      const he = source.indexOf("\n");
      const head = source.substring(0, he);
      const body = source.substring(he + 1) + "\n";
      if (token.type === "block-scalar") {
        const header = token.props[0];
        if (header.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header.source = head;
        token.source = body;
      } else {
        const { offset } = token;
        const indent = "indent" in token ? token.indent : -1;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
          props.push({ type: "newline", offset: -1, indent, source: "\n" });
        for (const key of Object.keys(token))
          if (key !== "type" && key !== "offset")
            delete token[key];
        Object.assign(token, { type: "block-scalar", indent, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type;
          token.source = source;
          break;
        case "block-scalar": {
          const end = token.props.slice(1);
          let oa = source.length;
          if (token.props[0].type === "block-scalar-header")
            oa -= token.props[0].source.length;
          for (const tok of end)
            tok.offset += oa;
          delete token.props;
          Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          const offset = token.offset + source.length;
          const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
          delete token.items;
          Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent = "indent" in token ? token.indent : -1;
          const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (const key of Object.keys(token))
            if (key !== "type" && key !== "offset")
              delete token[key];
          Object.assign(token, { type, indent, source, end });
        }
      }
    }
    exports.createScalarToken = createScalarToken;
    exports.resolveAsScalar = resolveAsScalar;
    exports.setScalarValue = setScalarValue;
  }
});

// node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "node_modules/yaml/dist/parse/cst-stringify.js"(exports) {
    "use strict";
    var stringify = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res = "";
          for (const tok of token.props)
            res += stringifyToken(tok);
          return res + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res = "";
          for (const item of token.items)
            res += stringifyItem(item);
          return res;
        }
        case "flow-collection": {
          let res = token.start.source;
          for (const item of token.items)
            res += stringifyItem(item);
          for (const st of token.end)
            res += st.source;
          return res;
        }
        case "document": {
          let res = stringifyItem(token);
          if (token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
        default: {
          let res = token.source;
          if ("end" in token && token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key, sep, value }) {
      let res = "";
      for (const st of start)
        res += st.source;
      if (key)
        res += stringifyToken(key);
      if (sep)
        for (const st of sep)
          res += st.source;
      if (value)
        res += stringifyToken(value);
      return res;
    }
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "node_modules/yaml/dist/parse/cst-visit.js"(exports) {
    "use strict";
    var BREAK = Symbol("break visit");
    var SKIP = Symbol("skip children");
    var REMOVE = Symbol("remove item");
    function visit(cst, visitor) {
      if ("type" in cst && cst.type === "document")
        cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path2) => {
      let item = cst;
      for (const [field, index] of path2) {
        const tok = item?.[field];
        if (tok && "items" in tok) {
          item = tok.items[index];
        } else
          return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path2) => {
      const parent = visit.itemAtPath(cst, path2.slice(0, -1));
      const field = path2[path2.length - 1][0];
      const coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path2, item, visitor) {
      let ctrl = visitor(item, path2);
      if (typeof ctrl === "symbol")
        return ctrl;
      for (const field of ["key", "value"]) {
        const token = item[field];
        if (token && "items" in token) {
          for (let i = 0; i < token.items.length; ++i) {
            const ci = _visit(Object.freeze(path2.concat([[field, i]])), token.items[i], visitor);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              token.items.splice(i, 1);
              i -= 1;
            }
          }
          if (typeof ctrl === "function" && field === "key")
            ctrl = ctrl(item, path2);
        }
      }
      return typeof ctrl === "function" ? ctrl(item, path2) : ctrl;
    }
    exports.visit = visit;
  }
});

// node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "node_modules/yaml/dist/parse/cst.js"(exports) {
    "use strict";
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = "\uFEFF";
    var DOCUMENT = "";
    var FLOW_END = "";
    var SCALAR = "";
    var isCollection = (token) => !!token && "items" in token;
    var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case "\n":
        case "\r\n":
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports.createScalarToken = cstScalar.createScalarToken;
    exports.resolveAsScalar = cstScalar.resolveAsScalar;
    exports.setScalarValue = cstScalar.setScalarValue;
    exports.stringify = cstStringify.stringify;
    exports.visit = cstVisit.visit;
    exports.BOM = BOM;
    exports.DOCUMENT = DOCUMENT;
    exports.FLOW_END = FLOW_END;
    exports.SCALAR = SCALAR;
    exports.isCollection = isCollection;
    exports.isScalar = isScalar;
    exports.prettyToken = prettyToken;
    exports.tokenType = tokenType;
  }
});

// node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "node_modules/yaml/dist/parse/lexer.js"(exports) {
    "use strict";
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case "\n":
        case "\r":
        case "	":
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef");
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(",[]{}");
    var invalidAnchorChars = new Set(" ,[]{}\n\r	");
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = "";
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        while (next && (incomplete || this.hasChars(1)))
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === " " || ch === "	")
          ch = this.buffer[++i];
        if (!ch || ch === "#" || ch === "\n")
          return true;
        if (ch === "\r")
          return this.buffer[i + 1] === "\n";
        return false;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent = 0;
          while (ch === " ")
            ch = this.buffer[++indent + offset];
          if (ch === "\r") {
            const next = this.buffer[indent + offset + 1];
            if (next === "\n" || !next && !this.atEnd)
              return offset + indent + 1;
          }
          return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
        }
        if (ch === "-" || ch === ".") {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== "number" || end !== -1 && end < this.pos) {
          end = this.buffer.indexOf("\n", this.pos);
          this.lineEndPos = end;
        }
        if (end === -1)
          return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === "\r")
          end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line2 = this.getLine();
        if (line2 === null)
          return this.setNext("stream");
        if (line2[0] === cst.BOM) {
          yield* this.pushCount(1);
          line2 = line2.substring(1);
        }
        if (line2[0] === "%") {
          let dirEnd = line2.length;
          let cs = line2.indexOf("#");
          while (cs !== -1) {
            const ch = line2[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line2.indexOf("#", cs + 1);
            }
          }
          while (true) {
            const ch = line2[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line2.length - n);
          this.pushNewline();
          return "stream";
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line2.length - sp);
          yield* this.pushNewline();
          return "stream";
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          const s = this.peek(3);
          if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s === "---" ? "doc" : "stream";
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
          this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n;
          return yield* this.parseBlockStart();
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line2 = this.getLine();
        if (line2 === null)
          return this.setNext("doc");
        let n = yield* this.pushIndicators();
        switch (line2[n]) {
          case "#":
            yield* this.pushCount(line2.length - n);
          // fallthrough
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            return "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            n += yield* this.parseBlockScalarHeader();
            n += yield* this.pushSpaces(true);
            yield* this.pushCount(line2.length - n);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line2 = this.getLine();
        if (line2 === null)
          return this.setNext("flow");
        if (indent !== -1 && indent < this.indentNext && line2[0] !== "#" || indent === 0 && (line2.startsWith("---") || line2.startsWith("...")) && isEmpty(line2[3])) {
          const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line2[0] === "]" || line2[0] === "}");
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n = 0;
        while (line2[n] === ",") {
          n += yield* this.pushCount(1);
          n += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line2[n]) {
          case void 0:
            return "flow";
          case "#":
            yield* this.pushCount(line2.length - n);
            return "flow";
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? "flow" : "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "flow";
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ":": {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",") {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return "flow";
            }
          }
          // fallthrough
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote = this.charAt(0);
        let end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'")
            end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n = 0;
            while (this.buffer[end - 1 - n] === "\\")
              n += 1;
            if (n % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf("\n", this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf("\n", cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
          const ch = this.buffer[++i];
          if (ch === "+")
            this.blockScalarKeep = true;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent = 0;
        let ch;
        loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case "\n":
              nl = i2;
              indent = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === "\n")
                break;
            }
            // fallthrough
            default:
              break loop;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent >= this.indentNext) {
          if (this.blockScalarIndent === -1)
            this.indentNext = indent;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf("\n", cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === " ")
          ch = this.buffer[++i];
        if (ch === "	") {
          while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
            ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i2 = nl - 1;
            let ch2 = this.buffer[i2];
            if (ch2 === "\r")
              ch2 = this.buffer[--i2];
            const lastChar = i2;
            while (ch2 === " ")
              ch2 = this.buffer[--i2];
            if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent > lastChar)
              nl = i2;
            else
              break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while (ch = this.buffer[++i]) {
          if (ch === ":") {
            const next = this.buffer[i + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === "\r") {
              if (next === "\n") {
                i += 1;
                ch = "\n";
                next = this.buffer[i + 1];
              } else
                end = i;
            }
            if (next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === "\n") {
              const cs = this.continueScalar(i + 1);
              if (cs === -1)
                break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("plain-scalar");
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? "flow" : "doc";
      }
      *pushCount(n) {
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos += n;
          return n;
        }
        return 0;
      }
      *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
          yield s;
          this.pos += s.length;
          return s.length;
        } else if (allowEmpty)
          yield "";
        return 0;
      }
      *pushIndicators() {
        switch (this.charAt(0)) {
          case "!":
            return (yield* this.pushTag()) + (yield* this.pushSpaces(true)) + (yield* this.pushIndicators());
          case "&":
            return (yield* this.pushUntil(isNotAnchorChar)) + (yield* this.pushSpaces(true)) + (yield* this.pushIndicators());
          case "-":
          // this is an error
          case "?":
          // this is an error outside flow collections
          case ":": {
            const inFlow = this.flowLevel > 0;
            const ch1 = this.charAt(1);
            if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
              if (!inFlow)
                this.indentNext = this.indentValue + 1;
              else if (this.flowKey)
                this.flowKey = false;
              return (yield* this.pushCount(1)) + (yield* this.pushSpaces(true)) + (yield* this.pushIndicators());
            }
          }
        }
        return 0;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i = this.pos + 2;
          let ch = this.buffer[i];
          while (!isEmpty(ch) && ch !== ">")
            ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
        } else {
          let i = this.pos + 1;
          let ch = this.buffer[i];
          while (ch) {
            if (tagChars.has(ch))
              ch = this.buffer[++i];
            else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
              ch = this.buffer[i += 3];
            } else
              break;
          }
          return yield* this.pushToIndex(i, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === "\n")
          return yield* this.pushCount(1);
        else if (ch === "\r" && this.charAt(1) === "\n")
          return yield* this.pushCount(2);
        else
          return 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i];
        } while (ch === " " || allowTabs && ch === "	");
        const n = i - this.pos;
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos = i;
        }
        return n;
      }
      *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
          ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
      }
    };
    exports.Lexer = Lexer;
  }
});

// node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "node_modules/yaml/dist/parse/line-counter.js"(exports) {
    "use strict";
    var LineCounter = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = low + high >> 1;
            if (this.lineStarts[mid] < offset)
              low = mid + 1;
            else
              high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports.LineCounter = LineCounter;
  }
});

// node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "node_modules/yaml/dist/parse/parser.js"(exports) {
    "use strict";
    var cst = require_cst();
    var lexer = require_lexer();
    function includesToken(list4, type) {
      for (let i = 0; i < list4.length; ++i)
        if (list4[i].type === type)
          return true;
      return false;
    }
    function findNonEmptyIndex(list4) {
      for (let i = 0; i < list4.length; ++i) {
        switch (list4[i].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i;
        }
      }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i = prev.length;
      loop: while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
      while (prev[++i]?.type === "space") {
      }
      return prev.splice(i, prev.length);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start") {
        for (const it of fc.items) {
          if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
            if (it.key)
              it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end)
                Array.prototype.push.apply(it.value.end, it.sep);
              else
                it.value.end = it.sep;
            } else
              Array.prototype.push.apply(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = "";
        this.type = "";
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
          this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        if (!incomplete)
          yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (process.env.LOG_TOKENS)
          console.log("|", cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message, source });
          this.offset += source.length;
        } else if (type === "scalar") {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = "scalar";
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case "newline":
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine)
                this.onNewLine(this.offset + source.length);
              break;
            case "space":
              if (this.atNewLine && source[0] === " ")
                this.indent += source.length;
              break;
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
              if (this.atNewLine)
                this.indent += source.length;
              break;
            case "doc-mode":
            case "flow-error-end":
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0)
          yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === "doc-end" && (!top || top.type !== "doc-end")) {
          while (this.stack.length > 0)
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        const token = error ?? this.stack.pop();
        if (!token) {
          const message = "Tried to pop an empty stack";
          yield { type: "error", offset: this.offset, source: "", message };
        } else if (this.stack.length === 0) {
          yield token;
        } else {
          const top = this.peek(1);
          if (token.type === "block-scalar") {
            token.indent = "indent" in top ? top.indent : 0;
          } else if (token.type === "flow-collection" && top.type === "document") {
            token.indent = 0;
          }
          if (token.type === "flow-collection")
            fixFlowSeqItems(token);
          switch (top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token;
              } else {
                Object.assign(it, { key: token, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              const it = top.items[top.items.length - 1];
              if (it.value)
                top.items.push({ start: [], value: token });
              else
                it.value = token;
              break;
            }
            case "flow-collection": {
              const it = top.items[top.items.length - 1];
              if (!it || it.value)
                top.items.push({ start: [], key: token, sep: [] });
              else if (it.sep)
                it.value = token;
              else
                Object.assign(it, { key: token, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop();
              yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            const last = token.items[token.items.length - 1];
            if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
              if (top.type === "document")
                top.end = last.start;
              else
                top.items.push({ start: last.start });
              token.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            const doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            if (this.type === "doc-start")
              doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else
              doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
          this.stack.push(bv);
        else {
          yield {
            type: "error",
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source
          };
        }
      }
      *scalar(scalar) {
        if (this.type === "map-value-ind") {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep;
          if (scalar.end) {
            sep = scalar.end;
            sep.push(this.sourceToken);
            delete scalar.end;
          } else
            sep = [this.sourceToken];
          const map = {
            type: "block-map",
            offset: scalar.offset,
            indent: scalar.indent,
            items: [{ start, key: scalar, sep }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else
          yield* this.lineEnd(scalar);
      }
      *blockScalar(scalar) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar.props.push(this.sourceToken);
            return;
          case "scalar":
            scalar.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf("\n") + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf("\n", nl) + 1;
              }
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map) {
        const it = map.items[map.items.length - 1];
        switch (this.type) {
          case "newline":
            this.onKeyLine = false;
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "space":
          case "comment":
            if (it.value) {
              map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map.indent)) {
                const prev = map.items[map.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  Array.prototype.push.apply(end, it.start);
                  end.push(this.sourceToken);
                  map.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              const st = it.sep[i];
              switch (st.type) {
                case "newline":
                  nl.push(i);
                  break;
                case "space":
                  break;
                case "comment":
                  if (st.indent > map.indent)
                    nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2)
              start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case "explicit-key-ind":
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }]
                });
              }
              this.onKeyLine = true;
              return;
            case "map-value-ind":
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, "newline")) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                    });
                  }
                } else if (it.value) {
                  map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key = it.key;
                  const sep = it.sep;
                  sep.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key, sep }]
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }]
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map.items.push({ start, key: fs, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs);
              } else {
                Object.assign(it, { key: fs, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map);
              if (bv) {
                if (atMapIndent && bv.type !== "block-seq") {
                  map.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                seq.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                const prev = seq.items[seq.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  Array.prototype.push.apply(end, it.start);
                  end.push(this.sourceToken);
                  seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq.indent)
              break;
            if (it.value || includesToken(it.start, "seq-item-ind"))
              seq.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          const bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top && top.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              if (!it || it.sep)
                fc.items.push({ start: [this.sourceToken] });
              else
                it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              if (!it || it.value)
                fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              if (!it || it.value)
                fc.items.push({ start: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (!it || it.value)
                fc.items.push({ start: [], key: fs, sep: [] });
              else if (it.sep)
                this.stack.push(fs);
              else
                Object.assign(it, { key: fs, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv)
            this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep = fc.end.splice(1, fc.end.length);
            sep.push(this.sourceToken);
            const map = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent) {
        if (this.type !== "comment")
          return false;
        if (this.indent <= indent)
          return false;
        return start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        if (this.type !== "doc-mode") {
          if (docEnd.end)
            docEnd.end.push(this.sourceToken);
          else
            docEnd.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
        }
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop();
            yield* this.step();
            break;
          case "newline":
            this.onKeyLine = false;
          // fallthrough
          case "space":
          case "comment":
          default:
            if (token.end)
              token.end.push(this.sourceToken);
            else
              token.end = [this.sourceToken];
            if (this.type === "newline")
              yield* this.pop();
        }
      }
    };
    exports.Parser = Parser;
  }
});

// node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "node_modules/yaml/dist/public-api.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var errors = require_errors();
    var log = require_log();
    var identity = require_identity();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    function parseOptions(options) {
      const prettyErrors = options.prettyErrors !== false;
      const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0)
        return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse(src, reviver, options) {
      let _reviver = void 0;
      if (typeof reviver === "function") {
        _reviver = reviver;
      } else if (options === void 0 && reviver && typeof reviver === "object") {
        options = reviver;
      }
      const doc = parseDocument(src, options);
      if (!doc)
        return null;
      doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        else
          doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify(value, replacer, options) {
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
      }
      if (typeof options === "string")
        options = options.length;
      if (typeof options === "number") {
        const indent = Math.round(options);
        options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
      }
      if (value === void 0) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
          return void 0;
      }
      if (identity.isDocument(value) && !_replacer)
        return value.toString(options);
      return new Document.Document(value, _replacer, options).toString(options);
    }
    exports.parse = parse;
    exports.parseAllDocuments = parseAllDocuments;
    exports.parseDocument = parseDocument;
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/index.js
var require_dist = __commonJS({
  "node_modules/yaml/dist/index.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var Schema = require_Schema();
    var errors = require_errors();
    var Alias = require_Alias();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer = require_lexer();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports.Composer = composer.Composer;
    exports.Document = Document.Document;
    exports.Schema = Schema.Schema;
    exports.YAMLError = errors.YAMLError;
    exports.YAMLParseError = errors.YAMLParseError;
    exports.YAMLWarning = errors.YAMLWarning;
    exports.Alias = Alias.Alias;
    exports.isAlias = identity.isAlias;
    exports.isCollection = identity.isCollection;
    exports.isDocument = identity.isDocument;
    exports.isMap = identity.isMap;
    exports.isNode = identity.isNode;
    exports.isPair = identity.isPair;
    exports.isScalar = identity.isScalar;
    exports.isSeq = identity.isSeq;
    exports.Pair = Pair.Pair;
    exports.Scalar = Scalar.Scalar;
    exports.YAMLMap = YAMLMap.YAMLMap;
    exports.YAMLSeq = YAMLSeq.YAMLSeq;
    exports.CST = cst;
    exports.Lexer = lexer.Lexer;
    exports.LineCounter = lineCounter.LineCounter;
    exports.Parser = parser.Parser;
    exports.parse = publicApi.parse;
    exports.parseAllDocuments = publicApi.parseAllDocuments;
    exports.parseDocument = publicApi.parseDocument;
    exports.stringify = publicApi.stringify;
    exports.visit = visit.visit;
    exports.visitAsync = visit.visitAsync;
  }
});

// src/core/reply.ts
function replyOptions(chat) {
  const r = chat?.reply ?? {};
  return {
    mode: r.mode === "chat" ? "chat" : "theater",
    deepThink: r.deepThink === true,
    note: typeof r.note === "string" ? r.note : ""
  };
}

// src/plugins/tabletop/rules.ts
var PROTAGONIST = "\u4E3B\u89D2";
var CORE_ATTRIBUTES = ["\u529B\u91CF", "\u654F\u6377", "\u4F53\u8D28", "\u611F\u77E5", "\u667A\u529B", "\u610F\u5FD7", "\u9B45\u529B", "\u53E3\u624D"];
var ATTRIBUTE_NOTES = {
  \u529B\u91CF: "\u642C\u3001\u4E3E\u3001\u6253\u3001\u89D2\u529B",
  \u654F\u6377: "\u901F\u5EA6\u3001\u7075\u5DE7\u3001\u5E73\u8861\u3001\u624B\u4E0A\u529F\u592B\u3001\u6F5C\u884C",
  \u4F53\u8D28: "\u8010\u529B\u3001\u625B\u4F24\u3001\u6297\u75C5\u3001\u9152\u91CF",
  \u611F\u77E5: "\u5BDF\u89C9\u3001\u89C2\u5BDF\u3001\u76F4\u89C9",
  \u667A\u529B: "\u77E5\u8BC6\u3001\u63A8\u7406\u3001\u5B66\u4E60",
  \u610F\u5FD7: "\u5B9A\u529B\u3001\u6297\u538B\u3001\u62B5\u6297\u8BF1\u60D1\u548C\u6050\u5413",
  \u9B45\u529B: "\u5916\u8C8C\u548C\u6C14\u8D28\u5E26\u6765\u7684\u5438\u5F15\u529B\u3001\u7B2C\u4E00\u5370\u8C61",
  \u53E3\u624D: "\u8BF4\u670D\u3001\u8C08\u5224\u3001\u6B3A\u9A97\u3001\u8868\u6F14"
};
var LEVELS = [
  [30, "\u5E7C\u7AE5"],
  [50, "\u5B69\u5B50\u3001\u75C5\u5F31\u3001\u5E74\u8FC8"],
  [100, "\u666E\u901A\u6210\u5E74\u7537\u6027"],
  [150, "\u53D7\u8FC7\u8BAD\u7EC3"],
  [200, "\u884C\u4E1A\u9876\u5C16"],
  [300, "\u4EBA\u7C7B\u6781\u9650"]
];
var SKILL_LEVELS = { \u672A\u5B66: 0.5, \u5165\u95E8: 1, \u719F\u7EC3: 1.5, \u7CBE\u901A: 2, \u5927\u5E08: 3 };
var DIFFICULTIES = [["\u7B80\u5355", 50], ["\u666E\u901A", 100], ["\u56F0\u96BE", 150], ["\u5F88\u96BE", 200], ["\u6781\u96BE", 300]];
var TIERS = ["critical", "success", "failure", "fumble"];
var TIER_LABEL = { critical: "\u5927\u6210\u529F", success: "\u6210\u529F", failure: "\u5931\u8D25", fumble: "\u5927\u5931\u8D25" };
var DEFAULT_RULES = { exponent: 3, maxRounds: 5, moodDecay: 0.15 };
function rulesFrom(config) {
  const num7 = (v, min, max, fallback) => typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  return {
    exponent: num7(config.exponent, 1, 8, DEFAULT_RULES.exponent),
    maxRounds: Math.round(num7(config.maxRounds, 1, 10, DEFAULT_RULES.maxRounds)),
    moodDecay: num7(config.moodDecay, 0, 1, DEFAULT_RULES.moodDecay)
  };
}
var clamp = (v, min, max) => Math.min(max, Math.max(min, v));
function successChance(value, difficulty, exponent = DEFAULT_RULES.exponent) {
  const a = Math.max(value, 0.01) ** exponent;
  const d = Math.max(difficulty, 0.01) ** exponent;
  return clamp(a / (a + d), 0.01, 0.99);
}
function successLine(chance) {
  return clamp(Math.round(chance * 100), 1, 99);
}
function tierOf(roll, line2) {
  const critical = Math.max(1, Math.round(line2 / 10));
  const fumbleAbove = 100 - Math.max(1, Math.round((100 - line2) / 10));
  if (roll <= critical) return "critical";
  if (roll <= line2) return "success";
  if (roll > fumbleAbove) return "fumble";
  return "failure";
}
function rollD100(random = Math.random) {
  return Math.min(100, Math.floor(random() * 100) + 1);
}
function clampModifiers(list4) {
  const clean = list4.filter((m) => m && typeof m.factor === "number" && Number.isFinite(m.factor) && m.factor > 0).map((m) => ({ reason: String(m.reason ?? "").trim() || "\u73AF\u5883", factor: clamp(m.factor, 0.25, 4) }));
  const product = clamp(clean.reduce((p, m) => p * m.factor, 1), 0.1, 10);
  return { list: clean, product };
}
var fmt = (n) => Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");

// src/plugins/tabletop/sheet.ts
var import_yaml = __toESM(require_dist(), 1);
var PLUGIN_ID = "tabletop";
var AXES = [
  ["affection", "\u4EB2\u8FD1"],
  ["resentment", "\u6028\u6068"],
  ["trust", "\u4FE1\u4EFB"],
  ["respect", "\u656C\u91CD"],
  ["fear", "\u754F\u60E7"],
  ["attraction", "\u5438\u5F15"]
];
var AXIS_LABEL = Object.fromEntries(AXES);
var TRAITS = ["\u654F\u611F", "\u8BB0\u4EC7", "\u591A\u7591"];
var emptyAxes = () => ({ affection: 0, resentment: 0, trust: 0, respect: 0, fear: 0, attraction: 0 });
var emptySheet = () => ({ custom: {}, characters: {}, relations: [], bonds: [] });
var pairKey = (a, b) => [a, b].sort().join("\0");
var sameBond = (x, a, b) => pairKey(x.between[0], x.between[1]) === pairKey(a, b);
function newCharacter() {
  return { aliases: [], attributes: {}, skills: {}, traits: { \u654F\u611F: 1, \u8BB0\u4EC7: 1, \u591A\u7591: 1 }, status: [] };
}
var isRecord = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
var str = (v) => typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
function num(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const m = v.replace(/[,，\s]/g, "").match(/^[×x*]?(-?\d+(?:\.\d+)?)/i);
    if (m) return Number(m[1]);
  }
  return null;
}
var list = (v) => Array.isArray(v) ? v.map(str).filter(Boolean) : typeof v === "string" && v.trim() ? v.split(/[、,，]/).map((s) => s.trim()).filter(Boolean) : [];
function readStatus(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const item of v) {
    if (typeof item === "string" && item.trim()) {
      out.push({ name: item.trim(), effects: {} });
      continue;
    }
    if (!isRecord(item)) continue;
    const name = str(item["\u540D\u79F0"] ?? item.name);
    if (!name) continue;
    const effects = {};
    const raw = item["\u5F71\u54CD"] ?? item.effects;
    if (isRecord(raw)) {
      for (const [k, f] of Object.entries(raw)) {
        const n = num(f);
        if (n !== null && n > 0) effects[k.trim()] = clamp(n, 0.1, 5);
      }
    }
    const note2 = str(item["\u8BF4\u660E"] ?? item.note);
    out.push({ name, effects, ...note2 ? { note: note2 } : {} });
  }
  return out;
}
function readCharacter(v) {
  const c = newCharacter();
  if (!isRecord(v)) return c;
  c.aliases = list(v["\u522B\u540D"]);
  const attrs = v["\u5C5E\u6027"];
  if (isRecord(attrs)) {
    for (const [k, raw] of Object.entries(attrs)) {
      const n = num(raw);
      if (n !== null) c.attributes[k.trim()] = clamp(Math.round(n), 1, 9999);
    }
  }
  const skills = v["\u7279\u957F"];
  if (isRecord(skills)) {
    for (const [k, raw] of Object.entries(skills)) {
      const level = str(raw);
      if (level in SKILL_LEVELS) c.skills[k.trim()] = level;
    }
  }
  const traits = v["\u6027\u683C"];
  if (isRecord(traits)) {
    for (const t of TRAITS) {
      const n = num(traits[t]);
      if (n !== null) c.traits[t] = clamp(n, 0.5, 2);
    }
  }
  c.status = readStatus(v["\u72B6\u6001"]);
  const basis = v["\u4F9D\u636E"];
  if (typeof basis === "string" && basis.trim()) c.basis = basis.trim();
  else if (isRecord(basis)) c.basis = Object.entries(basis).map(([k, t]) => `${k}\uFF1A${str(t)}`).join("\n");
  const description = str(v["\u7B80\u4ECB"]);
  if (description) c.description = description;
  if (v["\u4E34\u65F6"] === true) c.temporary = true;
  return c;
}
function readRelation(v) {
  if (!isRecord(v)) return null;
  const from = str(v["\u4ECE"]);
  const to = str(v["\u5BF9"]) || PROTAGONIST;
  if (!from || from === to) return null;
  if (from === PROTAGONIST) return null;
  const base = emptyAxes();
  for (const [axis, label] of AXES) {
    const n = num(v[label]);
    if (n !== null) base[axis] = clamp(Math.round(n), 0, 100);
  }
  const familiarity = clamp(Math.round(num(v["\u719F\u6089"]) ?? 0), 0, 100);
  const reasons = list(v["\u7F18\u7531"]).slice(-5).map((text) => ({ turn: 0, text, change: "" }));
  return { from, to, base, mood: emptyAxes(), familiarity, reasons };
}
function readBond(v) {
  if (!isRecord(v)) return null;
  const between = list(v["\u4E4B\u95F4"]);
  const text = str(v["\u73B0\u72B6"]);
  if (between.length !== 2 || between[0] === between[1] || !text) return null;
  const reasons = list(v["\u7F18\u7531"]).slice(-5).map((t) => ({ turn: 0, text: t, change: "" }));
  return { between: [between[0], between[1]], text, reasons };
}
function upsertBond(list4, b) {
  const i = list4.findIndex((x) => sameBond(x, b.between[0], b.between[1]));
  if (i >= 0) list4[i] = b;
  else list4.push(b);
}
function bondFrom(r) {
  const top = AXES.map(([axis, label]) => [label, clamp(Math.round(r.base[axis] + r.mood[axis]), 0, 100)]).filter(([, v]) => v >= 40).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([label]) => label);
  return { between: [r.from, r.to], text: `${r.from}\u5BF9${r.to}${top.length ? `\uFF1A${top.join("\u3001")}` : "\uFF1A\u5E73\u6DE1"}`, reasons: r.reasons };
}
function readSheet(v) {
  const sheet = emptySheet();
  if (!isRecord(v)) return sheet;
  const custom = v["\u81EA\u5B9A\u4E49\u5C5E\u6027"];
  if (isRecord(custom)) {
    for (const [k, raw] of Object.entries(custom)) {
      const r = isRecord(raw) ? raw : {};
      sheet.custom[k.trim()] = { ...str(r["\u8BF4\u660E"]) ? { note: str(r["\u8BF4\u660E"]) } : {}, ...str(r["\u57FA\u51C6"]) ? { anchor: str(r["\u57FA\u51C6"]) } : {} };
    }
  }
  const chars = v["\u89D2\u8272"];
  if (isRecord(chars)) {
    for (const [name, raw] of Object.entries(chars)) sheet.characters[name.trim()] = readCharacter(raw);
  }
  const rels = v["\u6001\u5EA6"];
  if (Array.isArray(rels)) {
    for (const raw of rels) {
      const r = readRelation(raw);
      if (r) upsertRelation(sheet.relations, r);
    }
  }
  const bonds = v["\u5173\u7CFB"];
  if (Array.isArray(bonds)) {
    for (const raw of bonds) {
      const b = readBond(raw);
      if (b) upsertBond(sheet.bonds, b);
    }
  }
  return normalizeSheet(sheet);
}
function parseYamlObject(text) {
  const body = text.replace(/^\s*```[a-z]*\s*\n/i, "").replace(/\n\s*```\s*$/, "");
  let data;
  try {
    data = import_yaml.default.parse(body);
  } catch (error) {
    throw new Error(`\u89D2\u8272\u8868\u4E0D\u662F\u6709\u6548\u7684 YAML\uFF1A${error.message.split("\n")[0]}`);
  }
  if (!isRecord(data)) throw new Error("\u89D2\u8272\u8868\u9700\u8981\u300C\u89D2\u8272\u300D\u300C\u6001\u5EA6\u300D\u548C\u300C\u5173\u7CFB\u300D\u8FD9\u51E0\u90E8\u5206");
  return data;
}
function parseSheetPatch(text) {
  const data = parseYamlObject(text);
  const sheet = readSheet(data);
  if (!Object.keys(sheet.characters).length && !sheet.relations.length && !sheet.bonds.length && !Object.keys(sheet.custom).length) throw new Error("\u89D2\u8272\u8868\u91CC\u6CA1\u6709\u89D2\u8272\uFF0C\u4E5F\u6CA1\u6709\u6001\u5EA6");
  const given = { characters: {}, relations: /* @__PURE__ */ new Map() };
  if (isRecord(data["\u89D2\u8272"])) {
    for (const [name, raw] of Object.entries(data["\u89D2\u8272"])) given.characters[name.trim()] = new Set(isRecord(raw) ? Object.keys(raw) : []);
  }
  if (Array.isArray(data["\u6001\u5EA6"])) {
    for (const raw of data["\u6001\u5EA6"]) {
      if (isRecord(raw)) given.relations.set(`${str(raw["\u4ECE"])}\u2192${str(raw["\u5BF9"]) || PROTAGONIST}`, new Set(Object.keys(raw)));
    }
  }
  return { sheet, given };
}
function upsertRelation(list4, r) {
  const i = list4.findIndex((x) => x.from === r.from && x.to === r.to);
  if (i >= 0) list4[i] = r;
  else list4.push(r);
}
function mergeSheet(base, patch, given) {
  const next = structuredClone(base);
  Object.assign(next.custom, patch.custom);
  for (const [name, c] of Object.entries(patch.characters)) {
    const old = next.characters[name];
    const keys = given?.characters[name];
    if (!old || !keys) {
      next.characters[name] = c;
      continue;
    }
    if (keys.has("\u5C5E\u6027")) Object.assign(old.attributes, c.attributes);
    if (keys.has("\u7279\u957F")) Object.assign(old.skills, c.skills);
    if (keys.has("\u6027\u683C")) Object.assign(old.traits, c.traits);
    if (keys.has("\u72B6\u6001")) old.status = c.status;
    if (keys.has("\u522B\u540D")) old.aliases = c.aliases;
    if (keys.has("\u4F9D\u636E")) old.basis = c.basis;
    if (keys.has("\u7B80\u4ECB")) old.description = c.description;
    if (keys.has("\u4E34\u65F6")) old.temporary = c.temporary;
  }
  for (const r of patch.relations) {
    const old = next.relations.find((x) => x.from === r.from && x.to === r.to);
    const keys = given?.relations.get(`${r.from}\u2192${r.to}`);
    if (!old || !keys) {
      upsertRelation(next.relations, r);
      continue;
    }
    for (const [axis, label] of AXES) {
      if (keys.has(label)) {
        old.base[axis] = r.base[axis];
        old.mood[axis] = 0;
      }
    }
    if (keys.has("\u719F\u6089")) old.familiarity = r.familiarity;
    if (keys.has("\u7F18\u7531")) old.reasons = r.reasons;
  }
  for (const b of patch.bonds) upsertBond(next.bonds, b);
  return next;
}
function removeCharacter(sheet, name) {
  const next = structuredClone(sheet);
  const key = resolveName(next, name);
  if (!key) throw new Error(`\u89D2\u8272\u8868\u91CC\u6CA1\u6709\u300C${name}\u300D`);
  delete next.characters[key];
  next.relations = next.relations.filter((r) => r.from !== key && r.to !== key);
  next.bonds = next.bonds.filter((b) => !b.between.includes(key));
  return next;
}
function renameCharacter(sheet, from, to) {
  if (!from || !to || from === to || !sheet.characters[from] || sheet.characters[to]) return;
  sheet.characters[to] = sheet.characters[from];
  delete sheet.characters[from];
  for (const r of sheet.relations) {
    if (r.from === from) r.from = to;
    if (r.to === from) r.to = to;
  }
  for (const b of sheet.bonds) b.between = b.between.map((x) => x === from ? to : x);
}
function relationValue(r, axis) {
  return clamp(Math.round(r.base[axis] + r.mood[axis]), 0, 100);
}
function characterYaml(name, c) {
  return {
    ...c.aliases.length ? { \u522B\u540D: c.aliases } : {},
    \u5C5E\u6027: c.attributes,
    ...Object.keys(c.skills).length ? { \u7279\u957F: c.skills } : {},
    // Traits shape a character's attitudes; the protagonist has none on record.
    ...name === PROTAGONIST ? {} : { \u6027\u683C: c.traits },
    ...c.status.length ? { \u72B6\u6001: c.status.map((s) => ({ \u540D\u79F0: s.name, ...Object.keys(s.effects).length ? { \u5F71\u54CD: s.effects } : {}, ...s.note ? { \u8BF4\u660E: s.note } : {} })) } : {},
    ...c.description ? { \u7B80\u4ECB: c.description } : {},
    ...c.basis ? { \u4F9D\u636E: c.basis } : {},
    ...c.temporary ? { \u4E34\u65F6: true } : {}
  };
}
function sheetYamlObject(sheet) {
  return {
    ...Object.keys(sheet.custom).length ? { \u81EA\u5B9A\u4E49\u5C5E\u6027: Object.fromEntries(Object.entries(sheet.custom).map(([k, v]) => [k, { ...v.note ? { \u8BF4\u660E: v.note } : {}, ...v.anchor ? { \u57FA\u51C6: v.anchor } : {} }])) } : {},
    \u89D2\u8272: Object.fromEntries(Object.entries(sheet.characters).map(([k, c]) => [k, characterYaml(k, c)])),
    \u6001\u5EA6: sheet.relations.map((r) => ({
      \u4ECE: r.from,
      \u5BF9: r.to,
      ...Object.fromEntries(AXES.map(([axis, label]) => [label, relationValue(r, axis)])),
      \u719F\u6089: r.familiarity,
      ...r.reasons.length ? { \u7F18\u7531: r.reasons.map((x) => x.text) } : {}
    })),
    ...sheet.bonds.length ? {
      \u5173\u7CFB: sheet.bonds.map((b) => ({ \u4E4B\u95F4: b.between, \u73B0\u72B6: b.text, ...b.reasons.length ? { \u7F18\u7531: b.reasons.map((x) => x.text) } : {} }))
    } : {}
  };
}
function sheetToYaml(sheet) {
  return import_yaml.default.stringify(sheetYamlObject(sheet), { lineWidth: 0 }).trimEnd();
}
function resolveName(sheet, name, userName = "") {
  const n = name.replace(/[（(].*?[)）]/g, "").trim();
  if (!n) return null;
  if (sheet.characters[n]) return n;
  if (n === PROTAGONIST || n === userName || /^(我|你|玩家|用户|\{\{user\}\})$/i.test(n)) return sheet.characters[PROTAGONIST] ? PROTAGONIST : null;
  for (const [key, c] of Object.entries(sheet.characters)) {
    if (c.aliases.includes(n)) return key;
  }
  const lower = n.toLowerCase();
  for (const key of Object.keys(sheet.characters)) {
    if (key.toLowerCase() === lower) return key;
  }
  return null;
}
function canonicalName(name, userName = "") {
  const n = name.replace(/[（(].*?[)）]/g, "").trim();
  return n === userName || /^(我|你|玩家|用户)$/.test(n) ? PROTAGONIST : n;
}
function cardSheet(character) {
  const raw = character?.extra?.hearth?.rpg;
  if (!raw || typeof raw !== "object" || !raw.characters) return null;
  return normalizeSheet(raw);
}
function normalizeSheet(raw) {
  const out = structuredClone(raw);
  out.custom ??= {};
  out.characters ??= {};
  for (const c of Object.values(out.characters)) {
    c.aliases ??= [];
    c.attributes ??= {};
    c.skills ??= {};
    c.traits = Object.assign({ \u654F\u611F: 1, \u8BB0\u4EC7: 1, \u591A\u7591: 1 }, c.traits ?? {});
    c.status ??= [];
  }
  const relations = (out.relations ?? []).map((r) => ({ ...r, base: { ...emptyAxes(), ...r.base }, mood: { ...emptyAxes(), ...r.mood }, familiarity: r.familiarity ?? 0, reasons: r.reasons ?? [] }));
  out.bonds = (out.bonds ?? []).map((b) => ({ ...b, reasons: b.reasons ?? [] }));
  out.relations = [];
  for (const r of relations) {
    if (r.from === PROTAGONIST) continue;
    if (r.to === PROTAGONIST) out.relations.push(r);
    else if (!out.bonds.some((b) => sameBond(b, r.from, r.to))) out.bonds.push(bondFrom(r));
  }
  return out;
}
function stateFromSheet(sheet) {
  return { ...structuredClone(sheet), turn: 0, log: [] };
}
function swipeData(message) {
  const swipe = message?.swipes[message.activeSwipe];
  return swipe?.plugins?.[PLUGIN_ID];
}
function messageData(message) {
  return message?.plugins?.[PLUGIN_ID];
}
function stateBefore(chat, index, character) {
  for (let i = Math.min(index, chat.messages.length) - 1; i >= 0; i--) {
    const state = swipeData(chat.messages[i])?.state;
    if (state) return normalizeSheet(state);
  }
  const base = chat.plugins?.[PLUGIN_ID]?.base;
  if (base) return normalizeSheet(base);
  const sheet = cardSheet(character);
  return sheet ? stateFromSheet(sheet) : null;
}

// src/plugins/tabletop/attitude.ts
var MAX_TURN_CHANGE = 30;
var EDGE_FLOOR = 0.4;
var KEEP_REASONS = 5;
var traitOf = (state, name) => state.characters[name]?.traits ?? { \u654F\u611F: 1, \u8BB0\u4EC7: 1, \u591A\u7591: 1 };
function findRelation(state, from, to, create = false) {
  let r = state.relations.find((x) => x.from === from && x.to === to) ?? null;
  if (!r && create) {
    r = { from, to, base: emptyAxes(), mood: emptyAxes(), familiarity: 0, reasons: [] };
    state.relations.push(r);
  }
  return r;
}
function decay(state, rules = DEFAULT_RULES) {
  for (const r of state.relations) {
    const traits = traitOf(state, r.from);
    for (const [axis] of AXES) {
      const rate = axis === "resentment" ? rules.moodDecay / traits.\u8BB0\u4EC7 : rules.moodDecay;
      const next = r.mood[axis] * (1 - clamp(rate, 0, 1));
      r.mood[axis] = Math.abs(next) < 0.5 ? 0 : next;
    }
  }
}
function changeAxis(rel, axis, proposed, traits) {
  let delta = proposed * traits.\u654F\u611F;
  if (axis === "trust") delta = delta > 0 ? delta / traits.\u591A\u7591 : delta * traits.\u591A\u7591;
  delta = clamp(delta, -MAX_TURN_CHANGE, MAX_TURN_CHANGE);
  const now = relationValue(rel, axis);
  if (delta > 0 && now > 50) delta *= EDGE_FLOOR + (1 - EDGE_FLOOR) * (100 - now) / 50;
  if (delta < 0 && now < 50) delta *= EDGE_FLOOR + (1 - EDGE_FLOOR) * now / 50;
  const settle2 = 0.2 + 0.6 * (1 - rel.familiarity / 100);
  rel.base[axis] = clamp(rel.base[axis] + delta * settle2, 0, 100);
  rel.mood[axis] += delta * (1 - settle2);
  const total = rel.base[axis] + rel.mood[axis];
  if (total > 100) rel.mood[axis] -= total - 100;
  if (total < 0) rel.mood[axis] -= total;
  return relationValue(rel, axis) - now;
}
function addReason(rel, turn, text, change) {
  if (!text && !change) return;
  rel.reasons.push({ turn, text, change });
  if (rel.reasons.length > KEEP_REASONS) rel.reasons.splice(0, rel.reasons.length - KEEP_REASONS);
}
function applyAttitude(state, from, to, changes, reason) {
  const rel = findRelation(state, from, to, true);
  const traits = traitOf(state, from);
  const done = [];
  for (const [axis, proposed] of Object.entries(changes)) {
    if (!proposed) continue;
    const real = Math.round(changeAxis(rel, axis, proposed, traits));
    if (real) done.push(`${AXIS_LABEL[axis]}${real > 0 ? "+" : ""}${fmt(real)}`);
  }
  const change = done.join(" ");
  addReason(rel, state.turn, reason, change);
  return change;
}
function changeFamiliarity(state, from, to, delta) {
  const rel = findRelation(state, from, to, true);
  const before = rel.familiarity;
  rel.familiarity = clamp(Math.round(rel.familiarity + clamp(delta, -MAX_TURN_CHANGE, MAX_TURN_CHANGE)), 0, 100);
  return rel.familiarity - before;
}
function describe(rel) {
  const v = Object.fromEntries(AXES.map(([axis]) => [axis, relationValue(rel, axis)]));
  const words = [];
  if (v.affection >= 60 && v.resentment >= 50) words.push("\u7231\u6068\u4EA4\u7EC7");
  if (v.fear >= 60 && v.affection >= 50) words.push("\u53C8\u6015\u53C8\u79BB\u4E0D\u5F00");
  if (v.attraction >= 60 && v.resentment >= 50) words.push("\u6068\uFF0C\u5374\u53C8\u88AB\u5438\u5F15");
  if (v.affection >= 60 && v.trust < 30) words.push("\u559C\u6B22\u4F46\u4E0D\u4FE1\u4EFB");
  if (v.respect >= 60 && v.affection < 30) words.push("\u656C\u800C\u8FDC\u4E4B");
  if (words.length) return words.join("\uFF0C");
  const strong = AXES.map(([axis]) => axis).filter((a) => v[a] >= 40).sort((a, b) => v[b] - v[a]).slice(0, 2);
  const single = {
    affection: ["\u6709\u597D\u611F", "\u4EB2\u8FD1"],
    resentment: ["\u6709\u6028\u6C14", "\u6028\u6068"],
    trust: ["\u4FE1\u5F97\u8FC7", "\u4FE1\u4EFB"],
    respect: ["\u770B\u5F97\u8D77", "\u656C\u91CD"],
    fear: ["\u6709\u4E9B\u6015", "\u754F\u60E7"],
    attraction: ["\u88AB\u5438\u5F15", "\u503E\u5FC3"]
  };
  if (strong.length) return strong.map((a) => single[a][v[a] >= 70 ? 1 : 0]).join("\uFF0C");
  if (rel.familiarity < 20) return "\u964C\u751F";
  return v.trust < 15 && rel.familiarity >= 40 ? "\u4E0D\u4FE1\u4EFB" : "\u5E73\u6DE1";
}

// src/plugins/tabletop/text.ts
function characterLine(name, state, userName) {
  const c = state.characters[name];
  const label = name === PROTAGONIST && userName ? `${PROTAGONIST}\uFF08${userName}\uFF09` : name;
  const order = [...CORE_ATTRIBUTES, ...Object.keys(c.attributes).filter((k) => !CORE_ATTRIBUTES.includes(k))];
  const attrs = order.filter((k) => c.attributes[k] !== void 0).map((k) => `${k}${c.attributes[k]}`).join(" ");
  const parts = [`${label}\uFF1A${attrs || "\uFF08\u5C5E\u6027\u672A\u767B\u8BB0\uFF0C\u6309\u666E\u901A\u4EBA\u4F30\u8BA1\uFF09"}`];
  const skills = Object.entries(c.skills).map(([k, v]) => `${k}\xB7${v}`);
  if (skills.length) parts.push(`\u7279\u957F\uFF1A${skills.join("\u3001")}`);
  const traits = name === PROTAGONIST ? [] : Object.entries(c.traits).filter(([, v]) => v !== 1).map(([k, v]) => `${k}${fmt(v)}`);
  if (traits.length) parts.push(`\u6027\u683C\uFF1A${traits.join(" ")}`);
  if (c.status.length) parts.push(`\u72B6\u6001\uFF1A${c.status.map((s) => `${s.name}${Object.keys(s.effects).length ? `\uFF08${Object.entries(s.effects).map(([k, f]) => `${k}\xD7${fmt(f)}`).join(" ")}\uFF09` : ""}`).join("\u3001")}`);
  if (c.description) parts.push(c.description);
  if (c.temporary) parts.push("\u4E34\u65F6\u767B\u8BB0");
  return parts.join("\uFF5C");
}
function stateText(state, userName, scene) {
  const on = (name) => !scene || name === PROTAGONIST || scene.has(name);
  const lines = ["\u3010\u8DD1\u56E2\u6570\u636E\u3011\uFF08\u5C5E\u6027\u4EE5\u666E\u901A\u6210\u5E74\u7537\u6027 = 100 \u4E3A\u57FA\u51C6\uFF0C\u6309\u500D\u6570\u7406\u89E3\uFF1B\u4E0B\u9762\u7684\u6570\u503C\u662F\u672C\u8F6E\u7684\u4E8B\u5B9E\u4F9D\u636E\uFF09"];
  const custom = Object.entries(state.custom);
  if (custom.length) lines.push(`\u672C\u5361\u5C5E\u6027\uFF1A${custom.map(([k, v]) => `${k}\uFF08${[v.note, v.anchor].filter(Boolean).join("\uFF1B")}\uFF09`).join("\u3001")}`);
  const names = Object.keys(state.characters).sort((a, b) => a === PROTAGONIST ? -1 : b === PROTAGONIST ? 1 : 0);
  for (const name of names.filter(on)) lines.push(characterLine(name, state, userName));
  const relations = state.relations.filter((r) => on(r.from));
  if (relations.length) {
    lines.push("", "\u3010\u5BF9\u4E3B\u89D2\u7684\u6001\u5EA6\u3011\uFF08\u516D\u6761\u7EBF\u5404\u81EA 0\uFF5E100\uFF0C\u4E92\u4E0D\u62B5\u6D88\uFF1B\u4E3B\u89D2\u81EA\u5DF1\u7684\u611F\u60C5\u7531\u73A9\u5BB6\u51B3\u5B9A\uFF0C\u8FD9\u91CC\u4E0D\u8BB0\uFF09");
    for (const r of relations) {
      const values = AXES.map(([axis, label]) => `${label}${relationValue(r, axis)}`).join(" ");
      const recent = r.reasons.slice(-3).map((x) => x.change ? `${x.text}\uFF08${x.change}\uFF09` : x.text).filter(Boolean);
      lines.push(`${r.from}\uFF1A${describe(r)}\uFF08${values}\uFF5C\u719F\u6089${r.familiarity}\uFF09${recent.length ? `\uFF5C\u6700\u8FD1\uFF1A${recent.join("\uFF1B")}` : ""}`);
    }
  }
  const bonds = state.bonds.filter((b) => on(b.between[0]) && on(b.between[1]));
  if (bonds.length) {
    lines.push("", "\u3010\u89D2\u8272\u4E4B\u95F4\u3011");
    for (const b of bonds) {
      const last = b.reasons.at(-1)?.text;
      lines.push(`${b.between[0]}\u4E0E${b.between[1]}\uFF1A${b.text}${last ? `\uFF08${last}\uFF09` : ""}`);
    }
  }
  const away = names.filter((name) => !on(name));
  if (away.length) {
    lines.push("", "\u3010\u5176\u4ED6\u5DF2\u767B\u8BB0\u7684\u89D2\u8272\u3011\uFF08\u8FD9\u4E00\u5E55\u4E0D\u5728\u573A\uFF0C\u53EA\u5217\u540D\u5B57\u548C\u5BF9\u4E3B\u89D2\u7684\u6001\u5EA6\uFF09");
    lines.push(away.map((name) => {
      const r = state.relations.find((x) => x.from === name);
      return r ? `${name}\uFF08${describe(r)}\uFF09` : name;
    }).join("\u3001"));
  }
  return lines.join("\n");
}
function attributeGuide() {
  return CORE_ATTRIBUTES.map((a) => `${a}\uFF08${ATTRIBUTE_NOTES[a]}\uFF09`).join("\u3001");
}
function against(c) {
  return "difficulty" in c.against ? `\u96BE\u5EA6 ${Math.round(c.against.difficulty)}` : `${c.against.opponent}\u7684${c.against.attribute} ${Math.round(c.against.value)}`;
}
function checkResultLine(c, i) {
  return `${i + 1}. ${c.actor} ${c.action}\uFF1A\u6210\u529F\u7387 ${c.line}%\uFF0C\u63B7\u51FA ${c.roll} \u2192 ${TIER_LABEL[c.tier] ?? c.tier}\u3002\u91C7\u7528\u7684\u7ED3\u679C\uFF1A${c.outcome}`;
}
function rulingText(ruling) {
  if (ruling.skipped === "pass") return "";
  if (!ruling.checks.length) return "\u3010\u672C\u8F6E\u68C0\u5B9A\u3011\u672C\u8F6E\u6CA1\u6709\u9700\u8981\u63B7\u9AB0\u7684\u4E8B\u3002";
  const lines = ["\u3010\u672C\u8F6E\u68C0\u5B9A\u7ED3\u679C\u3011\u4EE5\u4E0B\u7ED3\u679C\u5DF2\u7ECF\u53D1\u751F\uFF0C\u6B63\u6587\u5FC5\u987B\u4E0E\u4E4B\u4E00\u81F4\u3002"];
  ruling.checks.forEach((c, i) => {
    const tier = TIER_LABEL[c.tier] ?? c.tier;
    const grounds = `${c.hidden ? "\u6697\u9AB0" : "\u660E\u9AB0"}\uFF5C${c.steps.join(" \xD7 ")} = ${Math.round(c.value)} \u5BF9 ${against(c)}\uFF5C\u6210\u529F\u7387 ${c.line}%\uFF5C\u63B7\u51FA ${c.roll}`;
    lines.push(`${i + 1}. ${c.actor} ${c.action} \u2192 ${tier}\uFF1A${c.outcome}\uFF08${grounds}\uFF09`);
    if (c.hidden) lines.push("   \uFF08\u6697\u9AB0\uFF1A\u4E3B\u89D2\u5E76\u4E0D\u77E5\u9053\u8FD9\u4E2A\u7ED3\u679C\uFF0C\u53EA\u80FD\u901A\u8FC7\u4E3B\u89D2\u770B\u5F97\u5230\u3001\u542C\u5F97\u5230\u7684\u8868\u73B0\u4F53\u73B0\u51FA\u6765\u3002\uFF09");
  });
  return lines.join("\n");
}

// src/plugins/tabletop/adapt.ts
var ADDRESS = "\u8DD1\u56E2\u89D2\u8272\u8868";
var REQUEST = "\u8BF7\u4E3A\u8FD9\u5F20\u5361\u505A\u8DD1\u56E2\u6570\u636E\u5316\u9002\u914D\uFF1A\u901A\u8BFB\u89D2\u8272\u5361\u548C\u4E16\u754C\u4E66\uFF0C\u4E3A\u4E3B\u89D2\u548C\u6240\u6709\u91CD\u8981\u89D2\u8272\u5EFA\u7ACB\u89D2\u8272\u8868\uFF08\u5C5E\u6027\u3001\u7279\u957F\u3001\u6027\u683C\u7CFB\u6570\u3001\u521D\u59CB\u72B6\u6001\uFF0C\u6BCF\u9879\u9644\u539F\u6587\u4F9D\u636E\uFF09\uFF0C\u5199\u51FA\u4ED6\u4EEC\u5BF9\u4E3B\u89D2\u7684\u521D\u59CB\u6001\u5EA6\uFF0C\u4EE5\u53CA\u4ED6\u4EEC\u5F7C\u6B64\u4E4B\u95F4\u7684\u5173\u7CFB\u3002";
var RELEVANT = /跑团|数据化|角色表|属性|态度|关系|特长|性格系数/;
var EXAMPLE = `\u3010\u6539\u5199\u3011${ADDRESS}
\u89D2\u8272:
  ${PROTAGONIST}:
    \u5C5E\u6027: { \u529B\u91CF: 95, \u654F\u6377: 120, \u4F53\u8D28: 100, \u611F\u77E5: 115, \u667A\u529B: 125, \u610F\u5FD7: 105, \u9B45\u529B: 110, \u53E3\u624D: 130 }
    \u7279\u957F: { \u5F00\u9501: \u7CBE\u901A, \u5251\u672F: \u5165\u95E8 }
    \u4F9D\u636E: \u5F00\u573A\u767D\u5199\u4E3B\u89D2\u662F\u9501\u5320\u5B66\u5F92\uFF0C\u300C\u624B\u6BD4\u8111\u5B50\u5FEB\u300D
  \u6797\u665A:
    \u522B\u540D: [\u665A\u665A]
    \u5C5E\u6027: { \u529B\u91CF: 70, \u654F\u6377: 135, \u4F53\u8D28: 90, \u611F\u77E5: 140, \u667A\u529B: 120, \u610F\u5FD7: 150, \u9B45\u529B: 160, \u53E3\u624D: 105 }
    \u7279\u957F: { \u5251\u672F: \u719F\u7EC3 }
    \u6027\u683C: { \u654F\u611F: 1.3, \u8BB0\u4EC7: 1.8, \u591A\u7591: 1.5 }
    \u72B6\u6001:
      - { \u540D\u79F0: \u65E7\u4F24\u672A\u6108, \u5F71\u54CD: { \u4F53\u8D28: 0.8 }, \u8BF4\u660E: \u5DE6\u80A9\u7684\u5200\u4F24\u8FD8\u6CA1\u597D }
    \u4F9D\u636E: \u8BBE\u5B9A\u5199\u5979\u300C\u81EA\u5E7C\u4E60\u5251\u300D\u300C\u8BB0\u4EC7\uFF0C\u4E00\u7B14\u4E00\u7B14\u90FD\u8BB0\u7740\u300D
  \u6C88\u638C\u67DC:
    \u5C5E\u6027: { \u529B\u91CF: 90, \u654F\u6377: 80, \u4F53\u8D28: 95, \u611F\u77E5: 130, \u667A\u529B: 140, \u610F\u5FD7: 120, \u9B45\u529B: 100, \u53E3\u624D: 150 }
    \u4F9D\u636E: \u8BBE\u5B9A\u5199\u4ED6\u300C\u7B11\u9762\u864E\uFF0C\u8D26\u7B97\u5F97\u6BD4\u8C01\u90FD\u7CBE\u300D
\u6001\u5EA6:
  - { \u4ECE: \u6797\u665A, \u5BF9: ${PROTAGONIST}, \u4EB2\u8FD1: 60, \u6028\u6068: 55, \u4FE1\u4EFB: 25, \u656C\u91CD: 40, \u754F\u60E7: 0, \u5438\u5F15: 45, \u719F\u6089: 85, \u7F18\u7531: [\u4E09\u5E74\u524D\u4E3B\u89D2\u4E0D\u544A\u800C\u522B] }
  - { \u4ECE: \u6C88\u638C\u67DC, \u5BF9: ${PROTAGONIST}, \u4EB2\u8FD1: 20, \u6028\u6068: 0, \u4FE1\u4EFB: 30, \u656C\u91CD: 35, \u754F\u60E7: 0, \u5438\u5F15: 0, \u719F\u6089: 30, \u7F18\u7531: [\u4E3B\u89D2\u5E38\u6765\u5E97\u91CC\u8D4A\u8D26] }
\u5173\u7CFB:
  - { \u4E4B\u95F4: [\u6797\u665A, \u6C88\u638C\u67DC], \u73B0\u72B6: \u8868\u9762\u5BA2\u6C14\uFF0C\u6697\u4E2D\u63D0\u9632, \u7F18\u7531: [\u6C88\u638C\u67DC\u66FE\u628A\u6797\u5BB6\u7684\u6D88\u606F\u5356\u7ED9\u4EC7\u5BB6] }`;
function wanted(ctx) {
  if (cardSheet(ctx.character)) return true;
  const recent = ctx.messages.filter((m) => m.mode === "edit" && m.role === "user").slice(-8);
  return recent.some((m) => RELEVANT.test(m.swipes[m.activeSwipe]?.content ?? ""));
}
function instruction(ctx) {
  if (!wanted(ctx)) return "";
  const sheet = cardSheet(ctx.character);
  const persona = ctx.persona?.description?.trim();
  return [
    "# \u8DD1\u56E2\u89D2\u8272\u8868\uFF08\u6570\u636E\u5316\u9002\u914D\uFF09",
    "",
    `\u7528\u6237\u8981\u6C42\u6570\u636E\u5316\u9002\u914D\u3001\u6216\u8981\u4FEE\u6539\u8DD1\u56E2\u89D2\u8272\u8868\u65F6\uFF0C\u5728 <card_edit> \u5757\u91CC\u7528\u5730\u5740\u300C${ADDRESS}\u300D\u5199 YAML\u3002\u7528\u6237\u626E\u6F14\u7684\u89D2\u8272\u5728\u8868\u91CC\u56FA\u5B9A\u53EB\u300C${PROTAGONIST}\u300D\uFF08\u6545\u4E8B\u91CC\u7684\u540D\u5B57\u662F\u300C${ctx.userName}\u300D\uFF09\u3002`,
    "",
    "## \u89C4\u5219",
    `- \u5C5E\u6027\uFF1A${attributeGuide()}\u3002\u666E\u901A\u6210\u5E74\u7537\u6027 = 100\uFF0C\u6309\u500D\u6570\u7406\u89E3\uFF08200 \u5C31\u662F\u666E\u901A\u4EBA\u7684\u4E24\u500D\uFF09\u3002\u53C2\u7167\uFF1A${LEVELS.map(([v, w]) => `${v} ${w}`).join("\uFF5C")}\uFF5C300 \u4EE5\u4E0A \u8D85\u51FA\u4EBA\u7C7B\u3002`,
    "- \u7167\u53C2\u7167\u8868\u6253\u5206\uFF0C\u5E76\u6309\u5361\u7247\u7684\u63CF\u5199\u62C9\u5F00\u5DEE\u8DDD\uFF1A\u540C\u4E00\u4E2A\u4EBA\u7684\u5C5E\u6027\u8981\u6709\u9AD8\u6709\u4F4E\uFF0C\u5973\u6027\u3001\u5B69\u5B50\u3001\u8001\u4EBA\u3001\u975E\u4EBA\u751F\u7269\u6309\u5B9E\u9645\u60C5\u51B5\u4F30\u8BA1\uFF0C\u4E0D\u8981\u90FD\u5199\u6210 100\u3002",
    "- \u5361\u7247\u4E16\u754C\u91CC\u666E\u901A\u4EBA\u6CA1\u6709\u7684\u80FD\u529B\uFF08\u9B54\u529B\u3001\u7075\u529B\u3001\u5F02\u80FD\u7B49\uFF09\u5199\u5728\u300C\u81EA\u5B9A\u4E49\u5C5E\u6027\u300D\u91CC\uFF0C\u5199\u660E\u300C\u8BF4\u660E\u300D\u548C\u300C\u57FA\u51C6\u300D\uFF08100 \u4EE3\u8868\u8FD9\u4E2A\u4E16\u754C\u91CC\u4EC0\u4E48\u6C34\u5E73\uFF09\uFF0C\u518D\u5728\u89D2\u8272\u7684\u5C5E\u6027\u91CC\u6253\u5206\u3002",
    `- \u7279\u957F\uFF1A\u6863\u4F4D\u53EA\u80FD\u662F ${Object.keys(SKILL_LEVELS).join("\u3001")}\uFF0C\u68C0\u5B9A\u65F6\u5206\u522B\u4E58\u4EE5 ${Object.values(SKILL_LEVELS).join("\u3001")}\u3002\u53EA\u5199\u89D2\u8272\u771F\u6B63\u64C5\u957F\u7684\u3002`,
    "- \u6027\u683C\u7CFB\u6570\uFF080.5\uFF5E2\uFF0C\u9ED8\u8BA4 1\uFF09\uFF1A\u654F\u611F\uFF08\u6001\u5EA6\u53D8\u5316\u7684\u5E45\u5EA6\uFF09\u3001\u8BB0\u4EC7\uFF08\u6028\u6068\u6D88\u9000\u7684\u5FEB\u6162\uFF0C\u8D8A\u5927\u8D8A\u6162\uFF09\u3001\u591A\u7591\uFF08\u8D8A\u5927\u4FE1\u4EFB\u8D8A\u96BE\u5EFA\u7ACB\u3001\u8D8A\u5BB9\u6613\u5931\u53BB\uFF09\u3002",
    "- \u72B6\u6001\uFF1A\u5F00\u5C40\u5C31\u6709\u7684\u4F24\u75C5\u3001\u9189\u9152\u3001\u75B2\u60EB\u7B49\uFF0C\u53EF\u4EE5\u5E26\u5C5E\u6027\u500D\u7387\uFF08\u5982 \u4F53\u8D28: 0.8\uFF09\u3002",
    `- \u6001\u5EA6\uFF1A\u53EA\u5199\u5176\u4ED6\u89D2\u8272\u5BF9${PROTAGONIST}\u7684\u6001\u5EA6\uFF08\u300C\u4ECE\u300D\u662F\u89D2\u8272\uFF0C\u300C\u5BF9\u300D\u56FA\u5B9A\u662F${PROTAGONIST}\uFF09\u3002\u516D\u6761\u7EBF\uFF1A\u4EB2\u8FD1\u3001\u6028\u6068\u3001\u4FE1\u4EFB\u3001\u656C\u91CD\u3001\u754F\u60E7\u3001\u5438\u5F15\uFF0C\u5404 0\uFF5E100\uFF0C\u4E92\u4E0D\u62B5\u6D88\uFF0C\u7231\u548C\u6068\u53EF\u4EE5\u540C\u65F6\u5F88\u9AD8\uFF1B\u53E6\u6709\u719F\u6089 0\uFF5E100\u3002\u7F18\u7531\u5199\u5F62\u6210\u8FD9\u4EFD\u6001\u5EA6\u7684\u5F80\u4E8B\u3002\u6BCF\u4E2A\u91CD\u8981\u89D2\u8272\u90FD\u5199\u4E00\u4EFD\u3002`,
    `- ${PROTAGONIST}\u5BF9\u522B\u4EBA\u7684\u611F\u60C5\u7531\u73A9\u5BB6\u51B3\u5B9A\uFF0C\u4E0D\u5199\uFF1B${PROTAGONIST}\u4E5F\u4E0D\u9700\u8981\u6027\u683C\u7CFB\u6570\u3002`,
    "- \u5173\u7CFB\uFF1A\u91CD\u8981\u89D2\u8272\u5F7C\u6B64\u4E4B\u95F4\u7684\u5173\u7CFB\u4E0D\u6253\u5206\uFF0C\u7528\u51E0\u4E2A\u5B57\u5199\u300C\u73B0\u72B6\u300D\uFF0C\u9644\u7F18\u7531\uFF0C\u4F8B\u5982\u300C\u8868\u9762\u5BA2\u6C14\uFF0C\u6697\u4E2D\u63D0\u9632\u300D\u3002\u53EA\u5199\u5361\u7247\u91CC\u4EA4\u4EE3\u8FC7\u3001\u4F1A\u5F71\u54CD\u5267\u60C5\u7684\u51E0\u5BF9\u3002",
    `- \u96BE\u5EA6\u53C2\u8003\uFF08\u4E4B\u540E\u7684\u68C0\u5B9A\u4F1A\u7528\u5230\uFF09\uFF1A${DIFFICULTIES.map(([w, v]) => `${w} ${v}`).join("\u3001")}\u3002`,
    `- \u4E3B\u89D2\u7684\u8BBE\u5B9A\u6765\u81EA\u5361\u7247\u5BF9 {{user}} \u7684\u63CF\u5199${persona ? "\u548C\u4E0B\u9762\u7684\u7528\u6237\u89D2\u8272\u8BBE\u5B9A" : ""}\uFF1B\u5361\u7247\u6CA1\u5199\u7684\uFF0C\u6309\u666E\u901A\u6210\u5E74\u4EBA\u4F30\u8BA1\u3002`,
    "- \u4F9D\u636E\uFF1A\u6BCF\u4E2A\u89D2\u8272\u5199\u4E00\u4E24\u53E5\uFF0C\u5F15\u7528\u5361\u7247\u6216\u4E16\u754C\u4E66\u7684\u539F\u6587\u8BF4\u660E\u6570\u503C\u4ECE\u4F55\u800C\u6765\u3002",
    "",
    "## \u5199\u6CD5",
    `- \u3010\u6539\u5199\u3011${ADDRESS}\uFF1A\u53EA\u6709\u5199\u5230\u7684\u90E8\u5206\u4F1A\u53D8\u3002\u5C5E\u6027\u3001\u7279\u957F\u3001\u6027\u683C\u6309\u9879\u5408\u5E76\uFF08\u53EA\u5199\u8981\u6539\u7684\u90A3\u51E0\u9879\u5373\u53EF\uFF09\uFF0C\u72B6\u6001\u3001\u522B\u540D\u3001\u4F9D\u636E\u5199\u4E86\u5C31\u6574\u4F53\u66FF\u6362\uFF1B\u6001\u5EA6\u6309\u300C\u4ECE\u300D\u627E\u5230\u540C\u4E00\u4E2A\u89D2\u8272\uFF0C\u53EA\u6539\u5199\u5230\u7684\u7EBF\uFF1B\u5173\u7CFB\u6309\u300C\u4E4B\u95F4\u300D\u7684\u4E24\u4E2A\u4EBA\u6574\u6761\u66FF\u6362\u3002\u6CA1\u5199\u5230\u7684\u89D2\u8272\u3001\u6001\u5EA6\u548C\u5173\u7CFB\u4FDD\u6301\u4E0D\u53D8\u3002`,
    `- \u3010\u5220\u9664\u3011${ADDRESS} \u203A \u89D2\u8272\u540D\uFF1A\u5220\u9664\u8FD9\u4E2A\u89D2\u8272\u548C\u4E0E\u4ED6\u6709\u5173\u7684\u6001\u5EA6\u3001\u5173\u7CFB\u3002`,
    "- \u4E0D\u8981\u6539\u52A8\u5361\u7247\u548C\u4E16\u754C\u4E66\u91CC\u7684\u5176\u4ED6\u5185\u5BB9\uFF0C\u9664\u975E\u7528\u6237\u4E5F\u8981\u6C42\u4E86\u3002",
    "",
    "\u793A\u4F8B\uFF1A",
    "```",
    EXAMPLE,
    "```",
    ...persona ? ["", `## \u7528\u6237\u89D2\u8272\u300C${ctx.userName}\u300D\u7684\u8BBE\u5B9A`, persona] : [],
    "",
    "## \u5F53\u524D\u7684\u8DD1\u56E2\u89D2\u8272\u8868",
    sheet ? `\`\`\`yaml
${sheetToYaml(sheet)}
\`\`\`` : "\uFF08\u8FD8\u6CA1\u6709\uFF09"
  ].join("\n");
}
function write(next) {
  return [{ op: "set", path: ["extra", "hearth", "rpg"], value: next }];
}
var adaptTask = {
  id: "adapt",
  label: "\u6570\u636E\u5316\u9002\u914D",
  hint: "\u8BA9 AI \u901A\u8BFB\u5361\u7247\uFF0C\u5EFA\u7ACB\u8DD1\u56E2\u89D2\u8272\u8868\uFF08\u5C5E\u6027\u3001\u7279\u957F\u3001\u6001\u5EA6\uFF09",
  request: REQUEST,
  address: ADDRESS,
  instruction,
  apply(op, ctx) {
    const current = cardSheet(ctx.character);
    const before = current ? sheetToYaml(current) : "";
    if (op.action === "\u5220\u9664") {
      if (!op.path.length) throw new Error("\u8BF7\u5199\u660E\u8981\u5220\u9664\u54EA\u4E2A\u89D2\u8272\uFF0C\u4F8B\u5982\u300C\u8DD1\u56E2\u89D2\u8272\u8868 \u203A \u6797\u665A\u300D");
      if (!current) throw new Error("\u8FD9\u5F20\u5361\u8FD8\u6CA1\u6709\u8DD1\u56E2\u89D2\u8272\u8868");
      const next2 = removeCharacter(current, op.path[0]);
      return { ops: write(next2), label: `${ADDRESS} \u203A ${op.path[0]}`, before, after: sheetToYaml(next2) };
    }
    if (op.action !== "\u6539\u5199" && op.action !== "\u65B0\u589E") throw new Error(`${ADDRESS}\u53EA\u652F\u6301\u3010\u6539\u5199\u3011\u548C\u3010\u5220\u9664\u3011`);
    const { sheet: patch, given } = parseSheetPatch(op.body);
    const next = mergeSheet(current ?? emptySheet(), patch, given);
    const names = [...Object.keys(patch.characters), ...patch.relations.length ? [`${patch.relations.length} \u6761\u6001\u5EA6`] : []];
    return { ops: write(next), label: `${ADDRESS}${names.length ? `\uFF08${names.slice(0, 4).join("\u3001")}${names.length > 4 ? " \u7B49" : ""}\uFF09` : ""}`, before, after: sheetToYaml(next) };
  }
};

// src/plugins/tabletop/world/tools.ts
var SCENE_TOOL_NAME = "hearth_scene";
var SETUP_TOOL_NAME = "hearth_setup";
var WORLD_TOOLS = [SCENE_TOOL_NAME, SETUP_TOOL_NAME, "hearth_act", "hearth_day", "hearth_profile"];
var str2 = (v) => typeof v === "string" ? v.trim() : "";
var num2 = (v) => typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : void 0;
var isRecord2 = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
var list2 = (v) => Array.isArray(v) ? v : [];
var CHECK_WORLD_PROPERTIES = {
  time: {
    type: "object",
    description: "\u8FD9\u4E00\u8F6E\u4F1A\u8FC7\u53BB\u591A\u4E45\uFF08\u4E0D\u542B\u8DEF\u4E0A\u7684\u65F6\u95F4\uFF0C\u8DEF\u7A0B\u7531 Hearth \u8BA1\u7B97\uFF09",
    properties: {
      minutes: { type: "number", description: "\u5728\u76EE\u7684\u5730\u6216\u539F\u5730\u505A\u8FD9\u4E9B\u4E8B\u8981\u591A\u5C11\u5206\u949F\uFF0C\u6700\u591A 180" },
      until: { type: "string", description: "\u53EA\u5728\u7761\u89C9\u6216\u8DF3\u8FC7\u65F6\u95F4\u65F6\u5199\uFF1A\u660E\u786E\u7684\u7ED3\u675F\u65F6\u523B\uFF0C\u683C\u5F0F 2026-03-03 07:00" },
      activity: { type: "string", enum: ["\u65E5\u5E38", "\u7761\u89C9", "\u4F53\u529B\u6D3B"], description: "\u8FD9\u6BB5\u65F6\u95F4\u4E3B\u8981\u5728\u505A\u4EC0\u4E48" },
      routine: { type: "boolean", description: "\u8DF3\u8FC7\u65F6\u95F4\u65F6\uFF0C\u4E3B\u89D2\u7167\u5E38\u6309\u4F5C\u606F\u8FC7\uFF08\u4E0A\u73ED\u3001\u56DE\u5BB6\uFF09" }
    }
  },
  move: {
    type: "object",
    description: "\u4E3B\u89D2\u8FD9\u4E00\u8F6E\u8981\u53BB\u522B\u7684\u5730\u65B9\u65F6\u5199\uFF1B\u4E0D\u52A8\u5C31\u4E0D\u5199",
    properties: {
      to: { type: "string", description: "\u53BB\u54EA\uFF1A\u5730\u56FE\u4E0A\u7684\u5730\u70B9\u540D\uFF0C\u6216\u8005\u300C\u5BB6\u300D\u300C\u516C\u53F8\u300D\uFF1B\u5730\u56FE\u4E0A\u6CA1\u6709\u7684\u5730\u65B9\u5199\u4E00\u4E2A\u5177\u4F53\u7684\u540D\u5B57" },
      by: { type: "string", description: "\u600E\u4E48\u53BB\uFF1A\u6B65\u884C\u3001\u9A91\u8F66\u3001\u5730\u94C1\u3001\u516C\u4EA4\u3001\u6253\u8F66\u3001\u5F00\u8F66\uFF1B\u4E0D\u5199\u5C31\u6309\u4E3B\u89D2\u7684\u4E60\u60EF" },
      with: { type: "array", items: { type: "string" }, description: "\u4E00\u8D77\u53BB\u7684\u89D2\u8272" },
      leave: { type: "string", description: "\u4E0D\u9A6C\u4E0A\u8D70\u3001\u8FC7\u4E00\u9635\u624D\u51FA\u53D1\u65F6\u5199\u51FA\u53D1\u7684\u65F6\u523B HH:MM\uFF08\u51FA\u53D1\u524D\u4E3B\u89D2\u8FD8\u5728\u539F\u5730\uFF09" }
    },
    required: ["to"]
  }
};
function parseTurnAsk(args) {
  if (!args) return void 0;
  const time = isRecord2(args.time) ? args.time : {};
  const move = isRecord2(args.move) ? args.move : null;
  const ask2 = {};
  const minutes = num2(time.minutes);
  if (minutes !== void 0) ask2.minutes = minutes;
  if (str2(time.until)) ask2.until = str2(time.until);
  if (["\u65E5\u5E38", "\u7761\u89C9", "\u4F53\u529B\u6D3B"].includes(str2(time.activity))) ask2.activity = str2(time.activity);
  if (time.routine === true) ask2.routine = true;
  if (move && str2(move.to)) ask2.move = { to: str2(move.to), ...str2(move.by) ? { by: str2(move.by) } : {}, with: list2(move.with).map(str2).filter(Boolean), ...str2(move.leave) ? { leave: str2(move.leave) } : {} };
  return Object.keys(ask2).length ? ask2 : void 0;
}
var SETTLE_WORLD_PROPERTY = {
  world: {
    type: "object",
    description: "\u4E16\u754C\u7684\u8BB0\u8D26\uFF1A\u8FD9\u6BB5\u56DE\u590D\u91CC\u4E3B\u89D2\u8FD9\u8FB9\u53D1\u751F\u7684\u4E8B",
    properties: {
      extra_minutes: { type: "number", description: "\u6B63\u6587\u6BD4\u8BA1\u5212\u7684\u65F6\u95F4\u6BB5\u591A\u5199\u4E86\u591A\u5C11\u5206\u949F\uFF08\u4F8B\u5982\u7761\u7740\u4E86\u3001\u804A\u8FC7\u4E86\u5934\uFF09\uFF1B\u6CA1\u6709\u5199 0" },
      ate: { type: "string", enum: ["\u6B63\u9910", "\u70B9\u5FC3"], description: "\u4E3B\u89D2\u8FD9\u6BB5\u65F6\u95F4\u5403\u4E86\u4E1C\u897F\u624D\u5199" },
      money: {
        type: "array",
        description: "\u989D\u5916\u7684\u6536\u652F\uFF08\u4E09\u9910\u65E5\u7528\u6BCF\u5929\u5DF2\u7ECF\u6309\u751F\u6D3B\u6C34\u5E73\u6263\u8FC7\uFF0C\u8F66\u8D39 Hearth \u5DF2\u7ECF\u7B97\u8FC7\uFF0C\u90FD\u4E0D\u8981\u518D\u5199\uFF09",
        items: { type: "object", properties: { amount: { type: "number", description: "\u82B1\u94B1\u5199\u8D1F\u6570\uFF0C\u6536\u5165\u5199\u6B63\u6570" }, reason: { type: "string" } }, required: ["amount", "reason"] }
      },
      moves: {
        type: "array",
        description: "\u5728\u573A\u7684\u89D2\u8272\u79BB\u5F00\u6216\u53BB\u4E86\u522B\u5904",
        items: { type: "object", properties: { who: { type: "string" }, to: { type: "string" } }, required: ["who", "to"] }
      },
      commitments: {
        type: "array",
        description: "\u8FD9\u6BB5\u56DE\u590D\u91CC\u65B0\u7B54\u5E94\u3001\u7EA6\u597D\u7684\u4E8B\uFF0C\u4F8B\u5982\u7EA6\u4E86\u65F6\u95F4\u5730\u70B9\u89C1\u9762\u3001\u7B54\u5E94\u5468\u4E94\u524D\u8FD8\u94B1",
        items: {
          type: "object",
          properties: {
            with: { type: "string", description: "\u548C\u8C01" },
            what: { type: "string", description: "\u7EA6\u4E86\u4EC0\u4E48" },
            at: { type: "string", description: "\u4EC0\u4E48\u65F6\u5019\uFF0C\u683C\u5F0F 2026-03-06 19:00\uFF1B\u6CA1\u6709\u5177\u4F53\u65F6\u95F4\u4E0D\u5199" },
            place: { type: "string", description: "\u5728\u54EA\uFF0C\u5730\u70B9\u540D\uFF1B\u6CA1\u6709\u5C31\u4E0D\u5199" }
          },
          required: ["with", "what"]
        }
      },
      done: { type: "array", items: { type: "string" }, description: "\u8FD9\u6BB5\u56DE\u590D\u91CC\u5B8C\u6210\u4E86\u7684\u7EA6\u5B9A\uFF08\u5199\u7EA6\u5B9A\u7684\u540D\u5B57\uFF09" },
      messages: {
        type: "array",
        description: "\u4E3B\u89D2\u7528\u624B\u673A\u53D1\u51FA\u7684\u6D88\u606F",
        items: { type: "object", properties: { to: { type: "string" }, text: { type: "string" } }, required: ["to", "text"] }
      },
      contacts: { type: "array", items: { type: "string" }, description: "\u548C\u4E3B\u89D2\u4EA4\u6362\u4E86\u8054\u7CFB\u65B9\u5F0F\u7684\u4EBA" },
      read: { type: "boolean", description: "\u4E3B\u89D2\u770B\u4E86\u624B\u673A\u4E0A\u6CA1\u770B\u7684\u6D88\u606F" },
      witnessed: {
        type: "array",
        description: "\u5728\u573A\u7684\u8BA4\u8BC6\u7684\u4EBA\u4EB2\u773C\u770B\u5230\u7684\u3001\u548C\u4E3B\u89D2\u6709\u5173\u7684\u4E8B\uFF08\u4ED6\u4EEC\u4EE5\u540E\u4F1A\u8BB0\u5F97\uFF09",
        items: { type: "object", properties: { who: { type: "array", items: { type: "string" } }, what: { type: "string" } }, required: ["who", "what"] }
      },
      told: {
        type: "array",
        description: "\u4E3B\u89D2\u5F53\u9762\u544A\u8BC9\u4E86\u8C01\u4EC0\u4E48\uFF08\u5BF9\u65B9\u4F1A\u8BB0\u5F97\uFF09",
        items: { type: "object", properties: { to: { type: "string" }, what: { type: "string" } }, required: ["to", "what"] }
      },
      met: {
        type: "array",
        description: "\u548C\u4E3B\u89D2\u6253\u8FC7\u4EA4\u9053\uFF08\u8BF4\u8FC7\u8BDD\u3001\u6709\u8FC7\u6765\u5F80\uFF09\u6216\u4E3B\u89D2\u7279\u610F\u7559\u610F\u7684\u4EBA\uFF1A\u3010\u8FD9\u91CC\u7684\u4EBA\u3011\u91CC\u7684\u5199\u7F16\u53F7\u548C\u79F0\u547C\uFF1B\u6B63\u6587\u91CC\u51FA\u73B0\u3001\u3010\u8FD9\u91CC\u7684\u4EBA\u3011\u91CC\u6CA1\u6709\u7684\uFF0C\u4E0D\u5199\u7F16\u53F7\uFF0C\u5199\u79F0\u547C\u548C\u770B\u5230\u7684\u6837\u5B50\u3002\u77E5\u9053\u540D\u5B57\u5C31\u5199\u540D\u5B57",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "\u3010\u8FD9\u91CC\u7684\u4EBA\u3011\u91CC\u7684\u7F16\u53F7\uFF1B\u4E0D\u5728\u91CC\u9762\u7684\u4E0D\u5199" },
            name: { type: "string", description: "\u540D\u5B57\uFF0C\u4E0D\u77E5\u9053\u5C31\u5199\u79F0\u547C\uFF0C\u4F8B\u5982\u300C\u7A7F\u7C73\u8272\u98CE\u8863\u7684\u5973\u751F\u300D" },
            looks: { type: "string", description: "\u4E0D\u5728\u3010\u8FD9\u91CC\u7684\u4EBA\u3011\u91CC\u7684\u624D\u5199\uFF1A\u6B63\u6587\u91CC\u5199\u5230\u7684\u6837\u5B50\uFF08\u5927\u6982\u7684\u5E74\u7EAA\u3001\u6027\u522B\u3001\u7A7F\u7740\u3001\u663E\u773C\u7684\u7279\u5F81\uFF09" },
            gender: { type: "string", enum: ["\u7537", "\u5973"] },
            age: { type: "number", description: "\u770B\u8D77\u6765\u7684\u5C81\u6570" },
            doing: { type: "string", description: "\u6B64\u523B\u5728\u505A\u4EC0\u4E48" },
            gone: { type: "boolean", description: "\u8FD9\u4E00\u6BB5\u7ED3\u675F\u65F6\u5DF2\u7ECF\u79BB\u5F00\u4E3B\u89D2\u8EAB\u8FB9" }
          },
          required: ["name"]
        }
      },
      places: {
        type: "array",
        description: "\u6B63\u6587\u91CC\u51FA\u73B0\u3001\u5730\u56FE\u4E0A\u8FD8\u6CA1\u6709\u7684\u5730\u70B9",
        items: { type: "object", properties: { name: { type: "string" }, near: { type: "string", description: "\u5728\u54EA\u4E2A\u5DF2\u77E5\u5730\u70B9\u9644\u8FD1" }, about: { type: "string" } }, required: ["name"] }
      }
    }
  }
};
function parseSettleWorld(raw) {
  if (!isRecord2(raw)) return null;
  const ate = str2(raw.ate);
  return {
    extraMinutes: Math.max(0, num2(raw.extra_minutes) ?? 0),
    ...ate === "\u6B63\u9910" || ate === "\u70B9\u5FC3" ? { ate } : {},
    money: list2(raw.money).filter(isRecord2).map((m) => ({ amount: num2(m.amount) ?? 0, reason: str2(m.reason) })).filter((m) => m.amount && m.reason),
    moves: list2(raw.moves).filter(isRecord2).map((m) => ({ who: str2(m.who), to: str2(m.to) })).filter((m) => m.who && m.to),
    commitments: list2(raw.commitments).filter(isRecord2).map((c) => ({ with: str2(c.with), what: str2(c.what), ...str2(c.at) ? { at: str2(c.at) } : {}, ...str2(c.place) ? { place: str2(c.place) } : {} })).filter((c) => c.with && c.what),
    done: list2(raw.done).map(str2).filter(Boolean),
    messages: list2(raw.messages).filter(isRecord2).map((m) => ({ to: str2(m.to), text: str2(m.text) })).filter((m) => m.to && m.text),
    contacts: list2(raw.contacts).map(str2).filter(Boolean),
    read: raw.read === true,
    witnessed: list2(raw.witnessed).filter(isRecord2).map((w) => ({ who: list2(w.who).map(str2).filter(Boolean), what: str2(w.what) })).filter((w) => w.who.length && w.what),
    told: list2(raw.told).filter(isRecord2).map((t) => ({ to: str2(t.to), what: str2(t.what) })).filter((t) => t.to && t.what),
    met: list2(raw.met).filter(isRecord2).map((m) => ({
      ...str2(m.id) ? { id: str2(m.id) } : {},
      name: str2(m.name),
      ...str2(m.looks) ? { looks: str2(m.looks) } : {},
      ...m.gender === "\u7537" || m.gender === "\u5973" ? { gender: m.gender } : {},
      ...num2(m.age) ? { age: num2(m.age) } : {},
      ...str2(m.doing) ? { doing: str2(m.doing) } : {},
      ...m.gone === true ? { gone: true } : {}
    })).filter((m) => m.name),
    places: list2(raw.places).filter(isRecord2).map((p) => ({ name: str2(p.name), ...str2(p.near) ? { near: str2(p.near) } : {}, ...str2(p.about) ? { about: str2(p.about) } : {} })).filter((p) => p.name)
  };
}
function sceneTool() {
  return {
    type: "function",
    function: {
      name: SCENE_TOOL_NAME,
      description: "\u573A\u666F\uFF1A\u6309\u4E3B\u89D2\u7684\u89C6\u89D2\uFF0C\u5199\u51FA\u8FD9\u91CC\u6B64\u523B\u7684\u4EBA\u770B\u8D77\u6765\u662F\u4EC0\u4E48\u6837\u3002\u53EA\u5199\u770B\u5F97\u5230\u7684\u3002",
      parameters: {
        type: "object",
        properties: {
          crowd: { type: "string", description: "\u8FD9\u91CC\u6574\u4F53\u7684\u6837\u5B50\u548C\u4EBA\u6D41\uFF0C\u4E00\u53E5\u8BDD" },
          people: {
            type: "array",
            description: "\u7ED9\u51FA\u7684\u6BCF\u4E2A\u7F16\u53F7\u5404\u5199\u4E00\u9879",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "\u7ED9\u51FA\u7684\u7F16\u53F7" },
                looks: { type: "string", description: "\u770B\u8D77\u6765\u7684\u6837\u5B50\uFF1A\u5927\u6982\u7684\u5E74\u7EAA\u3001\u6027\u522B\u3001\u8EAB\u6750\u3001\u7A7F\u7740\u3001\u663E\u773C\u7684\u7279\u5F81\uFF0C\u4E00\u53E5\u8BDD" },
                doing: { type: "string", description: "\u5728\u505A\u4EC0\u4E48" },
                where: { type: "string", description: "\u5728\u8FD9\u91CC\u7684\u54EA\u4E2A\u4F4D\u7F6E" }
              },
              required: ["id", "looks", "doing"]
            }
          }
        },
        required: ["people"]
      }
    }
  };
}
function parseSceneArgs(text) {
  const raw = parseJson(text);
  if (!isRecord2(raw)) return null;
  const people = list2(raw.people).filter(isRecord2).map((p) => ({ id: str2(p.id), looks: str2(p.looks), doing: str2(p.doing), where: str2(p.where) })).filter((p) => p.id && p.looks);
  return { crowd: str2(raw.crowd), people };
}
var attributeProps = Object.fromEntries(CORE_ATTRIBUTES.map((a) => [a, { type: "number" }]));
function setupTool() {
  const person = {
    type: "object",
    properties: {
      name: { type: "string" },
      role: { type: "string", description: "\u548C\u4E3B\u89D2\u7684\u5173\u7CFB\uFF1A\u4E0A\u53F8\u3001\u540C\u4E8B\u3001\u623F\u4E1C\u3001\u5988\u5988\u3001\u8F85\u5BFC\u5458\u2026" },
      gender: { type: "string", enum: ["\u7537", "\u5973"] },
      age: { type: "number" },
      about: { type: "string", description: "\u4E00\u4E24\u53E5\uFF1A\u4ED6\u662F\u4EC0\u4E48\u6837\u7684\u4EBA" },
      attributes: { type: "object", properties: attributeProps, description: "\u6309\u53C2\u7167\u8868\u4F30\u8BA1\uFF0C\u666E\u901A\u6210\u5E74\u7537\u6027 100" },
      traits: { type: "object", properties: { \u654F\u611F: { type: "number" }, \u8BB0\u4EC7: { type: "number" }, \u591A\u7591: { type: "number" } }, description: "0.5\uFF5E2\uFF0C\u9ED8\u8BA4 1" },
      attitude: {
        type: "object",
        description: "\u4ED6\u5BF9\u4E3B\u89D2\u73B0\u5728\u7684\u6001\u5EA6\uFF0C0\uFF5E100",
        properties: { affection: { type: "number" }, resentment: { type: "number" }, trust: { type: "number" }, respect: { type: "number" }, fear: { type: "number" }, attraction: { type: "number" }, familiarity: { type: "number" } }
      },
      lives: { type: "string", description: "\u4F4F\u5728\u54EA\uFF1A\u5730\u56FE\u4E0A\u7684\u5730\u70B9\u540D\uFF1B\u4E0D\u5728\u6F9C\u6C5F\u5E02\u5C31\u5199\u57CE\u5E02\u540D" }
    },
    required: ["name", "role", "gender", "age", "about"]
  };
  return {
    type: "function",
    function: {
      name: SETUP_TOOL_NAME,
      description: "\u5F00\u5C40\uFF1A\u6309\u73A9\u5BB6\u5199\u7684\u8BBE\u5B9A\uFF0C\u628A\u4E3B\u89D2\u5728\u6F9C\u6C5F\u5E02\u7684\u751F\u6D3B\u843D\u6210\u6570\u636E\u3002",
      parameters: {
        type: "object",
        properties: {
          think: { type: "string", description: "\u7B80\u77ED\u7684\u601D\u8DEF" },
          attributes: { type: "object", properties: attributeProps, description: "\u4E3B\u89D2\u7684\u5C5E\u6027\uFF0C\u6309\u53C2\u7167\u8868\uFF0C\u666E\u901A\u6210\u5E74\u7537\u6027 100" },
          skills: { type: "object", description: "\u4E3B\u89D2\u7684\u7279\u957F\uFF1A\u540D\u5B57 \u2192 \u5165\u95E8\u3001\u719F\u7EC3\u3001\u7CBE\u901A\u3001\u5927\u5E08" },
          job: {
            type: "object",
            properties: {
              title: { type: "string", description: "\u5177\u4F53\u505A\u4EC0\u4E48\uFF0C\u4F8B\u5982\u300C\u5E7F\u544A\u516C\u53F8\u7684\u8BBE\u8BA1\u300D" },
              employer: { type: "string", description: "\u5355\u4F4D\u6216\u5B66\u6821\u7684\u540D\u5B57\uFF08\u65E0\u4E1A\u65F6\u4E0D\u5199\uFF09" },
              place: { type: "string", description: "\u5355\u4F4D\u5728\u54EA\uFF1A\u5730\u56FE\u4E0A\u7684\u5730\u70B9\u540D\uFF1B\u65B0\u5355\u4F4D\u5199\u540D\u5B57\u5E76\u5728 near \u5199\u9644\u8FD1\u7684\u5DF2\u77E5\u5730\u70B9" },
              near: { type: "string" },
              income: { type: "number", description: "\u6BCF\u6708\u6536\u5165\uFF08\u5DE5\u8D44\u6216\u5BB6\u91CC\u7ED9\u7684\u751F\u6D3B\u8D39\uFF09\uFF0C\u5143" },
              payday: { type: "number", description: "\u6BCF\u6708\u51E0\u53F7\u5230\u8D26" },
              days: { type: "string", description: "\u4E0A\u73ED\u6216\u4E0A\u8BFE\u7684\u65E5\u5B50\uFF0C\u4F8B\u5982\u300C\u5DE5\u4F5C\u65E5\u300D" },
              from: { type: "string", description: "\u51E0\u70B9\u5F00\u59CB\uFF0C\u4F8B\u5982 09:00" },
              to: { type: "string", description: "\u51E0\u70B9\u7ED3\u675F\uFF0C\u4F8B\u5982 18:00" },
              norms: { type: "string", description: "\u8FD9\u5BB6\u5355\u4F4D\u6216\u5B66\u6821\u7684\u60EF\u4F8B\uFF1A\u8003\u52E4\u3001\u8FDF\u5230\u3001\u8BF7\u5047\u3001\u52A0\u73ED\u600E\u4E48\u5904\u7406\uFF08\u4E00\u4E24\u53E5\uFF0C\u50CF\u73B0\u5B9E\u91CC\u7684\u5355\u4F4D\uFF09" }
            }
          },
          home: {
            type: "object",
            properties: {
              place: { type: "string", description: "\u4F4F\u5728\u54EA\u4E2A\u5C0F\u533A\uFF1A\u5730\u56FE\u4E0A\u7684\u5730\u70B9\u540D\uFF0C\u6216\u65B0\u7684\u540D\u5B57\u5E76\u5728 near \u5199\u9644\u8FD1\u7684\u5DF2\u77E5\u5730\u70B9" },
              near: { type: "string" },
              rent: { type: "number", description: "\u6BCF\u6708\u623F\u79DF\uFF0C\u5143\uFF1B\u81EA\u5DF1\u7684\u623F\u5B50\u5199 0" },
              rent_day: { type: "number", description: "\u6BCF\u6708\u51E0\u53F7\u4EA4\u623F\u79DF" },
              norms: { type: "string", description: "\u623F\u4E1C\u5BF9\u4EA4\u79DF\u7684\u4E60\u60EF\u505A\u6CD5\uFF08\u4E00\u4E24\u53E5\uFF09" }
            },
            required: ["place"]
          },
          balance: { type: "number", description: "\u73B0\u5728\u624B\u4E0A\u7684\u94B1\uFF08\u624B\u673A\u548C\u94F6\u884C\u5361\u5408\u8BA1\uFF09\uFF0C\u5143" },
          living: { type: "string", enum: ["\u8282\u4FED", "\u666E\u901A", "\u5BBD\u88D5"], description: "\u65E5\u5E38\u82B1\u94B1\u7684\u6C34\u5E73" },
          habit: { type: "string", enum: ["\u6B65\u884C", "\u9A91\u8F66", "\u5730\u94C1", "\u516C\u4EA4", "\u6253\u8F66", "\u5F00\u8F66"], description: "\u5E73\u65F6\u600E\u4E48\u51FA\u884C" },
          people: { type: "array", items: person, description: "\u8EAB\u8FB9\u7684\u4EBA\uFF1A\u4E0A\u53F8\u548C\u4E24\u4F4D\u540C\u4E8B\uFF08\u6216\u8F85\u5BFC\u5458\u548C\u540C\u5B66\uFF09\u3001\u623F\u4E1C\uFF08\u79DF\u623F\u65F6\uFF09\u3001\u4E00\u4E24\u4F4D\u5BB6\u4EBA" }
        },
        required: ["attributes", "home", "balance", "living", "people"]
      }
    }
  };
}
function parseJson(text) {
  const t = text.trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    const m = /\{[\s\S]*\}/.exec(t);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

// src/plugins/tabletop/ruling.ts
var CHECK_TOOL_NAME = "hearth_check";
var OUTCOME_KEYS = { critical: "critical", success: "success", failure: "failure", fumble: "fumble" };
function checkTool(world = false) {
  const outcome = (label) => ({ type: "string", description: `${label}\u65F6\u786E\u5B9A\u4F1A\u53D1\u751F\u7684\u4E8B\uFF08\u4E00\u4E24\u53E5\uFF09\uFF1A\u53EA\u5199\u4E00\u79CD\u60C5\u5F62\uFF0C\u4E0D\u5199\u300C\u6216\u8005\u300D\u300C\u4E5F\u8BB8\u300D` });
  return {
    type: "function",
    function: {
      name: CHECK_TOOL_NAME,
      description: "\u8DD1\u56E2 DM \u7684\u68C0\u5B9A\u5DE5\u5177\uFF1A\u63D0\u4EA4\u672C\u8F6E\u7ED3\u679C\u8BF4\u4E0D\u51C6\u3001\u9700\u8981\u63B7\u9AB0\u7684\u4E8B\uFF0CHearth \u63B7\u9AB0\u540E\u8FD4\u56DE\u63B7\u4E2D\u7684\u7ED3\u679C\u3002\u6CA1\u6709\u9700\u8981\u68C0\u5B9A\u7684\u4E8B\u65F6\uFF0Cchecks \u7559\u7A7A\u3001done \u586B true\u3002",
      parameters: {
        type: "object",
        properties: {
          think: { type: "string", description: "\u88C1\u5B9A\u524D\u7684\u7B80\u77ED\u5224\u65AD\uFF1A\u8FD9\u4E00\u8F6E\u53D1\u751F\u4E86\u4EC0\u4E48\uFF0C\u54EA\u4E9B\u4E8B\u7ED3\u679C\u8BF4\u4E0D\u51C6" },
          checks: {
            type: "array",
            description: "\u672C\u6B21\u63D0\u4EA4\u7684\u68C0\u5B9A\uFF1B\u4E92\u4E0D\u4F9D\u8D56\u7684\u68C0\u5B9A\u4E00\u6B21\u63D0\u4EA4",
            items: {
              type: "object",
              properties: {
                actor: { type: "string", description: `\u8C01\u6765\u505A\uFF1A\u300C${PROTAGONIST}\u300D\u6216\u89D2\u8272\u540D` },
                actor_value: { type: "number", description: "\u53EA\u5728\u8FD9\u4E2A\u89D2\u8272\u8FD8\u4E0D\u5728\u8DD1\u56E2\u6570\u636E\u91CC\u65F6\u586B\u5199\uFF1A\u4F60\u4F30\u8BA1\u7684\u6709\u6548\u503C\uFF08\u5C5E\u6027\xD7\u7279\u957F\uFF09" },
                action: { type: "string", description: "\u8981\u505A\u7684\u4E8B\uFF0C\u4F8B\u5982\u300C\u64AC\u5F00\u540E\u95E8\u7684\u9501\u300D" },
                reason: { type: "string", description: "\u4E3A\u4EC0\u4E48\u7ED3\u679C\u8BF4\u4E0D\u51C6" },
                attribute: { type: "string", description: `\u7528\u54EA\u9879\u5C5E\u6027\uFF1A${CORE_ATTRIBUTES.join("\u3001")}\uFF0C\u6216\u672C\u5361\u81EA\u5B9A\u4E49\u7684\u5C5E\u6027` },
                skill: { type: "string", description: "\u6D89\u53CA\u7684\u7279\u957F\uFF08\u53EF\u9009\uFF09" },
                difficulty: { type: "number", description: `\u96BE\u5EA6\uFF08\u548C opponent \u4E8C\u9009\u4E00\uFF09\uFF1A${DIFFICULTIES.map(([w, v]) => `${w} ${v}`).join("\u3001")}\uFF0C\u53EF\u4EE5\u7ED9\u4E2D\u95F4\u503C\uFF1B\u542B\u4E49\u662F\u5C5E\u6027\u591A\u9AD8\u624D\u6709\u4E94\u6210\u628A\u63E1` },
                opponent: {
                  type: "object",
                  description: "\u5BF9\u6297\u7684\u5BF9\u624B\uFF08\u548C difficulty \u4E8C\u9009\u4E00\uFF09",
                  properties: {
                    name: { type: "string" },
                    attribute: { type: "string" },
                    skill: { type: "string" },
                    value: { type: "number", description: "\u53EA\u5728\u5BF9\u624B\u8FD8\u4E0D\u5728\u8DD1\u56E2\u6570\u636E\u91CC\u65F6\u586B\u5199\uFF1A\u4F30\u8BA1\u7684\u6709\u6548\u503C" }
                  },
                  required: ["name", "attribute"]
                },
                modifiers: {
                  type: "array",
                  description: "\u73AF\u5883\u52A0\u6210\uFF0C\u6BCF\u9879\u5199\u7406\u7531\u548C\u500D\u7387\uFF0C\u4F8B\u5982 \u53EA\u6709\u4E00\u6839\u53D1\u5361 \xD70.8\u3001\u5BF9\u65B9\u4FE1\u4EFB\u4F60 \xD71.3",
                  items: { type: "object", properties: { reason: { type: "string" }, factor: { type: "number" } }, required: ["reason", "factor"] }
                },
                hidden: { type: "boolean", description: "\u6697\u9AB0\uFF1A\u4E3B\u89D2\u5BDF\u89C9\u4E0D\u5230\u8FD9\u4E2A\u68C0\u5B9A\uFF08\u4F8B\u5982\u5B88\u536B\u6709\u6CA1\u6709\u6CE8\u610F\u5230\u4E3B\u89D2\uFF09" },
                outcomes: {
                  type: "object",
                  description: "\u5148\u5199\u597D\u56DB\u79CD\u7ED3\u679C\u5404\u81EA\u4F1A\u53D1\u751F\u4EC0\u4E48\uFF0C\u6BCF\u79CD\u662F\u4E00\u4EF6\u786E\u5B9A\u7684\u4E8B\uFF1B\u63B7\u9AB0\u540E\u53EA\u91C7\u7528\u63B7\u4E2D\u7684\u90A3\u4E00\u79CD\uFF0C\u539F\u6837\u5F53\u4F5C\u4E8B\u5B9E",
                  properties: { critical: outcome("\u5927\u6210\u529F"), success: outcome("\u6210\u529F"), failure: outcome("\u5931\u8D25"), fumble: outcome("\u5927\u5931\u8D25") },
                  required: ["critical", "success", "failure", "fumble"]
                }
              },
              required: ["actor", "action", "attribute", "outcomes"]
            }
          },
          done: { type: "boolean", description: "true\uFF1A\u672C\u8F6E\u88C1\u5B9A\u7ED3\u675F\uFF1Bfalse\uFF1A\u8FD8\u6709\u8981\u770B\u8FD9\u6B21\u7ED3\u679C\u624D\u80FD\u51B3\u5B9A\u7684\u68C0\u5B9A" },
          ...world ? CHECK_WORLD_PROPERTIES : {}
        },
        required: ["checks", "done"]
      }
    }
  };
}
var isRecord3 = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
var str3 = (v) => typeof v === "string" ? v.trim() : "";
var num3 = (v) => typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : null;
function parseArgs(text) {
  const tries = [text, text.match(/<hearth_check>([\s\S]*?)<\/hearth_check>/i)?.[1], text.match(/\{[\s\S]*\}/)?.[0]];
  for (const t of tries) {
    if (!t) continue;
    try {
      const v = JSON.parse(t.trim());
      if (isRecord3(v)) return v;
    } catch {
    }
  }
  return null;
}
function effectiveValue(c, attribute, skill, estimate) {
  const steps = [];
  let value;
  const base = c?.attributes[attribute];
  if (base !== void 0) {
    value = base;
    steps.push(`${attribute}${base}`);
    if (skill) {
      const level = c?.skills[skill];
      const factor = level ? SKILL_LEVELS[level] : SKILL_LEVELS.\u672A\u5B66;
      value *= factor;
      steps.push(`${skill}\xB7${level ?? "\u672A\u5B66"}\xD7${fmt(factor)}`);
    }
  } else if (estimate !== null && estimate > 0) {
    value = estimate;
    steps.push(`${attribute}\uFF08\u4F30\u8BA1\uFF09${fmt(estimate)}`);
  } else {
    value = 100;
    steps.push(`${attribute}\uFF08\u672A\u767B\u8BB0\uFF0C\u6309\u666E\u901A\u4EBA\uFF09100`);
  }
  for (const s of c?.status ?? []) {
    const f = s.effects[attribute];
    if (f && f !== 1) {
      value *= f;
      steps.push(`${s.name}\xD7${fmt(f)}`);
    }
  }
  return { value, steps };
}
function characterFor(state, added, name, attribute, estimate, userName) {
  const key = resolveName(state, name, userName);
  if (key) return { key, sheet: state.characters[key] };
  const fresh = canonicalName(name, userName) || "\u65E0\u540D";
  if (estimate !== null && estimate > 0) {
    const sheet = state.characters[fresh] ?? newCharacter();
    sheet.temporary = true;
    sheet.attributes[attribute] ??= Math.round(estimate);
    state.characters[fresh] = sheet;
    added[fresh] = sheet;
    return { key: fresh, sheet };
  }
  return { key: fresh };
}
function resolveChecks(args, state, userName, rules, added, random = Math.random) {
  const out = [];
  for (const raw of Array.isArray(args.checks) ? args.checks : []) {
    if (!isRecord3(raw)) continue;
    const attribute = str3(raw.attribute) || "\u654F\u6377";
    const action = str3(raw.action) || "\u884C\u52A8";
    const skill = str3(raw.skill);
    const actor = characterFor(state, added, str3(raw.actor) || PROTAGONIST, attribute, num3(raw.actor_value), userName);
    const me = actor.sheet ? effectiveValue(actor.sheet, attribute, skill, null) : effectiveValue(void 0, attribute, "", num3(raw.actor_value));
    const mods = clampModifiers(Array.isArray(raw.modifiers) ? raw.modifiers.filter(isRecord3).map((m) => ({ reason: str3(m.reason), factor: num3(m.factor) ?? NaN })) : []);
    const value = me.value * mods.product;
    const steps = [...me.steps, ...mods.list.map((m) => `${m.reason}\xD7${fmt(m.factor)}`)];
    let target;
    let difficulty;
    const opp = isRecord3(raw.opponent) ? raw.opponent : null;
    if (opp && str3(opp.name)) {
      const oppAttr = str3(opp.attribute) || attribute;
      const who = characterFor(state, added, str3(opp.name), oppAttr, num3(opp.value), userName);
      const them = who.sheet ? effectiveValue(who.sheet, oppAttr, str3(opp.skill), null) : effectiveValue(void 0, oppAttr, "", num3(opp.value));
      difficulty = them.value;
      target = { opponent: who.key, attribute: oppAttr, value: them.value, steps: them.steps };
    } else {
      difficulty = Math.max(1, num3(raw.difficulty) ?? 100);
      target = { difficulty };
    }
    const chance = successChance(value, difficulty, rules.exponent);
    const line2 = successLine(chance);
    const roll = rollD100(random);
    const tier = tierOf(roll, line2);
    const outcomes = {};
    const given = isRecord3(raw.outcomes) ? raw.outcomes : {};
    for (const t of TIERS) outcomes[t] = str3(given[OUTCOME_KEYS[t]]) || str3(given[TIER_LABEL[t]]);
    const outcome = outcomes[tier] || (tier === "critical" ? outcomes.success : tier === "fumble" ? outcomes.failure : "") || TIER_LABEL[tier];
    out.push({
      actor: actor.key,
      action,
      reason: str3(raw.reason),
      attribute,
      ...skill ? { skill } : {},
      against: target,
      modifiers: mods.list,
      hidden: raw.hidden === true,
      outcomes,
      value,
      steps,
      chance,
      line: line2,
      roll,
      tier,
      outcome
    });
  }
  return out;
}
async function runRuling(deps) {
  const checks = [];
  const added = {};
  const thinks = [];
  let ask2;
  let body = deps.body;
  let rounds = 0;
  for (let round2 = 1; round2 <= deps.rules.maxRounds; round2++) {
    rounds = round2;
    const res = await deps.send(body);
    const call = res.toolCalls.find((c) => c.function?.name === CHECK_TOOL_NAME) ?? res.toolCalls.find((c) => /"checks"/.test(c.function?.arguments ?? ""));
    const args = call ? parseArgs(call.function?.arguments ?? "") : parseArgs(res.text);
    if (!args) {
      if (round2 === 1) throw new Error(res.toolCalls.length ? `\u6A21\u578B\u8C03\u7528\u4E86 ${res.toolCalls.map((c) => c.function?.name).join("\u3001")}\uFF0C\u6CA1\u6709\u8C03\u7528\u63B7\u9AB0\u5DE5\u5177` : "\u6A21\u578B\u6CA1\u6709\u8C03\u7528\u63B7\u9AB0\u5DE5\u5177");
      break;
    }
    if (str3(args.think)) thinks.push(str3(args.think));
    ask2 ??= parseTurnAsk(args);
    const results = resolveChecks(args, deps.state, deps.userName, deps.rules, added, deps.random);
    checks.push(...results);
    deps.onRound?.(round2, body, [...checks]);
    if (args.done !== false || !results.length || round2 === deps.rules.maxRounds) break;
    const id = call?.id ?? `call_hearth_check_${round2}`;
    const messages = [...body.messages];
    messages.push(
      call ? { role: "assistant", content: res.text || null, tool_calls: [{ ...call, id, type: "function" }], ..."thoughtSignature" in call ? { thoughtSignature: call.thoughtSignature } : {} } : { role: "assistant", content: res.text },
      call ? { role: "tool", tool_call_id: id, name: CHECK_TOOL_NAME, content: `\u63B7\u9AB0\u7ED3\u679C\uFF1A
${results.map((c, i) => checkResultLine(c, checks.length - results.length + i)).join("\n")}

\u8FD8\u6709\u8981\u770B\u8FD9\u4E9B\u7ED3\u679C\u624D\u80FD\u51B3\u5B9A\u7684\u68C0\u5B9A\uFF0C\u5C31\u7EE7\u7EED\u8C03\u7528 ${CHECK_TOOL_NAME}\uFF1B\u6CA1\u6709\u4E86\u5C31\u8BA9 checks \u7559\u7A7A\u3001done \u586B true\u3002` } : { role: "user", content: `\u63B7\u9AB0\u7ED3\u679C\uFF1A
${results.map((c, i) => checkResultLine(c, i)).join("\n")}` }
    );
    body = { ...body, messages };
  }
  return {
    userText: deps.userText,
    checks,
    rounds,
    ...Object.keys(added).length ? { added } : {},
    ...thinks.length ? { think: thinks.join("\n") } : {},
    ...ask2 ? { ask: ask2 } : {}
  };
}

// src/plugins/tabletop/scene.ts
var RECENT_SCENES = 3;
var MIN_NAME_LENGTH = 2;
var isStory = (m) => m.mode !== "edit" && !m.hidden;
var textOf = (m) => m?.swipes[m.activeSwipe]?.content ?? "";
function mentioned(state, text) {
  if (!text) return [];
  return Object.entries(state.characters).filter(([name, c]) => [name, ...c.aliases].some((n) => n.length >= MIN_NAME_LENGTH && text.includes(n))).map(([name]) => name);
}
function sceneOf(input) {
  const { state, userName } = input;
  const scene = /* @__PURE__ */ new Set();
  const add = (name) => {
    const key = name ? resolveName(state, name, userName) : null;
    if (key) scene.add(key);
  };
  add(PROTAGONIST);
  add(input.characterName);
  const before = input.chat.messages.slice(0, Math.max(0, input.index)).filter(isStory);
  const replies = before.filter((m) => m.role === "assistant");
  for (const m of replies.slice(-RECENT_SCENES)) {
    for (const name of swipeData(m)?.settle?.present ?? []) add(name);
  }
  for (const text of [textOf(replies.at(-1)), ...input.texts]) {
    for (const name of mentioned(state, text)) scene.add(name);
  }
  for (const c of input.ruling?.checks ?? []) {
    add(c.actor);
    if ("opponent" in c.against) add(c.against.opponent);
  }
  for (const name of Object.keys(input.ruling?.added ?? {})) add(name);
  return scene;
}

// src/plugins/tabletop/settle.ts
var SETTLE_TOOL_NAME = "hearth_settle";
var BLOCK = /<结算>([\s\S]*?)(?:<\/结算>|$)/;
var MAX_ATTRIBUTE_CHANGE = 10;
var KEEP_LOG = 60;
function settleTool(world = false) {
  const axis = (label) => ({ type: "number", description: `${label}\u7684\u53D8\u5316\uFF1A\u65E5\u5E38 0\uFF5E2\uFF0C\u7559\u4E0B\u5370\u8C61 3\uFF5E8\uFF0C\u660E\u663E\u7684\u597D\u610F\u6216\u5192\u72AF 8\uFF5E15\uFF0C\u91CD\u5927\u4E8B\u4EF6 15\uFF5E30\uFF0C\u53EF\u6B63\u53EF\u8D1F\uFF1B\u6CA1\u53D8\u5199 0` });
  return {
    type: "function",
    function: {
      name: SETTLE_TOOL_NAME,
      description: "\u8DD1\u56E2\u7ED3\u7B97\uFF1A\u8BB0\u4E0B\u521A\u624D\u8FD9\u6BB5\u56DE\u590D\u91CC\u53D1\u751F\u7684\u4E8B\u9020\u6210\u7684\u53D8\u5316\u3002Hearth \u6309\u89C4\u5219\u6267\u884C\uFF0C\u5B9E\u9645\u53D8\u5316\u53EF\u80FD\u6BD4\u5199\u7684\u5C0F\u3002",
      parameters: {
        type: "object",
        properties: {
          think: { type: "string", description: "\u7B80\u77ED\u56DE\u987E\uFF1A\u8FD9\u6BB5\u56DE\u590D\u91CC\u53D1\u751F\u4E86\u54EA\u4E9B\u4E8B\uFF0C\u5206\u522B\u5F71\u54CD\u4E86\u8C01" },
          present: { type: "array", items: { type: "string" }, description: "\u8FD9\u6BB5\u56DE\u590D\u91CC\u5728\u573A\u7684\u89D2\u8272\uFF0C\u4E0D\u542B\u4E3B\u89D2" },
          attitudes: {
            type: "array",
            description: "\u5728\u573A\u7684\u6BCF\u4E2A\u89D2\u8272\u5404\u5199\u4E00\u9879\uFF1A\u8FD9\u6BB5\u56DE\u590D\u91CC\u7684\u4E8B\u8BA9\u4ED6\u5BF9\u4E3B\u89D2\u7684\u6001\u5EA6\u600E\u6837\u53D8\u4E86\u3002\u6CA1\u6709\u53D8\u5316\u4E5F\u5199\u4E00\u9879\uFF0C\u5404\u6761\u7EBF\u5199 0\uFF0Creason \u5199\u300C\u6CA1\u6709\u53D8\u5316\u300D\u3002\u53EA\u5199\u89D2\u8272\u5BF9\u4E3B\u89D2\u7684\u6001\u5EA6\uFF1B\u4E3B\u89D2\u81EA\u5DF1\u7684\u611F\u60C5\u7531\u73A9\u5BB6\u51B3\u5B9A\uFF0C\u4E0D\u5199",
            items: {
              type: "object",
              properties: {
                who: { type: "string", description: "\u89D2\u8272\u540D" },
                ...Object.fromEntries(AXES.map(([key, label]) => [key, axis(label)])),
                familiarity: { type: "number", description: "\u719F\u6089\u7684\u53D8\u5316\uFF1A\u5171\u540C\u7ECF\u5386\u3001\u66F4\u4E86\u89E3\u4E3B\u89D2\u4E86\uFF1B\u6CA1\u53D8\u5199 0" },
                reason: { type: "string", description: "\u662F\u54EA\u4EF6\u4E8B\uFF0C\u4E00\u53E5\u8BDD" }
              },
              required: ["who", "reason"]
            }
          },
          bonds: {
            type: "array",
            description: "\u89D2\u8272\u4E4B\u95F4\uFF08\u4E0D\u542B\u4E3B\u89D2\uFF09\u7684\u5173\u7CFB\u56E0\u4E3A\u8FD9\u6BB5\u56DE\u590D\u6709\u4E86\u53D8\u5316\u65F6\u5199\uFF0C\u4F8B\u5982\u7ED3\u4EC7\u3001\u548C\u597D\u3001\u8D77\u4E86\u7591\u5FC3\u3002\u6CA1\u6709\u53D8\u5316\u5C31\u4E0D\u5199",
            items: {
              type: "object",
              properties: {
                between: { type: "array", items: { type: "string" }, description: "\u4E24\u4E2A\u89D2\u8272\u7684\u540D\u5B57" },
                now: { type: "string", description: "\u73B0\u5728\u7684\u5173\u7CFB\uFF0C\u51E0\u4E2A\u5B57\uFF0C\u4F8B\u5982\u300C\u8868\u9762\u5BA2\u6C14\uFF0C\u6697\u4E2D\u63D0\u9632\u300D" },
                reason: { type: "string", description: "\u662F\u54EA\u4EF6\u4E8B" }
              },
              required: ["between", "now", "reason"]
            }
          },
          status: {
            type: "array",
            description: "\u53D7\u4F24\u3001\u9189\u9152\u3001\u75B2\u60EB\u7B49\u4E34\u65F6\u72B6\u6001\uFF1A\u65B0\u51FA\u73B0\u7684\u52A0\u4E0A\uFF0C\u597D\u4E86\u7684\u53BB\u6389\uFF08\u4E3B\u89D2\u548C\u5176\u4ED6\u89D2\u8272\u90FD\u7B97\uFF09",
            items: {
              type: "object",
              properties: {
                who: { type: "string" },
                change: { type: "string", enum: ["add", "remove"], description: "add \u52A0\u4E0A\uFF0Cremove \u53BB\u6389" },
                name: { type: "string", description: "\u72B6\u6001\u540D\uFF0C\u4F8B\u5982\u300C\u5DE6\u81C2\u5200\u4F24\u300D" },
                effects: { type: "string", description: "\u52A0\u4E0A\u65F6\u5BF9\u5C5E\u6027\u7684\u5F71\u54CD\uFF0C\u4F8B\u5982\u300C\u529B\u91CF\xD70.8 \u654F\u6377\xD70.9\u300D\uFF1B\u6CA1\u6709\u5C31\u4E0D\u5199" },
                note: { type: "string", description: "\u4E00\u53E5\u8BDD\u8BF4\u660E" }
              },
              required: ["who", "change", "name"]
            }
          },
          new_characters: {
            type: "array",
            description: "\u8FD9\u6BB5\u56DE\u590D\u91CC\u65B0\u767B\u573A\u3001\u4EE5\u540E\u8FD8\u4F1A\u51FA\u73B0\u3001\u8DD1\u56E2\u6570\u636E\u91CC\u8FD8\u6CA1\u6709\u7684\u89D2\u8272",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                attributes: { type: "string", description: "\u4F30\u8BA1\u7684\u5C5E\u6027\uFF0C\u4F8B\u5982\u300C\u529B\u91CF160 \u654F\u6377120 \u611F\u77E5130\u300D\uFF08\u666E\u901A\u6210\u5E74\u7537\u6027\u4E3A 100\uFF09" },
                note: { type: "string", description: "\u4E00\u53E5\u8BDD\u7B80\u4ECB" }
              },
              required: ["name"]
            }
          },
          growth: {
            type: "array",
            description: "\u5F88\u5C11\u53D1\u751F\uFF1A\u957F\u671F\u7684\u6210\u957F\u6216\u8870\u9000\u3002\u5C5E\u6027\u5199\u300C+5\u300D\u8FD9\u6837\u7684\u53D8\u5316\uFF08\u6BCF\u6B21\u6700\u591A \xB110\uFF09\uFF0C\u7279\u957F\u5199\u65B0\u7684\u6863\u4F4D",
            items: {
              type: "object",
              properties: {
                who: { type: "string" },
                item: { type: "string", description: "\u5C5E\u6027\u540D\u6216\u7279\u957F\u540D" },
                change: { type: "string", description: `\u5C5E\u6027\u5199\u300C+5\u300D\u300C-3\u300D\uFF1B\u7279\u957F\u5199\u6863\u4F4D\uFF1A${Object.keys(SKILL_LEVELS).join("\u3001")}` },
                reason: { type: "string" }
              },
              required: ["who", "item", "change"]
            }
          },
          ...world ? SETTLE_WORLD_PROPERTY : {}
        },
        required: ["present", "attitudes"]
      }
    }
  };
}
var isRecord4 = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
var str4 = (v) => typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
var num4 = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\s*[+＋\-－−]?\s*\d+(\.\d+)?\s*$/.test(v)) return Number(v.replace(/[＋\s]/g, "").replace(/[－−]/g, "-"));
  return 0;
};
var items = (v) => Array.isArray(v) ? v.filter(isRecord4) : [];
function parseSettleArgs(text) {
  const tries = [text, text.match(/<hearth_settle>([\s\S]*?)<\/hearth_settle>/i)?.[1], text.match(/\{[\s\S]*\}/)?.[0]];
  for (const t of tries) {
    if (!t) continue;
    try {
      const v = JSON.parse(t.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
      if (isRecord4(v) && (Array.isArray(v.attitudes) || Array.isArray(v.present))) return v;
    } catch {
    }
  }
  return null;
}
function attributePairs(text, multiplier = false) {
  const out = {};
  const re = multiplier ? /([^\s\d×x*:：,，、]+)\s*[×x*]\s*(\d+(?:\.\d+)?)/g : /([^\s\d:：,，、+\-]+)\s*[:：]?\s*(\d+(?:\.\d+)?)/g;
  for (const m of text.matchAll(re)) out[m[1]] = Number(m[2]);
  return out;
}
var Settler = class {
  results = [];
  state;
  userName;
  constructor(state, userName) {
    this.state = state;
    this.userName = userName;
  }
  log(text) {
    this.state.log.push({ turn: this.state.turn, text });
    if (this.state.log.length > KEEP_LOG) this.state.log.splice(0, this.state.log.length - KEEP_LOG);
  }
  /** Records one outcome; `null` text means nothing changed (nothing is shown or logged). */
  run(line2, fn) {
    try {
      const out = fn();
      if (!out) return;
      this.results.push({ line: line2, ok: true, ...out });
      this.log(out.text);
    } catch (error) {
      this.results.push({ line: line2, ok: false, text: error.message });
    }
  }
  isProtagonist(name) {
    return resolveName(this.state, name, this.userName) === PROTAGONIST || canonicalName(name, this.userName) === PROTAGONIST;
  }
  /** The sheet key for a name; unknown names are registered as temporary characters when `create`. */
  who(name, create = false) {
    const key = resolveName(this.state, name, this.userName);
    if (key) return key;
    const fresh = canonicalName(name, this.userName);
    if (!fresh) throw new Error("\u7F3A\u5C11\u89D2\u8272\u540D");
    if (!create) throw new Error(`\u8DD1\u56E2\u6570\u636E\u91CC\u6CA1\u6709\u300C${name}\u300D`);
    this.state.characters[fresh] = { ...newCharacter(), temporary: true };
    return fresh;
  }
  attitude(name, changes, reason) {
    if (!Object.values(changes).some(Boolean)) return null;
    const from = this.who(name, true);
    if (from === PROTAGONIST) throw new Error("\u4E3B\u89D2\u81EA\u5DF1\u7684\u611F\u60C5\u7531\u73A9\u5BB6\u51B3\u5B9A\uFF0C\u4E0D\u8BB0\u5F55");
    const { familiarity = 0, ...axes } = changes;
    const moving = Object.fromEntries(Object.entries(axes).filter(([, v]) => v));
    const parts = [];
    if (Object.keys(moving).length) {
      const change = applyAttitude(this.state, from, PROTAGONIST, moving, reason);
      if (change) parts.push(change);
    }
    if (familiarity) {
      const real = changeFamiliarity(this.state, from, PROTAGONIST, familiarity);
      if (real) parts.push(`\u719F\u6089${real > 0 ? "+" : ""}${real}`);
    }
    if (!parts.length) return null;
    return { kind: "attitude", who: from, text: `${from}\u2192${PROTAGONIST}\uFF1A${parts.join(" ")}${reason ? `\uFF08${reason}\uFF09` : ""}` };
  }
  bond(a, b, now, reason) {
    const x = this.who(a, true);
    const y = this.who(b, true);
    if (x === PROTAGONIST || y === PROTAGONIST) throw new Error("\u548C\u4E3B\u89D2\u6709\u5173\u7684\u5199\u5728\u6001\u5EA6\u91CC");
    if (x === y || !now) throw new Error("\u9700\u8981\u4E24\u4E2A\u4E0D\u540C\u7684\u89D2\u8272\u548C\u73B0\u5728\u7684\u5173\u7CFB");
    const old = this.state.bonds.find((v) => sameBond(v, x, y));
    if (old?.text === now) return null;
    const bond = old ?? { between: [x, y], text: now, reasons: [] };
    bond.text = now;
    bond.reasons.push({ turn: this.state.turn, text: reason, change: now });
    if (bond.reasons.length > 5) bond.reasons.splice(0, bond.reasons.length - 5);
    upsertBond(this.state.bonds, bond);
    return { kind: "bond", who: x, text: `${x}\u4E0E${y}\uFF1A${now}${reason ? `\uFF08${reason}\uFF09` : ""}` };
  }
  addStatus(name, label, effectsText, note2) {
    const key = this.who(name);
    const c = this.state.characters[key];
    const effects = attributePairs(effectsText, true);
    for (const k of Object.keys(effects)) effects[k] = clamp(effects[k], 0.1, 5);
    const existed = c.status.some((s) => s.name === label);
    c.status = [...c.status.filter((s) => s.name !== label), { name: label, effects, ...note2 ? { note: note2 } : {} }];
    return { kind: "status", who: key, text: `${key}\uFF1A${existed ? "\u72B6\u6001\u66F4\u65B0" : "\u65B0\u72B6\u6001"}\u300C${label}\u300D${Object.keys(effects).length ? `\uFF08${Object.entries(effects).map(([k, f]) => `${k}\xD7${fmt(f)}`).join(" ")}\uFF09` : ""}` };
  }
  removeStatus(name, label) {
    const key = this.who(name);
    const c = this.state.characters[key];
    const before = c.status.length;
    c.status = c.status.filter((s) => s.name !== label);
    if (c.status.length === before) throw new Error(`${key}\u6CA1\u6709\u300C${label}\u300D\u8FD9\u4E2A\u72B6\u6001`);
    return { kind: "status", who: key, text: `${key}\uFF1A\u300C${label}\u300D\u89E3\u9664` };
  }
  newCharacter(name, attributesText, note2) {
    const fresh = canonicalName(name, this.userName);
    if (!fresh) throw new Error("\u65B0\u89D2\u8272\u9700\u8981\u540D\u5B57");
    const key = resolveName(this.state, fresh, this.userName) ?? fresh;
    if (key === PROTAGONIST) throw new Error("\u4E3B\u89D2\u5DF2\u7ECF\u6709\u89D2\u8272\u8868\u4E86");
    const existing = this.state.characters[key];
    if (existing && !existing.temporary) return null;
    const c = existing ?? newCharacter();
    for (const [k, v] of Object.entries(attributePairs(attributesText))) c.attributes[k] = clamp(Math.round(v), 1, 9999);
    if (note2) c.description = note2;
    delete c.temporary;
    this.state.characters[key] = c;
    return { kind: "new", who: key, text: `${key}\uFF1A${existing ? "\u6B63\u5F0F\u5EFA\u6863" : "\u65B0\u767B\u573A"}` };
  }
  growth(name, item, change, reason) {
    const key = this.who(name);
    const c = this.state.characters[key];
    if (change.trim() in SKILL_LEVELS) {
      if (c.skills[item] === change.trim()) return null;
      c.skills[item] = change.trim();
      return { kind: "growth", who: key, text: `${key}\uFF1A${item}\xB7${change.trim()}${reason ? `\uFF08${reason}\uFF09` : ""}` };
    }
    const m = change.match(/^\s*([+＋\-－−])\s*(\d+(?:\.\d+)?)/);
    if (!m) throw new Error("\u5C5E\u6027\u5199\u300C+5\u300D\u8FD9\u6837\u7684\u53D8\u5316\uFF0C\u7279\u957F\u5199\u6863\u4F4D");
    const delta = clamp(Number(`${/[+＋]/.test(m[1]) ? "" : "-"}${m[2]}`), -MAX_ATTRIBUTE_CHANGE, MAX_ATTRIBUTE_CHANGE);
    if (!delta) return null;
    const before = c.attributes[item] ?? 100;
    c.attributes[item] = clamp(Math.round(before + delta), 1, 9999);
    return { kind: "growth", who: key, text: `${key}\uFF1A${item} ${before} \u2192 ${c.attributes[item]}${reason ? `\uFF08${reason}\uFF09` : ""}` };
  }
};
function applySettleArgs(state, args, userName) {
  const s = new Settler(state, userName);
  for (const it of items(args.new_characters)) {
    s.run(`\u65B0\u89D2\u8272 ${str4(it.name)}`, () => s.newCharacter(str4(it.name), str4(it.attributes), str4(it.note)));
  }
  for (const it of items(args.attitudes)) {
    const changes = Object.fromEntries([...AXES.map(([k]) => k), "familiarity"].map((k) => [k, num4(it[k])]));
    s.run(`\u6001\u5EA6 ${str4(it.who)}`, () => s.attitude(str4(it.who), changes, str4(it.reason)));
  }
  for (const it of items(args.bonds)) {
    const between = Array.isArray(it.between) ? it.between.map(str4).filter(Boolean) : str4(it.between).split(/[与和、,，\s]+/).filter(Boolean);
    s.run(`\u5173\u7CFB ${between.join("\u4E0E")}`, () => {
      if (between.length !== 2) throw new Error("\u5173\u7CFB\u9700\u8981\u5199\u4E24\u4E2A\u89D2\u8272");
      return s.bond(between[0], between[1], str4(it.now), str4(it.reason));
    });
  }
  for (const it of items(args.status)) {
    const remove = /^(remove|del|delete|去掉|解除|-)$/i.test(str4(it.change));
    s.run(`\u72B6\u6001 ${str4(it.who)} ${str4(it.name)}`, () => remove ? s.removeStatus(str4(it.who), str4(it.name)) : s.addStatus(str4(it.who), str4(it.name), str4(it.effects), str4(it.note)));
  }
  for (const it of items(args.growth)) {
    s.run(`\u6210\u957F ${str4(it.who)} ${str4(it.item)}`, () => s.growth(str4(it.who), str4(it.item), str4(it.change), str4(it.reason)));
  }
  return s.results;
}
function extractSettlement(text) {
  const m = text.match(BLOCK);
  if (!m) return { text, raw: null };
  const cleaned = (text.slice(0, m.index) + text.slice((m.index ?? 0) + m[0].length)).replace(/```\s*```/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return { text: cleaned, raw: m[1].trim() };
}
var AXIS_BY_LABEL = Object.fromEntries(AXES.map(([k, l]) => [l, k]));
function axisChanges(text) {
  const out = {};
  for (const m of text.matchAll(/(亲近|怨恨|信任|敬重|畏惧|吸引)\s*([+＋\-－−]\s*\d+(?:\.\d+)?)/g)) {
    out[AXIS_BY_LABEL[m[1]]] = Number(m[2].replace(/[＋\s]/g, "+").replace(/[－−]/g, "-"));
  }
  return out;
}
function pair(text, joiner = /\s*(?:→|->|＞|>|对)\s*/) {
  const m = text.split(joiner).map((s) => s.trim()).filter(Boolean);
  return m.length === 2 ? [m[0], m[1]] : null;
}
function applySettlement(state, raw, userName) {
  const s = new Settler(state, userName);
  for (const rawLine of raw.split("\n")) {
    const line2 = rawLine.replace(/^\s*[-*·•\d.、]+\s*/, "").trim();
    if (!line2) continue;
    const cells = line2.split(/\s*[｜|]\s*/).map((c) => c.trim());
    const kind = cells[0];
    s.run(line2, () => {
      if (kind === "\u6001\u5EA6" || kind === "\u719F\u6089") {
        const p = pair(cells[1] ?? "");
        if (!p) throw new Error(`\u770B\u4E0D\u61C2\u8FD9\u4E00\u884C\uFF08\u9700\u8981\u300C${kind}\uFF5CA\u2192\u4E3B\u89D2\uFF5C\u2026\uFF5C\u7F18\u7531\u300D\uFF09`);
        if (s.isProtagonist(p[0])) throw new Error("\u4E3B\u89D2\u81EA\u5DF1\u7684\u611F\u60C5\u7531\u73A9\u5BB6\u51B3\u5B9A\uFF0C\u4E0D\u8BB0\u5F55");
        const to = s.who(p[1], true);
        if (to !== PROTAGONIST) throw new Error("\u53EA\u8BB0\u5F55\u522B\u4EBA\u5BF9\u4E3B\u89D2\u7684\u6001\u5EA6\uFF1B\u89D2\u8272\u4E4B\u95F4\u5199\u300C\u5173\u7CFB\u300D");
        if (kind === "\u6001\u5EA6") {
          const changes = axisChanges(cells[2] ?? "");
          if (!Object.keys(changes).length) throw new Error("\u770B\u4E0D\u61C2\u8FD9\u4E00\u884C\uFF08\u9700\u8981\u300C\u6001\u5EA6\uFF5CA\u2192\u4E3B\u89D2\uFF5C\u4EB2\u8FD1+8\uFF5C\u7F18\u7531\u300D\uFF09");
          return s.attitude(p[0], changes, cells[3] ?? "");
        }
        const delta = num4(cells[2]);
        if (!delta) throw new Error("\u770B\u4E0D\u61C2\u8FD9\u4E00\u884C\uFF08\u9700\u8981\u300C\u719F\u6089\uFF5CA\u2192\u4E3B\u89D2\uFF5C+10\uFF5C\u7F18\u7531\u300D\uFF09");
        return s.attitude(p[0], { familiarity: delta }, cells[3] ?? "");
      }
      if (kind === "\u5173\u7CFB") {
        const p = pair(cells[1] ?? "", /\s*(?:与|和|、|→|->)\s*/);
        if (!p) throw new Error("\u770B\u4E0D\u61C2\u8FD9\u4E00\u884C\uFF08\u9700\u8981\u300C\u5173\u7CFB\uFF5CA\u4E0EB\uFF5C\u73B0\u5728\u7684\u5173\u7CFB\uFF5C\u7F18\u7531\u300D\uFF09");
        return s.bond(p[0], p[1], cells[2] ?? "", cells[3] ?? "");
      }
      if (kind === "\u72B6\u6001") {
        const what = cells[2] ?? "";
        if (!/^[+\-＋－]/.test(what)) throw new Error("\u72B6\u6001\u9700\u8981\u5199\u300C+\u540D\u79F0\u300D\u6216\u300C-\u540D\u79F0\u300D");
        const label = what.slice(1).trim();
        if (/^[+＋]/.test(what)) {
          const hasEffects = Object.keys(attributePairs(cells[3] ?? "", true)).length > 0;
          return s.addStatus(cells[1] ?? "", label, hasEffects ? cells[3] ?? "" : "", (hasEffects ? cells[4] : cells[3]) ?? "");
        }
        return s.removeStatus(cells[1] ?? "", label);
      }
      if (kind === "\u65B0\u89D2\u8272") {
        return s.newCharacter(cells[1] ?? "", cells.slice(2).join(" "), cells.slice(2).filter((c) => !/\d/.test(c)).join("\uFF1B"));
      }
      if (kind === "\u5C5E\u6027") {
        const m = (cells[2] ?? "").match(/^(.+?)\s*([+\-＋－−]\s*\d+)/);
        if (!m) throw new Error("\u9700\u8981\u300C\u5C5E\u6027\uFF5C\u89D2\u8272\uFF5C\u53E3\u624D+5\uFF5C\u7406\u7531\u300D");
        return s.growth(cells[1] ?? "", m[1].trim(), m[2], cells[3] ?? "");
      }
      if (kind === "\u7279\u957F") {
        if (!((cells[3] ?? "") in SKILL_LEVELS)) throw new Error("\u9700\u8981\u300C\u7279\u957F\uFF5C\u89D2\u8272\uFF5C\u7279\u957F\u540D\uFF5C\u672A\u5B66/\u5165\u95E8/\u719F\u7EC3/\u7CBE\u901A/\u5927\u5E08\u300D");
        return s.growth(cells[1] ?? "", cells[2] ?? "", cells[3] ?? "", cells[4] ?? "");
      }
      throw new Error(`\u4E0D\u8BA4\u8BC6\u300C${kind}\u300D\u8FD9\u4E00\u7C7B\u53D8\u5316`);
    });
  }
  return s.results;
}

// src/plugins/tabletop/world/city/everyday.ts
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}
var pick = (rand, list4) => list4[Math.floor(rand() * list4.length)];
var OLD_TOWN = /* @__PURE__ */ new Set(["zhongcheng", "bei-an", "anhua"]);
var NAME_WORDS = [
  "\u68A7\u6850",
  "\u67AB\u6797",
  "\u6625\u6C5F",
  "\u7EFF\u6D32",
  "\u9526\u7EE3",
  "\u9633\u5149",
  "\u5EB7\u4E50",
  "\u5B89\u5C45",
  "\u6C38\u548C",
  "\u957F\u4E50",
  "\u5174\u4E1A",
  "\u660E\u73E0",
  "\u9759\u56ED",
  "\u6E05\u6CB3",
  "\u94F6\u674F",
  "\u9999\u6A1F",
  "\u6D77\u68E0",
  "\u7389\u5170",
  "\u6843\u6E90",
  "\u7D2B\u8587",
  "\u65B0\u534E",
  "\u548C\u5E73",
  "\u4E1C\u65B9",
  "\u6EE8\u6C5F",
  "\u6C5F\u5357",
  "\u4E16\u7EAA",
  "\u5929\u548C",
  "\u4E3D\u6C34",
  "\u4E91\u666F",
  "\u78A7\u4E91",
  "\u7FE0\u6E56",
  "\u767D\u9E6D",
  "\u660E\u6708",
  "\u6668\u66E6",
  "\u661F\u6CB3",
  "\u5609\u79BE",
  "\u91D1\u6842",
  "\u51E4\u51F0",
  "\u6CF0\u548C",
  "\u745E\u91D1",
  "\u5B9D\u534E",
  "\u987A\u660C",
  "\u5FB7\u5B89",
  "\u5E86\u4F59",
  "\u540C\u4E50",
  "\u6021\u548C",
  "\u6625\u7533",
  "\u5EF6\u5E74"
];
var OLD_HOME = ["\u91CC", "\u574A", "\u65B0\u6751", "\u5F04"];
var NEW_HOME = ["\u82B1\u56ED", "\u5BB6\u56ED", "\u82D1", "\u516C\u5BD3", "\u540D\u90B8", "\u534E\u5EAD", "\u65B0\u57CE", "\u96C5\u82D1"];
var CAFES = [
  "\u62FE\u5149",
  "\u8F6C\u89D2",
  "\u6162\u534A\u62CD",
  "\u4E00\u9685",
  "\u65E7\u65F6\u5149",
  "\u9752\u67E0",
  "\u767D\u9CB8",
  "\u9ED1\u732B",
  "\u706F\u5854",
  "\u5C71\u4E18",
  "\u5357\u98CE",
  "\u5317\u7A97",
  "\u6728\u9A6C",
  "\u5341\u4E00\u6708",
  "\u534A\u5C9B",
  "\u96FE\u5C9B",
  "\u6F2B\u6E38",
  "\u5C0F\u6EE1",
  "\u843D\u65E5",
  "\u65B9\u7CD6",
  "\u7EB8\u98DE\u673A",
  "\u6674\u5929",
  "\u6811\u4E0B",
  "\u5C0F\u9662",
  "\u6A58\u5B50",
  "\u732B\u5934\u9E70",
  "\u56DE\u58F0",
  "\u9E7F\u89D2",
  "\u8FDC\u5C71",
  "\u6625\u5206",
  "\u767D\u9732",
  "\u5411\u65E5\u8475",
  "\u8001\u5531\u7247",
  "\u98DE\u9E1F",
  "\u8FF7\u9014",
  "\u6708\u53F0",
  "\u6D77\u76D0",
  "\u677E\u679C",
  "\u6696\u9633",
  "\u96E8\u5DF7"
];
var CAFE_SUFFIX = ["\u5496\u5561", "\u5496\u5561\u9986", "\u5496\u5561\u5C4B", "\u5496\u5561\u5E97"];
var FOOD_OWNERS = [
  "\u8001\u738B",
  "\u963F\u82F1",
  "\u5C0F\u6768",
  "\u8001\u9A6C",
  "\u963F\u5A1F",
  "\u798F\u8BB0",
  "\u8363\u8BB0",
  "\u540C\u798F",
  "\u56DB\u5B63",
  "\u6C5F\u8FB9",
  "\u5DF7\u53E3",
  "\u8857\u89D2",
  "\u5F04\u53E3",
  "\u8001\u8857",
  "\u963F\u4E09",
  "\u80D6\u5B50",
  "\u8521\u8BB0",
  "\u8001\u9648",
  "\u5927\u7897",
  "\u5C0F\u674E"
];
var FOOD_TYPES = [
  ["\u9762\u9986", "10:00\u201321:30"],
  ["\u5C0F\u9984\u9968", "06:00\u201320:00"],
  ["\u672C\u5E2E\u83DC", "11:00\u201321:30"],
  ["\u751F\u714E", "06:30\u201319:00"],
  ["\u70E7\u70E4", "17:00\u201302:00"],
  ["\u706B\u9505", "11:00\u201323:00"],
  ["\u5DDD\u83DC\u9986", "11:00\u201322:00"],
  ["\u7CA4\u83DC\u9986", "11:00\u201321:30"],
  ["\u65E5\u6599", "11:30\u201322:30"],
  ["\u897F\u9910\u5385", "11:00\u201322:30"],
  ["\u725B\u8089\u9762", "07:00\u201321:00"],
  ["\u9EBB\u8FA3\u70EB", "10:00\u201323:00"],
  ["\u997A\u5B50\u9986", "10:00\u201321:00"],
  ["\u5C0F\u9F99\u867E", "16:00\u201302:00"],
  ["\u8336\u9910\u5385", "07:00\u201322:00"],
  ["\u65E9\u9910\u5E97", "05:30\u201310:30"]
];
var BARS = [
  "\u591C\u822A",
  "\u56DE\u58F0",
  "\u96FE\u6E2F",
  "\u6708\u5149",
  "\u8001\u8239",
  "\u84DD\u8C03",
  "\u5C0F\u914C",
  "\u5FAE\u91BA",
  "\u540E\u5DF7",
  "\u706F\u706B",
  "\u5341\u5B57\u8DEF",
  "\u7801\u5934",
  "\u6DF1\u84DD",
  "\u91CE\u72D0",
  "\u65E7\u8239\u7968",
  "\u5348\u591C",
  "\u9713\u8679",
  "\u77F3\u5E93",
  "\u6D6E\u751F",
  "\u9189\u6708",
  "\u9ED1\u80F6",
  "\u5929\u53F0",
  "\u6162\u6447",
  "\u7425\u73C0",
  "\u7070\u9E66\u9E49",
  "\u5317\u6781\u661F",
  "\u7EA2\u7816",
  "\u6C34\u624B"
];
var BAR_SUFFIX = ["\u9152\u5427", "\u9152\u9986", "\u5C0F\u9152\u9986"];
var SHOPS = [
  ["\u4FBF\u5229\u5E97", "\u5168\u5929", "\u4E8C\u5341\u56DB\u5C0F\u65F6\u4FBF\u5229\u5E97\uFF0C\u5173\u4E1C\u716E\u548C\u996D\u56E2\u90FD\u6709\u3002"],
  ["\u6C34\u679C\u5E97", "08:00\u201322:00", "\u8857\u8FB9\u7684\u6C34\u679C\u5E97\uFF0C\u8001\u677F\u5A18\u4F1A\u5E2E\u4F60\u6311\u3002"],
  ["\u82B1\u5E97", "09:00\u201321:00", "\u5C0F\u5C0F\u7684\u82B1\u5E97\uFF0C\u95E8\u53E3\u6446\u6EE1\u4E86\u9C9C\u82B1\u3002"],
  ["\u4E66\u5E97", "10:00\u201321:00", "\u4E00\u5BB6\u72EC\u7ACB\u4E66\u5E97\uFF0C\u697C\u4E0A\u53EF\u4EE5\u5750\u7740\u770B\u4E66\u3002"],
  ["\u836F\u5E97", "08:00\u201322:00", "\u8FDE\u9501\u836F\u5E97\uFF0C\u591C\u91CC\u6709\u503C\u73ED\u7A97\u53E3\u3002"],
  ["\u8D85\u5E02", "07:30\u201322:00", "\u793E\u533A\u8D85\u5E02\uFF0C\u508D\u665A\u4E70\u83DC\u7684\u4EBA\u591A\u3002"],
  ["\u7406\u53D1\u5E97", "09:00\u201321:00", "\u5C0F\u7406\u53D1\u5E97\uFF0C\u5E08\u5085\u624B\u827A\u4E0D\u9519\u3002"]
];
var GYMS = ["\u71C3\u52A8\u5065\u8EAB", "\u94C1\u9986\u5065\u8EAB", "\u8F7B\u6C27\u5065\u8EAB", "\u529B\u884C\u5065\u8EAB", "\u8DC3\u52A8\u5065\u8EAB"];
var HOTELS = ["\u6C5F\u60A6\u9152\u5E97", "\u6F9C\u5EAD\u9152\u5E97", "\u6816\u4E91\u9152\u5E97", "\u60A6\u5C45\u9152\u5E97", "\u6F2B\u5C45\u9152\u5E97", "\u5C71\u6C34\u9152\u5E97"];
var homeAbout = (rand, district, density) => OLD_TOWN.has(district) ? pick(rand, ["\u77F3\u5E93\u95E8\u5F04\u5802\uFF0C\u51E0\u6237\u4EBA\u5BB6\u5408\u7528\u4E00\u4E2A\u7076\u62AB\u95F4\u3002", "\u516B\u5341\u5E74\u4EE3\u7684\u8001\u516C\u623F\uFF0C\u516D\u5C42\uFF0C\u6CA1\u6709\u7535\u68AF\u3002", "\u8001\u5F04\u5802\u7FFB\u4FEE\u8FC7\uFF0C\u90BB\u5C45\u5927\u591A\u662F\u8001\u4F4F\u6237\u3002"]) : density >= 2 ? pick(rand, ["\u4E8C\u5341\u591A\u5C42\u7684\u9AD8\u5C42\u5C0F\u533A\uFF0C\u7269\u4E1A\u8FD8\u7B97\u5C3D\u8D23\u3002", "\u4E5D\u5341\u5E74\u4EE3\u7684\u8001\u516C\u623F\u5C0F\u533A\uFF0C\u7EFF\u5316\u5F88\u597D\u3002", "\u65B0\u5EFA\u7684\u7535\u68AF\u623F\uFF0C\u5E74\u8F7B\u79DF\u5BA2\u591A\u3002", "\u4E2D\u6863\u5C0F\u533A\uFF0C\u697C\u4E0B\u6709\u5FEB\u9012\u67DC\u548C\u4FBF\u5229\u5E97\u3002"]) : pick(rand, ["\u90CA\u533A\u7684\u591A\u5C42\u5C0F\u533A\uFF0C\u623F\u79DF\u4FBF\u5B9C\uFF0C\u79BB\u5730\u94C1\u6709\u70B9\u8FDC\u3002", "\u9547\u4E0A\u7684\u8001\u5C0F\u533A\uFF0C\u697C\u4E0B\u5C31\u662F\u83DC\u573A\u3002", "\u65B0\u5EFA\u7684\u5927\u793E\u533A\uFF0C\u5468\u56F4\u8FD8\u5728\u65BD\u5DE5\u3002"]);
function plan(density) {
  if (density === 3) return ["residence", "residence", "food", "food", "cafe", "bar", "shop", "office"];
  if (density === 2) return ["residence", "residence", "food", "cafe", "shop", "market"];
  return ["residence", "food", "shop", "market"];
}
function everydayPlaces(anchors, free, reserved = []) {
  const out = [];
  const used = new Set(reserved);
  const unique = (draw, area2) => {
    let n = draw();
    for (let i = 0; used.has(n) && i < 8; i++) n = draw();
    if (used.has(n)) n = `${area2}${n}`;
    for (let i = 2; used.has(n); i++) n = `${n}${i}`;
    used.add(n);
    return n;
  };
  const branch = (brand, area2) => {
    const n = `${brand}\uFF08${area2}\u5E97\uFF09`;
    used.add(n);
    return n;
  };
  for (const anchor of anchors) {
    const rand = rng(hash(anchor.name));
    const kinds = plan(anchor.density);
    const roll = hash(anchor.name) % 12;
    if (anchor.density >= 2 && roll < 3) kinds.push("police");
    if (anchor.density >= 2 && roll >= 3 && roll < 6) kinds.push("hospital");
    if (roll % 3 === 0) kinds.push("school");
    if (anchor.density >= 2 && roll % 4 === 1) kinds.push("gym");
    if (anchor.density === 3 && roll % 3 === 2) kinds.push("hotel");
    const radius = anchor.density === 3 ? 0.45 : anchor.density === 2 ? 0.7 : 0.9;
    kinds.forEach((kind, i) => {
      let at = null;
      for (let tries = 0; tries < 12 && !at; tries++) {
        const a = rand() * Math.PI * 2;
        const d = radius * (0.25 + 0.75 * Math.sqrt(rand()));
        const p = [Math.round((anchor.at[0] + Math.cos(a) * d) * 1e3) / 1e3, Math.round((anchor.at[1] + Math.sin(a) * d) * 1e3) / 1e3];
        if (free(p)) at = p;
      }
      if (!at) return;
      const id = `e-${hash(anchor.name).toString(36)}-${i}`;
      const short = anchor.name.replace(/（.*$/, "").slice(0, 4);
      let name = "";
      let hours = "\u5168\u5929";
      let about;
      switch (kind) {
        case "residence": {
          const old = OLD_TOWN.has(anchor.district) && rand() < 0.7;
          name = unique(() => `${pick(rand, NAME_WORDS)}${pick(rand, old ? OLD_HOME : NEW_HOME)}`, short);
          about = homeAbout(rand, anchor.district, anchor.density);
          break;
        }
        case "food": {
          const [type, h] = pick(rand, FOOD_TYPES);
          name = unique(() => `${pick(rand, FOOD_OWNERS)}${type}`, short);
          hours = h;
          about = pick(rand, ["\u5F00\u4E86\u5341\u51E0\u5E74\u7684\u8001\u5E97\uFF0C\u719F\u5BA2\u591A\u3002", "\u95E8\u9762\u4E0D\u5927\uFF0C\u996D\u70B9\u8981\u6392\u961F\u3002", "\u65B0\u5F00\u7684\u5E97\uFF0C\u88C5\u4FEE\u5E72\u51C0\uFF0C\u5E74\u8F7B\u4EBA\u591A\u3002", "\u9644\u8FD1\u4E0A\u73ED\u7684\u4EBA\u4E2D\u5348\u5E38\u6765\u3002"]);
          break;
        }
        case "cafe":
          name = unique(() => `${pick(rand, CAFES)}${pick(rand, CAFE_SUFFIX)}`, short);
          hours = pick(rand, ["08:00\u201321:00", "07:30\u201320:00", "09:00\u201322:00"]);
          about = pick(rand, ["\u5B89\u9759\u7684\u5C0F\u5496\u5561\u9986\uFF0C\u5E38\u6709\u4EBA\u5E26\u7535\u8111\u6765\u529E\u516C\u3002", "\u4E34\u8857\u7684\u5496\u5561\u9986\uFF0C\u6709\u51E0\u5F20\u9760\u7A97\u7684\u4F4D\u5B50\u3002", "\u8001\u623F\u5B50\u6539\u7684\u5496\u5561\u9986\uFF0C\u6709\u4E2A\u5C0F\u9662\u5B50\u3002", "\u8FDE\u9501\u98CE\u683C\u7684\u5496\u5561\u9986\uFF0C\u4EBA\u6765\u4EBA\u5F80\u3002"]);
          break;
        case "bar":
          name = unique(() => `${pick(rand, BARS)}${pick(rand, BAR_SUFFIX)}`, short);
          hours = pick(rand, ["19:00\u201302:00", "18:00\u201301:00", "20:00\u201303:00"]);
          about = pick(rand, ["\u5C0F\u9152\u5427\uFF0C\u5468\u672B\u6709\u9A7B\u5531\u3002", "\u7CBE\u917F\u9152\u5427\uFF0C\u95E8\u53E3\u5E38\u7AD9\u7740\u62BD\u70DF\u804A\u5929\u7684\u4EBA\u3002", "\u706F\u5149\u5F88\u6697\u7684\u9E21\u5C3E\u9152\u5427\uFF0C\u8C03\u9152\u5E08\u8BDD\u4E0D\u591A\u3002"]);
          break;
        case "shop": {
          const [type, h, text] = pick(rand, SHOPS);
          name = unique(() => `${short}${type}`, "");
          hours = h;
          about = text;
          break;
        }
        case "market":
          name = unique(() => `${short}\u83DC\u5E02\u573A`, "");
          hours = "06:00\u201318:00";
          about = "\u793E\u533A\u7684\u83DC\u5E02\u573A\uFF0C\u65E9\u4E0A\u6700\u70ED\u95F9\uFF0C\u4E0B\u5348\u6709\u7684\u644A\u4F4D\u5C31\u6536\u4E86\u3002";
          break;
        case "school": {
          const level = rand() < 0.5 ? "\u5C0F\u5B66" : "\u4E2D\u5B66";
          name = unique(() => `${short}${level}`, "");
          hours = "\u5DE5\u4F5C\u65E5 07:30\u201317:00";
          about = level === "\u5C0F\u5B66" ? "\u793E\u533A\u5C0F\u5B66\uFF0C\u653E\u5B66\u65F6\u95E8\u53E3\u6324\u6EE1\u63A5\u5B69\u5B50\u7684\u5BB6\u957F\u3002" : "\u533A\u91CC\u7684\u4E2D\u5B66\uFF0C\u665A\u81EA\u4E60\u5230\u4E5D\u70B9\u3002";
          break;
        }
        case "office":
          name = unique(() => `${pick(rand, NAME_WORDS)}${pick(rand, ["\u5927\u53A6", "\u4E2D\u5FC3", "\u5E7F\u573A"])}`, short);
          about = pick(rand, ["\u4E8C\u4E09\u5341\u5C42\u7684\u5199\u5B57\u697C\uFF0C\u697C\u91CC\u6709\u4E0D\u5C11\u5C0F\u516C\u53F8\u3002", "\u8001\u724C\u5199\u5B57\u697C\uFF0C\u7535\u68AF\u65E9\u9AD8\u5CF0\u8981\u6392\u961F\u3002", "\u65B0\u7684\u7532\u7EA7\u5199\u5B57\u697C\uFF0C\u5927\u516C\u53F8\u7684\u529E\u516C\u5BA4\u5728\u9AD8\u5C42\u3002"]);
          break;
        case "hotel":
          name = branch(pick(rand, HOTELS), short);
          about = pick(rand, ["\u5546\u52A1\u9152\u5E97\uFF0C\u623F\u95F4\u4E0D\u5927\u4F46\u5E72\u51C0\u3002", "\u8001\u724C\u9152\u5E97\uFF0C\u5927\u5802\u5F88\u6C14\u6D3E\u3002", "\u7ECF\u6D4E\u578B\u9152\u5E97\uFF0C\u524D\u53F0\u4E8C\u5341\u56DB\u5C0F\u65F6\u6709\u4EBA\u3002"]);
          break;
        case "gym":
          name = branch(pick(rand, GYMS), short);
          hours = "07:00\u201323:00";
          about = "\u5065\u8EAB\u623F\uFF0C\u665A\u4E0A\u4E0B\u73ED\u540E\u4EBA\u6700\u591A\u3002";
          break;
        case "police":
          name = unique(() => `${short}\u6D3E\u51FA\u6240`, "");
          about = "\u6D3E\u51FA\u6240\uFF0C\u62A5\u8B66\u3001\u529E\u8BC1\u90FD\u53EF\u4EE5\u6765\uFF0C\u503C\u73ED\u5BA4\u591C\u91CC\u4E5F\u6709\u4EBA\u3002";
          break;
        case "hospital":
          name = unique(() => `${short}\u793E\u533A\u536B\u751F\u670D\u52A1\u4E2D\u5FC3`, "");
          hours = "08:00\u201317:00";
          about = "\u793E\u533A\u533B\u9662\uFF0C\u770B\u4E2A\u611F\u5192\u3001\u914D\u836F\u4E0D\u7528\u53BB\u5927\u533B\u9662\u6392\u961F\u3002";
          break;
        default:
          return;
      }
      out.push({ id, name, kind, at, hours, about });
    });
  }
  return out;
}

// src/plugins/tabletop/world/city/detail.ts
var URBAN = [
  {
    name: "\u4E2D\u5FC3\u57CE\u533A",
    outline: [
      [121.49, 31.4],
      [121.42, 31.395],
      [121.36, 31.365],
      [121.33, 31.3],
      [121.29, 31.245],
      [121.255, 31.2],
      [121.29, 31.16],
      [121.33, 31.13],
      [121.37, 31.08],
      [121.42, 31.055],
      [121.5, 31.065],
      [121.57, 31.085],
      [121.635, 31.125],
      [121.675, 31.18],
      [121.685, 31.255],
      [121.665, 31.31],
      [121.62, 31.35],
      [121.56, 31.372],
      [121.505, 31.39]
    ]
  },
  { name: "\u5609\u79BE\u8001\u57CE", at: [121.255, 31.37], r: 0.03, stretch: 0.8 },
  { name: "\u6C7D\u8F66\u57CE", at: [121.17, 31.29], r: 0.018 },
  { name: "\u9752\u6E56\u65B0\u57CE", at: [121.12, 31.15], r: 0.022, stretch: 1.3 },
  { name: "\u897F\u5C71\u65B0\u57CE", at: [121.22, 31.03], r: 0.033, stretch: 1.2 },
  { name: "\u6D77\u6865\u65B0\u57CE", at: [121.47, 30.92], r: 0.028, stretch: 1.3 },
  { name: "\u91D1\u536B", at: [121.33, 30.745], r: 0.02, stretch: 1.4 },
  { name: "\u4E34\u6D77\u65B0\u57CE", at: [121.915, 30.905], r: 0.03 },
  { name: "\u60E0\u57CE", at: [121.76, 31.045], r: 0.018 },
  { name: "\u6C99\u57CE", at: [121.7, 31.19], r: 0.016 },
  { name: "\u5468\u5858", at: [121.6, 31.1], r: 0.02 },
  { name: "\u9AD8\u6E2F", at: [121.58, 31.345], r: 0.012 },
  { name: "\u6CA7\u57CE", at: [121.4, 31.63], r: 0.012, stretch: 1.4 },
  { name: "\u7F57\u9547", at: [121.34, 31.405], r: 0.012 }
];
var INDUSTRY = [
  { name: "\u6C5F\u53E3\u94A2\u94C1\u5382", at: [121.44, 31.42], r: 0.018, stretch: 1.4 },
  { name: "\u6E2F\u533A", at: [121.6, 31.35], r: 0.02, stretch: 1.6 },
  { name: "\u91D1\u6E2F", at: [121.6, 31.26], r: 0.016 },
  { name: "\u5316\u5DE5\u533A", at: [121.45, 30.8], r: 0.022, stretch: 1.5 },
  { name: "\u6C7D\u8F66\u57CE", at: [121.2, 31.3], r: 0.012 },
  { name: "\u4E34\u6D77\u4EA7\u4E1A\u533A", at: [121.86, 30.93], r: 0.018 }
];
var GREENS = [
  { name: "\u4E2D\u592E\u516C\u56ED", at: [121.551, 31.2165], r: 65e-4 },
  { name: "\u6C5F\u6E7E\u68EE\u6797\u516C\u56ED", at: [121.546, 31.322], r: 6e-3, stretch: 0.8 },
  { name: "\u6F9C\u6C5F\u690D\u7269\u56ED", at: [121.447, 31.15], r: 6e-3 },
  { name: "\u897F\u6865\u516C\u56ED", at: [121.418, 31.2215], r: 25e-4 },
  { name: "\u957F\u5824\u516C\u56ED", at: [121.395, 31.2265], r: 4e-3 },
  { name: "\u6F9C\u6C5F\u52A8\u7269\u56ED", at: [121.365, 31.1925], r: 5e-3 },
  { name: "\u6A31\u82B1\u516C\u56ED", at: [121.38, 31.35], r: 8e-3 },
  { name: "\u70AE\u53F0\u6E7F\u5730\u516C\u56ED", at: [121.487, 31.401], r: 4e-3 },
  { name: "\u897F\u5C71\u68EE\u6797", at: [121.185, 31.095], r: 0.035, stretch: 1.3 },
  { name: "\u6F9C\u6C5F\u4E50\u56ED", at: [121.657, 31.1445], r: 0.012 },
  { name: "\u91CE\u751F\u52A8\u7269\u56ED", at: [121.72, 31.06], r: 9e-3 },
  { name: "\u6D77\u6E7E\u68EE\u6797\u516C\u56ED", at: [121.65, 30.862], r: 0.012, stretch: 1.6 },
  { name: "\u6CA7\u6D32\u68EE\u6797\u516C\u56ED", at: [121.45, 31.69], r: 0.014, stretch: 1.4 },
  { name: "\u4E1C\u6EE9\u6E7F\u5730", outline: [[121.88, 31.535], [121.95, 31.53], [121.975, 31.5], [121.93, 31.48], [121.88, 31.5]] },
  { name: "\u4E16\u7EAA\u6EE8\u6C5F", at: [121.53, 31.264], r: 3e-3, stretch: 2.5 }
];
var SHOALS = [
  { name: "\u4E5D\u6C99\u6E7F\u5730", outline: [[121.9, 31.215], [121.98, 31.195], [122.05, 31.145], [122.01, 31.12], [121.93, 31.16]] },
  { name: "\u4E1C\u6EE9", outline: [[121.975, 31.53], [122.06, 31.5], [122.05, 31.47], [121.985, 31.485]] },
  { name: "\u5357\u6C47\u4E1C\u6EE9", outline: [[121.975, 30.95], [122.02, 30.92], [122, 30.875], [121.975, 30.89]] }
];
var CANALS = [
  ["\u4E1C\u8FD0\u6CB3", 80, [[121.494, 31.062], [121.6, 31.05], [121.7, 31.03], [121.8, 31.012], [121.9, 30.996]]],
  ["\u5DDD\u6CB3", 60, [[121.474, 31.13], [121.58, 31.15], [121.7, 31.17], [121.835, 31.19]]],
  ["\u6DC0\u6EAA", 60, [[121, 31.13], [121.12, 31.14], [121.25, 31.15], [121.35, 31.152], [121.466, 31.155]]],
  ["\u85FB\u6EAA", 60, [[121.2, 31.33], [121.3, 31.34], [121.4, 31.35], [121.48, 31.355], [121.533, 31.356]]],
  ["\u6D77\u6865\u6CB3", 60, [[121.462, 31.006], [121.475, 30.92], [121.48, 30.818]]],
  ["\u592A\u6EAA", 120, [[120.952, 31.067], [120.9, 31.03], [120.862, 31.02]]],
  ["\u6CB9\u6EAA", 50, [[121.15, 31.27], [121.15, 31.15], [121.17, 31.04], [121.19, 30.972]]]
];
var RESERVOIRS = [
  { name: "\u9752\u6C99\u6C34\u5E93", outline: [[121.56, 31.42], [121.66, 31.415], [121.7, 31.405], [121.62, 31.398], [121.572, 31.406]] },
  { name: "\u4E2D\u592E\u516C\u56ED\u6E56", at: [121.552, 31.215], r: 18e-4 }
];
var PORT_ISLAND = [[122.025, 30.635], [122.075, 30.63], [122.105, 30.618], [122.07, 30.604], [122.03, 30.612]];
var AIRPORTS = [
  {
    name: "\u4E1C\u90E8\u673A\u573A",
    area: [[121.768, 31.185], [121.84, 31.185], [121.842, 31.118], [121.765, 31.118]],
    runways: [
      [[121.776, 31.172], [121.776, 31.128]],
      [[121.792, 31.177], [121.792, 31.133]],
      [[121.81, 31.177], [121.81, 31.133]],
      [[121.828, 31.17], [121.828, 31.126]]
    ]
  },
  {
    name: "\u897F\u90CA\u673A\u573A",
    area: [[121.33, 31.218], [121.352, 31.218], [121.352, 31.176], [121.33, 31.176]],
    runways: [[[121.336, 31.214], [121.336, 31.18]], [[121.345, 31.214], [121.345, 31.18]]]
  }
];
var TOWNS = [
  ["\u9AD8\u6E2F", [121.58, 31.343]],
  ["\u795D\u9547", [121.75, 31.1]],
  ["\u60E0\u57CE", [121.76, 31.045]],
  ["\u76D0\u573A", [121.65, 31.03]],
  ["\u8001\u6E2F", [121.86, 31.06]],
  ["\u5468\u5858", [121.6, 31.1]],
  ["\u6C99\u57CE", [121.7, 31.19]],
  ["\u67D8\u9547", [121.52, 30.85]],
  ["\u6731\u6EAA", [121.17, 30.9]],
  ["\u67AB\u6EAA", [121.02, 30.89]],
  ["\u91D1\u536B", [121.33, 30.745]],
  ["\u53F6\u6EAA", [121.3, 30.95]],
  ["\u7EC3\u6EAA", [121.05, 31]],
  ["\u91D1\u6E56\u9547", [120.92, 31.04]],
  ["\u767D\u9E64", [121.12, 31.24]],
  ["\u534E\u9547", [121.22, 31.22]],
  ["\u9A6C\u5E84", [121.28, 31.33]],
  ["\u5916\u5C97", [121.17, 31.36]],
  ["\u534E\u5858", [121.25, 31.46]],
  ["\u7F57\u9547", [121.34, 31.405]],
  ["\u6708\u6E7E", [121.42, 31.43]],
  ["\u5927\u5E84", [121.42, 31.31]],
  ["\u987E\u5E84", [121.38, 31.36]],
  ["\u5434\u6EAA", [121.46, 31.04]],
  ["\u9A6C\u6865", [121.38, 31.03]],
  ["\u5E99\u6E2F", [121.3, 31.72]],
  ["\u5821\u6E2F", [121.6, 31.55]],
  ["\u9648\u9547", [121.83, 31.52]],
  ["\u957F\u5174", [121.72, 31.38]]
];

// src/plugins/tabletop/world/city/geo.ts
var SCALE = 0.5;
var ORIGIN = [121.475, 31.232];
var KM_PER_LAT = 110.57;
var KM_PER_LON = 111.32 * Math.cos(ORIGIN[1] * Math.PI / 180);
function project([lon, lat]) {
  return [round((lon - ORIGIN[0]) * KM_PER_LON * SCALE), round((ORIGIN[1] - lat) * KM_PER_LAT * SCALE)];
}
var round = (n) => Math.round(n * 1e3) / 1e3;
function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
function inside(point, polygon) {
  const [x, y] = point;
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
function area(polygon) {
  let sum = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) sum += (polygon[j][0] + polygon[i][0]) * (polygon[j][1] - polygon[i][1]);
  return Math.abs(sum / 2);
}
function centroid(polygon) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const f = polygon[j][0] * polygon[i][1] - polygon[i][0] * polygon[j][1];
    a += f;
    cx += (polygon[j][0] + polygon[i][0]) * f;
    cy += (polygon[j][1] + polygon[i][1]) * f;
  }
  a /= 2;
  return a ? [round(cx / (6 * a)), round(cy / (6 * a))] : polygon[0];
}
function distanceToLine(p, line2) {
  let best = Infinity;
  for (let i = 1; i < line2.length; i++) {
    const [ax, ay] = line2[i - 1];
    const [bx, by] = line2[i];
    const dx = bx - ax;
    const dy = by - ay;
    const t = dx || dy ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy))) : 0;
    best = Math.min(best, Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy)));
  }
  return best;
}
function blobOutline(blob, seed = 0) {
  if (blob.outline) return [...blob.outline];
  const [lon, lat] = blob.at;
  const r = blob.r;
  const k = Math.cos(lat * Math.PI / 180);
  const n = 18;
  return Array.from({ length: n }, (_, i) => {
    const a = i / n * Math.PI * 2;
    const wobble = 1 + 0.12 * Math.sin(3 * a + seed) + 0.06 * Math.cos(5 * a + seed * 1.7);
    return [
      Math.round((lon + r * (blob.stretch ?? 1) * wobble * Math.cos(a) / k) * 1e5) / 1e5,
      Math.round((lat + r * wobble * Math.sin(a)) * 1e5) / 1e5
    ];
  });
}

// src/plugins/tabletop/world/city/places.ts
var KIND_LABEL = {
  residence: "\u4F4F\u5B85",
  office: "\u5199\u5B57\u697C",
  industry: "\u5DE5\u4E1A\u533A",
  mall: "\u5546\u4E1A",
  market: "\u83DC\u5E02\u573A",
  food: "\u9910\u9986",
  cafe: "\u5496\u5561\u9986",
  bar: "\u9152\u5427",
  park: "\u516C\u56ED",
  sight: "\u666F\u70B9",
  fun: "\u5A31\u4E50",
  school: "\u5B66\u6821",
  hospital: "\u533B\u9662",
  police: "\u6D3E\u51FA\u6240",
  government: "\u653F\u5E9C\u673A\u5173",
  station: "\u8F66\u7AD9",
  airport: "\u673A\u573A",
  hotel: "\u9152\u5E97",
  shop: "\u5546\u5E97",
  gym: "\u5065\u8EAB\u623F"
};
var LANDMARKS = [
  // 中城区
  { name: "\u6C5F\u6EE9", kind: "sight", at: [121.4905, 31.239], hours: "\u5168\u5929", about: "\u6F9C\u6C5F\u897F\u5CB8\u4E00\u516C\u91CC\u957F\u7684\u6C5F\u5824\uFF0C\u80CC\u540E\u662F\u4E00\u6392\u4E0A\u767E\u5E74\u7684\u8001\u5EFA\u7B51\uFF0C\u5BF9\u5CB8\u5C31\u662F\u671B\u6C5F\u5634\u3002" },
  { name: "\u5E02\u6C11\u5E7F\u573A", kind: "park", at: [121.475, 31.2325], hours: "\u5168\u5929", about: "\u57CE\u5E02\u6B63\u4E2D\u7684\u5E7F\u573A\uFF0C\u5468\u56F4\u6709\u535A\u7269\u9986\u3001\u5927\u5267\u9662\u548C\u5E02\u653F\u5E9C\u3002" },
  { name: "\u957F\u8857", kind: "mall", at: [121.4835, 31.2375], hours: "10:00\u201322:00", about: "\u4ECE\u5E02\u6C11\u5E7F\u573A\u901A\u5230\u6C5F\u6EE9\u7684\u6B65\u884C\u8857\uFF0C\u8001\u5B57\u53F7\u548C\u5927\u5546\u573A\u6328\u5728\u4E00\u8D77\u3002" },
  { name: "\u8001\u57CE\u53A2", kind: "sight", at: [121.492, 31.2265], hours: "09:00\u201321:00", about: "\u8001\u57CE\u53A2\u548C\u57CE\u968D\u5E99\uFF1A\u8001\u8857\u3001\u8336\u697C\u3001\u5C0F\u5403\uFF0C\u8FC7\u5E74\u6709\u5E99\u4F1A\u3002" },
  { name: "\u6842\u91CC", kind: "bar", at: [121.4755, 31.2195], hours: "11:00\u201302:00", about: "\u77F3\u5E93\u95E8\u8001\u623F\u5B50\u6539\u6210\u7684\u9910\u5385\u3001\u9152\u5427\u548C\u5C0F\u5E97\uFF0C\u665A\u4E0A\u5F88\u70ED\u95F9\u3002" },
  { name: "\u6F9C\u6C5F\u5E02\u653F\u5E9C", kind: "government", at: [121.4735, 31.2305], hours: "\u5DE5\u4F5C\u65E5 09:00\u201317:00", about: "\u5E02\u653F\u5E9C\u5927\u697C\uFF0C\u5728\u5E02\u6C11\u5E7F\u573A\u5317\u4FA7\u3002" },
  { name: "\u6F9C\u6C5F\u5E02\u516C\u5B89\u5C40", kind: "police", at: [121.4805, 31.2355], hours: "\u5168\u5929", about: "\u5E02\u516C\u5B89\u5C40\uFF0C\u62A5\u6848\u3001\u6237\u7C4D\u548C\u51FA\u5165\u5883\u90FD\u5728\u8FD9\u91CC\u529E\u3002" },
  { name: "\u4E2D\u57CE\u533B\u9662", kind: "hospital", at: [121.466, 31.2125], hours: "\u5168\u5929", about: "\u8001\u724C\u4E09\u7532\u533B\u9662\uFF0C\u6025\u8BCA\u5168\u5929\u5F00\u7740\uFF0C\u95E8\u8BCA\u4EBA\u5F88\u591A\u3002" },
  { name: "\u6C5F\u6EE9\u8F6E\u6E21\u7AD9", kind: "station", at: [121.4945, 31.2335], hours: "06:00\u201322:00", about: "\u8FC7\u6C5F\u8F6E\u6E21\uFF0C\u5341\u51E0\u5206\u949F\u4E00\u73ED\uFF0C\u5230\u5BF9\u5CB8\u671B\u6C5F\u5634\u3002" },
  // 安华区
  { name: "\u5B89\u534E\u5BFA", kind: "sight", at: [121.446, 31.2235], hours: "07:30\u201317:00", about: "\u95F9\u5E02\u91CC\u7684\u5343\u5E74\u53E4\u5BFA\uFF0C\u91D1\u8272\u7684\u5C4B\u9876\uFF0C\u9999\u706B\u5F88\u65FA\u3002" },
  { name: "\u5B89\u534E\u8DEF", kind: "mall", at: [121.4545, 31.2285], hours: "10:00\u201322:00", about: "\u9AD8\u6863\u5546\u573A\u548C\u5199\u5B57\u697C\u96C6\u4E2D\u7684\u4E00\u6761\u8857\u3002" },
  { name: "\u6F9C\u6C5F\u7AD9", kind: "station", at: [121.455, 31.2495], hours: "\u5168\u5929", about: "\u666E\u901F\u706B\u8F66\u7AD9\uFF0C\u5468\u56F4\u662F\u8001\u57CE\u5317\u7684\u5C45\u4F4F\u533A\u548C\u5C0F\u65C5\u9986\u3002" },
  { name: "\u5B89\u534E\u5317\u516C\u56ED", kind: "park", at: [121.455, 31.2825], hours: "06:00\u201318:00", about: "\u8001\u57CE\u5317\u7684\u5927\u516C\u56ED\uFF0C\u5468\u56F4\u662F\u5927\u578B\u793E\u533A\u548C\u5546\u573A\u3002" },
  { name: "\u9E7F\u9E23\u8DEF\u6D0B\u623F", kind: "residence", at: [121.4355, 31.2215], hours: "\u5168\u5929", about: "\u4E00\u6761\u8857\u7684\u8001\u6D0B\u623F\uFF0C\u4F4F\u7684\u591A\u662F\u8001\u4F4F\u6237\u548C\u6709\u94B1\u7684\u79DF\u5BA2\u3002" },
  // 梧桐区
  { name: "\u8861\u68A7\u8DEF", kind: "cafe", at: [121.447, 31.2055], hours: "08:00\u201323:00", about: "\u68A7\u6850\u6811\u4E0B\u7684\u8001\u6D0B\u623F\u8857\u533A\uFF0C\u5C0F\u5496\u5561\u9986\u3001\u5C0F\u9152\u9986\u548C\u4E70\u624B\u5E97\u3002" },
  { name: "\u5F90\u574A", kind: "mall", at: [121.437, 31.1955], hours: "10:00\u201322:00", about: "\u51E0\u5EA7\u5927\u5546\u573A\u56F4\u7740\u7684\u5341\u5B57\u8DEF\u53E3\uFF0C\u7535\u8111\u57CE\u548C\u7535\u5F71\u9662\u90FD\u5728\u8FD9\u91CC\u3002" },
  { name: "\u6F9C\u6C5F\u7406\u5DE5\u5927\u5B66\uFF08\u5F90\u574A\u6821\u533A\uFF09", kind: "school", at: [121.4365, 31.2015], hours: "\u5168\u5929", about: "\u767E\u5E74\u8001\u6821\u7684\u8001\u6821\u533A\uFF0C\u7EA2\u7816\u697C\u548C\u8349\u576A\u3002" },
  { name: "\u68A7\u6850\u533B\u9662", kind: "hospital", at: [121.4525, 31.1985], hours: "\u5168\u5929", about: "\u7EFC\u5408\u533B\u9662\uFF0C\u5FC3\u5185\u79D1\u548C\u80BF\u7624\u79D1\u6709\u540D\u3002" },
  { name: "\u6EE8\u6C5F\u827A\u672F\u533A", kind: "sight", at: [121.4635, 31.18], hours: "10:00\u201318:00", about: "\u6C5F\u8FB9\u7684\u65E7\u7801\u5934\u548C\u4ED3\u5E93\u6539\u6210\u7684\u7F8E\u672F\u9986\u3001\u5267\u573A\u548C\u8349\u576A\u3002" },
  { name: "\u5854\u56ED", kind: "sight", at: [121.452, 31.1745], hours: "07:00\u201317:00", about: "\u53E4\u5854\u548C\u5BFA\u5E99\uFF0C\u6625\u5929\u6709\u6843\u82B1\u3002" },
  { name: "\u5E02\u4F53\u80B2\u9986", kind: "fun", at: [121.4375, 31.1835], hours: "09:00\u201321:00", about: "\u5706\u9876\u7684\u4F53\u80B2\u9986\uFF0C\u5E38\u529E\u6F14\u5531\u4F1A\u548C\u6BD4\u8D5B\u3002" },
  // 西桥区
  { name: "\u897F\u6865\u516C\u56ED", kind: "park", at: [121.418, 31.2215], hours: "05:00\u201318:00", about: "\u8001\u516C\u56ED\uFF0C\u6668\u7EC3\u7684\u8001\u4EBA\u3001\u76F8\u4EB2\u89D2\u548C\u4E00\u7247\u5927\u8349\u576A\u3002" },
  { name: "\u65B0\u5317", kind: "residence", at: [121.395, 31.2055], hours: "\u5168\u5929", about: "\u5916\u7C4D\u4EBA\u58EB\u591A\u7684\u5C45\u4F4F\u533A\uFF0C\u5468\u56F4\u6709\u56FD\u9645\u5B66\u6821\u3001\u897F\u9910\u5385\u548C\u8D85\u5E02\u3002" },
  { name: "\u897F\u6865\u5546\u52A1\u533A", kind: "office", at: [121.4055, 31.2145], hours: "\u5168\u5929", about: "\u5916\u4F01\u624E\u5806\u7684\u5199\u5B57\u697C\u533A\u3002" },
  { name: "\u6F9C\u6C5F\u52A8\u7269\u56ED", kind: "fun", at: [121.365, 31.1925], hours: "08:00\u201317:00", about: "\u5E02\u91CC\u6700\u5927\u7684\u52A8\u7269\u56ED\u3002" },
  { name: "\u957F\u5824\u516C\u56ED", kind: "park", at: [121.395, 31.2265], hours: "06:00\u201318:00", about: "\u9752\u6EAA\u8FB9\u7684\u5927\u516C\u56ED\uFF0C\u6709\u6E56\u53EF\u4EE5\u5212\u8239\u3002" },
  { name: "\u9752\u6EAA\u4ED3\u5E93", kind: "sight", at: [121.428, 31.2385], hours: "10:00\u201318:00", about: "\u9752\u6EAA\u8FB9\u7684\u8001\u5382\u623F\u6539\u6210\u7684\u753B\u5ECA\u548C\u5DE5\u4F5C\u5BA4\u3002" },
  { name: "\u771F\u56ED", kind: "residence", at: [121.405, 31.2585], hours: "\u5168\u5929", about: "\u8001\u9547\u6539\u6210\u7684\u5927\u5C45\u4F4F\u533A\uFF0C\u83DC\u573A\u3001\u5C0F\u5403\u591A\u3002" },
  // 北岸区
  { name: "\u5317\u5CB8\u4F53\u80B2\u573A", kind: "fun", at: [121.481, 31.2715], hours: "\u6BD4\u8D5B\u65E5", about: "\u4E13\u4E1A\u8DB3\u7403\u573A\uFF0C\u6BD4\u8D5B\u65E5\u4EBA\u5C71\u4EBA\u6D77\u3002" },
  { name: "\u6587\u5316\u516C\u56ED", kind: "park", at: [121.4785, 31.2765], hours: "06:00\u201318:00", about: "\u8001\u516C\u56ED\uFF0C\u6709\u7EAA\u5FF5\u9986\u548C\u4E00\u7247\u6E56\u3002" },
  { name: "\u5317\u8857", kind: "food", at: [121.484, 31.258], hours: "09:00\u201322:00", about: "\u8001\u5546\u4E1A\u8857\uFF0C\u8001\u5B57\u53F7\u5C0F\u5403\u4E00\u5BB6\u6328\u4E00\u5BB6\u3002" },
  { name: "\u5317\u7801\u5934", kind: "sight", at: [121.502, 31.2505], hours: "\u5168\u5929", about: "\u8001\u7801\u5934\u6539\u6210\u7684\u6C5F\u8FB9\u6B65\u9053\u548C\u56FD\u9645\u5BA2\u8FD0\u7801\u5934\u3002" },
  { name: "\u5317\u5CB8\u5F04\u5802", kind: "residence", at: [121.4905, 31.2625], hours: "\u5168\u5929", about: "\u4FDD\u7559\u4E0B\u6765\u7684\u8001\u5F04\u5802\uFF0C\u667E\u8863\u6746\u6A2A\u8FC7\u5934\u9876\uFF0C\u90BB\u91CC\u90FD\u719F\u3002" },
  // 东林区
  { name: "\u6F9C\u6C5F\u5927\u5B66", kind: "school", at: [121.505, 31.298], hours: "\u5168\u5929", about: "\u5168\u5E02\u6700\u597D\u7684\u7EFC\u5408\u5927\u5B66\u4E4B\u4E00\uFF0C\u5468\u8FB9\u662F\u5B66\u751F\u548C\u8001\u5E08\u4F4F\u7684\u5C0F\u533A\u3002" },
  { name: "\u4E94\u5C94\u53E3", kind: "mall", at: [121.515, 31.3005], hours: "10:00\u201322:00", about: "\u4E94\u6761\u8DEF\u4EA4\u6C47\u7684\u5546\u5708\uFF0C\u5B66\u751F\u548C\u5E74\u8F7B\u4EBA\u591A\u3002" },
  { name: "\u4E1C\u6797\u6EE8\u6C5F", kind: "park", at: [121.535, 31.2635], hours: "\u5168\u5929", about: "\u8001\u8239\u5382\u548C\u6C34\u5382\u6539\u6210\u7684\u6C5F\u8FB9\u516C\u56ED\uFF0C\u9002\u5408\u6563\u6B65\u548C\u8DD1\u6B65\u3002" },
  { name: "\u65B0\u6E7E\u57CE", kind: "residence", at: [121.522, 31.3275], hours: "\u5168\u5929", about: "\u65B0\u5EFA\u7684\u5927\u793E\u533A\uFF0C\u7EFF\u5316\u591A\uFF0C\u5E74\u8F7B\u5BB6\u5EAD\u591A\u3002" },
  // 江东区
  { name: "\u671B\u6C5F\u5634\u91D1\u878D\u57CE", kind: "office", at: [121.5025, 31.2375], hours: "\u5168\u5929", about: "\u9AD8\u697C\u6700\u96C6\u4E2D\u7684\u91D1\u878D\u533A\uFF0C\u94F6\u884C\u548C\u5927\u516C\u53F8\u7684\u603B\u90E8\u90FD\u5728\u8FD9\u91CC\uFF0C\u6B63\u5BF9\u6C5F\u6EE9\u3002" },
  { name: "\u671B\u6C5F\u5854", kind: "sight", at: [121.4995, 31.24], hours: "09:00\u201321:30", about: "\u5168\u5E02\u6700\u9AD8\u7684\u697C\uFF0C\u9876\u4E0A\u6709\u89C2\u666F\u53F0\u3002" },
  { name: "\u4E16\u7EAA\u5E7F\u573A", kind: "mall", at: [121.527, 31.2295], hours: "10:00\u201322:00", about: "\u5927\u5546\u573A\u3001\u5199\u5B57\u697C\u548C\u5730\u94C1\u6362\u4E58\u7AD9\u3002" },
  { name: "\u4E2D\u592E\u516C\u56ED", kind: "park", at: [121.551, 31.2165], hours: "07:00\u201318:00", about: "\u5168\u5E02\u6700\u5927\u7684\u57CE\u5E02\u516C\u56ED\uFF0C\u8349\u576A\u548C\u6E56\u3002" },
  { name: "\u6C5F\u4E1C\u533B\u9662", kind: "hospital", at: [121.535, 31.2235], hours: "\u5168\u5929", about: "\u6C5F\u4E1C\u533A\u6700\u5927\u7684\u7EFC\u5408\u533B\u9662\u3002" },
  { name: "\u79D1\u5B66\u57CE", kind: "office", at: [121.59, 31.2055], hours: "\u5168\u5929", about: "\u82AF\u7247\u3001\u751F\u7269\u533B\u836F\u548C\u8F6F\u4EF6\u516C\u53F8\u624E\u5806\u7684\u56ED\u533A\uFF0C\u52A0\u73ED\u7684\u4EBA\u591A\u3002" },
  { name: "\u91D1\u6E2F", kind: "industry", at: [121.6, 31.2605], hours: "\u5168\u5929", about: "\u5DE5\u5382\u548C\u5916\u4F01\u7684\u51FA\u53E3\u52A0\u5DE5\u533A\u3002" },
  { name: "\u6E2F\u533A", kind: "industry", at: [121.59, 31.35], hours: "\u5168\u5929", about: "\u96C6\u88C5\u7BB1\u7801\u5934\u3001\u4ED3\u5E93\u548C\u81EA\u8D38\u533A\uFF0C\u5927\u8D27\u8F66\u5F88\u591A\u3002" },
  { name: "\u535A\u89C8\u56ED", kind: "sight", at: [121.4885, 31.1795], hours: "10:00\u201321:00", about: "\u5F53\u5E74\u529E\u535A\u89C8\u4F1A\u7559\u4E0B\u7684\u573A\u9986\uFF0C\u73B0\u5728\u662F\u5C55\u9986\u3001\u7F8E\u672F\u9986\u548C\u6F14\u51FA\u573A\u5730\u3002" },
  { name: "\u6F9C\u6C5F\u4E50\u56ED", kind: "fun", at: [121.657, 31.1445], hours: "09:00\u201321:00", about: "\u4E3B\u9898\u4E50\u56ED\u548C\u5EA6\u5047\u533A\uFF0C\u8282\u5047\u65E5\u8981\u6392\u5F88\u4E45\u7684\u961F\u3002" },
  { name: "\u6C99\u57CE\u53E4\u9547", kind: "sight", at: [121.7, 31.1905], hours: "\u5168\u5929", about: "\u6C5F\u4E1C\u7684\u8001\u9547\uFF0C\u8001\u8857\u548C\u57CE\u5899\u9057\u5740\u3002" },
  { name: "\u4E1C\u90E8\u673A\u573A", kind: "airport", at: [121.805, 31.15], hours: "\u5168\u5929", about: "\u56FD\u9645\u673A\u573A\uFF0C\u56FD\u9645\u822A\u73ED\u5927\u591A\u5728\u8FD9\u91CC\u8D77\u964D\u3002" },
  { name: "\u4E34\u6D77\u65B0\u57CE", kind: "residence", at: [121.905, 30.9155], hours: "\u5168\u5929", about: "\u56F4\u7740\u4E34\u6D77\u6E56\u5EFA\u7684\u65B0\u57CE\uFF0C\u6709\u5927\u5B66\u548C\u9020\u8F66\u5382\uFF0C\u4EBA\u8FD8\u4E0D\u591A\u3002" },
  // 新庄区
  { name: "\u897F\u7AD9\u67A2\u7EBD", kind: "station", at: [121.32, 31.1955], hours: "\u5168\u5929", about: "\u9AD8\u94C1\u7AD9\u548C\u897F\u90CA\u673A\u573A\u8FDE\u5728\u4E00\u8D77\u7684\u4EA4\u901A\u67A2\u7EBD\u3002" },
  { name: "\u897F\u90CA\u673A\u573A", kind: "airport", at: [121.335, 31.198], hours: "06:00\u201324:00", about: "\u56FD\u5185\u822A\u73ED\u4E3A\u4E3B\u7684\u673A\u573A\uFF0C\u548C\u9AD8\u94C1\u7AD9\u8FDE\u901A\u3002" },
  { name: "\u4E03\u91CC\u53E4\u9547", kind: "sight", at: [121.35, 31.155], hours: "\u5168\u5929", about: "\u79BB\u5E02\u533A\u6700\u8FD1\u7684\u53E4\u9547\uFF0C\u8001\u8857\u3001\u5C0F\u5403\u548C\u76AE\u5F71\u620F\u3002" },
  { name: "\u65B0\u5E84", kind: "mall", at: [121.385, 31.1105], hours: "10:00\u201322:00", about: "\u8FD1\u90CA\u7684\u5546\u5708\u548C\u6362\u4E58\u7AD9\uFF0C\u5468\u56F4\u662F\u6210\u7247\u7684\u5C0F\u533A\u3002" },
  { name: "\u6F15\u6EAA", kind: "office", at: [121.39, 31.1705], hours: "\u5168\u5929", about: "\u8001\u724C\u9AD8\u65B0\u56ED\u533A\uFF0C\u5199\u5B57\u697C\u548C\u7814\u53D1\u4E2D\u5FC3\u591A\u3002" },
  { name: "\u6F9C\u6C5F\u7406\u5DE5\u5927\u5B66\uFF08\u65B0\u5E84\u6821\u533A\uFF09", kind: "school", at: [121.43, 31.0255], hours: "\u5168\u5929", about: "\u5927\u5B66\u57CE\u91CC\u6700\u5927\u7684\u6821\u56ED\uFF0C\u9A91\u8F66\u90FD\u8981\u5341\u51E0\u5206\u949F\u3002" },
  { name: "\u7D2B\u6C5F\u9AD8\u65B0\u533A", kind: "office", at: [121.45, 31.0205], hours: "\u5168\u5929", about: "\u6328\u7740\u5927\u5B66\u57CE\u7684\u7814\u53D1\u56ED\u533A\u3002" },
  // 江口区
  { name: "\u6C5F\u53E3\u94A2\u94C1\u5382", kind: "industry", at: [121.44, 31.4205], hours: "\u5168\u5929", about: "\u6CBF\u6C5F\u7684\u5927\u94A2\u94C1\u5382\uFF0C\u4E09\u73ED\u5012\u3002" },
  { name: "\u90AE\u8F6E\u7801\u5934", kind: "station", at: [121.495, 31.395], hours: "\u5168\u5929", about: "\u56FD\u9645\u90AE\u8F6E\u7801\u5934\uFF0C\u5927\u8239\u9760\u5CB8\u65F6\u5F88\u70ED\u95F9\u3002" },
  { name: "\u70AE\u53F0\u6E7F\u5730\u516C\u56ED", kind: "park", at: [121.485, 31.402], hours: "06:00\u201318:00", about: "\u6C5F\u8FB9\u7684\u8001\u70AE\u53F0\u548C\u6E7F\u5730\uFF0C\u770B\u6C5F\u770B\u8239\u3002" },
  { name: "\u6C5F\u53E3\u65B0\u57CE", kind: "residence", at: [121.4305, 31.3955], hours: "\u5168\u5929", about: "\u6C5F\u53E3\u533A\u7684\u65B0\u57CE\u548C\u5546\u573A\u3002" },
  { name: "\u6A31\u82B1\u516C\u56ED", kind: "park", at: [121.38, 31.35], hours: "06:00\u201318:00", about: "\u6625\u5929\u7684\u6A31\u82B1\u5F88\u6709\u540D\u3002" },
  { name: "\u5171\u548C\u65B0\u6751", kind: "residence", at: [121.445, 31.3355], hours: "\u5168\u5929", about: "\u5927\u7247\u7684\u8001\u516C\u623F\u548C\u65B0\u5C0F\u533A\uFF0C\u623F\u79DF\u6BD4\u5E02\u533A\u4FBF\u5B9C\u3002" },
  // 嘉禾区
  { name: "\u5609\u79BE\u8001\u57CE", kind: "sight", at: [121.25, 31.3805], hours: "\u5168\u5929", about: "\u5B54\u5E99\u3001\u8001\u8857\u548C\u73AF\u57CE\u6CB3\u3002" },
  { name: "\u6C7D\u8F66\u57CE", kind: "industry", at: [121.165, 31.2905], hours: "\u5168\u5929", about: "\u6C7D\u8F66\u5382\u3001\u6C7D\u8F66\u535A\u7269\u9986\u548C\u914D\u5957\u7684\u5C45\u4F4F\u533A\u3002" },
  { name: "\u8D5B\u8F66\u573A", kind: "fun", at: [121.22, 31.34], hours: "\u6BD4\u8D5B\u65E5", about: "\u56FD\u9645\u8D5B\u8F66\u573A\uFF0C\u5E73\u65F6\u53EF\u4EE5\u53C2\u89C2\u548C\u8DD1\u5361\u4E01\u8F66\u3002" },
  { name: "\u5357\u8297\u53E4\u9547", kind: "sight", at: [121.31, 31.3005], hours: "\u5168\u5929", about: "\u5C0F\u7B3C\u5305\u7684\u8001\u5BB6\uFF0C\u8001\u8857\u548C\u53E4\u7317\u56ED\u3002" },
  // 青湖区
  { name: "\u4F1A\u5C55\u4E2D\u5FC3", kind: "sight", at: [121.265, 31.1905], hours: "\u5C55\u4F1A\u671F\u95F4", about: "\u5168\u56FD\u6700\u5927\u7684\u4F1A\u5C55\u4E2D\u5FC3\u4E4B\u4E00\uFF0C\u5927\u5C55\u671F\u95F4\u9644\u8FD1\u7684\u9152\u5E97\u90FD\u8BA2\u6EE1\u3002" },
  { name: "\u73E0\u6EAA\u53E4\u9547", kind: "sight", at: [121.05, 31.1105], hours: "\u5168\u5929", about: "\u6C34\u4E61\u53E4\u9547\uFF0C\u77F3\u6865\u3001\u8001\u8857\u548C\u6447\u6A79\u8239\u3002" },
  { name: "\u4E91\u6E56", kind: "park", at: [121.01, 31.0955], hours: "\u5168\u5929", about: "\u5168\u5E02\u6700\u5927\u7684\u6E56\uFF0C\u6E56\u8FB9\u6709\u9A91\u884C\u9053\u548C\u5EA6\u5047\u6751\u3002" },
  { name: "\u9752\u6E56\u65B0\u57CE", kind: "residence", at: [121.12, 31.1505], hours: "\u5168\u5929", about: "\u9752\u6E56\u533A\u7684\u65B0\u57CE\uFF0C\u5B89\u9759\uFF0C\u623F\u5B50\u5927\u3002" },
  // 西山区
  { name: "\u897F\u5C71", kind: "park", at: [121.19, 31.1], hours: "06:00\u201318:00", about: "\u5168\u5E02\u552F\u4E00\u7684\u5C71\uFF0C\u5C71\u9876\u6709\u5929\u6587\u53F0\u548C\u6559\u5802\u3002" },
  { name: "\u897F\u5C71\u5927\u5B66\u57CE", kind: "school", at: [121.2135, 31.0605], hours: "\u5168\u5929", about: "\u597D\u51E0\u6240\u5927\u5B66\u7684\u6821\u56ED\u8FDE\u5728\u4E00\u8D77\u3002" },
  { name: "\u897F\u5C71\u8001\u57CE", kind: "sight", at: [121.2355, 31.0105], hours: "\u5168\u5929", about: "\u8001\u57CE\u3001\u53E4\u5854\u548C\u56ED\u6797\u3002" },
  // 南海区
  { name: "\u6D77\u6865\u65B0\u57CE", kind: "residence", at: [121.47, 30.9205], hours: "\u5168\u5929", about: "\u5357\u6D77\u533A\u7684\u65B0\u57CE\uFF0C\u653F\u5E9C\u548C\u5546\u573A\u90FD\u5728\u8FD9\u91CC\u3002" },
  { name: "\u91D1\u6EE9", kind: "fun", at: [121.34, 30.729], hours: "\u5168\u5929", about: "\u57CE\u5E02\u6D77\u6EE9\uFF0C\u590F\u5929\u4EBA\u5F88\u591A\u3002" },
  { name: "\u5316\u5DE5\u533A", kind: "industry", at: [121.45, 30.8], hours: "\u5168\u5929", about: "\u6CBF\u6D77\u7684\u5316\u5DE5\u56ED\u533A\u3002" },
  { name: "\u6D77\u6E7E\u68EE\u6797\u516C\u56ED", kind: "park", at: [121.65, 30.8605], hours: "07:00\u201317:00", about: "\u6D77\u8FB9\u7684\u5927\u7247\u4EBA\u5DE5\u6797\u3002" },
  // 沧洲区
  { name: "\u6CA7\u57CE", kind: "residence", at: [121.4, 31.63], hours: "\u5168\u5929", about: "\u6CA7\u6D32\u5C9B\u4E0A\u7684\u53BF\u57CE\uFF0C\u751F\u6D3B\u8282\u594F\u6162\u3002" },
  { name: "\u4E1C\u6EE9\u6E7F\u5730", kind: "park", at: [121.93, 31.515], hours: "08:00\u201317:00", about: "\u5019\u9E1F\u4FDD\u62A4\u533A\uFF0C\u51AC\u5929\u6709\u6210\u7FA4\u7684\u5019\u9E1F\u3002" },
  { name: "\u6CA7\u6D32\u68EE\u6797\u516C\u56ED", kind: "park", at: [121.45, 31.69], hours: "07:00\u201317:00", about: "\u5C9B\u4E0A\u7684\u5927\u7247\u68EE\u6797\u3002" }
];

// src/plugins/tabletop/world/city/shape.ts
var V = {
  // 澜江 (Huangpu): out of 云湖, east past 西山 and 新庄, north through the centre, into 沧江口.
  R0: [120.985, 31.075],
  R1: [121.05, 31.02],
  R2: [121.12, 30.99],
  R3: [121.2, 30.97],
  R4: [121.28, 30.98],
  R5: [121.35, 30.99],
  R6: [121.4, 30.995],
  R7: [121.45, 31.01],
  R8: [121.48, 31.02],
  R9: [121.495, 31.05],
  R10: [121.49, 31.08],
  R11: [121.48, 31.1],
  R12: [121.47, 31.12],
  R13: [121.465, 31.15],
  R14: [121.47, 31.17],
  R15: [121.478, 31.199],
  R16: [121.497, 31.214],
  R17: [121.497, 31.225],
  R18: [121.492, 31.236],
  R19: [121.489, 31.244],
  R20: [121.505, 31.249],
  R20b: [121.513, 31.251],
  R21: [121.52, 31.252],
  R22: [121.537, 31.258],
  R23: [121.565, 31.275],
  R24: [121.567, 31.29],
  R25: [121.555, 31.31],
  R26: [121.54, 31.34],
  R27: [121.52, 31.37],
  R28: [121.505, 31.39],
  // 青溪 (Suzhou Creek): from the western border east to 江滩.
  C0: [121.1, 31.265],
  C1: [121.2, 31.25],
  C2: [121.27, 31.24],
  Z26: [121.333, 31.228],
  C4: [121.37, 31.218],
  C5: [121.4, 31.228],
  C6: [121.42, 31.232],
  C7: [121.435, 31.245],
  C8: [121.45, 31.246],
  C9: [121.465, 31.247],
  C9b: [121.475, 31.2465],
  // Coast and outer border, clockwise from the north-west.
  O1: [121.3, 31.505],
  O2: [121.37, 31.5],
  O3: [121.43, 31.46],
  O4: [121.47, 31.42],
  O5: [121.56, 31.375],
  O6: [121.61, 31.36],
  O7: [121.67, 31.345],
  O8: [121.73, 31.31],
  O9: [121.79, 31.26],
  O10: [121.83, 31.21],
  O11: [121.85, 31.16],
  O12: [121.865, 31.1],
  O13: [121.89, 31.04],
  O14: [121.93, 30.97],
  O15: [121.975, 30.905],
  O16: [121.95, 30.865],
  O17: [121.86, 30.855],
  O18: [121.76, 30.86],
  O19: [121.65, 30.845],
  O20: [121.55, 30.83],
  O21: [121.47, 30.81],
  O22: [121.42, 30.77],
  O23: [121.36, 30.72],
  O24: [121.3, 30.7],
  O25: [121.22, 30.695],
  O26: [121.13, 30.74],
  O27: [121.05, 30.8],
  O28: [120.98, 30.87],
  O29: [120.92, 30.93],
  O30: [120.87, 31],
  O31: [120.86, 31.06],
  O32: [120.89, 31.13],
  O33: [120.95, 31.18],
  O34: [121.03, 31.22],
  O36: [121.12, 31.34],
  O37: [121.14, 31.41],
  O38: [121.2, 31.46],
  O39: [121.25, 31.49],
  // District borders.
  Z1: [121.462, 31.197],
  Z2: [121.455, 31.205],
  Z3: [121.458, 31.22],
  Z4: [121.462, 31.233],
  Z5: [121.44, 31.215],
  Z6: [121.428, 31.222],
  Z7: [121.44, 31.27],
  Z8: [121.445, 31.3],
  Z9: [121.465, 31.31],
  Z10: [121.473, 31.28],
  Z11: [121.47, 31.255],
  Z12: [121.48, 31.325],
  Z13: [121.5, 31.315],
  Z14: [121.505, 31.28],
  Z15: [121.512, 31.26],
  Z16: [121.52, 31.335],
  Z18: [121.42, 31.19],
  Z19: [121.432, 31.205],
  Z20: [121.44, 31.12],
  Z21: [121.42, 31.14],
  Z22: [121.41, 31.17],
  Z23: [121.42, 31.305],
  Z24: [121.38, 31.3],
  Z25: [121.36, 31.27],
  Z27: [121.325, 31.205],
  Z28: [121.35, 31.18],
  Z29: [121.39, 31.175],
  Z30: [121.32, 31.285],
  Z31: [121.31, 31.36],
  Z32: [121.29, 31.43],
  Z33: [121.27, 31.2],
  Z34: [121.27, 31.16],
  Z35: [121.18, 31.12],
  Z36: [121.12, 31.06],
  S1: [121.36, 30.94],
  S2: [121.22, 30.9],
  S3: [121.06, 30.9],
  Z39: [121.33, 31.05],
  Z40: [121.31, 31.12],
  J1: [121.56, 31],
  J2: [121.65, 30.94],
  J3: [121.72, 30.89]
};
var path = (ids) => ids.trim().split(/\s+/).map((id) => V[id] ?? fail(id));
var fail = (id) => {
  throw new Error(`unknown vertex ${id}`);
};
var DISTRICTS = [
  {
    id: "zhongcheng",
    name: "\u4E2D\u57CE\u533A",
    model: "\u9EC4\u6D66",
    population: 17,
    about: "\u6F9C\u6C5F\u897F\u5CB8\u7684\u57CE\u5E02\u4E2D\u5FC3\uFF1A\u6C5F\u6EE9\u7684\u8001\u5EFA\u7B51\u7FA4\u3001\u5E02\u6C11\u5E7F\u573A\u3001\u957F\u8857\u6B65\u884C\u8857\u3001\u8001\u57CE\u53A2\u548C\u57CE\u968D\u5E99\u3001\u77F3\u5E93\u95E8\u8857\u533A\u3002",
    outline: [path("C9 C9b R19 R18 R17 R16 R15 Z1 Z2 Z3 Z4")]
  },
  {
    id: "anhua",
    name: "\u5B89\u534E\u533A",
    model: "\u9759\u5B89",
    population: 25,
    about: "\u4E2D\u57CE\u533A\u897F\u5317\uFF1A\u9AD8\u6863\u5546\u573A\u548C\u5199\u5B57\u697C\u3001\u5B89\u534E\u5BFA\u3001\u8001\u6D0B\u623F\uFF0C\u5317\u8FB9\u662F\u8001\u57CE\u5317\u7684\u5C45\u4F4F\u533A\u548C\u666E\u901F\u706B\u8F66\u7AD9\u6F9C\u6C5F\u7AD9\u3002",
    outline: [path("Z4 Z3 Z5 Z6 C7 Z7 Z8 Z9 Z10 Z11 C9b C9")]
  },
  {
    id: "wutong",
    name: "\u68A7\u6850\u533A",
    model: "\u5F90\u6C47",
    population: 28,
    about: "\u4E2D\u57CE\u533A\u897F\u5357\uFF1A\u68A7\u6850\u6811\u4E0B\u7684\u8001\u6D0B\u623F\u8857\u533A\u3001\u5F90\u574A\u5546\u5708\u3001\u5927\u533B\u9662\u548C\u5927\u5B66\uFF0C\u6C5F\u8FB9\u662F\u827A\u672F\u533A\u3002",
    outline: [path("R15 R14 R13 R12 Z20 Z21 Z22 Z18 Z19 Z5 Z3 Z2 Z1")]
  },
  {
    id: "xiqiao",
    name: "\u897F\u6865\u533A",
    model: "\u957F\u5B81\u3001\u666E\u9640",
    population: 48,
    about: "\u897F\u90E8\u57CE\u533A\uFF1A\u5916\u4F01\u529E\u516C\u533A\u548C\u5916\u7C4D\u4EBA\u58EB\u805A\u5C45\u7684\u65B0\u5317\u3001\u52A8\u7269\u56ED\u3001\u6210\u7247\u7684\u5C45\u4F4F\u533A\uFF0C\u9752\u6EAA\u8FB9\u662F\u8001\u5382\u623F\u3002",
    outline: [path("Z5 Z19 Z18 Z22 Z29 Z28 Z27 Z26 Z25 Z24 Z23 Z8 Z7 C7 Z6")]
  },
  {
    id: "bei-an",
    name: "\u5317\u5CB8\u533A",
    model: "\u8679\u53E3",
    population: 19,
    about: "\u9752\u6EAA\u4EE5\u5317\u3001\u6F9C\u6C5F\u897F\u5CB8\uFF1A\u8001\u793E\u533A\u548C\u5F04\u5802\u3001\u6587\u5316\u516C\u56ED\u548C\u8DB3\u7403\u573A\u3001\u6C5F\u8FB9\u7684\u8001\u7801\u5934\u533A\u3002",
    outline: [path("C9b Z11 Z10 Z9 Z12 Z13 Z14 Z15 R20b R20 R19")]
  },
  {
    id: "donglin",
    name: "\u4E1C\u6797\u533A",
    model: "\u6768\u6D66",
    population: 31,
    about: "\u4E1C\u5317\u90E8\u57CE\u533A\uFF1A\u6F9C\u6C5F\u5927\u5B66\u7B49\u51E0\u6240\u9AD8\u6821\u3001\u4E94\u5C94\u53E3\u5546\u5708\uFF0C\u6C5F\u8FB9\u7684\u8001\u5DE5\u4E1A\u533A\u6539\u6210\u4E86\u516C\u56ED\u3002",
    outline: [path("R20b Z15 Z14 Z13 Z16 R25 R24 R23 R22 R21")]
  },
  {
    id: "jiangdong",
    name: "\u6C5F\u4E1C\u533A",
    model: "\u6D66\u4E1C",
    population: 145,
    about: "\u6F9C\u6C5F\u4E1C\u5CB8\u4E00\u76F4\u5230\u4E1C\u6D77\uFF1A\u671B\u6C5F\u5634\u91D1\u878D\u57CE\u6B63\u5BF9\u6C5F\u6EE9\uFF0C\u8FD8\u6709\u4E2D\u592E\u516C\u56ED\u3001\u79D1\u5B66\u57CE\u3001\u6E2F\u533A\u3001\u4E50\u56ED\u3001\u4E1C\u90E8\u673A\u573A\u3001\u4E34\u6D77\u65B0\u57CE\uFF0C\u4EE5\u53CA\u6D77\u4E0A\u7684\u8FDC\u6D0B\u6E2F\u3002",
    outline: [path(`R8 R9 R10 R11 R12 R13 R14 R15 R16 R17 R18 R19 R20 R20b R21 R22 R23 R24 R25 R26 R27 R28
            O5 O6 O7 O8 O9 O10 O11 O12 O13 O14 O15 O16 O17 O18 J3 J2 J1`), PORT_ISLAND]
  },
  {
    id: "xinzhuang",
    name: "\u65B0\u5E84\u533A",
    model: "\u95F5\u884C",
    population: 67,
    about: "\u897F\u5357\u8FD1\u90CA\uFF1A\u6210\u7247\u7684\u5C45\u4F4F\u533A\u3001\u5927\u5B66\u57CE\u548C\u9AD8\u65B0\u533A\uFF0C\u5317\u8FB9\u662F\u897F\u7AD9\u67A2\u7EBD\uFF08\u9AD8\u94C1\u7AD9\u548C\u897F\u90CA\u673A\u573A\uFF09\u3002",
    outline: [path("C2 Z26 Z27 Z28 Z29 Z22 Z21 Z20 R12 R11 R10 R9 R8 R7 R6 R5 Z39 Z40 Z34 Z33")]
  },
  {
    id: "jiangkou",
    name: "\u6C5F\u53E3\u533A",
    model: "\u5B9D\u5C71",
    population: 56,
    about: "\u5317\u90E8\uFF0C\u6CA7\u6C5F\u53E3\u5357\u5CB8\uFF1A\u94A2\u94C1\u5382\u3001\u90AE\u8F6E\u7801\u5934\u3001\u70AE\u53F0\u6E7F\u5730\u516C\u56ED\uFF0C\u5F80\u5357\u662F\u5927\u7247\u7684\u5C45\u4F4F\u533A\u3002",
    outline: [path("O1 O2 O3 O4 R28 R27 R26 R25 Z16 Z13 Z12 Z9 Z8 Z23 Z24 Z25 Z30 Z31 Z32")]
  },
  {
    id: "jiahe",
    name: "\u5609\u79BE\u533A",
    model: "\u5609\u5B9A",
    population: 46,
    about: "\u897F\u5317\uFF1A\u6C7D\u8F66\u57CE\u548C\u8D5B\u8F66\u573A\uFF0C\u5609\u79BE\u8001\u57CE\u6709\u5B54\u5E99\u548C\u8001\u8857\uFF0C\u5357\u8297\u53E4\u9547\u5728\u4E1C\u5357\u8FB9\u3002",
    outline: [path("C0 O36 O37 O38 O39 O1 Z32 Z31 Z30 Z25 Z26 C2 C1")]
  },
  {
    id: "qinghu",
    name: "\u9752\u6E56\u533A",
    model: "\u9752\u6D66",
    population: 32,
    about: "\u897F\u90E8\uFF1A\u4E91\u6E56\u548C\u6C34\u4E61\u53E4\u9547\uFF0C\u4E1C\u8FB9\u6328\u7740\u897F\u7AD9\u67A2\u7EBD\u7684\u662F\u4F1A\u5C55\u4E2D\u5FC3\u3002",
    outline: [path("C0 C1 C2 Z33 Z34 Z35 Z36 S3 O28 O29 O30 O31 O32 O33 O34")]
  },
  {
    id: "xishan",
    name: "\u897F\u5C71\u533A",
    model: "\u677E\u6C5F",
    population: 48,
    about: "\u897F\u5357\uFF0C\u6F9C\u6C5F\u4E0A\u6E38\u4E24\u5CB8\uFF1A\u897F\u5C71\u662F\u5168\u5E02\u552F\u4E00\u7684\u4E00\u7247\u5C0F\u5C71\uFF0C\u6709\u5927\u5B66\u57CE\u548C\u897F\u5C71\u8001\u57CE\u3002",
    outline: [path("Z34 Z40 Z39 R5 S1 S2 S3 Z36 Z35")]
  },
  {
    id: "nanhai",
    name: "\u5357\u6D77\u533A",
    model: "\u91D1\u5C71\u3001\u5949\u8D24",
    population: 49,
    about: "\u5357\u90E8\uFF0C\u6CBF\u5357\u6E7E\uFF1A\u6D77\u6865\u65B0\u57CE\u3001\u91D1\u6EE9\u6D77\u6EE9\u3001\u5316\u5DE5\u533A\uFF0C\u5927\u7247\u519C\u7530\u548C\u5C0F\u9547\u3002",
    outline: [path("R5 R6 R7 R8 J1 J2 J3 O18 O19 O20 O21 O22 O23 O24 O25 O26 O27 O28 S3 S2 S1")]
  },
  {
    id: "cangzhou",
    name: "\u6CA7\u6D32\u533A",
    model: "\u5D07\u660E",
    population: 16,
    about: "\u6CA7\u6C5F\u53E3\u7684\u4E09\u5EA7\u5C9B\uFF1A\u6CA7\u6D32\u5C9B\u7684\u519C\u7530\u3001\u6E7F\u5730\u548C\u68EE\u6797\u516C\u56ED\uFF0C\u4EE5\u53CA\u957F\u5174\u3001\u6A2A\u6C99\u4E24\u5EA7\u5C0F\u5C9B\u3002",
    outline: [
      // 沧洲岛 (Chongming), 长兴岛, 横沙岛.
      [
        [121.2, 31.8],
        [121.35, 31.76],
        [121.5, 31.71],
        [121.65, 31.66],
        [121.8, 31.6],
        [121.93, 31.55],
        [121.98, 31.5],
        [121.92, 31.47],
        [121.78, 31.48],
        [121.62, 31.52],
        [121.48, 31.57],
        [121.35, 31.62],
        [121.25, 31.68],
        [121.2, 31.74]
      ],
      [[121.55, 31.425], [121.68, 31.42], [121.8, 31.39], [121.84, 31.365], [121.78, 31.355], [121.65, 31.375], [121.57, 31.4]],
      [[121.82, 31.34], [121.88, 31.345], [121.9, 31.32], [121.86, 31.3], [121.81, 31.31]]
    ]
  }
];
var MAINLAND = path(`O1 O2 O3 O4 R28 O5 O6 O7 O8 O9 O10 O11 O12 O13 O14 O15 O16 O17 O18 O19 O20
    O21 O22 O23 O24 O25 O26 O27 O28 O29 O30 O31 O32 O33 O34 C0 O36 O37 O38 O39`);
var COAST = [path("O1 O2 O3 O4 R28 O5 O6 O7 O8 O9 O10 O11 O12 O13 O14 O15 O16 O17 O18 O19 O20 O21 O22 O23 O24 O25")];
var LAKES = [
  {
    name: "\u4E91\u6E56",
    model: "\u6DC0\u5C71\u6E56",
    outline: [
      [120.915, 31.16],
      [120.94, 31.17],
      [120.965, 31.165],
      [120.985, 31.15],
      [120.995, 31.13],
      [121, 31.11],
      [120.99, 31.09],
      [120.985, 31.075],
      [120.97, 31.07],
      [120.95, 31.068],
      [120.935, 31.08],
      [120.92, 31.1],
      [120.905, 31.12],
      [120.905, 31.145]
    ]
  },
  { name: "\u6708\u6E56", model: "\u6708\u6E56\uFF08\u897F\u5C71\uFF09", outline: circle([121.205, 31.028], 6e-3) },
  { name: "\u4E34\u6D77\u6E56", model: "\u6EF4\u6C34\u6E56", outline: circle([121.925, 30.905], 0.013) }
];
var RIVERS = [
  {
    name: "\u6F9C\u6C5F",
    model: "\u9EC4\u6D66\u6C5F",
    width: [[0, 150], [8, 250], [15, 350], [19, 400], [29, 700]],
    course: path("R0 R1 R2 R3 R4 R5 R6 R7 R8 R9 R10 R11 R12 R13 R14 R15 R16 R17 R18 R19 R20 R20b R21 R22 R23 R24 R25 R26 R27 R28")
  },
  { name: "\u9752\u6EAA", model: "\u82CF\u5DDE\u6CB3", width: [[0, 60], [11, 80]], course: path("C0 C1 C2 Z26 C4 C5 C6 C7 C8 C9 C9b R19") }
];
var HILLS = [
  { name: "\u897F\u5C71", at: [121.19, 31.1], r: 0.012, height: 99 },
  { name: "\u5929\u9A6C\u5C71", at: [121.155, 31.075], r: 8e-3, height: 98 },
  { name: "\u51E4\u51F0\u5C71", at: [121.215, 31.115], r: 6e-3, height: 49 },
  { name: "\u8FB0\u5C71", at: [121.18, 31.08], r: 5e-3, height: 71 }
];
var SEAS = [
  { name: "\u4E1C\u6D77", at: [122, 31.15] },
  { name: "\u6CA7\u6C5F\u53E3", at: [121.62, 31.46] },
  { name: "\u5357\u6E7E", at: [121.45, 30.74] }
];
function circle([lon, lat], r) {
  const k = Math.cos(lat * Math.PI / 180);
  return Array.from({ length: 16 }, (_, i) => {
    const a = i / 16 * Math.PI * 2;
    return [Math.round((lon + r * Math.cos(a) / k) * 1e4) / 1e4, Math.round((lat + r * Math.sin(a)) * 1e4) / 1e4];
  });
}

// src/plugins/tabletop/world/city/transit.ts
var LINES = [
  {
    id: "L1",
    name: "1 \u53F7\u7EBF",
    color: "#d1343c",
    speed: 34,
    interval: [3, 6],
    stations: [
      ["\u6C5F\u53E3\u65B0\u57CE", [121.43, 31.395]],
      ["\u5171\u548C\u65B0\u6751", [121.445, 31.335]],
      ["\u5317\u90CA", [121.45, 31.305]],
      ["\u5B89\u534E\u5317", [121.455, 31.28]],
      ["\u6F9C\u6C5F\u7AD9", [121.455, 31.25]],
      ["\u5E02\u6C11\u5E7F\u573A", [121.475, 31.232]],
      ["\u68A7\u6850\u8DEF", [121.447, 31.206]],
      ["\u5F90\u574A", [121.437, 31.195]],
      ["\u5357\u82D1", [121.43, 31.155]],
      ["\u83B2\u5858", [121.4, 31.13]],
      ["\u65B0\u5E84", [121.385, 31.11]],
      ["\u989B\u6EAA", [121.41, 31.07]],
      ["\u5927\u5B66\u57CE", [121.43, 31.03]],
      ["\u6C5F\u5DDD", [121.45, 30.985]],
      ["\u6D77\u6865\u65B0\u57CE", [121.47, 30.92]]
    ]
  },
  {
    id: "L2",
    name: "2 \u53F7\u7EBF",
    color: "#3a9a4f",
    speed: 36,
    interval: [3, 6],
    stations: [
      ["\u4F1A\u5C55\u4E2D\u5FC3", [121.265, 31.19]],
      ["\u897F\u7AD9\u67A2\u7EBD", [121.32, 31.195]],
      ["\u677E\u98CE\u8DEF", [121.36, 31.218]],
      ["\u65B0\u5317", [121.39, 31.212]],
      ["\u897F\u6865\u516C\u56ED", [121.418, 31.222]],
      ["\u5B89\u534E\u5BFA", [121.446, 31.224]],
      ["\u5E02\u6C11\u5E7F\u573A", [121.475, 31.232]],
      ["\u671B\u6C5F\u5634", [121.502, 31.238]],
      ["\u4E16\u7EAA\u5E7F\u573A", [121.527, 31.229]],
      ["\u4E2D\u592E\u516C\u56ED", [121.551, 31.217]],
      ["\u79D1\u5B66\u57CE", [121.59, 31.205]],
      ["\u5510\u6751", [121.65, 31.215]],
      ["\u6C99\u57CE", [121.7, 31.19]],
      ["\u6D77\u6EE8\u65B0\u6751", [121.75, 31.17]],
      ["\u4E1C\u90E8\u673A\u573A", [121.805, 31.15]]
    ]
  },
  {
    id: "L3",
    name: "3 \u53F7\u7EBF",
    color: "#8a52b0",
    speed: 32,
    interval: [4, 7],
    loop: true,
    stations: [
      ["\u6F9C\u6C5F\u7AD9", [121.455, 31.25]],
      ["\u67F3\u8425", [121.42, 31.245]],
      ["\u897F\u6865\u516C\u56ED", [121.418, 31.222]],
      ["\u8679\u8DEF", [121.423, 31.198]],
      ["\u4F53\u80B2\u9986", [121.437, 31.183]],
      ["\u9C81\u6E2F", [121.468, 31.196]],
      ["\u5357\u6D66", [121.495, 31.208]],
      ["\u5858\u53E3", [121.517, 31.215]],
      ["\u4E16\u7EAA\u5E7F\u573A", [121.527, 31.229]],
      ["\u6D66\u5CB8", [121.525, 31.262]],
      ["\u5317\u5CB8\u4F53\u80B2\u573A", [121.483, 31.268]]
    ]
  },
  {
    id: "L4",
    name: "4 \u53F7\u7EBF",
    color: "#3d9bd4",
    speed: 36,
    interval: [3, 6],
    stations: [
      ["\u897F\u5C71\u8001\u57CE", [121.235, 31.01]],
      ["\u897F\u5C71\u65B0\u57CE", [121.22, 31.035]],
      ["\u897F\u5C71\u5927\u5B66\u57CE", [121.213, 31.06]],
      ["\u897F\u5C71", [121.205, 31.105]],
      ["\u6CD7\u6C34", [121.26, 31.12]],
      ["\u4E5D\u91CC", [121.32, 31.14]],
      ["\u4E03\u91CC\u53E4\u9547", [121.35, 31.155]],
      ["\u6F15\u6EAA", [121.39, 31.17]],
      ["\u5F90\u574A", [121.437, 31.195]],
      ["\u9C81\u6E2F", [121.468, 31.196]],
      ["\u8001\u57CE\u53A2", [121.492, 31.222]],
      ["\u4E16\u7EAA\u5E7F\u573A", [121.527, 31.229]],
      ["\u9AD8\u5E99", [121.56, 31.245]],
      ["\u91D1\u6E2F", [121.6, 31.26]],
      ["\u4E1C\u6EE8", [121.66, 31.275]]
    ]
  },
  {
    id: "L5",
    name: "5 \u53F7\u7EBF",
    color: "#9c5a32",
    speed: 36,
    interval: [4, 8],
    stations: [
      ["\u5609\u79BE\u8001\u57CE", [121.25, 31.38]],
      ["\u5609\u79BE\u65B0\u57CE", [121.25, 31.335]],
      ["\u5357\u8297\u53E4\u9547", [121.31, 31.3]],
      ["\u6843\u56ED\u65B0\u6751", [121.375, 31.268]],
      ["\u771F\u56ED", [121.405, 31.258]],
      ["\u67F3\u8425", [121.42, 31.245]],
      ["\u7406\u5DE5\u5927\u5B66", [121.436, 31.205]],
      ["\u5854\u56ED", [121.452, 31.175]],
      ["\u535A\u89C8\u56ED", [121.488, 31.178]],
      ["\u6797\u6E2F", [121.52, 31.15]],
      ["\u5EB7\u56ED", [121.58, 31.14]],
      ["\u4E50\u56ED", [121.657, 31.144]]
    ]
  },
  {
    id: "L5b",
    name: "5 \u53F7\u7EBF\u652F\u7EBF",
    color: "#9c5a32",
    speed: 36,
    interval: [8, 12],
    stations: [["\u5609\u79BE\u65B0\u57CE", [121.25, 31.335]], ["\u6C7D\u8F66\u57CE", [121.165, 31.29]]]
  },
  {
    id: "L6",
    name: "6 \u53F7\u7EBF",
    color: "#2e5fc9",
    speed: 33,
    interval: [3, 6],
    stations: [
      ["\u65B0\u6E7E\u57CE", [121.522, 31.325]],
      ["\u4E94\u5C94\u53E3", [121.517, 31.3]],
      ["\u5317\u5CB8\u4F53\u80B2\u573A", [121.483, 31.268]],
      ["\u5E02\u6C11\u5E7F\u573A", [121.475, 31.232]],
      ["\u6842\u91CC", [121.476, 31.22]],
      ["\u8001\u57CE\u53A2", [121.492, 31.222]],
      ["\u535A\u89C8\u56ED", [121.488, 31.178]],
      ["\u6768\u67F3", [121.48, 31.14]],
      ["\u6D66\u4E2D", [121.5, 31.105]],
      ["\u6D66\u5357", [121.51, 31.065]]
    ]
  },
  {
    id: "L7",
    name: "7 \u53F7\u7EBF",
    color: "#7cae3e",
    speed: 40,
    interval: [6, 10],
    stations: [
      ["\u897F\u7AD9\u67A2\u7EBD", [121.32, 31.195]],
      ["\u4F1A\u5C55\u4E2D\u5FC3", [121.265, 31.19]],
      ["\u5F90\u6797", [121.22, 31.175]],
      ["\u8D75\u5BB6\u5858", [121.18, 31.165]],
      ["\u9752\u6E56\u65B0\u57CE", [121.12, 31.15]],
      ["\u73E0\u6EAA\u53E4\u9547", [121.05, 31.11]],
      ["\u4E91\u6E56", [121.01, 31.095]]
    ]
  },
  {
    id: "L8",
    name: "8 \u53F7\u7EBF",
    color: "#1aa3a0",
    speed: 50,
    interval: [6, 10],
    stations: [
      ["\u4E2D\u592E\u516C\u56ED", [121.551, 31.217]],
      ["\u534E\u56ED", [121.58, 31.19]],
      ["\u7F57\u6CFE", [121.59, 31.15]],
      ["\u5468\u5858", [121.6, 31.1]],
      ["\u76D0\u573A\u53E4\u9547", [121.65, 31.03]],
      ["\u91CE\u751F\u52A8\u7269\u56ED", [121.72, 31.06]],
      ["\u60E0\u57CE", [121.76, 31.04]],
      ["\u4E66\u9662", [121.85, 30.96]],
      ["\u4E34\u6D77\u65B0\u57CE", [121.905, 30.915]]
    ]
  },
  {
    id: "JS",
    name: "\u91D1\u5C71\u7EBF",
    color: "#7d7d7d",
    speed: 55,
    interval: [20, 30],
    stations: [["\u5357\u82D1", [121.43, 31.155]], ["\u6625\u6C5F", [121.42, 31.1]], ["\u8F66\u4EAD", [121.3, 31]], ["\u6797\u4EAD", [121.33, 30.88]], ["\u91D1\u6EE9", [121.34, 30.728]]]
  }
];
var METRO_HOURS = { first: "05:30", last: "23:00" };
var ROADS = [
  {
    name: "\u5185\u73AF",
    kind: "ring",
    loop: true,
    course: [
      [121.47, 31.27],
      [121.43, 31.255],
      [121.42, 31.22],
      [121.43, 31.192],
      [121.46, 31.188],
      [121.48, 31.198],
      [121.497, 31.211],
      [121.52, 31.21],
      [121.55, 31.225],
      [121.55, 31.25],
      [121.537, 31.258],
      [121.52, 31.27],
      [121.5, 31.275]
    ]
  },
  {
    name: "\u4E2D\u73AF",
    kind: "ring",
    loop: true,
    course: [
      [121.48, 31.3],
      [121.43, 31.295],
      [121.39, 31.27],
      [121.37, 31.23],
      [121.37, 31.19],
      [121.4, 31.165],
      [121.45, 31.155],
      [121.49, 31.16],
      [121.55, 31.17],
      [121.6, 31.2],
      [121.61, 31.25],
      [121.58, 31.28],
      [121.55, 31.3],
      [121.52, 31.31]
    ]
  },
  {
    name: "\u5916\u73AF",
    kind: "ring",
    loop: true,
    course: [
      [121.49, 31.37],
      [121.4, 31.355],
      [121.34, 31.3],
      [121.32, 31.24],
      [121.33, 31.17],
      [121.37, 31.12],
      [121.44, 31.1],
      [121.5, 31.1],
      [121.57, 31.12],
      [121.64, 31.16],
      [121.66, 31.22],
      [121.65, 31.28],
      [121.62, 31.33],
      [121.56, 31.36]
    ]
  },
  {
    name: "\u957F\u5B89\u8DEF\u9AD8\u67B6",
    kind: "elevated",
    course: [[121.3, 31.193], [121.36, 31.205], [121.4, 31.21], [121.43, 31.218], [121.46, 31.226], [121.488, 31.236]]
  },
  {
    name: "\u5357\u5317\u9AD8\u67B6",
    kind: "elevated",
    course: [[121.462, 31.34], [121.46, 31.28], [121.462, 31.25], [121.463, 31.226], [121.46, 31.19], [121.45, 31.15]]
  },
  {
    name: "\u6C5F\u53E3\u9AD8\u67B6",
    kind: "elevated",
    course: [[121.482, 31.27], [121.482, 31.33], [121.47, 31.4]]
  },
  {
    name: "\u65B0\u5E84\u9AD8\u67B6",
    kind: "elevated",
    course: [[121.43, 31.185], [121.405, 31.12], [121.42, 31.05], [121.45, 30.97], [121.47, 30.9]]
  },
  {
    name: "\u90CA\u73AF",
    kind: "ring",
    loop: true,
    course: [
      [121.4, 31.44],
      [121.3, 31.43],
      [121.18, 31.37],
      [121.13, 31.25],
      [121.16, 31.1],
      [121.25, 31],
      [121.38, 30.95],
      [121.55, 30.94],
      [121.7, 30.98],
      [121.79, 31.08],
      [121.79, 31.2],
      [121.74, 31.28],
      [121.66, 31.325],
      [121.58, 31.352],
      [121.52, 31.375],
      [121.46, 31.405]
    ]
  },
  { name: "\u5609\u79BE\u9AD8\u901F", kind: "expressway", course: [[121.44, 31.268], [121.38, 31.3], [121.3, 31.35], [121.25, 31.385], [121.2, 31.43]] },
  { name: "\u9752\u6E56\u9AD8\u901F", kind: "expressway", course: [[121.32, 31.21], [121.2, 31.17], [121.1, 31.135], [121, 31.055], [120.865, 31.03]] },
  { name: "\u897F\u5C71\u9AD8\u901F", kind: "expressway", course: [[121.4, 31.155], [121.3, 31.1], [121.22, 31.05], [121.1, 30.95], [120.99, 30.87]] },
  { name: "\u5357\u6D77\u9AD8\u901F", kind: "expressway", course: [[121.44, 31.1], [121.43, 31], [121.38, 30.86], [121.34, 30.75]] },
  { name: "\u673A\u573A\u9AD8\u901F", kind: "expressway", course: [[121.55, 31.215], [121.65, 31.192], [121.77, 31.16]] },
  { name: "\u4E34\u6D77\u9AD8\u901F", kind: "expressway", course: [[121.57, 31.12], [121.65, 31.05], [121.75, 30.98], [121.9, 30.9]] },
  { name: "\u6CA7\u6D32\u96A7\u6865", kind: "bridge", course: [[121.6, 31.36], [121.64, 31.4], [121.73, 31.43], [121.8, 31.49]] },
  { name: "\u6D77\u6E2F\u5927\u6865", kind: "bridge", course: [[121.953, 30.868], [121.99, 30.78], [122.03, 30.69], [122.05, 30.626]] },
  // Main streets of the central city.
  { name: "\u957F\u8857\u8DEF", kind: "arterial", course: [[121.49, 31.2395], [121.475, 31.235], [121.455, 31.229], [121.44, 31.2245], [121.418, 31.222], [121.39, 31.218]] },
  { name: "\u68A7\u6850\u5927\u9053", kind: "arterial", course: [[121.488, 31.226], [121.47, 31.2215], [121.455, 31.215], [121.44, 31.205], [121.437, 31.196]] },
  { name: "\u6C5F\u6EE9\u8DEF", kind: "arterial", course: [[121.496, 31.256], [121.4895, 31.243], [121.494, 31.229], [121.4955, 31.216], [121.485, 31.203]] },
  { name: "\u4E2D\u57CE\u8DEF", kind: "arterial", course: [[121.478, 31.262], [121.476, 31.24], [121.478, 31.22], [121.48, 31.2]] },
  { name: "\u4E1C\u6797\u8DEF", kind: "arterial", course: [[121.49, 31.255], [121.505, 31.28], [121.515, 31.3], [121.52, 31.325]] },
  { name: "\u4E16\u7EAA\u5927\u9053", kind: "arterial", course: [[121.504, 31.238], [121.527, 31.2295], [121.551, 31.2165]] },
  { name: "\u6C5F\u4E1C\u5927\u9053", kind: "arterial", course: [[121.506, 31.244], [121.53, 31.248], [121.56, 31.254], [121.6, 31.27], [121.65, 31.29]] },
  { name: "\u5F20\u56ED\u8DEF", kind: "arterial", course: [[121.51, 31.231], [121.55, 31.232], [121.59, 31.236]] },
  { name: "\u9AD8\u5E99\u8DEF", kind: "arterial", course: [[121.56, 31.3], [121.565, 31.25], [121.56, 31.2], [121.55, 31.15], [121.54, 31.1]] },
  { name: "\u6F15\u6EAA\u8DEF", kind: "arterial", course: [[121.437, 31.195], [121.435, 31.17], [121.43, 31.15], [121.42, 31.12]] },
  { name: "\u8679\u8DEF", kind: "arterial", course: [[121.437, 31.196], [121.4, 31.198], [121.37, 31.196], [121.33, 31.196]] },
  { name: "\u5171\u548C\u8DEF", kind: "arterial", course: [[121.455, 31.25], [121.455, 31.3], [121.445, 31.34], [121.43, 31.39]] },
  { name: "\u771F\u56ED\u8DEF", kind: "arterial", course: [[121.42, 31.245], [121.405, 31.26], [121.37, 31.28], [121.33, 31.3]] },
  { name: "\u9C81\u6E2F\u8DEF", kind: "arterial", course: [[121.437, 31.196], [121.468, 31.196], [121.478, 31.199]] },
  { name: "\u4E94\u5C94\u8DEF", kind: "arterial", course: [[121.515, 31.3], [121.53, 31.29], [121.55, 31.28]] },
  { name: "\u6D66\u5357\u8DEF", kind: "arterial", course: [[121.495, 31.19], [121.5, 31.14], [121.505, 31.1], [121.51, 31.06]] }
];
var RAILS = [
  ["\u6CAA\u5B81\u94C1\u8DEF", [[121.455, 31.25], [121.4, 31.272], [121.3, 31.31], [121.2, 31.35], [121.1, 31.385]]],
  ["\u897F\u5411\u9AD8\u94C1", [[121.32, 31.195], [121.2, 31.225], [121.1, 31.255], [120.99, 31.27]]],
  ["\u5357\u5411\u9AD8\u94C1", [[121.32, 31.19], [121.25, 31.12], [121.2, 31.03], [121.1, 30.92], [121, 30.85]]]
];
var CROSSINGS = [
  ["\u4E1C\u6797\u5927\u6865", "bridge", [121.538, 31.257]],
  ["\u5357\u6D66\u5927\u6865", "bridge", [121.494, 31.211]],
  ["\u9C81\u6E2F\u5927\u6865", "bridge", [121.479, 31.198]],
  ["\u574A\u6D66\u5927\u6865", "bridge", [121.475, 31.105]],
  ["\u65B0\u5E84\u5927\u6865", "bridge", [121.43, 31.003]],
  ["\u957F\u8857\u96A7\u9053", "tunnel", [121.497, 31.2385]],
  ["\u6C5F\u53E3\u96A7\u9053", "tunnel", [121.523, 31.37]],
  ["\u6F9C\u6C5F\u8F6E\u6E21", "tunnel", [121.497, 31.233]]
];

// src/plugins/tabletop/world/city/index.ts
var projectAll = (points) => points.map(project);
var kmPerDegree = Math.abs(project([0, 0])[1] - project([0, 1])[1]);
var areas = (blobs) => blobs.map((b) => ({ name: b.name, outline: projectAll(blobOutline(b, hash(b.name) % 7)) }));
function districtAt(city2, point) {
  return city2.districts.find((d) => d.outline.some((part) => inside(point, part)));
}
var built = null;
function lanjiang() {
  if (built) return built;
  const districts = DISTRICTS.map((d) => {
    const outline = d.outline.map(projectAll);
    const largest = outline.reduce((a, b) => area(b) > area(a) ? b : a);
    return {
      id: d.id,
      name: d.name,
      model: d.model,
      population: d.population,
      about: d.about,
      outline,
      label: centroid(largest),
      area: Math.round(outline.reduce((s, p) => s + area(p), 0))
    };
  });
  const stations = /* @__PURE__ */ new Map();
  const lines = LINES.map((l) => {
    for (const [name, at] of l.stations) {
      const known = stations.get(name);
      if (known) known.lines.includes(l.id) || known.lines.push(l.id);
      else stations.set(name, { name, at: project(at), lines: [l.id] });
    }
    return { id: l.id, name: l.name, color: l.color, loop: Boolean(l.loop), speed: l.speed, interval: l.interval, stations: l.stations.map(([n]) => n) };
  });
  const mainland = projectAll(MAINLAND);
  const rivers = [
    ...RIVERS.map((r) => ({ name: r.name, width: r.width, course: projectAll(r.course), minor: false })),
    ...CANALS.map(([name, width, course]) => ({ name, width: [[0, width]], course: projectAll(course), minor: true }))
  ];
  const lakes = [...LAKES.map((l) => ({ name: l.name, outline: projectAll(l.outline) })), ...areas(RESERVOIRS)];
  const airports = AIRPORTS.map((a) => ({ name: a.name, area: projectAll(a.area), runways: a.runways.map(([p, q]) => [project(p), project(q)]) }));
  const urban = areas(URBAN);
  const base = { districts };
  const landmarks = LANDMARKS.map((p, i) => {
    const at = project(p.at);
    return { id: `p${i + 1}`, name: p.name, kind: p.kind, at, district: districtAt(base, at)?.id ?? "", hours: p.hours, about: p.about, landmark: true };
  });
  const towns = TOWNS.map(([name, at]) => ({ name, at: project(at) }));
  const centre = urban[0].outline;
  const density = (at) => inside(at, centre) ? distance(at, [0, 0]) < 6 ? 3 : 2 : urban.some((u) => inside(at, u.outline)) ? 2 : 1;
  const anchors = [];
  const named = /* @__PURE__ */ new Set();
  const addAnchor = (name, at) => {
    if (named.has(name)) return;
    const district = districtAt(base, at)?.id;
    if (!district) return;
    named.add(name);
    anchors.push({ name, at, district, density: density(at) });
  };
  for (const s of stations.values()) addAnchor(s.name, s.at);
  for (const p of landmarks) if (p.kind !== "airport" && p.kind !== "industry") addAnchor(p.name, p.at);
  for (const t of towns) addAnchor(t.name, t.at);
  const taken = landmarks.map((p) => p.at);
  const free = (at) => {
    if (!districtAt(base, at)) return false;
    if (lakes.some((l) => inside(at, l.outline))) return false;
    if (airports.some((a) => inside(at, a.area))) return false;
    for (const r of rivers) {
      const half = Math.max(...r.width.map((w) => w[1])) / 1e3 * 0.25;
      if (distanceToLine(at, r.course) < half + 0.06) return false;
    }
    if (taken.some((p) => distance(p, at) < 0.09)) return false;
    taken.push(at);
    return true;
  };
  const everyday = everydayPlaces(anchors, free, [...landmarks.map((p) => p.name), ...stations.keys(), ...towns.map((t) => t.name)]).map((p) => ({ ...p, district: districtAt(base, p.at).id, landmark: false }));
  const all = [...mainland, ...districts.filter((d) => d.id === "cangzhou").flatMap((d) => d.outline.flat())];
  built = {
    name: "\u6F9C\u6C5F\u5E02",
    districts,
    mainland,
    islands: districts.flatMap((d) => d.id === "cangzhou" ? d.outline : d.outline.slice(1)),
    coast: COAST.map(projectAll),
    lakes,
    rivers,
    hills: HILLS.map((h) => ({ name: h.name, at: project(h.at), r: h.r * kmPerDegree, height: h.height })),
    seas: SEAS.map((s) => ({ name: s.name, at: project(s.at) })),
    urban,
    industry: areas(INDUSTRY),
    greens: areas(GREENS),
    shoals: areas(SHOALS),
    airports,
    towns,
    roads: ROADS.map((r) => ({ name: r.name, kind: r.kind, loop: Boolean(r.loop), course: projectAll(r.course) })),
    rails: RAILS.map(([name, course]) => ({ name, course: projectAll(course) })),
    crossings: CROSSINGS.map(([name, kind, at]) => ({ name, kind, at: project(at) })),
    lines,
    stations,
    metroHours: METRO_HOURS,
    places: [...landmarks, ...everyday],
    bounds: [
      Math.min(...all.map((p) => p[0])),
      Math.min(...all.map((p) => p[1])),
      Math.max(...all.map((p) => p[0])),
      Math.max(...all.map((p) => p[1]))
    ]
  };
  return built;
}

// src/plugins/tabletop/world/route.ts
var MODE_LABEL = { walk: "\u6B65\u884C", bike: "\u9A91\u8F66", metro: "\u5730\u94C1", bus: "\u516C\u4EA4", taxi: "\u6253\u8F66", drive: "\u5F00\u8F66" };
var WALK_KMH = 4.5;
var DETOUR = 1.3;
var ROAD = 1.4;
var TRANSFER = 5;
var minutesOf = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
function isRush(when) {
  const m = when.minute % 1440;
  return when.workday && (m >= 420 && m < 570 || m >= 1020 && m < 1170);
}
var isNight = (when) => when.minute % 1440 >= 1380 || when.minute % 1440 < 300;
function walkMinutes(km2) {
  return km2 * DETOUR * 60 / WALK_KMH;
}
function carSpeed(when) {
  return isRush(when) ? 18 : isNight(when) ? 40 : 28;
}
function taxiFare(roadKm, when) {
  const base = 14 + Math.max(0, roadKm - 3) * 2.5;
  return Math.round(base * (isNight(when) ? 1.3 : 1));
}
function metroFare(rideKm) {
  return Math.min(8, 3 + Math.ceil(Math.max(0, rideKm - 3) / 5));
}
var graphs = /* @__PURE__ */ new WeakMap();
function graph(city2) {
  const known = graphs.get(city2);
  if (known) return known;
  const g = /* @__PURE__ */ new Map();
  const add = (a, b, line2, speed) => {
    const km2 = distance(city2.stations.get(a).at, city2.stations.get(b).at);
    const minutes = km2 / speed * 60 + 0.5;
    (g.get(a) ?? g.set(a, []).get(a)).push({ to: b, line: line2, minutes, km: km2 });
    (g.get(b) ?? g.set(b, []).get(b)).push({ to: a, line: line2, minutes, km: km2 });
  };
  for (const l of city2.lines) {
    for (let i = 1; i < l.stations.length; i++) add(l.stations[i - 1], l.stations[i], l.id, l.speed);
    if (l.loop) add(l.stations[l.stations.length - 1], l.stations[0], l.id, l.speed);
  }
  graphs.set(city2, g);
  return g;
}
function nearStations(city2, at, max = 4) {
  const all = [...city2.stations.values()].map((s) => ({ name: s.name, km: distance(s.at, at) })).sort((a, b) => a.km - b.km);
  const close = all.filter((s) => s.km <= 2.5).slice(0, max);
  return close.length ? close : all.slice(0, 1);
}
function metroTrip(city2, from, to, when) {
  const km2 = distance(from, to);
  const start = when.minute % 1440;
  const open = minutesOf(city2.metroHours.first);
  const last = minutesOf(city2.metroHours.last);
  if (start < open || start > last) {
    return { mode: "metro", minutes: 0, cost: 0, distance: km2, legs: [], ok: false, why: `\u5730\u94C1 ${city2.metroHours.first}\uFF5E${city2.metroHours.last} \u8FD0\u8425` };
  }
  if (nearStations(city2, from)[0].km > 2.5 || nearStations(city2, to)[0].km > 2.5) {
    return { mode: "metro", minutes: 0, cost: 0, distance: km2, legs: [], ok: false, why: "\u9644\u8FD1\u6CA1\u6709\u5730\u94C1\u7AD9" };
  }
  const g = graph(city2);
  const lines = new Map(city2.lines.map((l) => [l.id, l]));
  const wait = (line2) => {
    const [rush, other] = lines.get(line2).interval;
    return (isRush(when) ? rush : other) / 2;
  };
  const exits = new Map(nearStations(city2, to).map((s) => [s.name, s.km]));
  const best = /* @__PURE__ */ new Map();
  const queue = [];
  for (const s of nearStations(city2, from)) {
    for (const e of g.get(s.name) ?? []) {
      const key = `${s.name}|${e.line}`;
      const minutes = walkMinutes(s.km) + wait(e.line);
      if ((best.get(key) ?? Infinity) <= minutes) continue;
      best.set(key, minutes);
      queue.push({ key, station: s.name, line: e.line, minutes, km: 0 });
    }
  }
  let done = null;
  while (queue.length) {
    queue.sort((a, b) => a.minutes - b.minutes);
    const node = queue.shift();
    if (node.minutes > (best.get(node.key) ?? Infinity)) continue;
    if (done && node.minutes >= done.total) break;
    const exit = exits.get(node.station);
    if (exit !== void 0) {
      const total = node.minutes + walkMinutes(exit);
      if (!done || total < done.total) done = { node, total };
    }
    for (const e of g.get(node.station) ?? []) {
      const change = e.line !== node.line;
      const minutes = node.minutes + e.minutes + (change ? TRANSFER + wait(e.line) : 0);
      const key = `${e.to}|${e.line}`;
      if (minutes >= (best.get(key) ?? Infinity)) continue;
      best.set(key, minutes);
      queue.push({ key, station: e.to, line: e.line, minutes, km: node.km + e.km, prev: node });
    }
  }
  if (!done) return { mode: "metro", minutes: 0, cost: 0, distance: km2, legs: [], ok: false, why: "\u9644\u8FD1\u6CA1\u6709\u80FD\u5230\u7684\u5730\u94C1" };
  const path2 = [];
  for (let n = done.node; n; n = n.prev) path2.unshift(n);
  const legs = [];
  const first = path2[0];
  const walkIn = Math.round(walkMinutes(nearStations(city2, from).find((s) => s.name === first.station)?.km ?? 0));
  if (walkIn > 0) legs.push(`\u6B65\u884C ${walkIn} \u5206\u949F\u5230 ${first.station}\u7AD9`);
  const segments = [];
  let cur = { line: first.line, from: first.station, to: first.station, stops: 0 };
  for (let i = 1; i < path2.length; i++) {
    const n = path2[i];
    if (n.line === cur.line) {
      cur.to = n.station;
      cur.stops++;
    } else {
      segments.push(cur);
      cur = { line: n.line, from: path2[i - 1].station, to: n.station, stops: 1 };
    }
  }
  segments.push(cur);
  if (!segments.some((s) => s.stops > 0)) return { ...trip(city2, from, to, "walk", when), legs: [`\u6B65\u884C ${Math.round(walkMinutes(km2))} \u5206\u949F\uFF08\u5730\u94C1\u4E0D\u987A\u8DEF\uFF09`] };
  segments.filter((s) => s.stops > 0).forEach((s, i) => legs.push(`${i ? "\u6362\u4E58 " : ""}${lines.get(s.line).name} ${s.from} \u2192 ${s.to}\uFF08${s.stops} \u7AD9\uFF09`));
  const walkOut = Math.round(walkMinutes(exits.get(done.node.station) ?? 0));
  if (walkOut > 0) legs.push(`\u51FA\u7AD9\u6B65\u884C ${walkOut} \u5206\u949F`);
  return { mode: "metro", minutes: Math.max(1, Math.round(done.total)), cost: metroFare(done.node.km), distance: km2, legs, ok: true };
}
function trip(city2, from, to, mode, when) {
  const km2 = distance(from, to);
  const road = km2 * ROAD;
  switch (mode) {
    case "walk": {
      const minutes = Math.max(1, Math.round(walkMinutes(km2)));
      return { mode, minutes, cost: 0, distance: km2, legs: [`\u6B65\u884C ${minutes} \u5206\u949F`], ok: true };
    }
    case "bike": {
      const minutes = Math.max(2, Math.round(km2 * DETOUR * 60 / 12 + 3));
      return { mode, minutes, cost: Math.ceil(minutes / 30) * 1.5, distance: km2, legs: [`\u9A91\u5171\u4EAB\u5355\u8F66 ${minutes} \u5206\u949F`], ok: true };
    }
    case "taxi": {
      const minutes = Math.max(3, Math.round(5 + road / carSpeed(when) * 60));
      return { mode, minutes, cost: taxiFare(road, when), distance: km2, legs: [`\u6253\u8F66 ${minutes} \u5206\u949F\uFF08\u542B\u7B49\u8F66\uFF09`], ok: true };
    }
    case "drive": {
      const minutes = Math.max(2, Math.round(road / carSpeed(when) * 60 + 5));
      return { mode, minutes, cost: Math.round(road * 0.7), distance: km2, legs: [`\u5F00\u8F66 ${minutes} \u5206\u949F\uFF08\u542B\u505C\u8F66\uFF09`], ok: true };
    }
    case "bus": {
      const night = isNight(when);
      const minutes = Math.round(road / carSpeed(when) * 60 * 1.8 + (night ? 20 : 8));
      return { mode, minutes, cost: 2, distance: km2, legs: [`${night ? "\u591C\u73ED\u8F66" : "\u516C\u4EA4"} ${minutes} \u5206\u949F\uFF08\u542B\u7B49\u8F66\uFF09`], ok: true };
    }
    case "metro":
      return metroTrip(city2, from, to, when);
  }
}
function bestTrip(city2, from, to, when, prefer) {
  if (prefer) {
    const t = trip(city2, from, to, prefer, when);
    if (t.ok) return t;
  }
  const km2 = distance(from, to);
  if (km2 <= 1) return trip(city2, from, to, "walk", when);
  const metro = trip(city2, from, to, "metro", when);
  const taxi = trip(city2, from, to, "taxi", when);
  if (!metro.ok) return km2 <= 2 ? trip(city2, from, to, "walk", when) : taxi;
  if (km2 <= 1.8) {
    const walk = trip(city2, from, to, "walk", when);
    if (walk.minutes <= metro.minutes + 5) return walk;
  }
  return metro.minutes <= taxi.minutes + 15 ? metro : taxi;
}

// src/plugins/tabletop/world/state.ts
function normalizeWorld(world) {
  world.pending ??= [];
  world.knowledge ??= {};
  world.memory ??= {};
  world.pairs ??= [];
  return world;
}
function learn(world, who, text, source, at = world.now) {
  if (!who || !text || who === "\u4E3B\u89D2") return;
  const list4 = world.knowledge[who] ??= [];
  if (list4.some((k) => k.text === text)) return;
  list4.push({ at, text, source });
  if (list4.length > 40) list4.splice(0, list4.length - 40);
}
function renamePerson(world, from, to) {
  if (!from || !to || from === to) return;
  const swap = (s) => s === from ? to : s;
  if (world.people[from]) {
    world.people[to] = { ...world.people[from], ...world.people[to] ?? {} };
    delete world.people[from];
  }
  if (world.knowledge[from]) {
    world.knowledge[to] = [...world.knowledge[from], ...world.knowledge[to] ?? []].slice(-40);
    delete world.knowledge[from];
  }
  if (world.memory[from]) {
    world.memory[to] ??= world.memory[from];
    delete world.memory[from];
  }
  for (const c of world.commitments) {
    c.parties = c.parties.map(swap);
    for (const e of c.expectations) {
      e.who = swap(e.who);
      if (e.kind === "payment") e.to = swap(e.to);
    }
  }
  world.phone.contacts = [...new Set(world.phone.contacts.map(swap))];
  for (const m of world.phone.messages) {
    m.from = swap(m.from);
    m.to = swap(m.to);
  }
  for (const p of world.pending) {
    p.who = swap(p.who);
    if (p.message) p.message.to = swap(p.message.to);
  }
  for (const p of world.scene?.people ?? []) if (p.name === from) p.name = to;
}
function routinePlace(person, t) {
  const m = moment(t).minute;
  for (const s of person.routine ?? []) {
    if (!dayMatches(s.days, t)) continue;
    const a = minutesOf2(s.from);
    const b = minutesOf2(s.to) || 1440;
    if (a <= b ? m >= a && m < b : m >= a || m < b) return { place: s.place, doing: s.doing };
  }
  if (person.work && person.shift) {
    const [days, hours] = person.shift.split(" ");
    const [a, b] = (hours ?? "").split(/[–-]/).map(minutesOf2);
    if (days && dayMatches(days, t) && m >= a && m < b) return { place: person.work, doing: "\u4E0A\u73ED" };
  }
  if (person.home && (m >= 22 * 60 || m < 7 * 60)) return { place: person.home, doing: "\u5728\u5BB6" };
  return null;
}
var LIMITS = { ledger: 100, messages: 100, events: 100, noted: 300 };
var WEEKDAYS = ["\u661F\u671F\u65E5", "\u661F\u671F\u4E00", "\u661F\u671F\u4E8C", "\u661F\u671F\u4E09", "\u661F\u671F\u56DB", "\u661F\u671F\u4E94", "\u661F\u671F\u516D"];
var pad = (n) => String(n).padStart(2, "0");
function moment(t) {
  const date = new Date(t * 6e4);
  const hh = date.getUTCHours();
  const mm = date.getUTCMinutes();
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate(), weekday: date.getUTCDay(), hh, mm, minute: hh * 60 + mm };
}
function parseTime(text) {
  const m = /(\d{4})-(\d{1,2})-(\d{1,2})[ T]+(\d{1,2}):(\d{2})/.exec(text);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 6e4;
}
var dateKey = (t) => {
  const x = moment(t);
  return `${x.y}-${pad(x.m)}-${pad(x.d)}`;
};
var clock = (t) => {
  const x = moment(t);
  return `${pad(x.hh)}:${pad(x.mm)}`;
};
var isWorkday = (t) => {
  const w = moment(t).weekday;
  return w >= 1 && w <= 5;
};
var dayNumber = (world) => Math.floor(world.now / 1440) - Math.floor(world.start / 1440) + 1;
var midnight = (t) => Math.floor(t / 1440) * 1440;
function fmtNow(world) {
  const x = moment(world.now);
  return `\u7B2C ${dayNumber(world)} \u5929 \xB7 ${x.m} \u6708 ${x.d} \u65E5 ${WEEKDAYS[x.weekday]} ${pad(x.hh)}:${pad(x.mm)}`;
}
function dayMatches(days, t) {
  const x = moment(t);
  if (/^\d{4}-\d{2}-\d{2}$/.test(days)) return days === dateKey(t);
  if (days.includes("\u6BCF\u5929")) return true;
  if (days.includes("\u5DE5\u4F5C\u65E5")) return x.weekday >= 1 && x.weekday <= 5;
  if (days.includes("\u5468\u672B")) return x.weekday === 0 || x.weekday === 6;
  return days.includes(WEEKDAYS[x.weekday]) || days.includes(WEEKDAYS[x.weekday].replace("\u661F\u671F", "\u5468"));
}
var minutesOf2 = (hhmm) => {
  const m = /(\d{1,2}):(\d{2})/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};
var CLIMATE = [
  [1, 8, 0.3],
  [3, 10, 0.33],
  [6, 14, 0.4],
  [11, 20, 0.4],
  [16, 25, 0.38],
  [20, 28, 0.5],
  [25, 32, 0.4],
  [25, 32, 0.38],
  [21, 28, 0.33],
  [16, 23, 0.25],
  [10, 17, 0.27],
  [3, 10, 0.25]
];
function weatherOn(seed, date) {
  const rand = rng(hash(`${seed}|${date}`));
  const month = Number(date.slice(5, 7));
  const [low, high, wet] = CLIMATE[month - 1];
  const shift = Math.round((rand() - 0.5) * 6);
  let sky;
  const r = rand();
  if (month >= 7 && month <= 9 && r < 0.02) sky = "\u53F0\u98CE";
  else if (r < wet) sky = month >= 6 && month <= 9 && rand() < 0.35 ? "\u96F7\u9635\u96E8" : rand() < 0.7 ? "\u5C0F\u96E8" : "\u5927\u96E8";
  else if ((month <= 2 || month === 12) && rand() < 0.08) sky = "\u96FE";
  else sky = pickSky(rand());
  const wetCool = sky.includes("\u96E8") || sky === "\u53F0\u98CE" ? -2 : 0;
  return { date, sky, low: low + shift + wetCool, high: high + shift + wetCool * 1.5 };
}
var pickSky = (r) => r < 0.4 ? "\u6674" : r < 0.75 ? "\u591A\u4E91" : "\u9634";
function forecast(world) {
  return [0, 1, 2].map((i) => weatherOn(world.seed, dateKey(world.now + i * 1440)));
}
var fmtWeather = (w) => `${w.sky} ${Math.round(w.low)}\uFF5E${Math.round(w.high)}\xB0C`;
function allPlaces(world, city2) {
  return [...city2.places, ...world.places];
}
function placeById(world, city2, id) {
  if (!id) return void 0;
  return city2.places.find((p) => p.id === id) ?? world.places.find((p) => p.id === id);
}
function findPlace(world, city2, name) {
  const n = name.trim().replace(/站$/, "");
  if (!n) return void 0;
  if (/^(家|回家|住处|家里)$/.test(n)) return placeById(world, city2, world.me.home);
  if (/^(公司|单位|上班的地方|学校|办公室)$/.test(n)) return placeById(world, city2, world.me.job.place);
  const places = allPlaces(world, city2);
  const exact = places.find((p) => p.name === n);
  if (exact) return exact;
  const parts = n.split(/[·・\s（）()，,]+/).filter(Boolean).reverse();
  for (const part of parts) {
    const hit = places.find((p) => p.name === part);
    if (hit) return hit;
  }
  const contained = places.filter((p) => n.includes(p.name) || p.name.includes(n)).sort((a, b) => b.name.length - a.name.length);
  if (contained.length) return contained[0];
  const station = city2.stations.get(n);
  if (station) return places.filter((p) => p.landmark).sort((a, b) => dist(a.at, station.at) - dist(b.at, station.at))[0];
  return void 0;
}
var dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function nearby(world, city2, at, count, except) {
  return allPlaces(world, city2).filter((p) => p.id !== except).map((place) => ({ place, km: dist(place.at, at) })).sort((a, b) => a.km - b.km).slice(0, count);
}
function pay(world, amount, reason, at = world.now) {
  const value = Math.round(amount * 100) / 100;
  if (!value) return true;
  if (value < 0 && world.balance + value < 0) return false;
  world.balance = Math.round((world.balance + value) * 100) / 100;
  world.ledger.push({ at, amount: value, reason, balance: world.balance });
  if (world.ledger.length > LIMITS.ledger) world.ledger.splice(0, world.ledger.length - LIMITS.ledger);
  return true;
}
var DAILY_COST = { \u8282\u4FED: 40, \u666E\u901A: 70, \u5BBD\u88D5: 150 };
function advanceBody(body, minutes, activity, end) {
  const h = minutes / 60;
  const next = { ...body };
  next.full = Math.max(0, body.full - 6 * h * (activity === "\u7761\u89C9" ? 0.5 : activity === "\u4F53\u529B\u6D3B" ? 1.5 : 1));
  if (activity === "\u7761\u89C9") {
    next.energy = Math.min(100, body.energy + 12 * h);
    next.awakeSince = end;
  } else {
    next.energy = Math.max(0, body.energy - 5 * h * (activity === "\u4F53\u529B\u6D3B" ? 1.6 : 1));
  }
  next.full = Math.round(next.full);
  next.energy = Math.round(next.energy);
  return next;
}
function bodyWords(body) {
  const out = [];
  if (body.full < 10) out.push("\u997F\u5F97\u53D1\u614C");
  else if (body.full < 30) out.push("\u997F\u4E86");
  if (body.energy < 10) out.push("\u6781\u5EA6\u75B2\u60EB");
  else if (body.energy < 30) out.push("\u56F0\u5026");
  if (body.health < 30) out.push("\u75C5\u5F97\u5389\u5BB3");
  else if (body.health < 60) out.push("\u4E0D\u592A\u8212\u670D");
  return out;
}
function bodyStatuses(body) {
  const out = [];
  if (body.energy < 10) out.push({ name: "\u6781\u5EA6\u75B2\u60EB", factor: 0.7 });
  else if (body.energy < 30) out.push({ name: "\u56F0\u5026", factor: 0.9 });
  if (body.full < 10) out.push({ name: "\u997F\u5F97\u53D1\u614C", factor: 0.9 });
  return out;
}
var BODY_STATUS_NAMES = ["\u6781\u5EA6\u75B2\u60EB", "\u56F0\u5026", "\u997F\u5F97\u53D1\u614C"];
function addEvent(world, event) {
  world.events.push(event);
  if (world.events.length > LIMITS.events) world.events.splice(0, world.events.length - LIMITS.events);
}
function addMessage(world, message) {
  world.phone.messages.push(message);
  if (world.phone.messages.length > LIMITS.messages) world.phone.messages.splice(0, world.phone.messages.length - LIMITS.messages);
}
function note(world, key) {
  if (world.noted.includes(key)) return false;
  world.noted.push(key);
  if (world.noted.length > LIMITS.noted) world.noted.splice(0, world.noted.length - LIMITS.noted);
  return true;
}
var counter = 0;
var newId = (prefix, seed) => `${prefix}${(hash(`${seed}|${Date.now()}|${counter++}`) % 1e9).toString(36)}`;

// src/plugins/tabletop/world/scene.ts
var MAX_DESCRIBED = 8;
var CAPACITY = {
  cafe: 25,
  bar: 40,
  food: 30,
  shop: 6,
  market: 60,
  mall: 300,
  park: 80,
  sight: 150,
  fun: 300,
  station: 400,
  airport: 800,
  office: 12,
  residence: 4,
  school: 30,
  hospital: 60,
  police: 8,
  government: 15,
  gym: 25,
  hotel: 12,
  industry: 10
};
function busyness(kind, hour, workday) {
  const h = hour;
  const between = (a, b) => a <= b ? h >= a && h < b : h >= a || h < b;
  switch (kind) {
    case "cafe":
      return between(8, 11) ? 0.6 : between(14, 18) ? 0.8 : between(11, 14) ? 0.5 : between(18, 21) ? 0.4 : 0.1;
    case "food":
      return between(11, 13) || between(17, 20) ? 0.9 : between(6, 9) ? 0.4 : between(21, 2) ? 0.3 : 0.15;
    case "bar":
      return between(21, 1) ? 0.9 : between(19, 21) ? 0.5 : between(1, 3) ? 0.3 : 0.05;
    case "market":
      return between(6, 9) ? 0.9 : between(9, 12) ? 0.5 : between(16, 18) ? 0.5 : 0.1;
    case "mall":
      return (between(14, 21) ? 0.8 : between(10, 14) ? 0.5 : 0.1) * (workday ? 0.7 : 1.2);
    case "park":
      return between(6, 8) || between(16, 19) ? 0.7 : between(8, 16) ? 0.35 : 0.1;
    case "sight":
    case "fun":
      return (between(10, 17) ? 0.7 : between(17, 21) ? 0.4 : 0.1) * (workday ? 0.6 : 1.3);
    case "station":
    case "airport":
      return workday && (between(7, 9) || between(17, 19)) ? 1 : between(6, 23) ? 0.5 : 0.1;
    case "office":
      return workday && between(9, 18) ? 0.9 : 0.1;
    case "school":
      return workday && between(7, 17) ? 0.9 : 0.05;
    case "gym":
      return between(18, 22) ? 0.9 : between(7, 9) ? 0.5 : 0.25;
    case "hospital":
      return between(8, 12) ? 0.9 : between(12, 17) ? 0.6 : 0.2;
    default:
      return between(7, 22) ? 0.4 : 0.1;
  }
}
var VISITORS = {
  cafe: [["\u9644\u8FD1\u4E0A\u73ED\u7684\u4EBA", 24, 42, 0.5, [20, 60], 3], ["\u5B66\u751F", 18, 24, 0.55, [60, 180], 2], ["\u5E26\u7535\u8111\u529E\u516C\u7684\u81EA\u7531\u804C\u4E1A\u8005", 24, 38, 0.5, [90, 240], 1.5], ["\u7EA6\u4F1A\u7684\u5E74\u8F7B\u4EBA", 20, 32, 0.5, [40, 100], 1], ["\u95F2\u5750\u7684\u4E2D\u5E74\u4EBA", 40, 60, 0.4, [30, 90], 0.7], ["\u9000\u4F11\u7684\u8001\u4EBA", 60, 75, 0.5, [30, 90], 0.5]],
  bar: [["\u4E0B\u73ED\u540E\u559D\u4E00\u676F\u7684\u4E0A\u73ED\u65CF", 25, 40, 0.4, [60, 150], 3], ["\u670B\u53CB\u805A\u4F1A", 22, 35, 0.5, [90, 200], 2], ["\u72EC\u81EA\u559D\u9152\u7684\u4EBA", 25, 50, 0.3, [40, 120], 1], ["\u7EA6\u4F1A\u7684\u4EBA", 23, 35, 0.5, [60, 150], 1]],
  food: [["\u9644\u8FD1\u4E0A\u73ED\u7684\u4EBA", 22, 45, 0.45, [25, 50], 3], ["\u4E00\u5BB6\u4EBA", 30, 50, 0.5, [40, 80], 1.5], ["\u5B66\u751F", 16, 23, 0.5, [20, 40], 1], ["\u5916\u5356\u9A91\u624B", 22, 40, 0.1, [5, 10], 0.7], ["\u9644\u8FD1\u7684\u8001\u4F4F\u6237", 55, 75, 0.5, [30, 60], 1]],
  market: [["\u4E70\u83DC\u7684\u8001\u4EBA", 58, 78, 0.65, [15, 40], 3], ["\u4E70\u83DC\u7684\u4E3B\u5987\u548C\u4E3B\u592B", 30, 55, 0.6, [15, 30], 2], ["\u996D\u5E97\u6765\u8FDB\u8D27\u7684\u4EBA", 30, 50, 0.3, [10, 20], 0.7]],
  shop: [["\u8DEF\u8FC7\u4E70\u4E1C\u897F\u7684\u4EBA", 18, 60, 0.5, [3, 10], 3], ["\u5B66\u751F", 12, 20, 0.5, [3, 8], 1]],
  mall: [["\u901B\u8857\u7684\u5E74\u8F7B\u4EBA", 18, 32, 0.6, [60, 180], 3], ["\u5E26\u5B69\u5B50\u7684\u5BB6\u957F", 28, 42, 0.6, [60, 150], 1.5], ["\u60C5\u4FA3", 20, 32, 0.5, [60, 180], 1.5], ["\u4E2D\u5E74\u592B\u5987", 40, 60, 0.5, [60, 120], 1]],
  park: [["\u6668\u7EC3\u548C\u6563\u6B65\u7684\u8001\u4EBA", 58, 78, 0.5, [40, 120], 3], ["\u8DD1\u6B65\u7684\u4EBA", 22, 45, 0.45, [30, 60], 1.5], ["\u5E26\u5B69\u5B50\u7684\u5BB6\u957F", 28, 40, 0.65, [40, 90], 1.5], ["\u5750\u7740\u53D1\u5446\u7684\u5E74\u8F7B\u4EBA", 20, 32, 0.5, [20, 60], 1]],
  sight: [["\u6E38\u5BA2", 20, 60, 0.55, [40, 120], 3], ["\u62CD\u7167\u7684\u5E74\u8F7B\u4EBA", 18, 30, 0.65, [30, 90], 2], ["\u672C\u5730\u7684\u8001\u4EBA", 60, 78, 0.5, [30, 90], 1]],
  fun: [["\u6E38\u5BA2", 18, 50, 0.55, [90, 240], 3], ["\u5E26\u5B69\u5B50\u7684\u5BB6\u957F", 28, 42, 0.6, [120, 300], 2]],
  station: [["\u8D76\u8F66\u7684\u4EBA", 18, 65, 0.5, [5, 20], 4], ["\u51FA\u5DEE\u7684\u4E0A\u73ED\u65CF", 25, 50, 0.35, [10, 30], 2], ["\u62D6\u7740\u884C\u674E\u7684\u65C5\u5BA2", 20, 70, 0.5, [15, 40], 2]],
  airport: [["\u62D6\u7740\u884C\u674E\u7684\u65C5\u5BA2", 20, 70, 0.5, [30, 90], 4], ["\u51FA\u5DEE\u7684\u4E0A\u73ED\u65CF", 25, 50, 0.35, [30, 90], 2]],
  office: [["\u6765\u529E\u4E8B\u7684\u8BBF\u5BA2", 25, 50, 0.45, [10, 40], 2], ["\u8FD9\u91CC\u4E0A\u73ED\u7684\u4EBA", 23, 45, 0.5, [5, 20], 3]],
  residence: [["\u8FD9\u91CC\u7684\u4F4F\u6237", 20, 75, 0.5, [5, 30], 3], ["\u9001\u5FEB\u9012\u7684\u4EBA", 22, 40, 0.1, [3, 8], 1]],
  school: [["\u5B66\u751F", 7, 18, 0.5, [20, 60], 4], ["\u8001\u5E08", 25, 55, 0.6, [10, 40], 1], ["\u63A5\u5B69\u5B50\u7684\u5BB6\u957F", 30, 65, 0.6, [10, 30], 1.5]],
  hospital: [["\u770B\u75C5\u7684\u4EBA", 20, 80, 0.5, [40, 120], 3], ["\u966A\u5BB6\u4EBA\u770B\u75C5\u7684\u4EBA", 25, 60, 0.55, [40, 120], 2]],
  police: [["\u6765\u529E\u4E8B\u7684\u4EBA", 20, 70, 0.5, [15, 45], 1]],
  government: [["\u6765\u529E\u4E8B\u7684\u4EBA", 25, 65, 0.5, [20, 60], 1]],
  gym: [["\u5065\u8EAB\u7684\u4E0A\u73ED\u65CF", 22, 40, 0.45, [60, 100], 3], ["\u5927\u5B66\u751F", 18, 23, 0.4, [60, 100], 1]],
  hotel: [["\u4F4F\u5E97\u7684\u5BA2\u4EBA", 25, 60, 0.45, [10, 30], 3], ["\u6765\u89C1\u5BA2\u4EBA\u7684\u4EBA", 25, 50, 0.5, [10, 30], 1]],
  industry: [["\u4E0A\u73ED\u7684\u5DE5\u4EBA", 20, 55, 0.25, [30, 120], 3]]
};
var OUTDOORS = ["mall", "sight", "park", "market", "fun", "residence", "office", "school"];
var PASSERS_BY = [["\u8DEF\u8FC7\u7684\u4EBA", 18, 70, 0.5, [2, 8], 3], ["\u8D76\u7740\u4E0A\u73ED\u7684\u4EBA", 22, 45, 0.5, [1, 5], 2], ["\u905B\u5F2F\u7684\u8001\u4EBA", 60, 78, 0.5, [5, 20], 1]];
var STAFF = {
  cafe: [["\u5496\u5561\u5E08", 20, 32, 0.6], ["\u5E97\u5458", 18, 28, 0.6]],
  bar: [["\u8C03\u9152\u5E08", 24, 38, 0.3], ["\u670D\u52A1\u751F", 20, 28, 0.5]],
  food: [["\u8001\u677F", 35, 60, 0.4], ["\u670D\u52A1\u5458", 18, 45, 0.6]],
  shop: [["\u5E97\u5458", 18, 50, 0.6]],
  market: [["\u5356\u83DC\u7684\u644A\u4E3B", 35, 65, 0.5], ["\u5356\u8089\u7684\u644A\u4E3B", 35, 60, 0.2], ["\u5356\u6C34\u4EA7\u7684\u644A\u4E3B", 30, 60, 0.4]],
  office: [["\u524D\u53F0", 22, 32, 0.8], ["\u4FDD\u5B89", 30, 60, 0.05]],
  residence: [["\u95E8\u536B", 45, 65, 0.1]],
  school: [["\u95E8\u536B", 45, 65, 0.1]],
  hospital: [["\u62A4\u58EB", 22, 45, 0.9], ["\u5BFC\u8BCA\u53F0\u7684\u5DE5\u4F5C\u4EBA\u5458", 25, 50, 0.7]],
  police: [["\u503C\u73ED\u6C11\u8B66", 25, 50, 0.25]],
  gym: [["\u6559\u7EC3", 22, 35, 0.3], ["\u524D\u53F0", 20, 28, 0.6]],
  hotel: [["\u524D\u53F0", 20, 32, 0.7]],
  mall: [["\u5546\u573A\u4FDD\u5B89", 30, 55, 0.1]],
  station: [["\u8F66\u7AD9\u5DE5\u4F5C\u4EBA\u5458", 25, 50, 0.4]]
};
function isOpen(place, t) {
  const hours = place.hours;
  if (!hours || hours.includes("\u5168\u5929")) return true;
  if (hours.includes("\u5DE5\u4F5C\u65E5") && !isWorkday(t)) return false;
  const m = /(\d{1,2}:\d{2})\s*[–~～-]\s*(\d{1,2}:\d{2})/.exec(hours);
  if (!m) return true;
  const minute = moment(t).minute;
  const open = minutesOf2(m[1]);
  const close = minutesOf2(m[2]) === 0 ? 1440 : minutesOf2(m[2]);
  return open <= close ? minute >= open && minute < close : minute >= open || minute < close;
}
function weatherFactor(kind, weather) {
  if (!weather) return 1;
  const wet = /雨|台风/.test(weather.sky);
  if (!wet) return 1;
  if (kind === "park" || kind === "sight" || kind === "fun") return weather.sky === "\u5C0F\u96E8" ? 0.5 : 0.2;
  if (kind === "mall" || kind === "cafe") return 1.15;
  return 0.9;
}
var ageAt = (rand, min, max) => Math.round(min + rand() * (max - min));
function ageWords(age) {
  if (age < 7) return "\u5C0F\u5B69";
  if (age < 13) return "\u5C0F\u5B66\u751F\u6A21\u6837";
  if (age < 18) return "\u5341\u51E0\u5C81";
  if (age < 23) return "\u4E8C\u5341\u51FA\u5934";
  if (age < 28) return "\u4E8C\u5341\u4E94\u516D\u5C81";
  if (age < 34) return "\u4E09\u5341\u5C81\u4E0A\u4E0B";
  if (age < 40) return "\u4E09\u5341\u591A\u5C81";
  if (age < 50) return "\u56DB\u5341\u591A\u5C81";
  if (age < 60) return "\u4E94\u5341\u591A\u5C81";
  if (age < 70) return "\u516D\u5341\u591A\u5C81";
  return "\u4E03\u5341\u591A\u5C81";
}
function staffOf(world, place) {
  const known = world.staff[place.id];
  if (known) return known;
  const rand = rng(hash(`${world.seed}|staff|${place.id}`));
  const roles = STAFF[place.kind] ?? [];
  const people = roles.map(([role, min, max, women], i) => ({
    id: `s-${hash(place.id).toString(36)}-${i}`,
    role: "staff",
    gender: rand() < women ? "\u5973" : "\u7537",
    age: ageAt(rand, min, max),
    purpose: role,
    leaveAt: Number.MAX_SAFE_INTEGER
  }));
  world.staff[place.id] = people;
  return people;
}
function updateScene(world, place, now) {
  const same = world.scene?.place === place.id;
  if (place.id === world.me.home) {
    const people2 = same ? world.scene.people.filter((p) => p.name) : [];
    return { scene: { place: place.id, since: same ? world.scene.since : now, crowd: "\u5BB6\u91CC", people: people2 }, fresh: [] };
  }
  const kept = same ? world.scene.people.filter((p) => p.name || (p.role === "staff" ? isOpen(place, now) : p.leaveAt > now)) : [];
  const rand = rng(hash(`${world.seed}|${place.id}|${Math.floor(now / 15)}`));
  const open = isOpen(place, now);
  const staff = open ? staffOf(world, place).filter((s) => !kept.some((k) => k.id === s.id)) : [];
  const m = moment(now);
  const street = !open && OUTDOORS.includes(place.kind) && m.hh >= 6 && m.hh < 23;
  const busy = open ? busyness(place.kind, m.hh, isWorkday(now)) * weatherFactor(place.kind, world.weather[0]) : street ? 0.03 * weatherFactor("park", world.weather[0]) : 0;
  const target = street ? Math.round(3 + rand() * 4) : Math.round((CAPACITY[place.kind] ?? 6) * busy * (0.8 + rand() * 0.4));
  const visitors = kept.filter((p) => p.role === "visitor");
  const room = Math.max(0, Math.min(target, MAX_DESCRIBED - staff.length - kept.filter((p) => p.role === "staff").length) - visitors.length);
  const types = street ? PASSERS_BY : VISITORS[place.kind] ?? PASSERS_BY;
  const total = types.reduce((s, t) => s + t[5], 0);
  const added = [];
  for (let i = 0; i < room; i++) {
    let r = rand() * total;
    const type = types.find((t) => (r -= t[5]) <= 0) ?? types[0];
    const [purpose, min, max, women, [s0, s1]] = type;
    const stay = Math.round(s0 + rand() * (s1 - s0));
    added.push({
      id: `b-${hash(`${world.seed}|${place.id}|${now}|${i}`).toString(36)}`,
      role: "visitor",
      gender: rand() < women ? "\u5973" : "\u7537",
      age: ageAt(rand, min, max),
      purpose,
      leaveAt: now + Math.max(5, Math.round(same ? stay : stay * (0.3 + rand() * 0.7)))
    });
  }
  const people = [...kept, ...staff, ...added];
  const scene = { place: place.id, since: same ? world.scene.since : now, crowd: same && !added.length && !staff.length ? world.scene.crowd : void 0, people };
  return { scene, fresh: people.filter((p) => !p.looks) };
}
function crowdWord(place, now, weather) {
  const busy = isOpen(place, now) ? busyness(place.kind, moment(now).hh, isWorkday(now)) * weatherFactor(place.kind, weather) : 0;
  const n = (CAPACITY[place.kind] ?? 6) * busy;
  if (!isOpen(place, now)) return "\u6CA1\u6709\u8425\u4E1A";
  return n < 2 ? "\u51B7\u51B7\u6E05\u6E05" : n < 8 ? "\u4EBA\u4E0D\u591A" : n < 25 ? "\u6709\u4E00\u4E9B\u4EBA" : n < 80 ? "\u633A\u70ED\u95F9" : "\u4EBA\u5F88\u591A";
}

// src/plugins/tabletop/world/turn.ts
var MAX_TURN = 180;
var MAX_SKIP = 30 * 1440;
var MODES = { \u6B65\u884C: "walk", \u8D70\u8DEF: "walk", \u9A91\u8F66: "bike", \u5355\u8F66: "bike", \u5730\u94C1: "metro", \u516C\u4EA4: "bus", \u6253\u8F66: "taxi", \u51FA\u79DF\u8F66: "taxi", \u7F51\u7EA6\u8F66: "taxi", \u5F00\u8F66: "drive" };
function modeOf(by) {
  if (!by) return void 0;
  const hit = Object.entries(MODES).find(([word]) => by.includes(word));
  return hit?.[1];
}
function registerPlace(world, city2, name, near, about = "") {
  const rand = rng(hash(`${world.seed}|${name}`));
  const base = near?.at ?? placeById(world, city2, world.at)?.at ?? [0, 0];
  const a = rand() * Math.PI * 2;
  const d = 0.08 + rand() * 0.25;
  const at = [Math.round((base[0] + Math.cos(a) * d) * 1e3) / 1e3, Math.round((base[1] + Math.sin(a) * d) * 1e3) / 1e3];
  const kind = /咖啡/.test(name) ? "cafe" : /酒吧|酒馆/.test(name) ? "bar" : /餐|面|饭|馆|烧烤|火锅/.test(name) ? "food" : /超市|便利|店/.test(name) ? "shop" : /公园/.test(name) ? "park" : /医院|诊所/.test(name) ? "hospital" : /小区|公寓|新村|家|住处|花园|苑/.test(name) ? "residence" : /公司|大厦|中心|广告|传媒|科技|集团|事务所|工作室|设计/.test(name) ? "office" : "sight";
  const place = {
    id: `x${(hash(`${world.seed}|${name}|${world.places.length}`) % 1e8).toString(36)}`,
    name,
    kind,
    at,
    district: districtAt(city2, at)?.id ?? near?.district ?? "",
    hours: kind === "bar" ? "19:00\u201302:00" : kind === "residence" || kind === "park" ? "\u5168\u5929" : "09:00\u201322:00",
    about,
    landmark: false
  };
  world.places.push(place);
  return place;
}
function expectedPlace(world, t) {
  for (const c of world.commitments) {
    if (c.ended) continue;
    for (const e of c.expectations) {
      if (e.kind !== "presence" || e.who !== "\u4E3B\u89D2" || !dayMatches(e.days, t)) continue;
      const m = moment(t).minute;
      if (m >= minutesOf2(e.from) && m < minutesOf2(e.to)) return e.place;
    }
  }
  return null;
}
var counterpart = (c, who) => c.parties.filter((p) => p !== who).map((p) => c.reps?.[p] ?? p);
function runCommitments(world, city2, from, to, where) {
  const out = [];
  for (let day = midnight(from); day <= to; day += 1440) {
    for (const c of world.commitments) {
      if (c.ended) continue;
      c.expectations.forEach((e, i) => {
        if (e.kind === "presence" && e.who === "\u4E3B\u89D2") {
          const t = day + minutesOf2(e.from);
          if (t <= from || t > to || !dayMatches(e.days, t)) return;
          const at = where(t + 1);
          if (at === e.place || !note(world, `${c.id}|${i}|${dateKey(t)}`)) return;
          const place = placeById(world, city2, e.place)?.name ?? e.place;
          const who = counterpart(c, "\u4E3B\u89D2");
          for (const w of who) if (world.people[w]) world.pending.push({ at: t + 15, who: w, kind: "notice", what: `\u6309${c.name}\uFF0C\u4E3B\u89D2 ${e.from} \u5E94\u8BE5\u5728${place}\uFF08${e.days} ${e.from}\u2013${e.to}\uFF09\uFF0C\u5230 ${clock(t + 15)} \u8FD8\u6CA1\u6765` });
          out.push({ at: t, kind: "lapse", seen: true, text: `${clock(t)} ${c.name}\uFF1A\u4E3B\u89D2\u8FD9\u65F6\u5E94\u8BE5\u5728${place}\uFF08${e.days} ${e.from}\u2013${e.to}\uFF09\uFF0C\u4F46\u4E0D\u5728\u3002${who.length ? `${who.join("\u3001")}\u4F1A\u5BDF\u89C9\uFF0C\u600E\u4E48\u53CD\u5E94\u4E3B\u89D2\u73B0\u5728\u8FD8\u4E0D\u77E5\u9053\u3002` : ""}` });
        } else if (e.kind === "payment") {
          if (moment(day).d !== e.day) return;
          const t = day + 9 * 60;
          if (t <= from || t > to || !note(world, `${c.id}|${i}|${dateKey(t)}`)) return;
          if (e.who === "\u4E3B\u89D2") {
            if (pay(world, -e.amount, `${c.name}`, t)) out.push({ at: t, kind: "money", seen: true, text: `${clock(t)} \u6309${c.name}\u4ED8\u7ED9${counterpart(c, "\u4E3B\u89D2").join("\u3001")} ${e.amount} \u5143` });
            else {
              out.push({ at: t, kind: "lapse", seen: true, text: `${clock(t)} ${c.name}\uFF1A\u8BE5\u4ED8 ${e.amount} \u5143\uFF0C\u4F59\u989D\u4E0D\u591F\uFF0C\u6CA1\u4ED8\u4E0A\u3002${counterpart(c, "\u4E3B\u89D2").join("\u3001")}\u4F1A\u5BDF\u89C9\u3002` });
              for (const w of counterpart(c, "\u4E3B\u89D2")) if (world.people[w]) world.pending.push({ at: t + 60, who: w, kind: "notice", what: `\u6309${c.name}\u4ECA\u5929\u8BE5\u6536\u5230\u4E3B\u89D2 ${e.amount} \u5143\uFF0C\u6CA1\u6536\u5230` });
            }
          } else if (e.to === "\u4E3B\u89D2") {
            const last = c.record.filter((r) => r.text.startsWith("\u5DF2\u4ED8")).at(-1)?.at ?? c.since;
            const off = c.record.filter((r) => r.at > last && r.text.startsWith("\u6263\u6B3E")).reduce((s, r) => s + Number(/扣款 (\d+)/.exec(r.text)?.[1] ?? 0), 0);
            const amount = Math.max(0, e.amount - off);
            pay(world, amount, `${c.name}\uFF08${e.who}\uFF09`, t);
            c.record.push({ at: t, text: `\u5DF2\u4ED8 ${amount} \u5143${off ? `\uFF08\u6263\u4E86 ${off} \u5143\uFF09` : ""}` });
            out.push({ at: t, kind: "money", seen: true, text: `${clock(t)} \u6536\u5230${e.who}\u6309${c.name}\u4ED8\u7684 ${amount} \u5143${off ? `\uFF08\u6263\u4E86 ${off} \u5143\uFF09` : ""}` });
          }
        } else if (e.kind === "deadline" && e.who === "\u4E3B\u89D2") {
          if (e.by <= from || e.by > to || c.record.some((r) => r.text.startsWith("\u5B8C\u6210")) || !note(world, `${c.id}|${i}`)) return;
          for (const w of counterpart(c, "\u4E3B\u89D2")) if (world.people[w]) world.pending.push({ at: e.by + 10, who: w, kind: "notice", what: `\u4E3B\u89D2\u7B54\u5E94\u5728 ${clock(e.by)} \u524D${e.what}\uFF0C\u6CA1\u505A\u5230` });
          out.push({ at: e.by, kind: "lapse", seen: false, text: `${clock(e.by)} ${c.name}\uFF1A\u8BF4\u597D\u5728\u8FD9\u4E4B\u524D\u505A\u5B8C\u300C${e.what}\u300D\uFF0C\u6CA1\u505A\u5B8C\u3002${counterpart(c, "\u4E3B\u89D2").join("\u3001")}\u4F1A\u5BDF\u89C9\u3002` });
        }
      });
    }
  }
  return out;
}
function runDays(world, from, to) {
  const out = [];
  for (let day = midnight(from) + 1440; day <= to; day += 1440) {
    const cost = DAILY_COST[world.me.living];
    if (!pay(world, -cost, "\u65E5\u5E38\u5F00\u9500\uFF08\u5403\u996D\u548C\u65E5\u7528\uFF09", day)) {
      out.push({ at: day, kind: "money", seen: true, text: `${dateKey(day)} \u94B1\u4E0D\u591F\u8FD9\u4E00\u5929\u7684\u65E5\u5E38\u5F00\u9500\u4E86` });
    }
  }
  return out;
}
function playTurn(world, city2, ask2) {
  const from = world.now;
  const events = [];
  const startPlace = world.at;
  let move;
  let travel = 0;
  const leave = ask2.move?.leave ? Math.min(from + MAX_TURN * 4, timeAt(ask2.move.leave, from)) : from;
  if (ask2.move?.to) {
    const here = placeById(world, city2, world.at);
    let dest2 = findPlace(world, city2, ask2.move.to);
    let newPlace = false;
    if (!dest2) {
      dest2 = registerPlace(world, city2, ask2.move.to.replace(/^.*[·・]\s*/, ""), here);
      newPlace = true;
    }
    if (dest2.id !== world.at && here) {
      const when = { minute: moment(leave).minute, workday: isWorkday(leave) };
      const asked = modeOf(ask2.move.by);
      let t = asked ? trip(city2, here.at, dest2.at, asked, when) : bestTrip(city2, here.at, dest2.at, when, world.me.habit);
      if (!t.ok) t = bestTrip(city2, here.at, dest2.at, when);
      if (t.cost && !pay(world, -t.cost, `${MODE_LABEL[t.mode]}\u53BB${dest2.name}`, leave)) {
        events.push({ at: leave, kind: "money", seen: true, text: `\u94B1\u4E0D\u591F${MODE_LABEL[t.mode]}\uFF0C\u53EA\u80FD\u8D70\u8FC7\u53BB` });
        t = trip(city2, here.at, dest2.at, "walk", when);
      }
      travel = t.minutes;
      move = { from: world.at, to: dest2.id, trip: { mode: t.mode, minutes: t.minutes, cost: t.cost, legs: t.legs }, with: ask2.move.with ?? [], newPlace };
      events.push({ at: leave + travel, kind: "move", seen: true, text: `${clock(leave)} \u51FA\u53D1\uFF0C${clock(leave + travel)} \u5230\u4E86${dest2.name}\uFF08${t.legs.join("\uFF0C")}${t.cost ? `\uFF0C\u82B1\u4E86 ${t.cost} \u5143` : ""}\uFF09` });
    }
  }
  const until = ask2.until ? parseTime(ask2.until) : null;
  const arrive = leave + travel;
  let to = until && until > from ? Math.min(until, from + MAX_SKIP) : arrive + Math.max(1, Math.min(MAX_TURN, Math.round(ask2.minutes ?? 10)));
  to = Math.max(to, arrive + 1);
  const skipped = to - from > MAX_TURN + (arrive - from);
  const dest = move?.to ?? world.at;
  const origin = world.at;
  const where = (t) => ask2.routine && skipped ? expectedPlace(world, t) ?? world.me.home : t < leave ? origin : t < arrive ? null : dest;
  events.push(...runDays(world, from, to));
  events.push(...runCommitments(world, city2, from, to, where));
  events.push(...deliverDue(world, to));
  followRoutines(world, to);
  const before = world.body;
  if (ask2.routine && skipped) {
    world.body = { ...world.body, full: 65, energy: moment(to).hh < 12 ? 90 : 55, awakeSince: midnight(to) + 7 * 60 };
  } else {
    world.body = advanceBody(world.body, to - from, ask2.activity ?? "\u65E5\u5E38", to);
  }
  if (before.full >= 30 && world.body.full < 30) events.push({ at: to, kind: "body", seen: true, text: "\u4E3B\u89D2\u997F\u4E86" });
  if (before.energy >= 30 && world.body.energy < 30) events.push({ at: to, kind: "body", seen: true, text: "\u4E3B\u89D2\u56F0\u4E86" });
  world.now = to;
  world.at = ask2.routine && skipped ? where(to) ?? dest : dest;
  world.weather = forecast(world);
  if (move?.with.length) {
    for (const name of move.with) if (world.people[name]) world.people[name] = { ...world.people[name], at: world.at, seenAt: to };
  }
  events.sort((a, b) => a.at - b.at);
  for (const e of events) addEvent(world, e);
  const place = placeById(world, city2, world.at);
  let fresh = [];
  if (place) {
    const next = updateScene(world, place, to);
    world.scene = next.scene;
    fresh = next.fresh;
  }
  if (startPlace !== world.at && skipped) events.push({ at: to, kind: "note", seen: true, text: `\u8DF3\u8FC7\u4E86\u4E00\u6BB5\u65F6\u95F4\uFF0C\u73B0\u5728\u662F ${dateKey(to)} ${clock(to)}\uFF0C${fmtWeather(world.weather[0])}` });
  return { from, to, move, events, fresh: fresh.map((p) => p.id), skipped };
}
function extendTurn(world, city2, minutes) {
  const from = world.now;
  const to = from + Math.max(0, Math.min(12 * 60, Math.round(minutes)));
  if (to === from) return [];
  const events = [...runDays(world, from, to), ...runCommitments(world, city2, from, to, () => world.at), ...deliverDue(world, to)];
  followRoutines(world, to);
  world.body = advanceBody(world.body, to - from, "\u65E5\u5E38", to);
  world.now = to;
  world.weather = forecast(world);
  for (const e of events) addEvent(world, e);
  return events;
}

// src/plugins/tabletop/world/minds.ts
var ACT_TOOL_NAME = "hearth_act";
var DAY_TOOL_NAME = "hearth_day";
var PROFILE_TOOL_NAME = "hearth_profile";
var MAX_IMPORTANT = 8;
var str5 = (v) => typeof v === "string" ? v.trim() : "";
var num5 = (v) => typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\s*[+-]?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : void 0;
var isRecord5 = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
var list3 = (v) => Array.isArray(v) ? v : [];
var clamp2 = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
var hasMind = (world, who) => ["related", "important"].includes(world.people[who]?.kind ?? "");
function timeAt(text, after) {
  const full = parseTime(text);
  if (full) return Math.max(full, after);
  const m = /(\d{1,2}):(\d{2})/.exec(text);
  if (!m) return after;
  const t = Math.floor(after / 1440) * 1440 + minutesOf2(`${m[1]}:${m[2]}`);
  if (t < after) return after - t < 60 ? after : t + 1440;
  return t;
}
function takeNotices(world, to) {
  const due = /* @__PURE__ */ new Map();
  world.pending = world.pending.filter((p) => {
    if (p.kind !== "notice" || p.at > to) return true;
    if (!hasMind(world, p.who)) return false;
    (due.get(p.who) ?? due.set(p.who, []).get(p.who)).push(p);
    return false;
  });
  return due;
}
function deliverDue(world, to) {
  const out = [];
  world.pending = world.pending.filter((p) => {
    if (p.kind !== "deliver" || p.at > to || !p.message) return true;
    const { to: target, text, call } = p.message;
    addMessage(world, { at: p.at, from: p.who, to: target, text: call ? `\uFF08\u6253\u6765\u7535\u8BDD\uFF09${text}` : text, read: target !== PROTAGONIST });
    if (target === PROTAGONIST) {
      out.push({ at: p.at, kind: "message", seen: true, text: call ? `${clock(p.at)} ${p.who}\u6253\u6765\u7535\u8BDD\uFF08${text}\uFF09` : `${clock(p.at)} ${p.who}\u53D1\u6765\u6D88\u606F\uFF1A${text}` });
      if (world.people[p.who]) world.people[p.who].lastContact = p.at;
    } else {
      learn(world, target, `${p.who}${call ? "\u6253\u7535\u8BDD\u8BF4" : "\u53D1\u6D88\u606F\u8BF4"}\uFF1A${text}`, "\u542C\u8BF4", p.at);
      world.pending.push({ at: p.at + 10, who: target, kind: "notice", what: `${p.who}${call ? "\u6253\u6765\u7535\u8BDD" : "\u53D1\u6765\u6D88\u606F"}\uFF1A\u300C${text}\u300D` });
    }
    return false;
  });
  return out;
}
function followRoutines(world, t) {
  for (const [name, p] of Object.entries(world.people)) {
    if (p.kind === "bystander") continue;
    if (p.seenAt && t - p.seenAt < 120) continue;
    const slot = routinePlace(p, t);
    if (slot) p.at = slot.place;
  }
  for (const c of world.commitments) {
    if (c.ended) continue;
    for (const e of c.expectations) {
      if (e.kind !== "presence" || e.who === PROTAGONIST || !world.people[e.who] || !/^\d{4}-/.test(e.days) || e.days !== dateKey(t)) continue;
      const m = t % 1440;
      if (m >= minutesOf2(e.from) && m < minutesOf2(e.to)) world.people[e.who].at = e.place;
    }
  }
}
function attitudeLine(state, who) {
  const rel = findRelation(state, who, PROTAGONIST);
  if (!rel) return "\u5BF9\u4E3B\u89D2\u8FD8\u6CA1\u6709\u4EC0\u4E48\u770B\u6CD5";
  const values = AXES.map(([axis, label]) => `${label}${Math.round(relationValue(rel, axis))}`).join(" ");
  const why = rel.reasons.slice(-3).map((r) => r.text).join("\uFF1B");
  return `${describe(rel)}\uFF08${values} \u719F\u6089${Math.round(rel.familiarity)}\uFF09${why ? `\uFF0C\u6700\u8FD1\uFF1A${why}` : ""}`;
}
function personText(world, city2, state, who, profile, full = false) {
  const p = world.people[who] ?? { kind: "related" };
  const sheet = state.characters[who];
  const place = placeById(world, city2, p.at);
  const lines = [
    `\u3010${who}\u3011${p.role ? `${p.role}\u3002` : ""}${profile ? full ? `
${profile.profile}` : profile.summary : p.brief ?? sheet?.description ?? ""}`,
    sheet ? `\u6027\u683C\u7CFB\u6570\uFF1A\u654F\u611F ${sheet.traits.\u654F\u611F} \u8BB0\u4EC7 ${sheet.traits.\u8BB0\u4EC7} \u591A\u7591 ${sheet.traits.\u591A\u7591}` : "",
    p.mood !== void 0 ? `\u5FC3\u60C5 ${Math.round(p.mood)}\uFF08\u5E73\u5E38 50\uFF09\u3000\u538B\u529B ${Math.round(p.stress ?? 30)}${p.recent ? `\u3000\u8FD1\u51B5\uFF1A${p.recent}` : ""}` : "",
    `\u73B0\u5728\uFF1A${fmtNow(world)}\uFF0C${place ? `\u5728${place.name}` : "\u5728\u54EA\u4E0D\u6E05\u695A"}`,
    `\u5BF9\u4E3B\u89D2\uFF1A${attitudeLine(state, who)}`
  ];
  const pairs = world.pairs.filter((x) => x.from === who);
  if (pairs.length) lines.push(`\u5BF9\u5176\u4ED6\u4EBA\uFF1A${pairs.map((x) => `${x.to}\uFF08\u4EB2\u8FD1${x.axes.affection ?? 0} \u4FE1\u4EFB${x.axes.trust ?? 0} \u6028\u6068${x.axes.resentment ?? 0}\uFF09`).join("\u3001")}`);
  const commitments = world.commitments.filter((c) => !c.ended && (c.parties.includes(who) || Object.values(c.reps ?? {}).includes(who)));
  if (commitments.length) {
    lines.push("\u76F8\u5173\u7684\u7EA6\u5B9A\uFF1A");
    for (const c of commitments) lines.push(`- ${c.name}\uFF08${c.parties.join("\u3001")}\uFF09\uFF1A${describeExpectations(world, city2, c)}\u3002\u60EF\u4F8B\uFF1A${c.norms}${c.record.length ? `\u3002\u8BB0\u5F55\uFF1A${c.record.slice(-4).map((r) => `${dateKey(r.at)} ${r.text}`).join("\uFF1B")}` : ""}`);
  }
  const known = world.knowledge[who] ?? [];
  if (world.memory[who]) lines.push(`\u4EE5\u524D\u7684\u4E8B\uFF1A${world.memory[who]}`);
  lines.push(known.length ? `${who}\u77E5\u9053\u7684\u4E8B\uFF08\u53EA\u6709\u8FD9\u4E9B\uFF1B\u804A\u5929\u8BB0\u5F55\u91CC${who}\u4E0D\u5728\u573A\u7684\u90E8\u5206\uFF0C${who}\u4E0D\u77E5\u9053\uFF09\uFF1A` : `${who}\u5BF9\u4E3B\u89D2\u6700\u8FD1\u7684\u4E8B\u4E00\u65E0\u6240\u77E5\uFF08\u804A\u5929\u8BB0\u5F55\u91CC${who}\u4E0D\u5728\u573A\u7684\u90E8\u5206\uFF0C${who}\u4E0D\u77E5\u9053\uFF09\u3002`);
  for (const k of known.slice(-15)) lines.push(`- ${dateKey(k.at).slice(5)} ${clock(k.at)} ${k.text}\uFF08${k.source}\uFF09`);
  return lines.filter(Boolean).join("\n");
}
function describeExpectations(world, city2, c) {
  return c.expectations.map((e) => {
    if (e.kind === "presence") return `${e.who === PROTAGONIST ? "\u4E3B\u89D2" : e.who} ${e.days} ${e.from}\u2013${e.to} \u5728${placeById(world, city2, e.place)?.name ?? e.place}`;
    if (e.kind === "payment") return `${e.who === PROTAGONIST ? "\u4E3B\u89D2" : e.who}\u6BCF\u6708 ${e.day} \u65E5\u4ED8 ${e.amount} \u5143\u7ED9${e.to === PROTAGONIST ? "\u4E3B\u89D2" : e.to}`;
    return `${e.who === PROTAGONIST ? "\u4E3B\u89D2" : e.who}\u5728 ${dateKey(e.by)} ${clock(e.by)} \u524D${e.what}`;
  }).join("\uFF1B") || "\u6CA1\u6709\u5177\u4F53\u7684\u65F6\u95F4";
}
var axisProps = Object.fromEntries([...AXES.map(([axis, label]) => [axis, { type: "number", description: `${label}\u7684\u53D8\u5316` }]), ["familiarity", { type: "number", description: "\u719F\u6089\u7684\u53D8\u5316" }]]);
function actTool() {
  return {
    type: "function",
    function: {
      name: ACT_TOOL_NAME,
      description: "\u4EBA\u7269\u53CD\u5E94\uFF1A\u66FF\u8FD9\u4E2A\u4EBA\u51B3\u5B9A\uFF0C\u4ED6\u5BDF\u89C9\u5230\u8FD9\u4E9B\u4E8B\u4EE5\u540E\u4F1A\u600E\u4E48\u60F3\u3001\u505A\u4EC0\u4E48\u3002",
      parameters: {
        type: "object",
        properties: {
          think: { type: "string", description: "\u4ED6\u600E\u4E48\u770B\u8FD9\u4EF6\u4E8B\uFF0C\u4E00\u4E24\u53E5" },
          actions: {
            type: "array",
            description: "\u4ED6\u8981\u505A\u7684\u4E8B\uFF0C\u6309\u65F6\u95F4\u5148\u540E\uFF1B\u4EC0\u4E48\u90FD\u4E0D\u505A\u5C31\u7559\u7A7A",
            items: {
              type: "object",
              properties: {
                do: { type: "string", enum: ["message", "call", "move", "pay", "commit", "end", "tell", "wait", "note"], description: "message \u53D1\u6D88\u606F\uFF0Ccall \u6253\u7535\u8BDD\uFF0Cmove \u53BB\u522B\u5904\uFF0Cpay \u6536\u94B1\u4ED8\u94B1\u6216\u6263\u94B1\uFF0Ccommit \u548C\u4EBA\u7EA6\u5B9A\u6216\u4FEE\u6539\u7EA6\u5B9A\uFF0Cend \u89E3\u9664\u7EA6\u5B9A\uFF0Ctell \u544A\u8BC9\u522B\u4EBA\uFF0Cwait \u8FC7\u4E00\u9635\u518D\u770B\uFF0Cnote \u8BB0\u4E00\u7B14\uFF08\u4F8B\u5982\u8BB0\u65F7\u5DE5\uFF09" },
                at: { type: "string", description: "\u4EC0\u4E48\u65F6\u5019\u505A\uFF0CHH:MM \u6216 2026-03-02 10:00\uFF1B\u4E0D\u65E9\u4E8E\u4ED6\u5BDF\u89C9\u7684\u65F6\u95F4" },
                to: { type: "string", description: "\u5BF9\u8C01\uFF08message\u3001call\u3001tell\u3001pay\uFF09\uFF0C\u6216\u53BB\u54EA\uFF08move\uFF09" },
                text: { type: "string", description: "\u6D88\u606F\u6216\u7535\u8BDD\u7684\u539F\u8BDD\uFF08\u7528\u4ED6\u81EA\u5DF1\u7684\u53E3\u543B\uFF09\uFF1Btell \u65F6\u5199\u544A\u8BC9\u4E86\u4EC0\u4E48\uFF1Bnote \u65F6\u5199\u8BB0\u4E0B\u7684\u4E8B" },
                amount: { type: "number", description: "pay\uFF1A\u7ED9\u5BF9\u65B9\u94B1\u5199\u6B63\u6570\uFF0C\u6263\u5BF9\u65B9\u7684\u94B1\u5199\u8D1F\u6570" },
                what: { type: "string", description: "commit\uFF1A\u7EA6\u4E86\u4EC0\u4E48\uFF1Bend\uFF1A\u89E3\u9664\u54EA\u4E2A\u7EA6\u5B9A\uFF08\u5199\u7EA6\u5B9A\u7684\u540D\u5B57\uFF09" },
                place: { type: "string", description: "commit\uFF1A\u5728\u54EA" },
                time: { type: "string", description: "commit\uFF1A\u4EC0\u4E48\u65F6\u5019\uFF0C2026-03-06 19:00" }
              },
              required: ["do"]
            }
          },
          feelings: { type: "object", properties: { ...axisProps, reason: { type: "string" } }, description: "\u8FD9\u4EF6\u4E8B\u8BA9\u4ED6\u5BF9\u4E3B\u89D2\u7684\u6001\u5EA6\u600E\u6837\u53D8\u4E86\uFF08\u6CA1\u53D8\u5C31\u4E0D\u5199\uFF09" },
          learned: { type: "array", items: { type: "string" }, description: "\u4ED6\u65B0\u77E5\u9053\u6216\u63A8\u6D4B\u51FA\u7684\u4E8B" }
        },
        required: ["actions"]
      }
    }
  };
}
function applyAct(world, city2, who, raw, after, turnEnd) {
  const args = isRecord5(raw) ? raw : {};
  const events = [];
  for (const a of list3(args.actions).filter(isRecord5)) {
    const kind = str5(a.do);
    const at = timeAt(str5(a.at), after);
    const to = str5(a.to);
    const text = str5(a.text);
    if ((kind === "message" || kind === "call") && to && text) {
      world.pending.push({ at, who, kind: "deliver", what: text, message: { to: to === "\u4E3B\u89D2" || to === world.me.name ? PROTAGONIST : to, text, call: kind === "call" } });
    } else if (kind === "move" && to) {
      const place = findPlace(world, city2, to) ?? registerPlace(world, city2, to, placeById(world, city2, world.people[who]?.at));
      world.people[who] = { ...world.people[who] ?? { kind: "related" }, at: place.id, seenAt: at };
      events.push({ at, kind: "note", seen: false, text: `${clock(at)} ${who}\u53BB\u4E86${place.name}` });
    } else if (kind === "pay") {
      const amount = num5(a.amount) ?? 0;
      if (!amount) continue;
      const c = world.commitments.find((x) => !x.ended && (x.parties.includes(who) || Object.values(x.reps ?? {}).includes(who)) && x.expectations.some((e) => e.kind === "payment"));
      if (amount < 0 && c) {
        c.record.push({ at, text: `\u6263\u6B3E ${-amount} \u5143\uFF1A${text || str5(a.what)}` });
        events.push({ at, kind: "money", seen: false, text: `${clock(at)} ${who}\u51B3\u5B9A\u6263\u4E3B\u89D2 ${-amount} \u5143\uFF08${text || c.name}\uFF09` });
      } else if (amount > 0 && (to === "\u4E3B\u89D2" || !to)) {
        pay(world, amount, `${who}\u8F6C\u6765`, at);
        events.push({ at, kind: "money", seen: true, text: `${clock(at)} \u6536\u5230${who}\u8F6C\u6765\u7684 ${amount} \u5143` });
      }
    } else if (kind === "commit" && str5(a.what)) {
      const time = str5(a.time) ? parseTime(str5(a.time)) : null;
      const place = str5(a.place) ? findPlace(world, city2, str5(a.place)) ?? registerPlace(world, city2, str5(a.place), placeById(world, city2, world.people[who]?.at)) : void 0;
      const other = to || PROTAGONIST;
      if (other !== PROTAGONIST && !world.people[other]) world.people[other] = { kind: "related", brief: `${who}\u627E\u6765\u7684\u4EBA`, seenAt: at };
      world.commitments.push({
        id: newId("c", world.seed),
        name: str5(a.what),
        parties: [who, other],
        expectations: time && place ? [other, who].map((w) => ({ kind: "presence", who: w, place: place.id, days: dateKey(time), from: clock(time), to: clock(time + 120) })) : [],
        norms: "\u7EA6\u597D\u7684\u4E8B\u6CA1\u505A\u5230\uFF0C\u5BF9\u65B9\u4F1A\u5931\u671B\u6216\u751F\u6C14\u3002",
        since: at,
        record: []
      });
      events.push({ at, kind: "note", seen: other === PROTAGONIST, text: `${clock(at)} ${who}\u548C${other === PROTAGONIST ? "\u4E3B\u89D2" : other}\u7EA6\u5B9A\uFF1A${str5(a.what)}` });
    } else if (kind === "end" && str5(a.what)) {
      const c = world.commitments.find((x) => !x.ended && x.parties.includes(PROTAGONIST) && (x.name.includes(str5(a.what)) || str5(a.what).includes(x.name)) && (x.parties.includes(who) || Object.values(x.reps ?? {}).includes(who)));
      if (c) {
        c.ended = at;
        c.record.push({ at, text: `${who}\u89E3\u9664\uFF1A${text}` });
        events.push({ at, kind: "note", seen: false, text: `${clock(at)} ${who}\u89E3\u9664\u4E86${c.name}` });
      }
    } else if (kind === "tell" && to && text) {
      learn(world, to, `${who}\u8BF4\uFF1A${text}`, "\u542C\u8BF4", at);
      if (hasMind(world, to)) world.pending.push({ at: at + 5, who: to, kind: "notice", what: `${who}\u544A\u8BC9\u4F60\uFF1A${text}` });
    } else if (kind === "wait") {
      world.pending.push({ at: Math.max(at, after + 30), who, kind: "notice", what: text || "\u518D\u770B\u770B\u4E3B\u89D2\u90A3\u8FB9\u7684\u60C5\u51B5" });
    } else if (kind === "note" && text) {
      const c = world.commitments.find((x) => !x.ended && (x.parties.includes(who) || Object.values(x.reps ?? {}).includes(who)) && x.parties.includes(PROTAGONIST));
      if (c) c.record.push({ at, text });
    }
  }
  for (const l of list3(args.learned).map(str5).filter(Boolean)) learn(world, who, l, "\u63A8\u6D4B", after);
  const delivered = deliverDue(world, turnEnd);
  events.push(...delivered);
  const feelings = isRecord5(args.feelings) ? args.feelings : void 0;
  return { events, ...feelings ? { feelings: { who, ...feelings, reason: str5(feelings.reason) || "\u5BDF\u89C9\u5230\u7684\u4E8B" } } : {} };
}
function actText(world, city2, state, who, notices, profile) {
  return [
    personText(world, city2, state, who, profile),
    "",
    `\u3010${who}\u521A\u5BDF\u89C9\u5230\u7684\u4E8B\u3011`,
    ...notices.map((n) => `- ${clock(n.at)} ${n.what}`)
  ].join("\n");
}
function dayDice(world, who, date) {
  const r = rng(hash(`${world.seed}|${who}|${date}`))();
  return r < 0.8 ? "\u5E73\u5E38\u7684\u4E00\u5929" : r < 0.97 ? "\u6709\u70B9\u4E8B\u7684\u4E00\u5929" : "\u6709\u5927\u4E8B\u7684\u4E00\u5929";
}
function dayTool() {
  return {
    type: "function",
    function: {
      name: DAY_TOOL_NAME,
      description: "\u6BCF\u65E5\u63A8\u6F14\uFF1A\u66FF\u8FD9\u4E2A\u91CD\u8981\u4EBA\u7269\u8FC7\u5B8C\u8FD9\u4E00\u5929\uFF0C\u5B89\u6392\u660E\u5929\u3002",
      parameters: {
        type: "object",
        properties: {
          day: { type: "array", items: { type: "string" }, description: "\u8FD9\u4E00\u5929\u53D1\u751F\u7684\u51E0\u4EF6\u4E8B\uFF0C\u5E73\u5E38\u7684\u4E00\u5929\u5C31\u5199\u5E73\u5E38\u7684\u4E8B" },
          recent: { type: "string", description: "\u4ED6\u6700\u8FD1\u600E\u4E48\u6837\uFF0C\u4E00\u53E5\u8BDD" },
          mood: { type: "number", description: "\u5FC3\u60C5\u7684\u53D8\u5316\uFF08-30\uFF5E30\uFF09" },
          stress: { type: "number", description: "\u538B\u529B\u7684\u53D8\u5316\uFF08-30\uFF5E30\uFF09" },
          learned: { type: "array", items: { type: "string" }, description: "\u65B0\u77E5\u9053\u6216\u63A8\u6D4B\u51FA\u7684\u4E8B" },
          memory: { type: "string", description: "\u628A\u4ED6\u8BB0\u5F97\u7684\u91CD\u8981\u65E7\u4E8B\u5F52\u6210\u4E00\u6BB5\u8BDD\uFF08\u53EF\u9009\uFF0C\u66FF\u6362\u539F\u6765\u7684\u957F\u671F\u8BB0\u5FC6\uFF09" },
          others: {
            type: "array",
            description: "\u8FD9\u4E00\u5929\u91CC\u548C\u5176\u4ED6\u91CD\u8981\u4EBA\u7269\u4E4B\u95F4\u53D1\u751F\u7684\u4E8B\u8BA9\u6001\u5EA6\u53D8\u4E86\u624D\u5199",
            items: { type: "object", properties: { to: { type: "string" }, ...axisProps, reason: { type: "string" } }, required: ["to", "reason"] }
          },
          tomorrow: {
            type: "object",
            properties: {
              routine: {
                type: "array",
                description: "\u660E\u5929\u548C\u5E73\u65F6\u4E0D\u4E00\u6837\u7684\u5B89\u6392\uFF08\u6CA1\u6709\u5C31\u4E0D\u5199\uFF09",
                items: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, place: { type: "string" }, doing: { type: "string" } }, required: ["from", "to", "place", "doing"] }
              },
              commitments: {
                type: "array",
                description: "\u7EA6\u4E86\u8C01\u505A\u4EC0\u4E48",
                items: { type: "object", properties: { with: { type: "string" }, what: { type: "string" }, time: { type: "string" }, place: { type: "string" } }, required: ["with", "what"] }
              }
            }
          },
          contact: {
            type: "object",
            description: "\u8981\u4E0D\u8981\u8054\u7CFB\u4E3B\u89D2\uFF1A\u4ED6\u81EA\u5DF1\u60F3\u8054\u7CFB\u624D\u5199\uFF0C\u4E0D\u60F3\u5C31\u4E0D\u5199",
            properties: {
              at: { type: "string", description: "\u4EC0\u4E48\u65F6\u5019\uFF0C2026-03-03 12:30" },
              how: { type: "string", enum: ["\u6D88\u606F", "\u7535\u8BDD"] },
              text: { type: "string", description: "\u4ED6\u8BF4\u7684\u539F\u8BDD" },
              why: { type: "string" }
            },
            required: ["at", "how", "text"]
          }
        },
        required: ["day", "recent"]
      }
    }
  };
}
function dayText(world, city2, state, who, profile, date, events) {
  const p = world.people[who];
  const since = p?.lastContact ? `\u8DDD\u4E0A\u6B21\u548C\u4E3B\u89D2\u8054\u7CFB ${Math.max(0, Math.round((world.now - p.lastContact) / 1440))} \u5929` : "\u8FD8\u6CA1\u548C\u4E3B\u89D2\u8054\u7CFB\u8FC7";
  const unanswered = world.phone.messages.filter((m) => m.from === who && m.to === PROTAGONIST).slice(-1)[0];
  const replied = unanswered && world.phone.messages.some((m) => m.from === PROTAGONIST && m.to === who && m.at > unanswered.at);
  return [
    personText(world, city2, state, who, profile, true),
    "",
    `\u3010${date} \u8FD9\u4E00\u5929\u3011${dayDice(world, who, date)}\u3002${since}${unanswered && !replied ? `\uFF1B\u4ED6\u4E0A\u4E00\u6761\u53D1\u7ED9\u4E3B\u89D2\u7684\u6D88\u606F\u4E3B\u89D2\u8FD8\u6CA1\u56DE` : ""}\u3002`,
    p?.routine?.length ? `\u4ED6\u5E73\u65F6\u7684\u5B89\u6392\uFF1A${p.routine.map((s) => `${s.days} ${s.from}\u2013${s.to} ${placeById(world, city2, s.place)?.name ?? s.place}\uFF08${s.doing}\uFF09`).join("\uFF1B")}` : "",
    events.length ? `\u8FD9\u4E00\u5929\u4ED6\u5BDF\u89C9\u5230\u7684\u4E8B\uFF1A
${events.map((e) => `- ${e}`).join("\n")}` : ""
  ].filter(Boolean).join("\n");
}
function applyDay(world, city2, who, raw, dayEnd) {
  const args = isRecord5(raw) ? raw : {};
  const p = world.people[who];
  if (!p) return [];
  const out = [];
  p.mood = clamp2(Math.round((p.mood ?? 50) + (50 - (p.mood ?? 50)) * 0.5 + (num5(args.mood) ?? 0)), 0, 100);
  p.stress = clamp2(Math.round((p.stress ?? 30) + (num5(args.stress) ?? 0)), 0, 100);
  if (str5(args.recent)) p.recent = str5(args.recent);
  for (const d of list3(args.day).map(str5).filter(Boolean)) learn(world, who, `\uFF08\u81EA\u5DF1\u7684\u4E8B\uFF09${d}`, "\u4EB2\u773C", dayEnd);
  for (const l of list3(args.learned).map(str5).filter(Boolean)) learn(world, who, l, "\u63A8\u6D4B", dayEnd);
  if (str5(args.memory)) world.memory[who] = str5(args.memory);
  for (const o of list3(args.others).filter(isRecord5)) {
    const to = str5(o.to);
    if (!to || world.people[to]?.kind !== "important") continue;
    changePair(world, who, to, o, str5(o.reason), dayEnd);
  }
  const tomorrow = isRecord5(args.tomorrow) ? args.tomorrow : {};
  const date = dateKey(dayEnd + 60);
  for (const r of list3(tomorrow.routine).filter(isRecord5)) {
    const place = findPlace(world, city2, str5(r.place)) ?? registerPlace(world, city2, str5(r.place), placeById(world, city2, p.home));
    (p.routine ??= []).unshift({ days: date, from: str5(r.from), to: str5(r.to), place: place.id, doing: str5(r.doing) });
  }
  if (p.routine) p.routine = p.routine.filter((s) => !/^\d{4}-/.test(s.days) || s.days >= dateKey(world.now)).slice(0, 16);
  for (const c of list3(tomorrow.commitments).filter(isRecord5)) {
    const time = str5(c.time) ? parseTime(str5(c.time)) : null;
    const place = str5(c.place) ? findPlace(world, city2, str5(c.place)) ?? registerPlace(world, city2, str5(c.place), placeById(world, city2, p.at)) : void 0;
    const other = str5(c.with) === "\u4E3B\u89D2" || str5(c.with) === world.me.name ? PROTAGONIST : str5(c.with);
    if (!other) continue;
    world.commitments.push({
      id: newId("c", world.seed),
      name: str5(c.what),
      parties: [who, other],
      expectations: time && place ? [who, other].map((w) => ({ kind: "presence", who: w, place: place.id, days: dateKey(time), from: clock(time), to: clock(time + 120) })) : [],
      norms: "\u7EA6\u597D\u7684\u4E8B\u6CA1\u505A\u5230\uFF0C\u5BF9\u65B9\u4F1A\u5931\u671B\u3002",
      since: dayEnd,
      record: []
    });
    if (other !== PROTAGONIST && hasMind(world, other)) world.pending.push({ at: dayEnd, who: other, kind: "notice", what: `${who}\u7EA6\u4F60\uFF1A${str5(c.what)}${time ? `\uFF08${dateKey(time)} ${clock(time)}\uFF09` : ""}` });
  }
  const contact = isRecord5(args.contact) ? args.contact : null;
  if (contact && str5(contact.text)) {
    const at = timeAt(str5(contact.at), dayEnd);
    world.pending.push({ at, who, kind: "deliver", what: str5(contact.text), message: { to: PROTAGONIST, text: str5(contact.text), call: str5(contact.how) === "\u7535\u8BDD" } });
    out.push(`${who}\u6253\u7B97\u5728 ${dateKey(at).slice(5)} ${clock(at)} ${str5(contact.how) === "\u7535\u8BDD" ? "\u6253\u7535\u8BDD\u7ED9" : "\u53D1\u6D88\u606F\u7ED9"}\u4E3B\u89D2`);
  }
  return out;
}
function changePair(world, from, to, changes, reason, at) {
  let pair2 = world.pairs.find((x) => x.from === from && x.to === to);
  if (!pair2) {
    pair2 = { from, to, axes: Object.fromEntries(AXES.map(([a]) => [a, 0])), familiarity: 10, reasons: [] };
    world.pairs.push(pair2);
  }
  for (const [axis] of AXES) {
    const d = num5(changes[axis]);
    if (d) pair2.axes[axis] = clamp2(Math.round((pair2.axes[axis] ?? 0) + clamp2(d, -30, 30)), 0, 100);
  }
  const f = num5(changes.familiarity);
  if (f) pair2.familiarity = clamp2(Math.round(pair2.familiarity + f), 0, 100);
  pair2.reasons.push({ at, text: reason });
  if (pair2.reasons.length > 5) pair2.reasons.splice(0, pair2.reasons.length - 5);
}
function profileTool() {
  const slot = { type: "object", properties: { days: { type: "string", description: "\u5DE5\u4F5C\u65E5\u3001\u5468\u672B\u3001\u6BCF\u5929\u3001\u661F\u671F\u516D\u2026" }, from: { type: "string" }, to: { type: "string" }, place: { type: "string", description: "\u5730\u56FE\u4E0A\u7684\u5730\u70B9\u540D\uFF0C\u6216\u65B0\u5730\u70B9\u7684\u540D\u5B57" }, doing: { type: "string" } }, required: ["days", "from", "to", "place", "doing"] };
  return {
    type: "function",
    function: {
      name: PROFILE_TOOL_NAME,
      description: "\u4EBA\u7269\u6863\u6848\uFF1A\u6309\u6A21\u677F\u5199\u51FA\u8FD9\u4E2A\u4EBA\u7684\u5B8C\u6574\u6863\u6848\uFF0C\u4EE5\u53CA\u4ED6\u5728\u6F9C\u6C5F\u5E02\u7684\u751F\u6D3B\u3002",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "\u4ED6\u7684\u540D\u5B57\uFF08\u5267\u60C5\u91CC\u8FD8\u4E0D\u77E5\u9053\u540D\u5B57\u65F6\uFF0C\u7ED9\u4ED6\u8D77\u4E00\u4E2A\u5408\u9002\u7684\uFF09" },
          profile: { type: "string", description: "\u6309\u6A21\u677F\u7684\u5B8C\u6574\u6863\u6848\uFF0C2000\uFF5E3000 \u5B57" },
          summary: { type: "string", description: "\u6458\u8981\uFF0C150\uFF5E250 \u5B57" },
          gender: { type: "string", enum: ["\u7537", "\u5973"] },
          age: { type: "number" },
          role: { type: "string", description: "\u4E00\u4E2A\u8BCD\uFF1A\u4ED6\u662F\u8C01\uFF08\u5496\u5561\u5E08\u3001\u90BB\u5C45\u3001\u540C\u4E8B\u2026\uFF09" },
          attributes: { type: "object", description: "\u5C5E\u6027\uFF08\u6309\u53C2\u7167\u8868\uFF0C\u666E\u901A\u6210\u5E74\u7537\u6027 100\uFF09\uFF0C\u5DF2\u6709\u7684\u4E0D\u7528\u5199" },
          traits: { type: "object", properties: { \u654F\u611F: { type: "number" }, \u8BB0\u4EC7: { type: "number" }, \u591A\u7591: { type: "number" } } },
          home: { type: "string", description: "\u4F4F\u5728\u54EA\uFF1A\u5730\u56FE\u4E0A\u7684\u5730\u70B9\u540D\uFF0C\u6216\u65B0\u5730\u70B9\u7684\u540D\u5B57" },
          work: { type: "string", description: "\u5728\u54EA\u5DE5\u4F5C\u6216\u4E0A\u5B66\uFF08\u6CA1\u6709\u5C31\u4E0D\u5199\uFF09" },
          routine: { type: "array", items: slot, description: "\u6BCF\u5468\u7684\u4F5C\u606F\uFF0C\u56DB\u5230\u516B\u6BB5" },
          economy: { type: "string", enum: ["\u62EE\u636E", "\u7D27\u5F20", "\u666E\u901A", "\u5BBD\u88D5", "\u5BCC\u6709"] },
          income: { type: "number", description: "\u6BCF\u6708\u6536\u5165\uFF0C\u5143" },
          knows: { type: "array", items: { type: "string" }, description: "\u4ED6\u5DF2\u7ECF\u77E5\u9053\u7684\u3001\u548C\u4E3B\u89D2\u6709\u5173\u7684\u4E8B\uFF08\u4ECE\u5267\u60C5\u91CC\u4ED6\u5728\u573A\u7684\u90E8\u5206\u6574\u7406\uFF09" },
          others: {
            type: "array",
            description: "\u4ED6\u548C\u5176\u4ED6\u91CD\u8981\u4EBA\u7269\u7684\u5173\u7CFB\uFF08\u8BA4\u8BC6\u7684\u624D\u5199\uFF09",
            items: { type: "object", properties: { to: { type: "string" }, ...axisProps, reason: { type: "string" } }, required: ["to", "reason"] }
          }
        },
        required: ["name", "profile", "summary", "routine"]
      }
    }
  };
}
function applyProfile(world, city2, raw, fallbackName, keepProfile) {
  const args = isRecord5(raw) ? raw : parseJson(String(raw ?? ""));
  if (!args) return null;
  const name = str5(args.name) || fallbackName;
  if (!name) return null;
  const before = world.people[fallbackName] ?? world.people[name];
  const near = placeById(world, city2, before?.at ?? world.at);
  const place = (text) => text ? findPlace(world, city2, text) ?? registerPlace(world, city2, text, near) : void 0;
  const homeFound = place(str5(args.home));
  const home = homeFound && homeFound.kind !== "residence" ? registerPlace(world, city2, `${homeFound.name}\u4E00\u5E26\u7684\u4F4F\u5904`, homeFound) : homeFound;
  const work = place(str5(args.work));
  const routine = list3(args.routine).filter(isRecord5).map((s) => ({ days: str5(s.days) || "\u6BCF\u5929", from: str5(s.from), to: str5(s.to), place: place(str5(s.place))?.id ?? home?.id ?? "", doing: str5(s.doing) })).filter((s) => s.from && s.to && s.place);
  const person = {
    ...before ?? {},
    kind: "important",
    role: str5(args.role) || before?.role,
    brief: str5(args.summary) || before?.brief,
    ...home ? { home: home.id } : {},
    ...work ? { work: work.id } : {},
    routine,
    economy: str5(args.economy) || "\u666E\u901A",
    ...num5(args.income) ? { income: num5(args.income) } : {},
    mood: before?.mood ?? 55,
    stress: before?.stress ?? 30
  };
  if (fallbackName && fallbackName !== name) delete world.people[fallbackName];
  world.people[name] = person;
  for (const k of list3(args.knows).map(str5).filter(Boolean)) learn(world, name, k, "\u4EB2\u773C");
  for (const o of list3(args.others).filter(isRecord5)) {
    const to = str5(o.to);
    if (to && world.people[to]?.kind === "important" && to !== name) changePair(world, name, to, o, str5(o.reason) || "\u8BA4\u8BC6", world.now);
  }
  const attributes = isRecord5(args.attributes) ? Object.fromEntries(Object.entries(args.attributes).map(([k, v]) => [k, num5(v)]).filter(([, v]) => v !== void 0)) : {};
  const traits = isRecord5(args.traits) ? Object.fromEntries(Object.entries(args.traits).map(([k, v]) => [k, num5(v)]).filter(([, v]) => v !== void 0)) : {};
  return {
    name,
    profile: { profile: keepProfile?.trim() || str5(args.profile), summary: str5(args.summary), since: world.now },
    attributes,
    traits,
    description: [str5(args.role), str5(args.gender), num5(args.age) ? `${num5(args.age)} \u5C81` : ""].filter(Boolean).join("\uFF0C")
  };
}

// src/plugins/tabletop/shape.ts
var OURS = [CHECK_TOOL_NAME, SETTLE_TOOL_NAME, ...WORLD_TOOLS];
var messagesOf = (body) => Array.isArray(body.messages) ? body.messages : [];
var toolsOf = (body) => Array.isArray(body.tools) ? body.tools : [];
function lastCall(body) {
  const messages = messagesOf(body);
  for (let i = messages.length - 1; i >= 0; i--) {
    const calls = messages[i].tool_calls;
    if (messages[i].role === "assistant" && Array.isArray(calls) && calls.length) return { message: messages[i], call: calls[calls.length - 1] };
  }
  return null;
}
function isToolConversation(body) {
  return messagesOf(body).at(-1)?.role === "tool" && lastCall(body) !== null;
}
function extras(message, call) {
  const fromMessage = "thoughtSignature" in message ? { thoughtSignature: message.thoughtSignature } : {};
  const fromCall = Object.fromEntries(Object.entries(call).filter(([k]) => !["id", "type", "function", "index"].includes(k)));
  return { message: fromMessage, call: fromCall };
}
function argsLike(call, label) {
  try {
    const args = JSON.parse(call.function?.arguments ?? "{}");
    const key = "query" in args ? "query" : Object.keys(args).find((k) => typeof args[k] === "string");
    return JSON.stringify(key ? { [key]: label } : {});
  } catch {
    return "{}";
  }
}
function appendStep(body, step, label) {
  const messages = [...messagesOf(body)];
  const prev = lastCall(body);
  if (isToolConversation(body) && prev) {
    const result = messages[messages.length - 1];
    const name = String(result.name ?? prev.call.function?.name ?? "context");
    const x = extras(prev.message, prev.call);
    const id = `call_hearth_${label}`;
    if (step.lead?.trim()) messages.push({ role: "assistant", content: step.lead.trim(), ...x.message });
    messages.push({ role: "assistant", ...x.message, tool_calls: [{ id, type: "function", function: { name, arguments: argsLike(prev.call, `hearth_${label}`) }, ...x.call }] });
    messages.push({ role: "tool", tool_call_id: id, name, content: step.content });
  } else {
    messages.push({ role: step.role ?? "system", content: step.content });
  }
  return { ...body, messages };
}
function replyTool(body) {
  const choice = body.tool_choice;
  if (choice && typeof choice === "object" && choice.function?.name) return choice.function.name;
  if (choice !== "required") return null;
  const allowed = body.toolConfig?.functionCallingConfig?.allowedFunctionNames;
  if (Array.isArray(allowed) && allowed.length === 1 && typeof allowed[0] === "string") return allowed[0];
  const names = toolsOf(body).map((t) => t.function?.name).filter((n) => Boolean(n) && !OURS.includes(n));
  return names.length === 1 ? names[0] : null;
}
function appendReply(body, text) {
  const messages = [...messagesOf(body)];
  const tool = replyTool(body);
  const prev = lastCall(body);
  if (tool && prev && isToolConversation(body)) {
    const params = toolsOf(body).find((t) => t.function?.name === tool)?.function?.parameters;
    const keys = [...params?.required ?? [], ...Object.keys(params?.properties ?? {})].filter((k) => !/think/i.test(k));
    const field = keys.includes("game_content") ? "game_content" : keys[0] ?? "content";
    const x = extras(prev.message, prev.call);
    const id = "call_hearth_reply";
    messages.push({ role: "assistant", ...x.message, tool_calls: [{ id, type: "function", function: { name: tool, arguments: JSON.stringify({ [field]: text }) }, ...x.call }] });
    messages.push({ role: "tool", tool_call_id: id, name: tool, content: JSON.stringify({ ok: true }) });
  } else {
    messages.push({ role: "assistant", content: text });
  }
  return { ...body, messages };
}
function replyForHistory(text) {
  return text.replace(/<(think_nya|report_nya|think|thinking)~?>[\s\S]*?<\/\1~?>/gi, "").replace(/<!--\s*<\/think>\s*-->/g, "").trim();
}
function withOurTools(body, world) {
  const ours = [checkTool(world), settleTool(world), ...world ? [sceneTool(), setupTool(), actTool(), dayTool(), profileTool()] : []];
  return [...toolsOf(body).filter((t) => !OURS.includes(t.function?.name ?? "")), ...ours];
}
function forceTool(body, name, world = false) {
  return {
    ...body,
    tools: withOurTools(body, world),
    tool_choice: { type: "function", function: { name } },
    toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [name] } }
  };
}
function replyTools(body, world = false) {
  const tool = replyTool(body);
  if (!tool || !isToolConversation(body)) return body;
  return {
    ...body,
    tools: withOurTools(body, world),
    tool_choice: { type: "function", function: { name: tool } },
    toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [tool] } }
  };
}

// src/plugins/tabletop/world/apply.ts
var DEFAULT_START = "2026-03-02 07:30";
var str6 = (v) => typeof v === "string" ? v.trim() : "";
var num6 = (v) => typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : void 0;
var isRecord6 = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
var clamp3 = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
function resolvePlace(world, city2, name, near, district, about) {
  const known = name ? findPlace(world, city2, name) : void 0;
  if (known) return known;
  const anchor = near && findPlace(world, city2, near) || (district ? city2.places.filter((p) => p.landmark && p.district === district)[0] : void 0) || city2.places[0];
  return registerPlace(world, city2, name || "\u4F4F\u5904", anchor, about);
}
function setupChoices(city2, form) {
  const district = city2.districts.find((d) => d.id === form.district || d.name === form.district);
  const inDistrict = (p) => !district || p.district === district.id;
  const homes = city2.places.filter((p) => p.kind === "residence" && inDistrict(p)).slice(0, 14).map((p) => `${p.name}\uFF08${p.about}\uFF09`);
  const workKinds = form.job === "\u5B66\u751F" ? ["school"] : ["office", "industry", "shop", "food", "cafe", "hospital", "hotel", "mall"];
  const works = city2.places.filter((p) => workKinds.includes(p.kind) && (p.landmark || inDistrict(p))).slice(0, 18).map((p) => `${p.name}\uFF08${city2.districts.find((d) => d.id === p.district)?.name}\uFF0C${p.about}\uFF09`);
  return [
    `\u4F4F\u5904\u53EF\u4EE5\u9009\uFF1A${homes.join("\uFF1B")}\u3002\u4E5F\u53EF\u4EE5\u5199\u65B0\u7684\u5C0F\u533A\u540D\uFF0C\u5E76\u5728 near \u5199\u9644\u8FD1\u7684\u5DF2\u77E5\u5730\u70B9\u3002`,
    `\u5DE5\u4F5C\u6216\u4E0A\u5B66\u7684\u5730\u65B9\u53EF\u4EE5\u9009\uFF1A${works.join("\uFF1B")}\u3002\u4E5F\u53EF\u4EE5\u5199\u65B0\u7684\u5355\u4F4D\u540D\uFF0C\u5E76\u5728 near \u5199\u9644\u8FD1\u7684\u5DF2\u77E5\u5730\u70B9\u3002`,
    `\u5404\u533A\uFF1A${city2.districts.map((d) => `${d.name}\uFF08${d.about}\uFF09`).join("\uFF1B")}`
  ].join("\n");
}
function applySetup(raw, form, city2, seed) {
  const args = isRecord6(raw) ? raw : {};
  const start = parseTime(form.start || DEFAULT_START) ?? parseTime(DEFAULT_START);
  const district = city2.districts.find((d) => d.id === form.district || d.name === form.district)?.id;
  const living = ["\u8282\u4FED", "\u666E\u901A", "\u5BBD\u88D5"].includes(str6(args.living)) ? str6(args.living) : "\u666E\u901A";
  const world = {
    version: 1,
    seed,
    start,
    now: start,
    at: "",
    body: { full: 70, energy: 95, health: 100, awakeSince: start - 30 },
    balance: 0,
    ledger: [],
    me: { name: form.name || PROTAGONIST, job: { kind: form.job, title: form.jobText || form.job }, home: "", living, ...modeOf(str6(args.habit)) ? { habit: modeOf(str6(args.habit)) } : {} },
    commitments: [],
    people: {},
    places: [],
    weather: [],
    scene: null,
    staff: {},
    phone: { contacts: [], messages: [] },
    events: [],
    noted: [],
    pending: [],
    knowledge: {},
    memory: {},
    pairs: []
  };
  world.weather = forecast(world);
  const lines = [];
  const homeArgs = isRecord6(args.home) ? args.home : {};
  const home = resolvePlace(world, city2, str6(homeArgs.place), str6(homeArgs.near), district, "\u4E3B\u89D2\u4F4F\u7684\u5730\u65B9");
  world.me.home = home.id;
  world.at = home.id;
  lines.push(`\u4F4F\u5728${city2.districts.find((d) => d.id === home.district)?.name ?? ""} ${home.name}`);
  const state = { custom: {}, characters: {}, relations: [], bonds: [], turn: 0, log: [] };
  const me = newCharacter();
  const attrs = isRecord6(args.attributes) ? args.attributes : {};
  for (const a of CORE_ATTRIBUTES) me.attributes[a] = clamp3(Math.round(num6(attrs[a]) ?? 100), 20, 400);
  const skills = isRecord6(args.skills) ? args.skills : {};
  for (const [k, v] of Object.entries(skills)) if (str6(v)) me.skills[k] = str6(v);
  me.description = form.about || "";
  state.characters[PROTAGONIST] = me;
  const people = Array.isArray(args.people) ? args.people.filter(isRecord6) : [];
  for (const p of people) {
    const name = str6(p.name);
    if (!name || name === PROTAGONIST || state.characters[name]) continue;
    const c = newCharacter();
    const pa = isRecord6(p.attributes) ? p.attributes : {};
    for (const a of CORE_ATTRIBUTES) c.attributes[a] = clamp3(Math.round(num6(pa[a]) ?? 100), 20, 400);
    const traits = isRecord6(p.traits) ? p.traits : {};
    for (const t of ["\u654F\u611F", "\u8BB0\u4EC7", "\u591A\u7591"]) if (num6(traits[t]) !== void 0) c.traits[t] = clamp3(num6(traits[t]), 0.5, 2);
    c.description = `${str6(p.role)}\uFF0C${str6(p.gender)}\uFF0C${num6(p.age) ?? ""} \u5C81\u3002${str6(p.about)}`;
    state.characters[name] = c;
    const att = isRecord6(p.attitude) ? p.attitude : {};
    const base = emptyAxes();
    for (const k of Object.keys(base)) base[k] = clamp3(num6(att[k]) ?? (k === "trust" || k === "affection" ? 40 : 0), 0, 100);
    state.relations.push({ from: name, to: PROTAGONIST, base, mood: emptyAxes(), familiarity: clamp3(num6(att.familiarity) ?? 50, 0, 100), reasons: [{ turn: 0, text: "\u5F00\u5C40\u65F6\u7684\u5173\u7CFB", change: "" }] });
    const lives = str6(p.lives);
    const livesHere = lives && !/^[^·]*?(省|市)$/.test(lives) ? findPlace(world, city2, lives) : void 0;
    const person = { kind: "related", role: str6(p.role), brief: str6(p.about), ...livesHere ? { home: livesHere.id } : {} };
    world.people[name] = person;
    world.phone.contacts.push(name);
  }
  const byRole = (re) => Object.entries(world.people).filter(([, p]) => re.test(p.role ?? "")).map(([n]) => n);
  const job = isRecord6(args.job) ? args.job : {};
  if (form.job !== "\u65E0\u4E1A" && str6(job.employer || job.place)) {
    const named = findPlace(world, city2, str6(job.place) || str6(job.employer));
    const fits = named && (named.name === str6(job.employer) || ["office", "industry", "school", "hospital", "government", "police"].includes(named.kind));
    const place = fits ? named : str6(job.employer) ? registerPlace(world, city2, str6(job.employer), named ?? (str6(job.near) ? findPlace(world, city2, str6(job.near)) : void 0) ?? city2.places.find((p) => p.landmark && p.district === district), str6(job.title)) : resolvePlace(world, city2, str6(job.place), str6(job.near), district, "");
    world.me.job.place = place.id;
    world.me.job.title = str6(job.title) || world.me.job.title;
    const employer = str6(job.employer) || place.name;
    const days = str6(job.days) || "\u5DE5\u4F5C\u65E5";
    const from = /\d{1,2}:\d{2}/.test(str6(job.from)) ? str6(job.from) : form.job === "\u5B66\u751F" ? "08:00" : "09:00";
    const to = /\d{1,2}:\d{2}/.test(str6(job.to)) ? str6(job.to) : form.job === "\u5B66\u751F" ? "16:30" : "18:00";
    const income = Math.max(0, Math.round(num6(job.income) ?? 0));
    const payday = clamp3(Math.round(num6(job.payday) ?? 10), 1, 28);
    const boss = byRole(/上司|经理|主管|老板|辅导员|班主任|导师/)[0];
    const family = byRole(/妈|爸|父|母|家/)[0];
    for (const n of byRole(/上司|经理|主管|老板|同事|辅导员|同学|老师/)) world.people[n] = { ...world.people[n], work: place.id, shift: `${days} ${from}\u2013${to}` };
    const commitment = {
      id: newId("c", seed),
      name: form.job === "\u5B66\u751F" ? "\u5B66\u7C4D" : form.job === "\u81EA\u7531\u804C\u4E1A" ? "\u5408\u4F5C\u7EA6\u5B9A" : "\u52B3\u52A8\u5408\u540C",
      parties: [PROTAGONIST, employer],
      ...boss ? { reps: { [employer]: boss } } : {},
      expectations: form.job === "\u81EA\u7531\u804C\u4E1A" ? [] : [{ kind: "presence", who: PROTAGONIST, place: place.id, days, from, to }],
      norms: str6(job.norms) || (form.job === "\u5B66\u751F" ? "\u7F3A\u8BFE\u4F1A\u88AB\u8F85\u5BFC\u5458\u627E\uFF0C\u7F3A\u5F97\u591A\u4E86\u8981\u5904\u5206\u3002" : "\u8FDF\u5230\u548C\u7F3A\u52E4\u6309\u516C\u53F8\u5236\u5EA6\u5904\u7406\uFF0C\u5177\u4F53\u770B\u4E0A\u53F8\u7684\u6001\u5EA6\u3002"),
      since: start,
      record: []
    };
    if (income && form.job === "\u5B66\u751F" && family) {
      commitment.expectations.push({ kind: "payment", who: family, to: PROTAGONIST, amount: income, day: payday });
      commitment.parties.push(family);
    } else if (income && form.job !== "\u5B66\u751F") {
      commitment.expectations.push({ kind: "payment", who: employer, to: PROTAGONIST, amount: income, day: payday });
    }
    if (commitment.expectations.length) world.commitments.push(commitment);
    lines.push(`${employer} \xB7 ${world.me.job.title}${form.job === "\u81EA\u7531\u804C\u4E1A" ? "" : `\uFF08${days} ${from}\u2013${to}\uFF09`}${income ? `\uFF0C\u6BCF\u6708 ${income} \u5143` : ""}`);
  }
  const rent = Math.max(0, Math.round(num6(homeArgs.rent) ?? 0));
  const landlord = byRole(/房东/)[0];
  if (rent && landlord) {
    world.commitments.push({
      id: newId("c", seed),
      name: "\u79DF\u623F\u5408\u540C",
      parties: [PROTAGONIST, landlord],
      expectations: [{ kind: "payment", who: PROTAGONIST, to: landlord, amount: rent, day: clamp3(Math.round(num6(homeArgs.rent_day) ?? 1), 1, 28) }],
      norms: str6(homeArgs.norms) || "\u623F\u79DF\u665A\u4EA4\u51E0\u5929\u4E00\u822C\u4F1A\u50AC\uFF0C\u62D6\u4E45\u4E86\u4F1A\u8981\u6C42\u642C\u8D70\u3002",
      since: start,
      record: []
    });
    lines.push(`\u623F\u79DF\u6BCF\u6708 ${rent} \u5143`);
  }
  world.balance = Math.max(0, Math.round(num6(args.balance) ?? 3e3));
  world.ledger.push({ at: start, amount: world.balance, reason: "\u5F00\u5C40\u65F6\u7684\u79EF\u84C4", balance: world.balance });
  lines.push(`\u4F59\u989D ${world.balance} \u5143\uFF0C\u751F\u6D3B${living}`);
  return { world, state, lines };
}
function applyScene(world, args) {
  if (!world.scene) return;
  if (args.crowd) world.scene.crowd = args.crowd;
  for (const p of world.scene.people) {
    const d = args.people.find((x) => x.id === p.id);
    if (!d) continue;
    p.looks = d.looks;
    if (d.doing) p.doing = d.doing;
    if (d.where) p.where = d.where;
    if (p.role === "staff") {
      const kept = world.staff[world.scene.place]?.find((s) => s.id === p.id);
      if (kept) Object.assign(kept, { looks: p.looks });
    }
  }
}
function syncBody(state, world) {
  const me = state.characters[PROTAGONIST];
  if (!me) return;
  me.status = me.status.filter((s) => !BODY_STATUS_NAMES.includes(s.name));
  for (const s of bodyStatuses(world.body)) {
    me.status.push({ name: s.name, effects: Object.fromEntries(CORE_ATTRIBUTES.map((a) => [a, s.factor])), note: "\u8EAB\u4F53" });
  }
}
var line = (text, ok = true) => ({ line: text, ok, text, kind: "world" });
function applySettleWorld(world, state, city2, sw, turnStart = world.now) {
  const out = [];
  const said = Math.min(world.now, turnStart + 5);
  if (sw.extraMinutes > 0) {
    extendTurn(world, city2, sw.extraMinutes);
    out.push(line(`\u65F6\u95F4\u591A\u8FC7\u4E86 ${Math.round(sw.extraMinutes)} \u5206\u949F\uFF0C\u73B0\u5728 ${clock(world.now)}`));
  }
  if (sw.ate) world.body = { ...world.body, full: Math.min(100, world.body.full + (sw.ate === "\u6B63\u9910" ? 55 : 20)) };
  for (const m of sw.money) {
    const ok = pay(world, m.amount, m.reason);
    out.push(line(ok ? `${m.amount > 0 ? "+" : ""}${m.amount} \u5143\uFF08${m.reason}\uFF09` : `\u94B1\u4E0D\u591F\uFF1A${m.reason}\uFF08${m.amount} \u5143\uFF09`, ok));
  }
  for (const m of sw.moves) {
    const place = findPlace(world, city2, m.to) ?? registerPlace(world, city2, m.to, placeById(world, city2, world.at));
    world.people[m.who] = { ...world.people[m.who] ?? { kind: "bystander" }, at: place.id, seenAt: world.now };
    if (world.scene && place.id !== world.scene.place) world.scene.people = world.scene.people.filter((p) => p.name !== m.who);
  }
  for (const c of sw.commitments) {
    const at = c.at ? parseTime(c.at) : null;
    const place = c.place ? findPlace(world, city2, c.place) ?? registerPlace(world, city2, c.place, placeById(world, city2, world.at)) : void 0;
    const end = at ? at + 120 : null;
    const hhmm = (t) => clock(t);
    const commitment = {
      id: newId("c", world.seed),
      name: c.what,
      parties: [PROTAGONIST, c.with],
      expectations: at && place ? [
        { kind: "presence", who: PROTAGONIST, place: place.id, days: dateKey(at), from: hhmm(at), to: hhmm(end) },
        { kind: "presence", who: c.with, place: place.id, days: dateKey(at), from: hhmm(at), to: hhmm(end) }
      ] : [],
      norms: "\u7EA6\u597D\u7684\u4E8B\u6CA1\u505A\u5230\uFF0C\u5BF9\u65B9\u4F1A\u5931\u671B\u6216\u751F\u6C14\uFF0C\u770B\u4E24\u4EBA\u7684\u5173\u7CFB\u548C\u5BF9\u65B9\u7684\u6027\u683C\u3002",
      since: world.now,
      record: []
    };
    world.commitments.push(commitment);
    out.push(line(`\u65B0\u7EA6\u5B9A\uFF1A${c.what}\uFF08\u548C${c.with}${at ? `\uFF0C${dateKey(at)} ${hhmm(at)}` : ""}${place ? `\uFF0C${place.name}` : ""}\uFF09`));
  }
  for (const name of sw.done) {
    const c = world.commitments.find((x) => !x.ended && (x.name === name || x.name.includes(name) || name.includes(x.name)));
    if (!c) continue;
    c.record.push({ at: world.now, text: "\u5B8C\u6210" });
    if (!c.expectations.some((e) => e.kind === "presence" && !/^\d{4}-/.test(e.days)) && !c.expectations.some((e) => e.kind === "payment")) c.ended = world.now;
    out.push(line(`\u7EA6\u5B9A\u5B8C\u6210\uFF1A${c.name}`));
  }
  for (const m of sw.messages) {
    addMessage(world, { at: said, from: PROTAGONIST, to: m.to, text: m.text, read: true });
    if (world.people[m.to]) {
      world.people[m.to].lastContact = said;
      world.pending.push({ at: said + 5 + hash(`${m.to}|${said}`) % 40, who: m.to, kind: "notice", what: `\u4E3B\u89D2\u53D1\u6765\u6D88\u606F\uFF1A\u300C${m.text}\u300D` });
      learn(world, m.to, `\u4E3B\u89D2\u53D1\u6D88\u606F\u8BF4\uFF1A${m.text}`, "\u542C\u8BF4", said);
    }
  }
  if (sw.read) {
    for (const m of world.phone.messages) if (m.to === PROTAGONIST) m.read = true;
  }
  for (const w of sw.witnessed) for (const who of w.who) if (world.people[who]) {
    learn(world, who, w.what, "\u4EB2\u773C");
    world.people[who].lastContact = world.now;
  }
  for (const t of sw.told) if (world.people[t.to]) learn(world, t.to, `\u4E3B\u89D2\u8BF4\uFF1A${t.what}`, "\u542C\u8BF4");
  for (const n of sw.contacts) if (!world.phone.contacts.includes(n)) {
    world.phone.contacts.push(n);
    out.push(line(`\u5B58\u4E86${n}\u7684\u8054\u7CFB\u65B9\u5F0F`));
  }
  for (const m of sw.met) meet(world, state, m);
  for (const p of sw.places) {
    if (findPlace(world, city2, p.name)) continue;
    const near = p.near ? findPlace(world, city2, p.near) : placeById(world, city2, world.at);
    const place = registerPlace(world, city2, p.name, near, p.about ?? "");
    out.push(line(`\u5730\u56FE\u4E0A\u52A0\u4E86${place.name}\uFF08${city2.districts.find((d) => d.id === (districtAt(city2, place.at)?.id ?? ""))?.name ?? ""}\uFF09`));
  }
  return out;
}
var WOMAN = /女|姑娘|阿姨|大妈|大婶|奶奶|姐|妹|妈|太太|小姐|妇/;
function meet(world, state, m) {
  const scene = world.scene;
  const known = world.people[m.name];
  let p = (m.id ? scene?.people.find((x) => x.id === m.id) : void 0) ?? scene?.people.find((x) => x.name === m.name);
  if (!p && m.id && !m.looks) return;
  if (!p && scene && !m.gone && (!known || known.kind === "bystander")) {
    const looks2 = m.looks || known?.brief;
    p = {
      id: `b-${hash(`${world.seed}|met|${m.name}|${world.now}`).toString(36)}`,
      role: "visitor",
      gender: m.gender ?? (WOMAN.test(`${m.name}${looks2 ?? ""}`) ? "\u5973" : "\u7537"),
      age: Math.round(m.age ?? 30),
      purpose: "\u5267\u60C5\u91CC\u51FA\u73B0\u7684\u4EBA",
      leaveAt: world.now + 60,
      ...looks2 ? { looks: looks2 } : {},
      ...m.doing ? { doing: m.doing } : {}
    };
    scene.people.push(p);
  }
  if (p) {
    p.name = m.name;
    if (m.doing) p.doing = m.doing;
    if (m.gone && scene) scene.people = scene.people.filter((x) => x !== p);
  }
  if (!p && known && known.kind !== "bystander") return;
  const looks = p?.looks ?? m.looks;
  const kind = known?.kind ?? "bystander";
  world.people[m.name] = { ...known ?? { kind }, ...kind === "bystander" && looks ? { brief: looks } : {}, at: scene?.place ?? world.at, seenAt: world.now };
  if (!state.characters[m.name]) {
    const c = newCharacter();
    c.description = [looks, p?.role === "staff" ? `\u8FD9\u91CC\u7684${p.purpose}` : ""].filter(Boolean).join("\uFF0C");
    c.temporary = true;
    state.characters[m.name] = c;
  }
}
function addNewcomers(sw, world, state, present) {
  for (const name of present) {
    const c = state.characters[name];
    if (!c || name === PROTAGONIST || world.people[name] || sw.met.some((m) => m.name === name)) continue;
    if (world.scene?.people.some((p) => p.name === name)) continue;
    sw.met.push({ name, ...c.description ? { looks: c.description } : {} });
  }
}
var worldSeed = (chatId) => hash(chatId);
var SCENE_ID = /^[sb]-[0-9a-z-]+$/;
function renameSceneIds(args, world, sw) {
  const names = /* @__PURE__ */ new Map();
  for (const p of world.scene?.people ?? []) if (p.name) names.set(p.id, p.name);
  for (const m of sw?.met ?? []) if (m.id) names.set(m.id, m.name);
  const fix = (v) => typeof v === "string" && SCENE_ID.test(v.trim()) ? names.get(v.trim()) ?? null : v;
  if (Array.isArray(args.present)) args.present = args.present.map(fix).filter(Boolean);
  for (const key of ["attitudes", "status", "growth"]) {
    if (!Array.isArray(args[key])) continue;
    args[key] = args[key].filter((x) => {
      if (!isRecord6(x)) return true;
      const who = fix(x.who);
      if (who === null) return false;
      x.who = who;
      return true;
    });
  }
  if (Array.isArray(args.bonds)) {
    args.bonds = args.bonds.filter((b) => {
      if (!isRecord6(b) || !Array.isArray(b.between)) return true;
      const between = b.between.map(fix);
      if (between.includes(null)) return false;
      b.between = between;
      return true;
    });
  }
}

// src/plugins/tabletop/world/entries.ts
var WORLD_ENTRIES = [
  {
    kind: "world-ruling",
    name: "\u4E16\u754C\xB7\u88C1\u5B9A\u8865\u5145",
    content: `<<<|hearth|world-ruling>>>
\u3010\u8FD9\u4E00\u8F6E\u7684\u65F6\u95F4\u548C\u53BB\u5411\u3011\u88C1\u5B9A\u65F6\u540C\u65F6\u5728 hearth_check \u91CC\u5199\uFF1A
- time.minutes\uFF1A\u8FD9\u4E00\u8F6E\u5728\u539F\u5730\u6216\u76EE\u7684\u5730\u505A\u8FD9\u4E9B\u4E8B\u8981\u591A\u5C11\u5206\u949F\u3002\u5BD2\u6684\u51E0\u53E5 2\uFF5E5 \u5206\u949F\uFF0C\u5403\u4E00\u987F\u996D 30\uFF5E60 \u5206\u949F\uFF0C\u6700\u591A 180\u3002\u8DEF\u4E0A\u7684\u65F6\u95F4\u4E0D\u7528\u7B97\uFF0CHearth \u6309\u5730\u56FE\u7B97\u3002
- \u4E3B\u89D2\u8981\u53BB\u522B\u5904\u65F6\u5199 move\uFF1Ato \u5199\u5730\u56FE\u4E0A\u7684\u5730\u70B9\u540D\uFF0C\u6216\u8005\u300C\u5BB6\u300D\u300C\u516C\u53F8\u300D\uFF1B\u5730\u56FE\u4E0A\u6CA1\u6709\u7684\u5730\u65B9\u5199\u4E00\u4E2A\u5177\u4F53\u7684\u540D\u5B57\u3002by \u5199\u600E\u4E48\u53BB\uFF0C\u4E0D\u5199\u5C31\u6309\u4E3B\u89D2\u7684\u4E60\u60EF\u3002\u4E00\u8D77\u8D70\u7684\u89D2\u8272\u5199\u5728 with\u3002\u4E0D\u9A6C\u4E0A\u8D70\u3001\u8FC7\u4E00\u9635\u624D\u51FA\u53D1\u7684\uFF08\u4F8B\u5982\u300C\u78E8\u8E6D\u5230\u4E5D\u70B9\u534A\u624D\u51FA\u95E8\u300D\uFF09\uFF0C\u5728 leave \u5199\u51FA\u53D1\u7684\u65F6\u523B\u3002
- \u4E3B\u89D2\u7761\u89C9\u6216\u73A9\u5BB6\u8BF4\u8981\u8DF3\u8FC7\u4E00\u6BB5\u65F6\u95F4\u65F6\uFF0C\u5199 time.until\uFF08\u660E\u786E\u7684\u7ED3\u675F\u65F6\u523B\uFF09\uFF1B\u7167\u5E38\u8FC7\u65E5\u5B50\uFF08\u4E0A\u73ED\u3001\u56DE\u5BB6\uFF09\u65F6\u628A time.routine \u8BBE\u4E3A true\u3002activity \u5199\u8FD9\u6BB5\u65F6\u95F4\u4E3B\u8981\u5728\u505A\u4EC0\u4E48\u3002
- \u65F6\u95F4\u548C\u53BB\u5411\u53EA\u6309\u73A9\u5BB6\u8FD9\u4E00\u8F6E\u5199\u7684\u884C\u52A8\u6765\u5B9A\uFF0C\u4E0D\u66FF\u4E3B\u89D2\u591A\u505A\u522B\u7684\u4E8B\u3002`
  },
  {
    kind: "world-scene",
    name: "\u4E16\u754C\xB7\u573A\u666F\u8BF4\u660E",
    content: `<<<|hearth|world-scene>>>
\u3010\u573A\u666F\u3011\u8FD9\u4E00\u6B65\u4E0D\u5199\u6B63\u6587\uFF0C\u53EA\u63CF\u5199\u4E3B\u89D2\u6B64\u523B\u770B\u5230\u7684\u4EBA\uFF0C\u8C03\u7528 hearth_scene \u63D0\u4EA4\u3002
- \u6309\u7ED9\u51FA\u7684\u7F16\u53F7\u9010\u4E2A\u5199\uFF0C\u6BCF\u4EBA\u4E00\u9879\uFF1Alooks \u5199\u770B\u8D77\u6765\u7684\u6837\u5B50\uFF08\u5927\u6982\u7684\u5E74\u7EAA\u3001\u6027\u522B\u3001\u8EAB\u6750\u3001\u7A7F\u7740\u3001\u663E\u773C\u7684\u7279\u5F81\uFF09\uFF0Cdoing \u5199\u5728\u505A\u4EC0\u4E48\uFF0Cwhere \u5199\u5728\u8FD9\u91CC\u7684\u54EA\u4E2A\u4F4D\u7F6E\u3002
- \u53EA\u5199\u4E3B\u89D2\u770B\u5F97\u5230\u7684\uFF1A\u4E0D\u5199\u540D\u5B57\u3001\u804C\u4E1A\u3001\u8EAB\u4EFD\u548C\u5FC3\u91CC\u5728\u60F3\u4EC0\u4E48\uFF0C\u53EF\u4EE5\u5199\u80FD\u770B\u51FA\u6765\u7684\u4E1C\u897F\uFF08\u6BD4\u5982\u7A7F\u7740\u5DE5\u88C5\u3001\u80F8\u524D\u6302\u7740\u5DE5\u724C\uFF09\u3002
- \u7A7F\u7740\u8981\u5408\u5B63\u8282\u3001\u5929\u6C14\u548C\u573A\u5408\uFF1B\u4EBA\u548C\u4EBA\u4E4B\u95F4\u8981\u6709\u5DEE\u522B\uFF0C\u4E0D\u8981\u4E2A\u4E2A\u90FD\u597D\u770B\u6216\u90FD\u5F88\u7279\u522B\uFF0C\u5927\u591A\u6570\u662F\u666E\u901A\u4EBA\u3002
- crowd \u7528\u4E00\u53E5\u8BDD\u5199\u8FD9\u91CC\u6574\u4F53\u7684\u6837\u5B50\u548C\u4EBA\u6D41\u3002`
  },
  {
    kind: "world-narrate",
    name: "\u4E16\u754C\xB7\u53D9\u8FF0\u8865\u5145",
    content: `<<<|hearth|world-narrate>>>
\u3010\u4E16\u754C\u3011
- \u6309\u3010\u4E16\u754C\u6570\u636E\u3011\u5199\uFF1A\u65F6\u95F4\u3001\u5929\u6C14\u3001\u5730\u70B9\u3001\u8DEF\u4E0A\u7684\u60C5\u51B5\u548C\u3010\u8FD9\u4E00\u8F6E\u3011\u91CC\u53D1\u751F\u7684\u4E8B\u90FD\u4EE5\u5B83\u4E3A\u51C6\uFF0C\u6B63\u6587\u5199\u5230\u8FD9\u4E00\u8F6E\u7684\u7ED3\u675F\u65F6\u523B\u5DE6\u53F3\u3002
- \u3010\u8FD9\u91CC\u7684\u4EBA\u3011\u662F\u4E3B\u89D2\u6B64\u523B\u770B\u5F97\u5230\u7684\u4EBA\uFF0C\u7528\u4E3B\u89D2\u7684\u773C\u775B\u5199\u51FA\u6765\uFF1A\u4E3B\u89D2\u6CE8\u610F\u5230\u8C01\u3001\u770B\u5230\u4ED6\u4EEC\u4EC0\u4E48\u6837\u5B50\u3002\u4E0D\u77E5\u9053\u540D\u5B57\u7684\u4EBA\u6309\u6837\u5B50\u79F0\u547C\uFF0C\u4E0D\u66FF\u4ED6\u4EEC\u7F16\u540D\u5B57\u3002
- \u4E3B\u89D2\u4E0D\u77E5\u9053\u7684\u4E8B\uFF0C\u53EA\u80FD\u901A\u8FC7\u4E3B\u89D2\u770B\u5F97\u5230\u3001\u542C\u5F97\u5230\u7684\u8868\u73B0\u4F53\u73B0\u3002
- \u4E3B\u89D2\u624B\u673A\u4E0A\u7684\u6D88\u606F\u548C\u6765\u7535\u53EA\u6709\u3010\u4E16\u754C\u6570\u636E\u3011\u548C\u3010\u8FD9\u4E00\u8F6E\u3011\u91CC\u5217\u51FA\u7684\u90A3\u4E9B\uFF0C\u6CA1\u5217\u51FA\u7684\u4E0D\u8981\u7F16\uFF1B\u522B\u4EBA\u6709\u6CA1\u6709\u8054\u7CFB\u4E3B\u89D2\uFF0C\u7531\u4ED6\u4EEC\u81EA\u5DF1\u51B3\u5B9A\uFF0C\u6B63\u6587\u4E0D\u66FF\u4ED6\u4EEC\u53D1\u6D88\u606F\u3002
- \u65F6\u95F4\u548C\u94B1\u53EF\u4EE5\u81EA\u7136\u5730\u5199\uFF08\u300C\u5FEB\u4E5D\u70B9\u4E86\u300D\u300C\u6253\u8F66\u82B1\u4E86\u4E09\u5341\u591A\u300D\uFF09\uFF0C\u4E0D\u5199\u5C5E\u6027\u548C\u8EAB\u4F53\u7684\u6570\u503C\u3002\u4E3B\u89D2\u997F\u4E86\u3001\u56F0\u4E86\uFF0C\u901A\u8FC7\u611F\u53D7\u5199\u51FA\u6765\u3002
- \u53EA\u5199\u5230\u4E3B\u89D2\u9700\u8981\u505A\u51B3\u5B9A\u7684\u5730\u65B9\uFF0C\u4E0D\u66FF\u4E3B\u89D2\u505A\u51B3\u5B9A\u3002`
  },
  {
    kind: "world-settle",
    name: "\u4E16\u754C\xB7\u7ED3\u7B97\u8865\u5145",
    content: `<<<|hearth|world-settle>>>
\u3010\u4E16\u754C\u7684\u8BB0\u8D26\u3011\u5728 hearth_settle \u7684 world \u91CC\u5199\u8FD9\u6BB5\u56DE\u590D\u91CC\u4E3B\u89D2\u8FD9\u8FB9\u53D1\u751F\u7684\u4E8B\uFF1A
- \u989D\u5916\u7684\u82B1\u9500\u548C\u6536\u5165\uFF08\u4E09\u9910\u65E5\u7528\u6BCF\u5929\u5DF2\u7ECF\u6309\u751F\u6D3B\u6C34\u5E73\u6263\u8FC7\uFF0C\u8F66\u8D39\u5DF2\u7ECF\u7B97\u8FC7\uFF0C\u90FD\u4E0D\u8981\u518D\u5199\uFF09\u3002\u4E3B\u89D2\u5403\u4E86\u4E1C\u897F\u5199 ate\u3002
- \u65B0\u7B54\u5E94\u3001\u7EA6\u597D\u7684\u4E8B\u5199 commitments\uFF0C\u6709\u5177\u4F53\u65F6\u95F4\u5C31\u5199 at\uFF0C\u6709\u5730\u70B9\u5C31\u5199 place\uFF1B\u505A\u5B8C\u4E86\u7684\u7EA6\u5B9A\u5199 done\u3002
- \u4E3B\u89D2\u7528\u624B\u673A\u53D1\u51FA\u7684\u6D88\u606F\u5199 messages\uFF1B\u4EA4\u6362\u4E86\u8054\u7CFB\u65B9\u5F0F\u5199 contacts\u3002
- \u548C\u4E3B\u89D2\u6253\u8FC7\u4EA4\u9053\u3001\u6216\u8005\u4E3B\u89D2\u7279\u610F\u7559\u610F\u7684\u4EBA\u5199 met\uFF1A\u3010\u8FD9\u91CC\u7684\u4EBA\u3011\u91CC\u7684\u5199\u7F16\u53F7\u548C\u79F0\u547C\uFF1B\u6B63\u6587\u91CC\u51FA\u73B0\u3001\u3010\u8FD9\u91CC\u7684\u4EBA\u3011\u91CC\u6CA1\u6709\u7684\uFF0C\u5199\u79F0\u547C\u548C\u6B63\u6587\u91CC\u5199\u5230\u7684\u6837\u5B50\u3002\u95EE\u5230\u540D\u5B57\u5C31\u5199\u540D\u5B57\u3002
- \u5728\u573A\u7684\u89D2\u8272\u53BB\u4E86\u522B\u5904\u5199 moves\uFF1B\u6B63\u6587\u91CC\u51FA\u73B0\u3001\u5730\u56FE\u4E0A\u6CA1\u6709\u7684\u5730\u70B9\u5199 places\u3002
- \u6B63\u6587\u6BD4\u8BA1\u5212\u7684\u65F6\u95F4\u6BB5\u591A\u5199\u4E86\u65F6\u95F4\uFF08\u7761\u7740\u4E86\u3001\u804A\u8FC7\u4E86\u5934\uFF09\uFF0C\u5199 extra_minutes\u3002
- \u53EA\u8BB0\u8FD9\u6BB5\u56DE\u590D\u91CC\u771F\u7684\u53D1\u751F\u7684\u4E8B\uFF0C\u6CA1\u53D1\u751F\u7684\u4E0D\u8981\u7F16\u3002`
  },
  {
    kind: "world-setup",
    name: "\u4E16\u754C\xB7\u5F00\u5C40\u8BF4\u660E",
    content: `<<<|hearth|world-setup>>>
\u3010\u5F00\u5C40\u3011\u8FD9\u4E00\u6B65\u4E0D\u5199\u6B63\u6587\uFF0C\u53EA\u6309\u3010\u5F00\u5C40\u8BBE\u5B9A\u3011\u628A\u4E3B\u89D2\u5728\u6F9C\u6C5F\u5E02\u7684\u751F\u6D3B\u843D\u6210\u6570\u636E\uFF0C\u8C03\u7528 hearth_setup \u63D0\u4EA4\u3002
- \u4E00\u5207\u6309\u73B0\u5B9E\u4E2D\u56FD\u5927\u57CE\u5E02\u7684\u5E38\u7406\u6765\uFF1A\u6536\u5165\u3001\u623F\u79DF\u3001\u5B58\u6B3E\u548C\u804C\u4E1A\u3001\u5E74\u7EAA\u3001\u4F4F\u7684\u533A\u76F8\u79F0\uFF1B\u4E0A\u73ED\u65CF\u7684\u5DE5\u8D44\u6309\u8FD9\u7C7B\u5DE5\u4F5C\u5728\u5927\u57CE\u5E02\u7684\u6C34\u5E73\uFF0C\u623F\u79DF\u79BB\u5E02\u4E2D\u5FC3\u8D8A\u8FD1\u8D8A\u8D35\u3002
- \u4E3B\u89D2\u7684\u5C5E\u6027\u6309\u53C2\u7167\u8868\u6253\u5206\uFF08\u666E\u901A\u6210\u5E74\u7537\u6027 100\uFF09\uFF0C\u7279\u957F\u53EA\u5199\u771F\u6709\u7684\u3002
- \u4F4F\u5904\u548C\u5355\u4F4D\u4F18\u5148\u4ECE\u3010\u6F9C\u6C5F\u5E02\u53EF\u9009\u7684\u5730\u65B9\u3011\u91CC\u6311\uFF1B\u6CA1\u6709\u5408\u9002\u7684\uFF0C\u5199\u4E00\u4E2A\u65B0\u540D\u5B57\uFF0C\u5E76\u5728 near \u5199\u9644\u8FD1\u7684\u5DF2\u77E5\u5730\u70B9\u3002
- \u5355\u4F4D\u7684\u60EF\u4F8B\uFF08\u8003\u52E4\u3001\u8FDF\u5230\u3001\u8BF7\u5047\u3001\u52A0\u73ED\uFF09\u5199\u5F97\u50CF\u4E00\u5BB6\u771F\u5B9E\u7684\u5355\u4F4D\uFF0C\u6709\u677E\u6709\u7D27\u3002
- \u8EAB\u8FB9\u7684\u4EBA\uFF1A\u4E0A\u73ED\u65CF\u5199\u4E0A\u53F8\u548C\u4E24\u4F4D\u540C\u4E8B\uFF0C\u5B66\u751F\u5199\u8F85\u5BFC\u5458\u548C\u4E24\u4F4D\u540C\u5B66\uFF0C\u79DF\u623F\u7684\u5199\u623F\u4E1C\uFF0C\u518D\u5199\u4E00\u4E24\u4F4D\u5BB6\u4EBA\u3002\u6BCF\u4EBA\u5199\u6E05\u548C\u4E3B\u89D2\u7684\u5173\u7CFB\u3001\u6027\u683C\u548C\u5BF9\u4E3B\u89D2\u73B0\u5728\u7684\u6001\u5EA6\uFF0C\u4E0D\u8981\u90FD\u5F88\u53CB\u597D\uFF0C\u4E5F\u4E0D\u8981\u90FD\u5F88\u6781\u7AEF\u3002`
  },
  {
    kind: "world-act",
    name: "\u4E16\u754C\xB7\u4EBA\u7269\u53CD\u5E94",
    content: `<<<|hearth|world-act>>>
\u3010\u4EBA\u7269\u53CD\u5E94\u3011\u8FD9\u4E00\u6B65\u4E0D\u5199\u6B63\u6587\uFF0C\u53EA\u66FF\u4E0B\u9762\u8FD9\u4E2A\u4EBA\u51B3\u5B9A\uFF1A\u4ED6\u5BDF\u89C9\u5230\u8FD9\u4E9B\u4E8B\u4EE5\u540E\u4F1A\u600E\u4E48\u60F3\u3001\u505A\u4EC0\u4E48\uFF0C\u8C03\u7528 hearth_act \u63D0\u4EA4\u3002
- \u53EA\u6309\u4ED6\u77E5\u9053\u7684\u4E8B\u5224\u65AD\u3002\u804A\u5929\u8BB0\u5F55\u91CC\u4ED6\u4E0D\u5728\u573A\u7684\u90E8\u5206\uFF0C\u4ED6\u4E0D\u77E5\u9053\uFF1B\u522B\u4EBA\u6CA1\u544A\u8BC9\u4ED6\u7684\uFF0C\u4ED6\u4E0D\u77E5\u9053\u3002
- \u6309\u73B0\u5B9E\u91CC\u8FD9\u6837\u4E00\u4E2A\u4EBA\u5728\u8FD9\u79CD\u5904\u5883\u4E0B\u6700\u53EF\u80FD\u7684\u505A\u6CD5\u6765\uFF1A\u7ED3\u5408\u4ED6\u7684\u6027\u683C\u3001\u5FC3\u60C5\u3001\u548C\u4E3B\u89D2\u7684\u5173\u7CFB\u3001\u7EA6\u5B9A\u91CC\u5199\u7684\u60EF\u4F8B\u3002\u5BBD\u539A\u7684\u4EBA\u53EF\u80FD\u5148\u7B49\u7B49\uFF0C\u8F83\u771F\u7684\u4EBA\u53EF\u80FD\u9A6C\u4E0A\u8FFD\u95EE\uFF1B\u591A\u6570\u65F6\u5019\u53CD\u5E94\u662F\u5E73\u5E38\u7684\uFF0C\u4E0D\u8981\u6BCF\u4EF6\u4E8B\u90FD\u95F9\u5927\u3002
- \u53D1\u6D88\u606F\u3001\u6253\u7535\u8BDD\u65F6 text \u5199\u4ED6\u7684\u539F\u8BDD\uFF0C\u7528\u4ED6\u81EA\u5DF1\u7684\u53E3\u543B\uFF0C\u957F\u77ED\u50CF\u771F\u7684\u6D88\u606F\u3002
- \u8981\u6263\u94B1\u3001\u89E3\u9664\u7EA6\u5B9A\u3001\u627E\u522B\u4EBA\uFF08\u4F8B\u5982\u62A5\u8B66\u3001\u544A\u8BC9\u9886\u5BFC\uFF09\u8FD9\u7C7B\u4E8B\uFF0C\u53EA\u5728\u5408\u4E4E\u5E38\u7406\u7684\u65F6\u5019\u624D\u505A\uFF0C\u5E76\u5728 actions \u91CC\u5199\u6E05\u3002
- \u4ED6\u73B0\u5728\u4E0D\u6253\u7B97\u505A\u4EC0\u4E48\uFF0Cactions \u7559\u7A7A\uFF1B\u60F3\u8FC7\u4E00\u9635\u518D\u770B\uFF0C\u7528 wait\u3002
- \u8FD9\u4EF6\u4E8B\u8BA9\u4ED6\u5BF9\u4E3B\u89D2\u7684\u6001\u5EA6\u53D8\u4E86\uFF0C\u5199\u5728 feelings \u91CC\uFF0C\u5E45\u5EA6\u548C\u4E8B\u60C5\u76F8\u79F0\u3002`
  },
  {
    kind: "world-day",
    name: "\u4E16\u754C\xB7\u6BCF\u65E5\u63A8\u6F14",
    content: `<<<|hearth|world-day>>>
\u3010\u6BCF\u65E5\u63A8\u6F14\u3011\u8FD9\u4E00\u6B65\u4E0D\u5199\u6B63\u6587\uFF0C\u53EA\u66FF\u4E0B\u9762\u8FD9\u4E2A\u91CD\u8981\u4EBA\u7269\u8FC7\u5B8C\u8FD9\u4E00\u5929\u3001\u5B89\u6392\u660E\u5929\uFF0C\u8C03\u7528 hearth_day \u63D0\u4EA4\u3002
- \u6309\u7ED9\u51FA\u7684\u300C\u8FD9\u4E00\u5929\u300D\u662F\u5E73\u5E38\u3001\u6709\u70B9\u4E8B\u8FD8\u662F\u6709\u5927\u4E8B\u6765\u5199\uFF0C\u5E73\u5E38\u7684\u4E00\u5929\u5C31\u5199\u5E73\u5E38\u7684\u4E8B\uFF1A\u4E0A\u73ED\u3001\u5403\u996D\u3001\u548C\u8C01\u8BF4\u4E86\u51E0\u53E5\u8BDD\u3001\u665A\u4E0A\u505A\u4E86\u4EC0\u4E48\u3002
- \u53EA\u6309\u4ED6\u77E5\u9053\u7684\u4E8B\u60F3\u3002\u804A\u5929\u8BB0\u5F55\u91CC\u4ED6\u4E0D\u5728\u573A\u7684\u90E8\u5206\uFF0C\u4ED6\u4E0D\u77E5\u9053\u3002
- \u5FC3\u60C5\u3001\u538B\u529B\u7684\u53D8\u5316\u548C\u8FD9\u4E00\u5929\u7684\u4E8B\u76F8\u79F0\u3002
- \u8981\u4E0D\u8981\u8054\u7CFB\u4E3B\u89D2\uFF0C\u7531\u4ED6\u81EA\u5DF1\u51B3\u5B9A\uFF1A\u60F3\u5230\u4E3B\u89D2\u3001\u6709\u4E8B\u8981\u8BF4\u3001\u60F3\u5206\u4EAB\u6216\u60F3\u8D28\u95EE\u624D\u8054\u7CFB\uFF1B\u4E0D\u60F3\u5C31\u4E0D\u5199 contact\u3002\u8054\u7CFB\u7684\u65F6\u95F4\u6311\u4ED6\u6709\u7A7A\u7684\u65F6\u5019\uFF0Ctext \u5199\u4ED6\u7684\u539F\u8BDD\u3002
- \u660E\u5929\u548C\u5E73\u65F6\u4E0D\u4E00\u6837\u7684\u5B89\u6392\u3001\u7EA6\u4E86\u8C01\uFF0C\u5199\u5728 tomorrow \u91CC\u3002`
  },
  {
    kind: "world-profile",
    name: "\u4E16\u754C\xB7\u4EBA\u7269\u6863\u6848",
    content: `<<<|hearth|world-profile>>>
\u3010\u4EBA\u7269\u6863\u6848\u3011\u8FD9\u4E00\u6B65\u4E0D\u5199\u6B63\u6587\uFF0C\u53EA\u4E3A\u4E0B\u9762\u8FD9\u4E2A\u4EBA\u5199\u51FA\u5B8C\u6574\u7684\u6863\u6848\u548C\u4ED6\u5728\u6F9C\u6C5F\u5E02\u7684\u751F\u6D3B\uFF0C\u8C03\u7528 hearth_profile \u63D0\u4EA4\u3002
- \u548C\u5267\u60C5\u91CC\u5DF2\u7ECF\u51FA\u73B0\u8FC7\u7684\u4E00\u81F4\uFF1A\u770B\u5230\u7684\u5916\u8C8C\u3001\u8BF4\u8FC7\u7684\u8BDD\u3001\u505A\u8FC7\u7684\u4E8B\u90FD\u4E0D\u80FD\u6539\u3002\u5267\u60C5\u91CC\u8FD8\u4E0D\u77E5\u9053\u540D\u5B57\u7684\uFF0C\u7ED9\u4ED6\u8D77\u4E00\u4E2A\u5408\u9002\u7684\u540D\u5B57\u3002
- \u6863\u6848\u6309\u8FD9\u4E2A\u7ED3\u6784\u5199\uFF082000\uFF5E3000 \u5B57\uFF09\uFF1A\u57FA\u672C\u4FE1\u606F\uFF08\u59D3\u540D\u3001\u5E74\u9F84\u3001\u6027\u522B\u3001\u8EAB\u4EFD\uFF09\uFF1B\u5916\u8C8C\uFF08\u8EAB\u9AD8\u4F53\u578B\u3001\u53D1\u578B\u3001\u4E94\u5B98\u548C\u6807\u5FD7\u6027\u7279\u5F81\u3001\u4E0D\u540C\u573A\u5408\u7684\u7A7F\u7740\uFF09\uFF1B\u80CC\u666F\uFF08\u51FA\u8EAB\u3001\u6559\u80B2\u3001\u7ECF\u5386\u3001\u73B0\u5728\u7684\u751F\u6D3B\u548C\u7ECF\u6D4E\uFF09\uFF1B\u5174\u8DA3\u7231\u597D\uFF1B\u4EBA\u9645\u5173\u7CFB\uFF1B\u8BED\u6599\uFF08\u51E0\u7EC4\u95EE\u7B54\uFF0C\u5C55\u793A\u4ED6\u600E\u4E48\u8BF4\u8BDD\uFF0C\u53EA\u4F5C\u53C2\u8003\uFF09\uFF1B\u6027\u683C\uFF08\u5E95\u8272\u3001\u4E3B\u8272\u8C03\u3001\u70B9\u7F00\u3001\u5BF9\u51B2\u56DB\u5C42\uFF0C\u6BCF\u5C42\u51E0\u6761\u884D\u751F\u548C\u4E00\u6761\u53CD\u5411\u884D\u751F\uFF09\uFF1B\u7406\u89E3\uFF08\u8FD9\u4E9B\u6027\u683C\u600E\u6837\u5207\u6362\u548C\u5171\u5B58\u3001\u884C\u4E3A\u7684\u8FB9\u754C\u3001\u5728\u4EC0\u4E48\u6761\u4EF6\u4E0B\u9732\u51FA\u54EA\u4E00\u9762\u3001\u548C\u4E3B\u89D2\u76F8\u5904\u7684\u539F\u5219\uFF09\u3002
- \u4ED6\u662F\u4E00\u4E2A\u666E\u901A\u7684\u3001\u771F\u5B9E\u7684\u4EBA\uFF0C\u6709\u4F18\u70B9\u4E5F\u6709\u7F3A\u70B9\uFF0C\u4E0D\u8981\u5199\u6210\u5B8C\u7F8E\u7684\u4EBA\u3002
- \u6458\u8981 150\uFF5E250 \u5B57\uFF0C\u5199\u4ED6\u662F\u8C01\u3001\u4EC0\u4E48\u6837\u3001\u548C\u4E3B\u89D2\u7684\u5173\u7CFB\u3002
- \u4F5C\u606F\u5199\u56DB\u5230\u516B\u6BB5\uFF0C\u4F4F\u5904\u548C\u5DE5\u4F5C\u5730\u70B9\u4F18\u5148\u7528\u5730\u56FE\u4E0A\u7684\u5730\u70B9\u3002knows \u5199\u4ED6\u4ECE\u5267\u60C5\u91CC\u5DF2\u7ECF\u77E5\u9053\u7684\u3001\u548C\u4E3B\u89D2\u6709\u5173\u7684\u4E8B\u3002`
  },
  {
    kind: "world-opening",
    name: "\u4E16\u754C\xB7\u5F00\u573A\u8BF4\u660E",
    content: `<<<|hearth|world-opening>>>
\u3010\u5F00\u573A\u3011\u8FD9\u662F\u6545\u4E8B\u7684\u7B2C\u4E00\u6BB5\u3002\u4ECE\u3010\u4E16\u754C\u6570\u636E\u3011\u91CC\u7684\u65F6\u95F4\u548C\u5730\u70B9\u5199\u8D77\uFF1A\u4E3B\u89D2\u6B64\u523B\u5728\u54EA\u3001\u5728\u505A\u4EC0\u4E48\u3001\u5468\u56F4\u662F\u4EC0\u4E48\u6837\uFF0C\u5E26\u51FA\u4E3B\u89D2\u4ECA\u5929\u7684\u5B89\u6392\u3002\u5199\u5230\u4E3B\u89D2\u53EF\u4EE5\u5F00\u59CB\u884C\u52A8\u7684\u5730\u65B9\u505C\u4E0B\uFF0C\u4E0D\u66FF\u4E3B\u89D2\u505A\u51B3\u5B9A\u3002`
  }
];

// src/plugins/tabletop/world/text.ts
var km = (d) => d < 1 ? `${Math.round(d * 100) * 10} \u7C73` : `${d.toFixed(1)} \u516C\u91CC`;
function agenda(world, city2) {
  const out = [];
  const today = Math.floor(world.now / 1440) * 1440;
  for (const day of [today, today + 1440]) {
    for (const c of world.commitments) {
      if (c.ended) continue;
      for (const e of c.expectations) {
        if (e.kind === "presence" && e.who === PROTAGONIST && dayMatches(e.days, day)) {
          const end = day + minutesOf2(e.to);
          if (end <= world.now) continue;
          const when = day === today ? "\u4ECA\u5929" : "\u660E\u5929";
          out.push({ at: day + minutesOf2(e.from), text: `${when} ${e.from}\u2013${e.to} \u5728${placeById(world, city2, e.place)?.name ?? e.place}\uFF08${c.name}\uFF09` });
        } else if (e.kind === "payment" && moment(day).d === e.day && day + 9 * 60 > world.now) {
          const when = day === today ? "\u4ECA\u5929" : "\u660E\u5929";
          out.push({ at: day + 9 * 60, text: `${when}${e.who === PROTAGONIST ? `\u8981\u4ED8 ${e.amount} \u5143\u7ED9${e.to}` : `${e.who}\u4F1A\u4ED8 ${e.amount} \u5143`}\uFF08${c.name}\uFF09` });
        }
      }
    }
  }
  return out.sort((a, b) => a.at - b.at).map((x) => x.text);
}
function personLine(p) {
  const who = p.name ? `${p.name}\uFF08${p.looks ?? ""}\uFF09` : p.looks ?? `${p.gender}\uFF0C${ageWords(p.age)}`;
  return `- ${p.id}\uFF5C${p.where ?? "\u2014"}\uFF5C${who}\uFF5C${p.doing ?? ""}${p.role === "staff" ? "\uFF5C\u8FD9\u91CC\u7684\u5DE5\u4F5C\u4EBA\u5458" : ""}`;
}
function worldText(world, city2, step, plan2) {
  const place = placeById(world, city2, world.at);
  const district = place ? city2.districts.find((d) => d.id === place.district)?.name ?? "" : "";
  const lines = ["\u3010\u4E16\u754C\u6570\u636E\u3011\u4E0B\u9762\u662F\u6B64\u523B\u7684\u4E8B\u5B9E\uFF0C\u6B63\u6587\u548C\u5224\u65AD\u4EE5\u6B64\u4E3A\u51C6\u3002"];
  lines.push(`\u65F6\u95F4\uFF1A${fmtNow(world)}\uFF08${isWorkday(world.now) ? "\u5DE5\u4F5C\u65E5" : "\u4F11\u606F\u65E5"}\uFF09\u3000\u5929\u6C14\uFF1A${fmtWeather(world.weather[0])}`);
  if (place) {
    lines.push(`\u4E3B\u89D2\u5728\uFF1A${district} ${place.name}\uFF08${KIND_LABEL[place.kind]}\uFF0C${place.hours}${isOpen(place, world.now) ? "" : "\uFF0C\u73B0\u5728\u6CA1\u8425\u4E1A"}\uFF09\u3002${place.about}`);
    const near = nearby(world, city2, place.at, 6, place.id).map(({ place: p, km: d }) => `${p.name}\uFF08${KIND_LABEL[p.kind]}\uFF0C${km(d)}\uFF09`);
    lines.push(`\u9644\u8FD1\uFF1A${near.join("\u3001")}`);
  }
  const feel = bodyWords(world.body);
  lines.push(`\u4E3B\u89D2\uFF1A\u4F59\u989D ${world.balance} \u5143\uFF1B${feel.length ? feel.join("\u3001") : "\u8EAB\u4F53\u72B6\u51B5\u6B63\u5E38"}\uFF1B${world.me.job.kind === "\u65E0\u4E1A" ? "\u6CA1\u6709\u5DE5\u4F5C" : `${world.me.job.title}`}`);
  const todo = agenda(world, city2);
  if (todo.length) lines.push(`\u5B89\u6392\uFF1A${todo.join("\uFF1B")}`);
  const work = placeById(world, city2, world.me.job.place);
  if (work && place && work.id !== place.id && step !== "settle") {
    const t = bestTrip(city2, place.at, work.at, { minute: moment(world.now).minute, workday: isWorkday(world.now) }, world.me.habit);
    lines.push(`\u53BB${work.name}\uFF1A${MODE_LABEL[t.mode]}\u7EA6 ${t.minutes} \u5206\u949F\uFF08${t.legs.join("\uFF0C")}\uFF09`);
  }
  const unread = world.phone.messages.filter((m) => !m.read && m.to === PROTAGONIST);
  if (unread.length) lines.push(`\u6CA1\u770B\u7684\u6D88\u606F\uFF1A${unread.map((m) => `${clock(m.at)} ${m.from}\uFF1A${m.text}`).join("\uFF1B")}`);
  if (plan2 && step !== "ruling") {
    lines.push("", `\u3010\u8FD9\u4E00\u8F6E\u3011\u4ECE ${clock(plan2.from)} \u5199\u5230 ${clock(plan2.to)} \u5DE6\u53F3${plan2.to - plan2.from >= 1440 ? `\uFF08\u5230 ${dateKey(plan2.to)}\uFF09` : ""}\u3002`);
    if (plan2.move) lines.push(`\u8DEF\u4E0A\uFF1A${plan2.move.trip.legs.join("\uFF0C")}\uFF0C\u5171 ${plan2.move.trip.minutes} \u5206\u949F${plan2.move.trip.cost ? `\uFF0C${plan2.move.trip.cost} \u5143` : ""}\u3002`);
    const happened = plan2.events.filter((e) => e.kind !== "move");
    if (happened.length) {
      lines.push("\u8FD9\u6BB5\u65F6\u95F4\u91CC\u7684\u4E8B\uFF1A");
      for (const e of happened) lines.push(`- ${e.text}${e.seen ? "" : "\uFF08\u4E3B\u89D2\u4E0D\u77E5\u9053\uFF0C\u53EA\u80FD\u901A\u8FC7\u770B\u5F97\u5230\u3001\u542C\u5F97\u5230\u7684\u8868\u73B0\u4F53\u73B0\uFF09"}`);
    }
  }
  const known = place ? Object.entries(world.people).filter(([, p]) => p.kind !== "bystander" && p.at === place.id) : [];
  if (known.length) lines.push(`\u8FD9\u91CC\u6709\u8BA4\u8BC6\u7684\u4EBA\uFF1A${known.map(([n, p]) => `${n}\uFF08${p.role ?? ""}\uFF09`).join("\u3001")}`);
  if (world.scene && place && step !== "ruling") {
    lines.push("", `\u3010\u8FD9\u91CC\u7684\u4EBA\u3011${world.scene.crowd || crowdWord(place, world.now, world.weather[0])}\u3002\u4E3B\u89D2\u770B\u5F97\u5230\u7684\u4EBA\uFF1A`);
    const people = world.scene.people;
    if (people.length) lines.push(...people.map(personLine));
    else lines.push("- \u6CA1\u6709\u522B\u4EBA");
    if (step === "narrate") lines.push("\u4E0D\u77E5\u9053\u540D\u5B57\u7684\u4EBA\uFF0C\u6309\u770B\u5230\u7684\u6837\u5B50\u79F0\u547C\u3002");
  }
  return lines.join("\n");
}
function sceneText(world, city2, fresh) {
  const place = placeById(world, city2, world.at);
  const people = world.scene?.people ?? [];
  const lines = [
    `\u3010\u573A\u666F\u3011${fmtNow(world)}\uFF0C${fmtWeather(world.weather[0])}\u3002`,
    place ? `\u5730\u70B9\uFF1A${city2.districts.find((d) => d.id === place.district)?.name ?? ""} ${place.name}\uFF08${KIND_LABEL[place.kind]}\uFF09\u3002${place.about}\u4EBA\u6D41\uFF1A${crowdWord(place, world.now, world.weather[0])}\u3002` : "",
    "\u8981\u5199\u7684\u4EBA\uFF08\u6309\u7F16\u53F7\u9010\u4E2A\u5199\uFF09\uFF1A",
    ...people.filter((p) => fresh.includes(p.id)).map((p) => `- ${p.id}\uFF1A${p.role === "staff" ? `\u8FD9\u91CC\u7684${p.purpose}` : `\u6765\u8FD9\u91CC\u7684${p.purpose}`}\uFF0C${p.gender}\uFF0C\u770B\u8D77\u6765${ageWords(p.age)}`)
  ];
  const known = people.filter((p) => !fresh.includes(p.id) && p.looks);
  if (known.length) lines.push("\u5DF2\u7ECF\u5728\u573A\u3001\u5199\u8FC7\u7684\u4EBA\uFF08\u4E0D\u7528\u518D\u5199\uFF0C\u4FDD\u6301\u4E00\u81F4\uFF09\uFF1A", ...known.map(personLine));
  return lines.filter(Boolean).join("\n");
}
function setupText(form, choices) {
  return [
    "\u3010\u5F00\u5C40\u8BBE\u5B9A\u3011",
    `\u4E3B\u89D2\uFF1A${form.name}${form.gender ? `\uFF0C${form.gender}` : ""}${form.age ? `\uFF0C${form.age} \u5C81` : ""}`,
    `\u804C\u4E1A\uFF1A${form.job}${form.jobText ? `\uFF0C${form.jobText}` : ""}`,
    form.district ? `\u60F3\u4F4F\u5728\uFF1A${form.district}` : "\u4F4F\u5728\u54EA\uFF1A\u6309\u804C\u4E1A\u548C\u6536\u5165\u6311\u5408\u9002\u7684\u533A",
    form.about ? `\u5173\u4E8E\u4E3B\u89D2\uFF1A${form.about}` : "",
    `\u5F00\u59CB\u7684\u65F6\u95F4\uFF1A${form.start || "2026-03-02 07:30"}`,
    "",
    "\u3010\u6F9C\u6C5F\u5E02\u53EF\u9009\u7684\u5730\u65B9\u3011",
    choices
  ].filter(Boolean).join("\n");
}

// src/plugins/tabletop/world/flow.ts
var city = () => lanjiang();
function chatWorld(chat) {
  const data = chat.plugins?.[PLUGIN_ID]?.world;
  return data && (data.setup || data.base) ? data : null;
}
function worldBefore(chat, index) {
  for (let i = Math.min(index, chat.messages.length) - 1; i >= 0; i--) {
    const world = swipeData(chat.messages[i])?.world;
    if (world) return normalizeWorld(structuredClone(world));
  }
  const base = chatWorld(chat)?.base;
  return base ? normalizeWorld(structuredClone(base)) : null;
}
function entry(texts, kind) {
  return texts[kind] ?? WORLD_ENTRIES.find((e) => e.kind === kind).content.replace(/^<<<[^\n]*>>>\n/, "");
}
async function runSetup(body, texts, form, chatId, send, trace) {
  const c = city();
  const content = [entry(texts, "world-setup"), setupText(form, setupChoices(c, form))].join("\n\n");
  const request = forceTool(appendStep(body, { content, lead: texts["world-setup-lead"], role: texts.role }, "world_setup"), SETUP_TOOL_NAME, true);
  trace?.("\u4E16\u754C\u5F00\u5C40", request);
  const res = await send(request);
  const call = res.toolCalls.find((x) => x.function?.name === SETUP_TOOL_NAME) ?? res.toolCalls.find((x) => /"home"/.test(x.function?.arguments ?? ""));
  const args = parseJson(call?.function?.arguments ?? res.text);
  if (!args) throw new Error("\u6A21\u578B\u6CA1\u6709\u8C03\u7528\u5F00\u5C40\u5DE5\u5177");
  return applySetup(args, form, c, worldSeed(chatId));
}
async function runScene(body, texts, world, fresh, send, trace) {
  if (!fresh.length) return null;
  const c = city();
  const content = [entry(texts, "world-scene"), sceneText(world, c, fresh)].join("\n\n");
  const request = forceTool(appendStep(body, { content, lead: texts["world-scene-lead"], role: texts.role }, "world_scene"), SCENE_TOOL_NAME, true);
  trace?.("\u4E16\u754C\u573A\u666F", request);
  try {
    const res = await send(request);
    const call = res.toolCalls.find((x) => x.function?.name === SCENE_TOOL_NAME) ?? res.toolCalls.find((x) => /"people"/.test(x.function?.arguments ?? ""));
    const args = parseSceneArgs(call?.function?.arguments ?? res.text);
    if (!args) return "\u6A21\u578B\u6CA1\u6709\u8C03\u7528\u573A\u666F\u5DE5\u5177";
    applyScene(world, args);
    return null;
  } catch (error) {
    return error.message;
  }
}
async function ask(body, texts, kind, content, tool, label, send, trace) {
  const request = forceTool(appendStep(body, { content: [entry(texts, kind), content].join("\n\n"), lead: texts[`${kind}-lead`], role: texts.role }, kind.replace("-", "_")), tool, true);
  trace?.(label, request);
  const res = await send(request);
  const call = res.toolCalls.find((x) => x.function?.name === tool) ?? res.toolCalls[0];
  return parseJson(call?.function?.arguments ?? res.text);
}
async function runReactions(body, texts, world, state, important, plan2, send, trace, warn) {
  const c = city();
  const out = [];
  for (let round2 = 0; round2 < 2; round2++) {
    const due = takeNotices(world, plan2.to);
    if (!due.size) break;
    const answers = await Promise.all([...due].slice(0, 6).map(async ([who, notices]) => {
      try {
        const args = await ask(body, texts, "world-act", actText(world, c, state, who, notices, important[who]), ACT_TOOL_NAME, `\u4E16\u754C \xB7 ${who}\u7684\u53CD\u5E94`, send, trace);
        return { who, notices, args };
      } catch (error) {
        warn?.(`${who}\u7684\u53CD\u5E94\u6CA1\u6709\u5B8C\u6210\uFF1A${error.message}`);
        return { who, notices, args: null };
      }
    }));
    for (const { who, notices, args } of answers) {
      for (const n of notices) learn(world, who, n.what, "\u4EB2\u773C", n.at);
      if (!args) continue;
      const after = Math.max(...notices.map((n) => n.at));
      const result = applyAct(world, c, who, args, after, plan2.to);
      for (const e of result.events) addEvent(world, e);
      plan2.events.push(...result.events);
      out.push({ who, ...result.feelings ? { feelings: result.feelings } : {}, ...typeof args.think === "string" ? { think: args.think } : {} });
    }
  }
  plan2.events.sort((a, b) => a.at - b.at);
  return out;
}
async function runDays2(body, texts, world, state, important, from, to, present, send, trace) {
  const c = city();
  const days = [];
  for (let d = Math.floor(from / 1440) * 1440 + 1440; d <= to; d += 1440) days.push(d);
  if (!days.length) return [];
  const names = Object.keys(important).filter((n) => world.people[n]?.kind === "important" && !present.has(n));
  const lines = [];
  await Promise.all(names.map(async (who) => {
    const span = days.length > 1 ? `${dateKey(days[0] - 1440)} \u5230 ${dateKey(days.at(-1) - 1440)}` : dateKey(days[0] - 1440);
    const seen = (world.knowledge[who] ?? []).filter((k) => k.at >= from && k.at <= to).map((k) => k.text);
    try {
      const args = await ask(body, texts, "world-day", dayText(world, c, state, who, important[who], span, seen), DAY_TOOL_NAME, `\u4E16\u754C \xB7 ${who}\u7684\u4E00\u5929`, send, trace);
      lines.push(...applyDay(world, c, who, args, days.at(-1)));
    } catch (error) {
      lines.push(`${who}\u7684\u8FD9\u4E00\u5929\u6CA1\u6709\u63A8\u6F14\uFF1A${error.message}`);
    }
  }));
  return lines;
}
async function runProfile(body, texts, world, state, who, base, send, trace) {
  const c = city();
  const others = Object.entries(world.people).filter(([n, p]) => p.kind === "important" && n !== who).map(([n, p]) => `${n}\uFF08${p.role ?? ""}\uFF09`);
  const content = [
    `\u3010\u8981\u5199\u6863\u6848\u7684\u4EBA\u3011${who}`,
    base,
    world.knowledge[who]?.length ? `\u4ED6\u5DF2\u7ECF\u77E5\u9053\u7684\u4E8B\uFF1A
${world.knowledge[who].slice(-15).map((k) => `- ${k.text}`).join("\n")}` : "",
    others.length ? `\u5176\u4ED6\u91CD\u8981\u4EBA\u7269\uFF1A${others.join("\u3001")}` : "",
    `\u3010\u6F9C\u6C5F\u5E02\u3011${fmtNow(world)}\u3002\u4E3B\u89D2\u4F4F\u5728${placeById(world, c, world.me.home)?.name ?? ""}\uFF0C\u5728${placeById(world, c, world.at)?.name ?? ""}\u3002`,
    `\u53EF\u4EE5\u9009\u7684\u5730\u70B9\uFF1A${c.places.filter((p) => p.landmark).slice(0, 40).map((p) => p.name).join("\u3001")}\uFF0C\u4EE5\u53CA\u5404\u533A\u7684\u5C0F\u533A\u3001\u5E97\u94FA\uFF1B\u4E5F\u53EF\u4EE5\u5199\u65B0\u5730\u70B9\u7684\u540D\u5B57\u3002`
  ].filter(Boolean).join("\n\n");
  const args = await ask(body, texts, "world-profile", content, PROFILE_TOOL_NAME, `\u4E16\u754C \xB7 ${who}\u7684\u6863\u6848`, send, trace);
  return args ? applyProfile(world, c, args, who, /^【原有档案】/.test(base) ? base.replace(/^【原有档案】\n?/, "") : void 0) : null;
}

// src/plugins/tabletop/index.ts
var MARKER = /<<<\|\s*hearth\s*\|\s*(ruling|narrate|pass|settle|world-ruling|world-scene|world-narrate|world-settle|world-setup|world-opening|world-act|world-day|world-profile)(-lead)?\s*>>>/gi;
function takeEntries(content) {
  const found = {};
  const marks = [...content.matchAll(MARKER)];
  if (!marks.length) return { rest: content, found };
  const rest = content.slice(0, marks[0].index).trimEnd();
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : content.length;
    const kind = `${m[1].toLowerCase()}${m[2] ? "-lead" : ""}`;
    const text = content.slice((m.index ?? 0) + m[0].length, end).trim();
    if (text) found[kind] = found[kind] ? `${found[kind]}

${text}` : text;
  });
  return { rest, found };
}
var enabledEntries = (preset) => {
  const on = new Set(preset.order.filter((o) => o.enabled).map((o) => o.id));
  return preset.prompts.filter((p) => on.has(p.id));
};
function presetReady(preset) {
  return enabledEntries(preset).some((p) => /<<<\|\s*hearth\s*\|\s*ruling\s*>>>/i.test(p.content));
}
var passOn = (chat) => chat.plugins?.[PLUGIN_ID]?.pass === true;
function lastUserText(messages, before) {
  for (let i = before - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user" && m.mode !== "edit" && !m.hidden) return m.swipes[m.activeSwipe]?.content ?? "";
  }
  return "";
}
function withAdded(state, ruling) {
  const next = structuredClone(state);
  for (const [name, sheet] of Object.entries(ruling?.added ?? {})) next.characters[name] ??= structuredClone(sheet);
  return next;
}
var WORLD_MOOD_DECAY = 0.03;
var DEFAULT_PASS = "\u3010\u672C\u8F6E\u68C0\u5B9A\u3011\u8FD9\u4E00\u8F6E\u5F00\u542F\u4E86\u300C\u68C0\u5B9A\u7EDD\u5BF9\u901A\u8FC7\u300D\uFF1A\u4E0D\u63B7\u9AB0\uFF0C\u4E3B\u89D2\u7684\u884C\u52A8\u5168\u90E8\u987A\u5229\u5B8C\u6210\u3002";
var SETTLE_RETRIES = 2;
var swipePath = (messageId, swipeId) => ["messages", `@${messageId}`, "swipes", `@${swipeId}`, "plugins", PLUGIN_ID];
async function settle(api, source, state, ruling, reply, scene, opts = {}) {
  const texts = source.texts;
  const world = opts.world;
  const content = [
    texts.settle ?? "",
    world ? entry(texts, "world-settle") : "",
    ruling.checks.length ? rulingText(ruling) : "",
    stateText(state, source.userName, scene),
    world ? worldText(world.after, city(), "settle", world.plan) : ""
  ].filter(Boolean).join("\n\n");
  const history = replyForHistory(reply);
  const body = forceTool(Array.isArray(source.body.messages) && source.body.messages.length ? appendStep(appendReply(source.body, history), { content, lead: texts["settle-lead"], role: texts.role }, "settle") : { messages: [{ role: "system", content }, { role: "user", content: `\u3010\u521A\u624D\u7684\u56DE\u590D\u3011
${history}` }] }, SETTLE_TOOL_NAME, Boolean(world));
  let lastError = "";
  for (let attempt = 1; attempt <= SETTLE_RETRIES; attempt++) {
    if (opts.signal?.aborted) break;
    try {
      opts.trace?.(attempt > 1 ? `\u8DD1\u56E2\u7ED3\u7B97\uFF08\u91CD\u8BD5\uFF09` : "\u8DD1\u56E2\u7ED3\u7B97", body);
      const res = await api.send(body, opts.signal);
      const call = res.toolCalls.find((c) => c.function?.name === SETTLE_TOOL_NAME) ?? res.toolCalls.find((c) => /"attitudes"/.test(c.function?.arguments ?? ""));
      const args = parseSettleArgs(call?.function?.arguments ?? res.text);
      if (!args) throw new Error(res.toolCalls.length ? `\u6A21\u578B\u8C03\u7528\u4E86 ${res.toolCalls.map((c) => c.function?.name).join("\u3001")}\uFF0C\u6CA1\u6709\u8C03\u7528\u7ED3\u7B97\u5DE5\u5177` : "\u6A21\u578B\u6CA1\u6709\u8C03\u7528\u7ED3\u7B97\u5DE5\u5177");
      const next = structuredClone(state);
      const sw = world ? parseSettleWorld(args.world ?? {}) : null;
      if (world) renameSceneIds(args, world.after, sw);
      const results = applySettleArgs(next, args, source.userName);
      const present = Array.isArray(args.present) ? args.present.map(String).filter(Boolean) : [];
      let nextWorld;
      if (world) {
        nextWorld = structuredClone(world.after);
        if (sw) {
          addNewcomers(sw, nextWorld, next, present);
          results.push(...applySettleWorld(nextWorld, next, city(), sw, world.plan.from));
        }
        syncBody(next, nextWorld);
      }
      return { state: next, ...nextWorld ? { world: nextWorld } : {}, settle: { raw: JSON.stringify(args), results, present } };
    } catch (error) {
      lastError = error.message;
      api.log(`\u7ED3\u7B97\u5931\u8D25\uFF08\u7B2C ${attempt} \u6B21\uFF09\uFF1A`, lastError);
    }
  }
  return { state, ...world ? { world: world.after } : {}, settle: { raw: "", results: [], status: "failed", error: lastError || "\u5DF2\u4E2D\u6B62" } };
}
function promoteOnSheet(state, made) {
  const c = state.characters[made.name] ?? newCharacter();
  for (const [k, v] of Object.entries(made.attributes)) if (!c.attributes[k]) c.attributes[k] = Math.round(v);
  for (const t of ["\u654F\u611F", "\u8BB0\u4EC7", "\u591A\u7591"]) if (made.traits[t]) c.traits[t] = Math.max(0.5, Math.min(2, made.traits[t]));
  c.description = made.description || c.description;
  delete c.temporary;
  state.characters[made.name] = c;
}
function adopt(world, state, made, was, sceneId) {
  renamePerson(world, was, made.name);
  renameCharacter(state, was, made.name);
  promoteOnSheet(state, made);
  const person = sceneId ? world.scene?.people.find((p) => p.id === sceneId) : void 0;
  if (person) person.name = made.name;
}
function currentData(chat) {
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    const m = chat.messages[i];
    const swipe = m.swipes[m.activeSwipe];
    const data = swipe?.plugins?.[PLUGIN_ID];
    if (data?.world) return { state: data.state ?? null, world: normalizeWorld(structuredClone(data.world)), path: ["messages", `@${m.id}`, "swipes", `@${swipe.id}`, "plugins", PLUGIN_ID] };
  }
  const w = chatWorld(chat);
  return { state: chat.plugins?.[PLUGIN_ID]?.base ?? null, world: w?.base ? normalizeWorld(structuredClone(w.base)) : null, path: null };
}
var plugin = {
  setup(api) {
    const rules = () => rulesFrom(api.config());
    const entries = /* @__PURE__ */ new Map();
    const sources = /* @__PURE__ */ new Map();
    api.onAfterAssemble((result, ctx) => {
      const found = {};
      let changed = false;
      for (const part of result.parts) {
        if (!/<<<\|\s*hearth\s*\|/i.test(part.content)) continue;
        const out = takeEntries(part.content);
        for (const [k, v] of Object.entries(out.found)) found[k] = found[k] ? `${found[k]}

${v}` : v;
        if (out.found.ruling || out.found.settle) found.role ??= part.role;
        part.content = out.rest;
        changed = true;
      }
      if (!changed) {
        entries.delete(ctx.chat.id);
        return;
      }
      entries.set(ctx.chat.id, found);
      result.parts = result.parts.filter((p) => p.content.trim());
      result.messages = result.parts.map((p) => ({ role: p.role, content: p.content, ...p.name ? { name: p.name } : {} }));
      result.tokens.total = result.parts.reduce((s, p) => s + p.tokens, 0);
    });
    api.onRequest(async (body, ctx) => {
      if (!ctx.messageId || !ctx.swipeId || !ctx.send) return;
      const texts = entries.get(ctx.chat.id);
      if (!texts?.ruling || !texts.narrate) return;
      if (replyOptions(ctx.chat).mode === "chat") return;
      const chat = ctx.chat;
      const index = chat.messages.findIndex((m) => m.id === ctx.messageId);
      if (index < 0) return;
      const userName = ctx.userName ?? "";
      const userText = lastUserText(chat.messages, index);
      const role = texts.role;
      const stored = messageData(chat.messages[index]);
      const hasWorld = Boolean(chatWorld(chat));
      let world = hasWorld ? worldBefore(chat, index) : null;
      let before = stateBefore(chat, index, ctx.character);
      let opening = false;
      if (hasWorld && !world) {
        const form = chatWorld(chat).setup;
        if (!form) return;
        ctx.progress?.({ phase: "world-setup" });
        const made = await runSetup(body, texts, form, chat.id, ctx.send, ctx.trace).catch((error) => {
          throw new Error(`\u5F00\u5C40\u6CA1\u6709\u5B8C\u6210\uFF1A${error.message}`);
        });
        world = made.world;
        before = made.state;
        await api.store.apply({
          target: { kind: "chat", id: chat.id },
          ops: [
            { op: "set", path: ["plugins", PLUGIN_ID, "world", "base"], value: made.world },
            { op: "set", path: ["plugins", PLUGIN_ID, "base"], value: made.state }
          ],
          author: `plugin:${api.id}`,
          journal: false
        });
        opening = true;
      }
      if (!before) return;
      const queue = chatWorld(chat)?.queue ?? [];
      if (world && queue.length) {
        const important = { ...chatWorld(chat)?.important ?? {} };
        for (const q of queue) {
          const made = await runProfile(body, texts, world, before, q.name, q.base, ctx.send, ctx.trace).catch(() => null);
          if (made) {
            important[made.name] = made.profile;
            adopt(world, before, made, q.name, q.sceneId);
          }
        }
        await api.store.apply({
          target: { kind: "chat", id: chat.id },
          ops: [{ op: "set", path: ["plugins", PLUGIN_ID, "world", "important"], value: important }, { op: "set", path: ["plugins", PLUGIN_ID, "world", "queue"], value: [] }],
          author: `plugin:${api.id}`,
          journal: false
        });
      }
      const scene = (state2, ruling2) => sceneOf({ chat, index, state: state2, characterName: ctx.character.name, userName, texts: [userText], ruling: ruling2 });
      let ruling = stored?.ruling;
      let turn = stored?.world;
      if (!ruling || ruling.userText !== userText || world && !turn) {
        if (opening) {
          ruling = { userText, checks: [] };
        } else if (passOn(chat)) {
          ruling = { userText, checks: [], skipped: "pass" };
        } else {
          ctx.progress?.({ phase: "ruling", checks: [] });
          const working = structuredClone(before);
          const content2 = [
            texts.ruling,
            world ? entry(texts, "world-ruling") : "",
            stateText(working, userName, scene(working)),
            world ? worldText(world, city(), "ruling") : "",
            `\u3010\u8FD9\u4E00\u8F6E\u7684\u7528\u6237\u8F93\u5165\u3011
${userText || "\uFF08\u6CA1\u6709\u5199\u65B0\u7684\u884C\u52A8\uFF0C\u8BA9\u5267\u60C5\u81EA\u7136\u63A8\u8FDB\uFF09"}`
          ].filter(Boolean).join("\n\n");
          try {
            ruling = await runRuling({
              body: forceTool(appendStep(body, { content: content2, lead: texts["ruling-lead"], role }, "ruling"), CHECK_TOOL_NAME, Boolean(world)),
              send: ctx.send,
              state: working,
              userName,
              userText,
              rules: rules(),
              onRound: (round2, sent, checks) => {
                ctx.trace?.(`\u8DD1\u56E2\u88C1\u5B9A \xB7 \u7B2C ${round2} \u6B21`, sent);
                ctx.progress?.({ phase: "ruling", round: round2, checks });
              }
            });
          } catch (error) {
            if (ctx.signal?.aborted) throw error;
            ctx.warn?.(`\u8DD1\u56E2\u88C1\u5B9A\u6CA1\u6709\u5B8C\u6210\uFF0C\u8FD9\u4E00\u8F6E\u6309\u6CA1\u6709\u68C0\u5B9A\u7EE7\u7EED\uFF1A${error.message}`);
            ruling = { userText, checks: [], error: error.message };
          }
        }
        if (world) {
          const after = structuredClone(world);
          const plan2 = playTurn(after, city(), opening ? { minutes: 5 } : ruling.ask ?? { minutes: 10 });
          if (plan2.fresh.length) ctx.progress?.({ phase: "world-scene" });
          const problem = await runScene(body, texts, after, plan2.fresh, ctx.send, ctx.trace);
          if (problem && !ctx.signal?.aborted) ctx.warn?.(`\u573A\u666F\u91CC\u7684\u4EBA\u6CA1\u6709\u63CF\u5199\u51FA\u6765\uFF0C\u8FD9\u4E00\u8F6E\u7167\u5E38\u7EE7\u7EED\uFF1A${problem}`);
          const important = chatWorld(chat)?.important ?? {};
          const reactions = await runReactions(body, texts, after, withAdded(before, ruling), important, plan2, ctx.send, ctx.trace, ctx.warn);
          turn = { plan: plan2, after, ...reactions.length ? { reactions } : {} };
        }
        const data = { ruling, ...turn ? { world: turn } : {} };
        await api.store.apply({
          target: { kind: "chat", id: chat.id },
          ops: [{ op: "set", path: ["messages", `@${ctx.messageId}`, "plugins", PLUGIN_ID], value: data }],
          author: `plugin:${api.id}`,
          journal: false
        });
      }
      ctx.progress?.({ phase: "narrating", checks: ruling.checks, skipped: ruling.skipped });
      const pass = ruling.skipped === "pass";
      const state = withAdded(before, ruling);
      if (turn) syncBody(state, turn.after);
      const here = turn ? Object.entries(chatWorld(chat)?.important ?? {}).filter(([n]) => turn.after.people[n]?.at === turn.after.at) : [];
      const content = [
        opening ? "" : pass ? texts.pass || DEFAULT_PASS : rulingText(ruling),
        stateText(state, userName, scene(state, ruling)),
        turn ? worldText(turn.after, city(), "narrate", turn.plan) : "",
        ...here.map(([n, p]) => `\u3010\u91CD\u8981\u4EBA\u7269\uFF1A${n}\u3011
${p.profile}`),
        texts.narrate,
        turn ? entry(texts, "world-narrate") : "",
        opening ? entry(texts, "world-opening") : ""
      ].filter(Boolean).join("\n\n");
      const lead = pass ? texts["pass-lead"] ?? texts["narrate-lead"] : texts["narrate-lead"];
      const reply = replyTools(appendStep(body, { content, lead, role }, pass ? "pass" : "results"), Boolean(turn));
      if (texts.settle) sources.set(chat.id, { messageId: ctx.messageId, swipeId: ctx.swipeId, body: reply, texts, userName, world: Boolean(turn) });
      return reply;
    });
    api.onAfterReceive((ctx) => {
      const stored = messageData(ctx.message);
      const ruling = stored?.ruling;
      if (!ruling) return;
      const turn = stored?.world;
      const { text, raw } = extractSettlement(ctx.text);
      if (ctx.finish === "error" || ctx.finish === "aborted") return raw === null ? void 0 : { text };
      const index = ctx.chat.messages.findIndex((m) => m.id === ctx.message.id);
      const before = stateBefore(ctx.chat, index, ctx.character);
      if (!before) return raw === null ? void 0 : { text };
      const userName = ctx.chat.messages.findLast((m) => m.role === "user")?.name ?? "";
      const state = withAdded(before, ruling);
      state.turn += 1;
      decay(state, turn ? { ...rules(), moodDecay: 1 - Math.pow(1 - WORLD_MOOD_DECAY, (turn.plan.to - turn.plan.from) / 60) } : rules());
      const world = turn ? structuredClone(turn.after) : void 0;
      if (world) syncBody(state, world);
      const feelings = (turn?.reactions ?? []).map((r) => r.feelings).filter(Boolean);
      if (feelings.length) applySettleArgs(state, { attitudes: feelings }, userName);
      const ops = [];
      if (ruling.skipped === "pass" && passOn(ctx.chat)) ops.push({ op: "set", path: ["plugins", PLUGIN_ID, "pass"], value: false });
      const path2 = swipePath(ctx.message.id, ctx.swipe.id);
      const source = sources.get(ctx.chat.id);
      if (raw !== null || !source || source.messageId !== ctx.message.id || source.swipeId !== ctx.swipe.id) {
        const results = raw ? applySettlement(state, raw, userName) : [];
        const data = { state, ...world ? { world } : {}, ...raw ? { settle: { raw, results } } : {} };
        return { text, ops: [{ op: "set", path: path2, value: data }, ...ops] };
      }
      const pending = { state, ...world ? { world } : {}, settle: { raw: "", results: [], status: "pending", at: Date.now() } };
      return {
        text,
        ops: [{ op: "set", path: path2, value: pending }, ...ops],
        background: async ({ signal, trace }) => {
          const scene = sceneOf({ chat: ctx.chat, index, state, characterName: ctx.character?.name, userName, texts: [lastUserText(ctx.chat.messages, index), text], ruling });
          const data = await settle(api, source, state, ruling, text, scene, { signal, trace, ...world && turn ? { world: { after: world, plan: turn.plan } } : {} });
          if (data.world && turn && data.state) {
            const important = chatWorld(ctx.chat)?.important ?? {};
            if (Object.keys(important).length && Math.floor(data.world.now / 1440) > Math.floor(turn.plan.from / 1440)) {
              const present = /* @__PURE__ */ new Set([...data.settle?.present ?? [], ...Object.entries(data.world.people).filter(([, p]) => p.at === data.world.at).map(([n]) => n)]);
              const dayBody = appendReply(source.body, replyForHistory(text));
              await runDays2(dayBody, source.texts, data.world, data.state, important, turn.plan.from, data.world.now, present, (b) => api.send(b, signal), trace).catch((error) => api.log("\u6BCF\u65E5\u63A8\u6F14\u6CA1\u6709\u5B8C\u6210\uFF1A", error.message));
            }
          }
          return { ops: [{ op: "set", path: path2, value: data }] };
        }
      };
    });
    api.registerAction("settle", async ({ chat, character, payload }) => {
      const messageId = String(payload.messageId ?? "");
      const swipeId = String(payload.swipeId ?? "");
      const message = chat.messages.find((m) => m.id === messageId);
      const swipe = message?.swipes.find((s) => s.id === swipeId);
      const stored = messageData(message);
      const ruling = stored?.ruling;
      if (!message || !swipe || !ruling) throw Object.assign(new Error("\u627E\u4E0D\u5230\u8FD9\u6761\u56DE\u590D\u7684\u8DD1\u56E2\u6570\u636E"), { status: 404 });
      const turn = stored?.world;
      const index = chat.messages.indexOf(message);
      const kept = swipe.plugins?.[PLUGIN_ID]?.state;
      const before = stateBefore(chat, index, character);
      if (!kept && !before) throw Object.assign(new Error("\u8FD9\u5F20\u5361\u8FD8\u6CA1\u6709\u8DD1\u56E2\u6570\u636E"), { status: 400 });
      const state = kept ? structuredClone(kept) : withAdded(before, ruling);
      if (!kept) {
        state.turn += 1;
        decay(state, rules());
      }
      const known = sources.get(chat.id);
      const userName = chat.messages.findLast((m) => m.role === "user")?.name ?? "";
      const source = known && known.messageId === messageId && known.swipeId === swipeId ? known : { messageId, swipeId, userName, texts: { ...entries.get(chat.id) ?? {}, settle: entries.get(chat.id)?.settle ?? "" }, body: { messages: [] }, world: Boolean(turn) };
      if (!source.texts.settle) throw Object.assign(new Error("\u5F53\u524D\u9884\u8BBE\u91CC\u6CA1\u6709\u8DD1\u56E2\u7684\u7ED3\u7B97\u6761\u76EE"), { status: 400 });
      const scene = sceneOf({ chat, index, state, characterName: character?.name, userName, texts: [lastUserText(chat.messages, index), swipe.content], ruling });
      const data = await settle(api, source, state, ruling, swipe.content, scene, turn ? { world: { after: structuredClone(turn.after), plan: turn.plan } } : {});
      if (data.settle?.status === "failed") throw Object.assign(new Error(`\u7ED3\u7B97\u6CA1\u6709\u5B8C\u6210\uFF1A${data.settle.error}`), { status: 502 });
      return { ops: [{ op: "set", path: swipePath(messageId, swipeId), value: data }] };
    });
    api.registerControls({
      list: ({ chat, character, preset }) => {
        if (!presetReady(preset) || !stateBefore(chat, chat.messages.length, character)) return [];
        if (replyOptions(chat).mode === "chat") return [];
        return [{ id: "pass", type: "toggle", label: "\u68C0\u5B9A\u7EDD\u5BF9\u901A\u8FC7", value: passOn(chat), hint: "\u8FD9\u4E00\u8F6E\u4E0D\u63B7\u9AB0\uFF0C\u4E3B\u89D2\u7684\u884C\u52A8\u5168\u90E8\u987A\u5229\uFF1B\u53D1\u51FA\u540E\u81EA\u52A8\u5173\u6389" }];
      },
      change: (id, value) => id === "pass" ? [{ op: "set", path: ["plugins", PLUGIN_ID, "pass"], value: value === true }] : []
    });
    api.registerAction("world-promote", async ({ chat, payload }) => {
      const cw = chatWorld(chat);
      const { state, world, path: path2 } = currentData(chat);
      if (!cw || !state || !world) throw Object.assign(new Error("\u8FD9\u4E2A\u5BF9\u8BDD\u8FD8\u6CA1\u6709\u5F00\u59CB\u4E16\u754C"), { status: 400 });
      const important = { ...cw.important ?? {} };
      if (Object.keys(important).length >= MAX_IMPORTANT) throw Object.assign(new Error(`\u91CD\u8981\u4EBA\u7269\u6700\u591A ${MAX_IMPORTANT} \u4F4D\uFF0C\u5148\u53D6\u6D88\u4E00\u4F4D`), { status: 400 });
      let name = String(payload.name ?? "").trim();
      let base = "";
      const sceneId = String(payload.sceneId ?? "");
      const person = sceneId ? world.scene?.people.find((p) => p.id === sceneId) : void 0;
      if (person) {
        name = person.name ?? name;
        base = `\u3010\u573A\u666F\u91CC\u770B\u5230\u7684\u6837\u5B50\u3011${person.looks ?? ""}\uFF1B${person.doing ?? ""}\uFF1B${person.where ?? ""}\uFF08\u5728${placeById(world, city(), world.scene.place)?.name ?? ""}${person.role === "staff" ? `\uFF0C\u662F\u8FD9\u91CC\u7684${person.purpose}` : ""}\uFF09`;
      } else if (String(payload.text ?? "").trim()) {
        base = `\u3010\u539F\u6709\u6863\u6848\u3011
${String(payload.text).trim()}`;
      } else if (payload.characterId) {
        const card = api.store.get("character", String(payload.characterId));
        if (!card) throw Object.assign(new Error("\u627E\u4E0D\u5230\u8FD9\u5F20\u89D2\u8272\u5361"), { status: 404 });
        name ||= card.name;
        base = `\u3010\u539F\u6709\u6863\u6848\u3011
${[card.fields.description, card.fields.personality, card.fields.scenario].filter((s) => s.trim()).join("\n\n")}`;
      } else if (name) {
        const p = world.people[name];
        base = `\u3010\u5267\u60C5\u91CC\u7684\u4ED6\u3011${[p?.role, p?.brief, state.characters[name]?.description].filter(Boolean).join("\uFF1B")}`;
      }
      if (!base) throw Object.assign(new Error("\u4E0D\u77E5\u9053\u8981\u628A\u8C01\u8BBE\u4E3A\u91CD\u8981\u4EBA\u7269"), { status: 400 });
      if (name && important[name]) throw Object.assign(new Error(`${name}\u5DF2\u7ECF\u662F\u91CD\u8981\u4EBA\u7269\u4E86`), { status: 400 });
      if (name && cw.archived?.[name]) {
        important[name] = cw.archived[name];
        world.people[name] = { ...world.people[name] ?? {}, kind: "important" };
        return { ops: [{ op: "set", path: ["plugins", PLUGIN_ID, "world", "important"], value: important }, ...path2 ? [{ op: "set", path: [...path2, "world"], value: world }] : []] };
      }
      const source = sources.get(chat.id);
      const last = chat.messages.at(-1);
      const was = name || "\u65B0\u7684\u91CD\u8981\u4EBA\u7269";
      if (!source?.body || !Array.isArray(source.body.messages) || !last) {
        return { ops: [{ op: "set", path: ["plugins", PLUGIN_ID, "world", "queue"], value: [...cw.queue ?? [], { name: was, base, ...person ? { sceneId: person.id } : {} }] }] };
      }
      const body = appendReply(source.body, replyForHistory(last.swipes[last.activeSwipe]?.content ?? ""));
      const next = structuredClone(state);
      const made = await runProfile(body, source.texts, world, next, was, base, (b) => api.send(b));
      if (!made) throw Object.assign(new Error("\u6A21\u578B\u6CA1\u6709\u5199\u51FA\u6863\u6848"), { status: 502 });
      important[made.name] = made.profile;
      adopt(world, next, made, was, person?.id);
      const ops = [{ op: "set", path: ["plugins", PLUGIN_ID, "world", "important"], value: important }];
      if (path2) ops.push({ op: "set", path: [...path2, "world"], value: world }, { op: "set", path: [...path2, "state"], value: next });
      else ops.push({ op: "set", path: ["plugins", PLUGIN_ID, "world", "base"], value: world }, { op: "set", path: ["plugins", PLUGIN_ID, "base"], value: next });
      return { ops };
    });
    api.registerAction("world-demote", async ({ chat, payload }) => {
      const cw = chatWorld(chat);
      const name = String(payload.name ?? "");
      const { world, path: path2 } = currentData(chat);
      if (!cw?.important?.[name] || !world) throw Object.assign(new Error("\u8FD9\u4E2A\u4EBA\u4E0D\u662F\u91CD\u8981\u4EBA\u7269"), { status: 400 });
      const important = { ...cw.important };
      const archived = { ...cw.archived ?? {}, [name]: important[name] };
      delete important[name];
      const related = world.commitments.some((c) => !c.ended && c.parties.includes(name)) || world.phone.contacts.includes(name);
      if (world.people[name]) world.people[name] = { ...world.people[name], kind: related ? "related" : "bystander" };
      const ops = [
        { op: "set", path: ["plugins", PLUGIN_ID, "world", "important"], value: important },
        { op: "set", path: ["plugins", PLUGIN_ID, "world", "archived"], value: archived },
        path2 ? { op: "set", path: [...path2, "world"], value: world } : { op: "set", path: ["plugins", PLUGIN_ID, "world", "base"], value: world }
      ];
      return { ops };
    });
    api.registerEditTask(adaptTask);
  }
};
var index_default = plugin;
export {
  index_default as default,
  presetReady,
  takeEntries
};
